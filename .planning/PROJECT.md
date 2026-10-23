# HALO

## What This Is

HALO is a single fused agent product assembled from four MIT-licensed codebases — oh-my-pi (coding harness: LSP/DAP/AST/Rust shell), Hermes Agent (agent runtime, plugins, Kanban, skills), Hindsight (knowledge-graph memory), and gsd-omp (TDD workflow policy) — vendored into one monorepo, rebranded end to end, and cut off from upstream. It ships as a Hermes-Desktop-derived Electron app plus a CLI, and presents one agent loop whose every tool call passes through one policy gate: Hermes-native capabilities in Python, coding capabilities over stdio RPC into the fused TS/Rust core. Durable memory is embedded Hindsight running against a bundled native PostgreSQL+pgvector instance, with CPU-only llama.cpp `llama-server` sidecars for embedding and reranking (no Docker, no GPU requirement).

## Core Value

One non-bypassable tool path: every LLM tool decision reaches exactly one backend through a single adapter and a single policy gate, so no policy (TDD enforcement, safety, memory routing) can be skipped by choosing the other runtime.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] HALO ships two first-class surfaces: a Desktop app and a CLI, both driving the same unified agent loop and the same session store
- [ ] Every capability of the four fused codebases remains reachable in HALO: all oh-my-pi coding operations (files, shell, LSP, DAP, AST, providers, subagents) and all Hermes capabilities (~100 tools, plugin hooks, Kanban board, Skills Store, Desktop pages/widgets)
- [ ] All tool dispatch flows through the HALO adapter, which applies the unified tool registry precedence rules and a single `pre_tool_call` policy gate before any backend executes
- [ ] The GSD TDD workflow (RED → GREEN → REFACTOR) is installed as first-class skills in both the Hermes skills registry and the OMP skill directory, and its phase invariants are enforced by policy hooks that the coding core cannot bypass
- [ ] Hindsight is built in: bundled PostgreSQL+pgvector, CPU llama.cpp `llama-server` embedder and reranker as supervised child processes exposing HTTP, no Docker requirement, no GPU requirement
- [ ] Memory Model defaults to the main agent model, with a Settings → Models → Memory Model page supporting registered providers and custom OpenAI-compatible providers, per-operation overrides (retain/consolidation/reflect), validation on save, and graceful daemon restart with drain
- [ ] A four-lane admission controller (L0 prompt, L1 recall/reflect, L2 retain, L3 background) prevents memory traffic from queueing ahead of the user's prompt, with lane metrics visible in the UI
- [ ] A HALO brand replaces upstream identity at every level: binary/CLI name, packages, config directories, environment variables, plugin ids, database schema names, and the full RPC wire surface (all 185 commands and 18 frame categories), versioned by a generated contract with a hash-checked handshake and a one-minor alias window, plus migration shims for pre-existing Hermes/OMP user configs
- [ ] The standalone Hindsight WebUI is removed; its functions live in a HALO Desktop memory page (browse, search, prune, export, health, runtime controls, provider config)
- [ ] The fused product builds and runs on Windows from one repository with one documented build command

### Out of Scope

- Reimplementing oh-my-pi's coding tools in Python — the coding core is consumed as a backend, never duplicated
- Preserving oh-my-pi's own agent loop as an autonomous decision-maker — it is demoted to a tool backend behind the unified loop
- Tracking upstream repositories after import — no submodules, no auto-update, no weekly contract tests against upstream `main`
- Preserving upstream git history — imports are squashed with a provenance manifest instead
- A Docker-based memory stack — Postgres and the inference sidecars are bundled native processes
- Bundling HuggingFace text-embeddings-inference on Windows — TEI publishes no Windows binaries, C API tooling or CI; CPU inference is served by llama.cpp `llama-server` instead
- In-process FFI linking of the Rust/TS core into Python — the stdio RPC boundary stays
- macOS and Linux releases in v1 — architecture stays portable, but only Windows is a supported target
- Shipping the standalone Hindsight WebUI in any form

## Context

**Source systems (all MIT, all re-imported once and rebranded):**

| Upstream | What it contributes | Language |
|---|---|---|
| `can1357/oh-my-pi` | Coding harness: 60+ providers, 31 built-in tools, 14 LSP ops, 28 DAP ops, Rust shell, 185 RPC commands / 18 async frame categories over `<<brand>> --mode rpc` | TypeScript + Rust |
| `NousResearch/hermes-agent` | Agent loop, session manager with FTS5 search, MemoryProvider interface, plugin system + lifecycle hooks, skills manager/Curator, Kanban dispatcher, gateways, Desktop plugin loader | Python 3.14 + Electron |
| `vectorize-io/hindsight` | Knowledge-graph memory, entity resolution, multi-strategy retrieval, per-operation LLM config, pluggable embedder/reranker providers | Python |
| `tchivs/gsd-omp` | Protocol-v1 GSD integration for OMP: ExtensionAPI, programmatic slash commands, task isolation, managed skill projection | TypeScript |

**Why this fusion instead of integration:** the four systems solve adjacent problems with incompatible abstractions (Rust tool execution vs Python agent loop vs HTTP memory service vs TypeScript extension host). Rebranding and fusing them produces one product with one session, one memory, and one policy surface; integrating them as separate products preserves two of everything.

