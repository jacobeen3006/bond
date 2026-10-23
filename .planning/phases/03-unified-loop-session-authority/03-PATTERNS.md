# Phase 3: Unified Loop & Session Authority - Pattern Map

**Mapped:** 2026-10-23
**Files analyzed:** 40 planned file/group rows (≈55 physical files once package markers and the 12 ledger fixtures are expanded), derived from `03-RESEARCH.md` §Recommended Project Structure (`:205-232`), §Patterns 1-8 (`:239-784`), §Validation Architecture (`:1086-1130`), and `03-AI-SPEC.md` §4/§5 (`:303-500`). No `CONTEXT.md` exists for this phase.
**Analogs found:** **0 executed-source analogs / 40.** 26 rows have a **planned precedent** (a rule, schema, or code sketch in a tracked Phase 1/2 plan or research doc); 14 rows have **no analog at all**.

> **Repo reality — read this before planning.**
> The working tree contains 39 tracked files: `.planning/**` and `AGENTS.md`, nothing else (verified: `git ls-files | wc -l` → 39; `packages/`, `vendor/`, `runtime/`, `apps/`, `tools/`, `contracts/`, `tests/`, `src/` all absent). Phase 1 and Phase 2 are **authored but not executed**: `vendor/` does not exist, there is no root manifest, and no Python project has ever been installed.
>
> Consequences for this map:
> 1. Every "analog" below is a **planned precedent**, never existing source. The excerpt is quoted from a tracked planning document at the cited lines; it is a convention the planner may copy, not code that runs today.
> 2. Code sketches inside `03-RESEARCH.md` are marked `[PLANNED design excerpt]`. They were probed for SQLite validity (`03-RESEARCH.md:1161-1164`) but no file exists.
> 3. **Never write a plan action that reads a Phase 3 source file as if it exists.** Wave 0 creates the tree. Every upstream-name check must be a Wave-0 `read_first` against `vendor/hermes-agent/` after Phase 1 lands (`03-RESEARCH.md:7`, `:1026`).
> 4. Tracked-source gate: every cited **planning document** prints from `git ls-files`; planned artifact paths are always prefixed as planned and never presented as existing. No `.gsd/capabilities/**` mirror or other gitignored path is cited.

---

## File Classification

Legend for **Match Quality**: `exact-planned` = the precedent dictates the same artifact shape with a line-level contract; `role-match-planned` = same role/flow in another language or phase; `partial-planned` = only a mechanism (idempotence, byte stability, fixture isolation) transfers; `none` = no precedent exists, RESEARCH/AI-SPEC is the only spec.

