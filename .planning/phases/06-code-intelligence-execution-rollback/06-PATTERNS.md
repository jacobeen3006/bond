# Phase 6: Code Intelligence, Execution & Rollback - Pattern Map

**Mapped:** 2026-10-25
**Files analyzed:** 14 file rows derived from `06-RESEARCH.md` §Recommended Project Structure (`:167-195`), §Validation Architecture / Wave 0 Gaps (`:536-545`), §Code Examples (`:372-449`), and §Per-Requirement Findings (`:219-315`). No `CONTEXT.md` exists for Phase 6 (no `/gsd-discuss-phase` was run); the research document's per-requirement findings and open questions serve as the decision source.
**Analogs found:** 14 / 14 (core-side rows against real vendored source; Python-side rows against Phase 2-5 plan/research precedents, marked `[PLANNED]`)

## Repo reality (read before trusting any citation)

- `packages/halo_agent/` and `contracts/` **do not exist on disk.** REQUIREMENTS.md traceability marks Phases 2-5 as *Pending* — the Python agent package, the `contracts/` wire schema, and the Phase 5 `omp.py` backend were planned but never executed. Every Python-side citation below is a `[PLANNED]` precedent from the Phase 2-5 plan/research documents, **not** from source.
- **The `halo.tool.invoke` RPC handler does not exist in `rpc-mode.ts` yet.** Phase 5 was never executed, so the `tool_invoke` case in the `handleCommand` dispatch switch and the `TOOL_INVOKE_ALLOWLIST` are not on disk. The Phase 6 patch is built **on top of the Phase 5 patch** (which creates the handler + the 7-tool CORE-02 allowlist). The Phase 6 patch widens the allowlist and adds the workspace-keyed `ToolSession` fields.
- The core-side files (`rpc-mode.ts`, `tools/index.ts`, `lsp/client.ts`, `dap/session.ts`, `eval/js/context-manager.ts`, `tools/browser/registry.ts`, `ast-edit.ts`, `resolve.ts`, `eval/js/tool-bridge.ts`, `eval/preludes.ts`, `tools/tts.ts`, `web/search/index.ts`) **are real vendored source** and are cited with line numbers.
- **Critical allowlist nuance (not in the research sketch):** `browser` and `computer` are **eval preludes, not builtin tools** — they are NOT reachable via `createTools(session, ["browser"])`. They are reachable only through the `eval` tool's `__prelude__` bridge (`eval/js/tool-bridge.ts:211-241` → `invokeEvalPrelude`). `tts` is a **`CustomTool` export** (`tools/tts.ts:176`), not a `BUILTIN_TOOLS` entry — it is NOT reachable via `createTools(session, ["tts"])` either. The research sketch (`:376-382`) lists `browser` and `tts` in the allowlist; the planner must handle them specially (see `rpc-mode.ts` pattern assignment).
- All four `vendor/*/provenance/patches/series` files contain only the header comment. The Phase 6 patch appends one line to `vendor/oh-my-pi/provenance/patches/series`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/halo_agent/halo_agent/tools/backends/omp.py` | service (backend) | request-response + streaming + file I/O | Phase 5 `omp.py` shape (`05-PATTERNS.md:41-95`) + `ToolSession` type (`tools/index.ts:209-550`) | role-match (planned) |
| `packages/halo_agent/halo_agent/tools/shadow_git.py` | service (vcs) | file I/O + batch | `bounded_git_probe` (`hermes-agent/hermes_cli/_subprocess_compat.py:872-901`) + `git-checkpoint.ts` hook (`vendor/oh-my-pi/.../examples/hooks/git-checkpoint.ts:1-52`) | role-match |
| `packages/halo_agent/halo_agent/policy/capabilities.py` | model (config) | transform | Phase 4 capability vocabulary (`04-PATTERNS.md:236-244`) + `ToolRequest.capabilities` (`04-PATTERNS.md:173-175`) | role-match (planned) |
| `vendor/oh-my-pi/provenance/patches/series` | config | batch | current `series` file (header only) + `provenance/README.md:110-112` append rule | exact |
| `vendor/oh-my-pi/provenance/patches/halo-tool-invoke-phase6.patch` | config | batch | `provenance/README.md:106-130` landing convention + `05-PATTERNS.md:208-233` Phase 5 patch format | role-match (planned convention) |
| `vendor/oh-my-pi/packages/coding-agent/src/modes/rpc/rpc-mode.ts` | service (RPC handler) | request-response + streaming | the file itself (exact, same file) + `BUILTIN_TOOLS` map (`tools/index.ts:558-589`) | exact |
| `packages/halo_agent/tests/tools/test_lsp_gated.py` | test | integration (request-response) | Phase 5 test style (`05-PATTERNS.md:116-176`) + assertion discipline (`04-PATTERNS.md:434`) | role-match (planned) |
| `packages/halo_agent/tests/tools/test_dap_gated.py` | test | integration (request-response) | Phase 5 test style (`05-PATTERNS.md:116-176`) + assertion discipline (`04-PATTERNS.md:434`) | role-match (planned) |
| `packages/halo_agent/tests/tools/test_ast_preview.py` | test | integration (request-response) | Phase 5 test style (`05-PATTERNS.md:116-176`) + assertion discipline (`04-PATTERNS.md:434`) | role-match (planned) |
| `packages/halo_agent/tests/tools/test_eval_sandbox.py` | test | integration (request-response) | Phase 5 test style (`05-PATTERNS.md:116-176`) + assertion discipline (`04-PATTERNS.md:434`) | role-match (planned) |
| `packages/halo_agent/tests/tools/test_browser_web.py` | test | integration (request-response) | Phase 5 test style (`05-PATTERNS.md:116-176`) + assertion discipline (`04-PATTERNS.md:434`) | role-match (planned) |
| `packages/halo_agent/tests/tools/test_gui_tts.py` | test | integration (request-response) | Phase 5 test style (`05-PATTERNS.md:116-176`) + assertion discipline (`04-PATTERNS.md:434`) | role-match (planned) |
| `packages/halo_agent/tests/tools/test_shadow_git.py` | test | integration (file I/O + batch) | Phase 5 test style (`05-PATTERNS.md:116-176`) + assertion discipline (`04-PATTERNS.md:434`) | role-match (planned) |
| `packages/halo_agent/tests/conftest.py` | test fixture | request-response | `04-02-PLAN.md:111-112` conftest scaffolding + `03-01-PLAN.md:192` `run_child` | role-match (planned) |

## Pattern Assignments

### `packages/halo_agent/halo_agent/tools/backends/omp.py` (service, request-response + streaming + file I/O) — MODIFY

**Analog (planned):** Phase 5 `omp.py` shape (`05-PATTERNS.md:41-95`) + the Phase 6 workspace-keyed `ToolSession` builder (`06-RESEARCH.md:224-233` Pattern 1, `:372-382` Code Examples).

**Phase 6 change:** add a workspace-keyed `ToolSession` builder that passes `cwd` (derived from `workspace_id`), `getEvalSessionId: () => workspace_id`, `getToolChoiceQueue: () => sharedToolChoiceQueue`, and an active `write` tool. The `ToolSession` type fields (real, `tools/index.ts:209-550`):

```typescript
// Required (tools/index.ts):
cwd: string;                          // :211 — the workspace root
hasUI: boolean;                       // :215 — false for the RPC backend
settings: Settings;                   // :446 — the session settings
getSessionFile: () => string | null;  // :333
getSessionSpawns: () => string | null;// :406

