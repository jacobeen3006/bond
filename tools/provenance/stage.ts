/**
 * Extraction, mode/symlink repair, and the staging functions shared by
 * "import", "manifest" and "replay".
 *
 * `restage()` is staging-only: no archive, no extraction, no fetch, no cache
 * access. It stages the existing worktree and recomputes the vendored manifest
 * through the same functions the import uses.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { join } from 'node:path';

import { cacheDir, commitPresent, git, readResolvedSha } from './fetch';
import {
  deriveExcludes,
  derivePaths,
  deriveRenames,
  ensureDir,
  ledgerPaths,
  readUpstreamLedger,
  serializeLedger,
  topLevelDirectories,
  writeUpstreamLedger,
  type UpstreamLedger,
} from './ledger';
import {
  comparePaths,
  hashBlob,
  hashFile,
  isLedgerPath,
  manifestBodyDigest,
  manifestFileDigest,
  renderManifest,
  type ManifestRow,
} from './manifest';
import { assertSafeArchiveEntries, parseTarListing, ProvenanceError } from './paths';

/** The exact line every fresh clone must restore before the first `git add`. */
export const STAGING_ATTRIBUTES_PATH = '.git/info/attributes';
export const STAGING_ATTRIBUTES_VALUE = '* -text -filter -ident -working-tree-encoding';

export const SERIES_HEADER =
  '# halo patch series — generated never; hand-maintained; every entry must apply cleanly in order';

const LOCKFILE_NAMES: Record<string, true> = {
  'Cargo.lock': true,
  'bun.lock': true,
  'bun.lockb': true,
  'package-lock.json': true,
  'pnpm-lock.yaml': true,
  'yarn.lock': true,
  'uv.lock': true,
  'poetry.lock': true,
  'deno.lock': true,
  'flake.lock': true,
  'MODULE.bazel.lock': true,
};

const MAX_BUFFER = 512 * 1024 * 1024;

export type TreeRow = { mode: string; oid: string; path: string; size: number };
export type IndexRow = { mode: string; oid: string; path: string };

export type ImportResult = {
  tree: string;
  files: number;
  bytes: number;
  vendoredFiles: number;
};

export type RestageResult = { tree: string; changed: boolean; files: number };

/** Write `.git/info/attributes` BEFORE the first `git add`. */
export function writeStagingAttributes(baseDir: string): void {
  const file = join(baseDir, '.git', 'info', 'attributes');
  ensureDir(path.dirname(file));
  writeFileSync(file, `${STAGING_ATTRIBUTES_VALUE}\n`, 'utf8');
}

/** Abort (exit 2) when the staging attributes are absent or wrong. */
export function assertStagingAttributes(baseDir: string): void {
  const file = join(baseDir, '.git', 'info', 'attributes');
  if (!existsSync(file)) {
    throw new ProvenanceError('staging attributes missing', 2);
  }
  const lines = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (!lines.includes(STAGING_ATTRIBUTES_VALUE)) {
    throw new ProvenanceError('staging attributes missing', 2);
  }
}

/** `git ls-tree -r [-l] <sha>` in the cache. Sizes are only requested by the import. */
export function readTreeRows(cache: string, sha: string, withSizes = true): TreeRow[] {
  const raw = git(['ls-tree', '-r', '-z', ...(withSizes ? ['-l'] : []), sha], cache);
  const rows: TreeRow[] = [];
  const missingSizes: string[] = [];

  for (const record of raw.split('\0')) {
    if (!record) continue;
    const tab = record.indexOf('\t');
    if (tab === -1) throw new ProvenanceError(`malformed ls-tree record: ${record}`, 2);
    const meta = record.slice(0, tab).trim().split(/\s+/);
    const [mode, type, oid] = meta;
    const size = withSizes ? meta[3] : '0';
    const treePath = record.slice(tab + 1);
    if (type !== 'blob' || mode === '160000') {
      throw new ProvenanceError(
        `gitlink not supported: ${treePath} (mode ${mode}); submodules are out of scope`,
        2,
      );
    }
    const parsedSize = size === '-' ? -1 : Number(size);
    if (parsedSize < 0) missingSizes.push(oid);
    rows.push({ mode, oid, path: treePath, size: parsedSize });
  }

  if (missingSizes.length > 0) {
    const unique = [...new Set(missingSizes)];
    const output = git(
      ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
      cache,
      `${unique.join('\n')}\n`,
    );
    const sizes = new Map<string, number>();
    for (const line of output.split('\n')) {
      const [oid, type, size] = line.trim().split(' ');
      if (type === 'blob') sizes.set(oid, Number(size));
    }
    for (const row of rows) {
      if (row.size < 0) row.size = sizes.get(row.oid) ?? 0;
    }
  }
  return rows;
}

