---
phase: 01-import-provenance-ledger
plan: 04
subsystem: infra
tags: [provenance, vendoring, git-archive, lfs-pointer, workspace-isolation, oh-my-pi, watchlist]

# Dependency graph
requires:
  - phase: 01-import-provenance-ledger
    plan: 01-01
    provides: TREE_REPOS registry, fetch/import/ledger/replay CLI, the `SIZE <tree>` import signal
  - phase: 01-import-provenance-ledger
    plan: 01-02
    provides: hermetic fixture plus the hostile-path and attribute-fidelity gates every import runs
  - phase: 01-import-provenance-ledger
    plan: 01-03
    provides: ledger schemas, the idempotent `ledger` command, `UPSTREAM.json.notes`, three imported trees
provides:
  - "`vendor/oh-my-pi` imported at 0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0 with a complete, replayable ledger"
  - "`vendor/oh-my-pi/provenance/LFS.json` — an import-time LFS inventory derived from the tree's own pointer blobs and cross-checked against `git lfs ls-files`"
  - "`UPSTREAM.json.notes.workspace_roots` — the Bun object-form workspaces, the Cargo `[workspace]` and `MODULE.bazel`, recorded and untouched"
  - "`provenance/watchlist.json` grown to five entries: `WL-OMP-RPC-WIRE` and `WL-OMP-PROC-SPAWN` complete the four-tree watch set"
affects: [01-05, 01-06, 01-07, 01-09, phase-02-rebrand]

actuals:
  tokens: 3270     # chars/4 over the authored tooling+watchlist diff (13,079 bytes); the 213 MB vendored tree is imported bytes, not authored text
  tasks: 2
  commits: 2
  plan_head_before: 52edea56
  plan_head_after: fad35e83

tech-stack:
  added: []
  patterns:
    - "LFS inventory at import time: pointers are detected from the tree's blobs in one `cat-file --batch`, the on-disk pointer must match, and `git lfs ls-files` is the cross-check rather than the source"
    - "Build graphs are named, never absorbed: `notes.workspace_roots` lists each declaring file/table so a capturing root workspace is detectable from the ledger alone"
    - "One blob hydration per large cache (`fetch --refetch --filter=blob:limit=1000m`) instead of per-object lazy fetches"

key-files:
  created:
    - vendor/oh-my-pi/ (9,303 files + 8 ledger documents)
    - vendor/oh-my-pi/provenance/LFS.json
    - vendor/oh-my-pi/provenance/PATHS.json
    - vendor/oh-my-pi/provenance/patches/series
  modified:
    - tools/provenance/ledger.ts
    - tools/provenance/stage.ts
    - provenance/watchlist.json

key-decisions:
  - "Imported whole: the measured tree is 9,303 files / 213,301,894 bytes (~203 MiB), well under the 600 MB budget, so no `EXCLUDES.json` rule was needed (DEC-01)"
  - "LFS.json is emitted by `emitLfsInventory` inside the import path, not by a second command: plan 01-06 owns `tools/provenance/lfs.ts` and the schema, so this plan produces the artifact without pre-empting that module"
  - "At the pinned SHA oh-my-pi ships no LFS path: the `*.wasm` payloads moved to N-API in eabbde0 (2026-01-31). LFS.json records `tracked: []` and keeps the stale upstream declaration verbatim instead of inventing an entry"
  - "`deriveTreeNotes` now reads object-form `workspaces`, `Cargo.toml#[workspace]`, `MODULE.bazel` and the `packageManager` field generically; earlier trees' notes are unchanged because none of them declares those shapes"
  - "Watch entries are derived from `MANIFEST.upstream.tsv`, not from the plan's prose: all three RPC paths and every spawn path exist at this SHA"

patterns-established:
  - "A declaration without a payload is recorded, not erased: `upstream_gitattributes_lfs_lines` keeps `*.wasm filter=lfs …` even though no pointer exists, so a future re-pin is comparable"
  - "The only `.wasm` in the tree is `crates/pi-ast/src/language/testdata/ini.wasm`, whose later `-filter binary` rule unsets the LFS filter (`git check-attr filter` → `unset`), so it is real wasm bytes (4,710) and not a smuggled payload"

requirements-completed: [IMPT-01, IMPT-05]

