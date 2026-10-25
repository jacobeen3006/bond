/**
 * Upstream cache lifecycle: the `TREE_REPOS` registry, the HTTPS pre-network
 * gate, the immutability gate, and cache rehydration from the ledgers.
 *
 * There is no `git clone` and no `git checkout` on any path: checkout applies
 * smudge filters and loses the +x bit, which is the corruption class this
 * phase exists to prevent.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { listLedgerTrees, readUpstreamLedger } from './ledger';
import { ProvenanceError } from './paths';

/**
 * The single mapping from tree name to upstream remote. A `--tree` remote is
 * always looked up here, never built from a string or an argv value.
 * Plain constant with no import-time side effects so a test can read it.
 */
export const TREE_REPOS: Readonly<Record<string, string>> = {
  'gsd-omp': 'https://github.com/tchivs/gsd-omp.git',
  'hermes-agent': 'https://github.com/NousResearch/hermes-agent.git',
  hindsight: 'https://github.com/vectorize-io/hindsight.git',
  'oh-my-pi': 'https://github.com/can1357/oh-my-pi.git',
};

export const HTTPS_REMOTE_PATTERN = /^https:\/\/[^/]+\//;
export const DEFAULT_BRANCH = 'main';

const MAX_BUFFER = 512 * 1024 * 1024;

/**
 * Every git invocation in the tool is CRLF- and filter-neutral. This machine's
 * system config sets `core.autocrlf=true`, and `git archive` applies it to the
 * tar it writes, which would rewrite every imported byte (research P1). A
 * committed `.gitattributes` can likewise name the `lfs` driver, and `git
 * archive` would then run `git lfs smudge` and either fetch over the network or
 * fail — both are byte rewrites the import must never allow. The staging
 * attributes are the second belt; this is the first.
 */
const NEUTRAL_CONFIG = [
  '-c',
  'core.autocrlf=false',
  '-c',
  'core.eol=lf',
  '-c',
  'core.safecrlf=false',
  '-c',
  'filter.lfs.clean=cat',
  '-c',
  'filter.lfs.smudge=cat',
  '-c',
  'filter.lfs.process=',
  '-c',
  'filter.lfs.required=false',
];

export function git(args: string[], cwd: string, stdin?: string): string {
  return execFileSync('git', [...NEUTRAL_CONFIG, ...args], {
    cwd,
    encoding: 'utf8',
    input: stdin,
    maxBuffer: MAX_BUFFER,
    stdio: stdin === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
  });
}

export function cacheDir(baseDir: string, tree: string): string {
  return join(baseDir, 'upstream-cache', `${tree}.git`);
}

export function resolvedFile(baseDir: string, tree: string): string {
  return join(baseDir, 'upstream-cache', `${tree}.resolved`);
}

/** Registry lookup; an unregistered name refuses before any cache or network I/O. */
export function remoteForTree(tree: string): string {
  if (!Object.prototype.hasOwnProperty.call(TREE_REPOS, tree)) {
    throw new ProvenanceError(`unknown tree: ${tree}`, 2);
  }
  return TREE_REPOS[tree];
}

/** `^https://[^/]+/` — executed before any network call on every path. */
export function assertHttpsRemote(remote: string): string {
  if (typeof remote !== 'string' || !HTTPS_REMOTE_PATTERN.test(remote)) {
    throw new ProvenanceError(`insecure remote: ${remote}`, 2);
  }
  return remote;
}

export function commitPresent(cache: string, sha: string): boolean {
  try {
    git(['cat-file', '-e', `${sha}^{commit}`], cache);
    return true;
  } catch {
    return false;
  }
}

export function objectFormat(cache: string): string {
  return git(['rev-parse', '--show-object-format'], cache).trim();
}

/**
 * Create the bare partial cache when absent and pin `refs/heads/main` to the
 * resolved commit. Never repoints an existing cache at a different remote.
 */
