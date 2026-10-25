/**
 * IMPT-06 / T-1-16 — the lockfile half of import fidelity.
 *
 * A regenerated lockfile changes which packages a build installs while every
 * source file still looks right, so this suite compares bytes, not meaning:
 * each listed lockfile is re-hashed from disk, cross-checked against the blob
 * OID in both manifests *and* against the git index, and every lockfile-shaped
 * file the tree ships must be listed. Completeness is the load-bearing part —
 * an incomplete `lockfiles[]` would make the byte comparison vacuous — so the
 * detected set is printed per tree on every run and an unlisted file is a
 * finding rather than an exclusion.
 *
 * The kinds are the ones the four trees actually ship, including the Nix and
 * Bazel pins (`flake.lock`, `MODULE.bazel.lock`) a npm/Cargo-only detector
 * would miss, and `deno.lock`/`uv.lock` for hindsight.
 */

import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { listLedgerTrees } from '../../tools/provenance/ledger';
import {
  comparePaths,
  hashBytes,
  hashFile,
  readManifestFile,
  renderManifest,
  type ManifestRow,
} from '../../tools/provenance/manifest';
import { readIndexRowsAt } from '../../tools/provenance/stage';

const repoRoot = join(import.meta.dir, '..', '..');

/** Every lockfile kind the imported trees ship, plus the npm/pnpm/yarn forms. */
const LOCKFILE_BASENAMES =
  /^(?:bun\.lockb?|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|uv\.lock|poetry\.lock|deno\.lock|Pipfile\.lock|flake\.lock|MODULE\.bazel\.lock)$/;

export type LockfileFindingKind =
  | 'missing'
  | 'sha-mismatch'
  | 'undocumented'
  | 'not-in-manifest'
  | 'not-in-index'
  | 'oid-mismatch';

export type LockfileFinding = { kind: LockfileFindingKind; path: string; detail: string };

type LockfileEntry = { path: string; sha256: string };

export type LockfileCheck = {
  findings: LockfileFinding[];
  discovered: string[];
  listed: LockfileEntry[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Every lockfile-shaped file under `treeRoot`, POSIX-separated. `provenance/` is HALO's. */
export function discoverLockfiles(treeRoot: string): string[] {
  const found: string[] = [];
  const visit = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        if (prefix === '' && entry.name === 'provenance') continue;
        visit(join(dir, entry.name), relative);
      } else if (entry.isFile() && LOCKFILE_BASENAMES.test(entry.name)) {
        found.push(relative);
      }
    }
  };
  visit(treeRoot, '');
  return found.sort(comparePaths);
}

/** Unique basenames, byte-sorted — the shape the `LOCKFILES` line prints. */
export function lockfileBasenames(paths: readonly string[]): string[] {
  const names = new Set(paths.map((path) => path.slice(path.lastIndexOf('/') + 1)));
  return [...names].sort(comparePaths);
}

function readLedgerEntries(file: string): LockfileEntry[] {
  const document: unknown = JSON.parse(readFileSync(file, 'utf8'));
  const record = asRecord(document);
  if (record === null) throw new Error(`${file}: document is not an object`);
  const lockfiles = record.lockfiles;
  if (!Array.isArray(lockfiles)) throw new Error(`${file}: lockfiles is not an array`);
  return lockfiles.map((entry) => {
    const item = asRecord(entry);
    const path = item === null ? undefined : item.path;
    const sha256 = item === null ? undefined : item.sha256;
    if (typeof path !== 'string' || typeof sha256 !== 'string') {
      throw new Error(`${file}: lockfile entry without path/sha256`);
    }
    return { path, sha256 };
  });
}

/**
 * Check one tree. `indexRows` is injectable so a fixture can be checked without
 * a git repository; the real trees go through one `git ls-files -s` call.
 */
