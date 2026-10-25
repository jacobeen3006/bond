---
phase: 01-import-provenance-ledger
plan: 09
subsystem: infra
tags: [provenance, ci, github-actions, just, bun, workspace-isolation, supply-chain]

# Dependency graph
requires:
  - phase: 01-01..01-04
    provides: fetch/import/manifest, check-attributes, ledger, replay and the four pinned trees
  - phase: 01-05
    provides: licence pinning and the rebrand deny-list
  - phase: 01-06
    provides: LFS inventory, pointer grammar and the lockfile pin
  - phase: 01-07
    provides: provenance-where, the watchlist and the CVE drill
  - phase: 01-08
    provides: offline verify, the drift classes and the pre-commit gate
provides:
  - "`just verify` — one command: cache rehydration, verify, replay, and both provenance suites"
  - "`tools/provenance/cli.ts` — eleven-command dispatcher used by the justfile, the hook and CI"
  - "`.github/workflows/provenance.yml` — one job, `provenance-replay`, whose last step is `just verify`"
  - "`tests/provenance/workspace-isolation.test.ts` — P3/T-1-25/T-1-26 asserted, not documented"
affects: [02-rebrand-wire-contract-and-migration]

# Actuals (#2632) — same scale as the plan's estimate (chars/4), never a harness count.
actuals:
  tokens: 9706        # 38,824 bytes across the five changed files / 4
  tasks: 3
  commits: 3          # measured: git rev-list --count c1b329c..b75735d
  plan_head_before: c1b329c9cee15e8db5b045f2488b3587bd85e11d
  plan_head_after: b75735dee9cafe56e7c9c37257a466878e099223

tech-stack:
  added: [just 1.59.0 (already installed; recipes completed), GitHub Actions]
  patterns:
    - "Single dispatcher: commands with an existing grammar are delegated whole, never re-parsed"
    - "Cold-cache rehydration is step 0 of the gate, so the documented command works on a fresh clone"
    - "CI runs the developer's recipe, so there is no second command list to drift"
    - "Named just recipe parameters, because PowerShell does not pass positional recipe arguments"
    - "Negative invariants (no .git, no .gitmodules, no root workspace) are tests, not prose"

key-files:
  created:
    - .github/workflows/provenance.yml
    - tests/provenance/workspace-isolation.test.ts
  modified:
    - tools/provenance/cli.ts
    - justfile
    - provenance/README.md

key-decisions:
  - "`verify`, `where` and `lfs` are delegated whole to their module `main`, so the dispatcher cannot restate a flag rule and the two entry points cannot drift."
  - "`just verify` begins with `fetch --all`: replay exits 2 on a missing cache, so the gate rehydrates the gitignored cache from the recorded SHAs before it checks anything."
  - "The justfile names `bun.exe`: this PATH also holds an extensionless `bun` that PowerShell resolves but does not execute, which made a `bun`-prefixed recipe exit 0 without running."
  - "The workflow calls `just verify` as its final step instead of listing steps; setup-bun and `fetch --all` are the only additions, and both are cold-cache necessities."
  - "The isolation suite reads files only — an install would itself mutate the lockfiles IMPT-06 pins."

requirements-completed: [IMPT-01, IMPT-02, IMPT-03, IMPT-05, IMPT-06]

coverage:
  - id: D1
    description: "One command, `just verify`, runs the whole provenance gate and exits non-zero on any failure"
    requirement: IMPT-01
    verification:
      - kind: integration
        ref: "just verify (warm cache) — exit 0; verify+replay OK on all four trees; 198 + 79 tests pass"
        status: pass
      - kind: integration
        ref: "just verify with upstream-cache/ removed — rehydrated all four caches, exit 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "All eleven subcommands are reachable through cli.ts with their module's own flags"
    requirement: IMPT-03
    verification:
      - kind: unit
        ref: "bun test tools/provenance (198 pass); bun run tools/provenance/cli.ts bogus — exit 2, usage on stderr only"
        status: pass
      - kind: manual_procedural
        ref: "fetch/verify/replay/ledger/license/manifest/check-attributes/denylist-check/where/lfs invoked; lfs output and exit code identical through module and CLI"
        status: pass
    human_judgment: false
  - id: D3
    description: "The `provenance-replay` CI job runs the same gate, from a cold cache, with a cache key derived from the recorded SHAs"
    requirement: IMPT-01
    verification:
      - kind: other
        ref: "workflow structural gate — WORKFLOW OK jobs=1 id=provenance-replay tokens=6"
        status: pass
    human_judgment: true
    rationale: "CI has never run: the repository has no remote, so the job is committed but inert. Its shape is asserted; its execution is unverified by definition."
  - id: D4
    description: "Workspace isolation and the no-gitlink rule fail the suite if violated"
    requirement: IMPT-06
    verification:
      - kind: unit
        ref: "bun test tests/provenance/workspace-isolation.test.ts — 9 pass, 0 fail, 22 expect() calls"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-10-25
