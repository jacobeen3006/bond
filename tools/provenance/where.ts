#!/usr/bin/env bun
/**
 * `provenance-where` — the IMPT-05 lookup: an upstream path or symbol to the
 * local path HALO ships, with every watch id and rename rule that matched.
 *
 * The answer comes from the ledger (`PATHS.json` plus `MANIFEST.upstream.tsv`),
 * never from a `vendor/` directory walk: a walk finds *a* file, the ledger
 * proves it is *the* file the advisory named. The filesystem check is a
 * separate `EXISTS` line, so a ledger/tree mismatch is visible rather than
 * masked by a successful lookup.
 *
 * Resolution order is the documented one and nothing else:
 * exceptions, then the longest matching prefix rule, then an exact file rule,
 * then identity. An excluded path is absent because it was never imported.
 *
 * Standalone until plan 01-09 wires the same functions into `cli.ts`:
 *   bun run tools/provenance/where.ts <query> [--tree <name>] [--renames <path>]
 */

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { TREE_REPOS } from './fetch';
import { ledgerPaths, relativePosix } from './ledger';
import { comparePaths, readManifestFile } from './manifest';
import { globToRegExp, ProvenanceError } from './paths';

export type PathRule = {
  kind: 'prefix' | 'file';
  from: string;
  to: string;
  reason?: string;
};

export type PathException = {
  from: string;
  to: string | null;
  reason?: string;
};

export type PathsDocument = {
  schema?: string;
  subtree?: string;
  resolution?: string;
  rules?: PathRule[];
  exceptions?: PathException[];
  added?: { to: string; reason: string }[];
};

export type ExcludesDocument = {
  schema?: string;
  subtree?: string;
  rules?: { glob: string; reason?: string; approved_by?: string }[];
};

export type RenameRule = {
  id: string;
  kind: string;
  from: string;
  to: string;
  scope: string;
  applied_by: string;
};

export type RenamesDocument = {
  schema?: string;
  subtree?: string;
  generated_from?: string;
  phase_populated?: number;
  rules?: RenameRule[];
};

export type WatchEntry = {
  id: string;
  subtree: string;
  upstream_paths?: string[];
  local_paths?: string[];
  symbols?: string[];
  why?: string;
  contract_tests?: string[];
  advisory_sources?: string[];
  last_checked?: string;
};

/** Everything one tree contributes to a lookup. */
export type QueryTree = {
  name: string;
  paths: PathsDocument;
  excludes?: ExcludesDocument | null;
  renames?: RenamesDocument | null;
  /** Where the rename rules came from, for the `renames: empty` report. */
  renameSource?: string;
  watchlist?: readonly WatchEntry[];
  upstreamPaths?: readonly string[];
  /** Repository-relative local root; defaults to `vendor/<name>`. */
  localRoot?: string;
};

export type RenameMap = { name: string; document: RenamesDocument };

export type ResolutionRule = 'exception' | 'prefix' | 'file' | 'identity' | 'excluded';

export type ResolvedPath = {
  upstream: string;
  /** Tree-relative local path, or `null` when the path is deliberately absent. */
  local: string | null;
  rule: ResolutionRule;
  /** Why the path is absent; `null` for every mapped path. */
  reason: string | null;
};

export type PathHit = {
  tree: string;
  treeRoot: string;
  upstream: string;
  local: string | null;
  rule: ResolutionRule;
  reason: string | null;
  /** Matching watch ids, ordered by descending matched-path length then id. */
  watch: string[];
};

export type SymbolHit = {
  tree: string;
  symbol: string;
  local: string | null;
  watch: string;
};

export type RenameHit = {
  ruleId: string;
  kind: string;
  direction: 'forward' | 'reverse';
  from: string;
  to: string;
};

export type LookupResult = {
  query: string;
  kind: 'path' | 'symbol' | 'unknown';
  paths: PathHit[];
  symbols: SymbolHit[];
  renames: RenameHit[];
  matched: boolean;
};

export type LookupOptions = {
  /** Explicit rename maps replace the ones derived from the trees. */
  renameMaps?: readonly RenameMap[];
};

const WHERE_USAGE = `usage: where.ts <query> [--tree <name>] [--renames <path>]

  <query>            an upstream path (contains a separator) or a symbol
  --tree <name>      restrict the lookup to one tree (default: every ledger)
  --renames <path>   use this rename map instead of each tree's RENAMES.json
`;

