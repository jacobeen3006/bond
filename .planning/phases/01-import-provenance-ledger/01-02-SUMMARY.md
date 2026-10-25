---
phase: 01-import-provenance-ledger
plan: 02
subsystem: infra
tags: [bun, typescript, git, git-archive, windows, paths, gitattributes, fixture, provenance, lfs]

requires:
  - phase: 01-01
    provides: "tools/provenance/{cli,fetch,stage,manifest,replay,ledger,paths}.ts and the gsd-omp replay gate"

provides:
  - "tests/provenance/fixtures/make-fixture.ts — deterministic ten-file happy repo plus a four-shape hostile variant, built through hash-object/update-index so Windows never materializes the hostile names"
  - "validateTreePaths(paths, {maxLength, prefix}) — case-collision, reserved-name, trailing-dot-space and too-long findings on the same normalizer as assertSafeArchiveEntries"
  - "import preflight order: ls-tree → representability → gitlink → symlink → SIZE, before vendor/ is written"
  - "checkAttributes / `cli.ts check-attributes` — index OID vs raw OID vs upstream OID plus effective byte-rewriting attributes"
  - "cli.ts import --fixture happy|hostile — the whole pipeline offline, with a local bare cache and no network"
  - "REPLAY OK tiny-upstream files=10 and `FIXTURE OK files=10 exec=2 symlinks=1 lfs=1 hostile=4`"

affects: [01-03, 01-04, 01-05, 01-06, 01-07, 01-08, 01-09, phase-2-rebrand]

actuals:
  tokens: 18925
  tasks: 3
  commits: 3

plan_head_before: 0e2a7bffe5c6ddb3c8f0e5e7a63d3964ab28400d
plan_head_after: 4555616a3e76d32733662fa3df29e291e167f0e9

tech-stack:
  added: []
  patterns:
    - "Fixture commits are built from the index (hash-object + update-index --cacheinfo), never from the worktree, so bytes and modes are exact and hostile names never touch NTFS"
    - "One path normalizer feeds both the throwing archive gate and the finding-returning tree gate"
    - "Every preflight refusal prints a machine-checkable line naming kind and path, then exits 2 before any vendor write"
    - "Effective-attribute detection: eol is ignored while text is unset, matching Git's own semantics"
    - "archive/extraction are filter-neutral and UTF-8-explicit: `-c filter.lfs.*` neutralizes smudge, `--options hdrcharset=UTF-8` preserves non-ASCII names"

key-files:
  created:
    - tests/provenance/fixtures/make-fixture.ts
    - tests/provenance/replay-tiny.test.ts
    - tools/provenance/test/win-paths.test.ts
    - tools/provenance/test/fidelity-attributes.test.ts
  modified:
    - tools/provenance/paths.ts
    - tools/provenance/stage.ts
    - tools/provenance/cli.ts
    - tools/provenance/fetch.ts
    - tools/provenance/replay.ts
    - .gitignore

key-decisions:
  - "The fixture is built through the object database, not the worktree; `--hostile` never creates `docs/CON.txt`, `docs/trailing./file.txt` or a case pair on disk"
  - "The extraction-time gate stays `assertSafeArchiveEntries`; representability is a second entry point over the same normalizer, never a second checker"
  - "Reserved-name matching uses the segment stem before the first dot, so NUL.tar.gz is caught and CONTRACT.md is not"
  - "Length is measured on prefix + relative path (default 240) with the measured number in `detail`; tests pass no prefix so 245 fails and 240 passes"
  - "`eol=lf` alone is not a mismatch because Git ignores eol when text is unset; only an effective text/filter/ident/encoding value fails the detector"
  - "Fixture trees are gitignored build products: import stages them with `-f`, computes the manifest, then unstages them"

patterns-established:
  - "A gate is proven by a failing fixture: text=auto, gitlink, hostile paths and zero-file replay each have a negative assertion"
  - "Import aborts before touching vendor/, and cleans up the index and target if a post-extraction check fails"

requirements-completed: [IMPT-06, IMPT-03]

