/**
 * Scratch-repository harness shared by the plan 01-08 drift suites.
 *
 * Every negative case needs the same preamble — a hermetic fixture, an offline
 * bare cache, and a real import into a throwaway repository — and every patch
 * case needs a scratch repo to author a patch against. Both live here so the
 * three suites cannot drift on how the baseline is built.
 *
 * Nothing under the repository's own `vendor/` is read as input or written as
 * output: every path below is under the OS temp dir.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spyOn } from 'bun:test';

import { cacheDir, git } from '../../../tools/provenance/fetch';
import {
  importTree,
  readTreeRows,
  repairModesAt,
  STAGING_ATTRIBUTES_VALUE,
  TAR_UTF8_OPTIONS,
  writeArchiveAttributes,
} from '../../../tools/provenance/stage';

import { emitFixture } from './make-fixture';

export const TREE = 'tiny-upstream';

const MAX_BUFFER = 512 * 1024 * 1024;

/** Capture everything a function writes to stdout, then restore the stream. */
export function captureStdout<T>(operation: () => T): { result: T; output: string } {
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

export function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  git(['init', '-q', '--initial-branch=main', '.'], dir);
  git(['config', 'user.email', 'fixture@halo.local'], dir);
  git(['config', 'user.name', 'HALO Fixture'], dir);
}

/**
 * A bare cache the importer can archive from. The remote is HTTPS because the
 * ledger schema requires it; nothing here contacts it.
 */
export function makeBareCache(dir: string, source: string, name: string): string {
  mkdirSync(join(dir, 'upstream-cache'), { recursive: true });
  const cache = join(dir, 'upstream-cache', `${name}.git`);
  git(['clone', '--bare', '-q', source, cache], dir);
  git(['config', 'remote.origin.url', 'https://example.invalid/tiny-upstream.git'], cache);
  return cache;
}

export type Scratch = {
  root: string;
  base: string;
  sha: string;
  dispose(): void;
};

/** One fresh fixture + cache + import, isolated in its own temp directory. */
export function scratchImport(prefix: string): Scratch {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const source = join(root, 'fixture');
  const sha = emitFixture(source, 'happy');
  const base = join(root, 'base');
  initRepo(base);
  makeBareCache(base, source, TREE);
  const { output } = captureStdout(() => importTree(base, TREE, sha));
  if (!output.includes(`IMPORT OK ${TREE}`)) {
    throw new Error(`scratch import failed: ${output}`);
  }
  return { root, base, sha, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

/** Materialize one commit from the cache, byte-exactly, into `target`. */
function extractTree(cache: string, sha: string, target: string, tarPath: string): void {
  mkdirSync(target, { recursive: true });
  writeArchiveAttributes(cache);
  git(['archive', '--format=tar', `--output=${tarPath}`, sha], cache);
  execFileSync('tar', ['-xf', tarPath, '-C', target, ...TAR_UTF8_OPTIONS], {
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
  });
}

/**
 * The documented patch flow, mechanized: a scratch repo holding the pristine
 * tree under the neutral staging attributes, one file overlaid per step, each
 * step's `git diff --cached` captured and then committed so the next patch is
 * authored against the post-previous content.
 */
export class PatchAuthor {
  readonly dir: string;
  private readonly file: string;
  private readonly cache: string;

  constructor(baseDir: string, tree: string, sha: string, dir: string, file: string) {
    this.dir = dir;
    this.file = file;
    this.cache = cacheDir(baseDir, tree);
    initRepo(dir);
    writeFileSync(
      join(dir, '.git', 'info', 'attributes'),
      `${STAGING_ATTRIBUTES_VALUE}\n`,
      'utf8',
    );
    extractTree(this.cache, sha, dir, join(dir, '..', `tree-${sha.slice(0, 8)}.tar`));
    git(['add', '-A', '-f', '--', '.'], dir);
    repairModesAt(
      dir,
      readTreeRows(this.cache, sha, false),
      (oid) =>
        execFileSync('git', ['cat-file', 'blob', oid], { cwd: this.cache, maxBuffer: MAX_BUFFER }),
      '',
    );
    git(['commit', '-q', '-m', `pristine ${sha.slice(0, 8)}`], dir);
  }

  /** Overlay `content` on the tracked file and return the patch that applies it. */
  commit(message: string, content: string): string {
    const target = join(this.dir, ...this.file.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
    git(['add', '-f', '--', this.file], this.dir);
    const diff = git(['diff', '--cached', '--binary', '--full-index', '--', this.file], this.dir);
    if (!diff.includes(`diff --git a/${this.file} b/${this.file}`)) {
      throw new Error(`patch author: ${this.file} did not change`);
    }
    git(['commit', '-q', '-m', message], this.dir);
    return diff;
  }
}
