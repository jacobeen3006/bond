# Roadmap: HALO

## Overview

HALO is assembled, not written from scratch: four MIT codebases are imported once with a provenance ledger, rebranded end to end, and fused behind one Python loop, one adapter, one policy gate, one transcript and one four-lane capacity authority. The order below is dependency-driven rather than value-driven — the most valuable capability (coding tools) is deliberately late because the gate must exist first, and the riskiest layer (bundled CPU memory on Windows) starts as soon as its contracts allow because it gates everything user-visible. Three decisions are irreversible if skipped: provenance at import (Phase 1), the gate before the first coding tool (Phase 4), and structural demotion of the coding core (Phase 5). Memory (Phase 8) is parallelizable with Phases 5–7 once the shared contracts land; everything after it waits for a live memory service and a session authority.

**Ordering rules that must not be violated:**
- Provenance and license material are captured during import; they cannot be reconstructed later.
- The rebrand freezes vocabulary before any contract, codec or test is written against it.
- The policy gate exists before any coding-core tool ships.
- The `halo.tool.invoke` protocol exists before subagents.
- Memory runtime may start in parallel after the loop/gate contracts; lanes need a live memory service before they can be measured.
- No Desktop or CLI surface before the session authority exists.
- Legacy-profile migration shims exist before the first user-installable build.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): planned milestone work
- Decimal phases (2.1, 2.2): urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Import & Provenance Ledger** - Four squashed imports with replayable provenance, verbatim licenses and import-fidelity checks
- [ ] **Phase 2: Rebrand, Wire Contract & Migration** - One generated brand vocabulary across every identifier, including the full RPC wire, frozen before contracts
- [ ] **Phase 3: Unified Loop & Session Authority** - One loop owns every turn; one SQLite store is the only transcript
- [ ] **Phase 4: Tool Registry & Policy Gate** - One registry, one pure gate, deny by default, before any coding tool exists
- [ ] **Phase 5: Coding Core over RPC** - Supervised tool-backend core with handshake, chunking, replay and crash recovery
- [ ] **Phase 6: Code Intelligence, Execution & Rollback** - LSP/DAP/AST/eval/browser/GUI tools plus turn-scoped workspace rollback
- [ ] **Phase 7: Subagent Orchestration** - `task` children are HALO sessions under the same gate, steerable and cost-accounted
- [ ] **Phase 8: Memory Runtime & Bundling** - Native PostgreSQL+pgvector, llama.cpp sidecars and embedded Hindsight without Docker
- [ ] **Phase 9: Four-Lane Scheduling & Lane SLOs** - Reserved-capacity lanes that keep memory from ever queueing ahead of the prompt
- [ ] **Phase 10: Desktop & CLI Product Surface** - Two clients of one daemon, with memory, lanes, approvals and settings
- [ ] **Phase 11: Skills, Plugins, GSD & Kanban** - Additive extension surfaces that stay governed by the gate
- [ ] **Phase 12: Hardening, Packaging & Release** - One-command Windows build, installer, process hygiene, closure proof and reachability audit

## Phase Details

### Phase 1: Import & Provenance Ledger

**Goal**: The four upstream codebases live in one Windows monorepo with an import ledger complete enough that any upstream fix or license obligation can be located and replayed without archaeology.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: IMPT-01, IMPT-02, IMPT-03, IMPT-05, IMPT-06
**Success Criteria** (what must be TRUE):
  1. Each vendored subtree carries `UPSTREAM.json`, `PATHS.json`, `RENAMES.json`, `patches/series` and a watchlist entry, and every HALO-local edit to a vendored file exists as a patch (IMPT-01).
  2. `provenance-replay` reconstructs each imported tree from its recorded SHA plus patches and renames, and the build fails on any drift (IMPT-03).
  3. Each subtree's LICENSE and copyright notices are byte-identical to upstream and cannot be modified by the rebrand tooling (IMPT-02).
  4. A synthetic upstream security fix can be triaged through the watchlist, path map and rename map and landed as a patch without searching the trees by hand (IMPT-05).
  5. Import-fidelity checks prove line endings, LFS-tracked binaries and lockfile bytes match upstream blob-for-blob (IMPT-06).

