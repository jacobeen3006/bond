# Phase 8: Memory Runtime & Bundling — Research

**Researched:** 2026-10-25
**Domain:** Windows-native bundled memory service: PostgreSQL+pgvector, supervised CPU llama.cpp sidecars, embedded Hindsight (no Docker, no GPU)
**Confidence:** HIGH (all pins read from registries/release APIs this session; Hindsight read from the vendored source this session)

> No CONTEXT.md exists for this phase. Locked decisions come from `AGENTS.md` (DEC-01…DEC-11 + the Technology Stack research) and `REQUIREMENTS.md` (MEM-01…MEM-06). This research does not re-litigate them; it documents how to implement them and flags the gaps where a locked decision names a mechanism the vendored code does not provide.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MEM-01 | First launch initializes a bundled PostgreSQL+pgvector cluster without Docker | §Architecture Patterns (zonky layout, initdb rules, health-check gap); §Pitfall 1 (no `pg_isready`); §Code Examples (initdb/start/stop) |
| MEM-02 | pgvector compiled for Windows in CI, published as SHA-256-verified artifact; version mismatch fails startup with actionable message | §Standard Stack (Makefile.win layout, `installcheck`); §Code Examples (build + version check); §Pitfall 2 (ABI/PGROOT) |
| MEM-03 | CPU llama.cpp `llama-server` embedder + reranker sidecars start, health-check, restart per hardware profile | §Standard Stack (flags, endpoints); §Architecture Patterns (supervision contract); §Code Examples (sidecar argv) |
| MEM-04 | Hindsight API + worker run embedded with per-operation LLM configuration; degraded-mode fallback is a recorded decision | §Architecture Patterns (in-process worker, per-op env vars, degraded behaviors); §Pitfall 3 (driver is asyncpg, not psycopg) |
| MEM-06 | Retain idempotent via `operation_id` with transactional boundaries and a startup repair job | §Architecture Patterns (operation_id replay, `recover_own_tasks`, `async_operations` queue); §Open Questions (2s coalescing window is HALO-level, not Hindsight) |
</phase_requirements>

## Summary

Phase 8 boots a self-contained memory service on a Windows workstation with no Docker and no GPU. Three supervised children run under one TS supervisor: a bundled PostgreSQL 18.6 + pgvector 0.8.7 cluster on loopback, two CPU `llama-server` sidecars (embedder + reranker) on ephemeral loopback ports, and the vendored Hindsight memory engine. The single most important finding is that **Hindsight's "embedded" mode is an in-process `WorkerPoller` task started inside the API's FastAPI lifespan by default** (`DEFAULT_WORKER_ENABLED = True`), with the work queue as a PostgreSQL table (`async_operations`, claimed with `FOR UPDATE SKIP LOCKED`) — there is no Redis and no separate worker process to supervise. That collapses the supervision surface to: one `postgres.exe`, two `llama-server.exe`, and one `hindsight-api` process (which already contains the worker).

The second load-bearing finding is a **wire-format compatibility matrix** between Hindsight's provider clients and llama-server's endpoints. Hindsight's `tei` embedding and reranker providers are **not** compatible with a bare `llama-server` (the embedding client POSTs to `/embed` with `{"inputs":…}` and the reranker client probes `GET /info` at startup — neither route exists on llama-server). The `litellm`/`openai` providers **are** compatible: they POST to `/v1/embeddings` (OpenAI `input` format) and `/v1/rerank` (Cohere/Jina `documents` format), both of which llama-server serves. This determines the exact env-var wiring in §Architecture Patterns.

The third finding is a **gap in the locked supervision contract**: `AGENTS.md` says to wait for `pg_isready`, but the zonky 18.6.0 bundle ships only three executables (`initdb.exe`, `pg_ctl.exe`, `postgres.exe`) — no `pg_isready.exe`, no `psql.exe`, no `pg_dump.exe`. The supervisor must health-check PostgreSQL with a TCP connect + a real client connection (scram-sha-256) instead. This is a recorded deviation, not a blocker.