export function checkTree(
  baseDir: string,
  tree: string,
  indexRows?: ReadonlyMap<string, string>,
): LockfileCheck {
  const vendorRoot = join(baseDir, 'vendor', tree);
  const ledgerDir = join(vendorRoot, 'provenance');
  const listed = readLedgerEntries(join(ledgerDir, 'UPSTREAM.json'));
  const upstreamByPath = new Map(
    readManifestFile(join(ledgerDir, 'MANIFEST.upstream.tsv')).map((row) => [row.path, row]),
  );
  const vendoredByPath = new Map(
    readManifestFile(join(ledgerDir, 'MANIFEST.vendored.tsv')).map((row) => [row.path, row]),
  );
  const index =
    indexRows ?? new Map(readIndexRowsAt(baseDir, `vendor/${tree}`).map((row) => [row.path, row.oid]));
  const discovered = discoverLockfiles(vendorRoot);
  const findings: LockfileFinding[] = [];
  const listedPaths = new Set<string>();

  for (const entry of listed) {
    listedPaths.add(entry.path);
    const file = join(vendorRoot, ...entry.path.split('/'));
    if (!existsSync(file)) {
      findings.push({ kind: 'missing', path: entry.path, detail: 'listed but absent on disk' });
      continue;
    }
    const actual = hashFile(file);
    if (actual !== entry.sha256) {
      findings.push({
        kind: 'sha-mismatch',
        path: entry.path,
        detail: `recorded=${entry.sha256} actual=${actual}`,
      });
    }
    const upstream = upstreamByPath.get(entry.path);
    const vendored = vendoredByPath.get(entry.path);
    if (upstream === undefined || vendored === undefined) {
      findings.push({
        kind: 'not-in-manifest',
        path: entry.path,
        detail: `upstream=${upstream === undefined ? 'absent' : 'present'} vendored=${
          vendored === undefined ? 'absent' : 'present'
        }`,
      });
    } else if (upstream.oid !== vendored.oid) {
      findings.push({
        kind: 'oid-mismatch',
        path: entry.path,
        detail: `upstream=${upstream.oid} vendored=${vendored.oid}`,
      });
    }
    const indexOid = index.get(entry.path);
    if (indexOid === undefined) {
      findings.push({
        kind: 'not-in-index',
        path: entry.path,
        detail: 'no git ls-files row at vendor/' + tree + '/' + entry.path,
      });
    } else if (vendored !== undefined && indexOid !== vendored.oid) {
      findings.push({
        kind: 'oid-mismatch',
        path: entry.path,
        detail: `index=${indexOid} vendored=${vendored.oid}`,
      });
    }
  }

  for (const path of discovered) {
    if (listedPaths.has(path)) continue;
    findings.push({
      kind: 'undocumented',
      path,
      detail: 'present on disk but absent from UPSTREAM.json.lockfiles',
    });
  }

  findings.sort((left, right) =>
    left.path === right.path
      ? comparePaths(left.kind, right.kind)
      : comparePaths(left.path, right.path),
  );
  return { findings, discovered, listed };
}

function ofKind(check: LockfileCheck, kinds: readonly LockfileFindingKind[]): LockfileFinding[] {
  return check.findings.filter((finding) => kinds.includes(finding.kind));
}

