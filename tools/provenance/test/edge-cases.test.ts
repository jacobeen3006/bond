/**
 * IMPT-01 / IMPT-03 edges, exercised against throwaway repos under the OS temp
 * dir. This file must not depend on the plan 01-02 fixture, which does not
 * exist yet.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { git } from '../fetch';
import {
  deriveExcludes,
  derivePaths,
  deriveRenames,
  ensureDir,
  ledgerPaths,
  readUpstreamLedger,
  serializeLedger,
  writeUpstreamLedger,
  type UpstreamLedger,
} from '../ledger';
import { hashFile, manifestBodyDigest, readManifest, renderManifest } from '../manifest';
import { assertSafeArchiveEntries, parseTarListing, PathGateError, ProvenanceError } from '../paths';
import { replayTree } from '../replay';
import { importTree, restage, SERIES_HEADER, STAGING_ATTRIBUTES_VALUE } from '../stage';

const root = mkdtempSync(join(tmpdir(), 'halo-edge-'));
const base = join(root, 'base');

function commitFixture(source: string, files: Record<string, string>): string {
  mkdirSync(source, { recursive: true });
  git(['init', '-q', '.'], source);
  git(['config', 'user.email', 'fixture@halo.local'], source);
  git(['config', 'user.name', 'HALO Fixture'], source);
  for (const [name, content] of Object.entries(files)) {
    const file = join(source, ...name.split('/'));
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, content, 'utf8');
  }
  git(['add', '-A', '--', '.'], source);
  git(['commit', '-q', '-m', 'fixture'], source);
  return git(['rev-parse', 'HEAD'], source).trim();
}

function emptyCommitFixture(source: string): string {
  mkdirSync(source, { recursive: true });
  git(['init', '-q', '.'], source);
  git(['config', 'user.email', 'fixture@halo.local'], source);
  git(['config', 'user.name', 'HALO Fixture'], source);
  git(['commit', '-q', '--allow-empty', '-m', 'empty'], source);
  return git(['rev-parse', 'HEAD'], source).trim();
}

/** A bare cache the replay path can archive from (never re-resolved). */
function makeCache(tree: string, source: string): void {
  mkdirSync(join(base, 'upstream-cache'), { recursive: true });
  if (existsSync(join(base, 'upstream-cache', `${tree}.git`))) return;
  git(['clone', '--bare', '-q', source, join(base, 'upstream-cache', `${tree}.git`)], base);
}

function writeEmptyLedger(tree: string, sha: string): void {
  const paths = ledgerPaths(base, tree);
  ensureDir(paths.patchesDir);
  const upstreamText = renderManifest([]);
  const vendoredText = renderManifest([]);
  writeFileSync(paths.manifestUpstream, upstreamText, 'utf8');
  writeFileSync(paths.manifestVendored, vendoredText, 'utf8');
  writeFileSync(paths.series, `${SERIES_HEADER}\n`, 'utf8');
  writeFileSync(paths.excludes, serializeLedger(deriveExcludes(tree)), 'utf8');
  writeFileSync(paths.renames, serializeLedger(deriveRenames(tree)), 'utf8');
  writeFileSync(paths.paths, serializeLedger(derivePaths(tree, [])), 'utf8');

  const document: UpstreamLedger = {
    schema: 'halo/upstream/v1',
    subtree: tree,
    local_root: `vendor/${tree}`,
    repo: 'https://example.invalid/empty.git',
    commit: sha,
    commit_committed_at: '2026-01-01T00:00:00Z',
    default_branch: 'main',
    tag: null,
    object_format: 'sha1',
    import: {
      mode: 'archive',
      date: '2026-01-01',
      tool: 'halo-provenance/0.1.0',
      git_version: '2.55.0',
      lfs_version: '3.7.1',
      staging_attributes: '.git/info/attributes',
      staging_attributes_value: STAGING_ATTRIBUTES_VALUE,
    },
    license: { spdx: 'MIT', files: [], copyright_notice_count: 0 },
    lockfiles: [],
    counts: { files: 0, bytes: 0, lfs_files: 0, symlinks: 0, executables: 0 },
    manifests: {
      upstream: 'provenance/MANIFEST.upstream.tsv',
      upstream_sha256: manifestBodyDigest(upstreamText),
      vendored: 'provenance/MANIFEST.vendored.tsv',
      vendored_sha256: manifestBodyDigest(vendoredText),
    },
    excludes_sha256: hashFile(paths.excludes),
    renames_sha256: hashFile(paths.renames),
  };
  writeUpstreamLedger(base, tree, document);
}

