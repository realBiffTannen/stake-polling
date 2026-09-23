#!/usr/bin/env python3
"""
Create (or bring into line) the private S3 bucket the nightly archive writes to,
and optionally an IAM user that can do exactly what the archiver needs and no more.

    pip install boto3
    python3 scripts/create-s3-bucket.py --bucket acme-stake-archive --region us-east-1 \
        --iam-user stake-polling-archiver --create-access-key --write-env .env

Run it with credentials that may administer S3 (and IAM, for --iam-user): an
admin profile, e.g. AWS_PROFILE=admin. The archiver itself should NOT run with
those - it gets the least-privilege user this script creates.

The bucket is set up private and locked down:
  * Block Public Access on (all four settings), so nothing in it can be made public
  * Object Ownership "bucket owner enforced" - ACLs are disabled entirely
  * Default encryption SSE-S3 (AES-256) with an S3 Bucket Key
  * Versioning on, so an overwritten or deleted archive can be recovered
    (--no-versioning to skip); old versions expire after 30 days
  * A bucket policy that refuses any request not made over TLS
  * Incomplete multipart uploads cleaned up after 7 days
  * --expire-days N additionally deletes archives N days after they are written

The IAM user's inline policy allows only:
  * s3:PutObject and s3:GetObject on arn:aws:s3:::<bucket>/<prefix>/*
    (GetObject is what makes the dashboard's presigned download links work)
  * s3:ListBucket on the bucket, restricted to keys under <prefix>/
No delete, no ACL or policy changes, nothing outside the prefix.

Every step is idempotent: re-running converges the bucket on this configuration.
--dry-run prints the plan and the policies without calling AWS (boto3 not needed).
"""

import argparse
import json
import os
import re
import stat
import sys

BUCKET_RE = re.compile(r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")
POLICY_NAME = "stake-polling-archive"


def tls_only_policy(bucket):
    return {
        "Version": "2012-10-17",
        "Statement": [{
            "Sid": "DenyInsecureTransport",
            "Effect": "Deny",
            "Principal": "*",
            "Action": "s3:*",
            "Resource": [f"arn:aws:s3:::{bucket}", f"arn:aws:s3:::{bucket}/*"],
            "Condition": {"Bool": {"aws:SecureTransport": "false"}},
        }],
    }


def archiver_policy(bucket, prefix):
    return {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "ReadWriteArchives",
                "Effect": "Allow",
                "Action": ["s3:PutObject", "s3:GetObject"],
                "Resource": f"arn:aws:s3:::{bucket}/{prefix}/*",
            },
            {
                "Sid": "ListArchives",
                "Effect": "Allow",
                "Action": "s3:ListBucket",
                "Resource": f"arn:aws:s3:::{bucket}",
                "Condition": {"StringLike": {"s3:prefix": [f"{prefix}/*"]}},
            },
        ],
    }


def lifecycle(prefix, expire_days, versioning):
    rules = [{
        "ID": "abort-incomplete-uploads",
        "Status": "Enabled",
        "Filter": {"Prefix": ""},
        "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7},
    }]
    if versioning:
        rules.append({
            "ID": "expire-old-versions",
            "Status": "Enabled",
            "Filter": {"Prefix": f"{prefix}/"},
            "NoncurrentVersionExpiration": {"NoncurrentDays": 30},
        })
    if expire_days:
        rules.append({
            "ID": "expire-archives",
            "Status": "Enabled",
            "Filter": {"Prefix": f"{prefix}/"},
            "Expiration": {"Days": expire_days},
        })
    return {"Rules": rules}


def env_lines(bucket, prefix, region, key=None):
    lines = {"S3_BUCKET": bucket, "S3_PREFIX": prefix, "AWS_REGION": region}
    if key:
        lines["AWS_ACCESS_KEY_ID"] = key["AccessKeyId"]
        lines["AWS_SECRET_ACCESS_KEY"] = key["SecretAccessKey"]
    return lines


def write_env(path, values):
    """Set each key in a .env file - replacing an existing line, else appending -
    and leave the file readable by its owner only, since it may hold a secret."""
    existing = []
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            existing = f.read().splitlines()
    remaining = dict(values)
    out = []
    for line in existing:
        name = line.split("=", 1)[0].strip()
        if name in remaining:
            out.append(f"{name}={remaining.pop(name)}")
        else:
            out.append(line)
    out.extend(f"{name}={value}" for name, value in remaining.items())
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)


