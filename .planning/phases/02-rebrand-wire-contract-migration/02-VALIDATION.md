---
phase: "2"
slug: "rebrand-wire-contract-migration"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-23"
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `bun test` (Phase 1-established harness — `tools/provenance/test`, `tests/provenance` patterns); vendored-Python-side behavior exercised through real `uv run python` subprocesses spawned by the bun suites (handshake, migration, plugin loader) |
| **Config file** | none — commands pin paths (Phase 1 convention) |
| **Quick run command** | `bun test tests/rebrand tools/brand/test tools/rebrand/test` |
| **Full suite command** | `just verify && just rebrand-verify` (chains deny-gate, `brand-gen`/`contract-gen` `--check`, Phase 1 gates, all Phase 2 suites; `bun run tools/provenance/cli.ts replay --all` closes the wave) |
| **Estimated runtime** | quick ~30 s; full chain ~10 min (compiled-CLI surface test adds minutes, cached per build dir) |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/rebrand tools/brand/test tools/rebrand/test` (task-scoped subset while later suites don't exist yet)
- **After every plan wave:** Run `just verify && just rebrand-verify` — Phase 1 gates stay green every wave (RESEARCH Sampling Rate)
- **Before `/gsd:verify-work`:** Full suite + `bun run tools/provenance/cli.ts replay --all` must be green on all four rebranded trees
- **Max feedback latency:** 60 seconds (per-task quick suite); full chain sampled per wave, not per task

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-T1 | 01 | 1 | BRND-02 | T-02-01 | schema-invalid `brand.json` refused before any write | unit + drift | `bun test tools/brand/test/gen.test.ts` | ❌ created by 2-01-T1 | ⬜ pending |
| 2-01-T2 | 01 | 1 | BRND-02 | T-02-02 | collision/identity rules refuse all-or-nothing | unit | `bun test tools/brand/test/gen.test.ts` | ❌ created by 2-01-T2 | ⬜ pending |
| 2-01-T3 | 01 | 1 | BRND-02 | T-02-01 | generated master: ids unique/sorted; wire rules contract-gated | unit + drift | `just brand-gen` | ❌ created by 2-01-T3 | ⬜ pending |
| 2-02-CP | 02 | 2 | BRND-04 | — | naming scheme locked before freeze | checkpoint:decision | — (verdict recorded in SUMMARY) | — | ⬜ pending |
| 2-02-T2 | 02 | 2 | BRND-04 | T-02-32, T-02-33 | validate-before-codegen; canonical hash identical across 3 languages | unit | `bun test tools/contract/test/gen.test.ts` | ❌ created by 2-02-T2 | ⬜ pending |
| 2-02-T3 | 02 | 2 | BRND-04 | T-02-34 | census derived equality — no hardcoded 185/18 | integration + census | `bun test tools/contract/test/census.test.ts` | ❌ created by 2-02-T3 | ⬜ pending |
| 2-03-T1 | 03 | 3 | BRND-05 | T-02-06, T-02-07, T-02-08 | absent-hash = mismatch; no force flag; finding off frame-stream | integration (real stdio) | `bun test tests/rebrand/handshake.test.ts` | ❌ created by 2-03-T1 | ⬜ pending |
| 2-03-T2 | 03 | 3 | BRND-06 | T-02-09 | alias window dies on schedule; once-per-name warning | integration | `bun test tests/rebrand/alias-window.test.ts` | ❌ created by 2-03-T2 | ⬜ pending |
| 2-03-T3 | 03 | 3 | BRND-05 | T-02-06 | patch added lines carry zero brand literals | replay | `bun run tools/provenance/cli.ts replay --tree oh-my-pi` | — (patch artifact) | ⬜ pending |
| 2-04-CP | 04 | 4 | BRND-01 | T-02-SC | [SUS] install only after human verification | checkpoint:human-verify | — (verdict recorded in SUMMARY) | — | ⬜ pending |
| 2-04-T2 | 04 | 4 | BRND-01, BRND-02 | T-02-10, T-02-13 | argv-array spawns; `shouldRewrite` skip honored | unit | `bun test tools/rebrand/test/rewrite.test.ts` | ❌ created by 2-04-T2 | ⬜ pending |
| 2-04-T3 | 04 | 4 | BRND-01, BRND-02 | T-02-11, T-02-12 | record-before-restage; case-collision refusal pre-disk | unit + replay | `bun test tools/rebrand/test/apply.test.ts` | ❌ created by 2-04-T3 | ⬜ pending |
| 2-05-CP | 05 | 5 | BRND-01 | T-02-15 | boundary allow-list human sign-off BEFORE any rewrite | checkpoint:human-verify | — (verdict recorded in SUMMARY) | — | ⬜ pending |
| 2-05-T2 | 05 | 5 | BRND-01, BRND-02 | T-02-14, T-02-15, T-02-16 | env.ts-at-SHA confirmation; zero protected hunks | integration | `bun run tools/provenance/cli.ts replay --all` | — (run evidence) | ⬜ pending |
| 2-05-T3 | 05 | 5 | BRND-01, BRND-02 | T-02-14, T-02-15 | license SHAs unchanged; boundary literals survive | whole-repo assertions | `bun test tools/rebrand/test/apply-real.test.ts` | ❌ created by 2-05-T3 | ⬜ pending |
| 2-06-T1 | 06 | 6 | BRND-03 | — | restrictive DACL/0700 home; generated probe order | unit (live machine) | `bun test tools/rebrand/test/legacy-env.test.ts` | ❌ created by 2-06-T1 | ⬜ pending |
| 2-06-T2 | 06 | 6 | BRND-03 | T-02-18, T-02-19, T-02-20 | copy-only; secrets byte-exact never-logged; refusal not merge | integration fixtures | `bun test tools/rebrand/test/migrate.test.ts` | ❌ created by 2-06-T2 | ⬜ pending |
| 2-06-T3 | 06 | 6 | BRND-03 | T-02-21 | exactly one loud `MIGRATE ...` line per branch | integration | `uv run python -c "from halo_agent.migrate import startup_migrate; startup_migrate()"` | — (module behavior) | ⬜ pending |
| 2-06-T4 | 06 | 6 | BRND-03 | T-02-35 | legacy var read only when twin unset; names-only deprecation; `HALO_*`-only writes | unit both languages | `bun test tools/rebrand/test/legacy-env.test.ts` | ❌ extended by 2-06-T4 | ⬜ pending |
| 2-07-T1 | 07 | 7 | BRND-08 | T-02-24 | loader patches reference generated constants only | replay | `bun run tools/provenance/cli.ts replay --tree hermes-agent` | — (patch artifacts) | ⬜ pending |
| 2-07-T2 | 07 | 7 | BRND-08 | T-02-23 | id-bearing rules substitute tokens, never move membership | replay | `bun run tools/provenance/cli.ts replay --tree gsd-omp` | — (rule artifacts) | ⬜ pending |
| 2-07-T3 | 07 | 7 | BRND-08 | T-02-22, T-02-23 | never silent-disable; deny-listed (both-lists) stays denied | integration (real loader) | `bun test tests/rebrand/plugin-survival.test.ts` | ❌ created by 2-07-T3 | ⬜ pending |
| 2-08-T1 | 08 | 8 | BRND-07 | T-02-25, T-02-26, T-02-27, T-02-36 | generated token table incl. `context` drives behavior; planted tokens bite | integration | `bun test tools/rebrand/test/deny-gate.test.ts` | ❌ created by 2-08-T1 | ⬜ pending |
| 2-08-T2 | 08 | 8 | BRND-07, BRND-08 | T-02-25 | CI has zero soft-fail modifiers | workflow lint | `just rebrand-verify` | ❌ created by 2-08-T2 | ⬜ pending |
| 2-08-T3 | 08 | 8 | BRND-07 | T-02-25 | gate read-only, deterministic, allow-list reviewed | hardening suite | `bun test tools/rebrand/test/deny-gate.test.ts` | ❌ extended by 2-08-T3 | ⬜ pending |
| 2-09-CP | 09 | 9 | BRND-02 | T-02-29 | Rust verification locus recorded (no silent skip) | checkpoint:decision | — (verdict recorded in SUMMARY) | — | ⬜ pending |
| 2-09-T1 | 09 | 9 | BRND-01 | T-02-28 | compiled binary token-clean; `--help` provably read-only | integration (compiled exe) | `bun test tools/rebrand/test/cli-surface.test.ts` | ❌ created by 2-09-T1 | ⬜ pending |
| 2-09-T2 | 09 | 9 | BRND-02 | T-02-29, T-02-30 | `cargo check --workspace` exercised, never skipped silently | build | `just rebrand-rust` | — (chain evidence) | ⬜ pending |
| 2-09-T3 | 09 | 9 | BRND-01..BRND-08 | — | one `SC2-<n> PROVEN` receipt line per success criterion | integration | `bun test tools/rebrand/test/cli-surface.test.ts -t phase` | ❌ extended by 2-09-T3 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No separate Wave 0: the `bun test` harness ships with Phase 1 (`tools/provenance/test`, `tests/provenance` patterns), and every Phase 2 suite/fixture builder is created by the TDD task that owns it (File Exists column above). RESEARCH's Wave-0 gap list is fully owned by plan tasks: `tests/rebrand/` suites → 02-03/02-06/02-07/02-09; migration fixture homes → `tests/rebrand/migrate-fixture.ts` + `plugin-fixtures.ts` (02-06/02-07); `contracts/schema/rpc-wire.schema.json` → 02-02; just recipes + `Casey.Just` prerequisite → 02-01/02-04 (Phase 1 pattern).

---

## Manual-Only Verifications

All Phase 2 behaviors have automated verification (map above). The human gates in plans 02-02/02-04/02-05/02-09 (naming-scheme decision, [SUS] install verification, boundary allow-list sign-off, Rust-locus decision) are decision/sign-off checkpoints, not behavior tests — their verdicts are recorded in each plan's SUMMARY and consumed by the following task's precondition.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60 s (per-task quick suite); full chain sampled per wave
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — `status`, `nyquist_compliant`, and `wave_0_complete` are execution lifecycle fields flipped by validate-phase §6 / the feedback loop, not template placeholders.