**Plans:** 9 plans

Plans:
**Wave 1**
- [ ] 01-01-PLAN.md — Walking skeleton: import `gsd-omp` at a pinned SHA, write the ledger, replay it byte-for-byte through one command

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 01-02-PLAN.md — Hermetic fixture plus hostile-path and attribute-fidelity gates that refuse bad input before writing

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 01-03-PLAN.md — Complete the `gsd-omp` ledger; import `hermes-agent` and `hindsight`; schemas and watch entries

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 01-04-PLAN.md — Import `oh-my-pi` with LFS pointers intact and its three workspace roots recorded, not absorbed

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 01-05-PLAN.md — Pin every licence-ish path by raw bytes and ship the rebrand deny-list contract with a sensitivity-proving test
- [ ] 01-07-PLAN.md — `provenance-where`, reverse rename lookup, and the permanent synthetic-CVE triage drill plus runbook
- [ ] 01-08-PLAN.md — Offline `provenance-verify`, unrecorded-edit detector, five named replay drift classes, pre-commit gate

**Wave 6** *(blocked on Wave 5 completion)*
- [ ] 01-06-PLAN.md — LFS inventory verification and lockfile byte/completeness checks across all four trees

**Wave 7** *(blocked on Wave 6 completion)*
- [ ] 01-09-PLAN.md — One-command `just verify`, consolidated CLI, workspace-isolation proof, and the `provenance-replay` CI job

### Phase 2: Rebrand, Wire Contract & Migration

**Goal**: One brand vocabulary — binary name, packages, config home, environment variables, plugin ids, database schema and the entire RPC wire — is generated from a single source and frozen before any HALO contract is written.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: BRND-01, BRND-02, BRND-03, BRND-04, BRND-05, BRND-06, BRND-07, BRND-08
**Success Criteria** (what must be TRUE):
  1. Running the CLI under the HALO name shows no upstream product name in help, errors or logs, and the brand deny-gate fails the build when an upstream token appears in a user-visible string (BRND-01, BRND-07).
  2. Every identifier in every language is generated from `brand.json`; no handwritten brand literal remains outside `vendor/` and license files (BRND-02).
  3. All 185 RPC commands and 18 frame categories carry generated HALO names, and the handshake exchanges a contract hash that refuses a mismatched client/server pair with an actionable error (BRND-04, BRND-05).
  4. Old wire names are accepted for one minor version with a deprecation warning and are rejected afterwards (BRND-06).
  5. An existing Hermes/OMP profile migrates by copy-verify with a `.migrated-from` marker (fresh, legacy-only, both-present and deny-listed-plugin fixtures pass), and plugin allow-lists and entry points survive the rename without silently disabling a plugin (BRND-03, BRND-08).

**Plans**: 9 plans

Plans:
**Wave 1**
- [ ] 02-01-PLAN.md — brand.json + schema + byte-stable generator: TS/Rust/Python constants, legacy-env tables, rename rules, deny tokens, drift gate (tracer)

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 02-02-PLAN.md — Wire naming decision, contracts/rpc-wire.json, cross-language codecs + canonical contract hash, rpc-types.ts census (no hardcoded counts)

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 02-03-PLAN.md — Handshake with contract_mismatch refusal (absent-hash = mismatch, no force flag) + one-minor alias window + core-side patch into the ledger

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 02-04-PLAN.md — [SUS] ast-grep checkpoint + shared rewrite engine, resume-safe apply pipeline, replay content-rename pass

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 02-05-PLAN.md — gsd-core boundary sign-off, rule authoring from inventory, rebrand run on all four trees, post-run whole-repo assertions

**Wave 6** *(blocked on Wave 5 completion)*
- [ ] 02-06-PLAN.md — HALO home resolution, copy-only migration with .migrated-from marker, both-present refusal, secret handling, startup wiring

**Wave 7** *(blocked on Wave 6 completion)*
- [ ] 02-07-PLAN.md — Plugin survival: dual entry-point group + fail-loud loader patches, id-bearing rename rules, four-cell matrix