**Primary recommendation:** Supervise `postgres.exe` + two `llama-server.exe` + one `hindsight-api` (in-process worker) as four direct children; wire Hindsight to llama-server via the `litellm`/`openai` providers (not `tei`); health-check PG with a client connection (no `pg_isready`); build pgvector in CI with `nmake /F Makefile.win` against the bundled PG and gate on `installcheck`; implement the 2s retain-coalescing window in the HALO shim (Hindsight's own coalescing is claim-time folding, not a time window).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| PostgreSQL cluster lifecycle (initdb/start/stop) | API / Backend (TS supervisor) | — | `postgres.exe` is a supervised child; the supervisor owns the PID and the data dir |
| pgvector extension availability | Database / Storage | API / Backend (startup check) | Built in CI; the supervisor verifies `vector.control` version before first start |
| Embedding inference | API / Backend (llama-server sidecar) | — | CPU GGUF model on an ephemeral loopback port; no client-side inference |
| Reranking inference | API / Backend (llama-server sidecar) | — | Same as embedding; separate process for lane isolation |
| Memory engine (retain/recall/reflect/consolidation) | API / Backend (Hindsight, in-process worker) | Database / Storage (queue) | API + worker are one process by default; the queue is a PG table |
| Retain idempotency + startup repair | API / Backend (Hindsight) | — | `operation_id` parent-PK replay; `WorkerPoller.recover_own_tasks` on every poller start |
| 2s retain-coalescing window | API / Backend (HALO shim) | — | Not a Hindsight feature (see §Open Questions); HALO debounces per `document_id` |
| Sidecar supervision (state machine, restart, ports) | API / Backend (TS supervisor) | — | Locked contract in AGENTS.md §4; the four-lane controller reads `ready`/`degraded` |
| PG credential storage | API / Backend (Hermes secret store) | — | Random password generated at first launch, stored in `auth.json` under `HERMES_HOME` |

## Standard Stack

### Core (bundled, not installed at runtime)
| Component | Version | Purpose | Why Standard |
|---|---|---|---|
| PostgreSQL (zonky `embedded-postgres-binaries-windows-amd64`) | 18.6.0 | Bundled DB server on loopback | Verified present on Maven Central (2026-08-26); SHA-256 `b7ef2d03588e0439f0d0a2250f43905f7464f1e96ace47703ceaf79094198150` verified this session `[VERIFIED: Maven Central]` |
| pgvector | 0.8.7 | Vector extension, built in CI with MSVC | `EXTVERSION = 0.8.7` in `Makefile.win` `[VERIFIED: pgvector Makefile.win]`; PostgreSQL-License, same terms as PG |
| llama.cpp `llama-server` | b11669 | CPU embedding + reranking sidecars | `llama-b11669-bin-win-cpu-x64.zip` (19,537,886 bytes) verified present in the b11669 release `[VERIFIED: GitHub releases API]` |
| Hindsight (vendored) | `vendor/hindsight` | Memory engine (API + in-process worker) | Already imported with provenance; `requires-python >=3.11`, we ship 3.14.9 `[VERIFIED: vendored pyproject.toml]` |
| Python (python-build-standalone) | 3.14.9 | Runs Hindsight | Locked DEC; satisfies Hindsight's `>=3.11` |

### Supporting
| Component | Version | Purpose | When to Use |
|---|---|---|---|
| `asyncpg` | (Hindsight dep) | Hindsight's runtime DB driver | Always — this is the driver, not `psycopg` (see §Pitfall 3) |
| `psycopg2-binary` | (Hindsight dep) | Alembic migrations only | Migration path only |
| `winloop` | (Hindsight dep, win32 extra) | ProactorEventLoop on Windows | Always on Windows — Hindsight installs it in `main.py` |
| `uvicorn` + `fastapi` | (Hindsight deps) | Hindsight HTTP server | Always |
| GGUF `bge-small-en-v1.5` | `ggml-org/bge-small-en-v1.5-Q8_0-GGUF` | Embedder model (384-d) | Default embedder |
| GGUF `ms-marco-MiniLM-L-6-v2` | `cstr/ms-marco-MiniLM-L-6-v2-GGUF` | Reranker model (22 M cross-encoder) | Default reranker |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|---|---|---|
| llama.cpp `llama-server` (MEM-03) | TEI v1.9.4 built from source (AGENTS.md primary) | TEI is the AGENTS.md primary, but **MEM-03 explicitly names llama.cpp `llama-server`** for this phase. TEI has no Windows binaries and no Windows CI (AGENTS.md rates it LOW). If the phase scope widens to TEI, the Hindsight `tei` provider becomes compatible (TEI serves `/embed` and `/info`); for llama-server, use the `litellm`/`openai` providers (see §Architecture Patterns) |
| `litellm`/`openai` Hindsight providers | `tei` Hindsight provider | `tei` is incompatible with bare llama-server (no `/embed`, no `/info`); `litellm`/`openai` match llama-server's wire formats |
| Client-connection PG health check | `pg_isready` (AGENTS.md) | `pg_isready.exe` is not in the zonky bundle; a real client connection also verifies scram auth, which `pg_isready` does not |

**Installation:** Phase 8 installs **no new external packages at runtime**. It bundles pre-existing binaries (zonky PG, llama.cpp, a CI-built pgvector) and runs the already-vendored Hindsight. The only "install" is the CI build of pgvector and the first-run model download (SHA-256-pinned).

**Version verification (this session):**
- zonky 18.6.0: `embedded-postgres-binaries-windows-amd64-18.6.0.jar` = 25,366,735 bytes; SHA-256 matches the published `.sha256` (`b7ef2d…98150`) `[VERIFIED: Maven Central]`
- llama.cpp b11669: `llama-b11669-bin-win-cpu-x64.zip` = 19,537,886 bytes, present in the release `[VERIFIED: GitHub releases API]`
- pgvector 0.8.7: `EXTVERSION = 0.8.7` in `Makefile.win` `[VERIFIED: pgvector Makefile.win]`
- Hindsight: `requires-python = ">=3.11"` `[VERIFIED: vendored pyproject.toml]`

## Package Legitimacy Audit

> Phase 8 installs **no new external packages** — it bundles pre-existing, already-provenanced binaries and runs the already-vendored Hindsight. The audit below covers the bundled artifacts' provenance (the SHA-256 gate is the legitimacy control here, per MEM-02).

| Artifact | Source | Age | Integrity | Source Repo | Verdict | Disposition |
|---|---|---|---|---|---|---|
| zonky PG 18.6.0 binaries | Maven Central | 2026-08-26 | SHA-256 verified this session | github.com/zonkyio/embedded-postgres-binaries | OK | Approved (bundle) |
| llama.cpp b11669 win-cpu zip | GitHub releases | b11669 | Size verified; pin SHA-256 in manifest | github.com/ggml-org/llama.cpp | OK | Approved (bundle) |
| pgvector 0.8.7 (CI build) | Built in CI from pinned source | — | `installcheck` (pg_regress) gate + SHA-256 of the artifact | github.com/pgvector/pgvector | OK | Approved (CI-built) |
| Hindsight (vendored) | `vendor/hindsight` | imported | Provenance manifest (Phase 1) | — | OK | Approved (vendored) |
| GGUF bge-small-en-v1.5 | `ggml-org/bge-small-en-v1.5-Q8_0-GGUF` | — | SHA-256 manifest at first-run download | huggingface.co/ggml-org | OK | Approved (model) |
| GGUF ms-marco-MiniLM-L-6-v2 | `cstr/ms-marco-MiniLM-L-6-v2-GGUF` | — | SHA-256 manifest at first-run download | huggingface.co/cstr | OK | Approved (model) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*No new packages are discovered via WebSearch and installed in this phase; the bundled artifacts are pinned by SHA-256 (the MEM-02 gate). The two GGUF model repos are the only externally-sourced items and are gated by a first-run SHA-256 manifest per AGENTS.md (no runtime download from huggingface.co without a digest pin).*

## Architecture Patterns

### System Architecture Diagram

```
                        ┌─────────────────────────────────────────────┐
                        │        TS Supervisor (HALO daemon)          │
                        │  state machine: stopped→starting→ready→     │
                        │  degraded→restarting→failed                 │
                        │  ports: 55432 / 58080 / 58081 (ephemeral  │
                        │  on EADDRINUSE, resolved port written to   │
                        │  runtime config read by all children)      │
                        └──┬──────────┬──────────┬──────────┬────────┘
                           │ spawn    │ spawn    │ spawn    │ spawn
                           ▼          ▼          ▼          ▼
                    ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────┐
                    │postgres.exe│ │llama-server│ │llama-server│ │  hindsight-api   │
                    │  (PG 18.6) │ │  embedder  │ │  reranker  │ │ (API + in-proc  │
                    │ 127.0.0.1: │ │ 127.0.0.1: │ │ 127.0.0.1: │ │  WorkerPoller)  │
                    │    55432   │ │    58080   │ │    58081   │ │ 127.0.0.1:58082 │
                    └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └────────┬─────────┘
                          │              │              │                 │
        scram-sha-256     │   /v1/embeddings  /v1/rerank                 │
        (client conn)     │              │              │                 │
                          ▼              ▼              ▼                 ▼
                    ┌────────────────────────────────────────────────────────┐
                    │  PostgreSQL: async_operations (queue, FOR UPDATE      │
                    │  SKIP LOCKED), vector (pgvector), memories, banks    │
                    └────────────────────────────────────────────────────────┘
                          ▲
                          │ Hindsight connects over TCP (asyncpg)
                          │ HINDSIGHT_API_DATABASE_URL=
                          │ postgresql://halo:<pw>@127.0.0.1:55432/hindsight
```

Data flow for a retain: HALO shim → (2s coalesce window) → Hindsight `retain` (async, `operation_id`) → `async_operations` row → in-process `WorkerPoller` claims it (`FOR UPDATE SKIP LOCKED`) → embedder sidecar (`/v1/embeddings`) → vector stored in `vector` → `operation_id` marked complete (parent-PK replay on retry).

### Recommended Project Structure
```
packages/sidecars/            # Phase 4 contracts; Phase 8 implements
├── src/supervisor/
│   ├── postgres.ts          # initdb/start/stop, client-conn health check
│   ├── llama.ts             # embedder + reranker sidecars, /health poll
│   ├── hindsight.ts         # spawn hindsight-api, per-op env wiring
│   ├── ports.ts             # ephemeral-port discovery + runtime config
│   └── state.ts             # stopped→starting→ready→degraded→restarting→failed
├── src/pgvector/
│   └── version-check.ts     # vector.control vs expected 0.8.7, actionable failure
└── tools/
    ├── build-pgvector.ps1   # CI: nmake /F Makefile.win + installcheck
    └── models/manifest.json # SHA-256 pins for the two GGUF models
```

### Pattern 1: In-process Hindsight worker (the "embedded" mode)
**What:** Hindsight's API and worker are one process by default. The `WorkerPoller` is an `asyncio` task started inside the FastAPI lifespan, not a separate supervised child.
**When to use:** Always — this is the default and the only mode that matches "API and worker run embedded" (MEM-04).
**Evidence (vendored source, read this session):**
- `DEFAULT_WORKER_ENABLED = True  # API runs worker by default (standalone mode)` — `hindsight-api-slim/hindsight_api/config.py:2039`
- Worker start in lifespan — `hindsight-api-slim/hindsight_api/api/http.py:4316-4343`: `if config.worker_enabled and memory._backend.supports_worker_poller: poller = WorkerPoller(...); poller_task = asyncio.create_task(poller.run())`
- Queue is a PG table, no Redis — `async_operations`, claimed with `FOR UPDATE SKIP LOCKED`
- Entry point — `hindsight-api-slim/pyproject.toml:172-176`: `hindsight-api = "hindsight_api.main:main"`; `main()` builds `MemoryEngine(run_migrations=config.run_migrations_on_startup)` then `uvicorn.run(...)` (Windows: `winloop.install()`)

**Implication for the supervisor:** supervise **one** `hindsight-api` process (it contains the worker). Do not spawn a separate `hindsight-worker`. The `hindsight-embed` package (a daemon client that spawns a detached `hindsight-api` child) is the **wrong shape** for HALO — do not use it.

### Pattern 2: Per-operation LLM configuration (env-var only)
**What:** Hindsight configures LLM providers per operation via env vars; there is no per-operation runtime API. The global knobs apply to all operations; per-operation knobs override.
**Env vars (read this session, `config.py`):**
- Global: `HINDSIGHT_API_LLM_PROVIDER`, `HINDSIGHT_API_LLM_MODEL`, `HINDSIGHT_API_LLM_BASE_URL`, `HINDSIGHT_API_LLM_API_KEY`, `HINDSIGHT_API_LLM_MAX_CONCURRENT` (default **32** → set to **4** per the locked decision)
- Per-operation: `HINDSIGHT_API_{RETAIN,REFLECT,CONSOLIDATION,MENTAL_MODEL_REFRESH}_LLM_{PROVIDER,MODEL,BASE_URL,API_KEY}`
- Valid `HINDSIGHT_API_LLM_PROVIDER` values (read this session, `llm_wrapper.py:982-1015`): `lmstudio`, `openai`, `ollama`, `llamacpp`, `none`, … — `lmstudio` and `openai` both route to `OpenAICompatibleLLM`, so either works for llama-server with `HINDSIGHT_API_LLM_BASE_URL=http://127.0.0.1:<port>/v1`
- Reranker: `HINDSIGHT_API_RERANKER_PROVIDER` (valid: `local`, `flashrank`, `onnx`, `jina-mlx`, `rrf`, `tei`, `cohere`, `litellm`), `HINDSIGHT_API_RERANKER_LITELLM_API_BASE`, `HINDSIGHT_API_RERANKER_LITELLM_MODEL`, `HINDSIGHT_API_RERANKER_LITELLM_TIMEOUT` (default **60.0** → set to **45** per the locked decision)
- Embeddings: `HINDSIGHT_API_EMBEDDINGS_PROVIDER` (default `local`), `HINDSIGHT_API_EMBEDDINGS_LITELLM_API_BASE`, `HINDSIGHT_API_EMBEDDINGS_LITELLM_MODEL`, `HINDSIGHT_API_EMBEDDINGS_LITELLM_API_KEY`, `HINDSIGHT_API_EMBEDDINGS_LITELLM_DIMENSIONS` (setting it **skips the startup probe**, so the API boots while the sidecar is still warming)

### Pattern 3: Hindsight ↔ llama-server wire compatibility (the load-bearing matrix)
**What:** Hindsight's provider clients must match llama-server's request/response formats. Read this session from both the vendored Hindsight source and the llama.cpp `server.cpp` route table + README.

| Hindsight provider | Endpoint it calls | Request format | llama-server compatible? | Why |
|---|---|---|---|---|
| `tei` embeddings | `POST {base}/embed` | `{"inputs": […]}` | **NO** | llama-server has no `/embed` route (routes: `/embedding`, `/embeddings`, `/v1/embeddings`); legacy endpoints expect `input`, not `inputs` |
| `litellm`/`openai` embeddings | `POST {base}/v1/embeddings` | `{"model":…, "input": […]}` | **YES** | llama-server `/v1/embeddings` is OpenAI-format; response `data[].embedding` is what Hindsight parses |
| `tei` reranker | `GET {base}/info` at init, then `POST {base}/rerank` | `{"query":…, "texts": […]}` | **NO** | llama-server has no `/info` route; `initialize()` raises `RuntimeError("Failed to connect to TEI server…")` on the 404 |
| `litellm` reranker | `POST {base}/v1/rerank` | `{"model":…, "query":…, "documents":…, "return_documents":false, "top_n":N}` | **YES** | llama-server `/v1/rerank` accepts Jina `documents` (and TEI `texts`); ignores unknown fields (`return_documents`); response `results[].relevance_score` is what Hindsight parses |

**Wiring (the exact env set for the two sidecars):**
```
# Embedder sidecar (port 58080)
HINDSIGHT_API_EMBEDDINGS_PROVIDER=litellm
HINDSIGHT_API_EMBEDDINGS_LITELLM_API_BASE=http://127.0.0.1:58080/v1
HINDSIGHT_API_EMBEDDINGS_LITELLM_MODEL=bge-small-en-v1.5
HINDSIGHT_API_EMBEDDINGS_LITELLM_DIMENSIONS=384     # skips startup probe
HINDSIGHT_API_EMBEDDINGS_LITELLM_API_KEY=<random>   # matches --api-key

# Reranker sidecar (port 58081)
HINDSIGHT_API_RERANKER_PROVIDER=litellm
HINDSIGHT_API_RERANKER_LITELLM_API_BASE=http://127.0.0.1:58081/v1
HINDSIGHT_API_RERANKER_LITELLM_MODEL=ms-marco-MiniLM-L-6-v2
HINDSIGHT_API_RERANKER_LITELLM_TIMEOUT=45
HINDSIGHT_API_RERANKER_LITELLM_API_KEY=<random>
```
**llama-server argv (per sidecar):**
```
# Embedder
llama-server.exe -m bge-small-en-v1.5.gguf --embedding --pooling mean
  --embd-normalize 2 --host 127.0.0.1 --port 58080 --api-key <random>
  --no-ui --warmup -t <profile> -tb <profile> -c <profile> -b <profile> -ub <profile>
# Reranker
llama-server.exe -m ms-marco-MiniLM-L-6-v2.gguf --reranking
  --host 127.0.0.1 --port 58081 --api-key <random>
  --no-ui --warmup -t <profile> -tb <profile> -c <profile> -b <profile> -ub <profile>
```
Flag provenance (llama.cpp server README, read this session): `--embedding/--embeddings`, `--rerank/--reranking` (rerank requires `--embedding --pooling rank` **or** `--reranking`), `-t/--threads` (default -1=auto), `-tb/--threads-batch`, `-c/--ctx-size` (default 0=model), `-b/--batch-size` (default 2048), `-ub/--ubatch-size` (default 512), `--host` (default 127.0.0.1), `--port` (default 9931), `--api-key` (default none), `--pooling {none,mean,cls,last,rank}`, `--embd-normalize` (default 2=Euclidean), `--warmup` (default enabled), `--ui/--no-ui` (default **enabled** → use `--no-ui`), `--offline`. Endpoints: `GET /health` (503 while loading, 200 ready, public/no key), `POST /v1/embeddings`, `POST /v1/rerank` (aliases `/rerank`, `/v1/reranking`).

### Pattern 4: Retain idempotency + startup repair (MEM-06)
**What (read this session from vendored source):**
- **`operation_id` idempotency:** parent-PK replay for async retain; a conflicting (different-payload) replay → HTTP 409. A cancelled retain is re-claimed, not lost.
- **Startup repair job:** `WorkerPoller.recover_own_tasks` runs in **every** poller start (API-embedded and standalone). On boot it re-claims in-flight/cancelled operations so a cancelled retain never leaves an unretrievable memory.
- **Transactional boundaries:** the `async_operations` queue is claimed with `FOR UPDATE SKIP LOCKED`; task execution is wrapped in the backend's transaction handling.
- **Queue:** PostgreSQL table `async_operations` (no Redis).

**The 2s coalescing window is NOT a Hindsight feature.** Hindsight's coalescing is claim-time *folding* (`DEFAULT_MAX_FOLD_PEERS = 16`), not a time window. The "2s-window coalescing on `document_id`" from the locked decisions must be implemented in the **HALO retain shim** (debounce/coalesce retain calls within a 2s window per `document_id` before they reach Hindsight). See §Open Questions Q1.

### Pattern 5: Degraded mode (the recorded decision for MEM-04)
**What Hindsight supports (read this session) — there is no single "degraded" flag; it is a set of discrete behaviors:**
- **LLM provider `none`:** chunk-store mode — retain/recall work without an LLM (no summarization/consolidation). This is the primary degraded mode when no chat LLM is available.
- **Rerank failover chain:** ends in `rrf` (reciprocal-rank fusion) — if the reranker sidecar is down, recall falls back to RRF scoring (no cross-encoder).
- **`enable_reranking=false` per bank:** a bank can disable reranking entirely.
- **Partial scores on `RerankTimeout`:** a timed-out rerank returns partial scores rather than failing the whole recall.

**Recorded decision (for MEM-04):** the default degraded mode is **LLM provider `none` (chunk-store) + rerank failover to `rrf`**. When the embedder or reranker sidecar is `degraded`/`failed`, the four-lane controller reads that state and the UI surfaces a degraded badge (per AGENTS.md: "surface a degraded badge rather than a spinner"; auto-recall must not block the first turn on sidecar readiness). This is the documented fallback; it is a degradation, not an equivalent (no cross-encoder rerank, no LLM consolidation).

### Pattern 6: PostgreSQL supervision (MEM-01)
**What (locked contract, AGENTS.md §2, read this session):**
- **Never run elevated** — PostgreSQL refuses administrative privilege on Windows. The supervisor detects an elevated parent and refuses to start the memory subsystem with a clear error (no dead-child loop).
- **Start:** spawn `postgres.exe -D <dir>` **directly** (not `pg_ctl start`, which detaches and loses the PID). Keep it a direct child so `exit`/`error` events are meaningful.
- **initdb:** `initdb.exe -D <dir> --locale=C --encoding=UTF8 -U halo` (deterministic; do text collation in the app).
- **Stop:** `pg_ctl.exe stop -D <dir> -m fast` (graceful checkpoint), then `taskkill /PID <pid> /T /F` after a 10s timeout.
- **Paths:** always `spawn` with an argv array (no `shell: true`); `-D` as a separate argument (paths contain spaces + non-ASCII).
- **Data dir:** named with the major (`pgdata-18`) so a future migrator can never silently open an incompatible cluster.
- **Credential:** random password generated at first launch, stored in the Hermes secret store (`auth.json` under `HERMES_HOME`); PG runs with `scram-sha-256`.

**Health-check gap (recorded deviation):** AGENTS.md says to wait for `pg_isready -h 127.0.0.1 -p <port>`, but the zonky 18.6.0 bundle ships **only** `initdb.exe`, `pg_ctl.exe`, `postgres.exe` (verified this session by extracting the jar) — **no `pg_isready.exe`, no `psql.exe`, no `pg_dump.exe`**. The supervisor must health-check with a **TCP connect + a real client connection** (scram-sha-256) instead. This also verifies auth, which `pg_isready` does not. Migrations run via Hindsight's own Alembic (psycopg2), so `psql` is not needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| PG process supervision | Custom fork/attach logic | Direct `spawn` of `postgres.exe` + `pg_ctl stop` + `taskkill` fallback | Locked contract; `pg_ctl start` detaches and loses the PID |
| PG health check | A home-grown wire-protocol probe | A real client connection (scram) over TCP | `pg_isready` is absent from the bundle; a client connection also verifies auth |
| Vector extension | A custom vector type | pgvector 0.8.7 (CI-built, `installcheck`-gated) | Hindsight auto-creates `CREATE EXTENSION IF NOT EXISTS vector`; hand-rolling a vector type is a multi-week effort with no benefit |
| Embedding/rerank inference | In-process ONNX/PyTorch in the daemon | Two supervised `llama-server` sidecars | A model crash must not take the daemon down; the HTTP boundary preserves the four-lane isolation property (AGENTS.md "What NOT to use") |
| Hindsight worker | A separate supervised `hindsight-worker` process | The in-process `WorkerPoller` (default) | Spawning a separate worker duplicates the queue consumer and breaks the "embedded" contract |
| Retain coalescing | A custom queue in front of Hindsight | A 2s debounce in the HALO shim per `document_id` | Hindsight's own coalescing is claim-time folding, not a time window; the shim is the only place the 2s window can live |
| Schema migrations | A custom migration runner | Hindsight's Alembic (advisory-locked, idempotent, runs on startup by default) | `HINDSIGHT_API_RUN_MIGRATIONS_ON_STARTUP` defaults true; re-implementing migrations is a correctness hazard |

**Key insight:** every "hand-rolled" alternative here either loses the process-isolation property (in-process inference), loses the PID (detached `pg_ctl start`), or re-implements a correctness-critical subsystem (migrations, vector storage) that the vendored/CI-built component already provides with a verification gate.

## Common Pitfalls

### Pitfall 1: Waiting for `pg_isready` that isn't in the bundle
**What goes wrong:** The supervisor polls `pg_isready` forever (or fails to find the binary) and never marks PG `ready`.
**Why it happens:** AGENTS.md names `pg_isready`, but the zonky 18.6.0 bundle ships only `initdb.exe`/`pg_ctl.exe`/`postgres.exe`.
**How to avoid:** Health-check with a TCP connect + a real client connection (scram-sha-256). Treat a successful authenticated connection as `ready`.
**Warning signs:** `ENOENT` on `pg_isready.exe`; supervisor stuck in `starting` for PG.

### Pitfall 2: pgvector ABI mismatch (the #1 build failure)
**What goes wrong:** `vector.dll` loads but crashes, or `CREATE EXTENSION vector` fails with a symbol error.
**Why it happens:** pgvector was built against a different PG major/headers than the runtime `PGROOT` (AGENTS.md: "ABI mismatch is the #1 way this fails; build against the exact runtime `PGROOT`").
**How to avoid:** In CI, `set PGROOT=<the exact bundled zonky PG root>` before `nmake /F Makefile.win`; gate on `nmake /F Makefile.win installcheck` (pg_regress); at startup, verify `vector.control` `default_version = '0.8.7'` and `module_pathname = '$libdir/vector'` before first start, and fail with an actionable message (MEM-02).
**Warning signs:** `FATAL: could not access file "$libdir/vector"`; `vector.control` version ≠ 0.8.7; a `vector.dll` built against a different `postgres.lib`.

### Pitfall 3: Assuming Hindsight uses `psycopg`
**What goes wrong:** The plan wires a `psycopg` (v3) driver or a `pg0://` URL and Hindsight can't connect.
**Why it happens:** The locked-decision prose says "psycopg", but the vendored code uses **`asyncpg`** at runtime (`hindsight_api/engine/db/postgresql.py:16`) and **`psycopg2-binary`** only inside Alembic migrations. `psycopg` (v3) is **not** a dependency.
**How to avoid:** Connect Hindsight with `HINDSIGHT_API_DATABASE_URL=postgresql://halo:<pw>@127.0.0.1:55432/hindsight` (a plain `postgresql://` URL, **not** `pg0://`). Do not add `psycopg` (v3) to the environment.
**Warning signs:** `ModuleNotFoundError: asyncpg`; a `pg0://` URL being passed to Hindsight.

### Pitfall 4: Using Hindsight's `tei` provider against llama-server
**What goes wrong:** Hindsight fails at startup (`RuntimeError: Failed to connect to TEI server…`) or embeddings 404.
**Why it happens:** The `tei` embedding client POSTs to `/embed` (no such route) and the `tei` reranker client probes `GET /info` at `initialize()` (no such route).
**How to avoid:** Use the `litellm`/`openai` providers (see §Pattern 3 matrix). Set `HINDSIGHT_API_EMBEDDINGS_LITELLM_DIMENSIONS=384` to skip the embedding startup probe.
**Warning signs:** `Failed to connect to TEI server`; 404 on `/embed` or `/info` in the Hindsight log.

### Pitfall 5: Running PostgreSQL elevated
**What goes wrong:** `postgres.exe` exits immediately; the supervisor loops on a dead child.
**Why it happens:** PostgreSQL checks for administrative privilege on Windows and refuses ("Execution of PostgreSQL by a user with administrative permissions is not permitted").
**How to avoid:** The supervisor detects an elevated parent and refuses to start the memory subsystem with a clear error (no restart loop).
**Warning signs:** `postgres.exe` exit code 1 immediately after spawn; the elevated-privilege message in the PG log.

### Pitfall 6: Letting the Web UI / warmup surface stay on
**What goes wrong:** Extra attack surface and a slow first request; a console window flashes.
**Why it happens:** `--ui` defaults to **enabled** and `--warmup` defaults to enabled; Node's `windowsHide` defaults to `false`.
**How to avoid:** Pass `--no-ui` to both sidecars; keep `--warmup` (it helps first-request latency); set `windowsHide: true`, `detached: false`, `shell: false`, `stdio: ['ignore','pipe','pipe']` on every child (AGENTS.md §4).
**Warning signs:** A black console window per sidecar; the llama.cpp Web UI reachable on the loopback port.

## Code Examples

### initdb + first start (MEM-01)
```powershell
# First launch only (idempotent: skip if pgdata-18/PG_VERSION exists)
& "<pgroot>\bin\initdb.exe" -D "<data>\pgdata-18" --locale=C --encoding=UTF8 -U halo
# Start (direct child, NOT pg_ctl start)
$pg = Start-Process -FilePath "<pgroot>\bin\postgres.exe" `
  -ArgumentList @("-D", "<data>\pgdata-18", "-p", "55432", "-c", "listen_addresses=127.0.0.1") `
  -PassThru -WindowStyle Hidden
# Health: TCP connect + authenticated client (scram) — NOT pg_isready (absent from bundle)
#   → on success: CREATE EXTENSION vector is auto-run by Hindsight on first connect
```

### pgvector CI build (MEM-02)
```powershell
# CI (windows-latest, MSVC), PGROOT = the exact bundled zonky PG root
$env:PGROOT = "<bundled-pg-root>"
nmake /F Makefile.win            # → vector.dll + sql\vector--0.8.7.sql
nmake /F Makefile.win install   # → %PGROOT%\lib\vector.dll
                                 #   %PGROOT%\share\extension\vector.control
                                 #   %PGROOT%\share\extension\vector--0.8.7.sql
nmake /F Makefile.win installcheck   # pg_regress gate (must pass)
# Publish: SHA-256 of {vector.dll, vector.control, vector--0.8.7.sql}
```
Startup version check (actionable failure, MEM-02):
```python
# Read <pgroot>\share\extension\vector.control
#   default_version = '0.8.7'
#   module_pathname = '$libdir/vector'
# If default_version != "0.8.7" or vector.dll missing → fail startup with:
#   "pgvector version mismatch: expected 0.8.7, found <x>. Re-run the pgvector build
#    against this PostgreSQL 18.6 runtime (see tools/build-pgvector.ps1)."
```

### Hindsight env wiring (MEM-04)
```
HINDSIGHT_API_DATABASE_URL=postgresql://halo:<pw>@127.0.0.1:55432/hindsight
HINDSIGHT_API_RUN_MIGRATIONS_ON_STARTUP=true        # default; Alembic, advisory-locked, idempotent
HINDSIGHT_API_LLM_MAX_CONCURRENT=4                 # locked decision (default is 32)
# Embedder (see Pattern 3)
HINDSIGHT_API_EMBEDDINGS_PROVIDER=litellm
HINDSIGHT_API_EMBEDDINGS_LITELLM_API_BASE=http://127.0.0.1:58080/v1
HINDSIGHT_API_EMBEDDINGS_LITELLM_MODEL=bge-small-en-v1.5
HINDSIGHT_API_EMBEDDINGS_LITELLM_DIMENSIONS=384
# Reranker (see Pattern 3)
HINDSIGHT_API_RERANKER_PROVIDER=litellm
HINDSIGHT_API_RERANKER_LITELLM_API_BASE=http://127.0.0.1:58081/v1
HINDSIGHT_API_RERANKER_LITELLM_MODEL=ms-marco-MiniLM-L-6-v2
HINDSIGHT_API_RERANKER_LITELLM_TIMEOUT=45          # locked decision (default is 60.0)
# Degraded default (recorded decision, Pattern 5)
HINDSIGHT_API_LLM_PROVIDER=none                    # chunk-store; rerank fails over to rrf
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| `psycopg` (v3) for Hindsight DB access | `asyncpg` at runtime; `psycopg2-binary` for Alembic only | Current vendored Hindsight | The locked-decision prose is stale; wire `postgresql://` URLs, not `pg0://` |
| `pg_isready` for PG health | Client-connection health check | zonky bundle ships no `pg_isready.exe` | A real connection also verifies scram auth |
| Hindsight `tei` provider for llama-server | Hindsight `litellm`/`openai` provider | llama-server has no `/embed` or `/info` | The `tei` provider is for real TEI, not llama-server |
| Separate supervised `hindsight-worker` | In-process `WorkerPoller` (default) | Hindsight default `worker_enabled=True` | One process to supervise, not two |

**Deprecated/outdated:**
- `pg0://` DB URLs: Hindsight's `pg0` embedded-Postgres mode is a different (not-ours) path; use `postgresql://` TCP.
- `hindsight-embed` daemon client: spawns a detached `hindsight-api` child — the wrong shape for HALO's supervised model.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 2s retain-coalescing window is implemented in the HALO shim, not Hindsight | Pattern 4 / Q1 | If Hindsight is expected to provide it, the shim is missing a requirement; low risk (Hindsight's coalescing is verifiably claim-time folding) |
| A2 | `HINDSIGHT_API_LLM_PROVIDER=none` is the default degraded mode (chunk-store + rrf failover) | Pattern 5 | If a chat LLM is required for the MVP, a third `llama-server` (chat model) is needed; medium risk — see Q2 |
| A3 | llama-server `/v1/embeddings` returns 384-d for bge-small-en-v1.5 and the reranker accepts `documents` (Jina) | Pattern 3 | Verified against the llama.cpp README + `server.cpp` route table this session; low risk |
| A4 | The Hermes secret store is `auth.json` under `HERMES_HOME` for the PG password | Pattern 6 | If HALO uses a different store, the password location changes; low risk (the store is the documented Hermes credential location) |
| A5 | `winloop` is required for Hindsight on Windows (proactor loop) | Standard Stack | Verified in `main.py` (`winloop.install()` on win32); low risk |

