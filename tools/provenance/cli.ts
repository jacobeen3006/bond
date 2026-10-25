#!/usr/bin/env bun
/**
 * The single entry point the `justfile`, the pre-commit hook, and CI call.
 *
 * Eleven commands are reachable here: `fetch`, `import`, `manifest` (plan
 * 01-01), `replay`, `verify`, `where`, `license`, `denylist-check`, `lfs`,
 * `ledger` (plan 01-03), and `check-attributes` (plan 01-02). `verify`, `where`
 * and `lfs` own a module-level argument grammar (`--check`, a positional query),
 * so they are delegated whole rather than re-parsed: the dispatcher never
 * restates a flag rule, and the module entry point and this one cannot diverge.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  emitFixture,
  type FixtureVariant,
} from '../../tests/provenance/fixtures/make-fixture';
import { cacheDir, commitPresent, fetchAll, fetchTree, git, remoteForTree } from './fetch';
import {
  deriveExcludes,
  derivePaths,
  deriveRenames,
  ensureDir,
  ledgerPaths,
  listLedgerTrees,
  readUpstreamLedger,
  relativePosix,
  serializeLedger,
  type UpstreamLedger,
  writeUpstreamLedger,
} from './ledger';
import {
  buildLicenseBlock,
  assertDenylistCovers,
  DenylistCoverageError,
  loadDenylist,
  treeReader,
} from './license';
import { main as lfsMain } from './lfs';
import { hashFile, readManifestFile } from './manifest';
import { ProvenanceError } from './paths';
import { replayTree } from './replay';
import { checkAttributes, importFromCache, importTree, restage, SERIES_HEADER } from './stage';
import { main as verifyMain } from './verify';
import { mainWhere } from './where';

const COMMAND_ALIASES: Record<string, string> = {
  restage: 'manifest',
};

/**
 * The one usage line. It lists every supported command, so an unknown command
 * can point at the whole surface instead of guessing. Written to stdout for
 * `--help` and to stderr for an error: stdout is reserved for the result lines
 * the gates parse.
 */
const USAGE = `usage: cli.ts <command> [options]

commands:
  fetch            --tree <name> [--sha <sha>] [--resolve]   resolve/pin one upstream tree
                   --all | --from-ledger                     rehydrate every ledger commit
  import           --tree <name> [--sha <sha>]               archive, stage, write the ledger
                   --fixture happy|hostile --tree <name>     hermetic offline import
  manifest         --tree <name> | --all                     restage and refresh the vendored manifest
  replay           --tree <name> | --all                     reconstruct and compare byte-for-byte
  verify           --tree <name> | --all                     check the ledger, index and worktree
  where            <query> [--tree <name>] [--renames <path>] upstream path/symbol -> local path
  license          --tree <name> | --all                     re-pin every licence-ish path by raw bytes
  denylist-check                                             prove the rebrand deny-list covers the import
  lfs              --tree <name> [--check | --write] | --all Git LFS inventory and pointer check
  ledger           --tree <name> [--force]                   re-derive PATHS/RENAMES/EXCLUDES, failing on drift
  check-attributes --tree <name> | --all                     fail when a filter rewrote a blob
`;

/**
 * Commands with their own argument grammar. They are handed the remaining argv
 * verbatim so the module's parser — not a copy of it — decides what is valid.
 */
const DELEGATED: Record<string, (argv: readonly string[], baseDir: string) => number> = {
  verify: verifyMain,
  where: mainWhere,
  lfs: lfsMain,
};

/**
 * Commands that share the one option grammar below. `verify`, `where` and
 * `lfs` are dispatched before this parser runs, because their grammars differ.
 */
const GENERIC_COMMANDS: Record<string, true> = {
  fetch: true,
  import: true,
  ledger: true,
  manifest: true,
  replay: true,
  'check-attributes': true,
  license: true,
  'denylist-check': true,
};

export type CliOptions = {
  command: string;
  tree: string | null;
  all: boolean;
  sha: string | null;
  fixture: FixtureVariant | null;
  force: boolean;
};

