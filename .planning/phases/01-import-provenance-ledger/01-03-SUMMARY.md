---
phase: 01-import-provenance-ledger
plan: 03
subsystem: infra
tags: [provenance, vendoring, git-archive, json-schema, hermes-agent, hindsight, uv-workspace, byte-fidelity]

# Dependency graph
requires:
  - phase: 01-import-provenance-ledger
    plan: 01-01
    provides: pinned gsd-omp import, TREE_REPOS registry, fetch/import/replay CLI, shared ledger derivations
  - phase: 01-import-provenance-ledger
    plan: 01-02
    provides: hermetic tiny-upstream fixture and the hostile-path / attribute-fidelity gates
provides:
  - four draft-2020-12 schemas (paths, renames, excludes, watchlist) every vendored ledger validates against
  - `cli.ts ledger --tree` — re-derives the three ledger documents through the import's own functions and fails on drift
  - `vendor/hermes-agent` imported at 930e5ed with a complete, replayable ledger
  - `vendor/hindsight` imported at 4822d66 with its uv and npm workspace roots preserved
  - `provenance/watchlist.json` with one verified entry per imported tree
  - `UPSTREAM.json.notes` carrying each tree's own requires-python, package manager, root lockfiles and workspace root
  - batched git plumbing (cat-file --batch, hash-object --stdin-paths, check-attr --stdin) for whole-tree imports
affects: [01-04-structural-check, 01-05-oh-my-pi-import, 01-06-cve-drill, 01-08-verify, 02-rebrand]

actuals:
  tokens: 14269    # chars/4 over the authored provenance+tooling diff (57,077 bytes); the 6.0M vendored lines are imported bytes, not authored text
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Derive-once, compare-bytes: `ledger` re-runs the import's derivation and diffs the bytes instead of trusting a second implementation"
    - "Byte-neutral archive: the cache's `info/attributes` is written before `git archive` so tree `eol` attributes cannot rewrite extracted bytes"
    - "Force staging for vendored trees: `git add -A -f` so a tree's own `.gitignore` cannot drop upstream-tracked files"
    - "Batched plumbing: one git process per operation class instead of one per file"

key-files:
  created:
    - provenance/schema/paths.schema.json
    - provenance/schema/renames.schema.json
    - provenance/schema/excludes.schema.json
    - provenance/schema/watchlist.schema.json
    - provenance/watchlist.json
    - vendor/hermes-agent/ (21220 files + ledger)
    - vendor/hindsight/ (5084 files + ledger)
  modified:
    - provenance/schema/upstream.schema.json
    - tools/provenance/cli.ts
    - tools/provenance/ledger.ts
    - tools/provenance/manifest.ts
    - tools/provenance/stage.ts
    - tools/provenance/replay.ts
    - tools/provenance/test/upstream-json.test.ts

key-decisions:
  - "The ledger command never rewrites silently: a differing document prints LEDGER DRIFT and exits 1 unless --force"
  - "Build facts live in UPSTREAM.json.notes per tree (requires-python, package-manager, lockfile, workspace-root) rather than a root pyproject/uv workspace (DEC-04)"
  - "Watch entries name the surface that exists at the imported SHA, not the paths named in research: hermes reads at hermes_cli/plugins*.py, agent/tool_executor.py; hindsight at hindsight-api-slim/hindsight_api/**"
  - "The cache is hydrated once with a depth-1 full fetch; blob:none lazy fetch is pathological on a 21k-file tree"

patterns-established:
  - "Ledger schema trio requires `schema`+`subtree`; excludes requires glob+reason+approved_by, so an unexplained drop is a validation failure"
  - "upstream.schema.json notes is optional, so ledgers written before the field stay valid"

requirements-completed: [IMPT-01, IMPT-05]

