#!/usr/bin/env bun
/**
 * The single entry point the `justfile`, the pre-commit hook, and CI call.
 *
 * Later plans add `ledger`, `check-attributes`, `verify`, `where`, `license`,
 * `denylist-check`, and `lfs` to this dispatcher; their module `main` guards
 * must delegate to the same exported function so the two invocation paths
 * cannot diverge.
 */

import { resolve } from 'node:path';

import { fetchAll, fetchTree, remoteForTree } from './fetch';
import { listLedgerTrees } from './ledger';
import { ProvenanceError } from './paths';
import { replayTree } from './replay';
import { importTree, restage } from './stage';

const COMMAND_ALIASES: Record<string, string> = {
  restage: 'manifest',
};

const USAGE = `usage: cli.ts <command> [--tree <name> | --all] [--sha <sha>]

commands:
  fetch     --tree <name> [--sha <sha>] [--resolve]   resolve/pin one upstream tree
            --all | --from-ledger                     rehydrate every ledger commit
  import    --tree <name> [--sha <sha>]               archive, stage, write the ledger
  manifest  --tree <name> | --all                     restage and refresh the vendored manifest
  replay    --tree <name> | --all                     reconstruct and compare byte-for-byte
`;

export type CliOptions = {
  command: string;
  tree: string | null;
  all: boolean;
  sha: string | null;
};

export function parseArgs(argv: readonly string[]): CliOptions | null {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) return null;
  const rawCommand = argv[0];
  const command = COMMAND_ALIASES[rawCommand] ?? rawCommand;
  const allowed = new Set(['fetch', 'import', 'manifest', 'replay']);
  if (!allowed.has(command)) {
    throw new ProvenanceError(`unknown command: ${rawCommand}`, 2);
  }

  let tree: string | null = null;
  let all = false;
  let sha: string | null = null;

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--all' || arg === '--from-ledger') {
      all = true;
    } else if (arg === '--resolve') {
      // accepted, never required: `--tree` always resolves unless `--sha` is given
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
  if (tree === null && !all) {
    throw new ProvenanceError('missing --tree <name> or --all', 2);
  }
  return { command, tree, all, sha };
}

function requireTree(options: CliOptions): string {
  if (options.tree === null) throw new ProvenanceError('missing --tree <name>', 2);
  return options.tree;
}

/** Run one tree, returning the exit code it earned. */
export function runTree(command: string, options: CliOptions, tree: string, baseDir: string): number {
  switch (command) {
    case 'fetch':
      fetchTree(baseDir, tree, options.sha ?? undefined);
      return 0;
    case 'import':
      importTree(baseDir, tree, options.sha ?? undefined);
      return 0;
    case 'manifest':
      restage(baseDir, tree);
      return 0;
    case 'replay':
      replayTree(baseDir, tree);
      return 0;
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
    remoteForTree(options.tree);
    return runTree(options.command, options, options.tree, root);
  }

  let exitCode = 0;
  for (const tree of listLedgerTrees(root)) {
    try {
      runTree(options.command, options, tree, root);
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
