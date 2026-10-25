#!/usr/bin/env bun
/**
 * `provenance-verify` — the cheap, always-on ledger gate.
 *
 * Replay reconstructs a tree from `(repo, SHA) + patches/series + RENAMES.json`
 * and is the expensive proof. This module asks the cheaper question on every
 * commit: does the committed ledger still describe the worktree and the index,
 * and does every divergence from upstream have a patch that explains it?
 *
 * It reads the ledger and the local repository only: no network access, no
 * remote query, and no dependency on the gitignored cache directory that holds
 * the upstream mirrors. The gate must run on a machine that has never
 * populated that cache, or it is a gate people disable (DEC-02). `git cat-file
 * blob` reads this repository's own object database and is the one git read
 * that is allowed.
 *
 * Findings use one fixed vocabulary, one line each:
 *
 *   MODIFIED <path>              worktree bytes or staged oid differ
 *   ADDED <path>                 index holds a path the manifest does not
 *   REMOVED <path>               manifest lists a path the index does not hold
 *   MODE <path> <want> -> <got>  index mode differs from the manifest
 *   TAMPERED <ledger-path>       a ledger file no longer hashes to its record
 *   MISSING <ledger-path>        a required ledger file is absent
 *   EXCLUDED-PRESENT <path>      an excluded path is present anyway
 *   GITLINK <path>               a subrepository indicator in the vendored tree
 *   UNRECORDED <path>            a divergence no patch in `series` explains
 *
 * Exit 0 clean, 1 when any finding exists, 2 on a malformed ledger.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  ledgerPaths,
  listLedgerTrees,
  readUpstreamLedger,
  relativePosix,
  type LedgerPaths,
  type UpstreamLedger,
} from './ledger';
import {
  comparePaths,
  hashBlob,
  hashFile,
  isLedgerPath,
  manifestBodyDigest,
  readManifest,
  type ManifestRow,
} from './manifest';
import { globToRegExp, ProvenanceError } from './paths';
import { readIndexRowsAt, type IndexRow } from './stage';

/** Print at most this many finding lines, then `... <n> more`. */
const FINDING_CAP = 200;

/** The fixed finding vocabulary, shared with the drift suites. */
export const FINDING_TOKENS = [
  'MODIFIED',
  'ADDED',
  'REMOVED',
  'MODE',
  'TAMPERED',
  'MISSING',
  'EXCLUDED-PRESENT',
  'GITLINK',
  'UNRECORDED',
] as const;

/** True for a rendered finding line, false for `VERIFY OK`/`... more` lines. */
export function isFindingLine(line: string): boolean {
  return FINDING_TOKENS.some((token) => line.startsWith(`${token} `));
}

export type VerifyResult = {
  tree: string;
  /** Files the vendored manifest accounts for. */
  files: number;
  /** 0 clean, 1 findings, 2 malformed ledger. */
  exitCode: 0 | 1 | 2;
  /** Every finding line, uncapped, in a deterministic order. */
  findings: string[];
  /** Set when the ledger itself could not be read; `findings` is then empty. */
  malformed: string | null;
};

/** The ledger documents every tree must carry (plan 01-03). */
function requiredLedgerFiles(ledger: LedgerPaths): string[] {
  return [
    ledger.upstream,
    ledger.excludes,
    ledger.renames,
    ledger.paths,
    ledger.manifestUpstream,
    ledger.manifestVendored,
    ledger.series,
  ];
}

function malformedResult(tree: string, error: unknown): VerifyResult {
  const message = error instanceof Error ? error.message : String(error);
  return { tree, files: 0, exitCode: 2, findings: [], malformed: message };
}

