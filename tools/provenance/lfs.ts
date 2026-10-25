#!/usr/bin/env bun
/**
 * LFS inventory — the pointer grammar, the inventory document, and the check
 * that no pointer was replaced by a payload.
 *
 * The inventory is derived from the upstream cache (`git lfs ls-files <sha>
 * --json --long --size`) plus the upstream `.gitattributes` at that commit;
 * nothing is fetched into `vendor/`. Pointer files are ordinary blobs, so the
 * vendored manifest already proves their bytes — this module adds the declared
 * `oid` and `size`, which is what makes a substituted payload detectable.
 *
 * Reconciliation (this plan's executed obligation): at a commit that tracks no
 * LFS object the inventory is legitimately empty, so `--check` asserts that the
 * inventory is *correct*, never that it is non-empty. The paths that
 * `.gitattributes` declares are still walked, which is what keeps an empty
 * `tracked` array from being a vacuous pass:
 *   - a pointer at a declared path that `tracked` omits is `unlisted-pointer`;
 *   - a payload at a declared path whose bytes differ from the upstream blob
 *     is `payload-in-vendor` — the exact signature of a fetch writing over a
 *     pointer — while a payload byte-identical to the upstream blob is the
 *     ordinary case of an upstream file committed before the attribute line.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { cacheDir, git } from './fetch';
import { readUpstreamLedger, serializeLedger } from './ledger';
import { comparePaths, hashBytes, hashFile, readManifestFile } from './manifest';
import { globToRegExp, ProvenanceError } from './paths';

export const LFS_SCHEMA = 'halo/lfs/v1';

/** The one canonical pointer version line; anything else is not a pointer. */
export const POINTER_VERSION = 'https://git-lfs.github.com/spec/v1';

/** Git LFS refuses (and downstream tools reject) pointer files of 1024 bytes or more. */
export const POINTER_MAX_BYTES = 1024;

export type LfsRecord = {
  path: string;
  oid: string;
  size: number;
  pointer_verified: boolean;
  object_verified: boolean;
};

export type LfsLedger = {
  schema: string;
  subtree: string;
  tracked: LfsRecord[];
  upstream_gitattributes_lfs_lines: string[];
};

export type Pointer = { version: string; oid: string; size: number };

export type PointerErrorCode =
  | 'too-large'
  | 'empty'
  | 'crlf'
  | 'not-a-pointer'
  | 'unsorted-keys'
  | 'duplicate-key'
  | 'missing-key'
  | 'bad-oid'
  | 'bad-size';

export type PointerParseResult =
  | { ok: true; pointer: Pointer }
  | { ok: false; code: PointerErrorCode; line: number; message: string };

export type LfsFindingKind =
  | 'missing'
  | 'payload-in-vendor'
  | 'oid-mismatch'
  | 'size-mismatch'
  | 'not-a-pointer'
  | 'unlisted-pointer';

export type LfsFinding = { kind: LfsFindingKind; path: string; detail: string };

/** The manifest identity of one path: what the import recorded for those bytes. */
export type BlobIdentity = { path: string; oid: string; sha256: string };

const OID_LINE = /^sha256:[0-9a-f]{64}$/;
const SIZE_VALUE = /^(0|[1-9][0-9]*)$/;

function fail(
  code: PointerErrorCode,
  line: number,
  message: string,
): { ok: false; code: PointerErrorCode; line: number; message: string } {
  return { ok: false, code, line, message };
}

/**
 * Parse one pointer blob against the documented grammar: the literal
 * `version <url>` line first, then `key SP value` lines whose keys are sorted
 * lexicographically (the spec's canonical form, which permits extension keys
 * after `oid` and `size`), LF endings, under 1024 bytes.
 *
 * A payload handed in here is not an exception — it is the finding a caller
 * must act on — so every rejection is a typed result naming the line.
 */
