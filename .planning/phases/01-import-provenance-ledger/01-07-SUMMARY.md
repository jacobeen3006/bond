---
phase: 01-import-provenance-ledger
plan: 07
subsystem: provenance
tags: [provenance, impt-05, cve-triage, patch-series, ledger, bun, git]

# Dependency graph
requires:
  - phase: 01-import-provenance-ledger
    provides: plans 01-01..01-05 — PATHS/EXCLUDES/RENAMES ledgers, both manifests, replay, restage, the watchlist and the rebrand deny-list
provides:
  - "tools/provenance/where.ts — resolveUpstreamPath (exceptions → longest prefix → file → identity) and lookup (path, symbol, watch, rename) with a standalone CLI"
  - "Watch-hit ordering (descending matched-path length, then byte-ascending id) as an asserted contract"
  - "tests/provenance/fixtures/renames.synthetic.json — a schema-valid rename map covering all six kinds, never copied into vendor/"
  - "tests/provenance/cve-drill.test.ts — a permanent, offline triage drill proving the runbook and the tooling agree"
  - "provenance/README.md — the six-step runbook, step 0 (cache rehydration) included"
affects: [phase-01-plan-09, phase-02-rebrand]

# Actuals (#2632) — chars/4 over the realized diff, same scale as the estimate.
actuals:
  tokens: 18602
  tasks: 3
  commits: 3

commits: 3
plan_head_before: eeb14a3d0801e781c4dbfd078d3b2cbe236eb18d
plan_head_after: 8b680a5c

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ledger-only resolution: an answer comes from PATHS.json plus MANIFEST.upstream.tsv, and a separate EXISTS line exposes a ledger/tree mismatch"
    - "One glob matcher in paths.ts serves both replay's exclude rules and the lookup's path matching"
    - "A fixture rename map that validates against the real schema via a distinguishable generated_from"
    - "A drill whose every intermediate assertion is a runbook step, so stale prose fails the suite"

key-files:
  created:
    - tools/provenance/where.ts
    - tools/provenance/test/paths-resolve.test.ts
    - tools/provenance/test/renames-reverse.test.ts
    - tests/provenance/fixtures/renames.synthetic.json
    - tests/provenance/cve-drill.test.ts
    - provenance/README.md
  modified:
    - tools/provenance/paths.ts
    - tools/provenance/replay.ts
    - provenance/schema/renames.schema.json

key-decisions:
  - "Resolution order is exact: excludes, exceptions, longest matching prefix, exact file rule, identity — and the deciding rule is printed, never inferred"
  - "An excluded path and a null exception are both `absent`; excludes are checked first because that path was never imported"
  - "Watch hits sort by descending matched upstream-path length, then byte-ascending watch id; the comparator is asserted on an ordered id array"
  - "Exit 0 when anything matched, 3 with `not found` when nothing did, 2 on a malformed or missing ledger"
  - "The drill's fix commit targets README.md (a tracked fixture file) and the follow-up touches README.md plus scripts/build.sh, so a reordered series has a real context dependency"
  - "renames.schema.json accepts `fixture` alongside `brand.json` so a test map can never be mistaken for generated data"

patterns-established:
  - "Contract-plus-drill: the runbook's commands are executed by a permanent test instead of being described"
  - "Absence is reported, never omitted: `renames: empty` and `ABSENT` are printed lines"

requirements-completed: [IMPT-05]

coverage:
  - id: D1
    description: "An upstream path or symbol resolves to a local path from the ledger, with the deciding rule, matching watch ids and an EXISTS probe"
    requirement: IMPT-05
    verification:
      - kind: unit
        ref: "tools/provenance/test/paths-resolve.test.ts#adjacency, empty and ordering edges (16 tests)"
        status: pass
      - kind: integration
        ref: "bun run tools/provenance/where.ts docs/rpc.md --tree oh-my-pi"
        status: pass
    human_judgment: false
  - id: D2
    description: "Reverse symbol lookup works against a schema-valid rename map, with collisions reported rather than resolved silently"
    requirement: IMPT-05
    verification:
      - kind: unit
        ref: "tools/provenance/test/renames-reverse.test.ts#schema conformance, per-rule reversal, collision, empty-map reporting (12 tests)"
        status: pass
      - kind: integration
        ref: "bun run tools/provenance/where.ts PI_NO_TITLE --renames tests/provenance/fixtures/renames.synthetic.json"
        status: pass
    human_judgment: false
  - id: D3
    description: "A synthetic advisory is triaged end to end — commit pair, changed paths, local paths, watch and rename hits, a two-patch series, a restaged manifest and a green replay — and a reordered series fails naming index and path"
    requirement: IMPT-05
    verification:
      - kind: integration
        ref: "tests/provenance/cve-drill.test.ts (16 tests, 62 expect calls)"
        status: pass
    human_judgment: false