/** The same normalization the manifest uses: POSIX separators, no `./`. */
export function normalizeUpstreamPath(raw: string): string {
  let path = raw.trim().replace(/\\/g, '/');
  while (path.startsWith('./')) path = path.slice(2);
  while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (path.length === 0) throw new ProvenanceError('empty query', 2);
  return path;
}

/** `docs/` matches `docs/x`, `docs` matches `docs` and `docs/x`, never `docsx`. */
function matchesPrefix(from: string, path: string): boolean {
  if (from.endsWith('/')) return path.startsWith(from);
  return path === from || path.startsWith(`${from}/`);
}

function watchMatches(raw: string, path: string): boolean {
  if (raw === path) return true;
  if (raw.includes('*') || raw.includes('?')) return globToRegExp(raw).test(path);
  return matchesPrefix(raw, path);
}

/** The longest matching prefix rule; byte order breaks an equal-length tie. */
function longestPrefix(rules: readonly PathRule[], path: string): PathRule | null {
  const candidates = rules
    .filter((rule) => rule.kind === 'prefix' && matchesPrefix(rule.from, path))
    .sort((a, b) => b.from.length - a.from.length || comparePaths(a.from, b.from));
  return candidates[0] ?? null;
}

/**
 * Resolve one upstream path. Exclusions are checked before mapping because an
 * excluded path was never imported: there is no local file to resolve to.
 */
export function resolveUpstreamPath(upstreamPath: string, tree: QueryTree): ResolvedPath {
  const upstream = normalizeUpstreamPath(upstreamPath);
  const rules = tree.paths.rules ?? [];

  for (const rule of tree.excludes?.rules ?? []) {
    if (globToRegExp(rule.glob).test(upstream)) {
      return { upstream, local: null, rule: 'excluded', reason: 'excluded' };
    }
  }

  const exception = (tree.paths.exceptions ?? []).find((entry) => entry.from === upstream);
  if (exception !== undefined) {
    if (exception.to === null) {
      return { upstream, local: null, rule: 'exception', reason: 'deliberately absent' };
    }
    return { upstream, local: exception.to, rule: 'exception', reason: null };
  }

  const prefix = longestPrefix(rules, upstream);
  if (prefix !== null) {
    return {
      upstream,
      local: `${prefix.to}${upstream.slice(prefix.from.length)}`,
      rule: 'prefix',
      reason: null,
    };
  }

  const file = rules.find((rule) => rule.kind === 'file' && rule.from === upstream);
  if (file !== undefined) {
    return { upstream, local: file.to, rule: 'file', reason: null };
  }

  return { upstream, local: upstream, rule: 'identity', reason: null };
}

/**
 * Every watch entry that names this path, ordered by descending length of the
 * matched upstream path and then by ascending watch id in byte order. The
 * longest match is the most specific claim, and the id is the stable tiebreak.
 */
