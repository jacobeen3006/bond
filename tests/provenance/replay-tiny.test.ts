/**
 * IMPT-03 — the whole import/replay pipeline on the hermetic fixture, offline.
 *
 * The hostile, gitlink and zero-file cases exist to prove the gates can fail:
 * a pass-only suite would not distinguish a working gate from a missing one.
 */

import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { git } from '../../tools/provenance/fetch';
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
} from '../../tools/provenance/ledger';
import { hashFile, manifestBodyDigest, readManifestFile, renderManifest } from '../../tools/provenance/manifest';
import { ProvenanceError } from '../../tools/provenance/paths';
import { replayTree } from '../../tools/provenance/replay';
import {
  importFromCache,
  importTree,
  SERIES_HEADER,
  STAGING_ATTRIBUTES_VALUE,
  validateSymlinkTarget,
} from '../../tools/provenance/stage';

import { emitFixture } from './fixtures/make-fixture';

const root = mkdtempSync(join(tmpdir(), 'halo-replay-tiny-'));
const base = join(root, 'base');
const fixtureDir = join(root, 'fixture-happy');
let happySha = '';

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  git(['init', '-q', '--initial-branch=main', '.'], dir);
  git(['config', 'user.email', 'fixture@halo.local'], dir);
  git(['config', 'user.name', 'HALO Fixture'], dir);
}

/**
 * A bare cache the importer can archive from. The remote is HTTPS because the
 * ledger schema requires it; nothing in import or replay contacts it.
 */
function makeBareCache(dir: string, source: string, name: string): string {
  mkdirSync(join(dir, 'upstream-cache'), { recursive: true });
  const cache = join(dir, 'upstream-cache', `${name}.git`);
  git(['clone', '--bare', '-q', source, cache], dir);
  git(['config', 'remote.origin.url', 'https://example.invalid/tiny-upstream.git'], cache);
  return cache;
}