export function parsePointer(bytes: Buffer | string): PointerParseResult {
  const buffer = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes;
  if (buffer.length === 0) return fail('empty', 0, 'pointer is empty');
  if (buffer.length > POINTER_MAX_BYTES) {
    return fail(
      'too-large',
      0,
      `pointer is ${buffer.length} bytes (maximum ${POINTER_MAX_BYTES})`,
    );
  }

  const text = buffer.toString('utf8');
  const cr = text.indexOf('\r');
  if (cr !== -1) {
    return fail('crlf', text.slice(0, cr).split('\n').length, 'pointer contains CR bytes');
  }
  if (!text.endsWith('\n')) {
    return fail(
      'not-a-pointer',
      text.split('\n').length,
      'pointer must end with a single LF',
    );
  }

  const lines = text.slice(0, -1).split('\n');
  if (lines.length === 0 || lines[0] === '') return fail('empty', 0, 'pointer is empty');

  const headerSpace = lines[0].indexOf(' ');
  const headerKey = headerSpace === -1 ? lines[0] : lines[0].slice(0, headerSpace);
  if (headerSpace === -1 || headerKey !== 'version') {
    return fail('not-a-pointer', 1, `first line must be "version ${POINTER_VERSION}"`);
  }
  const version = lines[0].slice(headerSpace + 1);
  if (version !== POINTER_VERSION) {
    return fail('not-a-pointer', 1, `unsupported pointer version: ${version}`);
  }

  const values = new Map<string, { value: string; line: number }>();
  const keys: string[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    const space = line.indexOf(' ');
    if (space <= 0) {
      return fail('not-a-pointer', lineNumber, 'line is not "key value"');
    }
    const key = line.slice(0, space);
    if (values.has(key)) return fail('duplicate-key', lineNumber, `duplicate key: ${key}`);
    if (keys.length > 0 && Buffer.compare(Buffer.from(keys[keys.length - 1]), Buffer.from(key)) > 0) {
      return fail(
        'unsorted-keys',
        lineNumber,
        `key ${JSON.stringify(key)} sorts before ${JSON.stringify(keys[keys.length - 1])}`,
      );
    }
    keys.push(key);
    values.set(key, { value: line.slice(space + 1), line: lineNumber });
  }

  const oidEntry = values.get('oid');
  const sizeEntry = values.get('size');
  if (oidEntry === undefined) return fail('missing-key', 0, 'missing oid line');
  if (sizeEntry === undefined) return fail('missing-key', 0, 'missing size line');
  if (!OID_LINE.test(oidEntry.value)) {
    return fail('bad-oid', oidEntry.line, `oid must be sha256:<64 lowercase hex>: ${oidEntry.value}`);
  }
  if (!SIZE_VALUE.test(sizeEntry.value)) {
    return fail('bad-size', sizeEntry.line, `size must be a decimal integer: ${sizeEntry.value}`);
  }
  const size = Number(sizeEntry.value);
  if (!Number.isSafeInteger(size)) {
    return fail('bad-size', sizeEntry.line, `size is not a safe integer: ${sizeEntry.value}`);
  }

  return { ok: true, pointer: { version, oid: oidEntry.value, size } };
}

/** The glob patterns of the LFS-declaring lines, in file order. */
export function lfsAttributePatterns(lines: readonly string[]): string[] {
  const patterns: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '').trim();
    if (line === '' || line.startsWith('#')) continue;
    const [pattern, ...attributes] = line.split(/\s+/);
    const declaresLfs = attributes.some(
      (attribute) => attribute === 'filter=lfs' || attribute === 'diff=lfs',
    );
    if (declaresLfs) patterns.push(pattern);
  }
  return patterns;
}

/**
 * `.gitattributes` semantics: a pattern without a slash matches the basename at
 * any depth; a pattern with one matches the tree-relative path.
 */
export function matchesAttributePattern(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => {
    const regexp = globToRegExp(pattern);
    return pattern.includes('/') ? regexp.test(path) : regexp.test(basename(path));
  });
}

/** Every regular file under `root`, POSIX-separated, byte-sorted. `provenance/` is HALO's. */
function walkFiles(root: string): string[] {
  const found: string[] = [];
  const visit = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        if (prefix === '' && entry.name === 'provenance') continue;
        visit(join(dir, entry.name), relative);
      } else if (entry.isFile()) {
        found.push(relative);
      }
    }
  };
  if (!existsSync(root) || !statSync(root).isDirectory()) return found;
  visit(root, '');
  return found.sort(comparePaths);
}

