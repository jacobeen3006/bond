/**
 * IMPT-06 / T-1-15 — the LFS half of import fidelity.
 *
 * Two facts are proven here. First, the pointer grammar: a substituted or
 * reformatted pointer is rejected with the line that broke it. Second, the
 * inventory: every declared LFS path is either a pointer that matches the
 * recorded `oid`/`size` or an upstream payload whose bytes equal the upstream
 * blob — and, crucially, a path that `.gitattributes` declares while the
 * inventory omits it is a finding. At the pinned `oh-my-pi` commit upstream
 * tracks no LFS object (its `.wasm` LFS objects were removed when the bindings
 * moved to N-API), so the check asserts the inventory is *correct*, not that it
 * is non-empty; `declared=1` on every run is what keeps that from being vacuous.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { captureStdout } from '../../../tests/provenance/fixtures/scratch';
import { cacheDir, git } from '../fetch';
import { readUpstreamLedger, serializeLedger } from '../ledger';
import {
  checkTree,
  deriveLfsLedger,
  lfsAttributePatterns,
  LFS_SCHEMA,
  main,
  matchesAttributePattern,
  parsePointer,
  POINTER_MAX_BYTES,
  POINTER_VERSION,
  verifyTree,
  type BlobIdentity,
  type LfsFinding,
  type LfsLedger,
  type LfsRecord,
} from '../lfs';
import { hashBytes, readManifestFile } from '../manifest';

const repoRoot = join(import.meta.dir, '..', '..', '..');

const OID_A = `sha256:${'a'.repeat(64)}`;
const OID_B = `sha256:${'b'.repeat(64)}`;

const WASM_ATTRIBUTE = '*.wasm filter=lfs diff=lfs merge=lfs -text linguist-vendored';

function pointerText(oid: string, size: number): string {
  return `version ${POINTER_VERSION}\noid ${oid}\nsize ${size}\n`;
}

/** Identity of fixture bytes. Only equality across the two manifests matters. */
function identity(path: string, content: Buffer | string): BlobIdentity {
  const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  const sha256 = hashBytes(bytes);
  return { path, oid: sha256.slice(0, 40), sha256 };
}

function ledger(tracked: LfsRecord[] = [], patterns: string[] = []): LfsLedger {
  return {
    schema: LFS_SCHEMA,
    subtree: 'fixture',
    tracked,
    upstream_gitattributes_lfs_lines: patterns,
  };
}

function record(path: string, oid: string, size: number, verified = true): LfsRecord {
  return { path, oid, size, pointer_verified: verified, object_verified: false };
}

/** Write a throwaway tree. Every caller removes it, so nothing leaks into `vendor/`. */
function tree(files: Record<string, Buffer | string>): string {
  const root = mkdtempSync(join(tmpdir(), 'halo-lfs-'));
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, ...path.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return root;
}

function kinds(findings: LfsFinding[]): string[] {
  return findings.map((finding) => finding.kind);
}

describe('parsePointer', () => {
  test('accepts the canonical three-line pointer', () => {
    const parsed = parsePointer(pointerText(OID_A, 4710));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pointer.version).toBe(POINTER_VERSION);
    expect(parsed.pointer.oid).toBe(OID_A);
    expect(parsed.pointer.size).toBe(4710);
  });

  test('accepts a pointer with a sorted extension key', () => {
    const text = `version ${POINTER_VERSION}\next-0-note hello\noid ${OID_A}\nsize 12\n`;
    const parsed = parsePointer(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pointer.size).toBe(12);
  });

  test('rejects keys out of order and names the line', () => {
    const text = `version ${POINTER_VERSION}\nsize 12\noid ${OID_A}\n`;
    const parsed = parsePointer(text);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe('unsorted-keys');
    expect(parsed.line).toBe(3);
    expect(parsed.message).toContain('oid');
  });

  test('rejects a blob over the 1024-byte pointer limit', () => {
    const parsed = parsePointer(Buffer.alloc(POINTER_MAX_BYTES + 76, 'x'));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe('too-large');
    expect(parsed.message).toContain('1100');
  });

  test('rejects a missing version line', () => {
    const parsed = parsePointer(`oid ${OID_A}\nsize 12\n`);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe('not-a-pointer');
    expect(parsed.line).toBe(1);
  });

  test('rejects an unknown pointer version', () => {
    const parsed = parsePointer(`version https://example.invalid/v2\noid ${OID_A}\nsize 12\n`);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe('not-a-pointer');
    expect(parsed.line).toBe(1);
  });

  test('rejects CRLF and reports the line carrying the CR', () => {
    const parsed = parsePointer(`version ${POINTER_VERSION}\r\noid ${OID_A}\r\nsize 12\r\n`);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe('crlf');
    expect(parsed.line).toBe(1);
  });

  test('rejects a non-decimal size', () => {
    const parsed = parsePointer(`version ${POINTER_VERSION}\noid ${OID_A}\nsize 012\n`);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe('bad-size');
    expect(parsed.line).toBe(3);
  });
});

