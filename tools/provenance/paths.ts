/**
 * Path gate — the single pre-extraction safety checker for the provenance tool.
 *
 * There are two entry points and one normalizer:
 *
 * - `assertSafeArchiveEntries` is the extraction-time hard stop. It is called
 *   on the `tar -tf` listing BEFORE `tar -x` runs, because a `..` member
 *   overwrites files outside the target before any post-hoc check could see it.
 * - `validateTreePaths` classifies a whole tree (from `git ls-tree`) and
 *   returns findings instead of throwing. It adds the Windows-representability
 *   classes to the same escape classes, so a case collision, a reserved device
 *   name, a trailing dot/space or an over-long path is refused before a single
 *   file is written to `vendor/`.
 *
 * Both entry points classify through `normalizeArchivePath`, so they can never
 * disagree about what counts as an escape.
 */

export type PathFindingKind =
  | 'absolute'
  | 'traversal'
  | 'unc'
  | 'ads'
  | 'backslash'
  | 'empty-segment'
  | 'reserved-name'
  | 'trailing-dot-space'
  | 'case-collision'
  | 'too-long';

export type Finding = {
  kind: PathFindingKind;
  path: string;
  detail: string;
};

/** The shared typed CLI error. `code` is the process exit code the CLI must use. */
export class ProvenanceError extends Error {
  readonly code: number;

  constructor(message: string, code = 2) {
    super(message);
    this.name = 'ProvenanceError';
    this.code = code;
  }
}

export class PathGateError extends ProvenanceError {
  readonly kind: PathFindingKind;
  readonly path: string;
  readonly detail: string;

  constructor(finding: Finding) {
    super(`unsafe archive path: ${finding.path}`, 2);
    this.name = 'PathGateError';
    this.kind = finding.kind;
    this.path = finding.path;
    this.detail = finding.detail;
  }
}

/**
 * `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, matched on the
 * segment's stem (the part before the first dot) so `NUL.tar.gz` is caught and
 * `CONTRACT.md` is not.
 */
const RESERVED_DEVICE_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`),
]);

export const DEFAULT_MAX_VENDORED_PATH_LENGTH = 240;

type NormalizedPath =
  | { ok: true; path: string; segments: string[] }
  | { ok: false; finding: Finding };

/**
 * The one normalization function. A leading `./` is stripped, a single
 * trailing `/` (directory entry as printed by `tar -tf`) is ignored, and every
 * escape class is rejected: UNC, absolute, drive-letter, backslash, ADS `:`,
 * empty segment and `..`.
 */
function normalizeArchivePath(rawPath: string): NormalizedPath {
  const reject = (kind: PathFindingKind, detail: string): NormalizedPath => ({
    ok: false,
    finding: { kind, path: String(rawPath), detail },
  });

  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    return reject('empty-segment', 'empty path');
  }

  let path = rawPath;
  while (path.startsWith('./')) path = path.slice(2);
  if (path.length === 0) return reject('empty-segment', 'path is only ./ prefixes');

  if (path.startsWith('//')) return reject('unc', 'UNC path');
  if (path.startsWith('/')) return reject('absolute', 'absolute POSIX path');
  if (/^[A-Za-z]:/.test(path)) return reject('absolute', 'drive-letter path');
  if (path.includes('\\')) return reject('backslash', 'backslash separator');
  if (path.includes(':')) return reject('ads', 'colon (alternate data stream)');

  let body = path;
  if (body.endsWith('/')) body = body.slice(0, -1);
  if (body.length === 0) return reject('empty-segment', 'empty path after trailing slash');

  const segments = body.split('/');
  for (const segment of segments) {
    if (segment.length === 0) return reject('empty-segment', 'empty path segment');
    if (segment === '..') return reject('traversal', 'parent-directory segment');
  }

  return { ok: true, path: body, segments };
}

/** Classify one path for the extraction-time escape classes. */
export function inspectUnsafePath(rawPath: string): Finding | null {
  const normalized = normalizeArchivePath(rawPath);
  return normalized.ok ? null : normalized.finding;
}

/** Throw `PathGateError` on the first unsafe entry. Leaves the target untouched. */
export function assertSafeArchiveEntries(entries: readonly string[]): void {
  for (const entry of entries) {
    const finding = inspectUnsafePath(entry);
    if (finding) throw new PathGateError(finding);
  }
}

export type ValidateTreeOptions = {
  /** Maximum length of `prefix + relativePath`; defaults to 240. */
  maxLength?: number;
  /** Local mount prefix, e.g. `vendor/<tree>/`. Defaults to the empty string. */
  prefix?: string;
};

/**
 * Classify every path in a tree. Returns findings and never throws.
 *
 * Length is measured on the full vendored path (`prefix + relative path`),
 * because that is the path NTFS must hold. `detail` always carries the
 * measured length so a refusal is actionable.
 */
export function validateTreePaths(
  paths: readonly string[],
  options: ValidateTreeOptions = {},
): Finding[] {
  const maxLength = options.maxLength ?? DEFAULT_MAX_VENDORED_PATH_LENGTH;
  const prefix = options.prefix ?? '';
  const findings: Finding[] = [];
  const caseGroups = new Map<string, string[]>();

  for (const rawPath of paths) {
    const normalized = normalizeArchivePath(rawPath);
    if (!normalized.ok) {
      findings.push(normalized.finding);
      continue;
    }

    for (const segment of normalized.segments) {
      const stem = segment.split('.')[0].toUpperCase();
      if (RESERVED_DEVICE_NAMES.has(stem)) {
        findings.push({
          kind: 'reserved-name',
          path: rawPath,
          detail: `reserved Windows device name: ${segment}`,
        });
      }
      if (/[. ]$/.test(segment)) {
        findings.push({
          kind: 'trailing-dot-space',
          path: rawPath,
          detail: `component ends with ${segment.endsWith('.') ? 'a dot' : 'a space'}: ${segment}`,
        });
      }
    }

    const measured = `${prefix}${normalized.path}`.length;
    if (measured > maxLength) {
      findings.push({
        kind: 'too-long',
        path: rawPath,
        detail: `length ${measured} exceeds ${maxLength}`,
      });
    }

    const key = normalized.path.toLowerCase();
    const group = caseGroups.get(key);
    if (group) group.push(rawPath);
    else caseGroups.set(key, [rawPath]);
  }

  for (const group of caseGroups.values()) {
    if (group.length < 2) continue;
    for (const rawPath of group) {
      findings.push({
        kind: 'case-collision',
        path: rawPath,
        detail: `case-insensitive collision: ${group.join(' and ')}`,
      });
    }
  }

  return findings;
}

const GLOB_CACHE = new Map<string, RegExp>();

/**
 * The one path-glob matcher for reader-facing path lists (the exclude rules and
 * the `provenance-where` watch paths). `**` spans directories, `*` does not,
 * `?` is one non-separator character, and everything else is literal. Case is
 * preserved: these globs name files, unlike the licence deny-list's
 * case-insensitive spelling matcher.
 */
export function globToRegExp(glob: string): RegExp {
  const cached = GLOB_CACHE.get(glob);
  if (cached !== undefined) return cached;

  let source = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === '*') {
      if (glob[index + 1] === '*') {
        source += '.*';
        index += 1;
        if (glob[index + 1] === '/') index += 1;
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  const regexp = new RegExp(`${source}$`);
  GLOB_CACHE.set(glob, regexp);
  return regexp;
}

/** Split a `tar -tf` listing into entries, tolerating CRLF line endings. */
export function parseTarListing(listing: string): string[] {
  return listing
    .split('\n')
    .map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line))
    .filter((line) => line.length > 0);
}