| New/Modified File | Role | Data Flow | Closest Analog (planned precedent) | Match Quality |
|---|---|---|---|---|
| `packages/halo_agent/pyproject.toml` | config (uv project + pytest) | n/a | `crates/halo-brand/Cargo.toml` outside `vendor/` (`02-01-PLAN.md:133`) + no-root-workspace rule (`01-SKELETON.md:23`) | role-match-planned |
| `packages/halo_agent/uv.lock` (generated, committed) | config (lockfile) | n/a | lockfile rule (`AGENTS.md:250`; `02-RESEARCH.md:85`) | role-match-planned |
| `.gitignore` (MODIFY) | config | n/a | `01-01-PLAN.md:138` (exact ignore list incl. `.venv/`, `__pycache__/`) | exact-planned |
| `justfile` (MODIFY: `test`, `eval`, bootstrap) | config (build) | batch | `01-09-PLAN.md:90`; `01-01-PLAN.md:243-247`; `STACK.md:55-85` | exact-planned |
| `.github/workflows/ci.yml` (new; or extend `rebrand-verify.yml`) | config (CI) | batch | `01-09-PLAN.md:150-162`; `02-08-PLAN.md:126` | exact-planned |
| `halo_agent/__init__.py`, `loop/__init__.py`, `state/__init__.py`, `provider/__init__.py` | config (package markers) | n/a | none (no Python package exists) | none |
| `halo_agent/loop/_vendor.py` | service (facade) | transform (import boundary) | import-boundary rule (`ARCHITECTURE.md:788-790`) + hand-written-vs-generated module convention (`02-06-PLAN.md:208`) | role-match-planned |
| `halo_agent/loop/authority.py` | service (singleton guard) | event-driven | none; gate G2 is specified only in `03-RESEARCH.md:743` | none |
| `halo_agent/loop/turn.py` | model (Pydantic boundary + pure predicate) | transform | AI-SPEC boundary models (`03-AI-SPEC.md:354-389`) + schema-validation discipline (`02-01-PLAN.md:130`) | role-match-planned |
| `halo_agent/loop/agent_loop.py` | service (orchestrator) | streaming / event-driven | AI-SPEC entry-point sketch (`03-AI-SPEC.md:180-234`); no executable analog | partial-planned |
| `halo_agent/loop/request.py` | service (serializer + manifest writer) | transform, file-I/O | one canonical serialization (`02-02-PLAN.md:133`); one hash implementation (`01-01-PLAN.md:140`) | role-match-planned |
| `halo_agent/loop/compaction.py` | service (engine wrapper + checkpoint provider) | batch, transform | `03-RESEARCH.md:684-735`; no HALO precedent | partial-planned |
| `halo_agent/loop/recovery.py` | service (epoch/recovery transaction) | batch, event-driven | crash-simulation + resume-by-digest discipline (`02-06-PLAN.md:150,155`) | partial-planned |
| `halo_agent/state/schema.sql` | config (DDL asset) | batch | none; DDL is `03-RESEARCH.md:267-537` only | none |
| `halo_agent/state/migrations.py` | migration | batch, file-I/O | idempotent `migrate()` (`02-06-PLAN.md:155`) + `… unchanged` no-op (`01-03-PLAN.md:94`) | role-match-planned |
| `halo_agent/state/store.py` | service (single writer + reader pool) | CRUD, request-response | `03-RESEARCH.md:884-930` writer sketch; no HALO precedent | partial-planned |
| `halo_agent/state/admissions.py` | service (state machine) | CRUD, event-driven | none; `03-RESEARCH.md:547-575` only | none |
| `halo_agent/state/sessions.py` | service (resume/list/search/branch/export) | CRUD, file-I/O | copy-verify + marker idempotence (`02-06-PLAN.md:155`); restage fixed point (`01-01-PLAN.md:128`) | partial-planned |
| `halo_agent/state/paths.py` | utility (home resolution + network refusal) | file-I/O, env | **exact planned precedent:** `halo_agent/home_paths.py` (`02-06-PLAN.md:111,121`) | exact-planned |
| `halo_agent/provider/transport.py` | service/adapter (HTTP + recorder) | streaming | none | none |
| `halo_agent/provider/mock.py` | utility (mock server) | streaming, request-response | none; duplicate-path conflict with `tests/provider/mock.py` (see note) | none |
| `tests/provider/mock.py` | test utility (mock server) | streaming | none (Wave 0 names this path: `03-RESEARCH.md:1126`) | none |
| `halo_agent/admission.py` | middleware (redaction) | transform | secret-streaming/documentation discipline (`02-06-PLAN.md:155`); sensitivity test (`01-05-PLAN.md:125`) | partial-planned |
| `halo_agent/cli.py` | utility (CLI dispatcher) | request-response | `tools/provenance/cli.ts` dispatcher (`01-09-PLAN.md:88`) | role-match-planned |
| `tests/conftest.py` | test (fixtures) | n/a | fixture builder (`02-06-PLAN.md:105,111`); fresh-scratch isolation (`01-08-PLAN.md:131`) | partial-planned |
| `tests/state/test_schema.py` | test (schema round-trip) | file-I/O | ledger read-back/schema-check discipline (`01-01-PLAN.md:140`; `01-08-PLAN.md:93-95`) | partial-planned |
| `tests/state/test_interpreter.py` | test (environment probe) | n/a | live-environment verification (`02-06-PLAN.md:111` citing `01-02-PLAN.md:170-176`) | role-match-planned |
| `tests/state/test_single_writer.py` | test (multi-process) | request-response | none | none |
| `tests/state/test_sessions.py` | test (round-trip) | CRUD, file-I/O | fixed-point/idempotence assertions (`01-01-PLAN.md:128,201-203`) | partial-planned |
| `tests/state/test_search.py` | test (FTS5) | file-I/O | none | none |
| `tests/state/test_redaction.py` | test (canary sweep) | batch scan | sensitivity-proving fixture (`01-05-PLAN.md:125`); literal-token assertions (`01-08-PLAN.md:131,144`) | role-match-planned |
| `tests/state/test_crash_recovery.py` | test (killable child) | event-driven | crash-simulation (`02-06-PLAN.md:150`); no child-kill precedent | partial-planned |
| `tests/loop/test_single_loop.py` | test (AST gate + runtime guard) | batch scan | none; G1/G2 are new (`03-RESEARCH.md:742-745`) | none |
| `tests/loop/test_turn_lifecycle.py` | test (DB constraints) | CRUD | named-case/literal-token discipline (`01-08-PLAN.md:131,144`) | partial-planned |
| `tests/loop/test_steer_interrupt.py` | test (streaming race) | streaming | none | none |
| `tests/loop/test_compaction.py` | test (fixture matrix) | batch | none | none |
| `tests/mirror/test_request_builder.py` + >1 MiB fixture | test (wire-level) | streaming, file-I/O | none; HTTP-layer recording is new (`03-RESEARCH.md:672-680`) | none |
| `tests/evals/ledger/*.jsonl` (12 golden sessions) | config (fixture corpus) | batch | Phase 1/2 fixture-tree builders (`01-08-PLAN.md:99,126`; `02-06-PLAN.md:105`) | partial-planned |
| `runtime/shared_contracts/halo_agent/` (decision-gated; Phase 2-owned, not a Phase 3 edit by default) | config (Phase 2-generated package) | transform | `02-01-PLAN.md:60`; `02-06-PLAN.md:183`; R12 `03-RESEARCH.md:1041` | role-match-planned |
| `halo_agent/evals/judge.py` (AI-SPEC setup command; **not** in the deterministic gate) | utility (LLM judge) | batch | none; explicitly excluded from `just eval` (`03-AI-SPEC.md:457-480`) | none |

**Path conflict to resolve in the plan, not in code:** `03-RESEARCH.md:219` puts the mock server at `halo_agent/provider/mock.py`; `03-RESEARCH.md:1126` (Wave 0 gaps) puts it at `tests/provider/mock.py`. The Wave 0 list and the AI-SPEC (`:470`, "scripted mock-provider fixtures") both describe a **test-only** server. The planner should pick `packages/halo_agent/tests/provider/mock.py` and leave `halo_agent/provider/mock.py` out; shipping a recording server in the runtime package would create a production import path for test code.

---

## Pattern Assignments

### `packages/halo_agent/pyproject.toml` + `uv.lock` (config)

**Analog:** planned `crates/halo-brand/Cargo.toml` placement rule (`02-01-PLAN.md:133`) and the no-root-workspace decision (`01-SKELETON.md:23`).

**Workspace rule (verbatim, `01-SKELETON.md:23`):**

> `| Workspace isolation | No root Cargo workspace, no root uv workspace, root Bun workspace = ["apps/*","packages/*"] — never vendor/** | Cargo parent-directory capture and uv's single requires-python would silently re-resolve vendored trees |`

**Command shape (verbatim, `03-RESEARCH.md:139-140`):**

```bash
uv sync --project packages/halo_agent --locked --python 3.14
uv run --project packages/halo_agent python -c "import sqlite3; print(sqlite3.sqlite_version)"
```

**Test config (the only place pytest settings live, `03-RESEARCH.md:1094-1096`):** `asyncio_mode = "auto"`, `testpaths = ["tests"]`, `pytest-asyncio` 1.4.0; deliberately **not** a root `pyproject.toml`. `[PLANNED]` the concrete TOML does not exist; the planner writes it from these two facts plus the pins in `AGENTS.md:34,36` (Python 3.14.9, uv 0.13.5).

