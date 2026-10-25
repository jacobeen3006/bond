---
phase: "07"
slug: "subagent-orchestration"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-25"
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `pytest` + `pytest-asyncio` (via `uv run --project packages/halo_agent pytest`) |
| **Config file** | `packages/halo_agent` pytest config (Phase 3) |
| **Quick run command** | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/subagent -x` |
| **Full suite command** | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests -x` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/subagent -x` (the touched subagent test file)
- **After every plan wave:** Run `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests -x` (full Python suite)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | SUB-01 | — | N/A | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/subagent/test_task_spawn.py -x` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | SUB-01 | — | N/A | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/subagent/test_isolation.py -x` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 2 | SUB-02 | T-07-01 | Child inherits parent gate state; no ungoverned child call | integration + DB-constraint | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/subagent/test_child_governance.py -x` | ❌ W0 | ⬜ pending |
| 07-03-01 | 03 | 3 | SUB-03 | T-07-02 | Kill leaves no orphaned process or bound port | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/subagent/test_steer_kill_restore.py -x` | ❌ W0 | ⬜ pending |
| 07-03-02 | 03 | 3 | SUB-03 | T-07-02 | Post-kill orphan/port probe clean | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/subagent/test_orphan_cleanup.py -x` | ❌ W0 | ⬜ pending |
| 07-04-01 | 04 | 4 | SUB-04 | — | N/A | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/subagent/test_concurrency_cap.py -x` | ❌ W0 | ⬜ pending |
| 07-04-02 | 04 | 4 | SUB-04 | — | N/A | integration + DB-constraint | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/subagent/test_cost_rollup.py -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] **Seam re-validation task** (Pitfall 1): re-read the landed Phase 3/4/5 code; append `SEAM-REVALIDATION: loop=<ok|diverged> gate=<ok|diverged> store=<ok|diverged> core=<ok|diverged>` + a `SEAM-DIVERGENCE:` line per mismatch. **This is the first task of the phase.**
- [ ] **A1 verification:** confirm `AgentLoop.run_turn` is safe for concurrent per-session calls (or serialize per-session).
- [ ] **A2 probe:** confirm the core's `bash` tool attributes spawned processes per session/call (or add a minimal provenance patch).
- [ ] `packages/halo_agent/tests/subagent/conftest.py` — shared fixtures: a parent session, a child session, a stub core, a killable child process, a bound-port probe.
- [ ] `packages/halo_agent/tests/subagent/test_task_spawn.py` — covers SUB-01 (spawn + typed result).
- [ ] `packages/halo_agent/tests/subagent/test_isolation.py` — covers SUB-01 (worktree isolation).
- [ ] `packages/halo_agent/tests/subagent/test_child_governance.py` — covers SUB-02 (per-call decision + inheritance + no live pointer).
- [ ] `packages/halo_agent/tests/subagent/test_steer_kill_restore.py` — covers SUB-03 (steer/kill/restore).
- [ ] `packages/halo_agent/tests/subagent/test_orphan_cleanup.py` — covers SUB-03 (no orphaned process/port).
- [ ] `packages/halo_agent/tests/subagent/test_concurrency_cap.py` — covers SUB-04 (cap + resizable).
- [ ] `packages/halo_agent/tests/subagent/test_cost_rollup.py` — covers SUB-04 (per-child cost).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live steer of a running child from the product surface | SUB-03 | Product-surface interaction (Desktop/CLI) is Phase 10 scope; Phase 7 verifies the loop-level steer path | Drive a steer via the session API in a dev session; confirm the child folds at the next user boundary |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