# Metrics
duration: 10min
completed: 2026-10-25
status: complete
---

# Phase 01 Plan 07: Provenance Lookup and the CVE Triage Drill Summary

**An upstream advisory's paths and symbols now resolve to local files from the ledger alone, and a permanent offline drill proves the six-step runbook lands a two-patch fix with a green replay.**

## Performance

- **Duration:** ~10 min (measured commit window: 16:44:44 → 16:54:55 local)
- **Started:** 2026-10-25T15:44:44Z
- **Completed:** 2026-10-25T15:54:55Z
- **Tasks:** 3/3
- **Files modified:** 9 (6 created, 3 modified)

## Accomplishments

- **IMPT-05 is executable, not documented only.** `provenance-where` answers "where is this upstream file in HALO?" from `PATHS.json` + `MANIFEST.upstream.tsv`, prints the rule that decided (`prefix`, `file`, `exception`, `identity`), lists every matching watch id in contract order, and probes the filesystem on a separate `EXISTS` line so a ledger/tree mismatch is visible.
- **The three plan edges are assertions.** Exception-over-prefix and prefix-over-file-rule are both covered (the second exists because "files win" is *not* the contract); a null exception and an excluded glob report `ABSENT`; a manifest path with no rule is `identity` with `watch=none`; an unknown query exits 3 with `not found`.
- **Ordering is a comparator test, not a substring test.** Four overlapping watch entries (`a/`, `a/b/` twice, `a/b/c.ts`) assert `['WL-Q-FILE', 'WL-A-DIR', 'WL-M-DIR', 'WL-Z-ROOT']`, which fails on a reversed or length-ignoring comparator.
- **Reverse lookup works before Phase 2 exists.** A schema-valid fixture map covers all six `kind` values and a shared-target collision; `reverseLookup('HALO_TITLE')` returns both candidates in rule-id order, and the real ledgers report `renames: empty` instead of returning nothing.
- **The drill triages a real advisory shape.** `{introduced, fixed, changedPaths}` → `resolveUpstreamPath` → an existing local file → watch and rename hits → `0001` + `0002` with the four headers → `git apply --check` then apply → `restage` → only `vendored_sha256` moves → replay green with the manifest differing at exactly the two patched paths.
- **Both negatives fail loudly.** Appending the patches without regenerating the manifest fails replay with `vendored manifest drift`; a reordered series fails `git apply --check` on the pristine tree and replay with `PATCH FAILED index=1 path=0002-synthetic-cve-followup.patch`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Path resolution — upstream path or symbol to local path** — `6486cf57` (feat)
2. **Task 2: Reverse rename lookup against a synthetic map** — `7bdf1769` (feat)
3. **Task 3: The permanent triage drill and the runbook** — `8b680a5c` (feat)

**Plan metadata:** this SUMMARY commit (docs: complete 01-07 plan)

## Files Created/Modified

- `tools/provenance/where.ts` (created) — `resolveUpstreamPath`, `watchHits`, `lookup`, `reverseLookup`/`forwardLookup`, ledger loaders that never walk `vendor/`, and the `where.ts <query> [--tree] [--renames]` entry point.
- `tools/provenance/test/paths-resolve.test.ts` (created) — 16 tests: exception/prefix/file/identity adjacency, excluded and null-exception absence, the empty edge (identity vs exit 3), the four-entry ordering array, determinism, and the real `oh-my-pi` lookup.
- `tools/provenance/paths.ts` (modified) — exports `globToRegExp`; replay's private copy was deleted so the exclude rules and the lookup cannot disagree about a glob.
- `tools/provenance/replay.ts` (modified) — imports the shared glob, and wraps patch application so a failure prints `PATCH FAILED index=<n> path=<entry> file=<path>` and throws `ProvenanceError` code 1 instead of an opaque `execFileSync` exit.
- `tools/provenance/test/renames-reverse.test.ts` (created) — 12 tests: structural schema conformance, all six kinds, per-rule reversal, collision ordering, unknown-symbol empties, real-ledger emptiness, and no-write structure.
- `tests/provenance/fixtures/renames.synthetic.json` (created) — eight rules, all six kinds, and `HALO_TITLE` reachable from two `from` values.
- `tests/provenance/cve-drill.test.ts` (created) — 16 tests, 62 `expect()` calls; builds the fixture, a second upstream commit, two patches, and two throwaway bases under the OS temp dir.
- `provenance/README.md` (created) — six steps (0 rehydration → 5 refresh and prove), the four patch headers, the exact `just` command forms, the `--find-object` fallback, and the Windows prerequisites.
- `provenance/schema/renames.schema.json` (modified) — `generated_from` is `enum: ["brand.json", "fixture"]`.