// Phase 6 optional fields (tools/index.ts):
getEvalSessionId?: () => string | null;        // :331 — keys the retained JS/Python/Ruby/Julia state
getEvalKernelOwnerId?: () => string | null;    // :341
getEvalPreludes?: () => readonly EvalPreludeDefinition[]; // :343
getToolChoiceQueue?(): ToolChoiceQueue;        // :488 — shared across calls
getToolByName?;                               // :365
getToolForEvalBridge?;                        // :367
getEvalBridgeToolNames?;                      // :371
isToolActive?;                                // :373
toolRegistry?: Map<string, Tool>;             // :377
xdev?: XdevState;                             // :379
deviceOnlyWrite?: boolean;                    // :388
```

**Why this is load-bearing:** the four process-global state maps are keyed on `cwd`/session id, so a stable workspace-keyed `ToolSession` makes them persist across calls:
- LSP: `lsp/client.ts:27` — `const clients = new Map<string, LspClient>();` (keyed server config + cwd)
- DAP: `dap/session.ts:284-288` — `export class DapSessionManager { #sessions = new Map<string, DapSession>(); #activeSessionId: string | null = null; ... }` + `:1876` — `export const dapSessionManager = new DapSessionManager();` (module singleton)
- Eval JS: `eval/js/context-manager.ts:112` — `const sessions = new Map<string, JsSession>();` (keyed eval session id)
- Browser: `tools/browser/registry.ts:92` — `const browsers = new Map<string, BrowserHandle>();` (keyed browser key)

**Reuse (P4):** the Phase 5 `omp.py` already reuses the core frame machinery (`05-PATTERNS.md:88-95`). The Phase 6 change is additive — it does not change the frame protocol, only the `ToolSession` fields passed to the `tool_invoke` handler.

---

### `packages/halo_agent/halo_agent/tools/shadow_git.py` (service, file I/O + batch) — NEW

**Analog (real):** `bounded_git_probe` (`hermes-agent/hermes_cli/_subprocess_compat.py:872-901`) + `windows_hide_flags` (`:213-220`) + `no_prompt_git_kwargs` (`:224-241`) + the `git-checkpoint.ts` example hook (`vendor/oh-my-pi/packages/coding-agent/examples/hooks/git-checkpoint.ts:1-52`) + the RESEARCH §LOOP-07 design (`:306-315`) + §Code Examples sketch (`:409-449`).

**Bounded git probe pattern** (`_subprocess_compat.py:872-901`):
```python
def bounded_git_probe(argv: Sequence[str], *, timeout: float, env: Mapping[str, str] | None = None) -> str:
    """Run a short ``git`` probe and return stripped stdout, or ``""`` on ANY failure.
    On Windows ``run()``'s post-timeout cleanup calls an unbounded ``communicate()``; a suspended
    descendant git.exe holding the pipe handles then blocks forever. Here: bounded ``communicate``,
    tree-kill plus a 1s drain, then abandon the pipes; on POSIX the probe gets its own process
    group so cleanup also takes down credential/remote helpers.
    """
    result = bounded_probe_run(argv, timeout=timeout, env={**(env or noninteractive_git_env()), **NO_LAZY_FETCH_ENV})
    if result is None or result.returncode != 0:
        return ""
    return (result.stdout or "").strip()
```

**Windows-first spawn pattern** (`_subprocess_compat.py:213-220`):
```python
def windows_hide_flags() -> int:
    """Win32 creationflags hiding the child's console without detaching it; 0 elsewhere."""
    return _CREATE_NO_WINDOW if IS_WINDOWS else 0
```

**Non-interactive git env** (`_subprocess_compat.py:224-241`):
```python
def no_prompt_git_kwargs() -> dict:
    env = dict(os.environ)
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GCM_INTERACTIVE"] = "Never"
    return {"stdin": subprocess.DEVNULL, "env": env, "creationflags": windows_hide_flags()}
```

**git-checkpoint hook pattern** (`git-checkpoint.ts:1-52`): per-turn `git stash create` / `git stash apply` — the reference for the side-repo commit/restore design.

**RESEARCH §LOOP-07 design** (`:306-315`): side repo `.halo/checkpoint.git`, `commit_workspace(turn_id)` (add all + commit `halo-turn:{turn_id}`), `restore_workspace(turn_id)` (`git diff --name-only` → exact file list, `git checkout <commit> -- <files>`). Windows: argv array, `core.autocrlf=false` + `core.eol=lf`, `core.longpaths=true`, symlinks/junctions stored as regular files.

**RESEARCH §Code Examples sketch** (`:409-449`): the Python `shadow_git.py` shape — `commit_workspace(turn_id)`, `restore_workspace(turn_id)`, `list_turns()`.

---

### `packages/halo_agent/halo_agent/policy/capabilities.py` (model, transform) — NEW

**Analog (planned):** Phase 4 capability vocabulary (`04-PATTERNS.md:236-244`) + the `ToolRequest.capabilities` field (`04-PATTERNS.md:173-175`) + the RESEARCH §CODE-01..06 capability-class declarations.

**Phase 4 capability vocabulary** (`04-PATTERNS.md:236-244`): `fs.read, fs.write, fs.delete, proc.exec, net.egress, ui.control, vcs.write, memory.read, memory.write, ui.ask, secrets.read, agent.spawn, backend.raw`.

**Keying rule** (`04-PATTERNS.md:244`): "policy keys on declared capability classes, never on tool names, so aliases can't launder: `write`, `patch`, `ast_edit` → `fs.write`; `bash` → `proc.exec`".

**Phase 6 capability-class declarations** (from RESEARCH per-requirement findings + Phase 4 vocabulary):
- `fs.write` for `ast_edit` / `lsp rename` / `code_actions`
- `proc.exec` for `eval` / `debug` / `bash` / `computer`
- `net` for `web_search` / `browser`
- `backend.raw` for `eval`
- `fs.read` for read-only actions
- `media` for `tts`

**`ToolRequest`/`PolicyDecision` frozen dataclass shapes** (`04-PATTERNS.md:165-189`): the `ToolRequest` dataclass with `capabilities: tuple[str, ...]` field; the `PolicyDecision` dataclass with `allowed: bool`, `reason: str`, `capability: str`.

---

### `vendor/oh-my-pi/provenance/patches/series` (config, batch) — MODIFY

**Analog (real):** the current `series` file (header comment only) + `provenance/README.md:110-112` append rule.

**Current `series` content:** `# halo patch series — generated never; hand-maintained; every entry must apply cleanly in order`

**Append rule** (`provenance/README.md:110-112`): append to `series` after every earlier entry, never sorted. The Phase 6 patch appends one line: `halo-tool-invoke-phase6.patch`.

---

### `vendor/oh-my-pi/provenance/patches/halo-tool-invoke-phase6.patch` (config, batch) — NEW

**Analog (planned convention):** `provenance/README.md:106-130` landing convention + `05-PATTERNS.md:208-233` (the Phase 5 patch format) + the RESEARCH §Code Examples allowlist sketch (`:372-382`).

**Provenance patch discipline** (`provenance/README.md:106-154` + `05-PATTERNS.md:464-475`):
- Four headers: `From` / `Subject` / `Upstream-Ref` / `Halo-Reason` / `Halo-Touches` / `Halo-CVE` + `---` + unified diff
- `git apply` ignores the headers
- Append to `series` after every earlier entry, never sorted
- `just provenance-manifest tree=oh-my-pi` (never hand-edit TSV/UPSTREAM.json)
- `just provenance-replay tree=oh-my-pi` (if replay fails, the patch is wrong)
- Grep the patch body for brand/wire literals (a `halo.` literal is a failure)

**Phase 6 patch content** (RESEARCH §Code Examples `:372-382`):
```typescript
const TOOL_BACKEND_ALLOWLIST = new Set([
  // Phase 5 (CORE-02)
  "read", "write", "edit", "grep", "glob", "bash",
  // Phase 6 (CODE-01..06)
  "lsp", "debug", "ast_edit", "ast_grep", "eval",
  "browser", "web_search", "tts",
]);
```

**Critical allowlist nuance:** `browser` is an eval prelude (NOT a builtin tool — NOT reachable via `createTools`); `tts` is a `CustomTool` export (NOT a `BUILTIN_TOOLS` entry — NOT reachable via `createTools`). The `tool_invoke` handler must handle these specially (see `rpc-mode.ts` pattern assignment).

---

### `vendor/oh-my-pi/packages/coding-agent/src/modes/rpc/rpc-mode.ts` (service, request-response + streaming) — MODIFY via patch

**Analog (exact, same file):** the file itself. The Phase 6 change: widen the `TOOL_INVOKE_ALLOWLIST` (created by Phase 5) + add the workspace-keyed `ToolSession` fields.

**`tool_invoke` handler (Phase 5, not yet landed) + Phase 6 allowlist + session fields:**
- The `success`/`error` helpers (`:1382-1395`)
- The `handleCommand` dispatch switch (`:1891-1899`)
- The `bash` handler shape (`:2424-2427`)

**`BUILTIN_TOOLS` factory map** (`tools/index.ts:558-589`) — the tool names for the allowlist:
```typescript
export const BUILTIN_TOOLS: Record<BuiltinToolName, ToolFactory> = {
  read: s => new ReadTool(s),           // :559
  security_scan: s => new SecurityScanTool(s), // :560
  bash: s => new BashTool(s),          // :561
  edit: s => new EditTool(s),          // :562
  ast_grep: s => new AstGrepTool(s),   // :563
  ast_edit: s => new AstEditTool(s),   // :564
  ask: AskTool.createIf,               // :565
  debug: DebugTool.createIf,           // :566
  ida: IdaTool.createIf,               // :567
  eval: s => new EvalTool(s),          // :568
  github: GithubTool.createIf,         // :569
  glob: s => new GlobTool(s, { rootPathAlias: true }), // :570
  grep: s => new GrepTool(s),          // :571
  find: s => new FindTool(s),          // :572
  lsp: LspTool.createIf,              // :573
  checkpoint: CheckpointTool.createIf, // :574
  rewind: RewindTool.createIf,        // :575
  context_notes: ContextNotesTool.createIf, // :576
  new_context: NewContextTool.createIf, // :577
  task: s => TaskTool.create(s),      // :578
  wait: s => new WaitTool(s),         // :579
  todo: s => new TodoTool(s),         // :580
  web_search: s => new WebSearchTool(s), // :581
  write: s => new WriteTool(s),       // :582
  memory_edit: MemoryEditTool.createIf, // :583
  retain: MemoryRetainTool.createIf,  // :584
  recall: MemoryRecallTool.createIf,  // :585
  reflect: MemoryReflectTool.createIf, // :586
  learn: LearnTool.createIf,          // :587
  manage_skill: ManageSkillTool.createIf, // :588
};
```

**`createTools(session, toolNames?)`** (`tools/index.ts:835-865`): async, resolves the builtin tool plan, per-tool `isAllowed` settings gates, returns `Tool[]`.

**Critical allowlist handling (NOT in the research sketch):**
- `browser` / `computer` are **eval preludes** (`sdk.ts:2529-2543`), NOT builtin tools. They are NOT reachable via `createTools(session, ["browser"])`. They are reachable only through the `eval` tool's `__prelude__` bridge (`eval/js/tool-bridge.ts:211-241` → `invokeEvalPrelude`). The `eval` tool IS in the allowlist, so `browser`/`computer` are reachable via `eval`.
- `tts` is a **`CustomTool` export** (`tools/tts.ts:176`), NOT a `BUILTIN_TOOLS` entry. It is NOT reachable via `createTools(session, ["tts"])`. The `tool_invoke` handler must construct `ttsTool` directly or add it to the custom tools list.

**Preview-accept (CODE-03):** `ast-edit.ts:436-534` — `queueResolveHandler(this.session, { label, sourceToolName, apply, reject })`; `apply: async (_reason) => { ... runAstEditOnce(..., { dryRun: false, ... }) ... }`. `queueResolveHandler` (`tools/resolve.ts:147-185`) registers a pending invoker on `session.getToolChoiceQueue?.()`; requires the `write` tool active. `ToolChoiceQueue` class at `session/tool-choice-queue.ts:86`.

**Eval re-entry bridge (CODE-04):** `eval/js/tool-bridge.ts:210-350` — `callSessionTool(name, args, options)`: `__prelude__` → `invokeEvalPrelude` (approval-gated, `:211-241`); eval-specific bridges (`EVAL_COMPLETION_BRIDGE_NAME` etc., `:242-268`); `checkpoint`/`rewind` → explicitly blocked, throws `ToolError` (`:269-273`); named tools → `getTool(options.session, name)` (`:274`) — **this is the re-entry path CODE-04 requires disabled**. `__prelude__` approval path: `eval/preludes.ts:20-142` — `EvalPreludeDefinition` (`:26-56`), `getEnabledEvalPreludes` (`:63-69`), `findEnabledEvalPrelude` (`:78-81`), `approvePreludeInvocation` (`:83-112`), `invokeEvalPrelude` (`:120-142`).

---

### `packages/halo_agent/tests/tools/test_lsp_gated.py` (test, integration) — NEW — CODE-01

**Analog (planned):** Phase 5 test style (`05-PATTERNS.md:116-176`) + assertion discipline (`04-PATTERNS.md:434`).

**14 LSP actions** (verbatim, `lsp/types.ts:8-22`): `diagnostics, definition, references, hover, symbols, rename, rename_file, code_actions, type_definition, implementation, status, reload, capabilities, request`.

**Test shape:** spawn the `omp` backend, invoke `lsp` with each of the 14 actions, assert the wire token for each action. The `lsp` tool is `LspTool.createIf` (`tools/index.ts:573`) — it is settings-gated (only created when LSP is enabled). The test must enable LSP in the settings before invoking.

**Assertion discipline (P8):** literal wire tokens, never just non-zero exit (`04-PATTERNS.md:434`).

---

### `packages/halo_agent/tests/tools/test_dap_gated.py` (test, integration) — NEW — CODE-02

**Analog (planned):** Phase 5 test style (`05-PATTERNS.md:116-176`) + assertion discipline (`04-PATTERNS.md:434`).

**28 DAP actions** (verbatim, `debug.ts:64-93`): `launch, attach, set_breakpoint, remove_breakpoint, set_instruction_breakpoint, remove_instruction_breakpoint, data_breakpoint_info, set_data_breakpoint, remove_data_breakpoint, continue, step_over, step_in, step_out, pause, evaluate, stack_trace, threads, scopes, variables, disassemble, read_memory, write_memory, modules, loaded_sources, custom_request, output, terminate, sessions`.

**Test shape:** spawn the `omp` backend, invoke `debug` with each of the 28 actions, assert the wire token for each action. The `debug` tool is `DebugTool.createIf` (`tools/index.ts:566`) — it is settings-gated (only created when DAP is enabled). The test must enable DAP in the settings before invoking.

**Assertion discipline (P8):** literal wire tokens, never just non-zero exit (`04-PATTERNS.md:434`).

---

### `packages/halo_agent/tests/tools/test_ast_preview.py` (test, integration) — NEW — CODE-03

**Analog (planned):** Phase 5 test style (`05-PATTERNS.md:116-176`) + assertion discipline (`04-PATTERNS.md:434`).

**Preview-accept mechanism** (`ast-edit.ts:436-534`): `queueResolveHandler(this.session, { label, sourceToolName, apply, reject })` registers a pending action; `apply: async (_reason) => { ... runAstEditOnce(..., { dryRun: false, ... }) ... }` re-runs with `dryRun: false`. `queueResolveHandler` (`tools/resolve.ts:147-185`) registers a pending invoker on `session.getToolChoiceQueue?.()`; requires the `write` tool active.

**Test shape:** invoke `ast_edit` with a preview (dry-run), assert the preview is registered in the `ToolChoiceQueue`; then invoke `resolve` to apply, assert the file is modified. The `ast_edit` tool is `AstEditTool` (`tools/index.ts:564`).

**Assertion discipline (P8):** literal wire tokens, never just non-zero exit (`04-PATTERNS.md:434`).

---

### `packages/halo_agent/tests/tools/test_eval_sandbox.py` (test, integration) — NEW — CODE-04

**Analog (planned):** Phase 5 test style (`05-PATTERNS.md:116-176`) + assertion discipline (`04-PATTERNS.md:434`).

**Eval re-entry bridge** (`eval/js/tool-bridge.ts:210-350`): `callSessionTool(name, args, options)` — `__prelude__` → `invokeEvalPrelude` (approval-gated, `:211-241`); eval-specific bridges (`:242-268`); `checkpoint`/`rewind` → explicitly blocked (`:269-273`); named tools → `getTool(options.session, name)` (`:274`) — **this is the re-entry path CODE-04 requires disabled**.

**Test shape:** invoke `eval` with a script that attempts to call a named tool (e.g. `bash`), assert the re-entry is blocked (the `getTool` path is disabled). The `eval` tool is `EvalTool` (`tools/index.ts:568`).

**Assertion discipline (P8):** literal wire tokens, never just non-zero exit (`04-PATTERNS.md:434`).

---

### `packages/halo_agent/tests/tools/test_browser_web.py` (test, integration) — NEW — CODE-05

**Analog (planned):** Phase 5 test style (`05-PATTERNS.md:116-176`) + assertion discipline (`04-PATTERNS.md:434`).

**Browser prelude** (`sdk.ts:2529-2543`): `browserPrelude` is an eval prelude (NOT a builtin tool). It is reachable only through the `eval` tool's `__prelude__` bridge. The `web_search` tool is `WebSearchTool` (`tools/index.ts:581`) — a builtin tool.

**Test shape:** invoke `eval` with a `__prelude__` call to `browser`, assert the browser prelude is invoked; invoke `web_search` directly, assert the search result. The `web_search` tool supports 14 providers (Anthropic, Perplexity, Exa, Brave, DeepSeek, Jina, Kimi, Gemini, Codex, Tavily, Kagi, Z.AI, SearXNG, Synthetic) per `web/search/index.ts:1-6`.

**Assertion discipline (P8):** literal wire tokens, never just non-zero exit (`04-PATTERNS.md:434`).

---

### `packages/halo_agent/tests/tools/test_gui_tts.py` (test, integration) — NEW — CODE-06

**Analog (planned):** Phase 5 test style (`05-PATTERNS.md:116-176`) + assertion discipline (`04-PATTERNS.md:434`).

**Computer prelude** (`sdk.ts:2530-2543`): `computerPrelude` is an eval prelude (NOT a builtin tool). It is reachable only through the `eval` tool's `__prelude__` bridge. The `tts` tool is a `CustomTool` export (`tools/tts.ts:176`), NOT a `BUILTIN_TOOLS` entry.

**Test shape:** invoke `eval` with a `__prelude__` call to `computer`, assert the computer prelude is invoked; invoke `tts` (via the custom tool path), assert the TTS output. The `tts` tool has `approval: "write"` (`tools/tts.ts:180`).

**Assertion discipline (P8):** literal wire tokens, never just non-zero exit (`04-PATTERNS.md:434`).

---

### `packages/halo_agent/tests/tools/test_shadow_git.py` (test, integration) — NEW — LOOP-07

**Analog (planned):** Phase 5 test style (`05-PATTERNS.md:116-176`) + assertion discipline (`04-PATTERNS.md:434`).

**Shadow-git design** (RESEARCH `:306-315`): side repo `.halo/checkpoint.git`, `commit_workspace(turn_id)` (add all + commit `halo-turn:{turn_id}`), `restore_workspace(turn_id)` (`git diff --name-only` → exact file list, `git checkout <commit> -- <files>`).

**Test shape:** create a workspace, make changes, call `commit_workspace(turn_id)`, make more changes, call `restore_workspace(turn_id)`, assert the workspace is restored to the committed state. The `shadow_git.py` module uses `bounded_git_probe` (`_subprocess_compat.py:872-901`) for all git operations.

**Assertion discipline (P8):** literal wire tokens, never just non-zero exit (`04-PATTERNS.md:434`).

---

### `packages/halo_agent/tests/conftest.py` (test fixture) — NEW

**Analog (planned):** `04-02-PLAN.md:111-112` conftest scaffolding + `03-01-PLAN.md:192` `run_child`.

**Shared fixtures:**
- `omp_backend` — a fixture that spawns the `omp` backend (the `omp.py` backend) and yields a connected client.
- `workspace` — a fixture that creates a temporary workspace directory and yields its path.
- `tool_session` — a fixture that builds a workspace-keyed `ToolSession` (the Phase 6 `ToolSession` builder).
- `shadow_git` — a fixture that initializes a shadow-git side repo in a temporary directory.

**Validation** (from `06-RESEARCH.md:506-545`): pytest 9.1.1 + pytest-asyncio 1.4.0; quick `uv run --project packages/halo_agent pytest tests/ -x -q`; full `uv run --project packages/halo_agent pytest tests/ -q`.

## Shared Patterns

### P1 — Windows-first child spawn
**Source:** `AGENTS.md:15` + `bounded_git_probe` (`_subprocess_compat.py:872-901`) + `windows_hide_flags` (`:213-220`)
**Apply to:** `shadow_git.py`, `omp.py` (backend spawn)
```python
def windows_hide_flags() -> int:
    """Win32 creationflags hiding the child's console without detaching it; 0 elsewhere."""
    return _CREATE_NO_WINDOW if IS_WINDOWS else 0

# Standard call:
subprocess.run([cmd, ...], capture_output=True, text=True, encoding="utf-8",
    errors="replace", timeout=..., stdin=subprocess.DEVNULL, check=False,
    creationflags=windows_hide_flags())
```

### P2 — Stable workspace-keyed ToolSession
**Source:** `06-RESEARCH.md:224-233` Pattern 1 + `ToolSession` type (`tools/index.ts:209-550`)
**Apply to:** `omp.py` (backend), `conftest.py` (fixture)
The `ToolSession` must pass `cwd` (derived from `workspace_id`), `getEvalSessionId: () => workspace_id`, `getToolChoiceQueue: () => sharedToolChoiceQueue`, and an active `write` tool. The four process-global state maps (LSP, DAP, eval, browser) are keyed on `cwd`/session id, so a stable workspace-keyed `ToolSession` makes them persist across calls.

### P3 — Process-global state persistence
**Source:** `lsp/client.ts:27`, `dap/session.ts:284-288,1876`, `eval/js/context-manager.ts:112`, `tools/browser/registry.ts:92`
**Apply to:** `omp.py` (backend), `conftest.py` (fixture)
The four process-global state maps are keyed on `cwd`/session id. A stable workspace-keyed `ToolSession` makes them persist across calls. The `ToolSession` must be constructed once per workspace and reused across all `tool_invoke` calls for that workspace.

### P4 — Preview-accept via ToolChoiceQueue + xd://resolve
**Source:** `ast-edit.ts:436-534` + `tools/resolve.ts:147-185` + `session/tool-choice-queue.ts:86`
**Apply to:** `test_ast_preview.py` (CODE-03)
`queueResolveHandler(this.session, { label, sourceToolName, apply, reject })` registers a pending invoker on `session.getToolChoiceQueue?.()`; requires the `write` tool active. The `apply` callback re-runs with `dryRun: false`.

### P5 — Eval sandbox isolation
**Source:** `eval/js/tool-bridge.ts:210-350` + `eval/preludes.ts:20-142`
**Apply to:** `test_eval_sandbox.py` (CODE-04), `test_browser_web.py` (CODE-05), `test_gui_tts.py` (CODE-06)
The `callSessionTool` bridge routes `__prelude__` to `invokeEvalPrelude` (approval-gated), eval-specific bridges to their handlers, `checkpoint`/`rewind` to an explicit block, and named tools to `getTool` (the re-entry path CODE-04 requires disabled).

### P6 — Provenance patch discipline
**Source:** `provenance/README.md:106-154` + `05-PATTERNS.md:464-475`
**Apply to:** `halo-tool-invoke-phase6.patch`, `series`
Four headers (From/Subject/Upstream-Ref/Halo-Reason/Halo-Touches/Halo-CVE) + `---` + unified diff; `git apply` ignores headers; append to `series` after every earlier entry, never sorted; `just provenance-manifest tree=oh-my-pi` (never hand-edit TSV/UPSTREAM.json); `just provenance-replay tree=oh-my-pi` (if replay fails, the patch is wrong); grep patch body for brand/wire literals (a `halo.` literal is a failure).

### P7 — capability_disabled refusal
**Source:** `05-PATTERNS.md` P6
**Apply to:** `capabilities.py`, all test files
When a capability is disabled, the policy gate returns a `capability_disabled` refusal. The test must assert the refusal wire token.

### P8 — Literal-token assertion discipline
**Source:** `04-PATTERNS.md:434`
**Apply to:** all test files
Assert literal wire tokens, never just non-zero exit. The test must assert the exact wire token for each action/operation.

### P9 — Bounded git probe
**Source:** `bounded_git_probe` (`_subprocess_compat.py:872-901`)
**Apply to:** `shadow_git.py`
`bounded_git_probe(argv, timeout=..., env=...)` runs a short git probe, returns stripped stdout or `""` on any failure. On Windows, it uses bounded `communicate`, tree-kill plus a 1s drain, then abandons the pipes. On POSIX, the probe gets its own process group so cleanup also takes down credential/remote helpers.

### P10 — Capability-class keying
**Source:** `04-PATTERNS.md:244`
**Apply to:** `capabilities.py`
Policy keys on declared capability classes, never on tool names, so aliases can't launder: `write`, `patch`, `ast_edit` → `fs.write`; `bash` → `proc.exec`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `packages/halo_agent/halo_agent/tools/backends/omp.py` (FrameRecorder) | service | streaming | No FrameRecorder analog in the codebase (carry over from Phase 5) |
| `packages/halo_agent/halo_agent/tools/backends/omp.py` (crash/restart supervision) | service | streaming | No crash/restart supervision analog in the codebase (carry over from Phase 5) |

## Metadata

**Analog search scope:** `vendor/oh-my-pi/packages/coding-agent/src/` (tools, lsp, dap, eval, web, modes/rpc), `vendor/oh-my-pi/packages/coding-agent/examples/hooks/`, `vendor/oh-my-pi/provenance/`, `vendor/hermes-agent/` (agent, hermes_cli), `.planning/phases/04-tool-registry-policy-gate/`, `.planning/phases/05-coding-core-over-rpc/`
**Files scanned:** 24 core-side files + 8 hermes-agent files + 4 planning documents
**Tracked-source gate:** all core-side analogs verified with `git ls-files -- <path>` (non-empty = tracked). Python-side citations are `[PLANNED]` precedents from Phase 2-5 plan/research documents (the `packages/halo_agent/` directory does not exist on disk).
**Pattern extraction date:** 2026-10-25
