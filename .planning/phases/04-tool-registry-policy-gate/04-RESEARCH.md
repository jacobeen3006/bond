# Phase 4: Tool Registry & Policy Gate — Research

**Researched:** 2026-10-23
**Domain:** Single tool registry (one name → one backend), pure decision-only policy gate (deny-by-default, allow/deny/rewrite), capability classes, per-session approval modes, auditable decision records
**Confidence:** MEDIUM-HIGH. The HALO-side contract (seam shapes, DDL, wiring) is HIGH — every anchor was read verbatim from committed Phase 1–3 planning artifacts this session. Upstream approval/registry/hook semantics are MEDIUM — fetched from official upstream docs today, but every upstream *identifier* must be re-read at the import SHA (the `vendor/` trees do not exist yet).

> **Hard dependency — state this in every plan.** The repo contains only `.planning/` and `AGENTS.md`; `git log` shows docs commits only (`d4b336f docs(03): refresh phase position in STATE` is HEAD), and `ls` returns `.git .planning AGENTS.md` with no `packages/`, `vendor/`, `contracts/`, or `justfile` [VERIFIED: `ls -la` + `git log --oneline` this session]. Phases 1–3 are *planned, unexecuted*. Phase 4 therefore: (a) puts every vendored-symbol verification in a Wave-0 task that runs against the imported tree; (b) never asserts a vendored symbol exists without a verify step at execute time; (c) carries an explicit `<precondition>` that Phases 1–3 have executed — the gate sits inside `packages/halo_agent/halo_agent/adapter/dispatch.py` as created by plan 03-07, and inside the `state.db` schema as created by plan 03-01.
>
> **Legend:** `[VERIFIED: path:lines]` = file opened and quoted verbatim this session · `[CITED: url]` = official upstream documentation fetched this session · `[PLANNED]` = HALO-owned name/table/column no upstream doc attests to · `[ASSUMED]` = training knowledge, needs confirmation.

<user_constraints>
## User Constraints (no CONTEXT.md — locked inputs from ROADMAP / PROJECT / STATE / AI-SPEC / ARCHITECTURE)

No CONTEXT.md exists for this phase; the user chose to plan without discuss-phase context. The locks below are quoted from committed artifacts and are **not open for re-litigation**:

### Locked Decisions

- **Core value:** "One non-bypassable tool path: every LLM tool decision reaches exactly one backend through a single adapter and a single policy gate, so no policy (TDD enforcement, safety, memory routing) can be skipped by choosing the other runtime." [VERIFIED: `.planning/PROJECT.md:9`]
- **Ordering rule:** "The policy gate exists before any coding-core tool ships." and "The `halo.tool.invoke` protocol exists before subagents." [VERIFIED: `.planning/ROADMAP.md:10-11`]; "Phase 4 gate strictly precedes the first coding-core tool (Phase 5), and Phase 5's invocation protocol strictly precedes subagents (Phase 7)." [VERIFIED: `.planning/STATE.md:64`]
- **Gate seam already exists:** "Phase 3's obligation is the **seam**, not the registry"; "a dispatched tool row with no decision path is a defect, not a placeholder state. Registry + `contracts/tool-ownership.yaml` loader + capability classes + the pure `PolicyGate` slot into that seam later [evidence ARCH §2.2-2.3]; do NOT inline-dispatch tools in loop code" [VERIFIED: `.planning/phases/03-unified-loop-session-authority/03-AI-SPEC.md:326`]; "`policy_decision_id` stays `None` in Phase 3; no pass-through decision is ever fabricated." [VERIFIED: `.planning/phases/03-unified-loop-session-authority/03-07-PLAN.md:155`]
- **Single dispatch boundary:** "`adapter.dispatch_batch` is the only boundary a tool call may leave through" [VERIFIED: `.planning/phases/03-unified-loop-session-authority/03-07-PLAN.md:55`]
- **Batch-first admission:** "resolve ALL calls in a response before ANY dispatch, so a denied/failed call can never leave a 'half the batch ran' transcript state" [VERIFIED: `03-AI-SPEC.md:323`]; sequence steps 2–3: "Adapter.begin_batch(): resolve ALL calls before ANY dispatch — registry.resolve(name) → Binding{tool, backend, schema, capabilities, timeout, side_effects} — unknown tool / schema mismatch → synthetic error result for that call (batch continues)" then "PolicyGate.evaluate(ToolRequest) per call [pure, ≤5 ms p99, fail closed] — allow → proceed | deny → synthetic denied result | ask → UI approval (deny when unattended)" [VERIFIED: `.planning/research/ARCHITECTURE.md:147-151`]
- **Registry precedence:** "Duplicate names are a **startup error**, not a runtime shadow. Hermes rejects cross-toolset shadowing unless `override=True`; HALO removes the override path entirely." and "Every entry declares **capabilities**, not just a name (see 2.3). Unknown capability ⇒ denied." [VERIFIED: `.planning/research/ARCHITECTURE.md:186-191`]
- **Gate properties:** "**Pure.** No network, no model, no plugin call. Inputs are the request plus an immutable per-turn snapshot of policy state (TDD phase, workspace roots, approval cache, settings). **Bounded.** p99 ≤ 5 ms; a timeout is a deny. **Capability-keyed.** `write`, `patch`, and `ast_edit` all surface `fs.write`; `bash` surfaces `proc.exec`… **Auditable.** Every decision row stores `decision_id`, rule ids, verdict, a SHA-256 of the canonicalized request, and redaction list. The transcript references `policy_decision_id` on every tool row. **Plugin-neutral.** Plugin `pre_tool_call` hooks run **after** the gate and may only add a deny or inject context. They can never convert deny → allow or skip evaluation." [VERIFIED: `.planning/research/ARCHITECTURE.md:221-232`]
- **Store principle:** "Data owner wins the store… A second store is never kept 'for compatibility'." and "Safety layer wins the gate. `pre_tool_call`, approvals, and policy live once, in Hermes' hook bus. Backends receive already-approved calls." and "One user-visible name per capability. No aliases, no 'legacy' tool names, no per-backend tool variants." [VERIFIED: `.planning/research/FEATURES.md:122-125`]
- **GATE-04 is Phase 12's, but Phase 4 owns the hook:** "A bypass matrix test covers every inventoried entry point (plugin handlers, MCP, host tools, subagents, cron/Kanban workers, eval re-entry, renderer) and fails if any produces a side effect without a policy decision (GATE-04)" [VERIFIED: `.planning/ROADMAP.md:298`] — see §GATE-04 Hookable Obligations.

### Claude's Discretion (recommended here; planner may override with reason)

