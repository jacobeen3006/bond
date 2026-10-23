# Phase 2: Rebrand, Wire Contract & Migration - Research

**Researched:** 2026-10-23
**Domain:** Large-scale multi-language identifier rebrand, generated wire-protocol contract, config/plugin migration shims, CI deny-gating
**Confidence:** MEDIUM-HIGH overall. Mechanics HIGH (grounded in Phase 1 artifacts, upstream official docs fetched this session, live environment probes). Upstream *counts and exact literal sets* MEDIUM — they must be re-derived from the vendored trees at the import SHA (Phase 1 has not executed; no `vendor/` exists yet).

> **Hard dependency, state this in every plan:** Phase 2 operates on vendored trees. It assumes Phase 1 delivered `vendor/{oh-my-pi,hermes-agent,hindsight,gsd-omp}/` with `UPSTREAM.json`, `PATHS.json`, `RENAMES.json` (`rules: []`, `phase_populated: 2`), `EXCLUDES.json`, `patches/series`, and the license deny-list contract `provenance/rebrand-denylist.json` + `denylist-check` command (01-05, "the tooling that must consume this contract is Phase 2 (DEC-05)" [VERIFIED: .planning/phases/01-import-provenance-ledger/01-05-PLAN.md:61]). The only Phase 2 work executable before upstream lands is `brand.json`, its generators, the wire-contract file, and their unit tests — everything else is gated on Wave completion of Phase 1.

<phase_requirements>
## Phase Requirements

| ID | Description (verbatim, REQUIREMENTS.md:19-26 [VERIFIED]) | Research Support |
|----|-------------|------------------|
| BRND-01 | "User can run the CLI under the HALO binary name and never sees an upstream product name in help, errors, or logs" | Binary naming via `bun build --compile` + electron-builder `win.*`; string-scan deny gate; log-path rebrand (`~/.omp/logs/omp.*.log` → `%LOCALAPPDATA%\HALO\logs`) |
| BRND-02 | "A single `brand.json` is the source of truth that generates identifiers for every language in the tree" | §brand.json design; generators for TS/Rust/Python/manifests; byte-stable regeneration CI check |
| BRND-03 | "Existing Hermes/OMP config directories and environment variables are read-old/write-new, with copy-verify migration and a `.migrated-from` marker" | §Migration shims (home resolver order, copy-verify, marker JSON); legacy env table generated from brand.json |
| BRND-04 | "All 185 RPC commands and 18 frame categories carry HALO names, generated from one contract file" | §Wire contract (`contracts/rpc-wire.json`); name-generation pattern; count reconciliation at import SHA (Open Q1) |
| BRND-05 | "Protocol handshake exchanges a contract hash; a mismatched client and server refuse to run with an actionable error" | §Contract-hash handshake (ready/negotiate exchange, `contract_mismatch` error spec) |
| BRND-06 | "Old wire names are accepted for one minor version with a deprecation warning, then rejected" | §Alias window (generated alias map, `alias_expires_minor`, removal + rejection tests) |
| BRND-07 | "A deny-gate fails the build when an upstream brand token appears in a user-visible string" | §Deny-gate design (two scan scopes, token table, allow-list file, reuse of `provenance/rebrand-denylist.json`) |
| BRND-08 | "Plugin allow-lists and entry points survive identifier renames — renaming a plugin id never silently disables a plugin" | §Plugin survival (allow-list + provider/platform config-key rewrite, dual entry-point groups, loaded-count assertion, 4 fixtures) |

</phase_requirements>

## User Constraints (no CONTEXT.md — from ROADMAP/PROJECT/STATE/AGENTS)

No CONTEXT.md exists for Phase 2 (user chose to continue without discuss-phase). Binding constraints, verbatim-sourced:

- **Rebrand depth is a locked Key Decision:** "Rebrand surface *and* internals (env vars, config dirs, package names, plugin ids, DB schemas, all 185 RPC command names and 18 frame categories) with migration shims … mitigated by generating every constant from one contract, a hash-checked handshake, and a one-minor alias window" [VERIFIED: .planning/PROJECT.md:82]. Do **not** re-litigate SUMMARY C-2's "keep the wire ABI" alternative — the roadmap resolved it toward the versioned full rename.
- **Ordering rule:** "The rebrand freezes vocabulary before any contract, codec or test is written against it" [VERIFIED: .planning/ROADMAP.md:9]. Phase 2 output is a freeze point for Phases 3+.
- **Product name:** "Product name HALO (Bond remains only the workspace folder name)" [VERIFIED: .planning/PROJECT.md:83].
- **License obligation survives the rewrite:** consume `provenance/rebrand-denylist.json` by path *before any rewrite runs* [VERIFIED: .planning/phases/01-import-provenance-ledger/01-05-PLAN.md:50].
- **Stack pins** [VERIFIED: AGENTS.md STACK excerpt:30-51]: Bun 1.4.4, Rust 1.99.1, Python 3.14.9, uv 0.13.5, just 1.59.0, ast-grep 0.51.0, TypeScript 7.0.2, Electron 45.0.0, electron-builder 26.15.3. Windows-only support (win32 x64).
- **Windows rules** (AGENTS.md STACK): spawn with argv arrays (no `shell: true`); `windowsHide: true`, `detached: false`; data in `%LOCALAPPDATA%`, never roaming `%APPDATA%` for large data; PostgreSQL never elevated; "run on a case-sensitive CI checkout to defeat Windows' case-insensitivity masking `Foo`→`foo` bugs" (see Pitfall 4 — not achievable as stated on `windows-latest`; plan the substitute).
- **Migration shims land at Phase 2, ahead of the first user-installable build (Phase 12)** [VERIFIED: .planning/STATE.md:67].

## Project Constraints (from AGENTS.md)

- Every HALO-local edit to a vendored file must exist as a patch, or (for the rebrand) be expressed as rename rules — see Architecture Pattern 2 for the reconciliation of "no edit without a patch entry" with a whole-tree rename.
- Never text-edit `bun.lock` / `Cargo.lock` / `uv.lock`; regenerate after package renames (STACK §Migration shims).
- Generated files are committed alongside their source (OMP convention `gen:compat`/`gen:models` [CITED: github.com/can1357/oh-my-pi/blob/main/AGENTS.md]); HALO generators follow the same "commit generated + check drift in CI" pattern.
- Docs from code: generate CLI reference from `--help` in CI; do not hand-maintain command names (P-03 avoidance list).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `brand.json` + generators | Build-time tooling (`tools/brand`) | CI (drift gate) | Generation is deterministic offline work; runtime code only imports emitted constants |
| Wire contract (commands/frames/hash) | Contract layer (`contracts/rpc-wire.json`) | Python adapter + TS/Rust core (both consume generated codecs) | Two processes, three languages: the only way to keep them in lockstep is one generated artifact checked into git |
| Handshake + contract-hash refusal | Coding-core process boundary (supervisor ↔ core) | — | The check belongs at the `ready`/`negotiate` exchange, before any command is dispatched |
| Config-home resolution + migration | Runtime host layer (daemon/CLI/Desktop main, per language) | — | `resolve_home()` must be the *only* function producing a home path in each language |
| Legacy env acceptance | Runtime settings loader | — | Read-old/write-new happens where settings are constructed, not at each call site |
| Plugin allow-list / entry-point survival | Python agent core (Hermes-derived `PluginManager`) | Migration step (rewrites user `config.yaml`) | Loader reads old+new groups during the window; migration rewrites persisted ids |
| DB schema naming | PostgreSQL layer (Hindsight config + migration runner) | Phase 8 supervisor | Phase 2 sets vocabulary + migration mechanism; the cluster itself ships in Phase 8 |
| Brand deny-gate | CI / `just` | pre-commit (Phase 1 already pre-commits `provenance-verify`; deny-gate joins `just verify`) | Build failure, not warning — ROADMAP SC#1 |
| Windows exe/installer metadata | Packaging config (electron-builder `win.*`, bun compile flags) | Phase 12 installer | Configuration, not code; brand tokens flow from `brand.json` into both |

## Summary