status: complete
---

# Phase 1 Plan 9: One-Command Provenance Gate Summary

**`just verify` became the single gate — cache rehydration, ledger verify, byte-for-byte replay and both suites — and a CI job runs that same recipe from a cold cache**

## Performance

- **Duration:** ~15 min (earliest instrumented workspace timestamp 16:15:50Z; the two full gate runs after the task commits took 2m42s and 3m18s)
- **Started:** 2026-10-25T16:15:50Z
- **Completed:** 2026-10-25T16:31:00Z
- **Tasks:** 3
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- `tools/provenance/cli.ts` is now the single dispatcher over the eight plans before it. `verify`, `where` and `lfs` are handed the remaining argv verbatim to their module `main`, so their flag grammars (`--check`/`--write`, a positional query) exist in exactly one place. An unknown command exits 2 with the full eleven-command usage on stderr; stdout carries only result lines the gates parse.
- The `justfile` is complete: `bootstrap`, `provenance-fetch`, `provenance-import`, `provenance-ledger`, `provenance-manifest`, `provenance-replay`, `provenance-verify`, `provenance-where`, `provenance-license`, `provenance-lfs`, `provenance-tests`, and `verify`. `verify` rehydrates `upstream-cache/`, then runs verify, replay, and both suites, stopping at the first failure. It calls no compiler and no Node version manager (DEC-08).
- `.github/workflows/provenance.yml` defines one job, `provenance-replay`, on `windows-latest` with `permissions: contents: read`: checkout → `setup-bun@v2` (1.4.2) → install `just` → `bun --version` → cache restore keyed on `hashFiles('vendor/*/provenance/UPSTREAM.json')` → `fetch --all` → `just verify`.
- `tests/provenance/workspace-isolation.test.ts` closes P3 positively and negatively: the root workspaces array is vendor-free, no root `Cargo.toml`/`pyproject.toml` exists, no root script reaches into `vendor/`, each tree's workspace declaration survives (hindsight `[tool.uv.workspace]` first, hermes-agent `[tool.uv]`, oh-my-pi object-form `workspaces`), every vendored `[workspace]` `Cargo.toml` is byte-identical to its upstream blob OID, and no `.git` entry or `.gitmodules` exists.
- `provenance/README.md` records the gate order, the CI status honestly ("workflow committed; remote not configured"), and the `core.hooksPath .githooks` opt-in.

## Verification Evidence

| Plan check | Result |
|---|---|
| `just verify` on a warm cache | exit 0 — `VERIFY OK` ×4, `REPLAY OK` ×4, 198 pass, 79 pass |
| `just verify` with `upstream-cache/` removed | exit 0 — rehydrated all four caches from the ledgers, then the full gate |
| `bun run tools/provenance/cli.ts bogus` | exit 2; stderr lists all eleven commands; stdout empty |
| `just --list` | all twelve documented recipes present; no `vendor-build` |
| `just provenance-where query=docs/rpc.md tree=oh-my-pi` | `PATH docs/rpc.md -> vendor/oh-my-pi/docs/rpc.md (rule=prefix …)` |
| `bun test tests/provenance/workspace-isolation.test.ts` | 9 pass, 0 fail, 22 expect() calls |
| Workflow structural gate | `WORKFLOW OK jobs=1 id=provenance-replay tokens=6` |

## Task Commits

Each task was committed atomically (with hooks; the pre-commit provenance hook ran on Task 3):

1. **Task 1: Consolidate the CLI and complete the `justfile` gate** — `6306de3` (feat)
2. **Task 2: Workspace-isolation proof** — `dbd7fcc` (test)
3. **Task 3: The `provenance-replay` CI job, running the same gate** — `b75735d` (feat)

**Plan metadata:** `docs(01-09): complete the provenance gate plan` (this SUMMARY)

## Files Created/Modified

- `tools/provenance/cli.ts` — eleven-command dispatcher; delegated `verify`/`where`/`lfs`; unknown command → stderr usage + exit 2.
- `justfile` — every recipe the phase documents; `verify` is the gate, with cache rehydration as step 0.
- `.github/workflows/provenance.yml` — one job, one command, cold-cache safe, read-only token.
- `tests/provenance/workspace-isolation.test.ts` — 9 file-only assertions, no install, no network.
- `provenance/README.md` — gate order, CI activation status, commit-hook opt-in.

## Decisions Made