/** Minimal USTAR writer: proves the gate sees exactly what `tar -tf` emits. */
function writeTar(file: string, members: { name: string; content?: string }[]): void {
  const blocks: Buffer[] = [];
  for (const member of members) {
    const body = Buffer.from(member.content ?? '', 'utf8');
    const header = Buffer.alloc(512, 0);
    header.write(member.name, 0, 100, 'utf8');
    header.write('0000644\0', 100, 8, 'ascii');
    header.write('0000000\0', 108, 8, 'ascii');
    header.write('0000000\0', 116, 8, 'ascii');
    header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
    header.write('00000000000\0', 136, 12, 'ascii');
    header.write('        ', 148, 8, 'ascii');
    header.write('0', 156, 1, 'ascii');
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');
    let checksum = 0;
    for (const byte of header) checksum += byte;
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
    blocks.push(header, body);
    const padding = (512 - (body.length % 512)) % 512;
    if (padding > 0) blocks.push(Buffer.alloc(padding, 0));
  }
  blocks.push(Buffer.alloc(1024, 0));
  writeFileSync(file, Buffer.concat(blocks));
}

const TINY_FILES = {
  LICENSE: 'MIT License\n\nCopyright (c) 2026 Fixture\n',
  'README.md': 'line1\nline2',
  'docs/guide.md': 'guide\n',
};

