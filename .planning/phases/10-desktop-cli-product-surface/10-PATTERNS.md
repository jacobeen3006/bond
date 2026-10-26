# Phase 10: Desktop & CLI Product Surface — Pattern Map

**Mapped:** 2026-10-25
**Files analyzed:** 29 new/modified artifacts across 3 plans (from `10-RESEARCH.md` §Architectural Responsibility Map, §Standard Stack, §Code Examples; plan frontmatter `files_modified` arrays in `10-01`, `10-02`, `10-03`)
**Analogs found:** 24 / 29 — most analogs are inherited from the vendored Hermes-Desktop (`vendor/hermes-agent/apps/desktop/`), which provides Electron shell, assistant-ui chat, xterm terminal, codemirror diff review. Five rows are **no-analog** because they introduce new HALO-side services (daemon transport WS server, approval round-trip frame).

> **Hard dependency.** Phases 3 (daemon + store), 4 (gate), 8 (sidecars), and 9 (scheduler) must execute before any Phase 10 plan runs. The repo contains no `apps/` or `packages/halo_agent/` yet [verified this session]. Every seam grounds on prior-phase PLAN.md/RESEARCH.md, not implemented code.

> **Tracked-source note:** vendored symbols (`vendor/hermes-agent/apps/desktop/`) are git-TRACKED. Where a phase *replaces* a vendored file rather than extending it, the citation points through the prior plan that defined the convention (e.g., `03-01-PLAN.md` for the store contract).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/halo_agent/halo_agent/transport/ws_server.py` | service (daemon WS transport) | request-response, bidirectional | `vendor/hermes-agent/apps/desktop/electron/backend-child.ts` — per-app backend spawn → replaced by shared daemon WS | role-match (new shape: WS instead of fork) |
| `packages/halo_agent/halo_agent/transport/broadcast.py` | middleware (multicast) | fan-out | no-analog — establish new pattern (single source, many consumers) | none |
| `packages/halo_agent/pyproject.toml` + `uv add websockets` | config (dependency) | n/a | Plan 03-01 pyproject structure (`03-01-SUMMARY.md:45`) | exact style-match |
| `apps/cli/package.json` | config (CLI deps) | n/a | Vendored Hermes-Desktop CLI layout | near-exact (structural twin) |
| `apps/cli/src/index.ts` | utility (entrypoint dispatcher) | request-response | `tools/provenance/cli.ts` subcommand delegation discipline (`01-09-PLAN.md:88`) | exact (inherited pattern) |
| `apps/cli/src/daemon_client.ts` | service (client transport) | request-response | `vendor/hermes-agent/apps/desktop/electron/backend-child.ts` WS connection setup | role-match (now targets daemon, not local child) |
| `apps/cli/src/chat.ts` | surface render (chat) | streaming | `@assistant-ui/react` streaming chat (vendored) | exact (vendored component) |
| `apps/cli/src/sessions.ts` | surface render (sessions) | request-response | Console-script `halo-agent sessions` UX (`03-01-PLAN.md`) | role-match (console replaces old UX) |
| `apps/desktop/package.json` | config (Electron app) | n/a | Vendored Hermes-Desktop `apps/desktop/package.json` | exact (rebranded copy) |
| `apps/desktop/electron-builder.yml` | config (packaging) | batch | `electron-builder 26.15.3` defaults + `extraResources`/`asarUnpack` for sidecars | exact (stack pin 26.15.3) |
| `apps/desktop/src/main/index.ts` | main process entry | lifecycle, IPC | `vendor/hermes-agent/apps/desktop/electron/main.ts` | exact (adapted) |
| `apps/desktop/src/main/daemon-connection.ts` | main process service | WS connect, lifecycle | Replaces `backend-child.ts`; connects to shared daemon WS | role-match (new pattern: daemon connect vs fork) |
| `apps/desktop/src/main/ipc.ts` | main process security | sender-validation | no-analog — establish new pattern (IPC message sender validation gate) | none → baseline for UI security |
| `apps/desktop/src/renderer/index.ts` | renderer entry | bootstrapping | `vendor/hermes-agent/apps/desktop/src/App.tsx` | exact (rebranded copy) |
| `apps/desktop/src/renderer/chat.ts` | surface render (chat panel) | streaming, WebSocket | `@assistant-ui/react` chat UI + `ws` client | exact (vendored components) |
| `apps/desktop/src/renderer/sessions.ts` | surface render (session list/resume/branch) | request-response | Daemon state store API (`03-01-PLAN.md` FTS5/export/branch endpoints) | role-match (renderer queries daemon-only) |
| `apps/desktop/src/renderer/diff.ts` | surface render (diff review) | file-display | `@codemirror/*` viewer (vendored) | exact (vendored component) |
| `apps/desktop/src/renderer/terminal.ts` | surface render (terminal) | PTY I/O | `@xterm/xterm` + `node-pty` (vendored) | exact (vendored components) |
| `tests/transport/test_ws_server.py` | test (daemon WS) | integration | `tests/provenance/fixtures/tiny-upstream/` hermetic fixture pattern | role-match (fixture pattern from Phase 1) |
| `tests/transport/test_broadcast.py` | test (multicast) | unit | Same fixture pattern | role-match |
| `tests/transport/test_roundtrip.py` | test (WS protocol) | integration | Two-process refusal asserting named token (`01-08-PLAN.md:131`) | near-exact (same assertion discipline) |
| `tests/desktop/test_token_isolation.ts` | test (UI-03 security) | unit | No-analog — first sender-validation test in repo | none → establishes new test pattern |
| `tests/desktop/test_ipc_sender_validation.ts` | test (IPC gate) | unit | Same as above | exact sibling |
| `tests/desktop/test_ui04_cross_surface.ts` | test (session continuity) | integration | Single store, single writer invariant (`03-01-PLAN.md`) | role-match (verifies cross-client consistency) |
| `tests/cli/test_chat_roundtrip.ts` | test (CLI chat) | integration | Spawn-and-assert token suites (`01-08-PLAN.md:117-151`) | near-exact |
| `tests/cli/test_session_commands.ts` | test (CLI sessions) | integration | Console-script UX assertions | role-match |
| `justfile` entries: `desktop-build`, `cli-run`, `surface-verify` | config (build orchestration) | batch | `[windows]` shell directive + recipe naming convention (`01-01-PLAN.md:247`) | exact (inherited pattern) |
| `.planning/phases/10-desktop-cli-product-surface/10-OPEN-QUESTIONS.md` | doc (design decisions) | n/a | Planned-analog: `02-PATTERNS.md` open-question handling | role-match |

## Pattern Assignments

### `packages/halo_agent/halo_agent/transport/ws_server.py` (service, daemon WS transport)

**Analog:** Replaces the vendored per-app backend spawn (`backend-child.ts`). The daemon is a long-lived Python process exposing the rebranded RPC protocol over loopback WebSocket.

**Copy:** Listen on `127.0.0.1:<port>` only. Accept client connections. Multiplex incoming frames by `client_id`. Forward frames to the daemon's single-writer store thread. Outbound: broadcast frames from the store to all connected clients (via `broadcast.py`). Chunk at 1 MiB via `rpc_chunk` reassembly (OMP RPC frame model). Exit 0 on shutdown signal; no restart needed (daemon lives independently).

**Client handshake:** each client sends `{method: "connect", client_id: "...", version: "..."}` → daemon replies with `{status: "ok"}` or `{status: "error", reason: "..."}`. After connection, frames carry `"id"` for request/response correlation and `"stream": true/false` for streaming turns.

**Do not:** bind to `0.0.0.0` or any non-loopback interface. Never accept unauthenticated connections without client_id verification against an allow-list. Do not mix daemon business logic with transport wiring — the daemon thread owns the loop/store; the WS layer forwards frames only.

---

### `packages/halo_agent/halo_agent/transport/broadcast.py` (middleware, multicast)

**Analog:** No prior analog — establishes the first fan-out pattern in the repo. Derived from the requirement that multiple surfaces (Desktop, CLI) must see the same live stream simultaneously.

**Copy:** A simple subscriber-publisher list: `subscribe(client_id)` / `unsubscribe(client_id)` / `broadcast(frame)`. Each frame is cloned and dispatched to every active subscriber within a bounded timeout (fail-open: drop for slow clients who exceed the deadline, log the drop). Internal data structure: `dict[client_id, async_queue]` guarded by a lock during mutations.

**Performance ceiling:** max 256 subscribers per instance (reasonable limit for desktop+CLI); if exceeded, reject new subscriptions with a documented error. Frames under 1 MiB are buffered inline; larger frames use zero-copy semantics where possible.

**Do not:** use publish-subscribe channels (overkill for ≤256 subscribers); block the broadcaster thread on slow clients (use fire-and-forget with bounded dispatch timeout); persist broadcast history (that's the store's job, not the broadcast layer's).

---

### `apps/cli/src/daemon_client.ts` + `apps/cli/src/index.ts` (CLI, request-response)

**Analog:** Inherits the subcommand delegation pattern from `tools/provenance/cli.ts` (`01-09-PLAN.md:88`) and `halo_agent/cli.py` (`03-RESEARCH.md:1047-1052`).

**Copy:** One entrypoint `index.ts` that routes subcommands to handler modules (`chat.ts`, `sessions.ts`). Each handler opens a WS connection to the daemon (same loopback port), sends the request frame, awaits the response frame, and prints the result to stdout. Unknown subcommands exit 2 with usage to stderr. Fixed exit contract: `0` success, `1` daemon unreachable/error, `2` malformed input.

The CLI never writes to the session store directly — all writes go through the daemon. The CLI is a rendering layer only.

**Connection management:** retry up to 3 times on ECONNREFUSED (daemon not started), then exit 1 with actionable error ("Daemon not running. Start with `halo daemon start`").

**Do not:** cache the WS connection across subcommand invocations (each CLI run is independent); print errors to stdout (only result lines go to stdout).

---

### `apps/desktop/src/main/ipc.ts` (security, IPC sender validation)

**Analog:** UI-03 requirement: "the renderer holds no daemon token and every IPC message is sender-validated." No prior analog in the repo — establishes the IPC security pattern for all future renderer→main communication.

**Copy:** Every IPC channel receives a validation hook that checks the sender's origin and context. Main-process handlers verify: (a) the sender matches a registered renderer channel ID, (b) the renderer does not hold a daemon auth token, (c) the request action is permitted by the current security policy. Unauthorized IPC is silently dropped with a logged warning.

Token isolation: the daemon connection token lives exclusively in the main process. Renderer processes communicate with the main process over validated IPC only — they never touch the daemon socket directly. The IPC bridge forwards rendered user actions (chat messages, approval decisions) as opaque payloads after validating the sender.

**Security invariant:** if any IPC validator is removed or bypassed, the daemon token must become unreachable from renderer code paths. This is verified by `test_token_isolation.ts` (plan 10-03).

**Do not:** trust renderer-originated IPC claims about the user's intent or capabilities; always validate on the main-process side; share tokens between renderer and main process contexts.

---

### `apps/desktop/src/main/daemon-connection.ts` (main process, daemon WS connect)

**Analog:** Replaces `vendor/hermes-agent/apps/desktop/electron/backend-child.ts` per-app-fork pattern with a shared-daemon-connect pattern.

**Copy:** On Electron main-process init, connect to the daemon WS (loopback). Handle reconnection with exponential backoff (250 ms → 500 ms → 1 s → cap 4 s). Track connection state (`disconnected`, `connecting`, `connected`, `degraded`). Notify renderers via validated IPC when the state changes. If the daemon cannot be reached after retries, show a degraded badge in the UI rather than blocking startup.

Single-instance lock: the Desktop uses `app.requestSingleInstanceLock()` so only one daemon-facing window exists at a time. CLI can coexist (both attach to the same daemon).

**Do not:** spawn a local backend child process (that was the pre-HALO shape); manage multiple daemon connections (one daemon, one connection per Desktop instance).

---

### `apps/desktop/src/renderer/*.ts` (renderers, surface panels)

**Analog:** All surface panels inherit from the vendored Hermes-Desktop renderer components. Chat uses `@assistant-ui/react`, terminal uses `@xterm/xterm` + `node-pty`, diff review uses `@codemirror/*`.

**Copy:** Renderers communicate with the main process via validated IPC only. They do not connect to the daemon directly. Data fetching uses `@tanstack/react-query` with the main-process IPC as the data source. Virtualized lists (`@tanstack/react-virtual`) for session list and memory browsing (>100 items). State managed via `nanostores` (lightweight, reactive).

Renderer entry point imports all surface panels as tabs/panes configurable by the user. No hardcoded tab ordering — panels declared in a configuration object that the tab bar reads.

**Data flow:** user action → renderer → IPC(main) → daemon WS → daemon processing → response → IPC(renderer) → UI update. Bidirectional streaming uses the WS frames forwarded through IPC.

**Do not:** import Electron APIs directly in renderer code (only `ipcRenderer` for validated IPC calls); hardcode the daemon connection details (read from main-process IPC); create direct network sockets from renderer code.

---

### Approval round-trip (daemon → surface → decision → resume)

**Analog:** Derived from the Phase 4 gate's `ask` capability and Phase 3's turn lifecycle. No standalone analog — defines the frame protocol for human-in-the-loop approvals.

**Copy:** When the gate denies a tool call requiring approval, the daemon emits an `approval_request` frame with `{request_id, tool_name, arguments_hash, options: [auto_approve, allowlist, yolo, deny], ttl_seconds}`. Connected surfaces receive the frame and render an approval UI. User responds via IPC/CLI command. Decision sent back to daemon as `{request_id, decision}`. Turn pauses until response arrives (fail-closed: deny on TTL expiry).

Each approval is tied to a session and turn, recorded in the store alongside the original request. Only the requesting turn's session can consume the decision.

**Timeout behavior:** default TTL 30 seconds. The UI shows a countdown. Expired approvals are denied automatically and the original call is retried with the denial reason.

**Do not:** reuse request_ids across turns; allow approval decisions outside the originating session; serialize approvals globally (per-turn isolation).

---

### Session continuity across surfaces (UI-04)

**Analog:** Phase 3 store: `message_uid` preserved across compaction/branch/export/import. One store, single writer.

**Copy:** Both Desktop and CLI connect to the same daemon. Sessions are looked up by the same URI scheme (`halo://session/<uuid>` or `halo-session-<uuid>`). Resuming a session from Desktop or CLI joins the same live transcript. Branch operations produce a new session ID derived from the parent's last `message_uid`.

Cross-surface continuity verification: `test_ui04_cross_surface.ts` creates a session on CLI, branches it, continues on Desktop, and verifies the full chain exists in the store with matching `message_uid`s.

**Do not:** maintain separate session stores per surface; allow divergent transcript histories; lose `message_uid` continuity across compaction.

---

### Settings page (Memory Model configuration + drain-then-restart)

**Analog:** Scheduler SLO settings panel from Phase 9 (`SloMetrics` readout). Derives the read-only observability pattern and extends it with writable configuration.

**Copy:** Settings form validates each field on-save (reachability check: does the referenced model exist? Does the scheduler accept the lane depth?). On apply: signal the daemon to drain pending work → restart affected subsystems (memory model provider, sidecar supervisor) → verify health post-restart → show success/failure. Rollback on failure: revert to previous settings atomically.

Save-time reachability: before writing settings to disk, the daemon checks that all referenced resources exist (models, ports, providers). Invalid settings are rejected with named-field errors, not silently ignored.

**Do not:** apply settings changes immediately without drain; allow partial applies (all-or-nothing transactional apply); restart without draining queued turns first.

---

### Test patterns (transport + surface tests)

**Analog:** Inherited fixture pattern from `tests/provenance/fixtures/` and assertion discipline from `01-08-PLAN.md:131,144`.

**Copy:** Transport tests (`tests/transport/`) exercise the daemon WS protocol: start a mock daemon, connect clients, send/receive frames, verify broadcast fan-out, test chunking and reassembly. Use `pytest` for Python transport tests and `bun test` for TypeScript CLI tests.

Surface tests (`tests/desktop/`, `tests/cli/`) use headless Electron/browser mocking and spawn real CLI processes. Assertions focus on output correctness (stdout content, exit codes, structured JSON output) and IPC sender validation (unauthorized IPC is dropped).

Isolation: each test spawns its own daemon instance on an ephemeral port. No two tests share a daemon or port. Port allocation: find free port via `127.0.0.1:0` binding, close immediately, use the discovered port.

**Do not:** share daemon state across tests; rely on global fixtures that leak between test files; assert on timing-sensitive behavior (use frame correlation IDs instead).
