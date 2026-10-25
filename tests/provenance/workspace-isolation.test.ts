/**
 * IMPT-06 / T-1-25 / T-1-26 — workspace isolation, asserted rather than
 * documented.
 *
 * Four independent dependency graphs live under `vendor/`. A root Bun, Cargo or
 * uv workspace that absorbed any of them would silently change which versions a
 * build resolves, and a nested `.git` or gitlink would turn a recorded snapshot
 * into a second source of truth. This suite reads files only: running an
 * installer would itself mutate the lockfiles IMPT-06 pins, so nothing here
 * installs, builds or touches the network.
 *
 * Both halves of P3 are checked: the positive shape each tree must keep (its own
 * workspace declaration, unflattened and byte-identical to the imported blob),
 * and the negative shape the repository must never acquire (a root workspace, a
 * root Cargo/uv project, a vendored `.git`, or a `.gitmodules`).
 */

import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { listLedgerTrees } from '../../tools/provenance/ledger';
import { readManifestFile } from '../../tools/provenance/manifest';

const repoRoot = join(import.meta.dir, '..', '..');

/** Content below these directories is not repository source under test. */
const SKIP_DIRECTORIES = new Set(['node_modules', 'upstream-cache']);

export type NestedRepoScan = {
  /** Every `.git` entry (directory or worktree pointer file), POSIX-separated. */
  nestedGit: string[];
  /** Every `.gitmodules` file, POSIX-separated. */
  gitmodules: string[];
  /** Directories visited, so a vacuous walk cannot pass silently. */
  directories: number;
};

/**
 * Walk `root` once, recording `.git` entries and `.gitmodules` files. A `.git`
 * is recorded whatever its type: a directory is a nested clone, a file is a
 * gitdir pointer, and both mean the tree owns history the ledger does not.
 */
export function scanForNestedRepos(root: string): NestedRepoScan {
  const nestedGit: string[] = [];
  const gitmodules: string[] = [];
  let directories = 0;

  const visit = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.name === '.git') {
        nestedGit.push(relative);
        continue;
      }
      if (entry.name === '.gitmodules') {
        gitmodules.push(relative);
        continue;
      }
      if (!entry.isDirectory() || SKIP_DIRECTORIES.has(entry.name)) continue;
      directories += 1;
      visit(join(dir, entry.name), relative);
    }
  };

  visit(root, '');
  return { nestedGit, gitmodules, directories };
}

function readText(relativePosix: string): string {
  return readFileSync(join(repoRoot, ...relativePosix.split('/')), 'utf8');
}

function readJson<T>(relativePosix: string): T {
  return JSON.parse(readText(relativePosix)) as T;
}

/** One walk serves both negative assertions; the scan never mutates anything. */
const scan = scanForNestedRepos(repoRoot);

describe('workspace isolation: the root does not absorb vendor/', () => {
  test('the root package.json workspaces array is vendor-free', () => {
    const pkg = readJson<{ workspaces?: unknown }>('package.json');
    expect(Array.isArray(pkg.workspaces)).toBe(true);
    const workspaces = pkg.workspaces as string[];
    expect(workspaces.length).toBeGreaterThan(0);
    for (const entry of workspaces) expect(entry).not.toContain('vendor');
  });

  test('no root Cargo.toml or pyproject.toml exists', () => {
    expect(existsSync(join(repoRoot, 'Cargo.toml'))).toBe(false);
    expect(existsSync(join(repoRoot, 'pyproject.toml'))).toBe(false);
  });

  test('no root script installs or builds inside vendor/', () => {
    const pkg = readJson<{ scripts?: Record<string, string> }>('package.json');
    const scripts = Object.entries(pkg.scripts ?? {});
    expect(scripts.length).toBeGreaterThan(0);
    for (const [name, command] of scripts) {
      expect(`${name}: ${command}`).not.toMatch(/vendor[\\/]/);
    }
  });
});

describe('workspace isolation: each tree keeps its own workspace shape', () => {
  test('every vendored [workspace] Cargo.toml is byte-identical to its upstream blob', () => {
    const checked: string[] = [];
    for (const tree of listLedgerTrees(repoRoot)) {
      const manifest = readManifestFile(
        join(repoRoot, 'vendor', tree, 'provenance', 'MANIFEST.upstream.tsv'),
      );
      for (const row of manifest) {
        if (!row.path.endsWith('Cargo.toml')) continue;
        const relative = `vendor/${tree}/${row.path}`;
        const text = readText(relative);
        if (!/^\[workspace\]\s*$/m.test(text)) continue;
        expect(text).toMatch(/^\[workspace\]\s*$/m);
        expect(
          execFileSync('git', ['hash-object', '--no-filters', '--', relative], {
            cwd: repoRoot,
            encoding: 'utf8',
          }).trim(),
        ).toBe(row.oid);
        checked.push(relative);
      }
    }
    // At least one tree declares a workspace; a zero here would make the whole
    // comparison vacuous rather than passing.
    expect(checked.length).toBeGreaterThan(0);
  });

  test('hindsight keeps [tool.uv.workspace] as its first table header', () => {
    const headers = readText('vendor/hindsight/pyproject.toml')
      .split(/\r?\n/)
      .filter((line) => line.startsWith('['));
    expect(headers[0]).toBe('[tool.uv.workspace]');
  });

  test('hermes-agent keeps its [tool.uv] block', () => {
    const lines = readText('vendor/hermes-agent/pyproject.toml').split(/\r?\n/);
    expect(lines.some((line) => line.trim() === '[tool.uv]')).toBe(true);
  });

  test("oh-my-pi's workspaces is object-form, so it was not flattened", () => {
    const pkg = readJson<{ workspaces?: unknown }>('vendor/oh-my-pi/package.json');
    expect(typeof pkg.workspaces).toBe('object');
    expect(Array.isArray(pkg.workspaces)).toBe(false);
    expect(pkg.workspaces).not.toBeNull();
    expect(Object.keys(pkg.workspaces as object)).toContain('packages');
  });
});

describe('P3 negatives: no nested repository, no submodule', () => {
  test('no vendored tree carries a .git entry', () => {
    expect(scan.directories).toBeGreaterThan(0);
    const vendored = scan.nestedGit.filter(
      (path) => path === 'vendor' || path.startsWith('vendor/'),
    );
    expect(vendored).toEqual([]);
  });

  test('no .gitmodules exists anywhere in the repository', () => {
    expect(scan.gitmodules).toEqual([]);
  });
});
