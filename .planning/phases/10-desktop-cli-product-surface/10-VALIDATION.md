---
phase: "10"
slug: "desktop-cli-product-surface"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-25"
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `10-RESEARCH.md` § Validation Architecture. Task-level rows are
> finalized during planning; the requirement-level map below is the seed.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.1.1 + pytest-asyncio 1.4.0 (daemon); Bun test / Vitest (Desktop/CLI); cargo test (scheduler, Phase 9) |
| **Config file** | `packages/halo_agent/pyproject.toml` (daemon); `apps/desktop/package.json` (Desktop) |
| **Quick run command** | `uv run pytest tests/transport tests/policy -x` (daemon); `bun test` (Desktop/CLI) |
| **Full suite command** | `uv run pytest` + `bun test` + `cargo test -p pi-scheduler` |
| **Estimated runtime** | ~120 seconds (full); ~30 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/transport tests/policy -x` (daemon) + `bun test` (touched surface)
- **After every plan wave:** Run `uv run pytest` + `bun test` + `cargo test -p pi-scheduler`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (assigned in planning) | — | 0 | UI-01 | — | Desktop renders chat, sessions, diff, terminal, memory, lanes | integration (E2E) | `bun test apps/desktop` | ❌ W0 | ⬜ pending |
| (assigned in planning) | — | 0 | UI-02 | — | CLI attaches to the same daemon + store | integration | `uv run pytest tests/transport::test_cli_attaches` | ❌ W0 | ⬜ pending |
| (assigned in planning) | — | 0 | UI-03 | T-10-01 | Renderer holds no token; IPC sender-validated; renderer fetch to daemon port fails | unit + integration | `bun test apps/desktop/electron/ipc` | ❌ W0 | ⬜ pending |
| (assigned in planning) | — | 0 | UI-04 | — | CLI-started session continues in Desktop without divergence | integration | `uv run pytest tests/transport::test_session_continuity` | ❌ W0 | ⬜ pending |
| (assigned in planning) | — | 0 | UI-05 | T-10-02 | Approval round-trips from a running turn to Desktop and back (timeout ⇒ deny) | integration | `uv run pytest tests/policy::test_approval_roundtrip` | ❌ W0 | ⬜ pending |
| (assigned in planning) | — | 0 | MEM-05 | — | Memory availability never blocks the first chat turn; degraded visible | integration | `uv run pytest tests/memory::test_degraded_visible` | ❌ W0 | ⬜ pending |
| (assigned in planning) | — | 0 | MEM-07 | — | Browse/search/prune/export + staleness/conflicts/health in one page | integration | `bun test apps/desktop/src/memory` | ❌ W0 | ⬜ pending |
| (assigned in planning) | — | 0 | MEM-08 | T-10-03 | Prune archives (never deletes); typed confirmation required | unit + integration | `uv run pytest tests/memory::test_prune_archives` | ❌ W0 | ⬜ pending |
| (assigned in planning) | — | 0 | SCHD-05 | — | Memory Model default + overrides + save-time validation + drain-then-restart | integration | `uv run pytest tests/sidecars::test_model_drain_restart` | ❌ W0 | ⬜ pending |
| (assigned in planning) | — | 0 | SCHD-06 | — | Lane depths, wait histograms, preemptions, backlog visible (read-only) | integration | `bun test apps/desktop/src/lanes` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/transport/` — daemon WS server + client attach (UI-02, UI-04)
- [ ] `tests/policy/test_approval_roundtrip.py` — UI-05
- [ ] `tests/memory/` — MEM-05/07/08 (Hindsight endpoint proxy + prune)
- [ ] `tests/sidecars/test_model_drain_restart.py` — SCHD-05
- [ ] `apps/desktop` E2E harness (Playwright/Electron) — UI-01, MEM-07, SCHD-06
- [ ] `websockets` install + verify (the one new package)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Final visual confirmation of the Desktop surface (chat, memory page, lanes panel) | UI-01, MEM-07, SCHD-06 | Automated E2E covers rendering; a human confirms the surface is usable and matches the success criteria | Launch the Desktop app; walk each success criterion 1–5; confirm no divergence between CLI and Desktop sessions |

*All other phase behaviors have automated verification (E2E harness + integration tests in Wave 0).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
