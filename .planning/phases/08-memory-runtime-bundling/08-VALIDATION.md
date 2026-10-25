---
phase: "8"
slug: "memory-runtime-bundling"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-25"
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `bun test` (existing) + new integration tests for the supervisor |
| **Config file** | none (bun test discovers `*.test.ts`) |
| **Quick run command** | `bun test packages/sidecars` |
| **Full suite command** | `bun test tools/provenance tests/provenance packages/sidecars` |
| **Estimated runtime** | ~120 seconds (integration tests spawn real sidecars) |

---

## Sampling Rate

- **After every task commit:** Run `bun test packages/sidecars`
- **After every plan wave:** Run `bun test tools/provenance tests/provenance packages/sidecars`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01 T1 | 08-01 | 1 | MEM-01 | T-08-01 | PG binds 127.0.0.1 only; scram-sha-256; password in secret store | integration | `bun test packages/sidecars/tests/pg-boot.test.ts` | ❌ W0 | ⬜ pending |
| 08-01 T2 | 08-01 | 1 | MEM-06 | T-08-05 | `operation_id` idempotency; `FOR UPDATE SKIP LOCKED` claim; one retain lands a vector row | integration | `bun test packages/sidecars/tests/memory-boot.test.ts` | ❌ W0 | ⬜ pending |
| 08-02 T2 | 08-02 | 2 | MEM-02 | T-08-02 | SHA-256-verified pgvector artifact; version mismatch fails startup | integration + CI gate | `bun test packages/sidecars/tests/pgvector-version.test.ts` + `nmake installcheck` | ❌ W0 | ⬜ pending |
| 08-03 T2 | 08-03 | 2 | MEM-03 | T-08-03 | Sidecars keyed (`--api-key`), loopback-only, restart backoff | integration | `bun test packages/sidecars/tests/llama-sidecar.test.ts` | ❌ W0 | ⬜ pending |
| 08-04 T1 | 08-04 | 2 | MEM-04 | T-08-04 | Per-op LLM env config; degraded-mode fallback recorded | integration | `bun test packages/sidecars/tests/hindsight-embed.test.ts` | ❌ W0 | ⬜ pending |
| 08-04 T2 | 08-04 | 2 | MEM-06 | T-08-05 | `operation_id` replay 409; `recover_own_tasks` on poller start | integration | `bun test packages/sidecars/tests/retain-idempotency.test.ts` | ❌ W0 | ⬜ pending |
| 08-05 T1 | 08-05 | 2 | — | T-08-06 | No package installed (T-08-SC); gate fails closed at first non-zero exit | gate | `just sidecars-tests` + `just verify` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/sidecars/tests/pg-boot.test.ts` — covers MEM-01 (initdb + client-conn health + vector query)
- [ ] `packages/sidecars/tests/memory-boot.test.ts` — covers the end-to-end path (one retain lands a vector row via the `operation_id`-keyed `async_operations` queue)
- [ ] `packages/sidecars/tests/pgvector-version.test.ts` — covers MEM-02 (version check + actionable failure)
- [ ] `packages/sidecars/tests/llama-sidecar.test.ts` — covers MEM-03 (start/health/restart/profile flags)
- [ ] `packages/sidecars/tests/hindsight-embed.test.ts` — covers MEM-04 (in-process worker + per-op env + degraded)
- [ ] `packages/sidecars/tests/retain-idempotency.test.ts` — covers MEM-06 (`operation_id` replay + `recover_own_tasks`)
- [ ] A CI job `build-pgvector` (windows-latest, MSVC) running `nmake /F Makefile.win` + `installcheck` and publishing the SHA-256 manifest

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| First-launch boot on a clean Windows machine with no developer tools installed | MEM-01 | Requires a clean-environment machine; CI cannot fully reproduce "no developer tools" | Fresh VM: run installer, launch HALO, confirm cluster init + vector query returns rows |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
