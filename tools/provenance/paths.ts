/**
 * Path gate — the single pre-extraction safety checker for the provenance tool.
 *
 * `assertSafeArchiveEntries` is called on the `tar -tf` listing BEFORE `tar -x`
 * runs, because a `..` member overwrites files outside the target before any
 * post-hoc check could see it.
 *
 * Plan 01-02 extends this module with the Windows-representability findings
 * (reserved names, case collisions, trailing dot/space, length). It must not
 * create a second path checker.
 */

export type PathFindingKind =
  | 'absolute'
  | 'traversal'
  | 'unc'
  | 'ads'
  | 'backslash'
  | 'empty-segment';

export type PathFinding = {
  kind: PathFindingKind;
  path: string;
  segment?: string;
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
  readonly segment?: string;

  constructor(finding: PathFinding) {
    super(`unsafe archive path: ${finding.path}`, 2);
    this.name = 'PathGateError';
    this.kind = finding.kind;
    this.path = finding.path;
    this.segment = finding.segment;
  }
}

/**
 * Classify one path. Returns null when the path is relative, POSIX-separated,
 * free of `..`, `:` and `\\`, and has no empty segment.
 *
 * A leading `./` is stripped first; a single trailing `/` (directory entry as
 * printed by `tar -tf`) is ignored.
 */
export function inspectUnsafePath(rawPath: string): PathFinding | null {
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    return { kind: 'empty-segment', path: String(rawPath) };
  }

  let path = rawPath;
  while (path.startsWith('./')) path = path.slice(2);
  if (path.length === 0) return { kind: 'empty-segment', path: rawPath };

  if (path.startsWith('//')) return { kind: 'unc', path: rawPath };
  if (path.startsWith('/')) return { kind: 'absolute', path: rawPath };
  if (/^[A-Za-z]:/.test(path)) return { kind: 'absolute', path: rawPath };
  if (path.includes('\\')) return { kind: 'backslash', path: rawPath };
  if (path.includes(':')) return { kind: 'ads', path: rawPath };

  let body = path;
  if (body.endsWith('/')) body = body.slice(0, -1);
  if (body.length === 0) return { kind: 'empty-segment', path: rawPath };

  for (const segment of body.split('/')) {
    if (segment.length === 0) {
      return { kind: 'empty-segment', path: rawPath, segment };
    }
    if (segment === '..') {
      return { kind: 'traversal', path: rawPath, segment };
    }
  }

  return null;
}

/** Throw `PathGateError` on the first unsafe entry. Leaves the target untouched. */
export function assertSafeArchiveEntries(entries: readonly string[]): void {
  for (const entry of entries) {
    const finding = inspectUnsafePath(entry);
    if (finding) throw new PathGateError(finding);
  }
}

/** Split a `tar -tf` listing into entries, tolerating CRLF line endings. */
export function parseTarListing(listing: string): string[] {
  return listing
    .split('\n')
    .map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line))
    .filter((line) => line.length > 0);
}
