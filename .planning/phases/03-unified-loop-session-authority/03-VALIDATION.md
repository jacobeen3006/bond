---
phase: "3"
slug: "unified-loop-session-authority"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-23"
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `03-RESEARCH.md` § Validation Architecture. Task IDs are assigned by the planner;
> rows below are keyed by requirement and by the AI-SPEC's guardrail/crash invariants.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.1.1 + pytest-asyncio 1.4.0 (`asyncio_mode = "auto"`) |
| **Config file** | `packages/halo_agent/pyproject.toml` — deliberately not a root `pyproject.toml` (DEC-04) |
| **Quick run command** | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/state packages/halo_agent/tests/loop packages/halo_agent/tests/mirror` |
| **Full suite command** | `just test` (Python lane) → `just eval` (deterministic fixtures + mirror goldens + canary sweep), plus `just verify` (Phase 1/2 lanes) |
| **Estimated runtime** | ~30 s quick · ~2–4 min full (the >1 MiB mirror fixture is the slowest single test, < 5 s) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command
- **After every plan wave:** Run `just test` and `just verify`
- **Before `/gsd-verify-work`:** `just test && just eval` must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner) | TBD | 1 | LOOP-01 | T-3-01 | Second loop authority raises; steer leaves legal alternation | unit + integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/loop/test_single_loop.py packages/halo_agent/tests/loop/test_steer_interrupt.py` | ❌ W0 | ⬜ pending |
| (planner) | TBD | — | LOOP-02 | T-3-02 | Second writer refused (`StoreOwnedElsewhere`); non-WAL pragma refused | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/state/test_single_writer.py` | ❌ W0 | ⬜ pending |
| (planner) | TBD | — | LOOP-03 | T-3-03 | Export/import schema-validated, size-capped, never through a shared temp dir | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/state/test_sessions.py packages/halo_agent/tests/state/test_search.py` | ❌ W0 | ⬜ pending |
| (planner) | TBD | — | LOOP-04 | T-3-04 | Single compaction engine; checkpoint blocks rewrite when archive fails | unit + fixture | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/loop/test_compaction.py` | ❌ W0 | ⬜ pending |
| (planner) | TBD | — | LOOP-05 | T-3-05 | Per-position hash equals hash of recorded HTTP body; >1 MiB intact | unit + wire fixture | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/mirror` | ❌ W0 | ⬜ pending |
| (planner) | TBD | — | LOOP-06 | T-3-06 | Close refused without terminal predicate; DB trigger aborts reopen | unit + DB constraint | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/loop/test_turn_lifecycle.py` | ❌ W0 | ⬜ pending |
| (planner) | TBD | — | AI-SPEC guardrail | T-3-07 | Canary token absent from every text column, export, and log | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/state/test_redaction.py` | ❌ W0 | ⬜ pending |
| (planner) | TBD | — | crash recovery | T-3-08 | Dead-owner admission becomes `unknown`, never replayed | integration (kill) | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/state/test_crash_recovery.py` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs and wave columns are filled by the planner; requirement coverage above is the contract
that must survive planning (no LOOP requirement may end up without an automated verify).*

---

## Wave 0 Requirements

- [ ] `packages/halo_agent/pyproject.toml` — uv project, `requires-python`, pytest config (no root pyproject)
- [ ] `packages/halo_agent/tests/conftest.py` — tmp `state.db` factory, injectable clock, killable child helper, mock-provider fixture
- [ ] `packages/halo_agent/tests/state/` schema round-trip test — create, re-open, idempotent migration, `journal_mode == "wal"`
- [ ] `packages/halo_agent/tests/provider/mock.py` — deterministic OpenAI-compatible SSE server with body recording
- [ ] `packages/halo_agent/tests/evals/ledger/` — the AI-SPEC §5 12 golden sessions
- [ ] `justfile` recipes `test` and `eval`; CI runs `just verify && just test && just eval`
- [ ] `packages/halo_agent/tests/state/test_interpreter.py` — interpreter/FTS5 probe

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Multi-day resume/branch/export round-trip on a real session | LOOP-03 | Requires human judgement on whether the resumed conversation is the one the user expects; `human_verify_mode: end-of-phase` | Run a real session across a restart, branch it, export and re-import, confirm the visible history and search agree |
| Compaction-summary fidelity | LOOP-04 (AI-SPEC LLM-judge lane) | Model-quality judgement, not an invariant; stays out of the Phase 3 gate | `just eval-llm` on demand against the calibration batch |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
