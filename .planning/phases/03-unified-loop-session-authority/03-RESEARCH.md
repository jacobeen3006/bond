# Phase 3: Unified Loop & Session Authority - Research

**Researched:** 2026-10-23
**Domain:** Single-agent-loop turn lifecycle, durable admission FIFO, one SQLite (WAL + FTS5) transcript, loop-owned compaction with provider-usage accounting, mirrored-vs-sent request identity
**Confidence:** MEDIUM-HIGH. Loop/store/compaction *mechanics* are HIGH — the design below was grounded in the vendored runtime's official developer docs fetched this session and in live SQLite/FTS5 probes on the pinned interpreter family. Upstream *identifiers and column sets* are MEDIUM — `vendor/` does not exist yet (Phase 1 authored, unexecuted), so every Hermes module path, table column and config key must be re-read at the import SHA before a plan depends on it.

> **Hard dependency, state this in every plan:** Phase 3 runs on the vendored Hermes runtime and on Phase 2's frozen vocabulary. Today neither exists: `vendor/` is absent, there is no root manifest, nothing is installed, and the repo contains only `.planning/` and `AGENTS.md` [VERIFIED: `ls -A` → `.git .planning AGENTS.md`; `ls vendor` → "cannot access 'vendor'"]. Phase 3 plans must therefore (a) put every upstream-name verification in a Wave-0 task that runs against the imported tree, and (b) never assert a vendored symbol exists without a `read_first`/verify step that proves it at execute time.
>
> **Legend used below:** `[doc]` = documented in upstream developer docs fetched 2026-10-23 but **unverifiable until the import lands**; `[PLANNED]` = HALO-side name/table/column that no upstream document attests to; `[VERIFIED: …]` = read or probed in this session (for in-repo discrete values, quoted verbatim with path+lines); `[CITED: url]` = official documentation; `[ASSUMED]` = training knowledge.

<phase_requirements>
## Phase Requirements

| ID | Description (verbatim, `.planning/REQUIREMENTS.md:30-35` [VERIFIED]) | Research Support |
|----|-------------|------------------|
| LOOP-01 | "One agent loop owns every turn: streaming, steer, queue modes, interrupt, and follow-up" | §Pattern 7 (single-loop enforcement, 4 independent gates), §Pattern 3 (durable admission FIFO), §Pattern 4 (interrupt ordering, synthetic tool results, steer folding), §Pattern 3 (the documented `interrupt`/`queue`/`steer` modes) |
| LOOP-02 | "One SQLite store holds sessions, transcripts, and turns; CLI and Desktop read the same store" | §Pattern 1 (one writer thread + read-only URI readers), §Pattern 2 (full DDL: `sessions`/`transcripts`/`turns`), §Common Pitfalls 2 (WAL pragma can silently return `delete`), §Environment Availability (Windows path refusal) |
| LOOP-03 | "User can resume, list, search (FTS5), branch, and export sessions" | §Pattern 2 (`messages_fts` + `messages_fts_trigram`, triggers), §Pattern 8 (resume/branch/export semantics, uid preservation, cut-through-tool-batch rule), §Common Pitfalls 4 (FTS5 external-content desync) |
| LOOP-04 | "Compaction (automatic and manual) is loop-owned and single-sourced; token accounting matches what was sent" | §Pattern 6 (generation rotation, fail-closed checkpoint, `checkpoint_required` as the single-source switch), §Pattern 5 (request manifest = the "what was sent" record), §Common Pitfalls 8 (threshold-floor contradiction) |
| LOOP-05 | "The transcript shows every context item the model received — injected context is never invisible" | §Pattern 5 (one `RequestPayload` builder, per-message `sent_sha256`, request-scoped context rows, >1 MiB handling), §Pattern 2 (`api_content`, `display_kind`, `request_id` row classes) |
| LOOP-06 | "A turn is complete only when the terminal signal is authoritative; background work never silently reopens a finished turn" | §Pattern 4 (`is_turn_complete` in one function, the OMP `isTerminal`/`yielded`/`awaitingAsyncWork` trap, DB triggers that make re-close/re-open impossible) |
</phase_requirements>

<user_constraints>
## User Constraints (no CONTEXT.md — locked inputs from AI-SPEC / ROADMAP / PROJECT / STATE)

No CONTEXT.md exists for Phase 3 (`init.phase-op 3` → `"has_context": false` [VERIFIED: gsd-tools, this session]). The lock record is the AI-SPEC's framework decision plus the accumulated project decisions. The following are **not open for re-litigation**:

### Locked Decisions

- **Framework:** "Custom loop over the vendored Hermes agent runtime (halo-agent) — no third-party orchestration framework" [VERIFIED: `.planning/phases/03-unified-loop-session-authority/03-AI-SPEC.md:110`]. LangGraph and every other candidate are ruled out in §2 of the same file. Do not research framework alternatives; research *how to satisfy the invariants inside this loop*.
- **One loop, one store:** "One agent loop owns every turn and one SQLite transcript is the only history, so every surface built later shares the same conversation" [VERIFIED: `.planning/ROADMAP.md:121`].
- **Turn close predicate:** "a turn closes on exactly one predicate — the loop's terminal assistant signal AND zero outstanding background work bound to the turn; a yielded end with `awaitingAsyncWork` keeps the turn open; a closed turn never reopens; UI quiescence (`session_settled`) and turn completion are separate predicates, never derived from one another" [VERIFIED: `03-AI-SPEC.md:47`].
- **Compaction:** "compaction is a generation rotation, not a fork — one active lineage (`active=1`), `message_uid` survives the rewrite, tool-call/result pairs are never split, the protected tail is byte-intact, and a failed pre-compress evidence checkpoint BLOCKS the rewrite instead of losing rows; context-% and cost derive only from provider-accepted `usage`, never from local estimates" [VERIFIED: `03-AI-SPEC.md:53`].
- **Mirror rule:** "every byte that entered the model request has exactly one transcript event plus a content hash — injected recall, policy reminders, compaction summaries, and ephemeral warnings all appear with provenance (`display_kind`), and the dev-build diff of `(seq, role, content_sha256)` between mirror and sent request passes every turn" [VERIFIED: `03-AI-SPEC.md:41`].
- **WAL path policy:** "HALO's Windows-first layout already pins data dirs to `%LOCALAPPDATA%` — keep it structural: refuse non-local paths for `state.db`" [VERIFIED: `03-AI-SPEC.md:79`].
- **Phase ordering:** "No Desktop/CLI surface before the session authority (Phase 3); the product surface lands at Phase 10" [VERIFIED: `.planning/STATE.md:66`]. Phase 3 exposes services + a minimal verb set, never a UI.
- **Gate seam only:** "Phase 3's obligation is the **seam**, not the registry" [VERIFIED: `03-AI-SPEC.md:326`]; the `PolicyGate` is Phase 4. A tool row's `policy_decision_id` stays `NULL` until the gate lands — the plan must not invent a pass-through "decision".

### Claude's Discretion (recommended in this document, planner may override with reason)

- Concrete DDL and table/column names for HALO-owned tables (§Pattern 2).
- Whether Phase 3's loop wraps `run_conversation` or drives the vendored turn phases directly (§Pattern 7 + Research Flag R3).
- Minimal `halo-agent` verb set for LOOP-03 (§Pattern 8).
- Test layout under `packages/halo_agent/tests/` instead of a root `tests/` (§Validation Architecture).
- Redaction pattern set and the archive medium for `on_pre_compress` in Phase 3 (§Pattern 6).

### Deferred Ideas (OUT OF SCOPE)

- Tool registry, capability classes, `PolicyGate`, approval modes (GATE-01..07, Phase 4).
- Coding-core RPC, chunked frames, frame replay (CORE-01..08, Phase 5).
- Subagent child sessions, `task`, isolation (SUB-01..04, Phase 7).
- Hindsight-backed archival of compaction evidence (MEM-*, Phase 8); Phase 3 ships the fail-closed *seam* with a SQLite archive.
- Desktop/CLI UX, approvals round-trip, Electron IPC (UI-01..05, Phase 10).
- Turn-scoped workspace rollback / shadow git (LOOP-07, Phase 6).
</user_constraints>

## Project Constraints (from AGENTS.md)

Actionable directives that constrain any Phase 3 plan; each is quoted verbatim.