## Open Questions

1. **2s coalescing window ownership.**
   - What we know: Hindsight's coalescing is claim-time folding (`DEFAULT_MAX_FOLD_PEERS = 16`), not a time window.
   - What's unclear: whether the locked "2s-window coalescing on `document_id`" is a HALO-shim requirement or was assumed to be a Hindsight feature.
   - Recommendation: implement it in the HALO retain shim (debounce per `document_id`); record the decision. Low risk either way.

2. **Chat LLM for retain/reflect/consolidation.**
   - What we know: MEM-03 names only embedder + reranker sidecars. Hindsight's LLM operations need a text-generation LLM or `provider=none`.
   - What's unclear: whether the MVP ships a third `llama-server` (small chat model) or defaults to `none` (chunk-store degraded).
   - Recommendation: default to `none` (chunk-store + rrf) as the recorded degraded decision; add a chat-model sidecar only if consolidation quality is required. Confirm with the user before adding a third sidecar.

3. **`--pooling` for the embedder.**
   - What we know: bge-small-en-v1.5 uses mean pooling; llama-server's default is "model default if unspecified".
   - What's unclear: whether to pass `--pooling mean` explicitly or rely on the model default.
   - Recommendation: pass `--pooling mean` explicitly (deterministic across model conversions).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| PostgreSQL 18.6 (zonky) | MEM-01 | ✓ (bundle verified) | 18.6.0 | — |