/** Series entries in file order, comments and blank lines dropped. */
function seriesEntries(seriesFile: string): string[] {
  return readFileSync(seriesFile, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/**
 * Decode one side of a `diff --git` header. Git quotes a path (C-style, octal
 * escapes for non-ASCII bytes) whenever it contains a space, a quote or a byte
 * outside ASCII, so the raw token is only the path when it is unquoted.
 */
function decodeGitPath(token: string): string | null {
  if (!token.startsWith('"')) return token.length === 0 ? null : token;
  if (token.length < 2 || !token.endsWith('"')) return null;
  const body = token.slice(1, -1);
  const bytes: number[] = [];
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char !== '\\') {
      bytes.push(...Buffer.from(char, 'utf8'));
      continue;
    }
    index += 1;
    if (index >= body.length) return null;
    const escaped = body[index];
    const simple: Record<string, number> = {
      a: 0x07,
      b: 0x08,
      t: 0x09,
      n: 0x0a,
      v: 0x0b,
      f: 0x0c,
      r: 0x0d,
      '"': 0x22,
      '\\': 0x5c,
    };
    const direct = simple[escaped];
    if (direct !== undefined) {
      bytes.push(direct);
      continue;
    }
    if (!/[0-7]/.test(escaped)) return null;
    let octal = escaped;
    while (octal.length < 3 && index + 1 < body.length && /[0-7]/.test(body[index + 1])) {
      index += 1;
      octal += body[index];
    }
    bytes.push(Number.parseInt(octal, 8) & 0xff);
  }
  return Buffer.from(bytes).toString('utf8');
}

/** Every path a patch touches, from its `diff --git a/<p> b/<p>` headers. */
function patchPaths(text: string): string[] {
  const paths: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('diff --git ')) continue;
    const match = /^diff --git (".*"|a\/\S*) (".*"|b\/\S*)$/.exec(line);
    if (match === null) continue;
    for (const side of [match[1], match[2]]) {
      const decoded = decodeGitPath(side);
      if (decoded === null) continue;
      paths.push(decoded.replace(/^[ab]\//, ''));
    }
  }
  return paths;
}

/**
 * PITFALLS P-10 / P4: a vendored path that diverges from `MANIFEST.upstream.tsv`
 * must be named by at least one patch in `series`. A divergence no patch
 * explains is an unrecorded edit — the failure mode a hand edit reaches the
 * commit through when nothing compares it.
 *
 * `patchSeries` holds the resolved patch file paths in series order (comments
 * already dropped). No patch is applied here: the detector reads headers only.
 * `vendoredManifest` is the effective vendored state — for `verify` that is the
 * index overlaid with the worktree hash, so an unstaged edit is visible too.
 */
export function findUnrecordedEdits(
  tree: string,
  patchSeries: readonly string[],
  upstreamManifest: readonly ManifestRow[],
  vendoredManifest: readonly ManifestRow[],
): string[] {
  const patched = new Set<string>();
  for (const patchFile of patchSeries) {
    for (const path of patchPaths(readFileSync(patchFile, 'utf8'))) patched.add(path);
  }

  const upstream = new Map(upstreamManifest.map((row) => [row.path, row]));
  const unrecorded: string[] = [];
  for (const row of vendoredManifest) {
    const want = upstream.get(row.path);
    const differs =
      want === undefined ||
      want.mode !== row.mode ||
      want.oid !== row.oid ||
      want.sha256 !== row.sha256;
    if (!differs || patched.has(row.path)) continue;
    unrecorded.push(row.path);
  }
  return unrecorded.sort(comparePaths);
}

/** An exclude rule this reader can use: the glob is the only field it needs. */
function isGlobRule(rule: unknown): rule is { glob: string } {
  return (
    typeof rule === 'object' && rule !== null && 'glob' in rule && typeof rule.glob === 'string'
  );
}

/** Exclude globs from a parsed `EXCLUDES.json`, ignoring shapes it cannot use. */
function excludeGlobsOf(document: unknown): string[] {
  if (typeof document !== 'object' || document === null) return [];
  if (!('rules' in document) || !Array.isArray(document.rules)) return [];
  return document.rules.filter(isGlobRule).map((rule) => rule.glob);
}