def step(message):
    print(f"  - {message}")


def ensure_bucket(s3, bucket, region):
    from botocore.exceptions import ClientError
    # Asked first, because us-east-1 answers CreateBucket on a bucket this
    # account already owns with a plain 200 rather than BucketAlreadyOwnedByYou.
    try:
        s3.head_bucket(Bucket=bucket)
        step(f"s3://{bucket} already exists in this account - bringing it into line")
        return
    except ClientError as err:
        code = str(err.response.get("Error", {}).get("Code"))
        if code == "403":
            sys.exit(f"error: the name {bucket} is taken by another AWS account. Bucket names are global; pick another.")
        if code not in ("404", "NoSuchBucket", "NotFound"):
            raise
    try:
        args = {"Bucket": bucket, "ObjectOwnership": "BucketOwnerEnforced"}
        # us-east-1 is the one region that must NOT be named here.
        if region != "us-east-1":
            args["CreateBucketConfiguration"] = {"LocationConstraint": region}
        s3.create_bucket(**args)
        step(f"created s3://{bucket} in {region}")
    except ClientError as err:
        code = err.response.get("Error", {}).get("Code")
        if code == "BucketAlreadyOwnedByYou":
            step(f"s3://{bucket} already exists in this account - bringing it into line")
        elif code == "BucketAlreadyExists":
            sys.exit(f"error: the name {bucket} is taken by another AWS account. Bucket names are global; pick another.")
        else:
            raise


