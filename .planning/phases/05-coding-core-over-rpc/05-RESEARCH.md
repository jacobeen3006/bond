# Phase 5: Coding Core over RPC - Research

**Researched:** 2026-10-25
**Domain:** Supervised child-process tool backend (vendored OMP coding core) behind the Phase 4 registry + policy gate, over a JSONL RPC frame protocol with versioned handshake, crash isolation, and deterministic replay.
**Confidence:** HIGH (all load-bearing claims are codebase-grounded; the vendored core and the Phase 2/3/4 plans were read directly this session)

## Summary

Phase 5 turns the vendored OMP coding core (`vendor/oh-my-pi/packages/coding-agent`) into a **supervised tool backend** that the Phase 4 registry dispatches to over RPC. The core already ships a headless JSONL RPC mode (`--mode rpc`, `runRpcMode`) with a ready frame, a `negotiate_protocol` command, protocol-v2 chunked oversized frames, and `id`-correlated request/response pairing [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/modes/rpc/rpc-mode.ts:1347-1374,1894-1899; vendor/oh-my-pi/docs/rpc.md:36-122]. What it does **not** have is a direct, non-turn tool-invocation command: the only non-turn execution path is `bash` [VERIFIED: vendor/oh-my-pi/docs/rpc.md:212-222], and the rest of the protocol is turn-driven (`prompt`/`steer`/`follow_up`). Phase 5 therefore adds a `halo.tool.invoke` command (and the Phase 2 `contractHash` handshake fields) via a provenance patch — the `provenance/patches/series` file is currently empty [VERIFIED: vendor/oh-my-pi/provenance/patches/series:1].

The dispatch seam is the Phase 4 `BatchDispatcher` in `packages/halo_agent`: `register_backend(name, backend)` plus `dispatch_batch(turn_id, requests, cancel)` which returns exactly one `ToolResultEnvelope` per request in input order [VERIFIED: .planning/phases/03-unified-loop-session-authority/03-07-PLAN.md:155; .planning/phases/04-tool-registry-policy-gate/04-01-PLAN.md]. The backend vocabulary is `runtime` plus forward-compatible `omp|mcp|cli|plugin`, structurally accepted and rejected at startup if unregistered [VERIFIED: .planning/phases/04-tool-registry-policy-gate/04-DECISIONS.md (D-G3)]. Phase 5's RPC backend plugs in as the **`omp` backend** — a new `tools/backends/omp.py` module registered via `BatchDispatcher.register_backend("omp", ...)`, sitting beside the Phase 4 `echo_test.py` tracer tool [VERIFIED: .planning/phases/04-tool-registry-policy-gate/04-02-PLAN.md:26-44; .planning/phases/04-tool-registry-policy-gate/04-RESEARCH.md:175].

**The STATE.md blocker is answered:** every built-in tool handler in the core is constructed from a `ToolSession` (which carries `cwd`) and invoked with an `AbortSignal`, so the seven CORE-02 capabilities (`read`, `write`, `edit`, `grep`, `glob`, `bash`, `lsp` diagnostics) are invocable with a supplied `cwd` + `AbortSignal` outside a turn. The handlers that **must be excluded** are those that require a live turn / agent loop / UI / network / memory-backend state (`task`, `todo`, `think`, `wait`, `yield`, `goal`, `ask`, `debug`, `eval`, `github`, `web_search`, the `memory_*` family, `learn`, `manage_skill`, `checkpoint`, `rewind`, `context_notes`, `new_context`, `ida`). See the invocability table in Architecture Patterns.

**Primary recommendation:** Add a `halo.tool.invoke` RPC command to the vendored core (provenance patch) that builds a minimal `ToolSession` from the frame's `cwd` and calls `createTools(session, [name])` then `tool.execute(toolCallId, args, signal)`; register the `omp` backend in `packages/halo_agent/tools/backends/omp.py` to spawn the core, run the versioned handshake, and map `ToolRequest` → `halo.tool.invoke` frame → `ToolResultEnvelope`. Build the frame recorder + deterministic replay and the crash/restart supervisor in the `omp` backend (Python), not in the core.

<user_constraints>
## User Constraints

No CONTEXT.md exists for this phase (the user chose to plan without context). Constraints are taken from AGENTS.md, ROADMAP.md, REQUIREMENTS.md (CORE-01..08), and STATE.md:

- **Windows-first (win32 x64):** child-process supervision must use `windowsHide`, no `detached`, argv arrays (paths contain spaces + non-ASCII), no `shell: true`.
- **CPU-only, no Docker.**
- **RPC frame budget:** adapter-added overhead < 150 ms per tool round-trip (CORE-08).
- **One non-bypassable tool path:** every LLM tool decision reaches exactly one backend through a single adapter and a single policy gate.
- **License/provenance rules:** the coding core is MIT-vendored under `vendor/oh-my-pi`; modifications go through `provenance/patches/` (hand-maintained series, every entry must apply cleanly in order).
- **Build orchestration:** just + bun + cargo + uv; Python 3.14 via uv; the coding core is TS (Bun) + Rust.
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Core process supervision (spawn, restart, crash detection) | API / Backend (Python `omp` backend) | — | The Python adapter owns the child lifecycle; the core is a supervised child, not the supervisor. |
| Versioned handshake (contract hash, protocol version) | API / Backend (Python) + Core (TS) | — | The core emits the ready frame + `contractHash`; the Python adapter sends `halo.negotiate_protocol` and validates. |
| Tool invocation (`halo.tool.invoke`) | Core (TS) | — | The core owns the tool handlers; the Python side only sends the frame and reads the result. |
| Registry resolution + policy gate | API / Backend (Python `halo_agent`) | — | Phase 4 owns `Registry.resolve` + `PolicyGate.evaluate`; Phase 5 does not touch them. |
| Dispatch to the `omp` backend | API / Backend (Python `BatchDispatcher`) | — | `dispatch_batch` routes allowed `ToolRequest`s to the registered `omp` backend. |
| Frame chunking / reassembly (oversized) | Core (TS `RpcFrameEncoder`/`Decoder`) | Python (reassembly) | The core chunks oversized stdout frames (protocol v2); the Python client reassembles by `chunkId`/`index`/`count`. |
| Parallel result pairing (call-id order) | Both (Python matches on `id`) | — | The protocol guarantees `id` echo; the Python client matches responses on `id`, not emission order. |
| Hashline stale-anchor rejection | Core (Rust `pi-edit`) | — | `EditSession.apply` returns `EditError::Match` as a recoverable `isError` result. |
| Frame recorder + deterministic replay | API / Backend (Python) | — | New in Phase 5; records the frame stream and replays it deterministically. |
| Cancellation propagation | Both (Python `AbortSignal` → core `abort`) | — | The Python side aborts the in-flight frame; the core honors the `AbortSignal` in `tool.execute`. |

