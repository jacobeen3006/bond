/**
 * T-1-02 — the rebrand deny-list holds, and the test proves it can fail.
 *
 * The risk PITFALLS P-02 records is not deletion: it is a bulk
 * `s/hermes/halo/gi` leaving a notice that still says MIT but no longer
 * identifies the work. So this suite runs the replacement twice — once naive
 * (some licence byte must change, otherwise the fixture is not sensitive) and
 * once filtered through `shouldRewrite` (no licence byte may change).
 *
 * The fixture is the plan 01-02 happy tree plus an injected `NOTICE`,
 * `THIRD-PARTY-NOTICES.txt`, a source file and a `package.json` with an
 * attribution field. `REBRAND_FIXTURE_ROOT` is exported so the same assertions
 * can be pointed at `vendor/` once a real rewriter exists (DEC-05): every
 * helper takes the root as an argument rather than closing over the fixture.
 */

import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main } from '../../tools/provenance/cli';
import { listLedgerTrees, readUpstreamLedger } from '../../tools/provenance/ledger';
import {
  assertDenylistCovers,
  DenylistCoverageError,
  inspectDenylistCoverage,
  isLicensePath,
  loadDenylist,
  matchesGlob,
  shouldRewrite,
  type Denylist,
} from '../../tools/provenance/license';
import { comparePaths, hashBytes, readManifestFile } from '../../tools/provenance/manifest';

import { emitFixture } from './fixtures/make-fixture';

const repoRoot = join(import.meta.dir, '..', '..');

export const REBRAND_FIXTURE_ROOT = mkdtempSync(join(tmpdir(), 'halo-rebrand-'));

/** Every token a naive rebrand pass would replace, longest first. */
const UPSTREAM_TOKENS = ['oh-my-pi', 'hermes-agent', 'hindsight', 'gsd-omp', 'hermes', 'gsd'];
const TOKEN_PATTERN = new RegExp(
  UPSTREAM_TOKENS.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'gi',
);

const INJECTED: Record<string, string> = {
  NOTICE: [
    'NOTICE',
    '',
    'Portions copyright (c) 2026 the hermes-agent authors.',
    'This product includes software developed by the oh-my-pi project.',
    '',
  ].join('\n'),
  'THIRD-PARTY-NOTICES.txt': [
    'THIRD-PARTY NOTICES',
    '',
    'oh-my-pi — MIT — copyright (c) 2026 oh-my-pi contributors',
    'hindsight — MIT — copyright (c) 2026 hindsight contributors',
    '',
  ].join('\n'),
  'src/index.ts': "export const backend = 'hermes-agent';\nexport const memory = 'hindsight';\n",
  'package.json': `${JSON.stringify(
    { name: 'hermes-agent', version: '1.0.0', author: 'hermes-agent authors' },
    null,
    2,
  )}\n`,
  'pyproject.toml': '[project]\nname = "gsd-omp"\nauthors = [{ name = "gsd-omp maintainers" }]\n',
};

afterAll(() => {
  rmSync(REBRAND_FIXTURE_ROOT, { recursive: true, force: true });
});

function buildFixture(): void {
  emitFixture(REBRAND_FIXTURE_ROOT, 'happy');
  for (const [relPath, text] of Object.entries(INJECTED)) {
    const absolute = join(REBRAND_FIXTURE_ROOT, ...relPath.split('/'));
    mkdirSync(join(absolute, '..'), { recursive: true });
    writeFileSync(absolute, text, 'utf8');
    // A rewrite pass must never need a second read: every injected file is new.
    if (isLicensePath(relPath)) expect(readFileSync(absolute, 'utf8')).toContain('copyright');
  }
}

/** Every regular file, POSIX-relative, `.git` excluded. */
function listFiles(root: string, prefix = ''): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const relPath = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...listFiles(root, relPath));
    else if (entry.isFile()) files.push(relPath);
  }
  return files.sort(comparePaths);
}

function read(root: string, relPath: string): string {
  return readFileSync(join(root, ...relPath.split('/')), 'utf8');
}

function write(root: string, relPath: string, text: string): void {
  writeFileSync(join(root, ...relPath.split('/')), text, 'utf8');
}

