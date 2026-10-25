---
phase: 01-import-provenance-ledger
plan: 05
subsystem: provenance
tags: [licensing, mit, provenance, rebrand, deny-list, sha256, bun, git]

# Dependency graph
requires:
  - phase: 01-import-provenance-ledger
    provides: plans 01-02..01-04 — the four upstreams imported at pinned SHAs with MANIFEST.upstream.tsv and replayable ledgers
provides:
  - "UPSTREAM.json.license.files pins every licence-ish path in all four trees by blob OID and raw-byte SHA-256 (73 paths total)"
  - "provenance/rebrand-denylist.json — the machine-readable contract Phase 2's rewriter must consume before any rewrite"
  - "cli.ts license (idempotent re-pin) and cli.ts denylist-check (coverage gate: a dead glob and an uncovered licence path both fail)"
  - "license-pin.test.ts and rebrand-denylist.test.ts — the pin recomputes from disk, and a filtered rewrite provably changes no licence byte"
affects: [phase-02-rebrand, phase-12-notice-bundle]

# Actuals (#2632) — same scale as the plan's estimate (chars/4 over the realized diff).
actuals:
  tokens: 31576
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One matcher, two callers: isLicensePath decides both what is pinned and what a rewriter may not touch"
    - "Glob matching with '-'/'_' equivalence so THIRD_PARTY* and THIRD-PARTY* guard the same file"
    - "Declared-defensive globs (expect_match: false) instead of silently unmatched guards"

key-files:
  created:
    - tools/provenance/license.ts
    - tools/provenance/test/license-pin.test.ts
    - provenance/rebrand-denylist.json
    - provenance/schema/denylist.schema.json
    - tests/provenance/rebrand-denylist.test.ts
  modified:
    - tools/provenance/cli.ts
    - tools/provenance/stage.ts
    - vendor/hermes-agent/provenance/UPSTREAM.json
    - vendor/hindsight/provenance/UPSTREAM.json
    - vendor/oh-my-pi/provenance/UPSTREAM.json

key-decisions:
  - "Licence identity is raw-byte SHA-256 read with node:fs.readFileSync; no git show, no text decode, no newline normalization"
  - "The licence-ish predicate is a case-insensitive basename-prefix match at any depth (LICENSE*/NOTICE*/COPYRIGHT*/COPYING*/THIRD[-_]PARTY*) — over-inclusion is the safe direction"
  - "copyright_notice_count counts lines, not occurrences, over raw bytes (gsd-omp 4, hermes-agent 68, hindsight 29, oh-my-pi 6402)"
  - "Both third-party spellings are in the deny-list, and matching normalizes '-' and '_' so either glob guards THIRD-PARTY-NOTICES.txt"
  - "A glob that matches nothing fails denylist-check unless it is declared expect_match: false, so a dead guard is loud rather than silent"

patterns-established:
  - "Contract-plus-sensitivity-test: a guard ships with the unfiltered case proving the fixture can detect tampering"
  - "Ledger documents are rewritten only when their bytes would change, so re-running a pin command is a no-op"

requirements-completed: [IMPT-02]

coverage:
  - id: D1
    description: "Every licence-ish path in all four imported trees is pinned in UPSTREAM.json.license.files by blob OID and raw-byte SHA-256, with a recomputable line-wise copyright_notice_count"
    requirement: IMPT-02
    verification:
      - kind: unit
        ref: "tools/provenance/test/license-pin.test.ts#disk recompute, blob identity, ordering, notice count, adjacency, empty-set and CRLF encoding edges"
        status: pass
      - kind: integration
        ref: "bun run tools/provenance/cli.ts license --tree gsd-omp (prints LICENSE OK gsd-omp files=1 copyright_notices=4)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A machine-readable rebrand deny-list that covers every imported licence path, and a gate that fails on both a dead glob and an uncovered licence path"
    requirement: IMPT-02
    verification:
      - kind: unit
        ref: "tests/provenance/rebrand-denylist.test.ts#the deny-list contract + every imported tree is covered"
        status: pass
      - kind: integration
        ref: "bun run tools/provenance/cli.ts denylist-check (DENYLIST OK globs=6 licence_paths=73)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Proof that a filtered rewrite leaves every licence byte unchanged while an unfiltered one does not, so the guard is sensitive rather than vacuous"
    requirement: IMPT-02
    verification:
      - kind: unit
        ref: "tests/provenance/rebrand-denylist.test.ts#the sensitivity of the fixture"
        status: pass
    human_judgment: false

# Metrics
duration: 7min
completed: 2026-10-25
status: complete
---

# Phase 01 Plan 05: Licence Pinning and the Rebrand Deny-List Summary