/**
 * Index rows at `dir`, returned with paths relative to `scope` when given.
 * `scope` is a repo-relative directory (`vendor/<tree>`), never absolute.
 */
export function readIndexRowsAt(dir: string, scope?: string): IndexRow[] {
  const args = ['ls-files', '-s', '-z'];
  if (scope) args.push('--', scope);
  const raw = git(args, dir);
  const rows: IndexRow[] = [];
  for (const record of raw.split('\0')) {
    if (!record) continue;
    const tab = record.indexOf('\t');
    const [mode, oid] = record.slice(0, tab).split(' ');
    const fullPath = record.slice(tab + 1);
    const relative =
      scope === undefined
        ? fullPath
        : fullPath.startsWith(`${scope}/`)
          ? fullPath.slice(scope.length + 1)
          : fullPath;
    rows.push({ mode, oid, path: relative });
  }
  return rows;
}

/** Hash every index row's bytes: `120000` from the stored link text, else raw file. */
export function manifestRowsFromIndex(
  dir: string,
  rows: readonly IndexRow[],
  filePrefix = '',
): ManifestRow[] {
  return rows.map((row) => ({
    mode: row.mode,
    oid: row.oid,
    sha256:
      row.mode === '120000'
        ? hashBlob(row.oid, dir)
        : hashFile(join(dir, ...`${filePrefix}${row.path}`.split('/'))),
    path: row.path,
  }));
}

/**
 * Repair modes after extraction: Windows cannot represent +x or symlinks.
 * `readBlob` supplies the upstream bytes for a symlink's stored link text.
 */
export function repairModesAt(
  dir: string,
  rows: readonly { mode: string; oid: string; path: string }[],
  readBlob: (oid: string) => Buffer,
  prefix = '',
): void {
  for (const row of rows) {
    const fullPath = `${prefix}${row.path}`;
    if (row.mode === '100755') {
      git(['update-index', '--chmod=+x', '--', fullPath], dir);
      continue;
    }
    if (row.mode !== '120000') continue;
    const worktreePath = join(dir, ...fullPath.split('/'));
    ensureDir(path.dirname(worktreePath));
    writeFileSync(worktreePath, readBlob(row.oid));
    const localOid = git(['hash-object', '-w', '--no-filters', '--', fullPath], dir).trim();
    if (localOid !== row.oid) {
      throw new ProvenanceError(
        `symlink blob mismatch: ${fullPath} local=${localOid} upstream=${row.oid}`,
        1,
      );
    }
    git(['update-index', '--add', '--cacheinfo', `120000,${localOid},${fullPath}`], dir);
  }
}

/** The one vendored-manifest producer (used by import, restage and replay). */
export function vendoredManifestRows(baseDir: string, tree: string): ManifestRow[] {
  const rows = readIndexRowsAt(baseDir, `vendor/${tree}`).filter(
    (row) => !isLedgerPath(row.path),
  );
  const manifest = manifestRowsFromIndex(baseDir, rows, `vendor/${tree}/`);
  manifest.sort((a, b) => comparePaths(a.path, b.path));
  return manifest;
}

function toolVersion(command: string, pattern: RegExp, fallback: string): string {
  try {
    const output = execFileSync(command, ['--version'], { encoding: 'utf8' });
    return output.match(pattern)?.[1] ?? fallback;
  } catch {
    return fallback;
  }
}

export function gitVersion(): string {
  return toolVersion('git', /git version (\S+)/, 'unknown');
}

export function lfsVersion(): string {
  return toolVersion('git-lfs', /git-lfs\/(\S+)/, 'unknown');
}

export function countCopyrightNotices(bytes: Buffer): number {
  return (bytes.toString('utf8').match(/copyright/gi) ?? []).length;
}