function licenceDigests(root: string, files: readonly string[]): Map<string, string> {
  const digests = new Map<string, string>();
  for (const relPath of files) {
    if (!isLicensePath(relPath)) continue;
    digests.set(relPath, hashBytes(readFileSync(join(root, ...relPath.split('/')))));
  }
  return digests;
}

function replaceTokens(text: string): string {
  return text.replace(TOKEN_PATTERN, 'halo');
}

/** The naive pass: every file, every occurrence, no questions asked. */
function rewriteUnfiltered(root: string): string[] {
  const touched: string[] = [];
  for (const relPath of listFiles(root)) {
    const original = read(root, relPath);
    const next = replaceTokens(original);
    if (next === original) continue;
    write(root, relPath, next);
    touched.push(relPath);
  }
  return touched;
}

/**
 * The pass the contract demands: skip every denied path, and skip denied
 * manifest fields even inside a file that is itself rewritable.
 */
function rewriteFiltered(root: string): string[] {
  const touched: string[] = [];
  for (const relPath of listFiles(root)) {
    if (!shouldRewrite(relPath)) continue;
    const original = read(root, relPath);
    let next = original;
    if (relPath.endsWith('.json')) {
      const document = JSON.parse(original) as Record<string, unknown>;
      for (const [key, value] of Object.entries(document)) {
        if (typeof value !== 'string') continue;
        if (!shouldRewrite(relPath, `${relPath}#${key}`)) continue;
        document[key] = replaceTokens(value);
      }
      next = `${JSON.stringify(document, null, 2)}\n`;
    } else {
      next = replaceTokens(original);
    }
    if (next === original) continue;
    write(root, relPath, next);
    touched.push(relPath);
  }
  return touched;
}

