# Phase 2: Rebrand, Wire Contract & Migration - Pattern Map

**Mapped:** 2026-10-23
**Files analyzed:** 24 new/modified artifacts (from 02-RESEARCH.md §Recommended Project Structure, §Architecture Patterns, §Code Examples, §Validation Architecture)
**Analogs found:** 21 / 24 — but **all** analogs are `planned-analog (01-0N-PLAN.md)`, not executed code: this working tree contains no application source. Phase 1 (01-01 … 01-09) describes the first concrete artifacts this repo will ever contain, and its plans are the conventions Phase 2 must extend (01-SKELETON.md:95: "Phase 2 adds the rebrand slice on top of this skeleton… No Phase-1 decision changes").

> **Hard ordering constraint carried from RESEARCH.md:7:** everything except `brand.json`, its generators, `contracts/rpc-wire.json`, and their unit tests is gated on Phase 1 Wave completion landing `vendor/`. Plan waves accordingly; every Phase 2 wave must end with Phase 1's `just verify` still green (RESEARCH.md:66, 01-09-PLAN.md:25).

> **Tracked-source note:** every analog cited below is a git-TRACKED file (`git ls-files` verified). No executed source path is named because none exists yet; where a Phase 1 *artifact* is cited (e.g. `manifest.ts`, `shouldRewrite()`), it is cited through the plan that creates it, at the line carrying the convention.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `brand.json` | config | batch (generation input) | planned-analog: deny-list contract style (`01-05-PLAN.md:129`) | role-match |
| `tools/brand/gen.ts` | utility (generator) | transform, file-I/O | planned-analog: `ledger.ts` one-producer discipline (`01-01-PLAN.md:144`, `01-03-PLAN.md:102`) | role-match |
| `tools/brand/test/gen.test.ts` | test | n/a | planned-analog: byte-equality/idempotence suites (`01-01-PLAN.md:200-236`) | role-match |
| `runtime/shared_contracts/brand.gen.ts`, `crates/halo-brand/src/brand_gen.rs`, `runtime/shared_contracts/halo_agent/brand_gen.py`, `legacyEnv.gen.ts`, `legacy_env_gen.py`, `deny-tokens.gen.json` (generated, committed) | config (generated) | transform | planned-analog: commit-generated + drift-gate convention (`AGENTS.md` gen-file rule via RESEARCH.md:41; `01-03-PLAN.md:94` unchanged-no-op) | role-match |
| `tools/rebrand/rename.yml` | config (rule manifest) | transform | planned-analog: `RENAMES.json` + `renames.schema.json` (`01-03-PLAN.md:96,100,120`); stages table (`AGENTS.md:236`) | role-match (new format: YAML) |
| `tools/rebrand/apply.ts` | utility (pipeline) | batch, file-I/O | planned-analog: `stage.ts`/`replay.ts` staged pipeline (`01-01-PLAN.md:121-133`); stages 3-5 (`AGENTS.md:237-239`) | role-match |
| `tools/rebrand/rewrite.ts` (shared rewrite engine, name planner's choice; one module, two callers) | utility | transform | planned-analog: "one manifest function, two callers" rule (`01-01-PLAN.md:72-73,140`) | role-match |
| `tools/rebrand/inventory.ts` | utility (scanner) | file-I/O | no analog — establish new pattern (rg stage only: `AGENTS.md:235`) | none |
| `tools/rebrand/deny-gate.ts` | utility (CI gate) | batch scan | planned-analog: `denylist-check` loud-failure command (`01-05-PLAN.md:126,131`) | role-match, different data flow |
| `contracts/rpc-wire.json` | config (contract) | request-response vocabulary | planned-analog: `provenance/rebrand-denylist.json` machine-readable-contract style (`01-05-PLAN.md:129`) | role-match |
| `contracts/schema/rpc-wire.schema.json` | config (schema) | n/a | planned-analog: draft-2020-12 schema style (`01-03-PLAN.md:100`, `01-01-PLAN.md:150`) | near-exact |
| `tools/contract/gen.ts` | utility (generator) | transform | planned-analog: `ledger.ts` deterministic derivation (`01-01-PLAN.md:144`) + Pattern 1 byte-stability (RESEARCH.md:155-158) | role-match |
| `tools/contract/test/census.test.ts` | test (source census) | file-I/O read | planned-analog: read-files-assert-structure style (`01-09-PLAN.md:122-125` workspace-isolation test) | partial |
| generated wire codecs → `runtime/shared_contracts/` (TS unions, Rust/Python constants, alias map, event-filter defaults) | config (generated) | transform | same as brand generated row | role-match |
| `resolve_home()` resolver, one per language (TS in daemon/CLI, Python in adapter; lives in vendored host layer via patches/renames) | service | file-I/O, env | **no analog — establish new pattern** (RESEARCH.md:326-336 excerpt is the design) | none |
| Migration runner (copy-verify + `.migrated-from` marker) | migration | file-I/O, batch | planned-analog (partial): raw-byte SHA-256 (`01-05-PLAN.md:97`) + idempotent `... unchanged` no-op (`01-03-PLAN.md:94`, `01-01-PLAN.md:128`) | partial |
| Handshake module: `halo.ready`/`halo.negotiate_protocol` + `contract_mismatch` refusal (TS core + Python adapter sides) | middleware/service | request-response | **no analog — establish new pattern** (no protocol code in Phase 1; error vocabulary copies fail-loud named-token style, `01-08-PLAN.md:95`) | none |
| Alias-map runtime lookup + deprecation warning (generated table consumed both sides) | middleware | request-response | **no analog — establish new pattern** | none |
| `tests/rebrand/cli-surface.test.ts` | test (smoke) | spawns exe | planned-analog: fixture-spawn-and-assert-token suites (`01-08-PLAN.md:117-151`) | role-match |
| `tests/rebrand/migration.test.ts` + `tests/rebrand/fixtures/profiles/` | test + fixtures | file-I/O | planned-analog: hermetic fixture-tree builder pattern (`01-08-PLAN.md:99,126,135` via `tests/provenance/fixtures/make-fixture.ts`) | role-match |
| `tests/rebrand/handshake.test.ts` | test (integration) | request-response | planned-analog: two-process refusal asserting named token + fields (`01-08-PLAN.md:131,144` assertion discipline) | partial |
| `tests/rebrand/alias-window.test.ts` | test | request-response | planned-analog: negative-case suites asserting exact tokens, fresh fixture per case (`01-08-PLAN.md:118-151`) | partial |
| `tests/rebrand/deny-gate.test.ts` | test (sensitivity) | batch scan | planned-analog: the sensitivity-proving deny-list test (`01-05-PLAN.md:39,133`) — same shape: unfiltered run must fire, filtered must not | near-exact |
| `tests/rebrand/plugin_survival_test.py` | test (pytest via uv) | file-I/O | no analog — first pytest-side suite in the repo (Phase 1 harness is `bun test` only, `02-RESEARCH.md:437`) | none |
| `tools/provenance/replay.ts` (MODIFY: content-rename pass) | utility | batch | **exact planned analog — its own recorded behavior** (`01-01-PLAN.md:130`: path rules "in rule-id byte order"; RESEARCH Pattern 2:182) | exact |
| `tools/provenance/cli.ts` (MODIFY: expose rebrand/contract commands if planner routes them through the dispatcher) | utility (CLI seam) | request-response | exact planned analog: dispatcher rules (`01-09-PLAN.md:80-88`, `01-01-PLAN.md:75`) | exact |
| `justfile` (MODIFY: `brand-gen`, `rebrand-apply`, `rebrand-verify`, `deny-gate`; join `verify`) | config (build) | batch | exact planned analog: recipe conventions (`01-09-PLAN.md:81-90`, `01-01-PLAN.md:243-266`) | exact |
| `package.json` (MODIFY: devDependency `@ast-grep/cli@0.51.0`) | config | n/a | planned-analog: root package.json rules (`01-01-PLAN.md:138`) + [SUS] checkpoint (RESEARCH.md:104-108) | exact |
| `vendor/<4 trees>/provenance/RENAMES.json` (POPULATE), `UPSTREAM.json.renames_sha256` (REFRESH), `MANIFEST.vendored.tsv` (RESTAGE) | migration (ledger data) | batch | exact planned analog: `cli.ts manifest --tree` restage flow (`01-01-PLAN.md:128,148`) + RENAMES schema (`01-03-PLAN.md:96,100`) | exact |
| `.github/workflows/*` rebrand CI (extend `provenance.yml` or sibling) | config (CI) | batch | exact planned analog: workflow runs the same `just` gate verbatim, cold-cache-safe (`01-09-PLAN.md:144-162`) | exact |
| `provenance/rebrand-denylist.json` (CONSUME; extend globs only if uncovered) | config (contract) | n/a | exact planned analog: the contract itself (`01-05-PLAN.md:129`), consumed-by-path rule (`01-05-PLAN.md:50`) | exact |

## Pattern Assignments

### `brand.json` (config, generation input)

**Analog:** `provenance/rebrand-denylist.json` contract style — planned-analog (`01-05-PLAN.md:129`):

> "Create `provenance/rebrand-denylist.json` as the contract Phase 2's rewriter must consume, with `schema: halo/denylist/v1`, `version: 1`, and these path globs, each with a `reason`…"

**Copy:** the `schema:` version-string field pattern (`halo/brand/v1` per RESEARCH.md:161), a `version` int, and every entry carrying a human `reason`. **Do not** invent a second deny token list — `tokens.deny` here *is* the deny-gate input, and the allow-list side MUST consume `provenance/rebrand-denylist.json` by path, per RESEARCH.md:32 / `01-05-PLAN.md:50`: "The deny-list must be consumed by path, before any rewrite runs."

Field shape itself: RESEARCH.md:158-173 (verbatim design contract).

---

### `tools/brand/gen.ts` + `tools/contract/gen.ts` (utility, transform)

**Analog:** `tools/provenance/ledger.ts` — planned-analog (`01-01-PLAN.md:144`):

> "`tools/provenance/ledger.ts` owns deterministic derivation of the three ledger documents: `derivePaths(…)`, `deriveRenames()`, and `deriveExcludes(rules)` each return a plain object with arrays sorted by their natural key, so the import path here and the `ledger` subcommand in plan 01-03 produce byte-identical files from the same upstream tree."

and the one-producer proof (`01-03-PLAN.md:102`):

> "This is the same producer plan 01-01 ran at import, which is why `gsd-omp` comes out unchanged: the two plans agree because they call one function, not because they were written to match."

**Copy:** pure derivation functions returning plain objects; arrays sorted by natural key; generation callable from both the command path and the import/check path through the *same exported function*. **Idempotence output style** (`01-03-PLAN.md:94`): `LEDGER OK gsd-omp unchanged` — mirror as `BRAND OK unchanged` / `CONTRACT OK unchanged`, and drift as `LEDGER DRIFT <path>`-style refusal to rewrite without `--force` (`01-03-PLAN.md:97`).

**Byte-stability requirements** (RESEARCH.md:313): "deterministic: sorted keys, \n endings, no timestamps" — same rules the manifest writer already enforces (`01-01-PLAN.md:126`): "`#halo-manifest v1` then `%06o<TAB>…`, LF-joined with a final LF, no BOM, sorted with a byte comparator" and byte comparator = `Buffer.compare` on UTF-8 path bytes, NOT `localeCompare` (`01-01-PLAN.md:140`, must_haves:43).

**CI drift gate** (RESEARCH.md:317): `just brand-gen && git diff --exit-code`.

---

### `tools/rebrand/apply.ts` + shared rewrite engine (utility, batch file-I/O)

**Analog:** the stage/replay pipeline — planned-analog (`01-01-PLAN.md:121-133`). Structure apply.ts as the same 8 ordered steps RESEARCH Pattern 2 (:126-133) prescribes, of which steps 3-5 come verbatim from `AGENTS.md:237-239`:

| stage | source | rule (verbatim) |
|---|---|---|
| 3 code rewrite | `AGENTS.md:237` | "`sg run -p '<pattern>' -r '<rewrite>' -l ts|rust|python -U`; `--json=stream` for machine review" |
| 4 path renames | `AGENTS.md:238` | "`git mv` driven by the manifest … case-only renames visible" — apply.ts adds RESEARCH Pitfall 4 precheck: case-folded collision precheck, `git mv -f`/two-step, post-apply `git ls-files` case assertion (`02-RESEARCH.md:279`) |
| 5 structured files | `AGENTS.md:239` | "`package.json`, `Cargo.toml`, `pyproject.toml`, `*.json`, Windows resource metadata — parse, mutate, re-serialise. Never regex JSON" |

**Shared-engine rule** — copy the one-writer pattern from `01-01-PLAN.md:72-73`:

> "replay.ts and stage.ts must share one manifest function, so 'import' and 'replay' cannot diverge… `isLedgerPath()` from manifest.ts is the one exclusion predicate… a second copy of that rule is how `provenance/**` starts being reported as ADDED."

Apply verbatim to the rewrite engine: one module, imported by both `apply.ts` and `replay.ts`'s new content-rename pass (RESEARCH.md:182), and **import** `shouldRewrite()` from `license.ts` — never re-implement (`01-05-PLAN.md:131`: "one matcher, two callers"; predicate pins at `01-05-PLAN.md:123`: `shouldRewrite("vendor/hermes-agent/LICENSE")` false / `…docs/rpc.md` true / `THIRD-PARTY-NOTICES.txt` false).

**Rule ordering:** content rules apply in **rule-id byte order**, identical to the existing path-rule step (`01-01-PLAN.md:130`): "applies every `RENAMES.json` rule with `kind: \"path\"` in rule-id byte order (an empty map is the identity)". The content pass uses the same comparator — this is the cross-cutting integration point (see Shared Patterns §S10).

**Ledger landing (steps 6-8):** after apply, record rules → refresh `renames_sha256` → restage via the *existing* command (`01-01-PLAN.md:128,148`):

> "`cli.ts manifest --tree <name>` … recomputes `MANIFEST.vendored.tsv` through the same `stage.ts` + `manifest.ts` function the import uses … and recomputes all four ledger digests … preserving the document's key order, indentation, and trailing newline so the diff is exactly that one [field]"

**RENAMES rule object** (`01-03-PLAN.md:100`, schema line — verbatim): "`renames.schema.json` requires `generated_from`, `phase_populated`, `rules` with `id` matching `^R-[A-Z0-9]+-[0-9]{4}$`, `kind` in `identifier|string|path|env|pkg|schema`, `from`, `to`, `scope`, `applied_by`". Wait-state is already committed (`01-03-PLAN.md:96`): `RENAMES.json` has `generated_from: "brand.json"`, `phase_populated: 2`, `rules: []` — Phase 2 fills exactly this.

**Windows spawn discipline** (Phase 1 precedent, `01-01-PLAN.md:121`): "three argv-array commands with no shell and no pipe". apply.ts's ast-grep/`git mv` invocations follow the same argv-array, `windowsHide` rule (AGENTS.md Windows rules via RESEARCH.md:34).

---

### `tools/rebrand/deny-gate.ts` (utility, CI gate)

**Analog:** `cli.ts denylist-check` — planned-analog (`01-05-PLAN.md:126`), the loudest gate in Phase 1:

> "`cli.ts denylist-check` exits 0 only when every glob matches at least one imported path …, printing `DENYLIST OK globs=<n> licence_paths=<n>`; a glob that matches nothing prints `unmatched glob: <glob>`, and a licence-shaped path that no glob denies prints `UNCOVERED <path>` — either one exits 1, so a dead guard and a blind spot are both loud."

**Copy:** fixed-token one-line findings, OK line with counts, exit 1 on any finding, exit 2 on malformed contract; the **dead-entry rule** re-used for allow-list entries ("an allow-list entry matching nothing is itself a finding", RESEARCH Pattern 6:222). Scope/invocation shape: RESEARCH.md:366-372. Sensitivity-test shape comes from `01-05-PLAN.md:39` (see test section below).

**Sourcing rule:** allow-list *consumes* `provenance/rebrand-denylist.json` + `vendor/*/LICENSE*` etc. rather than duplicating (RESEARCH.md:222); short tokens (`pi`, `omp`) restricted to identifier/string contexts via ast-grep kinds (RESEARCH.md:220).

---

### `contracts/rpc-wire.json` + `contracts/schema/rpc-wire.schema.json` + wire generators

**Analog:** the ledger contract+schema pair — planned-analog (`01-05-PLAN.md:129` for contract style; `01-01-PLAN.md:150` for schema style, verbatim excerpt):

> "Write `provenance/schema/upstream.schema.json` as JSON Schema draft 2020-12 with `required` at the root of `schema`, `subtree`, … `commit` (pattern `^[0-9a-f]{40}$`) … `excludes_sha256` and `renames_sha256` carry pattern `^[0-9a-f]{64}$`…"

**Copy:** draft 2020-12; every root field in `required`; hex patterns for the hash fields; `schema: "halo/rpc-wire/v1"` + `contractVersion` versioning. **Validate-before-codegen** (RESEARCH Security V5:475): "garbage contract → codegen refuse, not emit" — mirror Phase 1's schema-violation-is-refusal behavior, not post-hoc checks.

**Contract file shape + canonical hash:** RESEARCH.md:347-355 — `sha256(stableStringify(contract))`, "sorted-key, fixed-separator JSON", identical bytes from all three generators (RESEARCH.md:186; Don't-Hand-Roll row :242: canonical-form drift across languages = permanent mismatch). Use `node:crypto`/`hashlib` only (:84).

**Naming scheme:** keep upstream suffixes, add brand prefix — `get_state → halo.get_state` (RESEARCH.md:187); census invariant is **derived equality**, never a hardcoded 185/18 (Pitfall 8, RESEARCH.md:296-299): "the contract covers exactly the union of `RpcCommand` types and frame-type literals in rpc-types.ts at the recorded SHA, and every contract entry is dispatched".

**Generated modules:** land in `runtime/shared_contracts/` (RESEARCH.md:149); alias map + `alias_expires_minor` per BRND-06; removal = regenerate with `include_aliases: false`.

---

### `resolve_home()` resolvers, migration runner, handshake, alias lookup — NEW PATTERNS

No analog exists in any planned artifact (see §No Analog Found). Concrete guidance for the planner, all sourced from RESEARCH excerpts which are normative here:

- **`resolve_home`** (RESEARCH.md:326-336): exactly one function per language producing a home path; order `HALO_HOME` → non-empty HALO home → `.migrated-from` marker → legacy homes (`HERMES_HOME` → `%LOCALAPPDATA%\hermes` → `~/.hermes` → `~/.omp`) → create default. Every branch unit-tested (Pitfall 2 defense: deny-gate scans for raw legacy env lookups outside the shim module, RESEARCH.md:268).
- **Migration runner** (RESEARCH.md:201-208, 339-344): copy-never-move; per-file SHA-256 verify using the raw-byte discipline of `01-05-PLAN.md:97` ("`node:fs.readFileSync` and hashing the exact buffer — never `git hash-object`… never a text decode"); both-present ⇒ refuse with `halo migrate --from <path>`; marker JSON `schema: "halo/migration/v1"`; second launch is a byte-no-op mirroring Phase 1's `… unchanged` idempotence tokens (`01-03-PLAN.md:94`); secrets copied hash-verified, values never logged (Pitfall 10).
- **Handshake** (RESEARCH.md:188-197, 356-364): `halo.ready{contractHash}` → `halo.negotiate_protocol`; absent field **is** a mismatch; `contract_mismatch` error carries `expected`, `got`, `core_version`, `adapter_version`, `action`; written to stderr + structured log, never mid-session on the frame stream; refusal is the only successor (Pitfall 6 — no `--force-contract` in shipped builds). The named-token + field-bearing error discipline copies `verify.ts`'s fixed vocabulary (`01-08-PLAN.md:95`); the hash is integrity-only — document "not an authentication mechanism" (Security V6:476).
- **Alias lookup:** one deprecation line per name per process; after window, `unknown command` naming the alias window (RESEARCH Pattern 3:198).

---

### Tests (`tools/brand/test`, `tools/rebrand/test`, `tests/rebrand/*`)

**Harness:** `bun test` with paths pinned in the command, no config file (Phase 1 convention; RESEARCH Validation Architecture:435-440: quick `bun test tests/rebrand tools/brand/test tools/rebrand/test`). Plugin survival is the only pytest side: `uv run pytest tests/rebrand/plugin_survival_test.py -x`.

**Assertion discipline** — copy from `01-08-PLAN.md:131,135,144` verbatim:

> "asserts the literal finding token and the path text — never merely a non-zero exit… Print the case names … so a filter that matched nothing is visible… No case asserts only a non-zero exit code."

and per-case isolation (`01-08-PLAN.md:126`): "Each negative runs against a fresh scratch copy so one case cannot contaminate the next" (fixtures built under the OS temp dir, `01-01-PLAN.md:218`).

**Sensitivity-proving pattern for `deny-gate.test.ts`** — exact shape of `01-05-PLAN.md:39` + `:133`:

> "(1) applies a naive case-insensitive replacement … and records the licence-ish SHA-256s before and after — assert at least one changed, proving the fixture detects tampering; (2) repeats the replacement while skipping every path `shouldRewrite` rejects, and … assert every licence-ish SHA-256 is unchanged."

BRND-07's test mirrors it: planted token must fire; clean tree must pass; dead allow-list entry must be loud (RESEARCH:451 "mirrors 01-05's sensitivity-proving pattern").

**Fixture homes** for `migration.test.ts` (`tests/rebrand/fixtures/profiles/`): the four ROADMAP SC#5 profiles — fresh / legacy-only / both-present(refuse) / deny-listed (RESEARCH Pattern 5:216); build on the Phase 1 `tests/provenance/fixtures/make-fixture.ts` tree-builder pattern (`01-08-PLAN.md:99,120`), extended with profile sub-dirs holding minimal `config.yaml`/`plugin.yaml` seeds (seed contents re-derived from vendored trees at import SHA, RESEARCH Wave-0 gap :461).

**Generated-file test** (`tools/brand/test/gen.test.ts`): byte-equality under regeneration + the fixed-point pattern from `01-01-PLAN.md:201-203` ("Re-parsing a written manifest and re-writing it is a fixed point"), plus `git diff --exit-code` after `just brand-gen` (RESEARCH:446).

---

### Modified shared infrastructure (`tools/provenance/replay.ts`, `cli.ts`, `justfile`, CI, lockfiles)

- **`replay.ts`**: extend, don't fork. Existing contract (`01-01-PLAN.md:130`, `01-SKELETON.md:25`: "The rename step exists from day one so Phase 2 populates a mechanism that is already exercised, not a new one"). Flow: pristine → patches → **content renames (new pass, rule-id byte order, shared engine)** → path renames → manifest compare (RESEARCH.md:182). `TAMPERED` vocabulary stays in replay+verify only (`01-08-PLAN.md:28,49`).
- **`cli.ts`**: new subcommands delegate to module functions, no logic in the dispatcher; unknown subcommand exits 2 with usage on **stderr** because "stdout stays reserved for the result lines the gates parse" (`01-09-PLAN.md:88`).
- **`justfile`**: `[windows] set shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]` (`01-09-PLAN.md:90`; without it every recipe dies, `01-01-PLAN.md:247`); `tree` variable pattern; new recipes `brand-gen`, `rebrand-apply`, `rebrand-verify`, `deny-gate` named in RESEARCH Standard Stack:77; `just verify` chain grows (RESEARCH:440: `just verify && just rebrand-verify`). winget `Casey.Just` prerequisite task copies `01-01-PLAN.md:243-247` (RESEARCH:97 "same prerequisite pattern as 01-01 Task 3").
- **CI**: one job calling the same `just` gate verbatim, cold-cache-safe, `permissions: contents: read` (`01-09-PLAN.md:144-162`; key link :43: "must call `just verify`, not re-implement its steps").
- **`package.json`**: stays zero extra runtime deps for tools where possible (DEC-06); the one new devDependency `@ast-grep/cli@0.51.0` is [SUS-flagged] → planner MUST insert a `checkpoint:human-verify` task before install (RESEARCH:106-108). Never text-edit `bun.lock`/`Cargo.lock`/`uv.lock` — regenerate after package renames (`AGENTS.md:250`, RESEARCH:40).

## Shared Patterns

### S1 — One producer / one predicate (cross-cutting)
**Source:** `01-01-PLAN.md:72-73` (manifest writer), `01-05-PLAN.md:131` ("one matcher, two callers"), `01-03-PLAN.md:102`.
**Apply to:** rewrite engine (apply.ts + replay.ts), deny-gate allow-list (import `shouldRewrite`/denylist, never re-implement), brand literals (only generated modules carry brand strings), env table ("the table lives in code, never in prose", RESEARCH Pattern 4:208).

### S2 — Fail-loud fixed vocabulary + exit-code contract
**Source:** `verify.ts` spec (`01-08-PLAN.md:86-95`): tokens `MODIFIED / ADDED / REMOVED / MODE / TAMPERED / MISSING / EXCLUDED-PRESENT / GITLINK`, "Print at most 200 lines then `... <n> more`. Exit 1 when any finding exists, 2 on a malformed ledger, 0 when clean"; dead-guard loudness (`01-05-PLAN.md:126`); typed refusals before side effects (`01-01-PLAN.md:119,122` `unknown tree: <name>`, `unsafe archive path: <p>` — exit 2 *before* touching disk; same pre-extraction idea for rename case-collision precheck).
**Apply to:** deny-gate findings, `contract_mismatch`, migration refusal, `unknown command` after alias window, brand/contract drift lines.

### S3 — Byte-stable, idempotent output
**Source:** `01-01-PLAN.md:126,128,140` (LF, final LF, no BOM, `Buffer.compare` byte sort, key-order-preserving in-place rewrite), `01-03-PLAN.md:94,97` (`… unchanged` no-op; `LEDGER DRIFT` + `--force` only overwrite).
**Apply to:** `brand-gen`/`contract-gen` outputs (sorted keys, `\n`, no timestamps — RESEARCH:313), `contractHash` canonical bytes, `.migrated-from` second-launch no-op, restaged `UPSTREAM.json` diffs touching exactly one field.

### S4 — CLI seam: single dispatcher, stderr for usage
**Source:** `01-09-PLAN.md:80-88`, `01-01-PLAN.md:75` ("cli.ts is the single entry point the `justfile`, the pre-commit hook, and CI call"; module main guards for direct debugging must delegate to the same exported function).
**Apply to:** every Phase 2 tool reachable from justfile/CI — `tools/brand/gen.ts`, `tools/contract/gen.ts`, `tools/rebrand/apply.ts`, `deny-gate.ts` each expose exported functions; commands route through a cli seam.

### S5 — Schema-first contracts (draft 2020-12)
**Source:** `01-01-PLAN.md:150`, `01-03-PLAN.md:100`, `01-05-PLAN.md:144` ("validates against `denylist.schema.json`"); schema checks implemented with `node:fs` only, no ajv (`01-01-PLAN.md:214`); **validate before codegen** (RESEARCH V5:475).
**Apply to:** `contracts/schema/rpc-wire.schema.json`, a `brand.schema.json` if the planner adds one, `.migrated-from` validation, hostile-legacy-home input validation ("no `..`/absolute-injection through a hostile legacy tree", RESEARCH:475 — reuse `paths.ts` canonicalization thinking, `01-01-PLAN.md:142`).

### S6 — Executable assertions over greps and prose
**Source:** `01-08-PLAN.md:131,144,135`; `01-09-PLAN.md:136` ("isolation is a failing test if violated, not a convention in a document"); `01-03-PLAN.md:104` (derive paths from manifests, "never invent").
**Apply to:** plugin loaded-count assertion (Pattern 5 "fail loud, never silent"), resolver branch unit tests, contract census derived equality (Pitfall 8), fixture matrix — "Each is countered with an executable assertion (fixture migrations, loaded-plugin count, resolver unit tests), not a grep" (RESEARCH:64).

### S7 — Windows discipline
**Source:** argv-array spawns, no shell (`01-01-PLAN.md:121,191`: "no `execSync`, no shell-string concatenation of a path"); `[windows]` pwsh shell (`01-01-PLAN.md:247`); case-safety precheck+assert pair replacing STACK's impossible "case-sensitive CI checkout" (RESEARCH Pitfall 4:279, `core.ignorecase=true` verified live :419); `%LOCALAPPDATA%` never roaming for large data (`AGENTS.md:248`; Electron userData trap :247).
**Apply to:** apply.ts, deny-gate invocation, migration runner, just recipes.

### S8 — Generated committed + drift-gated
**Source:** OMP `gen:compat`/`gen:models` convention (RESEARCH:41, CITED upstream AGENTS.md); CI re-run + `git diff --exit-code`.
**Apply to:** every `*.gen.*` artifact and `rename.yml`.

### S9 — Rule-id byte ordering shared across the two consumers
**Source:** `01-01-PLAN.md:130` (path rules applied in rule-id byte order).
**Apply to:** the new content-rename pass in replay.ts AND apply.ts's rewrite ordering — one comparator, one order, both callers. Two rewriters computing different canonical forms is the named warning sign of Pitfall 1 (RESEARCH:264).

### S10 — Deny-list sensitivity before any rewrite
**Source:** `01-05-PLAN.md:50,123,126` + sensitivity test `:39,:133`.
**Apply to:** apply.ts step 1 is literally "load provenance/rebrand-denylist.json (path filter FIRST)" (RESEARCH:126); deny-gate allow-list reuses the same contract; the license-SHA-unchanged fixture (01-05) is extended to the real rewriter run (RESEARCH:485).

### S11 — [SUS] package checkpoint
`@ast-grep/cli` is [WARNING: flagged as suspicious — verify before using.] (RESEARCH:108). Planner: insert `checkpoint:human-verify` task before the install step. No other new packages (Phase 1 zero-deps rule, DEC-06; hashing via stdlib only).

## No Analog Found

| File | Role | Data Flow | Reason / Substitute |
|------|------|-----------|---------------------|
| `resolve_home()` (TS + Python) | service | file-I/O, env | No resolver exists in Phase 1 artifacts. Substitute: RESEARCH.md:326-336 excerpt is the spec; enforce with S6 unit-per-branch + deny-gate scan (Pitfall 2) |
| Handshake / `contract_mismatch` module (TS core + Python adapter) | middleware/service | request-response | Phase 1 contains no inter-process protocol code. Substitute: error shape from S2's fixed vocabulary; frame shapes RESEARCH.md:188-197 |
| Alias-map runtime lookup + expiry test | middleware | request-response | No version-gated shim exists yet; removal-test pattern (RESEARCH Pattern 3:198) is the spec |
| `tools/rebrand/inventory.ts` | utility | file-I/O | rg inventory is a STACK stage description (`AGENTS.md:235`), never a Phase 1 module; output should feed `rename.yml`, keep it read-only |
| `tests/rebrand/plugin_survival_test.py` | test | pytest/uv | First Python-side suite; all Phase 1 test conventions (fresh fixture, named cases, token asserts) transfer even though the harness differs |

## Metadata

**Analog search scope:** repo root (`AGENTS.md`), `.planning/phases/01-import-provenance-ledger/` (01-01, 01-03, 01-05, 01-08, 01-09 plans + 01-SKELETON.md), `.planning/phases/02-rebrand-wire-contract-migration/02-RESEARCH.md`. No source directories exist (`tools/`, `vendor/`, `runtime/` are all Phase-1+ artifacts, none executed).
**Files scanned:** 8 (5 Phase-1 plans, skeleton, AGENTS.md, Phase-2 research) — full reads, no re-reads.
**Tracked-source gate:** all cited analog paths verified git-tracked via `git ls-files`.
**Pattern extraction date:** 2026-10-23