**Do not:** add a root `pyproject.toml` or `[tool.uv.workspace]`; list `vendor/**`; text-edit `uv.lock` (`AGENTS.md:250`: regenerate lockfiles, never hand-edit).

---

### `.gitignore`, `justfile`, CI workflow (config / build / CI)

**Analog:** Phase 1's build scaffolding, which is the canonical shape this repo has already decided.

**`.gitignore` (verbatim list, `01-01-PLAN.md:138`):**

> "Write `.gitignore` covering `upstream-cache/`, `node_modules/`, `target/`, `.venv/`, `dist/`, `build/`, `__pycache__/`, `*.pyc`."

Phase 3 adds `packages/halo_agent/.venv`, `*.pytest_cache/`, and the temp `state.db*` fixtures; it must not add anything that hides `packages/halo_agent/uv.lock` (that file is committed).

**`justfile` shell directive (verbatim, `01-01-PLAN.md:247`):**

> "Write the root `justfile` with `set shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]` under a `[windows]` attribute (just defaults to `sh` on Windows and every recipe would otherwise die with "could not find `sh`")."

**Recipe placement (verbatim, `01-09-PLAN.md:90`):**

> "`verify` depends on nothing else in the file and runs, in order: `bun run tools/provenance/cli.ts fetch --all` …, then `verify --all`, then `replay --all`, then `bun test tools/provenance`, then `bun test tests/provenance`."

Phase 3 adds `test` and `eval` as siblings, not rewrites: `test` runs the pytest lane from the repo root with the explicit project flag; `eval` runs the deterministic ledger lane. The CI gate becomes `just verify && just test && just eval` (`03-RESEARCH.md:1128`), which must remain one job that calls the same recipes, never a re-implemented command list (`01-09-PLAN.md:43`: "The workflow must call `just verify`, not re-implement its steps").

**CI shape (verbatim pattern, `02-08-PLAN.md:126`):**

> "`windows-latest` … steps: bun setup (Phase 1 pin), uv setup, `bun install --frozen-lockfile`, `just verify`, …"

Add the uv setup step and `just test && just eval`. Do not add `continue-on-error` / `if: always` (`02-08-PLAN.md:133` asserts their absence).

---

### `halo_agent/cli.py` (utility, request-response)

**Analog:** `tools/provenance/cli.ts` dispatcher — planned (`01-09-PLAN.md:88`) and its one-entry-point rule (`01-01-PLAN.md:75`).

**Dispatcher pattern (verbatim, `01-09-PLAN.md:88`):**

> "Each subcommand delegates to the module's exported function — no logic is duplicated in the dispatcher, and no module's main guard is the only way to reach it. Unknown subcommands exit 2 and write the usage line … to **stderr** (stdout stays reserved for the result lines the gates parse)."

**Apply:** `halo-agent sessions <resume|list|search|branch|export|import>` delegates to `state/sessions.py` functions. One fixed vocabulary and exit contract: `0` success, `1` finding/refusal, `2` usage/malformed input. Same discipline as `verify.ts` (`01-08-PLAN.md:95`: fixed tokens, cap printed findings, exit 2 on malformed ledger). No chat loop, no renderer (`03-RESEARCH.md:1047-1052`).

**Imports pattern:** stdlib (`argparse`, `json`, `sys`) plus `halo_agent.*`; no `agent.*` import here (G1, `03-RESEARCH.md:742`).

---

### `halo_agent/loop/_vendor.py` (service, import boundary)

**Analog:** the architecture import rule (`ARCHITECTURE.md:788-790`) and the hand-written-vs-generated module convention (`02-06-PLAN.md:208`).

**Import rule (verbatim, `ARCHITECTURE.md:788-790`):**

> "- `packages/halo_agent` never imports `vendor/hindsight`; it speaks HTTP. It may import Hermes modules (same process), but only through the `loop/` facade."

**Module convention (verbatim, `02-06-PLAN.md:208`):**

> "Create hand-written shims `legacy_runtime.ts` (TS) + `halo_agent/legacy_runtime.py` (Python) — the naming mirrors plan 02-03's hand-written `wire_runtime.ts` vs generated `wire.gen.ts` convention. Import ONLY the generated tables …"

**Core pattern (from `03-RESEARCH.md:749`):** "`_vendor.py` is that facade: it re-exports factory functions (`make_agent`, `compressor_for`, `provider_for`) rather than classes where possible." Identity: `import agent.conversation_loop`, `agent.agent_init`, `agent.tool_executor`, `model_tools`, `hermes_state` may appear **only** here (`03-RESEARCH.md:742`, gate G1).

**Do not:** re-export `AIAgent.chat()`; exposing it makes the runtime guard (G2) the only defence.

---

### `halo_agent/loop/authority.py` + `halo_agent/loop/turn.py` (service guard + model/predicate)

**Analog:** no executed analog for the authority token; the model-boundary style is AI-SPEC's Pydantic block (`03-AI-SPEC.md:354-389`).

**Authority contract (verbatim, `03-RESEARCH.md:743`):**

> "`LoopAuthority` holds a module-level singleton; `create_authority()` raises `SecondLoopDetected` on a second call; `AgentLoop`'s constructor requires the token object that only `create_authority()` mints"

That is gate G2. It is paired with G1's static AST scan and G4's protocol check (`03-RESEARCH.md:742-745`); a test must attempt the violation and observe the refusal, not merely inspect a document (`01-09-PLAN.md:136`: "Workspace isolation is a failing test if violated, not a convention in a document").

**Pydantic boundary (verbatim rule, `03-AI-SPEC.md:354`):**

> "**every model-produced structure passes a Pydantic v2 boundary before touching loop state**; a bare `json.loads` whose output reaches the transcript or the adapter is a defect."

**Model shapes (`03-AI-SPEC.md:363-389`, `[PLANNED design excerpt]`):** `ToolCallIn` (`extra="forbid"`), `TurnEvent` (mints 32-hex `message_uid`, carries `content_sha256`, `display_kind`), `TurnClose` (`terminal`, `reason`, `outstanding_background_work == 0`). `TurnEvent.kind` is `Literal["user","assistant_delta","assistant","tool","context","terminal"]`.

