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
  /**
   * Facts the tree declares about its own build, recorded here instead of
   * re-hosted at the HALO root (DEC-04). Optional so ledgers written before
   * this field existed stay valid.
   */
  notes?: Record<string, string>;
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

/** `Bun.TOML` is the runtime's own parser; the cast names the one global we read. */
const bunGlobal = globalThis as { Bun?: { TOML?: { parse(text: string): unknown } } };

/** Lockfile basenames the ledger recognises, paired with the manager that owns them. */
const MANAGER_BY_LOCKFILE: readonly (readonly [string, string])[] = [
  ['Cargo.lock', 'cargo'],
  ['MODULE.bazel.lock', 'bazel'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['deno.lock', 'deno'],
  ['flake.lock', 'nix'],
  ['package-lock.json', 'npm'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['poetry.lock', 'poetry'],
  ['uv.lock', 'uv'],
  ['yarn.lock', 'yarn'],
];

const LOCKFILE_BASENAMES: ReadonlySet<string> = new Set(
  MANAGER_BY_LOCKFILE.map(([file]) => file),
);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readToml(file: string): Record<string, unknown> | null {
  const parser = bunGlobal.Bun?.TOML;
  if (parser === undefined || !existsSync(file)) return null;
  try {
    return asRecord(parser.parse(readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

function readJsonObject(file: string): Record<string, unknown> | null {
  if (!existsSync(file)) return null;
  try {
    return asRecord(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

/**
 * The tree's own build facts: its Python constraint (root, or the members when
 * the root declares none), its package managers, its root lockfiles and where
 * its workspace root is. Every value is read from the imported tree, so an
 * absent declaration is recorded as absent rather than invented.
 */
export function deriveTreeNotes(root: string): Record<string, string> {
  const notes: Record<string, string> = {};
  const pyproject = readToml(join(root, 'pyproject.toml'));
  const pkg = readJsonObject(join(root, 'package.json'));
  const cargo = readToml(join(root, 'Cargo.toml'));
  const cargoWorkspace = asRecord(cargo?.workspace);
  const npmWorkspaceObject = asRecord(pkg?.workspaces);
  const bazelModule = existsSync(join(root, 'MODULE.bazel'));

  const project = asRecord(pyproject?.project);
  const uv = asRecord(asRecord(pyproject?.tool)?.uv);
  const uvWorkspace = asRecord(uv?.workspace);
  const members = asStringArray(uvWorkspace?.members).sort(comparePaths);

  const requiresPython = project?.['requires-python'];
  if (pyproject !== null) {
    if (typeof requiresPython === 'string') {
      notes['requires-python'] = requiresPython;
    } else {
      notes['requires-python'] = 'none (root)';
      const declared: string[] = [];
      for (const member of members) {
        const memberProject = asRecord(
          readToml(join(root, ...member.split('/'), 'pyproject.toml'))?.project,
        );
        const value = memberProject?.['requires-python'];
        if (typeof value === 'string') declared.push(`${member} ${value}`);
      }
      if (declared.length > 0) notes['requires-python-members'] = declared.join('; ');
    }
  }

  const rootNames = existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => LOCKFILE_BASENAMES.has(name))
        .sort(comparePaths)
    : [];

  const managers = new Set<string>();
  for (const [file, manager] of MANAGER_BY_LOCKFILE) {
    if (rootNames.includes(file)) managers.add(manager);
  }
  if (uv !== null) managers.add('uv');
  if (managers.size > 0) notes['package-manager'] = [...managers].sort(comparePaths).join(' + ');
  const packageManager = pkg?.packageManager;
  if (typeof packageManager === 'string' && packageManager.length > 0) {
    notes.package_manager = packageManager;
  }
  if (rootNames.length > 0) notes.lockfile = rootNames.join(', ');

  const workspace: string[] = [];
  if (uvWorkspace !== null) {
    workspace.push(`uv workspace at repo root (members: ${members.join(', ')})`);
  } else if (uv !== null) {
    workspace.push('uv project at repo root (no workspace)');
  }
  const npmWorkspaces = asStringArray(pkg?.workspaces);
  if (npmWorkspaces.length > 0) {
    workspace.push(`npm workspaces at repo root (${npmWorkspaces.join(', ')})`);
  }
  notes['workspace-root'] = workspace.length > 0 ? workspace.join('; ') : 'none';

  // Every build graph an import must never absorb: each is named by the file
  // and table that declares it, so a root workspace capturing this subtree is
  // detectable from the ledger alone (T-1-22).
  const roots: string[] = [];
  if (npmWorkspaceObject !== null) {
    const patterns = asStringArray(npmWorkspaceObject.packages).sort(comparePaths);
    roots.push(
      `package.json#workspaces (object form${patterns.length > 0 ? `: ${patterns.join(', ')}` : ''})`,
    );
  }
  if (cargoWorkspace !== null) {
    const cargoMembers = asStringArray(cargoWorkspace.members).sort(comparePaths);
    roots.push(
      `Cargo.toml#[workspace]${
        cargoMembers.length > 0 ? ` (members: ${cargoMembers.join(', ')})` : ''
      }`,
    );
  }
  if (bazelModule) roots.push('MODULE.bazel');
  if (roots.length > 0) notes.workspace_roots = roots.join(', ');

  return notes;
}

/** POSIX-separated repository-relative path, for diagnostics. */
export function relativePosix(baseDir: string, absolutePath: string): string {
  const base = baseDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const target = absolutePath.replace(/\\/g, '/');
  return target.startsWith(`${base}/`) ? target.slice(base.length + 1) : target;
}