coverage:
  - id: D1
    description: "oh-my-pi is imported whole at its pinned SHA with a complete ledger, replayable byte-for-byte"
    requirement: IMPT-05
    verification:
      - kind: integration
        ref: "bun run tools/provenance/cli.ts import --tree oh-my-pi -> SIZE oh-my-pi files=9303 bytes=213301894 / IMPORT OK oh-my-pi files=9303"
        status: pass
      - kind: integration
        ref: "just provenance-replay tree=oh-my-pi (twice) -> REPLAY OK oh-my-pi files=9303; git status --porcelain -- vendor/oh-my-pi empty"
        status: pass
    human_judgment: false
  - id: D2
    description: "LFS-tracked content is inventoried as pointers, with the payload never fetched into vendor/"
    requirement: IMPT-01
    verification:
      - kind: integration
        ref: "vendor/oh-my-pi/provenance/LFS.json validates in shape (schema/tracked/upstream_gitattributes_lfs_lines) and `git lfs ls-files --all --json` shows the only LFS object belongs to history, not this tree"
        status: pass
    human_judgment: false
  - id: D3
    description: "The three upstream build graphs are recorded and not absorbed"
    requirement: IMPT-01
    verification:
      - kind: unit
        ref: "bun test tools/provenance/test/upstream-json.test.ts -> 71 pass, 0 fail (oh-my-pi ledger validates)"
        status: pass
      - kind: integration
        ref: "git check-attr / manifest comparison: Cargo.toml, MODULE.bazel, bun.lock and package.json are byte-identical to upstream blobs; no root Cargo.toml or pyproject.toml exists"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every imported tree maps to a watch entry with verified paths and symbols"
    requirement: IMPT-05
    verification:
      - kind: unit
        ref: "WATCH OK entries=5; upstream-json.test.ts watchlist block passes"
        status: pass
    human_judgment: false

metrics:
  duration: 14min
  started: "2026-10-25T16:27:00+01:00"
  completed: "2026-10-25T16:41:00+01:00"
  tasks: 2
  files: 9313
  status: complete
---

# Phase 1 Plan 04: Import & Provenance Ledger Summary

**The fourth and largest tree — 9,303 files across three build graphs — imported byte-exactly with an import-time LFS inventory and the RPC/spawn watch surfaces**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-10-25T16:27:00+01:00
- **Completed:** 2026-10-25T16:41:00+01:00
- **Tasks:** 2
- **Files modified:** 9,313 (9,303 vendored files + 8 ledger documents + 2 tooling files; `provenance/watchlist.json` updated in the second commit)

## Accomplishments

- Imported `oh-my-pi` at `0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0`: `SIZE oh-my-pi files=9303 bytes=213301894` (~203 MiB) — under the 600 MB budget, so the tree was imported whole and no exclusion was invented (DEC-01).
- Byte fidelity holds for the hardest tree: 91 `100755` blobs in the index against 91 upstream (no `+x` lost), zero `160000` entries, zero nested `.git` directories, `ATTR OK oh-my-pi files=9303`, and upstream's own `patches/` directory (`@ark%2Fschema@0.56.2.patch`, `puppeteer-core@25.3.0.patch`) matches its upstream blob OIDs byte-for-byte.
- Recorded the three build graphs in `UPSTREAM.json.notes.workspace_roots` — `package.json#workspaces (object form: packages/*, python/robomp/web)`, `Cargo.toml#[workspace]` with all 17 members, and `MODULE.bazel` — plus `notes.package_manager` = `bun@>=1.4`, without renaming, moving or rewriting any of those files.
- `LFS.json` is generated at import time from the tree's own blobs (one `cat-file --batch`), each record's on-disk pointer is re-parsed and compared, and `git lfs ls-files <sha> --json --long --size` is the cross-check. At this SHA upstream ships **no** LFS path (see deviations), so `tracked` is empty and the stale `*.wasm filter=lfs …` declaration is kept verbatim.
- All ten lockfiles the tree ships are listed with raw-byte SHA-256, including the nested `.omp/tools/bun.lock`, `crates/pi-builtins/Cargo.lock`, `crates/vendor/brush-core/Cargo.lock`, `sdk/python/omp-rpc/uv.lock`, `sdk/rust/omp-rpc/Cargo.lock`, and the examples' `package-lock.json` — enumeration is manifest-driven, not a fixed list.
- Ledger generated and idempotent: `LEDGER OK oh-my-pi unchanged`; `provenance/patches/series` is comment-only, so ROADMAP SC#1 now holds for all four subtrees.
- Replay green twice: `REPLAY OK oh-my-pi files=9303`, with `git status --porcelain -- vendor/oh-my-pi` empty after the second run.
- Added `WL-OMP-RPC-WIRE` (rpc-types, rpc-frame, `docs/rpc.md`; symbols `RpcCommand`, `agent_end`, `rpc_chunk`, `protocolVersion`) and `WL-OMP-PROC-SPAWN` (LSP client + mux server, DAP client, launch broker, Python kernel, Rust `Shell`; symbols `ptree.spawn`, `DapClient.spawn`, `Bun.spawn`, `connectSharedLspTransport`, `Shell.run`). Every local path exists and every upstream path is in `MANIFEST.upstream.tsv`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Preflight, measure, and import `oh-my-pi` with LFS pointers intact** — `d3bb719d` (feat, 9,313 files)
2. **Task 2: Watch entries for the RPC wire and process-spawn sites** — `fad35e83` (feat, 1 file)

