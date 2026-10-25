---
phase: 01-import-provenance-ledger
plan: 01
subsystem: infra
tags: [bun, typescript, git-archive, provenance, manifest, just, windows, crlf]

requires: []

provides:
  - "vendor/gsd-omp/ imported whole from https://github.com/tchivs/gsd-omp.git at 7df847d2224b90f4b601f97152e6e6e8975fc2d0"
  - "tools/provenance/{cli,fetch,stage,manifest,replay,ledger,paths}.ts — the seven modules every later plan extends"
  - "provenance/schema/upstream.schema.json — the UPSTREAM.json contract (draft 2020-12)"
  - "justfile entry point: bootstrap / provenance-fetch / provenance-replay / provenance-manifest"
  - "byte-for-byte replay gate: `bun run tools/provenance/cli.ts replay --tree gsd-omp`"

affects: [01-02, 01-03, 01-04, 01-05, 01-06, 01-07, 01-08, 01-09, phase-2-rebrand]

actuals:
  tokens: 169499
  tasks: 3
  commits: 3

plan_head_before: d90e90f988619db0f440f966f8e8c8b0bebd5977
plan_head_after: 9b260dbb283646879442b85e3e5bdaa66487e98e

tech-stack:
  added:
    - "just 1.59.0 (winget Casey.Just) — the single documented entry point"
    - "Bun 1.4.2 built-in test runner (no framework install, zero external dependencies)"
  patterns:
    - "CRLF-neutral git choke point: every git invocation carries -c core.autocrlf=false -c core.eol=lf"
    - "One manifest writer/reader (tools/provenance/manifest.ts) shared by import, restage and replay"
    - "One membership predicate (isLedgerPath) shared by every manifest producer"
    - "Pre-extraction archive gate over the `tar -tf` listing, before `tar -x` runs"

key-files:
  created:
    - tools/provenance/cli.ts
    - tools/provenance/fetch.ts
    - tools/provenance/stage.ts
    - tools/provenance/manifest.ts
    - tools/provenance/replay.ts
    - tools/provenance/ledger.ts
    - tools/provenance/paths.ts
    - tools/provenance/test/manifest.test.ts
    - tools/provenance/test/upstream-json.test.ts
    - tools/provenance/test/edge-cases.test.ts
    - provenance/schema/upstream.schema.json
    - justfile
    - .gitignore
    - .gitattributes
    - package.json
    - vendor/gsd-omp/ (34 upstream files + 7 ledger files)
  modified: []

key-decisions:
  - "Manifest digests cover the TSV body (lines 2..n); the header is structure and is validated by readManifest instead"
  - "git archive reads the local blob-less cache and never --remote; the SHA is the only identity that survives"
  - "Replay derives modes from the SHA's tree (git ls-tree) because tar on Windows cannot express +x or symlinks"
  - "just 1.59.0 binds `tree=value` positionally after the recipe name, so the recipe strips a leading `tree=` prefix to make the documented invocation work verbatim"
  - "Recipes call bun.exe because this host's PATH exposes an extension-less Bun PE that PowerShell cannot launch"

patterns-established:
  - "Import is a data operation: archive → gate → extract → stage → ledger, never clone/checkout"
  - "A ledger digest that does not recompute is TAMPERED and exits 1 before any file comparison"
  - "restage is a fixed point: unchanged tree → identical manifest bytes and `MANIFEST OK <tree> unchanged`"

requirements-completed: [IMPT-01, IMPT-03]