/** The git blob oid a fixture manifest would record for these bytes. */
function gitBlobOid(bytes: Buffer): string {
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

type Fixture = {
  base: string;
  index: Map<string, string>;
  dispose: () => void;
};

/**
 * A minimal tree shaped like a real one: a lockfile, both manifests and a
 * ledger. Nothing under the repository's own `vendor/` is touched.
 */
function scratchTree(options: {
  listed: { bytes: Buffer; path: string }[];
  onDisk?: Record<string, Buffer>;
}): Fixture {
  const base = mkdtempSync(join(tmpdir(), 'halo-lockfiles-'));
  const treeRoot = join(base, 'vendor', 'fixture');
  const ledgerDir = join(treeRoot, 'provenance');
  mkdirSync(ledgerDir, { recursive: true });

  const onDisk = options.onDisk ?? {};
  const index = new Map<string, string>();

  const rows: ManifestRow[] = options.listed.map((entry) => {
    const oid = gitBlobOid(entry.bytes);
    index.set(entry.path, oid);
    return { mode: '100644', oid, sha256: hashBytes(entry.bytes), path: entry.path };
  });
  const manifest = renderManifest(rows);
  writeFileSync(join(ledgerDir, 'MANIFEST.upstream.tsv'), manifest, 'utf8');
  writeFileSync(join(ledgerDir, 'MANIFEST.vendored.tsv'), manifest, 'utf8');
  writeFileSync(
    join(ledgerDir, 'UPSTREAM.json'),
    `${JSON.stringify(
      {
        schema: 'halo/upstream/v1',
        subtree: 'fixture',
        lockfiles: options.listed.map((entry) => ({
          path: entry.path,
          sha256: hashBytes(entry.bytes),
        })),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  for (const [path, bytes] of Object.entries(onDisk)) {
    const file = join(treeRoot, ...path.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }

  return { base, index, dispose: () => rmSync(base, { recursive: true, force: true }) };
}

const trees = listLedgerTrees(repoRoot);
console.log(`lockfile ledger covers: ${trees.join(', ') || '(none)'}`);

/**
 * One check per tree, reused by the assertions below. The `LOCKFILES` line is
 * written before any assertion so the reconciliation is visible on a failing
 * run too — a green suite that silently detected nothing would be worse than
 * a red one.
 */
const checks = trees.map((tree) => {
  const check = checkTree(repoRoot, tree);
  console.log(`LOCKFILES ${tree} ${lockfileBasenames(check.discovered).join(',') || '(none)'}`);
  return { tree, check };
});

describe('the lockfile ledger covers every imported tree', () => {
  test('at least four trees are checked', () => {
    expect(trees.length).toBeGreaterThanOrEqual(4);
  });

  test('every tree ships at least one lockfile the detector recognises', () => {
    const emptyTrees = checks
      .filter(({ check }) => check.discovered.length === 0)
      .map(({ tree }) => tree);
    expect(emptyTrees).toEqual([]);
  });

  test('the detected basenames include the Nix, Bazel and Deno pins', () => {
    const detected = new Set(checks.flatMap(({ check }) => lockfileBasenames(check.discovered)));
    for (const name of ['Cargo.lock', 'flake.lock', 'MODULE.bazel.lock', 'deno.lock', 'uv.lock']) {
      expect({ name, present: detected.has(name) }).toEqual({ name, present: true });
    }
  });
});

for (const { tree, check } of checks) {
  describe(`${tree} lockfiles`, () => {
    test('every listed lockfile exists and recomputes to its recorded SHA-256', () => {
      expect(ofKind(check, ['missing', 'sha-mismatch'])).toEqual([]);
      expect(check.listed.length).toBeGreaterThan(0);
    });

    test('every listed lockfile is a manifest row whose OIDs agree', () => {
      expect(ofKind(check, ['not-in-manifest', 'oid-mismatch'])).toEqual([]);
    });

    test('every listed lockfile is tracked at the recorded blob OID', () => {
      expect(ofKind(check, ['not-in-index'])).toEqual([]);
    });

    test('the ledger lists every lockfile-shaped file the tree ships', () => {
      expect(ofKind(check, ['undocumented'])).toEqual([]);
      expect(check.discovered.length).toBe(check.listed.length);
    });
  });
}

describe('the check bites on drift instead of reporting a clean tree', () => {
  const ORIGINAL = Buffer.from('{"lockfileVersion":3,"packages":{}}\n', 'utf8');

  test('a corrupted lockfile is reported as sha drift', () => {
    const fixture = scratchTree({
      listed: [{ path: 'package-lock.json', bytes: ORIGINAL }],
      onDisk: { 'package-lock.json': Buffer.from('{"lockfileVersion":3,"packages":{"x":{}}}\n') },
    });
    try {
      const check = checkTree(fixture.base, 'fixture', fixture.index);
      expect(ofKind(check, ['sha-mismatch']).map((finding) => finding.path)).toEqual([
        'package-lock.json',
      ]);
      expect(check.findings.length).toBeGreaterThan(0);
    } finally {
      fixture.dispose();
    }
  });

  test('a lockfile the ledger omits is reported by name', () => {
    const fixture = scratchTree({
      listed: [{ path: 'package-lock.json', bytes: ORIGINAL }],
      onDisk: {
        'package-lock.json': ORIGINAL,
        'nested/uv.lock': Buffer.from('version = 1\n'),
      },
    });
    try {
      const check = checkTree(fixture.base, 'fixture', fixture.index);
      expect(ofKind(check, ['undocumented']).map((finding) => finding.path)).toEqual([
        'nested/uv.lock',
      ]);
      expect(lockfileBasenames(check.discovered)).toEqual(['package-lock.json', 'uv.lock']);
    } finally {
      fixture.dispose();
    }
  });

  test('an empty lockfiles array passes only when the tree ships none', () => {
    const empty = scratchTree({ listed: [], onDisk: { 'README.md': Buffer.from('# no lockfile\n') } });
    try {
      const clean = checkTree(empty.base, 'fixture', empty.index);
      expect(clean.discovered).toEqual([]);
      expect(clean.findings).toEqual([]);
    } finally {
      empty.dispose();
    }

    const inconsistent = scratchTree({
      listed: [],
      onDisk: { 'flake.lock': Buffer.from('{"nodes":{}}\n') },
    });
    try {
      const drifted = checkTree(inconsistent.base, 'fixture', inconsistent.index);
      expect(ofKind(drifted, ['undocumented']).map((finding) => finding.path)).toEqual([
        'flake.lock',
      ]);
    } finally {
      inconsistent.dispose();
    }
  });

  test('a vendored OID that differs from the upstream blob is reported', () => {
    const fixture = scratchTree({
      listed: [{ path: 'Cargo.lock', bytes: ORIGINAL }],
      onDisk: { 'Cargo.lock': ORIGINAL },
    });
    try {
      // Rewrite only the vendored manifest's row: bytes and ledger still agree,
      // so the only surface left that can catch this is the OID cross-check.
      const vendored = join(fixture.base, 'vendor', 'fixture', 'provenance', 'MANIFEST.vendored.tsv');
      const rerendered = readManifestFile(vendored).map((row) => ({
        ...row,
        oid: '0'.repeat(40),
      }));
      writeFileSync(vendored, renderManifest(rerendered), 'utf8');
      const check = checkTree(fixture.base, 'fixture', fixture.index);
      expect(ofKind(check, ['oid-mismatch']).length).toBeGreaterThan(0);
    } finally {
      fixture.dispose();
    }
  });
});
