---
phase: 01-import-provenance-ledger
verified: 2026-10-25T16:50:00Z
status: passed
score: 6/6 must-haves verified
covered_files:
  - .githooks/pre-commit
  - .github/workflows/provenance.yml
  - .planning/phases/01-import-provenance-ledger/01-01-PLAN.md
  - .planning/phases/01-import-provenance-ledger/01-01-SUMMARY.md
  - .planning/phases/01-import-provenance-ledger/01-02-PLAN.md
  - .planning/phases/01-import-provenance-ledger/01-02-SUMMARY.md
  - .planning/phases/01-import-provenance-ledger/01-03-PLAN.md
  - .planning/phases/01-import-provenance-ledger/01-03-SUMMARY.md
  - .planning/phases/01-import-provenance-ledger/01-04-PLAN.md
  - .planning/phases/01-import-provenance-ledger/01-04-SUMMARY.md
  - .planning/phases/01-import-provenance-ledger/01-05-PLAN.md
  - .planning/phases/01-import-provenance-ledger/01-05-SUMMARY.md
  - .planning/phases/01-import-provenance-ledger/01-06-PLAN.md
  - .planning/phases/01-import-provenance-ledger/01-06-SUMMARY.md
  - .planning/phases/01-import-provenance-ledger/01-07-PLAN.md
  - .planning/phases/01-import-provenance-ledger/01-07-SUMMARY.md
  - .planning/phases/01-import-provenance-ledger/01-08-PLAN.md
  - .planning/phases/01-import-provenance-ledger/01-08-SUMMARY.md
  - .planning/phases/01-import-provenance-ledger/01-09-PLAN.md
  - .planning/phases/01-import-provenance-ledger/01-09-SUMMARY.md
  - justfile
  - provenance/README.md
  - provenance/rebrand-denylist.json
  - provenance/schema/denylist.schema.json
  - provenance/schema/excludes.schema.json
  - provenance/schema/lfs.schema.json
  - provenance/schema/paths.schema.json
  - provenance/schema/renames.schema.json
  - provenance/schema/upstream.schema.json
  - provenance/schema/watchlist.schema.json
  - provenance/watchlist.json
  - tests/provenance/cve-drill.test.ts
  - tests/provenance/fixtures/make-fixture.ts
  - tests/provenance/fixtures/renames.synthetic.json
  - tests/provenance/fixtures/scratch.ts
  - tests/provenance/lockfiles.test.ts
  - tests/provenance/rebrand-denylist.test.ts
  - tests/provenance/replay-drift.test.ts
  - tests/provenance/replay-tiny.test.ts
  - tests/provenance/unrecorded-edit.test.ts
  - tests/provenance/verify-drift.test.ts
  - tests/provenance/workspace-isolation.test.ts
  - tools/provenance/cli.ts
  - tools/provenance/fetch.ts
  - tools/provenance/ledger.ts
  - tools/provenance/lfs.ts
  - tools/provenance/license.ts
  - tools/provenance/manifest.ts
  - tools/provenance/paths.ts
  - tools/provenance/replay.ts
  - tools/provenance/stage.ts
  - tools/provenance/test/edge-cases.test.ts
  - tools/provenance/test/fidelity-attributes.test.ts
  - tools/provenance/test/lfs.test.ts
  - tools/provenance/test/license-pin.test.ts
  - tools/provenance/test/manifest.test.ts
  - tools/provenance/test/paths-resolve.test.ts
  - tools/provenance/test/renames-reverse.test.ts
  - tools/provenance/test/upstream-json.test.ts
  - tools/provenance/test/win-paths.test.ts
  - tools/provenance/verify.ts
  - tools/provenance/where.ts
  - vendor/gsd-omp/provenance/EXCLUDES.json
  - vendor/gsd-omp/provenance/MANIFEST.upstream.tsv
  - vendor/gsd-omp/provenance/MANIFEST.vendored.tsv
  - vendor/gsd-omp/provenance/PATHS.json
  - vendor/gsd-omp/provenance/RENAMES.json
  - vendor/gsd-omp/provenance/UPSTREAM.json
  - vendor/gsd-omp/provenance/patches/series
  - vendor/hermes-agent/provenance/EXCLUDES.json
  - vendor/hermes-agent/provenance/MANIFEST.upstream.tsv
  - vendor/hermes-agent/provenance/MANIFEST.vendored.tsv
  - vendor/hermes-agent/provenance/PATHS.json
  - vendor/hermes-agent/provenance/RENAMES.json
  - vendor/hermes-agent/provenance/UPSTREAM.json
  - vendor/hermes-agent/provenance/patches/series
  - vendor/hindsight/provenance/EXCLUDES.json
  - vendor/hindsight/provenance/MANIFEST.upstream.tsv
  - vendor/hindsight/provenance/MANIFEST.vendored.tsv
  - vendor/hindsight/provenance/PATHS.json
  - vendor/hindsight/provenance/RENAMES.json
  - vendor/hindsight/provenance/UPSTREAM.json
  - vendor/hindsight/provenance/patches/series
  - vendor/oh-my-pi/provenance/EXCLUDES.json
  - vendor/oh-my-pi/provenance/LFS.json
  - vendor/oh-my-pi/provenance/MANIFEST.upstream.tsv
  - vendor/oh-my-pi/provenance/MANIFEST.vendored.tsv
  - vendor/oh-my-pi/provenance/PATHS.json
  - vendor/oh-my-pi/provenance/RENAMES.json
  - vendor/oh-my-pi/provenance/UPSTREAM.json
  - vendor/oh-my-pi/provenance/patches/series