/**
 * The working-tree hash of one index row. A `120000` entry is hashed from its
 * stored link text (`git cat-file blob`), never from the worktree, because
 * Windows may materialize the link; every other mode hashes raw file bytes.
 * `null` means the worktree file is absent or unreadable.
 */
function hashLiveRow(baseDir: string, root: string, row: IndexRow): string | null {
  try {
    if (row.mode === '120000') return hashBlob(row.oid, baseDir);
    return hashFile(join(root, ...row.path.split('/')));
  } catch {
    return null;
  }
}

/**
 * Blob OIDs git would store for these worktree paths with the repository's
 * attribute filters applied — the question `git status` answers. A vendored
 * tree carries upstream's own `.gitattributes` (`*.ps1 text eol=crlf`,
 * `*.cmd text eol=crlf`), so a fresh clone materializes CRLF bytes for an LF
 * blob; that is git's storage contract, not a HALO edit. Chunked argv, never a
 * shell: these paths hold spaces and non-ASCII bytes.
 */
function storedBlobOids(baseDir: string, repoPaths: readonly string[]): string[] {
  const oids: string[] = [];
  const CHUNK = 64;
  for (let start = 0; start < repoPaths.length; start += CHUNK) {
    const output = execFileSync(
      'git',
      ['hash-object', '--', ...repoPaths.slice(start, start + CHUNK)],
      { cwd: baseDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    for (const line of output.split('\n')) {
      const oid = line.trim();
      if (oid.length > 0) oids.push(oid);
    }
  }
  return oids;
}

/**
 * Verify one tree: ledger digests, then the vendored index and worktree, then
 * the unrecorded-edit detector. A tampered ledger stops before any per-file
 * comparison, so the report always names the cause rather than its effects.
 */
export function verifyTree(baseDir: string, tree: string): VerifyResult {
  const ledger = ledgerPaths(baseDir, tree);
  const rel = (file: string) => relativePosix(baseDir, file);

  // (5) A missing ledger file is a finding, never a skip: a tree whose ledger
  // half-exists must not verify clean because the checker shrugged.
  const missing = requiredLedgerFiles(ledger)
    .filter((file) => !existsSync(file))
    .map((file) => `MISSING ${rel(file)}`);
  if (missing.length > 0) {
    return { tree, files: 0, exitCode: 1, findings: missing, malformed: null };
  }

  // (1) Read the ledger documents. Anything unparsable is a malformed ledger
  // (exit 2), not drift: the operator has to repair the file, not the tree.
  let document: UpstreamLedger;
  let upstreamText: string;
  let vendoredText: string;
  let excludesDocument: unknown;
  try {
    document = readUpstreamLedger(baseDir, tree);
    upstreamText = readFileSync(ledger.manifestUpstream, 'utf8');
    vendoredText = readFileSync(ledger.manifestVendored, 'utf8');
    excludesDocument = JSON.parse(readFileSync(ledger.excludes, 'utf8'));
    JSON.parse(readFileSync(ledger.renames, 'utf8'));
    JSON.parse(readFileSync(ledger.paths, 'utf8'));
  } catch (error) {
    return malformedResult(tree, error);
  }

  const repo = document.repo;
  if (typeof repo !== 'string' || !/^https:\/\//.test(repo)) {
    return malformedResult(tree, new ProvenanceError(`upstream repo is not https: ${String(repo)}`, 2));
  }
  if (document.subtree !== tree) {
    return malformedResult(
      tree,
      new ProvenanceError(`ledger subtree ${String(document.subtree)} is not ${tree}`, 2),
    );
  }

  // (2) All four recorded digests, before any per-file comparison. Drift in an
  // exclude or rename map is exactly as invisible as manifest tampering, and a
  // forged manifest digest would excuse every downstream difference (T-1-18).
  const tampered: string[] = [];
  try {
    if (manifestBodyDigest(upstreamText) !== document.manifests.upstream_sha256) {
      tampered.push(rel(ledger.manifestUpstream));
    }
    if (manifestBodyDigest(vendoredText) !== document.manifests.vendored_sha256) {
      tampered.push(rel(ledger.manifestVendored));
    }
  } catch (error) {
    return malformedResult(tree, error);
  }
  if (hashFile(ledger.excludes) !== document.excludes_sha256) tampered.push(rel(ledger.excludes));
  if (hashFile(ledger.renames) !== document.renames_sha256) tampered.push(rel(ledger.renames));
  if (tampered.length > 0) {
    return {
      tree,
      files: 0,
      exitCode: 1,
      findings: tampered.map((file) => `TAMPERED ${file}`),
      malformed: null,
    };
  }

  let upstreamRows: ManifestRow[];
  let vendoredRows: ManifestRow[];
  try {
    upstreamRows = readManifest(upstreamText);
    vendoredRows = readManifest(vendoredText);
  } catch (error) {
    return malformedResult(tree, error);
  }

  const findings: string[] = [];
  const root = ledger.root;

  // (7) No nested repository may ride along: a `.git` directory or a
  // `.gitmodules` file turns a vendored subtree into a window on someone
  // else's history, which the provenance record cannot describe.
  if (existsSync(join(root, '.git'))) findings.push(`GITLINK vendor/${tree}/.git`);
  if (existsSync(join(root, '.gitmodules'))) findings.push(`GITLINK vendor/${tree}/.gitmodules`);

  // (3) The index, filtered through the same predicate the manifest writer
  // used — otherwise every `provenance/` file is reported as `ADDED`.
  let indexRows: IndexRow[];
  try {
    indexRows = readIndexRowsAt(baseDir, `vendor/${tree}`).filter(
      (row) => !isLedgerPath(row.path),
    );
  } catch (error) {
    return malformedResult(tree, error);
  }

  // (6) An excluded path that is present anyway is drift, not a curiosity.
  const excludeMatchers = excludeGlobsOf(excludesDocument).map(globToRegExp);

  const manifestByPath = new Map(
    vendoredRows.filter((row) => !isLedgerPath(row.path)).map((row) => [row.path, row]),
  );
  const indexByPath = new Map(indexRows.map((row) => [row.path, row]));
  const paths = [...new Set([...manifestByPath.keys(), ...indexByPath.keys()])].sort(comparePaths);

  const liveRows: ManifestRow[] = [];
  const transformSuspects: { liveIndex: number; full: string; want: ManifestRow }[] = [];
  for (const path of paths) {
    const want = manifestByPath.get(path);
    const got = indexByPath.get(path);
    const full = `vendor/${tree}/${path}`;

    if (got === undefined) {
      findings.push(`REMOVED ${full}`);
      continue;
    }
    if (got.mode === '160000') {
      findings.push(`GITLINK ${full}`);
      continue;
    }

    const sha256 = hashLiveRow(baseDir, root, got);
    liveRows.push({ mode: got.mode, oid: got.oid, sha256: sha256 ?? '-', path });

    if (want === undefined) {
      const excluded = excludeMatchers.some((matcher) => matcher.test(path));
      findings.push(excluded ? `EXCLUDED-PRESENT ${full}` : `ADDED ${full}`);
      continue;
    }
    if (want.mode !== got.mode) {
      findings.push(`MODE ${full} ${want.mode} -> ${got.mode}`);
      continue;
    }
    if (want.oid !== got.oid) {
      findings.push(`MODIFIED ${full}`);
      continue;
    }
    // (4) Working-tree bytes, not the staged oid: an unstaged edit is exactly
    // the drift a commit would otherwise carry silently. A mismatch is held
    // back for git's own verdict, because a checkout-time attribute transform
    // also changes the raw bytes (see `storedBlobOids`).
    if (sha256 === null) findings.push(`MODIFIED ${full}`);
    else if (sha256 !== want.sha256) {
      transformSuspects.push({ liveIndex: liveRows.length - 1, full, want });
    }
  }

  if (transformSuspects.length > 0) {
    let stored: string[] = [];
    try {
      stored = storedBlobOids(baseDir, transformSuspects.map((suspect) => suspect.full));
    } catch {
      stored = [];
    }
    for (const [index, suspect] of transformSuspects.entries()) {
      if (stored[index] === suspect.want.oid) {
        // The worktree holds exactly the recorded content under git's filters;
        // recording it keeps the unrecorded-edit detector from re-reporting it.
        liveRows[suspect.liveIndex].sha256 = suspect.want.sha256;
      } else {
        findings.push(`MODIFIED ${suspect.full}`);
      }
    }
  }

  // Series entries resolve against the ledger's own patches directory. A
  // missing patch is reported instead of silently narrowing the detector:
  // every path a missing patch touched would otherwise look unrecorded.
  const patchFiles: string[] = [];
  let patchMissing = false;
  for (const entry of seriesEntries(ledger.series)) {
    const patchFile = join(ledger.patchesDir, entry);
    if (!existsSync(patchFile)) {
      findings.push(`MISSING ${rel(patchFile)}`);
      patchMissing = true;
      continue;
    }
    patchFiles.push(patchFile);
  }
  if (!patchMissing) {
    for (const path of findUnrecordedEdits(tree, patchFiles, upstreamRows, liveRows)) {
      findings.push(`UNRECORDED vendor/${tree}/${path}`);
    }
  }

  const files = manifestByPath.size;
  return {
    tree,
    files,
    exitCode: findings.length > 0 ? 1 : 0,
    findings,
    malformed: null,
  };
}

export const USAGE = 'usage: verify.ts [--all | --tree <name>]';

export type VerifyOptions = { all: boolean; tree: string | null };

export function parseArgs(argv: readonly string[]): VerifyOptions | null {
  let all = false;
  let tree: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--all') {
      all = true;
    } else if (arg === '--tree') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new ProvenanceError('missing value for --tree', 2);
      }
      tree = value;
      index += 1;
    } else {
      throw new ProvenanceError(`unknown option: ${arg}`, 2);
    }
  }
  if (!all && tree === null) return null;
  return { all, tree };
}