## Decisions Made

- **Excludes before mapping.** An excluded path was never imported, so there is no local file to resolve to; reporting `rule=excluded reason=excluded` is more truthful than mapping it and then pretending it is absent.
- **Identity still requires manifest membership.** `resolveUpstreamPath` is pure and will return `identity` for anything, so `lookup` gates on manifest membership (or an exception) before reporting a hit. That is what separates "known but unmapped" (exit 0) from "not found" (exit 3).
- **The deciding rule is printed.** A caller can see `rule=prefix` on `docs/rpc.md` and know a file rule lost, which is exactly the adjacency edge the phase must demonstrate.
- **The drill uses two throwaway bases.** The happy path is applied and restaged; a second import supplies both negatives, so the failure cases cannot accidentally inherit the happy path's state.
- **The follow-up patch carries a second file.** `0002` appends to `README.md` (whose hunk context includes the line `0001` adds) and to `scripts/build.sh` (the second tracked path), which makes both "touches a second tracked file" and "reordering must fail" true at once.
- **The runbook's step 5 names one path.** `just provenance-manifest tree=<tree>` is stated as the only supported refresh; hand-editing the TSV or `UPSTREAM.json` is explicitly forbidden, because a hand-edited oracle proves nothing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Spec inconsistency] The fixture could not validate against the schema it was required to validate against**
- **Found during:** Task 2
- **Issue:** Task 2 requires `generated_from: "fixture"` *and* that the fixture validate against `provenance/schema/renames.schema.json`, whose `generated_from` was `const: "brand.json"`. Both cannot hold.
- **Fix:** Relaxed the schema to `enum: ["brand.json", "fixture"]` with a description that confines `fixture` to test maps; the test asserts every real ledger still says `brand.json`, so a fixture cannot masquerade as generated data.
- **Files modified:** `provenance/schema/renames.schema.json`, `tools/provenance/test/renames-reverse.test.ts`
- **Verification:** `bun test tools/provenance/test/renames-reverse.test.ts` → 12 pass; the real-ledger test asserts `generated_from === 'brand.json'` and `rules === []` for all four trees.
- **Committed in:** `7bdf1769`

**2. [Rule 3 - Blocking] The lookup needed the exclude-glob semantics replay already owned**
- **Found during:** Task 1 (the excluded-path behaviour)
- **Issue:** `replay.ts` had the only path-glob matcher, unexported. A second copy in `where.ts` would let "excluded" mean two things, and the phase's `key_links` forbid a divergent tree walk/branch.
- **Fix:** Moved the matcher to `paths.ts` as `globToRegExp`, imported it in both callers, and deleted replay's private copy. `license.ts` keeps its intentionally different case-insensitive spelling matcher.
- **Files modified:** `tools/provenance/paths.ts`, `tools/provenance/replay.ts`, `tools/provenance/where.ts`
- **Verification:** `bun test tools/provenance tests/provenance` → 209 pass, 0 fail.
- **Committed in:** `6486cf57`

**3. [Rule 1 - Bug] A reordered patch series exited with an unnamed git error**
- **Found during:** Task 3's negative leg
- **Issue:** `replayTree` called `git apply --check` bare; a failure surfaced as an `execFileSync` error with no patch index, so the plan's "replay exits 1 naming the failing patch index and path" was unachievable.
- **Fix:** The series loop now catches the apply failure, prints `PATCH FAILED index=<1-based> path=<series entry> file=<git's named file>`, and throws `ProvenanceError` code 1 with the same fields.
- **Files modified:** `tools/provenance/replay.ts`
- **Verification:** `tests/provenance/cve-drill.test.ts#a reordered series fails on the first entry and names index and path` asserts the message and output.
- **Committed in:** `6486cf57` (code) exercised by `8b680a5c` (test)

**4. [Rule 1 - Factual correction] The fixture has no `docs/guide.md`, so the drill's fix is on `README.md`**
- **Found during:** Task 3 (first drill run)
- **Issue:** The plan's sketch assumed an arbitrary tracked file. The happy fixture's tracked paths are `.gitattributes`, `LICENSE`, `README.md`, `assets/*`, `docs/naïve-résumé.ts`, `package-lock.json`, `scripts/*.sh`, `win/install.bat`; adding a new file would have made patch `0001` a creation and changed the manifest's path list, not just two blobs.
- **Fix:** The advisory commit modifies `README.md`; `0001` carries that fix; `0002` adds the follow-up line to `README.md` (context-dependent on `0001`) plus a line to `scripts/build.sh` (the second tracked file). The manifest diff is exactly `['README.md', 'scripts/build.sh']`.
- **Files modified:** `tests/provenance/cve-drill.test.ts`
- **Verification:** the drill's advisory, manifest-diff and reorder tests all pass.
- **Committed in:** `8b680a5c`

