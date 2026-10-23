# Project Research Summary

**Project:** HALO (workspace: Bond)
**Domain:** Fused desktop coding agent — one Python agent loop over a TS/Rust coding-core tool backend, with embedded knowledge-graph memory and a single policy chokepoint
**Researched:** 2026-10-23
**Confidence:** MEDIUM (upstream mechanics HIGH; versions HIGH; fusion design MEDIUM; Windows CPU inference LOW)

**Synthesized from:**
- `.planning/PROJECT.md` (authoritative brief)
- `.planning/research/STACK.md` (StackResearch)
- `.planning/research/FEATURES.md` (FeaturesResearch)
- `.planning/research/ARCHITECTURE.md` (ArchitectureResearch)
- `.planning/research/PITFALLS.md` (PitfallsResearch)

---

## Executive Summary

HALO is not a greenfield product and should not be planned as one. It is a fusion of four mature, MIT-licensed systems whose tool surfaces overlap almost completely, so the design question is not "what features do we build" but "which of two or three existing implementations survives, and where does the seam go." All four research streams converge on the same conclusion: **the product is the seam**. One Python loop decides every turn, one adapter and one `pre_tool_call` gate see every tool call, one SQLite store owns the transcript, and one four-lane scheduler owns capacity across both runtimes. Everything else — 34 feature collisions, ~100 Hermes tools vs 31 OMP tools, 185 OMP RPC commands — is resolved by choosing exactly one implementation per capability and retiring the other rather than aliasing it.

The recommended build order is import-with-provenance → rebrand-with-inventory → loop-and-gate → RPC tool backend → catalog-and-subagents → memory runtime → four lanes → surfaces → plugins/GSD/Kanban → packaging/hardening. Two ordering constraints dominate: **the gate must exist before the first OMP tool ships**, or the first coding tool ships ungated; and **the provenance ledger must be built during import**, because it is impossible to reconstruct later. Memory work can start in parallel as soon as the scheduler interface exists and is the long pole for everything user-visible.

The project's risk is concentrated in four places, and only two of them are things money or time normally solve. (1) **Windows CPU inference is genuinely unsolved off the shelf**: TEI publishes no Windows binaries and has no Windows CI job, so "bundle CPU TEI sidecars" is a build-and-own project with LOW confidence; it needs a gated spike with a pre-approved fallback. (2) **pgvector must be compiled with MSVC against the exact bundled PostgreSQL**, which is documented but must be asserted in CI. (3) **The policy claim is falsifiable**: 20 distinct bypass paths exist in the vendored code (plugins, hooks, OMP `bash`, OMP subagents, OMP `eval`, MCP, renderer access), and each must be closed and tested by side effect, not by return value. (4) **The memory contention pathology is a queueing phenomenon**, not a bug; priority reordering over one semaphore reproduces it, so lanes need reserved capacity and revocable leases, not higher deadlines.

## Key Findings

### Recommended Stack

The stack is prescriptive and version-pinned from live registries on 2026-10-23; this is unusually high-quality input for planning and should be adopted as written unless a spike disproves it.

**Core technologies:**
- **just 1.59.0** — the single build coordinator (`just build`), because it is one static `.exe`, models cross-language dependencies, and cannot silently skip a step. Must set `[windows] set shell := ["pwsh", ...]`, because just defaults to `sh` on Windows. *Confidence HIGH (mechanism); MEDIUM (PowerShell ergonomics).*
- **Bun 1.4.4 + Rust 1.99.1 + Python 3.14.9 (python-build-standalone) + uv 0.13.5** — per-language owners of their own toolchain; ship the interpreter (never PyInstaller/Nuitka), lockfiles pinned.
- **TypeScript 7.0.2** — `latest`; gate the import with a `tsc --noEmit` baseline per vendored subtree and pin TypeScript 5.x per-package if the imports depend on removed API. *Confidence MEDIUM — migration cost unmeasured.*
- **Electron 45.0.0 + electron-builder 26.15.3** — Desktop shell and NSIS packaging; sidecar binaries must live outside asar via `extraResources`/`asarUnpack`.
- **PostgreSQL 18.6 (zonky `embedded-postgres-binaries-windows-amd64:18.6.0`) + pgvector 0.8.7 built with MSVC `nmake`** — no official Windows embeddable Postgres and no official pgvector Windows binary; both are assembled by HALO, checksum-pinned, staged in `vendor/db/win32-x64/`. *Confidence MEDIUM-HIGH; pgvector's `nmake install` destination must be asserted in CI.*
- **TEI v1.9.4 built from source with `-F ort`** — **the single largest unvalidated assumption in the stack.** No release assets, no Windows CI, no Windows install path. *Confidence LOW.* Fallback ladder exists (see Conflicts and Phase 6).
- **fastembed 0.9.0 / onnxruntime 1.31.0** and **llama.cpp b11669** — pre-approved fallback paths if the TEI build fails.
- **ast-grep 0.51.0** — AST-aware rebrand rewriting, driven by a checked-in `tools/rebrand/rename.yml`; never `sed` over four trees.

**Hard stack facts that constrain planning:** PostgreSQL refuses to run elevated on Windows; data dirs go in `%LOCALAPPDATA%`, never roaming `%APPDATA%`; Windows has no Unix sockets, so loopback TCP + `scram-sha-256` is the only isolation; there is no `SIGTERM`, so Postgres stops via `pg_ctl stop -m fast` and process trees die via Job Objects (`KILL_ON_JOB_CLOSE`), not `kill()`.