**Plan metadata:** summary commit follows this file.

## Files Created/Modified

- `vendor/oh-my-pi/` — 9,303 files at the pinned SHA, plus `UPSTREAM.json`, both manifests, `PATHS.json`, `RENAMES.json`, `EXCLUDES.json`, `LFS.json`, and a comment-only `patches/series`
- `tools/provenance/ledger.ts` — `deriveTreeNotes` now detects object-form npm/Bun workspaces, `Cargo.toml#[workspace]`, `MODULE.bazel`, and the `packageManager` field; `workspace_roots` names each graph
- `tools/provenance/stage.ts` — new `emitLfsInventory` / `pointerFields` / `readBlobs` / `readLfsLsFiles` / `lfsObjectPresent`; `importFromCache` runs it after the attribute gate and records `counts.lfs_files` from the measured inventory
- `provenance/watchlist.json` — `WL-OMP-RPC-WIRE`, `WL-OMP-PROC-SPAWN`

## Decisions Made

- **Pointer detection is byte-derived, cross-checked by git-lfs.** `git lfs ls-files <sha>` answers `{"files": null}` in a bare partial cache even after hydration, so the inventory reads the tree's blobs (canonical version line, `oid`, `size`, `< 1024` bytes) and treats `git lfs ls-files` as the second opinion: a declared path that is a payload, a disagreement in `oid`/`size`, or a pointer outside the declaration all fail the import. `object_verified` is computed from the cache's `lfs/objects` store and is never assumed.
- **LFS.json is an artifact of the import, not a separate command.** Plan 01-06 owns `tools/provenance/lfs.ts`, `provenance/schema/lfs.schema.json` and the `--check` guard, so this plan emits the documented shape from the one import path and leaves that module for 01-06. `counts.lfs_files` is no longer hardcoded `0`.
- **The plan's LFS assumption was corrected against the tree.** The plan and research expect `.wasm` pointers at this SHA; upstream removed them when native bindings moved from WASM to N-API (`eabbde0`, 2026-01-31) while leaving the `*.wasm filter=lfs` line behind. The ledger records reality: `tracked: []` plus the declaration verbatim.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The blob-less cache made every sized/lfs read pathological**
- **Found during:** Task 1 (measurement and LFS inventory)
- **Issue:** `fetch` pins commits with `--filter=blob:none`. `git ls-tree -r -l` and `git lfs ls-files <sha>` then lazily fetch each blob: the first measurement exceeded 300 s, and `git lfs ls-files` failed outright with `missing object: 8adacca6…`.
- **Fix:** hydrated the cache once with `git fetch --refetch --filter=blob:limit=1000m origin refs/heads/main` (28.9 s), after which `ls-tree -l`, `lfs ls-files` and `git archive` all run locally.
- **Files modified:** none (cache only; `upstream-cache/` is gitignored)
- **Verification:** measurement returns 9,303 files / 213,301,894 bytes; import and both replays complete in 107 s / 28 s / 31 s.
- **Committed in:** n/a

**2. [Rule 3 - Environment] `just` is installed but not on PATH in this harness**
- **Found during:** Task 1 verification (`just provenance-replay tree=oh-my-pi` → `command not found`)
- **Issue:** winget reports `Casey.Just 1.59.0`; the shim exists at `%LOCALAPPDATA%\Microsoft\WinGet\Links\just.exe` but the shell does not resolve it.
- **Fix:** invoked the same binary by absolute path. The recipe bodies are unchanged and still run `bun.exe run tools/provenance/cli.ts replay --tree oh-my-pi`.
- **Files modified:** none
- **Verification:** `provenance-replay tree=oh-my-pi` via the recipe exits 0 twice with `REPLAY OK oh-my-pi files=9303`.
- **Committed in:** n/a

