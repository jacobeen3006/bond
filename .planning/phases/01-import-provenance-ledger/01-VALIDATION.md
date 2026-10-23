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
| **Full suite command** | `just verify` (= `provenance-replay` + `bun test tools/provenance` + `bun test tests/provenance` + `vendor-build`) |
| **Estimated runtime** | quick ~15s; full ~2min offline (real four-tree replay excluded from the quick loop) |

**Hermetic fixture:** `tests/provenance/fixtures/tiny-upstream/` — a ~10-file git repo built by script, containing an LF file, a CRLF file, a `100755` script, a `120000` symlink, an LFS pointer, a lockfile, a `LICENSE`, a CRLF `.bat`, a Unicode filename, and a hostile-name variant for negative tests.

---

## Sampling Rate

- **After every task commit:** `bun test tools/provenance --timeout 20000`
- **After every plan wave:** `just provenance-verify` + `bun test tests/provenance`
- **Before `/gsd-verify-work`:** `just provenance-replay` against all four real trees and `just vendor-build` must both be green
- **Max feedback latency:** 20 seconds (per-task), 120 seconds (per-wave)

---

## Per-Task Verification Map

Task IDs are assigned by the planner; rows below are keyed by requirement and behavior and must each map to at least one task with an `<automated>` verify.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner) | — | 1 | IMPT-01 | T-1-01 | Schema-valid `UPSTREAM.json`; recorded digests match ledger files | unit + integration | `bun test tools/provenance/test/upstream-json.test.ts` | ❌ W0 | ⬜ pending |
| (planner) | — | 1 | IMPT-01 | — | No vendored file lacks a patch entry (unrecorded-edit detector) | integration | `bun test tests/provenance/unrecorded-edit.test.ts` | ❌ W0 | ⬜ pending |
| (planner) | — | 1 | IMPT-02 | — | `LICENSE` byte-identical to the upstream blob | unit | `bun test tools/provenance/test/license-pin.test.ts` | ❌ W0 | ⬜ pending |
| (planner) | — | 1 | IMPT-02 | T-1-02 | Rebrand deny-list leaves licence paths byte-identical | integration | `bun test tests/provenance/rebrand-denylist.test.ts` | ❌ W0 | ⬜ pending |
| (planner) | — | 2 | IMPT-03 | — | Replay reconstructs the tiny fixture from SHA + patches | integration | `bun test tests/provenance/replay-tiny.test.ts` | ❌ W0 | ⬜ pending |
| (planner) | — | 2 | IMPT-03 | T-1-03 | Replay fails on modified byte, added file, removed file, changed mode, broken patch order | integration (5 negative cases) | `bun test tests/provenance/replay-drift.test.ts` | ❌ W0 | ⬜ pending |
| (planner) | — | 2 | IMPT-03 | T-1-04 | Real replay for all four trees | CI job | `just provenance-replay` | ❌ W0 | ⬜ pending |
| (planner) | — | 2 | IMPT-05 | — | `provenance-where <upstream path>` resolves the local path | unit | `bun test tools/provenance/test/paths-resolve.test.ts` | ❌ W0 | ⬜ pending |
| (planner) | — | 2 | IMPT-05 | — | Reverse-resolution through a synthetic `RENAMES.json` | unit | `bun test tools/provenance/test/renames-reverse.test.ts` | ❌ W0 | ⬜ pending |
| (planner) | — | 2 | IMPT-05 | T-1-05 | End-to-end triage drill: synthetic CVE diff → patch → replay green | integration | `bun test tests/provenance/cve-drill.test.ts` | ❌ W0 | ⬜ pending |
| (planner) | — | 1 | IMPT-06 | T-1-06 | Staged CRLF under `text=auto` fails the fidelity gate | unit (negative) | `bun test tools/provenance/test/fidelity-attributes.test.ts` | ❌ W0 | ⬜ pending |
| (planner) | — | 1 | IMPT-06 | — | LFS pointer manifest round-trip; `sha256` vs `oid` | unit | `bun test tools/provenance/test/lfs.test.ts` | ❌ W0 | ⬜ pending |
| (planner) | — | 1 | IMPT-06 | — | Lockfile set present and byte-identical | integration | `bun test tests/provenance/lockfiles.test.ts` | ❌ W0 | ⬜ pending |
| (planner) | — | 1 | IMPT-06 | T-1-07 | Hostile-path gate: case collision, reserved name, trailing dot, long path | unit (4 negative) | `bun test tools/provenance/test/win-paths.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tools/provenance/{cli,manifest,fetch,stage,replay,verify,where}.ts` — the tool (zero external deps: `node:fs`, `node:crypto`, `child_process`)
- [ ] `tools/provenance/test/*.test.ts` — 8 unit suites listed above
- [ ] `tests/provenance/fixtures/make-fixture.ts` — builds the hermetic tiny-upstream repo, including a hostile-path variant
- [ ] `tests/provenance/*.test.ts` — 7 integration suites listed above
- [ ] `provenance/schema/*.schema.json` — one JSON schema per ledger file
- [ ] `justfile` — `bootstrap`, `provenance-fetch`, `provenance-verify`, `provenance-replay`, `vendor-build`, `verify`
- [ ] `.gitignore`, `.gitattributes`, root `package.json`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A human can triage a real upstream advisory using only the watchlist, path map, and rename map | IMPT-05 | Requires a real advisory and judgment about applicability; the automated drill uses a synthetic CVE | Pick any OSV entry for one upstream, follow `WATCHLIST.md` runbook start to finish, record elapsed time and every dead end |
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
