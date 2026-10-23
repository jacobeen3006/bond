# Phase 4: Tool Registry & Policy Gate - Pattern Map

**Mapped:** 2026-10-23
**Files analyzed:** 27 planned file/group rows (≈33 physical files once package markers, the `tools/backends/` pair, and the per-requirement test files are expanded), derived from `04-RESEARCH.md` §Recommended Project Structure (`:187-202`), §Patterns 1-7 (`:204-247`), §Code Examples (`:328-444`), §GATE-04 Hookable Obligations (`:446-452`), §Open Questions forks (`:481-502`), and §Validation Architecture (`:522-554`). No `CONTEXT.md` exists for this phase.
**Analogs found:** **0 executed-source analogs / 27.** 13 rows have an **exact planned precedent** (a contract line, DDL block, seam definition, or code sketch that dictates the artifact shape at line level); 3 rows have **role-match planned** precedents; 11 rows have **partial planned** precedents (only a mechanism — fail-closed, named tokens, byte-pinning, Pydantic boundary — transfers); **0 rows have no precedent at all.** This is Phase 4's structural advantage over Phase 3: every artifact slots into, extends, or guards a seam that Phase 1-3 planning already pins down, or has its code written verbatim in `04-RESEARCH.md` §Code Examples.

> **Repo reality — read this before planning.** (Same posture the Phase 3 map established; see `03-PATTERNS.md:7-14` for the original block.)
> The working tree contains only `.planning/**` and `AGENTS.md` — 55 tracked files total (verified this session: `git ls-files | wc -l` → 55; `git ls-files -- packages contracts vendor justfile` → 0 lines). Phases 1-3 are **authored but not executed**: no `packages/halo_agent/`, no `contracts/`, no `vendor/`, no `state/schema.sql` exists yet.
>
> Consequences for this map:
> 1. Every "analog" below is a **planned precedent**, never existing source. Each excerpt is quoted verbatim from a tracked planning document at the cited lines; it is a convention the planner may copy, not code that runs today.
> 2. Code sketches inside `04-RESEARCH.md` §Code Examples are `[PLANNED]` shapes, marked as such there (`04-RESEARCH.md:5, 377`). No file exists.
> 3. **Every Phase 4 plan carries the hard precondition that Phases 1-3 have executed** — "The gate sits inside `packages/halo_agent/halo_agent/adapter/dispatch.py` as created by plan 03-07" (`04-RESEARCH.md:7`, cut line; whole text at `:7:raw`). And the research itself must be re-validated against the landed Phase 3 code (`adapter/dispatch.py`, `state/schema.sql`, `loop/agent_loop.py`) as the first task of Wave 1: "the seam shapes quoted here are the *planned* shapes of 03-07, which has not executed yet" (`04-RESEARCH.md:609`).
> 4. Tracked-source gate: every cited **planning document** prints from `git ls-files` (26 documents re-verified this session); planned artifact paths are always prefixed as planned and never presented as existing. No gitignored mirror path is cited. Lines from Phase 1/2 plans not re-opened this session are cited as "quoted in `03-PATTERNS.md:NN`", which is itself tracked.

---

## File Classification

Legend for **Match Quality** (unchanged from `03-PATTERNS.md:20`): `exact-planned` = the precedent dictates the same artifact shape with a line-level contract; `role-match-planned` = same role/flow in another language or phase; `partial-planned` = only a mechanism transfers; `none` = no precedent exists.

