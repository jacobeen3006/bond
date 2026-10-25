# Provenance runbook

How an upstream security fix is located in HALO and landed as a recorded patch.
The same six steps are executed end-to-end by `tests/provenance/cve-drill.test.ts`
against the hermetic fixture, so a stale instruction here fails the suite rather
than misleading an operator.

`<tree>` is one of `oh-my-pi`, `hermes-agent`, `hindsight`, `gsd-omp`.

## Windows prerequisites

- `git config --local core.longpaths true` in this repository. The vendored
  trees stack well past `MAX_PATH`, and a truncated path looks like a missing
  file rather than a Windows limit (PITFALLS P-08).
- The system `core.autocrlf=true` on this workstation is neutralised by
  `.git/info/attributes` containing `* -text -filter -ident -working-tree-encoding`
  and by every tool invocation passing `-c core.autocrlf=false`. **Never** change
  the system git config to compensate; the staging attributes are the contract
  and the import/replay/index invariants depend on them.
- `tar` (bsdtar) and `git-lfs` must be on `PATH`. Neither is installed by the
  repository.

## 0. Rehydrate the cache from the ledger

`upstream-cache/` is gitignored. A fresh clone therefore has no bare mirror, and
`just provenance-replay tree=<tree>` exits 2 with a missing-cache error before
any triage can start. Rehydrate from the SHAs recorded in
`vendor/<tree>/provenance/UPSTREAM.json` — this is a no-op on a warm cache and
never re-resolves a branch:

```
just provenance-fetch tree=<tree>
```

To rehydrate every tree from its own ledger:

```
just provenance-fetch
```

The same rehydration runs inside `just verify` (plan 01-09) for exactly this
reason: replay is network-backed (DEC-02) while the cache is a local artifact,
so the documented sequence has to start by recreating it.

## 1. Get the fix commit

Query OSV by commit. `POST /v1/query` accepts `{"commit": "<sha>"}` and returns
`affected[].ranges[].events[]` with the `introduced` and `fixed` git hashes:

```
POST https://api.osv.dev/v1/query
{"commit": "<fix-commit-sha>"}
```

Record the advisory id, the `introduced` hash and the `fixed` hash. The pinned
SHA in `UPSTREAM.json.commit` is the baseline HALO actually imported; if
`introduced` is older than it and `fixed` is newer, HALO is inside the affected
window.

## 2. Expand to paths

```
git -C upstream-cache/<tree>.git diff --name-only <introduced>..<fixed>
```

Every line is an upstream path. Do not guess a local path from it — step 3 is
what maps it.

## 3. Map path and symbol through the ledger

Path first:

```
just provenance-where query=<upstream-path> tree=<tree>
```

Then the symbol or string the advisory names:

```
just provenance-where query=<symbol> tree=<tree>
```

Both print the resolved local path with `rule=<prefix|file|exception|identity>`,
the matching watch ids in ordering order, a separate `EXISTS` line, and any
rename hit. `tree` and `query` are declared `justfile` variables — PowerShell
does not pass positional recipe arguments the way other shells do, so
`just provenance-where docs/rpc.md` would silently drop the query.

Before Phase 2 populates the real rename maps, reverse lookup is exercised
through the fixture map. This is the only supported way to see reverse-rename
behaviour today:

```
bun run tools/provenance/cli.ts where <symbol> --tree <tree> --renames tests/provenance/fixtures/renames.synthetic.json
```

If no path matches because the file was renamed upstream, fall back to content
identity: take the blob OID for the old path from
`vendor/<tree>/provenance/MANIFEST.upstream.tsv` and ask the cache which commits
touched it:

```
git -C upstream-cache/<tree>.git log --all --find-object=<blob-oid>
```

## 4. Land it as a patch

Apply the upstream diff to a scratch tree and resolve it against the rebranded
vendored file (`git apply -3` inside the scratch repo gives conflict markers),
then regenerate the patch through the standard flow and append its filename to
`vendor/<tree>/provenance/patches/series` — after every earlier entry, never
sorted. Every patch file carries the four headers, and `git apply` ignores them
so the same file is both auditable and machine-applicable:

```
From: HALO <halo@localhost>
Subject: [PATCH 0001] <what the patch changes>

Upstream-Ref: <fixed-commit-sha>
Halo-Reason: <why HALO differs from upstream here>
Halo-Touches: <upstream path>
Halo-CVE: <advisory-id>

---
<unified diff>
```

`Upstream-Ref` is what makes a later audit or re-import answerable. Keep the
series ordered: a patch authored against post-previous content does not apply to
the pristine tree, and replay names the failing index and path.

## 5. Refresh the ledger and prove it

Stage the patch and refresh the manifest. This restages the worktree through the
same manifest writer the import uses, rewrites `MANIFEST.vendored.tsv` and
updates `UPSTREAM.json.manifests.vendored_sha256` without re-extracting the
tree:

```
just provenance-manifest tree=<tree>
```

`just provenance-manifest tree=<tree>` is the only supported way to refresh
`MANIFEST.vendored.tsv` after applying a patch. Never hand-edit the TSV or
`UPSTREAM.json`; a hand-edited manifest defeats the oracle it exists to be.

Then prove the tree is still reconstructible:

```
just provenance-replay tree=<tree>
```

Commit the patch file, `MANIFEST.vendored.tsv` and `UPSTREAM.json` together. If
replay fails, the patch is wrong — not the manifest.

## Watchlist maintenance

`provenance/watchlist.json` names the subsystems worth watching, their upstream
paths, their local paths, the symbols HALO depends on, and the contract test
that fails when the contract drifts. Add a `tests/provenance/cve-drill.test.ts`
entry to every watch entry that has none, and update `last_checked` whenever the
drill is run against a new advisory class.

## The one gate: `just verify`, locally and in CI

`just verify` is the whole provenance system in one command, and the only
documented verification entry point. In order:

0. `fetch --all` — rehydrate `upstream-cache/` from the SHAs in every
   `UPSTREAM.json`. A no-op on a warm cache; the difference between green and
   `exit 2` on a clone that has never fetched (step 0 above).
1. `verify --all` — ledger digests, the vendored index, the worktree, and the
   unrecorded-edit detector.
2. `replay --all` — reconstruct every tree from its SHA, `patches/series` and
   renames, and compare byte for byte.
3. `bun test tools/provenance` — the module suites.
4. `bun test tests/provenance` — the repository suites, including
   `workspace-isolation.test.ts` (no root workspace, no vendored `.git`, no
   submodule).

Every step fails closed and `just` stops at the first non-zero exit, so one
command answers "is the ledger still true?".

`.github/workflows/provenance.yml` defines one job, `provenance-replay`, whose
final step is `just verify` — the same command, never a copy of its steps. The
job installs Bun (`windows-latest` ships Node but not Bun), installs `just`,
restores `upstream-cache/` under a key derived from the recorded
`vendor/*/provenance/UPSTREAM.json` files, runs
`bun run tools/provenance/cli.ts fetch --all` (cold-cache safety: the same
step 0 the local gate runs), then the gate itself.

Status: **workflow committed; remote not configured.** This repository has no
remote yet, so the CI job has never run. Until one exists and the workflow is
pushed, `just verify` locally is the gate.

### The commit gate

Cheaper than the full gate, and safe on every commit that touches the ledger.
Enable it once per clone:

```
git config --local core.hooksPath .githooks
```

`.githooks/pre-commit` runs `provenance-verify` only when the staged paths touch
`vendor/` or `provenance/`, and exits immediately otherwise. It never contacts a
remote and never replays (DEC-02); replay stays the deliberate act that
`just verify` performs.
