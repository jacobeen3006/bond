---
phase: "4"
slug: "tool-registry-policy-gate"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-23"
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Populated by the planner from `04-RESEARCH.md` §Validation Architecture (`:522-554`) and the
> seven phase plans. Every command below is the command the owning plan's task actually runs.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.1.1 + pytest-asyncio 1.4.0 (`asyncio_mode = "auto"`) — inherited from Phase 3, installed by plan 03-01, nothing new installed in Phase 4 |
| **Config file** | `packages/halo_agent/pyproject.toml` — deliberately not a root `pyproject.toml` (DEC-04) |
| **Quick run command** | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/policy packages/halo_agent/tests/tools` |
| **Full suite command** | `just test` (whole Python lane, state+loop+mirror must stay green) → `just eval` (12-case Phase 3 ledger, unchanged apart from the declared fork-G1 edits) → `uv run --project packages/halo_agent python tools/loop_gate.py`; `just verify` additionally when any vendored patch exists (none under the adopted forks) |
| **Estimated runtime** | ~15 s quick · ~1–2 min full (the 1 000-request budget test is the slowest single new test) |

### Requirement → automated command (all eight rows from `04-RESEARCH.md:536-543`; every file is created by this phase)

| Req ID | Behavior | Test Type | Automated Command | File Exists |
|--------|----------|-----------|-------------------|-------------|
| GATE-01 | One name → one backend; duplicate name is a startup error | unit | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/tools/test_registry.py -x` | ❌ W0 (plan 02) |
| GATE-05 | Catalog = winners only; every schema description names its backend; shadowed names absent | unit (snapshot) | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/tools/test_catalog_snapshot.py -x` | ❌ W0 (plan 02) |
| GATE-02 | Unknown tool / unknown capability / gate timeout → deny, terminal invocation, no backend call, synthetic message row | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/policy/test_deny_default.py -x` | ❌ W0 (plan 03) |
| GATE-03 | allow/deny/rewrite × decision rows; `request_sha256` recomputes; rewrite hash recorded; row for every verdict including error-deny | unit + integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/policy/test_decision_records.py -x` | ❌ W0 (plan 04) |
| GATE-06 | Declared capabilities; not-permitted context denied; matrix over every catalog entry | unit matrix | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/policy/test_capability_matrix.py -x` | ❌ W0 (plan 03) |
| GATE-07 | Mode is per-session; survives close/reopen; denied write leaves no file; yolo cannot bypass the deny floor | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/policy/test_approval_modes.py -x` | ❌ W0 (plan 05) |
| (purity) | `evaluate` reads only request + snapshot; p99 ≤ 5 ms over 1 000 synthetic requests | unit + perf | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/policy/test_gate_purity.py packages/halo_agent/tests/policy/test_gate_budget.py -x` | ❌ W0 (plan 03) |
| (GATE-04 hook) | `ungoverned_dispatch` trigger fires on dispatched-without-decision; scanner flags a hostile module | DB-constraint + static | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/policy/test_dispatch_guard.py -x` | ❌ W0 (plan 06) |

End-to-end slice plus schema lane (plans 01): `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/policy/test_tracer_slice.py` and `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/state/test_gate_schema.py`.
Decision-fork gates: `grep -Eq '^D-G1: (admit-batch-pre-dispatch|dispatch-owns-admission)$' .planning/phases/04-tool-registry-policy-gate/04-DECISIONS.md` (and the matching `D-G2-state`, `D-G3`, `D-G4`, `D-G5`, `D-ASK`, `D-G7` patterns used by the plans).

---

## Sampling Rate

- **After every task commit:** Run the quick run command **plus** `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/loop` — the Phase 3 seam contract (`04-RESEARCH.md:546`)
- **After every plan wave:** Run `just test`; add `just verify` if any vendored patch landed (none expected under the adopted forks)
- **Before `/gsd:verify-work`:** `just test && just eval` green, `tools/loop_gate.py` OK, and `tools/phase_evidence.py --phase 4` printing `EVIDENCE OK`
- **Max feedback latency:** 30 seconds (no test in this phase exceeds a few seconds; the perf lane is a budget assertion, not a benchmark)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | GATE-02 | — | Landed Phase 3 seam proven before any Phase 4 edit; divergences recorded | regression | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/state/test_schema.py packages/halo_agent/tests/loop/test_agent_loop.py` | ✅ (Phase 3) | ⬜ pending |
| 4-01-02 | 01 | 1 | GATE-02 | T-04-03 | Denial modeling chosen and recorded before the migration lands | decision gate | `grep -Eq '^D-G2-state: (failed-policy-denied\|denied-state-rebuild)$' .planning/phases/04-tool-registry-policy-gate/04-DECISIONS.md` | ✅ | ⬜ pending |
| 4-01-03 | 01 | 1 | GATE-01, GATE-02, GATE-03, GATE-07 | T-04-01, T-04-02, T-04-03, T-04-04 | Allowed call carries its decision id; denied call executes nothing and writes no file | integration (tracer) | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/policy/test_tracer_slice.py` | ❌ W0 | ⬜ pending |
| 4-01-03 | 01 | 1 | GATE-02, GATE-03 | T-04-01 | Guard trigger refuses dispatch without a decision; upgrade path idempotent | DB-constraint | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/state/test_gate_schema.py` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 2 | GATE-01 | T-04-SC | Formal `tools/backends/` package; import-time purity holds | unit (import) | `uv run --project packages/halo_agent python -c "import halo_agent.tools.backends.echo_test; print('import ok')"` | ❌ W0 | ⬜ pending |
| 4-02-02 | 02 | 2 | GATE-05 | T-04-SC | Shared `tests/conftest.py` scaffolding; Phase 3 fixtures reused | integration (fixtures) | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/policy/test_tracer_slice.py` | ❌ W0 | ⬜ pending |
| 4-03-01 | 03 | 2 | GATE-01 | T-04-06, T-04-07 | Duplicate names and owned-name claims abort startup; adjacency/encoding cases stay distinct | unit | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/tools/test_registry.py -x` | ❌ W0 | ⬜ pending |
| 4-03-02 | 03 | 2 | GATE-05 | T-04-08 | Winners-only catalog, backend token in every description, byte-stable order | unit (snapshot) | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/tools/test_catalog_snapshot.py -x` | ❌ W0 | ⬜ pending |
| 4-04-01 | 04 | 2 | GATE-02, GATE-06 | T-04-12, T-04-14 | Gate is pure and bounded; one Windows path owner | unit + perf | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/policy/test_gate_purity.py packages/halo_agent/tests/policy/test_gate_budget.py -x` | ❌ W0 | ⬜ pending |
| 4-04-02 | 04 | 2 | GATE-02 | T-04-10 | Every failure mode denies in call order with nothing executed | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/policy/test_deny_default.py -x` | ❌ W0 | ⬜ pending |
| 4-04-03 | 04 | 2 | GATE-06 | T-04-11, T-04-13 | Declared capability classes match handler behavior; context matrix denies | unit matrix | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/policy/test_capability_matrix.py -x` | ❌ W0 | ⬜ pending |
| 4-05-01 | 05 | 3 | GATE-03 | T-04-15, T-04-16 | A rewrite can only narrow; model bytes stay in the transcript | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/policy/test_deny_default.py packages/halo_agent/tests/policy/test_tracer_slice.py -x` | ❌ W0 | ⬜ pending |
| 4-05-02 | 05 | 3 | GATE-03 | T-04-17, T-04-18 | Every verdict is one complete, replayable, secret-free row | unit + integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/policy/test_decision_records.py -x` | ❌ W0 | ⬜ pending |
| 4-06-01 | 06 | 4 | GATE-07 | T-04-21 | Escalation lives in `policy/modes.py`, after the floor only | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/policy/test_capability_matrix.py packages/halo_agent/tests/policy/test_tracer_slice.py -x` | ❌ W0 | ⬜ pending |
| 4-06-02 | 06 | 4 | GATE-07 | T-04-19, T-04-20, T-04-22 | Per-session modes, restart survival, floor intact, denied write leaves nothing | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/policy/test_approval_modes.py -x` | ❌ W0 | ⬜ pending |
| 4-07-01 | 07 | 5 | GATE-02 | T-04-23, T-04-25 | A second dispatch path or a tool-side policy read fails a command | static scan | `uv run --project packages/halo_agent python tools/loop_gate.py` | ✅ (extended) | ⬜ pending |
| 4-07-02 | 07 | 5 | GATE-02 | T-04-23, T-04-24 | One-door-ness enforced by the DB trigger; Phase 12 inventory query proven | DB-constraint | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/policy/test_dispatch_guard.py -x` | ❌ W0 | ⬜ pending |
| 4-08-01 | 08 | 6 | GATE-01..GATE-07 | T-04-27 | Full gate green with recorded, unweakened output | full-suite | `just verify && just test && just eval` | ✅ (Phase 1/2/3) | ⬜ pending |
| 4-08-02 | 08 | 6 | GATE-01..GATE-07 | T-04-26 | No criterion or GATE id lacks an existing named test | meta-check | `uv run --project packages/halo_agent python tools/phase_evidence.py --phase 4 --phase-dir .planning/phases/04-tool-registry-policy-gate --roadmap .planning/ROADMAP.md` | ✅ (generalized) | ⬜ pending |
| 4-08-03 | 08 | 6 | GATE-03, GATE-07 | — | Two judgement checks staged with empty verdict cells | human-check | `test -f .planning/phases/04-tool-registry-policy-gate/04-EVIDENCE.md && grep -c '^## Human verification$' .planning/phases/04-tool-registry-policy-gate/04-EVIDENCE.md` | ❌ W0 (plan 08) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky* ("File Exists" ❌ W0 = the file is created by the named plan and does not exist yet, because Phases 1-3 are authored but unexecuted.)

---

## Wave 0 Requirements

Created by plan 04-01 (wave 1) and plan 04-02 (wave 2) before any later plan verifies through them (`04-RESEARCH.md:550-554`):

- [ ] `packages/halo_agent/tests/policy/` and `packages/halo_agent/tests/tools/` — test lanes plus conftest additions: the scripted tool-calling provider stream reusing 03-07's mock provider server, the registry fixture built from a temp manifest copy, the `sandbox_dir` fixture, and the `gate_fixture_writer` backend factory
- [ ] `contracts/tool-ownership.json` — initial content `echo_test` + `gate_fixture_writer`; no model-facing catalog ships without an entry
- [ ] `packages/halo_agent/tests/state/test_gate_schema.py` — migration upgrade path against an **existing Phase-3-schema db**, not just create-from-scratch, plus the idempotent second run
- [ ] CHECK-list drift pin in the same file — `state='denied'` refused by the shipped CHECK with the literal `CHECK constraint failed` token, pinning `D-G2-state` against drift
- [ ] Interpreter/environment probe reuse — `D-PYTHON:` recorded in `04-DECISIONS.md` when the resolved interpreter is not exactly 3.14.9 (no second probe file; Phase 3's `tests/state/test_interpreter.py` lane already covers FTS5/uuid7)

No framework install: pytest and pytest-asyncio arrive with the Phase 3 project, and the adopted JSON-contract fork installs **nothing new** (`04-RESEARCH.md:122-126`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A decision row's `reason` is actionable for a human reading a session export | GATE-03 | Legibility/judgement, not an invariant; `human_verify_mode: end-of-phase` | Run a real session with one allowed and one denied call; open the export and the `state.db` rows; confirm reason + rule ids are readable and the assistant message still shows the model's original arguments |
| A denied write in a real workspace leaves the directory untouched, and `yolo` still denies an unknown tool | GATE-07 | Real filesystem + human inspection of the scratch workspace | Set a session to `allowlist` with an empty allowlist, request a write in a scratch directory, deny, then list the directory; set `yolo` and confirm an unknown tool name is still denied |

Both are recorded in `04-EVIDENCE.md` under `## Human verification` with empty verdict cells by plan 04-07.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