Phase 2 is not a find-and-replace; it is **two generators and one refusal mechanism**. (1) `brand.json` generates every static brand identifier (binary, packages, homes, env prefixes, plugin group, DB schema, Windows metadata) plus the rename manifest `tools/rebrand/rename.yml`. (2) `contracts/rpc-wire.json` generates the entire RPC vocabulary for TS, Rust and Python, carries a canonical-hash the handshake refuses mismatches on, and owns a versioned alias map that expires after one minor. Everything else — migration shims, plugin survival, deny-gate — is verification that those two generators were applied completely, at the exact places where a missed rename is silent: env reads, config homes, plugin allow-lists, and the wire.

The single most important integration risk is **Phase 1's ledger vs a whole-tree rewrite**: `provenance-verify` fails on unrecorded vendored edits and `provenance-replay` reconstructs from SHA + patches + renames. A bulk rebrand must therefore land *inside* the ledger — every applied rule recorded in `RENAMES.json`, `renames_sha256` refreshed, `MANIFEST.vendored.tsv` re-staged — and `replay.ts` must grow a content-rename step that shares the rewrite engine with the rebrand tool. If replay cannot reproduce the rebranded tree, Phase 1's CI job goes red at exactly the moment Phase 2 lands.

Second: the rename's failure modes are runtime divergences, not build breaks (P-03 split-brain home, silent plugin disable, half-renamed env). Each is countered with an executable assertion (fixture migrations, loaded-plugin count, resolver unit tests), not a grep.

**Primary recommendation:** Build in this order — brand.json + generators → wire contract + handshake (green before any vendored-tree edit) → rebrand apply pipeline wired into the provenance ledger → migration shims + fixtures → deny-gate as the closing gate. Every step ends with a Phase 1 gate (`just verify`) still green.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ast-grep CLI (`@ast-grep/cli`, bins `ast-grep`/`sg`) | 0.51.0 | AST-aware rewrite of TS/Rust/Python per rename.yml identifier/string rules; also powers deny-gate string-literal scan | STACK-designated rewrite tool; `run -p <pattern> -r <rewrite> -l <lang> -U`, `--json=stream` for machine review; exits 0 on match / 1 on no match — usable directly as a gate [CITED: ast-grep.github.io/reference/cli/run.html] |
| ripgrep (`rg`) | installed 15.1.0 | Token inventory + deny-gate prose scan (`-i`, word-boundary globs) | STACK stage-1 inventory tool [VERIFIED: AGENTS.md:235] |
| Bun | 1.4.4 pinned (workstation has 1.4.2 — see Environment) | Generators (`tools/brand/gen.ts`, `tools/rebrand/apply.ts`), `bun test` harness, `bun build --compile` for the `halo` CLI incl. Windows exe metadata flags | Product runtime; Windows x64 builds [VERIFIED: AGENTS.md:32,60] |
| git | 2.55 installed | `git mv`-driven path renames via manifest; two-step for case-only renames on `core.ignorecase=true` | Keeps renames auditable; STACK stage-4 [VERIFIED: AGENTS.md:238] |
| just | 1.59.0 | `just brand-gen`, `just rebrand-apply`, `just rebrand-verify`, `just deny-gate` recipes | Only build coordinator (STACK) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| electron-builder | 26.15.3 | `win.*` productName/artifactName/version-info/shortcut names for the Desktop exe | Packaging metadata step of the rebrand (config-only edit from brand.json) |
| Python `importlib.metadata` | stdlib 3.14 | Dual entry-point group discovery (`halo_agent.plugins` + legacy `hermes_agent.plugins`) during the alias window | Plugin survival (BRND-08) |
| `node:crypto` / Python `hashlib` | stdlib | SHA-256 of canonical contract file (contract hash) and of copied migration files (copy-verify) | Hashing is integrity-only here — never hand-roll a scheme |
| uv | 0.13.5 pinned (workstation has 0.12.17) | venv rebuild after Python package/dist renames (`uv sync --locked`) | Never edit `uv.lock`; regenerate |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ast-grep run + apply.ts | IDE "rename symbol" / ts-morph | ts-morph only for type-aware TS symbol renames beyond syntax (STACK Alternatives row); no Rust/Python story |
| One contract JSON (`rpc-wire.json`) | YAML (`contracts/rpc-frames.yaml` named in SUMMARY C-2) | Either fine; JSON matches the draft-2020-12 JSON-Schema style Phase 1 standardized on (`provenance/schema/*.json`). Whichever is chosen, keep it single-source |
| Generated alias map deleted by expiry constant | Env-var kill switch for aliases | A switch is a second vocabulary forever; version-gated deletion with a removal test is what BRND-06's "rejected afterwards" demands |

**Installation:**
```bash
bun add -d @ast-grep/cli@0.51.0   # or the already-present global sg 0.51.0; pin via devDependency for CI reproducibility
winget install Casey.Just          # same prerequisite pattern as 01-01 Task 3
```

**Version verification (run this session):** `npm view @ast-grep/cli version` → `0.51.0` (published 2026-10-15); `sg --version` → `ast-grep 0.51.0` locally; bun 1.4.2 local vs pin 1.4.4; rg 15.1.0; git 2.55.0.windows.3 [VERIFIED: live probes, this session].

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| @ast-grep/cli | npm | current version published 2026-10-15 (seam reason: "too-new") | 1,052,135/wk | github.com/ast-grep/ast-grep | [SUS] | Flagged — planner must add checkpoint:human-verify before install |

Seam output verdict `SUS` with reasons `["too-new"]`; signals: `exists: true`, `deprecated: false`, `postinstall: "node postinstall.js"`, repo `git+https://github.com/ast-grep/ast-grep.git` [VERIFIED: gsd-tools package-legitimacy check, this session]. Context: ast-grep is the STACK-designated tool [VERIFIED: AGENTS.md:51,237], the `@ast-grep/cli-win32-x64-msvc` optional dep was verified in STACK, and ~1.05M weekly downloads with a real repo are strong legitimacy signals despite the seam's age heuristic. Per protocol it stays tagged: `` `@ast-grep/cli` [WARNING: flagged as suspicious — verify before using.] `` and the planner inserts a `checkpoint:human-verify` task before the install step.

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `@ast-grep/cli` (checkpoint-gated install).

## Architecture Patterns

### System Architecture Diagram

```
brand.json ──────────────► tools/brand/gen.ts ──► brand.gen.{ts,rs,py}  (runtime constants)
    │                          │                    legacyEnv.{ts,py}    (read-old tables)
    │                          └──► tools/rebrand/rename.yml (ordered rules: from/to/kind/scope)
    │                                         │
contracts/rpc-wire.json ─► tools/contract/gen.ts ──► generated wire codecs (TS/Rust/Python)
    │        │                                   └──► ALIAS map (legacy name → halo name)
    │        └── contractHash = sha256(canonical bytes) ──► embedded in BOTH processes
    ▼
tools/rebrand/apply.ts ── 1. load provenance/rebrand-denylist.json (path filter FIRST)
                          2. case-collision precheck on all path rules
                          3. ast-grep rewrites (identifier/string)   ── vendor/** code
                          4. structured mutators (package.json, Cargo.toml, pyproject.toml, *.json, win metadata)
                          5. git mv path renames (two-step case-safe) ── vendor/** paths
                          6. record applied rules → vendor/<tree>/provenance/RENAMES.json
                          7. refresh renames_sha256 + restage MANIFEST.vendored.tsv (cli.ts manifest)
                          8. provenance replay (shared rewrite engine) must reconstruct the tree → green
daemon/CLI/Desktop ── resolve_home(): HALO_HOME → migrated marker → legacy HERMES_* / ~/.omp → default
Python adapter ◄──► TS/Rust core  (halo --mode rpc):  ready{contractHash} → negotiate_protocol{contractHash}
                          mismatch ⇒ typed contract_mismatch, both sides exit, actionable error
CI: just verify (Phase 1 gates) + brand-gen --check + deny-gate + migration fixture tests
```

### Recommended Project Structure
```
brand.json                     # single brand source (repo root, next to package.json)
contracts/
├── rpc-wire.json              # single wire source (commands, frames, alias window, hash)
└── schema/rpc-wire.schema.json
tools/
├── brand/ (gen.ts, test/)     # brand.json → all per-language outputs + rename.yml
└── rebrand/ (apply.ts, inventory.ts, deny-gate.ts, rename.yml, test/, fixtures/)
runtime/shared_contracts/      # generated wire modules land here (ARCHITECTURE.md:765)
tools/provenance/ (replay.ts EXTENDED to apply content renames)
tests/rebrand/                 # migration fixtures, wire refusal tests, deny-gate self-tests
provenance/rebrand-denylist.json   # Phase 1 contract — consumed, not replaced
```

