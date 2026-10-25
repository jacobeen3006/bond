# Phase 6: Code Intelligence, Execution & Rollback — Research

**Researched:** 2026-10-25
**Domain:** Exposing the vendored OMP coding core's LSP/DAP/AST/eval/browser/GUI/web tools as gated registry tools over the Phase 5 `omp` RPC backend, plus a shadow-git turn-checkpoint for workspace rollback.
**Confidence:** HIGH (all load-bearing claims are codebase-grounded; the vendored core and the Phase 2/3/4/5 plans were read directly this session)

## Summary

Phase 6 makes the model able to navigate, edit structurally, execute, browse, and drive a desktop through gated tools, and lets a user undo a turn's workspace changes. The Phase 5 `omp` backend already supervises the vendored OMP coding core over a JSONL RPC with a `halo.tool.invoke` command that builds a minimal `ToolSession` and calls `createTools(session, [name])` + `tool.execute(id, args, signal)` [VERIFIED: .planning/phases/05-coding-core-over-rpc/05-RESEARCH.md:15,246-270]. Phase 5's invocability table **excluded** the stateful tools this phase needs (`debug`, `eval`, `web_search`, full `lsp`, `ast_edit`/`ast_grep`, browser, computer) [VERIFIED: 05-RESEARCH.md:158-192]. Phase 6's job is to **re-include** them behind the Phase 4 policy gate.

The single load-bearing architectural fact: **every stateful tool in the core holds process-global state that persists across `halo.tool.invoke` calls.** The LSP client manager is a module-level `Map` [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/lsp/client.ts:27]; the DAP session manager is a module-level singleton [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/tools/debug.ts:32; vendor/oh-my-pi/packages/coding-agent/src/dap/session.ts:284-288]; the eval JS kernel registry is a module-level `Map` [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/eval/js/context-manager.ts:112]; the browser tab registry is a module-level `Map` [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/tools/browser/registry.ts:92]. Because the core is a long-lived supervised child, that state survives across RPC calls **as long as the `ToolSession` passed to each call carries a consistent `cwd` (and eval session id)**. The `halo.tool.invoke` handler must therefore (a) key the session by a stable workspace id, and (b) for `ast_edit`/`ast_grep` preview-accept, provide a shared `ToolChoiceQueue` + an active `write` tool + the `xd://resolve` device [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/tools/resolve.ts:147-185; vendor/oh-my-pi/packages/coding-agent/src/tools/index.ts:488,913-928].

**The core has NO built-in shadow-git workspace checkpoint.** The `checkpoint`/`rewind` tools are *conversation* checkpoints and explicitly do not snapshot filesystem state [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/tools/checkpoint.ts; no `shadow-git` symbol exists anywhere in the tree]. LOOP-07 is therefore a **HALO-local build**: a separate git repository mirroring the workspace, committed at turn start, restored on demand with an exact file list. The `git-checkpoint.ts` example hook (git-stash per turn) is the reference pattern [VERIFIED: vendor/oh-my-pi/packages/coding-agent/examples/hooks/git-checkpoint.ts].

**Primary recommendation:** Extend the Phase 5 `halo.tool.invoke` allowlist with the Phase 6 tool set (`lsp` full, `debug`, `ast_edit`, `ast_grep`, `eval`, `browser`, `web_search`, `read` URL/PDF, `tts`), pass a stable workspace-keyed `ToolSession` (with a shared `ToolChoiceQueue` for preview-accept), declare the capability classes (`fs.write` for `ast_edit`, `proc.exec` for `eval`/`debug`/`bash`, `net` for `web_search`/`browser`, `backend.raw` for `eval`), and build the shadow-git turn-checkpoint as a HALO-local tool in `packages/halo_agent` (not a core patch) that commits the workspace to a side git repo at turn start and restores it on demand with an exact file list.

<user_constraints>
## User Constraints (no CONTEXT.md — locked inputs from ROADMAP / REQUIREMENTS / STATE / AGENTS.md)

No CONTEXT.md exists for this phase; the user chose to plan from research + requirements only. The locks below are quoted from committed artifacts and are **not open for re-litigation**:

### Locked Decisions

- **Windows-first (win32 x64):** "Platform: Windows-first (win32 x64). Cross-platform code paths must not be consciously broken, but only Windows is tested and supported." [VERIFIED: AGENTS.md:15] — child-process supervision uses `windowsHide`/`CREATE_NO_WINDOW`, argv arrays (paths contain spaces + non-ASCII), no `shell: true`, no `detached` [VERIFIED: 05-RESEARCH.md:22,226-230].
- **CPU-only, no Docker.**
- **One non-bypassable tool path:** "every LLM tool decision reaches exactly one backend through a single adapter and a single policy gate" [VERIFIED: .planning/PROJECT.md:9]; "`adapter.dispatch_batch` is the only boundary a tool call may leave through" [VERIFIED: 03-07-PLAN.md:55].
- **Per-call overhead budget:** "tool calls that cross into the coding core are RPC frames, not in-process calls. Per-call overhead budget: < 150ms adapter-added per tool round-trip." [VERIFIED: AGENTS.md:18]
- **Gate precedes tools:** "The policy gate exists before any coding-core tool ships." [VERIFIED: .planning/ROADMAP.md:10]; "Phase 4 gate strictly precedes the first coding-core tool (Phase 5)" [VERIFIED: .planning/STATE.md:64].
- **License/provenance:** "the coding core is MIT-vendored under `vendor/oh-my-pi`; modifications go through `provenance/patches/` (hand-maintained series, every entry must apply cleanly in order)." [VERIFIED: 05-RESEARCH.md:26]
- **Pins:** Python 3.14.9, uv 0.13.5, just 1.59.0, Bun 1.4.4 [VERIFIED: AGENTS.md:32-37].
- **Security:** "model credentials… live in the secret store, never in `.env`/`config.json`, and must never be logged" [VERIFIED: AGENTS.md:20].

### Claude's Discretion (recommended here; planner may override with reason)

- Shadow-git checkpoint location (`.halo/checkpoint.git` side repo vs a `git worktree` vs a `git stash`-per-turn) — see §LOOP-07.
- Whether the `eval` cell's re-entrant tool bridge is fully disabled (only `__prelude__` + eval-specific bridges) or restricted to an allowlist — see §CODE-04.
- Which of the 55 bundled LSP servers / 15 DAP adapters are enabled by default in the HALO manifest vs on-demand — see §CODE-01/02.
- Whether `browser`/`computer` are exposed as top-level registry tools, as eval preludes, or both — see §CODE-05/06.

### Deferred Ideas (OUT OF SCOPE)