**Wave 8** *(blocked on Wave 7 completion)*
- [ ] 02-08-PLAN.md — deny-gate (planted-token self-proof, dual allow-list, dead-entry refusal) + rebrand-verify CI chain

**Wave 9** *(blocked on Wave 8 completion)*
- [ ] 02-09-PLAN.md — Rust verification decision (Q5), compiled CLI surface proof, phase-close evidence walk over all five success criteria

### Phase 3: Unified Loop & Session Authority

**Goal**: One agent loop owns every turn and one SQLite transcript is the only history, so every surface built later shares the same conversation.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: LOOP-01, LOOP-02, LOOP-03, LOOP-04, LOOP-05, LOOP-06
**Success Criteria** (what must be TRUE):
  1. A turn runs end to end through the single loop with streaming, steer, queue, interrupt and follow-up, and no alternate loop exists in the process (LOOP-01).
  2. Sessions, transcripts and turns persist in one SQLite store, and a user can resume, list, FTS5-search, branch and export a session (LOOP-02, LOOP-03).
  3. Compaction is loop-owned and single-sourced: automatic and manual compaction produce one transcript lineage and token accounting matches the request actually sent (LOOP-04).
  4. Every context item the model received appears in the visible transcript with a stable identity, and the mirrored-vs-sent hash check passes on a turn larger than 1 MiB (LOOP-05).
  5. A turn is marked complete only on an authoritative terminal signal; outstanding background work keeps it open and a finished turn never reopens (LOOP-06).

**Plans:** 12 plans

Plans:
**Wave 1**
- [ ] 03-01-PLAN.md — Package-root decision, Wave-0 bootstrap, and the one-store WAL tracer with a cross-process reader

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 03-02-PLAN.md — Legacy-store decision, epoch ownership, remote-path and schema-version refusals
- [ ] 03-04-PLAN.md — Turn lifecycle: one terminal predicate, close writer, DB reopen/append guards, quiescence
- [ ] 03-05-PLAN.md — One request builder, HTTP byte recording, per-position mirror hashes, >2 MiB safety

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 03-03-PLAN.md — Durable admission FIFO, killed-child `unknown` recovery, FTS audit and repair

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 03-06-PLAN.md — Redaction at admission and request build, with full-store and full-log canary sweep

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 03-07-PLAN.md — Vendor seam decision, single-loop authority, tool-calling turn loop through `dispatch_batch`, AST/authority/protocol gates

**Wave 6** *(blocked on Wave 5 completion)*
- [ ] 03-08-PLAN.md — Steer, queue, follow-up and interrupt with synthetic results and alternation validation

**Wave 7** *(blocked on Wave 6 completion)*
- [ ] 03-09-PLAN.md — Resume/list/FTS5 search/branch/export/import with the installed `halo-agent sessions` console script

**Wave 8** *(blocked on Wave 7 completion)*
- [ ] 03-10-PLAN.md — Loop-owned compaction: generation rotation, fail-closed checkpoint, provider-truth accounting

**Wave 9** *(blocked on Wave 8 completion)*
- [ ] 03-11-PLAN.md — Twelve-fixture deterministic eval corpus, `just eval`, CI gate and on-demand judge lane

**Wave 10** *(blocked on Wave 9 completion)*
- [ ] 03-12-PLAN.md — Full-gate evidence walk, criterion-to-test map, and end-of-phase human verification record

### Phase 4: Tool Registry & Policy Gate

**Goal**: Every tool decision passes exactly one registry and one pure policy gate before any backend runs, with deny as the default.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: GATE-01, GATE-02, GATE-03, GATE-05, GATE-06, GATE-07
**Success Criteria** (what must be TRUE):
  1. Each registered tool name resolves to exactly one backend; a duplicate name is a startup error and shadowed duplicates are invisible to the model's schema (GATE-01, GATE-05).
  2. Every call is gated before dispatch with deny-by-default: an unknown tool, unknown capability or gate timeout is denied and nothing executes (GATE-02).
  3. The gate can allow, deny or rewrite arguments, and every decision is recorded with a reason and a request hash that the persisted tool row references (GATE-03).
  4. Every registry entry declares capability classes, and a call from a turn context that does not permit those capabilities is denied (GATE-06).
  5. Approval modes (auto-approve, allowlist, YOLO) are per-session policies, and a denied write leaves no side effect on disk (GATE-07).

