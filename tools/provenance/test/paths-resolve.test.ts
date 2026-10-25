/**
 * IMPT-05 — path resolution from the ledger, with the three edges the plan
 * names: adjacency (which rule wins), empty (identity vs not found) and
 * ordering (watch hits).
 *
 * The tree under test is synthetic so overlapping rules can be constructed
 * deliberately; the last case checks the real `oh-my-pi` ledger.
 */

import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ledgerPaths } from '../ledger';
import { renderManifest } from '../manifest';
import {
  lookup,
  mainWhere,
  resolveUpstreamPath,
  type PathsDocument,
  type QueryTree,
  type WatchEntry,
} from '../where';

const repoRoot = resolve(import.meta.dir, '..', '..', '..');
const root = mkdtempSync(join(tmpdir(), 'halo-where-'));
const base = join(root, 'base');
const TREE = 'synthetic';

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const MANIFEST_PATHS = [
  'README.legacy',
  'a/b/c.ts',
  'docs/legacy/gone.md',
  'docs/legacy/other.md',
  'docs/legacy/rpc.md',
  'docs/private/secret.ts',
  'docs/rpc.md',
  'root-file.txt',
];

const PATHS_DOCUMENT: PathsDocument = {
  schema: 'halo/paths/v1',
  subtree: TREE,
  resolution:
    'exceptions first, then longest-prefix-first, then file rules, then identity',
  rules: [
    { kind: 'prefix', from: 'docs/', to: 'docs/', reason: 'verbatim subtree' },
    { kind: 'prefix', from: 'docs/legacy/', to: 'docs/legacy/', reason: 'verbatim subtree' },
    {
      kind: 'file',
      from: 'docs/rpc.md',
      to: 'moved-rpc.md',
      reason: 'file rule that must lose to the prefix rule',
    },
    { kind: 'file', from: 'README.legacy', to: 'README.md', reason: 'verbatim file' },
  ],
  exceptions: [
    {
      from: 'docs/legacy/rpc.md',
      to: 'rpc-legacy.md',
      reason: 'renamed on import',
    },
    {
      from: 'docs/legacy/gone.md',
      to: null,
      reason: 'deliberately dropped',
    },
  ],
  added: [],
};

const WATCHLIST: WatchEntry[] = [
  {
    id: 'WL-Z-ROOT',
    subtree: TREE,
    upstream_paths: ['a/'],
    local_paths: ['vendor/synthetic/a/'],
    symbols: [],
  },
  {
    id: 'WL-A-DIR',
    subtree: TREE,
    upstream_paths: ['a/b/'],
    local_paths: ['vendor/synthetic/a/b/'],
    symbols: [],
  },
  {
    id: 'WL-M-DIR',
    subtree: TREE,
    upstream_paths: ['a/b/'],
    local_paths: ['vendor/synthetic/a/b/'],
    symbols: [],
  },
  {
    id: 'WL-Q-FILE',
    subtree: TREE,
    upstream_paths: ['a/b/c.ts'],
    local_paths: ['vendor/synthetic/a/b/c.ts'],
    symbols: [],
  },
];

function writeJson(file: string, document: unknown): void {
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
}

function buildFixture(): void {
  const ledger = ledgerPaths(base, TREE);
  mkdirSync(ledger.dir, { recursive: true });
  writeJson(ledger.paths, PATHS_DOCUMENT);
  writeJson(ledger.excludes, {
    schema: 'halo/excludes/v1',
    subtree: TREE,
    rules: [
      {
        glob: 'docs/private/**',
        reason: 'nothing HALO ships uses these docs',
        approved_by: 'plan 01-07',
      },
    ],
  });
  writeJson(ledger.renames, {
    schema: 'halo/renames/v1',
    subtree: TREE,
    generated_from: 'brand.json',
    phase_populated: 2,
    rules: [],
  });
  writeFileSync(
    ledger.manifestUpstream,
    renderManifest(
      MANIFEST_PATHS.map((path) => ({
        mode: '100644',
        oid: '-',
        sha256: 'a'.repeat(64),
        path,
      })),
    ),
    'utf8',
  );
}

const queryTree: QueryTree = {
  name: TREE,
  paths: PATHS_DOCUMENT,
  excludes: {
    rules: [
      {
        glob: 'docs/private/**',
        reason: 'nothing HALO ships uses these docs',
        approved_by: 'plan 01-07',
      },
    ],
  },
  renames: { rules: [] },
  watchlist: WATCHLIST,
  upstreamPaths: MANIFEST_PATHS,
};