| pgvector 0.8.7 | MEM-01/02 | ✓ (CI-built) | 0.8.7 | — |
| llama.cpp `llama-server` | MEM-03 | ✓ (bundle verified) | b11669 | — |
| Python 3.14.9 | MEM-04 | ✓ (locked DEC) | 3.14.9 | — |
| Hindsight (vendored) | MEM-04/06 | ✓ (vendored) | `vendor/hindsight` | — |
| MSVC + `nmake` (CI) | MEM-02 | CI `windows-latest` | MSVC | — |
| `pg_isready.exe` | AGENTS.md health check | ✗ (not in bundle) | — | Client-connection health check (Pitfall 1) |
| `psql.exe` / `pg_dump.exe` | migrations / major upgrade | ✗ (not in bundle) | — | Hindsight Alembic (psycopg2); major upgrade out of scope for v1 |

**Missing dependencies with no fallback:** none (all blocking deps are present or CI-built)
**Missing dependencies with fallback:** `pg_isready.exe` → client-connection health check; `psql.exe`/`pg_dump.exe` → Hindsight Alembic / out-of-scope major upgrade

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | `bun test` (existing) + new integration tests for the supervisor |
| Config file | none (bun test discovers `*.test.ts`) |
| Quick run command | `bun test packages/sidecars` |
| Full suite command | `bun test tools/provenance tests/provenance packages/sidecars` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| MEM-01 | First launch inits PG+pgvector; a vector query returns rows | integration | `bun test packages/sidecars/tests/pg-boot.test.ts` | ❌ Wave 0 |
| MEM-02 | pgvector built in CI; version mismatch fails startup with actionable message | integration + CI gate | `bun test packages/sidecars/tests/pgvector-version.test.ts` + `nmake installcheck` | ❌ Wave 0 |
| MEM-03 | Sidecars start, health-check, restart per hardware profile | integration | `bun test packages/sidecars/tests/llama-sidecar.test.ts` | ❌ Wave 0 |
| MEM-04 | Hindsight API+worker embedded; per-op LLM config; degraded decision recorded | integration | `bun test packages/sidecars/tests/hindsight-embed.test.ts` | ❌ Wave 0 |
| MEM-06 | Retain idempotent via `operation_id`; startup repair | integration | `bun test packages/sidecars/tests/retain-idempotency.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test packages/sidecars`
- **Per wave merge:** `bun test tools/provenance tests/provenance packages/sidecars`
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/sidecars/tests/pg-boot.test.ts` — covers MEM-01 (initdb + client-conn health + vector query)
- [ ] `packages/sidecars/tests/pgvector-version.test.ts` — covers MEM-02 (version check + actionable failure)
- [ ] `packages/sidecars/tests/llama-sidecar.test.ts` — covers MEM-03 (start/health/restart/profile flags)
- [ ] `packages/sidecars/tests/hindsight-embed.test.ts` — covers MEM-04 (in-process worker + per-op env + degraded)
- [ ] `packages/sidecars/tests/retain-idempotency.test.ts` — covers MEM-06 (`operation_id` replay + `recover_own_tasks`)
- [ ] A CI job `build-pgvector` (windows-latest, MSVC) running `nmake /F Makefile.win` + `installcheck` and publishing the SHA-256 manifest

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | yes | scram-sha-256 for PG (random password in Hermes secret store); `--api-key` on both sidecars (loopback, but keyed) |
| V3 Session Management | no | No user sessions in the memory service; the daemon lock file is process-scoped |
| V4 Access Control | yes | All children bind `127.0.0.1` only; `listen_addresses=127.0.0.1`; no external port exposure |
| V5 Input Validation | yes | Hindsight validates retain/recall payloads; the HALO shim validates `operation_id`/`document_id` before coalescing |
| V6 Cryptography | yes | scram-sha-256 (PG); SHA-256 for artifact + model integrity; no hand-rolled crypto |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Elevated-privilege PG start | Elevation of Privilege | Detect elevated parent; refuse to start (Pitfall 5) |
| Path injection via spaces/non-ASCII | Tampering | `spawn` with argv array, no `shell: true`; `-D` as a separate argument |
| Unauthenticated loopback sidecar | Elevation of Privilege | `--api-key` on both `llama-server` sidecars; `listen_addresses=127.0.0.1` |
| Supply-chain (model/binary swap) | Tampering | SHA-256 manifest for the two GGUF models + the pgvector artifact (MEM-02); no runtime download without a digest pin |
| Stale daemon lock | Denial of Service | Exclusive-create lock; stale lock (PID not alive) is reclaimed, never blindly trusted |

## Sources

### Primary (HIGH confidence)
- Vendored Hindsight source (read this session): `hindsight-api-slim/hindsight_api/{config.py, main.py, server.py, api/http.py, engine/{llm_wrapper.py, cross_encoder.py, embeddings.py, db/postgresql.py}, pyproject.toml}` — embedded mode, per-op env vars, `operation_id` replay, `recover_own_tasks`, `async_operations` queue, provider lists, wire formats
- llama.cpp `tools/server/README.md` + `server.cpp` route table (fetched this session) — flags, `/health`, `/v1/embeddings`, `/v1/rerank`, absence of `/embed` and `/info`
- pgvector `Makefile.win` + README (fetched this session) — `EXTVERSION = 0.8.7`, `nmake` install layout, `installcheck`
- zonky `embedded-postgres-binaries-windows-amd64-18.6.0.jar` (downloaded + extracted this session) — SHA-256 verified; `bin/` = only `initdb.exe`/`pg_ctl.exe`/`postgres.exe`
- llama.cpp b11669 release (GitHub API this session) — `llama-b11669-bin-win-cpu-x64.zip` present
- AGENTS.md (locked decisions DEC-01…DEC-11 + Technology Stack research) — supervision contract, hardware profiles, initdb rules, licensing

### Secondary (MEDIUM confidence)
- HuggingFace GGUF repos: `ggml-org/bge-small-en-v1.5-Q8_0-GGUF`, `cstr/ms-marco-MiniLM-L-6-v2-GGUF` (web search this session)
- Hermes `auth.json` secret store (vendored `vendor/hermes-agent` grep this session)

### Tertiary (LOW confidence)
- CPU latency/concurrency numbers in AGENTS.md are `[INFERENCE]` (FLOP arithmetic, not measured) — must be replaced with measurements in this phase (AGENTS.md §3)

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — every pin read from a registry/release API this session; the zonky jar and llama.cpp zip were downloaded and verified
- Architecture: **HIGH** — the Hindsight embedded mode, per-op env vars, and wire compatibility were read from the vendored source + llama.cpp source this session
- Pitfalls: **HIGH** — each pitfall is tied to a verified absence (no `pg_isready`, no `/embed`/`/info`, `asyncpg` not `psycopg`) or a documented Windows behavior

**Research date:** 2026-10-25
**Valid until:** ~30 days (stable binaries; re-verify the zonky/llama.cpp pins if the phase slips past late November)
