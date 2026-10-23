# Architecture Research

**Domain:** Fused desktop coding agent (single agent loop over heterogeneous tool backends)
**Researched:** 2026-10-23
**Confidence:** HIGH for upstream mechanisms; MEDIUM for the fusion design (synthesized, not yet built)

> Scope: HALO — one product assembled from oh-my-pi (OMP), Hermes Agent, Hindsight, and gsd-omp.
> This document designs the seams. It does not restate the brief in [PROJECT.md](../PROJECT.md).
> Anything labeled **[DESIGN]** is a HALO decision not present upstream. Anything labeled
> **[EVIDENCE]** is grounded in the cited upstream source.

---

## The Five Invariants

Every component boundary below exists to preserve these. If a change breaks one, it is an
architecture regression, not a feature.

1. **One loop decides.** Only the Python agent daemon calls a model for a user-facing turn and
   decides which tool runs next. OMP never runs a turn. **[DESIGN]**
2. **One decision point.** Every tool invocation — top-level, nested, plugin-registered, MCP,
   subagent, or UI-initiated — passes `ToolAdapter.invoke()` and `PolicyGate.evaluate()` before
   any backend executes. **[DESIGN]**
3. **One transcript.** SQLite message rows are authoritative for what the model saw and what the
   user saw. OMP session files, Hindsight documents, and Electron state are never read back as
   conversation history. **[DESIGN]**
4. **One capacity authority.** A daemon-global four-lane scheduler owns the provider-request and
   memory-operation budgets. No subsystem owns a competing admission path. **[DESIGN]**
5. **Fail closed on policy, fail open on recall, fail loud on backend death.** A policy error
   denies the call; a recall timeout produces a visible "memory skipped" event and the turn
   proceeds; a coding-core crash produces typed tool errors and a supervised restart. **[DESIGN]**

The fourth is the one upstream systems violate by construction: Hermes owns prompt calls,
Hindsight owns its own worker and semaphores, and neither can see the other's queue.

---

## 1. Standard Architecture

### 1.1 Process topology

```
┌───────────────────────────── Electron Desktop (Windows) ─────────────────────────────┐
│  renderer (sandboxed, contextIsolation)  ◄──typed IPC──►  main (Node)                 │
│  pages: chat, sessions, memory, lanes, settings, kanban, plugins                       │
└───────────────────────────────────────┬───────────────────────────────────────────────┘
                                        │ loopback HTTP/WS + launch token
┌───────────────────────────────────────▼───────────────────────────────────────────────┐
│                          halo-agent  (Python 3.14, singleton)                        │
│                                                                                       │
│  Surface gateway / session authority  ──►  Unified Agent Loop (Hermes-derived)        │
│        │                                        │                                    │
│        │                                        ├── PromptAssembler ──► L0 scheduler │
│        │                                        ├── ToolRegistry (one catalog)       │
│        │                                        ├── ToolAdapter ──► PolicyGate       │
│        │                                        ├── ContextEngine (only compactor)   │
│        │                                        └── MemoryProvider ──► L1/L2/L3     │
│        │                                                                              │
│  PluginHost (Python)    LaneScheduler (daemon-global)   SQLite writer (state.db)      │
│  OmpSupervisor ── stdout/stdin JSONL ──► halo-coding-core (Bun/TS + Rust)             │
│  GsdRunner ── child process ──► gsd-tools.cjs                                         │
└───────────────┬───────────────────────────────────────────────┬───────────────────────┘
                │ HTTP (loopback, per-launch token)             │ spawn/supervise
┌───────────────▼──────────────┐                  ┌─────────────▼───────────────────────┐
│  halo-runtime (supervisor)   │                  │  child processes owned by runtime   │
│  health, ports, data dirs    │                  │  postgres.exe  (pgvector)           │
└───────────────┬──────────────┘                  │  text-embeddings-router.exe (embed) │
                │                                 │  text-embeddings-router.exe (rerank)│
                ├──► hindsight-api                │  hindsight-worker                   │
                └──► hindsight-worker             └─────────────────────────────────────┘
```

**[DESIGN]** Two long-lived tiers, not one:

- `halo-runtime` owns Postgres, both TEI sidecars, Hindsight API, and Hindsight worker. These are
  expensive to start (Postgres recovery, model load) and must survive agent/UI restarts.
- `halo-agent` owns the loop, the policy gate, the scheduler, SQLite, the plugin host, and the
  coding-core children. It may restart with the UI without forcing a memory cold start.