function captureStdout(operation: () => number): { code: number; output: string } {
  const chunks: string[] = [];
  const spy = spyOn(process.stdout, 'write').mockImplementation(((
    chunk: string | Uint8Array,
  ): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stdout.write);
  try {
    return { code: operation(), output: chunks.join('') };
  } finally {
    spy.mockRestore();
  }
}

buildFixture();

describe('adjacency edge: which rule decides', () => {
  test('an exact exception beats the longest prefix rule and names itself', () => {
    const resolved = resolveUpstreamPath('docs/legacy/rpc.md', queryTree);
    expect(resolved.rule).toBe('exception');
    expect(resolved.local).toBe('rpc-legacy.md');
    expect(resolved.reason).toBeNull();

    // The prefix rule would have produced this, which the exception overrides.
    expect(resolveUpstreamPath('docs/legacy/other.md', queryTree)).toEqual({
      upstream: 'docs/legacy/other.md',
      local: 'docs/legacy/other.md',
      rule: 'prefix',
      reason: null,
    });
  });

  test('a prefix rule beats an exact file rule — the contract is not "files win"', () => {
    const resolved = resolveUpstreamPath('docs/rpc.md', queryTree);
    expect(resolved.rule).toBe('prefix');
    expect(resolved.local).toBe('docs/rpc.md');

    // The file rule decides only when no prefix covers the path.
    expect(resolveUpstreamPath('README.legacy', queryTree)).toEqual({
      upstream: 'README.legacy',
      local: 'README.md',
      rule: 'file',
      reason: null,
    });
  });

  test('an exception with a null target is absent, never mapped', () => {
    const resolved = resolveUpstreamPath('docs/legacy/gone.md', queryTree);
    expect(resolved.rule).toBe('exception');
    expect(resolved.local).toBeNull();
    expect(resolved.reason).toBe('deliberately absent');
  });

  test('an excluded path is absent with the excluded reason', () => {
    const resolved = resolveUpstreamPath('docs/private/secret.ts', queryTree);
    expect(resolved.rule).toBe('excluded');
    expect(resolved.local).toBeNull();
    expect(resolved.reason).toBe('excluded');
  });

  test('a known path with no rule resolves to identity', () => {
    const resolved = resolveUpstreamPath('root-file.txt', queryTree);
    expect(resolved.rule).toBe('identity');
    expect(resolved.local).toBe('root-file.txt');
  });

  test('the CLI prints exactly one decision line for an exception match', () => {
    const { code, output } = captureStdout(() =>
      mainWhere(['docs/legacy/rpc.md', '--tree', TREE], base),
    );
    expect(code).toBe(0);
    const pathLines = output.split('\n').filter((line) => line.startsWith('PATH '));
    expect(pathLines).toHaveLength(1);
    expect(pathLines[0]).toContain('rule=exception');
    expect(pathLines[0]).toContain('vendor/synthetic/rpc-legacy.md');
    expect(output).not.toContain('-> docs/legacy/rpc.md ');
  });

  test('the CLI prints ABSENT and no local path for a null exception', () => {
    const { code, output } = captureStdout(() =>
      mainWhere(['docs/legacy/gone.md', '--tree', TREE], base),
    );
    expect(code).toBe(0);
    expect(output).toContain('-> ABSENT');
    expect(output).toContain('rule=exception');
    expect(output).not.toContain('vendor/synthetic/docs/legacy/gone.md');
    expect(output).not.toContain('EXISTS');
  });
});

describe('empty edge: identity vs not found', () => {
  test('a manifest path with no rule and no watch exits 0 with watch=none', () => {
    const { code, output } = captureStdout(() =>
      mainWhere(['root-file.txt', '--tree', TREE], base),
    );
    expect(code).toBe(0);
    expect(output).toContain('rule=identity');
    expect(output).toContain('watch=none');
  });

  test('a path present nowhere in the ledger exits 3 with not found', () => {
    const { code, output } = captureStdout(() =>
      mainWhere(['nope/missing.ts', '--tree', TREE], base),
    );
    expect(code).toBe(3);
    expect(output).toContain('not found nope/missing.ts');
    expect(output).not.toContain('PATH ');
  });

  test('an empty query is refused as malformed input', () => {
    expect(() => resolveUpstreamPath('   ', queryTree)).toThrow(/empty query/);
  });
});

describe('ordering edge: watch hits', () => {
  test('longest matched upstream path first, then byte-ascending watch id', () => {
    const result = lookup('a/b/c.ts', [queryTree]);
    expect(result.paths).toHaveLength(1);
    expect(result.paths[0].watch).toEqual([
      'WL-Q-FILE', // 8 characters matched, `a/b/c.ts`
      'WL-A-DIR', // 4 characters matched, `a/b/`, id byte-order tiebreak
      'WL-M-DIR',
      'WL-Z-ROOT', // 2 characters matched, `a/`
    ]);
  });

  test('a reversed comparator would fail this array', () => {
    const ids = lookup('a/b/c.ts', [queryTree]).paths[0].watch;
    expect(ids).not.toEqual([...ids].reverse());
  });
});

describe('determinism', () => {
  test('identical input yields byte-identical stdout', () => {
    const first = captureStdout(() => mainWhere(['docs/rpc.md', '--tree', TREE], base));
    const second = captureStdout(() => mainWhere(['docs/rpc.md', '--tree', TREE], base));
    expect(first.code).toBe(second.code);
    expect(first.output).toBe(second.output);
  });

  test('the renderer is input-deterministic without a base directory', () => {
    const first = lookup('docs/rpc.md', [queryTree]);
    const second = lookup('docs/rpc.md', [queryTree]);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe('the real ledger', () => {
  test('docs/rpc.md resolves to an existing vendored file', () => {
    const { code, output } = captureStdout(() =>
      mainWhere(['docs/rpc.md', '--tree', 'oh-my-pi'], repoRoot),
    );
    expect(code).toBe(0);
    expect(output).toContain('PATH docs/rpc.md -> vendor/oh-my-pi/docs/rpc.md');
    expect(output).toContain('rule=prefix');
    expect(output).toContain('watch=WL-OMP-RPC-WIRE');
    expect(output).toContain('EXISTS vendor/oh-my-pi/docs/rpc.md yes');
  });

  test('the answer comes from the ledger, never from walking vendor/', () => {
    const source = readFileSync(join(repoRoot, 'tools', 'provenance', 'where.ts'), 'utf8');
    expect(source).not.toContain('readdirSync');
    expect(source).toContain('ledgerPaths');
    expect(source).toContain('readManifestFile');
  });
});
