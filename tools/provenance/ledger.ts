/**
 * Ledger documents: deterministic derivation of `PATHS.json`, `RENAMES.json`
 * and `EXCLUDES.json`, plus the one place that knows where the ledger files
 * live and how `UPSTREAM.json` is read and written.
 *
 * The import path here and the `ledger` subcommand in plan 01-03 must produce
 * byte-identical files from the same upstream tree, so every array is sorted
 * on its natural key with the byte comparator (never locale collation).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { comparePaths } from './manifest';
import { ProvenanceError } from './paths';

export type PrefixRule = {
  kind: 'prefix';
  from: string;
  to: string;
  reason: string;
};

export type AddedRule = {
  to: string;
  reason: string;
};

export type PathsLedger = {
  schema: 'halo/paths/v1';
  subtree: string;
  resolution: string;
  rules: PrefixRule[];
  exceptions: never[];
  added: AddedRule[];
};

export type RenamesLedger = {
  schema: 'halo/renames/v1';
  subtree: string;
  generated_from: 'brand.json';
  phase_populated: number;
  rules: never[];
};

export type ExcludesLedger = {
  schema: 'halo/excludes/v1';
  subtree: string;
  rules: never[];
};

export type UpstreamLedger = {
  schema: string;
  subtree: string;
  local_root: string;
  repo: string;
  commit: string;
  commit_committed_at: string;
  default_branch: string;
  tag: string | null;
  object_format: string;
  import: {
    mode: string;
    date: string;
    tool: string;
    git_version: string;
    lfs_version: string;
    staging_attributes: string;
    staging_attributes_value: string;
  };
  license: {
    spdx: string;
    files: { path: string; blob: string; sha256: string }[];
    copyright_notice_count: number;
  };
  lockfiles: { path: string; sha256: string }[];
  counts: {
    files: number;
    bytes: number;
    lfs_files: number;
    symlinks: number;
    executables: number;
  };
  manifests: {
    upstream: string;
    upstream_sha256: string;
    vendored: string;
    vendored_sha256: string;
  };
  excludes_sha256: string;
  renames_sha256: string;
};

export const PATHS_RESOLUTION =
  'exceptions first, then longest-prefix-first, then file rules, then identity ' +
  '(a path matched by both a prefix rule and a file exception resolves by the exception)';

/** The canonical `provenance/` rule: the ledger is HALO-local, never upstream. */
export const ADDED_PROVENANCE_RULE: AddedRule = {
  to: 'provenance/',
  reason: 'HALO provenance record (not upstream)',
};

/** Distinct top-level directories of an upstream path list, byte-sorted. */
export function topLevelDirectories(paths: readonly string[]): string[] {
  const dirs = new Set<string>();
  for (const path of paths) {
    const slash = path.indexOf('/');
    if (slash > 0) dirs.add(path.slice(0, slash));
  }
  return [...dirs].sort(comparePaths);
}

export function derivePaths(subtree: string, upstreamTopLevelDirs: readonly string[]): PathsLedger {
  const dirs = [...upstreamTopLevelDirs].sort(comparePaths);
  return {
    schema: 'halo/paths/v1',
    subtree,
    resolution: PATHS_RESOLUTION,
    rules: dirs.map((dir) => ({
      kind: 'prefix' as const,
      from: `${dir}/`,
      to: `${dir}/`,
      reason: 'verbatim subtree',
    })),
    exceptions: [],
    added: [{ ...ADDED_PROVENANCE_RULE }],
  };
}

export function deriveRenames(subtree: string): RenamesLedger {
  return {
    schema: 'halo/renames/v1',
    subtree,
    generated_from: 'brand.json',
    phase_populated: 2,
    rules: [],
  };
}

export function deriveExcludes(subtree: string, rules: readonly never[] = []): ExcludesLedger {
  return {
    schema: 'halo/excludes/v1',
    subtree,
    rules: [...rules],
  };
}

/** Canonical JSON: two-space indent, insertion key order, one trailing LF. */
export function serializeLedger(document: unknown): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export type LedgerPaths = {
  dir: string;
  root: string;
  upstream: string;
  manifestUpstream: string;
  manifestVendored: string;
  excludes: string;
  renames: string;
  paths: string;
  series: string;
  patchesDir: string;
};

export function ledgerPaths(baseDir: string, tree: string): LedgerPaths {
  const root = join(baseDir, 'vendor', tree);
  const dir = join(root, 'provenance');
  return {
    dir,
    root,
    upstream: join(dir, 'UPSTREAM.json'),
    manifestUpstream: join(dir, 'MANIFEST.upstream.tsv'),
    manifestVendored: join(dir, 'MANIFEST.vendored.tsv'),
    excludes: join(dir, 'EXCLUDES.json'),
    renames: join(dir, 'RENAMES.json'),
    paths: join(dir, 'PATHS.json'),
    series: join(dir, 'patches', 'series'),
    patchesDir: join(dir, 'patches'),
  };
}

/** Ensure a directory exists (recursive, idempotent). */
export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function readUpstreamLedger(baseDir: string, tree: string): UpstreamLedger {
  const file = ledgerPaths(baseDir, tree).upstream;
  if (!existsSync(file)) {
    throw new ProvenanceError(`missing ledger: ${relativePosix(baseDir, file)}`, 2);
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as UpstreamLedger;
  } catch (error) {
    throw new ProvenanceError(
      `invalid ledger: ${relativePosix(baseDir, file)}: ${(error as Error).message}`,
      2,
    );
  }
}

export function writeUpstreamLedger(baseDir: string, tree: string, document: UpstreamLedger): void {
  const paths = ledgerPaths(baseDir, tree);
  ensureDir(paths.dir);
  writeFileSync(paths.upstream, serializeLedger(document), 'utf8');
}

/** Every tree carrying a `vendor/<tree>/provenance/UPSTREAM.json`, byte-sorted. */
export function listLedgerTrees(baseDir: string): string[] {
  const vendorDir = join(baseDir, 'vendor');
  if (!existsSync(vendorDir)) return [];
  return readdirSync(vendorDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((tree) => existsSync(join(vendorDir, tree, 'provenance', 'UPSTREAM.json')))
    .sort(comparePaths);
}

/** POSIX-separated repository-relative path, for diagnostics. */
export function relativePosix(baseDir: string, absolutePath: string): string {
  const base = baseDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const target = absolutePath.replace(/\\/g, '/');
  return target.startsWith(`${base}/`) ? target.slice(base.length + 1) : target;
}
