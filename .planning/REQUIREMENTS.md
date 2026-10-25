# Requirements: HALO

**Defined:** 2026-10-23
**Core Value:** One non-bypassable tool path — every LLM tool decision reaches exactly one backend through a single adapter and a single policy gate.

## v1 Requirements

### Import & Provenance (IMPT)

- [x] **IMPT-01**: Every vendored subtree carries an `UPSTREAM.json` recording repo URL, commit SHA, import date, and license
- [x] **IMPT-02**: Each vendored subtree retains its upstream LICENSE text and copyright notices verbatim after rebranding
- [x] **IMPT-03**: A `provenance-replay` CI job reproduces each imported tree from its recorded SHA and fails on drift
- [ ] **IMPT-04**: `THIRD_PARTY_NOTICES` lists every vendored subtree and ships in both the installer and the About surface
- [x] **IMPT-05**: A watchlist maps each vendored subsystem to its upstream location, so an upstream security fix can be located and back-ported by hand
- [x] **IMPT-06**: Import fidelity checks cover `.gitattributes` line endings, LFS-tracked binaries, and lockfile bytes

### Rebrand & Migration (BRND)

- [ ] **BRND-01**: User can run the CLI under the HALO binary name and never sees an upstream product name in help, errors, or logs
- [ ] **BRND-02**: A single `brand.json` is the source of truth that generates identifiers for every language in the tree
- [ ] **BRND-03**: Existing Hermes/OMP config directories and environment variables are read-old/write-new, with copy-verify migration and a `.migrated-from` marker
- [ ] **BRND-04**: All 185 RPC commands and 18 frame categories carry HALO names, generated from one contract file
- [ ] **BRND-05**: Protocol handshake exchanges a contract hash; a mismatched client and server refuse to run with an actionable error
- [ ] **BRND-06**: Old wire names are accepted for one minor version with a deprecation warning, then rejected
- [ ] **BRND-07**: A deny-gate fails the build when an upstream brand token appears in a user-visible string
- [ ] **BRND-08**: Plugin allow-lists and entry points survive identifier renames — renaming a plugin id never silently disables a plugin

### Unified Loop & Session (LOOP)

- [ ] **LOOP-01**: One agent loop owns every turn: streaming, steer, queue modes, interrupt, and follow-up
- [ ] **LOOP-02**: One SQLite store holds sessions, transcripts, and turns; CLI and Desktop read the same store
- [ ] **LOOP-03**: User can resume, list, search (FTS5), branch, and export sessions
- [ ] **LOOP-04**: Compaction (automatic and manual) is loop-owned and single-sourced; token accounting matches what was sent
- [ ] **LOOP-05**: The transcript shows every context item the model received — injected context is never invisible
- [ ] **LOOP-06**: A turn is complete only when the terminal signal is authoritative; background work never silently reopens a finished turn
- [ ] **LOOP-07**: User can roll back a turn's workspace changes from a shadow-git checkpoint

### Tool Registry & Policy Gate (GATE)

- [ ] **GATE-01**: One registry resolves each tool name to exactly one backend
- [ ] **GATE-02**: Every tool call passes the policy gate before execution; deny is the default
- [ ] **GATE-03**: The gate can allow, deny, or rewrite arguments, and every decision is recorded with a reason
- [ ] **GATE-04**: A bypass matrix test covers every inventoried path (plugin handlers, MCP, host tools, subagents, cron/Kanban workers, eval re-entry) and fails if any executes ungoverned
- [ ] **GATE-05**: Tool descriptions disambiguate the active backend, and shadowed duplicate tools are not visible to the model
- [ ] **GATE-06**: Every registry entry declares capability classes restricting which turn contexts may call it
- [ ] **GATE-07**: Approval modes (auto-approve, allowlist, YOLO) are gate policies applied per session, not per tool implementation

### Coding Core over RPC (CORE)

- [ ] **CORE-01**: HALO spawns the coding core as a child process and completes a versioned handshake before first use
- [ ] **CORE-02**: File read/write/edit, grep, glob, shell, and LSP diagnostics are reachable as registry tools
- [ ] **CORE-03**: Hashline edit rejects stale content anchors before writing, with a recoverable error
- [ ] **CORE-04**: Cancellation propagates into running core work; abort stops it in bounded time
- [ ] **CORE-05**: A core crash is detected, surfaced in the transcript, and restarted without losing the session
- [ ] **CORE-06**: A frame recorder and replay suite reproduce a recorded session deterministically
- [ ] **CORE-07**: Oversized frames are chunked and reassembled, and parallel tool results are matched to their call ids in order
- [ ] **CORE-08**: Adapter-added overhead stays under 150ms per tool round-trip

