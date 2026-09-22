import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { copyFile, mkdtemp, rm, access, readdir } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);

// Chrome's macOS cookie encryption: a Keychain password stretched with PBKDF2
// into an AES-128-CBC key. These constants are Chrome's, not ours.
const SALT = 'saltysalt';
const ITERATIONS = 1003;
const KEY_LENGTH = 16;
const IV = Buffer.alloc(16, ' ');
const VERSION_PREFIX = 'v10';
// Chrome 127+ prepends a 32-byte SHA-256 of the cookie's domain to the plaintext.
const DOMAIN_HASH_LENGTH = 32;

const CHROME_DIR = join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
const HOST_PATTERN = '%engine.io';

/**
 * Best-effort recovery of the `sid` cookie from a logged-in Chrome profile.
 *
 * Every failure mode here is expected and survivable: Chrome may not be
 * installed, the profile may be elsewhere, the cookie file is locked while
 * Chrome runs (so it is copied first), the Keychain prompt may be declined,
 * and the encryption scheme changes between Chrome releases. All of them
 * return null so the caller falls through to the terminal prompt.
 *
 * @param {{ profileDir?: string, host?: string }} [opts]
 * @returns {Promise<string|null>}
 */
export async function readChromeSid(opts = {}) {
  try {
    const candidates = opts.profileDir ? [opts.profileDir] : await findProfiles();
    const profiles = [];
    for (const dir of candidates) {
      if (await exists(cookiePath(dir))) profiles.push(dir);
    }
    // Check for a cookie store before touching the Keychain: deriving the key
    // can block on a user authorisation prompt, and there is no reason to ask
    // for it when there is nothing to decrypt.
    if (!profiles.length) return null;

    const key = await deriveKey();
    if (!key) return null;

    for (const profile of profiles) {
      const sid = await readFromProfile(profile, key, opts.host ?? HOST_PATTERN);
      if (sid) return sid;
    }
    return null;
  } catch {
    return null;
  }
}

/** Profiles that actually have a cookie store, newest-looking first. */
async function findProfiles() {
  try {
    const entries = await readdir(CHROME_DIR, { withFileTypes: true });
    const names = entries
      .filter((e) => e.isDirectory() && (e.name === 'Default' || e.name.startsWith('Profile ')))
      .map((e) => join(CHROME_DIR, e.name));
    const withCookies = [];
    for (const dir of names) {
      if (await exists(cookiePath(dir))) withCookies.push(dir);
    }
    return withCookies;
  } catch {
    return [];
  }
}

async function readFromProfile(profileDir, key, host) {
  const source = cookiePath(profileDir);
  if (!(await exists(source))) return null;

  // The live file is locked while Chrome is running, so work on a copy.
  const workDir = await mkdtemp(join(tmpdir(), 'stake-cookies-'));
  const copy = join(workDir, 'Cookies');
  try {
    await copyFile(source, copy);
    const sql = `SELECT hex(encrypted_value) FROM cookies WHERE name='sid' AND host_key LIKE '${host}' ORDER BY length(encrypted_value) DESC;`;
    const { stdout } = await run('sqlite3', [copy, sql], { timeout: 5000 });

    for (const line of stdout.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const plain = decrypt(Buffer.from(line, 'hex'), key);
      if (plain) return plain;
    }
    return null;
  } catch {
    return null;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** The Keychain read is what triggers the one-time macOS authorisation prompt. */
async function deriveKey() {
  try {
    const { stdout } = await run('security', ['find-generic-password', '-w', '-s', 'Chrome Safe Storage', '-a', 'Chrome'], { timeout: 10000 });
    const password = stdout.trim();
    if (!password) return null;
    return pbkdf2Sync(password, SALT, ITERATIONS, KEY_LENGTH, 'sha1');
  } catch {
    return null;
  }
}

function decrypt(encrypted, key) {
  try {
    if (encrypted.length <= VERSION_PREFIX.length) return null;
    if (encrypted.subarray(0, 3).toString() !== VERSION_PREFIX) return null;

    const decipher = createDecipheriv('aes-128-cbc', key, IV);
    decipher.setAutoPadding(false); // strip PKCS#7 by hand so a bad key fails quietly
    const padded = Buffer.concat([decipher.update(encrypted.subarray(VERSION_PREFIX.length)), decipher.final()]);

    const pad = padded.at(-1);
    if (!pad || pad > 16 || pad > padded.length) return null;
    let plain = padded.subarray(0, padded.length - pad);

    if (plain.length > DOMAIN_HASH_LENGTH && !isPrintable(plain.subarray(0, DOMAIN_HASH_LENGTH))) {
      plain = plain.subarray(DOMAIN_HASH_LENGTH);
    }
    const value = plain.toString('utf8').trim();
    return isPrintable(Buffer.from(value)) && value.length ? value : null;
  } catch {
    return null;
  }
}

function isPrintable(buf) {
  return buf.every((b) => b >= 0x20 && b < 0x7f);
}

function cookiePath(profileDir) {
  return join(profileDir, 'Cookies');
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
