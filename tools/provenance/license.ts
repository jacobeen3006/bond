/**
 * Licence pinning and the rebrand deny-list — one matcher, two callers.
 *
 * MIT's obligation is that the copyright notice and permission text travel with
 * the work, and PITFALLS P-02 records the failure mode: a bulk
 * `s/hermes/halo/gi` pass leaves a notice that still says MIT but no longer
 * identifies the work. So the *same* path predicate decides
 *
 *   1. what `collectLicenseFiles` pins into `UPSTREAM.json.license.files`, and
 *   2. what `shouldRewrite` refuses to let any future rewriter touch.
 *
 * Two predicates would drift and the least-tested one would be the one guarding
 * attribution, so `isLicensePath` is the only implementation of "licence-ish"
 * in the tool.
 *
 * Two rules this module never bends:
 *
 * - Identity is raw-byte SHA-256. No newline normalization, no BOM stripping,
 *   no Unicode normalization, no text decode. A CRLF-converted licence is a
 *   different licence (IMPT-02/encoding), and a `git show`-through-filter read
 *   would hide exactly that.
 * - The third-party notice token treats `-` and `_` as equivalent. oh-my-pi
 *   ships `THIRD-PARTY-NOTICES.txt`; a matcher that only knows the underscore
 *   spelling misses the one real notice file in the import, and the omission is
 *   invisible because nothing fails.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { comparePaths, hashBytes, type ManifestRow } from './manifest';
import { ProvenanceError } from './paths';

/** Basename prefixes that make a path licence-ish, matched case-insensitively. */
const LICENCE_TOKENS: readonly string[] = ['license', 'notice', 'copyright', 'copying'];

/** The third-party notice token, with `-` and `_` equivalent (`THIRD-PARTY`, `THIRD_PARTY`). */
const THIRD_PARTY_TOKENS: readonly string[] = ['third-party', 'third_party'];

/** The repository root this tool lives two levels below. */
const REPO_ROOT = join(import.meta.dir, '..', '..');

export const DEFAULT_DENYLIST_PATH = join(REPO_ROOT, 'provenance', 'rebrand-denylist.json');

/**
 * True when any path segment is licence-ish.
 *
 * `LICENSE*`, `NOTICE*`, `COPYRIGHT*`, `COPYING*` and the third-party notice
 * token are matched at every depth, not only at the root, because a `NOTICE`
 * sitting next to a nested `LICENSE` can drift just as far (IMPT-02/adjacency).
 * The match is deliberately a prefix rather than an exact filename: upstream
 * ships `LICENSE.md`, `LICENSE.txt`, `LICENSE-MIT`, `LICENSE.HDiffPatch` and
 * `NOTICE` with no extension, and an exact list would silently miss the next
 * one. Over-inclusion is the safe direction here — the cost is that a source
 * file whose name begins with `license` or `notice` (for example
 * `packages/coding-agent/src/cli/license.ts`) is pinned and denied too.
 */
export function isLicensePath(relPath: string): boolean {
  for (const segment of relPath.split('/')) {
    if (segment.length === 0) continue;
    const lower = segment.toLowerCase();
    if (LICENCE_TOKENS.some((token) => lower.startsWith(token))) return true;
    if (THIRD_PARTY_TOKENS.some((token) => lower.startsWith(token))) return true;
  }
  return false;
}

export type LicenseFileEntry = {
  /** POSIX path relative to the subtree root, exactly as the manifest records it. */
  path: string;
  /** 40-hex blob OID from `MANIFEST.upstream.tsv`. */
  blob: string;
  /** 64-hex SHA-256 over the raw bytes read from disk. */
  sha256: string;
};

/**
 * Every licence-ish path in an upstream manifest, pinned by blob OID and
 * raw-byte SHA-256.
 *
 * The candidate set comes from the manifest rather than a directory walk, so a
 * file that a future `.gitignore` or attribute filter hides from a walk is still
 * pinned. `readRawBytes` is injected because only the caller knows where the
 * tree is mounted; it must return the file's bytes unmodified.
 *
 * Ordering is by raw path bytes (IMPT-02/ordering), matching every other
 * document this tool emits.
 */