function readMaybe(file: string): Buffer | null {
  try {
    return readFileSync(file);
  } catch {
    return null;
  }
}

/** A parsed JSON value, or null when it is not an object (arrays included). */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** The Git LFS object path for an oid, in the cache repo — never under `vendor/`. */
function objectPaths(cacheRepo: string, oid: string): string[] {
  const hex = oid.startsWith('sha256:') ? oid.slice('sha256:'.length) : oid;
  const tail = [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4)];
  return [
    join(cacheRepo, 'lfs', 'objects', ...tail),
    join(cacheRepo, '.git', 'lfs', 'objects', ...tail),
  ];
}

/** True only when the payload is in the cache AND its SHA-256 equals the oid. */
export function objectVerified(cacheRepo: string, oid: string): boolean {
  const want = oid.startsWith('sha256:') ? oid.slice('sha256:'.length) : oid;
  for (const candidate of objectPaths(cacheRepo, oid)) {
    if (!existsSync(candidate)) continue;
    try {
      return hashFile(candidate) === want;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Check one vendored tree against its inventory.
 *
 * `manifestRows` is the vendored manifest and `upstreamRows` the upstream one;
 * the declared-glob reconciliation needs the upstream identity to tell an
 * upstream payload apart from a fetched one, so a missing upstream row is
 * itself a finding rather than a pass.
 */
export function verifyTree(
  treeRoot: string,
  lfsJson: LfsLedger,
  manifestRows: readonly BlobIdentity[] = [],
  upstreamRows: readonly BlobIdentity[] = [],
): LfsFinding[] {
  const findings: LfsFinding[] = [];
  const trackedPaths = new Set<string>();
  const upstreamByPath = new Map(upstreamRows.map((row) => [row.path, row]));
  const vendoredByPath = new Map(manifestRows.map((row) => [row.path, row]));

  for (const record of lfsJson.tracked ?? []) {
    trackedPaths.add(record.path);
    const file = join(treeRoot, ...record.path.split('/'));
    const bytes = readMaybe(file);
    if (bytes === null) {
      findings.push({ kind: 'missing', path: record.path, detail: 'no file at the vendored path' });
      continue;
    }
    if (bytes.length > POINTER_MAX_BYTES) {
      findings.push({
        kind: 'payload-in-vendor',
        path: record.path,
        detail: `${bytes.length} bytes exceeds the ${POINTER_MAX_BYTES}-byte pointer limit`,
      });
      continue;
    }
    const parsed = parsePointer(bytes);
    if (!parsed.ok) {
      findings.push({
        kind: 'not-a-pointer',
        path: record.path,
        detail: `${parsed.code} at line ${parsed.line}: ${parsed.message}`,
      });
      continue;
    }
    if (parsed.pointer.oid !== record.oid) {
      findings.push({
        kind: 'oid-mismatch',
        path: record.path,
        detail: `recorded=${record.oid} pointer=${parsed.pointer.oid}`,
      });
    }
    if (parsed.pointer.size !== record.size) {
      findings.push({
        kind: 'size-mismatch',
        path: record.path,
        detail: `recorded=${record.size} pointer=${parsed.pointer.size}`,
      });
    }
  }

  // The declarations are checked even when `tracked` is empty: that is the
  // difference between an inventory that is correct and one that is vacuous.
  const patterns = lfsAttributePatterns(lfsJson.upstream_gitattributes_lfs_lines ?? []);
  for (const path of walkFiles(treeRoot)) {
    if (!matchesAttributePattern(path, patterns)) continue;
    if (trackedPaths.has(path)) continue;
    const bytes = readMaybe(join(treeRoot, ...path.split('/')));
    if (bytes === null) continue;
    const parsed = parsePointer(bytes);
    if (parsed.ok) {
      findings.push({
        kind: 'unlisted-pointer',
        path,
        detail: `pointer ${parsed.pointer.oid} is not in tracked[]`,
      });
      continue;
    }
    const upstream = upstreamByPath.get(path);
    if (upstream === undefined) {
      findings.push({
        kind: 'payload-in-vendor',
        path,
        detail: 'payload at an LFS-declared path with no upstream manifest row',
      });
      continue;
    }
    const local = hashBytes(bytes);
    if (local !== upstream.sha256) {
      findings.push({
        kind: 'payload-in-vendor',
        path,
        detail: `upstream=${upstream.sha256} local=${local}`,
      });
      continue;
    }
    const vendored = vendoredByPath.get(path);
    if (vendored !== undefined && vendored.oid !== upstream.oid) {
      findings.push({
        kind: 'payload-in-vendor',
        path,
        detail: `vendored blob ${vendored.oid} is not the upstream blob ${upstream.oid}`,
      });
    }
  }

  return findings.sort((left, right) =>
    left.path === right.path
      ? comparePaths(left.kind, right.kind)
      : comparePaths(left.path, right.path),
  );
}

/**
 * Derive `LFS.json` from the upstream cache. This is the only writer, so the
 * committed document and a fresh derivation agree byte for byte.
 */
export function deriveLfsLedger(baseDir: string, tree: string): LfsLedger {
  const upstream = readUpstreamLedger(baseDir, tree);
  const repo = cacheDir(baseDir, tree);
  if (!existsSync(repo)) {
    throw new ProvenanceError(`missing upstream cache: upstream-cache/${tree}.git`, 2);
  }

  const raw = git(['lfs', 'ls-files', upstream.commit, '--json', '--long', '--size'], repo);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProvenanceError(`git lfs ls-files emitted invalid JSON for ${tree}`, 2);
  }
  const enumerated = asRecord(parsed);
  const files = enumerated === null ? undefined : enumerated.files;
  if (files !== null && files !== undefined && !Array.isArray(files)) {
    throw new ProvenanceError(`git lfs ls-files emitted an unknown shape for ${tree}`, 2);
  }

  let attributes = '';
  try {
    attributes = git(['show', `${upstream.commit}:.gitattributes`], repo);
  } catch {
    attributes = '';
  }
  const attributeLines = attributes
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line !== '');

  const vendoredRoot = join(baseDir, 'vendor', tree);
  const tracked: LfsRecord[] = [];
  for (const entry of files ?? []) {
    const record = asRecord(entry);
    const name = record === null ? undefined : record.name;
    const oidHex = record === null ? undefined : record.oid;
    const size = record === null ? undefined : record.size;
    const oidType = record === null ? undefined : record.oid_type;
    if (typeof name !== 'string' || typeof oidHex !== 'string') {
      throw new ProvenanceError(`git lfs ls-files entry without name/oid in ${tree}`, 2);
    }
    if (oidType !== undefined && oidType !== 'sha256') {
      throw new ProvenanceError(`unsupported LFS oid type in ${tree}: ${String(oidType)}`, 2);
    }
    if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) {
      throw new ProvenanceError(`git lfs ls-files entry without size in ${tree}`, 2);
    }
    const oid = `sha256:${oidHex}`;
    const bytes = readMaybe(join(vendoredRoot, ...name.split('/')));
    const pointer = bytes === null ? null : parsePointer(bytes);
    tracked.push({
      path: name,
      oid,
      size,
      pointer_verified:
        pointer !== null &&
        pointer.ok &&
        pointer.pointer.oid === oid &&
        pointer.pointer.size === size,
      object_verified: objectVerified(repo, oid),
    });
  }
  tracked.sort((left, right) => comparePaths(left.path, right.path));

  return {
    schema: LFS_SCHEMA,
    subtree: tree,
    tracked,
    upstream_gitattributes_lfs_lines: attributeLines.filter(
      (line) => lfsAttributePatterns([line]).length > 0,
    ),
  };
}