**Plans:** 8 plans

Plans:
**Wave 1**
- [ ] 04-01-PLAN.md — Seam re-validation, denied-state decision, and the governed-call tracer: registry → gate → dispatch → decision row → tool row, with a denial proven to write nothing

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 04-02-PLAN.md — Formal `tools/backends/` package (marker + `echo_test.py` + import-time purity) + shared `tests/conftest.py` scaffolding (scripted stream, registry fixture, backends, `sandbox_dir`) + package markers
- [ ] 04-03-PLAN.md — Precedence enforcement (duplicate names, owned-name claims, unregistered backends) + winners-only catalog with backend-named descriptions and a byte-pinned snapshot
- [ ] 04-04-PLAN.md — Safety-rule family (deny floor, exact capability-class matching, Windows workspace escape) + GATE-02 end-to-end denial lane + capability matrix, gate purity and 5 ms budget

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 04-05-PLAN.md — Argument rewriting that can only narrow (both hashes recorded, model bytes untouched) + decision-record completeness

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 04-06-PLAN.md — Per-session approval modes (`auto_approve` / `allowlist` / `yolo`) with the deny floor below them, restart survival, and a denied write leaving nothing on disk

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 04-07-PLAN.md — One-door scanner rules + `ungoverned_dispatch` guard-test lane and the decision-join inventory Phase 12's GATE-04 matrix inherits

**Wave 6** *(blocked on Wave 5 completion)*
- [ ] 04-08-PLAN.md — Full-gate evidence run, criterion-to-test and decision-to-code walk, fifteen-row edge-coverage accounting, end-of-phase human verification record

### Phase 5: Coding Core over RPC

**Goal**: The coding core runs as a supervised tool backend, so file, search, shell and LSP capabilities become gated registry tools with crash isolation and replayable frames.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04, CORE-05, CORE-06, CORE-07, CORE-08
**Success Criteria** (what must be TRUE):
  1. HALO spawns the core in tool-backend mode, completes the versioned handshake, and every command that could start or steer a turn is refused as capability-disabled (CORE-01).
  2. File read/write/edit, grep, glob, shell and LSP diagnostics are reachable as registry tools, and each invocation carries a policy decision (CORE-02).
  3. Hashline edits reject stale content anchors before writing with a recoverable error, and cancellation stops running core work in bounded time (CORE-03, CORE-04).
  4. Killing the core mid-call surfaces typed errors in the transcript and restarts it without losing the session or replaying a side-effecting call (CORE-05).
  5. Recorded sessions replay deterministically, oversized frames chunk and reassemble, parallel results pair to call ids in order, and adapter overhead stays under 150 ms per round-trip (CORE-06, CORE-07, CORE-08).

**Plans**: TBD

### Phase 6: Code Intelligence, Execution & Rollback

**Goal**: The model can navigate, edit structurally, execute, browse and drive a desktop through gated tools, and a user can undo a turn's workspace changes.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: CODE-01, CODE-02, CODE-03, CODE-04, CODE-05, CODE-06, LOOP-07
**Success Criteria** (what must be TRUE):
  1. All 14 LSP operations (including rename with workspace edits, code actions, type definition and implementation) and all 28 DAP operations are reachable as gated tools (CODE-01, CODE-02).
  2. `ast_edit`/`ast_grep` preview changes before accept over the bundled tree-sitter grammars (CODE-03).
  3. Eval cells run only under `backend.raw` approval and cannot re-enter the tool registry or reach host-control APIs (CODE-04).
  4. Browser automation, web search/extraction with URL and PDF reading, desktop GUI automation and media/TTS/voice surfaces are reachable through the gate (CODE-05, CODE-06).
  5. A user can roll a turn's workspace changes back from a shadow-git checkpoint and see exactly which files were restored (LOOP-07).

**Plans**: TBD

### Phase 7: Subagent Orchestration