coverage:
  - id: D1
    description: "The hermetic fixture exists, is deterministic, and self-reports its ten shapes plus four hostile shapes"
    requirement: IMPT-06
    verification:
      - kind: unit
        ref: "bun run tests/provenance/fixtures/make-fixture.ts --check → FIXTURE OK files=10 exec=2 symlinks=1 lfs=1 hostile=4"
        status: pass
    human_judgment: false
  - id: D2
    description: "Case collisions, reserved names, trailing dots/spaces, over-long paths and every escape class are classified with the offending path named"
    requirement: IMPT-06
    verification:
      - kind: unit
        ref: "bun test tools/provenance/test/win-paths.test.ts (13 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A CRLF file staged under text=auto fails the fidelity detector, while the staging attributes yield index == raw == upstream OID"
    requirement: IMPT-06
    verification:
      - kind: unit
        ref: "bun test tools/provenance/test/fidelity-attributes.test.ts (3 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Import then replay on the happy fixture reproduces ten files byte-identically offline, including the empty-series and second-replay determinism edges"
    requirement: IMPT-03
    verification:
      - kind: integration
        ref: "bun test tests/provenance/replay-tiny.test.ts (9 tests); REPLAY OK tiny-upstream files=10"
        status: pass
    human_judgment: false
  - id: D5
    description: "The hostile fixture import exits 2 naming all four findings and leaves vendor/ absent; a gitlink exits 2 with `submodule entry: subdir`"
    requirement: IMPT-06
    verification:
      - kind: integration
        ref: "bun run tools/provenance/cli.ts import --fixture hostile --tree tiny-upstream → exit 2, VENDOR_ABSENT"
        status: pass
    human_judgment: false
  - id: D6
    description: "The real gsd-omp import remains replayable after the gate lands"
    requirement: IMPT-03
    verification:
      - kind: integration
        ref: "just provenance-replay tree=gsd-omp → REPLAY OK gsd-omp files=34"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-10-25
status: complete
---

# Phase 1 Plan 02: Hostile-Path and Attribute-Fidelity Gates Summary

**A deterministic ten-file fixture proves the importer refuses case collisions, reserved device names, trailing dots, over-long paths, gitlinks, escaping symlinks and `text=auto` rewrites before writing, then replays the accepted tree byte-identically offline.**

## Performance

- **Duration:** ~20 min (first artifact to last task commit)
- **Tasks:** 3
- **Files changed:** 10 (1612 insertions, 68 deletions)
- **Tests:** 25 in the three plan suites; 59 across `tools/provenance` + `tests/provenance`

## Accomplishments

- `tests/provenance/fixtures/make-fixture.ts` builds a ten-file repo whose HEAD is stable across runs (`--check` builds twice and compares), with two executables, one `120000` link, a 130-byte LFS pointer, CRLF `.bat` bytes, a JSON lockfile, an MIT `LICENSE`, a Unicode name and `.gitattributes`. The hostile variant carries a case pair, `docs/CON.txt`, `docs/trailing./file.txt` and a 245-character nested path, constructed only in the index.
- `validateTreePaths` reports `absolute`, `traversal`, `unc`, `ads`, `backslash`, `empty-segment`, `reserved-name`, `trailing-dot-space`, `case-collision` and `too-long` findings, each carrying the input path and an actionable detail; `assertSafeArchiveEntries` shares the same normalizer and still throws.
- `importFromCache` runs the fixed preflight before any write: `ls-tree` → representability → gitlink (`submodule entry: <path>`, exit 2) → symlink (link text read from the object database; absolute, UNC, drive-letter or escaping targets abort) → `SIZE <tree> files=<n> bytes=<n>`. Extraction starts only after all five pass, and an attribute failure removes both the target and its index entries.
- `checkAttributes` compares index OID, raw-bytes OID and upstream OID and reports any effective `text`/`eol`/`filter`/`ident`/`working-tree-encoding` value. The negative test stages CRLF under `* text=auto` and observes a different index OID, a `text=auto` attribute and a mismatch named for the path; the neutral staging line yields equality of all three OIDs.
- `cli.ts import --fixture happy|hostile --tree tiny-upstream` drives the same code path with a local bare cache, no network and no `TREE_REPOS` entry; `check-attributes` exposes the detector on an imported tree (`ATTR OK gsd-omp files=34`).
- The accepted fixture replays as `REPLAY OK tiny-upstream files=10`, a second replay leaves both manifests byte-identical, an empty series yields vendored == upstream manifests, and a zero-file tree exits 1 with `empty vendored tree`.
- `vendor/gsd-omp` still replays: `just provenance-replay tree=gsd-omp` → `REPLAY OK gsd-omp files=34`.