/** `import --tree <name> [--sha <sha>]` */
export function importTree(baseDir: string, tree: string, shaOverride?: string): ImportResult {
  const cache = cacheDir(baseDir, tree);
  if (!existsSync(cache)) {
    throw new ProvenanceError(`missing cache: upstream-cache/${tree}.git`, 2);
  }
  const sha = shaOverride ?? readResolvedSha(baseDir, tree);
  if (!commitPresent(cache, sha)) {
    throw new ProvenanceError(`pinned commit missing: ${sha}`, 2);
  }

  const targetRoot = join(baseDir, 'vendor', tree);
  const ledger = ledgerPaths(baseDir, tree);
  if (existsSync(ledger.upstream)) {
    throw new ProvenanceError(`tree already imported: ${tree} (use manifest to refresh)`, 2);
  }
  if (existsSync(targetRoot) && readdirSync(targetRoot).length > 0) {
    rmSync(targetRoot, { recursive: true, force: true });
  }

  writeStagingAttributes(baseDir);

  const treeRows = readTreeRows(cache, sha);
  const files = treeRows.length;
  const bytes = treeRows.reduce((sum, row) => sum + row.size, 0);
  process.stdout.write(`SIZE ${tree} files=${files} bytes=${bytes}\n`);

  const tarPath = join(tmpdir(), `halo-${tree}-${process.pid}-${Date.now()}.tar`);
  try {
    git(['archive', '--format=tar', `--output=${tarPath}`, sha], cache);
    const listing = execFileSync('tar', ['-tf', tarPath], {
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
    });
    assertSafeArchiveEntries(parseTarListing(listing));

    ensureDir(targetRoot);
    execFileSync('tar', ['-xf', tarPath, '-C', targetRoot], {
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
    });
  } finally {
    rmSync(tarPath, { force: true });
  }

  git(['add', '-A', '--', `vendor/${tree}`], baseDir);
  repairModesAt(
    baseDir,
    treeRows,
    (oid) => execFileSync('git', ['cat-file', 'blob', oid], { cwd: cache, maxBuffer: MAX_BUFFER }),
    `vendor/${tree}/`,
  );

  ensureDir(ledger.dir);

  const upstreamRows: ManifestRow[] = treeRows.map((row) => ({
    mode: row.mode,
    oid: row.oid,
    sha256: hashBlob(row.oid, cache),
    path: row.path,
  }));
  const upstreamText = renderManifest(upstreamRows);
  writeFileSync(ledger.manifestUpstream, upstreamText, 'utf8');

  const vendoredRows = vendoredManifestRows(baseDir, tree);
  const vendoredText = renderManifest(vendoredRows);
  writeFileSync(ledger.manifestVendored, vendoredText, 'utf8');

  ensureDir(ledger.patchesDir);
  writeFileSync(ledger.series, `${SERIES_HEADER}\n`, 'utf8');
  writeFileSync(
    ledger.paths,
    serializeLedger(derivePaths(tree, topLevelDirectories(treeRows.map((row) => row.path)))),
    'utf8',
  );
  writeFileSync(ledger.renames, serializeLedger(deriveRenames(tree)), 'utf8');
  writeFileSync(ledger.excludes, serializeLedger(deriveExcludes(tree)), 'utf8');

  const licenseRow = treeRows.find((row) => row.path === 'LICENSE');
  if (!licenseRow) {
    throw new ProvenanceError(`license: no LICENSE file in ${tree}`, 2);
  }

  const document: UpstreamLedger = {
    schema: 'halo/upstream/v1',
    subtree: tree,
    local_root: `vendor/${tree}`,
    repo: git(['config', '--get', 'remote.origin.url'], cache).trim(),
    commit: sha,
    commit_committed_at: git(['show', '-s', '--format=%cI', sha], cache).trim(),
    default_branch: 'main',
    tag: null,
    object_format: git(['rev-parse', '--show-object-format'], cache).trim(),
    import: {
      mode: 'archive',
      date: new Date().toISOString().slice(0, 10),
      tool: 'halo-provenance/0.1.0',
      git_version: gitVersion(),
      lfs_version: lfsVersion(),
      staging_attributes: STAGING_ATTRIBUTES_PATH,
      staging_attributes_value: STAGING_ATTRIBUTES_VALUE,
    },
    license: {
      spdx: 'MIT',
      files: [{ path: licenseRow.path, blob: licenseRow.oid, sha256: hashBlob(licenseRow.oid, cache) }],
      copyright_notice_count: countCopyrightNotices(
        execFileSync('git', ['cat-file', 'blob', licenseRow.oid], {
          cwd: cache,
          maxBuffer: MAX_BUFFER,
        }),
      ),
    },
    lockfiles: treeRows
      .filter((row) => LOCKFILE_NAMES[row.path.split('/').pop() ?? ''] === true)
      .map((row) => ({ path: row.path, sha256: hashBlob(row.oid, cache) })),
    counts: {
      files,
      bytes,
      lfs_files: 0,
      symlinks: treeRows.filter((row) => row.mode === '120000').length,
      executables: treeRows.filter((row) => row.mode === '100755').length,
    },
    manifests: {
      upstream: 'provenance/MANIFEST.upstream.tsv',
      upstream_sha256: manifestBodyDigest(upstreamText),
      vendored: 'provenance/MANIFEST.vendored.tsv',
      vendored_sha256: manifestBodyDigest(vendoredText),
    },
    excludes_sha256: hashFile(ledger.excludes),
    renames_sha256: hashFile(ledger.renames),
  };
  writeUpstreamLedger(baseDir, tree, document);

  process.stdout.write(`IMPORT OK ${tree} files=${vendoredRows.length}\n`);
  return { tree, files, bytes, vendoredFiles: vendoredRows.length };
}

