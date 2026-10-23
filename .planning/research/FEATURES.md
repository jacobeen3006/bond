# Feature Research

**Domain:** Fused coding-agent product — Desktop + CLI, one agent loop, coding core as RPC tool backend, embedded knowledge-graph memory, TDD workflow policy
**Researched:** 2026-10-23
**Confidence:** HIGH on upstream capability facts (fetched from the four repositories); MEDIUM on 2026 market expectations and on the interaction design of the resolutions below.

## Scope and Method

This is not a greenfield feature list. HALO fuses four mature products whose feature surfaces overlap almost completely at the tool layer. The research question is therefore two questions:

1. What must a coding-agent Desktop+CLI product ship in 2026 or users leave?
2. Where do two (or three) upstreams implement the same capability, and which implementation survives?

Primary sources are the live upstream repositories, not training data: `can1357/oh-my-pi` (OMP), `NousResearch/hermes-agent` (Hermes), `vectorize-io/hindsight` (Hindsight), and `tchivs/gsd-omp` (GSD). Competitor expectations are grounded in current Claude Code, Codex CLI, and Cursor documentation. Capability statements are fetched facts; complexity ratings and 2026 market judgments are **[INFERENCE]** where they are not directly supported by a source.

Two structural facts drive nearly every decision:

- **Hermes has ~100 built-in tools, OMP has 31.** Hermes' [tools reference](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/tools-reference.md) counts roughly 100 tools across browser (10 core + 2 CDP + 5 vault + `browser_exec`), file (4), terminal (2), desktop GUI (11), web (2), Feishu (5), Yuanbao (5), Kanban (14), and standalone tools. OMP's [README](https://github.com/can1357/oh-my-pi) advertises 31 built-in tools, 14 LSP operations, 28 DAP operations, 60+ providers, and 185 RPC commands with 18 async frame categories.
- **The overlap is not "similar features"; it is duplicate implementations of the same five primitives** — a file tool, a search tool, a shell, a subagent spawner, and a session store. Any duplicated primitive that survives fusion re-creates the two-path problem the product exists to eliminate.

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in a 2026 agentic coding product. Missing one means the product feels incomplete, regardless of how good the fusion is. Expectations are grounded in the current [Claude Code overview](https://code.claude.com/docs/en/overview), [Codex CLI docs](https://learn.chatgpt.com/docs/codex/cli), [Cursor docs](https://cursor.com/docs), and the upstream OMP/Hermes surfaces.

| Feature | Why Expected | Complexity | Depends on / Notes |
|---|---|---|---|
| Streaming agent chat with steer, queue, and interrupt | Users expect to redirect a running turn, not wait or cancel | HIGH | Loop-owned (Python). Needs queue modes + abort semantics; OMP already exposes `steer`/`follow_up`/`abort`/`abort_and_prompt` over RPC ([rpc.md](https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md)) |
| File read, write, and edit with diff preview | The core loop; diff review is the trust mechanism | HIGH | Hashline edit + unified path resolver; session store for undo; checkpoint manager |
| Shell execution with approval and background jobs | Builds, tests, servers, git | HIGH | One `bash` tool; approval gate; PTY; job control; Windows-native shell |
| Codebase search and navigation | grep/glob are used every turn; LSP is expected for rename/refs | HIGH | OMP in-process grep/glob/walker + 14-op LSP; one name per capability |
| Project instructions discovery | AGENTS.md/CLAUDE.md/rules are how teams steer behavior | MEDIUM | One context loader with importers; trust model; prompt assembly |
| Sessions: resume, list, search, branch, export | Multi-day work is normal; losing a session is unforgivable | HIGH | Single SQLite store; FTS5; tree/branch schema; export |
| Context compaction (auto + manual) | Long sessions otherwise die at the context wall | HIGH | Loop-owned compactor; token accounting; branch summaries |
| Model selection: hosted + local + OAuth + fallback | Users bring subscriptions, API keys, and local endpoints | HIGH | One model catalog + one credential store; role routing |
| MCP client with per-server tool control | MCP is the integration standard | MEDIUM | One MCP runtime; OAuth; health; tool deferral |
| Skills / slash commands / reusable prompts | Repeating a workflow must not mean re-explaining it | MEDIUM | One skills registry; Hub install; curator |
| Subagents and parallel work | Fan-out is the main throughput lever | HIGH | `task`; isolation; steering; typed results; policy on child tools |
| Git: diff review, commit, branch, PR, worktrees | The product is judged by what it ships | MEDIUM | Git tools; review pane; isolation backend; `gh` integration |
| Checkpoint / rollback of workspace changes | Agents make destructive mistakes; undo must be cheap | MEDIUM | Shadow git store; one checkpoint per turn; agent-write ledger |
| Permissions and approval policies | Auto-approve, allowlists, and YOLO modes are expected | MEDIUM | `pre_tool_call` gate; approval modes; command risk classification |
| Non-interactive / headless mode | CI, scripts, cron, and batch evaluation | LOW-MEDIUM | CLI `-p`/`exec`; JSON output; exit codes; no UI prompts |
| Desktop app with multi-session and diff review | The desktop is the "just works" surface | HIGH | Electron shell; panes; terminal; file tree; notifications; same session store |
| Image/screenshot input and vision | Screenshots are how users report UI bugs | LOW | Multimodal message path; vision fallback model |
| Web search and URL/PDF reading | Current versions and external docs are constantly needed | MEDIUM | Provider chain; structured extraction; `read` handles URLs |
| Memory across sessions | 2026 expectation: an agent that learns the repo and the user | MEDIUM-HIGH | Hindsight; bounded core memory; memory UI |
| Usage, cost, and token visibility | Users need to know what a run costs | LOW | Session store accounting; per-role/per-tool breakdown |
| Cross-surface continuity (CLI ↔ Desktop) | Start in terminal, continue in the app | MEDIUM | One session store; gateway/local transport; same loop |
| Windows-native support (this product) | Primary target is win32 x64 without WSL/Docker | HIGH | Rust shell; native Postgres/TEI; Electron packaging; no bash dependency |
| Import from other agents | Existing rules, skills, and memories lower switching cost | LOW-MEDIUM | OMP 8-format importer + Hermes agent-importers/OpenClaw import |
| Crash recovery and auto-update | Agent processes die; stale binaries are a support burden | MEDIUM | Frame logging; session write-ahead; update channel |
| Tool-schema discipline (deferral / progressive disclosure) | 100+ tools cannot all sit in the prompt | MEDIUM | Hermes `tool_search` bridge; one deferred catalog |

**Table-stakes judgment calls:**

- **Memory is table stakes, not a differentiator, in 2026** — but *quality* of memory is a differentiator. Claude Code ships auto memory ([overview](https://code.claude.com/docs/en/overview)); Hindsight ships retain/recall/reflect. Shipping memory is expected; shipping consolidating, evidence-backed memory is not. **[INFERENCE: market judgment]**
- **Multi-surface continuity is becoming table stakes.** Claude Code explicitly moves sessions between terminal, desktop, web, and mobile. A Desktop+CLI product that keeps two session stores will be judged broken. **[INFERENCE]**
- **Windows-native is table stakes for HALO even though it is not table stakes for the category.** Upstream OMP and Hermes both support native Windows, so regressing to WSL would be a visible downgrade.

### Differentiators (Competitive Advantage)

These are the reasons to choose HALO over Claude Code, Codex CLI, Cursor, or either upstream alone. They should map to the Core Value in PROJECT.md: one non-bypassable tool path.

| Feature | Value Proposition | Complexity | Depends on / Notes |
|---|---|---|---|
| **Single non-bypassable tool path** | Every tool call — Python-native or RPC — passes one adapter and one `pre_tool_call` gate. No policy can be skipped by choosing the other runtime. | HIGH | Adapter; unified registry; policy gate; RPC host-tool bridge for subagent children. This is the product. |
| **TDD invariants enforced as policy** | RED→GREEN→REFACTOR is checked at the chokepoint, not requested in prose. A model cannot "forget" the workflow. | MEDIUM-HIGH | GSD skills + `pre_tool_call` rules + change/test evidence; session state for phase |
| **Bundled native memory, no Docker** | Postgres+pgvector and CPU TEI ship as supervised child processes; "just works" on a workstation | HIGH | Service supervisor; migrations; port allocation; hardware profile heuristics; TEI readiness |
| **Hindsight memory quality** | Knowledge-graph memory with observations, mental models, 4-strategy recall (semantic + BM25 + graph + temporal), RRF merge, cross-encoder rerank, and evidence-backed beliefs | HIGH | Embedded Hindsight; TEI embedder/reranker; bank config; per-op LLM config |
| **Four-lane admission control** | Prompt traffic cannot queue behind memory work; lane metrics are visible. Directly targets the observed 11.59s p50 recall pathology. | HIGH | Scheduler above both systems; lanes L0 prompt, L1 recall/reflect, L2 retain, L3 background; metrics; graceful drain |
| **Hashline edits** | Content-hash anchors reject stale patches before corruption; OMP reports 61% fewer output tokens on Grok 4 Fast | MEDIUM | OMP `edit`; read snapshot tags; stale-anchor recovery; model-family modes |
| **Full code intelligence** | 14 LSP ops (rename with workspace/willRenameFiles, code actions, type definition, implementation) and 28 DAP ops (breakpoints, stepping, memory, disassembly) | MEDIUM | OMP RPC; language server pool; debug adapters |
| **Structural codemods** | `ast_edit`/`ast_grep` over 50+ tree-sitter grammars, preview-then-accept | MEDIUM | OMP pi-ast; apply gate; diff preview |
| **Durable multi-profile Kanban** | Cross-process, SQLite-backed task board with dependencies, reviews, heartbeats, attachments, PR completion contracts, and goal-mode cards | HIGH | Hermes dispatcher; profiles; 14 kanban tools; worker sessions; desktop board |
| **Skill self-improvement + Curator** | Skills are created from experience, improved in use, then pruned/consolidated in the background | MEDIUM | Skills registry; usage tracking; aux model; archive-not-delete policy |
| **Desktop plugin platform** | Panes, pages, sidebar nav, status-bar items, palette commands, keybinds, themes, and a scoped backend — one ESM file, hot reload | MEDIUM | `@hermes/plugin-sdk`; desktop plugin loader; capability toggles |
| **Omni-channel gateways with continuity** | Telegram/Discord/Slack/WhatsApp/Signal/email plus Feishu, DingTalk, BlueBubbles, Buzz, A2A — one gateway process, one session per chat | HIGH | Gateway adapters; auth/pairing; delivery; session store; approval routing |
| **In-process Rust shell on Windows** | brush bash + dozens of builtins compiled in; persistent sessions; no WSL and no fork/exec on the hot path | HIGH | OMP pi-shell/pi-builtins; PTY; Windows native packaging (upstream docs cite 46–67 builtins across sections) |
| **Subagent orchestration with isolation and steering** | Batched fan-out, worktree/projfs isolation, agent registry, parked/revived workers, IRC between peers, typed output | HIGH | OMP task; pi-iso; RPC subagent frames; policy bridging |
| **Advisor second model** | A reviewer model reads every turn and injects notes; catches what the doer rushed past | HIGH | Loop-level port (RPC emits advisor events but exposes no run command); separate context/model |
| **Time-traveling stream rules (TTSR)** | Regex-triggered abort-and-inject mid-stream; course correction without per-turn context tax | HIGH | Loop-level port; stream interception; survives compaction |
| **Path-addressed everything** | `pr://`, `issue://`, `agent://`, `skill://`, `ssh://`, `conflict://`, `memory://` resolve inside every FS-shaped tool | MEDIUM | OMP internal-URL resolver; read/grep/write integration; conflict resolution |
| **23-provider web search + structured extraction** | Provider chain with keyless fallbacks; GitHub/registries/arXiv/Stack Overflow/docs converted to anchored markdown | MEDIUM | OMP web_search; provider credentials; read URL/PDF |
| **Memory observability UI** | Browse, search, prune, export, health, staleness, conflicts, provider config, lane metrics in one Desktop page | MEDIUM-HIGH | Hindsight APIs; Desktop page; scheduler metrics; credential store |
| **Profile export/import** | Share a complete setup (skills, memory, persona, crons, plugins, layout) without API keys | LOW-MEDIUM | Profile bundling; secret stripping; import validation |
| **GSD agent tiers become real** | gsd-omp's `modelMode: passive` limitation exists because dispatch cannot carry a model field; HALO owns dispatch, so planner/executor tiers can route | MEDIUM | Task dispatch model field; model catalog; GSD config |

**Differentiator discipline:** do not compete on model access (everyone has the same APIs), on raw tool count (Hermes already has ~100), or on UI polish alone. Compete on the policy chokepoint, memory quality, and code intelligence depth — the three things the fusion uniquely enables.

### Anti-Features (Deliberately Not Built)

| Anti-Feature | Why Requested / Surface Appeal | Why Problematic | Alternative |
|---|---|---|---|
| **Second autonomous top-level agent loop** | "Keep OMP's loop for coding tasks; it is better at coding" | Re-creates two transcripts, two compaction policies, two policy bypasses; directly violates Core Value | OMP is a tool backend over stdio RPC; child loops exist only inside `task` |
| **Reimplementing OMP coding tools in Python** | "One language is simpler" | Loses in-process Rust performance and years of tool hardening; guarantees drift | Keep the RPC boundary; add tools in the core, not the loop |
| **In-process FFI of Rust/TS into Python** | "Avoid the 150ms RPC overhead" | Destroys crash isolation, frame logging, and the Rust core's process assumptions | stdio JSON-RPC with a <150ms adapter budget |
| **A second duplicate implementation of any tool** | "Let the model choose the better edit/read/search tool" | Two names for one capability doubles prompt cost, produces inconsistent policy, and splits bug fixes | One canonical tool per capability; importers/adapters only |
| **Docker-based memory stack** | "Postgres is easier in a container" | Docker Desktop is not an acceptable dependency on the target workstation | Bundled native Postgres+pgvector and TEI binaries |
| **Standalone Hindsight WebUI** | "Ship the upstream UI as-is" | Two products, two auth surfaces, two memory vocabularies | Functions live in HALO Desktop's Memory page |
| **Auto-deleting or silently overwriting memories** | "Keep the bank clean" | Irreversible loss of user knowledge; destroys trust | Invalidate (reversible), archive, explicit prune; observations refine with evidence |
| **Unbounded memory injection into the prompt** | "Always inject everything known" | Token cost and prefix-cache destruction; Hermes caps core memory for this reason | Bounded core block + on-demand recall/reflect |
| **Retain every message and tool result by default** | "Maximum recall" | Noise, secret leakage, LLM extraction cost, consolidation backlog | Curated retain; Memory Defense; lane budgets; explicit write policy |
| **Tool access hidden inside code execution** | "Let Python cells call read/search/task directly" | Re-entrant calls bypass the registry and `pre_tool_call`, so a model can route around policy with `execute_code` | Route every re-entrant call through the adapter and gate; disable host-control APIs inside eval |
| **Blocking the first chat turn on TEI readiness** | "Correctness first" | Boot latency is a first-impression failure; the local embedder path exists | Degrade to local embedder with a visible warning |
| **Exposing OMP's TypeScript extension host as a fourth third-party plugin surface** | "All upstream extension APIs stay public" | Hermes already has three plugin systems (Python CLI/gateway, dashboard JS, Desktop ESM); a fourth unsandboxed runtime doubles the trust boundary | Public surfaces are Hermes plugins; OMP extensions remain in-tree coding-core modules |
| **A second session store or a second credential store** | "Keep OMP's JSONL sessions / auth storage" | Breaks CLI↔Desktop continuity and leaves secrets in two places | One SQLite session store, one Hermes secret store |
| **Upstream sync/auto-update of the four codebases** | "Stay current" | Contract drift, rebrand churn, unauditable merges | Provenance manifest; deliberate re-import if ever needed |
| **macOS/Linux release binaries in v1** | "Cross-platform is free" | Untested paths become support load; Windows packaging is already hard | Portable code, Windows-only support statement |
| **Cloud-required memory** | "Managed is easier" | Offline/local-first is the product promise | Embedded default; Hindsight Cloud optional |
| **Multi-user server, RBAC, or team workspaces in v1** | "Teams will pay" | Unbounded auth/tenancy scope before single-user quality is proven | Profiles; defer tenancy |
| **A separate "chat with your memory" app or surface** | "Memory deserves its own product" | Contradicts the one-product requirement and fragments navigation | Memory page inside HALO Desktop |
| **Per-agent model routing implemented by GSD independent of the host** | "Planner on a strong model, executor on a cheap one" via plugin config | gsd-omp documents this as a silent no-op under OMP because dispatch cannot carry a model; a second router would drift | HALO's task dispatch carries the model; GSD tiers resolve through one catalog |

## Conflict Resolution: One Implementation Per Capability

### Decision Rules

Every collision below is resolved by these rules, applied in order:

1. **Loop owner wins loop-resident state.** The Python agent loop owns every turn, the transcript, compaction, and goal continuation. OMP loop-state features must be ported into the loop or retired; they cannot live in a second loop.
2. **Data owner wins the store.** There is exactly one session store, one credential store, one skills registry, one model catalog, and one memory bank. A second store is never kept "for compatibility".
3. **Safety layer wins the gate.** `pre_tool_call`, approvals, and policy live once, in Hermes' hook bus. Backends receive already-approved calls.
4. **Superset wins the tool contract, unless it breaks Windows.** The tool that already handles more inputs with fewer model tokens wins; Windows-native behavior is a tiebreaker.
5. **One user-visible name per capability.** No aliases, no "legacy" tool names, no per-backend tool variants.
6. **Import, don't dual-run.** Retired systems contribute an importer or a read-only discovery pass, not a second runtime.

### Master Conflict Table

Winner = the implementation that ships. "Dies" means removed from the model-visible registry and from the runtime (code may remain as an importer while migration is in flight).

| # | Capability | Python-side implementation (Hermes/GSD) | OMP implementation | Winner | Why (one line) | Complexity | Depends on |
|---|---|---|---|---|---|---|---|
| 1 | Read files / dirs / archives / URLs | `read_file` (line numbers, pagination, docx/xlsx) | `read` (files, dirs, archives, SQLite, PDF, notebooks, URLs, ssh://, internal schemes, snapshot tags) | **OMP `read`** | One path resolver already covers a strict superset and emits the hash tags hashline needs; Hermes' line-number view is a subset | MEDIUM | Path resolver; docx/xlsx parser port; snapshot tags |
| 2 | Create/overwrite files | `write_file` (read-before-write guard, lint) | `write` (file, archive entry, SQLite row) | **OMP `write`** | Same resolver and hash snapshot as read/edit; the read-before-write guard is policy, not a second writer | MEDIUM | Policy gate; syntax/LSP feedback |
| 3 | Edit existing files | `patch` (9-strategy fuzzy match, unified diff) | `edit` hashline (content-hash anchors, block anchors, registers, MV, 5 modes) | **OMP `edit`** | Hash anchoring rejects stale patches before corruption and cuts output tokens; OMP's `sloppy`/`replace` modes already absorb whitespace drift | MEDIUM | `read` tags; pi-edit; model-family mode mapping; LSP |
| 4 | Content search | `search_files` (rg-backed) | `grep` (in-process ripgrep, globs, internal URLs, scan cache) | **OMP `grep`** | In-process, zero fork/exec on Windows, and it walks `pr://`/`diff` like a directory | LOW | pi-walker; internal-URL resolver |
| 5 | Path discovery | `search_files` target=files | `glob` (gitignore-aware, mtime sort) | **OMP `glob`** | Same walker/cache as grep; one discovery primitive instead of an overloaded search tool | LOW | pi-walker |
| 6 | Shell | `terminal` (6 backends) + `process_manage` | `bash` (brush, persistent sessions, PTY, in-process builtins, background jobs) | **OMP `bash` engine**; Hermes' Docker/SSH/Modal/Daytona/Vercel backends survive as environment providers | Native bash on Windows without WSL and no fork/exec on the hot path; remote sandboxes are a backend choice, not a second tool | HIGH | Approval gate; PTY; job control; env plugins; Windows packaging |
| 7 | Web search + page extraction | `web_search`, `web_extract` | `web_search` (23 providers) + `read` URL/PDF | **OMP `web_search` + `read`**; Hermes Tool Gateway becomes a provider in the chain | More backends, structured site handlers, and one path-based read surface instead of a second extractor | MEDIUM | Provider credentials; read URL pipeline; Tool Gateway |
| 8 | Todo / task tracking | `todo_list` (nested items) | `todo` (ordered mutation ops, phases, reminders) | **OMP `todo` contract** | Ordered mutations are cheaper and more reliable for weak models; phases subsume nesting | LOW | Session store persistence; Desktop todo panel |
| 9 | Subagent delegation | `delegate_task` (10 concurrent, output_schema, background delivery) | `task` (batch, isolation, agent registry, steering, parked revival, typed output, IRC) | **OMP `task`** | Richer orchestration and `agent://` result addressing; Hermes' completion delivery becomes the async notification path | HIGH | RPC subagent frames; pi-iso; policy bridge for child tools |
| 10 | Skills | `skill_manage`/`skill_view`/`skills_list`, Hub install, Curator, profiles | `manage_skill`, `skill://`, multi-provider discovery, autolearn | **Hermes registry**; OMP reads its projection via `skill://` | Hermes adds install scanning, usage tracking, curation, and profile lifecycle; OMP's managed/autolearn skills become writers through it | MEDIUM | Skills Hub; Curator; project root; GSD projection |
| 11 | MCP administration | Full runtime: OAuth, health supervisor, tool search, dashboard, scoping | MCP capability + config discovery (.mcp.json, Claude/Cursor) | **Hermes MCP runtime** | One client, one tool registry, richer auth and lifecycle; OMP contributes an importer | MEDIUM-HIGH | OAuth; tool search; adapter registry |
| 12 | Sessions (store/tree/search) | SQLite, FTS5, profiles, gateway continuity | JSONL tree, branch/fork, entries, history.db index, export_html | **Hermes store**, with OMP tree semantics ported | The requirement is one store across Desktop, CLI, and gateways; Hermes already models it | HIGH | Schema migration; branch/fork; FTS5; export |
| 13 | Compaction | Loop-owned compression, `/compress`, session mutations | Rich engine: threshold/mid-turn/idle, branch summaries, snapcompact, native replay | **Hermes loop-owned engine**, with OMP strategies ported | Only the loop that owns the transcript can compact without divergence; OMP would rewrite a transcript it no longer owns | HIGH | Token accounting; summary entries; branch model; provider-native replay |
| 14 | Provider/model catalog | Provider plugins, routing, fallback, credential pools, Tool Gateway | 60+ providers, 9 roles, fallback chains, path-scoped models, round-robin credentials | **OMP catalog + role router**; Hermes secret store holds credentials | Deeper catalog and role routing, and the coding core needs the same catalog; Hermes' plugin layer becomes an importer/alias | HIGH | Catalog export to Python; auth broker; Settings UI |
| 15 | Diagnostics | Post-write syntax + LSP with a second server pool | `lsp` 14 ops + automatic diagnostics | **OMP `lsp` runtime**; Hermes' post-write check calls it | One server pool; rename/code actions/type-definition exist only in OMP | MEDIUM | LSP lifecycle; edit pipeline; workspace trust |
| 16 | Durable memory | `memory` (MEMORY.md/USER.md), 8+ provider plugins | 5 backends (`off`/`local`/`hindsight`/`mnemopi`/`sharpshooter`), retain/recall/reflect/memory_edit | **Hindsight** (embedded), one backend | The only option with consolidation, evidence, graph+temporal retrieval, and per-op LLM config | HIGH | Postgres/pgvector; TEI; scheduler; memory tools; UI |
| 17 | Transcript search | `session_search` FTS5 (discovery/scroll/read/browse) | session listing/tree (no FTS message search) | **Hermes `session_search`** | FTS5 over the single store is the stronger surface; OMP tree navigation is ported into the same store | MEDIUM | Session schema; FTS5 index |
| 18 | Tool-call policy / hooks | `pre_tool_call` (fail-closed), full hook catalog, approvals | Extension hooks/lifecycle | **Hermes hook bus**; OMP hooks forwarded as events | Single chokepoint requirement; Hermes already fails closed on timeout/exception | MEDIUM | Adapter; plugin loader; GSD policy registration |
| 19 | Plugin/extension platform | Python CLI/gateway plugins, dashboard JS plugins, Desktop ESM plugins | TypeScript extensions + marketplace | **Hermes plugin systems**; OMP extensions stay in-tree | Three public surfaces already exist; a fourth unsandboxed runtime doubles the trust boundary | MEDIUM-HIGH | Plugin catalog; desktop loader; capability toggles |
| 20 | Project context discovery | `.hermes.md`, AGENTS.md, CLAUDE.md, SOUL.md, `.cursorrules` | 8-format importer, AGENTS.md workspace pass, rules/skills/MCP discovery | **OMP loader** | Superset importer with one discovery pass; Hermes semantics layer on top | MEDIUM | Trust model; prompt assembly; per-profile overrides |
| 21 | Approvals | Modes, smart approval, allowlist floors, gateway prompts | Approval mode | **Hermes approvals** | It is the gate, and it already spans CLI, TUI, Desktop, ACP, and messaging | MEDIUM | `pre_tool_call`; risk classifier; surfaces |
| 22 | Checkpoint/rollback | Shadow-git workspace snapshots + `/rollback`, write ledger | `checkpoint` (context collapse) + `rewind` (prune context) | **Split by scope: Hermes wins filesystem rollback; OMP wins context checkpoint/rewind, renamed** | They solve different problems; the only real collision is the shared word "checkpoint" | LOW | Session store; shadow git; tool naming |
| 23 | Browser automation | 10 core browser tools + CDP + 5 vault tools, multiple providers | `browser` via Puppeteer/CDP/Chrome relay, stealth | **Hermes browser toolset** | Snapshot/ref semantics work with non-frontier models and multiple cloud backends; OMP's CDP engine can become a provider | HIGH | Browser providers; CDP; screenshot pipeline |
| 24 | Desktop control | `computer_use` via cua-driver (background, no focus steal) | `computer` (windows, screenshots, native input, AX) | **Hermes `computer_use`** | Background control is the right behavior inside a desktop app; OMP's focus-stealing model is a regression | MEDIUM | cua-driver binary; permission prompts |
| 25 | Image generation / TTS | `image_generate`, `text_to_speech` with provider plugins | `generate_image`, `tts` | **Hermes providers**, one tool name each | More backends and the plugin catalog; OMP's two tools map onto them | LOW-MEDIUM | Provider plugins; media storage |
| 26 | Goal continuation | `/goal` + judge + Kanban goal cards | `goal` RPC op | **Hermes `/goal`** | Continuation is loop-owned; OMP's RPC becomes a state mirror for the coding core | MEDIUM | Session store; judge model; turn budget |
| 27 | Plan mode | `/plan` writes a markdown plan | Plan mode with tool restriction + plan model role | **Hermes `/plan` artifact + the policy gate** | The loop owns the artifact and the gate enforces read-only; OMP's plan mode has no separate implementation | MEDIUM | Policy gate; plan role |
| 28 | ACP server | ACP adapter | `omp acp` | **Hermes ACP adapter** | The loop owner should serve editor turns; two ACP servers would double sessions | LOW | Session store; permission mapping |
| 29 | Structured questions | `clarify` (1–5 batched questions, multi-surface) | `ask` (option picker) | **Hermes `clarify`** | Batching, typed outcomes, and gateway delivery are richer; ACP can render it | LOW | UI surfaces; gateway routing |
| 30 | Code execution | `execute_code` (Python calling tools via RPC) | `eval` (persistent Python + Bun cells, tool re-entry) | **OMP `eval`** | Two kernels, persistent state, and the same tool-callback pattern | HIGH | Sandbox; tool re-entry; adapter |
| 31 | GitHub operations | `gh` skill / terminal | `github` tool + `pr://`/`issue://` | **OMP GitHub + internal URLs** | One path-shaped interface instead of per-operation tools; fewer schemas | LOW-MEDIUM | `gh` auth; internal-URL resolver |
| 32 | Usage/cost reporting | `/usage`, session timeline, dashboard | `/stats`, omp-stats | **Hermes session accounting** | The single session store is already the accounting source; OMP views become a page | LOW | Session schema; per-role attribution |
| 33 | Worktree isolation | GSD worktree scheduler (explicitly not OMP's primitive) | `task` `isolated: true`, pi-iso backends | **OMP task isolation** | gsd-omp's own README says native `task` isolation is the host primitive; two schedulers would fight | MEDIUM | pi-iso; Windows backend (projfs) verification |
| 34 | Code review orchestration | GSD `/gsd-code-review` | `/review` reviewer subagents | **GSD orchestration, OMP reviewer agents as the implementation** | GSD owns phase verification; OMP supplies the reviewer fan-out and P0–P3 verdict format | MEDIUM | Reviewer agents; task; GSD artifacts |

### Detailed Notes on the Consequential Decisions

#### Edit: hashline wins, fuzzy patch is retired

OMP's `edit` consumes one line-anchored patch string keyed by a four-hex snapshot tag copied from the latest `read`/`grep`/successful edit. If the file changed, the anchor diverges and the patch is rejected before it corrupts anything. It supports explicit ranges, tree-sitter block anchors, insert-before/after, named registers for cut/paste across files, `REM`, and `MV` ([edit.md](https://github.com/can1357/oh-my-pi/blob/main/docs/tools/edit.md)). Hermes' `patch` uses nine fuzzy-match strategies and returns a unified diff.

Decision: **`edit` (hashline) is the only edit tool.** Reasons: stale-write protection is a correctness property Hermes cannot express; OMP already ships `replace`, `patch`, `apply_patch`, and `sloppy` modes, so models that cannot produce hashline still have a wire contract; the upstream benchmark claims are about edit-format failure, which is exactly the problem Hermes' fuzzy matcher papers over.

What must be ported/kept:
- The read-before-write guard and "only report NEW lint errors" behavior from Hermes' `write_file` move into the adapter/policy (they are safety behavior, not a writer).
- Hermes' post-write syntax + LSP feedback is preserved, but it calls OMP's `lsp diagnostics`.
- Model-family fallback mapping must include Hermes' known-weak models (the upstream list already covers Kimi, MiMo, MiniMax, DeepSeek, StepFun, Codex Spark, GLM 5.3 Flash).

#### Shell: one `bash` tool, two layers

OMP's shell is an embedded brush engine with persistent sessions, PTY allocation, background-job dispatch, and dozens of in-process command-line utilities; the README's central claim is that it avoids fork/exec and runs natively on Windows. Hermes' `terminal` adds six execution backends (local, Docker, SSH, Modal, Daytona, Vercel Sandbox) and `process_manage`.

Decision: **the tool is `bash`; the engine is OMP's; the environment is a backend selected by a Hermes terminal-environment plugin.** `process_manage` folds into `bash` background jobs plus the existing `wait`/`proc://` job control. This keeps the Windows-native win and preserves Hermes' remote sandbox capability without two shells.

Nuance: Docker/Daytona/Vercel backends mean the shell is not running on the host, which breaks workspace checkpoints and host-side LSP. Hermes already documents that checkpointing and rollback are refused for container backends. The feature surface must show environment state (`local` vs sandbox) next to the composer so users do not expect host-file semantics.

#### Subagents: `task` wins, but child tool calls must cross the gate

OMP's `task` is the strongest spawner in either codebase: batch shape with shared context, per-item agent type and tools (a per-item `model` exists only for the seance consult path today), `isolated` worktree backends, a process-global agent registry with `running | idle | parked | aborted`, steering and cancellation over RPC (`steer_subagent`, `cancel_subagent`, `set_subagent_subscription`), typed output schemas, and `agent://`/`history://` addressing ([task.md](https://github.com/can1357/oh-my-pi/blob/main/docs/tools/task.md), [rpc.md](https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md)).

Hermes' `delegate_task` is no slouch: 10 concurrent children by default (the delegation config code sets `_DEFAULT_MAX_CONCURRENT_CHILDREN = 10`; the features overview still says 3, so trust the code), output schemas with one bounded correction turn, background completion delivery to messaging surfaces, and strict process ownership ([delegation.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/delegation.md)).

Decision: **`task` wins.** Hermes' background delivery and schema-retry behavior become adapter semantics, not a second spawner.

**Unresolved design risk (highest in the document):** OMP child agents execute tools inside the coding core. If those calls do not pass through the HALO adapter and `pre_tool_call`, the Core Value is false for every subagent. The implementation must either (a) run children with host-provided tools through the RPC host-tool bridge so every call returns to Python, or (b) restrict child toolsets to a policy-approved set and treat child tool execution as a separately audited boundary. Option (a) preserves the claim; option (b) is a documented exception. This decision must be made before the subagent phase, not after.

#### Sessions and compaction: the loop owns both

Hermes stores sessions in SQLite with FTS5 search, per-profile homes, gateway continuity, mutation/rewind/compression workers, and recovery tooling. OMP stores JSONL with a session tree (`id`/`parentId` + leaf pointer), branch summaries as first-class entries, blob externalization, a `history.db` index, and export/HTML ([session.md](https://github.com/can1357/oh-my-pi/blob/main/docs/session.md)).

Decision: **the Hermes SQLite store is the only session store.** OMP's tree semantics (branch, fork, switch, tree navigation, handoff) are ported into the schema; subagent transcripts live in the same store under a parent link so `agent://` can resolve without a second database. OMP's JSONL format is retired as a user-visible store.

Compaction: **Hermes' loop-owned compactor is the only top-level compactor.** The valuable OMP strategies are ported as strategies inside it: threshold/mid-turn/idle triggers, branch summaries, and optionally snapcompact. OMP's native-replay and provider-streaming compaction depend on OMP owning the provider stream, which it no longer does at the top level.

Why not the reverse (OMP compactor over RPC): the compactor must rewrite the exact transcript the Python loop will send next, preserve tool-call pairing, and update session entries atomically. Round-tripping that through RPC creates a second authority over the transcript — the precise divergence PROJECT.md calls out.

#### Memory: Hindsight wins outright, with one bounded Hermes projection

There are three memory systems in the fusion: Hermes' `memory` tool plus 8+ provider plugins (including upstream Hindsight), OMP's five backends and `retain`/`recall`/`reflect`/`memory_edit`, and Hindsight itself. Hindsight is the only one with:

- observations consolidated from facts, each carrying evidence quotes, proof count, and refinement history;
- mental models and knowledge pages that are database reads at boot, not retrieval calls;
- four parallel retrieval strategies (semantic, BM25, graph, temporal) merged by reciprocal rank fusion and cross-encoder reranking;
- per-bank configuration (missions, disposition traits, directives, recall budgets, Memory Defense with 45 secret/PII patterns);
- per-operation LLM configuration and a real operations queue with retry/cancel.

Decision: **Hindsight is the only durable memory store.** OMP's `memory.backend` collapses to `hindsight`; Hermes' memory-provider plugins collapse to the embedded Hindsight; the model-facing verbs are the Hindsight verbs (`retain`, `recall`, `reflect`) plus `memory_edit` for curation.

The one exception is deliberate: **Hermes' bounded `MEMORY.md`/`USER.md` prompt block survives as a projection, not a store.** It is generated from a Hindsight mental model (or curated page) into the frozen system-prompt snapshot, preserving Hermes' prefix-cache behavior and the "core memory" capability. Writes go through `memory_edit`; there is no second source of truth. The block remains bounded (Hermes ships 2,200/1,375-char limits) so it cannot blow the prompt.

#### Providers and credentials: split by concern, not by product

OMP has the catalog (60+ providers, 9 roles — default/smol/slow/plan/commit/vision/task/advisor/tiny — fallback chains, path-scoped model sets, round-robin credentials). Hermes has provider plugins, routing/fallback, credential pools, and a secret store. PROJECT.md requires memory credentials in the Hermes secret store and never in `.env`/`config.json`.

Decision: **OMP's catalog and role router are the single model authority; Hermes' secret store is the single credential authority.** Hermes' model-provider plugins become importers/aliases; OMP's auth storage is replaced by a secret-source client. One `/model` surface, one Settings → Models page, and the Memory Model defaults to the main agent model with per-operation overrides.

Implication: the Python loop needs the catalog at runtime. Export a versioned catalog snapshot (providers, base URLs, API modes, context windows, role defaults, fallback chains) to the Python side at startup and watch for changes; do not maintain a second handwritten provider list.

#### Skills: one registry, two projections

Hermes has the registry: `~/.hermes/skills/`, agentskills.io compatibility, Hub install with security scan and action log, skill bundles, per-profile libraries, usage tracking, and the Curator's `active → stale → archived` lifecycle (7-day run interval, 14-day stale, 30-day archive, never auto-delete, LLM consolidation off by default) ([skills.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/skills.md), [curator.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/curator.md)). OMP has file-backed discovery plus managed-skill authoring (`manage_skill`, autolearn), but no install scanning, usage tracking, curation, or profile lifecycle ([skills.md](https://github.com/can1357/oh-my-pi/blob/main/docs/skills.md)).

Decision: **Hermes' skill manager is the only registry; OMP discovers the same files through a project-level `skills/` directory exposed via `skill://`.** This satisfies PROJECT.md's "installed in both the Hermes skills registry and the OMP skill directory" as two projections of one record, not two libraries. OMP's `manage_skill` and `learn` write through the Hermes manager; OMP's Claude/Codex/Agents providers become read-only external skill directories.

Corollary: GSD TDD skills are authored once, registered once, and projected into both locations. Curator must not archive a skill referenced by a GSD phase or a cron job; Hermes already pins cron-referenced skills.

#### Diagnostics: one LSP pool

Hermes runs real language servers and injects only newly introduced diagnostics after `write_file`/`patch`, with an 80ms inline window and a 5s turn-end wait ([lsp.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/lsp.md)). OMP exposes 14 LSP actions including `rename_file` through `workspace/willRenameFiles`, `code_actions`, `type_definition`, `implementation`, `capabilities`, and raw `request` ([lsp.md](https://github.com/can1357/oh-my-pi/blob/main/docs/tools/lsp.md)).

Decision: **OMP's LSP runtime is the only language-server pool; Hermes' post-write UX becomes an adapter behavior** that calls `lsp diagnostics` after a write/edit and attaches only new diagnostics. DAP is untouched (OMP only).

### Additional Collisions Worth Naming

These are boundary and vocabulary collisions rather than duplicate implementations. Each row is still a decision; the rationale is in the resolution cell.

| Capability | Collision | Resolution |
|---|---|---|
| Tool discovery | Hermes `tool_search`/`tool_describe`/`tool_call` vs OMP `xd://` devices | **Complementary, not duplicate.** `tool_search` is the single schema-deferral mechanism; `xd://` remains a resource-addressing scheme for OMP virtual devices, not a second discovery UX. |
| Memory vs transcript search | `recall` (durable beliefs) vs `session_search` (what was said) | **Different stores and different verbs.** `recall` reads Hindsight banks; `session_search` reads FTS5 transcripts. Neither writes to the other. |
| Context checkpoint vs workspace rollback | OMP `checkpoint`/`rewind` vs Hermes `/rollback` | **Rename OMP's tools** to `context_checkpoint`/`context_rewind`; keep `/rollback` for filesystem snapshots. |
| Autonomy loops | Hermes `/goal` vs Kanban goal cards vs GSD `/gsd-autonomous` | **Three scopes:** one session (`/goal`), one board card (Kanban `--goal`), one milestone (GSD autonomous). They must not co-run continuations on the same session; GSD already defers when an OMP goal is active. |
| Plan artifacts | Hermes `/.hermes/plans/*.md` vs OMP plan mode vs GSD `PLAN.md` | **One artifact per scope:** interactive plan (`/plan`), phase plan (GSD `PLAN.md`). OMP plan mode contributes the read-only tool restriction only. |
| Reviewer subagents | OMP `/review` vs GSD code-review | **GSD orchestrates; OMP reviewer agents execute.** One verification gate, one P0–P3 verdict format. |
| Credential stores | OMP auth storage vs Hermes secret store/vault/pools | **Hermes secret store wins.** OMP login flows write through it; no plaintext credentials in config files. |
| Usage sources | OMP `omp-stats` vs Hermes `/usage` + timeline | **Hermes session accounting wins**; OMP's dashboard views are ported as visualizations over the same tables. |
| Context-file trust | OMP loads project extensions/hooks/MCP by design; Hermes treats workspaces as untrusted for LSP | **Merge the loaders, keep the stricter trust gate:** project-supplied hooks/extensions/MCP are opt-in per workspace; LSP trust remains opt-in. |

## Capabilities That Must Survive Untouched

### Hermes-Only Surfaces

These have no equivalent in OMP's documented surface. They are user-visible product capabilities, not implementation details; the fusion must not quietly drop them while consolidating tools.

| Capability | What Ships Today | Why It Must Survive | Fusion Risk | Complexity to Preserve |
|---|---|---|---|---|
| **Kanban dispatcher + 14 tools** | Durable SQLite board (`~/.hermes/kanban.db`), shared across profiles; dispatcher spawns one OS process per card; dependencies, review/request-changes, heartbeats, blocks, attachments, PR completion contracts, goal-mode cards. Tools: `kanban_show`, `kanban_list`, `kanban_complete`, `kanban_request_review`, `kanban_request_changes`, `kanban_block`, `kanban_heartbeat`, `kanban_comment`, `kanban_create`, `kanban_link`, `kanban_unblock`, `kanban_attach`, `kanban_attach_url`, `kanban_attachments` ([kanban.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/kanban.md)) | It is the only durable, cross-process, multi-profile orchestration surface; `task` is in-session only | Worker processes run full agents; they must be HALO loops with the same gate, or the "single path" claim excludes Kanban. Card completion gates (PR checks) must not be reimplemented. | HIGH — dispatcher + card worker boot + board UI + gate integration |
| **Messaging gateways** | One gateway process: Telegram, Discord, Slack, WhatsApp, Signal, email, plus plugin platforms (Feishu/Lark, DingTalk, BlueBubbles/iMessage, Buzz/Nostr, Yuanbao, A2A); pairing/auth, delivery, per-chat session continuity | This is Hermes' defining "lives where you do" capability; coding-agent competitors are adding channels, not removing them | Approval prompts, `clarify`, and async subagent completion must all route correctly per platform; a gateway turn must use the same loop and session store | HIGH |
| **Skills Hub / Store + Curator** | agentskills.io-compatible registry, Hub install with security scan + action log, skill bundles, `/learn`, per-profile libraries, usage tracking, stale/archive lifecycle, optional LLM consolidation | Governance is the moat; OMP's managed/autolearn skills have no install scanning or lifecycle | Curator must respect GSD-pinned and cron-referenced skills; Hub installs must project into the coding core | MEDIUM |
| **Desktop plugin loader** | One ESM file at `$HERMES_HOME/desktop-plugins/<id>/plugin.js`, uncompiled, hot-reloaded; imports only `@hermes/plugin-sdk`, `react`, `react/jsx-runtime`; contributes panes, pages, sidebar nav, status-bar items, palette commands, keybinds, themes; scoped backend `/api/plugins/<id>` ([desktop-plugin-sdk.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/desktop-plugin-sdk.md)) | This is how the Desktop becomes extensible without rebuilding the app; Kanban, achievements, and other pages already use it | Not sandboxed; the catalog trust model (human-reviewed, SHA-pinned) and import allowlist are the security boundary. HALO must not widen the import surface casually. | MEDIUM |
| **Dashboard plugins / widgets** | `plugin.yaml` + `dashboard/manifest.json` + `dist/index.js` + `plugin_api.py`; named shell slots (`header-*`, `sidebar`, `pre/post-main`, `footer-*`, `overlay`, page-specific slots); tab add/replace/hide; themes/layout variants ([extending-the-dashboard.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/extending-the-dashboard.md)) | Separate web-admin surface; slot system is the widget model | Two plugin systems (Desktop ESM and dashboard JS) already exist; keep them distinct and documented, do not merge their APIs | MEDIUM |
| **Profiles** | Per-profile homes, sessions, skills, memory, crons, plugins, secrets; export/import as `.tar.gz` with API keys stripped | Multi-persona and multi-project isolation without a server | Hindsight banks, model roles, and skills must be profile-scoped; profile export must include a memory-bank archive | MEDIUM |
| **Cron scheduler** | Natural-language/cron jobs, pause/resume/run/remove, skill-backed jobs, delivery to any platform | Unattended automation is a core Hermes promise | Cron turns must respect the same lanes and gate; a cron job must not starve L0 | MEDIUM |
| **Approval system** | Modes, smart approval, allowlist floors, YOLO, gateway approval cards, pre/post approval hooks | It is the safety UX and the natural home of the policy gate | Must remain the only approval surface; OMP approval mode is retired | MEDIUM |
| **Secret store / credential vault / pools** | Credential storage per profile, credential pools with rotation/backoff, secret-source plugins | PROJECT.md mandates memory credentials live here and are never logged | OMP model auth must be migrated in; no plaintext `.env` fallback for memory | MEDIUM |
| **Tool Gateway** | Nous subscription routes web search, image gen, TTS, cloud browser | One-subscription onboarding is a real acquisition feature | Becomes one provider in each tool's chain, not a parallel tool | LOW |
| **Voice, wake word, TTS, transcription** | Live voice, wake word, 10 TTS providers, voice-memo transcription across messaging | Differentiating accessibility and mobile workflow | Voice turns must use the same loop; transcript media must persist in the session store | MEDIUM |
| **Batch processing / trajectories** | Run the agent over many prompts, structured outputs, ShareGPT trajectory capture | Used for evals and training data; also a power-user workflow | Must not share sessions with interactive runs; batch workers need the gate and lane isolation | MEDIUM |
| **API server + ACP** | OpenAI-compatible HTTP endpoint; ACP adapter for Zed/VS Code/JetBrains | Editor and third-party frontends | One ACP server (Hermes); OMP's ACP wrapper is retired | LOW |
| **Personality / SOUL.md / skins / context references** | First-in-prompt persona file, per-session personality, CLI themes, `@file`/`@diff`/`@url` expansion | User-visible identity and ergonomics | Prompt assembly must reserve the SOUL block; context references must resolve through the same path resolver | LOW |
| **Agent importers** | OpenClaw, Claude Code, Codex, Cursor import with preview and optional secret migration | Switching cost is the main adoption barrier | Must merge with OMP's 8-format rules/skills/MCP importer into one migration flow | LOW-MEDIUM |

### OMP-Only Capabilities Reachable Over RPC

These are the reason the coding core stays a separate process. Each must remain callable through the adapter, with one tool name and one policy decision per invocation.

| Capability | Concrete Surface | Why It Cannot Be Reimplemented Cheaply | RPC Reachability | Complexity to Preserve |
|---|---|---|---|---|
| **LSP** | 14 ops: `diagnostics`, `definition`, `references`, `hover`, `symbols`, `rename`, `rename_file`, `code_actions`, `type_definition`, `implementation`, `status`, `reload`, `capabilities`, `request` ([lsp.md](https://github.com/can1357/oh-my-pi/blob/main/docs/tools/lsp.md)) | Language-server lifecycle, workspace trust, rename-through-`willRenameFiles` | Tool call over RPC; no separate protocol needed | MEDIUM |
| **DAP** | 28 ops: launch/attach, source/function/instruction/data breakpoints, continue/step/pause, evaluate, stack/threads/scopes/variables, disassemble, read/write memory, modules, loaded sources, custom request, output, terminate, sessions ([debug.md](https://github.com/can1357/oh-my-pi/blob/main/docs/tools/debug.md)) | Adapter discovery, process attach, memory inspection | Tool call over RPC | MEDIUM |
| **AST edit / AST grep** | `ast_edit` preview-then-accept via `xd://resolve`, `ast_grep` over 50+ tree-sitter grammars | Structural matching and safe multi-file apply | Tool calls over RPC; preview/accept needs UI round-trip | MEDIUM |
| **Rust shell** | brush bash, persistent sessions, PTY, in-process builtins, background jobs, Windows-native | Native performance and no WSL | Tool call over RPC; streaming output frames | HIGH |
| **Virtual tools / internal URLs** | `xd://` device listing and execution; 16 schemes including `pr://`, `issue://`, `agent://`, `skill://`, `ssh://`, `conflict://`, `memory://` (per upstream README/docs) | One path interface for remote and virtual resources | Resolved inside OMP tools; adapter must preserve URL resolution | MEDIUM |
| **Subagent orchestration** | `task` batch, isolation, registry, steering, cancellation, subscriptions, `agent://`/`history://` | Isolation backends and agent lifecycle | Explicit subagent RPC commands + frames | HIGH |
| **Eval kernels** | Persistent Python and Bun workers; either kernel can call agent tools over a loopback bridge | Sandboxed persistent state + tool re-entry | Tool call over RPC; host-tool bridge | HIGH |
| **Hashline edit engine** | pi-edit modes, block anchors, registers, stale-anchor recovery | Rust implementation and model-specific grammars | Tool call over RPC | MEDIUM |
| **GitHub path ops** | `github` tool, PR/issue as paths, conflict resolution via `conflict://` | Fewer schemas and diff-aware search | Tool calls over RPC | LOW-MEDIUM |
| **Security scan** | Plan/run native security reviews | Specialized agent + cloud scan integration | Tool call over RPC | LOW |
| **Web search chain** | 23 backends, `auto` chain, structured site handlers | Provider quirks and extraction | Tool call over RPC | MEDIUM |
| **Model catalog / roles** | 60+ providers, 9 roles, fallback, path-scoped models, round-robin credentials | Breadth and routing logic | Catalog export + `set_model`/`get_available_models` over RPC | HIGH |

### OMP Loop-Resident Capabilities (Behavior Lives in OMP's Loop)

This is the most under-appreciated risk in the fusion. The "185 RPC commands" describe the coding core's *external* protocol, but several OMP capabilities execute inside its agent loop. RPC exposes settings and events for some of them — the event stream includes `advisor_cost_changed`/`advisor_yielded` and `ttsr_triggered`, and RPC pins advisor defaults ([rpc.md](https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md)) — but the documented RPC schema exposes no run/control command for the behavior itself. Demoting OMP to a tool backend silently deletes them unless they are ported into the Python loop or explicitly retired.

| Capability | What It Does | Status Under Fusion | Complexity to Port |
|---|---|---|---|
| **Advisor model** | A second model on its own context reads every turn and injects notes/blockers; RPC emits cost/yield events but has no run command | Must port to the loop or be cut with explicit approval | HIGH |
| **TTSR (time-traveling stream rules)** | Regex match aborts the stream mid-token, injects a rule, retries; survives compaction; `ttsr_triggered` is an event, not a control command | Must port to the loop's stream interceptor | HIGH |
| **Magic keywords** | `ultrathink`, `orchestrate`, `workflowz` turn modifiers | Prompt/loop feature; port as routing flags | LOW |
| **Vibe mode** | Director driving persistent fast/good worker sessions | Depends on `task`; port as a workflow preset | MEDIUM |
| **Collab** | Live session sharing over a relay with QR/link, sealed frames | Desktop/gateway feature; optional in v1 | HIGH |
| **Prewalk / auto-thinking / auto-prewalk** | Pre-execution exploration and automatic reasoning-effort selection | Loop policy; port as turn classifiers | MEDIUM |
| **Snapcompact** | History archived as bitmap frames | Compaction strategy; optional | MEDIUM |

**Deliberately excluded from this table:** compaction, handoff, goal state, branching, and export *do* have RPC commands (`compact`, `handoff`, `goal`, `branch`/`fork`, `export_html`). They are not missing — they were resolved in the master table on ownership grounds (the loop must own the transcript and continuation), which is a different problem from a missing capability.

**Roadmap implication:** the phase that demotes OMP must include an explicit inventory check against this table. "All OMP capabilities remain reachable" is false if only the RPC command list is verified.

### GSD Workflow Surface

gsd-omp is not a feature competitor; it is the workflow authority. Its surface must be preserved as first-class:

- **39 slash commands** across entry/status, project lifecycle, phase planning, execution/verification, quality audits, ship/git, and fast paths/admin, plus the `gsd_invoke` tool ([gsd-omp README](https://github.com/tchivs/gsd-omp)).
- **Protocol-v1 EoS contract**: profile `programmatic-cli`, interface points `command`, `dispatch`, `model`, `hooks`, `state`, `artifact`; `modelMode: passive`; `hookBus: host`; `stateIO: filesystem`; `dispatch` nested to depth 2 with background and the full subagent toolkit; `isolation: none` because native `task` isolation is the host primitive.
- **Managed skill/agent projection** with ownership hashes and refusal to overwrite locally modified files.
- **TDD invariants**: RED→GREEN→REFACTOR phases, test-first evidence, verification gates.

Fusion decisions:
- GSD commands remain slash commands (Hermes command registry) and `gsd_invoke` remains a tool.
- GSD's policy hooks register on Hermes' `pre_tool_call`; GSD prose is not the enforcement mechanism.
- GSD dispatch uses HALO `task`, not GSD's worktree scheduler.
- `modelMode: passive` can become active because HALO owns dispatch: add per-task `model`/`effort` fields and map GSD tiers through the one catalog. This is a product improvement, not a compatibility break — but it must be designed once, not layered on later.
- GSD's `/gsd-status` compaction/branch controls call the HALO session APIs; they do not implement their own.

## Memory Feature Surface (Users Will Judge This)

Hindsight exposes the primitives; HALO Desktop must expose the product. The standalone Hindsight WebUI is removed, so every function below is a HALO Desktop Memory page (plus CLI equivalents). Hindsight API facts are from [memories.mdx](https://github.com/vectorize-io/hindsight/blob/main/hindsight-docs/docs/developer/api/memories.mdx), [operations.mdx](https://github.com/vectorize-io/hindsight/blob/main/hindsight-docs/docs/developer/api/operations.mdx), [memory-banks.mdx](https://github.com/vectorize-io/hindsight/blob/main/hindsight-docs/docs/developer/api/memory-banks.mdx), and [observations.mdx](https://github.com/vectorize-io/hindsight/blob/main/hindsight-docs/docs/developer/observations.mdx).

| Feature | What the User Gets | Implementation Notes | Complexity | Depends on |
|---|---|---|---|---|
| **Browse** | Banks → memories → observations → mental models/knowledge pages; graph view; per-item provenance | List memory units with filters; stats per bank; render evidence quotes and proof counts; graph view inspired by Hermes' Star Map but backed by Hindsight links | MEDIUM | Hindsight list/stats APIs; Desktop page; bank scoping |
| **Search** | Semantic + keyword + graph + temporal recall, time filters, tag filters, result explanations | Use `recall` (RRF + reranker) for relevance; direct list filters for audit; show which strategy matched | MEDIUM | TEI reranker; bank config; recall budgets |
| **Prune / curate** | Edit, invalidate (reversible), delete, merge near-duplicates, scope consolidation, archive | Never auto-delete. Invalidate keeps history; observation refinement preserves evidence; consolidation can be scoped by tags | MEDIUM-HIGH | Memories curation API; operations queue; audit log |
| **Export / import** | Whole-bank archive export/import; profile export includes memory | Hindsight bank transfer runs as a background operation and returns a `download_url`; poll operations for completion | MEDIUM | Operations API; storage; profile export |
| **Health** | Operation queue status, failed/retry/cancel, DB size, consolidation backlog, TEI readiness, error rates | `pending/processing/failed/cancelled` states, retry endpoint, Prometheus metrics, admin CLI for repair; surface a single "memory health" score | MEDIUM | Operations API; monitoring; service supervisor |
| **Staleness / freshness** | Which observations are stale, which mental models need refresh, how much unconsolidated data exists | Hindsight treats observations as stale when newer memories are unconsolidated and verifies them during `reflect`; mental models have auto-refresh schedules; show "last consolidated" | MEDIUM | Consolidation state; mental-model refresh; UI |
| **Conflict detection** | Contradictory beliefs shown with both evidence sets; near-duplicate merge/keep decisions | Observations track evidence that supports, weakens, contradicts; near-duplicate reconciliation merges or keeps with full-text comparison; never silently overwrite | MEDIUM-HIGH | Observation history; consolidation config; UI |
| **Provider config (Memory Model)** | Defaults to main agent model; per-operation overrides (retain/consolidation/reflect); custom OpenAI-compatible providers; validation; restart with drain | Write through the one model catalog; credentials in the Hermes secret store; validate before save; drain operations before restart; never log keys | MEDIUM | Model catalog; secret store; Hindsight config API; supervisor |
| **Scheduler visibility** | L0/L1/L2/L3 lane occupancy, queue depth, wait p50/p95, permits, degraded states | Four-lane controller above Hindsight; Hindsight's internal semaphore is last-line defense only; expose the PROJECT.md p95 target and 200ms blocking rule | HIGH | Admission controller; metrics; UI; Hindsight client |
| **Scoping** | Per-project bank by default; profile/global bank; tags; directives; bank templates | One bank per project keeps leakage at zero; aliases for human names; directives shape recall without retraining | MEDIUM | Bank API; project identity; profile store |
| **Memory Defense** | Secret/PII scanning on retain, redact or block, audit | Opt-in per bank, 45 patterns; must be on by default for coding sessions that touch `.env` and credentials | LOW-MEDIUM | Hindsight config; audit log |
| **Mental models / knowledge pages** | Boot-time settled knowledge; wiki-like pages; markdown projection | Database read, no LLM call at boot; auto-refresh in L3; project selected pages to disk for the agent | MEDIUM | Mental-model API; scheduler; file projection |
| **Core memory block** | Bounded MEMORY.md/USER.md in the system prompt | Projection of a mental model; frozen snapshot for prefix cache; writes through `memory_edit` | MEDIUM | Prompt assembly; mental models; memory tool |

**Memory UX principles** (opinionated):

1. **Every belief must be traceable to evidence.** If the UI cannot show the source memories and quotes, do not show the belief.
2. **Nothing is destroyed without a second step.** Invalidate/archive first; delete requires explicit confirmation and an export offer.
3. **Staleness is a first-class state, not an error.** Show "based on 3 facts, last consolidated 6 days ago".
4. **The user configures one model and gets sane per-operation defaults.** Per-op overrides are advanced settings, not the first screen.
5. **Memory must never block the prompt.** The lane view is not a debug panel; it is the proof that the product fixed the pathology.

## Feature Dependencies

```
Unified HALO adapter
 ├── requires ──> One tool registry (one name per capability)
 ├── requires ──> pre_tool_call policy gate
 │                  ├── GSD TDD invariants
 │                  ├── approvals / allowlists
 │                  └── memory write policy
 ├── requires ──> stdio JSON-RPC client ──> OMP coding core
 │                  ├── read/write/edit (hashline)
 │                  ├── grep/glob
 │                  ├── bash + PTY + jobs
 │                  ├── lsp (14 ops) / dap (28 ops) / ast_edit / ast_grep
 │                  ├── task (subagents, isolation, registry)
 │                  └── eval kernels
 └── requires ──> L0–L3 admission controller ──> Hindsight HTTP
                                                  ├── Postgres + pgvector
                                                  ├── TEI embedder + reranker
                                                  └── memory tools + UI

Model catalog ──requires──> Hermes secret store
      ├── enhances ──> main loop turns
      ├── enhances ──> task per-agent routing
      ├── enhances ──> advisor model
      └── enhances ──> Memory Model (default = main model)

Session store (SQLite + FTS5)
      ├── requires ──> tree/branch schema (ported from OMP)
      ├── enables ──> resume, branch/fork, export
      ├── enables ──> compaction (loop-owned)
      ├── enables ──> session_search
      ├── enables ──> usage/cost accounting
      └── enables ──> agent:// child transcripts

Skills registry ──requires──> Skills Hub + Curator
      ├── enables ──> GSD TDD skills (projected twice, one record)
      ├── enables ──> slash commands
      └── enables ──> OMP skill:// discovery

Desktop shell ──requires──> plugin loader + capability registry
      ├── enables ──> Memory page
      ├── enables ──> Kanban page
      ├── enables ──> review pane
      └── enables ──> widgets / status bar / panes

Task (subagents) ──requires──> pi-iso isolation + agent registry
      ├── requires ──> policy bridge for child tool calls   [UNRESOLVED, highest risk]
      ├── enables ──> advisor (reviewer child)
      ├── enables ──> GSD execute-phase waves
      └── enables ──> review fan-out

Kanban ──requires──> dispatcher + profiles + session store
      ├── enables ──> goal-mode cards
      └── conflicts ──> in-session task fan-out if used for the same work

Workspace checkpoints ──requires──> shadow git store + write ledger
      └── conflicts ──> container backends (cannot snapshot host paths)

Hindsight ──requires──> 4-lane controller
      └── conflicts ──> any other memory backend (none survive)
```

### Dependency Notes

- **The policy gate depends on the registry being complete.** If a tool is reachable without being registered, the gate is bypassable. The registry must be the single source for model-visible tools, adapter dispatch, and UI tool pickers.
- **Subagents are the weakest link in the Core Value.** `task` child tools execute inside OMP. The policy bridge is a hard dependency for the "non-bypassable" claim; see the open question below.
- **Eval kernels are the second policy boundary.** OMP's `eval` can call agent tools and host-control APIs from inside a cell. If those re-entrant calls do not pass the adapter and gate, `execute_code` becomes a policy bypass. The eval sandbox must expose only gate-routed tools.
- **Compaction depends on the session schema.** Porting branch summaries and compaction entries before finalizing the SQLite schema avoids a second migration.
- **Memory depends on the scheduler, not the reverse.** Do not let Hindsight's internal semaphore become the product's admission policy.
- **Skills depend on the project root contract.** GSD's projection and OMP's `skill://` must agree on one path; a second skills directory is a dependency failure.
- **The Memory page depends on the Desktop plugin loader only for extension, not for existence.** It should be a built-in page so a disabled plugin cannot hide memory health.
- **Kanban and `task` conflict if used for the same work.** Kanban is durable/cross-process; `task` is in-session fan-out. The UI must not present them as interchangeable "spawn agents" buttons.
- **Container shell backends conflict with checkpoints and host LSP.** Show environment state; refuse rollback/diagnostics with an actionable message rather than silently degrading.

## MVP Definition

### Launch With (v1 — the fusion-validation slice)

The minimum that proves the concept is real: one loop, one gate, one memory, one session.

- [ ] **Unified adapter + tool registry + `pre_tool_call` gate** — without this there is no product, only a bundle
- [ ] **Coding core over RPC**: `read`, `write`, `edit` (hashline), `grep`, `glob`, `bash`, `lsp diagnostics` — the daily loop
- [ ] **One session store** (SQLite + FTS5) with resume, branch/fork, export, and loop-owned compaction
- [ ] **One model catalog + one secret store** with role routing and the Memory Model defaulting to the main model
- [ ] **Hindsight embedded** (Postgres+pgvector, CPU TEI) with `retain`/`recall`/`reflect`, the four-lane controller, and a Memory page covering browse, search, health, provider config, and lane metrics
- [ ] **Skills registry + GSD TDD skills + slash commands**, with policy-enforced RED→GREEN→REFACTOR
- [ ] **`task` subagents** with isolation and typed output — *and* the child-tool policy bridge
- [ ] **Desktop + CLI** driving the same loop and session store, with diff review, terminal, and approvals
- [ ] **Workspace checkpoints + `/rollback`** — the safety net that makes autonomy tolerable

### Add After Validation (v1.x)

- [ ] **Kanban board + dispatcher** — capability reachability and multi-profile orchestration
- [ ] **Messaging gateways** — at least Telegram/Discord/Slack, then the rest
- [ ] **Desktop plugin catalog + dashboard widgets** — extension ecosystem
- [ ] **Browser + desktop control** — Hermes toolset with provider plugins
- [ ] **DAP, AST edit/grep, eval kernels, GitHub path ops, security scan** — depth features that convert power users
- [ ] **Media tools** (image generation, TTS), voice/wake word, batch/trajectory
- [ ] **Goals, cron, ACP, OpenAI-compatible API server**
- [ ] **Memory export/import, conflict UI, staleness view, mental-model editor**
- [ ] **Advisor + TTSR ports** — if not completed in launch, they must be explicitly scheduled here, not forgotten
- [ ] **Profile export/import + one migration flow** from Hermes/OMP/other agents

### Future Consideration (v2+)

- [ ] **Collab live sessions** — high effort, niche until the core is trusted
- [ ] **Vibe mode / autoresearch / seance** — power-user workflows
- [ ] **Hindsight Cloud sync / team memory** — only after local quality
- [ ] **macOS/Linux releases** — portable code, but only after Windows is solid
- [ ] **Multi-user/RBAC server mode** — separate product decision

**Release-gate note:** PROJECT.md requires every capability of the four codebases to remain reachable. The MVP above is the *validation* slice, not the completion definition. The milestone cannot be declared complete until the v1.x reachability surfaces are shipped, and until the loop-resident OMP inventory is either ported or explicitly retired with user approval.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| Adapter + registry + policy gate | HIGH | HIGH | P1 |
| Read/write/edit (hashline) | HIGH | MEDIUM | P1 |
| grep/glob | HIGH | LOW | P1 |
| bash (Rust engine + env backends) | HIGH | HIGH | P1 |
| LSP diagnostics (+ post-write feedback) | HIGH | MEDIUM | P1 |
| Session store + resume/branch/export | HIGH | HIGH | P1 |
| Loop-owned compaction | HIGH | HIGH | P1 |
| Model catalog + secret store | HIGH | HIGH | P1 |
| Hindsight embedded + memory tools | HIGH | HIGH | P1 |
| Four-lane scheduler + lane metrics | HIGH | HIGH | P1 |
| Memory page: browse/search/health/provider | HIGH | MEDIUM | P1 |
| Skills registry + GSD TDD policy | HIGH | MEDIUM | P1 |
| `task` subagents + policy bridge | HIGH | HIGH | P1 |
| Approvals + workspace checkpoints | HIGH | MEDIUM | P1 |
| Desktop shell + CLI parity | HIGH | HIGH | P1 |
| Memory prune/export/conflict/staleness | HIGH | MEDIUM-HIGH | P2 |
| Kanban dispatcher + 14 tools | MEDIUM-HIGH | HIGH | P2 |
| Messaging gateways | MEDIUM-HIGH | HIGH | P2 |
| MCP runtime + tool search | HIGH | MEDIUM | P2 |
| Desktop/dashboard plugin platform | MEDIUM | MEDIUM | P2 |
| Browser + computer use | MEDIUM | HIGH | P2 |
| LSP full 14 ops / DAP 28 ops / AST | MEDIUM | MEDIUM | P2 |
| Web search chain + read URLs | HIGH | MEDIUM | P2 |
| GitHub / PR workflow | HIGH | LOW-MEDIUM | P2 |
| Goals / cron / ACP / API server | MEDIUM | MEDIUM | P2 |
| Curator + skill lifecycle | MEDIUM | MEDIUM | P2 |
| Profile export/import + importers | MEDIUM | LOW-MEDIUM | P2 |
| Advisor model | MEDIUM-HIGH | HIGH | P2 |
| TTSR | MEDIUM | HIGH | P2 |
| eval kernels | MEDIUM | HIGH | P2 |
| Voice / wake word | LOW-MEDIUM | MEDIUM | P3 |
| Batch / trajectories | LOW-MEDIUM | MEDIUM | P3 |
| Collab | LOW | HIGH | P3 |
| Vibe / autoresearch / seance | LOW | MEDIUM | P3 |
| Multi-user server | LOW (v1) | HIGH | P3 |

**Priority key:** P1 = launch blocker; P2 = required for the reachability gate or strong adoption driver; P3 = defer until the core is trusted.

## Competitor Feature Analysis

Grounded in current official docs: [Claude Code](https://code.claude.com/docs/en/overview), [Codex CLI](https://learn.chatgpt.com/docs/codex/cli), [Cursor](https://cursor.com/docs). Upstream OMP and Hermes are included because they are the closest feature baselines.

| Capability | Claude Code | Codex CLI | Cursor | HALO Approach |
|---|---|---|---|---|
| **Core loop** | Terminal, IDE, desktop, web, mobile; one engine across surfaces | Terminal + IDE + cloud; `codex exec` for CI | Editor-native agent with Plan Mode and review | One Python loop, Desktop + CLI + gateways |
| **Project context** | CLAUDE.md, AGENTS.md, auto memory | AGENTS.md | Rules, skills | OMP 8-format loader + Hermes context semantics |
| **Memory** | Auto memory + instructions | No durable cross-session memory documented | Rules/context, not durable memory | Hindsight knowledge graph + bounded core memory |
| **Code intelligence** | IDE integration; no 14-op LSP tool documented | No LSP tool documented | Full editor LSP (the editor *is* the LSP host) | 14 LSP ops + 28 DAP ops reachable by the agent |
| **Editing** | File edit tools with diff review | File edit tools with diff review | Editor-native edits | Hashline anchors + preview/accept AST |
| **Subagents** | Subagents + background agents | Subagents | Agent workflows | `task` batch + isolation + steering + typed output |
| **Skills/plugins** | Skills, hooks, MCP | Skills, plugins, MCP | Plugins, skills, MCP, rules | Hermes registry + Hub + Curator + Desktop plugin SDK |
| **MCP** | Yes | Yes | Yes | Hermes runtime with OAuth/health/tool search |
| **Approvals/sandbox** | Permission modes + hooks | `/permissions`, sandbox, writable roots | Editor permissions | Hermes approvals + one policy gate |
| **Git/PR** | Commits, branches, PRs, GitHub Actions | Review, cloud, local git checkpoints | Review, GitHub/GitLab/Azure/Bitbucket integrations | OMP git + `pr://` + review pane |
| **Automation** | Cloud/desktop scheduled tasks, remote control, channels | `codex exec`, cloud | Integrations (Slack/Linear) | Cron + gateways + Kanban + GSD autonomous |
| **Desktop** | Standalone app, multi-session, diff review | Cloud/IDE surfaces | The editor | Electron Desktop with plugin-contributed panes/widgets |
| **Memory stack ops** | N/A | N/A | N/A | Bundled Postgres+pgvector+TEI; no Docker |
| **Policy enforcement** | Hooks (shell-level) | Approvals/sandbox | Rules (advisory) | TDD invariants at the single tool gate |
| **Local/self-hosted models** | Third-party providers in CLI/IDE | OpenAI-centric sign-in and provider surface | Curated model catalog | 60+ providers incl. local OpenAI-compatible endpoints |
| **Multi-agent board** | Background agents/sessions | Cloud tasks | Agent sessions | Durable Kanban across profiles |

**Positioning read [INFERENCE]:** competitors are converging on the same table stakes (sessions, subagents, skills, MCP, approvals, desktop). The durable differentiators are (a) a policy chokepoint that can enforce a methodology, (b) memory that consolidates and explains itself, and (c) code intelligence the agent can actually operate. HALO is the only one of these products that can claim all three structurally, because it owns the loop and the coding core.

## Research Flags for Roadmap Phases

| Phase topic | Likely unknown | Why it needs phase research |
|---|---|---|
| Subagent and eval policy bridge | Whether OMP child and eval re-entrant tools can be routed through host policy | The Core Value is false for subagents and code execution if they cannot; verify RPC host-tool/hook semantics in the OMP source |
| Windows isolation | projfs/rcopy correctness and overhead for `task isolated: true` | Upstream pi-iso lists projfs, but Windows-first behavior is untested here |
| Model catalog handoff | Catalog schema/versioning between TS and Python | A handwritten second list will drift immediately |
| Compaction port | Which OMP strategies survive without owning the provider stream | Native replay/snapcompact depend on stream ownership |
| Hindsight at scale | Bank-per-project cardinality, TEI CPU throughput, reranker timeout defaults | Provenance: Hindsight defaults `HTTP_TIMEOUT=30.0` and `LLM_MAX_CONCURRENT=32` are hostile to CPU inference |
| Desktop plugin trust | Catalog review/SHA pinning and import allowlist enforcement | Plugins are unsandboxed with app authority |
| Browser consolidation | Cost of porting OMP's Chrome relay/stealth into Hermes' browser providers | If Hermes' providers cannot cover a required workflow, the decision reverses |
| Memory migration | Existing Hermes MEMORY.md/USER.md and OMP memory artifacts | Users must not lose memory on first launch |

## Sources

**Primary repositories (fetched 2026-10-23):**

- OMP — https://github.com/can1357/oh-my-pi (README: 60+ providers, 31 tools, 14 LSP ops, 28 DAP ops, shell/AST/RPC claims)
- OMP RPC — https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md
- OMP edit — https://github.com/can1357/oh-my-pi/blob/main/docs/tools/edit.md
- OMP task — https://github.com/can1357/oh-my-pi/blob/main/docs/tools/task.md
- OMP LSP — https://github.com/can1357/oh-my-pi/blob/main/docs/tools/lsp.md
- OMP DAP — https://github.com/can1357/oh-my-pi/blob/main/docs/tools/debug.md
- OMP memory — https://github.com/can1357/oh-my-pi/blob/main/docs/memory.md
- OMP skills — https://github.com/can1357/oh-my-pi/blob/main/docs/skills.md
- OMP sessions — https://github.com/can1357/oh-my-pi/blob/main/docs/session.md
- OMP compaction — https://github.com/can1357/oh-my-pi/blob/main/docs/compaction.md
- OMP todo — https://github.com/can1357/oh-my-pi/blob/main/docs/tools/todo.md
- Hermes — https://github.com/NousResearch/hermes-agent (README: gateways, learning loop, delegation, install surfaces)
- Hermes tools reference — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/tools-reference.md
- Hermes Kanban — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/kanban.md
- Hermes memory — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/memory.md
- Hermes skills — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/skills.md
- Hermes Curator — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/curator.md
- Hermes hooks — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/hooks.md
- Hermes delegation — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/delegation.md
- Hermes LSP — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/lsp.md
- Hermes tool search — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/tool-search.md
- Hermes checkpoints — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/checkpoints-and-rollback.md
- Hermes goals — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/goals.md
- Hermes Desktop — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/desktop.md
- Hermes Desktop Plugin SDK — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/desktop-plugin-sdk.md
- Hermes dashboard plugins — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/extending-the-dashboard.md
- Hermes feature overview — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/overview.md
- Hindsight — https://github.com/vectorize-io/hindsight (README: retain/recall/reflect, observations, mental models, banks, Memory Defense, export/import, ops)
- Hindsight observations — https://github.com/vectorize-io/hindsight/blob/main/hindsight-docs/docs/developer/observations.mdx
- Hindsight memories API — https://github.com/vectorize-io/hindsight/blob/main/hindsight-docs/docs/developer/api/memories.mdx
- Hindsight operations API — https://github.com/vectorize-io/hindsight/blob/main/hindsight-docs/docs/developer/api/operations.mdx
- Hindsight bank config — https://github.com/vectorize-io/hindsight/blob/main/hindsight-docs/docs/developer/api/memory-banks.mdx
- gsd-omp — https://github.com/tchivs/gsd-omp (39 commands, EoS contract, modelMode passive, isolation)

**Competitor documentation (fetched 2026-10-23):**

- Claude Code overview — https://code.claude.com/docs/en/overview
- Codex CLI — https://learn.chatgpt.com/docs/codex/cli
- Cursor docs — https://cursor.com/docs

**Confidence notes:**

- Upstream capability inventories: **HIGH** — primary repositories, fetched live.
- Conflict resolutions: **MEDIUM** — informed by source constraints, but they are product decisions whose cost estimates need phase-level validation.
- Market expectations: **MEDIUM** — competitor docs describe features, not user churn or willingness to pay.
- Hindsight operational behavior under CPU-only TEI: **MEDIUM-LOW** — docs state defaults and configuration, but the PROJECT.md pathology is the authoritative performance warning.

## Open Questions

1. **Can every OMP child/re-entrant tool call cross the HALO gate?** This covers both `task` subagent tools and `eval` cells that call tools. It is binary: if not, they are a documented policy exception and the Core Value statement must be amended. Verify in OMP's RPC host-tool and extension-hook source before the subagent/eval phases.
2. **Which OMP loop features are truly non-portable?** Advisor and TTSR are the expensive ones. Native compaction replay may be impossible; decide whether that is acceptable or whether the loop needs a provider-stream abstraction.
3. **How does Python consume the model catalog without a second list?** Choose a generated artifact with a version and a startup compatibility check.
4. **What is the Windows isolation backend for `task isolated: true`?** projfs is listed upstream but must be validated for correctness and speed; otherwise the feature is Linux/macOS-only in practice.
5. **How many Hindsight banks?** One per project is the stated default; large monorepos and multi-root workspaces need a rule.
6. **Does the Hermes browser stack cover OMP's relay/stealth workflows?** If not, the browser decision reverses or requires a port.
7. **How are pre-existing user memories migrated?** Hermes MEMORY.md/USER.md and OMP local memory artifacts need a one-time import into Hindsight with provenance, or first launch silently forgets.
8. **What does "reachable" mean for the release gate?** CLI-reachable, Desktop-reachable, or both? Define before claiming the milestone.
9. **What is the minimum viable trust model for Desktop plugins?** Human-reviewed catalog plus SHA pinning is upstream's answer; HALO must not loosen it for convenience.

---
*Feature research for: fused coding-agent Desktop+CLI with unified tool policy and embedded knowledge-graph memory*
*Researched: 2026-10-23*