- Gate placement fork inside the batch path (Fork G1 vs G2 in §Open Questions).
- Denied-invocation modeling: new `denied` state (schema rebuild) vs `failed` + `error_kind='policy_denied'` (pure additive) — Fork G2 in §Pitfalls/Open Questions.
- `contracts/tool-ownership` authoring format (JSON vs YAML) — Fork G4.
- DDL/table names for `policy_decisions`, `session_gate_state` (§Code Examples, `[PLANNED]`).
- MVP default approval mode for fresh sessions (Fork G7).
- Test layout `packages/halo_agent/tests/policy/` + `tests/tools/` (mirrors Phase 3's per-layer directories).

### Deferred Ideas (OUT OF SCOPE)

- GATE-04 bypass matrix itself (Phase 12) — this phase only leaves hookable invariants.
- Coding-core RPC backend, `halo.tool.invoke` core patch, supervisor, chunking (CORE-*, Phase 5). The registry's backend abstraction must accept an `omp` backend later; nothing in Phase 4 spawns a child process.
- Subagent child sessions and policy inheritance execution (SUB-*, Phase 7) — `agent_kind` plumbing only.
- TDD-phase gate rules with evidence rows (EXT-05, Phase 11) — the `phase` input slot exists; the RED/GREEN/REFACTOR rule family does not ship.
- Approval round-trip UI (UI-05, Phase 10); plugin host / MCP backends (Phase 11).
- Desktop/CLI surfaces; memory routing rule family (MEM-*, Phase 8+).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (verbatim, `.planning/REQUIREMENTS.md:40-46` [VERIFIED]) | Research Support |
|----|-------------|------------------|
| GATE-01 | "One registry resolves each tool name to exactly one backend" | §Pattern 2 (ownership manifest + startup-error rule), upstream precedent Hermes `_tools` singleton keyed by name [CITED: tools-runtime], OMP `set_host_tools` uniqueness rule [CITED: rpc.md] |
| GATE-02 | "Every tool call passes the policy gate before execution; deny is the default" | §Pattern 1 (batch-first admission), Fork G1/G2 placement, deny-on-timeout/exception (ARCH "a timeout is a deny" + Hermes fail-closed `pre_tool_call` [CITED: hooks]) |
| GATE-03 | "The gate can allow, deny, or rewrite arguments, and every decision is recorded with a reason" | `PolicyDecision` dataclass [VERIFIED: ARCHITECTURE.md:212-219], rewrite via shallow-merge precedent [CITED: hooks `{"action":"modify"}`], decision table with `request_sha256` + `policy_decision_id` join [VERIFIED: 03-RESEARCH.md:475-483] |
| GATE-05 | "Tool descriptions disambiguate the active backend, and shadowed duplicate tools are not visible to the model" | Catalog builder exposes winners only; Hermes docs: `schema["description"]` is the authoritative model-facing string [CITED: tools-runtime]; catalog-snapshot test (§Validation) |
| GATE-06 | "Every registry entry declares capability classes restricting which turn contexts may call it" | Capability list verbatim from ARCH §2.3 [VERIFIED], `agent_kind` + `phase` fields on ToolRequest, Hermes `cron_mode`/`single_query_mode`/`unattended_mode` deny-default context taxonomy [CITED: security] |
| GATE-07 | "Approval modes (auto-approve, allowlist, YOLO) are gate policies applied per session, not per tool implementation" | Hermes modes: `approvals.mode: smart | manual | off`, YOLO toggle per session that survives restart, hardline floor below YOLO, per-session pattern grants, permanent allowlist [CITED: security]; `session_gate_state` table `[PLANNED]` |
</phase_requirements>

## Project Constraints (from AGENTS.md)

Each quoted verbatim; every Phase 4 plan must comply.

- **Windows-first:** "**Platform**: Windows-first (win32 x64). Cross-platform code paths must not be consciously broken, but only Windows is tested and supported." [VERIFIED: `AGENTS.md:15`] — all verification commands runnable on `windows-latest`.
- **One process boundary, one overhead budget:** "**Single process boundary**: tool calls that cross into the coding core are RPC frames, not in-process calls. Per-call overhead budget: < 150ms adapter-added per tool round-trip." [VERIFIED: `AGENTS.md:18`] — the gate's own ≤5 ms p99 [VERIFIED: ARCHITECTURE.md:224] is the Phase 4 half of this budget; Phase 5 adds RPC on top.
- **Pins:** Python "**3.14.9**", uv "**0.13.5**", just "**1.59.0**", Bun "**1.4.4**" [VERIFIED: `AGENTS.md:32-37`] — workstation deltas in §Environment Availability.
- **Python project home:** no root uv workspace; `packages/halo_agent/` is the only HALO Python project; every command names `--project packages/halo_agent` [VERIFIED: `.planning/phases/01-import-provenance-ledger/01-SKELETON.md:23`].
- **Every vendored edit is a patch:** a Phase 4 patch into `vendor/hermes-agent/` must land in `patches/series` and keep `just verify` green [VERIFIED: `01-SKELETON.md:20,43-44`; 03-07 applied the same rule to its D-R3 patch]. Phase 4's design needs **no vendored edit** — the interception table deletion it depends on is already 03-07's obligation (`InterceptorStillInstalled` guard) [VERIFIED: 03-07-PLAN.md:150].
- **Security:** "model credentials… live in the secret store, never in `.env`/`config.json`, and must never be logged" [VERIFIED: `AGENTS.md:20`] — decision records store hashes + redaction lists, never raw args (ARCH B20: "Gate scans and replaces with handles before persistence/frame logging").

## Summary

Phase 4 turns Phase 3's single dispatch seam into the product's chokepoint. The seam already exists and is provably the only door: plan 03-07 created `BatchDispatcher.register_backend(name, backend)` / `dispatch_batch(turn_id, requests, cancel) -> tuple[ToolResultEnvelope, ...]` with `PHASE3_BACKEND = "runtime"` "(the single backend name every Phase 3 tool call uses until Phase 4 installs the registry)" [VERIFIED: 03-07-PLAN.md:155]. Phase 4 adds the three missing organs around that seam: a **registry** built at startup from a checked-in ownership contract (`contracts/tool-ownership.*`) where a duplicate name is a startup error and shadowed losers are absent from the model's schema; a **pure `PolicyGate`** (`evaluate(ToolRequest) -> PolicyDecision`, verdicts `allow|deny|ask`, rewrite via `rewritten_args`, p99 ≤ 5 ms, timeout/exception ⇒ deny); and an **audit store** — a new `policy_decisions` table `[PLANNED]` referenced by the existing `tool_invocations.policy_decision_id` column, whose DDL comment "Phase 4 fills; NULL is a declared gap until then" [VERIFIED: 03-RESEARCH.md:481] defines this phase's join exactly.

Two in-repo facts reshape a naive reading. First, the `tool_invocations.state` CHECK constraint is closed: `CHECK(state IN ('reserved','dispatched','completed','failed','interrupted','unknown'))` [VERIFIED: 03-RESEARCH.md:479] — there is **no `denied` state**, so a denial either rides `failed` + `error_kind='policy_denied'` (pure additive, zero schema rebuild) or forces a table rebuild via the migration runner (Fork G2). Second, Phase 3's order is `reserve_tool_invocation` ×N → `mark_dispatched` ×N ("the ONLY `reserved -> dispatched` producer") → `dispatch_batch` [VERIFIED: 03-07-PLAN.md:157], and its test asserts "when `dispatch_batch` is entered, both invocation rows are `dispatched` with a non-null `dispatched_at`" [VERIFIED: 03-07-PLAN.md:160]. Because `dispatched` is the state crash recovery treats as `side_effect_unknown`, `mark_dispatched` must stay the last gate before a backend runs; the admission+gate step must therefore sit *between* reserve and mark-dispatched (Fork G1, recommended) or the dispatcher must own the whole sequence (Fork G2 placement) — see §Open Questions.

**Primary recommendation (MVP tracer-first):** Build in this order — (1) **Wave 0:** migration + contract loader + `tests/policy`/`tests/tools` scaffolds; (2) **Wave 1 tracer:** one trivial in-process tool (`echo_test` on the existing `runtime` backend) end-to-end through registry.resolve → gate → dispatch → `policy_decisions` row → `tool_invocations.policy_decision_id` → tool-result message row, plus a denied-by-default case proving the file it would have written is absent on disk; (3) capabilities + turn-context denial + unknown-capability/unknown-tool deny + gate-timeout deny; (4) approval modes (`auto_approve` / `allowlist` / `yolo`) as per-session rows in `session_gate_state` with restart survival; (5) argument rewriting with re-hash + description disambiguation + catalog snapshot test; (6) ungoverned-dispatch DB trigger + loop_gate scan extension as the GATE-04 hook, then the criterion-to-test evidence walk. No plan spawns a process, touches the coding core, or adds a user-facing surface.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Name → backend resolution | Registry (`halo_agent/tools/`) at startup | `contracts/tool-ownership.*` (build-time input) | ARCH §2.2: precedence "resolved at build time from `contracts/tool-ownership.yaml`, not at request time" [VERIFIED: ARCHITECTURE.md:173-174] |
| Policy decision (allow/deny/rewrite/ask) | Pure gate (`halo_agent/policy/`) inside the agent process | immutable per-turn policy-state snapshot | "The gate stays in the agent process… none of which exist on the other side of a process boundary in comparable form" [VERIFIED: ARCHITECTURE.md:132-135] |
| Decision audit record | SQLite store (`policy_decisions` table) | `tool_invocations.policy_decision_id` forward reference | GATE-03 + the existing seam column [VERIFIED: 03-RESEARCH.md:481] |
| Per-session approval policy | SQLite store (`session_gate_state` table) | loop reads snapshot once per batch | GATE-07 "applied per session, not per tool implementation"; Hermes persists YOLO with the session [CITED: security] |
| Batch admission ordering (resolve-all-then-gate-then-dispatch) | Adapter (`halo_agent/adapter/`) | loop (`run_turn`) drives the sequence | Batch-first prevents "half the batch ran" [VERIFIED: 03-AI-SPEC.md:323] |
| Capability declaration | Ownership manifest per entry | registry loader validates at startup | GATE-06; "Unknown capability ⇒ denied" [VERIFIED: ARCHITECTURE.md:191] |
| Model-facing schema (descriptions, winners only) | Registry catalog builder (`get_definitions` equivalent) | loop's request builder | Loop sends what the registry exports; shadowed names never appear |
| Denial enforcement (nothing runs) | Adapter + dispatcher (denied calls never reach `register_backend`'s handler) | DB guard trigger (defense in depth) | GATE-02 "nothing executes"; trigger makes ungoverned dispatch impossible, not just unlikely |
| Turn-context inputs (`agent_kind`, `phase`) | Loop at batch admission time | ToolRequest fields | Producers for `sub`/`background` land Phase 7/9; Phase 4 plumbs and denies what it cannot classify |

## Standard Stack

### Core

| Library / component | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| CPython (uv-managed) | 3.14.9 pinned; **3.14.7 is what uv can fetch here** (same gap Phase 3 recorded) | Runtime for registry + gate | Pinned in AGENTS.md [VERIFIED: AGENTS.md:34]; Phase 4 needs no stdlib feature beyond 3.13 baseline (`hashlib`, `uuid.uuid7()`, `dataclasses`, `sqlite3`, `json`) |
| `pydantic` | 2.14.1 [VERIFIED: pypi.org/pypi/pydantic/json via 03-RESEARCH.md:108; re-check at execute] | `ToolCallIn`-style boundary validation for ownership entries + gate inputs | AI-SPEC mandates Pydantic v2 at every model-produced boundary [VERIFIED: 03-AI-SPEC.md:354]; already in `packages/halo_agent` deps — **zero new packages in the recommended fork** |
| `contracts/tool-ownership.{json|yaml}` | new repo contract file `[PLANNED]` | name → backend, capabilities, allowed agents, timeout, idempotency [VERIFIED: ARCHITECTURE.md:773] | Single ownership file is the build-time precedence mechanism (ARCH §2.2); Phase 2 established `contracts/rpc-wire.json` as the JSON-contract convention |
| `sqlite3` (stdlib) | CPython 3.14 stdlib | `policy_decisions`, `session_gate_state`, ungoverned-dispatch trigger | One store wins (FEATURES #2 [VERIFIED: FEATURES.md:122]); migration runner + named-raise triggers are Phase 3's established pattern [VERIFIED: 03-01-PLAN.md:186] |
| `hashlib` + `json` (stdlib) | 3.14 | Canonical request → SHA-256 decision hash | Mirrors Phase 3's existing `request_sha256 TEXT NOT NULL` in `request_manifests` [VERIFIED: 03-RESEARCH.md:454] — same canonicalization convention (`json.dumps(..., sort_keys=True)` + utf-8), no new hashing code |
| `uuid` (stdlib) | 3.14 | `uuid7()` for `decision_id` | Phase 3 verified `uuid.uuid7()` on the pinned interpreter family [VERIFIED: 03-RESEARCH.md:104, 1168] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pytest` 9.1.1 + `pytest-asyncio` 1.4.0 | as configured in `packages/halo_agent/pyproject.toml` [VERIFIED: 03-RESEARCH.md:1101] | Deterministic test lane `tests/policy/`, `tests/tools/` | Every task commit |
| `pyyaml` (only under the YAML fork) | 6.0.3 (PyPI, verified this session) | Read `contracts/tool-ownership.yaml` if the `.yaml` format is chosen literally | **Avoidable — see Package Legitimacy Audit; JSON fork removes it** |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Static ownership manifest | Dynamic runtime registration à la Hermes `discover_builtin_tools()` AST-scan of `tools/*.py` | Rejected for HALO ownership: ARCH §2.2 mandates build-time precedence [VERIFIED: ARCHITECTURE.md:173-174]; auto-discovery would let a dropped file mint tools (Hermes docs: "new tool files are picked up automatically — no manual list to maintain" [CITED: tools-runtime] — exactly the property that makes shadowing audit impossible). Keep dynamic registration only behind `BatchDispatcher.register_backend` for HALO code, with the loader as the sole name authority |
| Gate as post-dispatch observer | Gate inside each backend | Violates "Backends receive already-approved calls" [VERIFIED: FEATURES.md:124] and re-creates per-backend policies (GATE-07 forbids) |
| Thread-timeout around `evaluate()` | Deadline-check + exception-deny | A pure synchronous function only overshoots via a bug; wrapping in a thread costs the very 5 ms budget. Deny-on-exception + budget assertion test is the Hermes fail-closed pattern [CITED: hooks] |
| Decision rows in `loop_events` JSONL | Dedicated `policy_decisions` table | `loop_events` is observability (append-only JSON + row, 03-03 `emit_loop_event`); GATE-03's join + GATE-04's audit need a typed table with the FK-shaped column Phase 3 already reserved |

**Installation:** recommended fork installs **nothing**:
```bash
# recommended (JSON contract fork): no new dependency; uv lock unchanged except test dev-extras if any
uv sync --project packages/halo_agent
```

**Version verification:** `pydantic` 2.14.1 / `pytest` 9.1.1 / `pytest-asyncio` 1.4.0 were PyPI-verified in Phase 3's session (2026-10-23, same day) [VERIFIED: 03-RESEARCH.md:1172]; `pyyaml` 6.0.3 verified this session (`pypi.org/pypi/pyyaml/json` → `6.0.3`) [VERIFIED: probe this session]. No other new package exists in scope.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| pyyaml | PyPI | release 2025-09-25 (6.0.3); project ~20 yrs old (training knowledge) | seam: `unknown-downloads` (null) | https://pyyaml.org/ | [SUS] | Flagged — only needed if the `.yaml` contract format is chosen; planner adds `checkpoint:human-verify` before any `uv add` |
| pydantic / pytest / pytest-asyncio | PyPI | already locked by Phase 3 | n/a (existing deps) | n/a | pre-approved | No install in Phase 4 |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `pyyaml` — the seam's SUS signal is `unknown-downloads` (its downloader feed returned null), not a positive risk finding; it is nonetheless protocol-suspicious and must be human-gated before install [VERIFIED: `package-legitimacy check` output this session: `{"verdict": "SUS", "signals": {"exists": true, "weeklyDownloads": null, "repoUrl": "https://pyyaml.org/", "deprecated": false}, "reasons": ["unknown-downloads"]}`]. **The JSON contract fork eliminates the package entirely and is the recommended resolution** (Fork G4). The SUS tag rule applies to a name discovered outside authoritative sources — ARCHITECTURE.md names the file path, not the parser; registry existence alone earned nothing.

## Architecture Patterns

### System: one governed batch (data flow)

```
Provider reply with tool_calls[]
        │  (assistant row + tool_call_uids already persisted — Phase 3)
        ▼
┌─ loop/agent_loop.run_turn ──────────────────────────────────────────────┐
│  parse_tool_calls ──► reserve_tool_invocation ×N  (state='reserved',    │
│        backend=<registry-resolved>, call_ordinal=<index>)               │
└──────────────┬───────────────────────────────────────────────────────────┘
               ▼
┌─ adapter batch admission  [ARCH §2.1 step 2 — NEW in Phase 4] ──────────┐
│  registry.resolve(name) for ALL calls:                                  │
│    Binding{tool, backend, schema, capabilities, timeout, side_effects}  │
│    unknown tool / schema mismatch → synthetic error result              │
│                                    for that call (batch continues)      │
└──────────────┬───────────────────────────────────────────────────────────┘
               ▼
┌─ policy/PolicyGate.evaluate(ToolRequest) per call  [step 3 — NEW] ──────┐
│  pure, p99 ≤5 ms, timeout ⇒ deny      inputs: request + immutable       │
│  per-turn snapshot (session_gate_state, workspace roots, phase)         │
│    ├─ allow (+optional rewritten_args) ─► mark_dispatched ─► dispatch   │
│    ├─ deny  ─► invocation FAILED, error_kind='policy_denied',           │
│    │           synthetic tool-result message row, NOTHING EXECUTES      │
│    └─ ask   ─► Phase 4 MVP = deny w/ reason 'unattended'                │
│                (Phase 10 wires UI approval round-trip)                  │
│  each verdict writes one policy_decisions row (reason, rule_ids,        │
│  request_sha256, rewrite, redactions) ◄─ joined by                      │
│  tool_invocations.policy_decision_id  [reserved column since 03]        │
└──────────────┬───────────────────────────────────────────────────────────┘
               ▼ (allowed calls only)
        BatchDispatcher.dispatch_batch(turn_id, requests, cancel)
          ├─ in-process backend (Phase 4: `runtime`/echo test tools)
          ├─ coding core → RPC halo.tool.invoke      [Phase 5 slot]
          ├─ child CLI (gsd-tools)                   [Phase 11 slot]
          └─ MCP client                              [Phase 11 slot]
               ▼
  normalize → ToolResultEnvelope v1 → one messages row per call in ORIGINAL
  CALL ORDER (existing Phase 3 path) → next provider request
```

External dependency: none beyond `state.db`. The gate calls no network, no model, no plugin [VERIFIED: ARCHITECTURE.md:221-222].

### Recommended project structure (paths per AI-SPEC tree)

```
packages/halo_agent/halo_agent/
├── tools/                  # registry + tool-ownership loader (seam named at AI-SPEC:269)
│   ├── ownership.py        # parse+validate contracts/tool-ownership.* → entries [PLANNED]
│   ├── registry.py         # name→Binding resolve, dup=startup error, catalog export [PLANNED]
│   └── backends/           # in-process HALO handlers; echo test tool lives here [PLANNED]
├── policy/                 # "PolicyGate — Phase 4 lands it; seam kept now" (AI-SPEC:271)
│   ├── request.py          # gate request/decision dataclasses (ARCH §2.3 shapes) [PLANNED]
│   ├── gate.py             # evaluate(): purity + boundedness + deny-default [PLANNED]
│   ├── rules/              # safety-rule family seed (unknown-tool/capability/timeout) [PLANNED]
│   └── modes.py            # per-session approval modes (auto_approve|allowlist|yolo) [PLANNED]
├── adapter/dispatch.py     # Phase 3 file — admission/gate step inserted here
└── state/schema.sql        # + policy_decisions, session_gate_state, guard trigger (migration)
contracts/tool-ownership.*  # ownership manifest (repo root contracts/ — AI-SPEC:277)
tests/policy/  tests/tools/ # new pytest dirs beside 03's state/loop/mirror
```

### Pattern 1: Batch-first admission, per-call verdicts
**What:** resolve every call in a batch against the registry *before* any gate call, gate each, dispatch only allowed calls; denied calls get a synthetic tool-result message row so the batch stays continuable (never "half the batch ran").
**When to use:** always — this is the phase's core sequence.
**Source:** ARCH §2.1 steps 2–4 [VERIFIED: ARCHITECTURE.md:147-152]; "Steps 2 and 3 are a deliberate change from Hermes, which evaluates `pre_tool_call` per call inside the dispatch path… Batch-first evaluation prevents a denied call from racing an allowed sibling" [VERIFIED: ARCHITECTURE.md:166-169].

### Pattern 2: Ownership manifest, startup-error precedence
**What:** one `contracts/tool-ownership` file maps every model-visible name to exactly one backend + capabilities + allowed agents + timeout + idempotency [VERIFIED: ARCHITECTURE.md:773]. Loader rejects: duplicate names, entries missing `capabilities`, unknown capability strings.
**Upstream precedents that validate the rule:** Hermes registry keys `_tools` by name and "A registration that would shadow an existing tool from a **different** toolset is rejected (with an error log) unless `override=True`" [CITED: tools-runtime] — HALO removes `override` [VERIFIED: ARCHITECTURE.md:186-188]. OMP RPC: host tool "Names must be unique and cannot conflict with an existing non-host tool" [CITED: rpc.md].
**GATE-05 half:** catalog export = winners only, and every exported `schema["description"]` names the active backend — Hermes docs prove `schema["description"]` is what the model sees ("`description=` alone does not describe the tool to the model") [CITED: tools-runtime], so disambiguation text belongs in the schema, not registry metadata.

### Pattern 3: Pure bounded gate, deny on every failure
**What:** `evaluate(ToolRequest) -> PolicyDecision` reads only the request + immutable per-turn snapshot; wraps rules in try/except + a monotonic deadline; exception, deadline overrun, or unmatched rule ⇒ `deny`.
**Upstream precedent (strongest available):** Hermes `pre_tool_call` "If a Python plugin callback on a timeout-bounded hook… **blocks** longer than `plugins.hook_callback_timeout`… it is abandoned… Timed-out or still-running `pre_tool_call` callbacks **fail closed** (block the tool); other bounded hooks fail open" and "The same applies to a callback that raises: the block message names the callback and the error" [CITED: hooks]. FEATURES arbitration: "Hermes already fails closed on timeout/exception" [VERIFIED: FEATURES.md:151].

### Pattern 4: Decision record with request hash (GATE-03)
**What:** every verdict — including denies — writes one `policy_decisions` row before the invocation row is updated; `tool_invocations.policy_decision_id` is set in the same transaction. The row stores rule ids, verdict, reason, `request_sha256` (SHA-256 of the canonicalized request [VERIFIED: ARCHITECTURE.md:228-230]), rewrite payload, redaction list.
**Naming precedent:** Phase 3's `request_manifests.request_sha256 TEXT NOT NULL` [VERIFIED: 03-RESEARCH.md:454] — reuse the name and the canonicalization (`json.dumps(canonical, sort_keys=True).encode("utf-8")`, same as `sent_sha256`).

### Pattern 5: Capability-keyed rules (GATE-06)
**What:** policy keys on declared capability classes, never on tool names, so aliases can't launder: `write`, `patch`, `ast_edit` → `fs.write`; `bash` → `proc.exec` [VERIFIED: ARCHITECTURE.md:225-226]. Full declared set (verbatim):
```
fs.read, fs.write, fs.delete, proc.exec, net.egress,
ui.control, vcs.write, memory.read, memory.write, ui.ask,
secrets.read, agent.spawn, backend.raw
```
[VERIFIED: ARCHITECTURE.md:203-205]. "Unknown capability ⇒ denied" [VERIFIED: ARCHITECTURE.md:191]; loader rejects unknown strings at startup so "unknown capability denied" is also reachable at runtime if a stale snapshot races a reload (GATE-02 criterion 2 names it).
**Turn contexts:** `ToolRequest.agent_kind: Literal["main", "sub", "background"]` + `phase: str | None` (GSD) [VERIFIED: ARCHITECTURE.md:208-209] intersected with the entry's `allowed agents` [VERIFIED: ARCHITECTURE.md:773]. Upstream context-taxonomy precedent for unattended denial: `cron_mode: deny`, `single_query_mode: deny`, `unattended_mode: deny` — "deny blocks the command (the agent must find another path)" and for unattended surfaces "deny blocks the command instantly" [CITED: security].

### Pattern 6: Approval modes as per-session gate policy (GATE-07)
**What:** the session's mode selects the escalation policy applied *after* safety rules; tool implementations never see the mode. Recommended mapping from the upstream vocabulary:

| HALO mode `[PLANNED]` | Upstream analogue | Policy |
|---|---|---|
| `auto_approve` | `approvals.mode: smart` minus the LLM (no model in a pure gate) | allow unless a safety/capability rule denies; `ask`-class calls ⇒ deny 'unattended' in Phase 4 |
| `allowlist` | `manual` + `command_allowlist` floor | non-read capabilities require membership in the session's allowlist or a prior session grant; otherwise deny |
| `yolo` | `/yolo` toggle | approval escalation skipped; the **deny floor still applies** |

**Floor precedent:** Hermes' "hardline blocklist… refuses to run them **regardless** of `--yolo` / `/yolo` toggled on, `approvals.mode: off`, cron jobs running in headless `approve` mode, user explicitly clicking 'allow always'. The blocklist is the floor below `--yolo`. It trips **before** the approval layer even sees the command" [CITED: security]. HALO's floor = GATE-02 deny-defaults (unknown tool/capability, timeout, capability-not-permitted) — never bypassable by mode.
**Persistence precedent:** "`/yolo` applies only to the session it was typed in. It is saved with the session, so it survives a restart"; approval choices `[o]nce | [s]ession | [a]lways | [d]eny` with "once / session (pattern for the rest of the session) / always (permanent allowlist saved to config.yaml)"; expired timeout "is denied by default (fail-closed)" and "An expired prompt cannot be reopened" [CITED: security]. HALO: `session_gate_state` row `[PLANNED]` in `state.db` (one store wins), per-session grants as JSON arrays; permanent allowlist is a settings concern deferred to Phase 10's settings page (UI has no surface in Phase 4).
**Mode vocabulary note:** REQUIREMENTS names "auto-approve, allowlist, YOLO" [VERIFIED: REQUIREMENTS.md:46]; upstream names modes `smart | manual | off` [CITED: security] — the HALO triple is the product's own vocabulary; exact code spellings are `[PLANNED]` (`auto_approve|allowlist|yolo` in the proposed CHECK).

### Pattern 7: Argument rewriting is a decision-recorded, hash-recomputed event
**What:** on `allow` with `rewritten_args`, the backend receives rewritten args; the assistant's persisted `tool_calls` JSON keeps the model's original bytes (mirror rule: the transcript mirrors what the model sent [VERIFIED: 03-AI-SPEC.md:35-35 mirror rule]); the decision row stores the rewrite. Upstream mechanism precedent: `{"action": "modify", "args": {...}}` "shallow-merged into the tool arguments" [CITED: hooks]. Recompute `request_sha256` over the post-gate request for the executed-call hash and keep the pre-gate hash in the same row (both, so a rewrite is provable).
**Redaction interaction:** tool-result rows already redact via `admission.append_message` [VERIFIED: 03-07-PLAN.md:157]; decision rows store *handles/hashes*, not raw args (B20 mitigation [VERIFIED: ARCHITECTURE.md:269]).

### Anti-Patterns to Avoid
- **Inline dispatch in loop code:** explicitly forbidden ("do NOT inline-dispatch tools in loop code" [VERIFIED: 03-AI-SPEC.md:326]); `loop_gate.py` scan flags it [VERIFIED: 03-07-PLAN.md:37].
- **Runtime shadow/override:** `override=True` semantics must not be re-created; duplicates crash at startup.
- **Gate consulting a plugin/model/network:** purity property [VERIFIED: ARCHITECTURE.md:221-222]; plugin hooks stay post-gate deny-only [VERIFIED: ARCHITECTURE.md:231-232].
- **Policy parsing tool output to decide** (B17: "policy never parses tool output to decide" [VERIFIED: ARCHITECTURE.md:266]).
- **Fabricated pass-through decisions** to satisfy NOT NULL: forbidden; Phase 4's rule is a *real* decision per call, the trigger below keys on `state='dispatched'` only.
- **Second vocabulary for backends:** `PHASE3_BACKEND = "runtime"` vs ARCH's literal set `["halo","hermes","omp","mcp","cli","plugin"]` [VERIFIED: ARCHITECTURE.md:202] — pick one story (Fork G3); do not let both vocabularies persist (FEATURES #5 "No aliases" [VERIFIED: FEATURES.md:125]).
- **Per-call gate racing siblings:** evaluating per call *inside* the dispatch path is exactly the upstream design HALO replaced [VERIFIED: ARCHITECTURE.md:166-169].

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Argument schema validation | Hand-written validators per tool | Pydantic v2 models per entry schema (pattern: `ToolCallIn` `model_config = {"extra": "forbid"}` [VERIFIED: 03-07-PLAN.md:155]) | Already the mandated boundary layer; `extra=forbid` blocks arg smuggling |
| Request canonicalization + hashing | Custom serializer | `json.dumps(..., sort_keys=True)` + `hashlib.sha256` — same convention as `request_sha256` [VERIFIED: 03-RESEARCH.md:454, 1168] | Determinism is byte-level; two conventions guarantee divergence |
| YAML parsing (if `.yaml`) | A mini-parser | `pyyaml` (SUS-gated) — or avoid via JSON fork | Stdlib has no YAML; hand-parsers and contracts mix badly |
| Shell-command risk classification (dangerous patterns) | New regex table now | Defer with Phase 5/11; upstream inventory exists (`DANGEROUS_PATTERNS`, `UNRECOVERABLE_BLOCKLIST` in `tools/approval.py`) [CITED: tools-runtime, security] | Inventing a second pattern vocabulary now forks the vocabulary that Phase 5's `bash` tool must share; ARCH's safety family seeds with patterns that *ship when their tool ships* |
| Path-escape normalization | Per-rule `os.path` ad-hocery | One `realpath`-then-compare helper in `policy/rules/` (ARCH: "workspace escape after `realpath`" [VERIFIED: ARCHITECTURE.md:235]) | One normalization point is testable; Windows `\\?\`/UNC/symlink edges need one owner |
| Approval prompts/UI | Any prompt mechanism | `ask` ⇒ deny 'unattended' in Phase 4; round-trip is UI-05 (Phase 10) | No surface exists; a CLI prompt now re-creates the surface-ordering STATE.md forbids |
| Per-id idempotency/dedup of calls | Registry-level replay cache | Phase 3's `UNIQUE(turn_id, call_ordinal)` + invocation identity [VERIFIED: 03-01-PLAN.md:203] | Ordering/identity is already store-enforced |

**Key insight:** Phase 4's surface area is contract + purity + bookkeeping. Every feature that looks like "approval product" (prompts, smart LLM, gateway cards) was deliberately upstream-scoped to other phases; the gate's value is being small enough to stay pure and provable in 5 ms.

## Runtime State Inventory

Phase 4 is additive-build work, not a rename — but it **migrates `state.db`** and must answer every category:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `state.db` schema: `tool_invocations.state` CHECK list has **no `denied`** value [VERIFIED: 03-RESEARCH.md:479]; `policy_decision_id TEXT` exists, nullable, untyped FK [VERIFIED: 03-RESEARCH.md:481]. New tables `policy_decisions`, `session_gate_state` are pure additions. | Migration via 03-01's `migrate(conn)` runner (bump `halo_schema_version`); Fork G2 decides whether a table rebuild is needed. Rows already written by Phase 3 fixtures carry `policy_decision_id=NULL` — leave them; the guard trigger only constrains *new* dispatches |
| Live service config | None — no daemon, UI, or external service holds tool policy (Phase 10 owns surfaces). | None; state explicitly verified |
| OS-registered state | None — Phase 4 registers nothing with Windows (no scheduled tasks, no ports). | None; state explicitly verified |
| Secrets/env vars | None new. Gate must *redact* secrets from decision/arg persistence, never store them (B20 [VERIFIED: ARCHITECTURE.md:269]; AGENTS.md security constraint). | Reuse Phase 3 plan-06 redaction at `append_message`; decision rows store hashes/handles only |
| Build artifacts | None — no installed artifacts exist yet (Phases 1–3 unexecuted). | None; state explicitly verified |

## Common Pitfalls

### Pitfall 1: Gate placed after `mark_dispatched` — "dispatched" then lies
**What goes wrong:** `dispatched` is defined as "side effect may already exist" (crash recovery maps `dispatched → unknown / side_effect_unknown` [VERIFIED: 03-RESEARCH.md:601]). If rows are marked dispatched, then the gate denies, a crash in that window claims a side effect that never happened — or worse, a plan "fixes" recovery so denied rows replay.
**How to avoid:** run resolve+gate **between** `reserve_tool_invocation` and `mark_dispatched` (Fork G1), or move all three steps inside the dispatcher and make denied rows transition `dispatched → failed(policy_denied)` knowingly (Fork G2 placement). Either way a denial recorded pre-execution must never produce `error_kind='side_effect_unknown'`.
**Warning signs:** a Phase 3 test (`test_steer_interrupt.py` Case 1, `test_agent_loop.py` Case B) starts failing on the in-backend "both rows are dispatched at entry" assertion [VERIFIED: 03-07-PLAN.md:160] for *denied* calls — that assertion is allowed to change shape only per the chosen fork, never silently.

### Pitfall 2: `INSERT ... state='denied'` raises IntegrityError at runtime
**What goes wrong:** the CHECK constraint [VERIFIED: 03-RESEARCH.md:479] rejects any state outside the six. A plan that assumes a `denied` state without the migration hits this in the executor's first test, not in review.
**How to avoid:** Fork G2 in §Open Questions — decide before planning; if `failed`+`error_kind='policy_denied'` is chosen, make `error_kind` a closed vocabulary in the *writer* (the column has no CHECK).
**Warning signs:** literal SQLite failure string `CHECK constraint failed` in denial tests.

### Pitfall 3: "Half the batch ran" state
**What goes wrong:** gating inside per-call dispatch (upstream shape) lets an allowed sibling execute while a denied sibling's row is still `reserved`; interrupt/recovery then marks it `interrupted` and the transcript shows an ungoverned partial batch.
**How to avoid:** ARCH §2.1's resolve-all-then-gate order [VERIFIED: ARCHITECTURE.md:147-151, 166-169]; every call in the batch gets exactly one terminal invocation state + one message row before the next provider request (Phase 3 rule [VERIFIED: 03-07-PLAN.md:157]).

### Pitfall 4: Model sees a shadowed tool, or two backends for one name
**What goes wrong:** registry exposes the loser's schema (duplicate `function` names break providers); or a later-registered tool overrides by import order (the Hermes failure mode its `override=True` gate exists to police [CITED: tools-runtime]).
**How to avoid:** catalog export = winners only; loader raises at startup on duplicate ownership rows AND on a code-registered backend claiming an owned name twice. Catalog-snapshot test pins the exported names byte-for-byte.

### Pitfall 5: Disambiguation text in the wrong field
**What goes wrong:** putting "backend: X" in registry metadata (`description=`) while the model reads `schema["description"]` — Hermes docs state these are different consumers and "when both values differ the model sees the schema value" [CITED: tools-runtime].
**How to avoid:** generate the disambiguation into the schema description at catalog-build time; assert every exported description contains its backend token.

### Pitfall 6: Impure gate — reading live config/settings inside evaluate
**What goes wrong:** breaks the ≤5 ms p99 claim (file I/O), nondeterminism (config cache mtime refresh), and the audit story (decision ≠ what any snapshot produced).
**How to avoid:** immutable per-turn snapshot input (verbatim property [VERIFIED: ARCHITECTURE.md:222-223]); build the snapshot once per batch (mode + allowlist + grants + workspace roots + `agent_kind` + `phase`); a `monkeypatch-during-evaluate` hostile test proves no reads escape.

### Pitfall 7: Capability laundering via tool aliases
**What goes wrong:** a new entry re-exposing `write` under a new name without `fs.write` skips write rules (invented upstream: "Tool aliasing launders a capability — `write`, `patch`, `ast_edit`, `bash` can all write" [VERIFIED: ARCHITECTURE.md:265]).
**How to avoid:** capabilities mandatory in the manifest (loader reject); matrix test over every catalog entry asserting the declared class matches a semantic probe (write-capable tools declare `fs.write`).

### Pitfall 8: Denial with a silent side effect on disk
**What goes wrong:** a "denied" write tool that already truncated the file at argument-validation time, or a backend whose constructor side-effects on registration.
**How to avoid:** GATE-07 acceptance test registers a real side-effecting test tool (creates `target.txt`); gate denies; test asserts `target.txt` absent. Handlers must be pure until invoked — a loader lint/review rule in the plan; nothing in Phase 4's backends directory may touch disk at import (mirrors Hermes's import-time `registry.register()` discipline, but HALO owns both sides).

### Pitfall 9: Re-creating the interception table or a second decision vocabulary
**What goes wrong:** reintroducing agent-level shortcuts ("todo", "memory", "session_search", "delegate_task" handled before dispatch — B7 [VERIFIED: ARCHITECTURE.md:256]) bypasses the gate; or emitting decisions in `loop_events` while `policy_decisions` rows lag.
**How to avoid:** 03-07's `InterceptorStillInstalled` guard stays green [VERIFIED: 03-07-PLAN.md:34, 150]; one writer for decisions (the gate), `loop_events` may mirror events only after the table row exists.

### Pitfall 10: Windows-path normalization in safety rules
**What goes wrong:** `realpath`-then-compare written POSIX-first fails on `C:\` vs `C:/`, UNC, `\\?\` prefixes, and case-insensitive drives — a workspace-escape rule that under- or over-matches.
**How to avoid:** one normalization helper (drive-letter uppercase, separator canonicalization, `nt` semantics), with the case+diacritic path fixtures AGENTS.md/STACK already demand; the rule family in Phase 4 only needs `realpath` for path-shaped entries that exist (the echo tool has none — fixture a fake `fs.write` tool instead of deferring the whole rule family).

## Code Examples

### The gate data shapes (verbatim from the design contract)
```python
# Source: .planning/research/ARCHITECTURE.md:196-219 [VERIFIED] — HALO design contract
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
Phase 3's dispatch-side `ToolRequest` (5-field frozen dataclass `(tool_call_uid, tool_call_id, tool_name, args, backend)` [VERIFIED: 03-07-PLAN.md:155]) is *not* this shape — extend one and make it the only request (Fork G5). Extending the dataclass with trailing defaulted fields (`session_id: str = ""` …) keeps 03-07's positional constructions compiling; renaming/moving `tool_call_uid` does not.

### Bounded, fail-closed evaluation
```python
# Pattern synthesized from ARCHITECTURE.md:221-224 ("a timeout is a deny") +
# Hermes fail-closed hook semantics [CITED: hooks]. PLANNED code shape.
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

### Migration: new tables + ungoverned-dispatch guard (GATE-04 hook)
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
If Fork G2 adds a `denied` state, the table rebuild for `tool_invocations` (drop+recreate CHECK via the migration runner, one `BEGIN IMMEDIATE`) lands in the same migration; the guard trigger must be re-created after any rebuild, and `messages` FTS triggers do not touch `tool_invocations`, so the rebuild stays local [VERIFIED: FTS triggers fire on `messages` only — 03-RESEARCH.md:1169 table/trigger census].

### Ownership manifest entry (shape per ARCH §7.773 line)
```yaml
# contracts/tool-ownership.yaml [PLANNED content] — fields verbatim:
# "name -> backend, capabilities, allowed agents, timeout, idempotency"
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
JSON fork: identical structure at `contracts/tool-ownership.json`, validated by the same Pydantic models; choose via Fork G4.

### Denied-call end-to-end (tracer slice, pytest sketch)
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

## GATE-04 Hookable Obligations (for Phase 12 — do not implement the matrix now)

1. **The one-door invariant stays machine-checked:** `tools/loop_gate.py` (03-07's AST scanner) extended with rules: no implementation of the backend protocol / no `register_backend` call outside `halo_agent/tools/`, `halo_agent/adapter/`, `halo_agent/policy/` (tests allowlisted); no `INSERT INTO tool_invocations` outside the writer modules.
2. **Decision-join invariant:** `tool_invocations_dispatch_guard` trigger above makes every dispatched call provably decided — Phase 12's bypass matrix reduces to "walk entry points, then assert every side effect correlates to a `policy_decisions` row through the invocation".
3. **Backend vocabulary extensibility:** manifest schema accepts `backend: omp|mcp|cli|plugin` entries with **zero code** until those backends register (forward-compatible loader + startup test that an entry naming an unregistered backend fails loudly at startup, not silently).
4. **Entry provenance:** registry exposes per-entry origin (manifest row + backend) so Phase 11 plugin/MCP registrations can be attributed in decision rows (B8/B9 closure [VERIFIED: ARCHITECTURE.md:257-258]).
5. **Child-session inheritance slot:** `session_gate_state` keyed by `session_id`; Phase 7 children (with `parent_session_id`) get a row derived from the parent at creation — SUB-02 "inherits the parent's policy" [VERIFIED: ROADMAP.md:220] becomes a row-copy + snapshot, no gate change.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hermes: `pre_tool_call` evaluated per call inside dispatch, after agent-level interception | HALO: batch-first resolve → gate → dispatch (ARCH §2.1) | HALO design decision (pre-dates this research) | Kills deny-races an allowed sibling; interception table deleted (B7) |
| Hermes approvals mode `smart` (auxiliary-LLM risk call) | HALO Phase 4: deterministic rules only ("No… model" purity) | Gate purity property [VERIFIED: ARCHITECTURE.md:221] | Smart-approval-style risk LLMs, if ever wanted, must be a pre-computed advisory in the snapshot, never an evaluate-time call |
| Hermes `override=True` shadowing + plugin `allow_tool_override` opt-in | HALO: startup error, override path removed | HALO design [VERIFIED: ARCHITECTURE.md:186-188] | Precedence auditable statically from one manifest |
| OMP extensions can intercept/block tool calls in-core | HALO: extensions disabled in core (`--no-extensions`), policy re-implemented in Python gate | B3 closure [VERIFIED: ARCHITECTURE.md:252] | One policy home; Phase 4 ships the Python half of that rule family's skeleton |

**Deprecated/outdated:**
- Reusing Hermes' `tools/approval.py` DANGEROUS_PATTERNS as *runtime* code in Phase 4 — the tree isn't imported yet and the patterns belong to tools that don't ship until Phase 5; only the *inventory* concept ports.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vendored Hermes/OMP symbols (interception attribute name, `tools/registry.py` internals) behave at import SHA as their current public docs say | Patterns 2–3 | Wave-0 verify task absorbs it — same posture Phase 3 carried (R2/R9) |
| A2 | `pydantic`/`pytest` versions unchanged since 2026-10-23 morning probes | Standard Stack | Pin drift → re-resolve at execute; low |
| A3 | `uuid7()` + canonical-JSON hashing suffice for request hashes on 3.14.9 (probed on 3.14.7) | Code Examples | None material — same APIs, Phase 3 probed the family |
| A4 | MVP needs no `ask`-prompt UI; `ask` ⇒ deny 'unattended' until Phase 10 | Pattern 6, forks | If product wants a CLI approval prompt inside Phase 4, the snapshot model grows a callback — contradicts surface-ordering locks; flag to user |
| A5 | Default `approval_mode` for fresh sessions = `auto_approve` (safety rules still deny-default) | Pattern 6 | If product wants allowlist-by-default, one CHECK/INSERT default changes; user-visible behavior difference — needs user confirm |
| A6 | Denial modeled as `failed`+`error_kind='policy_denied'` is acceptable to GATE-02's "nothing executes" criterion | Pitfall 2 | If reviewers demand a literal `denied` state, the rebuild migration plan activates |
| A7 | Backend-name story resolved as: keep `runtime` for the in-process backend now; ARCH's literal set grows to include it (or `runtime` maps to `halo`) — decided in Fork G3 | Anti-patterns | A silent split creates two vocabularies (FEATURES #5 violation); planner must pick one |
| A8 | `contracts/tool-ownership.json` (JSON fork) is an acceptable literal-divergence from ARCHITECTURE.md's `.yaml` filename | Fork G4 | If the filename is treated as locked, install pyyaml behind a `checkpoint:human-verify` (SUS) |
| A9 | No vendored `vendor/hermes-agent` patch is needed by Phase 4 (interception deletion + registry empty-guard are 03-07's) | Summary | If 03-07's `build_runtime` guard lands differently, a Phase-4 patch must go through `patches/series` |
| A10 | `ToolRequest` unification via trailing defaulted fields keeps 03-07 call sites compiling | Fork G5 | If the frozen dataclass is constructed with `__slots__`/strict kwargs at execute, extend-and-wrap instead; verify against landed 03-07 code first |

## Open Questions (RESOLVED)

1. **Fork G1 vs G2 — where does gate evaluation sit relative to `mark_dispatched`?** *(planner must pick one)* — RESOLVED → 04-DECISIONS.md: D-G1
   - What we know: Phase 3 order reserve → `mark_dispatched` (all) → `dispatch_batch`; test asserts dispatched-at-entry [VERIFIED: 03-07-PLAN.md:155-160]; `dispatched` = side-effect-possible [VERIFIED: 03-RESEARCH.md:601]; ARCH shows resolve+gate as adapter batch-admission steps before dispatch [VERIFIED: ARCHITECTURE.md:147-151].
   - G1 (recommended): new `adapter.admit_batch(turn_id, requests, snap) -> tuple[BatchAdmission, ...]` between reserve and mark-dispatched; loop marks-dispatches allowed calls only. Denied rows: `reserved → failed(policy_denied)` + synthetic message row; dispatch-at-entry assertion holds for allowed calls; denied calls provably never dispatched. Edits `run_turn` + `test_agent_loop` Case B (explicitly, in the plan).
   - G2: fold admission into `dispatch_batch` (dispatcher calls gate first, dispatches allowed subset). Zero loop edits; but denied rows transition through a `dispatched` mark that lied for microseconds, and crash-window recovery would report `unknown` for calls that provably never ran — acceptable only if `finished_at`+decision rows are the authority. Also forces the dispatcher to write invocation rows (writer-boundary crossing).
   - Recommendation: **G1** — keeps `mark_dispatched` the truth-bearing "about to execute" mark the whole recovery design depends on.

2. **Fork G2(state) — how is a denial represented in `tool_invocations.state`?** — RESOLVED → 04-DECISIONS.md: D-G2-state
   - Known: CHECK list is closed [VERIFIED: 03-RESEARCH.md:479].
   - Option a (recommended): `failed` + `error_kind='policy_denied'` — pure-additive migration, all six states survive, Phase 3 tests unaffected; GATE-02/03/07 criteria read reason from the decision row, not the state.
   - Option b: add `denied` state — rebuild `tool_invocations` in the migration (recreate indexes; re-add `tool_invocations_dispatch_guard` after); makes "denied" queryable by state but touches a table Phase 3's 17-table census + 03-03/04/07 logic depend on.

3. **Fork G3 — backend vocabulary.** `PHASE3_BACKEND = "runtime"` [VERIFIED: 03-07-PLAN.md:155] vs ARCH `Literal["halo","hermes","omp","mcp","cli","plugin"]` [VERIFIED: ARCHITECTURE.md:202]. Recommendation: Phase 4 keeps `runtime` as the first registry-owned backend name (zero Phase 3 churn; decision rows carry it), updates ARCH's set by amending the doc to include `runtime` (or maps `runtime`→`halo` in one rename task with full test updates — pick at planning, then update all sites; no shims). — RESOLVED → 04-DECISIONS.md: D-G3

4. **Fork G4 — contract format.** `.yaml` per ARCHITECTURE.md literal [VERIFIED: ARCHITECTURE.md:174, 773] vs JSON per Phase 2's `contracts/rpc-wire.json` convention. Recommendation: JSON (no new dep, avoids the SUS pyyaml checkpoint); record the divergence in the plan's decision log. — RESOLVED → 04-DECISIONS.md: D-G4

5. **Fork G5 — one `ToolRequest` or two?** ARCH's rich shape vs Phase 3's 5-field dispatch shape [VERIFIED: 03-07-PLAN.md:155]. Recommendation: extend Phase 3's dataclass with trailing defaulted fields (`session_id=""`, `turn_id=""`, `capabilities=frozenset()`, `cwd=""`, `phase=None`, `agent_kind="main"`) so one type flows loop→adapter→gate; `agent_kind="main"` is the only producer until Phase 7. — RESOLVED → 04-DECISIONS.md: D-G5

6. **`ask` verdict before Phase 10.** What happens to an `ask`-class decision when no approval surface exists? Recommendation: deny with `rule_ids=('unattended',)` (Hermes does exactly this for unattended contexts: "deny blocks the command instantly" [CITED: security]); the verdict value stays in the enum so UI-05 lands additively. — RESOLVED → 04-DECISIONS.md: D-ASK

7. **Python 3.14.9 unavailable to uv on this workstation** (03-RESEARCH R11; re-observed today: `uv python list` shows `cpython-3.14.7-windows-x86_64-none` installed, 3.14.9 not fetchable with uv 0.12.17). Same `D-PYTHON:` escape hatch as Phase 3's plan 03-01 [VERIFIED: 03-01-PLAN.md:204]; pin resolves itself when Phases 1/3 execute with pinned uv 0.13.5. — RESOLVED → 04-DECISIONS.md: D-G7

## Environment Availability

Probed this session (Windows win32 x64):

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python (uv-managed) | loop/gate runtime | ✓ (3.14.7; pin says 3.14.9 — not fetchable with this uv) | cpython-3.14.7-windows-x86_64-none installed | `D-PYTHON:` line in `04-DECISIONS.md`, per 03-01's pattern |
| uv | package/venv management | ✓ | 0.12.17 (pin 0.13.5) | same command set; lockfile refresh at Phase 1 bootstrap |
| SQLite (CPython-bundled) | decision store | ✓ | 3.53.1 w/ FTS5 (probed by 03 at 3.14.7 [VERIFIED: 03-RESEARCH.md:1168]) | — |
| just | `just test` recipes | ✗ | — | direct `uv run --project packages/halo_agent pytest …` (Phase 1 bootstrap installs just) |
| bun | Phase 1/2 lanes only | ✓ 1.4.2 (pin 1.4.4) | — | not needed by Phase 4 lanes |
| git | repo ops | ✓ | 2.55.0.windows.3 | — |
| vendor/hermes-agent tree | Wave-0 symbol verification | ✗ (Phases 1–2 unexecuted) | — | plan preconditions gate the phase; Wave-0 verify task runs post-import |
| packages/halo_agent package | insertion point | ✗ (Phase 3 unexecuted) | — | plan preconditions |

**Missing dependencies with no fallback:** none within Phase 4's own code — the two absences (vendor trees, halo_agent package) are *phase preconditions*, not runtime fallbacks.
**Missing dependencies with fallback:** just → direct uv commands; 3.14.9 → 3.14.7 + `D-PYTHON:` record.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.1.1 + pytest-asyncio 1.4.0 (`asyncio_mode="auto"`), in `packages/halo_agent/pyproject.toml` [VERIFIED: 03-RESEARCH.md:1101] |
| Config file | `packages/halo_agent/pyproject.toml` (no root pyproject — DEC-04) |
| Quick run command | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/policy packages/halo_agent/tests/tools` |
| Full suite command | `uv run --project packages/halo_agent pytest -q packages/halo_agent` (state+loop+mirror must stay green — Phase 3 contract) |
| Regression corpus | `tests/evals/ledger/` (Phase 3, 12 fixtures) — Phase 4 must not change loop eval outcomes except the intentional fork-G1 test edits |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GATE-01 | One name → one backend; duplicate name startup error | unit | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/tools/test_registry.py -x` | ❌ Wave 0 |
| GATE-05 | Catalog = winners only; every schema description names its backend; shadowed names absent | unit (snapshot) | `…pytest -q packages/halo_agent/tests/tools/test_catalog_snapshot.py -x` | ❌ Wave 0 |
| GATE-02 | Unknown tool / unknown capability / gate timeout → deny, invocation terminal, no backend call, synthetic message row | integration | `…pytest -q packages/halo_agent/tests/policy/test_deny_default.py -x` | ❌ Wave 0 |
| GATE-03 | allow/deny/rewrite × decision rows; `request_sha256` recomputes; rewrite hash recorded; decision row exists for every verdict incl. error-deny | unit + integration | `…pytest -q packages/halo_agent/tests/policy/test_decision_records.py -x` | ❌ Wave 0 |
| GATE-06 | Entry declares capabilities; call from not-permitted context (agent_kind/empty-capability/unknown-class) denied; matrix over every catalog entry | unit matrix | `…pytest -q packages/halo_agent/tests/policy/test_capability_matrix.py -x` | ❌ Wave 0 |
| GATE-07 | Mode is per-session (two sessions differ); survives close/reopen; denied write leaves no file on disk; yolo cannot bypass deny floor | integration | `…pytest -q packages/halo_agent/tests/policy/test_approval_modes.py -x` | ❌ Wave 0 |
| (purity) | evaluate reads only request+snapshot (hostile-patch test); p99 ≤ 5 ms over 1 000 synthetic requests | unit + perf | `…pytest -q packages/halo_agent/tests/policy/test_gate_purity.py packages/halo_agent/tests/policy/test_gate_budget.py -x` | ❌ Wave 0 |
| (GATE-04 hook) | `ungoverned_dispatch` trigger fires on dispatched-without-decision; loop_gate extension flags a hostile module | DB-constraint + static | `…pytest -q packages/halo_agent/tests/policy/test_dispatch_guard.py -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** quick run command + `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/loop` (Phase 3 seam stays green).
- **Per wave merge:** full suite command; `just verify` if any vendored patch exists (Fork G2-state/A9 cases).
- **Phase gate:** full suite green; criterion-to-test evidence walk (`human_verify_mode: end-of-phase` [VERIFIED: `.planning/config.json:32`]); `just eval` unchanged-and-green.

### Wave 0 Gaps
- [ ] `packages/halo_agent/tests/policy/` + `tests/tools/` — new packages + fixtures (scripted tool-calling provider stream reuses 03-07's `MockProviderServer`).
- [ ] `contracts/tool-ownership.json|yaml` initial content: `echo_test` + `gate_fixture_writer` (+ any tool 03 shipped) — no model-facing catalog ships without an entry.
- [ ] Migration test for `policy_decisions` / `session_gate_state` / guard trigger on an *existing Phase-3-schema db* (upgrade path), not just create-from-scratch.
- [ ] `test_interpreter`-style guard that `state='denied'`-vs-`failed` modeling matches the shipped CHECK list (pins Fork G2(state) choice against drift).

## Security Domain

`workflow.security_enforcement: true`, ASVS L1, block-on high [VERIFIED: `.planning/config.json:48-50`].

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | single-user local daemon; no auth surface in Phase 4 |
| V3 Session Management | no (product sense) | transcript `session_id` is not an auth session; `session_gate_state` inherits the store's ACL |
| V4 Access Control | **yes — this phase IS access control** | capability classes + per-session modes; deny-by-default; `ungoverned_dispatch` trigger as machine-enforced floor |
| V5 Input Validation | yes | Pydantic v2 with `extra="forbid"` on ownership entries and tool schemas; capability strings validated against the declared set at startup; no string-built SQL (static statements, bound params — Phase 3 rule) |
| V6 Cryptography | yes (integrity only) | SHA-256 via `hashlib` for `request_sha256` — integrity, not authentication; module docstring says so (Phase 3's V6 note pattern) |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Capability laundering via aliased tool names (B16) | Elevation | capability-keyed rules + matrix test over every entry [VERIFIED: ARCHITECTURE.md:265] |
| Bypass via a second dispatch path (inline handler, post-plugin hook upgrade) | Tampering | one-door scanner rule + post-gate deny-only plugin contract [VERIFIED: ARCHITECTURE.md:231-232] (plugins don't exist yet — the rule is planted now) |
| Prompt-injected output steering policy (B17) | Tampering | gate never consumes tool output; results are data [VERIFIED: ARCHITECTURE.md:266] |
| Decision/audit record leaks secrets (B20) | Information Disclosure | hashes + handles in `policy_decisions`; redaction list column records what was replaced [VERIFIED: ARCHITECTURE.md:269] |
| Rewritten args diverge from persisted history → hidden execution | Repudiation | decision row stores rewrite + post-gate hash; assistant row keeps model bytes; tool-result row carries `policy_decision_id` join |
| YOLO escalation past a safety rule | Elevation | deny-floor below every mode (Hermes hardline precedent [CITED: security]); mode only controls *escalation*, never the floor |
| Stale/empty allowlist silently pass-all (the Hermes dead-allowlist rule) | Tampering | allowlist parse failure is a startup error; an empty allowlist in `allowlist` mode denies everything non-read (mirror 02-08's "empty ≠ pass-all" gate philosophy [VERIFIED: `.planning/phases/02-rebrand-wire-contract-migration/02-08-PLAN.md:32`]) |

## Sources

### Primary (HIGH — opened and quoted verbatim this session)
- `.planning/REQUIREMENTS.md` (GATE definitions), `.planning/ROADMAP.md` (Phases 3–4 + ordering rules), `.planning/STATE.md`, `.planning/PROJECT.md`, `AGENTS.md`, `.planning/config.json`
- `.planning/research/ARCHITECTURE.md` §1.3, §2.1–2.5, §7 (gate contract, ownership, bypass matrix, frame catalog)
- `.planning/research/FEATURES.md:120-126, 150-155` (principles #2/#3/#5; arbitration rows #18/#21)
- `.planning/phases/03-unified-loop-session-authority/`: `03-RESEARCH.md` (DDL incl. `tool_invocations` state CHECK; validation map; sources), `03-AI-SPEC.md:323-326`, `03-01-PLAN.md`, `03-03-PLAN.md`, `03-04-PLAN.md`, `03-07-PLAN.md:150-160` (the seam Phase 4 edits)
- `.planning/phases/01-import-provenance-ledger/01-SKELETON.md`; `.planning/phases/02-rebrand-wire-contract-migration/02-08-PLAN.md`
- Live probes: repo state (`ls`/`git log`), toolchain (`uv --version`, `uv python list`, bun/just/git), `pypi.org/pypi/pyyaml/json`, `package-legitimacy check`, `classify-confidence` seam (context7→MEDIUM, websearch→LOW)

### Secondary (MEDIUM — official upstream docs fetched 2026-10-23)
- Hermes Agent — *Tools Runtime* (registry, shadowing, check_fn, DANGEROUS_PATTERNS flow): `https://hermes-agent.nousresearch.com/docs/developer-guide/tools-runtime`
- Hermes Agent — *Agent Loop Internals* (execution flow, interception table, ordering): `https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop`
- Hermes Agent — *Security* (approval modes, YOLO, hardline floor, deny-rules, timeout-fail-closed, per-session persistence): `https://hermes-agent.nousresearch.com/docs/user-guide/security`
- Hermes Agent — *Event Hooks* (`pre_tool_call` contract, modify/block/approve shapes, fail-closed timeout semantics): `https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks`
- oh-my-pi — *RPC Protocol Reference* (`get_state.dumpTools`, `set_host_tools`, host-tool frames, v2 chunking): `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/rpc.md`

### Tertiary (LOW — flagged, not load-bearing)
- pyyaml project age (~20 yrs) and general reputation — training knowledge only; seam verdict SUS stands until a human check.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero-new-package fork; versions cited from same-day PyPI reads; interpreter delta is the known Phase 3 R11.
- Architecture: HIGH for in-repo contracts (all quoted), MEDIUM for exact landed 03-07 code shape (Phase 3 unexecuted — first task of every Phase 4 plan reads the landed files).
- Pitfalls: HIGH — each anchors a quoted in-repo constraint or a documented upstream behavior.
- Validation: HIGH — pytest lane inherited from Phase 3's committed validation architecture; every requirement maps to a <30 s deterministic command.

**Research date:** 2026-10-23
**Valid until:** 2026-11-06 — and **must be re-validated against the landed Phase 3 code** (`adapter/dispatch.py`, `state/schema.sql`, `loop/agent_loop.py`) as the first task of Wave 1: the seam shapes quoted here are the *planned* shapes of 03-07, which has not executed yet.
