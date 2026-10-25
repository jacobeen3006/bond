/**
 * The canonical manifest — the only hashing/formatting implementation in the
 * tool. `stage.ts` (import + restage), `replay.ts`, and the tests all go
 * through these functions, so "import" and "replay" cannot diverge.
 *
 * Canonical form:
 *   #halo-manifest v1
 *   %06o<TAB><40-hex blob oid or -><TAB><64-hex sha256 of raw bytes><TAB><posix path>
 * Lines are LF-joined with a final LF, UTF-8, no BOM, sorted by the UTF-8 BYTES
 * of the path (Buffer.compare — never localeCompare).
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

export const MANIFEST_HEADER = '#halo-manifest v1';

export type ManifestRow = {
  /** six-digit octal git mode, e.g. `100644`, `100755`, `120000` */
  mode: string;
  /** 40-hex SHA-1 blob OID, or `-` when unknown */
  oid: string;
  /** 64-hex SHA-256 over the raw bytes */
  sha256: string;
  /** POSIX-separated path, relative to the subtree root */
  path: string;
};

export class ManifestError extends Error {
  readonly condition: string;

  constructor(condition: string, detail: string) {
    super(`manifest: ${condition}: ${detail}`);
    this.name = 'ManifestError';
    this.condition = condition;
  }
}

/** SHA-256 of raw file bytes. Never routed through a git filter. */
export function hashFile(filePath: string): string {
  return hashBytes(readFileSync(filePath));
}

export function hashBytes(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * SHA-256 of the bytes `git cat-file blob <oid>` emits.
 *
 * Required for mode `120000`: on Windows the worktree may hold a materialized
 * file rather than the stored link text, so the raw file bytes are the wrong
 * input. Also used for upstream rows whose blob lives in the partial cache.
 */
export function hashBlob(oid: string, cwd?: string): string {
  if (!/^[0-9a-f]{40}$/.test(oid)) {
    throw new ManifestError('invalid-oid', oid);
  }
  const bytes = execFileSync('git', ['cat-file', 'blob', oid], {
    cwd,
    maxBuffer: 512 * 1024 * 1024,
  });
  return hashBytes(bytes);
}

/**
 * SHA-256 of many blobs through one `git cat-file --batch` process per chunk.
 *
 * A 20k-file tree costs 20k process spawns through `hashBlob`, which dominates
 * an import on Windows; the batch output is parsed by byte offset because blob
 * contents may contain newlines.
 */
export function hashBlobs(oids: readonly string[], cwd?: string): Map<string, string> {
  for (const oid of oids) {
    if (!/^[0-9a-f]{40}$/.test(oid)) throw new ManifestError('invalid-oid', oid);
  }
  const result = new Map<string, string>();
  const CHUNK = 256;
  for (let start = 0; start < oids.length; start += CHUNK) {
    const batch = oids.slice(start, start + CHUNK);
    const output = execFileSync('git', ['cat-file', '--batch'], {
      cwd,
      input: `${batch.join('\n')}\n`,
      maxBuffer: 512 * 1024 * 1024,
    });
    let pos = 0;
    while (pos < output.length) {
      const headerEnd = output.indexOf(0x0a, pos);
      if (headerEnd === -1) throw new ManifestError('batch-header', `offset ${pos}`);
      const header = output.subarray(pos, headerEnd).toString('utf8').trim().split(' ');
      const [oid, type, size] = header;
      if (type !== 'blob' || size === undefined) {
        throw new ManifestError('batch-missing', `${oid} (${header.slice(1).join(' ')})`);
      }
      const bodyStart = headerEnd + 1;
      const length = Number(size);
      result.set(oid, hashBytes(output.subarray(bodyStart, bodyStart + length)));
      pos = bodyStart + length + 1;
    }
  }
  return result;
}

function normalizeMode(mode: string | number): string {
  const text = typeof mode === 'number' ? mode.toString(8) : String(mode);
  if (!/^[0-7]{6}$/.test(text)) {
    throw new ManifestError('invalid-mode', String(mode));
  }
  if (text !== '100644' && text !== '100755' && text !== '120000' && text !== '160000') {
    throw new ManifestError('invalid-mode', String(mode));
  }
  return text;
}

/** Render exactly one TSV line (no trailing newline). */
export function formatLine(
  mode: string | number,
  oid: string,
  sha256: string,
  path: string,
): string {
  const normalizedMode = normalizeMode(mode);
  if (oid !== '-' && !/^[0-9a-f]{40}$/.test(oid)) {
    throw new ManifestError('invalid-oid', oid);
  }
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new ManifestError('invalid-sha256', sha256);
  }
  if (typeof path !== 'string' || path.length === 0) {
    throw new ManifestError('empty-path', JSON.stringify(path));
  }
  if (path.includes('\t')) {
    throw new ManifestError('tab-in-path', path);
  }
  if (path.includes('\n') || path.includes('\r')) {
    throw new ManifestError('newline-in-path', JSON.stringify(path));
  }
  return `${normalizedMode}\t${oid}\t${sha256}\t${path}`;
}