covered_digest: "v3:sha256:d3fa9593f7500d1f6e385616aa07d75910615b164c76bdb4fde3960d3ba911e5"
behavior_unverified: 0
overrides_applied: 0
prohibitions:
  - statement: "Upstream blob bytes are rewritten during import or staging."
    plans: [01-01, 01-02, 01-06, 01-08]
    tier: judgment
    llm_judge_verdict: "appears to hold (non-authoritative)"
    evidence: "manifest/edge-cases/fidelity-attributes/lockfiles/lfs tests pass; replay OK byte-for-byte on all four trees; 0 gitlink entries"
    flag: "unverified-prohibition — human review recommended"
  - statement: "A vendored tree acquires a .git directory, a gitlink (mode 160000), a submodule, or a remote."
    plans: [01-03, 01-09]
    tier: judgment
    llm_judge_verdict: "appears to hold (non-authoritative)"
    evidence: "workspace-isolation.test.ts (9 pass); direct check: 0 gitlinks, 0 nested .git, 0 .gitmodules"
    flag: "unverified-prohibition — human review recommended"
  - statement: "vendor/** is absorbed into a root Bun, Cargo, or uv workspace."
    plans: [01-04]
    tier: judgment
    llm_judge_verdict: "appears to hold (non-authoritative)"
    evidence: "workspace-isolation.test.ts (9 pass); direct check: no root Cargo.toml/pyproject.toml; root workspaces are apps/*, packages/* (vendor-free)"
    flag: "unverified-prohibition — human review recommended"
  - statement: "A licence-ish path is modified by any HALO tool, including one acting in the name of rebranding."
    plans: [01-05]
    tier: judgment
    llm_judge_verdict: "appears to hold (non-authoritative)"
    evidence: "rebrand-denylist.test.ts sensitivity test passes; denylist-check DENYLIST OK globs=6 licence_paths=73"
    flag: "unverified-prohibition — human review recommended"
  - statement: "An upstream fix lands in vendor/** without a patch file in series and a regenerated MANIFEST.vendored.tsv."
    plans: [01-07]
    tier: judgment
    llm_judge_verdict: "appears to hold (non-authoritative)"
    evidence: "cve-drill.test.ts + unrecorded-edit.test.ts pass (CASE unrecorded-edit); unrecorded-edit detector names the path"
    flag: "unverified-prohibition — human review recommended"
