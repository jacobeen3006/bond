---
phase: "1"
slug: "import-provenance-ledger"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-23"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `.planning/phases/01-import-provenance-ledger/01-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `bun test` (built into Bun; zero install) |
| **Config file** | none — no framework install required |
| **Quick run command** | `bun test tools/provenance --timeout 20000` |
| **Full suite command** | `just verify` (= `cli.ts fetch --all` cache rehydration, then `provenance-verify` + `provenance-replay` + `bun test tools/provenance` + `bun test tests/provenance`) |
| **Estimated runtime** | quick ~15s; full ~2min offline (real four-tree replay excluded from the quick loop) |

`vendor-build` is **not** part of the Phase 1 gate (DEC-08): `cargo` and Node 24 are absent from this workstation, and compilation proves nothing about provenance. The first compilation smoke belongs to the phase that first needs a built core.

**Hermetic fixture:** `tests/provenance/fixtures/tiny-upstream/` — a ~10-file git repo built by script, containing an LF file, a CRLF file, a `100755` script, a `120000` symlink, an LFS pointer, a lockfile, a `LICENSE`, a CRLF `.bat`, a Unicode filename, and a hostile-name variant for negative tests.

---

## Sampling Rate

- **After every task commit:** `bun test tools/provenance --timeout 20000`
- **After every plan wave:** `just provenance-verify` + `bun test tests/provenance`
- **Before `/gsd-verify-work`:** `just verify` must be green (verify + replay across all four real trees + both suites)
- **Max feedback latency:** 20 seconds (per-task), 120 seconds (per-wave)

---

## Per-Task Verification Map

Task IDs are assigned by the planner; rows below are keyed by requirement and behavior and must each map to at least one task with an `<automated>` verify.

| Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01 | 1 | IMPT-01 | T-1-01 | Schema-valid `UPSTREAM.json`; recorded digests match ledger files | unit + integration | `bun test tools/provenance/test/upstream-json.test.ts` | ✅ | ⬜ pending |
| 01-01 | 1 | IMPT-01 | T-1-10 | Hostile archive entry refused before extraction | unit | `bun test tools/provenance/test/edge-cases.test.ts` | ✅ | ⬜ pending |
| 01-01 | 1 | IMPT-03 | — | No-trailing-newline patch, empty series, zero-file refusal, path renames | unit | `bun test tools/provenance/test/edge-cases.test.ts` | ✅ | ⬜ pending |
| 01-02 | 2 | IMPT-03 | — | Replay reconstructs the tiny fixture from SHA + patches + renames | integration | `bun test tests/provenance/replay-tiny.test.ts` | ✅ | ⬜ pending |
| 01-02 | 2 | IMPT-06 | T-1-06 | Staged CRLF under `text=auto` fails the fidelity gate | unit (negative) | `bun test tools/provenance/test/fidelity-attributes.test.ts` | ✅ | ⬜ pending |
| 01-02 | 2 | IMPT-06 | T-1-07 | Hostile-path gate: case collision, reserved name, trailing dot, long path | unit (4 negative) | `bun test tools/provenance/test/win-paths.test.ts` | ✅ | ⬜ pending |
| 01-03 | 3 | IMPT-01 | T-1-12 | Every imported tree carries all four ledger documents plus `patches/series` | integration | `bun run tools/provenance/cli.ts ledger --tree hindsight` | ✅ | ⬜ pending |
| 01-05 | 5 | IMPT-02 | — | `LICENSE` byte-identical to the upstream blob | unit | `bun test tools/provenance/test/license-pin.test.ts` | ✅ | ⬜ pending |
| 01-05 | 5 | IMPT-02 | T-1-02 | Rebrand deny-list leaves licence paths byte-identical | integration | `bun test tests/provenance/rebrand-denylist.test.ts` | ✅ | ⬜ pending |
| 01-05 | 5 | IMPT-02 | T-1-14 | No dead glob and no licence-shaped path outside the deny-list | gate | `bun run tools/provenance/cli.ts denylist-check` | ✅ | ⬜ pending |
| 01-06 | 6 | IMPT-06 | T-1-15 | LFS pointer manifest round-trip; `sha256` vs `oid` | unit | `bun test tools/provenance/test/lfs.test.ts` | ✅ | ⬜ pending |
| 01-06 | 6 | IMPT-06 | T-1-16 | Lockfile set present and byte-identical | integration | `bun test tests/provenance/lockfiles.test.ts` | ✅ | ⬜ pending |
| 01-07 | 5 | IMPT-05 | — | `provenance-where <upstream path>` resolves the local path | unit | `bun test tools/provenance/test/paths-resolve.test.ts` | ✅ | ⬜ pending |
| 01-07 | 5 | IMPT-05 | — | Reverse-resolution through a synthetic `RENAMES.json` | unit | `bun test tools/provenance/test/renames-reverse.test.ts` | ✅ | ⬜ pending |
| 01-07 | 5 | IMPT-05 | T-1-05 | End-to-end triage drill: synthetic CVE diff → patch → replay green | integration | `bun test tests/provenance/cve-drill.test.ts` | ✅ | ⬜ pending |
| 01-08 | 5 | IMPT-01 | T-1-19 | No vendored file lacks a patch entry (unrecorded-edit detector) | integration | `bun test tests/provenance/unrecorded-edit.test.ts` | ✅ | ⬜ pending |
| 01-08 | 5 | IMPT-03 | T-1-03 | Working-tree/index drift (modified, added, removed, mode) | integration (4 negative) | `bun test tests/provenance/verify-drift.test.ts` | ✅ | ⬜ pending |
| 01-08 | 5 | IMPT-03 | T-1-18 | Committed-ledger tamper (manifest bytes, row, rename digest) and patch-order drift | integration (4 negative) | `bun test tests/provenance/replay-drift.test.ts` | ✅ | ⬜ pending |
| 01-09 | 7 | IMPT-03 | T-1-04 | Real replay for all four trees | CI job | `just verify` | ✅ | ⬜ pending |
| 01-09 | 7 | IMPT-01, IMPT-06 | T-1-26 | Workspace isolation and no-gitlink rule | integration | `bun test tests/provenance/workspace-isolation.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 is not a separate wave in this phase: `01-01` is a tracer task that creates the tool skeleton and its first suites in the same plan, so every artifact below has a named owner and lands in an execution wave. Nothing is required before Wave 1 beyond the verified host toolchain (git 2.55.0.windows.3, git-lfs 3.7.1, bun 1.4.2, `tar` = bsdtar 3.8.9) plus `just`, which `01-01` Task 3 installs before any `just`-based verify runs.

| Artifact | Owning plan | Wave |
|---|---|---|
| `tools/provenance/{cli,manifest,fetch,stage,replay,paths,ledger}.ts` | 01-01 | 1 |
| `tools/provenance/verify.ts` | 01-08 | 5 |
| `tools/provenance/where.ts` | 01-07 | 5 |
| `tools/provenance/{license,lfs}.ts` | 01-05 / 01-06 | 5 / 6 |
| `provenance/schema/upstream.schema.json` | 01-01 | 1 |
| `provenance/schema/{paths,renames,excludes,watchlist,lfs,denylist}.schema.json` | 01-03 / 01-06 / 01-05 | 3 / 6 / 5 |
| `tests/provenance/fixtures/make-fixture.ts` | 01-02 | 2 |
| `justfile` (`bootstrap`, `provenance-fetch`, `provenance-import`, `provenance-ledger`, `provenance-replay`, `provenance-verify`, `provenance-where`, `provenance-license`, `provenance-lfs`, `provenance-tests`, `verify`) | 01-01 / 01-09 | 1 / 7 |
| `.gitignore`, `.gitattributes`, root `package.json` | 01-01 / 01-02 | 1 / 2 |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A human can triage a real upstream advisory using only the watchlist, path map, and rename map | IMPT-05 | Requires a real advisory and judgment about applicability; the automated drill uses a synthetic CVE | Pick any OSV entry for one upstream, follow the runbook in `provenance/README.md` start to finish, record elapsed time and every dead end |
| Imported tree is genuinely usable by a human (files open, no mojibake, symlinks resolve) | IMPT-06 | Byte equality does not prove a usable checkout on Windows | Clone the repo fresh into a clean directory; open one file per vendored tree; confirm content and line endings |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s for per-task runs
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