**Goal**: A parent turn can fan out child sessions that are governed by the same gate and can be steered, killed and restored.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: SUB-01, SUB-02, SUB-03, SUB-04
**Success Criteria** (what must be TRUE):
  1. `task` spawns child sessions with configurable isolation and returns typed results to the parent (SUB-01).
  2. Every child tool call carries its own policy decision and inherits the parent's policy — no child executes ungoverned (SUB-02).
  3. A user can steer, kill and restore a child session, and a killed child leaves no orphaned process or bound port (SUB-03).
  4. Concurrency caps and per-child cost accounting appear in the session record (SUB-04).

**Plans**: TBD

### Phase 8: Memory Runtime & Bundling

**Goal**: HALO boots a bundled memory service on Windows with no Docker and no GPU: native PostgreSQL+pgvector, supervised CPU llama.cpp inference sidecars and embedded Hindsight.
**Mode:** mvp
**Depends on**: Phase 4 (shared contracts and provider transport); may run in parallel with Phases 5–7
**Requirements**: MEM-01, MEM-02, MEM-03, MEM-04, MEM-06
**Success Criteria** (what must be TRUE):
  1. First launch initializes the bundled PostgreSQL+pgvector cluster and a vector query returns rows, with no Docker and no developer tools installed (MEM-01).
  2. pgvector is built in Windows CI against the bundled PostgreSQL and published as a SHA-256-verified artifact; a version mismatch fails startup with an actionable message (MEM-02).
  3. Embedder and reranker `llama-server` sidecars start, health-check, restart on failure, and apply hardware-profile flags on ephemeral ports (MEM-03).
  4. Hindsight API and worker run embedded with per-operation LLM configuration, and the degraded-mode fallback is documented as a recorded decision (MEM-04).
  5. Retain is idempotent via `operation_id` with transactional boundaries and a startup repair job, so a cancelled retain never leaves an unretrievable memory (MEM-06).

**Plans**: TBD

### Phase 9: Four-Lane Scheduling & Lane SLOs

**Goal**: Memory traffic can never queue ahead of the user's prompt: four lanes with reserved capacity, revocable leases and measurable SLOs.
**Mode:** mvp
**Depends on**: Phase 8
**Requirements**: SCHD-01, SCHD-02, SCHD-03, SCHD-04, SCHD-07
**Success Criteria** (what must be TRUE):
  1. L0 prompt, L1 recall/reflect, L2 retain and L3 background each hold reserved capacity, and an L0 waiter never queues behind an L3 waiter (SCHD-01).
  2. No consolidation delays an L0 or L1 waiter by more than 200 ms under synthetic memory load (SCHD-02).
  3. L1 meets its 10 s deadline or degrades to a low-budget recall with a visible degraded signal, and one prompt never triggers retries inside the same turn (SCHD-03).
  4. Preemption cancels only at operation boundaries and requeues or retires cancelled work without corrupting memory state (SCHD-04).
  5. A Low-profile soak (concurrent L3 retains plus periodic L0 recalls) demonstrates the lane SLOs under concurrency (SCHD-07).

**Plans**: TBD

### Phase 10: Desktop & CLI Product Surface

**Goal**: Desktop and CLI are two clients of one daemon, and chat, sessions, memory, lanes, approvals and settings are visible and controllable from the product surface.
**Mode:** mvp
**Depends on**: Phase 9
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, MEM-05, MEM-07, MEM-08, SCHD-05, SCHD-06
**Success Criteria** (what must be TRUE):
  1. Desktop provides chat, session list/resume/branch, diff review, terminal, memory page and lanes panel, and a session started in CLI continues in Desktop (and vice versa) without divergence (UI-01, UI-04).
  2. The CLI attaches to the same daemon and session store as Desktop, and an approval round-trips from a running turn to Desktop and back (UI-02, UI-05).
  3. The renderer holds no daemon token and every IPC message is sender-validated; a renderer fetch to the daemon port fails (UI-03).
  4. The memory page browses, searches, prunes and exports memories and shows staleness, conflicts, health and degraded memory; pruning requires typed confirmation and archives rather than deletes (MEM-05, MEM-07, MEM-08).
  5. The Memory Model defaults to the main agent model, the Settings page offers dedicated and per-operation overrides with save-time reachability validation and drain-then-restart on apply, and lane depths, wait histograms, preemptions and backlog are visible (SCHD-05, SCHD-06).