beforeAll(() => {
  mkdirSync(base, { recursive: true });
  git(['init', '-q', '.'], base);
  git(['config', 'user.email', 'fixture@halo.local'], base);
  git(['config', 'user.name', 'HALO Fixture'], base);
  writeFileSync(
    join(base, '.git', 'info', 'attributes'),
    `${STAGING_ATTRIBUTES_VALUE}\n`,
    'utf8',
  );

  const tinySource = join(root, 'src-tiny');
  const tinySha = commitFixture(tinySource, TINY_FILES);
  makeCache('tiny', tinySource);
  writeFileSync(join(base, 'upstream-cache', 'tiny.resolved'), `${tinySha}\n`, 'utf8');
  importTree(base, 'tiny', tinySha);

  const emptySource = join(root, 'src-empty');
  const emptySha = emptyCommitFixture(emptySource);
  makeCache('empty', emptySource);
  writeEmptyLedger('empty', emptySha);

  const restageSource = join(root, 'src-restage');
  const restageSha = commitFixture(restageSource, TINY_FILES);
  makeCache('restage', restageSource);
  writeFileSync(join(base, 'upstream-cache', 'restage.resolved'), `${restageSha}\n`, 'utf8');
  importTree(base, 'restage', restageSha);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('pre-extraction archive gate', () => {
  test('a tar containing ../escape is refused with the traversal kind', () => {
    const tarFile = join(root, 'escape.tar');
    writeTar(tarFile, [{ name: '../escape', content: 'x' }, { name: 'ok.txt', content: 'ok' }]);
    const listing = parseTarListing(
      execFileSync('tar', ['-tf', tarFile], { encoding: 'utf8' }),
    );
    expect(listing).toContain('../escape');
    expect(() => assertSafeArchiveEntries(listing)).toThrow(PathGateError);
    try {
      assertSafeArchiveEntries(listing);
    } catch (error) {
      const gate = error as PathGateError;
      expect(gate.kind).toBe('traversal');
      expect(gate.path).toBe('../escape');
      expect(gate.message).toContain('unsafe archive path: ../escape');
    }
  });

  test('a tar containing an absolute member is refused with the absolute kind', () => {
    const tarFile = join(root, 'absolute.tar');
    writeTar(tarFile, [{ name: '/abs/path', content: 'x' }]);
    const listing = parseTarListing(
      execFileSync('tar', ['-tf', tarFile], { encoding: 'utf8' }),
    );
    expect(listing).toContain('/abs/path');
    expect(() => assertSafeArchiveEntries(listing)).toThrow(/unsafe archive path: \/abs\/path/);
  });

  test('drive, UNC, ADS, backslash and empty-segment entries are classified', () => {
    const cases: [string, string][] = [
      ['C:/abs', 'absolute'],
      ['//server/share', 'unc'],
      ['run.bat:stream', 'ads'],
      ['dir\\file', 'backslash'],
      ['a//b', 'empty-segment'],
    ];
    for (const [entry, kind] of cases) {
      try {
        assertSafeArchiveEntries([entry]);
        throw new Error(`expected ${entry} to be refused`);
      } catch (error) {
        expect(error).toBeInstanceOf(PathGateError);
        expect((error as PathGateError).kind).toBe(kind);
      }
    }
    expect(() => assertSafeArchiveEntries(['./fine/path.txt', 'dir/'])).not.toThrow();
  });

  test('the gate refuses before any extraction, leaving the target untouched', () => {
    const target = join(root, 'gate-target');
    mkdirSync(target, { recursive: true });
    const tarFile = join(root, 'hostile.tar');
    writeTar(tarFile, [
      { name: 'safe.txt', content: 'safe' },
      { name: '../escape', content: 'x' },
    ]);
    const listing = parseTarListing(execFileSync('tar', ['-tf', tarFile], { encoding: 'utf8' }));

    expect(() => {
      assertSafeArchiveEntries(listing);
      execFileSync('tar', ['-xf', tarFile, '-C', target]);
    }).toThrow(PathGateError);
    expect(existsSync(join(target, 'safe.txt'))).toBe(false);
    expect(existsSync(join(root, 'escape'))).toBe(false);
  });
});

describe('patch adjacency edge (no trailing newline)', () => {
  test('a patch to the final line of a newline-less file applies byte-identically', () => {
    const sha = readFileSync(join(base, 'upstream-cache', 'tiny.resolved'), 'utf8').trim();
    const work = join(root, 'patch-work');
    mkdirSync(work, { recursive: true });
    const tarFile = join(root, 'tiny.tar');
    git(['archive', '--format=tar', `--output=${tarFile}`, sha], join(base, 'upstream-cache', 'tiny.git'));
    execFileSync('tar', ['-xf', tarFile, '-C', work], { encoding: 'utf8' });

    const patch = [
      'diff --git a/README.md b/README.md',
      '--- a/README.md',
      '+++ b/README.md',
      '@@ -1,2 +1,2 @@',
      ' line1',
      '-line2',
      '\\ No newline at end of file',
      '+line2 edited',
      '\\ No newline at end of file',
      '',
    ].join('\n');
    const patchFile = join(root, '0001-no-newline.patch');
    writeFileSync(patchFile, patch, 'utf8');
    expect(readFileSync(patchFile, 'utf8')).toContain('\\ No newline at end of file');

    git(['apply', '--check', '--whitespace=nowarn', '-p1', patchFile], work);
    git(['apply', '--whitespace=nowarn', '-p1', patchFile], work);

    const applied = readFileSync(join(work, 'README.md'));
    expect(applied.toString('utf8')).toBe('line1\nline2 edited');
    expect(applied.toString('utf8').endsWith('\n')).toBe(false);
  });
});

describe('empty-series and zero-file edges', () => {
  test('an empty series reconstructs the vendored manifest identical to the upstream one', () => {
    const paths = ledgerPaths(base, 'tiny');
    expect(readFileSync(paths.manifestVendored, 'utf8')).toBe(
      readFileSync(paths.manifestUpstream, 'utf8'),
    );
    const result = replayTree(base, 'tiny');
    expect(result.files).toBe(3);
  });

  test('a zero-file vendored tree exits 1 instead of passing', () => {
    let caught: unknown;
    try {
      replayTree(base, 'empty');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProvenanceError);
    expect((caught as ProvenanceError).message).toContain('empty vendored tree');
    expect((caught as ProvenanceError).code).toBe(1);
  });
});

describe('path rename rules', () => {
  test('a kind:path rule is applied in rule-id order and its target must exist', () => {
    const paths = ledgerPaths(base, 'tiny');
    const document = readUpstreamLedger(base, 'tiny');

    writeFileSync(
      paths.renames,
      serializeLedger({
        schema: 'halo/renames/v1',
        subtree: 'tiny',
        generated_from: 'brand.json',
        phase_populated: 2,
        rules: [
          { id: 'R-0002', kind: 'path', from: 'README.md', to: 'docs/README.md' },
        ],
      }),
      'utf8',
    );
    document.renames_sha256 = hashFile(paths.renames);
    writeUpstreamLedger(base, 'tiny', document);

    renameSync(join(base, 'vendor', 'tiny', 'README.md'), join(base, 'vendor', 'tiny', 'docs', 'README.md'));
    const result = restage(base, 'tiny');
    expect(result.changed).toBe(true);

    const vendored = readManifest(readFileSync(paths.manifestVendored, 'utf8')).map(
      (row) => row.path,
    );
    expect(vendored).toContain('docs/README.md');
    expect(vendored).not.toContain('README.md');

    expect(replayTree(base, 'tiny').files).toBe(3);
  });

  test('an unsafe rename path is refused before any rule is applied', () => {
    const paths = ledgerPaths(base, 'tiny');
    const document = readUpstreamLedger(base, 'tiny');
    writeFileSync(
      paths.renames,
      serializeLedger({
        schema: 'halo/renames/v1',
        subtree: 'tiny',
        generated_from: 'brand.json',
        phase_populated: 2,
        rules: [{ id: 'R-bad', kind: 'path', from: '../escape', to: 'docs/x.md' }],
      }),
      'utf8',
    );
    document.renames_sha256 = hashFile(paths.renames);
    writeUpstreamLedger(base, 'tiny', document);

    let caught: unknown;
    try {
      replayTree(base, 'tiny');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProvenanceError);
    expect((caught as ProvenanceError).message).toContain('unsafe rename: R-bad');
    expect((caught as ProvenanceError).code).toBe(2);

    // Restore the identity map for the rest of the suite.
    writeFileSync(paths.renames, serializeLedger(deriveRenames('tiny')), 'utf8');
    document.renames_sha256 = hashFile(paths.renames);
    writeUpstreamLedger(base, 'tiny', document);
  });
});

describe('restage fixed point', () => {
  test('unchanged restage is byte-identical, and a one-line edit moves only the vendored digest', () => {
    const tree = 'restage';
    const paths = ledgerPaths(base, tree);

    const first = restage(base, tree);
    expect(first.changed).toBe(false);
    expect(first.files).toBe(3);

    const manifestBefore = readFileSync(paths.manifestVendored, 'utf8');
    const documentBefore = readUpstreamLedger(base, tree);
    const second = restage(base, tree);
    expect(second.changed).toBe(false);
    expect(readFileSync(paths.manifestVendored, 'utf8')).toBe(manifestBefore);

    const guide = join(base, 'vendor', tree, 'docs', 'guide.md');
    writeFileSync(guide, `${readFileSync(guide, 'utf8')}one more line\n`, 'utf8');

    const third = restage(base, tree);
    expect(third.changed).toBe(true);

    const documentAfter = readUpstreamLedger(base, tree);
    expect(documentAfter.manifests.vendored_sha256).not.toBe(
      documentBefore.manifests.vendored_sha256,
    );
    expect(documentAfter.manifests.upstream_sha256).toBe(
      documentBefore.manifests.upstream_sha256,
    );
    expect(documentAfter.excludes_sha256).toBe(documentBefore.excludes_sha256);
    expect(documentAfter.renames_sha256).toBe(documentBefore.renames_sha256);

    const changedRows = readManifest(readFileSync(paths.manifestVendored, 'utf8')).filter(
      (row) => row.path === 'docs/guide.md',
    );
    expect(changedRows).toHaveLength(1);
    expect(hashFile(guide)).toBe(changedRows[0].sha256);
  });
});
