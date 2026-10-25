# Phase 10: Desktop & CLI Product Surface - Research

**Researched:** 2026-10-25
**Domain:** Product surface — Electron Desktop + CLI as two thin clients of one Python daemon, exposing chat, sessions, memory, lanes, approvals and settings
**Confidence:** MEDIUM-HIGH. The HALO-side contract (daemon, store, gate, scheduler, Hindsight API) is HIGH — every anchor was read verbatim from committed Phase 1–9 planning artifacts and the vendored trees this session. The Desktop/CLI *implementation* is MEDIUM — it is new code built on the vendored Hermes-Desktop base, and the exact daemon transport (WS vs HTTP/SSE) is a design decision the planner must lock (see Open Questions).

> **Hard dependency — state this in every plan.** Phases 2–9 are *planned, unexecuted*: the repo contains `.planning/`, `AGENTS.md`, `vendor/`, `tools/`, `tests/`, `package.json`, `justfile` — but no `apps/`, `packages/`, or `contracts/` yet [VERIFIED: `ls` of repo root this session]. Phase 10 therefore: (a) carries an explicit `<precondition>` that Phases 3 (daemon + store), 4 (gate), 8 (sidecars), and 9 (scheduler) have executed; (b) grounds every seam on the prior-phase PLAN.md/RESEARCH.md, not on implemented code; (c) puts the vendored-symbol verification (Electron, assistant-ui, xterm, codemirror, node-pty) in a Wave-0 task that runs against the imported tree.

## Summary

Phase 10 is the product surface. It turns the daemon (the Python `halo_agent` package from Phase 3) into a long-running process that both the Desktop (Electron) and the CLI attach to, and it builds the six surfaces the user sees: **chat, session list/resume/branch, diff review, terminal, memory page, lanes panel**, plus the **approval round-trip** and the **settings page**.

The single most important architectural fact: **the Desktop and CLI are thin clients over ONE daemon; they never open the session store for writes.** Phase 3 established the store as the single source of truth (SQLite WAL, FTS5, single-writer thread, `message_uid` preserved across compaction/branch/export/import) and stated explicitly: "A surface that opens the DB for writes. CLI/Desktop call the daemon (Phase 10)" [VERIFIED: 03-01-PLAN.md / 03-RESEARCH.md]. Phase 10 "replaces the UX, not the implementation" — the `halo-agent sessions <resume|list|search|branch|export|import>` console script from Phase 3 becomes the CLI's surface, but the store and the loop stay in the daemon [VERIFIED: 03-01-PLAN.md].

The transport is the rebranded OMP RPC protocol. OMP RPC is a custom JSONL protocol (not JSON-RPC 2.0) with a `ready` frame advertising `maxFrameBytes: 1048576` and `maxReassembledFrameBytes: 67108864`, a `negotiate_protocol` v2 handshake for lossless `rpc_chunk` reassembly, 18 outbound frame categories and 4 inbound, and request/response correlation via `id` [VERIFIED: vendor/oh-my-pi/docs/rpc.md:38-107]. Phase 2 rebrands this to `halo.<suffix>` naming (185 commands, 18 frame categories, `CONTRACT_HASH` handshake). Because OMP RPC is 1:1 over stdio (the client spawns the agent child) but HALO needs 1:N (one daemon, many clients), the daemon exposes the protocol over a **connectable loopback transport (WebSocket)** — Phase 3 research states "surfaces attach over loopback HTTP/WS" and "Phase 10 daemon WS must chunk at 1 MiB and reassemble" [VERIFIED: 03-RESEARCH.md]. The exact transport (WS vs HTTP/SSE) is a design decision — see Open Questions.

The Desktop is derived from the vendored Hermes-Desktop (`vendor/hermes-agent/apps/desktop/`): Electron + React 19 + `@assistant-ui/react` (chat) + `@xterm/xterm` (terminal) + `@codemirror/*` (diff review) + `@tanstack/react-query` (data) + `node-pty` (PTY) + `ws` (WebSocket) [VERIFIED: vendor/hermes-agent/apps/desktop/package.json]. The main process spawns the Python backend as a child with Windows tree-kill (`taskkill /T /F`) and POSIX group-signal teardown [VERIFIED: vendor/hermes-agent/apps/desktop/electron/backend-child.ts]. Phase 10 adapts this: instead of spawning a per-app backend, the Desktop connects to the shared daemon.