## Standard Stack

### Core (already present — no new installs for the core side)
| Component | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vendored OMP coding core (`vendor/oh-my-pi`) | upstream commit `0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0` [VERIFIED: vendor/oh-my-pi/provenance/UPSTREAM.json:6] | The tool backend: `read`/`write`/`edit`/`grep`/`glob`/`bash`/`lsp` handlers + RPC mode | MIT-licensed, already vendored in Phase 1; Phase 5 supervises it, does not re-vendor it. |
| Bun (TS runtime) | 1.4.2 [VERIFIED: `bun --version` this session] | Runs the coding core (`bun --cwd=packages/coding-agent src/cli.ts`) | The core's dev/test/build all use Bun [VERIFIED: vendor/oh-my-pi/package.json scripts]. |
| `pi-natives` (Rust N-API addons) | workspace `18.12.6` [VERIFIED: vendor/oh-my-pi/Cargo.toml:24] | Native `edit`/`grep`/`diff` engines behind the tool handlers | The `EditSession` (hashline) and search engines are Rust; built via the Cargo/N-API path. |

### Supporting (Python side — `packages/halo_agent`, from Phase 4)
| Component | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `halo_agent` Python package | Phase 4 (planned, not yet executed) | Registry + policy gate + `BatchDispatcher` + `tools/backends/` | Phase 5 adds `tools/backends/omp.py` here. |
| `uv` | 0.12.17 [VERIFIED: `uv --version` this session] | Python 3.14 environment + `uv run --project packages/halo_agent pytest` | All Phase 4/5 Python verification runs through `uv`. |
| Python 3.14 | 3.14.7 (via uv) [VERIFIED: `uv python list` this session] | Runtime for `halo_agent` | The project standardizes on 3.14 via uv. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Supervised child process (RPC) | In-process import of the core from Python | Rejected: the core is TS/Rust; a child process gives crash isolation (CORE-05) and a clean frame boundary for replay (CORE-06). In-process would couple the Python adapter to the core's event loop and defeat crash isolation. |
| `halo.tool.invoke` RPC command | Reuse the turn-based `prompt` command to drive a tool | Rejected: CORE-01 requires every turn-starting/steering command to be refused as capability-disabled; a tool must be invocable without a turn. |

**Installation:** No new external packages are introduced by Phase 5. The core is already vendored; the Python side uses the Phase 4 `halo_agent` dependency set (verified in Phase 4). The only new *code* is the `omp` backend module and the core provenance patch.

## Package Legitimacy Audit

No new external packages are installed by Phase 5 (the coding core is vendored; the Python side reuses the Phase 4 dependency set). **No packages to audit.** The `omp` backend uses only the Python standard library (`subprocess`, `json`, `hashlib`, `asyncio`) plus the already-audited `halo_agent` dependencies.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Provider reply with tool_calls[]
        │  (Phase 3: assistant row + tool_call_uids persisted)
        ▼
┌─ halo_agent loop: reserve_tool_invocation ×N ─────────────────────────┐
└──────────────┬─────────────────────────────────────────────────────────┘
               ▼
┌─ Phase 4: registry.resolve(name) + PolicyGate.evaluate(ToolRequest) ──┐
│  allow → mark_dispatched → BatchDispatcher.dispatch_batch(...)        │
│  deny  → synthetic tool-result row (nothing executes)                │
└──────────────┬─────────────────────────────────────────────────────────┘
               ▼  (allowed calls, backend == "omp")
┌─ Phase 5: tools/backends/omp.py  (the "omp" backend) ────────────────┐
│  1. ensure_core_alive(): spawn `bun .../cli.ts --mode rpc` if dead  │
│     (windowsHide, argv array, no shell, no detached)                │
│  2. handshake (once per process): read ready frame → validate        │
│     contractHash + protocolVersion → send halo.negotiate_protocol    │
│  3. per ToolRequest: write halo.tool.invoke frame {id, tool, args,   │
│     cwd, signal} ; read response matched on id (not order)          │
│  4. normalize → ToolResultEnvelope (one per request, input order)    │
│  5. frame recorder: append every frame to the session record        │
│  6. crash: detect child exit → typed error → restart (no replay of  │
│     a side-effecting in-flight call)                                │
└──────────────┬─────────────────────────────────────────────────────────┘
               ▼  (JSONL over stdin/stdout)
┌─ vendor/oh-my-pi coding core (child process, --mode rpc) ────────────┐
│  ready frame {protocolVersion, supportedProtocolVersions,             │
│               maxFrameBytes, maxReassembledFrameBytes, contractHash}  │
│  halo.tool.invoke → build minimal ToolSession{cwd} →                 │
│     createTools(session,[name]) → tool.execute(id,args,signal)       │
│  oversized stdout → rpc_chunk frames (v2, ≤64 MiB reassembled)      │
│  hashline stale anchor → EditError::Match → isError result          │
└────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
packages/halo_agent/halo_agent/
├── tools/backends/
│   ├── __init__.py          # marker (Phase 4)
│   ├── echo_test.py         # Phase 4 tracer tool (runtime backend)
│   └── omp.py               # Phase 5: the "omp" backend — supervisor + RPC client
│       #   - CoreSupervisor (spawn/restart/crash)
│       #   - HaloRpcClient (handshake, invoke, chunk reassembly, id matching)
│       #   - FrameRecorder (record + deterministic replay)
├── adapter/dispatch.py      # Phase 3/4 — unchanged; dispatch_batch routes to "omp"
contracts/
└── rpc-wire.json            # Phase 2 — wire contract (commands, frame categories,
                            #   transport limits, contractHash) — the handshake source