human_verification:
  - test: "Push the repository to a remote and confirm the provenance-replay CI job runs green"
    expected: "The job installs Bun (1.4.2) + just, restores upstream-cache under the UPSTREAM.json-derived key, runs fetch --all, then just verify exits 0"
    why_human: "The repository has no remote, so the committed workflow has never executed; its shape is asserted (WORKFLOW OK jobs=1) but its execution is unverified by definition"
  - test: "Sign off the five judgment-tier prohibitions (see prohibitions section)"
    expected: "Each must-NOT holds: no byte-rewrite, no .git/gitlink/submodule, no root-workspace absorption, no licence modification, no unpatched vendored edit"
    why_human: "The prohibition verification fields are prose (judgment-tier), not wired tests; the backing tests pass but the must-NOTs require human sign-off"
---

# Phase 1: Import & Provenance Ledger — Verification Report

**Phase Goal:** The four upstream codebases live in one Windows monorepo with an import ledger complete enough that any upstream fix or license obligation can be located and replayed without archaeology.
**Verified:** 2026-10-25T16:50:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

> **Mode note:** ROADMAP marks Phase 1 `Mode: mvp`, but the `**Goal:**` line is outcome prose, not a User Story (`/gsd-mvp-phase 1` was not run — documented in 01-01-PLAN). The User Flow Coverage table is therefore not applicable; verification proceeds goal-backward against the five ROADMAP Success Criteria, which are the contract.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1 (IMPT-01): each subtree carries UPSTREAM.json, PATHS.json, RENAMES.json, patches/series + a watchlist entry; every local edit exists as a patch | ✓ VERIFIED | All 4 trees have the full ledger set (ls); watchlist has 5 entries (one per tree, oh-my-pi ×2); `verify --all` → VERIFY OK ×4; `ledger --tree gsd-omp` → LEDGER OK unchanged; unrecorded-edit detector tested (CASE unrecorded-edit). patches/series is comment-only (no local edits yet — vacuously true at import) |
| 2 | SC2 (IMPT-03): replay reconstructs each tree from SHA + patches + renames; build fails on any drift | ✓ VERIFIED | `replay --all` → REPLAY OK ×4 (byte-for-byte). Drift invariants exercised by passing behavioral tests: replay-drift (CASE manifest-byte, manifest-row, renames-digest, order), verify-drift (CASE modified, added, removed, mode), unrecorded-edit (CASE unrecorded-edit, missing-ledger) — all in the 79-test run |
| 3 | SC3 (IMPT-02): LICENSE + copyright notices byte-identical to upstream and rebrand-immutable | ✓ VERIFIED | `license --tree gsd-omp` → LICENSE OK files=1 copyright_notices=4; `denylist-check` → DENYLIST OK globs=6 licence_paths=73; all 4 trees pin licence files (1/23/10/39). rebrand-denylist.test.ts sensitivity test passes (unfiltered pass changes a NOTICE byte, filtered pass changes no licence SHA-256). The rebrand *rewriter* itself is Phase 2 (documented boundary); Phase 1 delivers the contract + sensitivity proof |
| 4 | SC4 (IMPT-05): a synthetic upstream fix triages through watchlist + path map + rename map and lands as a patch without hand-searching | ✓ VERIFIED | `where docs/rpc.md --tree oh-my-pi` → PATH resolved (rule=prefix, watch=WL-OMP-RPC-WIRE, EXISTS yes); cve-drill.test.ts (16 tests, 62 expect calls) passes end-to-end |
| 5 | SC5 (IMPT-06): fidelity checks prove line endings, LFS binaries, lockfile bytes match upstream blob-for-blob | ✓ VERIFIED | lockfiles.test.ts passes (LOCKFILES lines for all 4 trees, 72 lockfiles); `lfs --tree oh-my-pi --check` → LFS OK tracked=0 declared=1 pointers=0 (empty inventory proven honest via declared-path reconciliation); fidelity-attributes.test.ts passes; `assertSafeArchiveEntries` gate runs before `tar -x` (stage.ts:729→732) |
| 6 | Phase goal: 4 codebases in one Windows monorepo with a complete, locatable, replayable import ledger | ✓ VERIFIED | `just verify` end-to-end EXIT=0: fetch --all (rehydrate) → verify --all (OK ×4) → replay --all (OK ×4) → 198 + 79 tests pass. All 4 trees imported at pinned SHAs (gsd-omp 7df847d2, hermes-agent 930e5ed, hindsight 4822d66, oh-my-pi 0b5c27ab) |