### Pattern 1: `brand.json` single source with byte-stable generators
**What:** One JSON manifest defines the full static vocabulary; a deterministic generator emits per-language constant modules, the legacy-env tables, the deny token config, and `tools/rebrand/rename.yml`. Committed generated files; CI re-runs the generator and fails on any diff (`git diff --exit-code`), the same "commit generated + drift gate" convention OMP itself uses for `rules.json`/`models.json` [CITED: github.com/can1357/oh-my-pi/blob/main/AGENTS.md (Generated Files)].
**When to use:** every static brand identifier (BRND-02). Anything not expressible this way is a bug in the manifest, not an excuse for a literal.
**Proposed shape (fields are the design contract; values are the recommendation):**
```jsonc
{
  "schema": "halo/brand/v1",
  "product": { "name": "HALO", "cli": "halo", "display": "Halo" },
  "npm":     { "scope": "@halo", "packages": { "core": "halo-core" } },
  "python":  { "dist_prefix": "halo_", "module": "halo_agent", "entry_group": "halo_agent.plugins" },
  "rust":    { "crate_prefix": "halo_" },
  "home":    { "env": "HALO_HOME", "windows": "%LOCALAPPDATA%\\HALO", "posix": "~/.halo",
               "legacy": ["HERMES_HOME", "%LOCALAPPDATA%\\hermes", "~/.hermes", "~/.omp"] },
  "env":     { "prefix": "HALO_", "legacy_prefixes": ["HERMES_", "HINDSIGHT_API_", "PI_", "OMP_"] },
  "db":      { "schema": "halo", "legacy_schema": "public" },
  "wire":    { "prefix": "halo", "contract": "contracts/rpc-wire.json" },
  "tokens":  { "deny": ["oh-my-pi", "pi-natives", "pi_", "omp", "hermes", "hindsight", "vectorize", "gsd-omp"] }
}
```
`legacy_prefixes` is exactly the set PITFALLS P-03 inventories: `HERMES_HOME`, `HERMES_KANBAN_*` injected vars, `PI_NO_TITLE`/`PI_NO_PTY` ("note the `PI_` prefix, inherited from OMP's upstream `pi`, *not* `OMP_`"), ~200 `HINDSIGHT_API_*` [VERIFIED: .planning/research/PITFALLS.md:126-138]. Hermes docs confirm the home default verbatim: "Defaults to `~/.hermes` on POSIX and `%LOCALAPPDATA%\hermes` on Windows" [CITED: hermes-agent.nousresearch.com/docs/reference/environment-variables]. Env *tables* are generated as `new = f(legacy)` transforms (prefix swap) + an explicit exception list — 200 Hindsight names are never handwritten.

