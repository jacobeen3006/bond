# Walking Skeleton — HALO

**Phase:** 1 — Import & Provenance Ledger
**Generated:** 2026-10-23

## Capability Proven End-to-End

> One command imports one upstream subtree at a pinned SHA, writes its ledger, and reproduces that subtree byte-for-byte from `(repo, SHA) + patches/series + RENAMES.json` into a fresh directory and compares equal.

The slice runs: `upstream-cache` (bare, `--filter=blob:none`) → `git archive --format=tar --output=<tmp> <SHA>` → `tar -x` (bsdtar 3.8.9, invoked as `tar`) → staging under `* -text -filter` → `MANIFEST.upstream.tsv` + `MANIFEST.vendored.tsv` + `UPSTREAM.json` → `provenance-replay` → byte equality. It is proven on `gsd-omp` (smallest tree) in plan 01-01 and is the same code path every later tree uses.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Monorepo layout | `vendor/<name>/` (quarantined upstream trees), `tools/provenance/` (the only writer of ledgers), `provenance/` (schemas, watchlist, runbook), `tests/provenance/` | Matches `.planning/research/ARCHITECTURE.md` §7; the ledger travels inside the tree it describes |
| Import primitive | `git archive --format=tar --output=<tmp> <sha>` from a bare `--filter=blob:none` cache, extracted with `tar` (bsdtar 3.8.9 — the command name `bsdtar` does not exist on this machine) | `git subtree add --squash` keeps a live upstream relationship and a merge parent, which PROJECT.md forbids; checkout applies smudge filters (P5) |
| Staging protection | generated `.git/info/attributes` = `* -text -filter -ident -working-tree-encoding`, plus a root `.gitattributes` with `vendor/** -text -filter -ident -working-tree-encoding` and `*.patch -text` | System `core.autocrlf=true`; two upstreams ship no `.gitattributes`, so `* text=auto` would rewrite their bytes (P1/P2) |
| Ledger format | Per-file TSV (`#halo-manifest v1`, `mode<TAB>bloboid<TAB>sha256<TAB>path`, LF, byte-sorted) **plus** the JSON ledgers. Membership is one rule: neither manifest contains a `provenance/` row (`isLedgerPath`), so the two are directly comparable | A tree digest cannot express "bytes equal, mode differs", and cannot distinguish "HALO edited this" from "import corrupted". Excluding the ledger from both sides is what makes "empty series ⇒ manifests equal" a byte comparison rather than a filtered one |
| Patch tooling | quilt-style `patches/series` applied by `git apply --check` then `git apply` (no fuzz, never `--unsafe-paths`) | Windows-native; quilt itself is POSIX-only; `git am` would build upstream commits HALO does not want |
| Toolchain | Bun/TS, zero external dependencies (`node:fs`, `node:crypto`, `child_process`) | Bun 1.4.2 is installed and `bun test` is built in, so the first verification runs with no install step |
| Build orchestration | One root `justfile`, PowerShell shell on Windows; `just` installed by `just bootstrap` (winget) | `just` defaults to `sh` on Windows and every recipe would die without `[windows] set shell` |
| Workspace isolation | No root Cargo workspace, no root uv workspace, root Bun workspace = `["apps/*","packages/*"]` — never `vendor/**` | Cargo parent-directory capture and uv's single `requires-python` would silently re-resolve vendored trees |
| Notice convention | Per-subtree verbatim `LICENSE` + `UPSTREAM.json.license` digests + a machine-readable rebrand deny-list. Plain `THIRD_PARTY_NOTICES.txt` assembly stays in Phase 12 (IMPT-04) | REUSE 3.3 needs a SUS-flagged tool and importer changes for no Phase-1 gain; MIT's obligation is the verbatim notice, which Phase 1 must pin |
| Replay model | Network-backed replay (bare cache) + offline manifest-only `provenance-verify` on every commit. Replay = archive → `patches/series` in order → `RENAMES.json` path rules in rule-id order → manifest comparison | Committed snapshots cost repo weight for a guarantee `verify` already gives offline; see DEC-02. The rename step exists from day one so Phase 2 populates a mechanism that is already exercised, not a new one |

## Decisions Taken (research "What the Planner Must Decide")