### Expected Features

Features research is not a feature list; it is a collision resolution over four mature products, plus a market check against Claude Code, Codex CLI, and Cursor.

**Must have (table stakes, v1 launch slice):**
- Streaming chat with steer/queue/interrupt; read/write/edit with diff preview; one shell with approval and background jobs; codebase search + navigation; project-instruction discovery; sessions with resume/branch/export; loop-owned compaction; model catalog with hosted/local/OAuth/fallback; MCP with per-server tool control; skills/slash commands; subagents; git + checkpoint/rollback; approvals; headless mode; Desktop multi-session + diff review; web search and URL/PDF reading; memory across sessions; usage/cost; CLI↔Desktop continuity; Windows-native support; crash recovery/auto-update; tool-schema deferral.
- The MVP slice that proves the fusion: **unified adapter + registry + gate; coding core over RPC (`read`, `write`, `edit`, `grep`, `glob`, `bash`, `lsp diagnostics`); one session store + loop-owned compaction; one catalog + one secret store; Hindsight + four lanes + memory page; skills + GSD TDD policy; `task` subagents with the policy bridge; Desktop + CLI on the same loop; checkpoints + rollback.** *Release-gate note: this is a validation slice, not the completion definition.*

**Should have (differentiators, v1.x):**
- **Single non-bypassable tool path** — the product itself.
- **TDD invariants enforced as policy** at the chokepoint, not in prose.
- **Bundled native memory, no Docker**, with Hindsight memory quality: observations with evidence, mental models, four-strategy retrieval + rerank.
- **Four-lane admission control** with visible lane metrics — the direct answer to the measured 11.59 s p50 wait for 1.12 s of work.
- Hashline edits (content-hash anchors; upstream claims 61% fewer output tokens on Grok 4 Fast), 14 LSP ops, 28 DAP ops, AST codemods, durable Kanban, Skill Curator, Desktop plugin platform, omni-channel gateways, in-process Rust shell on Windows, subagent orchestration with isolation/steering, advisor model, TTSR, path-addressed everything, 23-provider web search, memory observability, profile export.

**Defer (v2+):** collab live sessions, vibe/autoresearch/seance, Hindsight Cloud/team memory, macOS/Linux releases, multi-user/RBAC.

**Anti-features (do not build):** a second autonomous loop; reimplementing OMP tools in Python; in-process FFI; a duplicate implementation of any tool; Docker memory stack; standalone Hindsight WebUI; auto-deleting memories; unbounded memory injection; retain-everything; tool access hidden inside code execution; blocking the first turn on TEI; a fourth (OMP extension) plugin surface; a second session or credential store; upstream auto-sync; v1 macOS/Linux binaries; cloud-required memory; team workspaces; a separate memory app; GSD-side model routing.

**The 34 collisions and the winner rules.** Every collision is resolved by six ordered rules: (1) loop owner wins loop-resident state; (2) data owner wins the store; (3) the safety layer wins the gate; (4) the superset wins the tool contract unless it breaks Windows; (5) one user-visible name per capability; (6) import, don't dual-run. Applying them: **OMP wins** read/write/edit/grep/glob, the `bash` engine, `task` contract, `todo`, web search, LSP runtime, provider catalog + role router, project-context loader, `eval`, GitHub path ops, code-intelligence depth. **Hermes wins** the session store, compaction engine, approvals, `pre_tool_call` hook bus, skills registry, MCP runtime, browser toolset, `computer_use`, `clarify`, `/goal`, `/plan`, ACP, usage accounting, metadata/plugin surfaces. **Hindsight wins** all durable memory outright. **Split decisions:** filesystem rollback stays Hermes while context checkpoint/rewind is OMP renamed; providers split into OMP catalog + Hermes secret store; skills become one registry with two projections; worktree isolation uses OMP `task isolation`, while code-review orchestration is GSD with OMP reviewer agents. **The consequential calls:** hashline `edit` replaces fuzzy `patch` (correctness property Hermes cannot express); one `bash` tool over OMP's engine with Hermes environments as backends; Hermes SQLite + FTS5 with OMP tree semantics ported; Hermes loop-owned compaction with OMP strategies ported; Hindsight as the only store with a bounded `MEMORY.md`/`USER.md` projection; OMP's 60+ provider catalog exported to Python rather than duplicated.

### Architecture Approach

Architecture research designs the seams and is explicit about what is upstream evidence vs HALO design. The whole design reduces to **five invariants**: one loop decides; one decision point; one transcript; one capacity authority; fail closed on policy, fail open on recall, fail loud on backend death. The fourth is the one both upstreams violate by construction.