**Two boundaries that survive fusion:**
- Python agent core ↔ TS/Rust coding core: JSON-over-stdio RPC (`--mode rpc`). Retained for crash isolation, frame logging, and because the Rust core assumes real child processes for shell/LSP/DAP.
- Agent ↔ memory: HTTP to the embedded Hindsight API, with the four-lane scheduler in front of it.

**Known pathologies this project must not reproduce:**
- Interactive auto-recall with a 10s deadline queueing behind deadline-free consolidation on a shared semaphore (observed p50 wait 11.59s against 1.12s of work across 44,342 recalls/24h). Raising the deadline made it worse. Hence the four-lane controller; Hindsight's internal semaphore stays only as a last line of defense.
- Hindsight's documented TEI defaults are tuned for GPU/beefy hosts (`HTTP_TIMEOUT=30.0`, `LLM_MAX_CONCURRENT=32`) and fail under CPU reranking and local model endpoints. TEI itself has no Windows distribution — zero release assets, no Windows CI, no documented local-install path — so HALO serves CPU inference through llama.cpp `llama-server` and pins every concurrency/timeout knob low rather than inheriting upstream defaults.
- OMP's `agent_end` must be gated on `isTerminal !== false`, or a subagent end is mistaken for run completion.
- Mirrored context that is not surfaced (`context_message_added`) causes the visible transcript to diverge from what the model received.

## Constraints

- **License**: all four upstreams are MIT (verified: oh-my-pi, hermes-agent, hindsight, gsd-omp). Rebranding and redistribution are permitted, but each vendored subtree must retain its original copyright notice and permission text, plus a provenance record (repo, commit SHA, import date).
- **Tech stack**: Rust + Bun/TypeScript + Python for the core, Electron for Desktop, PostgreSQL+pgvector bundled natively, llama.cpp CPU inference sidecars bundled. No Docker. Build orchestration is a single documented Windows command.
- **Platform**: Windows-first (win32 x64). Cross-platform code paths must not be consciously broken, but only Windows is tested and supported.
- **Hardware**: CPU-only inference for embedding and reranking. Hardware-profile heuristic (Low ≤4 vCPU/8GB, Standard 8 vCPU/16GB, High ≥16 vCPU/32GB) drives llama.cpp context/batch/thread flags and the scheduler's per-provider ceilings.
- **Upstream cutoff**: after import there is no upstream sync. Provider additions, security fixes, and RPC growth that land upstream will not reach HALO automatically; the provenance manifest must make locating such changes tractable.
- **Single process boundary**: tool calls that cross into the coding core are RPC frames, not in-process calls. Per-call overhead budget: < 150ms adapter-added per tool round-trip.
- **Performance**: scheduler permit acquire < 5ms p99 uncontended; L0 p95 first-token latency ≤ 2× baseline under synthetic memory load; no consolidation can block an L0/L1 waiter > 200ms.
- **Security**: model credentials for Memory Model providers live in the Hermes secret store, never in `.env`/`config.json`, and must never be logged by the memory plugin.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Vendor all four codebases into one monorepo, one build | "Fused, one product" is literally true; one version, one lockfile story, no cross-repo contract drift | — Pending |
| Squash-import upstreams with a provenance manifest, discard their git history | History that describes upstream doesn't describe HALO; provenance manifest preserves the auditability that matters | — Pending |
| Rebrand surface *and* internals (env vars, config dirs, package names, plugin ids, DB schemas, all 185 RPC command names and 18 frame categories) with migration shims | Avoids permanently leaking upstream vocabulary into user-visible config and logs; shims cover existing users. Full wire rename is the riskiest mechanical surface in the program — mitigated by generating every constant from one contract, a hash-checked handshake, and a one-minor alias window | — Pending |
| Product name HALO (Bond remains only the workspace folder name) | User's chosen brand | — Pending |
| One unified agent loop; OMP demoted to a tool backend | Structurally delivers the non-bypassable tool path; eliminates transcript divergence and duplicate compaction policies that two loops cause | — Pending |
| Keep stdio JSON-RPC between Python core and the TS/Rust coding core | Crash isolation, frame-replay testability, matches Rust core's process assumptions | — Pending |
| Windows-first, bundled native PostgreSQL+pgvector, no Docker | "Desktop app just works" on the target workstation; Docker Desktop is not an acceptable dependency | — Pending |
| Hindsight memory model inherits the main agent model by default | Avoids the stale `llm_provider: openai` default shipping a broken memory subsystem | — Pending |
| Four-lane admission controller owns cross-system arbitration; Hindsight's semaphore is last-line defense | Cross-system preemption is impossible from inside either system | — Pending |
| TDD invariants enforced in `pre_tool_call` policy, not in skill prose | Policy at the single chokepoint cannot be bypassed by the coding core choosing a different path | — Pending |
| llama.cpp `llama-server` replaces HuggingFace TEI for CPU embedding/reranking, and PROJECT assumptions were amended to match | TEI publishes no Windows binaries, has no Windows CI, and documents no Windows install path — bundling it would mean owning an unproven cross-compile. llama.cpp ships real Windows binaries and keeps the HTTP-sidecar isolation the scheduler depends on (in-process fastembed would break it) | — Pending |
| Hindsight auto-recall never blocks the first chat turn on inference-sidecar readiness | Boot latency beats correctness here; degrade to the local embedder with a visible warning | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-23 after research (TEI→llama.cpp amendment, RPC wire-rename scope)*