## Task Commits

| # | Task | Commit | Key files |
|---|------|--------|-----------|
| 1 | Hermetic `tiny-upstream` fixture | `4990542` | `tests/provenance/fixtures/make-fixture.ts`, `.gitignore` |
| 2 | Windows-representability path gate | `6e5f7a1` | `tools/provenance/paths.ts`, `tools/provenance/test/win-paths.test.ts` |
| 3 | Gate wiring, detector, offline replay | `4555616` | `tools/provenance/{stage,cli,fetch,replay}.ts`, `fidelity-attributes.test.ts`, `replay-tiny.test.ts` |

## Verification Results

| Command | Result |
|---------|--------|
| `bun run tests/provenance/fixtures/make-fixture.ts --check` | exit 0, `FIXTURE OK files=10 exec=2 symlinks=1 lfs=1 hostile=4` |
| `bun test tools/provenance/test/win-paths.test.ts tools/provenance/test/fidelity-attributes.test.ts tests/provenance/replay-tiny.test.ts` | 25 pass, 0 fail, 196 assertions |
| `bun run tools/provenance/cli.ts import --fixture hostile --tree tiny-upstream` | exit 2; names `too-long`, `reserved-name`, `trailing-dot-space`, `case-collision`; `vendor/` absent |
| `bun run tools/provenance/cli.ts import --fixture happy --tree tiny-upstream` then `replay --tree tiny-upstream` | `IMPORT OK tiny-upstream files=10`, `REPLAY OK tiny-upstream files=10` |
| `just provenance-replay tree=gsd-omp` | exit 0, `REPLAY OK gsd-omp files=34` |
| `bun test tools/provenance tests/provenance` | 59 pass, 0 fail, 376 assertions |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `git archive` ran the `lfs` smudge filter and failed (or would fetch)**
- **Found during:** Task 3, first fixture import attempt via a bare cache.
- **Issue:** The fixture's `.gitattributes` names `assets/big.bin filter=lfs`; the system Git LFS config made `git archive` run `git lfs smudge`, which tried to download a missing object and exited 128. A committed tree can therefore rewrite or block import bytes.
- **Fix:** `fetch.ts` `NEUTRAL_CONFIG` now sets `filter.lfs.clean=cat`, `filter.lfs.smudge=cat`, an empty `filter.lfs.process` and `filter.lfs.required=false` for every git invocation, in addition to the existing CRLF neutrality.
- **Files:** `tools/provenance/fetch.ts`
- **Commit:** `4555616`

**2. [Rule 1 - Bug] bsdtar decoded UTF-8 archive paths as the OEM codepage**
- **Found during:** Task 3, attribute detector reported `docs/naïve-résumé.ts` missing from the index.
- **Issue:** `tar -xf` wrote `naïve-résumé.ts` as `na├»ve-r├®sum├®.ts` (UTF-8 bytes reinterpreted as CP437 then re-encoded), so the imported path could never equal the upstream path.
- **Fix:** both import and replay extract with `--options hdrcharset=UTF-8` (`TAR_UTF8_OPTIONS` in `stage.ts`). The extracted name is now the same byte sequence as the tree entry.
- **Files:** `tools/provenance/stage.ts`, `tools/provenance/replay.ts`
- **Commit:** `4555616`

**3. [Rule 1 - Bug] symlink repair wrote through a materialized link**
- **Found during:** Task 3, Windows tar extraction created a real symlink for `assets/link-to-readme`.
- **Issue:** `repairModesAt` called `writeFileSync` on the link path, which followed the link and would overwrite `README.md` with its own link text (T-1-11).
- **Fix:** remove the path (`rmSync(..., {force:true})`) before writing the stored link text; the index is then set with `update-index --cacheinfo 120000`.
- **Files:** `tools/provenance/stage.ts`
- **Commit:** `4555616`