/**
 * `manifest --tree <name>`: stage the existing worktree, recompute the vendored
 * manifest through the shared writer, assert the three digests it does not own,
 * and rewrite `UPSTREAM.json.manifests.vendored_sha256` only when it changed.
 */
export function restage(baseDir: string, tree: string): RestageResult {
  assertStagingAttributes(baseDir);
  const ledger = ledgerPaths(baseDir, tree);
  const document = readUpstreamLedger(baseDir, tree);

  git(['add', '-A', '--', `vendor/${tree}`], baseDir);
  const vendoredRows = vendoredManifestRows(baseDir, tree);
  const text = renderManifest(vendoredRows);

  if (manifestFileDigest(ledger.manifestUpstream) !== document.manifests.upstream_sha256) {
    throw new ProvenanceError(
      `ledger inconsistent: vendor/${tree}/provenance/MANIFEST.upstream.tsv`,
      2,
    );
  }
  if (hashFile(ledger.excludes) !== document.excludes_sha256) {
    throw new ProvenanceError(`ledger inconsistent: vendor/${tree}/provenance/EXCLUDES.json`, 2);
  }
  if (hashFile(ledger.renames) !== document.renames_sha256) {
    throw new ProvenanceError(`ledger inconsistent: vendor/${tree}/provenance/RENAMES.json`, 2);
  }

  const current = existsSync(ledger.manifestVendored)
    ? readFileSync(ledger.manifestVendored, 'utf8')
    : '';

  if (text === current) {
    process.stdout.write(`MANIFEST OK ${tree} unchanged\n`);
    return { tree, changed: false, files: vendoredRows.length };
  }

  writeFileSync(ledger.manifestVendored, text, 'utf8');
  document.manifests.vendored_sha256 = manifestBodyDigest(text);
  writeUpstreamLedger(baseDir, tree, document);
  process.stdout.write(`MANIFEST UPDATED ${tree} files=${vendoredRows.length}\n`);
  return { tree, changed: true, files: vendoredRows.length };
}

/** Enforce the vendored-index prohibitions: no gitlinks, no nested `.git`. */
export function assertNoGitlink(baseDir: string, tree: string): void {
  const raw = git(['ls-files', '-s', '-z', '--', `vendor/${tree}`], baseDir);
  for (const record of raw.split('\0')) {
    if (record.startsWith('160000 ')) {
      throw new ProvenanceError(`gitlink in vendored tree: ${record}`, 1);
    }
  }
  if (existsSync(join(baseDir, 'vendor', tree, '.gitmodules'))) {
    throw new ProvenanceError('vendored tree contains .gitmodules', 1);
  }
  const stack = [join(baseDir, 'vendor', tree)];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === '.git') {
        throw new ProvenanceError('vendored tree contains a .git directory', 1);
      }
      stack.push(join(dir, entry.name));
    }
  }
}