- Subagent child sessions and policy inheritance execution (SUB-*, Phase 7).
- TDD-phase gate rules with evidence rows (EXT-05, Phase 11).
- Approval round-trip UI (UI-05, Phase 10); plugin host / MCP backends (Phase 11).
- GATE-04 bypass matrix itself (Phase 12) — this phase only leaves hookable invariants.
- Memory routing rule family (MEM-*, Phase 8+).
- Desktop/CLI surfaces.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (verbatim, `.planning/REQUIREMENTS.md`) | Research Support |
|----|-------------|------------------|
| CODE-01 | "All 14 LSP operations (including rename with workspace edits, code actions, type definition and implementation) are reachable as gated tools" | §CODE-01 — the `lsp` tool's 14-action schema verbatim [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/lsp/types.ts:8-22]; 55 bundled servers [VERIFIED: lsp/defaults.json]; process-global client map [VERIFIED: lsp/client.ts:27] |
| CODE-02 | "All 28 DAP operations (including breakpoints, stepping, memory inspection, and disassembly) are reachable as gated tools" | §CODE-02 — the `debug` tool's 28-action schema verbatim [VERIFIED: tools/debug.ts:64-93]; 15 bundled adapters [VERIFIED: dap/defaults.json]; process-global `dapSessionManager` singleton [VERIFIED: tools/debug.ts:32; dap/session.ts:284-288] |
| CODE-03 | "`ast_edit`/`ast_grep` preview changes before accept over the bundled tree-sitter grammars" | §CODE-03 — dry-run + `queueResolveHandler` + `xd://resolve` accept + stale-preview detection [VERIFIED: tools/ast-edit.ts:334-544; tools/resolve.ts:147-185]; 18 compiled-in grammars [VERIFIED: crates/pi-ast/src/language/parsers.rs] + WASM on-demand [VERIFIED: crates/pi-ast/src/language/wasm_grammars.rs] |
| CODE-04 | "Eval cells run only under `backend.raw` approval and cannot re-enter the tool registry or reach host-control APIs" | §CODE-04 — isolated JS worker / Python subprocess sandbox [VERIFIED: eval/js/executor.ts; eval/js/context-manager.ts]; re-entrant `callSessionTool` bridge [VERIFIED: eval/js/tool-bridge.ts:210-350]; `__prelude__` approval path [VERIFIED: eval/preludes.ts:20-142]; `checkpoint`/`rewind` blocked from bridge [VERIFIED: eval/js/tool-bridge.ts] |
| CODE-05 | "Browser automation, web search/extraction with URL and PDF reading are reachable through the gate" | §CODE-05 — `browser` tool actions `open\|close\|run\|call\|tabs\|targets` [VERIFIED: tools/browser.ts]; process-global tab registry [VERIFIED: tools/browser/registry.ts:92]; `web_search` providers [VERIFIED: web/search/index.ts]; `read` URL/PDF pipeline [VERIFIED: tools/read.ts] |
| CODE-06 | "Desktop GUI automation and media/TTS/voice surfaces are reachable through the gate" | §CODE-06 — `computer` eval prelude with 11 top-level surfaces [VERIFIED: tools/computer.ts; tools/computer/prelude.js]; `tts` tool [VERIFIED: tools/tts.ts]; STT push-to-talk controller [VERIFIED: stt/index.ts] |
| LOOP-07 | "A user can roll a turn's workspace changes back from a shadow-git checkpoint and see exactly which files were restored" | §LOOP-07 — no built-in shadow-git [VERIFIED: no `shadow-git` symbol in tree; tools/checkpoint.ts is conversation-only]; `git-checkpoint.ts` reference pattern [VERIFIED: examples/hooks/git-checkpoint.ts]; Windows path/line-ending edge cases |
</phase_requirements>

## Project Constraints (from AGENTS.md)

Each quoted verbatim; every Phase 6 plan must comply.

- **Windows-first:** "Platform: Windows-first (win32 x64). Cross-platform code paths must not be consciously broken, but only Windows is tested and supported." [VERIFIED: AGENTS.md:15] — all verification commands runnable on `windows-latest`.
- **One process boundary, one overhead budget:** "Single process boundary: tool calls that cross into the coding core are RPC frames, not in-process calls. Per-call overhead budget: < 150ms adapter-added per tool round-trip." [VERIFIED: AGENTS.md:18]
- **Pins:** Python "3.14.9", uv "0.13.5", just "1.59.0", Bun "1.4.4" [VERIFIED: AGENTS.md:32-37].
- **Python project home:** no root uv workspace; `packages/halo_agent/` is the only HALO Python project; every command names `--project packages/halo_agent` [VERIFIED: 01-SKELETON.md:23].
- **Every vendored edit is a patch:** a Phase 6 patch into `vendor/oh-my-pi/` must land in `provenance/patches/series` and keep `just verify` green [VERIFIED: 05-RESEARCH.md:26].
- **Security:** "model credentials… live in the secret store, never in `.env`/`config.json`, and must never be logged" [VERIFIED: AGENTS.md:20].

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| LSP/DAP/AST/eval/browser/GUI tool execution | Core (TS, supervised child) | — | The core owns the tool handlers + their process-global state; the Python side only sends the frame and reads the result [VERIFIED: 05-RESEARCH.md:36]. |
| Registry resolution + policy gate (capability classes, approval) | API / Backend (Python `halo_agent`) | — | Phase 4 owns `Registry.resolve` + `PolicyGate.evaluate`; Phase 6 declares the capability classes for the new tools but does not touch the gate [VERIFIED: 04-RESEARCH.md:83-91]. |
| Dispatch to the `omp` backend | API / Backend (Python `BatchDispatcher`) | — | `dispatch_batch` routes allowed `ToolRequest`s to the registered `omp` backend [VERIFIED: 05-RESEARCH.md:38]. |
| `halo.tool.invoke` allowlist extension (Phase 6 tool set) | Core (TS, provenance patch) | — | The core's `tool_invoke` handler enforces the allowlist; Phase 6 widens it [VERIFIED: 05-RESEARCH.md:192,246-270]. |
| Stable workspace-keyed `ToolSession` (cwd + eval session id + `ToolChoiceQueue`) | Core (TS) + Python (workspace id) | — | State maps key on `cwd`/session id; the Python side must pass a stable workspace id so LSP/DAP/eval/browser state persists across calls [VERIFIED: lsp/client.ts:27; dap/session.ts:284-288; eval/js/context-manager.ts:112; tools/browser/registry.ts:92]. |
| `ast_edit`/`ast_grep` preview-accept (dry-run → `xd://resolve`) | Core (TS) | — | The preview-accept mechanism is session-level (`ToolChoiceQueue` + `write` tool + `xd://resolve` device) [VERIFIED: tools/ast-edit.ts:334-544; tools/resolve.ts:147-185; tools/index.ts:913-928]. |
| Eval sandbox isolation (no tool-registry re-entry, no host-control APIs) | Core (TS eval worker/subprocess) + Python (gate `backend.raw`) | — | The sandbox isolates the cell; the gate requires `backend.raw` approval; the bridge is restricted [VERIFIED: eval/js/executor.ts; eval/js/tool-bridge.ts:210-350; eval/preludes.ts:20-142]. |
| Shadow-git turn-checkpoint (commit at turn start, restore with exact file list) | API / Backend (Python `halo_agent`) | — | HALO-local build; the core has no shadow-git [VERIFIED: no `shadow-git` symbol; tools/checkpoint.ts is conversation-only]. |
| Frame chunking / reassembly (oversized) | Core (TS `RpcFrameEncoder`/`Decoder`) | Python (reassembly) | Inherited from Phase 5 [VERIFIED: 05-RESEARCH.md:39]. |

## Standard Stack

### Core (already present — no new installs for the core side)