| New/Modified File | Role | Data Flow | Closest Analog (planned precedent) | Match Quality |
|---|---|---|---|---|
| `contracts/tool-ownership.json` (new; `.yaml` under Fork G4) | config (ownership contract) | transform (build/startup load) | field line (`ARCHITECTURE.md:773`) + content sketch (`04-RESEARCH.md:411-429`) + Phase 2 `contracts/rpc-wire.json` JSON-contract convention (`04-RESEARCH.md:101`) | exact-planned |
| `halo_agent/tools/__init__.py`, `tools/backends/__init__.py`, `policy/__init__.py`, `policy/rules/__init__.py` | config (package markers) | n/a | marker rule: "Keep them empty except `__version__`; no re-exports that could create a second import surface" (quoted in `03-PATTERNS.md:475`) | exact-planned |
| `halo_agent/tools/ownership.py` | service (contract loader + Pydantic v2 models) | batch (startup validation) | `extra="forbid"` boundary models (`03-AI-SPEC.md:354,363-368`); loader reject rules (`ARCHITECTURE.md:189-191`, `04-RESEARCH.md:210,229`) | role-match-planned |
| `halo_agent/tools/registry.py` | service (startup catalog; name→Binding resolve) | request-response | ARCH §2.2 precedence verbatim (`ARCHITECTURE.md:171-191`); Binding fields (`ARCHITECTURE.md:148`); the seam it registers against (`03-07-PLAN.md:155`) | exact-planned |
| `halo_agent/tools/backends/` (`echo_test` + `gate_fixture_writer` handlers) | service (in-process tool handlers) | request-response | test-backend registration pattern (`03-07-PLAN.md:155,159`); import-time purity rule (`04-RESEARCH.md:318`) | partial-planned |
| `halo_agent/policy/request.py` | model (frozen dataclasses: `ToolRequest`, `PolicyDecision`, `PolicySnapshot`) | transform | verbatim dataclass block (`ARCHITECTURE.md:196-219`, restated `04-RESEARCH.md:331-356`); Fork G5 extension rule (`04-RESEARCH.md:357,498`) vs 03-07's 5-field shape (`03-07-PLAN.md:155`) | exact-planned |
| `halo_agent/policy/gate.py` | service (pure evaluator `evaluate`) | transform | fail-closed bounded sketch (`04-RESEARCH.md:360-373`); purity/boundedness properties (`ARCHITECTURE.md:221-232`) | exact-planned |
| `halo_agent/policy/rules/` (unknown-tool / unknown-capability / capability-context / timeout seed + `realpath` helper) | utility/service (rule family) | transform | rule-family taxonomy (`ARCHITECTURE.md:234-236`); capability vocabulary (`ARCHITECTURE.md:203-205`); one-helper rule (`04-RESEARCH.md:266`) | partial-planned |
| `halo_agent/policy/modes.py` | service (per-session approval-mode escalation policy) | request-response (reads immutable snapshot) | mode mapping table + floor (`04-RESEARCH.md:232-243`); `ask`⇒deny-unattended (`04-RESEARCH.md:500`) | partial-planned |
| `halo_agent/adapter/dispatch.py` (MODIFY — Phase 3 file) | middleware (batch admission) | request-response | its own 03-07 planned shape (`03-07-PLAN.md:31,38,49-50,55,155`) + Fork G1 `admit_batch` contract (`04-RESEARCH.md:485`) | exact-planned |
| `halo_agent/loop/agent_loop.py` (MODIFY — only under Fork G1) | service (orchestrator) | event-driven | key_links order chain (`03-07-PLAN.md:49-50`); G1 insertion sentence (`04-RESEARCH.md:485`); "do NOT inline-dispatch" lock (`04-RESEARCH.md:250`) | role-match-planned |
| `halo_agent/state/schema.sql` (MODIFY via migration) | config (DDL asset) | batch | existing `tool_invocations` verbatim (`03-RESEARCH.md:475-483`); new tables + guard trigger verbatim (`04-RESEARCH.md:376-408`) | exact-planned |
| `halo_agent/state/migrations.py` (MODIFY) | migration | batch | `migrate(conn)` shape (`03-01-PLAN.md:186`) + transaction discipline (`03-RESEARCH.md:819`) | exact-planned |
| `halo_agent/state/store.py` (MODIFY — writer methods for `policy_decisions` / `session_gate_state`) | service (single writer) | CRUD | writer-thread facade (`03-01-PLAN.md:188`); same-transaction decision+invocation rule (`04-RESEARCH.md:219`) | role-match-planned |
| `tools/loop_gate.py` (MODIFY — one-door rules) | utility (AST scanner) | batch scan | existing scan rules verbatim (`03-07-PLAN.md:37`) + Phase 4 extension rules verbatim (`04-RESEARCH.md:448`) | exact-planned |
| `tests/conftest.py` (MODIFY — gate fixtures) | test (fixtures) | n/a | fixture set (`03-01-PLAN.md:192`); Wave 0 gap text (`04-RESEARCH.md:551`) | exact-planned |
| `tests/tools/test_registry.py` | test (startup-error round-trip) | batch | GATE-01 command (`04-RESEARCH.md:536`); duplicate-startup-error rule (`ARCHITECTURE.md:186`); literal-token discipline (quoted `03-PATTERNS.md:383-385`) | partial-planned |
| `tests/tools/test_catalog_snapshot.py` | test (byte-pinned snapshot) | batch | catalog-snapshot requirement (`04-RESEARCH.md:537`, `:302`); byte-stability source rules (S3, `03-PATTERNS.md:417-419`) | partial-planned |
| `tests/policy/test_tracer_slice.py` | test (end-to-end integration) | request-response | own pytest sketch (`04-RESEARCH.md:431-444`); scripted tool-calling turn Case B (`03-07-PLAN.md:159`) | exact-planned |
| `tests/policy/test_deny_default.py` | test (integration) | request-response | GATE-02 row (`04-RESEARCH.md:538`); deny-default properties (`ARCHITECTURE.md:191,224`) | partial-planned |
| `tests/policy/test_decision_records.py` | test (unit + integration) | CRUD | GATE-03 row (`04-RESEARCH.md:539`); hash convention (`03-RESEARCH.md:454`, `04-RESEARCH.md:220`) | partial-planned |
| `tests/policy/test_capability_matrix.py` | test (unit matrix over catalog) | batch | GATE-06 row (`04-RESEARCH.md:540`); B16 matrix-test mandate (`ARCHITECTURE.md:265`) | partial-planned |
| `tests/policy/test_approval_modes.py` | test (integration) | CRUD, request-response | GATE-07 row (`04-RESEARCH.md:541`); persistence precedent (`04-RESEARCH.md:242`) | partial-planned |
| `tests/policy/test_gate_purity.py` + `test_gate_budget.py` | test (hostile-patch unit + perf) | batch | hostile-patch design (`04-RESEARCH.md:310`); budget constant (`04-RESEARCH.md:363,542`); hostile-module precedent (quoted `03-PATTERNS.md:398`) | partial-planned |
| `tests/policy/test_dispatch_guard.py` | test (DB-constraint) | CRUD | trigger body verbatim (`04-RESEARCH.md:403-407`); GATE-04-hook row (`04-RESEARCH.md:543`); literal-error-token discipline (quoted `03-PATTERNS.md:399`) | exact-planned |
| `tests/state/` migration-upgrade test + CHECK-list pin guard (name per planner; extends `test_schema.py` lane) | test (upgrade path + drift pin) | file-I/O | Wave 0 gaps (`04-RESEARCH.md:553-554`); idempotent second-run + literal-string acceptance (`03-01-PLAN.md:192,201-203`) | partial-planned |
| `packages/halo_agent/tests/loop/test_agent_loop.py` (MODIFY — explicitly, only under Fork G1) | test (seam regression) | request-response | G1 edit mandate (`04-RESEARCH.md:485`: "Edits `run_turn` + `test_agent_loop` Case B (explicitly, in the plan)"); Pitfall 1 warning sign (`04-RESEARCH.md:289`) | exact-planned |

**Fork-dependent placements the planner must settle before writing tasks** (all forks quoted in `04-RESEARCH.md:481-502`):

- **Fork G1** (`04-RESEARCH.md:483-487`, recommendation: G1) decides *where admission lives*: new `halo_agent/adapter/admission.py` exposing `admit_batch(turn_id, requests, snap) -> tuple[BatchAdmission, ...]` versus folding it into `adapter/dispatch.py`. The AI-SPEC tree already assigns "batch admission" to `adapter/` (`03-AI-SPEC.md:270`), so either placement is legal; the table above keeps `dispatch.py` as MODIFY and leaves a new `admission.py` as the planner's option. G1 additionally puts rows `agent_loop.py` and `test_agent_loop.py` on the edit list.
- **Fork G2(state)** (`04-RESEARCH.md:489-492`, recommendation: `failed`+`error_kind='policy_denied'`) decides whether the `tool_invocations` CHECK list (`03-RESEARCH.md:479`) is touched; option b adds a table rebuild to the migration and re-creates the guard trigger after it (`04-RESEARCH.md:409`).
- **Fork G3** (`04-RESEARCH.md:494`) decides the backend vocabulary: keep `PHASE3_BACKEND = "runtime"` (`03-07-PLAN.md:155`) as the first registry-owned backend name, or one rename task to ARCH's `halo` — "then update all sites; no shims".
- **Fork G4** (`04-RESEARCH.md:496`, recommendation: JSON) decides `contracts/tool-ownership.json` vs `.yaml`; the `.yaml` literal forces a `checkpoint:human-verify` before `uv add pyyaml` because the package carries `[SUS] unknown-downloads` (`04-RESEARCH.md:134-138`).
- **Fork G5** (`04-RESEARCH.md:498`) decides `policy/request.py`'s field list: extend Phase 3's 5-field frozen `ToolRequest` with trailing defaulted fields so one type flows loop→adapter→gate.

---

## Pattern Assignments

### `contracts/tool-ownership.json` (config, build/startup contract)

**Analog:** the ARCH ownership line + the research content sketch. No ownership file exists in any executed tree.

**Contract fields (verbatim, `ARCHITECTURE.md:773`):**

> "│   └── tool-ownership.yaml      # name → backend, capabilities, allowed agents, timeout, idempotency"

**Content sketch (`04-RESEARCH.md:411-429`, `[PLANNED]` — the JSON fork keeps "identical structure … validated by the same Pydantic models", `:429`):**

```yaml
tools:
  - name: echo_test                 # tracer-slice tool [PLANNED]
    backend: runtime                # Phase 3's existing backend (Fork G3)
    capabilities: []                # read-only; empty list is explicit, not absent
    allowed_agents: [main]          # sub/background denied until Phase 7 plumbing
    timeout_ms: 1000
    idempotent: true
  - name: gate_fixture_writer       # side-effect fixture tool (denial tests)
    backend: runtime
    capabilities: [fs.write]        # write-capable ⇒ fs.write REQUIRED (loader-enforced)
    allowed_agents: [main]
    timeout_ms: 1000
    idempotent: false
```

**Initial content rule (verbatim, `04-RESEARCH.md:552`):** "`contracts/tool-ownership.json|yaml` initial content: `echo_test` + `gate_fixture_writer` (+ any tool 03 shipped) — no model-facing catalog ships without an entry."