coverage:
  - id: D1
    description: "Four ledger schemas exist and every vendored tree's PATHS/RENAMES/EXCLUDES validate against them"
    requirement: IMPT-01
    verification:
      - kind: unit
        ref: "bun test tools/provenance/test/upstream-json.test.ts (55 pass, 0 fail)"
        status: pass
    human_judgment: false
  - id: D2
    description: "`ledger --tree` is idempotent: unchanged bytes report `LEDGER OK <tree> unchanged`, drift exits 1"
    requirement: IMPT-01
    verification:
      - kind: integration
        ref: "bun run tools/provenance/cli.ts ledger --tree gsd-omp|hermes-agent|hindsight (all exit 0, unchanged)"
        status: pass
    human_judgment: false
  - id: D3
    description: "hermes-agent imported at its pinned SHA, byte-identical pyproject.toml, replayable, with a validated watch entry"
    requirement: IMPT-05
    verification:
      - kind: integration
        ref: "just provenance-replay tree=hermes-agent -> REPLAY OK hermes-agent files=21220"
        status: pass
      - kind: unit
        ref: "tools/provenance/test/upstream-json.test.ts#hermes-agent ledger"
        status: pass
    human_judgment: false
  - id: D4
    description: "hindsight imported at its pinned SHA with every lockfile recorded and its own uv/npm workspace roots preserved"
    requirement: IMPT-05
    verification:
      - kind: integration
        ref: "just provenance-replay (no tree) -> REPLAY OK gsd-omp/hermes-agent/hindsight"
        status: pass
      - kind: unit
        ref: "tools/provenance/test/upstream-json.test.ts#hindsight ledger"
        status: pass
    human_judgment: false

metrics:
  duration: 65min
  started: "2026-10-25T15:27:00+01:00"
  completed: "2026-10-25T16:31:00+01:00"
  tasks: 3
  files: 26311
  status: complete
---

# Phase 1 Plan 03: Import & Provenance Ledger Summary

**Four ledger schemas, an idempotent `ledger` command, and hermes-agent plus hindsight imported at pinned SHAs with byte-verified, replayable ledgers and a three-entry advisory watchlist**

## Performance

- **Duration:** ~65 min
- **Started:** 2026-10-25T15:27:00+01:00
- **Completed:** 2026-10-25T16:31:00+01:00
- **Tasks:** 3
- **Files modified:** 26,311 (26,304 vendored files + 7 authored/ledger files)

## Accomplishments

- Wrote `paths`, `renames`, `excludes` and `watchlist` schemas as draft 2020-12; all three vendored trees' ledgers validate against them, and the test asserts the schemas themselves reject an exclude with no `reason` and a watch entry with no `last_checked`.
- Added `cli.ts ledger --tree`, a thin wrapper over `derivePaths`/`deriveRenames`/`deriveExcludes`. On the committed gsd-omp ledger it reports `LEDGER OK gsd-omp unchanged` on both consecutive runs and writes nothing; a differing document exits 1 with `LEDGER DRIFT <path>` and needs `--force`.
- Imported `hermes-agent` at `930e5ed557edb25b4b0b8ca3f51679dde3c92eb6`: 21,220 files / 234,700,460 bytes, `pyproject.toml` blob-identical to upstream, no gitlink, no nested `.git`, `REPLAY OK` in 90 s.
- Imported `hindsight` at `4822d66e093dadfd6b2b80186fd0395ef80926ca`: 5,084 files / 272,031,840 bytes, all 53 shipped lockfiles recorded with SHA-256, root `pyproject.toml` byte-identical, `REPLAY OK`; both trees' own uv/npm workspace roots stay inside the vendored tree (no root workspace file).
- Recorded each tree's own build facts in `UPSTREAM.json.notes`: hermes `requires-python ">=3.11,<3.15"`, `nix + npm + uv`, npm workspace root; hindsight `requires-python "none (root)"` with every existing member's declared constraint (`>=3.11`, `hindsight-clients/python >=3.10`), 53 lockfiles.
- `provenance/watchlist.json` now carries one entry per imported tree, each with all nine required fields, every `local_path` existing and every `upstream_path` present in that tree's `MANIFEST.upstream.tsv`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Ledger schemas + the complete gsd-omp ledger** — `83a99a1` (feat)
2. **Task 2: Import hermes-agent with its own workspace root preserved** — `55be0b29` (feat)
3. **Task 3: Import hindsight with its own uv workspace root preserved** — `542535e3` (feat)

**Plan metadata:** summary commit follows this file.

## Files Created/Modified