| ID | Decision | Why | Reversible? |
|---|---|---|---|
| DEC-01 | Import all four trees **whole**. `EXCLUDES.json` starts empty; a path may be excluded only for a Windows-hostile name (I6 gate) or after a measured size review, and every exclude carries `reason` + `approved_by`. | Path identity is the CVE index; renaming or dropping a path destroys it. Excluding later is reversible forward, including is not. | costly |
| DEC-02 | Replay is **network-backed** (bare `--filter=blob:none` cache, CI-cached); `provenance-verify` is the **offline** gate on every commit. No committed pristine snapshots (option B) in Phase 1. | Option B's repo cost is unmeasured; D gives offline drift detection today. If a SHA is deleted upstream, snapshots can be added additively later. | costly |
| DEC-03 | Manifest granularity is **full per-file TSV** (both upstream and vendored). | The only artifact that can localize drift to a path and a mode. | reversible |
| DEC-04 | **No workspace unification** in Phase 1: four isolated build roots. | Forced by documented Cargo capture, uv `requires-python` intersection, and Bun root-authoritative workspaces. | reversible |
| DEC-05 | Notice convention is **plain text assembled in Phase 12**; Phase 1 ships verbatim licences + digests + deny-list. | IMPT-04 is Phase 12; Phase 1's obligation is that the covered bytes cannot drift. | reversible |
| DEC-06 | `tools/provenance` is **Bun/TypeScript, zero deps**. | Installed, zero-install test runner, mandatory for the build anyway. | costly |
| DEC-07 | **Text patches only.** A binary file is never patched; it is replaced whole through `overrides/` declared in `PATHS.json`. LFS-tracked paths are never edited. | `git apply --binary` on a 100 MB wasm is unreviewable and breaks the byte-identity story. | reversible |
| DEC-08 | `vendor-build` is **not** in the Phase 1 gate. Phase 1's gate is `just verify` = `provenance-verify` + `provenance-replay` + unit + integration suites. | `cargo` and Node 24 are absent; a red build would block the phase without proving anything about provenance. Compilation smoke belongs to the first phase that needs a built core. | reversible |
| DEC-09 | `provenance-replay` runs (a) locally from the root `justfile` and (b) as a committed GitHub Actions workflow with the same command. | IMPT-03 names a CI job; the workflow is the job definition. Activation waits for a remote; the local command is the identical gate. | reversible |
| DEC-10 | The synthetic-CVE drill ships as a **permanent fixture-backed test**. | It is the only guard that IMPT-05 stays true after Phase 1. | reversible |
| DEC-11 | Bootstrap installs **`just` only**. `cargo`, Rust, and Node 24 are not installed here. | No Phase 1 verify command needs them; DEC-08 keeps compilation out of the gate. | reversible |

## Edge Resolution (14 applicable edges, 0 auto-resolved)

| Req | Edge | Resolution | Owner plan |
|---|---|---|---|
| IMPT-01 | adjacency | **explicit** — `import.date` and `commit_committed_at` are separate fields; when the two dates are identical both are still emitted, and neither is derived from the other. | 01-01 |
| IMPT-01 | empty | **explicit** — a subtree with no HALO-local edits still ships `patches/series` (comment-only) and `EXCLUDES.json` with `rules: []`; both manifests must then be equal modulo `provenance/`. | 01-01 |
| IMPT-01 | ordering | **explicit** — manifest lines are sorted by raw path bytes (memcmp) on POSIX separators; locale collation (`localeCompare`) is a failure. | 01-01 |
| IMPT-02 | adjacency | **explicit** — every path matching `**/LICENSE*`, `**/NOTICE*`, `**/COPYRIGHT*`, `**/COPYING*`, or a third-party notice in either spelling (`**/THIRD_PARTY*`, `**/THIRD-PARTY*` — oh-my-pi ships `THIRD-PARTY-NOTICES.txt`) is pinned by blob OID + SHA-256, not just the root `LICENSE`. | 01-05 |
| IMPT-02 | empty | **explicit** — an import whose tree contains no licence file fails before `UPSTREAM.json` is written (exit 2, message `license: no LICENSE file`); an empty `license.files` is a schema error. | 01-05 |
| IMPT-02 | encoding | **explicit** — licence identity is the raw-byte SHA-256: no newline normalization, no BOM stripping, no Unicode normalization. A CRLF→LF conversion fails even when `diff --ignore-cr-at-eol` would pass. | 01-05 |
| IMPT-02 | ordering | **explicit** — `license.files` is ordered by path bytes; `copyright_notice_count` is computed with a case-insensitive `copyright` match over raw bytes and recorded at import. | 01-05 |
| IMPT-03 | adjacency | **explicit** — a patch touching a file's final line without a trailing newline applies and replays byte-identically; the series entry keeps the `\ No newline at end of file` marker. | 01-01 |
| IMPT-03 | empty | **explicit** — with an empty series, replay output equals `MANIFEST.upstream.tsv` exactly; an empty vendored tree (zero files) is exit 1, never a pass. | 01-01 |
| IMPT-03 | ordering | **explicit** — replay applies `series` top-to-bottom and never sorts it; a reordered series that still applies cleanly is still drift because the recorded vendored manifest no longer matches. | 01-08 |
| IMPT-05 | adjacency | **explicit** — path resolution is `exceptions ?? longest matching prefix ?? file rule ?? identity`; a path matched by both a prefix rule and a file exception resolves by the exception and `provenance-where` prints exactly one local path. | 01-07 |
| IMPT-05 | empty | **explicit** — an unknown path or symbol resolves to itself with `watch: none` and exit 0 when present in a manifest, and exit 3 when absent from every manifest and tree. | 01-07 |
| IMPT-05 | ordering | **explicit** — multiple matching watch entries print ordered by descending upstream-path length, then ascending watch id (byte order). | 01-07 |
| IMPT-06 | unclassified | **explicit (reconciliation, not assumption)** — IMPT-06 does not classify under the edge taxonomy, so the probe contributes no edges; instead the lockfile set is reconciled against the imported trees by an executed check. Observed at the imported mains: `Cargo.lock`, `bun.lock`, `flake.lock`, `MODULE.bazel.lock` (oh-my-pi); `flake.lock`, `uv.lock` (hermes-agent); `deno.lock`, `uv.lock` (hindsight); gsd-omp's set is whatever its manifest shows. The detector recognises npm/Cargo/uv/deno/Nix/Bazel forms, any additional lockfile-shaped file is added to the ledger rather than ignored, and the discovered basenames are printed per tree on every run. | 01-06 |