**Forward compatibility (verbatim, `04-RESEARCH.md:450`):** "manifest schema accepts `backend: omp|mcp|cli|plugin` entries with **zero code** until those backends register (forward-compatible loader + startup test that an entry naming an unregistered backend fails loudly at startup, not silently)."

**Do not:** add pyyaml without the Fork G4 `checkpoint:human-verify` (`04-RESEARCH.md:134-138`); ship a second ownership source (ARCH precedence is build-time, one file — `ARCHITECTURE.md:173-174`).

---

### `halo_agent/tools/ownership.py` (service loader, Pydantic v2)

**Analog:** the mandated boundary style — `03-AI-SPEC.md:354` (verbatim):

> "**every model-produced structure passes a Pydantic v2 boundary before touching loop state**; a bare `json.loads` whose output reaches the transcript or the adapter is a defect."

**Model shape to copy (`03-AI-SPEC.md:363-368`, `[PLANNED design excerpt]`):**

```python
class ToolCallIn(BaseModel):                 # one provider-issued tool call, post-parse
    model_config = {"extra": "forbid"}       # model-produced JSON: reject unknown fields
    id: str
    name: str
    args: dict = Field(default_factory=dict)
```

**Why `extra="forbid"` (verbatim, `04-RESEARCH.md:262`):** "Pydantic v2 models per entry schema (pattern: `ToolCallIn` `model_config = {"extra": "forbid"}` [VERIFIED: 03-07-PLAN.md:155]) … `extra=forbid` blocks arg smuggling".

**Loader rejection set (`04-RESEARCH.md:210` verbatim):** "Loader rejects: duplicate names, entries missing `capabilities`, unknown capability strings." Plus (verbatim, `ARCHITECTURE.md:186`): "Duplicate names are a **startup error**, not a runtime shadow." and (`ARCHITECTURE.md:191`): "Every entry declares **capabilities**, not just a name (see 2.3). Unknown capability ⇒ denied."

