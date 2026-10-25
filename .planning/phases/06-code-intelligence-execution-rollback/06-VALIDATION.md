---
phase: "06"
slug: "code-intelligence-execution-rollback"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-25"
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.1.1 + pytest-asyncio 1.4.0 |
| **Config file** | `packages/halo_agent/pyproject.toml` (Wave 0) |
| **Quick run command** | `uv run --project packages/halo_agent pytest tests/ -x -q` |
| **Full suite command** | `uv run --project packages/halo_agent pytest tests/ -q` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run --project packages/halo_agent pytest tests/ -x -q`
- **After every plan wave:** Run `uv run --project packages/halo_agent pytest tests/ -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | CODE-01 | T-06-01 / — | LSP calls gated; deny-by-default | integration | `uv run --project packages/halo_agent pytest tests/tools/test_lsp_gated.py -x` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | CODE-02 | T-06-02 / — | DAP calls gated; deny-by-default | integration | `uv run --project packages/halo_agent pytest tests/tools/test_dap_gated.py -x` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | CODE-03 | T-06-03 / — | Preview before accept; stale detection | integration | `uv run --project packages/halo_agent pytest tests/tools/test_ast_preview.py -x` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 3 | CODE-04 | T-06-04 / — | No tool-registry re-entry; no host-control APIs | unit + integration | `uv run --project packages/halo_agent pytest tests/tools/test_eval_sandbox.py -x` | ❌ W0 | ⬜ pending |
| 06-04-01 | 04 | 4 | CODE-05 | T-06-05 / — | Browser/web surfaces gated | integration | `uv run --project packages/halo_agent pytest tests/tools/test_browser_web.py -x` | ❌ W0 | ⬜ pending |
| 06-05-01 | 05 | 5 | CODE-06 | T-06-06 / — | GUI/TTS/voice gated | integration | `uv run --project packages/halo_agent pytest tests/tools/test_gui_tts.py -x` | ❌ W0 | ⬜ pending |
| 06-06-01 | 06 | 6 | LOOP-07 | T-06-07 / — | Exact file list on restore; no wrong-turn restore | integration | `uv run --project packages/halo_agent pytest tests/tools/test_shadow_git.py -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/halo_agent/tests/tools/test_lsp_gated.py` — covers CODE-01 (14 LSP actions)
- [ ] `packages/halo_agent/tests/tools/test_dap_gated.py` — covers CODE-02 (28 DAP actions)
- [ ] `packages/halo_agent/tests/tools/test_ast_preview.py` — covers CODE-03 (preview-accept + stale detection)
- [ ] `packages/halo_agent/tests/tools/test_eval_sandbox.py` — covers CODE-04 (sandbox isolation + no re-entry)
- [ ] `packages/halo_agent/tests/tools/test_browser_web.py` — covers CODE-05 (browser/web-search/URL/PDF)
- [ ] `packages/halo_agent/tests/tools/test_gui_tts.py` — covers CODE-06 (desktop GUI + TTS/voice)
- [ ] `packages/halo_agent/tests/tools/test_shadow_git.py` — covers LOOP-07 (turn checkpoint + exact file list)
- [ ] `packages/halo_agent/tests/conftest.py` — shared fixtures (workspace-keyed `ToolSession`, `omp` backend mock, shadow-git temp repo)
- [ ] Framework install: `uv run --project packages/halo_agent pytest --version` — if none detected

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live LSP rename with workspace edits in a real editor session | CODE-01 | Requires a running language server + editor | Start a session, trigger rename, inspect workspace edits |
| Live DAP breakpoint hit in a real debug session | CODE-02 | Requires a running debug adapter | Attach to a process, set breakpoint, step |
| Desktop GUI automation on the user's desktop | CODE-06 | Requires a live desktop session | Drive a window through the gated tool |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
