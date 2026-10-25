import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  MANIFEST_HEADER,
  ManifestError,
  comparePaths,
  formatLine,
  hashBlob,
  hashBytes,
  hashFile,
  isLedgerPath,
  manifestBodyDigest,
  readManifest,
  renderManifest,
  writeManifest,
  type ManifestRow,
} from '../manifest';

const LINK_TEXT = 'packages/core/target\n';

function row(mode: string, path: string, sha256 = 'a'.repeat(64), oid = 'b'.repeat(40)): ManifestRow {
  return { mode, oid, sha256, path };
}

function conditionOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ManifestError);
    return (error as ManifestError).condition;
  }
  throw new Error('expected a ManifestError');
}

describe('manifest canonical form', () => {
  let scratch = '';
  let linkOid = '';
  let materializedFile = '';

  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'halo-manifest-test-'));
    execFileSync('git', ['init', '-q', '.'], { cwd: scratch });
    linkOid = execFileSync('git', ['hash-object', '-w', '--stdin'], {
      cwd: scratch,
      encoding: 'utf8',
      input: LINK_TEXT,
    }).trim();
    materializedFile = join(scratch, 'materialized');
    writeFileSync(materializedFile, 'DIFFERENT CONTENT\n', 'utf8');
  });

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  test('byte sorting beats locale sorting', () => {
    const text = renderManifest([
      row('100644', 'a.txt'),
      row('100644', 'B.txt'),
      row('100644', 'z.txt'),
      row('100644', 'A.txt'),
    ]);
    const paths = readManifest(text).map((entry) => entry.path);
    // Byte order: uppercase before lowercase, ASCII 'A'(0x41) < 'B'(0x42) < 'a'(0x61).
    expect(paths).toEqual(['A.txt', 'B.txt', 'a.txt', 'z.txt']);
    expect(paths).not.toEqual([...paths].sort((a, b) => a.localeCompare(b)));
    expect(comparePaths('B.txt', 'a.txt')).toBeLessThan(0);
    const localeOrder = ['a.txt', 'B.txt', 'z.txt', 'A.txt'].sort((a, b) => a.localeCompare(b));
    expect(localeOrder).not.toEqual(['A.txt', 'B.txt', 'a.txt', 'z.txt']);
  });

  test('a manifest is header plus LF-terminated lines and no BOM', () => {
    const text = renderManifest([row('100644', 'src/index.ts')]);
    expect(text.startsWith(`${MANIFEST_HEADER}\n`)).toBe(true);
    expect(text.endsWith('\n')).toBe(true);
    expect(text.includes('\r')).toBe(false);
    expect(text.charCodeAt(0)).toBe(MANIFEST_HEADER.charCodeAt(0));
    expect(text).toBe(
      `${MANIFEST_HEADER}\n100644\t${'b'.repeat(40)}\t${'a'.repeat(64)}\tsrc/index.ts\n`,
    );
  });

  test('a CRLF manifest is rejected', () => {
    const line = formatLine('100644', 'b'.repeat(40), 'a'.repeat(64), 'x.txt');
    expect(conditionOf(() => readManifest(`${MANIFEST_HEADER}\r\n${line}\r\n`))).toBe('crlf');
  });

  test('a missing header is rejected', () => {
    const line = formatLine('100644', 'b'.repeat(40), 'a'.repeat(64), 'x.txt');
    expect(conditionOf(() => readManifest(`${line}\n`))).toBe('missing-header');
  });

  test('a duplicate path is rejected', () => {
    const line = formatLine('100644', 'b'.repeat(40), 'a'.repeat(64), 'dup.txt');
    expect(conditionOf(() => readManifest(`${MANIFEST_HEADER}\n${line}\n${line}\n`))).toBe(
      'duplicate-path',
    );
  });

  test('a tab in a path is rejected instead of corrupting the TSV', () => {
    expect(conditionOf(() => formatLine('100644', 'b'.repeat(40), 'a'.repeat(64), 'a\tb'))).toBe(
      'tab-in-path',
    );
  });

  test('mode 120000 round-trips with the hash of its stored link text', () => {
    const linkSha = hashBlob(linkOid, scratch);
    expect(linkSha).toBe(hashBytes(LINK_TEXT));
    expect(linkSha).not.toBe(hashFile(materializedFile));

    const text = renderManifest([{ mode: '120000', oid: linkOid, sha256: linkSha, path: 'link' }]);
    const rows = readManifest(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ mode: '120000', oid: linkOid, sha256: linkSha, path: 'link' });
    expect(rows[0].sha256).toBe(hashBytes(LINK_TEXT));
  });

  test('the body digest ignores the header but covers every row', () => {
    const text = renderManifest([row('100644', 'one.txt'), row('100755', 'two.sh')]);
    expect(manifestBodyDigest(text)).toBe(hashBytes(text.slice(MANIFEST_HEADER.length + 1)));
    expect(manifestBodyDigest(text)).not.toBe(manifestBodyDigest(renderManifest([])));
  });

  test('writeManifest writes bytes that readManifest and re-write reproduce exactly', () => {
    const file = join(scratch, 'manifest.tsv');
    const rows = [
      row('100644', 'b.txt', 'c'.repeat(64), 'd'.repeat(40)),
      row('100755', 'A.sh', 'e'.repeat(64), 'f'.repeat(40)),
    ];
    const text = writeManifest(rows, file);
    expect(readFileSync(file, 'utf8')).toBe(text);
    const reparsed = readManifest(readFileSync(file, 'utf8'));
    expect(renderManifest(reparsed)).toBe(text);
  });

  test('isLedgerPath is true only for the provenance directory', () => {
    expect(isLedgerPath('provenance')).toBe(true);
    expect(isLedgerPath('provenance/PATHS.json')).toBe(true);
    expect(isLedgerPath('provenance.json')).toBe(false);
    expect(isLedgerPath('src/provenance/x.ts')).toBe(false);
  });

  test('a UTF-8 BOM is rejected', () => {
    const line = formatLine('100644', 'b'.repeat(40), 'a'.repeat(64), 'bom.txt');
    expect(conditionOf(() => readManifest(`\uFEFF${MANIFEST_HEADER}\n${line}\n`))).toBe('bom');
  });

  test('out-of-order rows render the same bytes as sorted rows', () => {
    const rows = [
      row('100644', 'src/zeta.ts'),
      row('100644', 'LICENSE'),
      row('100755', 'bin/run.sh'),
      row('120000', 'link'),
    ];
    const permutations = [
      [...rows].reverse(),
      [rows[2], rows[0], rows[3], rows[1]],
      [rows[1], rows[3], rows[0], rows[2]],
    ];
    for (const permutation of permutations) {
      expect(renderManifest(permutation)).toBe(renderManifest(rows));
    }
  });

  test('a Unicode filename round-trips under byte ordering', () => {
    const text = renderManifest([
      row('100644', 'naïve-résumé.ts'),
      row('100644', 'naive.ts'),
    ]);
    const paths = readManifest(text).map((entry) => entry.path);
    expect(paths).toEqual(['naive.ts', 'naïve-résumé.ts']);
    expect(renderManifest(readManifest(text))).toBe(text);
  });
});