**4. [Rule 1 - Bug] `eol=lf` from the root `.gitattributes` was a false mismatch**
- **Found during:** Task 3, every fixture path reported `eol=lf`.
- **Issue:** the root rule `* text=auto eol=lf` reaches `vendor/**`, while `.git/info/attributes` unsets only `text`/`filter`/`ident`/`working-tree-encoding`. Git ignores `eol` when `text` is unset, but the detector flagged the raw value.
- **Fix:** `readActiveAttributes` now reports `eol` only while `text` is effective, matching Git's semantics. `text=auto` still fails.
- **Files:** `tools/provenance/stage.ts`
- **Commit:** `4555616`

**5. [Rule 3 - Blocking] `git add` refuses a gitignored fixture target**
- **Found during:** Task 3, the plan requires `vendor/tiny-upstream/` in `.gitignore`.
- **Issue:** `git add -A -- vendor/tiny-upstream` exits 1 with "paths are ignored"; the import cannot build its vendored manifest.
- **Fix:** `ImportOptions.buildProduct` stages with `-f`, computes the manifest, then removes the entries from the index. The worktree stays as an inspectable build product; the caller's index is clean.
- **Files:** `tools/provenance/stage.ts`, `tools/provenance/cli.ts`
- **Commit:** `4555616`

**6. [Rule 3 - Blocking] `git update-index` rejected the hostile names on Windows**
- **Found during:** Task 1, first hostile build (`fatal: invalid path 'docs/CON.txt'`).
- **Issue:** `core.protectNTFS=true` (the default) refuses reserved and trailing-dot paths in the index even though Git can store them.
- **Fix:** every fixture git call runs with `-c core.protectNTFS=false`; the names exist in the commit, never on disk.
- **Files:** `tests/provenance/fixtures/make-fixture.ts`
- **Commit:** `4990542`

**7. [Rule 2 - Missing critical functionality] preflight now precedes destructive cleanup**
- **Found during:** Task 3 design; an existing import removed a non-empty `vendor/<tree>` before any check.
- **Issue:** a hostile re-import could delete a previously accepted tree before refusing.
- **Fix:** the target is removed only after all five preflight stages pass; hostile input leaves `vendor/` untouched (asserted).
- **Files:** `tools/provenance/stage.ts`
- **Commit:** `4555616`

## Issues Encountered

- `just` is installed at `%LOCALAPPDATA%\Microsoft\WinGet\Links\just.exe` but is not on this executor shell's PATH. The recipe was run through that absolute path and produced the same exit 0 / `REPLAY OK gsd-omp files=34`.
- `tar -tf` output for non-ASCII names still reflects bsdtar's locale conversion; it is used only for the escape-class listing gate. The authoritative preflight uses `git ls-tree`, and extraction uses the explicit UTF-8 charset option, so path identity is determined by Git, not by tar listing text.
- The hostile fixture deliberately holds four path shapes; the gitlink gate is exercised by a separate synthetic repository in `replay-tiny.test.ts`, which keeps `hostile=4` in the fixture summary meaningful.

## Next Phase Readiness

- Plan 01-06 can build LFS pointer round-trip tests on `assets/big.bin` and the filter-neutral archive path; `counts.lfs_files` is still hardcoded `0` and is that plan's deliverable.
- Plan 01-08's `verify.ts` should reuse `checkAttributes` for the committed-ledger path rather than a second detector.
- Later negative tests can call `emitFixture(dir, 'hostile')` directly; its cache never needs network.

## Self-Check: PASSED

- `tests/provenance/fixtures/make-fixture.ts`, `tools/provenance/test/win-paths.test.ts`, `tools/provenance/test/fidelity-attributes.test.ts` and `tests/provenance/replay-tiny.test.ts` exist.
- Commits `4990542`, `6e5f7a1`, `4555616` are ancestors of `HEAD`; `git rev-list --count 0e2a7bf..HEAD` is 3.
- `bun test tools/provenance tests/provenance` is 59 pass / 0 fail.
- No `.planning/STATE.md` or `.planning/ROADMAP.md` change was made by this plan.