coverage:
  - id: D1
    description: "gsd-omp is imported at a recorded SHA with UPSTREAM.json and both manifests, and every digest recomputes"
    requirement: IMPT-01
    verification:
      - kind: unit
        ref: "tools/provenance/test/upstream-json.test.ts"
        status: pass
      - kind: integration
        ref: "bun run tools/provenance/cli.ts import --tree gsd-omp"
        status: pass
    human_judgment: false
  - id: D2
    description: "replay reconstructs the tree from SHA + patches/series + RENAMES.json and compares byte-for-byte"
    requirement: IMPT-03
    verification:
      - kind: integration
        ref: "bun run tools/provenance/cli.ts replay --tree gsd-omp (REPLAY OK gsd-omp files=34)"
        status: pass
      - kind: unit
        ref: "tools/provenance/test/edge-cases.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "manifest canonical form, UPSTREAM.json schema, archive gate and the IMPT-01/IMPT-03 edges are executable assertions"
    requirement: IMPT-01
    verification:
      - kind: unit
        ref: "bun test tools/provenance/test/ (34 pass, 0 fail)"
        status: pass
    human_judgment: false
  - id: D4
    description: "just provenance-replay tree=gsd-omp is the single documented command and reproduces the imported tree"
    requirement: IMPT-03
    verification:
      - kind: other
        ref: "just provenance-replay tree=gsd-omp → REPLAY OK gsd-omp files=34"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-10-25
status: complete
---

# Phase 1 Plan 01: Import & Provenance Ledger Summary

**gsd-omp imported whole at `7df847d2` with a schema-valid, digest-recomputable ledger and a replay that reproduces its 34 files byte-for-byte from the SHA plus an empty patch series**

## Performance

- **Duration:** ~11 min of execution (plan reading preceded the first artifact)
- **Started:** 2026-10-25T14:05:14Z (first plan artifact written)
- **Completed:** 2026-10-25T14:16:00Z
- **Tasks:** 3
- **Files modified:** 56 (14372 insertions)

## Accomplishments

- `vendor/gsd-omp/` holds the upstream tree at `7df847d2224b90f4b601f97152e6e6e8975fc2d0` (34 files, 549 027 bytes), staged with filters disabled: the index OID equals the upstream blob OID equals the raw-byte hash for every path, so no filter rewrote a byte.
- `UPSTREAM.json` validates against `provenance/schema/upstream.schema.json`; `manifests.upstream_sha256`, `manifests.vendored_sha256`, `excludes_sha256` and `renames_sha256` all recompute equal over the documents on disk.
- `replay --tree gsd-omp` rebuilds into a temp directory from the SHA, applies the comment-only series and the empty rename map, and compares both manifests: `REPLAY OK gsd-omp files=34`, exit 0. `replay --all` and `fetch --all --from-ledger` also exit 0.
- The pre-extraction gate refuses `../escape`, `/abs/path`, `C:/abs`, `//server/share`, `run.bat:stream`, backslash and empty-segment entries with a typed finding, and is proven to run before `tar -x`.
- `just provenance-replay tree=gsd-omp` is the one documented command; `just bootstrap` is idempotent and installs only `just` (DEC-11 — `cargo` and Node 24 remain absent).

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end import of gsd-omp** — `5b10ceb` (feat)
2. **Task 2: Ledger and edge self-checking** — `e99b807` (test)
3. **Task 3: One documented command (just)** — `9b260db` (feat)

**Plan metadata:** committed separately as `docs(01-01): complete ...`.

## Files Created/Modified

