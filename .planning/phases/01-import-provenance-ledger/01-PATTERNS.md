# Phase 1: Import & Provenance Ledger — Pattern Map

**Mapped:** 2026-10-25
**Files analyzed:** 24 new/modified artifacts across 9 plans (from `01-RESEARCH.md` §Recommended Project Structure, §Architecture Patterns, §Code Examples; plan frontmatter `files_modified` arrays in `01-01` through `01-09`)
**Analogs found:** 18 / 24 — Phase 1 establishes first-in-repo conventions; 6 rows are **no-analog** because no prior HALO code exists yet. These rows become the baseline analogs for Phases 2+.

> **Hard ordering constraint:** Phase 1 must complete before any rebrand, contract, or loop plan can land. Every subsequent phase references these artifacts as its conventions surface (`02-PATTERNS.md:5`: "Phase 1 describes the first concrete artifacts this repo will ever contain, and its plans are the conventions Phase 2 must extend").

> **Tracked-source note:** every analog cited below is a git-TRACKED file (`git ls-files` verified). Where a plan creates an artifact, the citation points to the plan line carrying the convention.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `tools/provenance/ledger.ts` | utility (deterministic derivation) | transform, file-I/O | no-analog — establish new pattern (one-producer discipline) | none → baseline for Phases 2+ |
| `tools/provenance/cli.ts` | CLI dispatcher (subcommand entrypoint) | request-response | `01-09-PLAN.md:88` subcommand delegation + exit-2 usage policy | role-match (self-defined) |
| `tools/provenance/stage.ts` | staged pipeline (import → verify → ledger) | batch orchestration | `01-01-PLAN.md:121-133` stages definition | exact self-reference |
| `tools/provenance/fetch.ts` | upstream cache builder | network, file-I/O | `01-09-PLAN.md` fetch recipe | role-match (plan-defined) |
| `tools/provenance/replay.ts` | tree reconstruction | file-I/O, transform | same function called by both import and replay | exact self-reference |
| `tools/provenance/denylist-check.ts` | license-sensitivity gate | batch scan | `01-05-PLAN.md:126,131` loud-failure detection | role-match (plan-defined) |
| `provenance/schema/upstream.schema.json` | config (JSON Schema) | n/a | draft-2020-12, all root fields required | near-exact (Plan 01-01 line 150) |
| `provenance/schema/{paths,renames,excludes,watchlist,lfs,denylist}.schema.json` | config (JSON Schemas) | n/a | same style as upstream schema | exact self-reference |
| `provenance/replay-trace.log` | log | append | Line-prefixed, rotating ring buffer (`AGENTS.md:221`) | role-match |
| `tests/provenance/fixtures/tiny-upstream/` | test fixture | file-I/O | Hermetic fixture-tree builder pattern (`01-02-PLAN.md:99,126`) | role-match |
| `tests/provenance/fixtures/make-fixture.ts` | fixture builder | file-I/O | Scripted creation of hostile-path corpus | role-match (Plan 01-02) |
| `.git/info/attributes` | config (git plumbing) | n/a | Highest-precedence gitattributes override (`01-RESEARCH.md:19`) | exact (Plan 01-01 line 37) |
| `vendor/<name>/provenance/UPSTREAM.json` | data (per-tree) | batch | Machine-readable-contract style (`01-05-PLAN.md:129`) | role-match |
| `vendor/<name>/provenance/PATHS.json` | data (per-tree) | batch | Same as UPSTREAM, path-indexed mapping | exact structural sibling |
| `vendor/<name>/provenance/RENAMES.json` | data (per-tree) | batch | `01-03-PLAN.md:96,100` rule-object schema | exact |
| `vendor/<name>/patches/series` | data (per-tree) | patch queue | Quilt-style series applied in byte-order | exact self-reference |
| `vendor/<name>/MANIFEST.upstream.tsv` | data (per-tree) | batch | Pre-import blob identity manifest | role-match |
| `vendor/<name>/MANIFEST.vendored.tsv` | data (per-tree) | batch | Post-staging identity manifest | role-match (structural twin of MANIFEST.upstream) |
| `tools/provenance/cli.ts` extended: `manifest`, `verify`, `replay`, `where`, `license` subcommands | utility extension | request-response | Subcommand delegation discipline (`01-09-PLAN.md:88`) | exact |
| `justfile` recipes: `bootstrap`, `provenance-fetch`, `provenance-import`, `provenance-ledger`, `provenance-replay`, `provenance-verify`, `provenance-where`, `provenance-license`, `provenance-lfs`, `provenance-tests`, `verify` | config (build orchestration) | batch | `[windows] set shell := ["pwsh"]` + dependency-ordered recipes (`01-01-PLAN.md:247`, `01-09-PLAN.md:81-90`) | exact |
| `.gitignore` entries: `upstream-cache/`, `node_modules/`, `target/`, `.venv/`, `dist/`, `build/`, `__pycache__/`, `*.pyc` | config | n/a | Exact list from `01-01-PLAN.md:138` | exact |
| `package.json` root: `"devDependencies"` pinning `bun` toolchain | config | n/a | Root package.json rules (`01-01-PLAN.md:138`) | exact |
| `.github/workflows/provenance.yml` | config (CI) | batch | Same `just verify` run verbatim, cold-cache-safe (`01-09-PLAN.md:144-162`) | exact |
| `provenance/rebrand-denylist.json` | config (contract consumed-by-path) | n/a | Contract with `schema:` version field + machine-readable-gate | exact (Plan 01-05 line 129) |

