import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  hashFile,
  manifestBodyDigest,
  readManifest,
  type ManifestRow,
} from '../manifest';

const repoRoot = join(import.meta.dir, '..', '..', '..');
const ledgerDir = join(repoRoot, 'vendor', 'gsd-omp', 'provenance');
const upstreamFile = join(ledgerDir, 'UPSTREAM.json');

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
  additionalProperties?: boolean;
  items?: SchemaNode;
};

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
 * the schema only uses `type`/`required`/`properties`/`items`/`pattern`/
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
    if (schema.properties !== undefined) {
      for (const [key, child] of Object.entries(schema.properties)) {
        if (key in value) errors.push(...validateNode(child, value[key], `${path}.${key}`));
      }
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          if (!(key in schema.properties)) errors.push(`${path}: unexpected field ${key}`);
        }
      }
    }
  }
  return errors;
}

const schema = JSON.parse(
  readFileSync(join(repoRoot, 'provenance', 'schema', 'upstream.schema.json'), 'utf8'),
) as SchemaNode;
const ledger = JSON.parse(readFileSync(upstreamFile, 'utf8')) as Record<string, unknown>;

function manifestRows(fileName: string): ManifestRow[] {
  return readManifest(readFileSync(join(ledgerDir, fileName), 'utf8'));
}

describe('UPSTREAM.json contract', () => {
  test('the produced ledger validates against the schema', () => {
    expect(validateNode(schema, ledger, '$')).toEqual([]);
  });

  test('a ledger missing license.files names the field in the error', () => {
    const broken = structuredClone(ledger) as Record<string, Record<string, unknown>>;
    delete broken.license.files;
    const errors = validateNode(schema, broken, '$');
    expect(errors.some((error) => error.includes('license.files'))).toBe(true);
  });

  test('commit is 40 lowercase hex, matches the resolved file, and resolves in the cache', () => {
    const commit = ledger.commit as string;
    expect(commit).toMatch(/^[0-9a-f]{40}$/);

    const resolved = readFileSync(join(repoRoot, 'upstream-cache', 'gsd-omp.resolved'), 'utf8').trim();
    expect(commit).toBe(resolved);

    const cache = join(repoRoot, 'upstream-cache', 'gsd-omp.git');
    expect(existsSync(cache)).toBe(true);
    expect(() =>
      execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: cache }),
    ).not.toThrow();
    const head = execFileSync('git', ['rev-parse', 'refs/heads/main'], {
      cwd: cache,
      encoding: 'utf8',
    }).trim();
    expect(head).toBe(commit);
  });

  test('repo is an HTTPS remote', () => {
    expect(ledger.repo).toMatch(/^https:\/\/[^/]+\//);
  });

  test('both manifest digests recompute over the files they name', () => {
    const manifests = ledger.manifests as Record<string, string>;
    expect(manifests.upstream).toBe('provenance/MANIFEST.upstream.tsv');
    expect(manifests.vendored).toBe('provenance/MANIFEST.vendored.tsv');
    expect(manifestBodyDigest(readFileSync(join(ledgerDir, 'MANIFEST.upstream.tsv'), 'utf8'))).toBe(
      manifests.upstream_sha256,
    );
    expect(manifestBodyDigest(readFileSync(join(ledgerDir, 'MANIFEST.vendored.tsv'), 'utf8'))).toBe(
      manifests.vendored_sha256,
    );
  });

  test('excludes_sha256 and renames_sha256 are the digests of the documents on disk', () => {
    expect(hashFile(join(ledgerDir, 'EXCLUDES.json'))).toBe(ledger.excludes_sha256 as string);
    expect(hashFile(join(ledgerDir, 'RENAMES.json'))).toBe(ledger.renames_sha256 as string);
  });

  test('counts.files equals the manifest line count', () => {
    const counts = ledger.counts as Record<string, number>;
    expect(counts.files).toBe(manifestRows('MANIFEST.upstream.tsv').length);
    expect(counts.files).toBe(manifestRows('MANIFEST.vendored.tsv').length);
    expect(counts.files).toBeGreaterThan(0);
    expect(counts.bytes).toBeGreaterThan(0);
  });

  test('license.files[0].sha256 is the raw SHA-256 of the vendored LICENSE', () => {
    const license = ledger.license as { files: { path: string; blob: string; sha256: string }[] };
    expect(license.files).toHaveLength(1);
    expect(license.files[0].path).toBe('LICENSE');
    expect(hashFile(join(repoRoot, 'vendor', 'gsd-omp', 'LICENSE'))).toBe(license.files[0].sha256);
  });

  test('import.date and commit_committed_at are independent fields', () => {
    const imported = ledger.import as Record<string, string>;
    expect(typeof imported.date).toBe('string');
    expect(typeof ledger.commit_committed_at).toBe('string');
    expect(imported.date).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
    expect(ledger.commit_committed_at).not.toBe(imported.date);

    // Adjacency edge: equal values are still two valid, independently emitted keys.
    const equalDates = structuredClone(ledger) as Record<string, unknown>;
    equalDates.commit_committed_at = imported.date;
    expect(validateNode(schema, equalDates, '$')).toEqual([]);
  });

  test('the staging attributes are recorded as a path plus the exact line', () => {
    const imported = ledger.import as Record<string, string>;
    expect(imported.staging_attributes).toBe('.git/info/attributes');
    expect(imported.staging_attributes_value).toBe(
      '* -text -filter -ident -working-tree-encoding',
    );
  });

  test('neither manifest carries a provenance row', () => {
    for (const fileName of ['MANIFEST.upstream.tsv', 'MANIFEST.vendored.tsv']) {
      for (const row of manifestRows(fileName)) {
        expect(row.path.startsWith('provenance/')).toBe(false);
      }
    }
  });
});