- `provenance/schema/paths.schema.json` — prefix/file rules, exceptions (null target = deliberately absent), HALO-added paths
- `provenance/schema/renames.schema.json` — rule id shape `R-<KIND>-<NNNN>`, kind enum, scope, applied_by
- `provenance/schema/excludes.schema.json` — glob + reason + approved_by all required
- `provenance/schema/watchlist.schema.json` — nine required entry fields
- `provenance/schema/upstream.schema.json` — optional `notes` string map, existing ledgers stay valid
- `provenance/watchlist.json` — `WL-GSD-EXTENSION-API`, `WL-HERMES-PLUGIN-LOADER`, `WL-HINDSIGHT-RETRIEVAL`
- `tools/provenance/cli.ts` — `ledger` command, `--force`, `LEDGER DRIFT` path
- `tools/provenance/ledger.ts` — `deriveTreeNotes` (Bun.TOML + package.json), `notes` on `UpstreamLedger`
- `tools/provenance/manifest.ts` — `hashBlobs` via chunked `cat-file --batch`
- `tools/provenance/stage.ts` — `writeArchiveAttributes`, forced `git add -A -f`, batched `checkAttributes`, notes at import
- `tools/provenance/replay.ts` — `writeArchiveAttributes` + forced staging so replay reproduces ignored and eol-attributed files
- `tools/provenance/test/upstream-json.test.ts` — iterates every tree on disk, validates all four schemas, watchlist, digests
- `vendor/hermes-agent/` — 21,220 files + six ledger documents + comment-only `patches/series`
- `vendor/hindsight/` — 5,084 files + six ledger documents + comment-only `patches/series`

## Decisions Made

- **Notes are derived, not hand-written.** `deriveTreeNotes` reads the tree's own `pyproject.toml`/`package.json`; an absent declaration is recorded as absent (`none (root)`), never copied from a member or invented.
- **Watch paths come from the manifest, not research.** The research guesses (`agent/plugins/`, `agent/hooks/`, `agent/session/`, `hindsight_api/`, `embedding/`) are not present at these SHAs. Hermes is watched at `hermes_cli/plugins.py`, `hermes_cli/plugins_dispatch.py`, `hermes_cli/plugin_isolation.py`, `agent/tool_executor.py`; hindsight at `hindsight-api-slim/hindsight_api/{api/http.py,engine/memories/pg/recall.py,engine/memories/pg/retain.py,engine/embeddings.py}`.
- **No exclusions were needed.** Both trees passed preflight and stayed under the 600 MB budget, so every `EXCLUDES.json` is empty and nothing was dropped.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `blob:none` lazy fetch made a whole-tree import pathological**
- **Found during:** Task 2 (hermes-agent import)
- **Issue:** the plan-01-01 cache fetches commits with `--filter=blob:none`; `git archive` then lazily fetched ~22k blobs one round-trip at a time, and the first import was killed at the 1800 s harness limit having grown 736 tiny packs.
- **Fix:** hydrated each cache once with `git fetch --depth=1 --no-tags origin <sha>` into a fresh bare repo (hermes 87 MiB pack / 33 s, hindsight in 9 s), then swapped it in. The cache is gitignored; the recorded SHA, repo URL and `refs/heads/main` are unchanged.
- **Files modified:** none (cache only, `upstream-cache/`)
- **Verification:** `import` plus two replays complete in 176 s / 90 s / 66 s; `cat-file -e <sha>^{commit}` passes on both caches.
- **Committed in:** n/a (untracked cache)

**2. [Rule 1 - Bug] A vendored tree's own `.gitignore` silently dropped upstream-tracked files**
- **Found during:** Task 2 (first hermes import attempt)
- **Issue:** `git add -A -- vendor/<tree>` honored hermes' `.gitignore`, so upstream-tracked ignored files (e.g. `skills/creative/p5js/scripts/export-frames.js`) never entered the index; `repairModesAt` then failed with "cannot add to the index - missing --add option?".
- **Fix:** always stage vendored trees with `git add -A -f`, and force in `restage` and replay's reconstruction too, so the vendored manifest always equals upstream.
- **Files modified:** `tools/provenance/stage.ts`, `tools/provenance/replay.ts`
- **Verification:** `counts.files` equals both manifest line counts for all three trees; replay compares 21,220 / 5,084 files with zero drift.
- **Committed in:** `55be0b29`

**3. [Rule 1 - Bug] `git archive` honored `*.ps1 text eol=crlf` and emitted CRLF from LF blobs**
- **Found during:** Task 2 (second hermes import attempt, 38 `ATTR MISMATCH … .ps1`)
- **Issue:** upstream's `.gitattributes` sets `*.ps1 text eol=crlf`; `git archive` applies that conversion, so the extracted bytes hashed to a different blob than upstream stored. `core.autocrlf=false` does not override a tree attribute.
- **Fix:** `writeArchiveAttributes(cache)` writes the same byte-neutral line into the bare cache's `info/attributes` before `git archive`, in both import and replay.
- **Files modified:** `tools/provenance/stage.ts`, `tools/provenance/replay.ts`
- **Verification:** isolated check showed the extracted file's SHA-256 equals the upstream blob SHA-256 only with the override; full import then returned `IMPORT OK` and replay zero drift.
- **Committed in:** `55be0b29`