## Pattern Assignments

### `tools/provenance/ledger.ts` (utility, deterministic derivation)

**Analog:** Establishes the one-producer discipline — the canonical pattern all later generator utilities copy.

**Copy:** pure derivation functions returning plain objects; arrays sorted by natural key; generation callable from both the command path and the CLI via the *same exported function*; idempotence output style: `{NAME} OK {tree} unchanged` when regenerated input matches committed bytes; drift detected as `{NAME} DRIFT <path>` before any write. Byte-stability: sorted keys, `\n` join with trailing newline, no BOM, no timestamps, no locale-dependent collation. Export exactly one public function serving generate and check paths (`01-03-PLAN.md:102`: "the two plans agree because they call one function, not because they were written to match").

**CI drift gate:** `just provenance-verify && git diff --exit-code`.

**Do not:** duplicate the derivation logic in multiple modules; allow post-hoc validation after file writes; use `localeCompare` for sorting — always `Buffer.compare` on UTF-8 bytes.

---

### `tools/provenance/cli.ts` (CLI dispatcher, request-response)

**Analog:** Self-defined dispatcher — becomes the subcommand entrypoint convention for Phases 2+ (e.g., `halo-agent sessions`).

**Copy:** Each subcommand delegates to the module's exported function — no logic duplicated in the dispatcher. Unknown subcommands exit 2, write usage to **stderr** (stdout reserved for result lines gates parse). Fixed exit contract: `0` success, `1` finding/refusal, `2` malformed input/usage. No logic in main guards beyond subcommand routing.

**Import discipline:** `argparse`-style positional + optional flags mapped to handler functions. Stdout never carries error text; errors go to stderr only.

**Do not:** route subcommand names case-insensitively without a canonical lowercased index; print status to stdout if the call failed; nest business logic inside the dispatcher.

---

### `tools/provenance/stage.ts` (staged pipeline, batch orchestration)

**Analog:** Import workflow defined in `01-01-PLAN.md:121-133` — the sequence: fetch archive → validate entry names → materialize blobs → verify OID digests → emit ledger documents.

**Copy:** Stage functions each return a result object `{ok, findings[]}`. Pipeline stops at first failure. Stages are independent functions composed by the orchestrator, not a monolithic class. Result logging is structured JSON per-stage appended to `provenance/replay-trace.log`.

**Idempotent stage behavior:** running the full stage sequence against already-staged trees produces `{NAME} OK {tree} unchanged` and touches zero files.

**Do not:** write intermediate state to disk between stages (everything stays in memory until all stages pass, then atomic commit).

---

### `tools/provenance/replay.ts` (tree reconstruction, file-I/O)

**Analog:** Reuses the exact same derivation functions as the import path — `01-03-PLAN.md:102` confirms the single-function property.

**Copy:** Input: `(repo_url, sha, patches_path, renames_schema)` → output: reconstructed tree bytes compared against committed manifests. Path-rule application follows `RENAMES.json` rule-byte order. Patch application uses `git apply --reverse --check` preflight. Failure signals: `TAMPERED <path>` for digest mismatches, `CASE-COLLISION <key>` for path collisions, `DRIFT <path>` for content changes.

**Drift detection classes:** TAMPERED (blob change), CASE-COLLISION (Windows path collision), MISSING_ENTRY (ledger references absent file), EXTRA_ENTRY (committed file unlisted in manifest).

**Do not:** treat a replay mismatch as a warning — any drift above is a hard fail for the `provenance-replay` gate.

---

### `tools/provenance/denylist-check.ts` (license-sensitivity gate, batch scan)

**Analog:** `01-05-PLAN.md:126,131` — reads `provenance/rebrand-denylist.json` by path and fails loud on matched sensitive content.

**Copy:** Loads deny-list contract (version check, schema validation), walks the target tree using the glob patterns, reports every match with path + context snippet, exits non-zero if any hit found outside the exempt list. Sensitivity proof test: unfiltered run fires on known tokens, filtered run does not.

**Fail-loud semantics:** exit 2, write all hits to stdout with `DENY <reason> <path>:<line>`, never suppress findings silently.

**Do not:** soft-fail or warn-only. Denylist violations stop the build.

---

### `.git/info/attributes` + `.gitignore` (config, highest-precedence overrides)

