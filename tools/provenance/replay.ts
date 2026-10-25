/**
 * Reconstruction and drift reporting.
 *
 * `replay` rebuilds a tree from `(repo, SHA) + patches/series + RENAMES.json`
 * into a fresh temp directory and compares both manifests. It recomputes the
 * four ledger digests itself rather than delegating to `verify` (plan 01-08),
 * because a tampered manifest must fail replay on a machine that has never run
 * verify.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { cacheDir, commitPresent, git } from './fetch';
import {
  ledgerPaths,
  readUpstreamLedger,
  relativePosix,
  type ExcludesLedger,
  type RenamesLedger,
  type UpstreamLedger,
} from './ledger';
import {
  comparePaths,
  hashFile,
  manifestFileDigest,
  readManifestFile,
  type ManifestRow,
} from './manifest';
import {
  assertSafeArchiveEntries,
  globToRegExp,
  inspectUnsafePath,
  parseTarListing,
  ProvenanceError,
} from './paths';
import {
  assertNoGitlink,
  manifestRowsFromIndex,
  readIndexRowsAt,
  readTreeRows,
  repairModesAt,
  STAGING_ATTRIBUTES_VALUE,
  TAR_UTF8_OPTIONS,
  writeArchiveAttributes,
} from './stage';

const MAX_BUFFER = 512 * 1024 * 1024;
const DRIFT_CAP = 200;

export type ReplayResult = { tree: string; files: number };

type RenameRule = { id: string; kind: string; from?: string; to?: string };

function seriesEntries(seriesFile: string): string[] {
  return readFileSync(seriesFile, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/** Drop excluded paths from the worktree AND the index (P6: never silent). */
function applyExcludes(work: string, globs: readonly string[]): string[] {
  if (globs.length === 0) return [];
  const matchers = globs.map(globToRegExp);
  const removed: string[] = [];
  for (const row of readIndexRowsAt(work)) {
    if (!matchers.some((matcher) => matcher.test(row.path))) continue;
    rmSync(join(work, ...row.path.split('/')), { force: true });
    git(['rm', '--cached', '--quiet', '--ignore-unmatch', '--', row.path], work);
    removed.push(row.path);
  }
  return removed;
}

/** The file git names in its `error: <path>: ...` line, when it names one. */
function failingPatchPath(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('stderr' in error)) return null;
  const stderr = error.stderr;
  if (typeof stderr !== 'string' && !Buffer.isBuffer(stderr)) return null;
  const text = typeof stderr === 'string' ? stderr : stderr.toString('utf8');
  const match = /^error: (?:patch failed: )?(.+?):/m.exec(text);
  return match === null ? null : match[1];
}

function describeRow(row: ManifestRow | undefined): string {
  return row ? `${row.mode}:${row.sha256.slice(0, 16)}` : '-';
}

/** Print `path | expected | actual | kind`; returns the number of differences. */
function reportDrift(expected: readonly ManifestRow[], actual: readonly ManifestRow[]): number {
  const expectedByPath = new Map(expected.map((row) => [row.path, row]));
  const actualByPath = new Map(actual.map((row) => [row.path, row]));
  const paths = [...new Set([...expectedByPath.keys(), ...actualByPath.keys()])].sort(comparePaths);

  let count = 0;
  for (const path of paths) {
    const want = expectedByPath.get(path);
    const got = actualByPath.get(path);
    let kind = '';
    if (want && !got) kind = 'removed';
    else if (!want && got) kind = 'added';
    else if (want && got) {
      if (want.sha256 !== got.sha256) kind = 'modified';
      else if (want.mode !== got.mode) kind = 'mode';
    }
    if (!kind) continue;
    count += 1;
    if (count <= DRIFT_CAP) {
      process.stdout.write(`${path} | ${describeRow(want)} | ${describeRow(got)} | ${kind}\n`);
    }
  }
  if (count > DRIFT_CAP) process.stdout.write(`... ${count - DRIFT_CAP} more differences\n`);
  return count;
}

function sortedRows(rows: ManifestRow[]): ManifestRow[] {
  return rows.sort((a, b) => comparePaths(a.path, b.path));
}