**Score:** 6/6 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tools/provenance/{cli,fetch,stage,manifest,replay,ledger,paths,verify,where,license,lfs}.ts` | 11-module tooling | ✓ VERIFIED | All present; `cli.ts` dispatches 11 subcommands (usage lists all 11; `bogus` → exit 2) |
| `tools/provenance/test/*.test.ts` (9) | module suites | ✓ VERIFIED | 198 pass, 0 fail in `bun test tools/provenance` |
| `provenance/schema/*.schema.json` (7) | ledger contracts | ✓ VERIFIED | All present; upstream/watchlist/denylist/renames/lfs schemas validated by passing tests |
| `provenance/watchlist.json` | 5 entries, 9 fields each | ✓ VERIFIED | 5 entries (one per tree); each has id/subtree/upstream_paths/local_paths/symbols/why/contract_tests/advisory_sources/last_checked |
| `provenance/rebrand-denylist.json` | machine-readable rebrand contract | ✓ VERIFIED | 6 globs (2 declared-defensive), fields + field_pointers + paths_never_written; `denylist-check` OK |
| `provenance/README.md` | six-step runbook | ✓ VERIFIED | Present; step 0 (cache rehydration) included; CI status stated honestly ("workflow committed; remote not configured") |
| `justfile` | single gate + 12 recipes | ✓ VERIFIED | `verify` = fetch --all → verify --all → replay --all → both suites; step 0 rehydrates the gitignored cache |
| `.githooks/pre-commit` | offline commit gate | ✓ VERIFIED | Triggers on staged vendor/ or provenance/; `exec bun run tools/provenance/verify.ts --all` (same path as CI) |
| `.github/workflows/provenance.yml` | CI job | ✓ VERIFIED (structure) / ⚠️ execution unverified | One job `provenance-replay`; last step is `just verify` (not a re-implementation); cache keyed on `hashFiles('vendor/*/provenance/UPSTREAM.json')`. Never executed (no remote) |
| `tests/provenance/*.test.ts` (10) + fixtures | repo suites | ✓ VERIFIED | 79 pass, 0 fail in `bun test tests/provenance` |
| `vendor/{gsd-omp,hermes-agent,hindsight,oh-my-pi}/provenance/` | 8 ledger docs per tree (oh-my-pi + LFS.json) | ✓ VERIFIED | All present; UPSTREAM.json commit/repo/license/lockfiles verified per tree |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `manifest.ts` | `stage.ts` / `verify.ts` | `isLedgerPath` import | ✓ WIRED | Single predicate defined once (manifest.ts:234); imported by stage.ts, verify.ts, manifest.test.ts — no second copy |
| `stage.ts` gate | extraction | `assertSafeArchiveEntries` before `tar -x` | ✓ WIRED | `tar -tf` listing → `assertSafeArchiveEntries` (line 729) runs before `tar -xf` (line 732); `checkAttributes` rolls back on mismatch (lines 752–771) |
| CI workflow | gate | `just verify` as final step | ✓ WIRED | `.github/workflows/provenance.yml` last step is `just verify` — the developer's exact recipe, not a step copy |
| pre-commit hook | gate | `verify.ts --all` | ✓ WIRED | Hook `exec bun run tools/provenance/verify.ts --all` — the same offline check CI runs (no network, no replay) |
| `just verify` | cache rehydration | `fetch --all` as step 0 | ✓ WIRED | Recipe line 75 is `bun.exe run tools/provenance/cli.ts fetch --all` before verify/replay |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `UPSTREAM.json` (×4) | `commit`, `license.files[].sha256`, `lockfiles[].sha256` | `git archive` of pinned SHA + raw-byte SHA-256 from disk | Yes — recomputed by upstream-json.test.ts + license-pin.test.ts (both pass) | ✓ FLOWING |
| `MANIFEST.upstream.tsv` / `MANIFEST.vendored.tsv` | per-path mode/oid/sha256 | `git ls-tree -r` + `hashBlobs` (fail-closed) | Yes — `verify --all` recomputes all four digests (TAMPERED gate) | ✓ FLOWING |
| `LFS.json` (oh-my-pi) | `tracked[]`, `upstream_gitattributes_lfs_lines` | tree's own pointer blobs + `.gitattributes` declarations | Yes — `--write` reproduces committed bytes; `--check` walks declared paths | ✓ FLOWING |
| `watchlist.json` | per-entry paths/symbols | `MANIFEST.upstream.tsv` (derived) | Yes — every local path exists, every upstream path in manifest (upstream-json.test.ts watchlist block) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full gate | `just verify` | EXIT=0; VERIFY OK ×4, REPLAY OK ×4, 198 + 79 tests pass | ✓ PASS |
| Path lookup (SC4) | `cli.ts where docs/rpc.md --tree oh-my-pi` | `PATH ... (rule=prefix watch=WL-OMP-RPC-WIRE)`; EXISTS yes | ✓ PASS |
| Licence re-pin (SC3) | `cli.ts license --tree gsd-omp` | `LICENSE OK gsd-omp files=1 copyright_notices=4` | ✓ PASS |
| Deny-list gate (SC3) | `cli.ts denylist-check` | `DENYLIST OK globs=6 licence_paths=73` | ✓ PASS |
| LFS check (SC5) | `cli.ts lfs --tree oh-my-pi --check` | `LFS OK oh-my-pi tracked=0 declared=1 pointers=0` | ✓ PASS |
| Ledger idempotency (SC1) | `cli.ts ledger --tree gsd-omp` | `LEDGER OK gsd-omp unchanged` | ✓ PASS |
| Unknown tree (negative) | `cli.ts fetch --tree not-a-tree` | `unknown tree: not-a-tree`, exit 2 | ✓ PASS |
| Unknown command (negative) | `cli.ts bogus` | exit 2; usage on stderr lists all 11 commands; stdout empty | ✓ PASS |
| No gitlink (isolation) | `git ls-files -s \| grep -c ^160000` | 0 | ✓ PASS |
| No nested .git (isolation) | `find vendor -name .git` | 0 | ✓ PASS |
| No root workspace (isolation) | `ls Cargo.toml pyproject.toml` | both absent | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| IMPT-01 | 01-01, 01-03, 01-04, 01-08, 01-09 | Complete import ledger per subtree; every local edit is a patch | ✓ SATISFIED | Truth 1 (SC1); `verify --all` OK ×4; unrecorded-edit detector tested |
| IMPT-02 | 01-05, 01-09 | Licence pinning + rebrand deny-list contract | ✓ SATISFIED | Truth 3 (SC3); 73 licence paths pinned; denylist-check OK; sensitivity test passes |
| IMPT-03 | 01-01, 01-02, 01-08, 01-09 | Replayable provenance; build fails on drift | ✓ SATISFIED | Truth 2 (SC2); REPLAY OK ×4; drift classes tested |
| IMPT-05 | 01-03, 01-04, 01-07, 01-09 | Watchlist + path/rename lookup; CVE triage | ✓ SATISFIED | Truth 4 (SC4); 5 watch entries; cve-drill passes |
| IMPT-06 | 01-02, 01-06, 01-09 | Import-fidelity: line endings, LFS, lockfiles | ✓ SATISFIED | Truth 5 (SC5); lockfiles/lfs/fidelity-attributes tests pass |