## Prohibitions (must remain false; descriptor-less claims)

These are stated as bare assertions so a verifier treats them as unverified claims to test, not as requirements to assume. Each owning plan carries the applicable ones in its `must_haves.prohibitions` block (never in `must_haves.truths`, where the verifier would read them as things that must be true), and names the executable test that would catch a violation.

| ID | Claim | Requirement | Owner |
|---|---|---|---|
| P1 | Upstream blob bytes are rewritten during import or staging — the only sanctioned divergence is a patch in `patches/series`. | IMPT-01, IMPT-06 | 01-01, 01-08 |
| P2 | A licence-ish path is modified by any HALO tool, including one acting in the name of rebranding. | IMPT-02 | 01-05 |
| P3 | A vendored tree acquires a `.git` directory, a gitlink (mode `160000`), a submodule, or a remote. | IMPT-01 | 01-01, 01-09 |
| P4 | An upstream fix lands in `vendor/**` without a patch file in `series` and a regenerated `MANIFEST.vendored.tsv`. | IMPT-03, IMPT-05 | 01-07, 01-08 |
| P5 | `vendor/**` is absorbed into a root Bun, Cargo, or uv workspace. | IMPT-01 | 01-04, 01-09 |
| P6 | An excluded path is dropped silently — every exclude carries a reason and is asserted absent by replay. | IMPT-01, IMPT-05 | 01-03, 01-07 |

## Stack Touched in Phase 1

- [x] Project scaffold — root `justfile`, `.gitignore`, `.gitattributes`, `package.json`, `bun test` (no framework install)
- [x] Data layer — the ledger (JSON + TSV) written by `tools/provenance`, validated by JSON Schema, read back by replay
- [x] Real write AND real read — import writes; `provenance-replay` / `provenance-verify` / `provenance-where` read
- [x] User-facing surface — three documented commands: `just provenance-replay`, `just provenance-verify`, `just provenance-where <path|symbol>`
- [x] CI — `.github/workflows/provenance.yml` running the same command as the local gate

## Out of Scope (Deferred to Later Slices)

- Rebranding any vendored byte; `RENAMES.json` ships with an empty `rules` array and `phase_populated: 2` (Phase 2).
- Executing the rebrand rewriter, and running the CI job. Phase 1 ships the pinned licence bytes, the deny-list contract, the sensitivity test proving the contract bites, and the workflow definition; the rewriter that must obey the contract is Phase 2 (DEC-05) and the workflow stays inert until a remote exists (DEC-09). ROADMAP SC#3 is therefore discharged as pinned bytes plus an enforced contract, and the CI half of SC#2 as a committed job definition — neither is claimed as an executed run.
- `THIRD_PARTY_NOTICES.txt` assembly, installer embedding, About surface (Phase 12, IMPT-04).
- Compiling any vendored tree (`vendor-build`), installing Node 24 or Rust (DEC-08, DEC-11).
- Committed pristine snapshots / air-gapped replay (DEC-02).
- Watching upstream repositories, submodules, auto-update (PROJECT.md Out of Scope).
- Binary patching and `overrides/` population (DEC-07 defines the rule; no override exists yet).

## Subsequent Slice Plan

- Phase 2 adds the rebrand slice on top of this skeleton: `brand.json` → generated identifiers → `RENAMES.json` populated → deny-list enforced by the rewriter. No Phase-1 decision changes.
- Phase 5 adds the first compilation slice (`vendor-build`) once the core must be built; the ledger is already the input.
- Phase 12 adds installer notice assembly over the Phase-1 licence ledger.