vendor/oh-my-pi/
├── provenance/patches/
│   ├── series               # hand-maintained; Phase 5 appends the tool-invoke patch
│   └── halo-tool-invoke.patch   # Phase 5: adds halo.tool.invoke + contractHash fields
└── packages/coding-agent/src/modes/rpc/
    ├── rpc-types.ts         # + RpcToolInvokeCommand / RpcToolInvokeResult
    └── rpc-mode.ts          # + case "tool_invoke" handler (builds ToolSession, createTools, execute)
```

### Pattern 1: Supervised child with a one-shot versioned handshake
**What:** The `omp` backend owns the core's lifecycle. On first use (or after a crash) it spawns the core, reads the ready frame, validates `contractHash` + `protocolVersion`, sends `halo.negotiate_protocol`, and only then accepts `halo.tool.invoke` frames. A contract-hash mismatch is a typed `contract_mismatch` error (fields: `expected`, `got`, `core_version`, `adapter_version`, `action`), never a silent fallback.
**When to use:** Every time the child is (re)started. The handshake is per-process, not per-call.
**Why:** CORE-01 requires the handshake to complete before first use; CORE-05 requires a crash to restart the process and re-run the handshake.

### Pattern 2: `id`-matched, order-independent result pairing
**What:** Every `halo.tool.invoke` frame carries a unique `id`; the core echoes it in the response. The Python client matches responses on `id`, **not** on emission order (the protocol explicitly does not guarantee ordering across concurrent commands [VERIFIED: vendor/oh-my-pi/docs/rpc.md:221-222]). `dispatch_batch` then re-orders the matched results into input order for the `ToolResultEnvelope` tuple.
**When to use:** Every tool round-trip, especially parallel batches.

### Pattern 3: Frame recorder + deterministic replay
**What:** The `omp` backend appends every stdin frame (sent) and stdout frame (received) to a session record. Replay re-drives a recorded session by feeding the recorded stdin frames to a fresh core and asserting the stdout frames match byte-for-byte (modulo the `id`/timing fields that are normalized). This is new in Phase 5 — the core has no built-in recorder.
**When to use:** CORE-06 — reproduce a recorded session deterministically.

### Anti-Patterns to Avoid
- **Driving a tool through `prompt`:** Rejected — CORE-01 requires turn commands to be capability-disabled; a tool must run without a turn.
- **Matching results on emission order:** Rejected — the protocol does not guarantee ordering; always match on `id`.
- **Replaying a side-effecting in-flight call after a crash:** Rejected — CORE-05 requires a restart to NOT replay a call whose side effect may have already happened; surface a typed error instead.
- **`shell: true` / `detached` / string argv on Windows:** Rejected — AGENTS.md Windows-first rule; use an argv array, `windowsHide`, no `detached`, no `shell: true`.
- **Building the recorder/replay/supervisor inside the core:** Rejected — keep the core's patch surface minimal (one command + handshake fields); the supervision and replay live in the Python `omp` backend.

### Built-in Tool Handler Invocability (STATE.md blocker — answered)

Every built-in tool is constructed from a `ToolSession` (which carries `cwd: string`) and invoked via `AgentToolExecFn(toolCallId, params, signal?: AbortSignal, onUpdate?, context?)` [VERIFIED: vendor/oh-my-pi/packages/agent/src/types.ts:1100-1107; vendor/oh-my-pi/packages/coding-agent/src/tools/index.ts:209-211,558-589]. `createTools(session, toolNames)` is the factory [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/tools/index.ts:835]. A minimal `ToolSession` with `cwd`, `settings`, `hasUI: false`, and `getSessionFile` is sufficient for the file/shell/LSP handlers; the turn-bound fields (`sessionManager`, `getActiveModel`, `isDisposed`, `getPlanModeState`) are all optional.

| Handler | Factory (VERIFIED) | cwd source | AbortSignal | Invocable outside a turn? | Verdict |
|---------|--------------------|------------|-------------|---------------------------|---------|
| `read` | `new ReadTool(s)` [tools/index.ts:559] | `session.cwd` [read.ts:952] | `execute(..., signal?)` [read.ts] | Yes | **INCLUDE (CORE-02)** |
| `write` | `new WriteTool(s)` [tools/index.ts:582] | `session.cwd` | `execute(..., signal?)` | Yes | **INCLUDE (CORE-02)** |
| `edit` | `new EditTool(s, mode?)` [tools/index.ts:562] | `session.cwd` via `#policy` [edit/index.ts:661] | `execute(..., signal?)` [edit/index.ts:523] | Yes | **INCLUDE (CORE-02, CORE-03)** |
| `grep` | `new GrepTool(s, options?)` [tools/index.ts:571] | `session.cwd` [grep.ts:497] | `execute(..., signal?)` + `untilAborted(signal, …)` [grep.ts:557,561] | Yes | **INCLUDE (CORE-02)** |
| `glob` | `new GlobTool(s, {rootPathAlias:true})` [tools/index.ts:570] | `session.cwd` | `execute(..., signal?)` | Yes | **INCLUDE (CORE-02)** |
| `bash` | `new BashTool(s)` [tools/index.ts:561] | `session.cwd` | `execute(..., signal?)` + abort listeners [bash.ts:1009,1319-1375] | Yes | **INCLUDE (CORE-02, CORE-04)** |
| `lsp` (diagnostics) | `LspTool.createIf(s)` [tools/index.ts:573] | `session.cwd` | `execute(..., signal?)` + `AbortSignal.any` [lsp/tool.ts:209-230] | Yes (diagnostics action) | **INCLUDE (CORE-02)** |
| `find` | `new FindTool(s)` [tools/index.ts:572] | `session.cwd` | `execute(..., signal?)` | Yes (file search) | Optional — not in the CORE-02 minimum set |
| `ast_grep` / `ast_edit` | `new AstGrepTool(s)` / `new AstEditTool(s)` [tools/index.ts:563-564] | `session.cwd` | `execute(..., signal?)` | Yes (file/AST) | Optional — not in the CORE-02 minimum set |
| `security_scan` | `new SecurityScanTool(s)` [tools/index.ts:560] | `session.cwd` | `execute(..., signal?)` | Yes (file) | Optional — not in the CORE-02 minimum set |
| `task` | `TaskTool.create(s)` [tools/index.ts:578] | spawns subagents | — | **No** — needs agent loop + spawn coordination | **EXCLUDE** |
| `todo` | `new TodoTool(s)` [tools/index.ts:580] | turn state | — | **No** — per-turn todo list | **EXCLUDE** |
| `think` | `new ThinkTool()` [tools/index.ts:592] | no session | — | **No** — hidden, no cwd | **EXCLUDE** |
| `wait` | `new WaitTool(s)` [tools/index.ts:579] | agent activity snapshot | — | **No** — needs agent loop | **EXCLUDE** |
| `yield` | `new YieldTool(s)` [tools/index.ts:593] | subagent context | — | **No** — subagent-only | **EXCLUDE** |
| `goal` | `new GoalTool(s)` [tools/index.ts:594] | goal state | — | **No** — hidden, turn-bound | **EXCLUDE** |
| `ask` | `AskTool.createIf` [tools/index.ts:565] | prompts a human | — | **No** — needs UI / user channel | **EXCLUDE** |
| `debug` | `DebugTool.createIf` [tools/index.ts:566] | DAP session | — | **No** — needs debug session state | **EXCLUDE** |
| `eval` | `new EvalTool(s)` [tools/index.ts:568] | eval executor session | — | **No** — needs eval session | **EXCLUDE** |
| `github` | `GithubTool.createIf` [tools/index.ts:569] | network + auth | — | **No** — network, not a core file/shell capability | **EXCLUDE** |
| `web_search` | `new WebSearchTool(s)` [tools/index.ts:581] | network | — | **No** — network | **EXCLUDE** |
| `memory_edit` / `retain` / `recall` / `reflect` | `MemoryEditTool.createIf` etc. [tools/index.ts:583-586] | memory backend | — | **No** — needs memory backend | **EXCLUDE** |
| `learn` | `LearnTool.createIf` [tools/index.ts:587] | memory | — | **No** — needs memory | **EXCLUDE** |
| `manage_skill` | `ManageSkillTool.createIf` [tools/index.ts:588] | skill state | — | **No** — skill management | **EXCLUDE** |
| `checkpoint` / `rewind` | `CheckpointTool.createIf` / `RewindTool.createIf` [tools/index.ts:574-575] | session checkpoint state | — | **No** — session checkpoint | **EXCLUDE** |
| `context_notes` / `new_context` | `ContextNotesTool.createIf` / `NewContextTool.createIf` [tools/index.ts:576-577] | context state | — | **No** — context state | **EXCLUDE** |
| `ida` | `IdaTool.createIf` [tools/index.ts:567] | IDA disassembler | — | **No** — needs IDA | **EXCLUDE** |