**Major components:**
1. **`halo-agent` (Python, singleton)** — the Hermes-derived loop, tool registry, adapter, policy gate, context engine, memory provider, plugin host, lane scheduler, SQLite single writer, and the coding-core supervisor. Desktop and CLI are *clients* over loopback HTTP/WS with a per-launch bearer token; neither is an alternative runtime.
2. **`halo-runtime` (Python, singleton)** — supervises `postgres.exe`, two TEI routers, the Hindsight API, and the Hindsight worker; expensive to start, survives agent/UI restarts.
3. **Coding core (Bun/TS + Rust, one child per canonical session)** — tool implementations and workspace process state (shell sessions, LSP, DAP). Spawned in **tool-backend mode**: `--backend-only --no-extensions --no-session`, protocol v2 negotiated, minimal event filter, auto-compaction/retry off, empty host tools. It receives exactly three HALO-owned commands (`halo.tool.invoke`, `halo.tool.cancel`, `halo.tool.catalog`) and a whitelist of safe pinned setters; every command that can start or steer a turn is removed from its dispatch table and rejected with `capability_disabled`.
4. **Tool adapter** — batch-resolves the whole call set before any dispatch, gates each call (pure, ≤5 ms p99, fail closed), dispatches (in-process / RPC / child CLI / MCP), normalizes to `ToolResultEnvelope v1`, spills large payloads to the artifact store, redacts secrets, and persists one row per `tool_call_id` in original call order.
5. **Four-lane scheduler** — L0 prompt (2 permits, 1 reserved, non-preemptible), L1 recall/reflect (2, soft 1.5 s / hard 5 s, fail open), L2 retain/checkpoint (1, 60 s ack), L3 consolidation/refresh/export (1 + worker slots, cancelable). No shared FIFO; reserved permits; revocable leases draw only on unreserved capacity; every non-L3 acquire is deadline-bounded.

**The bypass inventory is the most actionable artifact in the research.** Twenty entries (B1–B20) name every path that can skip the adapter: OMP agent-loop commands, OMP direct `bash`, OMP extensions intercepting `tool_call`, OMP `task` subagents, OMP `eval` re-entrancy, OMP memory tools, Hermes agent-level intercepts, Hermes plugins/hooks, MCP tools, `execute_code`/terminal backends, renderer/plugin access, a second embedded loop, direct Hindsight access, Hindsight's internal worker, unmirrored context frames, tool aliasing, prompt injection via tool output, `xd://`/host tools, shell writes outside the workspace, and secret leakage through args/logs. Each has a closure and a test. The rule: **a new surface without an entry, a closure, and a test does not ship.**

### Critical Pitfalls

Eight pitfalls are documented, each with a named phase owner and verification. Ranked by cost of getting them wrong:

1. **P-01 Fork-and-cut-off debt (Phase 1).** A squash import destroys path, symbol, and string identity, so the first urgent upstream security fix becomes archaeology. Build `UPSTREAM.json`, `PATHS.json`, `RENAMES.json`, `patches/series`, and `WATCHLIST.md` *during import*, plus a `provenance-replay` CI job that reconstructs each tree from pristine upstream + patches + renames.
2. **P-03 Identifier rebrand fallout (Phase 2).** Four failure modes: split-brain home (two config roots both being written), one-way shims, tests pinned to old strings, and plugin-allow-list gate drift. Generate constants from one `brand.json`; one read-old/write-new home resolver per language; migration **copies** and verifies, never moves; rename the Postgres schema in a migration with an asserted `search_path`, not by editing `CREATE EXTENSION`.
3. **P-07 Policy-gate bypass (Phase 3).** "One path" is a claim until closure is proven. The gate must be structurally unreachable-around: one executor, private backend modules, import-direction lint, **backend receipts** (`decision_id` + nonce) so a bypass emits a metric, a deny-by-default registry, and matrix tests that assert *side effects*, not return values. Confront the ungated loaders (`~/.hermes/hooks`) or document the trust model honestly.
4. **P-04 The demoted loop comes back (Phase 4; mirror rule owned by Phase 3).** Three independent divergence mechanisms: `agent_end` keyed without `isTerminal !== false`/`yielded`; truncated `agent_end.messages` treated as a transcript; unmirrored `context_message_added`. Make demotion structural (no wrapped `prompt`), treat agent frames as protocol violations in backend mode, persist from `message_*` only, and diff mirrored-vs-sent content hashes every turn.
5. **P-05 Memory-vs-prompt contention (Phase 7; transactional boundaries in Phase 6).** Priority without reserved capacity, deadlines-as-patience, unpreemptible embed batches, and preemption that corrupts state. Reserve a slice of every bottleneck; deadline = shed trigger; LIFO/queue caps; cancellation boundaries transactional; measure p99 and sliding-window minimum queueing delay, not p50.
6. **P-06 CPU TEI on Windows (Phase 6, spike as entry gate).** No Windows distribution; server-class defaults (`512` concurrent, `16384` batch tokens, `32` client batch) are hostile to a desktop; first-boot downloads, port collisions, orphans, and pgvector/Postgres ABI mismatch. Decide the embedder story before the memory phase, provision models at install, derive flags from the hardware profile, bind ephemeral ports, and own every child through one supervisor.
7. **P-08 Windows traps (Phase 8; import fidelity in Phase 1).** MAX_PATH, CRLF/LFS import corruption, open-handle delete failures, Defender on hot paths, cp1252 console encoding, and orphaned process trees. Short install root + `longPathAware`; preserve `.gitattributes`; write-temp-then-replace; UTF-8 everywhere; Job Objects; Windows CI per PR.
8. **P-02 MIT compliance after rebrand (Phase 1, re-verified at release).** A bulk rename silently edits attribution prose while leaving `Copyright (c)` lines intact. Keep per-subtree LICENSE verbatim, hard-code a rebrand denylist by path, generate `THIRD_PARTY_NOTICES.txt` from all three lockfile ecosystems, embed it in the installer, and expose it in About and `halo --licenses`.

## Conflicts Between Researchers

Where the four documents disagree, the disagreement is stated here rather than averaged away.