### Code Intelligence & Execution (CODE)

- [ ] **CODE-01**: All 14 LSP operations are reachable, including rename with workspace edits, code actions, type definition, and implementation
- [ ] **CODE-02**: All 28 DAP operations are reachable, including breakpoints, stepping, memory inspection, and disassembly
- [ ] **CODE-03**: `ast_edit`/`ast_grep` offer preview-then-accept over the bundled tree-sitter grammars
- [ ] **CODE-04**: Eval cells route every re-entrant tool call back through the registry and gate, and host-control APIs are unavailable inside eval
- [ ] **CODE-05**: Browser automation and web search/extraction are reachable, including URL and PDF reading
- [ ] **CODE-06**: Desktop GUI automation (11 tools) plus media/TTS/voice surfaces are reachable

### Subagents (SUB)

- [ ] **SUB-01**: `task` spawns child sessions with configurable isolation
- [ ] **SUB-02**: Child-session tool calls are governed by the same gate and inherited parent policy
- [ ] **SUB-03**: User can steer, kill, and restore a child session, and receives typed results
- [ ] **SUB-04**: Concurrency caps and per-child cost accounting appear in the session record

### Memory Runtime (MEM)

- [ ] **MEM-01**: First launch initializes a bundled PostgreSQL+pgvector cluster without Docker
- [ ] **MEM-02**: pgvector is compiled for Windows in CI and published as a SHA-256-verified artifact
- [ ] **MEM-03**: CPU llama.cpp `llama-server` embedder and reranker sidecars start, health-check, and restart per hardware profile
- [ ] **MEM-04**: Hindsight API and worker run embedded with per-operation LLM configuration
- [ ] **MEM-05**: Memory availability never blocks the first chat turn; degraded mode is visible in the UI
- [ ] **MEM-06**: Retain is idempotent via `operation_id` with transactional boundaries and a startup repair job
- [ ] **MEM-07**: User can browse, search, prune, and export memories, and see staleness, conflicts, and health in one Desktop page
- [ ] **MEM-08**: Memories are invalidated or archived, never auto-deleted, and pruning requires explicit typed confirmation

### Scheduling & Memory Model (SCHD)

- [ ] **SCHD-01**: Four lanes (L0 prompt, L1 recall/reflect, L2 retain, L3 background) each hold reserved capacity
- [ ] **SCHD-02**: No consolidation can delay an L0 or L1 waiter by more than 200ms
- [ ] **SCHD-03**: L1 meets its 10s deadline or degrades to a low-budget recall with a visible degraded signal
- [ ] **SCHD-04**: Preemption cancels only at operation boundaries and safely requeues or retires cancelled work
- [ ] **SCHD-05**: Memory Model defaults to the main agent model, with a Settings page offering dedicated and per-operation overrides, reachability validation on save, and drain-then-restart on apply
- [ ] **SCHD-06**: Lane depths, wait histograms, preemptions, and backlog are visible in the UI
- [ ] **SCHD-07**: A soak test on the Low hardware profile demonstrates the lane SLOs under concurrency

### Surfaces (UI)

- [ ] **UI-01**: Desktop app provides chat, session list/resume/branch, diff review, terminal, memory page, and lanes panel
- [ ] **UI-02**: CLI attaches to the same daemon and session store as Desktop
- [ ] **UI-03**: The Electron renderer holds no daemon token, and every IPC message is sender-validated
- [ ] **UI-04**: A session started in CLI continues in Desktop and vice versa without divergence
- [ ] **UI-05**: Approvals round-trip from a running turn to the Desktop and back

### Extension Surface (EXT)

- [ ] **EXT-01**: Skills registry supports install from the Hub, invocation, and curator-driven improvement
- [ ] **EXT-02**: Desktop plugin host provides pages, panes, widgets, and commands through a scoped backend with deny-only hooks and no backend handles
- [ ] **EXT-03**: Kanban board dispatches tasks with dependencies, heartbeats, reclaim, zombie detection, and all 14 kanban tools
- [ ] **EXT-04**: GSD TDD skills are installed as first-class skills in both the Hermes registry and the coding core's skill directory
- [ ] **EXT-05**: TDD phase invariants are enforced at the gate, and RED→GREEN requires recorded failing-test evidence
- [ ] **EXT-06**: Curator proposes skill improvements after a successful TDD cycle, visible in the Skills Store for approval
- [ ] **EXT-07**: Advisor second model reviews turns and injects notes without a separate turn
- [ ] **EXT-08**: Plan/goal/vibe loop modes and prewalk behavior live in the unified loop