**Predicate pattern (`03-RESEARCH.md:581-595`, `[PLANNED design excerpt]`):**

```python
def is_turn_complete(conn, turn_id: str) -> bool:
    t = conn.execute("SELECT terminal_at FROM turns WHERE turn_id=?", (turn_id,)).fetchone()
    if t is None or t["terminal_at"] is None:
        return False
    bg = conn.execute("SELECT COUNT(*) FROM turn_background_work "
                      "WHERE turn_id=? AND state IN ('pending','running')", (turn_id,)).fetchone()[0]
    tools = conn.execute("SELECT COUNT(*) FROM tool_invocations "
                         "WHERE turn_id=? AND state IN ('reserved','dispatched')", (turn_id,)).fetchone()[0]
    return bg == 0 and tools == 0
```

`turn.py` owns this function and nothing else writes `closed_at` (`03-RESEARCH.md:578`). `RefusedClose` is the typed refusal (`03-RESEARCH.md:1109`).

**Validation pattern:** one bounded correction attempt for malformed model JSON, then a typed error (`03-AI-SPEC.md:391-405`); never a retry loop.

---

### `halo_agent/loop/agent_loop.py` (service, streaming orchestration)

**Analog:** only the AI-SPEC lifecycle sketch (`03-AI-SPEC.md:180-234`) — `partial-planned`, no executable precedent.

**Turn ordering (verbatim comments, `03-AI-SPEC.md:188-200`):**

> "t0 — durable admission FIRST … `turn_id = await store.admit_input(session_id, mode, user_text)`"
> "t1 — user row persisted before any provider call (append-only, single writer; the insert mints message_uid)"

**Core pattern:** admission → persist user row → preflight compaction → `RequestBuilder.build()` → provider stream → finalize one assistant row → `update_from_response(usage)` → tool batch through `adapter.dispatch_batch` → repeat → `close_turn()` only if the predicate holds. Streaming deltas feed surfaces only; they are never persisted (`03-AI-SPEC.md:410-416`, `03-RESEARCH.md:776`).

**Error handling:** typed exceptions `StoreOwnedElsewhere`, `SecondLoopDetected`, `AdmissionBlocked`, `RefusedClose`, `StoreNotWal`; a refused close leaves the turn open and writes a typed event row (`03-AI-SPEC.md:515`).

**Do not:** construct a second authority in tests via `asyncio.run()` (`03-RESEARCH.md:871`); dispatch a tool inline; key completion on a frame type (`03-RESEARCH.md:773-777`).

---

### `halo_agent/loop/request.py` (service, canonical bytes + mirror manifest)

**Analog:** `tools/contract/gen.ts`'s one canonical serialization (`02-02-PLAN.md:133`) and the manifest writer's one hash implementation (`01-01-PLAN.md:140`).

**One-canonical-function rule (verbatim, `02-02-PLAN.md:133`):**

> "`canonicalBytes(contract)` (sorted keys, `":"`/`","` separators, UTF-8 — the ONE canonical serialization in the repo; RESEARCH Don't-Hand-Roll row: canonical-form drift across languages = permanent mismatch)"

**One-hash rule (verbatim, `01-01-PLAN.md:140`):**

> "`tools/provenance/manifest.ts` owns exactly one hashing/formatting implementation, used by both stage and replay…"

**Implementation shape (`03-RESEARCH.md:631-665`, `[PLANNED design excerpt]`):**

```python
@dataclass(frozen=True, slots=True)
class RequestPayload:
    request_id: str
    body: bytes
    manifest: tuple[MirrorRow, ...]
    message_count: int
    bytes_total: int
    request_sha256: str

PERSISTENCE_ONLY_FIELDS = frozenset({
    "message_uid", "_message_uid", "absorbed_message_uids", "_absorbed_message_uids",
    "tool_call_uids", "_tool_call_uids", "tool_call_uid", "_tool_call_uid", "_row_id",
})

def canonical_bytes(msg) -> bytes:
    stripped = {k: v for k, v in msg.items() if k not in PERSISTENCE_ONLY_FIELDS}
    return json.dumps(stripped, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False).encode("utf-8")
```

**Validation:** hash **after** stripping persistence-only fields (`03-RESEARCH.md:651-653`); scrub lone surrogates **before** hashing (`03-RESEARCH.md:682`); manifest + request-context rows persist in the same transaction as the build (`03-RESEARCH.md:646-649`).

**Do not:** serialize anywhere else; recompute a "canonical" form with a second function; pass a raw message list to a transport (`03-RESEARCH.md:632-636`).

---

### `halo_agent/loop/compaction.py` + `halo_agent/loop/recovery.py` (service, batch)

**Analog:** `partial-planned` only. The nearest transferable mechanism is Phase 2's crash-simulated, digest-verified resume (`02-06-PLAN.md:150,155`), not the compaction logic itself.

**Resume-by-digest discipline (verbatim, `02-06-PLAN.md:155`):**

> "…stream-copy files with per-file SHA-256 verify (source hash vs written hash)… resume by comparing per-file digests (skip equal, copy missing, never clobber newer)."

**Crash-idempotence test discipline (verbatim, `02-06-PLAN.md:150`):**

> "crash-simulation (kill copy loop at fixture k) then re-run completes to the same final bytes."

**Compaction commit sequence:** `03-RESEARCH.md:709-735` (`[PLANNED design excerpt]`) — `on_pre_compress` archive commits first; validate the candidate list; flip old generation `active=0`; insert new generation; copy retained rows with the **same** `message_uid`; update `sessions`; insert `compaction_runs(status='committed')`; all in one `BEGIN IMMEDIATE`.

**Do not:** add a second compaction authority (gateway hygiene, `micro_compact`) — `03-RESEARCH.md:734`, Research Flag R5; do not delete `active=0` rows.