**All 73 licence-ish paths across the four imported trees are pinned by raw-byte SHA-256, and a machine-readable deny-list plus a sensitivity-proving test make a rebrand pass structurally unable to touch them.**

## Performance

- **Duration:** 7 min (measured commit window: the plan started immediately after the 01-04 docs commit)
- **Started:** 2026-10-25T15:37:31Z
- **Completed:** 2026-10-25T15:44:00Z
- **Tasks:** 2/2
- **Files modified:** 10 (5 created, 5 modified)

## Accomplishments

- **IMPT-02 is mechanically true.** `UPSTREAM.json.license.files` now lists every licence-ish path — not just the root `LICENSE` — with a blob OID from `MANIFEST.upstream.tsv` and a raw-byte SHA-256 recomputed from disk. A `NOTICE` or `COPYRIGHT` can no longer drift unobserved.
- **One matcher, two callers.** `isLicensePath` in `tools/provenance/license.ts` decides both what gets pinned and what a rewriter may not touch, so the guard and the ledger cannot disagree.
- **The hyphenated notice is guarded.** oh-my-pi ships `THIRD-PARTY-NOTICES.txt` (plus two nested copies); both `THIRD_PARTY*` and `THIRD-PARTY*` are in the deny-list and the matcher treats `-`/`_` as equivalent, so either spelling catches the real file.
- **The gate can fail.** `denylist-check` exits 1 for a glob that matches nothing (a dead guard) and for a licence-shaped path no glob denies (a blind spot); the test exercises both directions by injecting a dead glob and dropping a live one.
- **Sensitivity proven, not asserted.** The unfiltered `s/hermes/halo/gi` pass changes the injected `NOTICE` byte-for-byte while the `shouldRewrite`-filtered pass changes no licence SHA-256 and still rebrands `src/index.ts` and `package.json#name`.

### Licence ledger as pinned

| Tree | Pinned paths | `copyright_notice_count` | Root `LICENSE` holder line(s) |
|---|---|---|---|
| `gsd-omp` | 1 | 4 | `Copyright (c) 2026 Open GSD` / `Copyright (c) 2026 tchivs` |
| `hermes-agent` | 23 | 68 | `Copyright (c) 2025 Nous Research` |
| `hindsight` | 10 | 29 | `Copyright (c) 2025 Vectorize AI, Inc.` |
| `oh-my-pi` | 39 | 6402 | `Copyright (c) 2025 Mario Zechner` / `Copyright (c) 2025-2026 Can Bölük` / `Copyright (c) 2026 Stencil Labs, Inc.` |

The four holders are distinct entities. Phase 2 must not touch any of these files or the holder strings inside them; the deny-list is what makes that mechanical rather than remembered.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin every licence-ish path per subtree, by raw bytes** — `698354cc` (feat)
2. **Task 2: Machine-readable rebrand deny-list plus the test that proves it holds** — `70909444` (feat)

**Plan metadata:** this SUMMARY commit (docs: complete 01-05 plan)

## Files Created/Modified

- `tools/provenance/license.ts` (created) — the licence-ish predicate, manifest-driven pinning with injected raw-byte readers, line-wise `copyright_notice_count`, deny-list loader with shape validation, glob matcher with `-`/`_` equivalence, `shouldRewrite`, `isDeniedPointer`, `inspectDenylistCoverage`, `assertDenylistCovers`.
- `tools/provenance/cli.ts` (modified) — `license --tree <name>|--all` (rewrites only the `license` block, no-op on a second run, exit 2 with `license: no LICENSE file` when nothing matches) and `denylist-check` (walks every `vendor/*/provenance/MANIFEST.upstream.tsv`, prints `DENYLIST OK globs=<n> licence_paths=<n>`, `DECLARED-DEFENSIVE <glob>`, `unmatched glob: <glob>`, `UNCOVERED <path>`).
- `tools/provenance/stage.ts` (modified) — import-time licence derivation now calls the shared `buildLicenseBlock` against the staged worktree instead of deriving a root-only `LICENSE` row from the cache blob.
- `tools/provenance/test/license-pin.test.ts` (created) — 34 tests over the real trees plus the empty, encoding and no-decode structural edges.
- `tests/provenance/rebrand-denylist.test.ts` (created) — schema conformance, the `shouldRewrite` matrix, real-manifest coverage, the dead-glob/blind-spot failure modes, the end-to-end `denylist-check` invocation, and the filtered-vs-unfiltered rewrite sensitivity pair.
- `provenance/rebrand-denylist.json` (created) — `halo/denylist/v1`: six path globs with reasons, the four attribution field names, five JSON pointer prefixes, and `vendor/**/provenance/**` as never-written.
- `provenance/schema/denylist.schema.json` (created) — requires `schema`, `version`, `globs` (each with `glob` + `reason`), `fields`, `field_pointers`, `paths_never_written`; `additionalProperties: false`.
- `vendor/hermes-agent|hindsight|oh-my-pi/provenance/UPSTREAM.json` (modified) — expanded `license.files` and recomputed `copyright_notice_count`. `vendor/gsd-omp` was already correct (one `LICENSE`) and its bytes are unchanged, which is the idempotency evidence.