**4. [Rule 2 - Missing critical] Per-file git plumbing would have added ~20 minutes to each large import**
- **Found during:** Task 2 (performance review before the 21k-file import)
- **Issue:** `hashBlob` spawned one `git cat-file` per blob and `checkAttributes` spawned three git processes per path — ~85k processes for hermes.
- **Fix:** added `hashBlobs` (chunked `git cat-file --batch`, byte-offset parsing) and rebuilt `checkAttributes` around one `ls-files`, one `hash-object --stdin-paths` and one `check-attr --stdin`.
- **Files modified:** `tools/provenance/manifest.ts`, `tools/provenance/stage.ts`
- **Verification:** full suite 103 pass / 0 fail, including the hostile-path and attribute-fidelity gates; hermes import completes in 176 s.
- **Committed in:** `55be0b29`

**5. [Rule 3 - Environment] `just` is installed but not on PATH in this harness**
- **Found during:** Task 2 (verification)
- **Issue:** `just --version` fails; winget reports Casey.Just installed and its `Links\just.exe` is a Windows symlink the shell does not resolve.
- **Fix:** invoked the recipe binary by absolute path (`…\Casey.Just_…\just.exe provenance-fetch tree=…`). The recipe bodies are unchanged and run `bun.exe run tools/provenance/cli.ts …` exactly as written.
- **Files modified:** none
- **Verification:** `provenance-fetch`, `provenance-replay` and `provenance-replay` (all trees) via the recipe all exit 0.
- **Committed in:** n/a

---

**Total deviations:** 4 auto-fixed (2 bugs, 1 missing critical, 1 blocking) + 1 environment note
**Impact on plan:** all fixes are prerequisites for a truthful ledger at this scale; no scope was added beyond the plan's files. No exclusions were required.

## Issues Encountered

- The first hermes import exceeded the 1800 s tool deadline inside `repairModesAt` after the `.gitignore`-drop bug; the orphaned `git ls-tree` process held the cache directory open and had to be stopped before the hydrated cache could replace it.
- `git rev-list --objects --missing=print` on this repo walks full history and is unusable for a size probe; hydration was chosen instead.
- Hindsight's declared uv workspace lists `hindsight-mcp-server`, which does not exist at the imported SHA; the members note names only members that exist and declare a constraint, and `workspace-root` quotes the declaration verbatim.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Three of four trees are imported, each replayable with one command and carrying a schema-valid ledger plus a verified watch entry; `oh-my-pi` remains for plan 01-05.
- `provenance/watchlist.json` and the four schemas are ready for plan 01-04's structural check.
- No root `pyproject.toml`, `Cargo.toml`, or `vendor/**` workspace membership exists; root `package.json` workspaces remain `apps/*` and `packages/*`.
- `.planning/STATE.md` and `.planning/ROADMAP.md` were intentionally left to the orchestrator.

## Self-Check: PASSED

- FOUND: `provenance/schema/paths.schema.json`, `renames.schema.json`, `excludes.schema.json`, `watchlist.schema.json`
- FOUND: `provenance/watchlist.json` (3 entries, all nine fields each; every local path exists, every upstream path in its manifest)
- FOUND: `vendor/hermes-agent/provenance/{UPSTREAM,PATHS,RENAMES,EXCLUDES}.json`, `MANIFEST.upstream.tsv`, `MANIFEST.vendored.tsv`, `patches/series`
- FOUND: `vendor/hindsight/provenance/{UPSTREAM,PATHS,RENAMES,EXCLUDES}.json`, both manifests, `patches/series`
- FOUND: commits `83a99a1`, `55be0b29`, `542535e3` are ancestors of HEAD
- VERIFIED: `bun run tools/provenance/cli.ts ledger --tree <tree>` → `LEDGER OK … unchanged` for all three trees (exit 0)
- VERIFIED: `just provenance-replay` (no tree) → `REPLAY OK gsd-omp files=34`, `REPLAY OK hermes-agent files=21220`, `REPLAY OK hindsight files=5084` (exit 0)
- VERIFIED: `bun test tools/provenance tests/provenance` → 103 pass, 0 fail
- VERIFIED: `git status --porcelain` shows no change under `vendor/` after replay; `git ls-files -s -- vendor/{hermes-agent,hindsight,gsd-omp}` has zero mode-`160000` entries; `find vendor -name .git` is empty