### Platform & Packaging (PLAT)

- [ ] **PLAT-01**: The fused product builds on Windows from one documented command
- [ ] **PLAT-02**: The installer ships sidecars outside asar and requires no Docker
- [ ] **PLAT-03**: Sidecar process trees die with the app (Job Object ownership) and an orphan reaper cleans up after crashes
- [ ] **PLAT-04**: Single-instance locking and a crash-loop breaker prevent duplicate daemons
- [ ] **PLAT-05**: Paths beyond 260 characters and non-UTF8 child output are handled without crashing
- [ ] **PLAT-06**: Model credentials live in the secret store and a redaction audit proves they never reach logs
- [ ] **PLAT-07**: Model provisioning is SHA-256-verified at install and supports offline mode
- [ ] **PLAT-08**: A reachability audit reconciles every loop-resident capability as either ported or explicitly retired

## v2 Requirements

### Deferred

- **TTSR-01**: Time-traveling stream rules abort and inject mid-stream without per-turn context tax
- **PROF-01**: User can export and import a complete profile without API keys
- **IMPT-07**: User can import rules, skills, and memories from eight other agent formats
- **GATE-08**: Gateway adapters for Telegram, Discord, and Slack with one session per chat
- **MEM-09**: Optional Hindsight Cloud backend for users who prefer managed memory
- **PLAT-09**: Signed auto-update channel with staged rollout

## Out of Scope