/**
 * The CLI entry, and the surface the drift suites assert an exit code through.
 * `baseDir` defaults to the repository this file lives in, so the pre-commit
 * hook and CI invoke the identical path.
 */
export function main(argv: readonly string[], baseDir?: string): number {
  const root = baseDir ?? resolve(import.meta.dir, '..', '..');
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  let options: VerifyOptions | null;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof ProvenanceError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return error.code;
    }
    throw error;
  }
  if (options === null) {
    process.stderr.write(USAGE + '\n');
    return 2;
  }

  const trees = options.all ? listLedgerTrees(root) : [options.tree as string];
  if (trees.length === 0) {
    process.stderr.write('verify: no ledger trees under vendor/\n');
    return 2;
  }

  let exitCode = 0;
  let printed = 0;
  let suppressed = 0;
  for (const tree of trees) {
    const result = verifyTree(root, tree);
    if (result.malformed !== null) {
      process.stderr.write(`verify: malformed ledger (${tree}): ${result.malformed}\n`);
      exitCode = Math.max(exitCode, 2);
      continue;
    }
    for (const finding of result.findings) {
      if (printed < FINDING_CAP) {
        process.stdout.write(`${finding}\n`);
        printed += 1;
      } else {
        suppressed += 1;
      }
    }
    if (result.exitCode === 0) {
      process.stdout.write(`VERIFY OK ${tree} files=${result.files}\n`);
    }
    exitCode = Math.max(exitCode, result.exitCode);
  }
  if (suppressed > 0) process.stdout.write(`... ${suppressed} more\n`);
  return exitCode;
}

if (import.meta.main) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof ProvenanceError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(error.code);
    }
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(2);
  }
}
