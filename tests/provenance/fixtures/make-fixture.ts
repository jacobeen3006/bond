#!/usr/bin/env bun
/**
 * Hermetic `tiny-upstream` fixture — the offline input every negative test in
 * this phase reuses.
 *
 * The repository is built entirely through the object database:
 * `git hash-object -w --no-filters` writes the exact bytes, and
 * `git update-index --add --cacheinfo` records the exact mode. No checkout, no
 * worktree filter and no `git add` ever runs, so the fixture is byte-stable on
 * Windows even for names the filesystem cannot materialize (`docs/CON.txt`,
 * `docs/trailing./file.txt`, a case-colliding pair, a 245-character path).
 *
 * Determinism: every input byte is a literal below, the author/committer dates
 * are fixed, `core.autocrlf=false`, and the commit message is constant, so two
 * builds produce the same tree and the same commit SHA.
 *
 * Usage:
 *   bun run tests/provenance/fixtures/make-fixture.ts --check
 *   bun run tests/provenance/fixtures/make-fixture.ts --emit <dir> [--hostile]
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type FixtureVariant = 'happy' | 'hostile';

type FixtureMode = '100644' | '100755' | '120000';

type FixtureEntry = { mode: FixtureMode; path: string; bytes: Buffer };

const FIXTURE_DATE = '2026-01-01T00:00:00 +0000';
const FIXTURE_NAME = 'HALO Fixture';
const FIXTURE_EMAIL = 'fixture@halo.local';
const FIXTURE_MESSAGE = 'fixture: tiny-upstream';

/** Every git call is CRLF-neutral, mode-faithful and path-unchecked. */
const GIT_CONFIG = [
  '-c',
  'core.autocrlf=false',
  '-c',
  'core.eol=lf',
  '-c',
  'core.filemode=true',
  '-c',
  'core.protectNTFS=false',
  '-c',
  'commit.gpgsign=false',
];

const LFS_PAYLOAD_SIZE = 1200;

function gitAt(dir: string, args: string[], input?: Buffer | string): string {
  return execFileSync('git', [...GIT_CONFIG, ...args], {
    cwd: dir,
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: FIXTURE_NAME,
      GIT_AUTHOR_EMAIL: FIXTURE_EMAIL,
      GIT_COMMITTER_NAME: FIXTURE_NAME,
      GIT_COMMITTER_EMAIL: FIXTURE_EMAIL,
      GIT_AUTHOR_DATE: FIXTURE_DATE,
      GIT_COMMITTER_DATE: FIXTURE_DATE,
    },
  });
}

