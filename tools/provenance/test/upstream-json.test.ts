import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  comparePaths,
  hashFile,
  manifestBodyDigest,
  readManifest,
  type ManifestRow,
} from '../manifest';

const repoRoot = join(import.meta.dir, '..', '..', '..');

type SchemaNode = {
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  pattern?: string;
  minLength?: number;
  minimum?: number;
  minItems?: number;
  required?: string[];
  properties?: Record<string, SchemaNode>;
  additionalProperties?: boolean | SchemaNode;
  items?: SchemaNode;
};

type LedgerDocument = Record<string, unknown>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function typeMatches(type: string, value: unknown): boolean {
  switch (type) {
    case 'object':
      return isObject(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return false;
  }
}

/**
 * The schema check is deliberately local: the tool has no dependencies, and
 * the schemas only use `type`/`required`/`properties`/`items`/`pattern`/
 * `const`/`enum`/`minimum`/`minLength`/`minItems`/`additionalProperties`.
 */
function validateNode(schema: SchemaNode, value: unknown, path: string): string[] {
  const errors: string[] = [];

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeMatches(type, value))) {
      errors.push(`${path}: expected type ${types.join('|')}`);
      return errors;
    }
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push(`${path}: value not in enum ${JSON.stringify(schema.enum)}`);
  }
  if (typeof value === 'string') {
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: does not match ${schema.pattern}`);
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: shorter than ${schema.minLength}`);
    }
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${path}: below minimum ${schema.minimum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: fewer than ${schema.minItems} items`);
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) => {
        errors.push(...validateNode(schema.items as SchemaNode, item, `${path}[${index}]`));
      });
    }
  }
  if (isObject(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${path}.${key}: missing required field`);
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (key in value) errors.push(...validateNode(child, value[key], `${path}.${key}`));
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in (schema.properties ?? {}))) errors.push(`${path}: unexpected field ${key}`);
      }
    } else if (isObject(schema.additionalProperties)) {
      for (const key of Object.keys(value)) {
        if (key in (schema.properties ?? {})) continue;
        errors.push(...validateNode(schema.additionalProperties, value[key], `${path}.${key}`));
      }
    }
  }
  return errors;
}