export function collectLicenseFiles(
  upstreamManifestRows: readonly ManifestRow[],
  readRawBytes: (relPath: string) => Buffer,
): LicenseFileEntry[] {
  const files = upstreamManifestRows
    .filter((row) => isLicensePath(row.path))
    .slice()
    .sort((a, b) => comparePaths(a.path, b.path))
    .map((row) => ({
      path: row.path,
      blob: row.oid,
      sha256: hashBytes(readRawBytes(row.path)),
    }));

  // IMPT-02/empty: an import with no licence file has no notice to travel with
  // the work, so it fails before any ledger is written.
  if (files.length === 0) {
    throw new ProvenanceError('license: no LICENSE file', 2);
  }
  return files;
}

const COPYRIGHT_BYTES = Buffer.from('copyright', 'ascii');

/** ASCII case-insensitive byte scan; a UTF-8 decode could hide a BOM or a re-encoding. */
function containsCopyright(bytes: Buffer): boolean {
  const limit = bytes.length - COPYRIGHT_BYTES.length;
  for (let start = 0; start <= limit; start += 1) {
    let matched = true;
    for (let offset = 0; offset < COPYRIGHT_BYTES.length; offset += 1) {
      const byte = bytes[start + offset];
      const lowered = byte >= 0x41 && byte <= 0x5a ? byte + 0x20 : byte;
      if (lowered !== COPYRIGHT_BYTES[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

/**
 * Number of lines carrying a `copyright` mention across the pinned files,
 * counted once over raw bytes.
 *
 * Lines, not occurrences: the IMPT-02/ordering edge pins a count that can be
 * recomputed by anyone holding the bytes, and a per-line count is stable under
 * holder lists that wrap differently from one another.
 */
export function countCopyrightNotices(contents: readonly (Buffer | string)[]): number {
  let count = 0;
  for (const content of contents) {
    const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    let lineStart = 0;
    for (let index = 0; index <= bytes.length; index += 1) {
      if (index !== bytes.length && bytes[index] !== 0x0a) continue;
      if (containsCopyright(bytes.subarray(lineStart, index))) count += 1;
      lineStart = index + 1;
    }
  }
  return count;
}

/** One pinned set of licence files plus its notice count, read exactly once. */
export type LicenseBlock = {
  files: LicenseFileEntry[];
  copyright_notice_count: number;
};

/** `collectLicenseFiles` and `countCopyrightNotices` over one byte cache. */
export function buildLicenseBlock(
  upstreamManifestRows: readonly ManifestRow[],
  readRawBytes: (relPath: string) => Buffer,
): LicenseBlock {
  const bytesByPath = new Map<string, Buffer>();
  const reader = (relPath: string): Buffer => {
    let bytes = bytesByPath.get(relPath);
    if (bytes === undefined) {
      bytes = readRawBytes(relPath);
      bytesByPath.set(relPath, bytes);
    }
    return bytes;
  };

  const files = collectLicenseFiles(upstreamManifestRows, reader);
  return {
    files,
    copyright_notice_count: countCopyrightNotices(files.map((file) => reader(file.path))),
  };
}

/** Raw-byte reader for a tree mounted at `root`. */
export function treeReader(root: string): (relPath: string) => Buffer {
  return (relPath: string) => readFileSync(join(root, ...relPath.split('/')));
}

// ---------------------------------------------------------------------------
// The deny-list contract
// ---------------------------------------------------------------------------

export type DenylistGlob = {
  glob: string;
  reason: string;
  /**
   * `false` declares a defensive spelling that may legitimately match no
   * imported path today. Defaults to `true`, so an unqualified glob that stops
   * matching is a dead guard and `denylist-check` fails.
   */
  expect_match?: boolean;
};

export type DenylistNeverWritten = {
  glob: string;
  reason: string;
};

export type Denylist = {
  schema: 'halo/denylist/v1';
  version: number;
  globs: DenylistGlob[];
  fields: string[];
  field_pointers: string[];
  paths_never_written: DenylistNeverWritten[];
};

/** A deny-list that cannot be enforced is worse than none: refuse it early. */
function assertDenylistShape(value: unknown, source: string): Denylist {
  const fail = (detail: string): never => {
    throw new ProvenanceError(`invalid deny-list: ${source}: ${detail}`, 2);
  };
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('not an object');
  }
  const document = value as Record<string, unknown>;
  if (document.schema !== 'halo/denylist/v1') fail('schema is not halo/denylist/v1');
  if (typeof document.version !== 'number' || !Number.isInteger(document.version)) {
    fail('version is not an integer');
  }

  const globs = document.globs;
  if (!Array.isArray(globs) || globs.length === 0) fail('globs is not a non-empty array');
  for (const entry of globs as unknown[]) {
    if (typeof entry !== 'object' || entry === null) fail('glob entry is not an object');
    const { glob, reason, expect_match: expectMatch } = entry as Record<string, unknown>;
    if (typeof glob !== 'string' || glob.length === 0) fail('glob entry has no glob');
    if (typeof reason !== 'string' || reason.length === 0) fail(`glob ${String(glob)} has no reason`);
    if (expectMatch !== undefined && typeof expectMatch !== 'boolean') {
      fail(`glob ${String(glob)} has a non-boolean expect_match`);
    }
  }

  for (const key of ['fields', 'field_pointers'] as const) {
    const list = document[key];
    if (!Array.isArray(list) || list.length === 0) fail(`${key} is not a non-empty array`);
    for (const item of list as unknown[]) {
      if (typeof item !== 'string' || item.length === 0) fail(`${key} contains a non-string`);
    }
  }

  const never = document.paths_never_written;
  if (!Array.isArray(never) || never.length === 0) {
    fail('paths_never_written is not a non-empty array');
  }
  for (const entry of never as unknown[]) {
    if (typeof entry !== 'object' || entry === null) {
      fail('paths_never_written entry is not an object');
    }
    const { glob, reason } = entry as Record<string, unknown>;
    if (typeof glob !== 'string' || glob.length === 0) fail('paths_never_written has no glob');
    if (typeof reason !== 'string' || reason.length === 0) fail(`path ${String(glob)} has no reason`);
  }

  return document as unknown as Denylist;
}

let cachedDenylist: { path: string; document: Denylist } | null = null;

export function loadDenylist(filePath: string = DEFAULT_DENYLIST_PATH): Denylist {
  if (cachedDenylist !== null && cachedDenylist.path === filePath) return cachedDenylist.document;
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new ProvenanceError(
      `invalid deny-list: ${filePath}: ${(error as Error).message}`,
      2,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ProvenanceError(`invalid deny-list: ${filePath}: ${(error as Error).message}`, 2);
  }
  const document = assertDenylistShape(parsed, filePath);
  cachedDenylist = { path: filePath, document };
  return document;
}

/**
 * `-` and `_` are equivalent on both sides of every comparison, because the
 * third-party notice ships under both spellings and a matcher that knows only
 * one leaves the other exposed.
 */
function normalizeForGlob(text: string): string {
  return text.toLowerCase().replace(/_/g, '-');
}

const GLOB_CACHE = new Map<string, RegExp>();

function globToRegExp(glob: string): RegExp {
  const cached = GLOB_CACHE.get(glob);
  if (cached !== undefined) return cached;

  const pattern = normalizeForGlob(glob);
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        // `**/` matches zero or more whole directories, so `**/LICENSE*`
        // matches a root `LICENSE` as well as one nested three levels down.
        if (pattern[index + 2] === '/') {
          source += '(?:.*/)?';
          index += 2;
        } else {
          source += '.*';
          index += 1;
        }
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  source += '$';
  const regexp = new RegExp(source);
  GLOB_CACHE.set(glob, regexp);
  return regexp;
}

export function matchesGlob(glob: string, relPath: string): boolean {
  return globToRegExp(glob).test(normalizeForGlob(relPath.replace(/\\/g, '/')));
}

function pointerSegments(pointer: string): string[] {
  return pointer
    .toLowerCase()
    .replace(/^#/, '')
    .split(/[.#/]+/)
    .filter((segment) => segment.length > 0);
}

function lastSegment(value: string): string {
  const segments = value.toLowerCase().split(/[.#/]+/).filter(Boolean);
  return segments[segments.length - 1] ?? '';
}

/**
 * True when a manifest field is off limits, regardless of the file it lives in.
 *
 * The terminal key is matched against `fields` (`copyright`, `license`,
 * `licenses`, `authors`), and the declared pointer prefixes are matched
 * suffix-tolerantly: `package.json#author` denies `package.json#author` in any
 * directory, because a nested manifest carries the same attribution.
 */
export function isDeniedPointer(pointer: string, denylist: Denylist = loadDenylist()): boolean {
  const terminal = lastSegment(pointer);
  if (denylist.fields.some((field) => field.toLowerCase() === terminal)) return true;

  const pointerParts = pointerSegments(pointer);
  for (const declared of denylist.field_pointers) {
    const hash = declared.indexOf('#');
    if (hash === -1) continue;
    const declaredFile = lastSegment(declared.slice(0, hash));
    const declaredField = lastSegment(declared.slice(hash + 1));
    if (declaredField.length === 0) continue;
    if (!pointerParts.includes(declaredField)) continue;
    if (pointerParts.some((segment) => lastSegment(segment) === declaredFile)) return true;
  }
  return false;
}

/**
 * May a rewriter touch this path (and, when given, this manifest field)?
 *
 * Path-based by design: the answer must be available before any rewrite runs,
 * because a content heuristic cannot be trusted when the rebrand is a bulk
 * string replacement.
 */
export function shouldRewrite(
  relPath: string,
  fieldPointer?: string,
  denylist: Denylist = loadDenylist(),
): boolean {
  if (fieldPointer !== undefined && isDeniedPointer(fieldPointer, denylist)) return false;

  const path = relPath.replace(/\\/g, '/');
  for (const entry of denylist.paths_never_written) {
    if (matchesGlob(entry.glob, path)) return false;
  }
  for (const entry of denylist.globs) {
    if (matchesGlob(entry.glob, path)) return false;
  }
  return true;
}

export type DenylistReport = {
  /** Number of globs in the contract. */
  globs: number;
  /** Number of licence-ish paths across every imported tree. */
  licencePaths: number;
  /** Globs declared `expect_match` that match no imported path — a dead guard. */
  unmatched: string[];
  /** Licence-ish paths that no glob denies — a blind spot. */
  uncovered: string[];
  /** Declared-defensive globs that match nothing today; loud, not failing. */
  defensive: string[];
};

export class DenylistCoverageError extends ProvenanceError {
  readonly findings: string[];

  constructor(findings: string[]) {
    super(`deny-list coverage: ${findings.length} finding(s)`, 1);
    this.name = 'DenylistCoverageError';
    this.findings = findings;
  }
}

/**
 * Invariants the contract must satisfy against a concrete set of vendored paths
 * (`vendor/<tree>/<path>`). Never throws, so the caller can print every finding.
 */
export function inspectDenylistCoverage(
  treePaths: readonly string[],
  denylist: Denylist = loadDenylist(),
): DenylistReport {
  const unmatched: string[] = [];
  const defensive: string[] = [];
  for (const entry of denylist.globs) {
    const anyMatch = treePaths.some((path) => matchesGlob(entry.glob, path));
    if (anyMatch) continue;
    if (entry.expect_match === false) defensive.push(entry.glob);
    else unmatched.push(entry.glob);
  }

  const licencePaths = [...new Set(treePaths.filter((path) => isLicensePath(path)))].sort(
    comparePaths,
  );
  const uncovered = licencePaths.filter((path) => shouldRewrite(path, undefined, denylist));

  return {
    globs: denylist.globs.length,
    licencePaths: licencePaths.length,
    unmatched,
    uncovered,
    defensive,
  };
}

/**
 * `inspectDenylistCoverage` plus a hard failure when anything is wrong: an
 * unmatched glob is a guard that silently protects nothing, an uncovered
 * licence path is the blind spot the matcher would otherwise hide.
 */
export function assertDenylistCovers(
  treePaths: readonly string[],
  denylist: Denylist = loadDenylist(),
): DenylistReport {
  const report = inspectDenylistCoverage(treePaths, denylist);
  const findings = [
    ...report.unmatched.map((glob) => `unmatched glob: ${glob}`),
    ...report.uncovered.map((path) => `UNCOVERED ${path}`),
  ];
  if (findings.length > 0) throw new DenylistCoverageError(findings);
  return report;
}