**Exclusion rule for the `halo.tool.invoke` handler:** only the seven INCLUDE handlers (plus the three optional file/AST handlers if the manifest grants them) are reachable; any other tool name in a `halo.tool.invoke` frame is refused with a typed `capability_disabled` error. This is the core-side half of CORE-01/CORE-02.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Oversized frame chunking / reassembly | A custom length-prefixed or base64 chunk protocol | The core's existing `RpcFrameEncoder`/`RpcFrameDecoder` (protocol v2 `rpc_chunk` frames) [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/modes/rpc/rpc-frame.ts:1-13] | Already handles the 1 MiB physical cap, 256 KiB chunks, 64 MiB reassembly cap, and the `chunkId`/`index`/`count`/`byteLength` framing. Re-rolling it would diverge from the core. |
| Call-id pairing | A sequence-number / FIFO assumption | Match responses on the echoed `id` [VERIFIED: vendor/oh-my-pi/docs/rpc.md:110-113,221-222] | The protocol explicitly does not guarantee emission order across concurrent commands. |
| Hashline stale-anchor rejection | A Python-side content-hash check | The Rust `pi-edit` `EditSession.apply` → `EditError::Match` [VERIFIED: vendor/oh-my-pi/crates/pi-edit/src/modes/hashline/mismatch.rs:74-144] | The anchor is a per-session tag; only the core's `EditSession` knows the current tag. A Python re-check would race the file and duplicate the logic. |
| Child-process supervision on Windows | A `shell: true` / string-command spawn | `subprocess` with an argv array, `creationflags=CREATE_NO_WINDOW` (the `windowsHide` equivalent), no `detached` | AGENTS.md Windows-first rule; paths contain spaces + non-ASCII. |
| Contract-hash computation | A bespoke canonicalization | The Phase 2 `CONTRACT_HASH` = sha256 of canonical sorted-key, fixed-separator UTF-8 bytes of the wire contract (minus its own `contractHash` field) [CITED: .planning/phases/02-rebrand-wire-contract-migration/02-02-PLAN.md] | The hash must be byte-identical across TS/Rust/Python; the Phase 2 generated modules already compute it. |

**Key insight:** The core already implements the hard parts of the frame protocol (chunking, reassembly, `id` echo, the ready frame, `negotiate_protocol`). Phase 5's job is to (a) add one command (`halo.tool.invoke`) and the handshake fields via a provenance patch, and (b) build the Python-side supervisor + recorder + replay. Re-rolling any of the core's frame machinery would create a second, divergent protocol.

## Common Pitfalls