- `tools/provenance/manifest.ts` — the single hashing/formatting implementation: `hashFile`, `hashBlob`, `formatLine`, `renderManifest`/`writeManifest` (byte-sorted), `readManifest` (rejects CRLF/BOM/missing header/duplicate path/tab), `isLedgerPath`, `manifestBodyDigest`.
- `tools/provenance/paths.ts` — `ProvenanceError` and the pre-extraction `assertSafeArchiveEntries` gate with typed findings.
- `tools/provenance/ledger.ts` — deterministic `PATHS.json` / `RENAMES.json` / `EXCLUDES.json` derivation plus ledger paths and `UPSTREAM.json` read/write.
- `tools/provenance/fetch.ts` — `TREE_REPOS` (exactly four HTTPS entries), the `^https://[^/]+/` pre-network check, bare `--filter=blob:none` cache lifecycle, immutability gate, `fetch --all` rehydration.
- `tools/provenance/stage.ts` — archive → gate → `tar -x` → `git add` under `.git/info/attributes`, mode/symlink repair, `importTree`, `restage`.
- `tools/provenance/replay.ts` — the TAMPERED digest gate, reconstruction, patch series, rename rules, drift report, `REPLAY OK`.
- `tools/provenance/cli.ts` — `fetch` / `import` / `manifest` (`restage` alias) / `replay`, each with `--tree` or `--all`.
- `provenance/schema/upstream.schema.json` — the ledger contract, including the `^https://` `repo` pattern and the two 64-hex digest patterns.
- `justfile`, `.gitignore`, `.gitattributes`, `package.json` — the root scaffold; `vendor/**` is pinned to `-text -filter -ident -working-tree-encoding`.
- `vendor/gsd-omp/provenance/` — `UPSTREAM.json`, both manifests, `PATHS.json`, `RENAMES.json`, `EXCLUDES.json`, `patches/series` (comment-only).
- `tools/provenance/test/{manifest,upstream-json,edge-cases}.test.ts` — 34 tests, 180 assertions, all passing.

## Decisions Made

- **Digest scope.** `manifests.*_sha256` cover the TSV *body* (lines 2..n), because the header is structural and separately validated; `excludes_sha256` / `renames_sha256` cover whole document bytes.
- **Mode source in replay.** `tar` on Windows cannot express the +x bit or a symlink, so replay takes modes from the SHA's tree (`git ls-tree -r`) and repairs the scratch index the same way the import does.
- **One exclusion predicate.** `isLedgerPath()` is the only place `provenance/**` is excluded, which is what makes "empty series ⇒ manifests byte-equal" a direct comparison.
- **No re-import over an existing ledger.** `import` refuses an already-imported tree (exit 2) and points at `manifest`; this prevents a silent ledger rewrite.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `git archive` applied the system `core.autocrlf=true` and rewrote every imported byte**
- **Found during:** Task 1, first replay (34/34 files reported `modified`)
- **Issue:** The cache repo inherits `core.autocrlf=true`, and `git archive` applies it to the tar it writes. The extracted worktree held CRLF while the upstream blob held LF, and the index OID (`4dd95ba5…`) differed from the upstream OID (`71860e08…`).
- **Fix:** Pinned every git invocation with `-c core.autocrlf=false -c core.eol=lf -c core.safecrlf=false` in the single `git()` helper; `.git/info/attributes` remains the second belt.
- **Files modified:** `tools/provenance/fetch.ts`
- **Verification:** Index OID == raw-hash OID == upstream OID for `LICENSE`, `package.json`, `README.md`; `REPLAY OK gsd-omp files=34`.
- **Committed in:** `5b10ceb`

**2. [Rule 1 - Bug] `git ls-tree -l` pads the size column, so `SIZE … bytes=0`**
- **Found during:** Task 1, first import
- **Issue:** The metadata block is `100644 blob <oid>    508` (padded); `split(' ')` produced an empty size field and every size parsed as 0.
- **Fix:** `trim().split(/\s+/)`, plus a `cat-file --batch-check` fallback for `-` sizes.
- **Files modified:** `tools/provenance/stage.ts`
- **Verification:** `SIZE gsd-omp files=34 bytes=549027`; the byte count reproduces from `git ls-tree -r -l`.
- **Committed in:** `5b10ceb`