export type LfsCheckResult = {
  tree: string;
  findings: LfsFinding[];
  exitCode: number;
  tracked: number;
  declared: number;
  pointers: number;
};

function loadLedger(baseDir: string, tree: string): LfsLedger {
  const file = join(baseDir, 'vendor', tree, 'provenance', 'LFS.json');
  if (!existsSync(file)) {
    throw new ProvenanceError(`missing LFS inventory: vendor/${tree}/provenance/LFS.json`, 2);
  }
  let document: LfsLedger;
  try {
    document = JSON.parse(readFileSync(file, 'utf8')) as LfsLedger;
  } catch (error) {
    throw new ProvenanceError(
      `malformed LFS inventory for ${tree}: ${error instanceof Error ? error.message : String(error)}`,
      2,
    );
  }
  if (document.schema !== LFS_SCHEMA) {
    throw new ProvenanceError(`unexpected LFS schema for ${tree}: ${String(document.schema)}`, 2);
  }
  if (!Array.isArray(document.tracked)) {
    throw new ProvenanceError(`LFS inventory for ${tree} has no tracked array`, 2);
  }
  return document;
}

/** Verify one tree: inventory, pointer grammar, declared paths, upstream identity. */
export function checkTree(baseDir: string, tree: string): LfsCheckResult {
  const ledger = loadLedger(baseDir, tree);
  const ledgerDir = join(baseDir, 'vendor', tree, 'provenance');
  const upstreamManifest = join(ledgerDir, 'MANIFEST.upstream.tsv');
  const vendoredManifest = join(ledgerDir, 'MANIFEST.vendored.tsv');
  if (!existsSync(upstreamManifest) || !existsSync(vendoredManifest)) {
    throw new ProvenanceError(`missing manifest for ${tree}; cannot prove LFS bytes`, 2);
  }
  const findings = verifyTree(
    join(baseDir, 'vendor', tree),
    ledger,
    readManifestFile(vendoredManifest),
    readManifestFile(upstreamManifest),
  );
  const patterns = lfsAttributePatterns(ledger.upstream_gitattributes_lfs_lines);
  const declared = walkFiles(join(baseDir, 'vendor', tree)).filter((path) =>
    matchesAttributePattern(path, patterns),
  ).length;
  return {
    tree,
    findings,
    exitCode: findings.length > 0 ? 1 : 0,
    tracked: ledger.tracked.length,
    declared,
    pointers: ledger.tracked.filter((record) => record.pointer_verified).length,
  };
}