No orphaned requirements: all five Phase-1 IDs in REQUIREMENTS.md are claimed by plans. (IMPT-04 → Phase 12, out of scope.)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `tests/provenance/fixtures/tiny-upstream/.git/hooks/sendemail-validate.sample` | 22–52 | `TODO` / `XXXXXXX` | ℹ️ Info | Git's default sample hook inside the hermetic fixture's `.git` dir — not phase-authored code; not a debt marker |

No `TBD`/`FIXME`/`XXX` debt markers in phase-authored code. The `return null` / `return []` hits in `tools/provenance/*.ts` are all legitimate guard clauses (missing-file, empty-input, malformed-pointer), not stubs — none flow to user-visible output as fake data.

### Code Review Findings (from REVIEW.md / 01-REVIEW-DISPOSITION.md)

| ID | Severity | Finding | Disposition |
|----|----------|---------|-------------|
| WR-01 | Warning | `deriveLfsLedger` reads only root `.gitattributes`; `emitLfsInventory` reads all — latent divergence for a tree with subdirectory LFS declarations | open (latent; no current tree declares LFS outside the root `.gitattributes`) |
| IN-01 | Info | `readBlobs` fail-open on missing object (vs. `hashBlobs` fail-closed) | open |
| IN-02 | Info | `GLOB_CACHE` unbounded (bounded in practice) | open |
| IN-03 | Info | `matchesAttributePattern` `.gitattributes` leading-`/` semantics | open |
| IN-04 | Info | `just verify` omits LFS/denylist/license steps (gate sufficient via manifest digest) | open |