### Pattern 2: The apply pipeline wired INTO the provenance ledger
**What:** STACK's five stages (inventory → rename.yml → ast-grep → `git mv` → structured files → gate) [VERIFIED: AGENTS.md:231-240], plus the step Phase 1 leaves for Phase 2: land the result inside the ledger.
**Why the extra step is mandatory, from Phase 1's own gates:**
- `RENAMES.json` is waiting for Phase 2 verbatim: `"generated_from": "brand.json", "phase_populated": 2, "rules": []` with rule id pattern `^R-[A-Z0-9]+-[0-9]{4}$` and `kind ∈ {identifier, string, path, env, pkg, schema}`, `applied_by: "tools/rebrand/rename.yml#R-OMP-0001"` [VERIFIED: .planning/phases/01-import-provenance-ledger/01-RESEARCH.md:382-403; 01-03-PLAN.md:96,120].
- `renames_sha256` is recorded in `UPSTREAM.json` and both `replay` and `verify` recompute it — "a `RENAMES.json` edited without refreshing `renames_sha256`" prints `TAMPERED` [VERIFIED: .planning/phases/01-import-provenance-ledger/01-08-PLAN.md:28].
- Replay currently applies "every `RENAMES.json` rule with `kind: \"path\"` in rule-id byte order (an empty map is the identity)" [VERIFIED: .planning/phases/01-import-provenance-ledger/01-01-PLAN.md:130].
**Design (recommended over patches):** the rebrand is *never* expressed as `patches/series` (thousands of unreadable patch files, and the CVE-drill runbook depends on patches meaning HALO logic edits). Instead: content rules live in `RENAMES.json`; `replay.ts` is extended with a deterministic **content-rename pass** that applies non-path rules in rule-id byte order using the *same rewrite engine* `apply.ts` uses (one module, two callers — mirroring Phase 1's "manifest writer lives only in manifest.ts" rule). Flow: pristine upstream tree → patches → **content renames** → path renames → compare against `MANIFEST.vendored.tsv` (restaged once via `cli.ts manifest --tree`). Verify's unrecorded-edit detector then stays honest: any vendored byte change *not* explainable by the recorded rule set still fails. This is an explicit Wave task: "extend replay/verify for content renames; re-green all four trees."
**Watch out:** `shouldRewrite()` from Phase 1's `license.ts` is the shared path predicate (`vendor/hermes-agent/LICENSE` false, `vendor/oh-my-pi/docs/rpc.md` true, `THIRD-PARTY-NOTICES.txt` false despite the underscore spelling) [VERIFIED: .planning/phases/01-import-provenance-ledger/01-05-PLAN.md:123]. The rewriter MUST import it, not re-implement it — 01-05's sensitivity test already proves an unfiltered rewrite changes license hashes.

### Pattern 3: Generated wire contract + hash-checked handshake + expiring alias window
**What:** `contracts/rpc-wire.json` enumerates: protocol owner/version, every command (upstream literal → HALO name), every outbound/inbound frame category, event-filter vocabulary, transport limits, and `alias_expires_minor`. Canonicalization = sorted-key, fixed-separator JSON; `contractHash = sha256(canonical bytes)` is embedded in every generated artifact and both processes. Generators emit: TS literal unions for `rpc-types.ts` consumers, Rust constants, Python constants, the alias map, and the event-filter defaults.
**Naming scheme (recommended):** keep upstream *suffixes*, add the brand namespace: `get_state → halo.get_state`, `agent_end → halo.agent_end`. The upstream protocol is JSONL snake_case with 1 MiB frame caps, `ready`/`negotiate_protocol` version negotiation, and `rpc_chunk` v2 reassembly [CITED: github.com/can1357/oh-my-pi/blob/main/docs/rpc.md]; keeping suffixes makes the alias map trivial (`legacy → prefix+legacy`), keeps `set_event_filter` vocabularies mechanically derivable, and preserves every behavioral doc the adapter was designed against, while still satisfying BRND-04 ("carry HALO names, generated from one contract file"). Full per-name redesign is an open question for the planner (Q2), not a research blocker.
**Handshake (BRND-05):**
```jsonc
// HALO core → stdout, first frame (extends upstream ready shape):
{ "type": "halo.ready", "protocolVersion": 2, "supportedProtocolVersions": [2],
  "contractHash": "<sha256>", "contractVersion": "2.0.0",
  "maxFrameBytes": 1048576, "maxReassembledFrameBytes": 67108864 }
// adapter → stdin, before any command:
{ "id": "protocol-1", "type": "halo.negotiate_protocol", "protocolVersion": 2, "contractHash": "<sha256>" }
```
Rules: adapter sends nothing until `halo.ready` validates; core exits with the typed error if the client hash differs or the field is absent. **An absent field is itself a mismatch** — "a stale binary on PATH answering an old schema" (P-03/C-2's named failure) is refused, not negotiated. Error spec (both directions, same shape): `code: "contract_mismatch"`, fields `expected`, `got`, `core_version`, `adapter_version`, `action: "rebuild or replace the coding core; do not mix HALO majors"`; written to stderr + the structured log, never to the frame stream mid-session. Upstream today has no hash concept — the ready frame advertises only `protocolVersion`/`supportedProtocolVersions`/`maxFrameBytes`/`maxReassembledFrameBytes` [CITED: docs/rpc.md, Startup/Transport] — so this is a HALO-local wire patch carried as a patch in `patches/series` (a HALO edit, i.e. exactly what patches are for) *on top of* the generated names.
**Alias window (BRND-06):** generated alias map resolves legacy command/frame names on both sides for one minor: hit → route to new name + one deprecation log line per name per process (`deprecated rpc name 'get_state'; use 'halo.get_state'; support ends at minor N+1`). Removal is a mechanical release step: when current minor ≥ `alias_expires_minor`, regenerate with `include_aliases: false`; two tests pin the behavior — (a) during window: legacy call succeeds + warns; (b) after window (fixture override of the version constant): legacy call fails `unknown command` with an error that *names the old alias support window*. gsd-omp extensions may "call by name" (STACK Migration shims row) — the retained `get_available_commands`/`available_commands_update` surface must report HALO names so extension authors see only the new vocabulary.

### Pattern 4: Read-old/write-new migration with copy-verify and a refusal on ambiguity
**What (BRND-03):** one resolver per language, P-03's order: `HALO_HOME` → HALO home exists+non-empty → use it → `.migrated-from` marker present → follow marker → legacy home(s) → default. Migration runs at daemon/CLI startup before `whenReady()`-equivalents:
1. Source(s): Hermes home (`HERMES_HOME` override, else `%LOCALAPPDATA%\hermes` / `~/.hermes`), OMP home (`~/.omp`, incl. `.omp` project dirs and `~/.omp/agent` — gsd-omp projections live there [CITED: github.com/tchivs/gsd-omp README ("PI_CODING_AGENT_DIR is honored. Without it, files are installed under ~/.omp/agent")]).
2. **Both-present rule:** non-empty HALO home + non-empty legacy home + no marker ⇒ **refuse** with actionable error (`halo migrate --from <path>` for explicit merge intent). Merging two user states silently is unrecoverable (P-03).
3. **Copy, never move**; per-file SHA-256 verify; secrets (`.env`, secret store files) copy with the tree — hash-verified, contents never logged; destination inherits the `%LOCALAPPDATA%\HALO` ACLs (STACK: Electron roaming userData is the wrong home anyway).
4. Rewrite known keys inside copied files (config.yaml plugin lists → Pattern 5; `config.yml` project/global settings precedence keys; log-path constants resolve from generated brand values, not copied text — never rewrite *log bodies*, only *config*).
5. Write `.migrated-from`: `{ "source": "<legacy path>", "source_files_sha256": {...}, "migrated_at": "...", "halo_version": "...", "partial": false }`. Marker is the idempotency key; second launch must be a byte-no-op (mirror Phase 1's `LEDGER OK unchanged` style).
6. **Never touch PostgreSQL data dirs across brands** — detect an old cluster and refuse with instructions (STACK shim table: "A half-copied `pgdata` is unrecoverable").
7. Legacy env: `legacyEnv.ts`/`.py` (generated) — a legacy var is read only when its `HALO_*` twin is unset; one deprecation line per var per process; new code writes only `HALO_*`; the table lives in code, never in prose (STACK shim table [VERIFIED: AGENTS.md:246]). Kanban dispatcher must *inject* `HALO_KANBAN_DB` etc. (Hermes injects `HERMES_KANBAN_DB` "so workers physically cannot see tasks on other boards" [CITED: hermes docs env reference] — the injection names are brand literals from generated constants, and worker-side legacy read is the same table).

### Pattern 5: Plugin identity survival (BRND-08)
**What the real surface is** (Hermes official docs [CITED: hermes-agent.nousresearch.com/docs/user-guide/features/plugins]): plugin id = directory name / `plugin.yaml: name`; gate = `plugins.enabled` allow-list in `~/.hermes/config.yaml` ("General plugins and user-installed backends are disabled by default"; `plugins.disabled` "always wins if a name appears in both"); pip distribution via `[project.entry-points."hermes_agent.plugins"]`; discovery sources: bundled `<repo>/plugins/`, user `~/.hermes/plugins/`, entry points. **The allow-list is not the only id reference:** memory provider `memory.provider:`, context engine `context.engine:`, backends `<category>.provider:` (e.g. `image_gen.provider: openai`), and `gateway.platforms.<name>.enabled` all key on plugin/provider names — and bundled platform/backend/memory/context/model-provider kinds *bypass* the allow-list (auto-load/selection keys). A migration that only rewrites `plugins.enabled` silently mis-selects every bypassing kind.
**Design:**
- Migration rewrites ALL id-bearing keys: `plugins.enabled`, `plugins.disabled`, `memory.provider`, `context.engine`, `image_gen.provider`/other `<category>.provider`, `gateway.platforms.<name>.enabled`, and user plugin directory names only where the id itself is renamed by rename.yml.
- Loader reads **both entry-point groups** during the alias window (`halo_agent.plugins` then legacy `hermes_agent.plugins`; deprecation warning per legacy hit; both-group unit test with a synthetic distribution).
- **Fail loud, never silent:** after load, assert every id in the post-migration enabled list is either loaded or reported as a visible startup error ("plugin 'X' enabled but not found"); same for provider keys (unknown `memory.provider` after migration = error, not fallback). This is the direct counter to P-03(d) "plugins simply do not load".
- Fixtures per ROADMAP SC#5: fresh install; legacy-only (3 old ids enabled + 1 disabled → after migration 3 load, 1 stays disabled); both-present (refusal); deny-listed plugin (in `plugins.disabled` + `plugins.enabled` both → disabled wins, survives rename).

### Pattern 6: Deny-gate (BRND-07)
**What:** `just deny-gate`, CI-mandatory, two scopes:
1. **HALO-owned code:** token table generated from `brand.json.tokens.deny`, scanned with word-boundary matching per token's case variants — full product names (`hermes`, `hindsight`, `oh-my-pi`, `vectorize`, `gsd-omp`) across all prose/code; short tokens (`pi`, `omp`, `pi_`, `PI_`) restricted to identifier/string contexts via ast-grep string+identifier kinds and env-name patterns — bare "pi" word-scanning produces false positives (`api`, `pip`, `rapid` are handled by boundaries, but "Pi" in prose and vendored math text is not; hence context restriction).
2. **Vendored trees after rebrand:** every string literal matching a deny token outside the allow-list fails. This catches the user-visible half of BRND-01 (help/errors/logs) inside vendor code.
**Allow-list (a reviewed file, per P-03 "The allowlist is a file, reviewed like code"):** `brand.json`, `tools/rebrand/**` (rename.yml fixtures included), `contracts/rpc-wire.json` + generated alias artifacts (they *must* contain upstream names), `legacyEnv.*` shims and the resolver legacy tables (one module per language), `vendor/*/LICENSE*` etc. — **sourced by consuming `provenance/rebrand-denylist.json`, not duplicating it** — `vendor/*/provenance/**` + `provenance/**` (UPSTREAM.json repo URLs, watchlist paths contain `hermes-agent`), generated CLI-reference/docs that legitimately name upstream provenance, and tests explicitly annotated `halo-deny-allow` with a reason. Reuse `denylist-check`'s loud-failure style: an allow-list entry matching nothing is itself an error ("dead guard and blind spot are both loud" [VERIFIED: .planning/phases/01-import-provenance-ledger/01-05-PLAN.md:126]).
**Anti-leak edge:** the gate scans log *format strings* and error-message constructors, not only help text — P-03's warning sign is "log lines contain both brands in one session". Vendored test files asserting old names (pitfall c) are allow-listed only until the same plan updates them — see Pitfall 3.

### Anti-Patterns to Avoid
- **Regex over code or JSON** — STACK stage 5: "parse, mutate, re-serialise. Never regex JSON" [VERIFIED: AGENTS.md:239].
- **A second rewrite matcher** — deny decisions come from `license.ts shouldRewrite()` + the manifest, once.
- **Shim with no expiry** — every alias (wire, env, entry point) has a removal task; "a shim with no expiry is a permanent second vocabulary" [VERIFIED: AGENTS.md:251].
- **Moving user data** — copy-verify only; rollback to pre-HALO builds must stay possible (P-03(b)).
- **Half-renamed wire** — "half-renamed wire names with no version gate" is the one explicitly unacceptable middle state (SUMMARY C-2).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Syntax-aware multi-language rewrite | sed/perl loops | ast-grep 0.51.0 `run -r -U` / rule files | Comments, docs, and coincidental substrings survive syntax-aware matching; sed hit the attribution-prose case P-02/01-RESEARCH P11 describes |
| License/notice skipping during rewrite | heuristic "skip looks-legal" logic | `provenance/rebrand-denylist.json` + `shouldRewrite()` import | 01-05 already proved the fixture catches violations; a second predicate can disagree with the first |
| Provenance re-verification | new drift checker | extend `replay.ts`/`verify.ts` with the shared content-rename pass | Five named drift classes + TAMPERED vocabulary already exist and are CI-gated |
| Entry-point discovery | scanning site-packages dirs | `importlib.metadata.entry_points(group=...)` twice | Duplicate/shadowing distributions handled by stdlib semantics [ASSUMED A7 — verify plugin-loader code shape at import SHA] |
| Exe/installer metadata | post-hoc resource hacking | `bun build --compile` Windows metadata flags; electron-builder `win.*` | "[w]hen compiling a standalone executable on Windows, platform-specific options customize metadata on the generated .exe file" [CITED: bun.sh/docs/bundler/executables — exact flag names to pin vs Bun 1.4.4 at plan time] |
| Case-collision safety on Windows | manual review of renames | precheck + two-step `git mv` + post-apply `git ls-files` case assertion (Pitfall 4) | `core.ignorecase=true` is the verified live state here [VERIFIED: `git config core.ignorecase` → true, this session] |
| Contract hash | runtime structural hashing | sha256 over canonicalized contract bytes, computed identically in all three languages from the same generator output | Canonical-form drift across languages = permanent mismatch |

**Key insight:** every complex part here (provenance digests, deny-list coverage, replay reconstruction) already has a Phase 1 implementation with tests. Phase 2's new code is the two generators, the resolver, and the alias logic; everything else is extending an existing, tested gate.

## Runtime State Inventory

(rename/rebrand phase — all five categories answered explicitly)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | User homes carry the renamed strings as *keys and paths*: `config.yaml` `plugins.enabled/disabled` ids, `memory.provider`/`context.engine`/`<category>.provider` values, `gateway.platforms.<name>.enabled`; session SQLite files under the home (paths inside sidecar DBs may embed home paths — verify at import SHA); Kanban DB + workspaces rooted at `HERMES_KANBAN_HOME`; OMP `~/.omp` session/config files incl. `~/.omp/agent` gsd projections and `.gsd-omp-manifest.json` ownership hashes; plugin *directory names* are the ids on disk; installed distributions register under `hermes_agent.plugins` in site-packages metadata | Data migration (copy-verify + key rewrite, Pattern 4/5) AND code edits (generated constants). Distribution metadata = rebuild/reinstall of the venv, not an edit |
| Live service config | None external — HALO has no SaaS config surface in v1. In-tree exception: gsd-core (an npm dependency of vendored gsd-omp, not itself vendored) ships a runtime registry that "ships `pi`, not `omp`" [CITED: gsd-omp README]; literal runtime values crossing that boundary are NOT rename targets | Boundary-literal allow-list (Open Q3). User shell profiles exporting `HERMES_*`/`PI_*` are covered by the read-only legacy env table |
| OS-registered state | Electron `userData` is derived from the app/product name — "renaming `productName` silently moves the profile" [VERIFIED: AGENTS.md:247; corroborated by Electron docs/issues [CITED: github.com/electron/electron/blob/master/docs/api/app.md]] ⇒ handled by pre-ready migration hook. Named single-instance mutexes/locks with brand strings (code edit). No Windows services, Task Scheduler entries, or registry keys exist yet (installer is Phase 12). Stale old-name `omp`/`hermes` binaries on the user's PATH are *not* touchable — the contract-hash handshake is the structural defense | Code edits + migration hook; document PATH hygiene in runbook |
| Secrets / env vars | Legacy env names (`HERMES_*`, `PI_*`, `HINDSIGHT_API_*`, `OMP_*`) are by-design the read-only alias surface; Hermes `.env` (secret file) lives inside the migrating home — copied, hashed, never logged; secret-store *key names* — whether any embed a brand token is unknown until import (Open Q6); HALO's own CI env names adopt `HALO_*` from day one | Legacy tables generated; migration ACL/log rules; one audit task at import |
| Build artifacts | `bun.lock`/`Cargo.lock`/`uv.lock` regenerate after pkg renames (never text-edit); `node_modules` workspace links and old `@oh-my-pi/*` names persist until `bun install` re-run; Python `*.egg-info`/`dist-info` + console-script shims (`hindsight-api`, `hindsight-all`, `hindsight-admin` [CITED: hindsight .env.example + PITFALLS:138]) rebuild via `uv sync`; stale compiled binaries from prior builds (`omp.exe`) survive on dev machines — only the handshake + docs defend against them; `target/`, electron-builder caches | Rebuild steps as explicit plan tasks after each rename wave |

## Common Pitfalls

### Pitfall 1: The rebrand breaks Phase 1's replay/verify the day it lands
**What goes wrong:** bulk rewrite changes vendored bytes → `verify` reports `MODIFIED`/unrecorded-edit, `replay` can't reconstruct, `renames_sha256` mismatch prints `TAMPERED`; Phase 1's CI job (`just verify`) goes red across all four trees.
**Why:** Phase 1 gates are content-identity gates by design; Phase 2 is the first thing allowed to change content at scale.
**How to avoid:** the ledger-first flow of Pattern 2 — record rules in `RENAMES.json`, refresh `renames_sha256`, restage `MANIFEST.vendored.tsv`, extend replay with the shared content-rename pass, re-green all trees *in the same wave* as the apply step.
**Warning signs:** replay drift lines naming files whose only diff is brand tokens; two rewriters computing different canonical forms.

### Pitfall 2: Split-brain home — Python and TS resolve different roots
**What goes wrong:** one call site still reads `HERMES_HOME`/`~/.omp` while the rest resolves HALO home; plugins load from one tree, sessions write to the other; "nothing errors" (P-03(a)).
**How to avoid:** exactly one `resolve_home()` per language (unit-tested order incl. marker), deny-gate context scan for raw env lookups of legacy prefixes outside the shim module, plus an integration test that starts daemon+CLI and asserts a single home in the structured startup log.
**Warning signs:** two homes both gaining mtime; `halo doctor` printing an upstream path.

### Pitfall 3: Tests keep the old strings green
**What goes wrong:** vendored suites assert `~/.omp/logs/...`, HALO tests assert new names; CI green, product half-renamed (P-03(c)).
**How to avoid:** the rename plan touches vendor test expectations as part of the same ruleset (they're vendored content — covered by RENAMES rules); deny-gate scope 2 covers vendored strings; the migration fixture matrix is the behavioral backstop.
**Warning signs:** deny-gate allow-list growing to accommodate *test* files that still contain old product-name strings.

### Pitfall 4: Case-only renames silently no-op on this machine
**What goes wrong:** `Foo→foo`-style renames (crate `pi-natives`, scoped pkgs, file names) on NTFS with `core.ignorecase=true` (verified live): plain `git mv` treats it as no rename or fails; the repo ends with index/disk case mismatch that only bites on a case-sensitive consumer.
**Why:** "Git doesn't consider a file as renamed if it has changed case" under ignorecase [CITED: adamj.eu/tech/2022-12-09/git-change-case-of-filenames; git-mv man page (git mv -f)].
**How to avoid:** apply.ts runs a case-folded collision precheck over all tracked paths before any path rule; case-only renames use `git mv -f` or two-step via a temp name; post-apply assertion that `git ls-files` case matches disk exactly; `fsutil file setCaseSensitiveInfo <dir> enable` in CI setup as optional reinforcement. Note: STACK's "run on a case-sensitive CI checkout" [VERIFIED: AGENTS.md:238] is not achievable as stated on `windows-latest` — the precheck + assertion pair is the sanctioned substitute (flag to planner as a deliberate deviation, documented).
**Warning signs:** `git status` clean on one machine, phantom renames on another; build works locally, CI import-fidelity check fails.

### Pitfall 5: Allow-list gate drift disables plugins silently
**What goes wrong:** `plugins.enabled` id renamed (or not) while the plugin dir kept its old id (or vice versa) — plugin vanishes with no error; deny-listed plugin re-enabled by a bad rewrite (P-03(d)); bypassing kinds (memory/context/backend/platform selection keys) missed entirely.
**How to avoid:** Pattern 5's full key-set rewrite + dual-group loader + post-load count assertion (enabled-but-not-loaded = startup error).
**Warning signs:** plugin visible in one surface, absent in another after migration.

### Pitfall 6: The handshake becomes advisory
**What goes wrong:** hash logged but session proceeds; a mismatched pair "works" until a frame schema diverges — the exact C-2 desync the version gate exists to prevent.
**How to avoid:** refusal is the only successor of mismatch: no `--force-contract` escape hatch in shipped builds (dev override, if any, behind a build-time flag); absent-hash = mismatch; the error names both versions and the fix.
**Warning signs:** any test that asserts a warning-only path in production mode.

### Pitfall 7: Alias window never dies
**What goes wrong:** deprecation warnings ship forever; two vocabularies become permanent, and the deny-gate can't fire on old names because the alias table hides them.
**How to avoid:** `alias_expires_minor` in the contract file + removal test (unknown-command rejection after window) + a release-runbook task generated with the artifact.

### Pitfall 8: Wire counts asserted against prose, not source
**What goes wrong:** a contract file hardcodes "185 commands / 18 categories" from ROADMAP text; the actual union at the import SHA enumerates differently (docs@main today show 15 numbered outbound categories + 4 inbound [CITED: docs/rpc.md], and the command list is sectioned, not counted), so a "count == 185" test fails on correct data.
**How to avoid:** the contract's CI invariant is *"the contract covers exactly the union of `RpcCommand` types and frame-type literals in rpc-types.ts at the recorded SHA, and every contract entry is dispatched"* — derived equality, with the roadmap counts recorded as provenance notes.
**Warning signs:** first CI run of the coverage test failing before any rename shipped.

### Pitfall 9: Renaming crosses the gsd-core dependency boundary
**What goes wrong:** rewriter rewrites `GSD_RUNTIME=omp` / runtime-tier keys inside vendored gsd-omp; gsd-core (npm dep, not vendored) no longer recognizes the runtime; the GSD surface breaks while every local test passes.
**How to avoid:** boundary-literal allow-list for strings that leave the vendored subtree into non-vendored code; per-subtree scope globs in rename.yml already make this expressible — this is a *review* step over gsd-omp's rule set specifically [CITED: gsd-omp README (registry ships `pi`; `GSD_RUNTIME=omp`, `GSD_AGENTS_DIR`, `PI_CODING_AGENT_DIR` contracts)].

### Pitfall 10: Secrets ride the copy to the wrong trust domain
**What goes wrong:** migration copies `.env`/secret-store files into a directory with looser inherited ACLs, or a debug migration log dumps env contents; PLAT-06 (redaction audit) later finds what Phase 2 introduced.
**How to avoid:** copy into `%LOCALAPPDATA%\HALO` (non-roaming), verify ACL inheritance is at least as strict, redact values unconditionally in migration logs (names only), and add one deny-gate rule: migration code must not log values of the secret path list.

## Code Examples

### brand.json → generated constants (byte-stable)
```ts
// tools/brand/gen.ts — deterministic: sorted keys, \n endings, no timestamps.
// Outputs: runtime/shared_contracts/brand.gen.ts, crates/halo-brand/src/brand_gen.rs,
//          runtime/shared_contracts/halo_agent/brand_gen.py, tools/rebrand/rename.yml,
//          legacyEnv.gen.ts / legacy_env_gen.py, deny-tokens.gen.json
// CI:  just brand-gen && git diff --exit-code   (drift = fail, Phase-1 manifest-writer discipline)
```
```python
# brand_gen.py (generated — excerpt)
PRODUCT = "HALO"; ENV_PREFIX = "HALO_"; HOME_WINDOWS = "%LOCALAPPDATA%\\HALO"
LEGACY_ENV_PREFIXES = ("HERMES_", "HINDSIGHT_API_", "PI_", "OMP_")   # PITFALLS P-03 inventory
```

### resolve_home (read-old/write-new, one per language)
```python
def resolve_home(env=os.environ) -> Path:            # generated tests for every branch
    if env.get("HALO_HOME"): return expand(env["HALO_HOME"])   # Hermes precedent: "~"/"$VAR" expansion [CITED: hermes env docs]
    new = default_home()                              # %LOCALAPPDATA%\HALO
    if dir_nonempty(new) or (new / ".migrated-from").exists(): return new
    for legacy in legacy_homes(env):                  # HERMES_HOME → %LOCALAPPDATA%\hermes → ~/.hermes → ~/.omp
        if dir_nonempty(legacy):
            migrate_copy_verify(legacy, new)          # copy + sha256 verify + marker; refuses if both present
            return new
    new.mkdir(parents=True); return new               # fresh install
```

### Migration copy-verify marker
```jsonc
// %LOCALAPPDATA%\HALO\.migrated-from   (copy, never move; idempotent; refuses merge)
{ "schema": "halo/migration/v1", "source": "C:\\Users\\jakub\\AppData\\Local\\hermes",
  "source_files_sha256": { "config.yaml": "<hex>", "plugins/hello-world/plugin.yaml": "<hex>" },
  "halo_version": "0.x.y", "migrated_at": "2026-..." }
```

### Wire contract file + handshake refusal
```jsonc
// contracts/rpc-wire.json (excerpt)
{ "schema": "halo/rpc-wire/v1", "contractVersion": "2.0.0", "aliasExpiresMinor": 1,
  "commands": [ { "upstream": "get_state", "name": "halo.get_state",
                  "backend_mode": "retained" },            // Phase 5 keeps get_state/get_available_commands/
  { "upstream": "prompt", "name": "halo.prompt", "backend_mode": "disabled" } /* ...every entry... */ ],
  "frames": [ { "upstream": "agent_end", "name": "halo.agent_end", "direction": "outbound" }, /* ... */ ] }
// canonical hash:  sha256(stableStringify(contract))  — identical bytes from all three generators
```
```python
# adapter side (generated constants only; no handwritten names anywhere)
def handshake(child):
    ready = read_jsonl_line(child.stdout, timeout=10.0)
    if ready.get("type") != FRAME_READY or ready.get("contractHash") != CONTRACT_HASH:
        raise ContractMismatch(expected=CONTRACT_HASH, got=ready.get("contractHash"),
                               action="rebuild or replace the coding core; do not mix HALO majors")
    write_jsonl(child.stdin, NEGOTIATE_PROTOCOL, protocolVersion=2, contractHash=CONTRACT_HASH)
```

### Deny-gate invocation shape
```ps1
just deny-gate
# 1) rg -N --pcre2 "\b(halo_deny)\b" style token pass over HALO-owned text, allowlist file applied
# 2) sg run -k string_literal -l ts/python/rust per token context, vendor scopes minus denylist
# 3) assert every allowlist entry matched >= 1 path (denylist-check's loud rule), else exit 1
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OMP protocol v1: ready frame without hash; oversized responses = lossy error | v2 `negotiate_protocol` + `rpc_chunk` lossless reassembly (base64 segments; client MUST validate chunkId/index/count/byteLength) | upstream protocol v2, documented at docs/rpc.md today | HALO ships v2-only; the contract hash rides the same negotiation — don't re-add v1 lossy paths |
| Env/config vocabulary = `HERMES_*`, `PI_*`, `HINDSIGHT_API_*`, `~/.hermes`/`~/.omp` | single `HALO_*` / `%LOCALAPPDATA%\HALO`, legacy read-only | this phase (frozen at exit) | Every Phase 3+ codec/test is written against the frozen vocabulary — the roadmap ordering rule |
| gsd-omp installs into `~/.omp/agent` keyed on runtime `omp`/`pi` | HALO home + HALO runtime key **only where HALO owns both sides**; gsd-core registry keys stay | — (boundary) | Pitfall 9 |

**Deprecated/outdated:**
- STACK "case-sensitive CI checkout" — not available on `windows-latest`; replaced by precheck + assertion + optional `fsutil` (documented deviation, Pitfall 4).
- PITFALLS P-03 "Keep the RPC wire ABI, rebrand the UX" — superseded by PROJECT Key Decision + SUMMARY C-2 resolution (versioned full rename + hash handshake); do not plan the keep-ABI variant.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | OMP binary is `omp`, home `~/.omp` (Windows `%USERPROFILE%\.omp`), env `PI_*`/`OMP_*` mixed | brand.json, migration | Legacy-home list incomplete → silent config loss for former OMP users; verify at import SHA (Open Q4) |
| A2 | Wire naming scheme `halo.<snake_suffix>` acceptable to all consumers | Pattern 3 | Cosmetic rework if user prefers per-name redesign (Open Q2); contract-file design survives either |
| A3 | Roadmap's 185/18 counts match the union at the import SHA | Pattern 3, Pitfall 8 | Coverage test assertion changes; derived-equality invariant makes this self-correcting |
| A4 | Rebrand-as-RENAMES (not patches) is the sanctioned ledger mechanism | Pattern 2 | Phase 1 gates need a different integration; would surface at first `just verify` — expensive if discovered late |
| A5 | gsd-core registry boundary literals enumerated in Open Q3 are the complete set | Pitfall 9 | GSD surface breaks at runtime after rebrand |
| A6 | Electron `userData` moves with productName; pre-`whenReady()` hook can migrate before any profile write | Pattern 4, RSI | Desktop writes into `%APPDATA%\Electron`/old dir before the hook runs; verify against vendored desktop startup order |
| A7 | Dual entry-point-group reading via `importlib.metadata` covers the Hermes pip-plugin path | Pattern 5 | Bundled-plugin kinds need a different shim (their loaders are per-category, per Hermes docs) |
| A8 | bun compile Windows-metadata flags fully cover exe branding (icon/version/product strings) | Standard Stack | Residual `pi`/`omp` in exe metadata defeats BRND-01 on the file-properties surface; pin flag names against Bun 1.4.4 docs before the packaging task |

## Open Questions

1. **Exact command/frame census at the import SHA.** What we know: docs@main enumerate 15 numbered outbound categories + 4 inbound, command list sectioned (no total); ROADMAP asserts 185/18; watch entry WL-OMP-RPC-WIRE names `rpc-types.ts`/`rpc-frame.ts`/`docs/rpc.md` as sources. What's unclear: the shipped union at the recorded SHA. Recommendation: contract-generation task derives the census from `rpc-types.ts` programmatically; record roadmap counts as notes; fail CI only on contract-vs-source divergence. **Disposition (plans):** derived census — plan 02-02 Task 3 (`census.test.ts` + `--derive`) makes contract-vs-source set equality the CI invariant; roadmap counts are `provenance_notes`, never assertions (Pitfall 8).
2. **Wire naming scheme:** `halo.`-prefixed upstream suffixes (recommended) vs full redesign per name. Planner or discuss-phase decides; contract file supports either; decide before generators land. **Disposition (checkpoint):** plan 02-02 Task 1 `checkpoint:decision` locks the scheme before the contract freeze; `keep-suffix` is the recommended option and the unattended `auto_select` fallback; choosing `redesign` triggers an explicit replan of 02-02 Tasks 2-3.
3. **gsd-core boundary allow-list:** which gsd-omp string literals (`GSD_RUNTIME=omp`, runtime-tier keys, `PI_CODING_AGENT_DIR` handling) must survive rebranding because gsd-core consumes them from npm? Inventory them in the first gsd-omp-scoped task and get user sign-off (security-adjacent: wrong rewrites here fail open on the GSD surface). **Disposition (checkpoint):** plan 02-05 authors `provenance/boundary-literals.json` (per-literal, reason + provenance citation) and gates the rebrand run behind a `blocking-human` sign-off checkpoint; plan 02-05 Task 3 group 2 byte-greps every exemption survives the run.
4. **OMP Windows home default + env prefix split (PI_ vs OMP_):** confirm from `env.ts`/`@oh-my-pi/pi-utils/env` at the import SHA; the legacy-home/prefix tables depend on it. **Disposition (plan 02-05):** the tables ship from PITFALLS P-03 values; plan 02-05 Task 2 re-verifies the OMP Windows home default and the `PI_`/`OMP_` split against the vendored `env.ts` equivalent at the import SHA BEFORE authoring env/home rename rules, and any divergence is corrected in `brand.json` + regenerated before the first apply; the confirmation is a Task 2 acceptance line.
5. **Does Phase 2 compile the Rust tree?** cargo/rustc are missing on this workstation (probe). `cargo check --locked` as the Rust rewrite-verification gate needs a toolchain install step (or defers Rust verification to CI). Planner: choose install-task vs CI-deferral explicitly. **Disposition (checkpoint):** plan 02-09 Task 0 decision — `ci-defer` (the RESEARCH recommendation, `auto_select`) runs `cargo check --workspace` as a `rebrand-rust-check` job on windows-latest; `local-toolchain` installs visibly via winget with an MSVC assert-or-halt; `just rebrand-rust` exists in both options and exits 1 without a recorded decision (never a silent skip).
6. **Secret-store key names:** does the Hermes secret store key anything by a brand token? If yes, keys migrate too (copy-verify names, not just files). One audit task at import. **Disposition (plan 02-06):** the key-name audit runs INSIDE migration (plan 02-06 Task 2); both branches (keys migrated with byte-identical values / `MIGRATE SKIP no-store-keys`) are fixture-tested and the outcome is recorded in 02-06-SUMMARY either way.
7. **Hindsight schema rename depth:** `HINDSIGHT_API_DATABASE_SCHEMA=public` default confirmed [VERIFIED: raw.githubusercontent.com/vectorize-io/hindsight/main/.env.example:310 — "HINDSIGHT_API_DATABASE_SCHEMA=public # PostgreSQL schema name (default: public)"], and per-connection setup re-applies "the vchord search path" on pool acquire (:313). HALO ships no legacy clusters, so `halo` schema is *new-install vocabulary* — decide now whether Hindsight is patched to default `halo` (rewrite of the env default) or HALO always sets the env explicitly (safer: generated default in supervisor env; no alembic-schema rename machinery needed in Phase 2). **Disposition (plans):** the safer branch — `halo` flows as new-install vocabulary through the generated env default (plan 02-01 tables, plan 02-06 kanban/schema defaults); zero Phase 2 rename rules touch Hindsight's alembic machinery, and plan 02-07 records a flagged follow-up rule set if verification later finds schema names embedded in vendored SQL.
8. **Alias-window "one minor" anchor with no releases yet:** define `aliasExpiresMinor` relative to the first shipped minor (recommended) rather than a calendar rule, so the removal test is deterministic. **Disposition (plan 02-02):** anchored relative to the first shipped minor, recorded in the contract's `alias_window_anchor` field (planned `0` = expires at first-shipped-minor + 1); the removal test overrides the version constant deterministically.

## Environment Availability

Probed live on this workstation, 2026-10-23 [VERIFIED: probe]:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | generators, tests, CLI compile | ✓ (older) | 1.4.2 (pin 1.4.4) | Upgrade via winget before Phase 2 Wave 1; 1.4.2 works for generators |
| ast-grep | rewrite + deny-gate | ✓ | 0.51.0 (exact pin) | — |
| ripgrep | inventory + deny-gate | ✓ | 15.1.0 | — |
| git | manifest path renames, ledger ops | ✓ | 2.55.0; `core.ignorecase=true`, system `core.autocrlf=true` (both as Phase 1 research predicted) | — |
| just | recipes | ✗ | — | winget `Casey.Just` (same prerequisite pattern as 01-01 Task 3) |
| cargo/rustc | Rust rewrite verification | ✗ | — | rustup install, or defer `cargo check` to CI (Open Q5) |
| uv | venv rebuild after pkg renames | ✓ (older) | 0.12.17 (pin 0.13.5) | upgrade |
| Python (system) | tooling only | ✓ | 3.13.15 (product ships PBS 3.14.9) | uv-managed interpreter per STACK |
| pwsh | just shell per STACK `[windows] set shell` | ✓ | 7.6.7 | — |
| Node | tooling only | ✓ | 22.23.2 | — |

**Missing with fallback:** just (winget install task), cargo (install or CI-defer decision).
**Blocking:** none — but Phase 2 as a whole is blocked on Phase 1 landing `vendor/*` (see header).

## Validation Architecture

`workflow.nyquist_validation: true` [VERIFIED: .planning/config.json:24].

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `bun test` (Phase 1-established harness: `tools/provenance/test`, `tests/provenance`) [VERIFIED: 01-01/01-05/01-08 plan verify blocks]; `uv run pytest` for the vendored-Python-side plugin tests |
| Config file | none — commands pin paths (per Phase 1 convention) |
| Quick run command | `bun test tests/rebrand tools/brand/test tools/rebrand/test` |
| Full suite command | `just verify && just rebrand-verify` (chains deny-gate, brand-gen --check, wire contract tests, migration fixtures) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---|---|
| BRND-01 | `halo --help`/errors/logs contain no deny tokens | smoke (spawn compiled exe in temp home) | `bun test tests/rebrand/cli-surface.test.ts -x` | ❌ Wave 0 |
| BRND-02 | regenerating from brand.json yields zero diff; grep for handwritten brand literals outside allow-list empty | unit | `bun test tools/brand/test/gen.test.ts -x` + `just brand-gen` + `git diff --exit-code` | ❌ Wave 0 |
| BRND-03 | 4 fixtures: fresh / legacy-only / both-present(refuse) / deny-listed; byte-equality after copy; marker JSON; second launch no-op | integration | `bun test tests/rebrand/migration.test.ts -x` | ❌ Wave 0 |
| BRND-04 | contract covers union of source literals at SHA; generated modules expose same names in TS/Rust/Py; event-filter vocab generated | unit + source-census | `bun test tools/contract/test/census.test.ts -x` | ❌ Wave 0 |
| BRND-05 | mismatched pair refuses with `contract_mismatch`, absent-hash refuses, matched pair proceeds | integration (spawn core) | `bun test tests/rebrand/handshake.test.ts -x` | ❌ Wave 0 |
| BRND-06 | in-window: legacy name works + warns once per process; out-of-window fixture: `unknown command` naming the alias window | unit + fixture version override | `bun test tests/rebrand/alias-window.test.ts -x` | ❌ Wave 0 |
| BRND-07 | deny-gate fails on planted token (sensitivity), passes on clean tree, dead-allowlist-entry is loud | integration | `bun test tests/rebrand/deny-gate.test.ts -x` (mirrors 01-05's sensitivity-proving pattern) | ❌ Wave 0 |
| BRND-08 | 3 old ids enabled + 1 disabled survive migration and all load/stay-disabled; dual entry-point groups; enabled-but-missing = startup error | integration (pytest via uv) | `uv run pytest tests/rebrand/plugin_survival_test.py -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test tests/rebrand tools/brand/test tools/rebrand/test`
- **Per wave merge:** `just verify && just rebrand-verify` (Phase 1 gates stay green every wave)
- **Phase gate:** full suite green + replay green on all four rebranded trees before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/rebrand/` suites above (all ❌ — this phase creates them)
- [ ] `tests/rebrand/fixtures/profiles/` — the four migration fixture homes (seed with the minimal file sets read from the vendored trees at import)
- [ ] `contracts/schema/rpc-wire.schema.json` — draft 2020-12, matching Phase 1 schema style
- [ ] just recipes + winget `Casey.Just` prerequisite task (copy 01-01 Task 3's pattern)

## Security Domain

`workflow.security_enforcement: true`, ASVS L1, block-on high [VERIFIED: .planning/config.json:48-50].

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (v1 single-user local) | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | Plugin allow-list semantics preserved: migration never adds to `enabled`, never removes from `disabled`; enabled-but-missing = fail-closed error (deny by default survives the rename) |
| V5 Input Validation | yes | `brand.json` + `rpc-wire.json` validated against JSON Schema **before** codegen (garbage contract → codegen refuse, not emit); `.migrated-from` and legacy-home discovery inputs validated (no `..`/absolute-injection through a hostile legacy tree); contract file schema mirrors Phase 1 `provenance/schema/*` style |
| V6 Cryptography | yes (integrity only) | SHA-256 via `node:crypto`/`hashlib` stdlib for contract hash + copy-verify; explicitly *not* an authentication mechanism — document in the handshake code docstring so nobody builds trust on the hash |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Migration copies secrets into looser ACL / logs values | Information Disclosure | Copy only into `%LOCALAPPDATA%\HALO`, verify inherited ACL, names-only logging, deny-gate rule forbidding value-logging in migration modules |
| Hostile legacy home (`config.yaml` with crafted keys/paths) processed by migration | Tampering | Key allow-list rewrite (known keys only, parse-mutate-reserialize, never blind text replace), path-canonicalization before copy |
| Stale old-brand core answers the new adapter (or vice versa) | Tampering / EoP | Contract-hash handshake refusal incl. absent-hash case (Pitfall 6) — the structural fix C-2 identified |
| Deny-gate bypass via homoglyph/case tricks in a "user-visible" string | Spoofing | Case-variant token table; byte-level scan of literals; scan generated output too (generator can leak brand tokens from contract comments) |
| Rebrand rewrites attribution prose | (License breach, non-STRIDE) | Phase 1 denylist consumed by path, license SHA-unchanged test re-run post-apply (01-05 fixture extended to the real rewriter run) |

## Sources

### Primary (HIGH confidence)
- Live reads this session: `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/PROJECT.md`, `AGENTS.md`, `.planning/ROADMAP.md`, `.planning/config.json`, `.planning/research/SUMMARY.md`, `.planning/research/PITFALLS.md`, `01-RESEARCH.md` + `01-01/03/04/05/07/08/09-PLAN.md` (ledger, renames schema, deny-list contract, replay/verify gates)
- Environment probe + `git config` reads (ignorecase/autocrlf), `npm view @ast-grep/cli`, gsd-tools seam (`runtime-identity` v1.18.0, `research-plan`, `classify-confidence`, `package-legitimacy`, `research-store`)
- https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/rpc.md — full protocol: ready/negotiate, frame categories, chunking, limits
- https://raw.githubusercontent.com/can1357/oh-my-pi/main/AGENTS.md — packages `@oh-my-pi/pi-*`, crate `pi-natives`, `~/.omp/logs`, worker selectors, gen-file conventions
- https://raw.githubusercontent.com/vectorize-io/hindsight/main/.env.example — `HINDSIGHT_API_*` namespace, `DATABASE_SCHEMA=public`, session-setup search-path re-apply
- https://hermes-agent.nousresearch.com/docs/reference/environment-variables — `HERMES_HOME` defaults (verbatim), `HERMES_KANBAN_*`, `.env` secret location, UTF-8 shim var
- https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins — allow-list, entry-point group, bypassing kinds, discovery sources
- https://raw.githubusercontent.com/tchivs/gsd-omp/main/README.md — `~/.omp/agent`, `PI_CODING_AGENT_DIR`, gsd-core registry `pi`-not-`omp`, managed-file manifest

### Secondary (MEDIUM confidence)
- https://ast-grep.github.io/reference/cli/run.html — run/rewrite/json-stream/exit-code semantics
- https://bun.sh/docs/bundler/executables — Windows exe-metadata flag family
- adamj.eu case-only rename writeup + git-mv man page — ignorecase behavior and `-f`/two-step
- Electron app docs + issues #8073/#11858 — userData derives from app/product name

### Tertiary (LOW confidence)
- OMP Windows home default; secret-store key-name embedding; exact bun flag names on 1.4.4 (each has an open question / verification task)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pins verified against registry + live probes; one SUS flag handled by protocol.
- Architecture: MEDIUM-HIGH — grounded in Phase 1 contracts (verbatim) and official upstream docs; three structural choices (naming scheme, ledger mechanism, gsd boundary) flagged for planner/user.
- Pitfalls: HIGH — mostly project-authored research cross-checked against upstream primary sources this session.

**Research date:** 2026-10-23
**Valid until:** 2026-11-06 (re-verify @ast-grep/cli version/verdict and upstream docs@SHA sections on drift; refresh everything against the import SHA when Phase 1 lands `vendor/`)