**5. [Commit attribution] `where.ts` shipped whole in Task 1's commit**
- **Found during:** Task 1 commit preparation
- **Issue:** The plan assigns `tools/provenance/where.ts` to Tasks 1 and 2. Splitting one 651-line module across commits would require deleting and re-adding working code.
- **Fix:** Task 1's commit carries the whole module (including `--renames` and the reverse/forward lookups); Task 2's commit carries the fixture, the schema relaxation and the reverse-lookup suite. Every commit compiles and every suite existing at that commit passes.
- **Files modified:** none beyond the above
- **Verification:** `bun test tools/provenance/test/paths-resolve.test.ts` at `6486cf57`; `bun test tools/provenance/test/renames-reverse.test.ts` at `7bdf1769`.
- **Committed in:** `6486cf57` + `7bdf1769`

**6. [Verified, no bytes changed] `provenance/watchlist.json` needed no edit**
- **Found during:** Task 3
- **Issue:** The plan asks to set `last_checked` to the drill date and to add the drill to each entry's `contract_tests`.
- **Outcome:** All five entries already carry `last_checked: "2026-10-25"` (today's drill date) and already list `tests/provenance/cve-drill.test.ts`; plan 01-04 added both. The file is unchanged, and the drill confirms every entry is exercised by the suite.

---

**Total deviations:** 5 auto-fixed (2 correctness/spec, 1 blocking share, 1 factual correction, 1 commit attribution) + 1 verified no-op.
**Impact on plan:** Deviation 1 was unavoidable (two stated requirements were mutually exclusive); deviations 2 and 3 remove duplicate semantics and make the required negative output possible; deviation 4 re-targets the drill onto the files that actually exist. No scope creep: no `cli.ts` wiring (plan 01-09), no `justfile` recipe, no real rename data, no change under `vendor/**`.

## Verification

| Check | Result |
|---|---|
| `bun test tools/provenance/test/paths-resolve.test.ts tools/provenance/test/renames-reverse.test.ts tests/provenance/cve-drill.test.ts` | 44 pass, 0 fail, 311 `expect()` calls |
| `bun run tools/provenance/where.ts docs/rpc.md --tree oh-my-pi` | exit 0; `PATH docs/rpc.md -> vendor/oh-my-pi/docs/rpc.md (rule=prefix watch=WL-OMP-RPC-WIRE)`; `EXISTS … yes` |
| `bun run tools/provenance/where.ts PI_NO_TITLE --renames tests/provenance/fixtures/renames.synthetic.json` | exit 0; `SYMBOL PI_NO_TITLE -> HALO_NO_TITLE (… rule=R-SYN-0004 kind=env direction=forward)` |
| `bun run tools/provenance/where.ts nope/missing.ts --tree oh-my-pi` | exit 3; `not found nope/missing.ts` |
| `bun -e` runbook token check | `RUNBOOK OK tokens=8` (all eight required tokens present) |
| `bun test tools/provenance tests/provenance` | 209 pass, 0 fail, 72 727 `expect()` calls |
| `git status --short -- vendor/` before and after the drill | empty both times |

## Known Stubs

None. No placeholder values, no unwired data sources, no skipped tests, no unrun verify steps. The reverse-rename path is exercised against a fixture by design (Phase 2 populates the real map); the tool prints `renames: empty` for every real tree rather than pretending otherwise.

## Next Phase Readiness

- Plan 01-09 wires `where.ts`'s exported functions into `cli.ts` (`where` subcommand) and adds the `provenance-where query=<…> tree=<tree>` recipe the runbook already documents. The runbook's step-3 form is the contract that recipe must implement.
- Phase 2 must keep `RENAMES.json` `generated_from: "brand.json"`; only `tests/provenance/fixtures/` may claim `fixture`, which the schema now distinguishes.
- Any new watch entry must name the drill in `contract_tests` or it is untested — the runbook's maintenance section states this.

## Self-Check: PASSED

- `tools/provenance/where.ts` — FOUND
- `tools/provenance/test/paths-resolve.test.ts` — FOUND
- `tools/provenance/test/renames-reverse.test.ts` — FOUND
- `tests/provenance/fixtures/renames.synthetic.json` — FOUND
- `tests/provenance/cve-drill.test.ts` — FOUND
- `provenance/README.md` — FOUND
- commit `6486cf57` is an ancestor of HEAD — FOUND
- commit `7bdf1769` is an ancestor of HEAD — FOUND
- commit `8b680a5c` is an ancestor of HEAD — FOUND

---
*Phase: 01-import-provenance-ledger*
*Completed: 2026-10-25*