export function ensureCache(baseDir: string, tree: string, remote: string): string {
  assertHttpsRemote(remote);
  const dir = cacheDir(baseDir, tree);
  if (existsSync(dir)) {
    let current = '';
    try {
      current = git(['config', '--get', 'remote.origin.url'], dir).trim();
    } catch {
      current = '';
    }
    if (current && current !== remote) {
      throw new ProvenanceError(`cache remote mismatch: ${tree} (${current})`, 2);
    }
    if (!current) {
      git(['config', 'remote.origin.url', remote], dir);
    }
  } else {
    mkdirSync(join(baseDir, 'upstream-cache'), { recursive: true });
    git(['init', '--bare', dir], baseDir);
    git(['config', 'remote.origin.url', remote], dir);
  }
  git(['config', 'remote.origin.promisor', 'true'], dir);
  git(['config', 'remote.origin.partialclonefilter', 'blob:none'], dir);
  return dir;
}

/** Fetch exactly one commit into the cache, preferring a blob-less fetch. */
function fetchCommit(cache: string, sha: string): void {
  const attempts: string[][] = [
    ['fetch', '--filter=blob:none', 'origin', sha],
    ['fetch', 'origin', sha],
    ['fetch', '--filter=blob:none', 'origin', DEFAULT_BRANCH],
    ['fetch', 'origin', DEFAULT_BRANCH],
  ];
  for (const args of attempts) {
    try {
      git(args, cache);
    } catch {
      continue;
    }
    if (commitPresent(cache, sha)) return;
  }
  if (!commitPresent(cache, sha)) {
    throw new ProvenanceError(`pinned commit missing: ${sha}`, 2);
  }
}

export type FetchResult = { tree: string; sha: string; resolved: boolean };

/** `fetch --tree <name> [--sha <sha>]`: resolve (or assert) and record. */
export function fetchTree(baseDir: string, tree: string, pinnedSha?: string): FetchResult {
  const remote = remoteForTree(tree);
  assertHttpsRemote(remote);
  const cache = ensureCache(baseDir, tree, remote);

  if (pinnedSha) {
    if (!/^[0-9a-f]{40}$/.test(pinnedSha)) {
      throw new ProvenanceError(`invalid sha: ${pinnedSha}`, 2);
    }
    if (!commitPresent(cache, pinnedSha)) {
      throw new ProvenanceError(`pinned commit missing: ${pinnedSha}`, 2);
    }
    return { tree, sha: pinnedSha, resolved: false };
  }

  const listing = git(['ls-remote', 'origin', `refs/heads/${DEFAULT_BRANCH}`], cache);
  const sha = listing.trim().split(/\s+/)[0] ?? '';
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new ProvenanceError(`no resolved sha: ${tree}`, 2);
  }

  if (!commitPresent(cache, sha)) fetchCommit(cache, sha);
  git(['update-ref', `refs/heads/${DEFAULT_BRANCH}`, sha], cache);

  mkdirSync(join(baseDir, 'upstream-cache'), { recursive: true });
  writeFileSync(resolvedFile(baseDir, tree), `${sha}\n`, 'utf8');
  process.stdout.write(`resolved ${tree} ${sha}\n`);
  return { tree, sha, resolved: true };
}

/** The SHA `import --tree` must use when no `--sha` is given. */
export function readResolvedSha(baseDir: string, tree: string): string {
  const file = resolvedFile(baseDir, tree);
  if (!existsSync(file)) {
    throw new ProvenanceError(`no resolved sha: ${tree}`, 2);
  }
  const sha = readFileSync(file, 'utf8').trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new ProvenanceError(`no resolved sha: ${tree}`, 2);
  }
  return sha;
}

/**
 * `fetch --all` / `--from-ledger`: read every ledger commit and make sure it
 * exists in its own cache. Never re-resolves a branch; a no-op when complete.
 */
export function fetchAll(baseDir: string): FetchResult[] {
  const results: FetchResult[] = [];
  for (const tree of listLedgerTrees(baseDir)) {
    const ledger = readUpstreamLedger(baseDir, tree);
    const remote = assertHttpsRemote(ledger.repo);
    const cache = ensureCache(baseDir, tree, remote);
    if (commitPresent(cache, ledger.commit)) {
      results.push({ tree, sha: ledger.commit, resolved: false });
      continue;
    }
    fetchCommit(cache, ledger.commit);
    process.stdout.write(`fetched ${tree} ${ledger.commit}\n`);
    results.push({ tree, sha: ledger.commit, resolved: false });
  }
  return results;
}