### Pitfall 1: Treating the RPC mode as turn-only
**What goes wrong:** Assuming the core can only run tools inside a `prompt` turn, so Phase 5 tries to drive a tool through `prompt`/`steer`.
**Why it happens:** The documented protocol is turn-centric; the only non-turn command is `bash`.
**How to avoid:** Add the `halo.tool.invoke` command that builds a minimal `ToolSession` and calls `createTools` + `tool.execute` directly, outside any turn.
**Warning signs:** A tool call that requires an active `AgentSession` turn, or a `prompt` frame being emitted for a single tool.

### Pitfall 2: Matching results on emission order
**What goes wrong:** Pairing a response to the wrong request in a parallel batch.
**Why it happens:** The protocol does not guarantee ordering across concurrent commands [VERIFIED: vendor/oh-my-pi/docs/rpc.md:221-222].
**How to avoid:** Always match on the echoed `id`; re-order into input order only at the `ToolResultEnvelope` boundary.
**Warning signs:** Interleaved responses in a parallel batch; a test that passes serially but fails in parallel.

### Pitfall 3: Replaying a side-effecting call after a crash
**What goes wrong:** After the core dies mid-`bash`, the supervisor restarts and re-sends the in-flight frame, double-executing a side effect.
**Why it happens:** A naive restart re-drives the last request.
**How to avoid:** On crash, surface a typed error for the in-flight call and do NOT re-send it; only re-send idempotent calls if the manifest marks them `idempotent: true`.
**Warning signs:** A `bash` that ran twice after a crash; a non-idempotent call replayed.

### Pitfall 4: `shell: true` / string argv on Windows
**What goes wrong:** The spawn breaks on paths with spaces or non-ASCII, or a console window flashes.
**Why it happens:** Windows `CreateProcess` quoting rules differ from POSIX.
**How to avoid:** Use an argv array, `creationflags=CREATE_NO_WINDOW`, no `detached`, no `shell: true`.
**Warning signs:** A spawn that fails on a path with a space; a visible console window.

### Pitfall 5: Handshaking per call instead of per process
**What goes wrong:** Re-running the ready-frame read + `negotiate_protocol` on every tool call, adding latency and racing the core.
**Why it happens:** Treating the handshake as a per-request step.
**How to avoid:** Run the handshake once per (re)started process; cache the validated contract; re-handshake only after a restart.
**Warning signs:** A ready frame read on every call; `negotiate_protocol` in the hot path.

### Pitfall 6: Building the recorder/replay/supervisor in the core
**What goes wrong:** A large core patch that is hard to keep clean across upstream updates.
**Why it happens:** Putting all Phase 5 machinery in the vendored core.
**How to avoid:** Keep the core patch minimal (one command + handshake fields); put supervision, recording, and replay in the Python `omp` backend.
**Warning signs:** A core patch that touches more than the ready frame + one command handler.

## Code Examples

### Core-side: `halo.tool.invoke` handler (provenance patch, sketch)
```typescript
// Source: pattern from vendor/oh-my-pi/packages/coding-agent/src/modes/rpc/rpc-mode.ts:1894-1899 (negotiate_protocol)
// and src/tools/index.ts:835 (createTools) + packages/agent/src/types.ts:1100-1107 (AgentToolExecFn)
case "tool_invoke": {
  const { tool, args, cwd, id } = command;
  if (!TOOL_BACKEND_ALLOWLIST.has(tool))
    return error(id, "tool_invoke", `capability_disabled: ${tool}`);
  const session: ToolSession = {
    cwd,
    settings: { /* minimal */ },
    hasUI: false,
    getSessionFile: () => null,
    // turn-bound fields intentionally omitted (all optional)
  };
  const [toolImpl] = await createTools(session, [tool]);
  const signal = abortControllers.get(id); // wired to the "abort" command
  const result = await toolImpl.execute(id, args, signal);
  return success(id, "tool_invoke", {
    ok: !result.isError,
    text: result.content.map(c => c.text).join(""),
    isError: result.isError,
  });
}
```

### Python-side: `omp` backend spawn + handshake (sketch)
```python
# Source: AGENTS.md Windows-first rule; Phase 2 wire contract (02-02-PLAN.md)
import subprocess, json, hashlib

def spawn_core(bun, cli_ts):
    # argv array (paths may contain spaces + non-ASCII); no shell, no detached
    return subprocess.Popen(
        [bun, "--cwd", "packages/coding-agent", cli_ts, "--mode", "rpc"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        creationflags=subprocess.CREATE_NO_WINDOW,  # windowsHide equivalent
    )

def handshake(proc, expected_contract_hash):
    ready = json.loads(proc.stdout.readline())          # first stdout frame
    assert ready["type"] == "ready"
    if ready.get("contractHash") != expected_contract_hash:
        raise ContractMismatch(expected=expected_contract_hash,
                               got=ready.get("contractHash"),
                               core_version=ready.get("coreVersion"),
                               adapter_version=ADAPTER_VERSION, action="refuse")
    proc.stdin.write(json.dumps({"type": "negotiate_protocol",
                                 "protocolVersion": 2,
                                 "contractHash": expected_contract_hash}) + "\n")
    proc.stdin.flush()
```