| Feature | Reason |
|---------|--------|
| Second autonomous agent loop | Re-creates two transcripts, two compaction policies, and policy bypasses; violates Core Value |
| Reimplementing coding tools in Python | Loses in-process Rust performance and guarantees drift from the core |
| In-process FFI linking of the core into Python | Destroys crash isolation, frame logging, and the core's process assumptions |
| Bundling HuggingFace text-embeddings-inference on Windows | No Windows binaries, no CI, no documented install path — llama.cpp serves CPU inference instead |
| Docker-based memory stack | Docker Desktop is not an acceptable dependency on the target workstation |
| Standalone Hindsight WebUI | Two products, two auth surfaces, two memory vocabularies — functions live in the Desktop Memory page |
| Second session store or second credential store | Breaks CLI↔Desktop continuity and splits secrets |
| Public fourth plugin surface (coding-core extension host) | Three plugin systems already exist; a fourth unsandboxed runtime doubles the trust boundary |
| Auto-deleting or silently overwriting memories | Irreversible loss of user knowledge; invalidate/archive instead |
| Unbounded memory injection into the prompt | Token cost and prefix-cache destruction; bounded core block plus on-demand recall |
| Retaining every message and tool result by default | Noise, secret leakage, extraction cost, consolidation backlog |
| Upstream sync or auto-update of the four codebases | Contract drift and unauditable merges; deliberate re-import with provenance instead |
| macOS/Linux release binaries in v1 | Untested paths become support load; code stays portable, support is Windows-only |
| Multi-user server, RBAC, team workspaces | Unbounded auth/tenancy scope before single-user quality is proven |
| A separate "chat with your memory" app | Contradicts the one-product requirement |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| IMPT-01 | Phase 1 | Complete |
| IMPT-02 | Phase 1 | Complete |
| IMPT-03 | Phase 1 | Complete |
| IMPT-04 | Phase 12 | Pending |
| IMPT-05 | Phase 1 | Complete |
| IMPT-06 | Phase 1 | Complete |
| BRND-01 | Phase 2 | Pending |
| BRND-02 | Phase 2 | Pending |
| BRND-03 | Phase 2 | Pending |
| BRND-04 | Phase 2 | Pending |
| BRND-05 | Phase 2 | Pending |
| BRND-06 | Phase 2 | Pending |
| BRND-07 | Phase 2 | Pending |
| BRND-08 | Phase 2 | Pending |
| LOOP-01 | Phase 3 | Pending |
| LOOP-02 | Phase 3 | Pending |
| LOOP-03 | Phase 3 | Pending |
| LOOP-04 | Phase 3 | Pending |
| LOOP-05 | Phase 3 | Pending |
| LOOP-06 | Phase 3 | Pending |
| LOOP-07 | Phase 6 | Pending |
| GATE-01 | Phase 4 | Pending |
| GATE-02 | Phase 4 | Pending |
| GATE-03 | Phase 4 | Pending |
| GATE-04 | Phase 12 | Pending |
| GATE-05 | Phase 4 | Pending |
| GATE-06 | Phase 4 | Pending |
| GATE-07 | Phase 4 | Pending |
| CORE-01 | Phase 5 | Pending |
| CORE-02 | Phase 5 | Pending |
| CORE-03 | Phase 5 | Pending |
| CORE-04 | Phase 5 | Pending |
| CORE-05 | Phase 5 | Pending |
| CORE-06 | Phase 5 | Pending |
| CORE-07 | Phase 5 | Pending |
| CORE-08 | Phase 5 | Pending |
| CODE-01 | Phase 6 | Pending |
| CODE-02 | Phase 6 | Pending |
| CODE-03 | Phase 6 | Pending |
| CODE-04 | Phase 6 | Pending |
| CODE-05 | Phase 6 | Pending |
| CODE-06 | Phase 6 | Pending |
| SUB-01 | Phase 7 | Pending |
| SUB-02 | Phase 7 | Pending |
| SUB-03 | Phase 7 | Pending |
| SUB-04 | Phase 7 | Pending |
| MEM-01 | Phase 8 | Pending |
| MEM-02 | Phase 8 | Pending |
| MEM-03 | Phase 8 | Pending |
| MEM-04 | Phase 8 | Pending |
| MEM-05 | Phase 10 | Pending |
| MEM-06 | Phase 8 | Pending |
| MEM-07 | Phase 10 | Pending |
| MEM-08 | Phase 10 | Pending |
| SCHD-01 | Phase 9 | Pending |
| SCHD-02 | Phase 9 | Pending |
| SCHD-03 | Phase 9 | Pending |
| SCHD-04 | Phase 9 | Pending |
| SCHD-05 | Phase 10 | Pending |
| SCHD-06 | Phase 10 | Pending |
| SCHD-07 | Phase 9 | Pending |
| UI-01 | Phase 10 | Pending |
| UI-02 | Phase 10 | Pending |
| UI-03 | Phase 10 | Pending |
| UI-04 | Phase 10 | Pending |
| UI-05 | Phase 10 | Pending |
| EXT-01 | Phase 11 | Pending |
| EXT-02 | Phase 11 | Pending |
| EXT-03 | Phase 11 | Pending |
| EXT-04 | Phase 11 | Pending |
| EXT-05 | Phase 11 | Pending |
| EXT-06 | Phase 11 | Pending |
| EXT-07 | Phase 11 | Pending |
| EXT-08 | Phase 11 | Pending |
| PLAT-01 | Phase 12 | Pending |
| PLAT-02 | Phase 12 | Pending |
| PLAT-03 | Phase 12 | Pending |
| PLAT-04 | Phase 12 | Pending |
| PLAT-05 | Phase 12 | Pending |
| PLAT-06 | Phase 12 | Pending |
| PLAT-07 | Phase 12 | Pending |
| PLAT-08 | Phase 12 | Pending |

**Coverage:**
- v1 requirements: 82 total
- Mapped to phases: 82
- Unmapped: 0 ✓
- v2 requirements: 6 deferred, intentionally unmapped

**Per-phase counts:**

| Phase | Requirements |
|-------|--------------|
| 1. Import & Provenance Ledger | 5 |
| 2. Rebrand, Wire Contract & Migration | 8 |
| 3. Unified Loop & Session Authority | 6 |
| 4. Tool Registry & Policy Gate | 6 |
| 5. Coding Core over RPC | 8 |
| 6. Code Intelligence, Execution & Rollback | 7 |
| 7. Subagent Orchestration | 4 |
| 8. Memory Runtime & Bundling | 5 |
| 9. Four-Lane Scheduling & Lane SLOs | 5 |
| 10. Desktop & CLI Product Surface | 10 |
| 11. Skills, Plugins, GSD & Kanban | 8 |
| 12. Hardening, Packaging & Release | 10 |
| **Total** | **82** |

---
*Requirements defined: 2026-10-23*
*Last updated: 2026-10-23 after roadmap creation (82/82 mapped, 0 unmapped)*