describe('the deny-list contract', () => {
  test('rebrand-denylist.json satisfies provenance/schema/denylist.schema.json', () => {
    const schema = JSON.parse(
      readFileSync(join(repoRoot, 'provenance', 'schema', 'denylist.schema.json'), 'utf8'),
    ) as {
      additionalProperties: boolean;
      required: string[];
      properties: {
        schema: { const: string };
        globs: { minItems: number; items: { required: string[] } };
        paths_never_written: { items: { required: string[] } };
      };
    };
    const document = JSON.parse(
      readFileSync(join(repoRoot, 'provenance', 'rebrand-denylist.json'), 'utf8'),
    ) as Record<string, unknown> & {
      schema: string;
      version: number;
      globs: Record<string, unknown>[];
      fields: string[];
      field_pointers: string[];
      paths_never_written: Record<string, unknown>[];
    };

    expect(schema.additionalProperties).toBe(false);
    for (const key of schema.required) expect(document).toHaveProperty(key);
    for (const key of Object.keys(document)) expect(Object.keys(schema.properties)).toContain(key);
    expect(document.schema).toBe(schema.properties.schema.const);
    expect(document.version).toBeGreaterThanOrEqual(1);

    expect(Array.isArray(document.globs)).toBe(true);
    expect(document.globs.length).toBeGreaterThanOrEqual(schema.properties.globs.minItems);
    for (const glob of document.globs) {
      for (const key of schema.properties.globs.items.required) {
        expect(typeof glob[key]).toBe('string');
        expect((glob[key] as string).length).toBeGreaterThan(0);
      }
      if (glob.expect_match !== undefined) expect(typeof glob.expect_match).toBe('boolean');
    }
    for (const entry of document.paths_never_written) {
      for (const key of schema.properties.paths_never_written.items.required) {
        expect(typeof entry[key]).toBe('string');
      }
    }
    for (const field of document.fields) expect(field).toMatch(/^[a-z][a-z0-9_.-]*$/);
    for (const pointer of document.field_pointers) expect(pointer).toMatch(/^[^#]+#[A-Za-z0-9_.-]+$/);
  });

  test('both third-party spellings are present and deny the real hyphenated notice', () => {
    const globs = loadDenylist().globs.map((entry) => entry.glob);
    expect(globs).toContain('**/THIRD_PARTY*');
    expect(globs).toContain('**/THIRD-PARTY*');
    // `-` and `_` are equivalent, so either spelling guards the real file.
    expect(matchesGlob('**/THIRD_PARTY*', 'vendor/oh-my-pi/THIRD-PARTY-NOTICES.txt')).toBe(true);
    expect(matchesGlob('**/THIRD-PARTY*', 'vendor/oh-my-pi/THIRD_PARTY_NOTICES.txt')).toBe(true);
  });

  test('shouldRewrite refuses licences, notices and the ledger, and allows source', () => {
    expect(shouldRewrite('vendor/hermes-agent/LICENSE')).toBe(false);
    expect(shouldRewrite('vendor/hindsight/COPYRIGHT')).toBe(false);
    expect(shouldRewrite('vendor/gsd-omp/THIRD_PARTY_NOTICES.txt')).toBe(false);
    expect(shouldRewrite('vendor/oh-my-pi/THIRD-PARTY-NOTICES.txt')).toBe(false);
    expect(shouldRewrite('vendor/hermes-agent/provenance/UPSTREAM.json')).toBe(false);
    expect(shouldRewrite('vendor/oh-my-pi/docs/rpc.md')).toBe(true);
    expect(shouldRewrite('vendor/hermes-agent/src/main.py')).toBe(true);
  });

  test('manifest fields carrying attribution are denied regardless of file path', () => {
    expect(shouldRewrite('package.json', 'package.json#author')).toBe(false);
    expect(shouldRewrite('package.json', 'package.json#contributors')).toBe(false);
    expect(shouldRewrite('Cargo.toml', 'Cargo.toml#package.authors')).toBe(false);
    expect(shouldRewrite('pyproject.toml', 'pyproject.toml#tool.poetry.authors')).toBe(false);
    expect(shouldRewrite('nested/package.json', 'nested/package.json#author')).toBe(false);
    expect(shouldRewrite('package.json', 'package.json#scripts.test')).toBe(true);
  });
});

describe('every imported tree is covered', () => {
  const trees = listLedgerTrees(repoRoot);

  test('the real hyphenated notice is manifest-listed, pinned and denied', () => {
    const manifest = readManifestFile(
      join(repoRoot, 'vendor', 'oh-my-pi', 'provenance', 'MANIFEST.upstream.tsv'),
    );
    expect(manifest.map((row) => row.path)).toContain('THIRD-PARTY-NOTICES.txt');
    const pinned = readUpstreamLedger(repoRoot, 'oh-my-pi').license.files.map((file) => file.path);
    expect(pinned).toContain('THIRD-PARTY-NOTICES.txt');
    expect(shouldRewrite('vendor/oh-my-pi/THIRD-PARTY-NOTICES.txt')).toBe(false);
  });

  test('every licence-ish path in every manifest is denied, and a source file is not', () => {
    const paths: string[] = [];
    for (const tree of trees) {
      for (const row of readManifestFile(
        join(repoRoot, 'vendor', tree, 'provenance', 'MANIFEST.upstream.tsv'),
      )) {
        paths.push(`vendor/${tree}/${row.path}`);
      }
    }
    expect(paths.length).toBeGreaterThan(0);

    const licencePaths = paths.filter((path) => isLicensePath(path));
    expect(licencePaths.length).toBeGreaterThan(0);
    for (const path of licencePaths) expect(shouldRewrite(path)).toBe(false);

    const sample = paths.find((path) => path.endsWith('/README.md')) as string;
    expect(shouldRewrite(sample)).toBe(true);
  });

  test('inspectDenylistCoverage finds no dead glob and no blind spot', () => {
    const paths: string[] = [];
    for (const tree of trees) {
      for (const row of readManifestFile(
        join(repoRoot, 'vendor', tree, 'provenance', 'MANIFEST.upstream.tsv'),
      )) {
        paths.push(`vendor/${tree}/${row.path}`);
      }
    }
    const report = inspectDenylistCoverage(paths);
    expect(report.globs).toBe(6);
    expect(report.licencePaths).toBeGreaterThan(0);
    expect(report.unmatched).toEqual([]);
    expect(report.uncovered).toEqual([]);
    // Declared-defensive, not silently ignored: they match nothing today.
    expect(report.defensive.sort()).toEqual(['**/COPYING*', '**/COPYRIGHT*']);
    expect(assertDenylistCovers(paths).licencePaths).toBe(report.licencePaths);
  });

  test('a dead glob and a dropped glob are both reported, so the gate can fail', () => {
    const real = loadDenylist();
    const dead: Denylist = {
      ...real,
      globs: [
        ...real.globs,
        { glob: '**/DEADLOCK*', reason: 'guard that matches nothing', expect_match: true },
      ],
    };
    const paths = [
      'vendor/hermes-agent/LICENSE',
      'vendor/hermes-agent/NOTICE',
      'vendor/oh-my-pi/THIRD-PARTY-NOTICES.txt',
    ];
    expect(inspectDenylistCoverage(paths, dead).unmatched).toEqual(['**/DEADLOCK*']);

    // Dropping the NOTICE globs leaves the injected NOTICE uncovered.
    const blind: Denylist = {
      ...real,
      globs: real.globs.filter((entry) => !matchesGlob(entry.glob, 'vendor/x/NOTICE')),
    };
    const report = inspectDenylistCoverage(['vendor/x/LICENSE', 'vendor/x/NOTICE'], blind);
    expect(report.uncovered).toEqual(['vendor/x/NOTICE']);

    let thrown: unknown;
    try {
      assertDenylistCovers(['vendor/x/NOTICE'], blind);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(DenylistCoverageError);
    expect((thrown as DenylistCoverageError).code).toBe(1);
    expect((thrown as DenylistCoverageError).findings).toContain('UNCOVERED vendor/x/NOTICE');
  });

  test('cli.ts denylist-check prints the fixed contract and exits 0', async () => {
    const chunks: string[] = [];
    const spy = spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stdout.write);
    let code: number;
    try {
      code = await main(['denylist-check']);
    } finally {
      spy.mockRestore();
    }
    const output = chunks.join('');
    expect(code).toBe(0);
    expect(output).toMatch(/^DENYLIST OK globs=6 licence_paths=[1-9][0-9]*$/m);
    expect(output).not.toContain('unmatched glob:');
    expect(output).not.toContain('UNCOVERED ');
  });
});

describe('the sensitivity of the fixture', () => {
  beforeAll(() => {
    buildFixture();
  });

  test('an unfiltered replacement changes licence bytes, so tampering is detectable', () => {
    const before = licenceDigests(REBRAND_FIXTURE_ROOT, listFiles(REBRAND_FIXTURE_ROOT));
    expect(before.size).toBeGreaterThan(1);

    const touched = rewriteUnfiltered(REBRAND_FIXTURE_ROOT);
    expect(touched).toContain('NOTICE');

    const after = licenceDigests(REBRAND_FIXTURE_ROOT, listFiles(REBRAND_FIXTURE_ROOT));
    const changed = [...before.entries()].filter(([path, digest]) => after.get(path) !== digest);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.map(([path]) => path)).toContain('NOTICE');
    expect(read(REBRAND_FIXTURE_ROOT, 'THIRD-PARTY-NOTICES.txt')).not.toContain('oh-my-pi');
  });

  test('the filtered replacement leaves every licence byte unchanged', () => {
    buildFixture();
    const before = licenceDigests(REBRAND_FIXTURE_ROOT, listFiles(REBRAND_FIXTURE_ROOT));
    const baseline = new Map<string, string>();
    for (const [path, digest] of before) baseline.set(path, digest);

    const touched = rewriteFiltered(REBRAND_FIXTURE_ROOT);
    // The filter must not be a blanket refusal: source files do get rebranded.
    expect(touched).toContain('src/index.ts');
    expect(touched).not.toContain('NOTICE');
    expect(touched).not.toContain('THIRD-PARTY-NOTICES.txt');
    expect(read(REBRAND_FIXTURE_ROOT, 'src/index.ts')).toContain('halo');

    const after = licenceDigests(REBRAND_FIXTURE_ROOT, listFiles(REBRAND_FIXTURE_ROOT));
    expect([...after.keys()].sort(comparePaths)).toEqual([...baseline.keys()].sort(comparePaths));
    for (const [path, digest] of baseline) expect(after.get(path)).toBe(digest);
  });

  test('the filtered replacement keeps attribution fields and rebrands the rest', () => {
    buildFixture();
    const before = read(REBRAND_FIXTURE_ROOT, 'package.json');
    rewriteFiltered(REBRAND_FIXTURE_ROOT);

    const document = JSON.parse(read(REBRAND_FIXTURE_ROOT, 'package.json')) as Record<string, string>;
    expect(JSON.parse(before).author).toBe('hermes-agent authors');
    expect(document.author).toBe('hermes-agent authors');
    expect(document.name).toBe('halo');
  });
});