### Python-side: `id`-matched result pairing (sketch)
```python
# Source: vendor/oh-my-pi/docs/rpc.md:110-113,221-222
def invoke(proc, tool, args, cwd, call_id, pending):
    proc.stdin.write(json.dumps({"type": "tool_invoke", "id": call_id,
                                 "tool": tool, "args": args, "cwd": cwd}) + "\n")
    proc.stdin.flush()
    # read frames until one echoes our id (NOT the next frame in order)
    while True:
        frame = json.loads(proc.stdout.readline())
        if frame.get("id") == call_id:
            return frame
        pending.put(frame)  # route other ids to their waiters
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| In-process tool execution (Hermes) | Supervised child process over JSONL RPC | Phase 5 (this phase) | Crash isolation (CORE-05), a clean frame boundary for replay (CORE-06), and a single non-bypassable tool path. |
| Turn-driven tool use (`prompt`) | Direct `halo.tool.invoke` outside a turn | Phase 5 | A tool runs without a turn; turn commands are capability-disabled (CORE-01). |
| No contract hash in the ready frame | `contractHash` + `contractVersion` in the ready frame + `halo.negotiate_protocol` validation | Phase 2 (prerequisite) | A versioned, hash-checked handshake; a mismatch is a typed `contract_mismatch`, never a silent fallback. |

**Deprecated/outdated:**
- Driving a single tool through `prompt`/`steer`: superseded by `halo.tool.invoke`; turn commands are capability-disabled in tool-backend mode.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A minimal `ToolSession` with `cwd`, `settings`, `hasUI: false`, `getSessionFile` is sufficient to construct and execute the seven INCLUDE handlers outside a turn. | Architecture Patterns (invocability table) | If a handler reads a turn-bound field at `execute` time (not just construction), the `halo.tool.invoke` handler must populate it. Mitigation: the `halo.tool.invoke` patch is verified per-handler in the core's own `bun test` suite before the Python side is wired. |
| A2 | The `lsp` tool's `diagnostics` action is invocable outside a turn given `enableLsp`/`lspReadOnly` on the `ToolSession`. | Architecture Patterns (invocability table) | If LSP requires a live session manager, the `lsp` handler must be excluded from the CORE-02 set or the session must carry a minimal `sessionManager`. Mitigation: verify `LspTool.createIf` + `diagnostics` in isolation. |
| A3 | The Phase 2 wire contract (`contracts/rpc-wire.json`) and its generated `CONTRACT_HASH` modules (TS/Rust/Python) will be in place when Phase 5 executes (Phase 2 is a prerequisite). | Summary, Don't Hand-Roll | If Phase 2 is not complete, the handshake has no contract hash to validate. Mitigation: Phase 5's plan gates on Phase 2's `contractHash` being present in the ready frame. |
| A4 | The Phase 4 `BatchDispatcher` + `tools/backends/` package + `tests/conftest.py` scaffolding will be in place when Phase 5 executes (Phase 4 is a prerequisite). | Summary, Architecture Patterns | If Phase 4 is not complete, there is no `register_backend("omp", ...)` seam. Mitigation: Phase 5's plan gates on the Phase 4 `omp`-backend slot. |
| A5 | The `halo.tool.invoke` command name and the `contractHash`/`contractVersion` ready-frame fields are the exact wire names the Phase 2 contract assigns. | Code Examples | If the Phase 2 contract uses different names, the patch must match them. Mitigation: the patch is generated against `contracts/rpc-wire.json`, not hand-named. |

## Open Questions (RESOLVED)

1. **Exact `halo.tool.invoke` frame schema.**
   - What we know: the command must carry `id`, `tool`, `args`, `cwd`, and an abort handle; the response must echo `id` and carry `ok`/`text`/`isError`.
   - What's unclear: whether `args` is the raw tool-parameter object or a serialized string; whether the abort is a separate `abort` command keyed by `id` or an inline signal.
   - Recommendation: define the frame in `contracts/rpc-wire.json` (Phase 2 contract) so the TS and Python sides share one source of truth; default to `args` = raw object and abort = a separate `abort` command keyed by `id` (matching the existing `abort_bash` pattern [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/modes/rpc/rpc-types.ts]).
   - RESOLVED: defined in `contracts/rpc-wire.json` with a separate `abort` command keyed by `id` (05-01 adds the `halo.tool.invoke` entry; 05-04 adds `abort` handling to `HaloRpcClient`).

2. **Which optional handlers (find / ast_grep / ast_edit / security_scan) are in scope for CORE-02.**
   - What we know: the CORE-02 minimum set is `read`/`write`/`edit`/`grep`/`glob`/`bash`/`lsp`.
   - What's unclear: whether the manifest grants the four optional file/AST handlers.
   - Recommendation: default to the seven-handler minimum set; add the optional handlers only if the `tool-ownership.json` manifest names them.
   - RESOLVED: seven-tool minimum allowlist (`read`/`write`/`edit`/`grep`/`glob`/`bash`/`lsp` diagnostics); the four optional handlers (`find`/`ast_grep`/`ast_edit`/`security_scan`) are out of scope.

3. **Deterministic-replay normalization rules.**
   - What we know: replay must reproduce a recorded session deterministically (CORE-06).
   - What's unclear: which fields are normalized (timing, `id`, absolute paths) vs. compared byte-for-byte.
   - Recommendation: normalize `id`, timestamps, and absolute-path prefixes; compare the rest byte-for-byte. Record the normalization rules in the replay suite so they are auditable.
   - RESOLVED: normalize `id`/timestamps/absolute-path prefixes, byte-compare the rest (05-06).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | Run the coding core + TS tests | ✓ | 1.4.2 | — |
| Node | Tooling | ✓ | v22.23.2 | — |
| `uv` | Python 3.14 + `halo_agent` verification | ✓ | 0.12.17 | — |
| Python 3.14 | `halo_agent` runtime | ✓ (via uv) | 3.14.7 | — |
| `cargo` / `rustc` | Build `pi-natives` (the `edit`/`grep` Rust engines) | ✗ | — | **BLOCKING** — must install Rust before the core's native tools can run. The host native build uses the Cargo/N-API path (`packages/natives/scripts/build-bindings.ts`), not Bazel [VERIFIED: vendor/oh-my-pi/scripts/bazel-natives.ts:25-27]. |
| `just` | Build orchestration | ✗ | — | Use `bun` scripts directly. |
| `bazel` | Cross-compile native addons | ✗ | — | Not needed for host iteration (the `host` pseudo-target uses the Cargo/N-API path by default). |

**Missing dependencies with no fallback (BLOCKING):**
- `cargo` / `rustc` — the `pi-natives` addons (which back the `edit`/`grep`/`diff` engines) are not prebuilt (no `.node` files present [VERIFIED: `find vendor/oh-my-pi -name "*.node"` returned none this session]). The host build path is Cargo/N-API. **Rust must be installed before the coding core's native tools can be exercised.** This is a Phase 5 execution prerequisite, not a planning blocker.

**Missing dependencies with fallback:**
- `just` — use `bun` scripts directly.
- `bazel` — not needed for host iteration.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (Python) | `pytest` (via `uv run --project packages/halo_agent pytest`) |
| Framework (TS core) | `bun test` (Bun built-in runner) [VERIFIED: vendor/oh-my-pi/packages/natives/package.json scripts.test] |
| Framework (Rust) | `cargo test` (via `bun scripts/run-rs-task.ts test:rs`) [VERIFIED: vendor/oh-my-pi/crates/pi-edit has `#[cfg(test)]` modules] |
| Config file | `packages/halo_agent` pytest config (Phase 4); `bun` for TS/Rust |
| Quick run command (Python) | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/backends/test_omp.py -x` |
| Full suite command (Python) | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests -x` |
| Quick run command (TS core) | `bun test packages/coding-agent/test/rpc-tool-invoke.test.ts` |
| Full suite command (TS core) | `bun scripts/ci-test-ts.ts local` [VERIFIED: vendor/oh-my-pi/scripts/ci-test-ts.ts] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CORE-01 | Core spawned in tool-backend mode; versioned handshake completes; turn commands refused as capability-disabled | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/backends/test_omp_handshake.py -x` | ❌ Wave 0 |
| CORE-02 | The seven tools reachable as registry tools; each invocation carries a policy decision | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/backends/test_omp_tools.py -x` | ❌ Wave 0 |
| CORE-03 | Hashline edit rejects a stale content anchor before writing, with a recoverable error | unit (Rust) + integration | `bun scripts/run-rs-task.ts test:rs -p pi-edit hashline` + `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/backends/test_omp_edit_stale.py -x` | ❌ Wave 0 |
| CORE-04 | Cancellation propagates into running core work; abort stops it in bounded time | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/backends/test_omp_cancel.py -x` | ❌ Wave 0 |
| CORE-05 | A core crash is detected, surfaced in the transcript, and restarted without losing the session or replaying a side-effecting call | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/backends/test_omp_crash_restart.py -x` | ❌ Wave 0 |
| CORE-06 | A frame recorder and replay suite reproduce a recorded session deterministically | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/backends/test_omp_replay.py -x` | ❌ Wave 0 |
| CORE-07 | Oversized frames chunk and reassemble; parallel tool results match to call ids in order | unit (TS) + integration | `bun test packages/coding-agent/test/rpc-frame.test.ts` + `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/backends/test_omp_chunk_parallel.py -x` | ❌ Wave 0 |
| CORE-08 | Adapter-added overhead stays under 150 ms per tool round-trip | benchmark | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/backends/test_omp_overhead.py -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/backends/test_omp.py -x` (the touched backend test file)
- **Per wave merge:** `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests -x` (full Python suite) + `bun test packages/coding-agent/test/rpc-*.test.ts` (core RPC tests)
- **Phase gate:** Full Python suite + core RPC test suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `packages/halo_agent/tests/backends/test_omp.py` — shared `omp`-backend fixture (spawn a stub core, handshake, one invoke)
- [ ] `packages/halo_agent/tests/backends/test_omp_handshake.py` — covers CORE-01
- [ ] `packages/halo_agent/tests/backends/test_omp_tools.py` — covers CORE-02
- [ ] `packages/halo_agent/tests/backends/test_omp_edit_stale.py` — covers CORE-03
- [ ] `packages/halo_agent/tests/backends/test_omp_cancel.py` — covers CORE-04
- [ ] `packages/halo_agent/tests/backends/test_omp_crash_restart.py` — covers CORE-05
- [ ] `packages/halo_agent/tests/backends/test_omp_replay.py` — covers CORE-06
- [ ] `packages/halo_agent/tests/backends/test_omp_chunk_parallel.py` — covers CORE-07
- [ ] `packages/halo_agent/tests/backends/test_omp_overhead.py` — covers CORE-08
- [ ] `packages/coding-agent/test/rpc-tool-invoke.test.ts` — core-side `halo.tool.invoke` handler (per-handler, the A1/A2 mitigation)
- [ ] A stub/fake core (a small Bun script that speaks the ready frame + `tool_invoke` + `rpc_chunk`) so the Python backend tests run without the full native build (works around the `cargo` blocker for the Python-side tests).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | The core is a local supervised child; no external auth. The handshake is a contract-hash check, not authentication. |
| V3 Session Management | yes | The `omp` backend owns the child lifecycle; a crash restarts the process and re-runs the handshake. Session state (the frame record) is owned by the Python side. |
| V4 Access Control | yes | The Phase 4 `PolicyGate` is the single access-control point; the core-side `capability_disabled` refusal is a second, defense-in-depth gate. |
| V5 Input Validation | yes | The `halo.tool.invoke` frame is validated (tool name against the allowlist, `args` against the tool schema, `cwd` against the workspace roots) before `tool.execute`. |
| V6 Cryptography | yes | `CONTRACT_HASH` = sha256 of the canonical wire contract [CITED: .planning/phases/02-rebrand-wire-contract-migration/02-02-PLAN.md]. Never hand-roll the canonicalization. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A malformed / oversized RPC frame | Tampering | The core's `RpcFrameDecoder` enforces the 1 MiB physical cap and 64 MiB reassembly cap [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/modes/rpc/rpc-frame.ts:1-13]; the Python client rejects a frame that exceeds the reassembly cap. |
| A tool name outside the allowlist | Elevation of privilege | The core-side `capability_disabled` refusal + the Phase 4 `PolicyGate` deny-default. |
| A `cwd` outside the workspace roots | Tampering / Information disclosure | The Phase 4 `PolicyGate` validates `cwd` against the per-turn workspace-roots snapshot before dispatch; the core-side handler re-checks `cwd`. |
| A contract-hash mismatch (a tampered or wrong core) | Spoofing / Tampering | A typed `contract_mismatch` error refuses the process; never a silent fallback. |
| A replayed side-effecting call after a crash | Tampering | On crash, surface a typed error and do NOT re-send the in-flight call; only re-send `idempotent: true` calls. |
| Path traversal via a tool `args` path | Tampering | The tool handlers resolve paths against `session.cwd`; the Phase 4 `PolicyGate` validates the `fs.*` capability. |