- **Windows is the only supported target:** "**Platform**: Windows-first (win32 x64). Cross-platform code paths must not be consciously broken, but only Windows is tested and supported." [VERIFIED: `AGENTS.md:15`]. Every verification command in a plan must be runnable on `windows-latest`.
- **One stdio boundary, one tool path:** "**Single process boundary**: tool calls that cross into the coding core are RPC frames, not in-process calls. Per-call overhead budget: < 150ms adapter-added per tool round-trip." [VERIFIED: `AGENTS.md:18`]. Phase 3 must not dispatch coding-core tools at all; it defines the adapter seam the later phases fill.
- **Pins:** Python "**3.14.9**" [VERIFIED: `AGENTS.md:34`], uv "**0.13.5**" [VERIFIED: `AGENTS.md:36`], just "**1.59.0**" [VERIFIED: `AGENTS.md:37`], Bun "**1.4.4**" [VERIFIED: `AGENTS.md:32`].
- **No root workspace file:** Phase 1's skeleton locks "No root Cargo workspace, no root uv workspace, root Bun workspace = `[\"apps/*\",\"packages/*\"]` — never `vendor/**`" [VERIFIED: `.planning/phases/01-import-provenance-ledger/01-SKELETON.md:23`]. Consequence: the AI-SPEC's `uv sync --locked --python 3.14` at repo root **cannot be implemented as written**; Phase 3's Python project lives at `packages/halo_agent/` and every command names `--project packages/halo_agent`.
- **`just` is the only orchestrator, with a Windows shell:** "Write the root `justfile` with `set shell := [\"pwsh\", \"-NoLogo\", \"-NoProfile\", \"-Command\"]` under a `[windows]` attribute (just defaults to `sh` on Windows and every recipe would otherwise die with \"could not find `sh`\")" [VERIFIED: `.planning/phases/01-import-provenance-ledger/01-01-PLAN.md:247`].
- **Every vendored edit is a patch:** Phase 1's ledger makes an unrecorded vendored byte change fail, so any Phase 3 patch into `vendor/hermes-agent/` must land in `patches/series` with refreshed `renames_sha256` and a restaged `MANIFEST.vendored.tsv`, and `just verify` must stay green [VERIFIED: `.planning/phases/02-rebrand-wire-contract-migration/02-RESEARCH.md:84` — "`provenance-verify` fails on unrecorded vendored edits"].
- **Generated Python already has a home — with a collision to resolve:** "Generated artifacts land at `runtime/shared_contracts/` per RESEARCH.md:149 — Phase 3+ imports these; a path change here forks the vocabulary location." [VERIFIED: `.planning/phases/02-rebrand-wire-contract-migration/02-01-PLAN.md:60`]. Phase 2 emits `runtime/shared_contracts/halo_agent/brand_gen.py`; Phase 3's package is also `halo_agent`. See Research Flag R12 for the two resolutions.
- **No credentials in config or logs:** model credentials live in the secret store, never `.env`/`config.json`, and must never be logged [VERIFIED: `.planning/PROJECT.md` Constraints §Security]. Phase 3's admission-time redaction is the transcript half of that obligation; PLAT-06 (Phase 12) is the log half.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Turn orchestration (streaming, steer, queue, interrupt, follow-up) | Python loop (`packages/halo_agent/loop`) | Admission FIFO (SQLite) | Only the loop may create/close turns; the queue is durable state the loop *drains*, not a second scheduler |
| Admission durability and crash resolution | SQLite store (`session_admissions`, `runtime_epoch`) | Loop recovery at daemon start | Upstream rule: "The profile's gateway is the **only writer of canonical sessions**" [CITED: session-storage]; HALO's daemon is that owner |
| Transcript persistence (sessions/transcripts/turns/messages) | SQLite store, one writer thread | — | LOOP-02; readers are separate processes with `mode=ro` |
| Search / list / preview | FTS5 inside the same store | Read-only reader connections | One index, one store (no second index per FEATURES #17 in the AI-SPEC) |
| Branch / export / import | Store (write path) | Minimal `halo-agent` verbs | Must reuse the single writer and the uid rules; never a second writer |
| Compaction decisions | Loop-owned `ContextEngine` | — | LOOP-04 "single-sourced"; every other compaction authority must be structurally off |
| Token accounting / context % | Provider `usage` recorded by the loop | `session_model_usage` ledger | Accounting is *recorded*, never derived; estimates only trigger gates |
| Terminal-signal predicate | Loop (`is_turn_complete`) | DB triggers (`closed_at` write-once, no append after close) | Two layers: one predicate in code, an immutability guard in the store |
| Single-loop enforcement | Process bootstrap (`LoopAuthority`) | CI static import-graph gate + store ownership | "No alternate loop in-process" is only provable with a static gate *and* a runtime singleton |
| Store path / durability policy | Store open (Windows drive checks, WAL verification) | — | WAL on a network share is a corruption class; refusal must be structural |
| Secret redaction at admission | Admission boundary (before insert, before send) | Log path (PLAT-06, Phase 12) | Mirror = bytes-as-sent, so admission is the only correct redaction site |
| Tool dispatch seam | `adapter.dispatch_batch` (single boundary) | Phase 4 gate fills `policy_decision_id` | One boundary now; denial semantics later |

## Summary

Phase 3 is not "a chat store"; it is the product's **authority layer**, and its whole value is that it tells the truth about itself. Four mechanisms carry that: (1) a durable admission FIFO that makes queue/steer/follow-up crash-safe and makes a dead-owner turn resolve to `unknown` instead of silently replaying side effects; (2) a single-writer SQLite store whose tables encode the identities the rest of the product keys on (`session_id` stable across compaction, `transcript_id` per generation, `message_uid` per logical message, `turn_id` per user input); (3) a request builder that is the *only* way bytes reach a provider, so the mirror is checkable rather than aspirational; and (4) one terminal predicate in one function, with DB triggers making "closed then reopened" impossible rather than discouraged.

The research changed four things relative to a naive reading of the AI-SPEC. First, **upstream's default compaction is now in-place** (`compression.in_place: true`), which means the logical `session_id` never rotates; the physical generation is what rotates (`active=0, compacted=1`). That is *better* for LOOP-04's "one transcript lineage", but the spec's phrase "rotate `transcript_id`" must be implemented as a HALO-owned generation column, not as a session-id change [CITED: context-compression-and-caching]. Second, **arming `compression.checkpoint_required: true` is the structural single-source switch**: upstream documents that it suppresses server-side native compaction, forces post-turn micro-compaction off, and refuses the Codex app-server route — but with no provider advertising checkpoint API v2 it blocks *every* compaction, so Phase 3 must register the archiving provider in the same change that arms the gate [CITED: memory-provider-plugin]. Third, **the compaction trigger percentage is documented inconsistently** (`threshold: 0.50` in the settings table, but a "floored at 0.75 below 512K windows" rule and a computed example that uses 0.50 for a 200K model); tests must assert the engine's resolved `threshold_tokens`, never a hardcoded fraction. Fourth, the **mirrored-vs-sent check needs a real byte source**: mock the provider at the HTTP layer and record the raw body, because a mocked client object can never prove what was serialized.

The store design is deliberately *compatible* with the documented upstream schema (`sessions`, `messages`, `session_model_usage`, `messages_fts*`, `session_admissions`, `runtime_epoch`, `compression_locks`) and *additive* for everything HALO needs that upstream does not have (`transcripts` generations, `turns`, `turn_background_work`, `request_manifests`, `mirror_manifest`, `tool_invocations`, `compaction_archives`, `compaction_runs`). Two DDL details were probed and matter: `AFTER UPDATE OF content, tool_name, tool_calls` keeps the FTS trigger from firing when compaction merely flips `active`, and an `integrity-check` with `rank=1` genuinely detects an external-content desync and `'rebuild'` repairs it [VERIFIED: live probe, SQLite 3.53.1].

**Primary recommendation:** Build in this order — (1) schema + migration runner + `SessionStore` writer/reader split with the Windows path refusal; (2) admission FIFO + `runtime_epoch` + crash recovery, proven by a killed-child fixture; (3) `AgentLoop` with the single authority guard, terminal predicate and DB close guards; (4) request builder + HTTP-level recording + mirror checker (including a 2 MiB fixture); (5) compaction wrapper that reuses `ContextCompressor` behind a fail-closed checkpoint; (6) resume/branch/export/import with uid preservation. Every step adds its fixture on the day it lands, and `just eval` is green before the phase gate.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| CPython | 3.14.9 pinned; **3.14.7 is what uv can fetch here** | Runtime for the loop and store | Pinned in AGENTS.md; `uuid.uuid7()`, `asyncio.TaskGroup`, `sqlite3.Connection.autocommit` all present [VERIFIED: live probe on uv-managed 3.14.7] |
| uv | 0.13.5 pinned; workstation has 0.12.17 | Owns the venv/lockfile for `packages/halo_agent` | Only Python package manager in the stack; must be used with `--project packages/halo_agent` (no root workspace) |
| SQLite (bundled in CPython) | 3.53.1 in CPython 3.14.7 | The one transcript store | `ENABLE_FTS5` + `THREADSAFE=1` confirmed; `unicode61`, `porter`, `trigram`, `ascii` all available [VERIFIED: live probe] |
| `sqlite3` (stdlib) | CPython 3.14 stdlib | Writer/reader connections, WAL, backup | `autocommit` attribute exists, default `-1` (`LEGACY_TRANSACTION_CONTROL`); `threadsafety == 3` on this build [VERIFIED: live probe + CITED: docs.python.org/3/library/sqlite3.html] |
| `pydantic` | 2.14.1 (PyPI, published 2026-10-11) | Boundary models (`TurnEvent`, `ToolCallIn`, `TurnClose`, `AdmissionRequest`) | AI-SPEC mandates "every model-produced structure passes a Pydantic v2 boundary" [VERIFIED: `03-AI-SPEC.md:354`]; version verified from PyPI JSON [VERIFIED: pypi.org/pypi/pydantic/json] |
| Vendored Hermes runtime (`halo-agent`) | pinned import SHA (Phase 1) | `ContextEngine`, compressor, provider transports, secrets | No install; imported through one facade [doc: agent/conversation_loop.py, agent/context_engine.py, hermes_state.py] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pytest` | 9.1.1 (dev) | Deterministic test lane | Every task commit [VERIFIED: pypi JSON] |
| `pytest-asyncio` | 1.4.0 (dev) | `asyncio_mode = "auto"` for loop tests | All loop/store async tests [VERIFIED: pypi JSON] |
| `asyncio` (stdlib) | 3.14 | `TaskGroup`, `to_thread`, cancellation tree | Turn cancellation, writer-thread bridging |
| `hashlib` / `json` (stdlib) | 3.14 | Canonical message bytes + `sent_sha256` | Request manifest, export manifests |
| `uuid` (stdlib) | 3.14 | `uuid7()` for `session_id`, `turn_id`, `admission_id`, `epoch` | Monotonic, sortable ids without a dependency [VERIFIED: probe → `uuid7()` returns `01a167c7-…`] |
| `ctypes` (stdlib) | 3.14 | Windows `GetDriveTypeW` (network-path refusal), `OpenProcess` liveness | Store-open policy and epoch reclamation on Windows |
| `httpx` (transitive via the provider SDKs) | resolve from the vendored lock at import | Custom transport used only to *record* request bytes | Dev builds and tests that must prove "what was sent" [ASSUMED A6: the SDKs accept an injected `http_client`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dedicated writer thread + `sqlite3` | `aiosqlite` | Adds a second thread *and* hides transaction boundaries; the store needs explicit `BEGIN IMMEDIATE`, checkpoint control and result-code retry, which `aiosqlite` only proxies. Worse fit for the one-writer design. |
| Hand-written DDL + version runner | SQLAlchemy/Alembic | The schema *is* the product contract (LOOP-02/03); an ORM hides the exact SQL that the FTS triggers and partial indexes depend on. No migration tool for a single-file SQLite store. |
| Provider `usage` | `tiktoken` / local tokenizer for context % | Explicitly forbidden by LOOP-04 and upstream's estimator rules: estimates may *trigger* gates but must never be the number shown as cost/context. `tiktoken` also misprices every non-OpenAI model. |
| `psutil` for PID liveness | `ctypes` `OpenProcess`/`os.kill(pid, 0)` | A new dependency for two calls; `ctypes` is stdlib and the codepath is Windows-only anyway. |
| `filelock` for the single writer | SQLite's own locking + `runtime_epoch` + `mode=ro` readers | A file lock is a second truth about ownership; the epoch row is the one authority and is already needed for admission recovery. |
| `anyio`/`pytest-anyio` | `pytest-asyncio` | Either works; `pytest-asyncio` matches the async-first daemon and its 1.x `loop_scope` semantics are enough here. |
| `cjk_unicode61` FTS tokenizer (per AI-SPEC) | stock `unicode61` + `trigram` | `cjk_unicode61` is not a stock SQLite tokenizer; it is presumably a compiled-in custom one in upstream's build. `trigram` gives substring/CJK coverage and is verified present in the shipped interpreter. Verify at import; do not assume the custom tokenizer exists. |

**Installation:**

```bash
# No root uv workspace (Phase 1 DEC-04 / 01-SKELETON.md:23). The project lives in the package.
uv sync --project packages/halo_agent --locked --python 3.14
uv run --project packages/halo_agent python -c "import sqlite3; print(sqlite3.sqlite_version)"
```

**Version verification (run this session):** system `python` is 3.13.15 / SQLite 3.50.4; `uv` 0.12.17; `bun` 1.4.2; `just` **not installed**; `cargo`/`rustc` not installed; `rg` 15.2.0; `git` 2.55.0.windows.3; `pwsh` 7.6.7 [VERIFIED: live probes]. `uv python install 3.14.9` → `error: No download found for request: cpython-3.14.9-windows-x86_64-none`; `uv python install 3.14.7` succeeded and reports SQLite 3.53.1 with FTS5 [VERIFIED: live probe]. PyPI: pydantic 2.14.1, pytest 9.1.1, pytest-asyncio 1.4.0, anyio 4.15.1 [VERIFIED: pypi JSON].

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| pydantic 2.14.1 | PyPI | latest published 2026-10-11 | unknown to the seam | github.com/pydantic/pydantic | [SUS] | Flagged — `checkpoint:human-verify` before adding the pin; if the vendored Hermes tree already constrains pydantic, inherit that constraint instead of adding a second pin (A1) |
| pytest 9.1.1 | PyPI | 2026-06-19 | unknown to the seam | github.com/pytest-dev/pytest | [SUS] | Flagged — checkpoint before install (dev-only) |
| pytest-asyncio 1.4.0 | PyPI | 2026-05-26 | unknown to the seam | github.com/pytest-dev/pytest-asyncio | [SUS] | Flagged — checkpoint before install (dev-only) |

Seam output: `SUS` with reasons `["too-new"]`, `["unknown-downloads"]`, `["too-new","unknown-downloads"]` respectively; all three report `deprecated: false` and a real source repo [VERIFIED: `gsd-tools query package-legitimacy check --ecosystem pypi`, this session]. Per protocol they stay tagged `` [WARNING: flagged as suspicious — verify before using.] `` and the planner inserts a `checkpoint:human-verify` before each install. Context: pydantic is almost certainly already a dependency of the vendored Hermes runtime (it is the boundary-model library the AI-SPEC names) — inheriting the tree's constraint removes one new supply-chain surface entirely [ASSUMED A1].

**Packages removed due to [SLOP] verdict:** none.
**New runtime dependencies introduced by Phase 3:** only `pydantic` (and even that should be inherited). Everything else is stdlib or already in the vendored tree; this phase deliberately adds no database driver, no ORM, no lock library, and no tokenizer.

## Architecture Patterns

### System Architecture Diagram

```
 surfaces (Phase 10) / tests / minimal halo-agent verbs
        │  admit(session_id, kind, text, idempotency_key)
        ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │ Admission FIFO  (session_admissions, durable, ordered_seq)            │
 │   queued ──► started ──► terminal                                     │
 │      └──► unknown  (owner died while started; NEVER replayed)         │
 │   any 'unknown' row BLOCKS later admissions for that session          │
 └───────────────────────────────┬──────────────────────────────────────┘
                                 │ drain (FIFO, one at a time per session)
                                 ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │ AgentLoop  (exactly ONE per process; LoopAuthority token)             │
 │                                                                       │
 │  turn:  persist user row ─► preflight compaction ─► build request     │
 │         ─► provider stream ─► tool batch (adapter seam) ─► repeat     │
 │         ─► terminal signal ─► close_turn(if predicate holds)          │
 │                                                                       │
 │  steer  : fold into the next legal User boundary (never 2 users)      │
 │  queue  : admission row, starts after the current turn               │
 │  abort  : cancel tree ─► synthetic tool rows in call order ─► close   │
 └───────┬──────────────────────────────┬───────────────────────────────┘
         │ RequestPayload (only builder)│ writes (single writer thread)
         ▼                              ▼
 ┌──────────────────────┐      ┌────────────────────────────────────────┐
 │ ProviderTransport    │      │ SessionStore  (writer thread)          │
 │  body bytes ──► HTTP │      │  BEGIN IMMEDIATE … COMMIT              │
 │  recorder (dev/test) │─────►│  state.db (WAL, synchronous=FULL)      │
 └──────────────────────┘      │  ├ sessions / transcripts / turns      │
                               │  ├ messages + messages_fts(_trigram)   │
                               │  ├ session_admissions / runtime_epoch  │
                               │  ├ session_model_usage / manifests     │
                               │  └ compaction_* / tool_invocations     │
                               └───────────────┬────────────────────────┘
                                               │ read-only URI connections
                                               ▼
                                   readers (many processes): resume,
                                   list, search, export, minimal CLI
```

Data-flow rules the diagram encodes: input enters **only** as an admission row; bytes leave **only** through a `RequestPayload` built by one function; persistence happens **only** on the writer thread; and readers never block the writer (WAL), but they can stall checkpoints if a read transaction stays open [CITED: sqlite.org/wal.html].

### Recommended Project Structure

```
packages/halo_agent/
├── pyproject.toml               # uv project + pytest config (no root pyproject — DEC-04)
├── halo_agent/
│   ├── loop/
│   │   ├── authority.py         # LoopAuthority singleton + SecondLoopDetected
│   │   ├── agent_loop.py        # AgentLoop: turn driver, steer/queue/abort
│   │   ├── turn.py              # is_turn_complete(), TurnState, terminal signal
│   │   ├── request.py           # RequestPayload + RequestBuilder (the ONLY sender)
│   │   ├── compaction.py        # HaloContextEngine wrapper + commit/validate
│   │   ├── recovery.py          # epoch reclaim, unknown admissions, FTS audit
│   │   └── _vendor.py           # the ONLY module allowed to import agent.*
│   ├── state/
│   │   ├── schema.sql           # DDL (Pattern 2) + triggers
│   │   ├── migrations.py        # versioned runner (halo_schema_version)
│   │   ├── store.py             # SessionStore: writer thread + reader pool
│   │   ├── admissions.py        # FIFO state machine
│   │   ├── sessions.py          # resume/list/search/branch/export/import
│   │   └── paths.py             # Windows data-dir resolution + network refusal
│   ├── provider/
│   │   ├── transport.py         # HTTP send + streaming; recorder hook
│   │   └── mock.py              # deterministic OpenAI-compatible server (tests)
│   ├── admission.py             # secret redaction before insert/send
│   └── cli.py                   # minimal `halo-agent sessions …` verbs (LOOP-03)
└── tests/
    ├── conftest.py              # tmp store, clock, loop factory, killable child
    ├── state/                   # schema, admission, crash, FTS, export/branch
    ├── loop/                    # single-loop gate, turn lifecycle, steer/interrupt
    ├── mirror/                  # request builder, >1 MiB fixture
    └── evals/                   # 12 golden sessions + JSONL ledgers (Section 5 of AI-SPEC)
```

### Pattern 1: One writer thread, many read-only processes

**What:** `SessionStore` owns exactly one writable connection, created *inside* a dedicated thread that consumes a `queue.SimpleQueue` of write operations. Every async API returns a future completed by that thread. Readers open `file:<path>?mode=ro` (URI) with `PRAGMA query_only=ON` and never write.

**Why:** the daemon is asyncio-first, but a synchronous `sqlite3` write on the event loop blocks every stream; and `check_same_thread=True` (the default) forbids passing a connection between threads. Creating the connection in the writer thread makes the default check *correct* rather than an obstacle [CITED: docs.python.org/3/library/sqlite3.html — "If `True` (default), `ProgrammingError` will be raised if the database connection is used by a thread other than the one that created it"].

**Pragmas at open (on the writer connection), with the return value checked:**

```python
conn = sqlite3.connect(str(db_path), isolation_level=None, timeout=5.0)
mode = conn.execute("PRAGMA journal_mode=WAL").fetchone()[0]
if mode.lower() != "wal":
    raise StoreNotWal(f"journal_mode={mode!r}; refusing to run on a non-WAL store")
conn.execute("PRAGMA synchronous=FULL")
conn.execute("PRAGMA foreign_keys=ON")
conn.execute("PRAGMA busy_timeout=5000")
```

The check matters because SQLite documents a silent non-conversion: "If the conversion to WAL could not be completed (for example, if the VFS does not support the necessary shared-memory primitives) then the journaling mode will be unchanged and the string returned by the primitive will be the prior journaling mode (for example 'delete')" [CITED: sqlite.org/wal.html]. A `delete`-mode store still "works" until two processes write — exactly the silent degradation the AI-SPEC warns about.

**Write transaction shape:** `BEGIN IMMEDIATE` → statements → `COMMIT`. `BEGIN IMMEDIATE` surfaces contention at transaction start instead of mid-transaction, and it is what upstream's `SessionDB` uses [CITED: session-storage — "**BEGIN IMMEDIATE** transactions to surface lock contention at transaction start"]. Retry policy copied from upstream's documented constants (they are evidence, not invention): 1 s SQLite timeout, jittered application retry 20–150 ms for the first 2 s then 250 ms–1 s, 20 s budget for routine writes and 60 s for transcript writes, plus a PASSIVE checkpoint every 50 successful writes [CITED: session-storage]. HALO's own single-writer design makes contention rare (other processes are read-only), so the retry is a safety net for external tools and checkpoints — keep it, do not rely on it.

**Checkpointing:** keep `wal_autocheckpoint=1000` (default) and add an explicit `PRAGMA wal_checkpoint(PASSIVE)` every 50 writes, mirroring upstream. Warn in the store's health payload if `wal_checkpoint` reports a non-zero backfill count for N consecutive calls (a long reader is starving checkpoints — documented behavior) [CITED: wal.html §6 "Checkpoint starvation"].

**Windows path refusal:** before opening, resolve the data dir through Phase 2's `resolve_home()` (never re-implement it) and refuse when the path is a UNC path (`\\`) or `GetDriveTypeW(root) == DRIVE_REMOTE` (4). Refusal is a typed startup error naming the configured path and the rule. This is structural because WAL "does not work over a network filesystem… all processes must exist on the same machine" [CITED: wal.html §1].

**Do not** share one connection across `asyncio.to_thread` calls: `threadsafety == 3` is true on today's build [VERIFIED: live probe], but it is a *compile-time* property of the bundled SQLite, not a guarantee of the shipped interpreter; relying on it would make the store's correctness depend on a build flag.

### Pattern 2: Schema direction (HALO-owned, upstream-compatible)

**What:** one `state.db` per HALO home, WAL, with upstream's documented table names preserved so the documented semantics (and future manual back-ports) stay legible, plus HALO tables for generations, turns, admissions, mirrors and compaction.

**Row classes in `messages` (this distinction is what makes LOOP-05 checkable):**

| Class | Predicate | Replayed into future requests? | Visible in the transcript? |
|---|---|---|---|
| live | `active=1` | yes | yes |
| request-scoped context (budget warnings, policy notes, advisor asides) | `active=0 AND request_id IS NOT NULL` | no | yes, with `display_kind` |
| compaction archive | `active=0 AND compacted=1` | no | yes (searchable, uid-preserved) |
| superseded | `active=0` otherwise | no | yes (audit) |

An injection merged *into* a user message is not a separate row: the row stays `active=1`, and `api_content` carries the bytes actually sent while `content` carries the display text — the documented `api_content` contract ("the exact content string sent to the API for this message when it differs from `content`… `NULL` means `content` was sent verbatim") [CITED: session-storage].

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;
PRAGMA foreign_keys=ON;

CREATE TABLE schema_version(version INTEGER NOT NULL);          -- upstream namespace
CREATE TABLE halo_schema_version(version INTEGER NOT NULL);     -- HALO additions
CREATE TABLE state_meta(k TEXT PRIMARY KEY, v TEXT);

CREATE TABLE sessions(
  id TEXT PRIMARY KEY,                       -- uuid7 hex
  source TEXT NOT NULL,                      -- cli|desktop|subagent|cron|kanban|tool
  parent_session_id TEXT REFERENCES sessions(id),
  origin TEXT NOT NULL CHECK(origin IN ('fresh','branch','import')),
  title TEXT,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL,
  model TEXT, model_config TEXT, cwd TEXT,
  transcript_id TEXT NOT NULL,               -- active generation
  generation INTEGER NOT NULL DEFAULT 0,
  next_seq INTEGER NOT NULL DEFAULT 0,
  context_length INTEGER, threshold_tokens INTEGER,
  last_prompt_tokens INTEGER, last_completion_tokens INTEGER, last_total_tokens INTEGER,
  usage_anchor_json TEXT,                    -- provider anchor + content fingerprint
  compression_count INTEGER NOT NULL DEFAULT 0,
  clean_shutdown INTEGER,                    -- 1 only after a clean daemon close
  archived INTEGER NOT NULL DEFAULT 0,
  auto_archived INTEGER NOT NULL DEFAULT 0,
  end_reason TEXT
);
CREATE UNIQUE INDEX sessions_title_unique ON sessions(title) WHERE title IS NOT NULL;

CREATE TABLE transcripts(
  transcript_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  generation INTEGER NOT NULL,
  parent_transcript_id TEXT REFERENCES transcripts(transcript_id),
  reason TEXT NOT NULL CHECK(reason IN ('initial','compaction','reset','branch','import')),
  created_at REAL NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(session_id, generation)
);
-- exactly one live generation per session
CREATE UNIQUE INDEX transcripts_one_active ON transcripts(session_id) WHERE active=1;

CREATE TABLE turns(
  turn_id TEXT PRIMARY KEY,                  -- uuid7, globally unique
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  transcript_id TEXT NOT NULL REFERENCES transcripts(transcript_id),
  admission_id TEXT NOT NULL,
  origin_turn_id TEXT,                       -- branch provenance
  started_at REAL,
  terminal_at REAL,                          -- authoritative terminal signal observed
  closed_at REAL,
  close_reason TEXT CHECK(close_reason IN ('completed','interrupted','budget_exhausted','error')),
  terminal_message_uid TEXT,
  outcome_unknown INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE turn_background_work(
  work_id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL REFERENCES turns(turn_id) ON DELETE RESTRICT,
  kind TEXT NOT NULL,                        -- shell|task|eval|custom
  state TEXT NOT NULL CHECK(state IN ('pending','running','done','failed','dropped')),
  created_at REAL NOT NULL, finished_at REAL
);
CREATE INDEX turn_bg_open ON turn_background_work(turn_id) WHERE state IN ('pending','running');

CREATE TABLE session_admissions(
  admission_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK(kind IN ('prompt','steer','follow_up')),
  text TEXT NOT NULL,                        -- post-redaction
  images_json TEXT,
  state TEXT NOT NULL CHECK(state IN ('queued','started','terminal','unknown')),
  ordered_seq INTEGER NOT NULL,
  idempotency_key TEXT,
  owner_epoch TEXT,
  enqueued_at REAL NOT NULL,
  started_at REAL, terminal_at REAL,
  terminal_reason TEXT,
  turn_id TEXT,                              -- no FK: turns.admission_id is the forward edge
  UNIQUE(session_id, ordered_seq),
  UNIQUE(session_id, idempotency_key)
);
CREATE INDEX admissions_fifo ON session_admissions(session_id, state, ordered_seq);
CREATE INDEX admissions_unknown ON session_admissions(session_id) WHERE state='unknown';

CREATE TABLE runtime_epoch(
  id INTEGER PRIMARY KEY CHECK(id=1),
  epoch TEXT NOT NULL, pid INTEGER NOT NULL,
  process_started_at REAL NOT NULL, instance_id TEXT NOT NULL,
  started_at REAL NOT NULL, heartbeat_at REAL
);

CREATE TABLE messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  transcript_id TEXT NOT NULL REFERENCES transcripts(transcript_id),
  seq INTEGER NOT NULL,                      -- monotonic per session, gap-free
  turn_id TEXT REFERENCES turns(turn_id),
  request_id TEXT,                           -- set only on request-scoped context rows
  role TEXT NOT NULL CHECK(role IN ('system','user','assistant','tool')),
  content TEXT,
  api_content TEXT,                          -- bytes-as-sent when != content
  sent_sha256 TEXT,                          -- canonical post-strip message hash
  sent_bytes INTEGER,
  message_uid TEXT NOT NULL,                 -- 32-hex, minted once, copied by every clone
  absorbed_message_uids TEXT,                -- JSON list (merge witness)
  tool_calls TEXT, tool_call_id TEXT, tool_name TEXT,
  tool_call_uids TEXT, tool_call_uid TEXT,
  display_kind TEXT NOT NULL DEFAULT 'chat'
    CHECK(display_kind IN ('chat','memory_context','policy_note','compaction','budget_warning','tool_error')),
  display_metadata TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  compacted INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL,
  finish_reason TEXT,
  reasoning TEXT, reasoning_content TEXT, reasoning_details TEXT,
  UNIQUE(session_id, seq)
);
CREATE INDEX messages_live ON messages(transcript_id, active, seq);
CREATE INDEX messages_session_seq ON messages(session_id, seq);
CREATE INDEX messages_uid ON messages(session_id, message_uid);
```

**FTS5 (external content, trigger-synced) — with `UPDATE OF` so flag flips do not re-index:**

```sql
CREATE VIRTUAL TABLE messages_fts USING fts5(
  content, tool_name, tool_calls,
  content='messages', content_rowid='id', tokenize='unicode61'
);
CREATE VIRTUAL TABLE messages_fts_trigram USING fts5(
  content, content='messages', content_rowid='id', tokenize='trigram'
);

CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content, tool_name, tool_calls)
    VALUES (new.id, new.content, new.tool_name, new.tool_calls);
  INSERT INTO messages_fts_trigram(rowid, content) VALUES (new.id, new.content);
END;

-- fires ONLY when an indexed column is in the SET list
CREATE TRIGGER messages_au AFTER UPDATE OF content, tool_name, tool_calls ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content, tool_name, tool_calls)
    VALUES('delete', old.id, old.content, old.tool_name, old.tool_calls);
  INSERT INTO messages_fts(rowid, content, tool_name, tool_calls)
    VALUES (new.id, new.content, new.tool_name, new.tool_calls);
  INSERT INTO messages_fts_trigram(messages_fts_trigram, rowid, content)
    VALUES('delete', old.id, old.content);
  INSERT INTO messages_fts_trigram(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content, tool_name, tool_calls)
    VALUES('delete', old.id, old.content, old.tool_name, old.tool_calls);
  INSERT INTO messages_fts_trigram(messages_fts_trigram, rowid, content)
    VALUES('delete', old.id, old.content);
END;
```

Probed on SQLite 3.53.1: flipping `active` fired only the INSERT trigger (log `ai`), the index still matched, and a later content update produced `ai,au-content` with the old term gone and the new term found [VERIFIED: live probe]. External-content triggers must use the special `'delete'` command with the **old** values; the FTS5 docs give exactly this trigger shape and warn that consistency is the caller's responsibility [CITED: sqlite.org/fts5.html §4.4.3/§4.4.4]. Note also that external-content tables "do not support REPLACE conflict handling" [CITED: same] — never use `INSERT OR REPLACE` into the FTS table.

**Remaining tables (HALO additions):**

```sql
CREATE TABLE request_manifests(
  request_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL, transcript_id TEXT NOT NULL, turn_id TEXT,
  built_at REAL NOT NULL, model TEXT, provider TEXT, api_mode TEXT,
  message_count INTEGER NOT NULL, bytes_total INTEGER NOT NULL,
  request_sha256 TEXT NOT NULL, tools_sha256 TEXT, system_sha256 TEXT,
  status TEXT NOT NULL CHECK(status IN ('built','sent','failed'))
);
CREATE TABLE mirror_manifest(
  request_id TEXT NOT NULL REFERENCES request_manifests(request_id) ON DELETE CASCADE,
  position INTEGER NOT NULL, message_uid TEXT NOT NULL, seq INTEGER,
  role TEXT NOT NULL, sent_sha256 TEXT NOT NULL, bytes_len INTEGER NOT NULL,
  PRIMARY KEY(request_id, position)
);
CREATE TABLE session_model_usage(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL, transcript_id TEXT, turn_id TEXT, request_id TEXT,
  model TEXT, provider TEXT,
  purpose TEXT NOT NULL CHECK(purpose IN ('turn','memory','compaction','auxiliary','title')),
  prompt_tokens INTEGER, completion_tokens INTEGER, total_tokens INTEGER,
  cache_read_tokens INTEGER, cache_write_tokens INTEGER, reasoning_tokens INTEGER,
  estimated_cost_usd REAL, actual_cost_usd REAL, pricing_version TEXT,
  recorded_at REAL NOT NULL
);
CREATE INDEX usage_by_turn ON session_model_usage(session_id, turn_id);

CREATE TABLE tool_invocations(
  invocation_id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL REFERENCES turns(turn_id) ON DELETE RESTRICT,
  tool_call_uid TEXT NOT NULL, tool_name TEXT NOT NULL, backend TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('reserved','dispatched','completed','failed','interrupted','unknown')),
  reserved_at REAL NOT NULL, dispatched_at REAL, finished_at REAL,
  policy_decision_id TEXT,                   -- Phase 4 fills; NULL is a declared gap until then
  error_kind TEXT
);

CREATE TABLE compaction_archives(
  archive_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, transcript_id TEXT NOT NULL,
  digest TEXT NOT NULL, message_count INTEGER NOT NULL,
  payload TEXT NOT NULL, created_at REAL NOT NULL,
  UNIQUE(session_id, digest)
);
CREATE TABLE compaction_runs(
  run_id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
  from_transcript_id TEXT, to_transcript_id TEXT,
  trigger TEXT NOT NULL CHECK(trigger IN ('preflight','manual','overflow','post_tool','idle')),
  status TEXT NOT NULL CHECK(status IN ('running','committed','blocked','failed','aborted','interrupted')),
  failure_class TEXT,
  messages_before INTEGER, messages_after INTEGER,
  tokens_before INTEGER, tokens_after INTEGER, token_method TEXT,
  archive_digest TEXT, started_at REAL NOT NULL, finished_at REAL
);

CREATE TABLE loop_events(
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT, turn_id TEXT, request_id TEXT,
  ts REAL NOT NULL, kind TEXT NOT NULL, payload_json TEXT
);
```

**Immutability guards (the structural half of LOOP-06):**

```sql
CREATE TRIGGER turns_no_reopen BEFORE UPDATE OF closed_at ON turns
WHEN OLD.closed_at IS NOT NULL AND NEW.closed_at IS NULL
BEGIN SELECT RAISE(ABORT,'turn_reopen_forbidden'); END;

-- terminal_at may ADVANCE while the turn is open (a background result can resume the
-- turn and produce a later terminal signal); it freezes the moment the turn closes.
CREATE TRIGGER turns_terminal_frozen_after_close BEFORE UPDATE OF terminal_at ON turns
WHEN OLD.closed_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'terminal_signal_frozen_after_close'); END;

CREATE TRIGGER messages_no_append_after_close BEFORE INSERT ON messages
WHEN NEW.turn_id IS NOT NULL AND EXISTS(
  SELECT 1 FROM turns WHERE turn_id = NEW.turn_id AND closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'turn_already_closed'); END;

CREATE TRIGGER admissions_legal_transition BEFORE UPDATE OF state ON session_admissions
WHEN NOT (
  (OLD.state='queued'  AND NEW.state IN ('started','terminal')) OR
  (OLD.state='started' AND NEW.state IN ('terminal','unknown')) OR
  (OLD.state='unknown' AND NEW.state='terminal')
)
BEGIN SELECT RAISE(ABORT,'illegal_admission_transition'); END;
```

`terminal_at` is deliberately *not* write-once: a turn held open by outstanding background work can resume, emit a later terminal signal, and only then close — so the column advances while `closed_at IS NULL` and freezes at close. Probed against this exact DDL: the reopen guard aborts with `turn_reopen_forbidden`, an `INSERT` into a closed turn aborts with `turn_already_closed`, a post-close `terminal_at` change aborts with `terminal_signal_frozen_after_close`, and an illegal admission transition aborts with `illegal_admission_transition` [VERIFIED: live probe, full DDL executed]. These triggers are why "a finished turn never reopens" is a fact about the store, not a convention.

### Pattern 3: Durable admission FIFO (queue / follow-up / steer)

**What:** every user input becomes a row *before* the loop touches it. The row's state is the crash-recovery record: `queued → started → terminal`, or `started → unknown` when the owner dies.

**Upstream evidence for the semantics (verbatim):** "`session_admissions`, `worker_executions` and `worker_receipts` reference `sessions` with `ON DELETE RESTRICT`… An input that was `started` when its owner died becomes `unknown` at the next owner start and is never replayed; its later inputs wait until it is resolved (`prompt.resolve_unknown`)." [CITED: hermes-agent.nousresearch.com/docs/developer-guide/session-storage]. The column list of upstream's `session_admissions` is **not** documented; HALO defines its own (above) and must verify at import that the name is not already occupied with an incompatible shape.

**`admit()` — ordering of checks is part of the contract:**

```python
def _admit(conn, session_id, kind, text, idempotency_key, now, epoch):
    conn.execute("BEGIN IMMEDIATE")
    # 1. idempotent retry returns the ORIGINAL row (lost-ACK safety),
    #    even if its state has since moved.
    if idempotency_key:
        row = conn.execute(
            "SELECT * FROM session_admissions WHERE session_id=? AND idempotency_key=?",
            (session_id, idempotency_key)).fetchone()
        if row is not None:
            conn.execute("COMMIT"); return row
    # 2. an unresolved unknown blocks EVERY later input for the session.
    blocked = conn.execute(
        "SELECT admission_id FROM session_admissions "
        "WHERE session_id=? AND state='unknown' ORDER BY ordered_seq LIMIT 1",
        (session_id,)).fetchone()
    if blocked is not None:
        conn.execute("COMMIT"); raise AdmissionBlocked(blocked["admission_id"])
    # 3. append at the tail of the durable FIFO.
    nxt = conn.execute(
        "SELECT COALESCE(MAX(ordered_seq), -1) + 1 FROM session_admissions WHERE session_id=?",
        (session_id,)).fetchone()[0]
    ...INSERT...
    conn.execute("COMMIT")
```

`resolve_unknown(admission_id, decision)` is an explicit, user-visible action that moves `unknown → terminal` with a recorded reason (`discarded`, `abandoned_side_effects_unknown`). It is never automatic. A second `steer` on the same turn is admitted as a separate row (`kind='steer'`), because the durable record must exist even when the steer is folded into a message rather than starting a turn.

**Behaviour mapping to the three documented busy-input modes** [CITED: hermes-agent.nousresearch.com/docs/user-guide/cli — `"queue"` / `"steer"` / `"interrupt"`]: `interrupt` = cancel the live turn and admit the new text as the next prompt; `steer` = admit as `kind='steer'` and deliver at the next tool-result boundary (or fold immediately if the assistant has not yet produced anything); `queue` = admit as `kind='follow_up'`, drained after the current turn reaches `terminal` and closes. Mode is a per-session setting (`display.busy_input_mode` upstream; HALO's settings key comes from Phase 2's generated vocabulary).

### Pattern 4: Turn lifecycle with one terminal predicate

**What:** `is_turn_complete()` is a single pure function over persisted state; `close_turn()` is the only writer that can set `closed_at`, and it runs the predicate inside the same `BEGIN IMMEDIATE` transaction as the update, so there is no TOCTOU window.

```python
def is_turn_complete(conn, turn_id: str) -> bool:
    t = conn.execute("SELECT terminal_at FROM turns WHERE turn_id=?", (turn_id,)).fetchone()
    if t is None or t["terminal_at"] is None:
        return False                                     # no authoritative terminal signal
    bg = conn.execute(
        "SELECT COUNT(*) FROM turn_background_work "
        "WHERE turn_id=? AND state IN ('pending','running')", (turn_id,)).fetchone()[0]
    tools = conn.execute(
        "SELECT COUNT(*) FROM tool_invocations "
        "WHERE turn_id=? AND state IN ('reserved','dispatched')", (turn_id,)).fetchone()[0]
    return bg == 0 and tools == 0
```

**What the terminal signal *is* for HALO.** HALO's loop is the authority, so it emits a typed `TurnTerminal{turn_id, reason, terminal_message_uid}` record. The OMP wire semantics the AI-SPEC cites are the *model* for what "terminal" must exclude, and they are quoted here because they are the sharpest available statement of the trap: "`yielded` is `true` when the agent finished its turn: the end is terminal, or the session resumes only for queued input or background-job results. It is `false` while the agent continues its own work (retry, compaction continuation, stop-time reminders)… `isTerminal: false` means a continuation or possible async delivery remains. `awaitingAsyncWork: true` identifies a non-terminal end whose only possible resume is a background-job result" [CITED: github.com/can1357/oh-my-pi/blob/main/docs/rpc.md]. Therefore: a yield with outstanding turn-bound work keeps the turn open; a yield with only detached work (a memory retain, an unawaited operation) closes it, and the detached operation row is marked `unawaited` — exactly the distinction the AI-SPEC draws [VERIFIED: `03-AI-SPEC.md:233`].

**Quiescence is a different predicate.** `session_quiescent(session_id) = no live run AND no queued/started admission AND no outstanding background work` — computed on read, never persisted as a turn flag, never used to close a turn. Upstream makes the same separation explicit: "the session is done only at `session_settled`: background jobs can wake the agent after it yields" [CITED: rpc.md].

**Interrupt ordering (the case that corrupts histories):**
1. Stop the provider stream and discard the partial assistant text — no row is written for it (upstream: "No partial response is injected into conversation history" [CITED: agent-loop]).
2. For every `tool_invocations` row in `reserved` (never dispatched), write a synthetic `tool` result row in **original call order** with `error_kind='interrupted'` and set the invocation `state='interrupted'`.
3. A `dispatched` invocation may already have had its side effect: set `state='unknown'` and write the synthetic result with `error_kind='side_effect_unknown'` rather than claiming it did not run. (Recovery does the same for rows found in `dispatched` after a crash.) Neither state blocks the close — the transcript is continuable because every issued call now has a result row.
4. Close the turn with `close_reason='interrupted'` only if `is_turn_complete()` holds; a turn with a still-running background job stays open.

**Steer folding (never two user rows):**
```python
def fold_user(conn, session_id, transcript_id, text, *, absorbed_uid=None):
    last = conn.execute(
        "SELECT message_uid, role, content FROM messages WHERE session_id=? AND active=1 "
        "ORDER BY seq DESC LIMIT 1", (session_id,)).fetchone()
    if last is not None and last["role"] == "user":
        merged = last["content"] + "\n\n" + text
        conn.execute("UPDATE messages SET content=? WHERE message_uid=? AND active=1",
                     (merged, last["message_uid"]))
        # record the absorbed uid in absorbed_message_uids on the survivor
    else:
        ...append a new user row...
```
The alternation rules are upstream-documented and provider-enforced: "After the system message: `User → Assistant → User → Assistant`… **Never** two assistant messages in a row. **Never** two user messages in a row. **Only** `tool` role can have consecutive entries" [CITED: agent-loop]. Merging must keep the first constituent's uid and record the others in `absorbed_message_uids` — the documented merge-witness rule [CITED: context-engine-plugin].

### Pattern 5: Mirror-or-drop — one request builder, one byte source, >1 MiB safe

**What:** the transcript is not "what we think we sent". It is a set of `messages` rows whose hashes are proven against the bytes that left the process, on every request.

**The invariant, stated precisely:**
> For request *R*: `R.body` is a JSON document; its `messages` array has length `n`; for each position *i*, `sha256(canonical(msg_i))` equals the `sent_sha256` stored on the `messages` row referenced by `mirror_manifest(R, i)`, and `mirror_manifest`'s uid/order equals the transcript's projected order. `messages` rows for context that exists only in *R* are inserted with `request_id = R` so they are visible but never replayed.

**Why one builder is the whole mechanism:** an invariant checked after the fact can be "fixed" by editing the checker. The structural version is that a message list cannot reach a provider except through `RequestBuilder.build()`, whose return value (`RequestPayload`) is the only argument `ProviderTransport.send()` accepts, and whose constructor persists the manifest inside the same call:

```python
@dataclass(frozen=True, slots=True)
class RequestPayload:
    request_id: str
    body: bytes                       # the exact bytes handed to the HTTP layer
    manifest: tuple[MirrorRow, ...]
    message_count: int
    bytes_total: int
    request_sha256: str

class RequestBuilder:
    def build(self, *, session_id, transcript_id, turn_id, model, api_mode) -> RequestPayload:
        msgs = self._project_active(transcript_id)          # active=1 in seq order
        msgs += self._ephemeral_layers(session_id, turn_id) # request-scoped rows
        body = self._serialize(msgs, model=model, api_mode=api_mode)
        rows = tuple(MirrorRow(position=i, message_uid=m["message_uid"], seq=m.get("_seq"),
                               role=m["role"], sent_sha256=canonical_hash(m),
                               bytes_len=len(canonical_bytes(m)))
                     for i, m in enumerate(msgs))
        self._store.record_request(...)                      # manifest + context rows, one txn
        return RequestPayload(...)
```

`canonical_bytes` strips the persistence-only fields first, because those fields are excluded from the outgoing payload by the runtime: "`message_uid`, `_absorbed_message_uids`, `_tool_call_uids` and `_tool_call_uid` are in `PERSISTENCE_ONLY_MESSAGE_FIELDS`: stripped from every outgoing provider copy and ignored by the token estimator" [CITED: context-engine-plugin]. Hashing before the strip would produce a hash of bytes the model never sees.

```python
PERSISTENCE_ONLY_FIELDS = frozenset({
    "message_uid", "_message_uid", "absorbed_message_uids", "_absorbed_message_uids",
    "tool_call_uids", "_tool_call_uids", "tool_call_uid", "_tool_call_uid",
    "_row_id",
})

def canonical_bytes(msg: Mapping[str, Any]) -> bytes:
    stripped = {k: v for k, v in msg.items() if k not in PERSISTENCE_ONLY_FIELDS}
    return json.dumps(stripped, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False).encode("utf-8")

def canonical_hash(msg: Mapping[str, Any]) -> str:
    return hashlib.sha256(canonical_bytes(msg)).hexdigest()
```

The exact field set must be re-read at the import SHA (Research Flag R8); the constant above is the documented set as of the docs fetch, and a mismatch would make every turn fail the dev check loudly — the safe direction.

**Where "sent" bytes come from.** Tests must mock at the **HTTP layer**, not at a client object: a `ThreadingHTTPServer` on `127.0.0.1:0` that records `request.body` (read fully via `Content-Length`) to a file and replays scripted SSE chunks. A mocked `client.chat.completions.create()` proves nothing about serialization, which is exactly the layer LOOP-05 is about. In dev builds a recording transport wraps the SDK's `http_client` and compares `sha256(captured body)` to `request_manifests.request_sha256`; in production the manifest alone is written (cheap) and the body is not retained.

**>1 MiB handling — five concrete requirements:**

1. **Read bodies as documents, never as lines.** `body = await response.aread()` / `request.content`; assert `len(body) == int(headers["content-length"])`. Iterating `for line in response` is legitimate only for SSE *response* streams, which are line-delimited by protocol.
2. **Hash by streaming or plain `bytes`**, never by truncation. A 2 MiB message is 0.2 % of SQLite's text cap: `SQLITE_LIMIT_LENGTH` reports `1_000_000_000` on this build [VERIFIED: live probe].
3. **Store the row, not a summary.** `messages.content`/`api_content` carry the full text; the probe stored 2,097,165 bytes exactly and FTS5 matched both a whole-token and a trigram-substring probe past the 1 MiB mark [VERIFIED: live probe].
4. **Never put a body into a size-capped logger.** `loop_events` records `request_id`, `bytes_total`, `request_sha256` and the per-message hashes — never the body. If a body must be retained for a fixture, write it to `tests/fixtures/…` or a temp file, not to a JSONL line.
5. **Transport framing for surfaces is deferred, not forgotten.** Phase 3 has no wire, so its API returns complete objects. Any future transport (Phase 5 core frames, Phase 10 daemon WS) must chunk at 1 MiB and reassemble, and the OMP protocol already specifies the shape: physical frames capped at `maxFrameBytes: 1048576`, oversized objects as `rpc_chunk` with `chunkId/index/count/byteLength` under a `maxReassembledFrameBytes: 67108864` cap [CITED: rpc.md]. Write that requirement into the Phase 5/10 handoff now.

**Unicode edge case (a real bind failure):** `sqlite3` raises `UnicodeEncodeError: 'utf-8' codec can't encode character '\ud800'` when binding a lone surrogate [VERIFIED: live probe]. The runtime already scrubs lone surrogates "from every outgoing payload" [CITED: session-storage]; HALO must scrub **before** hashing and persisting, otherwise the stored hash describes bytes that cannot exist.

### Pattern 6: Compaction — one engine, one lineage, provider-truth accounting

**Ownership.** Exactly one `ContextEngine` is registered; upstream rejects a second registration ("Only one engine can be registered. A second plugin attempting to register is rejected with a warning." [CITED: context-engine-plugin]). HALO's engine name and identity are asserted at startup (`engine.name == "halo"`), and the registration happens before the first agent is constructed.

**Which switch makes it single-sourced.** Upstream documents a checkpoint contract (API v2) that binds **every** compaction authority, not just the summarizer: "The gate binds to every compaction authority, not just the Hermes summarizer: server-side native compaction (`compression.codex_responses_native`) is suppressed while the gate is armed, post-turn micro-compaction (`compression.micro_compact`) is forced off at agent init… and the `codex_app_server` API mode is refused at agent init" [CITED: memory-provider-plugin]. It also states the failure mode exactly: "Enabling `checkpoint_required` without one therefore blocks every compression attempt (manual and automatic)" [CITED: same]. So the plan must do the two things *in one task*: (a) register HALO's archiving provider with `pre_compress_checkpoint_api_version = 2`, (b) set `compression.checkpoint_required: true`. Arming only (b) wedges the session; shipping only (a) leaves other authorities alive.

**HALO's Phase-3 provider (a real implementation, not a stub):**

```python
class TranscriptArchiveProvider(MemoryProvider):
    pre_compress_checkpoint_api_version = 2

    def on_pre_compress(self, messages, *, require_checkpoint=False):
        evidence = [{"message_uid": m["message_uid"], "role": m["role"],
                     "content": m.get("content") or "", "api_content": m.get("api_content")}
                    for m in messages if m.get("role") in ("user", "assistant")]
        digest = hashlib.sha256(json.dumps(evidence, sort_keys=True,
            separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest()
        self._store.put_archive(session_id=self._session_id, digest=digest,
                                payload=evidence, transcript_id=self._transcript_id)  # committed
        return f"checkpoint:sha256:{digest}"
```

It is durable before returning, idempotent by `(session_id, digest)` (the docs require idempotency because a blocked attempt is retried with the same transcript), and it filters to user/assistant text rows exactly as the v2 contract specifies [CITED: memory-provider-plugin]. Phase 8 can mirror the same rows into Hindsight without changing the contract.

**Compaction is a generation rotation, committed atomically.** Upstream now defaults to in-place compaction: "With `compression.in_place: true` (the default), a compaction **rewrites the live message list on the same session id**… the pre-compaction turns are soft-archived under the same id (`active=0, compacted=1` in the session store) — still searchable via `session_search` and recoverable, never deleted. There is no `parent_session_id` chain" [CITED: context-compression-and-caching]. HALO's `transcript_id` is therefore a *generation*, not a session: `SEQUENCE` in one `BEGIN IMMEDIATE` transaction:

```text
0. (before) on_pre_compress already committed its archive row          [fail-closed]
1. validate the candidate list: system prompt unchanged; alternation valid;
   protected-tail uids present in order with identical content hashes;
   every assistant(tool_calls) still has its tool rows; no uid is None
2. transcripts(old).active = 0
3. INSERT transcripts(new, generation = old+1, parent_transcript_id = old, reason='compaction', active=1)
4. UPDATE messages SET active=0, compacted=1 WHERE transcript_id = old AND active=1   -- no FTS trigger
5. INSERT retained rows (summary + protected tail) into the new generation, same message_uid, new seq;
   summary row gets display_kind='compaction' (+ 'compaction' in display_metadata)
6. UPDATE sessions SET transcript_id=new, generation=gen+1, compression_count=compression_count+1
7. INSERT compaction_runs(status='committed', tokens_before/after, token_method, archive_digest)
COMMIT
```

Step 1 is the guard that turns "the engine returned a list" into "the engine returned a *continuable* list". Step 4 is free of FTS cost thanks to `UPDATE OF` (Pattern 2). Step 5's uid preservation is what makes identity survive: "`message_uid`… is minted once at a row's first insert and copied by every clone (in-place compaction generations, rotation children, concurrent-tail clones, `replace_messages` re-issues, export/import), so one logical message keeps one uid while its physical `id` changes" [CITED: session-storage].

**Accounting.** Provider usage is the only number:
- After every provider call, `update_from_response(usage)` runs and the loop writes one `session_model_usage` row with `purpose='turn'` (memory-side usage is `purpose='memory'` and never folded into the turn's context %).
- `should_compress()` compares the engine's `threshold_tokens` with the **usage anchor** — "the provider's last prompt and completion token counts plus a rough estimate of ONLY the messages appended since that response", identified by a content fingerprint and persisted so a fresh process restores it [CITED: context-compression-and-caching]. HALO stores that anchor in `sessions.usage_anchor_json`.
- The user-visible context % is `last_prompt_tokens / context_length` from the last accepted usage. Upstream's UI marks an estimate with `~`; HALO must do the same rather than silently mixing the two [CITED: hermes docs user-guide/cli, status bar].
- The **drift probe** is trivial by construction: `session_model_usage` must equal the usage dict verbatim. A test feeds pinned usage from the mock provider and asserts exact equality, and asserts the context % equals `prompt_tokens / context_length` with no arithmetic of HALO's own.

**Triggers and overflow.** Preflight before the API call, aggressive auto-compaction between turns (upstream's gateway hygiene is a *second* authority at a fixed 85 % — Research Flag R5), manual `compress(focus_topic=…)`, and provider-proven overflow: a context-length rejection triggers **one bounded** compaction attempt and a retry, never ad-hoc history truncation [CITED: context-compression-and-caching — "Provider-proven overflow… the recovery pass ignores the cooldown for one bounded attempt (`max_compression_attempts`)"].

### Pattern 7: Proving "no alternate loop exists in the process"

Four independent gates; any one alone is insufficient, together they are a proof obligation a test can discharge:

| # | Gate | Mechanism | What it catches |
|---|------|-----------|-----------------|
| G1 | **Static import graph** | AST scan over `packages/halo_agent/**/*.py`: `import agent.conversation_loop`, `run_agent`, `agent.agent_init`, `agent.tool_executor`, `model_tools`, `hermes_state` may appear **only** in `loop/_vendor.py`; `AIAgent(`, `run_conversation(`, `.chat(` may appear only in `loop/_vendor.py` and `loop/agent_loop.py` | A new module wiring a second loop at import time |
| G2 | **Runtime authority** | `LoopAuthority` holds a module-level singleton; `create_authority()` raises `SecondLoopDetected` on a second call; `AgentLoop`'s constructor requires the token object that only `create_authority()` mints | A second loop constructed at runtime (plugin, test, extension host) |
| G3 | **Store ownership** | `SessionStore.open_writable()` reads `runtime_epoch`; if another **live** process owns the epoch, it refuses with `StoreOwnedElsewhere`; readers use `mode=ro` only | A second process writing the transcript |
| G4 | **Protocol violation** | The adapter seam raises `SecondLoopDetected` if a turn-starting command/frame ever reaches a *tool-backend* session (the OMP rule Phase 5 inherits: `agent_start`/`agent_end`/`prompt_result`/`session_settled` on a tool-backend session are protocol violations) | The demoted loop coming back through a wrapper (P-04) |

G1 is the cheapest and the one that survives refactors; G2 is what makes the test suite able to *attempt* the violation and observe the refusal. Both belong in the same test: construct a hostile module that imports `_vendor` and calls `AIAgent.chat()`, assert the static gate flags it **and** that the runtime guard refuses a second authority. Deliberately do not expose `chat()` on the wrapper: the facade imports the class, so the guard must be the authority token, not a missing attribute.

**What HALO may and may not import:** the architecture rule is "`packages/halo_agent` never imports `vendor/hindsight`… It may import Hermes modules (same process), but only through the `loop/` facade" [CITED: `.planning/research/ARCHITECTURE.md` §7]. `_vendor.py` is that facade: it re-exports factory functions (`make_agent`, `compressor_for`, `provider_for`) rather than classes where possible.

**Turn driver vs `run_conversation`.** Decision rule for the plan (Research Flag R3):
- If the vendored `AIAgent` accepts an injected store/persistence callback, HALO wraps `run_conversation` and supplies `SessionStore`; the loop's own session DB is never opened.
- Otherwise, patch the two persistence call sites (load history, persist assistant turn) through `patches/series` — a small, recorded, replay-verified patch — rather than forking `conversation_loop.py`.
- Not acceptable under any option: two writers of `messages`, or a second history assembled from `AIAgent`'s in-memory list.

### Pattern 8: Resume, list, search, branch, export/import

All five are **store operations**, sharing the reader pool or the writer thread; none may open a second database.

| Verb | Contract |
|---|---|
| `resume(session_id)` | Load `active=1` rows of the active transcript in `seq` order; project to OpenAI messages with `message_uid` restored **unconditionally** (upstream: "It is restored on every projection (`get_messages_as_conversation` sets it unconditionally…)" [CITED: session-storage]); validate alternation; return snapshot + last usage anchor + any `unknown` admission (which blocks input). |
| `list(limit)` | Sessions ordered by `started_at DESC` with a first-user-message preview and `last_active` — the documented query shape; exclude `hidden`/internal, include `archived` only on request [CITED: session-storage]. |
| `search(query, filters)` | FTS5 `MATCH` over `messages_fts` joined back to `messages` filtering `active=1`, with `snippet()` and the upstream query sanitizer (reuse it; do not hand-roll FTS syntax handling). Trigram index serves substring/CJK. |
| `branch(session_id, at_message_uid=None)` | Refuse if a turn is live (`session_busy`). Create a session (`origin='branch'`, `parent_session_id`), a generation-0 transcript, copy rows up to the cut **keeping `message_uid`s**, assign new `seq` 0..n-1 and new physical ids, and extend the cut through the tool results of any assistant(tool_calls) at the boundary. Copy turns as closed rows with new `turn_id`s and `origin_turn_id` set. |
| `export(session_id, path)` | Atomic write (temp + `os.replace`). JSON with `schema:"halo/session-export/v1"`, session, transcripts, turns, messages (including `request_id` rows and compaction archives), usage, and a manifest of counts + per-message `sent_sha256`. Export inside one read transaction so a concurrent compaction cannot produce a torn snapshot. |
| `import(path)` | Validate schema + manifest; preserve uids; re-issue physical ids and `seq`; refuse a uid that already exists with different canonical content (idempotent re-import of identical content is allowed); refuse unknown forward references. |

Branch/export/import uid preservation is the documented upstream behaviour: "`/branch` / Desktop branch copies (the child session's copied rows keep the parent's uids)" and "export/import" are both in the `message_uid` preservation list [CITED: context-engine-plugin]. Minting new uids on export would break the mirror invariant the moment a session crossed machines.

### Anti-Patterns to Avoid

- **Two stores, or two `SessionDB` instances.** One writable connection, one process, one file. Any second store recreates the divergence class LOOP-02 exists to kill.
- **A surface that opens the DB for writes.** CLI/Desktop call the daemon (Phase 10); in Phase 3 the minimal verbs run inside the daemon process, and the tests prove a *separate* process can read.
- **`AIAgent.chat()` / `run_conversation()` anywhere outside the facade.** This is the P-04 regression, and it is one import away in every refactor.
- **Persisting streaming deltas.** Deltas are UI-only; the assistant row is written once at finalize (AI-SPEC §4b, upstream's callback table).
- **Keying completion on a frame type, or on quiescence.** Both are the documented trap; `is_turn_complete` is the only predicate.
- **Recomputing context % locally.** Estimates may trigger gates; they may not be displayed as the number.
- **Deleting `active=0` rows as duplicates.** A protected message legitimately exists in two generations with identical content and timestamp [CITED: session-storage].
- **Minting fresh `message_uid`s on copy.** Breaks compaction lineage, branch fidelity and the mirror check at once.
- **`INSERT OR REPLACE` into an FTS5 external-content table.** Documented unsupported (ABORT).
- **Registering a second compaction path "just for the gateway".** `checkpoint_required` exists so this is impossible; do not bypass it.
- **Writing the request body into a log line.** Size-dependent loss and a secret-leak surface in one move.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Conversation summarization | A new summarizer | The vendored `ContextCompressor` behind HALO's wrapper | It already implements pruning, tail protection, tool-pair safety, cooldowns, overflow recovery and anchor accounting [CITED: context-compression-and-caching] |
| FTS5 query sanitization | Regex guessing at `MATCH` syntax | Upstream's `_sanitize_fts5_query()` (reuse the module) | It handles unmatched quotes, hyphenated terms and dangling booleans — each of which is a hard parse error otherwise [CITED: session-storage] |
| Provider retry / fallback / api-mode detection | A second HTTP stack | The runtime's provider layer | Mode resolution, 429/5xx failover, credential refresh and reasoning-stall failover are documented behaviour; duplicating them creates two failure policies |
| Retry-on-lock | A bespoke backoff | Upstream's documented jitter/budget constants (20 s / 60 s, 20–150 ms → 250 ms–1 s) | They exist to avoid the SQLite convoy effect, where deterministic internal backoff synchronizes retries [CITED: session-storage] |
| Schema migration | Alembic / SQLAlchemy | A ~100-line versioned runner over `halo_schema_version` + idempotent `ALTER TABLE` in `try/except` | Single-file SQLite, no ORM; upstream uses exactly this shape (`_reconcile_columns()` + version-gated blocks) [CITED: session-storage] |
| ID generation | A ULID library | `uuid.uuid7()` (stdlib 3.14) | Verified present; lexicographically sortable hex; no dependency [VERIFIED: probe] |
| Crash-safe file writes for export | Ad-hoc `open(..., 'w')` | temp file + `os.replace` (same volume) | Atomic on NTFS; a half-written export is indistinguishable from a corrupt session |
| Windows network-path detection | String heuristics on the path | `GetDriveTypeW` via `ctypes` + explicit UNC prefix check | A mapped drive has no `\\` in its path and is still remote |
| Canonical JSON | A third-party canonicalizer | One `canonical_bytes()` function (sorted keys, fixed separators, UTF-8, `ensure_ascii=False`) | The hash must be stable across processes and platforms; one function, one definition, used by mirror + export + archive |

**Key insight:** every hard part of this phase already exists upstream or in the standard library. Phase 3's new code is the *authority* around them: the writer thread, the admission state machine, the close predicate, the request builder and the generation commit. That is where the bugs will be, so that is where the tests must concentrate.

## Runtime State Inventory

Phase 3 is not a rename, but it **creates the only durable state in the product**, so the inventory is about what exists at runtime after the phase and what must be true on a second machine or a second launch.

| Category | Items Found / Created | Action Required |
|---|---|---|
| Stored data | `%LOCALAPPDATA%\HALO\state.db` (+ `-wal`, `-shm`): sessions, transcripts, turns, messages, admissions, usage, manifests, archives. No such file exists today; the repo has no runtime state [VERIFIED: `ls -A`]. **Collision to resolve:** Phase 2's migration is a whole-home copy — `migrate(from_path, to_path, mode)` "walk source with `os.walk(followlinks=False)`… stream-copy files with per-file SHA-256 verify" [VERIFIED: `.planning/phases/02-rebrand-wire-contract-migration/02-06-PLAN.md:155`] and its secret list already names `sessions/` [VERIFIED: `02-06-PLAN.md:121`] — so a user's legacy Hermes `state.db` (upstream schema v31) would land exactly where HALO's store goes. | Create via the migration runner; refuse an absent directory's creation if the path is remote. **A foreign `state.db` is never adopted** (its schema is upstream's, not HALO's): the store detects absence of `halo_schema_version` and refuses with an actionable message, and Phase 2's copy must either exclude `state.db*` or relocate it to `<home>\legacy\hermes-state.db`. See Research Flag R16. |
| Live service config | None external. The daemon is not yet a service (Phase 10/12). One in-process authority: `runtime_epoch` row. | Epoch is written on every writable open; a stale epoch from a dead PID is reclaimed in one transaction. |
| OS-registered state | None today. Future: single-instance lock file (Phase 12, PLAT-04), Windows Task Scheduler (open product question). | Nothing to migrate in Phase 3; the epoch mechanism is the precursor and must not be duplicated by a second lock authority. |
| Secrets / env vars | No secret is stored in `state.db` by design; credentials stay in the secret store. The transcript may *contain* secrets from user text or tool output — which is why admission-time redaction is a Phase 3 obligation. Dev builds may set `HALO_LOOP_STRICT_MIRROR=1`, `HALO_LOOP_RECORD=1` (names from Phase 2's `HALO_` prefix). | Redaction at admission; a canary test sweeps every text column + export + log file. |
| Build artifacts | `packages/halo_agent/.venv`, `uv.lock` (per-package), `__pycache__`, pytest cache. No compiled artifact in Phase 3. | `.gitignore` entries; `uv sync --project packages/halo_agent --locked` reproduces the venv. |
| Test fixtures | `packages/halo_agent/tests/evals/ledger/*.jsonl` (12 golden sessions), recorded request bodies for >1 MiB fixtures. | Committed (they are the regression corpus); bodies over ~1 MiB may be generated by the fixture builder instead of stored, with a digest pin. |

## Common Pitfalls

### Pitfall 1: The implicit transaction model bites the schema
**What goes wrong:** `sqlite3`'s legacy `isolation_level` opens transactions implicitly for DML and *not* for DDL; `executescript()` implicitly commits any pending transaction before running. A migration that mixes DDL and DML appears atomic and is not.
**Why:** `autocommit` defaults to `LEGACY_TRANSACTION_CONTROL` — `-1` on the probe [VERIFIED: live probe]; the DB-API 2.0 mode is opt-in.
**How to avoid:** open with `isolation_level=None` and drive `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` explicitly; run migrations as one explicit transaction over plain `execute()` calls; never use `executescript()` inside a transaction [CITED: docs.python.org/3/library/sqlite3.html].
**Warning signs:** a half-applied schema after a crash; `sqlite3.OperationalError: cannot start a transaction within a transaction`.

### Pitfall 2: `PRAGMA journal_mode=WAL` silently returns `delete`
**What goes wrong:** the store runs in rollback-journal mode on a network share (or a VFS without shared memory), then stalls or corrupts under two processes.
**How to avoid:** assert the returned string is `wal` and refuse otherwise (Pattern 1), plus the drive-type check before open.
**Warning signs:** `journal_mode` returning `delete`; `database is locked` bursts; a `-wal` file that never appears.

### Pitfall 3: A read-only connection still needs write access to `-shm`
**What goes wrong:** a CLI opened on a read-only volume (or with a read-only directory ACL) fails even though the DB file is readable.
**Why:** WAL readers coordinate through the `-shm` file; SQLite documents that a read-only WAL database opens only if the `-wal`/`-shm` exist or the directory is writable, or the connection is `immutable=1` [CITED: sqlite.org/wal.html §5].
**How to avoid:** readers use `mode=ro` with the directory writable; never use `immutable=1` on a live store.

### Pitfall 4: FTS5 external-content desync is silent until you ask
**What goes wrong:** a recovery path copies `messages` without rebuilding the index; search returns archived rows or misses live ones; the session "looks healthy".
**Why:** "It is the responsibility of the user to ensure that an FTS5 external content table… is kept consistent" [CITED: fts5.html §4.4.4].
**How to avoid:** `INSERT INTO messages_fts(messages_fts, rank) VALUES('integrity-check', 1)` on unclean shutdown and in the audit job; repair with `INSERT INTO messages_fts(messages_fts) VALUES('rebuild')`. The probe confirmed the desync is detected (`database disk image is malformed`) and `rebuild` restores results [VERIFIED: live probe]. Recovery must rebuild, never copy the index tables.
**Warning signs:** `integrity-check` raising; per-session `COUNT(*)` of index rows diverging from `active=1` rows.

### Pitfall 5: An `UPDATE` trigger re-indexes the world on every flag flip
**What goes wrong:** compaction flips `active` on thousands of rows, each firing a delete+insert into two FTS tables — slow, and it rewrites the index for text that did not change.
**How to avoid:** `AFTER UPDATE OF content, tool_name, tool_calls` (verified: only content changes fire it) [VERIFIED: live probe]. If profiling still shows churn, move the flags to a separate `message_state` table so `messages` is truly append-only.

### Pitfall 6: Lone surrogates and NULs
**What goes wrong:** `UnicodeEncodeError` at insert time, or a hash that describes unpersistable bytes.
**How to avoid:** scrub before hashing/persisting (the runtime already does this for outgoing payloads); assert round-trip equality on persist; treat a scrub as a `loop_events` entry so the mirror diff is explainable.

### Pitfall 7: Treating `message_uid` as a row key
**What goes wrong:** a uniqueness index or a lookup by uid returns two active rows and the code "fixes" it by deleting one — deleting a live message.
**Why:** "A uid names one logical message, not one row… a host path that re-appends an edited or merged message next to a still-active earlier row… leaves two active rows with one uid. Never assume per-row uniqueness in the active set" [CITED: context-engine-plugin].
**How to avoid:** query by `(session_id, message_uid, active=1)` ordered by `seq` and take the latest as the current version; no unique constraint on uid.

### Pitfall 8: The compaction threshold is documented inconsistently
**What goes wrong:** a test hardcodes "fires at 50 %" for a 200K model; the engine fires at 75 % because of the small-window floor; the fixture fails on correct behaviour — or worse, the plan "fixes" the engine.
**Evidence:** the settings table says `threshold` default `0.50` and "floored at 0.75 below 512K windows", while the computed-values block for a 200K model uses `200,000 × 0.50 = 100,000` [CITED: context-compression-and-caching]. Both cannot be true for 200K.
**How to avoid:** the fixture asserts `engine.threshold_tokens` as *resolved by the engine* (and that compaction fires at it), not a literal fraction; read `agent/context_compressor.py` at the import SHA and record the answer in the plan (Research Flag R4).

### Pitfall 9: Arming the checkpoint gate without a provider wedges compaction
**What goes wrong:** `compression.checkpoint_required: true` with no API-v2 provider blocks **every** compaction attempt, manual and automatic; the session grows until the provider rejects it.
**How to avoid:** register the provider in the same task; a startup self-test compresses a synthetic transcript against the provider and fails loudly if the gate blocks.
**Warning signs:** `BLOCKED_MISSING_PREREQUISITE` in the logs; `compression_count` frozen while context % climbs.

### Pitfall 10: PID reuse makes a dead owner look alive
**What goes wrong:** the store refuses to start because the epoch's PID was reused by an unrelated process.
**How to avoid:** store `(pid, process_started_at)` and compare both (Windows: `OpenProcess` + `GetProcessTimes`); on mismatch, treat the epoch as dead. Never reclaim on PID alone.

### Pitfall 11: Exporting during a compaction commit
**What goes wrong:** the export sees generation N's messages and N+1's session row, producing a transcript that was never coherent.
**How to avoid:** run the export inside a single read transaction (WAL gives a consistent snapshot) and take the session/transcript rows in the same transaction; refuse if `compaction_runs` has a `running` row for the session.

### Pitfall 12: pytest-asyncio 1.x loop scoping
**What goes wrong:** tests pass individually and fail in a suite because fixtures and tests run on different event loops.
**How to avoid:** `asyncio_mode = "auto"`, one `loop_scope="session"` for the store/writer fixture, and no `asyncio.run()` inside tests (it would create a second authority — which G2 turns into a test failure, as intended).

## Code Examples

### Store open + writer thread (Pattern 1)

```python
# Source: pattern derived from documented upstream SessionDB behaviour
# [CITED: hermes-agent.nousresearch.com/docs/developer-guide/session-storage]
# and this session's live SQLite probe (WAL, synchronous, FTS5).
import asyncio, queue, sqlite3, threading
from concurrent.futures import Future

class Writer:
    def __init__(self, db_path, *, on_error=None):
        self._q: queue.SimpleQueue = queue.SimpleQueue()
        self._ready = threading.Event()
        self._conn = None
        self._err = None
        self._thread = threading.Thread(target=self._run, args=(str(db_path),),
                                        name="halo-state-writer", daemon=True)
        self._thread.start()
        self._ready.wait(10)
        if self._err:
            raise self._err

    def _run(self, path):
        try:
            conn = sqlite3.connect(path, isolation_level=None, timeout=5.0)
            conn.row_factory = sqlite3.Row
            if conn.execute("PRAGMA journal_mode=WAL").fetchone()[0].lower() != "wal":
                raise RuntimeError("refusing non-WAL store")
            conn.execute("PRAGMA synchronous=FULL")
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute("PRAGMA busy_timeout=5000")
            self._conn = conn
        except BaseException as exc:            # surface open failures synchronously
            self._err = exc
            self._ready.set()
            return
        self._ready.set()
        while True:
            item = self._q.get()
            if item is None:
                break
            fn, fut = item
            try:
                fut.set_result(fn(conn))
            except BaseException as exc:
                fut.set_exception(exc)
        conn.close()

    def submit(self, fn) -> Future:
        fut: Future = Future()
        self._q.put((fn, fut))
        return fut

    async def call(self, fn):
        return await asyncio.wrap_future(self.submit(fn))
```

`Future` is thread-safe for `set_result`/`set_exception`, and `asyncio.wrap_future` bridges it without a second event loop. Writes go through `Writer.call`; reads use a separate `mode=ro` connection.

### Crash recovery transaction (Pattern 3)

```python
# Source: documented upstream recovery rule, quoted verbatim above
# [CITED: .../session-storage — "An input that was `started` when its owner died
# becomes `unknown` at the next owner start and is never replayed"].
import time, uuid  # module imports, shown here for the snippet

def recover_on_open(conn, *, epoch: str, pid: int, process_started_at: float,
                    owner_is_alive) -> None:
    conn.execute("BEGIN IMMEDIATE")
    try:
        prev = conn.execute("SELECT * FROM runtime_epoch WHERE id=1").fetchone()
        if prev is not None and owner_is_alive(prev["pid"], prev["process_started_at"]):
            raise StoreOwnedElsewhere(prev["pid"])
        if prev is not None:
            conn.execute(
                "UPDATE session_admissions SET state='unknown', terminal_reason='owner_lost' "
                "WHERE state='started' AND owner_epoch=?", (prev["epoch"],))
            conn.execute(
                "UPDATE compaction_runs SET status='interrupted', finished_at=?"
                " WHERE status='running'", (time.time(),))
        conn.execute("INSERT INTO runtime_epoch(id, epoch, pid, process_started_at,"
                     " instance_id, started_at) VALUES(1,?,?,?,?,?)"
                     " ON CONFLICT(id) DO UPDATE SET epoch=excluded.epoch, pid=excluded.pid,"
                     " process_started_at=excluded.process_started_at,"
                     " instance_id=excluded.instance_id, started_at=excluded.started_at",
                     (epoch, pid, process_started_at, uuid.uuid4().hex, time.time()))
        conn.execute("UPDATE sessions SET clean_shutdown=0 WHERE clean_shutdown IS NULL OR clean_shutdown=1")
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK"); raise
```

Note the ordering: liveness is checked **inside** the write transaction, so two daemons racing to open cannot both believe they own the store (the loser sees the winner's committed epoch).

### FTS audit + repair (Pattern 2 / Pitfall 4)

```python
# Source: FTS5 special INSERT commands [CITED: sqlite.org/fts5.html §6.7, §6.12],
# verified against the external-content desync probe in this session.
def audit_fts(conn, *, repair: bool) -> list[str]:
    findings = []
    for table in ("messages_fts", "messages_fts_trigram"):
        try:
            conn.execute(f"INSERT INTO {table}({table}, rank) VALUES('integrity-check', 1)")
        except sqlite3.DatabaseError as exc:
            findings.append(f"{table}: {exc}")
            if repair:
                conn.execute(f"INSERT INTO {table}({table}) VALUES('rebuild')")
    # independent membership check: every active row is indexed
    missing = conn.execute(
        "SELECT COUNT(*) FROM messages m LEFT JOIN messages_fts f ON f.rowid=m.id"
        " WHERE m.active=1 AND f.rowid IS NULL").fetchone()[0]
    if missing:
        findings.append(f"active rows missing from index: {missing}")
        if repair:
            conn.execute("INSERT INTO messages_fts(messages_fts) VALUES('rebuild')")
    return findings
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Per-session JSONL transcripts | One SQLite store (`state.db`) with FTS5 | Documented upstream migration ("This replaces the earlier per-session JSONL file approach") [CITED: session-storage] | Cross-session search, one writer, one backup unit |
| Compaction rotates the session id (`parent_session_id` chains) | In-place compaction: same session id, `active=0/compacted=1` archives, generation lineage | `compression.in_place: true` is the default [CITED: context-compression-and-caching] | Logical id is stable for life; `/goal` state and cross-boundary search stop breaking |
| Local token estimates drive context % | Usage anchor: provider's last prompt/completion + rough delta of *appended* messages only | Documented anchor design (`agent/usage_anchor.py`) [CITED: same] | Context % is provider-true; estimates are a trigger, not a number |
| Frame-type completion (`agent_end`) | `isTerminal` + `yielded` + `awaitingAsyncWork`, with `session_settled` as a separate predicate | Protocol v2 era [CITED: rpc.md] | Turns stop closing while background work can still append |
| Deleting compacted rows | Soft archive with uid lineage | Schema v31 + in-place compaction [CITED: session-storage] | Search/recoverability survive compaction |
| `synchronous=NORMAL` everywhere for speed | HALO: `FULL` for transcript writes; WAL still batches readers | This phase's decision | One fsync per commit buys durability for the only durable artifact; benchmark before changing |

**Deprecated/outdated:** JSONL transcripts; session-id rotation on compaction; `agent_end`-as-completion; WAL on network shares; `cjk_unicode61`-as-assumed-tokenizer; `session_search` over a second index.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The vendored Hermes runtime already depends on Pydantic v2, so Phase 3 inherits its constraint instead of adding `pydantic==2.14.1` | Standard Stack, Legitimacy | Two pins conflict at resolve time, or a second copy is installed |
| A2 | The vendored `AIAgent` exposes an injectable persistence seam (store object or callbacks) | Pattern 7 | Falls back to a recorded `patches/series` edit of two call sites; plan must include the read step either way |
| A3 | `cjk_unicode61` is a custom tokenizer compiled into upstream's SQLite, not available in the shipped CPython build | Standard Stack / Pitfall 4 | CJK search quality relies on `trigram` only (acceptable), or the plan must add a compiled tokenizer (large) |
| A4 | `pytest-asyncio` 1.4.0 works with `pytest` 9.1.1 under CPython 3.14 | Validation Architecture | Pin an older pair or switch to `anyio` |
| A5 | `GetDriveTypeW` reliably reports mapped network drives as `DRIVE_REMOTE` | Pattern 1 | Refusal becomes advisory; add a directory-write probe as a second check |
| A6 | The provider SDKs (OpenAI-compatible + Anthropic adapter) accept an injected `http_client`, enabling byte recording | Pattern 5 | Record at the socket layer in tests only; production dev-check falls back to the builder-side hash |
| A7 | PID + process start time is sufficient to detect a reused PID on Windows | Pitfall 10 | False "owner alive" → startup refusal (safe failure) or false reclaim (unsafe) — verify with `GetProcessTimes` at execute time |
| A8 | The 0.50-vs-0.75 threshold contradiction resolves to the small-window floor | Pitfall 8 | Fixture asserts the wrong number; mitigated by asserting the engine's resolved value |
| A9 | `%LOCALAPPDATA%\HALO` is not redirected by OneDrive Known Folder Move | Environment | A redirected path would put WAL on a synced folder; the drive-type check does not catch it, so add a "path is not under a known cloud root" warning |

**If this table shrinks at execute time, the phase gets cheaper:** A1–A8 each resolve with one `read`/probe in Wave 0.

## Research Flags

> Everything below is **documented-but-unverifiable until `vendor/` exists** or is genuinely open. Each flag names the check and the fallback so a plan can be written today and executed tomorrow.

| # | What to verify | Where | Why it matters | Fallback if different |
|---|---|---|---|---|
| R1 | Vendored module paths/symbols: `agent/conversation_loop.py`, `agent/turn_*.py`, `agent/context_engine.py`, `agent/context_compressor.py`, `agent/usage_anchor.py`, `hermes_state*.py`, `model_tools.py` | `vendor/hermes-agent/` at the Phase-1 SHA | Every `[doc]` import in this research | Adjust the facade only (`loop/_vendor.py`); no other module may import them |
| R2 | Upstream `session_admissions` DDL, state names and column set | `hermes_state_common.py` `SCHEMA_SQL` | The docs name the table and the transitions, not the columns | Keep HALO's table (Pattern 2) and align names where free; do not rename upstream's if it exists |
| R3 | Persistence seam in `AIAgent` (`agent_init.py`) — can a store/callback be injected? | vendored `agent/` | Decides wrap-vs-patch (Pattern 7) | Recorded `patches/series` patch of load/persist call sites; `just verify` must stay green |
| R4 | Effective compaction trigger: 0.50 vs the 0.75 small-window floor; `threshold_tokens` resolution | `agent/context_compressor.py` | Pitfall 8; the eval fixture | Assert the engine's resolved `threshold_tokens`; never a literal fraction |
| R5 | Gateway hygiene (`gateway/run_turn_hygiene.py`, 85 %) — is it reachable from HALO's loop path or configurable off? | vendored gateway module | It is a **second** compaction authority (LOOP-04) | Never call the hygiene function from HALO's turn driver; add a static-gate assertion (same technique as G1) |
| R6 | `compression.micro_compact` key existence and behaviour | vendored config/compressor | Another lossy authority; the checkpoint gate is documented to force it off | Rely on `checkpoint_required: true`; assert `micro_compact` is off at startup |
| R7 | FTS tokenizer availability: `unicode61`, `trigram`; whether `cjk_unicode61` exists in the shipped build | interpreter probe + vendored schema | LOOP-03 search semantics | Ship `unicode61` + `trigram` (verified); drop the custom tokenizer |
| R8 | Exact `PERSISTENCE_ONLY_MESSAGE_FIELDS` set | vendored `agent/message_sanitization.py` or equivalent | The mirror hash must match the stripped payload | Any mismatch fails the dev check loudly — fix by reading the set, never by loosening the check |
| R9 | Upstream `messages`/`sessions` full column lists (docs say "abridged") | `hermes_state_common.py` | Resume/compaction fidelity; potential name clashes with HALO columns | HALO owns the schema; adopt upstream names where semantics match, add HALO columns for the rest |
| R10 | `SessionDB` write-contention retry — needed when HALO is the only writer? | vendored `hermes_state*.py` | Performance, not correctness | Keep the safety net; it only costs on contention |
| R11 | Python **3.14.9** availability: `uv python install 3.14.9` failed here ("No download found…"), uv only offered 3.14.7 | `uv python list --all-versions` after upgrading uv to 0.13.5 | The pin is 3.14.9 (AGENTS.md:34); all probes ran on 3.14.7 | Install PBS 3.14.9 directly or pin 3.14.7 with a recorded deviation; re-probe FTS5 on whichever ships |
| R12 | **Two roots for the package name `halo_agent`.** Phase 2 emits `runtime/shared_contracts/halo_agent/brand_gen.py`, `legacy_env_gen.py`, `wire_gen.py` **and the hand-written** `home_paths.py` (`resolve_halo_home()`, `find_legacy_home()`) + `migrate.py` with `migrate(from_path, to_path, mode)` [VERIFIED: `02-06-PLAN.md:11-12,77,105`], and Phase 2's own verification runs `uv run python -c "from halo_agent.migrate import startup_migrate"` [VERIFIED: `02-06-PLAN.md:183`]. Phase 3's distribution is also `halo_agent`, under `packages/halo_agent/`. | Phase 3 Task 0 (before any loop code) | Two regular packages with one name: whichever root is first on `sys.path` wins and the other half disappears at import — silently, and differently per entry point | Preferred: make `runtime/shared_contracts/halo_agent/` an installable *source* of the distribution — i.e. `packages/halo_agent` declares `runtime/shared_contracts/halo_agent` as an additional package root — or amend Phase 2's Python output dir to `runtime/shared_contracts/halo_contracts/` (Phase 2 is unexecuted; the generator path is one string and the drift gate covers it). Fallback: explicit `importlib` file loading confined to one module. Whichever is chosen must keep Phase 2's `uv run python -c "from halo_agent.migrate import …"` working. |
| R13 | Whether `sqlite3.Connection.setconfig(SQLITE_DBCONFIG_DEFENSIVE, True)` is available and harmless | interpreter probe | Defense-in-depth against `ATTACH`/writable_schema abuse from a corrupted store | Optional; skip if it complicates the writer |
| R14 | Provider SDK acceptance of a recording `http_client` (A6) | vendored provider layer | The byte source for LOOP-05 in dev builds | Test-only socket-level capture |
| R15 | Whether the loop can be constructed without upstream's gateway/session manager starting its own writer | vendored `agent_init.py` | Two writers would violate LOOP-02 | Explicitly disable upstream persistence; if unavoidable, that is the one place a patch is mandatory |
| R16 | **Phase 2's home migration copies a legacy Hermes `state.db` into HALO's home.** The copy is a whole-tree walk with per-file digests, and the secret list already includes `sessions/` [VERIFIED: `02-06-PLAN.md:121,155`]. | `halo_agent/migrate.py` or Phase 3's store-open | Without a rule, the first open sees upstream schema v31 under HALO's path: either a corrupt-looking store or, worse, a partially "reconciled" one | Phase 3 detects `halo_schema_version` absence and refuses (typed error naming the file); the clean fix is a one-line exclusion/relocation in Phase 2's migration (`state.db*` → `<home>\legacy\hermes-state.db`), which must be agreed before Phase 2 executes |

## Open Questions

1. **Where does the minimal LOOP-03 surface live?**
   - What we know: "User can resume, list, search, branch, export" must be demonstrable in Phase 3, but "No Desktop/CLI surface before the session authority (Phase 3); the product surface lands at Phase 10" [VERIFIED: `STATE.md:66`].
   - Unclear: whether a console script counts as a "surface".
   - Recommendation: ship `halo-agent sessions <verb>` as a thin argument parser over `state/sessions.py`, tested as a subprocess; Phase 10 replaces the UX, not the implementation. Keep it to the five verbs — no chat loop, no renderer.

2. **Does Phase 3 rewrite Phase 2's generated path, or work around it?**
   - Recommendation: resolve R12 before Phase 2 executes, in preference order: (a) declare `runtime/shared_contracts/halo_agent` as an extra package root of the `packages/halo_agent` distribution, (b) rename Phase 2's Python package directory to `halo_contracts`, (c) an `importlib` loader confined to one module. Every option must keep Phase 2's own `from halo_agent.migrate import …` check green.

3. **Is `synchronous=FULL` acceptable on the target disk?**
   - What we know: each commit fsyncs; the transcript is the product's only durable artifact.
   - Unclear: measured commit latency on the Low profile.
   - Recommendation: ship `FULL`, add a benchmark task, and only then consider `NORMAL` with a documented durability trade-off. Never change it silently.

4. **Compaction archive medium in Phase 3.**
   - Recommendation: SQLite `compaction_archives` rows (durable, idempotent, same transaction domain); Phase 8 mirrors to Hindsight without changing the contract. Do not ship a "TODO: memory" stub — the row *is* the real archive.

5. **Should `messages` become append-only with flags in a separate table?**
   - Recommendation: not in Phase 3 — `UPDATE OF` already removes the FTS cost; revisit only if profiling shows the flag flips are expensive on 100K-row transcripts.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.14 | Loop, store, tests | ✓ (via uv) | 3.14.7 installed by uv; **3.14.9 not downloadable from this uv** | `uv python install 3.14.7` now; resolve 3.14.9 with uv 0.13.5 or PBS (R11) |
| SQLite with FTS5 | Store, search | ✓ | 3.53.1 bundled in 3.14.7; `unicode61`/`porter`/`trigram`/`ascii` + JSON1 | — (if a build lacked FTS5, the phase blocks: there is no second index by design) |
| uv | Dependency + interpreter management | ✓ (older) | 0.12.17 (pin 0.13.5) | `uv self update` |
| just | Every documented command | ✗ | — | Installed by Phase 1 Task 3 (`winget --id Casey.Just`) |
| Bun | Phase 1/2 lanes; not Phase 3 code | ✓ (older) | 1.4.2 (pin 1.4.4) | Upgrade via winget |
| git | Repo operations, patches | ✓ | 2.55.0.windows.3 | — |
| pwsh | `just` recipe shell | ✓ | 7.6.7 | — |
| ripgrep | Static gate (optional) | ✓ | 15.2.0 | Python AST walk (the primary mechanism anyway) |
| cargo/rustc | Not used in Phase 3 | ✗ | — | — |
| Network (PyPI/uv) | `uv sync`, interpreter download | ✓ (verified: PyPI JSON + uv download succeeded) | — | Pre-populated uv cache |

**Missing with fallback:** `just` (Phase 1 installs it), uv 0.13.5, Python 3.14.9 (R11).
**Blocking:** none — provided Wave 0 runs after Phase 1's import; without `vendor/` the loop has nothing to import and only the store/schema half is runnable.

## Validation Architecture

`workflow.nyquist_validation: true` [VERIFIED: `.planning/config.json:24`].

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `pytest` 9.1.1 + `pytest-asyncio` 1.4.0, `asyncio_mode = "auto"`, configured in `packages/halo_agent/pyproject.toml` |
| Config file | `packages/halo_agent/pyproject.toml` (`[tool.pytest.ini_options]`, `testpaths = ["tests"]`). Deliberately **not** a root `pyproject.toml` (DEC-04), so tests live under `packages/halo_agent/tests/` — a deviation from the AI-SPEC's literal `tests/evals` path, same command name. Run from `packages/halo_agent/` (`just test` does the `cd`); the explicit-path form below works from the repo root |
| Quick run command | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/state packages/halo_agent/tests/loop packages/halo_agent/tests/mirror` |
| Full suite command | `just test` (Python lane) → `just eval` (deterministic fixtures + mirror goldens + canary sweep), plus Phase 1/2 lanes (`just verify`) unchanged |
| Regression corpus | `packages/halo_agent/tests/evals/ledger/*.jsonl` — the AI-SPEC's 12 golden sessions, each a scripted provider stream + store post-conditions |

### Phase Requirements → Test Map

| Req ID | Behavior | Layer | Evidence that proves it | Automated command | File Exists? |
|--------|----------|-------|-------------------------|-------------------|--------------|
| LOOP-01 | One loop drives streaming, steer, queue, interrupt, follow-up; no alternate loop | Static gate + integration | G1 AST gate passes; G2 hostile-second-authority test raises; steer-during-stream fixture leaves legal alternation; queue drain across a killed child leaves one admission row per input | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/loop/test_single_loop.py packages/halo_agent/tests/loop/test_steer_interrupt.py` | ❌ Wave 0 |
| LOOP-02 | One store; second process reads the same conversation | Integration (multi-process) | Two processes: writer appends, reader (`mode=ro`) sees the row inside the same second; a second *writer* is refused (`StoreOwnedElsewhere`); non-WAL pragma return is refused | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/state/test_single_writer.py` | ❌ Wave 0 |
| LOOP-03 | resume / list / FTS5 search / branch / export-import | Integration | Round-trips preserve `message_uid`; branch cut extends through tool results; export→import→export is byte-stable modulo physical ids; FTS finds a tail token of a 2 MiB message; trigram finds a substring | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/state/test_sessions.py packages/halo_agent/tests/state/test_search.py` | ❌ Wave 0 |
| LOOP-04 | Compaction single-sourced; accounting = provider usage | Unit + fixture | Only one engine registered (`SecondEngine` rejected); `checkpoint_required` blocks the rewrite when the archive fails; rotation leaves exactly one `active=1` transcript; protected-tail uids + hashes intact; `session_model_usage` equals the mock's pinned usage verbatim; context % = `prompt_tokens/context_length` | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/loop/test_compaction.py` | ❌ Wave 0 |
| LOOP-05 | Every context item visible; mirror == sent, incl. >1 MiB | Unit + wire-level fixture | For each request: `mirror_manifest` order/uids == projected rows; per-position hash == hash recomputed from the recorded HTTP body; 2 MiB fixture passes with `len(body)==content-length`; an injected layer has a row with `display_kind` | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/mirror` | ❌ Wave 0 |
| LOOP-06 | Close only on the authoritative predicate; background keeps it open; never reopen | Unit + DB-constraint | Variant matrix (`no terminal`, `terminal + bg running`, `terminal + tool reserved`, `terminal + bg done`, `error`, `budget_exhausted`); closing early raises `RefusedClose`; a direct `UPDATE closed_at=NULL` aborts; `INSERT` into a closed turn aborts | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/loop/test_turn_lifecycle.py` | ❌ Wave 0 |
| (AI-SPEC guardrail) | Secrets never reach the store/export/log | Integration | Canary token in user text + tool result: absent from every text column, the export, and `loop-*.jsonl`; a `loop_events` row records the redaction kind | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/state/test_redaction.py` | ❌ Wave 0 |
| (crash) | Dead-owner admission → `unknown`, never replayed | Integration (kill) | Child process killed after `started`; next open marks `unknown`; a new admission is refused until `resolve_unknown`; no duplicated side-effect marker | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/state/test_crash_recovery.py` | ❌ Wave 0 |

**Layer rationale:** every LOOP criterion is an *invariant*, not a quality judgement, so each is proven by a deterministic code check. The only model-quality dimension (compaction-summary fidelity) is the AI-SPEC's LLM-judge lane and is explicitly not a Phase 3 gate (`just eval-llm`, on demand).

### Sampling Rate

- **Per task commit:** `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/state packages/halo_agent/tests/loop packages/halo_agent/tests/mirror` (< 30 s target; the >1 MiB fixture is the slowest and stays under ~5 s).
- **Per wave merge:** `just test` (pytest + Phase 1/2 bun lanes) and `just verify` (Phase 1 provenance gate — mandatory because Phase 3 may add a vendored patch).
- **Phase gate:** `just test && just eval` green, plus the end-of-phase human resume/branch/export round-trip on a real multi-day session (`human_verify_mode: end-of-phase` [VERIFIED: `config.json:32`]).

### Wave 0 Gaps

- [ ] `packages/halo_agent/pyproject.toml` — uv project, `requires-python`, test config (no root pyproject).
- [ ] `packages/halo_agent/tests/conftest.py` — tmp `state.db` factory, injectable clock, killable child helper, mock-provider server fixture.
- [ ] `packages/halo_agent/tests/state/` schema round-trip test — create from scratch, re-open, assert idempotent migration and `journal_mode == "wal"`.
- [ ] `packages/halo_agent/tests/provider/mock.py` — deterministic OpenAI-compatible SSE server with body recording (also used by `tests/mirror`).
- [ ] `packages/halo_agent/tests/evals/ledger/` — 12 golden sessions from AI-SPEC §5 (composition list reused verbatim).
- [ ] `justfile` recipes `test` and `eval`; CI step runs `just verify && just test && just eval`.
- [ ] Interpreter/FTS5 probe committed as a test (`packages/halo_agent/tests/state/test_interpreter.py`) so an interpreter change cannot silently drop FTS5.

## Security Domain

`workflow.security_enforcement: true`, ASVS L1, block-on high [VERIFIED: `.planning/config.json:48-49`].

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user local daemon; no auth surface in Phase 3 |
| V3 Session Management | no (product sense) | The *transcript* session id is not an auth session; document that distinction in the store module |
| V4 Access Control | yes (filesystem) | `state.db` lives under `%LOCALAPPDATA%\HALO` and inherits the user's ACL; no world-readable copy; export files are written with default user ACL and never to a temp dir shared across users |
| V5 Input Validation | yes | Pydantic v2 at every model-produced boundary; FTS query sanitizer reused; export/import validated against a schema with size caps; no string-built SQL (all statements static, parameters bound) |
| V6 Cryptography | yes (integrity only) | SHA-256 via `hashlib` for mirror/export/archive digests — **integrity, not authentication**; document in the module docstring so nobody builds trust on it |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret in user text or tool output persisted and replayed to a provider | Information Disclosure | Redaction at admission (before insert and before `RequestPayload` build); canary sweep over store + export + log |
| Malicious/hostile import file (traversal, huge JSON, unknown keys) | Tampering / DoS | Schema validation, size cap before parse, no path from the file, refused unknown fields, uid-content conflict refusal |
| FTS query injection / syntax abuse causing errors or scans | Tampering / DoS | Reuse `_sanitize_fts5_query`; bound result count; no raw `MATCH` from user text |
| WAL on a synced/remote path corrupting the only history | Tampering | Drive-type refusal + verified `journal_mode == "wal"` + documented cloud-root warning |
| Corrupted store steering SQLite via `ATTACH`/`writable_schema` | Elevation | `SQLITE_DBCONFIG_DEFENSIVE` where available (R13); store is user-owned, so the threat is integrity not privilege |
| Cross-process transcript write (second loop) | Tampering | Epoch ownership + `mode=ro` readers + G1/G2 gates |
| Export file readable by other users | Information Disclosure | Write inside `%LOCALAPPDATA%\HALO`, never `%TEMP%`; state it in the verb's help text |

## Sources

### Primary (HIGH confidence — read/probed this session)

- Live probes on CPython 3.14.7 (uv-managed, PBS): SQLite 3.53.1, `ENABLE_FTS5`, `THREADSAFE=1`, `unicode61`/`porter`/`trigram`/`ascii`, `json_valid`, `autocommit == -1`, `threadsafety == 3`, `UUID.uuid7()`, `SQLITE_LIMIT_LENGTH == 1_000_000_000`.
- Design probe: the document's full DDL (4 SQL blocks anchored at §Pattern 2) executes cleanly on SQLite 3.53.1, creating 17 tables, 2 FTS5 virtual tables (with their 8 shadow tables) and 7 triggers; functional guards verified (`turn_already_closed`, `turn_reopen_forbidden`, `terminal_signal_frozen_after_close`, `illegal_admission_transition`).
- Design probe: WAL + external-content FTS5 with triggers; 2,097,165-byte row round-trip; FTS match on a tail token and a trigram substring past 1 MiB; `integrity-check` catching a desync (`database disk image is malformed`) and `'rebuild'` repairing it; lone-surrogate bind raising `UnicodeEncodeError`; `turn_reopen_forbidden` trigger abort; `AFTER UPDATE OF content` not firing on an `active` flip.
- Environment probes: `python` 3.13.15, `uv` 0.12.17, `bun` 1.4.2, `just` absent, `cargo` absent, `rg` 15.2.0, `git` 2.55.0.windows.3, `pwsh` 7.6.7; `uv python install 3.14.9` → no download; `uv python install 3.14.7` → success.
- PyPI JSON: pydantic 2.14.1, pytest 9.1.1, pytest-asyncio 1.4.0, anyio 4.15.1.
- Repo reads: `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md:119-132`, `.planning/STATE.md:63-66`, `.planning/PROJECT.md`, `AGENTS.md:15,18,32,34,36,37`, `.planning/config.json:24,32,48-49`, `03-AI-SPEC.md`, `01-SKELETON.md:23`, `01-01-PLAN.md:247`, `02-01-PLAN.md:60`, `02-06-PLAN.md:11-12,77,105,121,155,183`, `02-RESEARCH.md:84`, `.planning/research/ARCHITECTURE.md` §3/§6/§7, `.planning/research/PITFALLS.md` P-04/P-05.

### Secondary (MEDIUM confidence — official upstream docs fetched 2026-10-23)

- Hermes Agent — *Agent Loop Internals*: `https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop`
- Hermes Agent — *Session Storage*: `https://hermes-agent.nousresearch.com/docs/developer-guide/session-storage`
- Hermes Agent — *Context Engine Plugins*: `https://hermes-agent.nousresearch.com/docs/developer-guide/context-engine-plugin`
- Hermes Agent — *Context Compression and Caching*: `https://hermes-agent.nousresearch.com/docs/developer-guide/context-compression-and-caching`
- Hermes Agent — *Memory Provider Plugins* (checkpoint API v2): `https://hermes-agent.nousresearch.com/docs/developer-guide/memory-provider-plugin`
- Hermes Agent — *Gateway local sessions* (admission/FIFO/unknown): `https://hermes-agent.nousresearch.com/docs/developer-guide/gateway-local-sessions`
- Hermes Agent — *CLI Interface* (busy-input modes): `https://hermes-agent.nousresearch.com/docs/user-guide/cli`
- SQLite — *FTS5*: `https://sqlite.org/fts5.html`; *Write-Ahead Logging*: `https://sqlite.org/wal.html`
- Python — *sqlite3*: `https://docs.python.org/3/library/sqlite3.html` (note: the served page is the 3.15 branch; 3.14 behaviour verified by probe where it matters)
- OMP RPC reference: `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/rpc.md`

### Tertiary (LOW confidence — flagged, not load-bearing)

- Windows `GetDriveTypeW`/`GetProcessTimes` semantics (A5, A7).
- Provider SDK `http_client` injection (A6).
- OneDrive Known Folder Move not covering `%LOCALAPPDATA%` (A9).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — interpreter/SQLite/FTS5/pydantic/pytest versions verified by probe or PyPI; the one gap is Python 3.14.9 (R11).
- Architecture: MEDIUM-HIGH — store/admission/turn/mirror/compaction designs are grounded in documented upstream behaviour and verified SQLite semantics; the wrap-vs-patch seam (R3) and the exact upstream column sets (R2/R9) are unverifiable until the import.
- Pitfalls: HIGH — each is either probed here (FTS trigger scoping, desync, surrogate, reopen guard) or a documented upstream failure mode with its own warning signs.
- Validation: HIGH for the mechanism (deterministic pytest + HTTP-level mock + multi-process readers + killed children); MEDIUM for the 12-fixture corpus, which is authored during implementation per the AI-SPEC.

**Research date:** 2026-10-23
**Valid until:** 2026-11-06, and **must be re-validated against the import SHA** before Phase 3 execution — the vendored identifiers (R1, R2, R3, R8, R9) are the only load-bearing unverified facts in this document.