**Analog:** `01-RESEARCH.md:19` — Windows system-level `core.autocrlf=true` would rewrite LF→CRLF on checkout; this is the mitigation that prevents silent byte corruption.

**Copy:** Generate `.git/info/attributes` (highest precedence in git hierarchy) with `* -text -filter` to disable all text normalization, filtering, and smudge/clean transforms. This overrides any system or repo-level setting. `.gitignore` contains the exact list from Plan 01-01: `upstream-cache/`, `node_modules/`, `target/`, `.venv/`, `dist/`, `build/`, `__pycache__/`, `*.pyc` plus per-phase additions noted in VALIDATION.md.

**Do not:** rely on `.gitattributes` at the repo root for the import-time override — it has lower precedence than `.git/info/attributes`. Do not add wildcard ignores that could hide lockfiles or schemas.

---

### `vendor/<name>/provenance/` directory structure (data storage, per-tree ledger)

**Analog:** Each subtree carries four ledger docs plus a patches directory — the minimum complete set for replayable provenance.

**Copy:** File set per tree:
```
vendor/<name>/provenance/
  UPSTREAM.json          # repo URL, SHA, date, license ref
  PATHS.json             # upstream-to-vendor path map
  RENAMES.json           # rename rules with scope/kind/id
  watchlist.json         # subsystem-to-upstream-location mapping
  patches/series         # quilt-style ordered patch list
```

All JSON files validate against their respective `provenance/schema/*.schema.json`. `patches/series` contains one filename per line in application order.

**Structural invariant:** a missing or malformed file in this directory means the ledger is incomplete and replay is impossible — flag immediately rather than proceeding.

**Do not:** add a fifth unconstrained document type here; extend the schema first, then the consumer.

---

### `justfile` recipes (build orchestration)

**Analog:** Single-entry-point convention established in `01-01-PLAN.md:247` with `[windows]` shell override.

**Copy:** `set shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]` under `[windows]` attribute. Recipes are ordered by dependencies (implicit DAG via recipe order when no explicit deps exist). The `verify` recipe chains: fetch → ledger → verify → replay → test suites. CI workflow calls `just verify`, never reimplements steps.

Recipe naming convention: `action-target` where action is verb (`fetch`, `verify`, `replay`, `import`, `manifest`) and target is noun (`all`, tree name, or omitted for default). Each recipe prints a prefixed status line: `{ACTION} <result>` parsable by CI consumers.

**Do not:** put platform-specific shims inside recipe bodies; fix them in the `[windows]` shell directive. Never source another justfile (single-file authority).

---

### Test fixture discipline (`tests/provenance/fixtures/`)

**Analog:** Hermetic fixture-tree builder pattern defined in Plan 01-02.

**Copy:** Fixtures live under `tests/provenance/fixtures/`. Each fixture is a script-generated subdirectory containing a controlled git repo with known content: LF files, CRLF files, symlinks, LFS pointers, Unicode filenames, hostile paths, LICENSE files, and empty-series-edge cases. The builder script (`make-fixture.ts`) takes a named fixture ID and returns the temp path. Tests operate against isolated copies, never the source fixture tree.

**Test isolation rule:** tests read/write only to the OS temp directory or a scratch subdirectory beneath the fixture path. No test may reference another test's fixture state.

**Do not:** create fixtures manually; all fixtures must be reproducible by running the builder script.

---

### JSON Schema design conventions (`provenance/schema/`)

**Analog:** Draft-2020-12 style with required fields, minItems/minLength constraints, hex/name patterns.

**Copy:** Every schema declares `$schema: "https://json-schema.org/draft/2020-12/schema"`, a `title`, `description`, `type: "object"`, and a `required` array listing all mandatory top-level keys. Versioned contracts carry `schema:` and `version:` fields matching the pattern `<namespace>/<artifact>/<version>`. Refusals name the offending field and exit non-zero before any downstream operation.

Schema validation is implemented with `node:fs` only (no ajv/external library): walk `required` arrays, check `pattern`, enforce `minItems`/`minLength`. Keep this lightweight so the generator has zero runtime dependencies.

**Do not:** use `$ref` cross-file references (schema files are small and standalone); introduce external validators.

---

### CI workflow shape (`.github/workflows/provenance.yml`)

**Analog:** Cold-cache-safe, `just`-invoking CI chain from `01-09-PLAN.md:144-162`.

**Copy:** Single job running on `windows-latest`. Steps: setup bun, setup uv, `bun install --frozen-lockfile`, `just bootstrap` (generates `.git/info/attributes` + `.gitignore`), `just provenance-fetch --all`, `just verify`. Uses `--frozen-lockfile` for deterministic installs. No `continue-on-error`, no `if: always` softening — every step is hard-fail.

The same recipe sequence runs locally and in CI; they are the identical surface.

**Do not:** duplicate verification logic in the workflow YAML; always delegate to `just` recipes.