Both are singletons per user profile. Windows named mutexes provide single-instance admission;
each writes a `runtime.json` / `agent.json` containing its loopback port, pid, and a random
per-launch bearer token with a user-only ACL. Desktop and CLI are clients of `halo-agent`, never
alternative runtimes — this mirrors Hermes's rule that the gateway is the only writer of canonical
sessions and CLI/Desktop/TUI attach as clients ([Hermes session storage](https://hermes-agent.nousresearch.com/docs/developer-guide/session-storage),
[Hermes gateway local sessions](https://hermes-agent.nousresearch.com/docs/developer-guide/gateway-local-sessions)).

Why the coding core is one child per canonical session **[DESIGN]**: OMP's tools assume live
process-local state (brush shell sessions, LSP servers, DAP adapters). Sharing one OMP process
across concurrent sessions would serialize session switches and let one crashed LSP take down
every conversation. Per-session children also give a clean crash-restart unit and a per-session
generation number for frame fencing.

### 1.2 Component responsibilities

| Component | Language / process | Owns | Must never own | Talks to |
|---|---|---|---|---|
| Unified Agent Loop | Python, `halo-agent` | Turn state machine, provider calls, tool-call ordering, retries/fallback, persistence orchestration | Tool execution policy, memory admission, UI rendering | Registry, ContextEngine, MemoryProvider, surfaces |
| Tool Registry | Python, in-process | One catalog: names, schemas, backend binding, capability tags, ownership/precedence | Executing anything | Adapter |
| Tool Adapter | Python, in-process | Batch admission, argument validation, dispatch (in-process or RPC), result normalization, artifact spill, cancellation fan-out | Deciding allow/deny | Registry, PolicyGate, backends |
| Policy Gate | Python, in-process, pure | Safety, workspace, secret, TDD-phase, memory-routing, backend-capability verdicts; decision records | Network, model calls, plugin calls | Adapter (only) |
| Coding Core | Bun/TS + Rust, child | File/shell/LSP/DAP/AST/browser/eval tool implementations; workspace process state | Agent loop, transcript, policy, compaction | Adapter over stdio JSONL |
| Memory Service | Python + Postgres + TEI, supervised processes | Memories, entities, observations, consolidation, indices, embeddings | Turn decisions, prompt assembly, lanes | MemoryClient over HTTP |
| Lane Scheduler | Python, daemon-global | Admission for L0 provider calls and L1–L3 memory operations; leases, deadlines, revocation, metrics | Tool dispatch (separate admission) | Provider transport, MemoryClient, Hindsight ops API |
| Context Engine | Python, in-process | Token accounting, compaction, message identity | Memory retention, tool policy | Loop, MemoryProvider checkpoint hook |
| Surfaces | Electron main/renderer, CLI | Input admission, rendering, approvals, settings | Backend access, session writes | `halo-agent` HTTP/WS only |
| Plugin Host | Python, in-process | Discovery, hook bus, plugin tools/commands/skills | Being the policy gate; direct backend handles | Registry, hook bus |
| OMP Supervisor | Python, in `halo-agent` | Spawn/handshake/health/restart, frame logs, job objects, capability profile | Interpreting OMP events as transcript | Coding core |
| Runtime Supervisor | Python, `halo-runtime` | Process order, readiness, ports, data dirs, restart backoff | Agent turns | Postgres, TEI, Hindsight |
| gsd-tools runner | Node child, on demand | GSD CLI semantics and `.planning/` artifacts | Policy decisions | Policy-gated `gsd_invoke` tool |

The critical negative column is the architecture. A component that can reach a backend without the
adapter is a defect even if it "works".

**Adapter composition.** The adapter is one object with four internal parts, deliberately not
exposed separately: (a) the **registry bridge** (resolve, schema-validate, derive capabilities),
(b) the **RPC session binding** (`session_id → {child, generation, workspace}`, in-flight
invocation table, cancellation fan-out), (c) **gate invocation** (build `ToolRequest`, call
`PolicyGate`, cache the decision per `tool_call_id`), and (d) the **normalizer** (content blocks →
`ToolResultEnvelope`, artifact spill, redaction). A backend handle is only reachable through the
binding, and the binding is only reachable after the gate. There is no `get_client()` escape hatch.

### 1.3 Why each boundary is where it is

- **Python loop ↔ TS/Rust coding core stays a process boundary.** PROJECT mandates it; the
  upstream RPC layer already exists and is a newline-delimited JSON protocol with explicit
  framing, out-of-order responses, backpressure spooling, and cancel commands
  ([OMP RPC](https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md)). Reusing it buys crash
  isolation and record/replay testing that in-process FFI would destroy.
- **Memory stays an HTTP service.** Hindsight already exposes banks, async operations, and
  per-operation cancellation over HTTP ([Hindsight API](https://hindsight.vectorize.io/api-reference)).
  Running it out-of-process also isolates its Python/PyTorch surface from the agent's Python.
- **The gate stays in the agent process.** It must see the model's exact arguments, the session's
  TDD phase, and the capability map — none of which exist on the other side of a process boundary
  in comparable form. Putting it in the coding core would gate only coding tools; putting it in a
  plugin would make policy optional.

---

## 2. The Tool-Call Lifecycle (end to end)

### 2.1 Sequence

```
LLM response with tool_calls[]
  │
  ├─ 1. Loop validates alternation, persists assistant row (with tool_call ids + uids)
  ├─ 2. Adapter.begin_batch(): resolve ALL calls before ANY dispatch
  │       registry.resolve(name) → Binding{tool, backend, schema, capabilities, timeout, side_effects}
  │       unknown tool / schema mismatch → synthetic error result for that call (batch continues)
  ├─ 3. PolicyGate.evaluate(ToolRequest) per call   [pure, ≤5 ms p99, fail closed]
  │       allow → proceed | deny → synthetic denied result | ask → UI approval (deny when unattended)
  ├─ 4. Dispatch, concurrently up to turn_limit, in call order for result insertion
  │       in-process Python handler  → await handler(args, ctx, cancel_token)
  │       coding core                → RPC halo.tool.invoke{invocationId, tool, args, cwd, timeoutMs}
  │       child CLI (gsd-tools)      → spawn, bounded stdio capture
  │       MCP client                 → request with timeout
  ├─ 5. Normalize each result to ToolResultEnvelope v1
  │       { ok, text, content[], artifacts[], backend, invocation_id, policy_decision_id,
  │         duration_ms, truncated, error_kind? }
  │       cap inline bytes; spill larger payloads to the artifact store; redact secrets
  ├─ 6. Persist one tool row per tool_call id, in original call order, regardless of completion order
  ├─ 7. Fire observer hooks (post_tool_call) with redacted args/summary only
  └─ 8. Only when every tool_call id has a row → next provider request
```

Steps 2 and 3 are a deliberate change from Hermes, which evaluates `pre_tool_call` per call inside
the dispatch path after agent-level tools have already been intercepted ([Hermes tools runtime](https://hermes-agent.nousresearch.com/docs/developer-guide/tools-runtime)).
Batch-first evaluation prevents a denied call from racing an allowed sibling and prevents
"half the batch ran" transcript states.

### 2.2 Registry precedence **[DESIGN]**

There is exactly one runtime catalog. Precedence is resolved at build time from
`contracts/tool-ownership.yaml`, not at request time:

| Namespace | Owner wins | Rationale |
|---|---|---|
| Code: `read`, `write`, `edit`, `ast_edit`, `ast_grep`, `grep`, `glob`, `bash`, `lsp`, `debug`, `browser`, `computer`, `eval`, `web_search` | OMP implementation | Native implementations, LSP/DAP integration, Windows-native shell |
| Messaging/media/kanban/cron/`clarify` | Hermes implementation | Only implementation that exists |
| Memory (`retain`, `recall`, `reflect`, `memory_edit`) | HALO memory backend | Must use the scheduler and Hindsight; OMP's memory tools are denied |
| Skills (`learn`, `manage_skill`) | HALO skill manager | Writes to the Hermes skills registry and the OMP skill projection |
| Planning/UI (`todo`, `ask`, `session_search`, `task`) | HALO core | Tie to canonical session state; OMP's equivalents are denied |
| Workflow (`gsd_invoke`) | HALO runner | Spawns `gsd-tools.cjs` under the gate |

Rules:
- Duplicate names are a **startup error**, not a runtime shadow. Hermes rejects cross-toolset
  shadowing unless `override=True` ([tools runtime](https://hermes-agent.nousresearch.com/docs/developer-guide/tools-runtime));
  HALO removes the override path entirely.
- If two implementations are genuinely both wanted, the loser is published under an explicit
  alias (`web_search_omp`), never silently.
- Every entry declares **capabilities**, not just a name (see 2.3). Unknown capability ⇒ denied.

### 2.3 Policy gate contract **[DESIGN]**

```python
@dataclass(frozen=True)
class ToolRequest:
    session_id: str
    turn_id: str
    tool_call_id: str
    tool_name: str
    backend: Literal["halo", "hermes", "omp", "mcp", "cli", "plugin"]
    capabilities: frozenset[str]     # fs.read, fs.write, fs.delete, proc.exec, net.egress,
                                     # ui.control, vcs.write, memory.read, memory.write, ui.ask,
                                     # secrets.read, agent.spawn, backend.raw
    args: Mapping[str, Any]          # path-normalized, secret-scanned
    cwd: str
    phase: str | None                # GSD phase: RED | GREEN | REFACTOR | None
    agent_kind: Literal["main", "sub", "background"]

@dataclass(frozen=True)
class PolicyDecision:
    verdict: Literal["allow", "deny", "ask"]
    rule_ids: tuple[str, ...]
    reason: str
    rewritten_args: Mapping[str, Any] | None
    redactions: tuple[str, ...]
    decision_id: str
```

Properties:
- **Pure.** No network, no model, no plugin call. Inputs are the request plus an immutable
  per-turn snapshot of policy state (TDD phase, workspace roots, approval cache, settings).
- **Bounded.** p99 ≤ 5 ms; a timeout is a deny.
- **Capability-keyed.** `write`, `patch`, and `ast_edit` all surface `fs.write`; `bash` surfaces
  `proc.exec`, which the safety rules treat as write-capable. A policy cannot be evaded by picking
  a different tool name.
- **Auditable.** Every decision row stores `decision_id`, rule ids, verdict, a SHA-256 of the
  canonicalized request, and redaction list. The transcript references `policy_decision_id` on
  every tool row.
- **Plugin-neutral.** Plugin `pre_tool_call` hooks run **after** the gate and may only add a deny
  or inject context. They can never convert deny → allow or skip evaluation.

Rule families:
1. **Safety:** destructive command patterns, workspace escape after `realpath`, secret reads,
   desktop/browser control (`ui.control`) requiring approval, `backend.raw` approval.
2. **TDD:** a phase state machine over `RED → GREEN → REFACTOR`. RED permits test writes and
   read-only source inspection; GREEN permits source edits only after a recorded failing-test
   evidence row; REFACTOR forbids behavior-changing capabilities. Evidence is written by the test
   runner tool, not by prose. Enforcement lives here, not in skill prose (PROJECT decision).
3. **Memory routing:** `memory.read`/`memory.write` always target the HALO memory backend; OMP's
   memory tools are unregistered.
4. **Backend restrictions:** `agent.spawn` is main-loop-only; `backend.raw` is denied to
   subagents; OMP agent-loop commands are unreachable (see RPC capability profile).

### 2.4 Bypass inventory — every place a call can skip the path

| # | Bypass | Why it exists upstream | Closure **[DESIGN]** | Test |
|---|---|---|---|---|
| B1 | OMP agent loop via RPC `prompt`/`steer`/`follow_up`/`abort_and_prompt` | Full command union is present in `rpc-types.ts` ([source](https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/modes/rpc/rpc-types.ts)) | Build the coding core in **tool-backend mode**: these commands are removed from the dispatch table, and the dispatcher's catch-all rejects the name with `capability_disabled`; the adapter also refuses to send them | Command-set snapshot test; assert each returns capability error |
| B2 | OMP direct `bash` RPC command | `bash` is a first-class RPC command that bypasses the tool registry ([rpc.md](https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md)) | Disabled in tool-backend mode. Shell is only reachable as the `bash` *tool*, so the gate sees it | Frame-replay test asserts `bash` command rejected |
| B3 | OMP extensions register tools, intercept `tool_call`, or block policy | Extensions wrap registry execution and can return `{block}` or revised input ([extensions.md](https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md)) | Extension discovery disabled for the coding core (`--no-extensions`); gsd-omp's enforcement is **not** loaded into the core. Its skills are projected into both skill registries and read by HALO's skill manager; its policy is reimplemented in the Python gate | Startup test asserts extension registry empty; TDD test proves gate still enforces |
| B4 | OMP `task` subagents run their own loop and tools | `task` fans out isolated agents with their own tool surfaces ([OMP README](https://github.com/can1357/oh-my-pi)) | `task` is owned by HALO: it creates a **child HALO session** (`parent_session_id`), driven by the same loop over the same adapter. OMP's `task` tool is unregistered | Subagent test asserts every child tool call has a policy decision row |
| B5 | OMP `eval` kernels call back into tools over loopback | Python/Bun kernels can call agent tools from inside a cell ([OMP README](https://github.com/can1357/oh-my-pi)) | Tool re-entry disabled in tool-backend mode; `eval` gets `backend.raw` capability, is approval-gated, and cannot invoke other tools | Attempt nested call → error, no policy bypass |
| B6 | OMP memory tools (`retain`, `recall`, `reflect`, `memory_edit`) | Registered in OMP's toolset ([OMP README](https://github.com/can1357/oh-my-pi)) | Excluded from the catalog at build time; model-issued calls resolve to HALO-owned memory tools instead | Catalog snapshot test |
| B7 | Hermes agent-level intercepts (`todo`, `memory`, `session_search`, `delegate_task`) run before registry dispatch | Documented interception point ([Hermes agent loop](https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop)) | Interception table deleted; these become normal registry entries with HALO handlers | Unit test asserts each dispatches through adapter |
| B8 | Hermes plugins add tools/hooks that call backends directly | Plugin context can register tools, hooks, CLI commands ([Hermes plugins](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins)) | Plugins receive a capability-scoped context with no backend client handle. Plugin tools enter the registry; plugin hooks are deny-only observers | Plugin fixture that tries direct HTTP/stdio fails |
| B9 | Dynamically discovered MCP tools | MCP tools are registered into the Hermes registry ([tools runtime](https://hermes-agent.nousresearch.com/docs/developer-guide/tools-runtime)) | MCP is a backend, not a registry owner. Tools enter through adapter, get `backend.raw` unless annotated read-only, and are policy-evaluated | MCP fixture: write tool requires approval; read-only passes |
| B10 | `execute_code` / terminal backends run arbitrary code | Sandbox tools execute code with network/filesystem reach | `execute_code` is `backend.raw`; terminal tool is capability `proc.exec`; approvals and workspace rules apply. True OS containment is explicitly out of scope for v1 and stated in docs | Policy test per backend |
| B11 | Desktop renderer or plugin page calls a backend directly | Electron renderers can reach loopback if given a token | Renderer gets no token, no Node integration; every backend action is a main-process IPC request validated by sender ([Electron security](https://www.electronjs.org/docs/latest/tutorial/security)) | E2E: renderer fetch to daemon port fails |
| B12 | A second loop: CLI embeds `AIAgent`, or gateway constructs its own | Hermes supports CLI, gateway, ACP, batch entry points ([Hermes architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture)) | All surfaces are **clients** of the one daemon. Embedded mode exists only behind a test flag | Process test: two CLI invocations share one session authority |
| B13 | A tool or plugin calls Hindsight directly | Memory HTTP is reachable on loopback | The only `HindsightClient` instance is constructed inside `MemoryProvider` with a lane-bound request wrapper. Secrets for the local token are not exposed to plugins | Static check + runtime client-count assertion |
| B14 | Hindsight's worker runs consolidation outside lanes | API can run an internal worker; dedicated `hindsight-worker` polls tasks ([services](https://hindsight.vectorize.io/developer/services)) | Internal worker disabled (`WORKER_ENABLED=false`); dedicated worker's slots are sized to the L3 budget; the scheduler can cancel pending L3 operations and pause submission | SLO test: L0 latency under synthetic consolidation load |
| B15 | OMP frames are mistaken for transcript / mirrored context is invisible | `message_*`, `agent_*`, `tool_execution_*` frames exist ([rpc.md](https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md)) | Adapter consumes only allowlisted frames correlated to its own `invocationId`; all transcript writes go through the loop. Recall injections emit `context_message_added` and are persisted with `display_kind=memory_context` | Golden test: OMP message frames never create SQLite rows |
| B16 | Tool aliasing launders a capability | `write`, `patch`, `ast_edit`, `bash` can all write | Capability classes on every registry entry; unknown capability denies | Matrix test over every catalog entry |
| B17 | Tool output injects instructions or fakes success | Tool results are untrusted text | Results are wrapped as data, never concatenated into the system prompt; UI marks backend provenance; policy never parses tool output to decide | Prompt-injection fixture |
| B18 | Nested host tools / `xd://` devices | OMP can call host tools and dispatch `xd://` ([rpc.md](https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md)) | Host tool set is empty; `xd://` dispatch disabled in tool-backend mode; built-in URI schemes resolve inside a normal tool call and carry `net.egress` when remote; any future host tool must be a registry entry with capabilities | Handshake test asserts empty host tool response |
| B19 | Shell writes outside the workspace | `proc.exec` is intentionally powerful | Residual risk: the gate governs the decision, not syscalls inside the process. Workspace rules are enforced for path-shaped tools; shell policy is pattern- and approval-based only. Documented as an accepted v1 limitation | Red-team cases documented; no containment claim |
| B20 | Secrets leak through args, logs, or frame logs | Args may contain tokens | Gate scans and replaces with handles before persistence/frame logging; backends receive real values only for `secrets.read`-allowed calls | Log-scan test |

**Rule:** if a new tool or surface is added, it must appear in this table with a closure and a
test, or it does not ship.

### 2.5 Plugin host boundary **[DESIGN]**

Plugins are an extension surface, never a second runtime.

| Plugin capability | Allowed form | Enforcement |
|---|---|---|
| Register a tool | `register_tool(entry)` → one registry entry with `backend="plugin"` and declared capabilities | Same batch admission, gate, normalization, and persistence as every other tool |
| Observe tool calls | `pre_tool_call` / `post_tool_call` hooks | `pre` may only add a deny or context; `post` is read-only |
| Inject context | `pre_llm_call` | Delimited, provenance-tagged data block; persisted and surfaced like recall |
| Register a command | HALO command registry | Commands may only invoke registered tools; no direct backend access |
| Register a skill | Skill manager | Projected into the Hermes registry and the OMP skill directory |
| Desktop page/widget | Renderer module | Data only through main-process IPC; no daemon token, no Node integration |
| Store state | `$HALO_HOME/plugins-data/<plugin_id>/` | Profile-scoped, backed up, never in the transcript |

Hard rules:
- The plugin context exposes **no** `HindsightClient`, RPC client, SQLite handle, or daemon
  credentials. A plugin that needs data asks through a registered tool.
- Plugins are fail-isolated: an exception or timeout disables that plugin for the turn and is
  logged; the turn continues. Policy never depends on a plugin, so this cannot weaken enforcement.
- Plugin tools that the adapter cannot classify get `backend.raw` and require approval.
- GSD is **not** installed as a policy plugin. Its skills are projected; its `gsd_invoke` command is
  a core tool; its phase invariants live in the gate (section 2.3).

This is a deliberate narrowing of Hermes's plugin surface, which otherwise lets a plugin register
tools, hooks, CLI commands, and read/write host state ([Hermes plugins](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins)).

---

## 3. Session Identity and State Ownership

### 3.1 Identity model

| Identifier | Minted by | Stability | Purpose |
|---|---|---|---|
| `session_id` | `halo-agent` (UUIDv7) | Stable for the logical conversation, including across compaction | Canonical key for everything: SQLite, OMP children, Hindsight tags, UI |
| `transcript_id` | ContextEngine | Rotates on compaction/reset | Physical message-generation boundary; old rows stay `active=0` |
| `turn_id` | Loop | Per user input | Groups provider calls, tool calls, retain operations |
| `tool_call_id` | Provider | Per call | OpenAI protocol correlation |
| `invocation_id` | Adapter | Per dispatch | RPC correlation and cancellation |
| `policy_decision_id` | Gate | Per call | Audit join |
| `operation_id` | Memory client (client-supplied for retain) | Per retain submission; consolidation operations are server-assigned | Hindsight idempotency: re-submitting the same id returns the original operation ([API](https://hindsight.vectorize.io/api-reference)) |
| `parent_session_id` | Loop | On subagent/branch creation | Lineage and transcript subtree |

Hermes already separates the durable logical session id from the physical transcript target across
compression and reset ([gateway local sessions](https://hermes-agent.nousresearch.com/docs/developer-guide/gateway-local-sessions)).
HALO adopts that split verbatim; it is what lets OMP stay bound to one `session_id` while
compaction rotates the transcript.

### 3.2 State ownership matrix

| State | Owner | Store | Reconstructible after crash? |
|---|---|---|---|
| Sessions, messages, usage, compaction generations | `halo-agent` | SQLite `state.db` (WAL) | Durable |
| Durable input admissions, worker receipts | `halo-agent` | SQLite | Durable; `started` + owner death ⇒ `unknown`, never replayed (Hermes pattern) |
| Tool invocations + policy decisions | `halo-agent` | SQLite | Durable audit |
| Memory operation mirrors (lane, operation_id, status, deadline) | `halo-agent` | SQLite | Durable; reconciled against Hindsight on boot |
| Lane metric rollups | `halo-agent` | SQLite + `/metrics` | Durable rollups, live gauges |
| Memories, entities, observations, indices, mental models | Hindsight | Postgres + pgvector | Durable |
| Bank config, directives, prompts-per-operation | Hindsight | Postgres | Durable |
| Provider secrets, memory-model credentials | Hermes secret store | OS credential store / encrypted store | Durable, never in config/env |
| Workspace process state (shell sessions, LSP, DAP, cwd, watchers) | Coding core child | Process memory | Ephemeral; rebuilt on restart |
| Scratch artifacts (`artifact://`) | Coding core child | Per-session scratch dir | Ephemeral; GC'd; not transcript |
| OMP transcript/session file | Coding core child | Scratch | **Never read** by HALO |
| UI state (open panel, drafts) | Renderer | Renderer memory + settings | Ephemeral by design |
| Plugin state | Plugin host | `$HALO_HOME/plugins-data/<id>` | Durable per plugin |

Rules:
- **SQLite has one writer:** `halo-agent`. No other process opens it for transcript writes.
- **OMP may not be the source of truth for anything the model must remember.** If a value must
  survive a restart, it lives in SQLite or Hindsight.
- **Hindsight is authoritative for memory, not for session history.** A retained memory is not a
  message; a message is not reconstructed from memory.

### 3.3 Coding-core binding **[DESIGN]**

At session creation the supervisor records a binding row in the adapter:
`session_id → {pid, generation, workspace, client}`. The client instance is generation-tagged, and
frames received through a superseded generation are discarded (section 4.5). The supervisor then:
1. Allocates `scratch/<session_id>/cwd.json` recording the workspace root.
2. Spawns `halo-coding-core --mode rpc --backend-only --no-extensions --no-session` with cwd set
   to the workspace root. `--no-session` is an existing OMP capability ([rpc.md](https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md)).
3. Waits for `ready`, then sends `negotiate_protocol {protocolVersion: 2}` when advertised
   (protocol v2 chunking is required for large tool results).
4. Sends the capability profile: `set_event_filter` to the minimal allowlist,
   `set_auto_compaction {enabled:false}`, `set_auto_retry {enabled:false}`,
   `set_subagent_subscription {level:"off"}`, `set_host_tools {tools:[]}`,
   `set_host_uri_schemes {schemes:[]}`.
5. Reads the tool catalog from `get_state.dumpTools` ([rpc.md](https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md))
   and reconciles it against `tool-ownership.yaml`. Tools absent from `dumpTools` but present in
   the manifest are invoked by name and validated core-side.

`--no-session` deliberately gives up OMP's own persistence. HALO needs none of it: the transcript
is SQLite, todos are HALO-owned, and subagents are HALO sessions. Artifacts that OMP would have
stored per-session are spilled by the adapter into HALO's artifact store.

### 3.4 Compaction and context accounting — single-sourced

- Only the Hermes-derived `ContextEngine` compacts. It is single-select upstream
  ([context engine docs](https://hermes-agent.nousresearch.com/docs/developer-guide/context-engine-plugin)),
  and HALO keeps exactly one implementation.
- OMP auto-compaction is disabled at handshake and `compact` is never sent. OMP has no transcript
  to compact anyway; this is defense in depth.
- Token accounting comes only from `update_from_response(usage)` in the context engine. OMP's
  `get_state.contextUsage` is ignored because OMP is not running turns. Memory-side LLM usage is
  recorded with `purpose='memory'` in `session_model_usage`, never folded into the turn's context
  percentage.
- Before a lossy rewrite, `MemoryProvider.on_pre_compress(messages)` checkpoints the transcript
  evidence to Hindsight. HALO opts into the fail-closed checkpoint contract so a failed archive
  blocks the rewrite rather than losing evidence ([memory provider docs](https://hermes-agent.nousresearch.com/docs/developer-guide/memory-provider-plugin)).
- Every message carries `message_uid`, stable across copies, compaction generations, and branches
  ([context engine docs](https://hermes-agent.nousresearch.com/docs/developer-guide/context-engine-plugin)).
  Tool rows carry `tool_call_uid`; the adapter uses these to dedupe retries and to prove result
  pairing.
- Recall injection is persisted with both the model-facing bytes (`api_content` sidecar) and a
  display row (`display_kind=memory_context`). The UI renders it. There is no "mirrored context"
  that the model saw but the user cannot.

---

## 4. RPC Boundary Discipline

### 4.1 Wire facts to design against **[EVIDENCE]**

| Fact | Consequence |
|---|---|
| Newline-delimited JSON over stdio; **not** JSON-RPC 2.0 | Do not reuse a JSON-RPC library; build a typed codec per `rpc-types.ts` |
| Physical stdout frame cap 1 MiB; protocol v2 chunks oversized objects as base64 `rpc_chunk` frames up to 64 MiB reassembled | Negotiate v2; validate `chunkId/index/count/byteLength`; reject interleaved sequences; enforce the reassembly cap |
| `ready` frame advertises versions and limits | Handshake must gate all sends on `ready` |
| Responses echo `id`; `bash`, `predict_word`, `prompt`, `steer_subagent` may respond out of order | Correlate on `id` only; never on arrival order |
| Malformed JSON yields a recoverable `command:"parse"` failure | Reader must not die on a bad frame; log, count, continue |
| Server spools stdout to a temp file under backpressure | Always read stdout, even after closing stdin; a stalled reader degrades to disk I/O |
| Closing stdin drains and exits 0; client must keep reading | Shutdown = close stdin → await EOF → await process exit |
| Session events include `agent_*`, `message_*`, `tool_execution_*`, etc. | Allowlist only what the adapter needs; never treat as transcript |
| `agent_end` has `isTerminal`, `yielded`, `awaitingAsyncWork` | Irrelevant for a tool backend (no turns), but the adapter must not key completion on `agent_end` |

Source for all rows: [OMP RPC reference](https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md).

Frame-class rules **[DESIGN]**:

| Class | Examples | Rule |
|---|---|---|
| Request/response | `halo.tool.invoke`, `halo.tool.cancel`, `get_state` | Exactly one terminal response per `id`; first response wins, a duplicate is a protocol violation; the adapter never completes a request from an event |
| Tool progress | `tool_execution_start/update/end` | Zero or more per `invocationId`; forwarded to UI/telemetry; never completes the invocation — the response does |
| Session/agent events | `agent_*`, `message_*`, `turn_*`, `prompt_result`, `session_settled` | Ignored in tool-backend mode; not in the event allowlist |
| Transport | `ready`, `rpc_chunk`, `rpc_frame_error` | Handled by the codec before dispatch; chunk members are reassembled, never surfaced individually |
| Unknown | any unrecognized `type` | Counted and dropped; never an error that kills the reader |

The hard rule: **an invocation is complete only when its correlated `response` arrives.** Progress
frames may stop early on a crash; the response may not. That is what makes synthetic-result
completion deterministic.

### 4.2 Required core patch (small, explicit, tested) **[DESIGN]**

Upstream has no way to invoke a tool without running a turn. The vendored core gains exactly three
HALO-owned commands; nothing else about its agent loop is kept:

```jsonc
// Invoke one registered tool, outside any agent turn.
{ "id": "r1", "type": "halo.tool.invoke", "invocationId": "inv_01",
  "tool": "edit", "args": { /* schema-validated */ }, "cwd": "C:\\work\\repo",
  "timeoutMs": 120000 }

// Cancel one in-flight invocation. AbortSignal-driven; adapter hard-kills on grace expiry.
{ "id": "r2", "type": "halo.tool.cancel", "invocationId": "inv_01" }

// Optional catalog refresh after a workspace/config change.
{ "id": "r3", "type": "halo.tool.catalog" }
```

Semantics:
- `halo.tool.invoke` resolves through the core's own registry (so OMP's tool semantics, path
  handling, and LSP/DAP state are preserved), runs the tool handler with an `AbortSignal`, and
  emits `tool_execution_start/update/end` correlated by `toolCallId = invocationId`.
- The adapter validates `tool` against the reconciled HALO catalog before sending a frame, and the
  core rejects names absent from its own registry. A denied tool (`task`, OMP memory tools,
  agent-loop commands) is therefore unreachable by name as well as absent from the model's schema.
- The response is terminal: `{type:"response", command:"halo.tool.invoke", data:{invocationId, result}}`.
- `halo.tool.cancel` returns `{cancelled: boolean}`. Tools that ignore the signal are abandoned;
  the supervisor then kills and restarts the child (coarse, but bounded).
- Tool-backend mode removes every command that can start or steer a model turn, or mutate a
  second transcript: `prompt`, `steer`, `follow_up`, `abort_and_prompt`,
  `abort_and_restore_queue`, `btw`/`btw_cancel`, `live_*`, `goal`, `bash`/`abort_bash`,
  `new_session`/`open_session`/`switch_session`/`branch`/`fork`/`handoff`, `compact`,
  `set_todos`, `predict_word*`, and model/thinking/queue-mode/cache-warming commands.
  It retains `get_state`, `get_available_commands`, `negotiate_protocol`, `set_event_filter`,
  `halo.tool.*`, and four pinned commands that accept only the safe value:
  `set_auto_compaction {enabled:false}`, `set_auto_retry {enabled:false}`,
  `set_subagent_subscription {level:"off"}`, and `set_host_tools`/`set_host_uri_schemes` with an
  empty list only.

Why patch rather than wrap: a proxy process that translated `halo.tool.invoke` into `prompt`
would reintroduce B1 and an LLM in the loop. The command must reach the same in-process tool
registry the agent would have used.

### 4.3 Cancellation and abort propagation **[DESIGN]**

One cancel token tree per turn:

```
turn.cancel
├── provider stream abort (HTTP disconnect)
├── each invocation: cancel_token → RPC halo.tool.cancel → AbortSignal
├── in-process tools: asyncio task cancel / threading.Event
├── memory ops: abort HTTP request; release lane lease
└── after grace (e.g. 2 s): kill coding-core child → restart → fail unresolved invocations
```

Invariants:
- **Every `tool_call_id` ends with a row.** On abort, crash, or timeout the adapter synthesizes
  `{ok:false, error_kind:"cancelled"|"backend_crashed"|"timeout"}` results *in call order* before
  the loop can issue the next provider request. OpenAI-format histories require every tool call to
  be answered; Hermes's alternation rules make this non-negotiable ([agent loop docs](https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop)).
- **At-most-once side effects.** An invocation is never replayed after a crash unless its registry
  entry is explicitly `idempotent: true` (read, grep, glob, lsp diagnostics). Side-effecting tools
  return an error and let the model retry deliberately.
- **Cancellation is scoped.** `halo.tool.cancel` targets one `invocationId`. It never aborts other
  sessions or the sibling calls in the same batch.

### 4.4 Backpressure **[DESIGN]**

| Direction | Mechanism | Shed policy |
|---|---|---|
| Core → adapter (frames) | Dedicated reader task; bounded queue (8k frames/session); coalesce `message_update`; `set_event_filter` pins the allowlist | Drop progress frames; never drop responses, `tool_execution_end`, or `rpc_chunk` members |
| Adapter → core (commands) | One writer task; per-session in-flight invocation cap (default 4, configurable) | Queue invocations; surface queue depth in metrics; do not block the loop |
| Adapter → memory | Lane semaphores + connection pool caps + HTTP timeouts | L1 fail-open; L2/L3 defer or cancel with retry |
| Core → temp spool | Server spools when the reader stalls | Treat spool growth (`temp` bytes) as a degradation signal; alert, then restart on threshold |

A "drop" here means a metric-visible frame omission, not silent data loss: terminal frames are
never dropped, and anything needed for the transcript is a response, not a progress event.

### 4.5 Crash detection, restart, and fencing **[DESIGN]**

Detection:
- `ChildProcess.exit` / stdout EOF, with exit code and last-N frames retained.
- `ready` handshake timeout (10 s).
- Liveness probe: `get_state` every 15 s with a 5 s timeout. Missed probes mark `degraded`;
  three consecutive misses terminate the child.

Restart:
- Backoff 0.5 s, 1 s, 2 s, 4 s; max 3 restarts in 5 minutes.
- On restart: new generation number, new process, repeat handshake + catalog reconciliation.
- **Generation fencing:** every RPC client instance carries `generation`; frames from a dead
  generation are discarded even if they arrive late. SQLite `tool_invocations` records the
  generation that served each call.
- Crash loop ⇒ circuit-open: coding tools return `backend_unavailable`; prompt, memory, and
  Hermes-native tools keep working; UI shows a degraded banner. This is preferable to a restart
  storm that starves the loop.

Windows process hygiene:
- The child is assigned to a Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, so LSP, DAP, and
  shell grandchildren die with it; child processes inherit the job by default
  ([Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)).
  A killed child is terminated with `TerminateJobObject` rather than `taskkill`, avoiding PID reuse
  races. Python can call this through `ctypes`; no new third-party dependency.
- Python's asyncio requires `ProactorEventLoop` for subprocesses on Windows (the default)
  ([Python asyncio subprocess](https://docs.python.org/3/library/asyncio-subprocess.html)).
- Spawn with `windowsHide` semantics and an explicit environment allowlist; never inherit provider
  secrets into the coding core beyond what a tool needs
  ([Node child_process](https://nodejs.org/api/child_process.html)).

### 4.6 Frame-replay testing **[DESIGN]**

The RPC boundary is the only place where a deterministic, byte-level test can prove the fusion:

1. **Record** every stdin/stdout frame per scenario into `tests/fixtures/rpc/<scenario>.jsonl`
   with direction, wall-clock, and generation.
2. **Replay** stdout frames through the adapter with a fake core; assert:
   - normalized `ToolResultEnvelope` bytes,
   - SQLite tool rows in call order,
   - no OMP event becomes a message,
   - cancellation emits exactly one synthetic result per unresolved call.
3. **Crash injection** at every frame index (EOF + exit code 1): assert `backend_crashed` results,
   generation bump, no replay of side-effecting calls.
4. **Protocol fuzz:** chunk interleaving, bad base64, wrong UTF-8, 1 MiB boundary, 64 MiB + 1,
   out-of-order responses, duplicate `id`, unknown `id`.
5. **Backpressure:** stop reading for N seconds, assert terminal frames still arrive and the
   adapter's queue does not grow without bound.

Each fixture is a contract test for the vendored core patch. When the core is re-imported, the
fixtures are the regression net.

---

## 5. The Four-Lane Scheduler

### 5.1 Why it cannot live in either subsystem **[EVIDENCE + DESIGN]**

- **Inside Hermes:** it sees only agent-side provider calls. Hindsight's consolidation runs in a
  separate process against Postgres and TEI; Hermes cannot admit, defer, or cancel it.
- **Inside Hindsight:** it sees only memory traffic. It has no signal that a user prompt is
  waiting, cannot reserve provider capacity for chat, and its semaphores are per-process — with a
  dedicated worker plus API process, there is no single decision point.
- **Observed pathology:** interactive recall with a 10 s deadline queued behind deadline-free
  consolidation on a shared semaphore (p50 wait 11.59 s for 1.12 s of work). Raising the deadline
  made it worse because the queue grew. A priority ordering over *one* semaphore does not fix
  head-of-line blocking; capacity must be partitioned and leases revocable.

Therefore the scheduler is **daemon-global**, sits in `halo-agent`, and is the only holder of the
provider transport and memory client.

### 5.2 Lanes

| Lane | Work | Concurrency (Standard profile) | Deadline | Preemptible | Failure mode |
|---|---|---|---|---|---|
| **L0** | Foreground provider calls for the main turn and its tool-loop iterations | 2 (1 reserved for main turn, 1 for subagent/aux) | Provider timeout | No | Surface provider error/fallback |
| **L1** | `recall`, `reflect`, prefetch for the next turn | 2 | soft 1.5 s, hard 5 s | Yes (lease) | Fail open: no memory, visible `memory.recall.skipped` |
| **L2** | `retain` after a turn (async), memory edits, pre-compress checkpoint | 1 | 60 s ack; checkpoint bounded by the turn | Yes (lease), except the checkpoint | Durable retry via `operation_id`; checkpoint fails closed |
| **L3** | Consolidation, mental-model refresh, reindex, export/import | 1 (+ worker slots) | none, but cancellable | Yes | Cancel/defer; never blocks L0/L1 |

Hardware profiles (Low / Standard / High) scale concurrency and TEI batches, but never change the
*ordering guarantees*.

What each lane wraps:
- **L0 wraps the provider transport attempt**, not the turn. Every retry and fallback attempt is a
  fresh acquire; the permit is held until the stream terminates or is cancelled. A retry cannot
  bypass admission because the loop calls `acquire` immediately around the transport.
- **L1–L3 wrap whole memory operations** (HTTP request plus local processing), so a permit covers
  the entire recall/retain/consolidation unit.
- **Tool dispatch is not lane-governed.** It has its own per-turn concurrency cap; coding-core
  calls are not memory traffic and must not be throttled by memory backpressure.

### 5.3 Admission algorithm **[DESIGN]**

```
permits[lane] = configured concurrency
reserved[L0] >= 1, reserved[L1] >= 1
borrowable = permits[lane] - reserved[lane]

acquire(lane):
  if free[lane] > 0: take it (non-revocable)
  elif lane can borrow from a lower lane: take a REVOCABLE lease
  else: enqueue in that lane's own FIFO (never a shared FIFO)

dispatch loop:
  always scan L0 first, then L1, L2, L3; a waiter only sees its own lane queue
  on L0 arrival:
    - cancel pending L3 operations via DELETE /v1/default/banks/{bank}/operations/{id}
    - close L3 submission gate
    - revoke borrowed leases held by L2/L3 (cancel token at next await)
```

Properties:
- **No shared FIFO.** Head-of-line blocking is structurally impossible: an L0 waiter cannot be
  behind an L3 waiter because they are not in the same queue.
- **Reserved permits.** L0 always has capacity even when every L3 permit is busy.
- **Revocable leases only draw on unreserved capacity.** L1 may borrow idle L2/L3 capacity; the
  lease can be revoked without touching L1's own reserved permit.
- **Deadline-bounded acquire.** Every non-L3 acquire has a deadline; expiry releases the waiter
  and returns a typed "not admitted" result rather than queueing indefinitely.
- **Idempotent lower lanes.** L2/L3 work carries `operation_id` or is cancel-and-retry safe, which
  is what makes revocation legal. The pre-compress checkpoint is the one exception: it is
  non-preemptible because compaction fails closed without it. Hindsight's async retain accepts a
  client-supplied `operation_id` and de-duplicates retries; pending operations are never started
  and processing operations cancel cooperatively
  ([API](https://hindsight.vectorize.io/api-reference)).

### 5.4 Mapping to Hindsight knobs **[DESIGN]**

The scheduler is the outer authority; Hindsight's internals are pinned to a *lower* ceiling so it
cannot oversubscribe behind the scheduler's back:

| Hindsight setting | HALO policy |
|---|---|
| `HINDSIGHT_API_WORKER_ENABLED` | `false` in the API; dedicated worker process |
| `HINDSIGHT_API_WORKER_MAX_SLOTS` | 2 on Standard; reserved consolidation slots ≥1 |
| `HINDSIGHT_API_LLM_MAX_CONCURRENT` | ≤ L0 + L1 + L2 budget minus provider headroom; Hindsight already prioritizes live requests over background jobs ([config](https://hindsight.vectorize.io/developer/configuration)) |
| `HINDSIGHT_API_RECALL_MAX_CONCURRENT` | 2–4 (matches L1) |
| `HINDSIGHT_API_ADMISSION_RECALL_MAX_IN_FLIGHT` / `...MAX_WAIT_MS` | small queue, ~2 s wait; returns 503 + Retry-After instead of hiding queue time |
| `HINDSIGHT_API_RERANKER_TEI_MAX_CONCURRENT` | 2 on CPU profiles (default 8 is GPU-sized) |
| `HINDSIGHT_API_EMBEDDINGS_MAX_CONCURRENT_REQUESTS` | 2–4 |
| TEI `--max-concurrent-requests` | ≥ `RERANKER_TEI_MAX_CONCURRENT × BATCH_SIZE`; TEI rejects requests when its pool is full ([config note](https://hindsight.vectorize.io/developer/configuration)) |
| `HINDSIGHT_API_RERANKER_TEI_HTTP_TIMEOUT` | raised above the default 30 s for CPU reranking |

The last row is one of the documented CPU-host failure modes: defaults tuned for GPU/beefy hosts.

When the Memory Model inherits the main agent model (the HALO default), Hindsight and L0 draw on
the same provider quota. In that configuration `HINDSIGHT_API_LLM_MAX_CONCURRENT` must be lowered
to the L1+L2 budget rather than the L0+L1+L2 budget, because Hindsight's LLM calls are background
from the prompt's perspective even when they use the same key.

Memory-model changes (Settings → Models → Memory Model) drain rather than interrupt:
1. close L2/L3 submission; 2. wait a bounded grace for in-flight operations or cancel pending ones;
3. restart the Hindsight API/worker with the new configuration; 4. wait for `/health/ready`;
5. reopen lanes. L0 is never blocked; L1 fails open with a visible warning during the window.

### 5.5 Metrics, SLOs, and failure behavior

Metrics per lane: queue depth, wait p50/p95/p99, permits in use, leases borrowed/revoked, deadline
misses, cancellations, and (for L0) time-to-first-token. Plus per-lane operation outcomes.

SLOs from PROJECT:
- permit acquire p99 < 5 ms uncontended (pure in-process asyncio primitives; no lock across processes);
- L0 p95 first-token ≤ 2× baseline under synthetic memory load;
- no consolidation blocks an L0/L1 waiter > 200 ms (guaranteed by reserved permits; measured).

Failure behavior:
- Memory service down: L1 fails open (turn proceeds, warning event), L2 spools operation intent
  in SQLite and retries, L3 stops. The loop never waits on memory availability.
- Provider rate-limited: L0 backs off and uses fallback; L3 submission gate closes so memory work
  does not compete for a saturated provider.
- Clock/lease bug: leases carry an absolute deadline and an owner id; a reaper releases expired
  leases. Metrics count reaper interventions; any is a bug.

### 5.6 Capacity and hardware profiles **[DESIGN]**

PROJECT defines Low (≤4 vCPU/8 GB), Standard (8/16), and High (≥16/32). The profile changes
resource sizes, never ordering guarantees:

| Resource | Low | Standard | High | Why |
|---|---|---|---|---|
| L0 / L1 / L2 / L3 permits | 1 / 1 / 1 shared / 1 shared | 2 / 2 / 1 / 1 | 2 / 3 / 2 / 2 | Prompt capacity first |
| Concurrent coding-core children | 1 | 2 | 4 | Biggest RSS consumer; idle children reaped |
| TEI embed batch / rerank batch | 8 / 16 | 16 / 32 | 32 / 64 | Must match TEI pool sizing |
| Postgres pool max | 5 | 10 | 20 | Hindsight's default 100 is desktop-hostile |
| Hindsight worker max slots | 1 | 2 | 3 | Background only |
| SQLite | one writer; WAL | one writer; WAL | one writer; WAL | Never scale writers |

The first bottleneck on a desktop is **memory**, not throughput: two coding-core children with LSP
and DAP can exceed a gigabyte before any model call. The second is **CPU reranking**, which is why
L1 has a hard deadline and fails open rather than queueing.

Coding-core children are LRU-managed against the profile cap. A session whose child was reaped
cold-starts on its next tool call; a turn that exceeds the cap waits at **tool-dispatch admission**,
never at the loop or at L0. The cap bounds RSS, not the number of open conversations.

---

## 6. Data Flow for One Turn (all lanes active)

```
t0  User input (Desktop/CLI) ──► halo-agent admission (durable row, turn_id)
t1  Loop persists user message; ContextEngine checks preflight compaction
      └─ if compacting: on_pre_compress checkpoint (L2, non-preemptible, foreground deadline)
         → rewrite → rotate transcript_id
t2  MemoryProvider.prefetch → L1 acquire
      ├─ admitted → POST /v1/default/banks/{bank}/memories/recall {query, budget, tags, max_tokens}
      ├─ deadline/denied → memory.recall.skipped event (visible), continue
      └─ result → wrap in delimited <memory_context> data block; append to turn's user message
         persist api_content + display row (display_kind=memory_context)
         emit context_message_added
t3  L0 acquire → provider stream → assistant message (text and/or tool_calls)
t4  Tool batch:
      resolve → capability → policy → dispatch
        in-process (Hermes/HALO) or RPC halo.tool.invoke (OMP) or child (gsd-tools) or MCP
      normalize → persist tool rows in call order → loop
t5  Terminal assistant message persisted; L0 released
t6  L2: retain turn (async=true, operation_id = uuid5(session_id, turn_id), tags=[session:<id>, ws:<hash>])
      ├─ 200 {operation_id} → persist memory_operations row (pending)
      ├─ timeout/5xx → retry with the SAME operation_id (idempotent)
      └─ release L2 permit; the server-side operation continues
t7  L1 (idle): queue_prefetch for the next turn; superseded if a new turn starts
t8  L3: Hindsight worker claims consolidation; scheduler monitors
      ├─ new prompt admitted → cancel pending L3 ops, close submission gate
      └─ completed → memory update event to Desktop memory page (no transcript write)
t9  Turn complete; renderer receives final events; session_settled equivalent emitted by HALO
```

Notes:
- **Recall is injected as data, not as system instructions.** It is delimited, provenance-tagged,
  and never merged into the stable system prompt (prompt-cache stability and injection resistance).
- **Retain never blocks the turn.** `async=true` returns after queuing; the operation is durable
  server-side and mirrored locally.
- **Consolidation never writes transcript.** It updates memory pages and statistics; the UI
  receives a memory event, not a chat message.
- **Abort path:** `turn.cancel` fires at any `t*`; permits released in `finally`; in-flight
  invocations get synthetic results; async retain already accepted is allowed to finish and its
  operation row is marked `unawaited`.

---

## 7. Recommended Project Structure

```
halo/
├── apps/
│   ├── desktop/                 # Electron main, preload, renderer
│   │   ├── main/                # daemon lifecycle, IPC sender validation, window mgmt
│   │   ├── preload/             # typed contextBridge API only
│   │   └── renderer/            # pages: chat, sessions, memory, lanes, settings, kanban, plugins
│   └── cli/                     # thin client over the daemon; no embedded loop
├── packages/
│   ├── halo_agent/              # Python: loop, registry, adapter, policy, scheduler, memory client
│   │   ├── loop/                # Hermes-derived conversation loop + turn phases
│   │   ├── tools/               # registry, ownership manifest loader, capability map
│   │   ├── adapter/             # batch admission, dispatch, normalization, artifact spill
│   │   ├── policy/              # gate, rule families, decision records, TDD state machine
│   │   ├── scheduler/           # lanes, leases, metrics
│   │   ├── memory/              # MemoryProvider, HindsightClient, operation mirror
│   │   ├── rpc/                 # codec, framing, chunk reassembly, supervisor, generation fencing
│   │   └── state/               # SQLite schema/migrations, single-writer facade
│   ├── halo_runtime/            # Python supervisor: postgres, tei x2, hindsight api/worker
│   └── shared_contracts/        # JSON Schemas: rpc frames, tool envelope, policy decision, events
├── vendor/
│   ├── oh-my-pi/                # squashed import + provenance; HALO patch set on top
│   ├── hermes-agent/            # squashed import + provenance
│   ├── hindsight/               # squashed import + provenance
│   └── gsd-omp/                 # squashed import + provenance (skills projection only)
├── runtime/                     # bundled postgres, pgvector, tei binaries, model cache rules
├── contracts/
│   └── tool-ownership.yaml      # name → backend, capabilities, allowed agents, timeout, idempotency
├── tests/
│   ├── fixtures/rpc/            # recorded frame ledgers
│   ├── policy/                  # rule matrix + bypass fixtures
│   ├── lanes/                   # SLO harness with synthetic load
│   └── e2e/                     # Desktop+CLI against one daemon
└── tools/                       # provenance verifier, rebrand linter, build orchestrator
```

Structure rationale:
- `vendor/` is quarantined; patches to vendored code live in a named patch set and are exercised by
  the replay fixtures. No HALO logic is written inside vendored trees except the three RPC
  commands and the capability profile.
- `contracts/` is the only place tool ownership and capabilities are declared. Both the Python
  registry and the build-time catalog export read it.
- `packages/halo_agent` never imports `vendor/hindsight`; it speaks HTTP. It may import Hermes
  modules (same process), but only through the `loop/` facade.

---

## 8. Build Order and Dependency Edges

Dependency edges (each arrow is a hard prerequisite):

```
P1 → P2
P1 → P3
P2 → P3            # contracts: ToolRequest/Decision, ToolResultEnvelope, frame codec
P2 → P4
P3 → P4            # no OMP tool ships before halo.tool.invoke exists
P2 → P5            # scheduler interface + provider transport
P2 → P6
P5 → P6            # memory pages need a live memory service
P4 → P7
P5 → P7
P6 → P7
P7 → P8
```

Critical path: **P1 → P2 → P3 → P4 → P7 → P8**. P5 runs in parallel from P2 and is the long pole
for P6/P7; start it as soon as the scheduler interface exists, not after P4.

| Phase | Delivers | Depends on | Exit gate |
|---|---|---|---|
| **P1 Foundation** | Monorepo layout, squashed imports + provenance manifest, rebrand linter, one Windows build command, contracts package skeleton | — | Clean build from a fresh clone; provenance verifier passes; no upstream remotes/submodules |
| **P2 Unified loop + gate** | Hermes-derived loop, SQLite single writer, in-process registry, `PolicyGate` with safety/TDD/memory-routing rules, adapter for in-process tools, minimal CLI TUI | P1 | A turn runs entirely in Python; a denied write produces a policy row and a synthetic tool result; transcript alternation holds under abort |
| **P3 RPC tool backend** | Vendored core patch (`halo.tool.invoke/cancel/catalog`, backend mode), supervisor, codec + v2 chunking, generation fencing, frame recorder, crash/restart | P1; P2 contracts | `read`/`edit`/`grep`/`bash` driven from Python with no OMP turn; replay suite green; crash injection leaves no unanswered tool call |
| **P4 Registry unification + OMP surface** | `tool-ownership.yaml`, full catalog reconciliation, capability tags, OMP tools (LSP/DAP/AST/browser/eval), HALO subagents as child sessions, TDD enforcement with test evidence | P2 + P3 | Every OMP tool is reachable and policy-gated; no duplicate names; subagent tools produce decision rows; TDD RED→GREEN→REFACTOR blocked when violated |
| **P5 Memory + scheduler** | `halo-runtime` (Postgres/pgvector, TEI×2, Hindsight api/worker), `MemoryClient`, four lanes + leases, recall injection with display rows, async retain with `operation_id`, operation mirror | P2 (scheduler hooks); parallel with P3/P4 | L1 fail-open under forced timeout; L0 SLO under synthetic L3; recall injection visible in UI and persisted; retain idempotent across retry |
| **P6 Surfaces** | Electron main/preload/renderer, typed IPC, session authority HTTP/WS, approvals, session list/resume, lanes panel, memory health panel; CLI attaches to the same daemon | P2; P5 for memory panels | Desktop and CLI share one session and one writer; renderer cannot fetch the daemon port; approval round-trip works |
| **P7 Plugins, GSD, skills, Kanban** | Plugin host with capability-scoped context, hook bus (deny-only), `gsd_invoke` runner + GSD skill projection into Hermes and OMP skill dirs, GSD phase state feeding the gate, Kanban, full memory page | P4 + P5 + P6 | A plugin cannot reach a backend; GSD phase invariants enforced with OMP extensions disabled; memory page browses/searches/prunes/exports |
| **P8 Hardening + packaging** | Windows installer, service/autostart, migration shims for Hermes/OMP configs, crash-loop circuit breaker, backpressure soak, secret-redaction audit, perf budget report | all | Install/run on clean Windows box; SLOs met; no secrets in logs; migration fixture from pre-HALO configs |

Critical path: **P1 → P2 → P3 → P4 → P7 → P8**. P5 is parallel after P2 and becomes the long pole
for P6/P7; start it as soon as the scheduler interface exists, not after P4.

Sequencing rules:
- Do not implement OMP tools (P4) before the gate exists (P2), or the first coding tool will be
  shipped ungated.
- Do not implement subagents before the tool-invocation protocol (P3), or the subagent will be
  tempted back into OMP's loop.
- Do not ship Desktop (P6) before the session authority (P2), or Electron will grow a second loop.
- Memory (P5) can start early because its contract is HTTP + lanes; it does not need the coding
  core.

---

## 9. Anti-Patterns (specific to this fusion)

### Anti-pattern 1: "Keep OMP's loop for subagents"
**What people do:** leave `task` enabled so subagents "just work".
**Why it's wrong:** subagent tool calls then execute inside OMP with no policy row, no lane
accounting, and no transcript authority. This is B4, and it silently voids the core value.
**Do instead:** HALO child sessions driven by the same loop; OMP provides tool implementations, not
agents.

### Anti-pattern 2: "Policy as a plugin/hook"
**What people do:** register the TDD/safety rules as a `pre_tool_call` hook alongside other plugins.
**Why it's wrong:** hook ordering, plugin enablement, and exceptions make policy optional; Hermes
explicitly treats hook crashes as "logged and skipped"
([plugins](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins)).
**Do instead:** policy is a first-class gate; plugins may only add constraints.

### Anti-pattern 3: "One semaphore for memory"
**What people do:** put recall and consolidation behind one concurrency limit and tune the deadline.
**Why it's wrong:** that is the observed 11.59 s pathology; deadline tuning changes queue length, not
head-of-line blocking.
**Do instead:** partitioned lane capacity, reserved permits, revocable leases, no shared FIFO.

### Anti-pattern 4: "Use OMP's session as the transcript"
**What people do:** read `get_messages` or persist `message_end` frames to avoid rebuilding history.
**Why it's wrong:** two transcripts diverge, OMP compaction re-enters the picture, and the visible
transcript stops matching what the model received.
**Do instead:** one SQLite transcript; OMP runs `--no-session` and is never read back.

### Anti-pattern 5: "Run retain synchronously to guarantee it lands"
**What people do:** `async=false` so the turn knows the memory was written.
**Why it's wrong:** retain does LLM extraction and can take seconds; it blocks the turn and
competes with the next prompt for provider capacity.
**Do instead:** `async=true` with a deterministic `operation_id`, local mirror row, and retry.

### Anti-pattern 6: "Trust the tool name"
**What people do:** block `bash` but allow `eval`; allow `write` but forget `ast_edit`.
**Why it's wrong:** capability laundering by alias.
**Do instead:** capability classes on every entry, unknown capability denies.

### Anti-pattern 7: "Replay in-flight tool calls after a crash"
**What people do:** restart the core and resend unanswered invocations.
**Why it's wrong:** non-idempotent edits and shell commands execute twice.
**Do instead:** synthesize `backend_crashed` results; retry only entries marked idempotent.

### Anti-pattern 8: "Let the renderer talk to the daemon"
**What people do:** hand the renderer the loopback token for convenience.
**Why it's wrong:** any XSS or malicious Desktop plugin becomes a full backend client, bypassing
approvals and policy.
**Do instead:** main-process IPC with sender validation; no token in the renderer
([Electron security](https://www.electronjs.org/docs/latest/tutorial/security)).

---

## 10. Integration Points

### External services

| Service | Integration | Gotchas |
|---|---|---|
| Hindsight API | HTTP, bank-scoped under `/v1/default/banks/{bank_id}` | Retain is async by default only when asked; pass `async=true` + `operation_id`; recall is synchronous and budget-bounded |
| Hindsight worker | Separate process, Postgres as broker | Must be decommissioned/released on shutdown; reserved slots must sum ≤ max slots |
| PostgreSQL + pgvector | Native binaries, loopback, random password, per-profile data dir | Startup readiness must gate Hindsight; crash recovery can take seconds |
| TEI embedder/reranker | HTTP sidecars | Pool sizing must match Hindsight concurrency × batch; CPU reranking needs higher timeouts |
| Provider APIs | L0 scheduler | Rate limits and fallback chains interact with L3 admission |
| MCP servers | Adapter backend | Treat as `backend.raw`; no direct client handle in plugins |

### Internal boundaries

| Boundary | Communication | Contract |
|---|---|---|
| Loop ↔ Adapter | direct calls | `invoke_batch(tool_calls) -> list[ToolResultEnvelope]`, order-preserving |
| Adapter ↔ Gate | direct, pure | `evaluate(ToolRequest) -> PolicyDecision` |
| Adapter ↔ Core | stdio JSONL | `halo.tool.invoke/cancel`, v2 chunking, generation fencing |
| Loop ↔ Memory | MemoryProvider + MemoryClient | prefetch/sync_turn/checkpoint; lane-wrapped HTTP |
| Loop ↔ Scheduler | direct | `acquire(lane, deadline) -> Lease`; release/revoke |
| Agent ↔ Runtime | HTTP + `runtime.json` | health/ready, operations, bank config |
| Desktop/CLI ↔ Agent | HTTP/WS + `agent.json` | admit input, stream events, approvals, settings |
| Plugin ↔ Host | Python context API | capabilities only; no backend handles |

---

## 11. Confidence Assessment

| Area | Confidence | Notes |
|---|---|---|
| OMP RPC mechanics (framing, chunking, backpressure, cancel, event names) | HIGH | Official `docs/rpc.md` + `rpc-types.ts` |
| OMP extension/tool interception behavior | HIGH | Official `docs/extensions.md` |
| Hermes loop, dispatch, hooks, session schema, compaction, provider interface | HIGH | Official developer docs, current at research time |
| Hindsight retain/recall/operations/concurrency/cancel semantics | HIGH | API reference + configuration reference, API 1.1 |
| gsd-omp extension/projection boundary | HIGH | Project architecture doc |
| Three-command core patch effort | MEDIUM | Design is small, but the vendored core's registry internals were not opened; estimate assumes tool handlers are callable outside a turn |
| Per-session process model and memory footprint | MEDIUM | OMP process cost per session unmeasured; needs a spike on the Windows target |
| Windows Job Object integration via ctypes | MEDIUM | Mechanism is documented; ownership of already-jobbed children (IDE-launched) needs a spike |
| TDD policy expressiveness in a pure gate | MEDIUM | Phase invariants are clear; the minimal evidence model (failing-test record, file scope) needs design in the phase |
| SLO numbers under CPU TEI | LOW–MEDIUM | Bounds are specified; actual p95 requires the P5 harness |

---

## 12. Gaps to Address in Later Research

- **OMP tool-handler invocability:** confirm in the vendored source that every built-in tool handler
  can be called with a supplied `cwd`, `AbortSignal`, and no agent context. If some (e.g. `task`,
  `todo`, `ask`) cannot, exclude them from the catalog rather than faking context.
- **Process cost:** measure cold start and RSS per coding-core child on Low hardware; decide
  whether idle children are reaped after N minutes (design assumes yes).
- **Hindsight bank granularity:** per-workspace bank vs per-user bank with workspace tags. The
  design assumes per-workspace with `session:` and `ws:` tags; validate recall quality and pruning
  ergonomics.
- **TDD evidence model:** what constitutes a "failing test" record the gate can trust (runner exit
  code + test id + file hash), and how REFACTOR proves behavior unchanged.
- **Desktop plugin sandbox:** whether renderer-side plugin pages can be constrained enough to keep
  the no-token rule without breaking the Hermes Desktop plugin API.
- **Windows service mode:** whether `halo-runtime` should run as a user-session process or a
  scheduled task for pre-login availability; v1 assumes user session.

---

## Sources

- oh-my-pi RPC protocol: <https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md>
- oh-my-pi RPC command union: <https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/modes/rpc/rpc-types.ts>
- oh-my-pi extensions and tool interception: <https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md>
- oh-my-pi capability overview (tools, subagents, eval re-entry, memory tools): <https://github.com/can1357/oh-my-pi>
- Hermes architecture: <https://hermes-agent.nousresearch.com/docs/developer-guide/architecture>
- Hermes agent loop: <https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop>
- Hermes tools runtime: <https://hermes-agent.nousresearch.com/docs/developer-guide/tools-runtime>
- Hermes session storage: <https://hermes-agent.nousresearch.com/docs/developer-guide/session-storage>
- Hermes gateway local sessions: <https://hermes-agent.nousresearch.com/docs/developer-guide/gateway-local-sessions>
- Hermes plugins and hook reference: <https://hermes-agent.nousresearch.com/docs/developer-guide/plugins>
- Hermes context engine plugin: <https://hermes-agent.nousresearch.com/docs/developer-guide/context-engine-plugin>
- Hermes memory provider plugin: <https://hermes-agent.nousresearch.com/docs/developer-guide/memory-provider-plugin>
- Hindsight HTTP API: <https://hindsight.vectorize.io/api-reference>
- Hindsight configuration: <https://hindsight.vectorize.io/developer/configuration>
- Hindsight services: <https://hindsight.vectorize.io/developer/services>
- Hindsight installation/platforms: <https://hindsight.vectorize.io/developer/installation>
- Hindsight retain semantics: <https://hindsight.vectorize.io/developer/retain>
- gsd-omp architecture: <https://github.com/tchivs/gsd-omp/blob/main/docs/ARCHITECTURE.md>
- Electron security checklist: <https://www.electronjs.org/docs/latest/tutorial/security>
- Node child processes: <https://nodejs.org/api/child_process.html>
- Python asyncio subprocesses (Proactor on Windows): <https://docs.python.org/3/library/asyncio-subprocess.html>
- Windows Job Objects: <https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects>

---
*Architecture research for: HALO — fused agent product*
*Researched: 2026-10-23*