function captureStdout<T>(operation: () => T): { result: T; output: string } {
  const chunks: string[] = [];
  const spy = spyOn(process.stdout, 'write').mockImplementation(((
    chunk: string | Uint8Array,
  ): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stdout.write);
  try {
    return { result: operation(), output: chunks.join('') };
  } finally {
    spy.mockRestore();
  }
}

function writeEmptyLedger(dir: string, tree: string, sha: string): void {
  const paths = ledgerPaths(dir, tree);
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
  writeUpstreamLedger(dir, tree, document);
}

beforeAll(() => {
  initRepo(base);
  happySha = emitFixture(fixtureDir, 'happy');
  const cache = makeBareCache(base, fixtureDir, 'tiny-upstream');
  const { output } = captureStdout(() => importTree(base, 'tiny-upstream', happySha));
  expect(output).toContain('SIZE tiny-upstream files=10');
  expect(output).toContain('IMPORT OK tiny-upstream files=10');
});

describe('the fixture import', () => {
  test('both manifests exist, the ledger recomputes, and every file is accounted for', () => {
    const paths = ledgerPaths(base, 'tiny-upstream');
    for (const file of [paths.upstream, paths.manifestUpstream, paths.manifestVendored, paths.series]) {
      expect(existsSync(file)).toBe(true);
    }

    const document = readUpstreamLedger(base, 'tiny-upstream');
    expect(document.schema).toBe('halo/upstream/v1');
    expect(document.subtree).toBe('tiny-upstream');
    expect(document.repo).toBe('https://example.invalid/tiny-upstream.git');
    expect(document.commit).toBe(happySha);
    expect(document.object_format).toBe('sha1');
    expect(document.import.staging_attributes_value).toBe(STAGING_ATTRIBUTES_VALUE);
    expect(document.counts.files).toBe(10);
    expect(document.counts.symlinks).toBe(1);
    expect(document.counts.executables).toBe(2);
    expect(document.license.files[0]?.path).toBe('LICENSE');
    expect(document.lockfiles.map((row) => row.path)).toContain('package-lock.json');

    const upstream = readManifestFile(paths.manifestUpstream);
    const vendored = readManifestFile(paths.manifestVendored);
    expect(upstream).toHaveLength(10);
    expect(vendored).toHaveLength(10);
    expect(vendored.map((row) => row.path)).toEqual(upstream.map((row) => row.path));

    expect(manifestBodyDigest(readFileSync(paths.manifestUpstream, 'utf8'))).toBe(
      document.manifests.upstream_sha256,
    );
    expect(manifestBodyDigest(readFileSync(paths.manifestVendored, 'utf8'))).toBe(
      document.manifests.vendored_sha256,
    );
    expect(hashFile(paths.excludes)).toBe(document.excludes_sha256);
    expect(hashFile(paths.renames)).toBe(document.renames_sha256);
  });

  test('the vendored index equals the upstream blobs, including the 120000 entry', () => {
    const upstream = readManifestFile(ledgerPaths(base, 'tiny-upstream').manifestUpstream);
    const vendored = readManifestFile(ledgerPaths(base, 'tiny-upstream').manifestVendored);
    const upstreamByPath = new Map(upstream.map((row) => [row.path, row]));

    for (const row of vendored) {
      const want = upstreamByPath.get(row.path);
      expect(want).toBeDefined();
      expect(row.oid).toBe(want?.oid);
      expect(row.mode).toBe(want?.mode);
      expect(row.sha256).toBe(want?.sha256);
    }
  });
});

describe('replay', () => {
  test('reconstructs ten files and prints REPLAY OK tiny-upstream files=10', () => {
    const { result, output } = captureStdout(() => replayTree(base, 'tiny-upstream'));
    expect(result.files).toBe(10);
    expect(output).toContain('REPLAY OK tiny-upstream files=10');
  });

  test('a second replay into a fresh temp directory leaves both manifests byte-identical', () => {
    const paths = ledgerPaths(base, 'tiny-upstream');
    const before = [
      readFileSync(paths.manifestUpstream),
      readFileSync(paths.manifestVendored),
    ];
    const { output } = captureStdout(() => replayTree(base, 'tiny-upstream'));
    expect(output).toContain('REPLAY OK tiny-upstream files=10');
    expect(readFileSync(paths.manifestUpstream).equals(before[0])).toBe(true);
    expect(readFileSync(paths.manifestVendored).equals(before[1])).toBe(true);
  });

  test('an empty patch series reconstructs a vendored manifest byte-equal to upstream', () => {
    const paths = ledgerPaths(base, 'tiny-upstream');
    writeFileSync(paths.series, '# comments only\n#\n', 'utf8');

    const { result } = captureStdout(() => replayTree(base, 'tiny-upstream'));
    expect(result.files).toBe(10);
    expect(readFileSync(paths.manifestVendored, 'utf8')).toBe(
      readFileSync(paths.manifestUpstream, 'utf8'),
    );
  });
});

describe('zero-file refusal', () => {
  test('a hand-built zero-file vendored tree exits 1', () => {
    const emptyBase = join(root, 'empty-base');
    initRepo(emptyBase);
    const source = join(root, 'empty-source');
    initRepo(source);
    const sha = git(['commit', '-q', '--allow-empty', '-m', 'empty'], source)
      .trim();
    const commit = sha || git(['rev-parse', 'HEAD'], source).trim();
    makeBareCache(emptyBase, source, 'empty');
    writeEmptyLedger(emptyBase, 'empty', commit);

    let caught: unknown;
    captureStdout(() => {
      try {
        replayTree(emptyBase, 'empty');
      } catch (error) {
        caught = error;
      }
    });
    expect(caught).toBeInstanceOf(ProvenanceError);
    expect((caught as ProvenanceError).message).toContain('empty vendored tree');
    expect((caught as ProvenanceError).code).toBe(1);
  });
});

describe('hostile preflight', () => {
  test('the hostile fixture names all four findings and writes no vendor tree', () => {
    const hostileBase = join(root, 'hostile-base');
    initRepo(hostileBase);
    const source = join(root, 'fixture-hostile');
    const sha = emitFixture(source, 'hostile');
    const cache = makeBareCache(hostileBase, source, 'tiny-upstream');

    let caught: unknown;
    const { output } = captureStdout(() => {
      try {
        importFromCache(hostileBase, 'tiny-upstream', cache, sha);
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toBeInstanceOf(ProvenanceError);
    expect((caught as ProvenanceError).code).toBe(2);
    for (const kind of [
      'case-collision',
      'reserved-name',
      'trailing-dot-space',
      'too-long',
    ]) {
      expect(output).toContain(`[${kind}]`);
    }
    expect(output).toContain('docs/CON.txt');
    expect(output).toContain('docs/trailing./file.txt');
    expect(existsSync(join(hostileBase, 'vendor', 'tiny-upstream'))).toBe(false);
  });

  test('a gitlink is refused as `submodule entry: <path>` before extraction', () => {
    const sub = join(root, 'gitlink-sub');
    initRepo(sub);
    writeFileSync(join(sub, 'file.txt'), 'sub\n', 'utf8');
    git(['add', '--', 'file.txt'], sub);
    git(['commit', '-q', '-m', 'sub'], sub);
    const subSha = git(['rev-parse', 'HEAD'], sub).trim();

    const source = join(root, 'gitlink-source');
    initRepo(source);
    git(['update-index', '--add', '--cacheinfo', `160000,${subSha},subdir`], source);
    const tree = git(['write-tree'], source).trim();
    const commit = git(['commit-tree', tree, '-m', 'gitlink'], source).trim();
    git(['update-ref', 'refs/heads/main', commit], source);
    git(['symbolic-ref', 'HEAD', 'refs/heads/main'], source);

    const gitlinkBase = join(root, 'gitlink-base');
    initRepo(gitlinkBase);
    const cache = makeBareCache(gitlinkBase, source, 'gitlink');

    let caught: unknown;
    const { output } = captureStdout(() => {
      try {
        importFromCache(gitlinkBase, 'gitlink', cache, commit);
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toBeInstanceOf(ProvenanceError);
    expect((caught as ProvenanceError).code).toBe(2);
    expect((caught as ProvenanceError).message).toContain('submodule entry: subdir');
    expect(output).toContain('submodule entry: subdir');
    expect(existsSync(join(gitlinkBase, 'vendor', 'gitlink'))).toBe(false);
  });
});

describe('symlink link text', () => {
  test('the fixture link stays inside and each escaping form is refused', () => {
    expect(validateSymlinkTarget('assets/link-to-readme', '../README.md')).toBeNull();
    expect(validateSymlinkTarget('assets/link-to-readme', 'docs/../README.md')).toBeNull();

    expect(validateSymlinkTarget('assets/link-to-readme', '/etc/passwd')).toContain('absolute');
    expect(validateSymlinkTarget('assets/link-to-readme', '\\\\server\\share')).toContain(
      'absolute',
    );
    expect(validateSymlinkTarget('assets/link-to-readme', 'C:/windows')).toContain(
      'drive-letter',
    );
    expect(validateSymlinkTarget('assets/link-to-readme', '../../escape')).toContain('escapes');
    expect(validateSymlinkTarget('link', '../outside')).toContain('escapes');
  });
});