/** Byte-order path comparator (unsigned UTF-8 bytes). */
export function comparePaths(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/** Sort rows by path bytes and render the canonical manifest text. */
export function renderManifest(rows: readonly ManifestRow[]): string {
  const entries = rows.map((row) => ({
    path: row.path,
    line: formatLine(row.mode, row.oid, row.sha256, row.path),
  }));
  entries.sort((a, b) => comparePaths(a.path, b.path));
  return `${MANIFEST_HEADER}\n${entries.map((entry) => `${entry.line}\n`).join('')}`;
}

export function writeManifest(rows: readonly ManifestRow[], filePath: string): string {
  const text = renderManifest(rows);
  writeFileSync(filePath, text, { encoding: 'utf8' });
  return text;
}

/**
 * SHA-256 of the manifest BODY (lines 2..n), which is what
 * `UPSTREAM.json.manifests.*_sha256` records. The header is structural and is
 * validated separately by `readManifest`.
 */
export function manifestBodyDigest(text: string): string {
  const headerEnd = text.indexOf('\n');
  if (headerEnd === -1) throw new ManifestError('missing-header', 'no newline after header');
  if (text.slice(0, headerEnd) !== MANIFEST_HEADER) {
    throw new ManifestError('missing-header', text.slice(0, headerEnd));
  }
  return hashBytes(text.slice(headerEnd + 1));
}

export function manifestFileDigest(filePath: string): string {
  return manifestBodyDigest(readFileSync(filePath, 'utf8'));
}

/** Parse a manifest back into rows, rejecting every non-canonical form. */
export function readManifest(text: string): ManifestRow[] {
  if (text.length === 0) throw new ManifestError('empty-manifest', 'no content');
  if (text.startsWith('\uFEFF')) throw new ManifestError('bom', 'manifest starts with a UTF-8 BOM');
  if (text.includes('\r')) throw new ManifestError('crlf', 'manifest contains CR bytes');
  if (!text.startsWith(`${MANIFEST_HEADER}\n`)) {
    throw new ManifestError(
      'missing-header',
      `expected first line ${JSON.stringify(MANIFEST_HEADER)}`,
    );
  }
  if (!text.endsWith('\n')) {
    throw new ManifestError('missing-final-newline', 'manifest must end with LF');
  }

  const body = text.slice(MANIFEST_HEADER.length + 1);
  if (body.length === 0) return [];

  const rows: ManifestRow[] = [];
  const seen = new Set<string>();
  for (const line of body.slice(0, -1).split('\n')) {
    const fields = line.split('\t');
    if (fields.length !== 4) {
      throw new ManifestError('field-count', `expected 4 tab-separated fields: ${line}`);
    }
    const [mode, oid, sha256, path] = fields;
    if (!/^[0-7]{6}$/.test(mode)) throw new ManifestError('invalid-mode', mode);
    if (oid !== '-' && !/^[0-9a-f]{40}$/.test(oid)) throw new ManifestError('invalid-oid', oid);
    if (!/^[0-9a-f]{64}$/.test(sha256)) throw new ManifestError('invalid-sha256', sha256);
    if (path.length === 0) throw new ManifestError('empty-path', line);
    if (seen.has(path)) throw new ManifestError('duplicate-path', path);
    seen.add(path);
    rows.push({ mode, oid, sha256, path });
  }

  for (let i = 1; i < rows.length; i += 1) {
    if (comparePaths(rows[i - 1].path, rows[i].path) > 0) {
      throw new ManifestError('unsorted', `${rows[i - 1].path} > ${rows[i].path}`);
    }
  }

  return rows;
}

export function readManifestFile(filePath: string): ManifestRow[] {
  return readManifest(readFileSync(filePath, 'utf8'));
}

/**
 * The single membership predicate: true for `provenance` and everything below
 * it. Both manifests exclude these rows by construction, so an empty patch
 * series yields byte equality rather than a filtered comparison.
 */
export function isLedgerPath(relPath: string): boolean {
  return relPath === 'provenance' || relPath.startsWith('provenance/');
}

/** `git ls-files -s` modes are authoritative; the manifest keeps them verbatim. */
export function modeString(mode: string): string {
  return normalizeMode(mode);
}