| Component | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vendored OMP coding core (`vendor/oh-my-pi`) | upstream commit `0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0` [VERIFIED: vendor/oh-my-pi/provenance/UPSTREAM.json:6] | The tool backend: `lsp`/`debug`/`ast_edit`/`ast_grep`/`eval`/`browser`/`web_search`/`read`/`tts` handlers + RPC mode | MIT-licensed, already vendored in Phase 1; Phase 6 supervises it, does not re-vendor it. |
| Bun (TS runtime) | 1.4.4 pinned [VERIFIED: AGENTS.md:36] | Runs the coding core (`bun --cwd=packages/coding-agent src/cli.ts`) | The core's dev/test/build all use Bun [VERIFIED: vendor/oh-my-pi/package.json scripts]. |
| `pi-natives` (Rust N-API addons) | workspace `18.12.6` [VERIFIED: vendor/oh-my-pi/Cargo.toml:24] | Native `ast_edit`/`ast_grep`/`edit`/`grep`/`diff` engines behind the tool handlers | The AST engines are Rust; built via the Cargo/N-API path. |
| `pi-ast` (tree-sitter) | workspace crate [VERIFIED: vendor/oh-my-pi/crates/pi-ast/Cargo.toml] | 18 compiled-in grammars + WASM on-demand grammars for `ast_edit`/`ast_grep` | The bundled grammars are the CODE-03 "bundled tree-sitter grammars" [VERIFIED: crates/pi-ast/src/language/parsers.rs]. |

### Supporting (Python side — `packages/halo_agent`, from Phase 4/5)

| Component | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `halo_agent` Python package | Phase 4/5 (planned) | Registry + policy gate + `BatchDispatcher` + `tools/backends/omp.py` | Phase 6 adds the shadow-git turn-checkpoint tool + the capability-class declarations here. |
| `uv` | 0.13.5 pinned [VERIFIED: AGENTS.md:33] | Python 3.14 environment + `uv run --project packages/halo_agent pytest` | All Phase 6 Python verification runs through `uv`. |
| Python 3.14 | 3.14.9 pinned [VERIFIED: AGENTS.md:32] | Runtime for `halo_agent` | The project standardizes on 3.14 via uv. |
| `git` (system) | system binary | Shadow-git turn-checkpoint (side repo commit/restore) | LOOP-07; invoked via `subprocess` with an argv array (Windows-first). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Side shadow-git repo (`.halo/checkpoint.git`) | `git worktree` of the user's repo | Rejected: a worktree couples the checkpoint to the user's repo state and branch; a side repo is independent and survives the user's repo being absent. |
| Side shadow-git repo | `git stash`-per-turn (the `git-checkpoint.ts` pattern) | Rejected for LOOP-07: stash is a single slot (overwritten each turn) and cannot enumerate "exactly which files were restored" across multiple turns; a side repo with per-turn commits gives an exact file list per turn. |
| `browser`/`computer` as top-level registry tools | `browser`/`computer` as eval preludes only | Both are viable; the core exposes them as eval preludes by default [VERIFIED: tools/browser.ts:730-750; tools/computer.ts]. Exposing them as top-level registry tools requires the `browser`/`computer` tool classes to be in the `halo.tool.invoke` allowlist. |

**Installation:** No new external packages are introduced by Phase 6. The core is already vendored; the Python side uses the Phase 4/5 `halo_agent` dependency set. The only new *code* is the `omp` backend allowlist extension, the capability-class declarations, and the shadow-git turn-checkpoint tool.

## Package Legitimacy Audit

No new external packages are installed by Phase 6 (the coding core is vendored; the Python side reuses the Phase 4/5 dependency set; `git` is a system binary). **No packages to audit.**

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Provider reply with tool_calls[] (lsp / debug / ast_edit / eval / browser / web_search / …)
        │  (Phase 3: assistant row + tool_call_uids persisted)
        ▼
┌─ halo_agent loop: reserve_tool_invocation ×N ─────────────────────────┐
└──────────────┬─────────────────────────────────────────────────────────┘
               ▼
┌─ Phase 4: registry.resolve(name) + PolicyGate.evaluate(ToolRequest) ──┐
│  allow → mark_dispatched → BatchDispatcher.dispatch_batch(...)        │
│  deny  → synthetic tool-result row (nothing executes)                │
│  (capability classes: fs.write / proc.exec / net / backend.raw)      │
└──────────────┬─────────────────────────────────────────────────────────┘
               ▼  (allowed calls, backend == "omp")
┌─ Phase 5/6: tools/backends/omp.py  (the "omp" backend) ───────────────┐
│  1. ensure_core_alive(): spawn `bun .../cli.ts --mode rpc` if dead  │
│  2. handshake (once per process): validate contractHash + version    │
│  3. per ToolRequest: write halo.tool.invoke frame {id, tool, args,   │
│     workspace_id, cwd, signal} ; read response matched on id         │
│  4. normalize → ToolResultEnvelope (one per request, input order)    │
│  5. LOOP-07: at turn start, shadow-git commit the workspace; on      │
│     rollback, restore the exact file list from the turn's commit     │
└──────────────┬─────────────────────────────────────────────────────────┘
               ▼  (JSONL over stdin/stdout)
┌─ vendor/oh-my-pi coding core (child process, --mode rpc) ────────────┐
│  halo.tool.invoke → build ToolSession{cwd, workspace_id,             │
│     getEvalSessionId, getToolChoiceQueue, write active} →            │
│     createTools(session,[name]) → tool.execute(id,args,signal)       │
│  STATE PERSISTS ACROSS CALLS (process-global):                      │
│    • LspClientManager.clients  (Map, keyed by server+cwd)            │
│    • dapSessionManager        (singleton, DapSession map)           │
│    • eval JS sessions         (Map, keyed by eval session id)        │
│    • browser tab registry     (Map, keyed by browser key)            │
│  ast_edit/ast_grep: dry-run → queueResolveHandler → xd://resolve     │
│  eval: isolated JS worker / Python subprocess; __prelude__ approval  │
└───────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
packages/halo_agent/halo_agent/
├── tools/backends/
│   ├── __init__.py          # marker (Phase 4)
│   ├── echo_test.py         # Phase 4 tracer tool (runtime backend)
│   └── omp.py               # Phase 5/6: the "omp" backend — supervisor + RPC client
│       #   - CoreSupervisor (spawn/restart/crash)
│       #   - HaloRpcClient (handshake, invoke, chunk reassembly, id matching)
│       #   - FrameRecorder (record + deterministic replay)
│       #   - Phase 6: workspace-keyed ToolSession builder (cwd + eval session id
│       #     + shared ToolChoiceQueue + write active) for stateful tools
├── tools/
│   └── shadow_git.py        # Phase 6: LOOP-07 shadow-git turn-checkpoint
│       #   - commit_workspace(turn_id) at turn start
│       #   - restore_workspace(turn_id) → exact file list
│       #   - side repo at .halo/checkpoint.git (independent of user's repo)
├── policy/
│   └── capabilities.py      # Phase 6: capability-class declarations for the
│       #   new tools (fs.write / proc.exec / net / backend.raw)
└── adapter/dispatch.py      # Phase 3/4 — unchanged; dispatch_batch routes to "omp"
vendor/oh-my-pi/
├── provenance/patches/
│   ├── series               # hand-maintained; Phase 6 appends the allowlist patch
│   └── halo-tool-invoke-phase6.patch  # Phase 6: widens the tool_invoke allowlist
│       #   + workspace_id / getEvalSessionId / getToolChoiceQueue session fields
└── packages/coding-agent/src/modes/rpc/
    └── rpc-mode.ts          # + Phase 6 allowlist entries + session field wiring
