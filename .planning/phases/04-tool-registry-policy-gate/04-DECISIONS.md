# Phase 4 — Tool Registry & Policy Gate: Recorded Decisions

**Recorded:** 2026-10-23 by the phase planner.
**Why this file exists:** Phase 4 has no `CONTEXT.md` — the user chose to plan from
`04-RESEARCH.md` + requirements only. Every fork RESEARCH left open (`:481-502`) is therefore
adopted here from the research recommendation and recorded as one grep-checkable line, so no
fork is silently defaulted. Each plan's `<automated>` gate greps the line it depends on. A line
is authoritative for the whole phase; re-opening one requires editing this file first and
re-running every plan that cites it.

## Adopted forks

D-G1: admit-batch-pre-dispatch
  Placement of resolve+gate inside the batch path. Adopted from `04-RESEARCH.md:487` (G1): a new
  `halo_agent/adapter/admission.py` exposing `admit_batch(turn_id, requests, snap)` runs between
  `reserve_tool_invocation` and `mark_dispatched`; the loop marks-dispatches allowed calls only.
  Rejected alternative: `dispatch-owns-admission` (G2) — it folds gating into `dispatch_batch`,
  makes denied rows transition through a `dispatched` mark that lied, forces the dispatcher to
  write invocation rows across the writer boundary, and corrupts the `dispatched -> unknown /
  side_effect_unknown` crash mapping (`04-RESEARCH.md:486,287-288`).
  Consequence accepted and planned: `run_turn` and the dispatch-at-entry assertion in
  `tests/loop/test_agent_loop.py` Case B are edited explicitly, in the plan, never silently
  (`04-RESEARCH.md:289,485`).

D-G2-state: failed-policy-denied
  Denied-invocation modeling in `tool_invocations.state`. Adopted from `04-RESEARCH.md:491`
  (option a): denials ride `state='failed'` + `error_kind='policy_denied'`, which is pure-additive
  against the closed CHECK list at `03-RESEARCH.md:479`; the CHECK list keeps its six values and
  no table rebuild lands in the migration. `error_kind` is a closed vocabulary enforced in the
  writer because the column carries no CHECK. Rejected alternative: `denied-state-rebuild` — a
  drop/recreate of a table Phase 3's 17-table census and 03-03/04/07 logic depend on, plus a
  re-created guard trigger. GATE-02/03/07 read the denial reason from the `policy_decisions` row,
  not from the state value. This is the phase's one-way-adjacent schema decision and is
  re-ratified by the `checkpoint:decision` in plan 04-01 before the migration lands.

D-G3: keep-runtime-backend
  Backend vocabulary. Adopted from `04-RESEARCH.md:494`: `runtime` (already `PHASE3_BACKEND` in
  03-07) stays the first registry-owned backend name, is recorded verbatim in
  `contracts/tool-ownership.json`, in `tool_invocations.backend` rows and in decision rows.
  Rejected alternative: `rename-to-halo` now — a rename touching every landed Phase 3 call site
  and every already-persisted `backend` value, with no Phase 4 benefit. The manifest schema and
  the loader accept `omp|mcp|cli|plugin` entries with zero code so Phase 5/11 add backends without
  touching this decision (`04-RESEARCH.md:450`), and an entry naming an unregistered backend fails
  loudly at startup.

D-G4: json-contract
  Ownership-manifest format. Adopted from `04-RESEARCH.md:496`: `contracts/tool-ownership.json`
  (JSON), following the Phase 2 `contracts/rpc-wire.json` convention, validated by Pydantic v2
  models with `extra="forbid"`. This is a deliberate literal divergence from
  `ARCHITECTURE.md:773`, which names `tool-ownership.yaml`; the YAML literal would force a new
  dependency on `pyyaml`, which the Package Legitimacy Audit flagged `[SUS] unknown-downloads`
  (`04-RESEARCH.md:134-138`). Rejected alternative: `yaml-contract-pyyyaml`.
  PACKAGE-NOT-INSTALLED: pyyaml — not added under this fork; Phase 4 installs no new package, so
  `uv.lock` is byte-unchanged by this phase and no `[SUS]` install needs a human checkpoint.

D-G5: extend-toolrequest
  Request-type unification. Adopted from `04-RESEARCH.md:498`: one `ToolRequest` flows
  loop → adapter → gate by extending the landed 5-field frozen dataclass with trailing defaulted
  fields (`session_id=""`, `turn_id=""`, `capabilities=frozenset()`, `cwd=""`, `phase=None`,
  `agent_kind="main"`) so every existing positional construction in 03-07's code keeps compiling.
  Rejected alternative: `two-request-types` (an ARCH-shaped gate type plus the dispatch type and a
  converter) — a second vocabulary that lets a field be populated on one side and absent on the
  other. `agent_kind="main"` is the only producer until Phase 7. If the landed dataclass turns out
  to use `__slots__` or strict kwargs (A10), the executor extends-and-wraps and records the
  divergence as a `SEAM-DIVERGENCE:` line in this file.

D-ASK: deny-unattended
  `ask` verdicts before any approval surface exists (Phase 10 owns UI-05). Adopted from
  `04-RESEARCH.md:500`: an `ask`-class decision is recorded with `verdict='deny'` and
  `rule_ids=('unattended',)`; `ask` stays in the verdict enum and the `PolicyDecision` shape so
  UI-05 lands additively. No prompt mechanism, no CLI dialog, no callback in the snapshot
  (`04-RESEARCH.md:267` — a surface now re-creates the ordering STATE.md forbids).

D-G7: default-auto-approve
  Approval mode for a fresh session (RESEARCH Fork G7 / Assumption A5 `04-RESEARCH.md:474`).
  Adopted: `auto_approve`, written by `SessionStore.create_session` into `session_gate_state` with
  the session's other rows, with `allowlist='[]'` and `session_grants='[]'`. Safety and capability
  rules still deny by default, so the default is permissive only about escalation, never about the
  deny floor. Flagged, not settled by the user: if product wants allowlist-by-default, the change
  is one INSERT default plus one CHECK; plan 04-05 records the observation.

## Interpreter pin (conditional, appended at execution)

`D-PYTHON:` follows Phase 3's escape hatch (`03-01-PLAN.md:204`, `04-RESEARCH.md:502`). AGENTS.md
pins Python 3.14.9; this workstation's uv can fetch only 3.14.7. The rule: if the resolved
interpreter for `uv run --project packages/halo_agent` is not exactly 3.14.9, append one line
`D-PYTHON: <resolved-version> <source>` to this file in plan 04-01. No verify command greps this
line, because the pin resolving correctly must not fail a gate.

## Seam re-validation (appended at execution by plan 04-01, task 1)

Phase 4's quoted seam shapes are 03-07's *planned* shapes; Phases 1-3 are authored but unexecuted
at planning time (`04-RESEARCH.md:7`, `:609`). Plan 04-01 runs the landed-code checks first and
appends one `SEAM-REVALIDATION: dispatch=<ok|diverged> schema=<ok|diverged> loop=<ok|diverged>`
line plus a `SEAM-DIVERGENCE: <file> <observation>` line per mismatch before any Phase 4 edit
lands.
