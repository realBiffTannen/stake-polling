---
title: Nightly archive and S3
nav_order: 8
description: "Keep every day past Redis's 30: a local folder or a private S3 bucket, the setup script, the AWS CLI alternative, verification and presigned links."
---

# Nightly archive and S3
{: .no_toc }

1. TOC
{:toc}

## What it does

Redis keeps 30 days of trail. The archiver keeps it for good. At every
00:00:00Z it takes the UTC day that just ended (every stream the collector
wrote, the same all-streams CSV the poll log's **Download CSV** gives you),
gzips it to `stake-all-YYYY-MM-DD.csv.gz` and stores it:

- **to S3**, under `s3://$S3_BUCKET/$S3_PREFIX/<team>/`, when `S3_BUCKET` is
  set;
- **to `./stake-polling-logrotate-data/`** at the repo root otherwise (or the
  folder in `STAKE_ARCHIVE_DIR`).

The file's first line is the header `time_utc,entry_id,stream,field,value`.
Values are exactly as stored: raw micro-dollars and gross `profit`.

It runs as its own process (`bin/stake-archive.mjs`, started by `npm start` and
the service), so nothing about an upload can hold up polling. A slow or failed
upload happens in a different process, and the poller never waits on it. If the
archiver crashes, `npm start` logs it, keeps polling, and starts the archiver
again a minute later.

- A failed run is retried every 15 minutes.
- On every start and every midnight it also catches up any of the **last seven
  days** the destination is missing. A laptop asleep at midnight loses nothing,
  as long as Redis still holds the day.
- A day Redis holds nothing for makes no file.
- It never deletes anything from Redis.
- It holds a lock (`lock:archive`) for each run, so two archivers never upload
  the same day.

```bash
npm run archive -- --once              # catch up now, then exit
npm run archive -- --date 2026-09-22   # (re)archive one day now, then exit
npm start -- --no-archive              # run without the archiver
```

`--once` and `--date` exit `0` when everything stored and `1` on any failure,
so they suit a cron job or a script.

## Local archive

Nothing to set up: leave `S3_BUCKET` unset. Files land in
`stake-polling-logrotate-data/` at the repo root (gitignored), mode 600. Each
is written beside its final name and renamed into place, so a reader never sees
half a file.

To put them somewhere else, such as a backed-up disk, set this in `.env`:

```bash
STAKE_ARCHIVE_DIR=/Volumes/Backup/stake-archive
```

The dashboard's [Archive page](dashboard/archive.md) lists every file, with its
path, a `file://` link, and a **Download** the dashboard serves.

## S3: prerequisites

| You need | Why | Check / install |
|---|---|---|
| An **AWS account**, and credentials allowed to create S3 buckets and IAM users (an admin profile) | Only for the one-off setup. The archiver itself runs with a separate least-privilege user | `aws sts get-caller-identity` answers with your ARN |
| **Python 3.9+** and **boto3** | Runs `scripts/create-s3-bucket.py` | `python3 -c "import boto3"`. Install: `pip install boto3` (a virtualenv is fine) |
| The **AWS CLI** *(optional)* | Handy for the checks below; the archiver does not use it | `aws --version`. macOS: `brew install awscli` |
| **Outbound HTTPS** to `s3.<region>.amazonaws.com` from the machine running the archiver, and from any browser that downloads | Uploads, listing and presigned downloads | `curl -sI https://s3.amazonaws.com` |

The AWS SDK for Node is installed by `npm install` and loaded only when
`S3_BUCKET` is set.

## S3: set up with the script

Create the bucket and the archiver's user with your **admin** credentials
(`AWS_PROFILE=admin` or similar). Pick a globally unique bucket name:

```bash
python3 scripts/create-s3-bucket.py --bucket acme-stake-archive --region us-east-1 \
    --iam-user stake-polling-archiver --create-access-key --write-env .env
```

Run it with `--dry-run` first: it prints exactly what it will do and every
policy, without calling AWS (and without needing boto3). It is idempotent:
re-run it any time to bring the bucket back into line.

| Option | Default | Does |
|---|---|---|
| `--bucket <name>` | required | The bucket: 3 to 63 lowercase letters, digits, dots and hyphens |
| `--region <region>` | `AWS_REGION`, your profile's region, else `us-east-1` | Where to create it |
| `--prefix <prefix>` | `stake-polling` | The key prefix the archiver writes under (`S3_PREFIX`). The user's permissions are scoped to it |
| `--iam-user <name>` | none | Also create or update this IAM user, with a least-privilege policy |
| `--create-access-key` | off | Create an access key for `--iam-user`. The secret is shown once. A user can have at most two keys |
| `--write-env <path>` | none | Write `S3_BUCKET`, `S3_PREFIX`, `AWS_REGION` and any new key into this file, mode 600, instead of printing them |
| `--expire-days <n>` | keep forever | Delete archives `n` days after they are written |
| `--no-versioning` | versioning on | Leave versioning off |
| `--dry-run` | off | Print the plan and the policies; call nothing |

What it sets up:

- **Block Public Access** on (all four settings), and ACLs disabled (bucket
  owner enforced), so nothing in the bucket can be made public;
- **default encryption** (SSE-S3, AES-256, with an S3 Bucket Key), and a
  **bucket policy refusing any request not made over TLS**;
- **versioning**, so an overwritten archive can be recovered (old versions
  expire after 30 days), and cleanup of abandoned multipart uploads after 7
  days;
- optionally, expiry of archives after `--expire-days`;
- with `--iam-user`, a user whose only permissions are `s3:PutObject` and
  `s3:GetObject` under `<prefix>/`, and `s3:ListBucket` restricted to that
  prefix. No delete, no policy or ACL changes, nothing else in the bucket.
  `GetObject` is what makes the presigned download links work, since a
  presigned URL carries the signer's permissions.

It reads the settings back afterwards rather than trusting that the calls took.

`--write-env .env` keeps the secret out of your terminal scrollback. Without it
the lines are printed for you to copy into `.env`.

**Prefer a profile to a static key?** Leave off `--create-access-key`, give the
user credentials your own way (SSO, a role), and set `AWS_PROFILE` in `.env`
instead. The archiver uses the standard AWS SDK credential chain.

## S3: set up with the AWS CLI instead

The same setup by hand, without Python. The two policies are in the repository
under `docs/s3/`:
[`archiver-policy.example.json`](https://github.com/realBiffTannen/stake-polling/blob/main/docs/s3/archiver-policy.example.json)
(the archiver's IAM permissions) and
[`bucket-policy.example.json`](https://github.com/realBiffTannen/stake-polling/blob/main/docs/s3/bucket-policy.example.json)
(TLS only). With admin credentials, replacing `acme-stake-archive` with your
bucket name:

```bash
B=acme-stake-archive REGION=us-east-1 USER=stake-polling-archiver
# bucket (outside us-east-1 add: --create-bucket-configuration LocationConstraint=$REGION)
aws s3api create-bucket --bucket $B --region $REGION --object-ownership BucketOwnerEnforced
aws s3api put-public-access-block --bucket $B --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket $B --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
aws s3api put-bucket-versioning --bucket $B --versioning-configuration Status=Enabled
sed "s/YOUR-BUCKET/$B/g" docs/s3/bucket-policy.example.json > /tmp/bucket-policy.json
aws s3api put-bucket-policy --bucket $B --policy file:///tmp/bucket-policy.json
# the archiver's user: upload, read and list under stake-polling/ - nothing else
aws iam create-user --user-name $USER
sed "s/YOUR-BUCKET/$B/g" docs/s3/archiver-policy.example.json > /tmp/archiver-policy.json
aws iam put-user-policy --user-name $USER --policy-name stake-polling-archive \
    --policy-document file:///tmp/archiver-policy.json
aws iam create-access-key --user-name $USER   # put the two values in .env; the secret is shown once
```

The script also adds two lifecycle rules: abandoned multipart uploads are
cleaned up after 7 days, and old object versions expire after 30. To match it,
save this as `/tmp/lifecycle.json`:

```json
{"Rules":[
  {"ID":"abort-incomplete-uploads","Status":"Enabled","Filter":{"Prefix":""},
   "AbortIncompleteMultipartUpload":{"DaysAfterInitiation":7}},
  {"ID":"expire-old-versions","Status":"Enabled","Filter":{"Prefix":"stake-polling/"},
   "NoncurrentVersionExpiration":{"NoncurrentDays":30}}
]}
```

and apply it:

```bash
aws s3api put-bucket-lifecycle-configuration --bucket $B \
    --lifecycle-configuration file:///tmp/lifecycle.json
```

Then in `.env`:

```bash
S3_BUCKET=acme-stake-archive
S3_PREFIX=stake-polling
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIDEXAMPLE
AWS_SECRET_ACCESS_KEY=the-secret-shown-once
```

If you change `S3_PREFIX`, change `stake-polling` in the archiver policy (and
the lifecycle rule) to match.

{: .warning }
> **Never give the archiver your root or admin keys.** If
> `aws sts get-caller-identity` answers with an ARN ending in `:root`, you are
> using the account's root access key: fine for this one-off setup, but AWS's
> own advice is to delete root access keys once you have an admin IAM user or
> SSO.

## Restart to pick it up

The archiver and the dashboard read `.env` when they start:

```bash
npm run service:install                 # the macOS service: reinstalling restarts it
sudo systemctl restart stake-polling    # systemd
```

Or stop `npm start` with Ctrl-C and run it again.

## Verify it works

1. **Archive yesterday now** rather than waiting for midnight:

   ```bash
   npm run archive -- --date "$(date -u -v-1d +%F 2>/dev/null || date -u -d yesterday +%F)"
   ```

   It prints `archive: storing to s3://acme-stake-archive/stake-polling/acme-studios/`
   and then `<day>: stored stake-all-<day>.csv.gz (<bytes> bytes, <n> entries)`,
   and exits `0`. An error here (`AccessDenied`, `NoSuchBucket`, a credentials
   error) is printed as the failure reason and the exit code is `1`.

2. **See it in the bucket**, with the archiver's own credentials:

   ```bash
   aws s3 ls s3://acme-stake-archive/stake-polling/ --recursive
   ```

3. **Open the dashboard's Archive page** (`http://<host>:3005/archive`). The
   day is listed, **Last run** names it, and the scope line reads
   `S3: s3://acme-stake-archive/...`. Click **Download**: the presigned link
   saves the `.csv.gz` straight from S3. Then check the file is whole:

   ```bash
   gunzip -t stake-all-<day>.csv.gz && gunzip -c stake-all-<day>.csv.gz | head -3
   ```

   The first line is `time_utc,entry_id,stream,field,value`.

4. **Confirm the bucket is private.** Opening the object's plain URL, without
   the presigned query string, must answer `AccessDenied`:

   ```bash
   curl -s https://acme-stake-archive.s3.amazonaws.com/stake-polling/acme-studios/stake-all-<day>.csv.gz | head -c 200
   ```

After that, `npm start` (or the service) archives every night on its own, and
the Archive page's **Last run** shows each run and any failure.

## Presigned links

For S3, each file on the Archive page carries a presigned download URL:

- signed on the dashboard machine with the archiver's own credentials, with no
  request to AWS, afresh on every page load;
- valid for `S3_PRESIGN_SECONDS`: an hour by default, at most 604800 (7 days,
  the limit for a presigned URL);
- set to download as an attachment, so the browser saves the `.csv.gz` rather
  than trying to show it.

Anyone who can open the Archive page can use its links while they last, and a
link keeps working for whoever holds it until it expires. Keep
`S3_PRESIGN_SECONDS` short, turn on [sign-in](security.md), or bind the
dashboard to `127.0.0.1`, if that matters on your network.