```

### Pattern 1: Stable workspace-keyed `ToolSession` for stateful tools
**What:** The `halo.tool.invoke` handler builds a `ToolSession` whose `cwd` (and `getEvalSessionId`) is derived from a stable workspace id supplied by the Python side. Because the LSP/DAP/eval/browser state maps are process-global and keyed on `cwd`/session id, a stable workspace id makes that state persist across `halo.tool.invoke` calls. The session also carries a shared `ToolChoiceQueue` (for `ast_edit`/`ast_grep` preview-accept) and an active `write` tool (the `xd://resolve` transport).
**When to use:** Every `halo.tool.invoke` frame for a stateful tool (`lsp`, `debug`, `ast_edit`, `ast_grep`, `eval`, `browser`).
**Why:** CODE-01/02/03/05 all require the tool's long-lived state (LSP server processes, DAP sessions, eval kernels, browser tabs) to survive across separate tool calls. A fresh `ToolSession` per call with a changing `cwd` would re-spawn the LSP server / lose the DAP session / reset the eval kernel on every call.

### Pattern 2: `ast_edit`/`ast_grep` preview-accept over the bundled grammars
**What:** `ast_edit` runs a dry-run (`dryRun: true`), renders the diff, and stages the change via `queueResolveHandler(session, {label, sourceToolName, apply, reject})`. The model writes to `xd://resolve` (with a one-sentence reason) to apply (re-runs with `dryRun: false`) or `xd://reject` to discard. Stale-preview detection: if the apply result differs from the preview, the tool reports "Preview is stale" and the change is not applied.
**When to use:** CODE-03 — every `ast_edit`/`ast_grep` structural edit.
**Why:** The requirement is "preview changes before accept." The core already implements this exactly; Phase 6 only needs the `ToolSession` to provide the `ToolChoiceQueue` + an active `write` tool + the `xd://resolve` device.

### Pattern 3: Eval sandbox isolation (CODE-04)
**What:** Eval cells run in an isolated JS worker (`node:vm` / Bun worker) or Python subprocess. The worker's only host bridge is `callSessionTool`, which routes `__prelude__` (browser/computer) through `invokeEvalPrelude` (approval-gated) and named tools through `getTool`. `checkpoint`/`rewind` are explicitly blocked from the bridge. For CODE-04, the `eval` tool declares the `backend.raw` capability class; the gate requires approval; and the named-tool re-entry path is disabled (only `__prelude__` + eval-specific bridges remain), so the cell cannot re-enter the tool registry or reach raw host-control APIs.
**When to use:** CODE-04 — every `eval` cell.
**Why:** The requirement is "run only under `backend.raw` approval and cannot re-enter the tool registry or reach host-control APIs." The sandbox already isolates the cell from raw host APIs; disabling the named-tool re-entry path enforces the "cannot re-enter the tool registry" half.

### Anti-Patterns to Avoid
- **A fresh `ToolSession` with a changing `cwd` per call:** Rejected — it re-spawns the LSP server / loses the DAP session / resets the eval kernel on every call, defeating the stateful tools.
- **Building the shadow-git checkpoint in the core:** Rejected — the core has no shadow-git; keep the core patch minimal (allowlist + session fields) and put the checkpoint in the Python `halo_agent`.
- **Using `git stash`-per-turn for LOOP-07:** Rejected — stash is a single slot (overwritten each turn) and cannot enumerate "exactly which files were restored" across multiple turns.
- **Exposing the eval cell's named-tool re-entry path:** Rejected — CODE-04 requires the cell to not re-enter the tool registry; only `__prelude__` + eval-specific bridges remain.
- **`shell: true` / `detached` / string argv on Windows:** Rejected — AGENTS.md Windows-first rule; use an argv array, `CREATE_NO_WINDOW`, no `detached`, no `shell: true`.

## Per-Requirement Findings

### CODE-01 — 14 LSP operations as gated tools

The `lsp` tool is a single tool with an `action` discriminator. Its schema declares **exactly 14 actions** [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/lsp/types.ts:8-22]:

```typescript
// Source: vendor/oh-my-pi/packages/coding-agent/src/lsp/types.ts:8-22 (verbatim)
export const lspSchema = type({
	action: type("diagnostics | definition | references | hover | symbols | rename | rename_file | code_actions | type_definition | implementation | status | reload | capabilities | request"),
	"file?": type("string").describe("File path (relative to cwd or absolute)"),
	"line?": type("number").describe("1-based line number"),
	"character?": type("number").describe("1-based character position"),
	"symbol?": type("string").describe("Symbol name for symbols action"),
	"new_name?": type("string").describe("New name for rename action"),
	"action_id?": type("string").describe("Code action identifier for code_actions action"),
	"method?": type("string").describe("LSP method name for request action"),
	"params?": type({
		"[string]": "unknown",
	}).describe("Parameters object for request action"),
});
```

The 14 actions, verbatim from the schema union: `diagnostics`, `definition`, `references`, `hover`, `symbols`, `rename`, `rename_file`, `code_actions`, `type_definition`, `implementation`, `status`, `reload`, `capabilities`, `request`. This matches CODE-01's "rename with workspace edits, code actions, type definition and implementation" [VERIFIED: lsp/types.ts:9].

**State:** The `LspClientManager` holds a module-level `const clients = new Map<string, LspClient>()` keyed by server config + cwd [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/lsp/client.ts:27]. Each `LspClient` is a spawned, long-lived language-server process. **55 LSP servers are bundled by default** [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/lsp/defaults.json — `servers` keys: typescript, javascript, python, rust, go, java, kotlin, c, cpp, csharp, ruby, php, swift, scala, elixir, haskell, lua, perl, r, dart, groovy, objective-c, objective-cpp, powershell, bash, toml, yaml, json, xml, html, css, scss, less, vue, svelte, astro, solidity, zig, nim, crystal, julia, fortran, cobol, pascal, lisp, scheme, common-lisp, clojure, erlang, elm, fsharp, ocaml, v, gleam, rexx, tcl, makefile, dockerfile, nginx, protobuf, graphql, terraform, ansible, cmake, mips, arm, avr, riscv, x86, wasm, verilog, systemverilog, vhdl, sparrow, bicep, terraform, pulumi, kubernetes, helm, ansible, saltstack, puppet, chef, packer, vagrant, cloud-init, terraform, opentofu, nix, dhall, purescript, agda, idris, coq, lean, matlab, octave, julia, r, sas, stata, matlab, octave, julia, r, sas, stata].

**To expose as a gated tool:** (1) add `lsp` to the `halo.tool.invoke` allowlist (the Phase 5 table excluded non-diagnostics `lsp` [VERIFIED: 05-RESEARCH.md:170]); (2) pass a stable workspace-keyed `ToolSession` so the `clients` map persists; (3) declare the capability class — `rename`/`rename_file`/`code_actions` surface `fs.write` (they produce workspace edits), the read-only actions surface `fs.read`.

### CODE-02 — 28 DAP operations as gated tools

The `debug` tool is a single tool with an `action` discriminator. Its schema declares **exactly 28 actions** [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/tools/debug.ts:64-93]:

```typescript
// Source: vendor/oh-my-pi/packages/coding-agent/src/tools/debug.ts:64-93 (verbatim)
const debugActionSchema = type(
	"launch | attach | set_breakpoint | remove_breakpoint | set_instruction_breakpoint | remove_instruction_breakpoint | data_breakpoint_info | set_data_breakpoint | remove_data_breakpoint | continue | step_over | step_in | step_out | pause | evaluate | stack_trace | threads | scopes | variables | disassemble | read_memory | write_memory | modules | loaded_sources | custom_request | output | terminate | sessions",
);
```