### C-1. TEI on Windows: requirement vs evidence vs fallback order

- **PROJECT.md** requires "CPU TEI embedder and CPU TEI reranker as supervised child processes, no Docker requirement" and makes it an Active requirement.
- **STACK.md** verifies the negative: v1.9.4 has zero release assets, no Windows CI job, and the only documented install paths are Docker, Homebrew-on-Apple-Silicon, and `cargo install`. It rates TEI-on-Windows **LOW** and offers a five-step ladder, ranking fastembed (in-process ONNX) above llama.cpp `llama-server`.
- **PITFALLS.md** goes further and *recommends changing the default*: use Hindsight's own local ONNX embedder/reranker on Windows (upstream's default, no extra binary, no ports, no download at chat time) and treat TEI as an optional advanced backend behind a capability probe.
- **ARCHITECTURE.md** depends on TEI being HTTP sidecars: the four-lane isolation, preemption, and supervisor state machine all assume a cancellable HTTP boundary and a process that can be killed without taking the agent down.

**Resolution (recommended):** Do not plan either extreme as a default. Make the embedder an explicit, gated decision at the **entry of the memory phase (Phase 6)**, with a time-boxed spike and a pre-approved ladder:

1. **Spike:** build `text-embeddings-router.exe` from pinned TEI v1.9.4 source with `-F ort` on `windows-latest`; success is binary produced + `/health` 200 + `/embed` returns the expected dimension + p95 embed latency within budget on the **Low** profile (≤4 vCPU/8 GB) with profile-scaled flags. *If it passes, the PROJECT requirement stands as written.*
2. **Fallback A (architecturally closest): llama.cpp `llama-server` b11669** — it preserves the HTTP sidecar boundary, the supervisor, and the lane/cancellation model, at the cost of GGUF models and different rerank scoring. This is where I depart from STACK's ordering: fastembed is in-process, so a model crash takes the agent daemon and cancellation cannot interrupt a call — it violates the isolation the scheduler depends on. fastembed is a *degradation mode*, not an equivalent fallback.
3. **Fallback B (degraded): fastembed in the memory daemon** with a visible degraded badge and an explicit documented exception to the sidecar invariant.
4. **Rejected:** WSL2 and Docker.

If the spike fails and Fallback A is adopted, **PROJECT.md must be amended**, not silently reinterpreted: the requirement changes from "TEI sidecars" to "supervised CPU embedding/reranking sidecars (TEI or llama.cpp)".

### C-2. Rebrand depth: PROJECT's internals rebrand vs PITFALLS' "keep the wire ABI"

- **PROJECT.md Key Decisions** is explicit: rebrand "surface *and* internals (env vars, config dirs, package names, plugin ids, DB schemas, **RPC method names**)" with migration shims.
- **STACK.md** accepts the internals rebrand and describes the mechanism (ast-grep driven by a manifest, `halo.*` RPC methods, alias map for **one minor version** then delete).
- **PITFALLS.md P-03** argues the opposite for the wire specifically: the 185 command names and frame types are an internal ABI between HALO's own Python adapter and HALO's own TS core, "renaming them buys nothing and buys a whole class of desync bugs (a stale binary on `PATH` answering an old schema)", and its Technical Debt table marks the rename "Never, unless versioned as a separate breaking protocol."

**Resolution (recommended):** Adopt PROJECT's decision, but scope it to the surface that actually survives — and version it, don't string-replace it.

