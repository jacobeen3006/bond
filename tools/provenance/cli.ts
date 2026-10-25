#!/usr/bin/env bun
/**
 * The single entry point the `justfile`, the pre-commit hook, and CI call.
 *
 * Later plans add `ledger`, `verify`, `where`, `license`, `denylist-check`,
 * and `lfs` to this dispatcher; their module `main` guards must delegate to the
 * same exported function so the two invocation paths cannot diverge.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  emitFixture,
  type FixtureVariant,
} from '../../tests/provenance/fixtures/make-fixture';
import { cacheDir, commitPresent, fetchAll, fetchTree, git, remoteForTree } from './fetch';
import { ledgerPaths, listLedgerTrees } from './ledger';
import { readManifestFile } from './manifest';
import { ProvenanceError } from './paths';
import { replayTree } from './replay';
import { checkAttributes, importFromCache, importTree, restage } from './stage';

const COMMAND_ALIASES: Record<string, string> = {
  restage: 'manifest',
};

const USAGE = `usage: cli.ts <command> [--tree <name> | --all] [--sha <sha>]

commands:
  fetch            --tree <name> [--sha <sha>] [--resolve]   resolve/pin one upstream tree
                   --all | --from-ledger                     rehydrate every ledger commit
  import           --tree <name> [--sha <sha>]               archive, stage, write the ledger
                   --fixture happy|hostile --tree <name>     hermetic offline import
  manifest         --tree <name> | --all                     restage and refresh the vendored manifest
  replay           --tree <name> | --all                     reconstruct and compare byte-for-byte
  check-attributes --tree <name> | --all                     fail when a filter rewrote a blob
`;

export type CliOptions = {
  command: string;
  tree: string | null;
  all: boolean;
  sha: string | null;
  fixture: FixtureVariant | null;
};

export function parseArgs(argv: readonly string[]): CliOptions | null {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) return null;
  const rawCommand = argv[0];
  const command = COMMAND_ALIASES[rawCommand] ?? rawCommand;
  const allowed = new Set(['fetch', 'import', 'manifest', 'replay', 'check-attributes']);
  if (!allowed.has(command)) {
    throw new ProvenanceError(`unknown command: ${rawCommand}`, 2);
  }

  let tree: string | null = null;
  let all = false;
  let sha: string | null = null;
  let fixture: FixtureVariant | null = null;

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--all' || arg === '--from-ledger') {
      all = true;
    } else if (arg === '--resolve') {
      // accepted, never required: `--tree` always resolves unless `--sha` is given
    } else if (arg === '--fixture') {
      const value = argv[i + 1];
      if (value !== 'happy' && value !== 'hostile') {
        throw new ProvenanceError(`invalid value for --fixture: ${value ?? ''}`, 2);
      }
      fixture = value;
      i += 1;
    } else if (arg === '--tree' || arg === '--sha') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new ProvenanceError(`missing value for ${arg}`, 2);
      }
      if (arg === '--tree') tree = value;
      else sha = value;
      i += 1;
    } else {
      throw new ProvenanceError(`unknown option: ${arg}`, 2);
    }
  }

  if (tree !== null && all) {
    throw new ProvenanceError('--tree and --all are mutually exclusive', 2);
  }
  if (fixture !== null) {
    if (command !== 'import') {
      throw new ProvenanceError('--fixture is only valid with import', 2);
    }
    if (tree === null || all) {
      throw new ProvenanceError('--fixture requires --tree <name>', 2);
    }
  } else if (tree === null && !all) {
    throw new ProvenanceError('missing --tree <name> or --all', 2);
  }
  return { command, tree, all, sha, fixture };
}

/**
 * Build the fixture and import it through the identical preflight, with a
 * local bare cache and no remote: the negative behavior is reproducible
 * offline.
 */