### Plan Assumption Corrected by the Imported Tree

**No LFS-tracked path exists at `0b5c27ab…`, so `LFS.json.tracked` is empty.**
- `git lfs ls-files 0b5c27a --json --long --size` returns `{"files": null}`; `git lfs ls-files --all` shows the historical `packages/natives/wasm/pi_natives_bg.wasm`, removed at `eabbde0`.
- A structural scan of every blob under 1024 bytes (1,358 blobs) found **no** pointer-shaped content, and the only `.wasm` in the tree is `crates/pi-ast/src/language/testdata/ini.wasm` (4,710 bytes, real `\0asm` bytes), un-filtered by the later `-filter binary` rule — `git check-attr filter` reports `unset`.
- Consequence for **plan 01-06**: its verify step asserts `LFS OK oh-my-pi tracked=<n>` with `n > 0`, which cannot hold against this SHA. That plan must either accept `tracked=0` when the inventory is cross-checked against the tree (the state this plan records) or re-pin a SHA that still carries the pointer. No exclusion, fabrication or placeholder entry was written to make the count non-zero.

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 environment) + 1 plan assumption corrected by the tree
**Impact on plan:** the import surface, ledger documents and watch set are exactly what the plan asked for; nothing was excluded and no scope was added.

## Issues Encountered

- `git ls-remote` and `git fetch` are live for this run; the import itself never contacted the network after hydration (`git archive` served from the local cache).
- `just`'s Windows shell is `pwsh`; the recipe argument form `tree=oh-my-pi` was passed unchanged.
- No pre-commit hook is installed in this repo (only `.sample` hooks), so task commits ran without hook interference and without `--no-verify`.

## Known Stubs

None. `LFS.json.tracked: []` is a measured empty set, not a stub: the declaration is preserved and the downstream conflict is named above.

## Threat Flags

None — the change adds no endpoint, auth path or trust boundary. The LFS inventory and the workspace-roots note are the plan's T-1-20/T-1-22 mitigations.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Four of four trees are imported, each replayable with one command and carrying a schema-valid ledger; `provenance/watchlist.json` has one entry per tree plus the second `oh-my-pi` surface.
- Plan 01-05 can proceed over the imported tree; plan 01-06 must reconcile the `tracked=0` LFS inventory as described above before its `tracked > 0` assertion; plan 01-09's workspace-isolation test can read `notes.workspace_roots` to detect root absorption.
- No root `Cargo.toml`, `pyproject.toml` or Bazel module is affected; root `package.json` workspaces remain `apps/*` and `packages/*`.
- `.planning/STATE.md` and `.planning/ROADMAP.md` were intentionally left to the orchestrator.

## Self-Check: PASSED

- FOUND: `vendor/oh-my-pi/provenance/UPSTREAM.json`, `MANIFEST.upstream.tsv`, `MANIFEST.vendored.tsv`, `PATHS.json`, `RENAMES.json`, `EXCLUDES.json`, `LFS.json`, `patches/series`
- FOUND: commits `d3bb719d` (import) and `fad35e83` (watch entries) are ancestors of HEAD
- VERIFIED: `SIZE oh-my-pi files=9303 bytes=213301894` then `IMPORT OK oh-my-pi files=9303`; `LFS oh-my-pi tracked=0`
- VERIFIED: `LEDGER OK oh-my-pi unchanged`; `ATTR OK oh-my-pi files=9303`
- VERIFIED: `REPLAY OK oh-my-pi files=9303` twice, `git status --porcelain -- vendor/oh-my-pi` empty
- VERIFIED: `notes.workspace_roots` names `package.json#workspaces (object form)`, `Cargo.toml#[workspace]`, `MODULE.bazel`; `notes.package_manager` = `bun@>=1.4`
- VERIFIED: 91 index `100755` == 91 upstream `100755`; zero `160000`; `find vendor/oh-my-pi -name .git` → 0
- VERIFIED: `WATCH OK entries=5`; all `local_paths` exist; every `upstream_paths` entry present in `MANIFEST.upstream.tsv`
- VERIFIED: `bun test tools/provenance/test/upstream-json.test.ts` → 71 pass, 0 fail; `bun test tools/provenance tests/provenance` → 119 pass, 0 fail
- VERIFIED: `.planning/STATE.md` and `.planning/ROADMAP.md` untouched by this plan
