---
phase: 01-import-provenance-ledger
plan: 08
subsystem: provenance
tags: [provenance, verification, drift-detection, git-hooks, offline, bun]

# Dependency graph
requires:
  - phase: 01-import-provenance-ledger (plans 01-01, 01-03, 01-04)
    provides: canonical manifest reader/writer, the four ledger documents, and the four imported trees
  - phase: 01-import-provenance-ledger (plans 01-01, 01-02)
    provides: replayTree with the four-digest TAMPERED gate and the hermetic tiny-upstream fixture
provides:
  - offline `provenance-verify` (ledger digests, index/worktree comparison, unrecorded-edit detector)
  - four asserted worktree/index drift classes and four asserted committed-ledger drift classes
  - `.githooks/pre-commit` running the same verify path as CI
  - shared scratch-repo harness for fixture import and patch authoring
affects: [01-09 (cli/justfile/CI wiring), Phase 2 (patched vendored edits)]

# Actuals (#2632) — same estimateTokens scale as the plan's estimate (chars/4 over the realized diff).
actuals:
  tokens: 10940
  tasks: 3
  commits: 4
  plan_head_before: 32c2411925cf2ece13a8f2f8686c23340eddd4a1
  plan_head_after: 3fd6532c168e777aa2518a1db6175355b150d0e3

tech-stack:
  added: []
  patterns:
    - "Fixed finding vocabulary plus `isFindingLine` as the one parser for it"
    - "Digest gate before any per-file comparison, in every reader"
    - "Raw worktree bytes first, git's stored-oid verdict as the attribute-transform second opinion"

key-files:
  created:
    - tools/provenance/verify.ts
    - tests/provenance/unrecorded-edit.test.ts
    - tests/provenance/verify-drift.test.ts
    - tests/provenance/replay-drift.test.ts
    - tests/provenance/fixtures/scratch.ts
    - .githooks/pre-commit
  modified: []

key-decisions:
  - "verify hashes raw worktree bytes and, only on a mismatch, asks git for the stored blob oid: a vendored tree's own .gitattributes transforms files at checkout, and calling that drift would refuse every commit in a fresh clone"
  - "findUnrecordedEdits receives the effective vendored state (index overlaid with the worktree hash), not the on-disk manifest, so a staged or unstaged edit is named before anyone regenerates the manifest"
  - "A missing patch file reports MISSING and suppresses the detector, instead of flagging every path that patch touched as unrecorded"
  - "The hook triggers on staged vendor/ or provenance/ paths and execs the checker, so the hook and CI cannot run different code"

patterns-established:
  - "Finding vocabulary: MODIFIED/ADDED/REMOVED/MODE/TAMPERED/MISSING/EXCLUDED-PRESENT/GITLINK/UNRECORDED, one line each, 200-line cap, exit 1 findings / 2 malformed / 0 clean"
  - "Drift proof split by the surface that reads it: worktree+index cases for verify, committed ledger and series cases for replay"
  - "Each negative case builds its own fixture+cache+import in its own temp directory"

requirements-completed: [IMPT-01, IMPT-03]

coverage:
  - id: D1
    description: "Offline `provenance-verify` recomputes all four ledger digests, compares index and worktree to MANIFEST.vendored.tsv, and reports one line per finding"
    requirement: IMPT-01
    verification:
      - kind: integration
        ref: "bun run tools/provenance/verify.ts --all (four VERIFY OK lines, exit 0)"
        status: pass
      - kind: integration
        ref: "tests/provenance/unrecorded-edit.test.ts#a deleted ledger file is MISSING and never a skip"
        status: pass
    human_judgment: false
  - id: D2
    description: "A vendored edit with no entry in patches/series is named UNRECORDED and fails; a recorded patch clears it"
    requirement: IMPT-01
    verification:
      - kind: integration
        ref: "tests/provenance/unrecorded-edit.test.ts#a direct edit is UNRECORDED, and a recorded patch clears it"
        status: pass
    human_judgment: false
  - id: D3
    description: "The four worktree/index drift classes (modified byte, added file, removed file, changed mode) are detected and named"
    requirement: IMPT-03
    verification:
      - kind: integration
        ref: "tests/provenance/verify-drift.test.ts (cases modified, added, removed, mode)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Committed-ledger drift prints exactly one TAMPERED line for the mutated ledger file before any per-file comparison; a reordered series names the failing patch index and file"
    requirement: IMPT-03
    verification:
      - kind: integration
        ref: "tests/provenance/replay-drift.test.ts (cases manifest-byte, manifest-row, renames-digest, order)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A pre-commit hook refuses an unpatched vendored edit with an UNRECORDED line, allows a clean commit, and exits 0 for a commit that touches only .planning/"
    requirement: IMPT-03
    verification:
      - kind: automated
        ref: "git config --local --get core.hooksPath -> .githooks"
        status: pass
      - kind: manual_procedural
        ref: "scratch clone under the OS temp dir: unpatched edit refused (exit 1, one UNRECORDED line), restored edit committed, .planning-only commit committed"
        status: pass
    human_judgment: false