export function watchHits(tree: QueryTree, upstreamPath: string): { id: string; matched: string }[] {
  const hits: { id: string; matched: string }[] = [];
  const seen = new Set<string>();
  for (const entry of (tree.watchlist ?? []).filter((item) => item.subtree === tree.name)) {
    let best: string | null = null;
    for (const raw of entry.upstream_paths ?? []) {
      if (!watchMatches(raw, upstreamPath)) continue;
      if (best === null || raw.length > best.length) best = raw;
    }
    if (best === null) continue;
    const key = `${entry.id}\u0000${best}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ id: entry.id, matched: best });
  }
  return hits.sort(
    (a, b) =>
      b.matched.length - a.matched.length ||
      comparePaths(a.id, b.id) ||
      comparePaths(a.matched, b.matched),
  );
}

function isKnownPath(tree: QueryTree, upstreamPath: string): boolean {
  const exceptions = tree.paths.exceptions ?? [];
  if (exceptions.some((entry) => entry.from === upstreamPath)) return true;
  return (tree.upstreamPaths ?? []).includes(upstreamPath);
}

/** One index per direction, built in a single pass over the rules. */
function buildRenameIndex(document: RenamesDocument): {
  forward: Map<string, RenameRule[]>;
  reverse: Map<string, RenameRule[]>;
} {
  const forward = new Map<string, RenameRule[]>();
  const reverse = new Map<string, RenameRule[]>();
  for (const rule of document.rules ?? []) {
    const byFrom = forward.get(rule.from);
    if (byFrom === undefined) forward.set(rule.from, [rule]);
    else byFrom.push(rule);
    const byTo = reverse.get(rule.to);
    if (byTo === undefined) reverse.set(rule.to, [rule]);
    else byTo.push(rule);
  }
  return { forward, reverse };
}

/** `to → from`: the operation a CVE runbook needs, given a HALO symbol. */
export function reverseLookup(
  symbol: string,
  renameMap: RenamesDocument,
): { from: string; ruleId: string; kind: string }[] {
  const rules = buildRenameIndex(renameMap).reverse.get(symbol) ?? [];
  return [...rules]
    .sort((a, b) => comparePaths(a.id, b.id))
    .map((rule) => ({ from: rule.from, ruleId: rule.id, kind: rule.kind }));
}

/** `from → to`: upstream token to the HALO token that replaced it. */
export function forwardLookup(
  from: string,
  renameMap: RenamesDocument,
): { to: string; ruleId: string; kind: string }[] {
  const rules = buildRenameIndex(renameMap).forward.get(from) ?? [];
  return [...rules]
    .sort((a, b) => comparePaths(a.id, b.id))
    .map((rule) => ({ to: rule.to, ruleId: rule.id, kind: rule.kind }));
}

function renameMapsFor(
  trees: readonly QueryTree[],
  options: LookupOptions,
): readonly RenameMap[] {
  if (options.renameMaps !== undefined) return options.renameMaps;
  const maps: RenameMap[] = [];
  for (const tree of trees) {
    if (tree.renames === undefined || tree.renames === null) continue;
    maps.push({ name: tree.renameSource ?? `vendor/${tree.name}/provenance/RENAMES.json`, document: tree.renames });
  }
  return maps;
}

function renameHits(query: string, maps: readonly RenameMap[]): RenameHit[] {
  const hits = new Map<string, RenameHit>();
  for (const map of maps) {
    for (const rule of map.document.rules ?? []) {
      if (rule.from === query) {
        hits.set(`${rule.id}\u0000forward`, {
          ruleId: rule.id,
          kind: rule.kind,
          direction: 'forward',
          from: rule.from,
          to: rule.to,
        });
      }
      if (rule.to === query) {
        hits.set(`${rule.id}\u0000reverse`, {
          ruleId: rule.id,
          kind: rule.kind,
          direction: 'reverse',
          from: rule.from,
          to: rule.to,
        });
      }
    }
  }
  return [...hits.values()].sort(
    (a, b) => comparePaths(a.ruleId, b.ruleId) || comparePaths(a.direction, b.direction),
  );
}

/**
 * Resolve a query against every supplied tree. A path query is recognised by
 * manifest membership (or an exception); anything else is treated as a symbol,
 * scanned across the watchlists and the upstream path list.
 */
export function lookup(
  rawQuery: string,
  trees: readonly QueryTree[],
  options: LookupOptions = {},
): LookupResult {
  const query = normalizeUpstreamPath(rawQuery);
  const ordered = [...trees].sort((a, b) => comparePaths(a.name, b.name));
  const paths: PathHit[] = [];
  const symbols: SymbolHit[] = [];

  for (const tree of ordered) {
    if (!isKnownPath(tree, query)) continue;
    const resolved = resolveUpstreamPath(query, tree);
    paths.push({
      tree: tree.name,
      treeRoot: tree.localRoot ?? `vendor/${tree.name}`,
      upstream: resolved.upstream,
      local: resolved.local,
      rule: resolved.rule,
      reason: resolved.reason,
      watch: watchHits(tree, resolved.upstream).map((hit) => hit.id),
    });
  }

  if (paths.length === 0) {
    const seenSymbols = new Set<string>();
    const seenPaths = new Set<string>();
    for (const tree of ordered) {
      for (const entry of (tree.watchlist ?? []).filter((item) => item.subtree === tree.name)) {
        if (!(entry.symbols ?? []).includes(query)) continue;
        for (const local of entry.local_paths ?? []) {
          const key = `${entry.id}\u0000${local}`;
          if (seenSymbols.has(key)) continue;
          seenSymbols.add(key);
          symbols.push({ tree: tree.name, symbol: query, local, watch: entry.id });
        }
      }
      for (const upstream of tree.upstreamPaths ?? []) {
        if (upstream !== query && !upstream.endsWith(`/${query}`) && !upstream.includes(query)) {
          continue;
        }
        const key = `${tree.name}\u0000${upstream}`;
        if (seenPaths.has(key)) continue;
        seenPaths.add(key);
        const resolved = resolveUpstreamPath(upstream, tree);
        paths.push({
          tree: tree.name,
          treeRoot: tree.localRoot ?? `vendor/${tree.name}`,
          upstream: resolved.upstream,
          local: resolved.local,
          rule: resolved.rule,
          reason: resolved.reason,
          watch: watchHits(tree, resolved.upstream).map((hit) => hit.id),
        });
      }
    }
  }

  const renames = renameHits(query, renameMapsFor(ordered, options));
  const matched = paths.length > 0 || symbols.length > 0 || renames.length > 0;
  const kind: LookupResult['kind'] =
    paths.length > 0 ? 'path' : symbols.length > 0 ? 'symbol' : 'unknown';
  return { query, kind, paths, symbols, renames, matched };
}

/**
 * Render a result as stable lines. `baseDir` turns on the separate `EXISTS`
 * line; without it the renderer is pure and byte-identical for identical input.
 */
export function renderLookup(
  result: LookupResult,
  baseDir?: string,
  renameMaps: readonly RenameMap[] = [],
): string {
  const lines: string[] = [];

  for (const hit of result.paths) {
    const watch = hit.watch.length > 0 ? hit.watch.join(',') : 'none';
    const repoLocal = hit.local === null ? 'ABSENT' : `${hit.treeRoot}/${hit.local}`;
    const reason = hit.reason === null ? '' : ` reason=${hit.reason}`;
    lines.push(
      `PATH ${hit.upstream} -> ${repoLocal} ` +
        `(rule=${hit.rule} watch=${watch}${reason}) tree=${hit.tree}`,
    );
    if (hit.local !== null && baseDir !== undefined) {
      const exists = existsSync(join(baseDir, ...`${hit.treeRoot}/${hit.local}`.split('/')));
      lines.push(`EXISTS ${hit.treeRoot}/${hit.local} ${exists ? 'yes' : 'no'}`);
    }
  }

  for (const hit of result.symbols) {
    lines.push(
      `SYMBOL ${hit.symbol} -> ${hit.local ?? '-'} (watch=${hit.watch}) tree=${hit.tree}`,
    );
  }

  for (const hit of result.renames) {
    const other = hit.direction === 'forward' ? hit.to : hit.from;
    lines.push(
      `SYMBOL ${result.query} -> ${other} ` +
        `(watch=none rule=${hit.ruleId} kind=${hit.kind} direction=${hit.direction})`,
    );
  }

  if (result.renames.length === 0) {
    for (const map of renameMaps) {
      if ((map.document.rules ?? []).length === 0) lines.push(`renames: empty (${map.name})`);
    }
  }

  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

function readJsonFile<T>(file: string, baseDir: string): T {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new ProvenanceError(
      `missing ledger: ${relativePosix(baseDir, file)}: ${(error as Error).message}`,
      2,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new ProvenanceError(
      `malformed ledger: ${relativePosix(baseDir, file)}: ${(error as Error).message}`,
      2,
    );
  }
}

/** `provenance/watchlist.json`, or no entries when the contract is absent. */
export function loadWatchlist(baseDir: string): WatchEntry[] {
  const file = join(baseDir, 'provenance', 'watchlist.json');
  if (!existsSync(file)) return [];
  const document = readJsonFile<{ entries?: unknown }>(file, baseDir);
  if (!Array.isArray(document.entries)) {
    throw new ProvenanceError(`malformed ledger: ${relativePosix(baseDir, file)}`, 2);
  }
  return document.entries.filter(
    (entry): entry is WatchEntry =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as WatchEntry).id === 'string' &&
      typeof (entry as WatchEntry).subtree === 'string',
  );
}

/** The tree names the lookup can consider, without walking `vendor/`. */
export function knownTreeNames(watchlist: readonly WatchEntry[]): string[] {
  const names = new Set<string>(Object.keys(TREE_REPOS));
  for (const entry of watchlist) names.add(entry.subtree);
  return [...names].sort(comparePaths);
}

/** Load one tree's ledger documents. Missing `PATHS.json` is a hard error. */
export function loadQueryTree(
  baseDir: string,
  tree: string,
  watchlist: readonly WatchEntry[] = [],
): QueryTree {
  const ledger = ledgerPaths(baseDir, tree);
  const paths = readJsonFile<PathsDocument>(ledger.paths, baseDir);
  if (!Array.isArray(paths.rules ?? [])) {
    throw new ProvenanceError(`malformed ledger: ${relativePosix(baseDir, ledger.paths)}`, 2);
  }

  const excludes = existsSync(ledger.excludes)
    ? readJsonFile<ExcludesDocument>(ledger.excludes, baseDir)
    : null;

  let renames: RenamesDocument | null = null;
  if (existsSync(ledger.renames)) {
    renames = readJsonFile<RenamesDocument>(ledger.renames, baseDir);
    if (!Array.isArray(renames.rules ?? [])) {
      throw new ProvenanceError(`malformed ledger: ${relativePosix(baseDir, ledger.renames)}`, 2);
    }
  }

  let upstreamPaths: string[] = [];
  if (existsSync(ledger.manifestUpstream)) {
    try {
      upstreamPaths = readManifestFile(ledger.manifestUpstream).map((row) => row.path);
    } catch (error) {
      throw new ProvenanceError(
        `malformed ledger: ${relativePosix(baseDir, ledger.manifestUpstream)}: ${(error as Error).message}`,
        2,
      );
    }
  }

  return {
    name: tree,
    paths,
    excludes,
    renames,
    renameSource: relativePosix(baseDir, ledger.renames),
    watchlist,
    upstreamPaths,
    localRoot: `vendor/${tree}`,
  };
}

export type WhereOptions = {
  query: string;
  tree: string | null;
  renames: string | null;
};

export function parseWhereArgs(argv: readonly string[]): WhereOptions | null {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) return null;

  let query: string | null = null;
  let tree: string | null = null;
  let renames: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--tree' || arg === '--renames') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new ProvenanceError(`missing value for ${arg}`, 2);
      }
      if (arg === '--tree') tree = value;
      else renames = value;
      index += 1;
    } else if (arg.startsWith('--')) {
      throw new ProvenanceError(`unknown option: ${arg}`, 2);
    } else if (query === null) {
      query = arg;
    } else {
      throw new ProvenanceError(`unexpected argument: ${arg}`, 2);
    }
  }

  if (query === null) {
    throw new ProvenanceError('missing query', 2);
  }
  return { query, tree, renames };
}

/** `where.ts <query> [--tree <name>] [--renames <path>]` */
export function mainWhere(argv: readonly string[], baseDir?: string): number {
  const root = baseDir ?? resolve(import.meta.dir, '..', '..');
  try {
    const options = parseWhereArgs(argv);
    if (options === null) {
      process.stdout.write(WHERE_USAGE);
      return 0;
    }

    const watchlist = loadWatchlist(root);
    const names = options.tree !== null ? [options.tree] : knownTreeNames(watchlist);
    const trees: QueryTree[] = [];
    for (const name of names) {
      const pathsFile = ledgerPaths(root, name).paths;
      if (!existsSync(pathsFile)) {
        if (options.tree !== null) {
          throw new ProvenanceError(`missing ledger: vendor/${name}/provenance/PATHS.json`, 2);
        }
        continue;
      }
      trees.push(loadQueryTree(root, name, watchlist));
    }

    let renameMaps: RenameMap[];
    if (options.renames !== null) {
      const file = isAbsolute(options.renames) ? options.renames : resolve(root, options.renames);
      const document = readJsonFile<RenamesDocument>(file, root);
      if (!Array.isArray(document.rules ?? [])) {
        throw new ProvenanceError(`malformed ledger: ${relativePosix(root, file)}`, 2);
      }
      renameMaps = [{ name: relativePosix(root, file), document }];
    } else {
      renameMaps = trees
        .filter((tree) => tree.renames !== undefined && tree.renames !== null)
        .map((tree) => ({
          name: tree.renameSource ?? `vendor/${tree.name}/provenance/RENAMES.json`,
          document: tree.renames as RenamesDocument,
        }));
    }

    const result = lookup(options.query, trees, { renameMaps });
    process.stdout.write(renderLookup(result, root, renameMaps));
    if (!result.matched) {
      process.stdout.write(`not found ${options.query}\n`);
      return 3;
    }
    return 0;
  } catch (error) {
    if (error instanceof ProvenanceError) {
      process.stderr.write(`${error.message}\n`);
      return error.code;
    }
    throw error;
  }
}

if (import.meta.main) {
  process.exit(mainWhere(process.argv.slice(2)));
}