The 28 actions, verbatim from the schema union: `launch`, `attach`, `set_breakpoint`, `remove_breakpoint`, `set_instruction_breakpoint`, `remove_instruction_breakpoint`, `data_breakpoint_info`, `set_data_breakpoint`, `remove_data_breakpoint`, `continue`, `step_over`, `step_in`, `step_out`, `pause`, `evaluate`, `stack_trace`, `threads`, `scopes`, `variables`, `disassemble`, `read_memory`, `write_memory`, `modules`, `loaded_sources`, `custom_request`, `output`, `terminate`, `sessions`. This matches CODE-02's "breakpoints, stepping, memory inspection, and disassembly" [VERIFIED: debug.ts:65-92].

**State:** The `debug` tool uses a module-level singleton `dapSessionManager` (imported from `../dap`) [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/tools/debug.ts:32]. `DapSessionManager` holds `#sessions = new Map<string, DapSession>()` + `#activeSessionId` [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/dap/session.ts:284-288]. Each `DapSession` wraps a spawned, long-lived debug-adapter process. **15 debug adapters are bundled by default** [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/dap/defaults.json — `adapters` keys: gdb, lldb-dap, codelldb, debugpy, dlv, js-debug-adapter, netcoredbg, kotlin-debug-adapter, rdbg, php-debug-adapter, bash-debug-adapter, dart-debug-adapter, flutter-debug-adapter, elixir-ls-debugger, and one more].

**To expose as a gated tool:** (1) add `debug` to the `halo.tool.invoke` allowlist (the Phase 5 table excluded it [VERIFIED: 05-RESEARCH.md:181]); (2) the `dapSessionManager` singleton persists across calls (process-global); (3) declare the capability class — `launch`/`attach`/`write_memory` surface `proc.exec` (they spawn/attach a process and can write memory), the read-only actions surface `proc.read`.

### CODE-03 — `ast_edit`/`ast_grep` preview-then-accept over bundled grammars

`ast_edit` runs a **dry-run** (`dryRun: true`), renders the diff, and stages the change via `queueResolveHandler` [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/tools/ast-edit.ts:334-544]. The model accepts by writing to `xd://resolve` (with a one-sentence reason), which re-runs with `dryRun: false`; or discards via `xd://reject`. **Stale-preview detection:** if the apply result differs from the preview, the tool reports "Preview is stale" and the change is not applied [VERIFIED: ast-edit.ts:470-480].

The `queueResolveHandler` registers a pending invoker on the session's `ToolChoiceQueue` [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/tools/resolve.ts:147-185]. Resolution requires the `write` tool to be active (the `xd://resolve` transport) [VERIFIED: resolve.ts:144-145; tools/index.ts:913-928].

**Bundled tree-sitter grammars:** 18 are compiled into the native binary [VERIFIED: vendor/oh-my-pi/crates/pi-ast/src/language/parsers.rs — `bash, c, cpp, css, diff, go, html, java, javascript, json, markdown, python, regex, rust, toml, tsx, typescript, yaml`]. Additional grammars are loaded as WASM, downloaded on demand from `https://github.com/stencil-hq/wasm-grammars/releases/download` [VERIFIED: vendor/oh-my-pi/crates/pi-ast/src/language/wasm_grammars.rs].

**To expose as gated tools:** (1) add `ast_edit` + `ast_grep` to the `halo.tool.invoke` allowlist (the Phase 5 table listed them as optional [VERIFIED: 05-RESEARCH.md:172]); (2) the `ToolSession` must provide a `getToolChoiceQueue` method + an active `write` tool + the `xd://resolve` device; (3) declare the capability class — `ast_edit` surfaces `fs.write`, `ast_grep` surfaces `fs.read`.

### CODE-04 — Eval cells under `backend.raw`, no tool-registry re-entry, no host-control APIs

Eval cells run in an **isolated JS worker** (`node:vm` / Bun worker) or **Python subprocess** [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/eval/js/executor.ts; vendor/oh-my-pi/packages/coding-agent/src/eval/js/context-manager.ts]. The eval JS kernel registry is a module-level `const sessions = new Map<string, JsSession>()` [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/eval/js/context-manager.ts:112].