export function parseArgs(argv: readonly string[]): CliOptions | null {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) return null;
  const rawCommand = argv[0];
  const command = COMMAND_ALIASES[rawCommand] ?? rawCommand;
  if (GENERIC_COMMANDS[command] !== true) {
    throw new ProvenanceError(`unknown command: ${rawCommand}`, 2);
  }

  let tree: string | null = null;
  let all = false;
  let sha: string | null = null;
  let fixture: FixtureVariant | null = null;
  let force = false;

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--all' || arg === '--from-ledger') {
      all = true;
    } else if (arg === '--force') {
      force = true;
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
  if (command === 'denylist-check') {
    // One invocation covers every imported tree by construction: the contract is
    // about the whole import, not one subtree.
    if (tree !== null || all) {
      throw new ProvenanceError('denylist-check takes no --tree or --all', 2);
    }
  } else if (fixture !== null) {
    if (command !== 'import') {
      throw new ProvenanceError('--fixture is only valid with import', 2);
    }
    if (tree === null || all) {
      throw new ProvenanceError('--fixture requires --tree <name>', 2);
    }
  } else if (tree === null && !all) {
    throw new ProvenanceError('missing --tree <name> or --all', 2);
  }
  if (force && command !== 'ledger') {
    throw new ProvenanceError('--force is only valid with ledger', 2);
  }
  return { command, tree, all, sha, fixture, force };
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

/**
 * `ledger --tree <name> [--force]`: re-derive the three ledger documents
 * through the same functions the import used. A missing document is written; an
 * existing one whose bytes differ is drift, reported and left untouched unless
 * `--force` is given, so an upstream layout change can never be absorbed
 * silently.
 */
export function ledgerCommand(baseDir: string, tree: string, force: boolean): number {
  const ledger = ledgerPaths(baseDir, tree);
  const document = readUpstreamLedger(baseDir, tree);
  const cache = cacheDir(baseDir, tree);
  if (!existsSync(cache)) {
    throw new ProvenanceError(`missing cache: upstream-cache/${tree}.git`, 2);
  }
  if (!commitPresent(cache, document.commit)) {
    throw new ProvenanceError(`pinned commit missing: ${document.commit}`, 2);
  }

  // `-d` without `-r` lists exactly the upstream top-level tree entries.
  const topLevelDirs = git(['ls-tree', '-d', '--name-only', document.commit], cache)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const planned: { file: string; text: string }[] = [
    { file: ledger.paths, text: serializeLedger(derivePaths(tree, topLevelDirs)) },
    { file: ledger.renames, text: serializeLedger(deriveRenames(tree)) },
    { file: ledger.excludes, text: serializeLedger(deriveExcludes(tree)) },
  ];

  const drift = planned.filter((entry) => {
    if (!existsSync(entry.file)) return false;
    return readFileSync(entry.file, 'utf8') !== entry.text;
  });
  if (drift.length > 0 && !force) {
    for (const entry of drift) {
      process.stdout.write(`LEDGER DRIFT ${relativePosix(baseDir, entry.file)}\n`);
    }
    throw new ProvenanceError(`ledger drift: ${tree}`, 1);
  }

  let written = false;
  for (const entry of planned) {
    if (existsSync(entry.file) && !drift.some((item) => item.file === entry.file)) continue;
    ensureDir(ledger.dir);
    writeFileSync(entry.file, entry.text, 'utf8');
    written = true;
  }

  if (!existsSync(ledger.series)) {
    ensureDir(ledger.patchesDir);
    writeFileSync(ledger.series, `${SERIES_HEADER}\n`, 'utf8');
    written = true;
  }

  // UPSTREAM.json digests the rename and exclude documents; a rewrite that
  // leaves them stale would make the next replay report TAMPERED.
  const excludesSha = hashFile(ledger.excludes);
  const renamesSha = hashFile(ledger.renames);
  if (document.excludes_sha256 !== excludesSha || document.renames_sha256 !== renamesSha) {
    document.excludes_sha256 = excludesSha;
    document.renames_sha256 = renamesSha;
    writeUpstreamLedger(baseDir, tree, document);
  }

  process.stdout.write(`LEDGER OK ${tree} ${written ? 'written' : 'unchanged'}\n`);
  return 0;
}

/**
 * `license --tree <name>`: re-pin every licence-ish path from
 * `MANIFEST.upstream.tsv`, by raw bytes.
 *
 * The candidate set is the manifest, never a directory walk, so an ignored or
 * filtered file cannot hide from the ledger. Only the `license` block is
 * rewritten, and only when its bytes would change, so a second run is a no-op.
 * `readFileSync` is the reader: a `git show` piped through a filter could hand
 * back bytes the worktree does not hold, which is the one thing this pin exists
 * to detect.
 */
export function licenseCommand(baseDir: string, tree: string): number {
  const ledger = ledgerPaths(baseDir, tree);
  if (!existsSync(ledger.manifestUpstream)) {
    throw new ProvenanceError(
      `missing ledger: vendor/${tree}/provenance/MANIFEST.upstream.tsv`,
      2,
    );
  }
  const rows = readManifestFile(ledger.manifestUpstream);
  const document = readUpstreamLedger(baseDir, tree);
  const block = buildLicenseBlock(rows, treeReader(ledger.root));

  const next: UpstreamLedger = {
    ...document,
    license: {
      spdx: document.license?.spdx ?? 'MIT',
      files: block.files,
      copyright_notice_count: block.copyright_notice_count,
    },
  };
  if (serializeLedger(next) !== readFileSync(ledger.upstream, 'utf8')) {
    writeUpstreamLedger(baseDir, tree, next);
  }

  process.stdout.write(
    `LICENSE OK ${tree} files=${block.files.length} ` +
      `copyright_notices=${block.copyright_notice_count}\n`,
  );
  return 0;
}

/**
 * `denylist-check`: prove the contract covers the import.
 *
 * A glob that matches nothing is a guard that silently protects nothing; a
 * licence-ish path no glob denies is the blind spot the shared matcher would
 * otherwise hide. Both are printed and both fail. A glob declared
 * `expect_match: false` is printed as DECLARED-DEFENSIVE instead — loud about
 * being unused today, without pretending the import ships a `COPYING` file.
 */
export function denylistCheckCommand(baseDir: string): number {
  const treePaths: string[] = [];
  for (const tree of listLedgerTrees(baseDir)) {
    const manifest = ledgerPaths(baseDir, tree).manifestUpstream;
    if (!existsSync(manifest)) continue;
    for (const row of readManifestFile(manifest)) treePaths.push(`vendor/${tree}/${row.path}`);
  }
  if (treePaths.length === 0) {
    throw new ProvenanceError('deny-list: no imported trees', 2);
  }

  const denylist = loadDenylist();
  try {
    const report = assertDenylistCovers(treePaths, denylist);
    for (const glob of report.defensive) {
      process.stdout.write(`DECLARED-DEFENSIVE ${glob}\n`);
    }
    process.stdout.write(
      `DENYLIST OK globs=${report.globs} licence_paths=${report.licencePaths}\n`,
    );
    return 0;
  } catch (error) {
    if (!(error instanceof DenylistCoverageError)) throw error;
    for (const finding of error.findings) process.stdout.write(`${finding}\n`);
    return 1;
  }
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
    case 'ledger':
      return ledgerCommand(baseDir, tree, options.force);
    case 'manifest':
      restage(baseDir, tree);
      return 0;
    case 'replay':
      replayTree(baseDir, tree);
      return 0;
    case 'check-attributes':
      return checkAttributesCommand(baseDir, tree);
    case 'license':
      return licenseCommand(baseDir, tree);
    default:
      throw new ProvenanceError(`unknown command: ${command}`, 2);
  }
}

export async function main(argv: readonly string[], baseDir?: string): Promise<number> {
  const root = baseDir ?? resolve(import.meta.dir, '..', '..');

  const rawCommand = argv[0];
  const named = rawCommand === undefined ? undefined : (COMMAND_ALIASES[rawCommand] ?? rawCommand);
  const delegated = named === undefined ? undefined : DELEGATED[named];
  if (delegated !== undefined) return delegated(argv.slice(1), root);

  let options: CliOptions | null;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof ProvenanceError) {
      // An unusable invocation is a usage error, and the usage line belongs on
      // stderr with it so stdout stays parseable by the gates.
      process.stderr.write(`${error.message}\n${USAGE}`);
      return error.code;
    }
    throw error;
  }
  if (options === null) {
    process.stdout.write(USAGE);
    return 0;
  }

  if (options.command === 'fetch' && options.all) {
    fetchAll(root);
    return 0;
  }

  if (options.command === 'denylist-check') {
    return denylistCheckCommand(root);
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