## Decisions Made

- **Raw bytes from disk, never `git show`.** The pin is computed with `readFileSync` over the vendored file; a structural test strips comments from `license.ts` and asserts the code contains no `git show`, no `cat-file`, no `.toString(` and no `normalize(`. A filter-mediated read would hide exactly the drift this pin exists to catch.
- **Line-wise notice counting.** `copyright_notice_count` counts lines carrying `copyright` (ASCII case-insensitive, byte scan) rather than occurrences, because that is the definition the plan pins and anyone holding the bytes can recompute it. gsd-omp's value is unchanged (4), so no ledger churn there.
- **Defensive globs are declared, not dropped.** `**/COPYRIGHT*` and `**/COPYING*` match no path in today's import. Rather than delete them (which would leave a future `COPYRIGHT` file unguarded) or leave `denylist-check` permanently red, they carry `expect_match: false` and print as `DECLARED-DEFENSIVE`. Every other glob must match, so a dead guard still fails loudly.
- **Line ordering comes from the manifest.** `license.files` is `comparePaths`-sorted over the manifest rows, matching every other document this tool emits, and the candidate set comes from `MANIFEST.upstream.tsv` rather than a directory walk so an ignored file cannot hide.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Spec inconsistency] A required glob set makes the stated coverage rule unsatisfiable**
- **Found during:** Task 2 (`denylist-check`)
- **Issue:** The plan requires all six globs *and* a zero exit only when "every glob matches at least one imported path". The four trees contain no `COPYRIGHT*` or `COPYING*` file at all (verified by scanning all 35 645 manifest rows), so the literal rule makes `denylist-check` fail forever and its verification command unreachable.
- **Fix:** Added an optional per-glob `expect_match` (default `true`). A `true` glob that matches nothing prints `unmatched glob: <glob>` and exits 1; a `false` glob prints `DECLARED-DEFENSIVE <glob>` and does not fail. `**/COPYRIGHT*` and `**/COPYING*` are the only `false` entries and the test asserts that set is exactly those two, so an unqualified glob cannot quietly become dead.
- **Files modified:** `tools/provenance/license.ts`, `provenance/rebrand-denylist.json`, `provenance/schema/denylist.schema.json`, `tests/provenance/rebrand-denylist.test.ts`
- **Verification:** `bun run tools/provenance/cli.ts denylist-check` → exit 0, `DENYLIST OK globs=6 licence_paths=73`, both `DECLARED-DEFENSIVE` lines, no `unmatched glob:`; the dead-glob test asserts an injected `**/DEADLOCK*` is reported.
- **Committed in:** `70909444`

**2. [Rule 2 - Missing critical functionality] The import would have kept writing a root-only licence block**
- **Found during:** Task 1 (pin wiring)
- **Issue:** `stage.ts` derived `license.files` from `treeRows.find(row => row.path === 'LICENSE')` and hashed the cache blob via `git cat-file`. Left in place, a future `import`/`restage` would silently regress every expanded ledger back to a single root `LICENSE` row — two implementations of one predicate, which the plan's `key_links` forbids.
- **Fix:** `importFromCache` now calls `buildLicenseBlock(upstreamRows, treeReader-of-targetRoot)`; the local `countCopyrightNotices` in `stage.ts` was deleted (clean cutover, no re-export).
- **Files modified:** `tools/provenance/stage.ts`
- **Verification:** `bun test tools/provenance tests/provenance` → 153 pass before the new suites landed; `tests/provenance/replay-tiny.test.ts` still asserts `document.license.files[0].path === 'LICENSE'` for the fixture import.
- **Committed in:** `698354cc`

**3. [Rule 1 - Commit hygiene] `cli.ts` carries Task 2's dispatcher in Task 1's commit**
- **Found during:** Task 1 (commit preparation)
- **Issue:** The plan assigns `tools/provenance/license.ts` and `tools/provenance/cli.ts` to *both* tasks, and the deny-list matcher is deliberately one implementation with the pin. Splitting a single 470-line module across two commits would have required deleting and re-adding working code.
- **Fix:** Task 1's commit carries both files whole; Task 2's commit carries the deny-list contract, its schema and the sensitivity test. Every commit compiles and every test suite that exists at that commit passes.
- **Files modified:** none beyond the above
- **Verification:** `bun test tools/provenance/test/license-pin.test.ts tests/provenance/rebrand-denylist.test.ts` → 46 pass at HEAD.
- **Committed in:** `698354cc` + `70909444`