## Sources

### Primary (HIGH confidence — read directly this session)
- `vendor/oh-my-pi/packages/coding-agent/src/modes/rpc/rpc-mode.ts` — `runRpcMode` (1347-1374), ready frame emission, `negotiate_protocol` handler (1894-1899), `handleCommand` dispatch.
- `vendor/oh-my-pi/packages/coding-agent/src/modes/rpc/rpc-frame.ts` — `MAX_RPC_FRAME_BYTES`, `MAX_RPC_REASSEMBLED_BYTES`, `RPC_CHUNK_PAYLOAD_BYTES`, `RpcFrameEncoder`/`RpcFrameDecoder`.
- `vendor/oh-my-pi/packages/coding-agent/src/modes/rpc/rpc-types.ts` — `RpcReadyFrame`, `RpcChunkFrame`, command/frame type union.
- `vendor/oh-my-pi/docs/rpc.md` — protocol v1/v2, frame caps, `id` echo, ordering guarantee (36-122, 212-222).
- `vendor/oh-my-pi/packages/coding-agent/src/tools/index.ts` — `ToolSession` (209-211), `BUILTIN_TOOLS`/`HIDDEN_TOOLS` (558-595), `createTools` (835).
- `vendor/oh-my-pi/packages/agent/src/types.ts` — `AgentToolExecFn` (1100-1107).
- `vendor/oh-my-pi/crates/pi-edit/src/modes/hashline/mismatch.rs` — `format_mismatch_message` (74-122), `mismatch_error` (142-144).
- `vendor/oh-my-pi/crates/pi-edit/src/error.rs` — `EditError` enum + `Match` variant.
- `vendor/oh-my-pi/packages/coding-agent/src/edit/index.ts` — `EditTool.execute` recoverable `isError` (520-614), `#policy` (655-675).
- `vendor/oh-my-pi/provenance/UPSTREAM.json` — upstream commit.
- `vendor/oh-my-pi/provenance/patches/series` — empty (hand-maintained).
- `vendor/oh-my-pi/Cargo.toml` — workspace members + version.
- `vendor/oh-my-pi/scripts/bazel-natives.ts` — host native build = Cargo/N-API path.
- `.planning/phases/03-unified-loop-session-authority/03-07-PLAN.md` — `ToolRequest`/`ToolResultEnvelope` shapes, `dispatch_batch`.
- `.planning/phases/04-tool-registry-policy-gate/04-01-PLAN.md`, `04-02-PLAN.md`, `04-03-PLAN.md`, `04-DECISIONS.md`, `04-RESEARCH.md` — the `BatchDispatcher` seam, `tools/backends/` package, backend vocabulary, the `halo.tool.invoke` Phase 5 slot.