function blobBytes(dir: string, oid: string): Buffer {
  return execFileSync('git', [...GIT_CONFIG, 'cat-file', 'blob', oid], {
    cwd: dir,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * A 1200-byte payload with no dependence on time, RNG or the host. The fixture
 * records its sha256 in an LFS pointer; the payload itself is never committed.
 */
function lfsPayload(): Buffer {
  const bytes = Buffer.alloc(LFS_PAYLOAD_SIZE);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 7 + 13) & 0xff;
  return bytes;
}

/**
 * The canonical LFS pointer is 129 bytes; the plan requires 130, so the
 * pointer carries one trailing blank line, which LFS treats as trailing
 * whitespace after the key/value block.
 */
function lfsPointer(): Buffer {
  const payload = lfsPayload();
  return Buffer.from(
    `version https://git-lfs.github.com/spec/v1\n` +
      `oid sha256:${sha256(payload)}\n` +
      `size ${payload.length}\n` +
      `\n`,
    'utf8',
  );
}

const GITATTRIBUTES = [
  '* text=auto',
  'win/install.bat -text',
  'assets/big.bin filter=lfs diff=lfs merge=lfs -text',
  '',
].join('\n');

const PACKAGE_LOCK = `${JSON.stringify(
  {
    name: 'tiny-upstream',
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: {},
  },
  null,
  2,
)}\n`;

const LICENSE = [
  'MIT License',
  '',
  'Copyright (c) 2026 Tiny Upstream Authors',
  '',
  'Permission is hereby granted, free of charge, to any person obtaining a copy',
  'of this software and associated documentation files (the "Software"), to deal',
  'in the Software without restriction, including without limitation the rights',
  'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell',
  'copies of the Software, and to permit persons to whom the Software is',
  'furnished to do so, subject to the following conditions:',
  '',
  'The above copyright notice and this permission notice shall be included in all',
  'copies or substantial portions of the Software.',
  '',
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
  'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,',
  'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE',
  'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER',
  'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,',
  'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE',
  'SOFTWARE.',
  '',
].join('\n');

/** The ten happy paths, in byte order, exactly as the plan names them. */
const HAPPY_ENTRIES: FixtureEntry[] = [
  { mode: '100644', path: '.gitattributes', bytes: Buffer.from(GITATTRIBUTES, 'utf8') },
  { mode: '100644', path: 'LICENSE', bytes: Buffer.from(LICENSE, 'utf8') },
  { mode: '100644', path: 'README.md', bytes: Buffer.from('# tiny-upstream\n\nA hermetic HALO import fixture.\n', 'utf8') },
  { mode: '100644', path: 'assets/big.bin', bytes: lfsPointer() },
  { mode: '120000', path: 'assets/link-to-readme', bytes: Buffer.from('../README.md', 'utf8') },
  {
    mode: '100644',
    path: 'docs/naïve-résumé.ts',
    bytes: Buffer.from("export const résumé = 'naïve';\n", 'utf8'),
  },
  { mode: '100644', path: 'package-lock.json', bytes: Buffer.from(PACKAGE_LOCK, 'utf8') },
  { mode: '100755', path: 'scripts/build.sh', bytes: Buffer.from('#!/bin/sh\nset -eu\necho build\n', 'utf8') },
  { mode: '100755', path: 'scripts/run.sh', bytes: Buffer.from('#!/bin/sh\nset -eu\necho run\n', 'utf8') },
  {
    mode: '100644',
    path: 'win/install.bat',
    bytes: Buffer.from('@echo off\r\necho install\r\n', 'utf8'),
  },
];

/** A 245-character relative path assembled from nested directories. */
export function longHostilePath(length = 245): string {
  let result = '';
  let index = 0;
  for (;;) {
    const segment = `d${String(index).padStart(3, '0')}`;
    const addition = (result.length === 0 ? 0 : 1) + segment.length;
    if (result.length + addition > length) break;
    result = result.length === 0 ? segment : `${result}/${segment}`;
    index += 1;
  }
  const padding = length - result.length;
  if (padding > 0) result += 'x'.repeat(padding);
  return result;
}

function hostileEntries(): FixtureEntry[] {
  const bytes = Buffer.from('hostile\n', 'utf8');
  return [
    { mode: '100644', path: 'Docs/Readme.md', bytes },
    { mode: '100644', path: 'docs/CON.txt', bytes },
    { mode: '100644', path: 'docs/README.md', bytes },
    { mode: '100644', path: 'docs/trailing./file.txt', bytes },
    { mode: '100644', path: longHostilePath(), bytes },
  ];
}

function prepareDir(dir: string): void {
  if (existsSync(dir)) {
    const entries = readdirSync(dir);
    if (!existsSync(join(dir, '.git')) && entries.length > 0) {
      throw new Error(`refusing to overwrite a non-fixture directory: ${dir}`);
    }
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
}

/**
 * Build one variant at `dir` and return its commit SHA.
 *
 * `--hostile` entries are never materialized on disk (Windows cannot hold
 * them); `happy` entries are written for humans to inspect, but the commit is
 * always built from the index, never from the worktree.
 */
export function emitFixture(dir: string, variant: FixtureVariant = 'happy'): string {
  prepareDir(dir);
  gitAt(dir, ['init', '-q', '-b', 'main', '.']);

  const entries = variant === 'happy' ? HAPPY_ENTRIES : hostileEntries();
  for (const entry of entries) {
    const oid = gitAt(dir, ['hash-object', '-w', '--no-filters', '--stdin'], entry.bytes).trim();
    gitAt(dir, ['update-index', '--add', '--cacheinfo', `${entry.mode},${oid},${entry.path}`]);
    if (variant === 'happy' && entry.mode !== '120000') {
      const file = join(dir, ...entry.path.split('/'));
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, entry.bytes);
    }
  }

  const tree = gitAt(dir, ['write-tree']).trim();
  const commit = gitAt(dir, ['commit-tree', tree, '-m', FIXTURE_MESSAGE]).trim();
  gitAt(dir, ['update-ref', 'refs/heads/main', commit]);
  gitAt(dir, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  return commit;
}

type TreeEntry = { mode: string; oid: string; path: string };

function listTree(dir: string): TreeEntry[] {
  const raw = gitAt(dir, ['ls-tree', '-r', '-z', 'HEAD']);
  const rows: TreeEntry[] = [];
  for (const record of raw.split('\0')) {
    if (!record) continue;
    const tab = record.indexOf('\t');
    const [mode, , oid] = record.slice(0, tab).split(' ');
    rows.push({ mode, oid, path: record.slice(tab + 1) });
  }
  return rows;
}

function fail(message: string): never {
  throw new Error(`fixture: ${message}`);
}

function assertHappy(dir: string): void {
  const rows = listTree(dir);
  const paths = rows.map((row) => row.path);
  const expected = HAPPY_ENTRIES.map((entry) => entry.path).sort();
  const actual = [...paths].sort();
  if (actual.length !== expected.length || actual.some((path, index) => path !== expected[index])) {
    fail(`happy tree differs: expected ${expected.join(',')} got ${actual.join(',')}`);
  }
  if (paths.length !== 10) fail(`happy files=${paths.length}; expected 10`);

  const executables = rows.filter((row) => row.mode === '100755');
  if (executables.length !== 2) fail(`happy executables=${executables.length}; expected 2`);
  const symlinks = rows.filter((row) => row.mode === '120000');
  if (symlinks.length !== 1) fail(`happy symlinks=${symlinks.length}; expected 1`);

  const byPath = new Map(rows.map((row) => [row.path, row]));
  const bat = byPath.get('win/install.bat');
  if (!bat) fail('missing shape win/install.bat');
  const batBytes = blobBytes(dir, bat.oid);
  if (!batBytes.includes(Buffer.from([0x0d, 0x0a]))) fail('win/install.bat has no CRLF pair');

  const readme = byPath.get('README.md');
  if (!readme) fail('missing shape README.md');
  if (blobBytes(dir, readme.oid).includes(0x0d)) fail('README.md must be LF-only');

  for (const script of ['scripts/run.sh', 'scripts/build.sh']) {
    const row = byPath.get(script);
    if (!row) fail(`missing shape ${script}`);
    if (row.mode !== '100755') fail(`${script} mode ${row.mode}; expected 100755`);
    if (blobBytes(dir, row.oid).includes(0x0d)) fail(`${script} must be LF-only`);
  }

  const link = byPath.get('assets/link-to-readme');
  if (!link) fail('missing shape assets/link-to-readme');
  if (link.mode !== '120000') fail(`assets/link-to-readme mode ${link.mode}; expected 120000`);
  if (blobBytes(dir, link.oid).toString('utf8') !== '../README.md') {
    fail('assets/link-to-readme target is not ../README.md');
  }

  const pointerRow = byPath.get('assets/big.bin');
  if (!pointerRow) fail('missing shape assets/big.bin');
  const pointer = blobBytes(dir, pointerRow.oid);
  if (pointer.length !== 130) fail(`assets/big.bin pointer bytes=${pointer.length}; expected 130`);
  const pointerText = pointer.toString('utf8');
  const oid = pointerText.match(/^oid sha256:([0-9a-f]{64})$/m)?.[1] ?? '';
  const size = Number(pointerText.match(/^size (\d+)$/m)?.[1] ?? '0');
  if (oid !== sha256(lfsPayload())) fail('assets/big.bin oid does not match the payload sha256');
  if (size !== LFS_PAYLOAD_SIZE) fail(`assets/big.bin size=${size}; expected ${LFS_PAYLOAD_SIZE}`);

  const attributes = byPath.get('.gitattributes');
  if (!attributes) fail('missing shape .gitattributes');
  const attributesText = blobBytes(dir, attributes.oid).toString('utf8');
  if (!attributesText.includes('assets/big.bin filter=lfs diff=lfs merge=lfs -text')) {
    fail('.gitattributes is missing the LFS rule for assets/big.bin');
  }

  const lockfile = byPath.get('package-lock.json');
  if (!lockfile) fail('missing shape package-lock.json');
  try {
    JSON.parse(blobBytes(dir, lockfile.oid).toString('utf8'));
  } catch {
    fail('package-lock.json is not valid JSON');
  }

  const license = byPath.get('LICENSE');
  if (!license) fail('missing shape LICENSE');
  const licenseText = blobBytes(dir, license.oid).toString('utf8');
  if (!licenseText.includes('Copyright (c) 2026 Tiny Upstream Authors')) {
    fail('LICENSE is missing the holder line');
  }

  if (!byPath.has('docs/naïve-résumé.ts')) fail('missing shape docs/naïve-résumé.ts');
}

function assertHostile(dir: string): void {
  const rows = listTree(dir);
  const paths = rows.map((row) => row.path);
  const required = ['Docs/Readme.md', 'docs/README.md', 'docs/CON.txt', 'docs/trailing./file.txt'];
  for (const path of required) {
    if (!paths.includes(path)) fail(`hostile shape missing: ${path}`);
  }
  const long = paths.find((path) => path.length === 245);
  if (!long) fail('hostile shape missing: 245-character path');
  if (paths.length !== 5) fail(`hostile files=${paths.length}; expected 5`);
  const collisions = paths
    .map((path) => path.toLowerCase())
    .filter((path, index, all) => all.indexOf(path) !== index);
  if (collisions.length !== 1) fail('hostile tree is missing the case collision');
}

function check(): void {
  const scratch = mkdtempSync(join(tmpdir(), 'halo-fixture-'));
  try {
    const first = join(scratch, 'tiny-upstream-a');
    const second = join(scratch, 'tiny-upstream-b');
    const firstSha = emitFixture(first, 'happy');
    assertHappy(first);
    const secondSha = emitFixture(second, 'happy');
    assertHappy(second);
    if (firstSha !== secondSha) {
      fail(`nondeterministic HEAD: ${firstSha} != ${secondSha}`);
    }

    const hostile = join(scratch, 'tiny-upstream-hostile');
    emitFixture(hostile, 'hostile');
    assertHostile(hostile);

    process.stdout.write('FIXTURE OK files=10 exec=2 symlinks=1 lfs=1 hostile=4\n');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function main(argv: readonly string[]): void {
  if (argv.includes('--check')) {
    check();
    return;
  }
  const emitIndex = argv.indexOf('--emit');
  if (emitIndex === -1) {
    throw new Error('usage: make-fixture.ts --check | --emit <dir> [--hostile]');
  }
  const dir = argv[emitIndex + 1];
  if (!dir) throw new Error('missing value for --emit');
  const variant: FixtureVariant = argv.includes('--hostile') ? 'hostile' : 'happy';
  const sha = emitFixture(dir, variant);
  process.stdout.write(`EMITTED ${variant} ${dir} ${sha}\n`);
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
