import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { listLedgerTrees, readUpstreamLedger } from '../ledger';
import {
  buildLicenseBlock,
  collectLicenseFiles,
  countCopyrightNotices,
  isLicensePath,
  treeReader,
} from '../license';
import { comparePaths, hashBytes, readManifestFile, type ManifestRow } from '../manifest';
import { ProvenanceError } from '../paths';

const repoRoot = join(import.meta.dir, '..', '..', '..');

type LicenseFile = { path: string; blob: string; sha256: string };

const trees = listLedgerTrees(repoRoot);
// A zero-tree run must be visible rather than silently green.
console.log(`pinning licences for: ${trees.join(', ') || '(none)'}`);

function manifestRows(tree: string): ManifestRow[] {
  return readManifestFile(join(repoRoot, 'vendor', tree, 'provenance', 'MANIFEST.upstream.tsv'));
}

function diskReader(tree: string): (relPath: string) => Buffer {
  return treeReader(join(repoRoot, 'vendor', tree));
}

function licenseFiles(tree: string): LicenseFile[] {
  return readUpstreamLedger(repoRoot, tree).license.files;
}

for (const tree of trees) {
  describe(`${tree} licence pin`, () => {
    test('license.files is non-empty and every entry names a file on disk', () => {
      const files = licenseFiles(tree);
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        expect(existsSync(join(repoRoot, 'vendor', tree, ...file.path.split('/')))).toBe(true);
      }
    });

    test('every recorded sha256 is the raw-byte hash of the vendored file', () => {
      for (const file of licenseFiles(tree)) {
        expect(hashBytes(diskReader(tree)(file.path))).toBe(file.sha256);
      }
    });

    test('every recorded blob is the blob OID in MANIFEST.upstream.tsv', () => {
      const byPath = new Map(manifestRows(tree).map((row) => [row.path, row.oid]));
      for (const file of licenseFiles(tree)) {
        expect(byPath.get(file.path)).toBe(file.blob);
      }
    });

    test('copyright_notice_count recomputes from the pinned bytes', () => {
      const files = licenseFiles(tree);
      const reader = diskReader(tree);
      const recomputed = countCopyrightNotices(files.map((file) => reader(file.path)));
      expect(recomputed).toBe(readUpstreamLedger(repoRoot, tree).license.copyright_notice_count);
      expect(recomputed).toBeGreaterThan(0);
    });

    test('license.files is ordered by raw path bytes', () => {
      const paths = licenseFiles(tree).map((file) => file.path);
      const sorted = [...paths].sort(comparePaths);
      expect(paths).toEqual(sorted);
    });

    test('every licence-ish manifest path is pinned, not only the root LICENSE', () => {
      // IMPT-02/adjacency: a NOTICE or COPYRIGHT beside the licence cannot drift
      // unobserved because the pin is the whole manifest-derived set.
      const rows = manifestRows(tree);
      expect(collectLicenseFiles(rows, diskReader(tree))).toEqual(licenseFiles(tree));
      const candidates = rows.filter((row) => isLicensePath(row.path)).map((row) => row.path);
      expect(candidates.sort(comparePaths)).toEqual(licenseFiles(tree).map((file) => file.path));
    });

    test('buildLicenseBlock agrees with the two exported halves', () => {
      const rows = manifestRows(tree);
      const block = buildLicenseBlock(rows, diskReader(tree));
      expect(block.files).toEqual(licenseFiles(tree));
      expect(block.copyright_notice_count).toBe(
        readUpstreamLedger(repoRoot, tree).license.copyright_notice_count,
      );
    });
  });
}

describe('the licence predicate', () => {
  test('matches both spellings of the third-party notice', () => {
    expect(isLicensePath('THIRD-PARTY-NOTICES.txt')).toBe(true);
    expect(isLicensePath('packages/natives/THIRD_PARTY_NOTICES.txt')).toBe(true);
    expect(isLicensePath('crates/pi-natives/data/LICENSE.ctok')).toBe(true);
    expect(isLicensePath('packages/coding-agent/src/markit/NOTICE')).toBe(true);
    expect(isLicensePath('src/index.ts')).toBe(false);
    expect(isLicensePath('docs/readme.md')).toBe(false);
  });

  test('the real hyphenated notice is pinned in the oh-my-pi ledger', () => {
    const paths = licenseFiles('oh-my-pi').map((file) => file.path);
    expect(paths).toContain('THIRD-PARTY-NOTICES.txt');
    expect(paths).toContain('packages/natives/THIRD-PARTY-NOTICES.txt');
  });
});

describe('IMPT-02/empty', () => {
  test('a manifest with no licence path fails before any ledger is written', () => {
    const rows: ManifestRow[] = [
      { mode: '100644', oid: 'a'.repeat(40), sha256: 'b'.repeat(64), path: 'src/index.ts' },
      { mode: '100644', oid: 'c'.repeat(40), sha256: 'd'.repeat(64), path: 'README.md' },
    ];
    let thrown: unknown;
    try {
      collectLicenseFiles(rows, () => Buffer.from('', 'utf8'));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ProvenanceError);
    expect((thrown as ProvenanceError).code).toBe(2);
    expect((thrown as ProvenanceError).message).toBe('license: no LICENSE file');
  });

  test('an empty license.files array is a schema error, not an empty ledger', () => {
    const schema = JSON.parse(
      readFileSync(join(repoRoot, 'provenance', 'schema', 'upstream.schema.json'), 'utf8'),
    ) as {
      required: string[];
      properties: { license: { required: string[]; properties: { files: { minItems?: number } } } };
    };
    expect(schema.properties.license.properties.files.minItems).toBe(1);
    expect(schema.properties.license.required).toContain('files');
  });
});

describe('IMPT-02/encoding', () => {
  test('a CRLF-converted licence hashes differently and the pin comparison fails', () => {
    const tree = 'gsd-omp';
    const lf = readFileSync(join(repoRoot, 'vendor', tree, 'LICENSE'));
    const crlf = Buffer.from(lf.toString('latin1').replace(/\r?\n/g, '\r\n'), 'latin1');
    expect(crlf.length).toBeGreaterThan(lf.length);
    expect(hashBytes(crlf)).not.toBe(hashBytes(lf));

    const rows = manifestRows(tree).filter((row) => isLicensePath(row.path));
    const reader = diskReader(tree);
    const rePinned = collectLicenseFiles(rows, (relPath) =>
      relPath === 'LICENSE' ? crlf : reader(relPath),
    );
    const recorded = licenseFiles(tree).find((file) => file.path === 'LICENSE');
    expect(recorded).toBeDefined();
    expect(rePinned[0].sha256).not.toBe(recorded?.sha256 as string);
  });

  test('the pin module never decodes, normalizes or reads bytes through git', () => {
    const source = readFileSync(join(import.meta.dir, '..', 'license.ts'), 'utf8');
    // Comments may name what the code refuses to do; only statements count.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('git show');
    expect(code).not.toContain('cat-file');
    expect(code).not.toContain('.toString(');
    expect(code).not.toContain('normalize(');
    expect(code).not.toContain('\\r\\n');
    expect(code).toContain('readFileSync');
  });
});