- **Delegate, never re-parse.** `verify`, `where` and `lfs` own grammars that do not fit the shared option parser; handing them the raw argv keeps one implementation per flag. The alternative — extending `parseArgs` with `--check`/`--write`/a positional query — duplicates rules the modules already enforce.
- **Rehydration is part of the gate, not a prerequisite the developer must remember.** `fetch --all` pins to each `UPSTREAM.json.commit`, so it is a no-op warm and a deterministic fetch cold; without it, replay exits 2 on any fresh clone and the documented command is not a gate.
- **CI runs `just verify`.** The only CI-specific steps are the ones a developer's machine already has satisfied (Bun, `just`, a warm cache, the pinned commits). No behavior is implemented twice.
- **`query`/`tree` are recipe parameters, not global variables.** `just` accepts global overrides only before the recipe name, while the documented and tested form is `just provenance-where query=… tree=…`; parameters are the mechanism that honours that form.
- **`bun.exe` is named in the justfile.** This workstation's PATH holds an extensionless `bun` that PowerShell resolves but silently fails to execute — recipes prefixed `bun` exited 0 without running anything. Naming `bun.exe` is portable to the runner, where `bun.exe` is on PATH too.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `bun`-prefixed recipes silently did nothing under PowerShell**
- **Found during:** Task 1 (justfile completion)
- **Issue:** `bun run tools/provenance/cli.ts verify --all` inside a recipe printed nothing and exited 0. `Get-Command bun` resolves to an extensionless binary in `%LOCALAPPDATA%\hermes\node` that PowerShell accepts as an Application but does not execute; the gate was vacuous while reporting success. The plan's text says `bun run …`.
- **Fix:** every recipe names `bun.exe` (the pre-existing convention in this justfile), and the file documents why.
- **Files modified:** `justfile`
- **Verification:** `just provenance-verify` now prints `VERIFY OK` for all four trees; `just verify` ran all five steps and exited 0 warm and cold.
- **Committed in:** `6306de3`

**2. [Rule 1 - Bug] Global `query`/`tree` variables broke the documented invocation form**
- **Found during:** Task 1 (justfile completion)
- **Issue:** With `query := ""` declared globally, `just provenance-where query=docs/rpc.md tree=oh-my-pi` failed with "justfile does not contain recipe `query=docs/rpc.md`" — just accepts global overrides only *before* the recipe name. The plan's acceptance criterion (and the README) require the after-recipe form.
- **Fix:** `query` and `tree` are recipe parameters with empty defaults; the recipes strip the literal `name=` token that just passes positionally, the same convention the file already used for `tree`. `provenance-where` declares `query` first so the documented order maps correctly.
- **Files modified:** `justfile`
- **Verification:** `just provenance-where query=docs/rpc.md tree=oh-my-pi` prints the `PATH … rule=prefix` line; `just provenance-replay tree=gsd-omp` prints `REPLAY OK gsd-omp files=34`.
- **Committed in:** `6306de3`

---

**Total deviations:** 2 auto-fixed (2 bugs, both in the justfile the task was completing)
**Impact on plan:** Both were necessary for the gate to be a gate — one made it vacuous, the other made the documented lookup invocation unusable. No scope creep: no new capability was added.

## Issues Encountered

- **`lfs --all` exits 2 for three of the four trees.** Only `vendor/oh-my-pi/provenance/LFS.json` exists; `gsd-omp`, `hermes-agent` and `hindsight` have none, and `lfs.ts` treats a missing inventory as a hard error (exit 2). The CLI delegates faithfully — module and dispatcher produce identical output and exit code — and `just verify` does not include the LFS step, so the gate is unaffected. This is plan 01-06's artifact gap, outside this plan's scope; recorded in `deferred-items.md` rather than fixed here.
- **The CI job cannot be executed.** The repository has no remote, so the committed workflow is inert. Its shape is asserted by the plan's structural gate; its runtime behavior is not claimed anywhere.

## User Setup Required

None — no external service configuration. Activating the committed CI job requires pushing the repository to a remote (documented in `provenance/README.md`).

## Next Phase Readiness

- The phase gate is one command locally and the same command in CI. `just verify` is green warm and green cold (cache deleted).
- Workspace isolation and the no-gitlink rule are failing tests if violated, not conventions.
- Phase 2 (rebrand, wire contract and migration) can rely on `just verify` as its regression gate and on `provenance-where` for upstream→local lookups.
- Open item for phase verification: three trees carry no `LFS.json`, so `just provenance-lfs` is red for them.

## Self-Check: PASSED

- `tools/provenance/cli.ts` — FOUND
- `justfile` — FOUND
- `.github/workflows/provenance.yml` — FOUND
- `tests/provenance/workspace-isolation.test.ts` — FOUND
- `provenance/README.md` — FOUND
- commit `6306de3` (Task 1) — ancestor of HEAD
- commit `dbd7fcc` (Task 2) — ancestor of HEAD
- commit `b75735d` (Task 3) — ancestor of HEAD
- `just verify` warm — exit 0
- `just verify` cold (`upstream-cache/` removed) — exit 0
- `bun test tests/provenance/workspace-isolation.test.ts` — 9 pass, 0 fail

---
*Phase: 01-import-provenance-ledger*
*Completed: 2026-10-25*