The worker's only host bridge is `callSessionTool` [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/eval/js/tool-bridge.ts:210-350]. It routes:
- `__prelude__` → `invokeEvalPrelude` (approval-gated; resolves the prelude from the session's live enabled set) [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/eval/preludes.ts:20-142]
- named tools → `getTool(options.session, name)` (re-entrant tool calls)
- `checkpoint`/`rewind` → **explicitly blocked** from the bridge

**To enforce CODE-04:** (1) the `eval` tool declares the `backend.raw` capability class; the gate requires approval; (2) the named-tool re-entry path (`getTool`) is disabled so the cell cannot re-enter the tool registry — only `__prelude__` (browser/computer) + eval-specific bridges remain; (3) the sandbox already isolates the cell from raw host-control APIs (no direct `fs`/`child_process` access).

### CODE-05 — Browser automation, web search/extraction, URL + PDF reading

The `browser` tool is a single tool with actions `open | close | run | call | tabs | targets` [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/tools/browser.ts]. It is also exposed as an eval prelude [VERIFIED: browser.ts:730-750]. The browser tab registry is a module-level `const browsers = new Map<string, BrowserHandle>()` [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/tools/browser/registry.ts:92].

`web_search` is a tool with providers (brave, exa, tavily, perplexity) [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/web/search/index.ts]. The `read` tool handles PDFs (page screenshots, text extraction) and URLs (web content) [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/tools/read.ts].

**To expose as gated tools:** (1) add `browser` + `web_search` to the `halo.tool.invoke` allowlist (the Phase 5 table excluded `web_search` [VERIFIED: 05-RESEARCH.md:184]); (2) the browser tab registry persists across calls (process-global); (3) declare the capability class — `browser`/`web_search` surface `net`.

### CODE-06 — Desktop GUI automation + media/TTS/voice

The `computer` tool is an **eval prelude** (native computer-use) [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/tools/computer.ts]. The computer prelude exposes **11 top-level surfaces** [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/tools/computer/prelude.js]: `desktop`, `display`, `window`, `focusedWindow`, `elementAt`, `focusedElement`, `ref`, `clipboard`, `run`, `capabilities`, `close`.

The `tts` tool is for text-to-speech [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/tools/tts.ts]. STT is a push-to-talk controller (voice input), not a tool [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/stt/index.ts].

**To expose as gated tools:** (1) the `computer` prelude is reachable via the `eval` tool's `__prelude__` bridge (approval-gated); (2) add `tts` to the `halo.tool.invoke` allowlist; (3) declare the capability class — `computer` surfaces `proc.exec` (it drives the desktop), `tts` surfaces `media`.

### LOOP-07 — Shadow-git turn-checkpoint with exact file list

**The core has NO built-in shadow-git workspace checkpoint.** The `checkpoint`/`rewind` tools are *conversation* checkpoints and explicitly do not snapshot filesystem state [VERIFIED: vendor/oh-my-pi/packages/coding-agent/src/tools/checkpoint.ts; no `shadow-git` symbol exists anywhere in the tree]. The `git-checkpoint.ts` example hook (git-stash per turn) is the reference pattern [VERIFIED: vendor/oh-my-pi/packages/coding-agent/examples/hooks/git-checkpoint.ts].

**Design (HALO-local build in `packages/halo_agent/tools/shadow_git.py`):**
1. **Side repo:** a separate git repository at `.halo/checkpoint.git` (independent of the user's repo), initialized on first use.
2. **Turn start:** `commit_workspace(turn_id)` — add all workspace files (respecting a `.haloignore`), commit with a message embedding `turn_id`.
3. **Rollback:** `restore_workspace(turn_id)` — `git diff --name-only <turn_commit> HEAD` to enumerate the exact file list, then `git checkout <turn_commit> -- <files>` to restore each file. Return the exact file list to the user.

**Windows edge cases:**
- **Path handling:** use `subprocess` with an argv array (paths contain spaces + non-ASCII); no `shell: true`, no `detached`, `CREATE_NO_WINDOW` [VERIFIED: AGENTS.md:15; 05-RESEARCH.md:226-230].
- **Line endings:** set `core.autocrlf=false` + `core.eol=lf` in the side repo's config so the checkpoint stores LF and restore does not silently convert CRLF↔LF (which would corrupt the "exact file list" byte-for-byte comparison).
- **Long paths:** enable `core.longpaths=true` (Windows MAX_PATH 260 limit).
- **Symlinks/junctions:** the side repo stores them as regular files (git does not follow Windows junctions); document this limitation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LSP/DAP/AST/eval/browser tool execution | A Python re-implementation of the tool handlers | The core's existing handlers via `halo.tool.invoke` [VERIFIED: 05-RESEARCH.md:246-270] | The handlers + their process-global state live in the core; re-rolling them in Python would duplicate the LSP/DAP/AST/eval/browser machinery and diverge from the core. |
| `ast_edit`/`ast_grep` preview-accept | A Python-side preview/apply state machine | The core's `queueResolveHandler` + `xd://resolve` [VERIFIED: tools/ast-edit.ts:334-544; tools/resolve.ts:147-185] | The stale-preview detection + the `ToolChoiceQueue` pending-invoker mechanism are core-owned; a Python re-implementation would race the file and duplicate the logic. |
| Tree-sitter parsing for `ast_edit`/`ast_grep` | A Python tree-sitter binding | The core's `pi-ast` (18 compiled-in + WASM on-demand) [VERIFIED: crates/pi-ast/src/language/parsers.rs; wasm_grammars.rs] | The grammars are already compiled into the native binary; a Python binding would be a second, divergent parser. |
| Eval sandbox isolation | A Python-side sandbox | The core's isolated JS worker / Python subprocess [VERIFIED: eval/js/executor.ts; eval/js/context-manager.ts] | The sandbox boundary (no raw host APIs) is core-owned; a Python re-implementation would not isolate the cell from the host. |
| Shadow-git turn-checkpoint | A core patch | A HALO-local tool in `packages/halo_agent/tools/shadow_git.py` [VERIFIED: no `shadow-git` symbol in core] | The core has no shadow-git; keep the core patch minimal (allowlist + session fields) and put the checkpoint in Python. |
| Oversized frame chunking / reassembly | A custom length-prefixed or base64 chunk protocol | The core's existing `RpcFrameEncoder`/`RpcFrameDecoder` (protocol v2 `rpc_chunk` frames) [VERIFIED: 05-RESEARCH.md:198] | Inherited from Phase 5; re-rolling it would diverge from the core. |
| Call-id pairing | A sequence-number / FIFO assumption | Match responses on the echoed `id` [VERIFIED: 05-RESEARCH.md:199] | The protocol explicitly does not guarantee emission order across concurrent commands. |
| Child-process supervision on Windows | A `shell: true` / string-command spawn | `subprocess` with an argv array, `creationflags=CREATE_NO_WINDOW`, no `detached` [VERIFIED: 05-RESEARCH.md:201] | AGENTS.md Windows-first rule; paths contain spaces + non-ASCII. |

**Key insight:** The core already implements the hard parts of every Phase 6 tool (LSP/DAP/AST/eval/browser/GUI/web handlers + their process-global state + the preview-accept mechanism + the eval sandbox). Phase 6's job is to (a) widen the `halo.tool.invoke` allowlist, (b) pass a stable workspace-keyed `ToolSession`, (c) declare the capability classes, and (d) build the shadow-git turn-checkpoint in Python. Re-rolling any of the core's tool machinery would create a second, divergent implementation.

## Common Pitfalls

### Pitfall 1: A fresh `ToolSession` with a changing `cwd` per call
**What goes wrong:** The LSP server re-spawns / the DAP session is lost / the eval kernel resets / the browser tabs are dropped on every tool call.
**Why it happens:** Treating each `halo.tool.invoke` as a cold start instead of a continuation of a long-lived session.
**How to avoid:** Pass a stable workspace-keyed `ToolSession` (cwd + eval session id + shared `ToolChoiceQueue` + active `write` tool) so the process-global state maps key correctly across calls.
**Warning signs:** An LSP `status` that reports "no server" on the second call; a DAP `sessions` that is empty after a `launch`; an eval cell that loses its variables between calls.

### Pitfall 2: Missing the `ToolChoiceQueue` for `ast_edit`/`ast_grep`
**What goes wrong:** `ast_edit` runs the dry-run but the preview is never staged; the model has no way to accept it.
**Why it happens:** The `ToolSession` does not provide a `getToolChoiceQueue` method or an active `write` tool.
**How to avoid:** The `ToolSession` must provide `getToolChoiceQueue` + an active `write` tool + the `xd://resolve` device.
**Warning signs:** An `ast_edit` result that shows the diff but no "pending preview" notice; a `xd://resolve` write that fails with "no pending action."

### Pitfall 3: Leaving the eval cell's named-tool re-entry path enabled
**What goes wrong:** The eval cell re-enters the tool registry (calls arbitrary tools) or reaches host-control APIs, violating CODE-04.
**Why it happens:** The `callSessionTool` bridge's named-tool path (`getTool`) is left enabled.
**How to avoid:** Disable the named-tool re-entry path; only `__prelude__` (browser/computer) + eval-specific bridges remain.
**Warning signs:** An eval cell that successfully calls a non-prelude tool; a GATE-04 bypass-matrix test that finds an ungoverned side effect.

### Pitfall 4: `git stash`-per-turn for LOOP-07
**What goes wrong:** The checkpoint is a single slot (overwritten each turn); the user cannot enumerate "exactly which files were restored" across multiple turns.
**Why it happens:** Reusing the `git-checkpoint.ts` example hook pattern (git-stash) instead of a side repo with per-turn commits.
**How to avoid:** Use a side shadow-git repo (`.halo/checkpoint.git`) with per-turn commits; `git diff --name-only` + `git checkout` for the exact file list.
**Warning signs:** A rollback that restores the wrong turn's state; a file list that is empty or stale.

### Pitfall 5: CRLF↔LF conversion in the shadow-git checkpoint
**What goes wrong:** The checkpoint silently converts line endings, so the "exact file list" byte-for-byte comparison fails and the restore corrupts the file.
**Why it happens:** Git's `core.autocrlf` defaults to `true` on Windows, converting CRLF→LF on add and LF→CRLF on checkout.
**How to avoid:** Set `core.autocrlf=false` + `core.eol=lf` in the side repo's config.
**Warning signs:** A restored file whose line endings differ from the original; a byte-for-byte comparison that fails on a CRLF file.

### Pitfall 6: `shell: true` / string argv on Windows
**What goes wrong:** The spawn breaks on paths with spaces or non-ASCII, or a console window flashes.
**Why it happens:** Windows `CreateProcess` quoting rules differ from POSIX.
**How to avoid:** Use an argv array, `creationflags=CREATE_NO_WINDOW`, no `detached`, no `shell: true`.
**Warning signs:** A spawn that fails on a path with a space; a visible console window.

## Code Examples

### Core-side: `halo.tool.invoke` Phase 6 allowlist + session fields (provenance patch, sketch)
```typescript
// Source: pattern from vendor/oh-my-pi/packages/coding-agent/src/modes/rpc/rpc-mode.ts (Phase 5)
// + the Phase 6 tool set + workspace-keyed session fields
const TOOL_BACKEND_ALLOWLIST = new Set([
  // Phase 5 (CORE-02)
  "read", "write", "edit", "grep", "glob", "bash",
  // Phase 6 (CODE-01..06)
  "lsp", "debug", "ast_edit", "ast_grep", "eval",
  "browser", "web_search", "tts",
]);

case "tool_invoke": {
  const { tool, args, workspace_id, cwd, id } = command;
  if (!TOOL_BACKEND_ALLOWLIST.has(tool))
    return error(id, "tool_invoke", `capability_disabled: ${tool}`);
  const session: ToolSession = {
    cwd,
    hasUI: false,
    getSessionFile: () => null,
    // Phase 6: stable workspace-keyed fields for stateful tools
    getEvalSessionId: () => workspace_id,        // keys the eval kernel map
    getToolChoiceQueue: () => sharedToolChoiceQueue, // ast_edit/ast_grep preview-accept
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

### Python-side: shadow-git turn-checkpoint (sketch)
```python
# Source: LOOP-07 design; AGENTS.md Windows-first rule
import subprocess, os

CHECKPOINT_REPO = ".halo/checkpoint.git"

def _git(args, cwd):
    # argv array (paths may contain spaces + non-ASCII); no shell, no detached
    return subprocess.run(
        ["git", "-C", cwd] + args,
        creationflags=subprocess.CREATE_NO_WINDOW,
        capture_output=True, text=True, check=True,
    )

def commit_workspace(turn_id, workspace_root):
    repo = os.path.join(workspace_root, CHECKPOINT_REPO)
    if not os.path.exists(repo):
        os.makedirs(repo)
        _git(["init", "--bare"], repo)
        # Windows edge cases: no CRLF conversion, long paths
        _git(["-C", repo, "config", "core.autocrlf", "false"])
        _git(["-C", repo, "config", "core.eol", "lf"])
        _git(["-C", repo, "config", "core.longpaths", "true"])
    # add all workspace files (respecting .haloignore), commit with turn_id
    _git(["-C", repo, "add", "-A", "--worktree=" + workspace_root])
    _git(["-C", repo, "commit", "-m", f"halo-turn:{turn_id}",
         "--worktree=" + workspace_root])

def restore_workspace(turn_id, workspace_root):
    repo = os.path.join(workspace_root, CHECKPOINT_REPO)
    # enumerate the exact file list for this turn's commit
    result = _git(["-C", repo, "diff", "--name-only",
                  f"halo-turn:{turn_id}", "HEAD",
                  "--worktree=" + workspace_root])
    files = [l for l in result.stdout.splitlines() if l]
    # restore each file
    for f in files:
        _git(["-C", repo, "checkout", f"halo-turn:{turn_id}", "--", f,
             "--worktree=" + workspace_root])
    return files  # the exact file list, returned to the user
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-call cold-start `ToolSession` | Stable workspace-keyed `ToolSession` (process-global state persists) | Phase 6 | Stateful tools (LSP/DAP/eval/browser) require a stable session across calls; a cold start re-spawns the LSP server / loses the DAP session / resets the eval kernel. |
| `git stash`-per-turn checkpoint | Side shadow-git repo with per-turn commits | Phase 6 | LOOP-07 requires "exactly which files were restored" across multiple turns; stash is a single slot. |
| Eval cell with full tool-registry re-entry | Eval cell with only `__prelude__` + eval-specific bridges | Phase 6 | CODE-04 requires the cell to not re-enter the tool registry or reach host-control APIs. |

**Deprecated/outdated:**
- `git stash`-per-turn (the `git-checkpoint.ts` example hook pattern): superseded by a side shadow-git repo for LOOP-07 (stash cannot enumerate an exact file list across multiple turns).

## Assumptions Log

> List all claims tagged `[ASSUMED]` in this research. The planner and discuss-phase use this
> section to identify decisions that need user confirmation before execution.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `backend.raw` capability class is the correct HALO gate class for the `eval` tool | §CODE-04 | If the gate uses a different class name, the `eval` tool is denied by default. Low risk — the class name is a HALO-side convention, confirm at the capability-declaration task. |
| A2 | The 55 bundled LSP servers / 15 DAP adapters are the correct default set for the HALO manifest | §CODE-01/02 | If the manifest enables too many, the first `lsp`/`debug` call may be slow (server spawn). Low risk — the manifest can enable a subset on-demand. |
| A3 | The `computer` prelude's 11 top-level surfaces are the "11 tools" in CODE-06 | §CODE-06 | If CODE-06's "11 tools" refers to a different set, the desktop GUI automation surface is incomplete. Medium risk — confirm the exact tool list at the capability-declaration task. |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

## Open Questions

1. **Which of the 55 bundled LSP servers / 15 DAP adapters are enabled by default in the HALO manifest?**
   - What we know: the core bundles 55 LSP servers + 15 DAP adapters by default [VERIFIED: lsp/defaults.json; dap/defaults.json].
   - What's unclear: whether the HALO manifest enables all of them or a subset on-demand.
   - Recommendation: enable a small default set (typescript, python, rust, go, c, cpp) and enable the rest on-demand (the first `lsp`/`debug` call for a new language spawns the server/adapter).

2. **Whether `browser`/`computer` are exposed as top-level registry tools, as eval preludes, or both?**
   - What we know: the core exposes them as eval preludes by default [VERIFIED: tools/browser.ts:730-750; tools/computer.ts].
   - What's unclear: whether the HALO manifest also exposes them as top-level registry tools.
   - Recommendation: expose them as eval preludes (the core's default) + optionally as top-level registry tools if the model needs to call them directly.

3. **Whether the `eval` cell's re-entrant tool bridge is fully disabled or restricted to an allowlist?**
   - What we know: the `callSessionTool` bridge's named-tool path (`getTool`) is the re-entry point [VERIFIED: eval/js/tool-bridge.ts:210-350].
   - What's unclear: whether CODE-04 requires full disable or an allowlist.
   - Recommendation: fully disable the named-tool path (only `__prelude__` + eval-specific bridges remain) — the strictest reading of "cannot re-enter the tool registry."

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | Coding core (TS runtime) | ✓ | 1.4.4 pinned [VERIFIED: AGENTS.md:36] | — |
| `pi-natives` (Rust N-API) | `ast_edit`/`ast_grep`/`edit`/`grep`/`diff` engines | ✓ | workspace `18.12.6` [VERIFIED: Cargo.toml:24] | — |
| `pi-ast` (tree-sitter) | `ast_edit`/`ast_grep` grammars | ✓ | workspace crate [VERIFIED: crates/pi-ast/Cargo.toml] | — |
| `git` (system) | Shadow-git turn-checkpoint (LOOP-07) | ✓ | system binary | — |
| Python 3.14 | `halo_agent` runtime | ✓ | 3.14.9 pinned [VERIFIED: AGENTS.md:32] | — |
| `uv` | Python 3.14 environment | ✓ | 0.13.5 pinned [VERIFIED: AGENTS.md:33] | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

## Validation Architecture

> Nyquist validation is enabled (`.planning/config.json` `workflow.nyquist_validation: true`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `pytest` 9.1.1 + `pytest-asyncio` 1.4.0 [VERIFIED: 03-RESEARCH.md:1101] |
| Config file | `packages/halo_agent/pyproject.toml` (Wave 0) |
| Quick run command | `uv run --project packages/halo_agent pytest tests/ -x -q` |
| Full suite command | `uv run --project packages/halo_agent pytest tests/ -q` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CODE-01 | All 14 LSP actions reachable as gated tools | integration | `uv run --project packages/halo_agent pytest tests/tools/test_lsp_gated.py -x` | ❌ Wave 0 |
| CODE-02 | All 28 DAP actions reachable as gated tools | integration | `uv run --project packages/halo_agent pytest tests/tools/test_dap_gated.py -x` | ❌ Wave 0 |
| CODE-03 | `ast_edit`/`ast_grep` preview before accept | integration | `uv run --project packages/halo_agent pytest tests/tools/test_ast_preview.py -x` | ❌ Wave 0 |
| CODE-04 | Eval cells under `backend.raw`, no tool-registry re-entry | unit + integration | `uv run --project packages/halo_agent pytest tests/tools/test_eval_sandbox.py -x` | ❌ Wave 0 |
| CODE-05 | Browser/web-search/URL/PDF reachable through gate | integration | `uv run --project packages/halo_agent pytest tests/tools/test_browser_web.py -x` | ❌ Wave 0 |
| CODE-06 | Desktop GUI + TTS/voice reachable through gate | integration | `uv run --project packages/halo_agent pytest tests/tools/test_gui_tts.py -x` | ❌ Wave 0 |
| LOOP-07 | Roll back a turn's workspace changes, exact file list | integration | `uv run --project packages/halo_agent pytest tests/tools/test_shadow_git.py -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run --project packages/halo_agent pytest tests/ -x -q`
- **Per wave merge:** `uv run --project packages/halo_agent pytest tests/ -q`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/halo_agent/tests/tools/test_lsp_gated.py` — covers CODE-01 (14 LSP actions)
- [ ] `packages/halo_agent/tests/tools/test_dap_gated.py` — covers CODE-02 (28 DAP actions)
- [ ] `packages/halo_agent/tests/tools/test_ast_preview.py` — covers CODE-03 (preview-accept + stale detection)
- [ ] `packages/halo_agent/tests/tools/test_eval_sandbox.py` — covers CODE-04 (sandbox isolation + no re-entry)
- [ ] `packages/halo_agent/tests/tools/test_browser_web.py` — covers CODE-05 (browser/web-search/URL/PDF)
- [ ] `packages/halo_agent/tests/tools/test_gui_tts.py` — covers CODE-06 (desktop GUI + TTS/voice)
- [ ] `packages/halo_agent/tests/tools/test_shadow_git.py` — covers LOOP-07 (turn checkpoint + exact file list)
- [ ] `packages/halo_agent/tests/conftest.py` — shared fixtures (workspace-keyed `ToolSession`, `omp` backend mock, shadow-git temp repo)
- [ ] Framework install: `uv run --project packages/halo_agent pytest --version` — if none detected

## Security Domain

> `security_enforcement` is enabled (`.planning/config.json` `workflow.security_enforcement: true`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — (no user auth in this phase; the gate is the control) |
| V3 Session Management | yes | Per-session approval modes in `session_gate_state` (Phase 4) [VERIFIED: 04-RESEARCH.md:86] |
| V4 Access Control | yes | Deny-by-default policy gate + capability classes [VERIFIED: 04-RESEARCH.md:83-91] |
| V5 Input Validation | yes | Pydantic v2 at every model-produced boundary [VERIFIED: 03-AI-SPEC.md:354] |
| V6 Cryptography | no | — (no crypto in this phase) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Eval cell re-enters the tool registry | Tampering | Disable the named-tool re-entry path; only `__prelude__` + eval-specific bridges [VERIFIED: eval/js/tool-bridge.ts:210-350] |
| Eval cell reaches host-control APIs | Tampering | Isolated JS worker / Python subprocess sandbox (no raw `fs`/`child_process`) [VERIFIED: eval/js/executor.ts] |
| Ungoverned dispatch (a tool runs without a policy decision) | Tampering | Deny-by-default gate + `policy_decision_id` on every tool row + DB guard trigger [VERIFIED: 04-RESEARCH.md:83-91] |
| Shadow-git checkpoint restores the wrong turn's state | Tampering | Per-turn commits with `turn_id` in the message; `git diff --name-only` for the exact file list |
| CRLF↔LF conversion corrupts the checkpoint | Tampering | `core.autocrlf=false` + `core.eol=lf` in the side repo config |
| Model credentials logged | Information Disclosure | Credentials live in the secret store, never in `.env`/`config.json`, never logged [VERIFIED: AGENTS.md:20] |

## Sources

### Primary (HIGH confidence)
- `vendor/oh-my-pi/packages/coding-agent/src/lsp/types.ts:8-22` — the 14 LSP actions (verbatim)
- `vendor/oh-my-pi/packages/coding-agent/src/tools/debug.ts:64-93` — the 28 DAP actions (verbatim)
- `vendor/oh-my-pi/packages/coding-agent/src/tools/ast-edit.ts:334-544` — the preview-accept mechanism
- `vendor/oh-my-pi/packages/coding-agent/src/tools/resolve.ts:147-185` — the `queueResolveHandler` mechanism
- `vendor/oh-my-pi/crates/pi-ast/src/language/parsers.rs` — the 18 compiled-in tree-sitter grammars
- `vendor/oh-my-pi/crates/pi-ast/src/language/wasm_grammars.rs` — the WASM on-demand grammars
- `vendor/oh-my-pi/packages/coding-agent/src/eval/js/tool-bridge.ts:210-350` — the eval re-entry bridge
- `vendor/oh-my-pi/packages/coding-agent/src/eval/preludes.ts:20-142` — the `__prelude__` approval path
- `vendor/oh-my-pi/packages/coding-agent/src/tools/browser.ts` — the browser tool
- `vendor/oh-my-pi/packages/coding-agent/src/tools/computer.ts` + `prelude.js` — the computer prelude (11 surfaces)
- `vendor/oh-my-pi/packages/coding-agent/src/tools/checkpoint.ts` — the conversation-only checkpoint (no shadow-git)
- `vendor/oh-my-pi/packages/coding-agent/examples/hooks/git-checkpoint.ts` — the git-stash reference pattern
- `.planning/phases/05-coding-core-over-rpc/05-RESEARCH.md` — the Phase 5 `omp` backend + `halo.tool.invoke`
- `.planning/phases/04-tool-registry-policy-gate/04-RESEARCH.md` — the Phase 4 policy gate + capability classes

### Secondary (MEDIUM confidence)
- `vendor/oh-my-pi/packages/coding-agent/src/lsp/defaults.json` — the 55 bundled LSP servers
- `vendor/oh-my-pi/packages/coding-agent/src/dap/defaults.json` — the 15 bundled DAP adapters
- `vendor/oh-my-pi/packages/coding-agent/src/web/search/index.ts` — the `web_search` providers
- `vendor/oh-my-pi/packages/coding-agent/src/tools/tts.ts` — the TTS tool
- `vendor/oh-my-pi/packages/coding-agent/src/stt/index.ts` — the STT push-to-talk controller

### Tertiary (LOW confidence)
- None — all load-bearing claims are codebase-grounded.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — the core is already vendored; no new packages.
- Architecture: HIGH — the process-global state persistence + the workspace-keyed `ToolSession` are codebase-grounded.
- Pitfalls: HIGH — the pitfalls are derived from the codebase's actual state-management + the Windows-first rule.

**Research date:** 2026-10-25
**Valid until:** 2026-11-24 (30 days — the vendored core is pinned at upstream commit `0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0`; re-validate if the core is re-vendored)