**Recovery transaction:** `03-RESEARCH.md:942-968` (`[PLANNED design excerpt]`) — liveness check *inside* the write transaction, dead-owner `started → unknown`, `compaction_runs running → interrupted`, epoch upsert, `clean_shutdown=0`. `StoreOwnedElsewhere` is raised on a live foreign epoch.

---

### `halo_agent/state/schema.sql` + `halo_agent/state/migrations.py` (config DDL + migration)

**Analog:** **none** for the DDL; `role-match-planned` for the runner's idempotence, from Phase 2's `migrate()`.

**DDL source:** `03-RESEARCH.md:267-537` is the contract (17 tables, 2 FTS5 external-content tables, 7 triggers). It is not copied from an existing file; it must be transcribed exactly, including `AFTER UPDATE OF content, tool_name, tool_calls` (`03-RESEARCH.md:426-434`) and the four immutability triggers (`03-RESEARCH.md:512-536`).

**Migration discipline (verbatim, `03-RESEARCH.md:819`):**

> "open with `isolation_level=None` and drive `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` explicitly; run migrations as one explicit transaction over plain `execute()` calls; never use `executescript()` inside a transaction"

**Idempotence token pattern (from Phase 1, `01-03-PLAN.md:94`):** a second run prints `… unchanged` and writes nothing; drift is a named refusal, not a silent rewrite.

**Validation:** a store without `halo_schema_version` must be refused with a typed error naming the file (`03-RESEARCH.md:1045` R16) — this is the guard against a migrated legacy Hermes `state.db`.

**Do not:** use Alembic/SQLAlchemy (`03-RESEARCH.md:787-793`); split the runner from `schema.sql`; let `executescript()` commit a half-applied schema.

---

### `halo_agent/state/store.py` + `halo_agent/state/admissions.py` (service, CRUD)

**Analog:** `partial-planned` for `store.py` (research sketch only); **none** for `admissions.py`.

**Connection/pragma shape (`03-RESEARCH.md:248-256`, `[PLANNED design excerpt]`):**

```python
conn = sqlite3.connect(str(db_path), isolation_level=None, timeout=5.0)
mode = conn.execute("PRAGMA journal_mode=WAL").fetchone()[0]
if mode.lower() != "wal":
    raise StoreNotWal(f"journal_mode={mode!r}; refusing to run on a non-WAL store")
conn.execute("PRAGMA synchronous=FULL")
conn.execute("PRAGMA foreign_keys=ON")
conn.execute("PRAGMA busy_timeout=5000")
```

**Writer-thread shape (`03-RESEARCH.md:884-930`, `[PLANNED design excerpt]`):** one `threading.Thread` named `halo-state-writer`, one `queue.SimpleQueue`, `Future` results bridged by `asyncio.wrap_future`; the connection is created **inside** the thread so `check_same_thread=True` stays correct. Readers open `file:<path>?mode=ro` with `PRAGMA query_only=ON`.

**Admission ordering (`03-RESEARCH.md:547-575`, `[PLANNED design excerpt]`):** (1) idempotency-key lookup returns the original row; (2) any `unknown` row blocks later admissions with `AdmissionBlocked`; (3) append at the FIFO tail inside `BEGIN IMMEDIATE`. `resolve_unknown()` is explicit and user-visible; never automatic.

**Validation:** assert the WAL return value; check drive type **before** open (`03-RESEARCH.md:262-266`, `:822-826`); `runtime_epoch` ownership is checked inside the write transaction (`03-RESEARCH.md:942-950`).

**Do not:** use `aiosqlite` (`03-RESEARCH.md:127`); use `filelock` as a second ownership truth; share one connection across `asyncio.to_thread`.

---

### `halo_agent/state/sessions.py` (service, CRUD + file I/O)

**Analog:** `partial-planned` — Phase 2's copy-verify + marker idempotence (`02-06-PLAN.md:155`) transfers to export/import; nothing transfers for resume/branch/search semantics.

**Export atomicity (verbatim mechanism, `02-PATTERNS.md:140`):**

> "copy-never-move; per-file SHA-256 verify …; second launch is a byte-no-op mirroring Phase 1's `… unchanged` idempotence tokens"

**Core pattern:** `03-RESEARCH.md:756-784` — `resume` restores `message_uid` unconditionally; `list` orders by `started_at DESC`; `search` uses `messages_fts` + `messages_fts_trigram` with the upstream `_sanitize_fts5_query()`; `branch` refuses while `session_busy`, copies uids, extends the cut through tool results; `export` writes temp + `os.replace` inside one read transaction; `import` validates schema + manifest and refuses a uid-content conflict.

**Validation:** validate the export document before parsing, cap input size, refuse unknown keys and forward references (`03-RESEARCH.md:1142,1150`).

**Do not:** mint new uids on copy; write the export to `%TEMP%` (`03-RESEARCH.md:1155`); open a second database.

---

### `halo_agent/state/paths.py` (utility, file I/O)

**Analog (exact planned precedent):** `runtime/shared_contracts/halo_agent/home_paths.py` — created by `02-06-PLAN.md:111,121`.

**Contract (verbatim, `02-06-PLAN.md:121`):**

> "Hand-written resolvers `halo_home.ts` (TS) + `halo_agent/home_paths.py` (Python) import only those generated tables: `resolve_halo_home()`: `HALO_HOME` env if set (validate absolute, refuse relative with a typed error), else platform default …"

**Phase 3 rule (verbatim, `03-RESEARCH.md:264`):** "resolve the data dir through Phase 2's `resolve_home()` (never re-implement it) and refuse when the path is a UNC path (`\\`) or `GetDriveTypeW(root) == DRIVE_REMOTE` (4)."