describe('matchesAttributePattern', () => {
  test('a slashless pattern matches the basename at any depth', () => {
    expect(matchesAttributePattern('crates/pi-ast/src/ini.wasm', ['*.wasm'])).toBe(true);
    expect(matchesAttributePattern('crates/pi-ast/src/ini.rust', ['*.wasm'])).toBe(false);
  });

  test('a pattern with a slash matches the tree-relative path', () => {
    expect(matchesAttributePattern('crates/pi-ast/ini.wasm', ['crates/pi-ast/*.wasm'])).toBe(true);
    expect(matchesAttributePattern('other/crates/pi-ast/ini.wasm', ['crates/pi-ast/*.wasm'])).toBe(
      false,
    );
  });

  test('lfsAttributePatterns keeps only LFS-declaring lines, verbatim order', () => {
    expect(
      lfsAttributePatterns([
        WASM_ATTRIBUTE,
        '# a comment',
        '*.png -text',
        '*.bin filter=lfs diff=lfs merge=lfs -text',
      ]),
    ).toEqual(['*.wasm', '*.bin']);
  });
});

describe('verifyTree', () => {
  test('a matching pointer produces no finding', () => {
    const root = tree({ 'assets/model.bin': pointerText(OID_A, 4710) });
    try {
      const findings = verifyTree(root, ledger([record('assets/model.bin', OID_A, 4710)]));
      expect(findings).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('an edited oid fails with oid-mismatch naming the path', () => {
    const root = tree({ 'assets/model.bin': pointerText(OID_B, 4710) });
    try {
      const findings = verifyTree(root, ledger([record('assets/model.bin', OID_A, 4710)]));
      expect(kinds(findings)).toEqual(['oid-mismatch']);
      expect(findings[0].path).toBe('assets/model.bin');
      expect(findings[0].detail).toContain(OID_B);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('a size disagreement fails with size-mismatch', () => {
    const root = tree({ 'assets/model.bin': pointerText(OID_A, 4710) });
    try {
      const findings = verifyTree(root, ledger([record('assets/model.bin', OID_A, 1024)]));
      expect(kinds(findings)).toEqual(['size-mismatch']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('a fabricated payload at a tracked path fails with payload-in-vendor', () => {
    const root = tree({ 'assets/model.bin': Buffer.alloc(1200, 7) });
    try {
      const findings = verifyTree(root, ledger([record('assets/model.bin', OID_A, 1200)]));
      expect(kinds(findings)).toEqual(['payload-in-vendor']);
      expect(findings[0].detail).toContain('1200');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('a tracked path with no vendored file fails with missing', () => {
    const root = tree({ 'README.md': '# fixture\n' });
    try {
      const findings = verifyTree(root, ledger([record('assets/model.bin', OID_A, 4710)]));
      expect(kinds(findings)).toEqual(['missing']);
      expect(findings[0].path).toBe('assets/model.bin');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('a small payload at a tracked path is not-a-pointer, not a pass', () => {
    const root = tree({ 'assets/model.bin': 'not a pointer\n' });
    try {
      const findings = verifyTree(root, ledger([record('assets/model.bin', OID_A, 4710)]));
      expect(kinds(findings)).toEqual(['not-a-pointer']);
      expect(findings[0].detail).toContain('line 1');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('a pointer at a declared path that tracked[] omits fails with unlisted-pointer', () => {
    const root = tree({ 'packages/natives/pi.wasm': pointerText(OID_B, 3718674) });
    try {
      const findings = verifyTree(root, ledger([], [WASM_ATTRIBUTE]));
      expect(kinds(findings)).toEqual(['unlisted-pointer']);
      expect(findings[0].path).toBe('packages/natives/pi.wasm');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('an upstream payload at a declared path is clean when its bytes are the upstream blob', () => {
    const payload = Buffer.alloc(4710, 3);
    const root = tree({ 'crates/pi-ast/testdata/ini.wasm': payload });
    try {
      const findings = verifyTree(
        root,
        ledger([], [WASM_ATTRIBUTE]),
        [identity('crates/pi-ast/testdata/ini.wasm', payload)],
        [identity('crates/pi-ast/testdata/ini.wasm', payload)],
      );
      expect(findings).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('a fetched payload at a declared path fails when it differs from the upstream blob', () => {
    const upstreamBytes = pointerText(OID_A, 4710);
    const fetched = Buffer.alloc(4710, 3);
    const root = tree({ 'crates/pi-ast/testdata/ini.wasm': fetched });
    try {
      const findings = verifyTree(
        root,
        ledger([], [WASM_ATTRIBUTE]),
        [identity('crates/pi-ast/testdata/ini.wasm', fetched)],
        [identity('crates/pi-ast/testdata/ini.wasm', upstreamBytes)],
      );
      expect(kinds(findings)).toEqual(['payload-in-vendor']);
      expect(findings[0].detail).toContain('upstream=');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

type SchemaNode = {
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  additionalProperties?: boolean | SchemaNode;
  minimum?: number;
  minLength?: number;
  minItems?: number;
  pattern?: string;
};

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The same deliberately local validator the other ledger suites use: the tool
 * has no dependencies, and `lfs.schema.json` only uses the keywords below.
 */
function validateNode(schema: SchemaNode, value: unknown, path: string): string[] {
  if (schema.const !== undefined && value !== schema.const) {
    return [`${path}: expected ${JSON.stringify(schema.const)}`];
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    return [`${path}: not in ${JSON.stringify(schema.enum)}`];
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const matches = types.some((type) => {
      if (type === 'object') return isRecordValue(value);
      if (type === 'array') return Array.isArray(value);
      if (type === 'string') return typeof value === 'string';
      if (type === 'integer') return Number.isInteger(value);
      if (type === 'number') return typeof value === 'number';
      if (type === 'boolean') return typeof value === 'boolean';
      if (type === 'null') return value === null;
      return false;
    });
    if (!matches) return [`${path}: expected ${types.join('|')}`];
  }
  const errors: string[] = [];
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: shorter than ${schema.minLength}`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: does not match ${schema.pattern}`);
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
  if (isRecordValue(value)) {
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
    } else if (isRecordValue(schema.additionalProperties)) {
      for (const key of Object.keys(value)) {
        if (key in (schema.properties ?? {})) continue;
        errors.push(
          ...validateNode(schema.additionalProperties, value[key], `${path}.${key}`),
        );
      }
    }
  }
  return errors;
}

describe('vendor/oh-my-pi inventory', () => {
  const ledgerDir = join(repoRoot, 'vendor', 'oh-my-pi', 'provenance');
  const document = JSON.parse(readFileSync(join(ledgerDir, 'LFS.json'), 'utf8')) as LfsLedger;
  const schema = JSON.parse(
    readFileSync(join(repoRoot, 'provenance', 'schema', 'lfs.schema.json'), 'utf8'),
  ) as SchemaNode;

  test('LFS.json validates against provenance/schema/lfs.schema.json', () => {
    expect(validateNode(schema, document, '$')).toEqual([]);
  });

  test('the schema rejects a document without tracked[] and a record with a bad oid', () => {
    const withoutTracked = { ...document } as Record<string, unknown>;
    delete withoutTracked.tracked;
    expect(validateNode(schema, withoutTracked, '$')).toContain('$.tracked: missing required field');

    const badOid = {
      ...document,
      tracked: [{ path: 'x', oid: 'sha256:XYZ', size: 1, pointer_verified: true, object_verified: false }],
    };
    expect(validateNode(schema, badOid, '$').length).toBeGreaterThan(0);
  });

  test('the declared gitattributes lines are the upstream file at the pinned commit', () => {
    const upstream = readUpstreamLedger(repoRoot, 'oh-my-pi');
    const repo = cacheDir(repoRoot, 'oh-my-pi');
    if (!existsSync(repo)) return;
    const attributes = git(['show', `${upstream.commit}:.gitattributes`], repo).split('\n');
    const upstreamLfsLines = attributes
      .map((line) => line.replace(/\r$/, ''))
      .filter((line) => line !== '' && lfsAttributePatterns([line]).length > 0);
    expect(document.upstream_gitattributes_lfs_lines).toEqual(upstreamLfsLines);
    expect(document.upstream_gitattributes_lfs_lines).toContain(WASM_ATTRIBUTE);
  });

  test('deriving from the cache reproduces the committed document byte for byte', () => {
    const derived = deriveLfsLedger(repoRoot, 'oh-my-pi');
    expect(serializeLedger(derived)).toBe(readFileSync(join(ledgerDir, 'LFS.json'), 'utf8'));
    // The pinned commit tracks no LFS object; the empty inventory is the fact.
    expect(derived.tracked).toEqual([]);
  });

  test('the one LFS-declared .wasm is the upstream blob, not a fetched payload', () => {
    const relative = 'crates/pi-ast/src/language/testdata/ini.wasm';
    const bytes = readFileSync(join(repoRoot, 'vendor', 'oh-my-pi', ...relative.split('/')));
    expect(bytes.length).toBeGreaterThan(POINTER_MAX_BYTES);
    const upstreamRows = readManifestFile(join(ledgerDir, 'MANIFEST.upstream.tsv'));
    const row = upstreamRows.find((candidate) => candidate.path === relative);
    expect(row).toBeDefined();
    if (row === undefined) return;
    expect(hashBytes(bytes)).toBe(row.sha256);
  });

  test('the CLI checks the real tree and prints a non-vacuous inventory line', () => {
    const { result, output } = captureStdout(() => main(['--tree', 'oh-my-pi', '--check'], repoRoot));
    expect(result).toBe(0);
    expect(output).toContain('LFS OK oh-my-pi tracked=0 declared=1 pointers=0');
    expect(checkTree(repoRoot, 'oh-my-pi').findings).toEqual([]);
  });
});