/** `replay --tree <name>` — one tree, full reconstruction and comparison. */
export function replayTree(baseDir: string, tree: string): ReplayResult {
  const ledger = ledgerPaths(baseDir, tree);
  const required: [string, string][] = [
    [ledger.upstream, 'UPSTREAM.json'],
    [ledger.manifestUpstream, 'MANIFEST.upstream.tsv'],
    [ledger.manifestVendored, 'MANIFEST.vendored.tsv'],
    [ledger.excludes, 'EXCLUDES.json'],
    [ledger.renames, 'RENAMES.json'],
    [ledger.series, 'patches/series'],
  ];
  for (const [file] of required) {
    if (!existsSync(file)) {
      throw new ProvenanceError(`missing ledger: ${relativePosix(baseDir, file)}`, 2);
    }
  }

  const document: UpstreamLedger = readUpstreamLedger(baseDir, tree);
  const expectedUpstream = readManifestFile(ledger.manifestUpstream);
  const expectedVendored = readManifestFile(ledger.manifestVendored);
  const excludes = JSON.parse(readFileSync(ledger.excludes, 'utf8')) as ExcludesLedger;
  const renames = JSON.parse(readFileSync(ledger.renames, 'utf8')) as RenamesLedger;

  const tampered: string[] = [];
  if (manifestFileDigest(ledger.manifestUpstream) !== document.manifests.upstream_sha256) {
    tampered.push(relativePosix(baseDir, ledger.manifestUpstream));
  }
  if (manifestFileDigest(ledger.manifestVendored) !== document.manifests.vendored_sha256) {
    tampered.push(relativePosix(baseDir, ledger.manifestVendored));
  }
  if (hashFile(ledger.excludes) !== document.excludes_sha256) {
    tampered.push(relativePosix(baseDir, ledger.excludes));
  }
  if (hashFile(ledger.renames) !== document.renames_sha256) {
    tampered.push(relativePosix(baseDir, ledger.renames));
  }
  if (tampered.length > 0) {
    for (const file of tampered) process.stdout.write(`TAMPERED ${file}\n`);
    throw new ProvenanceError(`replay: tampered ledger (${tree})`, 1);
  }

  assertNoGitlink(baseDir, tree);

  const cache = cacheDir(baseDir, tree);
  if (!existsSync(cache)) {
    throw new ProvenanceError(`missing cache: upstream-cache/${tree}.git`, 2);
  }
  if (!commitPresent(cache, document.commit)) {
    throw new ProvenanceError(`pinned commit missing: ${document.commit}`, 2);
  }

  const scratchRoot = mkdtempSync(join(tmpdir(), `halo-replay-${tree}-`));
  const work = join(scratchRoot, 'tree');
  try {
    mkdirSync(work);
    const tarPath = join(scratchRoot, 'archive.tar');
    writeArchiveAttributes(cache);
    git(['archive', '--format=tar', `--output=${tarPath}`, document.commit], cache);
    const listing = execFileSync('tar', ['-tf', tarPath], {
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
    });
    assertSafeArchiveEntries(parseTarListing(listing));
    execFileSync('tar', ['-xf', tarPath, '-C', work, ...TAR_UTF8_OPTIONS], {
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
    });

    const treeRows = readTreeRows(cache, document.commit, false);
    git(['init', '-q', '.'], work);
    writeFileSync(join(work, '.git', 'info', 'attributes'), `${STAGING_ATTRIBUTES_VALUE}\n`, 'utf8');
    git(['add', '-A', '-f', '--', '.'], work);
    repairModesAt(work, treeRows, (oid) =>
      execFileSync('git', ['cat-file', 'blob', oid], { cwd: cache, maxBuffer: MAX_BUFFER }),
    );

    const excludeGlobs = (excludes.rules ?? []).map((rule: { glob: string }) => rule.glob);
    const excluded = new Set(applyExcludes(work, excludeGlobs));

    const reconstructedUpstream = sortedRows(
      manifestRowsFromIndex(work, readIndexRowsAt(work)).filter(
        (row) => !excluded.has(row.path),
      ),
    );
    const drift = reportDrift(
      expectedUpstream.filter((row) => !excluded.has(row.path)),
      reconstructedUpstream,
    );
    if (drift > 0) {
      throw new ProvenanceError(`replay: upstream manifest drift (${tree})`, 1);
    }

    const series = seriesEntries(ledger.series);
    for (let index = 0; index < series.length; index += 1) {
      const entry = series[index];
      const patchFile = join(ledger.patchesDir, entry);
      if (!existsSync(patchFile)) {
        throw new ProvenanceError(`series entry missing: ${entry}`, 2);
      }
      try {
        git(['apply', '--check', '--whitespace=nowarn', '-p1', patchFile], work);
        git(['apply', '--whitespace=nowarn', '-p1', patchFile], work);
      } catch (error) {
        // A reordered series is otherwise reported as an opaque git exit; name
        // the 1-based position and the entry so the operator edits `series`,
        // not the patch.
        const failing = failingPatchPath(error);
        process.stdout.write(
          `PATCH FAILED index=${index + 1} path=${entry}${failing === null ? '' : ` file=${failing}`}\n`,
        );
        throw new ProvenanceError(
          `replay: patch does not apply (${tree}): index=${index + 1} path=${entry}` +
            `${failing === null ? '' : ` file=${failing}`}`,
          1,
        );
      }
      git(['add', '-A', '-f', '--', '.'], work);
    }

    const pathRules = ((renames.rules ?? []) as RenameRule[])
      .filter((rule) => rule.kind === 'path')
      .sort((a, b) => comparePaths(a.id, b.id));
    for (const rule of pathRules) {
      for (const side of [rule.from, rule.to]) {
        if (typeof side !== 'string' || inspectUnsafePath(side)) {
          throw new ProvenanceError(`unsafe rename: ${rule.id}`, 2);
        }
      }
      try {
        git(['mv', '--', rule.from as string, rule.to as string], work);
      } catch {
        throw new ProvenanceError(`RENAME-TARGET ${rule.id}`, 1);
      }
      if (!existsSync(join(work, ...(rule.to as string).split('/')))) {
        throw new ProvenanceError(`RENAME-TARGET ${rule.id}`, 1);
      }
      git(['add', '-A', '-f', '--', '.'], work);
    }

    const reconstructedVendored = sortedRows(
      manifestRowsFromIndex(work, readIndexRowsAt(work)).filter((row) => !excluded.has(row.path)),
    );
    if (reconstructedVendored.length === 0) {
      throw new ProvenanceError('empty vendored tree', 1);
    }

    const vendoredDrift = reportDrift(
      expectedVendored.filter((row) => !excluded.has(row.path)),
      reconstructedVendored,
    );
    if (vendoredDrift > 0) {
      throw new ProvenanceError(`replay: vendored manifest drift (${tree})`, 1);
    }

    process.stdout.write(`REPLAY OK ${tree} files=${reconstructedVendored.length}\n`);
    return { tree, files: reconstructedVendored.length };
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true });
  }
}