def configure_bucket(s3, bucket, prefix, expire_days, versioning):
    s3.put_public_access_block(Bucket=bucket, PublicAccessBlockConfiguration={
        "BlockPublicAcls": True, "IgnorePublicAcls": True, "BlockPublicPolicy": True, "RestrictPublicBuckets": True})
    step("Block Public Access: all four settings on")
    s3.put_bucket_ownership_controls(Bucket=bucket, OwnershipControls={"Rules": [{"ObjectOwnership": "BucketOwnerEnforced"}]})
    step("Object Ownership: bucket owner enforced (ACLs disabled)")
    s3.put_bucket_encryption(Bucket=bucket, ServerSideEncryptionConfiguration={"Rules": [{
        "ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}, "BucketKeyEnabled": True}]})
    step("default encryption: SSE-S3 (AES-256)")
    if versioning:
        s3.put_bucket_versioning(Bucket=bucket, VersioningConfiguration={"Status": "Enabled"})
        step("versioning: enabled")
    s3.put_bucket_policy(Bucket=bucket, Policy=json.dumps(tls_only_policy(bucket)))
    step("bucket policy: requests without TLS are denied")
    s3.put_bucket_lifecycle_configuration(Bucket=bucket, LifecycleConfiguration=lifecycle(prefix, expire_days, versioning))
    step("lifecycle: incomplete uploads aborted after 7 days"
         + ("; old versions expire after 30 days" if versioning else "")
         + (f"; archives expire after {expire_days} days" if expire_days else ""))


def verify_bucket(s3, bucket):
    """Read the settings back rather than trusting the calls above took."""
    s3.head_bucket(Bucket=bucket)
    block = s3.get_public_access_block(Bucket=bucket)["PublicAccessBlockConfiguration"]
    if not all(block.values()):
        sys.exit(f"error: Block Public Access is not fully on for {bucket}: {block}")
    rules = s3.get_bucket_encryption(Bucket=bucket)["ServerSideEncryptionConfiguration"]["Rules"]
    if not any(r["ApplyServerSideEncryptionByDefault"]["SSEAlgorithm"] in ("AES256", "aws:kms") for r in rules):
        sys.exit(f"error: default encryption is not on for {bucket}")
    step("verified: bucket reachable, public access blocked, encryption on")


def ensure_user(iam, user, bucket, prefix, create_key):
    from botocore.exceptions import ClientError
    try:
        iam.create_user(UserName=user, Tags=[{"Key": "purpose", "Value": "stake-polling-archive"}])
        step(f"created IAM user {user}")
    except ClientError as err:
        if err.response.get("Error", {}).get("Code") != "EntityAlreadyExists":
            raise
        step(f"IAM user {user} already exists")
    iam.put_user_policy(UserName=user, PolicyName=POLICY_NAME, PolicyDocument=json.dumps(archiver_policy(bucket, prefix)))
    step(f"attached inline policy {POLICY_NAME}: put/get under {prefix}/, list under {prefix}/ only")
    if not create_key:
        return None
    keys = iam.list_access_keys(UserName=user)["AccessKeyMetadata"]
    if len(keys) >= 2:
        sys.exit(f"error: {user} already has two access keys (the AWS limit). Delete one, or run without --create-access-key.")
    key = iam.create_access_key(UserName=user)["AccessKey"]
    step(f"created access key {key['AccessKeyId']} for {user}")
    return key


def main(argv=None):
    parser = argparse.ArgumentParser(description="Create the private S3 bucket for the stake-polling nightly archive.")
    parser.add_argument("--bucket", required=True, help="bucket name (globally unique, lowercase)")
    parser.add_argument("--region", default=None, help="AWS region (default: AWS_REGION, your profile's region, else us-east-1)")
    parser.add_argument("--prefix", default="stake-polling", help="key prefix the archiver writes under (S3_PREFIX); default stake-polling")
    parser.add_argument("--iam-user", default=None, help="also create/update this IAM user with a least-privilege policy for the archiver")
    parser.add_argument("--create-access-key", action="store_true", help="create an access key for --iam-user (the secret is shown once)")
    parser.add_argument("--write-env", default=None, metavar="PATH", help="write S3_BUCKET etc. (and any new key) into this .env file, mode 600, instead of printing them")
    parser.add_argument("--expire-days", type=int, default=None, help="delete archives this many days after they are written (default: keep forever)")
    parser.add_argument("--no-versioning", action="store_true", help="leave versioning off")
    parser.add_argument("--dry-run", action="store_true", help="print the plan and policies; call nothing")
    args = parser.parse_args(argv)

    if not BUCKET_RE.match(args.bucket) or ".." in args.bucket:
        parser.error("--bucket must be 3-63 lowercase letters, digits, dots and hyphens")
    prefix = args.prefix.strip("/")
    if not prefix:
        parser.error("--prefix must not be empty: the archiver's permissions are scoped to it")
    if args.create_access_key and not args.iam_user:
        parser.error("--create-access-key needs --iam-user")
    if args.expire_days is not None and args.expire_days < 1:
        parser.error("--expire-days must be at least 1")
    versioning = not args.no_versioning

    if args.dry_run:
        region = args.region or os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"
        print(f"Would create/configure s3://{args.bucket} in {region}, archives under {prefix}/")
        print("\nBucket policy:\n" + json.dumps(tls_only_policy(args.bucket), indent=2))
        print("\nLifecycle:\n" + json.dumps(lifecycle(prefix, args.expire_days, versioning), indent=2))
        if args.iam_user:
            print(f"\nInline policy {POLICY_NAME} for IAM user {args.iam_user}:\n" + json.dumps(archiver_policy(args.bucket, prefix), indent=2))
        return 0

    try:
        import boto3
    except ImportError:
        sys.exit("error: boto3 is not installed. pip install boto3 (a virtualenv is fine), then run this again.")

    session = boto3.session.Session(region_name=args.region) if args.region else boto3.session.Session()
    region = session.region_name or "us-east-1"
    identity = session.client("sts").get_caller_identity()
    print(f"As {identity['Arn']}, in {region}:")

    s3 = session.client("s3", region_name=region)
    ensure_bucket(s3, args.bucket, region)
    configure_bucket(s3, args.bucket, prefix, args.expire_days, versioning)
    verify_bucket(s3, args.bucket)

    key = None
    if args.iam_user:
        key = ensure_user(session.client("iam"), args.iam_user, args.bucket, prefix, args.create_access_key)

    values = env_lines(args.bucket, prefix, region, key)
    if args.write_env:
        write_env(args.write_env, values)
        print(f"\nWrote {', '.join(values)} to {args.write_env} (mode 600).")
    else:
        print("\nAdd to .env at the repo root:")
        for name, value in values.items():
            print(f"{name}={value}")
        if key:
            print("\nThe secret access key above is shown once. Keep it out of shell history and version control.")
    print("\nThen restart the service (or `npm start`) and check: npm run archive -- --once")
    return 0


if __name__ == "__main__":
    sys.exit(main())