export const USAGE = 'usage: lfs.ts --tree <name> [--check | --write] | --all [--check]';

export type LfsOptions = { all: boolean; tree: string | null; write: boolean };

export function parseArgs(argv: readonly string[]): LfsOptions | null {
  let all = false;
  let tree: string | null = null;
  let write = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--all') {
      all = true;
    } else if (arg === '--check') {
      // The default; accepted so the documented invocation is explicit.
    } else if (arg === '--write') {
      write = true;
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
  return { all, tree, write };
}

/** The CLI entry; `baseDir` defaults to the repository this file lives in. */
export function main(argv: readonly string[], baseDir?: string): number {
  const root = baseDir ?? resolve(import.meta.dir, '..', '..');
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  let options: LfsOptions | null;
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
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }

  const trees =
    options.all
      ? readdirSync(join(root, 'vendor'), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .filter((tree) => existsSync(join(root, 'vendor', tree, 'provenance', 'UPSTREAM.json')))
          .sort(comparePaths)
      : [options.tree as string];
  if (trees.length === 0) {
    process.stderr.write('lfs: no ledger trees under vendor/\n');
    return 2;
  }

  let exitCode = 0;
  for (const tree of trees) {
    if (options.write) {
      const ledger = deriveLfsLedger(root, tree);
      const file = join(root, 'vendor', tree, 'provenance', 'LFS.json');
      writeFileSync(file, serializeLedger(ledger));
      process.stdout.write(`LFS WROTE ${tree} tracked=${ledger.tracked.length}\n`);
      continue;
    }
    const result = checkTree(root, tree);
    for (const finding of result.findings) {
      process.stdout.write(
        `LFS ${finding.kind} ${finding.path}${finding.detail === '' ? '' : ` ${finding.detail}`}\n`,
      );
    }
    if (result.exitCode === 0) {
      process.stdout.write(
        `LFS OK ${tree} tracked=${result.tracked} declared=${result.declared} pointers=${result.pointers}\n`,
      );
    }
    exitCode = Math.max(exitCode, result.exitCode);
  }
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