- Tool-backend mode (Architecture §4.2) **deletes** almost all 185 commands anyway. The retained set is roughly a dozen commands (`get_state`, `get_available_commands`, `negotiate_protocol`, `set_event_filter`, three `halo.tool.*`, and four pinned setters) plus the event-frame categories the adapter allowlists. So the rename cost PITFALLS fears applies to ~12 commands and ~18 frame types, not 185 — *[INFERENCE], derived by intersecting Architecture's retained-command list with the 185-command inventory; verify against `rpc-types.ts` at the import SHA.*
- Implement the rename as a **protocol version bump** (`protocolVersion` = HALO's own, negotiated in the `ready` handshake) with both sides' constants generated from one `contracts/rpc-frames.yaml`, and a protocol-hash mismatch refusing the handshake. That removes PITFALLS' stale-binary failure mode structurally instead of by convention: a mismatched core can never be silently talked to.
- Keep a read-only alias acceptance for **one minor release** for the names gsd-omp extensions might call by name, then delete it. A shim with no expiry is a permanent second vocabulary.
- **If** the team decides the cost outweighs the value, then amend PROJECT.md's Key Decision explicitly and record the upstream command names as a documented internal ABI. What is not acceptable is the middle state: half-renamed wire names with no version gate.

### C-3. Subagents: whose loop executes the child's tools?

- **FEATURES.md** master table awards `task` to **OMP's implementation** and lists "RPC subagent frames" as a dependency, while flagging the unresolved risk: OMP child tools execute inside the coding core and may never cross the Python gate. It calls this the highest-risk unresolved design item and offers (a) host-tool bridge or (b) restricted child toolsets as a documented exception.
- **ARCHITECTURE.md** resolves it the other way: `task` is **owned by HALO** and creates a child HALO session (`parent_session_id`) driven by the same loop over the same adapter; OMP's `task` tool is unregistered (B4). OMP supplies tool implementations and isolation backends, not agents.
- **PITFALLS.md P-07** demands a written decision: host tools executed by HALO, or subagents disabled.

**Resolution (recommended):** Follow ARCHITECTURE on execution locus and FEATURES on the contract: keep OMP's `task` *shape* (batch + shared context, per-item agent/tools/model, `isolated`, typed output, steering/cancel, `agent://` addressing) as the tool contract, but execute each child as a HALO session under the single loop. Treat "subagent tools execute inside OMP" as forbidden, because it makes the Core Value false for every child call. If per-item model routing cannot be plumbed through the child-session path, ship without it rather than falling back to OMP's loop. This decision must land before Phase 5 planning, not during it.

### C-4. `eval` kernels and tool re-entry

- **FEATURES.md** awards `eval` to OMP and lists "persistent Python and Bun workers; either kernel can call agent tools over a loopback bridge" with "host-tool bridge" as the dependency.
- **ARCHITECTURE.md** B5 disables tool re-entry in tool-backend mode: `eval` gets `backend.raw`, is approval-gated, and **cannot invoke other tools**.
- **PITFALLS.md** calls re-entrant tool access inside code execution an explicit policy bypass.

**Resolution:** Ship `eval` **without** tool re-entry first (Architecture wins). Re-entry is a later feature that must route every nested call through the adapter and gate, and must be proven by a matrix test. Do not ship "eval can call `read`/`bash`" as an incidental capability.

### C-5. Where the rebrand phase goes

- **PITFALLS.md** makes Rebrand & Migration its own phase (P2) with migration-fixture verification.
- **ARCHITECTURE.md** puts the rebrand linter in Foundation (P1) and the user-facing migration shims in its final phase (P8).
- **STACK.md** treats migration shims as part of rebranding mechanics.

**Resolution:** Split by purpose. Do the **physical rename + inventory gate** immediately after import (Phase 2), because every later commit written against old identifiers is a conflict. Ship the **legacy-user migration shims** with the first user-facing build (Phase 9/10), because until then there are no users to migrate and the shim would be dead code that drifts.

### C-6. Fallback ladder ordering (fastembed vs llama.cpp)

Covered in C-1; recorded separately because it is a genuine researcher disagreement rather than a scope question. STACK ranks fastembed second because it is the lowest-friction Windows-native path. ARCHITECTURE's invariants argue that any in-process embedder breaks the process boundary the lane scheduler and supervisor are built on. **Recommendation: llama.cpp sidecar before fastembed.**

## Implications for Roadmap

Ten phases are recommended. They are capability-named, not numbered by importance; the roadmapper should renumber freely but preserve the hard ordering constraints below.

### Phase 1: Foundation, Import & Provenance
**Rationale:** Everything else is written against the imported tree; the provenance ledger is cheapest at import and impossible to reconstruct later (P-01). License material must be captured before any rename touches it (P-02).
**Delivers:** Monorepo layout (`apps/`, `packages/`, `vendor/`, `contracts/`, `runtime/`, `tools/`), four squashed imports with `UPSTREAM.json`/`PATHS.json`/`RENAMES.json`/`patches/series`/`WATCHLIST.md`, per-subtree LICENSE verbatim, `provenance-replay` CI job, rebrand-deny scaffold, one documented Windows build command, `windows-latest` CI, import-fidelity checks (`.gitattributes`, LFS binaries, lockfile bytes).
**Addresses:** Build/run requirement; license constraint; upstream-cutoff constraint.
**Avoids:** P-01, P-02, and the import half of P-08.

### Phase 2: Rebrand & Identifier Migration
**Rationale:** The rename must freeze the vocabulary before contracts, codecs, and tests are written against it. Identifier inventory is a prerequisite for Phase 3's contracts.
**Delivers:** `brand.json` + generated constants per language; full identifier inventory (env vars, paths, plugin ids, package names, DB schema, Windows metadata); ast-grep rename driven by `tools/rebrand/rename.yml`; one read-old/write-new home resolver per language with copy-verify migration and `.migrated-from` marker; plugin-allow-list and entry-point migration; schema rename as a transactional migration with asserted `search_path`; **the RPC-wire decision recorded** (C-2) and the frame/command contract generated.
**Addresses:** HALO brand requirement; migration-shim requirement (implementation deferred to Phase 9).
**Avoids:** P-03 in all four modes.

### Phase 3: Unified Loop, Registry & Policy Gate
**Rationale:** The gate must exist before any coding tool ships, or the first one ships ungated. This phase also owns the transcript-mirror rule that Phase 4 depends on.
**Delivers:** Hermes-derived loop and turn state machine; SQLite single-writer store with session/transcript/turn identity; in-process tool registry and `tool-ownership.yaml` loader; pure `PolicyGate` with safety, TDD-phase, memory-routing, and backend-restriction rules; capability classes on every entry; adapter batch admission and normalization; deny-by-default; decision records; minimal CLI TUI.
**Addresses:** Single non-bypassable tool path (partial); TDD enforcement (rules); one transcript.
**Avoids:** P-07 (gate half); P-04 (mirror rule).

### Phase 4: RPC Tool Backend & Loop Demotion
**Rationale:** No OMP tool may ship before `halo.tool.invoke` exists (hard constraint). The core patch and framing are also where the second-loop risk becomes structural or not.
**Delivers:** Vendored-core patch (three HALO commands + capability profile + command-set reduction); supervisor with handshake, protocol-v2 chunk reassembly, generation fencing, liveness probes, crash/restart with circuit-open; typed codec; frame recorder and replay suite; crash injection; cancellation token tree with synthetic results in call order; mirror-or-drop invariant.
**Addresses:** Coding capability delivery; crash isolation; testability.
**Avoids:** P-04 fully; B1, B2, B18 (implementation half).

### Phase 5: Catalog Unification, OMP Surface & Subagents
**Rationale:** Only now can the full tool catalog be reconciled safely. Subagents must come after the invocation protocol exists, or they get tempted back into OMP's loop.
**Delivers:** Full registry reconciliation (LSP 14 ops, DAP 28 ops, AST, browser, eval, GitHub paths); capability tags; HALO-owned `task` as child sessions with isolation, steering, typed output; GSD TDD enforcement with recorded failing-test evidence; the **subagent/eval policy-bridge decision implemented and tested** (C-3, C-4); loop-resident OMP capability inventory (advisor, TTSR, magic keywords, vibe, prewalk, snapcompact) — each either ported or explicitly retired with approval.
**Addresses:** "Every OMP capability remains reachable"; differentiators (code intelligence, subagent orchestration).
**Avoids:** B3, B4, B5, B6; the silent-deletion failure FEATURES warns about.

### Phase 6: Memory Runtime & Bundling
**Rationale:** Memory is HTTP + processes; it does not depend on the coding core, so it can start in parallel after Phase 3 and is the long pole for Phases 7–9. The TEI decision gates the phase.
**Delivers:** `halo-runtime` supervisor; zonky PostgreSQL 18.6 + self-built pgvector 0.8.7; TEI-or-fallback sidecars with hardware-profile flags and ephemeral ports; Hindsight API/worker; model provisioning at install with SHA-256 manifest and offline mode; transactional retain boundaries and a startup repair job; TEI spike result recorded as a decision.
**Addresses:** Bundled-native-memory requirement; no-Docker constraint; Windows-first constraint.
**Avoids:** P-06; P-05's transactionality half.

### Phase 7: Four-Lane Scheduler & Memory Model
**Rationale:** The lane controller needs a live memory service to prove anything, and its SLOs are a project-level acceptance criterion.
**Delivers:** Daemon-global scheduler with per-lane FIFOs, reserved permits, revocable leases, deadlines and revocation; L0 transport wrapping and fallback; L1 fail-open with visible `memory.recall.skipped`; async retain with deterministic `operation_id`; Hindsight knob pinning below the scheduler ceiling; Memory Model settings with drain-and-restart; lane metrics and the soak harness.
**Addresses:** Four-lane requirement; Memory Model requirement; the observed 11.59 s pathology.
**Avoids:** P-05 fully.

### Phase 8: Desktop & CLI Surfaces
**Rationale:** Surfaces must not precede the session authority, or Electron grows a second loop. Memory panels need Phase 7.
**Delivers:** Electron main/preload/renderer with typed IPC and sender validation; session list/resume/branch/export; approvals round-trip; diff review; terminal; lanes panel; memory health/provider page; CLI attaching to the same daemon; renderer denied any daemon token.
**Addresses:** Two first-class surfaces; CLI↔Desktop continuity; Desktop requirement.
**Avoids:** B11, B12; the "two session stores" anti-feature.

### Phase 9: Plugins, GSD, Skills, Kanban & Legacy Migration
**Rationale:** Extension surfaces are additive only after the gate is proven; legacy shims ship with the first build users can install.
**Delivers:** Capability-scoped plugin host (no backend handles; deny-only hooks); GSD skills projected into both registries with policy in the gate; `gsd_invoke` runner; Kanban + dispatcher; full memory page (browse/search/prune/export/conflict/staleness); legacy config/env/memory migration shims and fixtures.
**Addresses:** Capability reachability; GSD first-class requirement; migration requirement.
**Avoids:** B3, B8, B9, the ungated-hook trust gap; P-03's user-visible half.

### Phase 10: Hardening, Packaging & Release
**Rationale:** Cross-cutting verification cannot be meaningful before the stack exists end to end.
**Delivers:** Windows installer (NSIS) with sidecars outside asar; Job Object ownership and orphan reaper; single-instance locks; crash-loop breaker; UTF-8/path/lock fixes; code signing; THIRD_PARTY_NOTICES in the installer and About; backpressure and lane soaks on the **Low** profile; secrets-redaction audit; Postgres minor/major upgrade drills; reachability audit against the loop-resident inventory and the "what does reachable mean" definition.
**Addresses:** Build-and-run requirement; security constraint; release gate.
**Avoids:** P-02 (binary half), P-08 fully; "looks done but isn't" checklist.

### Hard Ordering Constraints

- **P1 → P2 → P3 → P4 → P5(catalog) → P9(plugins/GSD)** on the loop/tool path; the gate (P3) strictly precedes any OMP tool (P5), and the invocation protocol (P4) strictly precedes subagents (P5).
- **P3 → P6(shared contracts)**: scheduler interface + provider transport must exist before memory work, but memory does **not** depend on the coding core. Start Phase 6 in parallel with Phase 4/5; it is the long pole for Phases 7–9.
- **P6 → P7**: lanes need a live memory service to measure.
- **P3 → P8**: no surface before the session authority.
- **P7, P8 → P9** for the memory page and approvals; **P4, P6, P7, P8 → P10**.
- **Rebrand (P2) before contracts freeze**; **migration shims (P9) before first user install**; **TEI spike before P6 commits to sidecar architecture**.
- Do not reorder: provenance (P1), gate (P3), and demotion (P4) are irreversible-if-skipped decisions.

### Phase Ordering Rationale

- The ordering is dependency-driven, not value-driven: the most valuable feature (coding tools) is deliberately late because shipping it first guarantees an ungated first tool.
- Memory is the only layer that can be built in parallel, and it is also the riskiest; starting it early gives the TEI/Postgres spikes maximum slack.
- The split of PITFALLS' "Memory Runtime" and "Scheduler" phases is preserved because they have different failure modes (binaries/processes vs queueing policy) and different verification (offline install vs soak SLO).
- Rebrand sits second rather than last because identifier churn is multiplicative with code written against the old identifiers.
- Packaging/hardening is a real phase, not a tail: orphaned sidecars, MAX_PATH, encoding, and code signing are product-visible failures with their own research needs.

### Research Flags

**Needs deeper research during planning:**
- **Phase 5 (highest, binary):** can every OMP child/re-entrant tool be routed through the gate? Read `rpc-types.ts`, `rpc-frame.ts`, `rpc-session-events.ts`, extension hooks, and the `task`/`eval` host-tool bridge at the import SHA. If no, the Core Value statement must be amended before planning this phase.
- **Phase 6 (highest, feasibility):** TEI Windows build + CPU throughput on the Low profile; embedded-Postgres cold first boot on the target workstation; pgvector `nmake install` layout assertion.
- **Phase 7:** Hindsight retrieval/consolidation code paths — semaphore scope, transaction boundaries, mental-model refresh write ordering. The `.env` surface documents knobs, not ordering.
- **Phase 8:** Windows packaging/updater behavior — code signing, SmartScreen with a sidecar-spawning installer, single-instance, Desktop plugin sandbox feasibility.
- **Phase 3:** Hermes hook and plugin loader source end to end; the bypass inventory must be **code-derived**, not doc-derived.
- **Phase 2:** extract the complete identifier inventory; the tables in PITFALLS are the starting set, not the full set.

**Standard patterns (skip research-phase):**
- **Phase 1:** the provenance ledger is engineering, not research.
- **Phase 4:** RPC semantics are documented (HIGH); the remaining work is reading the frame union.
- **Phase 10:** verification-only.

### Open Questions for the Planner

Answer these before coding; each changes phase scope, not just implementation detail.

1. **Is TEI mandatory, or is a supervised sidecar-compatible fallback acceptable?** Changes the Phase 6 architecture, PROJECT.md wording, and installer contents (C-1).
2. **Do we pay for the internal RPC rename now?** Full versioned wire rename vs documented internal ABI. Decide before Phase 2 contracts freeze (C-2).
3. **Where do subagent tools execute?** HALO child sessions (recommended) vs OMP host tools vs subagents disabled. Blocks Phase 5 (C-3).
4. **Does `eval` get tool re-entry at all in v1?** Recommended: no. Blocks Phase 5 scope (C-4).
5. **What does "every capability reachable" mean for the release gate** — CLI, Desktop, or either? Undefined today; the milestone cannot be judged without it.
6. **Memory bank granularity:** per-workspace (Architecture's assumption), per-project, or per-profile? Drives tags, pruning, and profile export.
7. **How does Python consume the model catalog** without a second handwritten list? Generated versioned artifact + startup compatibility check is the only durable answer.
8. **What is shipped in the model bundle** — `bge-small` (~130 MB float32) in the installer, or first-run download with progress and offline mode?
9. **Does `halo-runtime` run as a user-session process or a pre-login scheduled task** in v1? Assumed user session.
10. **Are `~/.hermes/hooks`-style in-process code loaders shipped at all?** If yes, the trust model must be stated in the product, not just the docs.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **MEDIUM-HIGH** | Every version read from a live registry/release API on 2026-10-23. Build orchestration HIGH; PostgreSQL bundling MEDIUM-HIGH; **TEI-on-Windows LOW**; CPU latency numbers are `[INFERENCE]` from FLOP arithmetic, not measurements. |
| Features | **HIGH on upstream facts, MEDIUM on resolutions** | Capability inventories fetched from the four repositories. The 34 collision resolutions are product decisions with unvalidated cost estimates. Market expectations are from competitor docs, not user research. |
| Architecture | **HIGH on upstream mechanics, MEDIUM on the fusion design** | RPC framing, Hermes loop/hooks, Hindsight API, and gsd-omp boundaries are documented. The three-command core patch, per-session process cost, and Job Object ownership are MEDIUM and need spikes. |
| Pitfalls | **HIGH on mechanics, MEDIUM on ranking and phase mapping** | Platform limits, license terms, protocol semantics, and upstream defaults are primary-sourced. Interaction claims ("a missed rename causes split-brain") follow from code/config but were not reproduced. |

**Overall confidence: MEDIUM.** The plan is buildable, but two items are not yet known to be buildable: the TEI Windows binary and the subagent/eval policy bridge. Both have pre-approved fallbacks or explicit amendment paths; neither should be discovered mid-phase.

### Gaps to Address

- **TEI Windows build feasibility and CPU throughput** — gated spike at Phase 6 entry; fallback ladder pre-approved (llama.cpp sidecar, then fastembed degradation).
- **pgvector MSVC build against bundled PostgreSQL 18.6** — CI job, checksum manifest, startup `extversion` assertion, `ALTER EXTENSION vector UPDATE` drill.
- **OMP tool-handler invocability outside a turn** — confirm every built-in handler accepts supplied `cwd` + `AbortSignal` and no agent context; exclude handlers that cannot from the catalog rather than faking context.
- **Subagent/eval policy bridge** — binary; verify in OMP source before Phase 5.
- **Bun ↔ electron-builder packaging** — prove `bun install --frozen-lockfile` → `electron-builder --win nsis` produces a working installer in the first packaging phase.
- **Python venv relocation into `resources/`** — smoke test on a machine without Python.
- **Code signing / SmartScreen** — unplanned; gates any beta.
- **Model bundle vs first-run download** — product decision with offline-install consequences.
- **PostgreSQL 18 → 19 upgrade path** — must be designed before users have data worth losing.
- **Windows isolation backend (`projfs`) for `task isolated: true`** — correctness and overhead unverified.
- **Catalog handoff TS → Python** — generated artifact with version + startup check; a second list will drift.
- **Pre-existing user memory migration** — Hermes `MEMORY.md`/`USER.md` and OMP artifacts need a one-time import into Hindsight with provenance, or first launch silently forgets.
- **Reachability definition and loop-resident OMP inventory** — both must be settled before the milestone can be declared complete.
- **Desktop plugin trust model** — human-reviewed catalog + SHA pinning; do not loosen for convenience.

## Sources

### Local inputs (all read in full)
- `.planning/PROJECT.md` — authoritative brief, decisions, constraints, documented pathologies
- `.planning/research/STACK.md` — versions, Windows build mechanics, supervisor, rebrand tooling
- `.planning/research/FEATURES.md` — capability inventories, 34 collision resolutions, anti-features, MVP
- `.planning/research/ARCHITECTURE.md` — invariants, process topology, tool lifecycle, bypass inventory, lanes, phase dependencies
- `.planning/research/PITFALLS.md` — eight pitfalls, phase ownership, verification checklists, Windows traps

### Primary — upstream repositories and docs (HIGH)
- oh-my-pi — `docs/rpc.md`, `packages/coding-agent/src/modes/rpc/rpc-types.ts`, `docs/tools/{edit,task,lsp,debug,todo}.md`, `docs/{session,compaction,extensions,skills,memory}.md`, `.gitattributes`, `AGENTS.md` — https://github.com/can1357/oh-my-pi
- Hermes Agent — architecture, agent loop, tools runtime, session storage, gateway local sessions, plugins, hooks, context engine plugin, memory provider plugin, skills, Curator, delegation, Kanban, LSP, tool search, checkpoints, goals, Desktop plugin SDK, dashboard plugins, environment variables — https://github.com/NousResearch/hermes-agent and https://hermes-agent.nousresearch.com/docs
- Hindsight — API reference (retain/recall/operations/banks/observations), configuration, services, `.env.example`, Windows smoke workflow — https://github.com/vectorize-io/hindsight and https://hindsight.vectorize.io
- gsd-omp — README, architecture, protocol-v1 EoS contract — https://github.com/tchivs/gsd-omp
- TEI — README, CPU install guide, `router/src/main.rs` flags and defaults, `/health` semantics, v1.9.4 release assets — https://github.com/huggingface/text-embeddings-inference
- pgvector — README (Windows `nmake` build, `ALTER EXTENSION vector UPDATE`) — https://github.com/pgvector/pgvector
- PostgreSQL — license, EDB binaries, `pg_upgrade`, runtime connection settings, Windows wiki — https://www.postgresql.org and https://wiki.postgresql.org
- Windows platform — MAX_PATH, `DeleteFileW` handle semantics, Job Objects, Defender exclusions — https://learn.microsoft.com/windows/win32
- Node `child_process` — `windowsHide`, `detached`, Windows signal semantics — https://nodejs.org/api/child_process.html
- Electron — `app.getPath`, quit events, ASAR archives, security checklist — https://www.electronjs.org/docs
- just — Windows `sh` default, `[windows] set shell`, PowerShell argument caveat — https://github.com/casey/just
- Bun — executables and `bun-windows-x64` compile target — https://bun.com/docs/bundler/executables
- electron-builder — `extraResources`, `asarUnpack`, files executed directly — https://www.electron.build
- ast-grep — `run -p/-r/-l/-U` — https://ast-grep.github.io/reference/cli/run.html
- License texts — MIT (https://opensource.org/license/mit), Apache-2.0 §4/§6 (https://www.apache.org/licenses/LICENSE-2.0)
- Bronson et al., *Metastable Failures in Distributed Systems*, HotOS '21 — https://sigops.org/s/conferences/hotos/2021/papers/hotos21-s11-bronson.pdf

### Secondary — competitor documentation (MEDIUM)
- Claude Code overview — https://code.claude.com/docs/en/overview
- Codex CLI — https://learn.chatgpt.com/docs/codex/cli
- Cursor — https://cursor.com/docs

### Tertiary — inference and unmeasured claims (LOW)
- CPU embed/rerank latency tables (FLOP arithmetic, not measurements) — must be replaced by Phase 6 measurements
- Fusion phase mapping and collision cost estimates — recommendations, not validated plans
- The bounded cost of the RPC-wire rename (derived by intersecting retained commands with the 185-command inventory) — verify against source

---
*Research completed: 2026-10-23*
*Ready for roadmap: yes — subject to the Phase 6 TEI spike and the Phase 5 policy-bridge decision*