**Empty-is-not-pass-all (empty-allowlist mirror, verbatim from Phase 2's shipped gate philosophy, `02-08-PLAN.md:32`):** "an EMPTY `provenance/deny-gate-allowlist.json` … still scans everything and still fails on planted tokens — the allow-list being empty never turns the gate into a pass-all". Apply as: "allowlist parse failure is a startup error; an empty allowlist in `allowlist` mode denies everything non-read" (`04-RESEARCH.md:578`).

**No auto-discovery (verbatim, `04-RESEARCH.md:117`):** "auto-discovery would let a dropped file mint tools … Keep dynamic registration only behind `BatchDispatcher.register_backend` for HALO code, with the loader as the sole name authority".

---

### `halo_agent/tools/registry.py` (service, startup catalog)

**Analog:** ARCH §2.2 is a line-level contract for this module.

**Precedence rule (verbatim, `ARCHITECTURE.md:173-174`):** "There is exactly one runtime catalog. Precedence is resolved at build time from `contracts/tool-ownership.yaml`, not at request time:"

**Binding shape (verbatim, `ARCHITECTURE.md:148`):** "registry.resolve(name) → Binding{tool, backend, schema, capabilities, timeout, side_effects}"

**Shadowing rule (verbatim, `ARCHITECTURE.md:186-190`):**

> "Duplicate names are a **startup error**, not a runtime shadow. Hermes rejects cross-toolset shadowing unless `override=True` …; HALO removes the override path entirely."
> "If two implementations are genuinely both wanted, the loser is published under an explicit alias (`web_search_omp`), never silently."

**GATE-05 catalog half (verbatim, `04-RESEARCH.md:212`):** "catalog export = winners only, and every exported `schema["description"]` names the active backend — Hermes docs prove `schema["description"]` is what the model sees … so disambiguation text belongs in the schema, not registry metadata." (Pitfall 5, `04-RESEARCH.md:305-306`: "assert every exported description contains its backend token".)

**Seam it plugs into (`03-07-PLAN.md:155`, verbatim up to the seam signature):** "`PHASE3_BACKEND = "runtime"` (the single backend name every Phase 3 tool call uses until Phase 4 installs the registry), `BatchDispatcher.register_backend(n…`" — the full pair, per `04-RESEARCH.md:73`: "`BatchDispatcher.register_backend(name, backend)` / `dispatch_batch(turn_id, requests, cancel) -> tuple[ToolResultEnvelope, ...]`".

**Do not:** re-create `override=True` (`04-RESEARCH.md:251`); let a code-registered backend claim an owned name twice ("loader raises at startup on duplicate ownership rows AND on a code-registered backend claiming an owned name twice", `04-RESEARCH.md:302`).

---

### `halo_agent/tools/backends/` (service, in-process handlers: `echo_test`, `gate_fixture_writer`)

**Analog:** `partial-planned` — the registration mechanics exist in 03-07's planned seam; the handlers themselves are new.

**Registration pattern (`03-07-PLAN.md:159`, verbatim fragment):** "register one test backend on `PHASE3_BACKEND` that completes its second call before its …" — the tracer tests reuse this exact move: register `echo_test` and `gate_fixture_writer` on the `runtime` backend through `BatchDispatcher.register_backend`, never by importing a dispatch path directly.

**Import-time purity (verbatim, `04-RESEARCH.md:318`):** "Handlers must be pure until invoked — a loader lint/review rule in the plan; nothing in Phase 4's backends directory may touch disk at import (mirrors Hermes's import-time `registry.register()` discipline, but HALO owns both sides)."

**`gate_fixture_writer` purpose (verbatim, `04-RESEARCH.md:318`):** "GATE-07 acceptance test registers a real side-effecting test tool (creates `target.txt`); gate denies; test asserts `target.txt` absent." It must be a test-only backend (fixture-built, registered by tests), while `echo_test` ships as the single product-shipped tracer entry.

**No spawn (locked, `04-RESEARCH.md:40`):** "nothing in Phase 4 spawns a child process"; the backend abstraction must keep accepting an `omp` backend later with zero registry edits (`04-RESEARCH.md:450`).

---

### `halo_agent/policy/request.py` (model, frozen dataclasses)

**Analog:** the design contract is quoted verbatim — this is the closest `exact-planned` row in the phase.

**Gate shapes (verbatim from `ARCHITECTURE.md:196-219`, restated `04-RESEARCH.md:331-356`):**

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

**Reconciliation with the existing seam (`04-RESEARCH.md:357`, verbatim):** "Phase 3's dispatch-side `ToolRequest` (5-field frozen dataclass `(tool_call_uid, tool_call_id, tool_name, args, backend)` [VERIFIED: 03-07-PLAN.md:155]) is *not* this shape — extend one and make it the only request (Fork G5). Extending the dataclass with trailing defaulted fields (`session_id: str = ""` …) keeps 03-07's positional constructions compiling; renaming/moving `tool_call_uid` does not." Fork G5's field list (verbatim, `04-RESEARCH.md:498`): "(`session_id=""`, `turn_id=""`, `capabilities=frozenset()`, `cwd=""`, `phase=None`, `agent_kind="main"`) so one type flows loop→adapter→gate; `agent_kind="main"` is the only producer until Phase 7."

**PolicySnapshot (verbatim, `04-RESEARCH.md:310`):** "immutable per-turn snapshot input (verbatim property [VERIFIED: ARCHITECTURE.md:222-223]); build the snapshot once per batch (mode + allowlist + grants + workspace roots + `agent_kind` + `phase`)". The snapshot type lives here (`[PLANNED]` name `PolicySnapshot`, used at `04-RESEARCH.md:364`).

**`decision_id` mint:** `uuid.uuid7()` hex — same identity convention Phase 3 probed on the pinned interpreter family (`03-RESEARCH.md:1168`, `uuid7` in the live-probe line; `04-RESEARCH.md:104`).

---

### `halo_agent/policy/gate.py` (service, pure evaluator)

**Analog:** the research writes the evaluator shape verbatim.

**Bounded fail-closed evaluation (`04-RESEARCH.md:360-373`, `[PLANNED]` code shape, verbatim):**

```python
GATE_BUDGET_S = 0.005 * 10  # assert p99<=5ms in tests; 50ms hard kill-line (margin)
def evaluate(req: ToolRequest, snap: PolicySnapshot) -> PolicyDecision:
    start = time.perf_counter()
    try:
        d = _rules(req, snap)                      # pure, deterministic
        if time.perf_counter() - start > GATE_BUDGET_S:
            return deny(rule_ids=("gate.timeout",), reason="gate budget exceeded")
        return d
    except Exception as exc:                       # fail closed, never open
        return deny(rule_ids=("gate.error",), reason=f"gate error: {type(exc).__name__}")
```

**Properties to honor (verbatim, `ARCHITECTURE.md:222-232`, abridged):** "**Pure.** No network, no model, no plugin call. Inputs are the request plus an immutable per-turn snapshot … **Bounded.** p99 ≤ 5 ms; a timeout is a deny. **Capability-keyed.** … **Auditable.** Every decision row stores `decision_id`, rule ids, verdict, a SHA-256 of the canonicalized request, and redaction list. … **Plugin-neutral.** Plugin `pre_tool_call` hooks run **after** the gate and may only add a deny or inject context."

**Upstream fail-closed precedent (verbatim, `04-RESEARCH.md:216`):** "Timed-out or still-running `pre_tool_call` callbacks **fail closed** (block the tool) … The same applies to a callback that raises" — arbitration: "Hermes already fails closed on timeout/exception" (`FEATURES.md:151`).

**Decision-write ordering (verbatim, `04-RESEARCH.md:219`):** "every verdict — including denies — writes one `policy_decisions` row before the invocation row is updated; `tool_invocations.policy_decision_id` is set in the same transaction."

**Purity bans (verbatim):** "policy never parses tool output to decide" (`ARCHITECTURE.md:266`); decision rows "store *handles/hashes*, not raw args" (`04-RESEARCH.md:247`, citing ARCH B20 `:269`); "Gate scans and replaces with handles before persistence/frame logging" (`ARCHITECTURE.md:269`).

**No fabricated pass-throughs (verbatim, `04-RESEARCH.md:254`):** "Fabricated pass-through decisions to satisfy NOT NULL: forbidden; Phase 4's rule is a *real* decision per call" — and Phase 3's lock: "`policy_decision_id` stays `None` in Phase 3; no pass-through decision is ever fabricated" (quoted `04-RESEARCH.md:20`).

---

### `halo_agent/policy/rules/` (utility, safety-rule seed family)

**Analog:** `partial-planned` — taxonomy is specified; the shipped family is the seed only.

**Rule-family taxonomy (verbatim, `ARCHITECTURE.md:234-236`):** "1. **Safety:** destructive command patterns, workspace escape after `realpath`, secret reads, desktop/browser control (`ui.control`) requiring approval, `backend.raw` approval." — Phase 4 ships only the GATE-02 deny-defaults + capability-context rules; "the `phase` input slot exists; the RED/GREEN/REFACTOR rule family does not ship" (`04-RESEARCH.md:42`).

**Capability vocabulary (verbatim, `ARCHITECTURE.md:203-205`, via `04-RESEARCH.md:224-228`):**

```
fs.read, fs.write, fs.delete, proc.exec, net.egress,
ui.control, vcs.write, memory.read, memory.write, ui.ask,
secrets.read, agent.spawn, backend.raw
```

**Keying rule (verbatim, `04-RESEARCH.md:223`):** "policy keys on declared capability classes, never on tool names, so aliases can't launder: `write`, `patch`, `ast_edit` → `fs.write`; `bash` → `proc.exec`".

**One path-normalization helper (verbatim, `04-RESEARCH.md:266`):** "One `realpath`-then-compare helper in `policy/rules/` (ARCH: 'workspace escape after `realpath`' [VERIFIED: ARCHITECTURE.md:235]) … Windows `\\?\`/UNC/symlink edges need one owner"; Pitfall 10 (`04-RESEARCH.md:324-326`): drive-letter uppercase, separator canonicalization, `nt` semantics, and "the rule family in Phase 4 only needs `realpath` for path-shaped entries that exist (the echo tool has none — fixture a fake `fs.write` tool instead of deferring the whole rule family)."

**Do not build now (verbatim, `04-RESEARCH.md:265`):** dangerous-pattern classification "Defer with Phase 5/11 … Inventing a second pattern vocabulary now forks the vocabulary that Phase 5's `bash` tool must share"; no runtime import of Hermes `tools/approval.py` (`04-RESEARCH.md:464`).

**Deny floor (verbatim, `04-RESEARCH.md:241`):** "HALO's floor = GATE-02 deny-defaults (unknown tool/capability, timeout, capability-not-permitted) — never bypassable by mode."

---

### `halo_agent/policy/modes.py` (service, per-session approval modes)

**Analog:** `partial-planned` — the mapping table is research-specified; upstream behavior is the semantic source, no HALO code exists.

**Mode mapping (`04-RESEARCH.md:235-239`, verbatim table):**

| HALO mode `[PLANNED]` | Upstream analogue | Policy |
|---|---|---|
| `auto_approve` | `approvals.mode: smart` minus the LLM (no model in a pure gate) | allow unless a safety/capability rule denies; `ask`-class calls ⇒ deny 'unattended' in Phase 4 |
| `allowlist` | `manual` + `command_allowlist` floor | non-read capabilities require membership in the session's allowlist or a prior session grant; otherwise deny |
| `yolo` | `/yolo` toggle | approval escalation skipped; the **deny floor still applies** |

**Floor rule (verbatim, `04-RESEARCH.md:241`):** Hermes' hardline floor "trips **before** the approval layer even sees the command" — "mode only controls *escalation*, never the floor" (`04-RESEARCH.md:577`).

**`ask` before Phase 10 (verbatim, `04-RESEARCH.md:500`):** "deny with `rule_ids=('unattended',)` … the verdict value stays in the enum so UI-05 lands additively"; building any prompt mechanism now is forbidden ("a CLI prompt now re-creates the surface-ordering STATE.md forbids", `04-RESEARCH.md:267`).

**Persistence (verbatim, `04-RESEARCH.md:242`):** "`session_gate_state` row `[PLANNED]` in `state.db` (one store wins), per-session grants as JSON arrays; permanent allowlist is a settings concern deferred to Phase 10's settings page".

**Open product default:** `approval_mode` default `auto_approve` for fresh sessions is Assumption A5 — "needs user confirm" if product wants allowlist-by-default (`04-RESEARCH.md:474`).

---

### `halo_agent/adapter/dispatch.py` (MODIFY, middleware — the phase's anchor file)

**Analog:** its own Phase 3 planned shape. This is the file every Phase 4 task threads through.

**Existing planned seam (`03-07-PLAN.md:155`, verbatim fragment):** "`ToolCallIn` (Pydantic v2, `model_config = {"extra": "forbid"}`, fields `id: str`, `name: str`, `args: dict = {}`), `parse_tool_calls(raw) -> tuple[ToolCallIn, ...]` (raises `ToolCallsInvalid` on `ValidationError`/`json.JSONDecodeError`), `ToolRequest` (frozen dataclass: `tool_call_uid`, `tool_call_id`, `tool_name`, `args`, `backend`), `ToolResultEnvelope` v1 (`ok`, `text`, `content`, `artifacts`, `backend`, `invocation_id`, `policy_decision_id`, `duration_ms`, `truncated`, `error_kind`), `PHASE3_BACKEND = "runtime"` (the single backend name every Phase 3 tool call uses until Phase 4 installs the registry) …"

**The door invariant (verbatim, `03-07-PLAN.md:55`):** "`adapter.dispatch_batch` is the only boundary a tool call may leave through" — and the turn-start guard stays: (`03-07-PLAN.md:38`) "`adapter.dispatch.dispatch_batch` raises `SecondLoopDetected` when a tool-backend envelope carries a turn-starting verb".

**Ordering it must not break (`03-07-PLAN.md:31`, verbatim abridgment):** "every reserved row of the batch is then moved `reserved -> dispatched` via `turn.mark_dispatched` (which sets `dispatched_at`) immediately before `dispatcher.dispatch_batch` is called, and exactly one `messages` row per call is persisted in ORIGINAL CALL ORDER".

**Phase 4 change (Fork G1 recommendation, verbatim, `04-RESEARCH.md:485`):** "new `adapter.admit_batch(turn_id, requests, snap) -> tuple[BatchAdmission, ...]` between reserve and mark-dispatched; loop marks-dispatches allowed calls only. Denied rows: `reserved → failed(policy_denied)` + synthetic message row; dispatch-at-entry assertion holds for allowed calls; denied calls provably never dispatched."

**Sequence to implement (verbatim, `ARCHITECTURE.md:147-151`):**

> "├─ 2. Adapter.begin_batch(): resolve ALL calls before ANY dispatch
> │       registry.resolve(name) → Binding{tool, backend, schema, capabilities, timeout, side_effects}
> │       unknown tool / schema mismatch → synthetic error result for that call (batch continues)
> ├─ 3. PolicyGate.evaluate(ToolRequest) per call   [pure, ≤5 ms p99, fail closed]
> │       allow → proceed | deny → synthetic denied result | ask → UI approval (deny when unattended)"

**Envelope join:** `ToolResultEnvelope.policy_decision_id` already exists (field list above); Phase 4 fills it. "a dispatched tool row with no decision path is a defect, not a placeholder state" (`03-AI-SPEC.md:326`, quoted `04-RESEARCH.md:20`).

**Rewrite rule (verbatim, `04-RESEARCH.md:246`):** "on `allow` with `rewritten_args`, the backend receives rewritten args; the assistant's persisted `tool_calls` JSON keeps the model's original bytes … Recompute `request_sha256` over the post-gate request for the executed-call hash and keep the pre-gate hash in the same row (both, so a rewrite is provable)."

**Pitfall 1 boundary (verbatim, `04-RESEARCH.md:287-288`):** "`dispatched` is defined as 'side effect may already exist' … run resolve+gate **between** `reserve_tool_invocation` and `mark_dispatched` (Fork G1) … a denial recorded pre-execution must never produce `error_kind='side_effect_unknown'`."

---

### `halo_agent/loop/agent_loop.py` (MODIFY under G1, orchestrator)

**Analog:** the 03-07 key_links chain, verbatim (`03-07-PLAN.md:49`):

> "`AgentLoop.run_turn` -> `admissions.admit` -> `start_admission` (inserts the `turns` row) -> `ensure_system_row` -> `append_message` (user row) -> [`RequestBuilder.build` -> `ProviderTransport.send` -> `runtime.persist_assistant` -> `session_model_usage` -> (tool calls? -> `parse_tool_calls` -> `reserve_tool_invocation` x N -> `mark_dispatched` x N -> `dispatcher.dispatch_batch` -> `append_message` tool rows in call order -> loop again) -> `close_turn`]"

**Phase 4 insertion:** `reserve ×N → admit_batch (registry resolve ALL + gate) → mark_dispatched ×N (allowed only) → dispatch_batch` (`04-RESEARCH.md:485,149-173`). Every call in the batch gets "exactly one terminal invocation state + one message row before the next provider request" (`04-RESEARCH.md:298`).

**Locked anti-pattern (verbatim, `04-RESEARCH.md:250`):** "**Inline dispatch in loop code:** explicitly forbidden ('do NOT inline-dispatch tools in loop code' [VERIFIED: 03-AI-SPEC.md:326]); `loop_gate.py` scan flags it".

**Turn-context producers (responsibility map, `04-RESEARCH.md:91`):** loop supplies `agent_kind` + `phase` at admission time; "Phase 4 plumbs and denies what it cannot classify."

---

### `halo_agent/state/schema.sql` + `halo_agent/state/migrations.py` (MODIFY, DDL + migration)

**Analog:** exact for both halves.

**Existing table being extended (`03-RESEARCH.md:475-483`, verbatim):**

```sql
CREATE TABLE tool_invocations(
  invocation_id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL REFERENCES turns(turn_id) ON DELETE RESTRICT,
  tool_call_uid TEXT NOT NULL, tool_name TEXT NOT NULL, backend TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('reserved','dispatched','completed','failed','interrupted','unknown')),
  reserved_at REAL NOT NULL, dispatched_at REAL, finished_at REAL,
  policy_decision_id TEXT,                   -- Phase 4 fills; NULL is a declared gap until then
  error_kind TEXT
);
```

The closed CHECK (`:479`) has **no `denied` state** (Pitfall 2, `04-RESEARCH.md:291-294`); Fork G2(state) option a — `failed` + `error_kind='policy_denied'` — keeps this untouched; make `error_kind` a closed vocabulary **in the writer** because the column has no CHECK (`04-RESEARCH.md:293`).

**Phase 4 addition (`04-RESEARCH.md:376-408`, `[PLANNED]` names, verbatim):**

```sql
-- [PLANNED] names; additive migration through 03-01's migrate(conn) runner.
CREATE TABLE policy_decisions(
  decision_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL, turn_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK(verdict IN ('allow','deny','ask')),
  reason TEXT NOT NULL,
  rule_ids TEXT NOT NULL,                 -- JSON array
  request_sha256 TEXT NOT NULL,           -- pre-gate canonical request hash
  rewritten_args TEXT,                    -- JSON; NULL unless rewrite
  rewritten_sha256 TEXT,                  -- post-gate hash when rewritten
  redactions TEXT NOT NULL DEFAULT '[]',
  agent_kind TEXT NOT NULL,
  capabilities TEXT NOT NULL,             -- JSON array declared by the entry
  gate_duration_ms REAL NOT NULL,
  decided_at REAL NOT NULL
);
CREATE TABLE session_gate_state(
  session_id TEXT PRIMARY KEY,
  approval_mode TEXT NOT NULL CHECK(approval_mode IN ('auto_approve','allowlist','yolo')),
  allowlist TEXT NOT NULL DEFAULT '[]',   -- JSON array: tool names / capabilities
  session_grants TEXT NOT NULL DEFAULT '[]',  -- per-session approved patterns (Hermes [s]ession)
  updated_at REAL NOT NULL
);
-- Defense in depth: a dispatch without a real decision becomes impossible, not
-- merely unplanned-for. Named-token RAISE matches 03-RESEARCH trigger idiom.
CREATE TRIGGER tool_invocations_dispatch_guard BEFORE UPDATE OF state ON tool_invocations
BEGIN
  SELECT CASE WHEN NEW.state='dispatched' AND COALESCE(NEW.policy_decision_id, '')=''
    THEN RAISE(ABORT, 'ungoverned_dispatch') END;
END;
```

Rebuild caveat (verbatim, `04-RESEARCH.md:409`): "the guard trigger must be re-created after any rebuild, and `messages` FTS triggers do not touch `tool_invocations`, so the rebuild stays local" (census verified at `03-RESEARCH.md:1169`). Existing-rows caveat (verbatim, `04-RESEARCH.md:278`): "Rows already written by Phase 3 fixtures carry `policy_decision_id=NULL` — leave them; the guard trigger only constrains *new* dispatches."

**Migration discipline (verbatim, `03-RESEARCH.md:819`):** "open with `isolation_level=None` and drive `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` explicitly; run migrations as one explicit transaction over plain `execute()` calls; never use `executescript()` inside a transaction". Runner behavior (verbatim, `03-01-PLAN.md:186`): "writes `halo_schema_version`, and prints `schema: unchanged` with no writes when the recorded version already matches. A mismatched older version raises `SchemaVersionMismatch` naming both versions." Phase 4 bumps the version through this same `migrate(conn)` (`04-RESEARCH.md:278,377`).

**Validation:** the upgrade-path test runs against an *existing Phase-3-schema db*, "not just create-from-scratch" (`04-RESEARCH.md:553`), plus a `test_interpreter`-style pin that the shipped CHECK list still matches the denial modeling (`04-RESEARCH.md:554`). Literal-string acceptance style copies `03-01-PLAN.md:201-203`.

---

### `halo_agent/state/store.py` (MODIFY, single writer)

**Analog:** the 03-01 writer facade, verbatim (`03-01-PLAN.md:188`, abridged):

> "The writer is one `threading.Thread` named `halo-state-writer` consuming `queue.SimpleQueue`; the connection is created inside that thread; pragmas are set in this order: `journal_mode=WAL` … `synchronous=FULL`, `foreign_keys=ON`, `busy_timeout=5000` … read path opens `file:<path>?mode=ro` with `PRAGMA query_only=ON`."

**Phase 4 additions:** writer methods that (a) insert one `policy_decisions` row and (b) set `tool_invocations.policy_decision_id` **in the same transaction** (`04-RESEARCH.md:219`), and a `session_gate_state` read for the once-per-batch snapshot (`04-RESEARCH.md:162`, mode row per GATE-07 "applied per session").

**Writer boundary (verbatim, `04-RESEARCH.md:448`):** "no `INSERT INTO tool_invocations` outside the writer modules" — the same rule applies to `policy_decisions` (one writer for decisions: the gate, via the store's writer; "loop_events may mirror events only after the table row exists", `04-RESEARCH.md:322`).

**Redaction reuse (verbatim, `04-RESEARCH.md:281`):** "Reuse Phase 3 plan-06 redaction at `append_message`; decision rows store hashes/handles only" (`AGENTS.md:20` security rule, verified this session).

---

### `tools/loop_gate.py` (MODIFY, AST scanner — the one-door guard)

**Analog:** the shipped scan rules (verbatim, `03-07-PLAN.md:37`):

> "`tools/loop_gate.py` scans `packages/halo_agent/halo_agent/**/*.py`: `import agent.`/`from agent`/`hermes_state`/`model_tools` appear only in `loop/_vendor.py`, and `AIAgent(`/`run_conversation(`/`.chat(` appear only in `loop/_vendor.py` and `loop/agent_loop.py`; a hostile module copied into a temp tree is flagged with its path and the offending line number."

**Phase 4 extension (verbatim, `04-RESEARCH.md:448`):** "`tools/loop_gate.py` (03-07's AST scanner) extended with rules: no implementation of the backend protocol / no `register_backend` call outside `halo_agent/tools/`, `halo_agent/adapter/`, `halo_agent/policy/` (tests allowlisted); no `INSERT INTO tool_invocations` outside the writer modules."

**Keep green:** 03-07's `InterceptorStillInstalled` guard and its scans stay in force ("03-07's `InterceptorStillInstalled` guard stays green", `04-RESEARCH.md:322`, citing `03-07-PLAN.md:34,150`); Phase 4 needs **no vendored edit** (`04-RESEARCH.md:68`).

**Test pattern:** hostile-module proof, mirroring the 03 pattern (quoted `03-PATTERNS.md:398`): "a hostile module that calls `AIAgent.chat()` and must be refused" — Phase 4's version drops a module that imports a backend protocol implementation or registers a tool outside the allowlist and asserts it is flagged with path + line (`04-RESEARCH.md:543`).

---

### Tests (`tests/policy/`, `tests/tools/`, `tests/conftest.py`, modified `tests/loop/test_agent_loop.py`)

**Harness (verbatim, `04-RESEARCH.md:527-530`):** pytest 9.1.1 + pytest-asyncio 1.4.0 `asyncio_mode="auto"` in `packages/halo_agent/pyproject.toml` (`03-RESEARCH.md:1101`); quick run: `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/policy packages/halo_agent/tests/tools`; full suite: `uv run --project packages/halo_agent pytest -q packages/halo_agent` — "state+loop+mirror must stay green — Phase 3 contract".

**Requirement → command map:** copy the eight rows at `04-RESEARCH.md:536-543` verbatim into the plans (GATE-01 `test_registry.py`, GATE-05 `test_catalog_snapshot.py`, GATE-02 `test_deny_default.py`, GATE-03 `test_decision_records.py`, GATE-06 `test_capability_matrix.py`, GATE-07 `test_approval_modes.py`, purity+budget `test_gate_purity.py`/`test_gate_budget.py`, GATE-04 hook `test_dispatch_guard.py`) — all marked "❌ Wave 0" (create them).

**Tracer-slice test (the canonical shape, `04-RESEARCH.md:432-444`, `[PLANNED]`, verbatim):**

```python
# tests/policy/test_tracer_slice.py [PLANNED]
async def test_denied_unknown_tool_leaves_no_side_effect(store, loop, tmp_path):
    # register echo_test + gate_fixture_writer; run a scripted turn whose reply calls
    # (a) echo_test  -> allow, envelope carries policy_decision_id
    # (b) not_a_tool -> deny (unknown tool), (c) gate_fixture_writer with mode
    #     allowlist+empty -> deny. Assert: one messages row per call in call order;
    #     (a) row references a policy_decisions row whose request_sha256 matches a
    #     recomputed canonical hash of the pre-gate request; (b)/(c) invocations
    #     terminal WITHOUT dispatched_at set to a real dispatch…;
    #     and (the GATE-07 half) tmp_path / "target.txt" does not exist.
    ...
```

Its scripted-turn fixture reuses "03-07's `MockProviderServer`" (`04-RESEARCH.md:551`; server requirements quoted `03-PATTERNS.md:346`).

**Assertion discipline (verbatim, `01-08-PLAN.md:131,144` as quoted in `03-PATTERNS.md:383-385`):** "assert the literal finding token and the path text — never merely a non-zero exit" / "No case asserts only a non-zero exit code." Apply literally: `ungoverned_dispatch` RAISE token in `test_dispatch_guard.py` (mirrors the Phase 3 trigger-token pattern quoted `03-PATTERNS.md:399`); `CHECK constraint failed` as the drift witness for the denial-modeling pin (`04-RESEARCH.md:294`).

**Isolation:** fresh temp `state.db` + temp home per case (Phase 3 conftest already provides it — verbatim fixtures list at `03-01-PLAN.md:192`: "`tmp_home`, `tmp_store` (fresh temp home per test, never `%LOCALAPPDATA%\HALO`), an injectable `clock`, and a `run_child(argv)` helper"); Phase 4's conftest MODIFICATION adds the scripted tool-calling stream + the two backends' fixtures (`04-RESEARCH.md:551`) — do not recreate what 03-01 built.

**Per-suite specifics:**
- `test_registry.py` — duplicate-name ownership rows and a code-registered backend claiming an owned name must both raise at startup (`04-RESEARCH.md:302`); startup error, not runtime shadow (`ARCHITECTURE.md:186`).
- `test_catalog_snapshot.py` — pin exported names byte-for-byte (`04-RESEARCH.md:302`); assert every exported `schema["description"]` contains its backend token (`04-RESEARCH.md:306`); shadowed names absent (GATE-05 row `:537`).
- `test_deny_default.py` — unknown tool / unknown capability / gate timeout → deny, "invocation terminal, no backend call, synthetic message row" (`04-RESEARCH.md:538`).
- `test_decision_records.py` — allow/deny/rewrite × decision rows, `request_sha256` recomputes, both pre/post hashes recorded for rewrites (`04-RESEARCH.md:539,246`).
- `test_capability_matrix.py` — "matrix test over every catalog entry asserting the declared class matches a semantic probe (write-capable tools declare `fs.write`)" (`04-RESEARCH.md:314`; mandate `ARCHITECTURE.md:265`).
- `test_approval_modes.py` — two sessions differ; survives close/reopen (`04-RESEARCH.md:541`; restart-survival precedent `:242`); "yolo cannot bypass deny floor" (`:541,241`); denied write leaves `target.txt` absent (`:318`).
- `test_gate_purity.py` — "a `monkeypatch-during-evaluate` hostile test proves no reads escape" (`04-RESEARCH.md:310`).
- `test_gate_budget.py` — "p99 ≤ 5 ms over 1 000 synthetic requests" (`04-RESEARCH.md:542`; budget constant `:363`).
- `tests/state/` migration rows — upgrade path on an existing Phase-3-schema db + second-run `schema: unchanged` (`04-RESEARCH.md:553`; style `03-01-PLAN.md:192`).
- `tests/loop/test_agent_loop.py` (MODIFY, G1 only) — the dispatch-at-entry assertion "is allowed to change shape only per the chosen fork, never silently" (`04-RESEARCH.md:289`); the edit is mandated to be explicit in the plan (`04-RESEARCH.md:485`).

**Regression invariants:** per-task-commit also runs `tests/loop` green (`04-RESEARCH.md:546`); phase gate keeps `just eval` unchanged-and-green except intentional G1 edits (`04-RESEARCH.md:531,548`).

---

## Shared Patterns

### P1 — Batch-first admission, never per-call gating
**Source:** `ARCHITECTURE.md:147-151,166-169` (verbatim rationale: "Batch-first evaluation prevents a denied call from racing an allowed sibling and prevents 'half the batch ran' transcript states"); `03-AI-SPEC.md:323`; `04-RESEARCH.md:204-207`.
**Apply to:** `adapter/dispatch.py` / admission module, `agent_loop.py`, `registry.py` (resolve ALL before the first gate call), every integration test's ordering asserts. Gating inside per-call dispatch is "exactly the upstream design HALO replaced" (`04-RESEARCH.md:256`).

### P2 — Deny-by-default, fail-closed on every failure
**Source:** `ARCHITECTURE.md:191,224`; `04-RESEARCH.md:214-216` + gate sketch `:360-373`; `FEATURES.md:151`; `04-RESEARCH.md:53` (GATE-02: deny-on-timeout/exception).
**Apply to:** `gate.py`, `rules/`, `modes.py`, the `ungoverned_dispatch` trigger. Exception, deadline overrun, unmatched rule, unregistered backend name, stale capability ⇒ deny, with a typed `rule_ids` token (`gate.error`, `gate.timeout`, `unattended`).

### P3 — Deny floor below every mode; mode controls escalation only
**Source:** Hermes hardline-blocklist precedent + HALO floor definition (`04-RESEARCH.md:241`); threat row "YOLO escalation past a safety rule" (`04-RESEARCH.md:577`).
**Apply to:** `modes.py`, `test_approval_modes.py`, `session_gate_state` CHECK (`04-RESEARCH.md:396`).

### P4 — One canonicalization, one hash convention
**Source:** `request_manifests.request_sha256 TEXT NOT NULL` (`03-RESEARCH.md:454`, verified); "reuse the name and the canonicalization (`json.dumps(canonical, sort_keys=True).encode('utf-8')`, same as `sent_sha256`)" (`04-RESEARCH.md:220`); Don't-Hand-Roll: "`json.dumps(..., sort_keys=True)` + `hashlib.sha256` … two conventions guarantee divergence" (`04-RESEARCH.md:263`).
**Apply to:** `policy/request.py` (hash helper), `gate.py`, `policy_decisions.request_sha256`/`rewritten_sha256`, `test_decision_records.py` (recompute in the test).

### P5 — One door, one decision writer
**Source:** `03-07-PLAN.md:55` (only boundary); `04-RESEARCH.md:320-322` (Pitfall 9: one writer for decisions; `loop_events` mirrors only after the row exists); anti-pattern list `:249-256`.
**Apply to:** `loop_gate.py` extension rules, `store.py` writer boundary, registry `register_backend` authority, `tools/backends/` placement. The GATE-04 matrix in Phase 12 keys off exactly these two invariants (`04-RESEARCH.md:448-449`).

### P6 — Named SQLite tokens and literal-token assertions
**Source:** trigger idiom + `RAISE(ABORT, 'ungoverned_dispatch')` (`04-RESEARCH.md:403-407`); literal-token discipline (quoted `03-PATTERNS.md:382-385,399`); Phase 3 acceptance style (`03-01-PLAN.md:201`).
**Apply to:** migration DDL, `test_dispatch_guard.py`, the CHECK-drift pin test (`04-RESEARCH.md:554`), `fails_when` clauses: name the literal token (`ungoverned_dispatch`, `CHECK constraint failed`).

### P7 — Pydantic v2 `extra="forbid"` at every model/contract boundary
**Source:** `03-AI-SPEC.md:354,363-368`; `04-RESEARCH.md:262` ("blocks arg smuggling"); V5 row (`04-RESEARCH.md:566`).
**Apply to:** `tools/ownership.py` entry models, per-entry tool schemas, gate inputs; capability strings validated against the declared set at startup; "no string-built SQL (static statements, bound params — Phase 3 rule)" (`04-RESEARCH.md:566`).

### P8 — Verify landed code before trusting planned shapes
**Source:** `04-RESEARCH.md:609` ("must be re-validated against the landed Phase 3 code … as the first task of Wave 1"); `04-RESEARCH.md:7` (Wave-0 vendored-symbol verification); A9/A10 (`:478-479`).
**Apply to:** every plan's `read_first` — `adapter/dispatch.py`, `state/schema.sql`, `loop/agent_loop.py` as they *landed*, before citing a line number from 03 planning as if it were source.

### P9 — Windows + pins + [SUS] checkpoints (inherits 03-PATTERNS S7/S8/S10)
**Source:** `AGENTS.md:15` (Windows-first, verified this session), `AGENTS.md:34-37` (Python 3.14.9, uv 0.13.5, just 1.59.0), `AGENTS.md:250` (never text-edit lockfiles); `D-PYTHON:` escape hatch (`03-01-PLAN.md:204`, `04-RESEARCH.md:502,510`); pyyaml `[SUS] unknown-downloads` → `checkpoint:human-verify` or JSON fork (`04-RESEARCH.md:134-138,496`).
**Apply to:** every test command (`windows-latest` runnable), the interpreter-pin test, Wave-0 installs (the recommended fork installs **nothing**, `04-RESEARCH.md:122-126`).

### P10 — Empty ≠ pass-all; parse failure = startup error
**Source:** `02-08-PLAN.md:32` (verified verbatim above); `04-RESEARCH.md:578`.
**Apply to:** `ownership.py` (malformed entry, unknown capability, empty-capability-by-omission), `modes.py` allowlist parse, `test_deny_default.py` fixture (c) case.

### P11 — Executable assertions over prose (inherits 03-PATTERNS S5)
**Source:** quoted `03-PATTERNS.md:425-427` ("isolation is a failing test if violated, not a convention in a document").
**Apply to:** purity, budget, one-door scan rules, capability matrix, decision-join trigger — every "property" in this phase ends in a named test in `04-RESEARCH.md:536-543`.

### P12 — No second vocabulary
**Source:** `FEATURES.md:125` ("No aliases, no 'legacy' tool names"), `FEATURES.md:122-123` (one store wins; "Backends receive already-approved calls"); `04-RESEARCH.md:255` (backend-vocabulary anti-pattern).
**Apply to:** Fork G3 (settle `runtime` vs `halo` once, update all sites, no shims), mode spellings locked to the CHECK (`04-RESEARCH.md:243`), one `ToolRequest` type (Fork G5), `policy_decisions` as the only decision truth.

---

## No Analog Found

**No row lacks a precedent.** The 11 `partial-planned` rows lean on these substitute specs (planner should cite these, not invent):

| File | Role | Data Flow | Weakest link / substitute |
|------|------|-----------|---------------------------|
| `tools/backends/` | service | request-response | First in-process tool handlers in the repo. Substitute: registration moves from `03-07-PLAN.md:159` + import-purity rule `04-RESEARCH.md:318`. |
| `policy/modes.py` | service | request-response | No HALO approval-precedent exists; semantics come from upstream mappings only (`04-RESEARCH.md:232-243`, `[CITED: security]` therein). Keep the mode↔upstream table in the module docstring. |
| `tests/tools/test_catalog_snapshot.py` | test | batch | No snapshot-test file exists. Substitute: byte-pin rules (S3, quoted `03-PATTERNS.md:417-419`) + `04-RESEARCH.md:302,306,537`. |
| `tests/policy/test_gate_budget.py` | test | perf | First perf-budget assertion in the repo. Substitute: budget constant + p99 claim (`04-RESEARCH.md:363,542`); keep it a budget-fail test, not a benchmark report. |
| `tests/policy/test_gate_purity.py` | test | batch | Hostile *monkeypatch* variant is new; the hostile-module shape transfers from `03-RESEARCH.md:738-750` (quoted `03-PATTERNS.md:398`). |

---

## Wave 0 Creation Order (planner hint, mirrors the MVP tracer order at `04-RESEARCH.md:77`)

0. **Precondition check + seam re-validation** (Phases 1-3 executed; read landed `adapter/dispatch.py`, `state/schema.sql`, `loop/agent_loop.py`; record Fork G1/G2-state/G3/G4/G5 decisions + `D-PYTHON:` if the interpreter differs — `04-RESEARCH.md:7,502,609`).
1. Migration (`policy_decisions`, `session_gate_state`, `tool_invocations_dispatch_guard`) + its upgrade-path test + CHECK-pin guard (`04-RESEARCH.md:553-554`).
2. `contracts/tool-ownership.json` + `tools/ownership.py` + `tools/registry.py` + `tests/tools/test_registry.py` (startup errors first — nothing dispatches before the loader exists).
3. `tests/policy/`, `tests/tools/` package scaffolds + conftest additions (scripted tool-calling stream on `MockProviderServer`) (`04-RESEARCH.md:550-552`).
4. **Tracer slice:** `policy/request.py` + `policy/gate.py` (deny-default floor only) + `tools/backends/echo_test.py` + admission insertion + `tests/policy/test_tracer_slice.py` incl. the denied-write case (`04-RESEARCH.md:77`).
5. Capabilities + turn-context denial + unknown-capability/unknown-tool + gate-timeout deny (`rules/`, `test_deny_default.py`, `test_capability_matrix.py`, `test_gate_purity.py`, `test_gate_budget.py`).
6. Approval modes (`modes.py`, `test_approval_modes.py` with restart survival + yolo-floor).
7. Argument rewriting with re-hash + description disambiguation (`test_decision_records.py`, `test_catalog_snapshot.py`) + `loop_gate.py` extension + `test_dispatch_guard.py`.

Each step keeps the quick-run lane (`04-RESEARCH.md:529`) and the Phase 3 `tests/loop` contract (`04-RESEARCH.md:546`) green before the next wave.

> **Note for the planner:** `04-VALIDATION.md` is still the unfilled template (all rows `{placeholder}`, status `draft`, `wave_0_complete: false`). Its Per-Task Verification Map and Wave 0 Requirements must be filled from the §Validation Architecture rows (`04-RESEARCH.md:533-554`) used above.

---

## Metadata

**Analog search scope:** repo root (`AGENTS.md`), `.planning/research/` (`ARCHITECTURE.md`, `FEATURES.md`), `.planning/phases/04-tool-registry-policy-gate/` (`04-RESEARCH.md`, `04-VALIDATION.md`), `.planning/phases/03-unified-loop-session-authority/` (`03-RESEARCH.md`, `03-AI-SPEC.md`, `03-01-PLAN.md`, `03-07-PLAN.md`, `03-PATTERNS.md`), `.planning/phases/02-rebrand-wire-contract-migration/` (`02-08-PLAN.md`; Phase 1/2 docs cited indirectly through `03-PATTERNS.md`'s verified quotes).
**Files scanned:** 26 tracked planning documents confirmed as git-tracked; 11 read verbatim at the cited ranges this session (AGENTS.md, ARCHITECTURE.md, FEATURES.md, 02-08-PLAN.md, 03-RESEARCH.md, 03-AI-SPEC.md, 03-01-PLAN.md, 03-07-PLAN.md, 03-PATTERNS.md, 04-RESEARCH.md, 04-VALIDATION.md). No source files exist to scan.
**Tracked-source gate:** every cited planning document prints from `git ls-files` (repo total 55 tracked files, all `.planning/**` + `AGENTS.md`); `packages/`, `vendor/`, `contracts/`, `runtime/`, `tools/`, `justfile` verified absent (`git ls-files` count 0); every cited artifact outside `.planning/` is labeled planned because it does not exist; no gitignored mirror path is cited.
**Pattern extraction date:** 2026-10-23