function loadSchema(name: string): SchemaNode {
  return JSON.parse(
    readFileSync(join(repoRoot, 'provenance', 'schema', name), 'utf8'),
  ) as SchemaNode;
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

function ledgerTrees(): string[] {
  const vendorDir = join(repoRoot, 'vendor');
  if (!existsSync(vendorDir)) return [];
  return readdirSync(vendorDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((tree) => existsSync(join(vendorDir, tree, 'provenance', 'UPSTREAM.json')))
    .sort(comparePaths);
}

function manifestRows(tree: string, fileName: string): ManifestRow[] {
  return readManifest(readFileSync(join(repoRoot, 'vendor', tree, 'provenance', fileName), 'utf8'));
}

const upstreamSchema = loadSchema('upstream.schema.json');
const pathsSchema = loadSchema('paths.schema.json');
const renamesSchema = loadSchema('renames.schema.json');
const excludesSchema = loadSchema('excludes.schema.json');
const watchlistSchema = loadSchema('watchlist.schema.json');

const trees = ledgerTrees();
// The suite stays green between plans by skipping trees with no ledger, but
// names what it covered so a silent zero-tree run is visible.
console.log(`validating ledgers for: ${trees.join(', ') || '(none)'}`);

for (const tree of trees) {
  const ledgerDir = join(repoRoot, 'vendor', tree, 'provenance');
  const ledger = readJson<LedgerDocument>(join(ledgerDir, 'UPSTREAM.json'));

  describe(`${tree} ledger`, () => {
    test('UPSTREAM.json validates against the schema', () => {
      expect(validateNode(upstreamSchema, ledger, '$')).toEqual([]);
    });

    test('subtree names the directory it is vendored under', () => {
      expect(ledger.subtree).toBe(tree);
      expect(ledger.local_root).toBe(`vendor/${tree}`);
    });

    test('a ledger missing license.files names the field in the error', () => {
      const broken = structuredClone(ledger) as Record<string, Record<string, unknown>>;
      delete broken.license.files;
      const errors = validateNode(upstreamSchema, broken, '$');
      expect(errors.some((error) => error.includes('license.files'))).toBe(true);
    });

    test('commit is 40 lowercase hex and resolves in the cache when present', () => {
      const commit = ledger.commit as string;
      expect(commit).toMatch(/^[0-9a-f]{40}$/);
      const cache = join(repoRoot, 'upstream-cache', `${tree}.git`);
      if (!existsSync(cache)) return;
      expect(() =>
        execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: cache }),
      ).not.toThrow();
    });

    test('repo is an HTTPS remote', () => {
      expect(ledger.repo).toMatch(/^https:\/\/[^/]+\//);
    });

    test('both manifest digests recompute over the files they name', () => {
      const manifests = ledger.manifests as Record<string, string>;
      expect(manifests.upstream).toBe('provenance/MANIFEST.upstream.tsv');
      expect(manifests.vendored).toBe('provenance/MANIFEST.vendored.tsv');
      expect(
        manifestBodyDigest(readFileSync(join(ledgerDir, 'MANIFEST.upstream.tsv'), 'utf8')),
      ).toBe(manifests.upstream_sha256);
      expect(
        manifestBodyDigest(readFileSync(join(ledgerDir, 'MANIFEST.vendored.tsv'), 'utf8')),
      ).toBe(manifests.vendored_sha256);
    });

    test('excludes_sha256 and renames_sha256 are the digests of the documents on disk', () => {
      expect(hashFile(join(ledgerDir, 'EXCLUDES.json'))).toBe(ledger.excludes_sha256 as string);
      expect(hashFile(join(ledgerDir, 'RENAMES.json'))).toBe(ledger.renames_sha256 as string);
    });

    test('counts.files equals the manifest line count', () => {
      const counts = ledger.counts as Record<string, number>;
      expect(counts.files).toBe(manifestRows(tree, 'MANIFEST.upstream.tsv').length);
      expect(counts.files).toBe(manifestRows(tree, 'MANIFEST.vendored.tsv').length);
      expect(counts.files).toBeGreaterThan(0);
      expect(counts.bytes).toBeGreaterThan(0);
    });

    test('every license file digest is the raw SHA-256 of the vendored bytes', () => {
      const license = ledger.license as {
        files: { path: string; blob: string; sha256: string }[];
      };
      expect(license.files.length).toBeGreaterThan(0);
      for (const file of license.files) {
        expect(hashFile(join(repoRoot, 'vendor', tree, ...file.path.split('/')))).toBe(file.sha256);
        expect(file.blob).toMatch(/^[0-9a-f]{40}$/);
      }
    });

    test('import.date and commit_committed_at are independent fields', () => {
      const imported = ledger.import as Record<string, string>;
      expect(imported.date).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
      expect(typeof ledger.commit_committed_at).toBe('string');
      expect(ledger.commit_committed_at).not.toBe(imported.date);

      const equalDates = structuredClone(ledger) as LedgerDocument;
      equalDates.commit_committed_at = imported.date;
      expect(validateNode(upstreamSchema, equalDates, '$')).toEqual([]);
    });

    test('the staging attributes are recorded as a path plus the exact line', () => {
      const imported = ledger.import as Record<string, string>;
      expect(imported.staging_attributes).toBe('.git/info/attributes');
      expect(imported.staging_attributes_value).toBe(
        '* -text -filter -ident -working-tree-encoding',
      );
    });

    test('notes, when present, are non-empty strings', () => {
      if (ledger.notes === undefined) return;
      expect(isObject(ledger.notes)).toBe(true);
      for (const value of Object.values(ledger.notes as Record<string, unknown>)) {
        expect(typeof value).toBe('string');
        expect((value as string).length).toBeGreaterThan(0);
      }
    });

    test('PATHS.json validates, names provenance/ as added, and keeps exceptions empty', () => {
      const paths = readJson<LedgerDocument>(join(ledgerDir, 'PATHS.json'));
      expect(validateNode(pathsSchema, paths, '$')).toEqual([]);
      expect(paths.subtree).toBe(tree);
      const added = (paths.added as { to: string }[]).map((rule) => rule.to);
      expect(added).toContain('provenance/');
      expect(paths.exceptions).toEqual([]);
    });

    test('RENAMES.json and EXCLUDES.json validate against their schemas', () => {
      const renames = readJson<LedgerDocument>(join(ledgerDir, 'RENAMES.json'));
      const excludes = readJson<LedgerDocument>(join(ledgerDir, 'EXCLUDES.json'));
      expect(validateNode(renamesSchema, renames, '$')).toEqual([]);
      expect(validateNode(excludesSchema, excludes, '$')).toEqual([]);
      expect(renames.generated_from).toBe('brand.json');
      expect(renames.subtree).toBe(tree);
      expect(excludes.subtree).toBe(tree);
      expect(Array.isArray(renames.rules)).toBe(true);
      expect(Array.isArray(excludes.rules)).toBe(true);
    });

    test('patches/series exists and holds only comments', () => {
      const seriesFile = join(ledgerDir, 'patches', 'series');
      expect(existsSync(seriesFile)).toBe(true);
      for (const line of readFileSync(seriesFile, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        expect(trimmed.startsWith('#')).toBe(true);
      }
    });

    test('neither manifest carries a provenance row', () => {
      for (const fileName of ['MANIFEST.upstream.tsv', 'MANIFEST.vendored.tsv']) {
        for (const row of manifestRows(tree, fileName)) {
          expect(row.path.startsWith('provenance/')).toBe(false);
        }
      }
    });
  });
}

describe('ledger schemas reject incomplete documents', () => {
  test('excludes.schema.json requires reason and approved_by on every rule', () => {
    const missingReason = {
      schema: 'halo/excludes/v1',
      subtree: 'example',
      rules: [{ glob: 'docs/**', approved_by: '01-03' }],
    };
    const errors = validateNode(excludesSchema, missingReason, '$');
    expect(errors.some((error) => error.includes('rules[0].reason'))).toBe(true);

    const complete = {
      schema: 'halo/excludes/v1',
      subtree: 'example',
      rules: [{ glob: 'docs/**', reason: 'windows-hostile', approved_by: '01-03' }],
    };
    expect(validateNode(excludesSchema, complete, '$')).toEqual([]);
  });

  test('paths.schema.json accepts a null exception target and rejects a missing reason', () => {
    const withNullTarget = {
      schema: 'halo/paths/v1',
      subtree: 'example',
      resolution: 'exceptions first',
      rules: [],
      exceptions: [{ from: 'old/', to: null, reason: 'deliberately absent' }],
      added: [{ to: 'provenance/', reason: 'HALO provenance record (not upstream)' }],
    };
    expect(validateNode(pathsSchema, withNullTarget, '$')).toEqual([]);

    const broken = structuredClone(withNullTarget) as {
      exceptions: Record<string, unknown>[];
    };
    delete broken.exceptions[0].reason;
    expect(
      validateNode(pathsSchema, broken, '$').some((error) =>
        error.includes('exceptions[0].reason'),
      ),
    ).toBe(true);
  });

  test('renames.schema.json enforces the rule id shape and kind enum', () => {
    const document = {
      schema: 'halo/renames/v1',
      subtree: 'example',
      generated_from: 'brand.json',
      phase_populated: 2,
      rules: [
        {
          id: 'R-ENV-0001',
          kind: 'env',
          from: 'HERMES_HOME',
          to: 'HALO_HOME',
          scope: 'agent/**',
          applied_by: 'phase-02',
        },
      ],
    };
    expect(validateNode(renamesSchema, document, '$')).toEqual([]);

    const badId = structuredClone(document);
    badId.rules[0].id = 'R-ENV-1';
    expect(
      validateNode(renamesSchema, badId, '$').some((error) => error.includes('rules[0].id')),
    ).toBe(true);
  });

  test('watchlist.schema.json requires all nine entry fields', () => {
    const entry = {
      id: 'WL-EXAMPLE-SURFACE',
      subtree: 'example',
      upstream_paths: ['src/extension.cjs'],
      local_paths: ['vendor/example/src/extension.cjs'],
      symbols: ['ExtensionAPI'],
      why: 'example',
      contract_tests: ['tests/provenance/cve-drill.test.ts'],
      advisory_sources: ['osv-commit'],
      last_checked: '2026-10-25',
    };
    expect(
      validateNode(watchlistSchema, { schema: 'halo/watchlist/v1', entries: [entry] }, '$'),
    ).toEqual([]);

    const shortened = structuredClone(entry) as Record<string, unknown>;
    delete shortened.last_checked;
    expect(
      validateNode(
        watchlistSchema,
        { schema: 'halo/watchlist/v1', entries: [shortened] },
        '$',
      ).some((error) => error.includes('entries[0].last_checked')),
    ).toBe(true);
  });
});

describe('provenance/watchlist.json', () => {
  const watchlist = readJson<LedgerDocument>(join(repoRoot, 'provenance', 'watchlist.json'));
  const entries = watchlist.entries as Record<string, unknown>[];

  test('validates against watchlist.schema.json', () => {
    expect(validateNode(watchlistSchema, watchlist, '$')).toEqual([]);
  });

  test('every imported tree has an entry', () => {
    for (const tree of trees) {
      expect(entries.some((entry) => entry.subtree === tree)).toBe(true);
    }
  });

  test('every local_path exists and every subtree names an imported tree', () => {
    for (const entry of entries) {
      expect(trees).toContain(entry.subtree as string);
      const localPaths = entry.local_paths as string[];
      const upstreamPaths = entry.upstream_paths as string[];
      for (const localPath of localPaths) {
        expect(existsSync(join(repoRoot, ...localPath.split('/')))).toBe(true);
      }
      expect(upstreamPaths.length).toBe(localPaths.length);
      const upstreamManifest = new Set(
        manifestRows(entry.subtree as string, 'MANIFEST.upstream.tsv').map((row) => row.path),
      );
      for (const upstreamPath of upstreamPaths) {
        expect(upstreamManifest.has(upstreamPath)).toBe(true);
      }
    }
  });
});
