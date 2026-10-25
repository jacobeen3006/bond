/**
 * IMPT-05 — the reverse rename lookup, exercised against a schema-valid
 * fixture because Phase 2 has not populated a real map yet.
 *
 * The fixture lives under `tests/provenance/fixtures/` and is never copied into
 * `vendor/**`; the real ledgers must stay empty, which this file asserts rather
 * than assumes.
 */

import { describe, expect, spyOn, test } from 'bun:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { forwardLookup, mainWhere, reverseLookup } from '../where';

const repoRoot = resolve(import.meta.dir, '..', '..', '..');
const fixturePath = join(repoRoot, 'tests', 'provenance', 'fixtures', 'renames.synthetic.json');
const schemaPath = join(repoRoot, 'provenance', 'schema', 'renames.schema.json');

type RenameRule = { id: string; kind: string; from: string; to: string; scope: string; applied_by: string };
type RenamesDocument = {
  schema: string;
  subtree: string;
  generated_from: string;
  phase_populated: number;
  rules: RenameRule[];
};

const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as RenamesDocument;
const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as {
  additionalProperties: boolean;
  required: string[];
  properties: {
    schema: { const: string };
    subtree: { pattern: string };
    generated_from: { enum: string[] };
    phase_populated: { minimum: number };
    rules: {
      items: {
        additionalProperties: boolean;
        required: string[];
        properties: {
          id: { pattern: string };
          kind: { enum: string[] };
          from: { minLength: number };
          to: { minLength: number };
          scope: { minLength: number };
          applied_by: { minLength: number };
        };
      };
    };
  };
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

describe('the synthetic map validates against the real schema', () => {
  test('the document carries exactly the schema-declared members', () => {
    expect(schema.additionalProperties).toBe(false);
    for (const key of schema.required) expect(fixture).toHaveProperty(key);
    for (const key of Object.keys(fixture)) {
      expect(Object.keys(schema.properties)).toContain(key);
    }
    expect(fixture.schema).toBe(schema.properties.schema.const);
    expect(fixture.subtree).toMatch(new RegExp(schema.properties.subtree.pattern));
    expect(schema.properties.generated_from.enum).toContain(fixture.generated_from);
    expect(fixture.phase_populated).toBeGreaterThanOrEqual(
      schema.properties.phase_populated.minimum,
    );
  });

  test('every rule is shaped as the schema requires and covers all six kinds', () => {
    const items = schema.properties.rules.items;
    expect(items.additionalProperties).toBe(false);
    expect(fixture.rules.length).toBeGreaterThanOrEqual(6);

    for (const rule of fixture.rules) {
      for (const key of items.required) expect(rule).toHaveProperty(key);
      for (const key of Object.keys(rule)) {
        expect(Object.keys(items.properties)).toContain(key);
      }
      expect(rule.id).toMatch(new RegExp(items.properties.id.pattern));
      expect(items.properties.kind.enum).toContain(rule.kind);
      expect(rule.from.length).toBeGreaterThanOrEqual(items.properties.from.minLength);
      expect(rule.to.length).toBeGreaterThanOrEqual(items.properties.to.minLength);
      expect(rule.scope.length).toBeGreaterThanOrEqual(items.properties.scope.minLength);
      expect(rule.applied_by.length).toBeGreaterThanOrEqual(
        items.properties.applied_by.minLength,
      );
    }

    expect([...new Set(fixture.rules.map((rule) => rule.kind))].sort()).toEqual(
      ['env', 'identifier', 'path', 'pkg', 'schema', 'string'],
    );
  });

  test('it is a fixture, not a ledger: it lives outside vendor/**', () => {
    expect(fixturePath).not.toContain(`${join(repoRoot, 'vendor')}`);
    expect(existsSync(fixturePath)).toBe(true);
    expect(fixture.generated_from).toBe('fixture');
  });
});

describe('reverse and forward lookup', () => {
  test('every rule reverses: its `to` finds its `from` and rule id', () => {
    for (const rule of fixture.rules) {
      const hits = reverseLookup(rule.to, fixture);
      expect(hits).toContainEqual({ from: rule.from, ruleId: rule.id, kind: rule.kind });
    }
  });

  test('HALO_NO_TITLE reverses to the upstream PI_NO_TITLE', () => {
    expect(reverseLookup('HALO_NO_TITLE', fixture)).toEqual([
      { from: 'PI_NO_TITLE', ruleId: 'R-SYN-0004', kind: 'env' },
    ]);
  });

  test('forward lookup of PI_NO_TITLE yields the HALO symbol and rule id', () => {
    expect(forwardLookup('PI_NO_TITLE', fixture)).toEqual([
      { to: 'HALO_NO_TITLE', ruleId: 'R-SYN-0004', kind: 'env' },
    ]);
  });

  test('a shared `to` returns both candidates in rule-id order, never one silently', () => {
    expect(reverseLookup('HALO_TITLE', fixture)).toEqual([
      { from: 'PI_TITLE', ruleId: 'R-SYN-0007', kind: 'string' },
      { from: 'pi_title', ruleId: 'R-SYN-0008', kind: 'identifier' },
    ]);
  });

  test('an unknown symbol returns an empty array rather than throwing', () => {
    expect(reverseLookup('NOT_A_HALO_SYMBOL', fixture)).toEqual([]);
    expect(forwardLookup('NOT_AN_UPSTREAM_SYMBOL', fixture)).toEqual([]);
  });
});

describe('the real trees carry no synthetic rules', () => {
  const trees = readdirSync(join(repoRoot, 'vendor'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((tree) => existsSync(join(repoRoot, 'vendor', tree, 'provenance', 'RENAMES.json')));

  test('every real RENAMES.json parses, is empty and names brand.json', () => {
    expect(trees.length).toBeGreaterThanOrEqual(4);
    for (const tree of trees) {
      const document = JSON.parse(
        readFileSync(join(repoRoot, 'vendor', tree, 'provenance', 'RENAMES.json'), 'utf8'),
      ) as RenamesDocument;
      expect(document.schema).toBe('halo/renames/v1');
      expect(document.subtree).toBe(tree);
      expect(document.generated_from).toBe('brand.json');
      expect(document.rules).toEqual([]);
    }
  });

  test('the tool reports renames: empty instead of returning nothing silently', () => {
    const { code, output } = captureStdout(() =>
      mainWhere(['HALO_NO_TITLE', '--tree', 'gsd-omp'], repoRoot),
    );
    expect(output).toContain('renames: empty');
    expect(output).toContain('vendor/gsd-omp/provenance/RENAMES.json');
    expect(code).toBe(3);
  });

  test('the fixture map is the only source of synthetic rules', () => {
    const { code, output } = captureStdout(() =>
      mainWhere(['PI_NO_TITLE', '--renames', fixturePath], repoRoot),
    );
    expect(code).toBe(0);
    expect(output).toContain('SYMBOL PI_NO_TITLE -> HALO_NO_TITLE');
    expect(output).toContain('rule=R-SYN-0004');
    expect(output).not.toContain('renames: empty');
  });

  test('where.ts never writes a ledger', () => {
    const source = readFileSync(join(repoRoot, 'tools', 'provenance', 'where.ts'), 'utf8');
    expect(source).not.toContain('writeFileSync');
  });
});
