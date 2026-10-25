/**
 * IMPT-06 / T-1-06 — the staging-attribute fidelity gate.
 *
 * The negative case deliberately stages the same CRLF bytes under
 * `* text=auto`; the detector must report the path instead of accepting the
 * normalized blob. The positive case stages under the recorded staging
 * attributes and must show index OID == raw OID == upstream OID.
 *
 * Assertions are on 40-hex OID strings only: no byte sniffing and no external
 * `file` output, because the object database is the authority.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { git } from '../fetch';
import { checkAttributes, STAGING_ATTRIBUTES_VALUE } from '../stage';

const root = mkdtempSync(join(tmpdir(), 'halo-fidelity-'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function makeRepo(name: string): string {
  const repo = join(root, name);
  mkdirSync(repo, { recursive: true });
  git(['init', '-q', '--initial-branch=main', '.'], repo);
  git(['config', 'user.email', 'fixture@halo.local'], repo);
  git(['config', 'user.name', 'HALO Fixture'], repo);
  return repo;
}

function writeFixtureFile(repo: string, path: string, bytes: Buffer | string): void {
  const file = join(repo, ...path.split('/'));
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, bytes);
}

function writeInfoAttributes(repo: string, value: string): void {
  writeFileSync(join(repo, '.git', 'info', 'attributes'), `${value}\n`, 'utf8');
}

function rawOid(repo: string, path: string): string {
  return git(['hash-object', '--no-filters', '--', path], repo).trim();
}

function indexOid(repo: string, path: string): string {
  const raw = git(['ls-files', '-s', '-z', '--', path], repo);
  for (const record of raw.split('\0')) {
    if (!record) continue;
    const tab = record.indexOf('\t');
    if (tab === -1 || record.slice(tab + 1) !== path) continue;
    return record.slice(0, tab).trim().split(/\s+/)[1] ?? '';
  }
  return '';
}

const CRLF_BYTES = Buffer.from('first\r\nsecond\r\n', 'utf8');
const OID_PATTERN = /^[0-9a-f]{40}$/;

describe('effective text=auto', () => {
  test('the index OID differs from the raw OID and the detector names the path', () => {
    const repo = makeRepo('auto');
    writeFixtureFile(repo, 'win/install.bat', CRLF_BYTES);
    const raw = rawOid(repo, 'win/install.bat');
    expect(raw).toMatch(OID_PATTERN);

    writeInfoAttributes(repo, '* text=auto');
    git(['add', '--', 'win/install.bat'], repo);

    const staged = indexOid(repo, 'win/install.bat');
    expect(staged).toMatch(OID_PATTERN);
    expect(staged).not.toBe(raw);

    const result = checkAttributes(repo, ['win/install.bat'], new Map([['win/install.bat', raw]]));
    expect(result.ok).toBe(false);
    expect(result.mismatches).toHaveLength(1);

    const mismatch = result.mismatches[0];
    expect(mismatch.path).toBe('win/install.bat');
    expect(mismatch.indexOid).toBe(staged);
    expect(mismatch.rawOid).toBe(raw);
    expect(mismatch.upstreamOid).toBe(raw);
    expect(mismatch.attributes).toContain('text=auto');
  });
});

describe('the recorded staging attributes', () => {
  test('index OID equals raw OID equals upstream OID and no attribute is active', () => {
    const repo = makeRepo('neutral');
    writeFixtureFile(repo, 'win/install.bat', CRLF_BYTES);
    const raw = rawOid(repo, 'win/install.bat');

    writeInfoAttributes(repo, STAGING_ATTRIBUTES_VALUE);
    git(['add', '--', 'win/install.bat'], repo);

    const staged = indexOid(repo, 'win/install.bat');
    expect(staged).toMatch(OID_PATTERN);
    expect(staged).toBe(raw);

    const result = checkAttributes(repo, ['win/install.bat'], new Map([['win/install.bat', raw]]));
    expect(result.ok).toBe(true);
    expect(result.mismatches).toEqual([]);
  });
});

describe('upstream OID disagreement', () => {
  test('a staged blob that does not match the recorded upstream blob is reported', () => {
    const repo = makeRepo('upstream');
    writeFixtureFile(repo, 'README.md', 'hello\n');
    writeInfoAttributes(repo, STAGING_ATTRIBUTES_VALUE);
    git(['add', '--', 'README.md'], repo);

    const staged = indexOid(repo, 'README.md');
    const otherUpstream = '0123456789abcdef0123456789abcdef01234567';
    expect(staged).not.toBe(otherUpstream);

    const result = checkAttributes(
      repo,
      ['README.md'],
      new Map([['README.md', otherUpstream]]),
    );
    expect(result.ok).toBe(false);
    expect(result.mismatches[0].indexOid).toBe(staged);
    expect(result.mismatches[0].upstreamOid).toBe(otherUpstream);
    expect(result.mismatches[0].rawOid).toBe(staged);
  });
});