**Windows discipline:** `AGENTS.md:15` (Windows-first, only Windows tested); `AGENTS.md:248` (`%LOCALAPPDATA%`, never roaming); `STACK.md:220` (Electron `userData` trap). Imports: stdlib `os`, `pathlib`, `ctypes`; **no** second home-resolution implementation and no direct legacy-env read (Phase 2's `legacy_runtime.py` is the only reader, `02-06-PLAN.md:208`).

**Test pattern:** live-machine probe, not `~` notation (`02-06-PLAN.md:111` read_first cites `01-02-PLAN.md:170-176`; `02-06-PLAN.md:183` runs a real `uv run python -c …`).

---

### `halo_agent/provider/transport.py` + mock server (service / test utility)

**Analog:** **none** in either language. This is the first HTTP server and the first byte-recording transport in the repo.

**Required shape (from `03-RESEARCH.md:672-680`):** a `ThreadingHTTPServer` on `127.0.0.1:0` that reads the full body via `Content-Length`, records it to a file, and replays scripted SSE chunks; the production transport accepts a `RequestPayload` and nothing else. Dev builds set `HALO_LOOP_STRICT_MIRROR=1` / `HALO_LOOP_RECORD=1` (`03-RESEARCH.md:810`).

**Windows rules to copy:** argv-array spawns with no shell and no pipes (`01-01-PLAN.md:121`); `windowsHide: true`, `detached: false` (`AGENTS.md` §4 via `STACK.md`); bind loopback only. For Python tests, `subprocess` with an argv list, never `shell=True`.

**Testing:** assert `len(body) == int(headers["content-length"])`; hash bytes, never truncate; a 2 MiB fixture must pass (`03-RESEARCH.md:674-682`). No test asserts only a non-zero exit (`01-08-PLAN.md:144`).

**Do not:** mock `client.chat.completions.create()` — it proves nothing about serialization (`03-RESEARCH.md:672-673`).

---

### `halo_agent/admission.py` (middleware, redaction)

**Analog:** `partial-planned` — Phase 2's secret-file handling and Phase 1's sensitivity test transfer; the redaction pattern set does not exist.

**Security rule (verbatim, `03-AI-SPEC.md:85`):**

> "The mirror rule (LOOP-05) deliberately persists bytes-as-sent, so redaction must happen at admission, not at render time"

**Secret-handling discipline to copy (verbatim, `02-06-PLAN.md:155`):**

> "secret files get the same restrictive DACL as the home; contents only ever streamed, never interpolated into a log string"

**Test pattern (verbatim, `01-05-PLAN.md:125`):**

> "A fixture tree rewritten by the unfiltered replacement changes a licence file's SHA-256, proving the fixture is sensitive; the filtered rewrite leaves every licence-ish SHA-256 unchanged."

Mirror it as the canary sweep: a planted canary **must** be found by the unfiltered scan and **must** be absent from every text column, the export, and the log after redaction (`03-AI-SPEC.md:454`). Every redaction writes a `loop_events` row.

**Validation:** redact before insert **and** before `RequestPayload` build (`03-RESEARCH.md:1149`); the scrub and hash order is scrub → hash → persist (`03-RESEARCH.md:682`).

---

### Tests (`tests/conftest.py`, `tests/state/*`, `tests/loop/*`, `tests/mirror/*`, `tests/evals/*`)

**Harness:** pytest 9.1.1 + pytest-asyncio 1.4.0 under `uv run --project packages/halo_agent` (`03-RESEARCH.md:1094-1096`). No `bun test` for Python modules; the Bun lane stays on Phase 1/2 tooling.

**Assertion discipline (verbatim, `01-08-PLAN.md:131,144`):**

> "assert the literal finding token and the path text — never merely a non-zero exit"
> "Print the case names … so a filter that matched nothing is visible… No case asserts only a non-zero exit code."

**Isolation (verbatim, `01-08-PLAN.md:126`):** "Each negative runs against a fresh scratch copy so one case cannot contaminate the next" — for Phase 3 that means a fresh temp `state.db` and a fresh temp home per case, never the developer's `%LOCALAPPDATA%\HALO`.

**Fixture helpers (`03-RESEARCH.md:1124`):** `conftest.py` owns the tmp-store factory, injectable clock, killable child helper, and the mock-provider server fixture. Async scoping: `asyncio_mode="auto"`, one `loop_scope="session"` writer fixture, no `asyncio.run()` inside tests (`03-RESEARCH.md:869-871`).

**Per-suite specifics:**
- `test_schema.py` — create from scratch, re-open, idempotent migration, `journal_mode == "wal"` (`03-RESEARCH.md:1125`).
- `test_interpreter.py` — probe SQLite version, `ENABLE_FTS5`, `unicode61`/`trigram`, `uuid7()` (`03-RESEARCH.md:1129`); mirrors the live-probe discipline at `02-06-PLAN.md:111`.
- `test_single_writer.py` — spawn a real second process: reader sees the row; writer gets `StoreOwnedElsewhere`; non-WAL return refused (`03-RESEARCH.md:1105`).
- `test_sessions.py` / `test_search.py` — uid preservation, branch tool-result extension, byte-stable export→import→export, 2 MiB tail token + trigram substring (`03-RESEARCH.md:1106`).
- `test_redaction.py` — canary sweep as above (`03-RESEARCH.md:1110`).
- `test_crash_recovery.py` — kill a child after `started`; next open marks `unknown`; new admission refused until `resolve_unknown` (`03-RESEARCH.md:1111`). Copy the crash-simulation shape from `02-06-PLAN.md:150`.
- `test_single_loop.py` — AST gate over `packages/halo_agent/**/*.py` for forbidden imports/calls, plus a hostile module that calls `AIAgent.chat()` and must be refused at runtime (`03-RESEARCH.md:738-750`).
- `test_turn_lifecycle.py` — variant matrix and DB-trigger aborts, each asserting the literal SQLite error token (`turn_reopen_forbidden`, `turn_already_closed`, `terminal_signal_frozen_after_close`), per `01-08-PLAN.md:131,144`.
- `test_steer_interrupt.py` — steer-during-stream leaves legal alternation; interrupt writes synthetic tool results in call order (`03-RESEARCH.md:1104`).
- `test_compaction.py` — one engine, `checkpoint_required` blocks on archive failure, one `active=1`, protected tail intact, usage verbatim (`03-RESEARCH.md:1107`).
- `tests/mirror/*` — per-position hash equals the hash recomputed from the recorded HTTP body; >1 MiB passes (`03-RESEARCH.md:1108`).
- `tests/evals/ledger/*.jsonl` — the 12 sessions from `03-AI-SPEC.md:485-499`; each is a scripted stream + store post-conditions. Fixture-tree builders should follow Phase 1/2's `make-fixture.ts` / `migrate-fixture.ts` pattern (`01-08-PLAN.md:99`; `02-PATTERNS.md:135`; `02-06-PLAN.md:105`).

---

## Shared Patterns

### S1 — One producer, one predicate, one canonical form
**Source:** `01-01-PLAN.md:72-73` ("must share one manifest function"), `01-01-PLAN.md:73` (`isLedgerPath()` one predicate), `02-02-PLAN.md:133` (one canonical serialization), `01-05-PLAN.md:131` ("one matcher, two callers").
**Apply to:** `request.py` (`canonical_bytes`, `RequestBuilder`), `turn.py` (`is_turn_complete`), `store.py` (the only writable connection), `sessions.py` (export manifest), `_vendor.py` (the only `agent.*` import). A second copy is the named regression in every case.

### S2 — Fail loud, typed, named; exit codes are part of the contract
**Source:** `01-08-PLAN.md:95` (fixed vocabulary, cap 200 lines, exit 1 findings / 2 malformed / 0 clean), `01-05-PLAN.md:126` (a dead guard is itself a finding), `01-01-PLAN.md:122` (typed refusal before touching disk).
**Apply to:** `StoreNotWal`, `StoreOwnedElsewhere`, `SecondLoopDetected`, `AdmissionBlocked`, `RefusedClose`, CLI usage, export/import refusal, migration refusal. Name the offending path/field/turn; never print a secret or a body.

### S3 — Byte-stable, idempotent output
**Source:** `01-01-PLAN.md:126` ("LF-joined with a final LF, no BOM, sorted with a byte comparator"), `01-01-PLAN.md:128` ("`MANIFEST OK <tree> unchanged`"), `01-03-PLAN.md:94` (`… unchanged` no-op).
**Apply to:** `canonical_bytes`, export JSON, `uv.lock` regeneration checks, migration second-run, ledger fixtures. No timestamps in hashed documents; sort keys; UTF-8; `ensure_ascii=False`.

### S4 — Validate before writing
**Source:** `02-01-PLAN.md:130` ("validate BEFORE opening any output file"), `02-01-PLAN.md:170` ("build all outputs in memory, validate, then write (all-or-nothing)").
**Apply to:** `migrations.py` (validate `halo_schema_version` before any DDL), `sessions.py` import (schema + size cap before parse), `admission.py` (redact before insert), `schema.sql` application (one transaction, no partial schema).

### S5 — Executable assertions over prose
**Source:** `01-09-PLAN.md:136` ("isolation is a failing test if violated, not a convention in a document"), `01-08-PLAN.md:131,144`.
**Apply to:** G1/G2/G3/G4 gates, DB triggers, WAL pragma, FTS integrity, mirror equality, turn lifecycle. Every invariant in `03-AI-SPEC.md` §5 must end in a named test, not a README line.

### S6 — Fixture isolation and sensitivity
**Source:** `01-08-PLAN.md:126` (fresh scratch per negative), `01-05-PLAN.md:125` (prove the fixture can detect tampering, then prove the filter stops it).
**Apply to:** redaction canary, FTS desync, crash recovery, WAL refusal, store ownership, mirror fixtures.

### S7 — Windows discipline
**Source:** `AGENTS.md:15` (only Windows tested), `AGENTS.md:248` / `STACK.md:220` (`%LOCALAPPDATA%`, never roaming), `01-01-PLAN.md:121` (argv-array, no shell, no pipe), `01-01-PLAN.md:247` (`[windows]` pwsh shell).
**Apply to:** `paths.py`, `transport.py`, `conftest.py` subprocess helpers, `justfile`, CI. Refuse UNC and `DRIVE_REMOTE`; never use `~` notation in assertions.

### S8 — Live-environment probes, not assumptions
**Source:** `02-06-PLAN.md:111` (real Windows home, DACL and `git check-ignore`), `02-06-PLAN.md:183` (real `uv run python` verification), `03-RESEARCH.md:1068-1084` (environment table with fallbacks).
**Apply to:** `test_interpreter.py`, `paths.py`, `test_single_writer.py` (real second process), `test_crash_recovery.py` (real killed child). Record the observed branch in the SUMMARY.

### S9 — Import boundary (no second authority)
**Source:** `ARCHITECTURE.md:788-790`, `03-RESEARCH.md:742-745`.
**Apply to:** the AST gate and every module. `agent.*` imports only in `_vendor.py`; `AIAgent(`/`run_conversation(`/`.chat(` only in `_vendor.py` and `agent_loop.py`; turn-starting frames never reach a tool-backend session.

### S10 — Package/pin discipline and the [SUS] checkpoint
**Source:** `AGENTS.md:34,36,37` (Python 3.14.9, uv 0.13.5, just 1.59.0), `03-RESEARCH.md:145-156` (pydantic / pytest / pytest-asyncio flagged `SUS`), `AGENTS.md:250` (never text-edit lockfiles).
**Apply to:** Wave 0 install tasks. Insert `checkpoint:human-verify` before adding `pydantic`, `pytest`, and `pytest-asyncio`; prefer inheriting the vendored Hermes tree's pydantic constraint (`03-RESEARCH.md:1012` A1) over a second pin.

### S11 — Resolve the `halo_agent` two-root collision before any loop code
**Source:** `03-RESEARCH.md:1041` (R12), `02-01-PLAN.md:60` ("a path change here forks the vocabulary location"), `02-06-PLAN.md:183` (Phase 2's own `from halo_agent.migrate import …` check).
**Apply to:** the first Phase 3 task. Options, in preference order: declare `runtime/shared_contracts/halo_agent` as an extra package root of the `packages/halo_agent` distribution; rename Phase 2's package to `halo_contracts`; a confined `importlib` loader. Whichever is chosen, Phase 2's check must stay green. Do not create a second top-level `halo_agent/` on `sys.path` by accident.

### S12 — Vendored edits are recorded patches
**Source:** `02-RESEARCH.md:84` ("`provenance-verify` fails on unrecorded vendored edits"), `01-SKELETON.md:25` (replay applies `patches/series`), `03-RESEARCH.md:67`.
**Apply to:** the wrap-vs-patch decision (R3). If a persistence-seam patch is needed, it lands in `vendor/hermes-agent/provenance/patches/series`, refreshes `renames_sha256`, restages `MANIFEST.vendored.tsv`, and `just verify` stays green.

---

## No Analog Found

| File | Role | Data Flow | Reason / Substitute |
|------|------|-----------|---------------------|
| `halo_agent/state/schema.sql` | config (DDL) | batch | No SQL schema exists anywhere in the repo. Substitute: transcribe `03-RESEARCH.md:267-537` verbatim; the DDL was probed on SQLite 3.53.1 (`03-RESEARCH.md:1161-1164`). |
| `halo_agent/state/admissions.py` | service | CRUD, event-driven | No state machine exists. Substitute: `03-RESEARCH.md:538-575` ordering contract + the DDL transition trigger (`:527-535`). |
| `halo_agent/loop/authority.py` | service | event-driven | No runtime singleton/guard precedent. Substitute: gate G2 spec (`03-RESEARCH.md:743`); prove by attempting the violation in a test. |
| `halo_agent/provider/transport.py` | service | streaming | No HTTP client/server code exists. Substitute: `03-RESEARCH.md:672-680` byte-recording requirements. |
| `packages/halo_agent/tests/provider/mock.py` | test utility | streaming | No mock server exists. Substitute: Wave 0 spec (`03-RESEARCH.md:1126`) + SSE replay shape (`:672-680`). |
| `tests/state/test_single_writer.py` | test | multi-process | No multi-process test exists. Substitute: `03-RESEARCH.md:1105` + the epoch liveness rule (`:942-968`). |
| `tests/state/test_search.py` | test | file-I/O | FTS5 is unused in Phases 1/2. Substitute: `03-RESEARCH.md:756-766, 1106`; reuse upstream's `_sanitize_fts5_query()` (R1). |
| `tests/loop/test_single_loop.py` | test | batch scan | The AST gate is new. Substitute: `03-RESEARCH.md:738-750` (G1/G2/G3/G4). |
| `tests/loop/test_steer_interrupt.py` | test | streaming | No streaming fixture exists. Substitute: `03-RESEARCH.md:596-619, 1104`. |
| `tests/loop/test_compaction.py` | test | batch | No compaction exists. Substitute: `03-RESEARCH.md:684-735, 1107`. |
| `tests/mirror/test_request_builder.py` | test | wire-level | No wire recorder exists. Substitute: `03-RESEARCH.md:620-683, 1108` + 2 MiB fixture. |
| `halo_agent/evals/judge.py` | utility | batch | No LLM-judge lane exists, and it is excluded from the deterministic gate (`03-AI-SPEC.md:457-480`). Leave it to a later eval phase unless the planner explicitly scopes it. |
| `halo_agent/__init__.py` and subpackage `__init__.py` | config | n/a | First Python package in the repo. Keep them empty except `__version__`; no re-exports that could create a second import surface. |
| `halo_agent/provider/mock.py` (package-located variant) | utility | streaming | Same reason as `tests/provider/mock.py`: no server exists, and the runtime package must not ship test code. Resolve the path conflict in favor of `tests/provider/mock.py` (`03-RESEARCH.md:1126`). |

---

## Wave 0 Creation Order (planner hint)

1. Resolve R12 (`03-RESEARCH.md:1041`) and record the decision.
2. `packages/halo_agent/pyproject.toml` + `uv.lock` + `[SUS]` checkpoints (S10).
3. `tests/conftest.py` + `tests/state/test_interpreter.py` (prove the interpreter/SQLite/FTS5 assumptions before any store code).
4. `state/schema.sql` + `state/migrations.py` + `tests/state/test_schema.py`.
5. `state/store.py` + `state/paths.py` + `state/admissions.py` + `state/recovery` path in `loop/recovery.py`.
6. `provider/*` + mock server + `tests/mirror/*`.
7. `loop/_vendor.py` + `loop/authority.py` + `loop/turn.py` + `loop/agent_loop.py`.
8. `loop/request.py` + `loop/compaction.py` + `state/sessions.py` + `cli.py`.
9. `justfile` recipes, CI, 12 ledger fixtures.

This order follows the research's own build order (`03-RESEARCH.md:96`: schema → admissions/recovery → loop → request/mirror → compaction → resume/branch/export) and keeps every test runnable at the moment its subject lands.

## Metadata

**Analog search scope:** repo root (`AGENTS.md`, `.planning/PROJECT.md`, `.planning/STATE.md`), `.planning/research/` (`ARCHITECTURE.md`, `STACK.md`, `PITFALLS.md`), `.planning/phases/01-import-provenance-ledger/` (`01-01`, `01-02`, `01-03`, `01-05`, `01-08`, `01-09`, `01-SKELETON.md`), `.planning/phases/02-rebrand-wire-contract-migration/` (`02-01`, `02-02`, `02-03`, `02-06`, `02-08`, `02-PATTERNS.md`, `02-RESEARCH.md`), `.planning/phases/03-unified-loop-session-authority/` (`03-RESEARCH.md`, `03-AI-SPEC.md`, `03-VALIDATION.md`).
**Files scanned:** 23 tracked planning documents; no source files exist to scan.
**Tracked-source gate:** every cited planning document verified as git-tracked with `git ls-files`; every cited artifact outside `.planning/` is labeled planned because it does not exist; no gitignored mirror path is cited. `packages/`, `vendor/`, `runtime/`, `apps/`, `tools/`, `contracts/`, `tests/`, `src/` verified absent.
**Pattern extraction date:** 2026-10-23