**Primary recommendation:** Build in this order — (1) **Wave 0:** verify the vendored Desktop base (Electron, assistant-ui, xterm, codemirror, node-pty) against the imported tree + lock the daemon transport (WS over loopback) + lock the Electron version (stack pin 45.0.0 vs vendored 44.9.3); (2) **daemon transport:** the `halo_agent` daemon exposes the rebranded RPC protocol over a loopback WS server (1 MiB chunking via `rpc_chunk`), with a single-writer store and the `runtime_epoch` ownership row; (3) **CLI surface:** the CLI connects to the daemon and renders chat + session list/resume/branch (replacing the console-script UX, not the implementation); (4) **Desktop shell:** the Electron main process connects to the daemon (holding the token, sender-validating every IPC message — UI-03), the renderer renders chat + session list + diff review + terminal; (5) **memory page:** browse/search/prune/export via Hindsight endpoints proxied through the daemon, with staleness/health and typed-confirmation pruning (MEM-07/08); (6) **lanes panel + settings:** `SloMetrics` (per-lane delay, L1 deadline-vs-degraded, reserved-capacity counters, queue depths) and the Memory Model settings with save-time reachability validation + drain-then-restart (SCHD-05/06); (7) **approval round-trip:** gate `ask` → daemon emits approval-request frame → turn pauses → user responds from Desktop/CLI (once/session/always/deny) → decision recorded → turn resumes or call denied; timeout → deny (fail-closed) (UI-05).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Chat (turns, streaming, steer, queue, interrupt) | Daemon (Python loop) | Desktop/CLI (render) | Only the loop may create/close turns; surfaces render frames |
| Session list / resume / branch | Daemon (state store) | Desktop/CLI (render) | One store, one writer; `message_uid` preserved across branch |
| Diff review | Desktop (renderer, codemirror) | Daemon (workspace) | Rendering is client-side; the workspace is daemon-owned |
| Terminal | Desktop (renderer, xterm + node-pty) | Daemon (`proc.exec` capability) | PTY is client-side; the call is gate-approved |
| Memory page | Desktop (renderer) | Daemon → Hindsight API | Browse/search/prune/export via Hindsight endpoints |
| Lanes panel | Desktop (renderer) | Daemon → `pi-scheduler` `SloMetrics` | Read-only observability; never gates admission |
| Approvals round-trip | Daemon (gate) | Desktop/CLI (respond) | The gate is the authority; surfaces deliver the decision |
| Settings (Memory Model) | Desktop (renderer) | Daemon (config + sidecar supervisor) | Save-time validation; drain-then-restart on apply |
| IPC security (UI-03) | Desktop (main process) | — | Renderer holds no token; every IPC message sender-validated |
| Session continuity (UI-04) | Daemon (state store) | Desktop + CLI (both render) | One store → no divergence; `message_uid` is the join key |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Electron | 45.0.0 (pin) / 44.9.3 (vendored) | Desktop shell | Stack pin [VERIFIED: AGENTS.md:41]; Hermes-Desktop-derived. **Discrepancy — see Open Questions** |
| electron-builder | 26.15.3 (pin) / 27.0.0-alpha.6 (vendored) | Packaging (NSIS, `extraResources`/`asarUnpack`) | Stack pin [VERIFIED: AGENTS.md:42]; sidecar binaries |
| React | 19.3.0 | Renderer UI | Vendored Hermes-Desktop [VERIFIED: package.json] |
| @assistant-ui/react | 0.14.29 | Chat UI (streaming) | Vendored; streaming chat ready |
| @xterm/xterm + addons | 6.0.0 | Terminal rendering | Vendored; the standard PTY renderer |
| @codemirror/* | 6.x | Diff review / code editor | Vendored; the standard code editor |
| @tanstack/react-query | 5.104.1 | Data fetching / caching | Vendored; server-state for memory/lanes |
| node-pty | 1.1.0 | PTY for the terminal | Vendored; native PTY |
| ws | 8.22.0 | WebSocket (daemon transport, client side) | Vendored; the standard Node WS |
| Bun | 1.4.4 (pin) / 1.4.2 (installed) | TS workspace + CLI compile | Stack pin [VERIFIED: AGENTS.md:32] |
| websockets (Python) | latest | Daemon WS server (transport) | **New package** — the standard Python WS server; see Package Legitimacy Audit |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-virtual | 3.14.14 | Virtualized lists | Session list, memory list (large) |
| nanostores | 1.4.2 | Lightweight state | UI state |
| radix-ui | 1.7.0 | UI primitives | Components |
| motion | 12.43.0 | Animation | UI polish |
| mermaid / katex / d3-force | vendored | Diagrams / math / graphs | Rendering |
| electron-updater | 6.8.10 | Auto-update | Updates |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Electron | Tauri | Electron is the Hermes-Desktop base; Tauri would require a rewrite of the entire renderer |
| @assistant-ui/react | Custom chat UI | assistant-ui is vendored and streaming-ready; a custom UI re-creates it |
| @xterm/xterm | Custom terminal | xterm is the standard, vendored; a custom terminal is a large effort |
| WebSocket (daemon transport) | HTTP + SSE | WS is bidirectional and matches the OMP RPC frame model; SSE is one-way (events only) and needs a separate POST path for commands |

**Installation:**
```bash
# Desktop (vendored base — verify, don't reinstall)
bun install   # in vendor/hermes-agent/apps/desktop (or the rebranded apps/desktop)
# Daemon transport (new)
uv add websockets   # in packages/halo_agent
```

## Package Legitimacy Audit

> **Required** — this phase installs one new external package (`websockets`, Python) and reuses the vendored Desktop base. The vendored packages come from the four MIT codebases (already in the tree); the legitimacy gate is run on the new package and the key vendored ones for the record.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| websockets | PyPI | mature (2015+) | high (well-known) | github.com/python-websockets/websockets | [SUS] (tool: too-new/unknown-downloads — false signal, measures latest-release date) | Flagged — planner adds `checkpoint:human-verify`; well-established standard, low real risk |
| aiohttp | PyPI | mature (2013+) | high (well-known) | github.com/aio-libs/aiohttp | [SUS] (tool: too-new/unknown-downloads — false signal) | Flagged — only if HTTP/SSE transport is chosen over WS |
| electron | npm | mature | high | electronjs.org | [OK] (vendored) | Approved (verify at Wave 0) |
| electron-builder | npm | mature | high | github.com/electron-userland/electron-builder | [OK] (vendored) | Approved (verify at Wave 0) |
| @assistant-ui/react | npm | mature | high | github.com/assistant-ui/react | [OK] (vendored) | Approved (verify at Wave 0) |
| @xterm/xterm | npm | mature | high | github.com/xterm/xterm.js | [OK] (vendored) | Approved (verify at Wave 0) |
| node-pty | npm | mature | high | github.com/microsoft/node-pty | [OK] (vendored) | Approved (verify at Wave 0; native build on Windows) |
| @codemirror/* | npm | mature | high | github.com/codemirror | [OK] (vendored) | Approved (verify at Wave 0) |
| @tanstack/react-query | npm | mature | high | github.com/TanStack/query | [OK] (vendored) | Approved (verify at Wave 0) |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `websockets`, `aiohttp` — the tool's "too-new/unknown-downloads" signal measures the latest-release date, not package age; both are the standard, well-established Python WS/HTTP libraries with source repos. The planner inserts a `checkpoint:human-verify` before install, but real risk is low.

*The vendored Desktop packages (electron, electron-builder, @assistant-ui/react, @xterm/xterm, node-pty, @codemirror/*, @tanstack/react-query, ws) come from the four MIT codebases and are verified at Wave 0 against the imported tree — they are not re-sourced from the registry.*

## Architecture Patterns

### System Architecture Diagram

```
                        ┌─────────────────────────────────────────────┐
                        │            ONE DAEMON (Python)             │
                        │  halo_agent (Phase 3) — long-running       │
                        │                                             │
  ┌──────────┐  WS     │  ┌─────────────┐   ┌──────────────────┐    │
  │ DESKTOP  │◄────────┼──┤  RPC server │   │  SessionStore    │    │
  │ (Electron│  loopback│  │ (halo.*     │──►│  (SQLite WAL,    │    │
  │  main +  │  127.0.0.1│  │  18 frames, │   │   FTS5, single-  │    │
  │ renderer)│           │  │  1 MiB      │   │   writer thread) │    │
  └──────────┘           │  │  chunking)  │   └────────┬─────────┘    │
       │ IPC             │  └──────┬──────┘            │              │
       │ (sender-        │         │                   │              │
       │  validated,     │  ┌──────▼──────┐   ┌───────▼─────────┐   │
       │  no token)      │  │  Agent loop │   │  PolicyGate     │   │
       │                 │  │  (turns,     │   │  (pure, ≤5ms,   │   │
  ┌───▼────────┐        │  │   steer,     │   │   fail-closed)  │   │
  │ renderer   │        │  │   queue)     │   └───────┬─────────┘   │
  │ chat/diff/ │        │  └──────┬──────┘           │ ask          │
  │ terminal/  │        │         │                  ▼              │
  │ memory/    │        │  ┌──────▼─────────────────────────────┐   │
  │ lanes      │        │  │  approval-request frame → all      │   │
  └────────────┘        │  │  connected surfaces (UI-05)        │   │
                        │  └───────────────────────────────────┘   │
  ┌──────────┐  WS     │  ┌───────────────────────────────────┐   │
  │   CLI    │◄────────┼──┤  Sidecar supervisor (Phase 8)     │   │
  │ (Node/   │  loopback│  │  PG 55432 · llama 58080/58081   │   │
  │ Python)  │           │  │  hindsight-api (WorkerPoller)    │   │
  └──────────┘           │  └───────────────────────────────────┘   │
                        │  ┌───────────────────────────────────┐   │
                        │  │  pi-scheduler (Phase 9)           │   │
                        │  │  SloMetrics → lanes panel (SCHD-06)│  │
                        │  └───────────────────────────────────┘   │
                        └─────────────────────────────────────────────┘
```

Data flow: a user action (chat message, session resume, memory search, approval decision) enters as an RPC command frame over the loopback WS → the daemon's RPC server demuxes it → the loop / store / gate / Hindsight / scheduler handle it → the result + events stream back as frames to ALL connected surfaces (so a CLI-started session is visible in Desktop and vice versa — UI-04). The approval round-trip (UI-05) is the one path where the daemon *pauses* a turn and waits for a frame from a surface.

### Recommended Project Structure
```
apps/
├── desktop/              # Electron app (rebranded from vendor/hermes-agent/apps/desktop)
│   ├── electron/         # main process: daemon connection, IPC security (UI-03), backend-child
│   ├── src/              # renderer: React pages
│   │   ├── chat/         # chat page (assistant-ui)
│   │   ├── sessions/     # session list/resume/branch
│   │   ├── diff/         # diff review (codemirror)
│   │   ├── terminal/     # terminal (xterm + node-pty)
│   │   ├── memory/       # memory page (MEM-05/07/08)
│   │   ├── lanes/        # lanes panel (SCHD-06)
│   │   ├── approvals/    # approval round-trip UI (UI-05)
│   │   └── settings/     # settings page (SCHD-05)
│   └── package.json
├── cli/                  # CLI (replaces the halo-agent sessions console-script UX)
│   └── src/             # connects to the daemon, renders chat + sessions
packages/
└── halo_agent/          # the daemon (Phase 3) — Phase 10 adds the WS transport
    └── halo_agent/
        ├── transport/    # NEW: loopback WS server (halo.* frames, 1 MiB chunking)
        ├── state/        # SessionStore (Phase 3) — single writer
        ├── loop/         # agent loop (Phase 3)
        ├── policy/       # PolicyGate (Phase 4) — ask → approval round-trip
        └── sidecars/     # supervisor (Phase 8)
```

### Pattern 1: Daemon transport — loopback WS carrying the rebranded RPC protocol
**What:** The daemon runs a WS server on `127.0.0.1:<port>`. Each surface (Desktop main process, CLI) opens a WS connection and speaks the rebranded OMP RPC protocol: a `halo.ready` frame on connect (advertising `maxFrameBytes: 1048576`, `maxReassembledFrameBytes: 67108864`), a `halo.negotiate_protocol` v2 handshake for lossless `rpc_chunk` reassembly, then command frames (inbound) and event/response frames (outbound), correlated by `id`.
**When to use:** Always — this is the single transport for all surfaces.
**Why WS:** OMP RPC is 1:1 over stdio (the client spawns the agent child); HALO needs 1:N (one daemon, many clients). WS is bidirectional, matches the frame model, and is native to both Electron (`ws` / browser WebSocket) and Node/Python clients. The 1 MiB chunking (`rpc_chunk`) and 64 MiB reassembly limit are preserved verbatim from the OMP protocol [VERIFIED: vendor/oh-my-pi/docs/rpc.md:38-75].
**Example:**
```python
# packages/halo_agent/halo_agent/transport/ws_server.py  [PLANNED]
# Source: vendor/oh-my-pi/docs/rpc.md:38-75 (framing), 03-RESEARCH.md (loopback WS)
import asyncio, json
import websockets  # the one new package

MAX_FRAME_BYTES = 1048576          # 1 MiB physical frame (rpc.md:47)
MAX_REASSEMBLED = 67108864        # 64 MiB logical frame (rpc.md:48)

async def serve(host="127.0.0.1", port=0):
    # Each connection = one surface. The daemon demuxes by the halo.* command type
    # and correlates responses by the frame's "id" (rpc.md:108-120).
    async for ws in websockets.serve(f"ws://{host}:{port}"):
        # emit halo.ready (protocolVersion, supportedProtocolVersions,
        # maxFrameBytes, maxReassembledFrameBytes) on connect, then loop:
        async for raw in ws:
            frame = json.loads(raw)
            await dispatch(frame)   # → loop / store / gate / hindsight / scheduler
```

### Pattern 2: Approval round-trip (UI-05) — additive on the Phase 4 gate
**What:** Phase 4's gate returns `PolicyDecision.verdict: Literal["allow","deny","ask"]` and the MVP resolves `ask` ⇒ deny with reason `'unattended'` [VERIFIED: 04-RESEARCH.md:166-167, 237]. Phase 10 replaces that: when the gate returns `ask`, the daemon (a) emits an `approval_request` frame to ALL connected surfaces, (b) pauses the turn (holds the batch), (c) waits for an `approval_response` frame from any surface carrying one of `[o]nce | [s]ession | [a]lways | [d]eny` [CITED: security — upstream approval choices], (d) records the decision in `policy_decisions`, (e) resumes the turn (allow) or denies the call. Timeout ⇒ deny (fail-closed); an expired prompt cannot be reopened [CITED: security].
**When to use:** Whenever the gate returns `ask` and a surface is connected. If no surface is connected (unattended), fall back to Phase 4's deny-with-`'unattended'`.
**Why it's additive:** The gate stays pure (≤5 ms, fail-closed); the round-trip lives in the daemon's dispatch layer, not the gate. The `ui.ask` capability class already exists [VERIFIED: 04-RESEARCH.md:226].

### Pattern 3: Memory page — Hindsight endpoints proxied through the daemon
**What:** The memory page (MEM-05/07/08) calls Hindsight's bank endpoints, proxied through the daemon (the surface never talks to Hindsight directly). Base path `/v1/default/banks/{bank_id}/` ("default" is a literal path segment) [VERIFIED: vendor/hindsight/.../http.py:4912-5132].
**Endpoints the page uses:**
- Browse: `GET .../memories/list` (filters: `type`, `q`, `state`, `consolidation_state`, `tags`, time window, `limit`/`offset`) → `ListMemoryUnitsResponse{items,total,limit,offset}`.
- Search: `POST .../memories/recall` (`RecallRequest{query,tags,tag_groups,min_scores,temporal_window}`).
- Prune (MEM-08): `PATCH .../memories/{memory_id}` with `state:"invalidated"` (soft-retire to archive, reversible) / `state:"valid"` (revert). **Never call `DELETE` for prune** — prune is archive, not delete.
- Export: `GET .../export`.
- Staleness: `last_memory_write_at`, `last_consolidated_at`, `pending_consolidation`, `failed_consolidation`, `proof_count`, entity `with_staleness`.
- Health: `GET .../stats` (`BankStatsResponse`), `GET .../health/llm` (`BankLlmHealthResponse` per-op status + latency), `/health`, `/metrics`.
**Conflicts (MEM-07):** No explicit conflict-detection endpoint exists in Hindsight. The page surfaces conflicts via `proof_count` (low = uncorroborated), `consolidation_failed_at`, and a derived view of contradictory facts (same entity, different values). **Flagged as a gap — see Open Questions.**

### Pattern 4: Lanes panel (SCHD-06) — read-only `SloMetrics`
**What:** The lanes panel renders `pi-scheduler`'s `SloMetrics` [VERIFIED: 09-03-PLAN.md:90-94]: per-lane enqueue→first-service delay (the 200 ms bound), L1 deadline hits vs degraded fallbacks, reserved-capacity counters (per-lane active permits vs the 40/20/25/15% shares), plus queue depths (waiter count vs the 3/5/50/200 caps) and preemption counts. `SloMetrics` is read-only observability — it never gates admission [VERIFIED: 09-03-PLAN.md:88, T-9-07].
**When to use:** The lanes panel polls (or subscribes to) the daemon's metrics endpoint; the daemon reads `SloMetrics` and emits a `lanes_metrics` frame.

### Pattern 5: Settings page (SCHD-05) — Memory Model with drain-then-restart
**What:** The Memory Model defaults to the main agent model. The Settings page offers a dedicated model + per-operation overrides. On save, the daemon runs a **reachability validation** (can the model be reached? — a probe against the llama sidecar / provider). On apply, the daemon **drains then restarts** the affected sidecar (the Phase 8 supervisor's `degraded → restarting` transition) rather than hot-swapping mid-inference.
**When to use:** When the user changes the Memory Model in Settings.

### Anti-Patterns to Avoid
- **Two stores:** A surface opening the session store for writes. The store is the single source of truth with a single-writer thread; surfaces call the daemon. A second store "for compatibility" is forbidden [VERIFIED: 03-RESEARCH.md / 04-RESEARCH.md:278].
- **Renderer holds the daemon token (UI-03 violation):** The token (if any) lives in the Electron main process; the renderer never sees it. Every IPC message is sender-validated; a renderer `fetch` to the daemon port must fail.
- **Per-app backend spawn:** The vendored Hermes-Desktop spawns a per-app Python backend child. HALO's daemon is shared — the Desktop connects to it, it does not spawn it (except for the standalone/first-launch case).
- **Hot-swapping the model mid-inference:** Apply = drain-then-restart, not a live swap.
- **`DELETE` for prune:** Prune is `PATCH state='invalidated'` (archive, reversible), never `DELETE`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chat UI (streaming, steer, queue) | Custom chat renderer | `@assistant-ui/react` (vendored) | Streaming, tool-call rendering, and turn state are solved; re-creating them is a large effort |
| Terminal rendering | Custom terminal emulator | `@xterm/xterm` + `node-pty` (vendored) | The standard PTY renderer; a custom terminal is a multi-week effort |
| Diff review / code editor | Custom diff viewer | `@codemirror/*` (vendored) | The standard code editor with diff mode |
| WebSocket transport (client) | Custom WS client | `ws` (vendored) / browser WebSocket | The standard; a custom WS client re-creates framing/reassembly |
| WebSocket transport (daemon) | Custom WS server | `websockets` (Python) | The standard Python WS server; a custom one re-creates the protocol |
| Frame chunking/reassembly | Custom chunking | The OMP `rpc_chunk` protocol (rebranded) | Already specified (1 MiB / 64 MiB); re-creating it diverges from the contract |
| Server-state fetching (memory, lanes) | Manual fetch + cache | `@tanstack/react-query` (vendored) | Caching, retries, and invalidation are solved |
| Process tree kill (Windows) | Custom kill logic | `taskkill /T /F` (vendored `backend-child.ts`) | The established pattern; a custom one misses the tree |
| Memory search | Custom vector search | Hindsight `POST .../memories/recall` | The memory runtime owns search; a custom one forks it |

**Key insight:** Phase 10 is a *surface* phase. Almost every hard problem (chat, terminal, diff, WS, search, process teardown) is already solved by the vendored base or the prior-phase runtimes. The new code is thin: the daemon's WS transport, the HALO-specific pages (memory, lanes, settings, approvals), the CLI surface, and the IPC security layer. Hand-rolling any of the solved problems re-creates them and diverges from the contract.

## Common Pitfalls

### Pitfall 1: Two stores / surface writes the DB
**What goes wrong:** The Desktop or CLI opens the session store for writes, creating a second writer and divergent state (UI-04 breaks).
**Why it happens:** The store is a local SQLite file; it's tempting to read/write it directly.
**How to avoid:** Surfaces call the daemon; the daemon is the single writer. The `runtime_epoch` row (pid + process-start-time liveness) enforces single-writer ownership [VERIFIED: 03-01-PLAN.md].
**Warning signs:** Two processes holding the store open; `message_uid` divergence between CLI and Desktop for the same session.

### Pitfall 2: Renderer holds the daemon token (UI-03 violation)
**What goes wrong:** The renderer holds the daemon token and can `fetch` to the daemon port, bypassing the IPC security boundary.
**Why it happens:** It's convenient to put the token in the renderer.
**How to avoid:** The token lives in the Electron main process; the renderer→daemon traffic goes renderer→IPC→main→daemon; every IPC message is sender-validated; a renderer `fetch` to the daemon port must fail.
**Warning signs:** A renderer `fetch` to the daemon port succeeds; the token is visible in renderer memory.

### Pitfall 3: Per-app backend spawn
**What goes wrong:** The Desktop spawns its own Python backend (the vendored Hermes-Desktop pattern), creating a second daemon and a second store.
**Why it happens:** The vendored base does this; it's the path of least resistance.
**How to avoid:** The Desktop connects to the shared daemon (except the standalone/first-launch case, where it may start the daemon once).
**Warning signs:** Two daemon processes; the CLI and Desktop see different session state.

### Pitfall 4: Approval round-trip blocks the gate
**What goes wrong:** The approval round-trip is implemented inside the gate, breaking its purity (≤5 ms, fail-closed).
**Why it happens:** It's tempting to put the "wait for approval" in the gate.
**How to avoid:** The gate returns `ask`; the daemon's dispatch layer emits the approval-request frame, pauses the turn, and waits for the response. The gate stays pure.
**Warning signs:** Gate latency > 5 ms; the gate makes a network/model call.

### Pitfall 5: `DELETE` for prune
**What goes wrong:** Pruning a memory calls `DELETE`, permanently removing it (MEM-08 violation).
**Why it happens:** "Prune" sounds like "delete."
**How to avoid:** Prune is `PATCH state='invalidated'` (soft-retire to archive, reversible). Never `DELETE`.
**Warning signs:** A pruned memory is gone, not archived; no way to revert.

### Pitfall 6: Hot-swapping the model mid-inference
**What goes wrong:** Applying a new Memory Model hot-swaps the sidecar mid-inference, corrupting in-flight operations.
**Why it happens:** It's tempting to swap the model live.
**How to avoid:** Apply = drain-then-restart (the Phase 8 supervisor's `degraded → restarting` transition).
**Warning signs:** In-flight operations fail after a model change; the sidecar is restarted without draining.

### Pitfall 7: Divergent session state (UI-04)
**What goes wrong:** A session started in the CLI shows different state in the Desktop (or vice versa).
**Why it happens:** The two surfaces cache state independently and don't reconcile.
**How to avoid:** Both surfaces render the daemon's frames; the store is the single source of truth; `message_uid` is the join key preserved across compaction/branch/export/import.
**Warning signs:** The CLI and Desktop show different message counts for the same session.

## Code Examples

Verified patterns from official sources:

### Daemon WS server (transport)
```python
# packages/halo_agent/halo_agent/transport/ws_server.py  [PLANNED]
# Source: vendor/oh-my-pi/docs/rpc.md:38-75 (framing), 03-RESEARCH.md (loopback WS)
import asyncio, json
import websockets

MAX_FRAME_BYTES = 1048576          # 1 MiB physical frame (rpc.md:47)
MAX_REASSEMBLED = 67108864         # 64 MiB logical frame (rpc.md:48)

async def serve(host="127.0.0.1", port=0):
    async for ws in websockets.serve(f"ws://{host}:{port}"):
        await ws.send(json.dumps({
            "type": "halo.ready",
            "protocolVersion": 1,
            "supportedProtocolVersions": [1, 2],
            "maxFrameBytes": MAX_FRAME_BYTES,
            "maxReassembledFrameBytes": MAX_REASSEMBLED,
        }))
        async for raw in ws:
            frame = json.loads(raw)
            # demux by halo.* command type; correlate responses by frame["id"]
            await dispatch(frame, ws)
```

### Approval round-trip (UI-05)
```python
# packages/halo_agent/halo_agent/policy/roundtrip.py  [PLANNED]
# Source: 04-RESEARCH.md:166-167 (ask => deny 'unattended' MVP), 237 (modes)
async def resolve_ask(decision, surfaces, timeout_s):
    # Phase 4 MVP: ask => deny 'unattended'. Phase 10: round-trip if a surface is connected.
    if not surfaces.connected():
        return "deny"   # unattended fallback (Phase 4)
    await broadcast(surfaces, {"type": "approval_request", "id": decision.id,
                              "choices": ["once", "session", "always", "deny"]})
    try:
        resp = await wait_for_approval(decision.id, timeout_s)
        return resp.choice   # once | session | always | deny
    except TimeoutError:
        return "deny"        # fail-closed; an expired prompt cannot be reopened
```

### Memory prune (MEM-08) — archive, never delete
```python
# packages/halo_agent/halo_agent/memory/prune.py  [PLANNED]
# Source: vendor/hindsight/.../http.py (PATCH .../memories/{id} with state)
async def prune(memory_id, bank_id, typed_confirmation):
    assert typed_confirmation == "PRUNE"   # explicit typed confirmation (MEM-08)
    # Soft-retire to archive (reversible). NEVER DELETE.
    return await hindsight.patch(f"/v1/default/banks/{bank_id}/memories/{memory_id}",
                                json={"state": "invalidated"})
```

### IPC security (UI-03) — sender-validated, no renderer token
```typescript
// apps/desktop/electron/ipc.ts  [PLANNED]
// Source: vendor/hermes-agent/apps/desktop/electron/ (main-process IPC pattern)
import { ipcMain } from "electron";

// The token lives HERE (main process), never in the renderer.
const DAEMON_TOKEN = process.env.HALO_DAEMON_TOKEN;

// Every IPC message is sender-validated: only the known renderer frame may send.
ipcMain.handle("daemon:call", async (event, frame) => {
  if (event.senderFrame?.url !== RENDERER_URL) throw new Error("sender not validated");
  // main → daemon (the renderer never touches the daemon port or the token)
  return daemonCall(frame, DAEMON_TOKEN);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-app backend spawn (Hermes-Desktop) | Shared daemon, surfaces connect | Phase 10 | One daemon, one store; CLI and Desktop see the same state (UI-04) |
| `ask` ⇒ deny 'unattended' (Phase 4 MVP) | Approval round-trip to connected surfaces | Phase 10 (UI-05) | The user can approve from Desktop/CLI; unattended still fails closed |
| `halo-agent sessions <verb>` console script (Phase 3) | CLI surface over the daemon | Phase 10 | "Replaces the UX, not the implementation" |
| No memory page | Memory page over Hindsight endpoints | Phase 10 (MEM-05/07/08) | Browse/search/prune/export + staleness/health |
| No lanes panel | Lanes panel over `SloMetrics` | Phase 10 (SCHD-06) | Lane depths, wait histograms, preemptions, backlog visible |
| No settings page | Settings page with drain-then-restart | Phase 10 (SCHD-05) | Memory Model overrides with save-time validation |

**Deprecated/outdated:**
- Per-app backend spawn: superseded by the shared daemon (the vendored Hermes-Desktop pattern is adapted, not reused verbatim).
- `ask` ⇒ deny 'unattended' as the *only* resolution: superseded by the round-trip (the unattended fallback remains).

## Assumptions Log

> Claims tagged `[ASSUMED]` in this research. The planner and discuss-phase use this to identify decisions needing user confirmation before execution.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The daemon transport is WebSocket over loopback (not HTTP/SSE) | Summary, Pattern 1 | If HTTP/SSE is preferred, the daemon transport and the client WS code change; the RPC frame model is unchanged |
| A2 | The Desktop uses the stack-pin Electron 45.0.0 / electron-builder 26.15.3 (not the vendored 44.9.3 / 27.0.0-alpha.6) | Standard Stack | If the vendored versions are kept, the pin is stale; if 45.0.0 is used, the vendored base may need a minor bump |
| A3 | `websockets` (Python) is the daemon WS server library | Standard Stack, Package Legitimacy | If `aiohttp` or another lib is preferred, the daemon transport import changes |
| A4 | MEM-07 "conflicts" is surfaced via `proof_count` + `consolidation_failed_at` + a derived contradictory-facts view (no explicit Hindsight conflict endpoint) | Pattern 3 | If a real conflict-detection endpoint exists (or is added), the page uses it instead |
| A5 | The Desktop connects to the shared daemon and does not spawn a per-app backend (except standalone/first-launch) | Anti-Patterns | If the per-app spawn is kept, UI-04 (no divergence) breaks |
| A6 | The approval round-trip pauses the turn and holds the batch while waiting for the decision | Pattern 2 | If the turn is not held, the call may dispatch before the decision (safety violation) |

## Open Questions

1. **Daemon transport: WS vs HTTP/SSE.**
   - What we know: Phase 3 research says "surfaces attach over loopback HTTP/WS" and "Phase 10 daemon WS must chunk at 1 MiB and reassemble" [VERIFIED: 03-RESEARCH.md]. The OMP RPC frame model is bidirectional.
   - What's unclear: Whether the daemon exposes WS, HTTP+SSE, or both. WS is the natural fit for the bidirectional RPC frame model.
   - Recommendation: Lock WS over loopback (A1). It matches the frame model and is native to both Electron and Node/Python clients.

2. **Electron version: stack pin 45.0.0 vs vendored 44.9.3.**
   - What we know: AGENTS.md pins Electron 45.0.0 / electron-builder 26.15.3 [VERIFIED: AGENTS.md:41-42]; the vendored Hermes-Desktop uses 44.9.3 / 27.0.0-alpha.6 [VERIFIED: vendor/hermes-agent/apps/desktop/package.json].
   - What's unclear: Which the rebranded Desktop uses. Phase 2 (rebrand) should have aligned them, but Phase 2 is unexecuted.
   - Recommendation: Follow the stack pins (45.0.0 / 26.15.3); bump the vendored base if needed (A2).

3. **MEM-07 "conflicts" — no explicit Hindsight endpoint.**
   - What we know: Hindsight has `proof_count`, `consolidation_failed_at`, `pending_consolidation`, `failed_consolidation`, but no explicit "conflict" endpoint [VERIFIED: vendor/hindsight/.../http.py].
   - What's unclear: Whether "conflicts" means uncorroborated facts (low `proof_count`), failed consolidations, or derived contradictory facts.
   - Recommendation: Surface conflicts via `proof_count` + `consolidation_failed_at` + a derived contradictory-facts view (A4); confirm the definition with the user.

4. **node >= 26 requirement (vendored) vs installed node 22.23.2.**
   - What we know: The vendored desktop `package.json` requires `node >= 26`; the installed node is 22.23.2; Electron 45 requires `node >= 22.12.0` [VERIFIED: AGENTS.md:41].
   - What's unclear: Whether the rebranded Desktop keeps the `node >= 26` engine requirement.
   - Recommendation: Reconcile the engine requirement with the Electron 45 minimum (node >= 22.12.0); ensure the build environment has a compatible node.

5. **Rust and `just` not on PATH.**
   - What we know: `rustc`/`cargo` and `just` are not on PATH in the current environment [VERIFIED: environment probe this session]. Phase 9's `pi-scheduler` (which Phase 10's lanes panel depends on) needs Rust; the build orchestrator is `just`.
   - What's unclear: Whether the build environment will have Rust and `just` installed.
   - Recommendation: The planner adds an install/verify step for Rust (1.99.1) and `just` (1.59.0) before the lanes-panel and build tasks.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | Desktop build, CLI | ✓ | 22.23.2 | — (Electron 45 needs >= 22.12.0; vendored wants >= 26 — see Open Question 4) |
| bun | TS workspace, CLI compile | ✓ | 1.4.2 (pin 1.4.4) | — (bump to 1.4.4) |
| rust / cargo | `pi-scheduler` (Phase 9, lanes panel dep) | ✗ | — | Install Rust 1.99.1 (blocking for the lanes panel) |
| python | Daemon (`halo_agent`) | ✓ | 3.13.15 (pin 3.14.9) | uv manages its own CPython 3.14.9 |
| uv | Python runtime | ✓ | 0.12.17 (pin 0.13.5) | — (bump to 0.13.5) |
| just | Build orchestrator | ✗ | — | Install just 1.59.0 (blocking for `just build`) |
| npm | Desktop build | ✓ | 10.9.8 | — |
| git | VCS | ✓ | 2.55.0 | — |

**Missing dependencies with no fallback:**
- Rust / cargo (blocking for the `pi-scheduler` crate that the lanes panel depends on) — install 1.99.1.
- `just` (blocking for `just build`) — install 1.59.0.

**Missing dependencies with fallback:**
- None — the present tools cover the rest; bun/uv/python are slightly behind their pins (bump at Wave 0).

## Validation Architecture

> `workflow.nyquist_validation` is `true` [VERIFIED: .planning/config.json:25].

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.1.1 + pytest-asyncio 1.4.0 (daemon); Bun test / Vitest (Desktop/CLI); cargo test (scheduler, Phase 9) |
| Config file | `packages/halo_agent/pyproject.toml` (daemon); `apps/desktop/package.json` (Desktop) |
| Quick run command | `uv run pytest tests/transport tests/policy -x` (daemon); `bun test` (Desktop/CLI) |
| Full suite command | `uv run pytest` + `bun test` + `cargo test -p pi-scheduler` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UI-01 | Desktop renders chat, sessions, diff, terminal, memory, lanes | integration (E2E) | `bun test apps/desktop` (Playwright/Electron) | ❌ Wave 0 |
| UI-02 | CLI attaches to the same daemon + store | integration | `uv run pytest tests/transport::test_cli_attaches` | ❌ Wave 0 |
| UI-03 | Renderer holds no token; IPC sender-validated; renderer fetch to daemon fails | unit + integration | `bun test apps/desktop/electron/ipc` | ❌ Wave 0 |
| UI-04 | CLI-started session continues in Desktop without divergence | integration | `uv run pytest tests/transport::test_session_continuity` | ❌ Wave 0 |
| UI-05 | Approval round-trips from a running turn to Desktop and back | integration | `uv run pytest tests/policy::test_approval_roundtrip` | ❌ Wave 0 |
| MEM-05 | Memory availability never blocks the first chat turn; degraded visible | integration | `uv run pytest tests/memory::test_degraded_visible` | ❌ Wave 0 |
| MEM-07 | Browse/search/prune/export + staleness/conflicts/health in one page | integration | `bun test apps/desktop/src/memory` | ❌ Wave 0 |
| MEM-08 | Prune archives (never deletes); typed confirmation required | unit + integration | `uv run pytest tests/memory::test_prune_archives` | ❌ Wave 0 |
| SCHD-05 | Memory Model default + overrides + save-time validation + drain-then-restart | integration | `uv run pytest tests/sidecars::test_model_drain_restart` | ❌ Wave 0 |
| SCHD-06 | Lane depths, wait histograms, preemptions, backlog visible | integration | `bun test apps/desktop/src/lanes` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/transport tests/policy -x` (daemon) + `bun test` (touched surface).
- **Per wave merge:** full suite (`uv run pytest` + `bun test` + `cargo test -p pi-scheduler`).
- **Phase gate:** Full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/transport/` — daemon WS server + client attach (UI-02, UI-04).
- [ ] `tests/policy/test_approval_roundtrip.py` — UI-05.
- [ ] `tests/memory/` — MEM-05/07/08 (Hindsight endpoint proxy + prune).
- [ ] `tests/sidecars/test_model_drain_restart.py` — SCHD-05.
- [ ] `apps/desktop` E2E harness (Playwright/Electron) — UI-01, MEM-07, SCHD-06.
- [ ] `websockets` install + verify (the one new package).

## Security Domain

> `security_enforcement` is `true`, ASVS level 1, block on `high` [VERIFIED: .planning/config.json:49-51].

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Daemon token (if any) in the Electron main process; loopback-only bind; sender-validated IPC |
| V3 Session Management | yes | `runtime_epoch` single-writer ownership (pid + process-start-time liveness) [VERIFIED: 03-01-PLAN.md] |
| V4 Access Control | yes | Gate is deny-by-default, fail-closed; `ui.ask` capability; approval round-trip fails closed on timeout |
| V5 Input Validation | yes | Adapter-boundary validation (lane tag + op payload) [VERIFIED: 09-01-PLAN.md]; IPC sender validation; frame size limits (1 MiB / 64 MiB) |
| V6 Cryptography | no | No new crypto; the daemon token (if any) is a bearer over loopback only |

### Known Threat Patterns for the stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Renderer exfiltrates the daemon token | Information Disclosure | Token lives in the main process; the renderer never sees it (UI-03) |
| Renderer `fetch` bypasses IPC to the daemon | Elevation of Privilege | The daemon binds loopback-only; a renderer `fetch` to the daemon port must fail (UI-03) |
| A surface writes the store directly (second writer) | Tampering | Single-writer thread + `runtime_epoch` ownership; surfaces call the daemon |
| Approval timeout auto-allows a call | Elevation of Privilege | Timeout ⇒ deny (fail-closed); an expired prompt cannot be reopened |
| Prune deletes a memory (irreversible) | Tampering | Prune = `PATCH state='invalidated'` (archive, reversible); typed confirmation required (MEM-08) |
| Oversized frame floods the daemon | Denial of Service | 1 MiB physical frame cap + 64 MiB reassembly limit (the OMP `rpc_chunk` protocol) |
| Cross-lane permit consumption | Denial of Service | Per-lane reserved capacity (Phase 9); the lanes panel is read-only |

## Sources

### Primary (HIGH confidence)
- `vendor/oh-my-pi/docs/rpc.md` — OMP RPC protocol (framing, `ready`/`negotiate_protocol`, 18 outbound + 4 inbound frame categories, `rpc_chunk` reassembly, request/response correlation).
- `vendor/hindsight/hindsight-api-slim/hindsight_api/api/http.py` — Hindsight bank endpoints (memories/list, recall, PATCH state, export, stats, health/llm).
- `vendor/hermes-agent/apps/desktop/package.json` + `electron/backend-child.ts` — the vendored Desktop base (Electron, assistant-ui, xterm, codemirror, node-pty, ws; process tree kill).
- `.planning/phases/03-unified-loop-session-authority/03-01-PLAN.md` + `03-RESEARCH.md` — the daemon, the single-writer store, `message_uid`, "surfaces call the daemon (Phase 10)."
- `.planning/phases/04-tool-registry-policy-gate/04-RESEARCH.md` — the gate (`allow`/`deny`/`ask`), `ask` ⇒ deny 'unattended' MVP, approval modes, `ui.ask` capability.
- `.planning/phases/08-memory-runtime-bundling/08-01-PLAN.md` + `08-RESEARCH.md` — the sidecar supervisor (PG, llama, hindsight-api), ports, env.
- `.planning/phases/09-four-lane-scheduling-lane-slos/09-01-PLAN.md` + `09-03-PLAN.md` — the `pi-scheduler` crate, `SloMetrics` (per-lane delay, L1 deadline-vs-degraded, reserved-capacity counters).
- `AGENTS.md` — stack pins (Electron 45.0.0, electron-builder 26.15.3, Bun 1.4.4, Rust 1.99.1, Python 3.14.9, uv 0.13.5, just 1.59.0).

### Secondary (MEDIUM confidence)
- Upstream approval choices (`[o]nce | [s]ession | [a]lways | [d]eny`, fail-closed timeout, "an expired prompt cannot be reopened") — [CITED: security].

### Tertiary (LOW confidence)
- None — all claims are verified against the planning artifacts or the vendored trees, or explicitly tagged `[ASSUMED]`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — the vendored Desktop base and the stack pins are read verbatim; the one new package (`websockets`) is the standard Python WS server.
- Architecture: MEDIUM-HIGH — the daemon/store/gate/scheduler/Hindsight seams are HIGH (read verbatim from the planning artifacts); the exact daemon transport (WS vs HTTP/SSE) and the Electron version are design decisions (Open Questions 1–2).
- Pitfalls: HIGH — each pitfall maps to a verified invariant (single writer, fail-closed gate, archive-not-delete, drain-then-restart).

**Research date:** 2026-10-25
**Valid until:** ~30 days (stable planning artifacts; the vendored base and stack pins are pinned).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UI-01 | Desktop provides chat, session list/resume/branch, diff review, terminal, memory page, lanes panel | §Architecture Patterns (Recommended Project Structure, Patterns 1–5); §Standard Stack (Electron, assistant-ui, xterm, codemirror); Hindsight endpoints (Pattern 3); `SloMetrics` (Pattern 4) |
| UI-02 | CLI attaches to the same daemon and session store as Desktop | §Architecture Patterns (Pattern 1 — loopback WS); §Don't Hand-Roll (single store); §Common Pitfalls (Pitfall 1, 3) |
| UI-03 | Renderer holds no daemon token; every IPC message sender-validated; renderer fetch to daemon fails | §Security Domain (V2, V4); §Architecture Patterns (Code Example — IPC security); §Common Pitfalls (Pitfall 2) |
| UI-04 | A session started in CLI continues in Desktop and vice versa without divergence | §Architecture Patterns (single store, `message_uid`); §Common Pitfalls (Pitfall 1, 7) |
| UI-05 | Approvals round-trip from a running turn to the Desktop and back | §Architecture Patterns (Pattern 2 — approval round-trip); Phase 4 gate (`ask` ⇒ deny 'unattended' MVP); §Common Pitfalls (Pitfall 4) |
| MEM-05 | Memory availability never blocks the first chat turn; degraded mode visible in the UI | §Architecture Patterns (Pattern 3 — Hindsight health endpoints); Phase 8 sidecar supervisor (degraded state) |
| MEM-07 | Browse, search, prune, export memories; staleness, conflicts, health in one Desktop page | §Architecture Patterns (Pattern 3 — Hindsight endpoints); Open Question 3 (conflicts gap) |
| MEM-08 | Memories invalidated/archived, never auto-deleted; pruning requires typed confirmation | §Architecture Patterns (Pattern 3 — `PATCH state='invalidated'`); §Common Pitfalls (Pitfall 5); Code Example (prune) |
| SCHD-05 | Memory Model defaults to main agent model; Settings page with overrides, save-time reachability validation, drain-then-restart | §Architecture Patterns (Pattern 5 — settings page); Phase 8 sidecar supervisor (drain-then-restart) |
| SCHD-06 | Lane depths, wait histograms, preemptions, backlog visible in the UI | §Architecture Patterns (Pattern 4 — `SloMetrics`); Phase 9 `pi-scheduler` |
</phase_requirements>