**3. [Rule 3 - Blocking] `just` does not bind `name=value` after a recipe name**
- **Found during:** Task 3 (`just provenance-replay tree=gsd-omp` failed with "does not contain recipe `tree=gsd-omp`")
- **Issue:** just 1.59.0 resolves command-line overrides only for global variables before the recipe name; after the recipe the token is a positional argument.
- **Fix:** `tree` is a recipe parameter with an empty default and the body strips a leading `tree=` prefix via `replace(...)`, so the plan's literal invocation, the plain positional form, and the no-argument `--all` form all work.
- **Files modified:** `justfile`
- **Verification:** `just provenance-replay tree=gsd-omp`, `just provenance-replay`, and `just provenance-replay gsd-omp` all print `REPLAY OK gsd-omp`.
- **Committed in:** `9b260db`

**4. [Rule 3 - Blocking] PowerShell cannot launch the extension-less `bun` on this host's PATH**
- **Found during:** Task 3 (`pwsh -Command "bun --version"` printed nothing and exited 0)
- **Issue:** `C:\Users\jakub\AppData\Local\hermes\node\bun` is a PE binary without `.exe`; PowerShell matched it but could not execute it.
- **Fix:** Recipes invoke `bun.exe`, which resolves to the installed Bun 1.4.2.
- **Files modified:** `justfile`
- **Verification:** `just provenance-replay tree=gsd-omp` reaches the CLI and exits 0; a bogus tree propagates a non-zero recipe failure.
- **Committed in:** `9b260db`

**5. [Rule 3 - Blocking] `just bootstrap` failed on winget's "already installed, no upgrade" exit**
- **Found during:** Task 3, second bootstrap run
- **Issue:** When the package exists, `winget install` exits non-zero, so the recipe failed on an idempotent re-run.
- **Fix:** The guard checks `Get-Command just`, then `winget list --id Casey.Just --exact`, and only installs when neither finds it.
- **Files modified:** `justfile`
- **Verification:** `just bootstrap` twice in a row both exit 0.
- **Committed in:** `9b260db`

---

**Total deviations:** 5 auto-fixed (2 bugs, 3 blocking). No Rule 4 architectural change; no scope added beyond correctness and the documented command actually working.

## Issues Encountered

- The `.git/info/attributes` staging line is per-clone and never committed; `UPSTREAM.json` therefore records both the path and the exact line a fresh clone must restore (`import.staging_attributes`, `import.staging_attributes_value`), and `restage` refuses to run without it (`staging attributes missing`, exit 2).
- `manifest --tree` stages the ledger files too (41 tracked paths = 34 upstream + 7 ledger). The vendored manifest correctly stays at 34 rows because `isLedgerPath` filters them, which is asserted in `upstream-json.test.ts`.

## User Setup Required

None. `just` is installed (1.59.0) and on the persisted user PATH. `cargo` and Node 24 are intentionally not installed (DEC-08, DEC-11).

## Next Phase Readiness

- Plan 01-02 can extend `paths.ts` with the Windows-representability findings on the same pre-extraction list, and add the tiny fixture — no Phase-1 decision changes.
- Plan 01-03's `ledger` subcommand must reproduce the committed `UPSTREAM.json` (digests included) byte-for-byte; `derivePaths` / `deriveRenames` / `deriveExcludes` are already the single derivation path.
- Plan 01-08's `verify.ts` must use `isLedgerPath()` from `manifest.ts` rather than a second copy of the rule.

## Self-Check: PASSED

- `vendor/gsd-omp/provenance/UPSTREAM.json` exists, parses, and validates against the schema.
- `tools/provenance/test/manifest.test.ts`, `upstream-json.test.ts`, `edge-cases.test.ts` exist — 34 pass / 0 fail.
- Commits `5b10ceb`, `e99b807`, `9b260db` exist on `master`.
- `replay --tree gsd-omp` exits 0 with `REPLAY OK gsd-omp files=34`; `git status --porcelain -- vendor/gsd-omp` is empty afterwards.
- `just provenance-replay tree=gsd-omp` and `just provenance-manifest tree=gsd-omp` exit 0 with the expected lines.

---
*Phase: 01-import-provenance-ledger*
*Completed: 2026-10-25*