metrics:
  duration: 14min
  completed: 2026-10-25
  status: complete
---

# Phase 1 Plan 08: Offline Ledger Gate and Named Drift Classes Summary

**`provenance-verify` compares the ledger to the index and worktree with all four digests checked first, names an unpatched vendored edit as `UNRECORDED`, and runs as the pre-commit gate; eight negative cases prove each drift class on the surface that can actually produce it.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-10-25T16:55:33Z (after `32c24119`)
- **Completed:** 2026-10-25T17:09Z
- **Tasks:** 3
- **Files modified:** 6 created (5 planned artifacts + 1 shared test harness)

## Accomplishments

- `tools/provenance/verify.ts` verifies all four trees in ~2.5 s: it recomputes `manifests.upstream_sha256`, `manifests.vendored_sha256`, `excludes_sha256` and `renames_sha256` first and stops with `TAMPERED` if any no longer matches, then compares the index (`git ls-files -s`, filtered through `isLedgerPath`) and the working tree against `MANIFEST.vendored.tsv`.
- `findUnrecordedEdits` maps every path that diverges from `MANIFEST.upstream.tsv` to the `diff --git` headers of the patches in `series`; a divergence no patch names is `UNRECORDED`, which is the P4/P-10 detector the plan asked for.
- Eight drift cases with their own fixture per case: four on the worktree/index surface for `verify` (`modified`, `added`, `removed`, `mode` — each asserting the literal token and path, plus both mode strings) and four on the committed-ledger surface for `replay` (`manifest-byte`, `manifest-row` with both a dropped and an appended row, `renames-digest`, `order` — each asserting exactly one `TAMPERED <ledger-path>` or the failing patch index and file).
- The final `verify` finding flow: `MISSING` for an absent ledger file, `TAMPERED` for a digest mismatch, `GITLINK` for a `.git`/`.gitmodules`/`160000` entry, `EXCLUDED-PRESENT` for a path an exclude rule should have removed, then `REMOVED`/`ADDED`/`MODE`/`MODIFIED` per path, then `UNRECORDED`; 200-line cap, exit 1/2/0.
- `.githooks/pre-commit` exits 0 before starting on a commit that does not touch `vendor/` or `provenance/`, refuses a staged unpatched vendored edit with the checker's own `UNRECORDED` line, and never touches the network, the cache, or replay. Installed locally with `git config --local core.hooksPath .githooks` (recorded in the hook header and in this SUMMARY).

## Task Commits

Each task was committed atomically:

1. **Task 1: Offline drift check plus the unrecorded-edit detector** - `6bf8f1de` (feat)
2. **Task 2: Drift classes on each surface** - `5b7b66e0` (feat)
3. **Task 3: Pre-commit gate running the same verify path as CI** - `17871b22` (feat)
4. **Task 1 fix: accept git's checkout transform instead of calling it drift** - `3fd6532c` (fix)

**Plan metadata:** committed separately as `docs(01-08): complete the offline verification plan`.

## Files Created/Modified

- `tools/provenance/verify.ts` - the offline gate: four-digest check, index/worktree comparison, `findUnrecordedEdits`, CLI main guard (`--all` / `--tree <name>`), fixed finding vocabulary.
- `tests/provenance/unrecorded-edit.test.ts` - direct edit → `UNRECORDED`; documented patch flow → clean; deleted ledger file → `MISSING`.
- `tests/provenance/verify-drift.test.ts` - `modified`, `added`, `removed`, `mode` on the worktree/index surface.
- `tests/provenance/replay-drift.test.ts` - `manifest-byte`, `manifest-row`, `renames-digest`, `order` on the committed-ledger surface.
- `tests/provenance/fixtures/scratch.ts` - shared fixture+import and `PatchAuthor` harness for the three suites.
- `.githooks/pre-commit` - POSIX shell gate on staged `vendor/`/`provenance/` paths.

## Decisions Made