export function importFixture(baseDir: string, tree: string, variant: FixtureVariant): void {
  const scratch: string[] = [];
  try {
    const fixtureDir =
      variant === 'happy'
        ? join(baseDir, 'tests', 'provenance', 'fixtures', 'tiny-upstream')
        : mkdtempSync(join(tmpdir(), 'halo-fixture-hostile-'));
    if (variant === 'hostile') scratch.push(fixtureDir);

    const sha = emitFixture(fixtureDir, variant);

    let cache: string;
    if (variant === 'happy') {
      cache = cacheDir(baseDir, tree);
      if (!existsSync(cache) || !commitPresent(cache, sha)) {
        rmSync(cache, { recursive: true, force: true });
        mkdirSync(join(baseDir, 'upstream-cache'), { recursive: true });
        git(['clone', '--bare', '-q', fixtureDir, cache], baseDir);
      }
    } else {
      const cacheRoot = mkdtempSync(join(tmpdir(), 'halo-fixture-cache-'));
      scratch.push(cacheRoot);
      cache = join(cacheRoot, `${tree}.git`);
      git(['clone', '--bare', '-q', fixtureDir, cache], baseDir);
    }

    // The ledger schema requires an HTTPS remote; the local cache is only the
    // object store, and neither import nor replay ever contacts the remote.
    git(['config', 'remote.origin.url', 'https://example.invalid/tiny-upstream.git'], cache);

    importFromCache(
      baseDir,
      tree,
      cache,
      sha,
      variant === 'happy'
        ? { buildProduct: true, replace: true }
        : { ignoreLedger: true },
    );
  } finally {
    for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  }
}

/** `check-attributes`: exit 1 and name every path a filter rewrote. */
export function checkAttributesCommand(baseDir: string, tree: string): number {
  const ledger = ledgerPaths(baseDir, tree);
  if (!existsSync(ledger.manifestUpstream)) {
    throw new ProvenanceError(
      `missing ledger: vendor/${tree}/provenance/MANIFEST.upstream.tsv`,
      2,
    );
  }
  const upstream = readManifestFile(ledger.manifestUpstream);
  const upstreamOids = new Map(upstream.map((row) => [row.path, row.oid]));
  const result = checkAttributes(
    baseDir,
    upstream.map((row) => row.path),
    upstreamOids,
    `vendor/${tree}`,
  );

  if (!result.ok) {
    for (const mismatch of result.mismatches) {
      process.stdout.write(
        `ATTR MISMATCH ${mismatch.path} index=${mismatch.indexOid} raw=${mismatch.rawOid} ` +
          `upstream=${mismatch.upstreamOid ?? '-'} attrs=${mismatch.attributes.join(',') || '-'}\n`,
      );
    }
    return 1;
  }

  process.stdout.write(`ATTR OK ${tree} files=${upstream.length}\n`);
  return 0;
}

/** Run one tree, returning the exit code it earned. */
export function runTree(command: string, options: CliOptions, tree: string, baseDir: string): number {
  switch (command) {
    case 'fetch':
      fetchTree(baseDir, tree, options.sha ?? undefined);
      return 0;
    case 'import':
      if (options.fixture !== null) importFixture(baseDir, tree, options.fixture);
      else importTree(baseDir, tree, options.sha ?? undefined);
      return 0;
    case 'manifest':
      restage(baseDir, tree);
      return 0;
    case 'replay':
      replayTree(baseDir, tree);
      return 0;
    case 'check-attributes':
      return checkAttributesCommand(baseDir, tree);
    default:
      throw new ProvenanceError(`unknown command: ${command}`, 2);
  }
}

export async function main(argv: readonly string[], baseDir?: string): Promise<number> {
  const options = parseArgs(argv);
  const root = baseDir ?? resolve(import.meta.dir, '..', '..');
  if (options === null) {
    process.stdout.write(USAGE);
    return 0;
  }

  if (options.command === 'fetch' && options.all) {
    fetchAll(root);
    return 0;
  }

  if (options.tree !== null) {
    if (options.command === 'fetch' || (options.command === 'import' && options.fixture === null)) {
      remoteForTree(options.tree);
    }
    return runTree(options.command, options, options.tree, root);
  }

  let exitCode = 0;
  for (const tree of listLedgerTrees(root)) {
    try {
      exitCode = Math.max(exitCode, runTree(options.command, options, tree, root));
    } catch (error) {
      if (!(error instanceof ProvenanceError)) throw error;
      process.stderr.write(`${error.message}\n`);
      exitCode = Math.max(exitCode, error.code);
    }
  }
  return exitCode;
}

if (import.meta.main) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exit(code);
    })
    .catch((error: unknown) => {
      if (error instanceof ProvenanceError) {
        process.stderr.write(`${error.message}\n`);
        process.exit(error.code);
      }
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
      process.exit(1);
    });
}