### Secondary (MEDIUM confidence)
- `.planning/phases/02-rebrand-wire-contract-migration/02-02-PLAN.md`, `02-03-PLAN.md` — the wire contract, `CONTRACT_HASH`, the handshake, the generated modules.

### Tertiary (LOW confidence)
- None. All load-bearing claims are codebase-grounded (Primary) or plan-grounded (Secondary).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — the core, Bun, `pi-natives`, and the Python toolchain were all verified directly (versions probed this session).
- Architecture: HIGH — the dispatch seam, the frame protocol, and the tool invocability were all read from source this session.
- Pitfalls: HIGH — each pitfall maps to a verified protocol guarantee or an AGENTS.md rule.

**Research date:** 2026-10-25
**Valid until:** ~30 days (the vendored core is pinned to upstream commit `0b5c27ab`; the Phase 2/4 prerequisites are the main invalidation risk).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CORE-01 | HALO spawns the coding core as a child process and completes a versioned handshake before first use | The `omp` backend supervisor (spawn + per-process handshake); the core's ready frame + `negotiate_protocol`; turn commands refused as capability-disabled. See Pattern 1 + the invocability exclusion rule. |
| CORE-02 | File read/write/edit, grep, glob, shell, and LSP diagnostics are reachable as registry tools | The seven INCLUDE handlers in the invocability table; the `halo.tool.invoke` command; the `omp` backend registered on the `BatchDispatcher`. |
| CORE-03 | Hashline edit rejects stale content anchors before writing, with a recoverable error | The Rust `pi-edit` `EditError::Match` → `isError` result (not a throw). See the Don't Hand-Roll row + the CORE-03 test. |
| CORE-04 | Cancellation propagates into running core work; abort stops it in bounded time | The `AbortSignal` threaded through `tool.execute`; the `abort` command keyed by `id`. See the invocability table (bash/grep/lsp abort handling). |
| CORE-05 | A core crash is detected, surfaced in the transcript, and restarted without losing the session | The `omp` backend supervisor (crash detection + restart + re-handshake); no replay of a side-effecting in-flight call. See Pitfall 3. |
| CORE-06 | A frame recorder and replay suite reproduce a recorded session deterministically | The `FrameRecorder` in the `omp` backend (new); the normalization rules. See Pattern 3 + Open Question 3. |
| CORE-07 | Oversized frames are chunked and reassembled, and parallel tool results are matched to their call ids in order | The core's `RpcFrameEncoder`/`RpcFrameDecoder` (v2 `rpc_chunk`); `id`-matched pairing re-ordered into input order. See Pattern 2 + the Don't Hand-Roll rows. |
| CORE-08 | Adapter-added overhead stays under 150 ms per tool round-trip | The per-process (not per-call) handshake; the `id`-matched read loop; the CORE-08 benchmark test. See Pitfall 5. |
</phase_requirements>