- **Attribute-aware worktree comparison.** Raw bytes are still the primary check; only when they differ does verify ask git (`git hash-object`, chunked argv) for the oid it would store. Upstream's own `.gitattributes` (`*.ps1 text eol=crlf`) makes a fresh clone materialize CRLF for an LF blob while `git status` calls the tree clean — reporting that as drift would block every commit in every clone.
- **The detector sees the effective vendored state.** Passing the index-overlaid-with-worktree rows (not the on-disk manifest) is what makes a staged *or* unstaged edit visible before anyone regenerates `MANIFEST.vendored.tsv`.
- **A missing patch file suppresses the detector.** Reporting `MISSING <patch>` and stopping is honest; flagging every path that patch touched as `UNRECORDED` would bury the cause under its effects.
- **Replay untouched.** `TAMPERED` and the patch-index failure already exist in `replay.ts`; this plan adds no replay code, only the proof that the signal fires.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fresh clone reported 61 files as `MODIFIED`**
- **Found during:** Task 3 (probe commit in a scratch clone)
- **Issue:** `verify` compared raw worktree bytes only. A clone without `.git/info/attributes` materializes CRLF for the LF blobs of every `*.ps1`/`*.cmd` file whose own vendored `.gitattributes` says `text eol=crlf`; `git status` calls those files unmodified, so the gate was reporting git's own storage transform as HALO drift and refusing every commit in a fresh clone (`VERIFY OK` on the importing worktree hid it).
- **Fix:** A raw-byte mismatch is now held for git's verdict in one chunked `git hash-object` pass over the suspect set. When the stored oid equals the manifest oid nothing is reported; any real edit still changes the stored oid and stays `MODIFIED`. Suspects confirmed faithful are recorded with the manifest hash so the unrecorded detector does not re-report them.
- **Files modified:** `tools/provenance/verify.ts`
- **Verification:** `bun run tools/provenance/verify.ts --all` is clean in the working tree *and* in a fresh scratch clone; the three drift suites still pass, including `modified`.
- **Committed in:** `3fd6532c`

**2. [Rule 2 - Missing Critical] Shared scratch harness for the three suites**
- **Found during:** Task 1 (fixture setup written three times)
- **Issue:** Each of the three suites needs the same ~60 lines (fixture emit, bare cache, import, stdout capture) plus a patch-authoring flow; copying them three times is where the suites would drift apart on how the baseline is built.
- **Fix:** Added `tests/provenance/fixtures/scratch.ts` exporting `scratchImport`, `captureStdout`, `initRepo`, `makeBareCache` and `PatchAuthor`. Test-only, no production surface.
- **Files modified:** `tests/provenance/fixtures/scratch.ts` (new)
- **Verification:** all three suites use it and pass.
- **Committed in:** `6bf8f1de`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** The first is required for the plan's own acceptance criteria (the hook must pass on a clean clone); the second removes triplication in test infrastructure. No production scope creep.

## Issues Encountered

- `git apply` resolves patch paths against the repository top level even when invoked from a subdirectory (it silently applies nothing there). The unrecorded-edit test therefore applies the authored patch with `--directory=vendor/<tree>`; replay is unaffected because it applies at the reconstructed tree root.
- Restoring a staged vendored edit needs `git restore --source=HEAD --staged --worktree -- <path>`; `git checkout -- <path>` restores from the index, which still holds the bad edit. Noted so the next probe runbook does not repeat it.

## Threat Mitigations

| Threat | Mitigation as shipped |
|--------|-----------------------|
| T-1-03 (tampering, drift detection) | Eight negative cases, each asserting a specific token plus path/patch index on the surface that reads it |
| T-1-18 (repudiation, manifest tampering) | All four digests recomputed before any per-file comparison; a mismatch prints `TAMPERED` and stops (proved by `manifest-byte`/`manifest-row`/`renames-digest`) |
| T-1-19 (unrecorded edit committed) | `findUnrecordedEdits` plus the pre-commit hook, which refuses the commit with the same `UNRECORDED` line CI would print |

## Known Stubs

None.

## User Setup Required

None for this plan's artifacts. The local hook is already installed in this clone (`git config --local core.hooksPath .githooks`); every other clone must run the same command once — plan 01-09 adds it to the runbook and CI.

## Next Phase Readiness

- Plan 01-09 can wire `verify.ts` into `cli.ts`, the `justfile` and `.github/workflows/provenance.yml` through its `main()`/`verifyTree()` exports; the hook already runs that same path.
- The four real trees verify clean offline in ~2.5 s, so the CI job needs no cache restore for the verify step.
- Phase 2 (rebranding, first `RENAMES.json` rules) can rely on the digest gate catching a map edited without refreshing `renames_sha256`.

## Self-Check: PASSED

- FOUND: tools/provenance/verify.ts
- FOUND: tests/provenance/unrecorded-edit.test.ts
- FOUND: tests/provenance/verify-drift.test.ts
- FOUND: tests/provenance/replay-drift.test.ts
- FOUND: tests/provenance/fixtures/scratch.ts
- FOUND: .githooks/pre-commit
- FOUND: 6bf8f1de
- FOUND: 5b7b66e0
- FOUND: 17871b22
- FOUND: 3fd6532c
- `git config --local --get core.hooksPath` prints `.githooks`
- `bun run tools/provenance/verify.ts --all` exits 0 with four `VERIFY OK` lines
- `bun test tests/provenance/unrecorded-edit.test.ts tests/provenance/verify-drift.test.ts tests/provenance/replay-drift.test.ts` exits 0 (10 tests, 50 assertions)

---
*Phase: 01-import-provenance-ledger*
*Completed: 2026-10-25*