**Plans**: TBD
**UI hint**: yes

### Phase 11: Skills, Plugins, GSD & Kanban

**Goal**: The extension surface is additive and still governed: skills, plugins, Kanban, GSD TDD and the advisor work only through the gate.
**Mode:** mvp
**Depends on**: Phase 10
**Requirements**: EXT-01, EXT-02, EXT-03, EXT-04, EXT-05, EXT-06, EXT-07, EXT-08
**Success Criteria** (what must be TRUE):
  1. Skills install from the Hub and invoke, and the Curator proposes improvements after a successful TDD cycle that appear in the Skills Store for approval (EXT-01, EXT-06).
  2. The Desktop plugin host provides pages, panes, widgets and commands through a scoped backend with no backend handles and deny-only hooks; a plugin that tries to reach a backend fails (EXT-02).
  3. Kanban dispatches tasks with dependencies, heartbeats, reclaim, zombie detection and all 14 kanban tools (EXT-03).
  4. GSD TDD skills are installed as first-class skills in both the Hermes registry and the coding core's skill directory, and the gate blocks RED→GREEN without recorded failing-test evidence while coding-core extensions stay disabled (EXT-04, EXT-05).
  5. The advisor reviews a turn and injects notes without a separate turn, and plan/goal/vibe modes plus prewalk run inside the unified loop (EXT-07, EXT-08).

**Plans**: TBD
**UI hint**: yes

### Phase 12: Hardening, Packaging & Release

**Goal**: The product installs and runs on a clean Windows machine from one build command, with every shipped surface proven governed and no leaked secrets or orphaned processes.
**Mode:** mvp
**Depends on**: Phases 1–11
**Requirements**: GATE-04, IMPT-04, PLAT-01, PLAT-02, PLAT-03, PLAT-04, PLAT-05, PLAT-06, PLAT-07, PLAT-08
**Success Criteria** (what must be TRUE):
  1. A clean Windows machine with no Docker and no developer tools installs and launches HALO from one documented build command, with sidecars shipped outside asar (PLAT-01, PLAT-02).
  2. Every sidecar process tree dies with the app, an orphan reaper cleans up after crashes, and single-instance locking plus a crash-loop breaker prevent duplicate daemons (PLAT-03, PLAT-04).
  3. Paths beyond 260 characters and non-UTF8 child output work without crashing; a redaction audit proves model credentials never reach logs; model provisioning is SHA-256-verified at install and works offline (PLAT-05, PLAT-06, PLAT-07).
  4. A bypass matrix test covers every inventoried entry point (plugin handlers, MCP, host tools, subagents, cron/Kanban workers, eval re-entry, renderer) and fails if any produces a side effect without a policy decision (GATE-04).
  5. `THIRD_PARTY_NOTICES` lists all four subtrees plus all three dependency ecosystems and is reachable from the installer and About, and a reachability audit reconciles every loop-resident capability as ported or explicitly retired (IMPT-04, PLAT-08).

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Import & Provenance Ledger | 0/TBD | Not started | - |
| 2. Rebrand, Wire Contract & Migration | 0/TBD | Not started | - |
| 3. Unified Loop & Session Authority | 0/12 | Not started | - |
| 4. Tool Registry & Policy Gate | 0/7 | Not started | - |
| 5. Coding Core over RPC | 0/TBD | Not started | - |
| 6. Code Intelligence, Execution & Rollback | 0/TBD | Not started | - |
| 7. Subagent Orchestration | 0/TBD | Not started | - |
| 8. Memory Runtime & Bundling | 0/TBD | Not started | - |
| 9. Four-Lane Scheduling & Lane SLOs | 0/TBD | Not started | - |
| 10. Desktop & CLI Product Surface | 0/TBD | Not started | - |
| 11. Skills, Plugins, GSD & Kanban | 0/TBD | Not started | - |
| 12. Hardening, Packaging & Release | 0/TBD | Not started | - |