All security design invariants hold (no smudge-filter byte-rewrite path, CRLF+filter-neutral git config, pre-extraction archive gate, symlink gate, four-digest TAMPERED gate, HTTPS-only remotes, argv-array exec, fail-closed hashBlobs). No Critical findings.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | `LFS.json` exists only for oh-my-pi; `lfs --all` exits 2 for the other three trees (their `.gitattributes` declare no LFS filter). `just verify` does not include the LFS step, so the gate is unaffected. | Later phase (design decision) | deferred-items.md: "Decide whether the remaining trees need an inventory, or whether `--all` should skip trees whose upstream `.gitattributes` declares no LFS filter." Non-blocking — the gate and the oh-my-pi LFS check both work |
| 2 | `.github/workflows/provenance.yml` has never executed | N/A (inherent) | deferred-items.md: "Not a defect: the repository has no remote." Routed to Human Verification below |

### Human Verification Required

> **unverified-prohibition — human review recommended.** All nine plans' `must_haves.prohibitions` are judgment-tier (the `verification` field is a prose string, not `verification: test`). The five unique must-NOTs below are flagged; the non-authoritative LLM-judge verdict is that each **appears to hold** based on the passing backing tests and direct checks, but they require human sign-off.

1. **CI job execution**
   - **Test:** Push the repository to a remote and confirm the `provenance-replay` job runs green.
   - **Expected:** The job installs Bun (1.4.2) + just, restores `upstream-cache` under the `UPSTREAM.json`-derived key, runs `fetch --all`, then `just verify` exits 0.
   - **Why human:** The repository has no remote, so the committed workflow has never executed; its shape is asserted (`WORKFLOW OK jobs=1`) but its execution is unverified by definition.

2. **Judgment-tier prohibitions (5 unique, see `prohibitions` frontmatter)**
   - **Test:** Sign off each must-NOT: (a) no upstream byte-rewrite during import/staging, (b) no `.git`/gitlink/submodule/remote in a vendored tree, (c) no root-workspace absorption of `vendor/**`, (d) no licence-path modification by any HALO tool, (e) no unpatched vendored edit.
   - **Expected:** Each holds — the backing tests (manifest/edge-cases/fidelity-attributes/lockfiles/lfs/workspace-isolation/rebrand-denylist/cve-drill/unrecorded-edit) all pass and the direct checks (0 gitlinks, 0 nested .git, no root workspace files, 73 pinned licence paths) confirm it.
   - **Why human:** The prohibition `verification` fields are prose (judgment-tier), not wired tests; the must-NOTs require human sign-off even though the evidence is strong.

### Gaps Summary

No blocking gaps. All five ROADMAP Success Criteria and the phase goal are verified against the live codebase (not the SUMMARY claims): `just verify` runs end-to-end green (EXIT=0), all four trees replay byte-for-byte, the 198 + 79 test suites pass, and every targeted CLI spot-check (positive and negative) behaves as documented. The status is `human_needed` — not `passed` — solely because (1) the CI job has never executed (no remote) and (2) the five judgment-tier prohibitions require human sign-off. Both are flagged, not silent.

---

_Verified: 2026-10-25T16:50:00Z_
_Verifier: Claude (gsd-verifier)_