---

**Total deviations:** 3 auto-fixed (2 correctness/spec, 1 commit hygiene)
**Impact on plan:** Deviation 2 is the substantive one — without it the pin would degrade on the next import. Deviations 1 and 3 resolve an unsatisfiable rule and an attribution-of-files question without changing behaviour. No scope creep: no rewriter, no CI job, no changes under `vendor/**` beyond the ledger documents.

## Known Costs and Limits

- **Four source files are pinned and denied by name shape.** The predicate is a basename-prefix match, so `vendor/oh-my-pi/packages/coding-agent/src/cli/license.ts`, `vendor/hermes-agent/apps/desktop/src/components/free-tier/notice-strip.tsx`, `.../notice-owner.test.tsx` and `.../evals/postmortem/review_probes/notice_delivery_probe.py` are treated as licence-ish. They are not licence documents. The cost is that Phase 2's rewriter will skip them (they do contain upstream tokens), and the benefit is that a real `NOTICE`/`LICENSE` variant cannot be missed. If Phase 2 needs to rebrand them it must refine the contract deliberately, with a test.
- **Delivery boundary (from the plan's objective, restated rather than implied).** No rebrand rewriter executed in this plan — Phase 1 delivers the pinned bytes, the deny-list contract, and the sensitivity test proving the contract would catch a violation. The tooling that must *consume* the contract is Phase 2 (DEC-05), and the CI job that would run `denylist-check` needs a configured remote (DEC-09). ROADMAP SC#3's "cannot be modified by the rebrand tooling" is therefore discharged here as an enforced contract plus a failing-if-violated test, not as an executed rewrite.
- **`vendor/gsd-omp/provenance/UPSTREAM.json` is unchanged** — its single `LICENSE` pin was already correct. The plan listed it as modified; the truthful outcome is "verified, no change needed", and the second `license --all` run produces no bytes at all.

## Issues Encountered

- The fixture's injected `src/index.ts` needed its parent directory created before writing; fixed in the test builder.
- The first `shouldRewrite` structural assertion grepped the whole module, including a doc comment that names `git show`; the test now strips comments and asserts over statements only.

## User Setup Required

None — no external service configuration required.

## Verification

| Check | Result |
|---|---|
| `bun test tools/provenance/test/license-pin.test.ts tests/provenance/rebrand-denylist.test.ts` | 46 pass, 0 fail, 464 `expect()` calls |
| `bun run tools/provenance/cli.ts license --tree gsd-omp` | exit 0, `LICENSE OK gsd-omp files=1 copyright_notices=4` |
| `bun run tools/provenance/cli.ts license --all` (twice) | exit 0; second run changes no bytes |
| `bun run tools/provenance/cli.ts denylist-check` | exit 0, `DENYLIST OK globs=6 licence_paths=73`, no `unmatched glob:`, no `UNCOVERED` |
| `bun run tools/provenance/cli.ts check-attributes --all` | `ATTR OK` for gsd-omp/hermes-agent/hindsight/oh-my-pi — no vendored file differs from its manifest |
| `bun test tools/provenance tests/provenance` (full suite, before the new suites) | 153 pass, 0 fail |
| `git status --short -- vendor/` | clean (only the committed ledger documents changed) |

## Known Stubs

None. No placeholder values, no unwired data sources, no skipped tests, no unrun verify steps.

## Next Phase Readiness

- Phase 2's rewriter must import `shouldRewrite(relPath, fieldPointer)` from `tools/provenance/license.ts` (or read `provenance/rebrand-denylist.json` with equivalent semantics) and consult it **before** the first replacement, not as a post-hoc filter.
- Phase 12's notice bundle (IMPT-04) can consume `UPSTREAM.json.license.files` digests directly; it must not recompute them by hand.
- The deny-list's `expect_match` declaration is the escape hatch for defensive spellings; adding a glob that matches nothing requires declaring it, so the contract cannot rot silently.

## Self-Check: PASSED

- `tools/provenance/license.ts` — FOUND
- `tools/provenance/test/license-pin.test.ts` — FOUND
- `provenance/rebrand-denylist.json` — FOUND
- `provenance/schema/denylist.schema.json` — FOUND
- `tests/provenance/rebrand-denylist.test.ts` — FOUND
- commit `698354cc` is an ancestor of HEAD — FOUND
- commit `70909444` is an ancestor of HEAD — FOUND

---
*Phase: 01-import-provenance-ledger*
*Completed: 2026-10-25*
