---
phase: "9"
slug: "four-lane-scheduling-lane-slos"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-25"
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Rust `#[tokio::test]` (unit/integration in `pi-scheduler/tests/`) + Bun (`bun.exe test`) for the root harness |
| **Config file** | `vendor/oh-my-pi/Cargo.toml` (workspace) + root `package.json` test script (Phase 8) |
| **Quick run command** | `cargo test -p pi-scheduler` |
| **Full suite command** | `cargo test -p pi-scheduler && bun.exe test tests/` |
| **Estimated runtime** | ~60 seconds (new crate; measure at Wave 0) |

---

## Sampling Rate

- **After every task commit:** Run `cargo test -p pi-scheduler`
- **After every plan wave:** Run `cargo test -p pi-scheduler && bun.exe test tests/`
- **Before `/gsd:verify-work`:** Full suite must be green; the Low-profile soak (SCHD-07) must pass on a 4-worker-thread runtime
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-XX-XX | — | — | SCHD-01 | T-9-01 | A waiter acquires only its own lane's permit; no cross-lane consumption | unit | `cargo test -p pi-scheduler --test lane_capacity` | ❌ W0 | ⬜ pending |
| 09-XX-XX | — | — | SCHD-02 | T-9-02 | L3 50% hard cap; L0/L1 non-preemptible priority | integration | `cargo test -p pi-scheduler --test lane_capacity -- delay_bound` | ❌ W0 | ⬜ pending |
| 09-XX-XX | — | — | SCHD-03 | — | L1 10 s deadline; degraded-signal fallback; no same-turn retry | unit | `cargo test -p pi-scheduler --test deadline` | ❌ W0 | ⬜ pending |
| 09-XX-XX | — | — | SCHD-04 | T-9-03 | Cooperative boundary-aligned cancellation; `status <> 'cancelled'` guards on terminal writes | integration | `cargo test -p pi-scheduler --test preemption` | ❌ W0 | ⬜ pending |
| 09-XX-XX | — | — | SCHD-07 | T-9-04 | Single owner for requeue (Hindsight reconcile sweep); no double-scheduling race | integration (soak) | `cargo test -p pi-scheduler --test soak -- --ignored` (or justfile recipe) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs to be refined by the planner per plan/wave.*

---

## Wave 0 Requirements

- [ ] `vendor/oh-my-pi/crates/pi-scheduler/` — new crate (Cargo.toml + src)
- [ ] `vendor/oh-my-pi/crates/pi-scheduler/tests/lane_capacity.rs` — covers SCHD-01, SCHD-02
- [ ] `vendor/oh-my-pi/crates/pi-scheduler/tests/deadline.rs` — covers SCHD-03
- [ ] `vendor/oh-my-pi/crates/pi-scheduler/tests/preemption.rs` — covers SCHD-04
- [ ] `vendor/oh-my-pi/crates/pi-scheduler/tests/soak.rs` — covers SCHD-07 (Low profile, 4 worker threads)
- [ ] Add `pi-scheduler` to the workspace `Cargo.toml` members

*(The scheduler crate is new; all test files are Wave 0 gaps.)*

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
