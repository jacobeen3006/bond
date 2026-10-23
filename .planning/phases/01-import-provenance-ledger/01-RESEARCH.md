# Phase 1: Import & Provenance Ledger - Research

**Researched:** 2026-10-23
**Domain:** Squashed multi-repo import into one Windows monorepo, byte-exact provenance ledger, deterministic replay, MIT notice retention, cross-language build isolation
**Overall confidence:** HIGH on the mechanics (all commands exercised or read from primary docs); MEDIUM on sizing/scope decisions, which cannot be settled until the four trees are actually fetched.

> **No `CONTEXT.md` exists for this phase.** Nothing below is a user decision; everything is either a constraint inherited from `.planning/PROJECT.md` / `ROADMAP.md`, a verified fact, or an explicit recommendation for the planner to accept or override. The final section lists the decisions that are genuinely open.

---

## Summary

HALO's Phase 1 has one non-recoverable property: **the ledger must be produced by the import tool, never by hand, at the moment of import.** A squash destroys the three indexes that make upstream work addressable — path identity, symbol identity, and string identity — and no later phase can reconstruct them. The research therefore converged on a design where the importer emits a *per-file manifest of upstream blob OIDs plus SHA-256 digests*, every HALO-local edit must exist as an entry in a quilt-style `patches/series`, and a single staging function is reused by both import and replay so that "reproduce from `(repo, SHA) + renames + patches`" and "reproduce the original import" are literally the same code path.

Three findings changed the design from the obvious approach:

1. **`git subtree add --squash` is the wrong primitive here.** It preserves the upstream relationship (the docs describe `merge`/`pull`/`split` as continuing operations), leaves upstream objects and a second parent in `.git`, and produces merge semantics that are meaningless once the tree is rebranded. `git archive <sha> | tar -x` writes blob bytes (its attribute surface is limited to `export-ignore`/`export-subst`) and leaves no upstream link.
2. **The Windows Git installation on this workstation has `core.autocrlf=true` set at system level** (`C:/Program Files/Git/etc/gitconfig`), and two of the four upstreams ship **no `.gitattributes` at all**. A monorepo-wide `* text=auto` would silently rewrite committed bytes. The import must stage through a generated `.git/info/attributes` containing `* -text -filter`, which the gitattributes docs place at the highest precedence.
3. **The three large upstreams already declare their own workspace roots** (Bun object-form workspaces for oh-my-pi, a Cargo workspace for oh-my-pi, a `[tool.uv.workspace]` for hindsight). Root-level workspace unification in Phase 1 would either fail or silently change their dependency resolution; per-tree isolation plus a per-tree build recipe is the only safe Phase 1 shape.

**Primary recommendation:** Import by `git archive` from a bare `--filter=blob:none` cache into `vendor/<name>/`, stage through a generated `.git/info/attributes`, verify with a three-way blob-OID equality check (`index == raw hash == upstream ls-tree`), and make `just provenance-replay` reconstruct each tree from the pristine SHA plus `patches/series` and compare against two committed manifests (`MANIFEST.upstream.tsv`, `MANIFEST.vendored.tsv`).

---

## Phase Constraints (inherited — no CONTEXT.md)

Copied verbatim from `.planning/PROJECT.md`:

- **License**: "all four upstreams are MIT (verified: oh-my-pi, hermes-agent, hindsight, gsd-omp). Rebranding and redistribution are permitted, but each vendored subtree must retain its original copyright notice and permission text, plus a provenance record (repo, commit SHA, import date)."
- **Upstream cutoff**: "after import there is no upstream sync. Provider additions, security fixes, and RPC growth that land upstream will not reach HALO automatically; the provenance manifest must make locating such changes tractable."
- **Platform**: "Windows-first (win32 x64). Cross-platform code paths must not be consciously broken, but only Windows is tested and supported."
- **Out of scope**: "Preserving upstream git history — imports are squashed with a provenance manifest instead." / "Tracking upstream repositories after import — no submodules, no auto-update, no weekly contract tests against upstream `main`."

From `.planning/ROADMAP.md:22` — Phase 1 is "Four squashed imports with replayable provenance, verbatim licenses and import-fidelity checks"; its five success criteria are quoted in the requirements section below.

**Confidence:** HIGH (verbatim).

---

## Phase Requirements

| ID | Description (verbatim, `.planning/REQUIREMENTS.md:10-15`) | Research Support |
|----|-------------|------------------|
| IMPT-01 | "Every vendored subtree carries an `UPSTREAM.json` recording repo URL, commit SHA, import date, and license" | §Ledger Schemas (full JSON), §Architecture Patterns (Pattern 1) |
| IMPT-02 | "Each vendored subtree retains its upstream LICENSE text and copyright notices verbatim after rebranding" | §MIT Obligation Mechanics, §Import Fidelity Verification (manifest covers `LICENSE`) |
| IMPT-03 | "A `provenance-replay` CI job reproduces each imported tree from its recorded SHA and fails on drift" | §Replay Design, §Code Examples |
| IMPT-05 | "A watchlist maps each vendored subsystem to its upstream location, so an upstream security fix can be located and back-ported by hand" | §Watchlist Design + CVE triage runbook (OSV commit query verified) |
| IMPT-06 | "Import fidelity checks cover `.gitattributes` line endings, LFS-tracked binaries, and lockfile bytes" | §Import Fidelity Verification (six invariants, all command-level) |

IMPT-04 (`THIRD_PARTY_NOTICES` in installer + About) is **Phase 12** per `.planning/REQUIREMENTS.md:164` — Phase 1 supplies only the per-subtree notice material it will consume, not the assembled file.

**Confidence:** HIGH.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Upstream fetch and SHA resolution | Build tooling (`tools/provenance`, git) | CI cache | Only the importer can observe upstream; the monorepo must never hold a remote or submodule |
| Byte-exact tree materialization | Build tooling (git plumbing) | Filesystem | Blob identity is a git concept; the filesystem on Windows loses the +x bit and mutates line endings |
| Provenance ledger (`UPSTREAM/PATHS/RENAMES/EXCLUDES/series`) | Repo content (`vendor/<name>/provenance/`) | — | Must travel with the subtree when it is copied, or the MIT attribution and audit trail detach |
| Patch series | Repo content (`patches/`) | Build tooling (apply/verify) | The patch is the record of divergence; unwritten edits are unrecoverable |
| Drift detection | CI job (`provenance-verify` / `provenance-replay`) | Developer command | Must fail the build, not warn |
| License retention | Repo content (verbatim `LICENSE`) | Rebrand tooling (deny-list) | The notice obligation survives the rebrand; the rewrite tool must be structurally unable to touch it |
| Watchlist / CVE triage | Repo content (`provenance/watchlist.json`) + runbook | OSV API | Answers "where is upstream fix X in HALO?" without searching trees |
| Build orchestration | Root `justfile` | Per-tree native toolchains | One entry point, but each tree keeps its own workspace root and lockfile in Phase 1 |

**Confidence:** HIGH (design), and it is consistent with `.planning/research/ARCHITECTURE.md` §7's `vendor/` + `tools/` split.

---

## Standard Stack

### Core (verified on this machine or from an official registry)

| Tool | Pin | Purpose | Evidence |
|---|---|---|---|
| Git for Windows | **2.55.0.windows.3** (installed) | fetch/archive/ls-tree/hash-object/apply | `git --version` executed 2026-10-23 |
| Git LFS | **3.7.1** (installed) | pointer detection, object verification | `git lfs version` executed |
| bsdtar (libarchive) | **3.8.9** (installed) | extract `git archive` streams | `tar --version` executed |
| Bun | **1.4.4** (pin) / **1.4.2** (installed) | `tools/provenance` runtime + tests | pin from `.planning/research/STACK.md`; installed version probed |
| just | **1.59.0** | single build entry point | `winget search --id Casey.Just --exact` → `1.59.0` (verified live) |
| uv | **0.13.5** (pin) / **0.12.17** (installed) | per-tree Python envs | `uv --version` executed; pin from STACK.md |
| Python | **3.13.15** installed (hermes allows `>=3.11,<3.15`) | running per-tree Python | `python --version`; hermes `requires-python` read from upstream |
| Rustup / cargo | **Rustlang.Rustup 1.29.1**, `Rustlang.Rust.MSVC 1.99.1` | building the vendored Rust crates | `winget search rustup` executed; **cargo is not currently installed** |
| PowerShell | **7.6.7** | `just` recipe shell | `pwsh` version executed |

### Supporting (licence-notice tooling — optional, Phase 12 consumes it)

| Tool | Version | Purpose | Evidence |
|---|---|---|---|
| cargo-about | 0.9.2 | Rust dependency licence listing from Cargo metadata | crates.io API + legitimacy check |
| cargo-deny | 0.20.2 | licence allow/deny gate over `Cargo.lock` | crates.io API + legitimacy check |
| license-checker | 25.0.1 | npm/Bun dependency licences | npm registry |
| pip-licenses | 5.5.5 | Python wheel licences; supports `--format=json`, `--with-license-file`, `--with-notice-file` | PyPI JSON API |
| reuse | 6.2.0 | machine-checkable licence declaration (`REUSE.toml`) without editing files | PyPI JSON API + REUSE spec 3.3 |
| ast-grep (`@ast-grep/cli`) | 0.51.0 | Phase 2 rewriter; Phase 1 needs its path allow-list contract | STACK.md (already pinned) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| `git archive` from a partial clone | `git subtree add --squash` | Subtree keeps a live upstream relationship (merge/pull/split) that PROJECT.md forbids, and merges rebranded trees against upstream commits. Use subtree only if you ever intend `git subtree pull` — you don't. |
| `git archive` | `git clone` + `git checkout` | Checkout applies smudge filters and `core.autocrlf=true`; on Windows it also drops +x. This is the exact corruption class IMPT-06 exists to prevent. |
| Hand-written `patches/series` + `git apply` | quilt | quilt is POSIX-shell only, not installed (`quilt` → command not found), and adds a second patch applier. Keep quilt's *file format*, use git's applier. |
| Hand-written manifests | `git write-tree` on the vendor dir | `write-tree` depends on index state *after* filters and cannot distinguish "upstream bytes" from "normalized bytes". Use raw hashing. |
| Bun/TS provenance tool | Python | Both work; Bun is already mandatory for the build, has `bun test` built in, and needs zero install to run. Python would need a `uv` project before the first verification can run. |

**Installation (bootstrap, in order):**

```powershell
winget install --id Casey.Just --exact --accept-source-agreements --accept-package-agreements
winget install --id Rustlang.Rustup --exact   # Phase 1 only needs this for vendor-build, not for import
```

**Version verification performed:** `git --version`, `git lfs version`, `tar --version`, `bun --version`, `uv --version`, `python --version`, `pwsh` version, `winget search`. Registry/API reads for `cargo-about`, `cargo-deny`, `pip-licenses`, `reuse`, `license-checker`, plus `git ls-remote` and the GitHub REST API for the four upstreams.

**Confidence:** HIGH for installed-tool facts; MEDIUM for the Bun pin (installed 1.4.2 vs STACK's 1.4.4 — upgrade before relying on `bun install --frozen-lockfile` against upstream lockfiles).

---

## Package Legitimacy Audit

Run via `gsd-tools query package-legitimacy check` (verified live). Every tool below is a *build/dev tool*, not a shipped runtime dependency.

| Package | Registry | Signals | Verdict | Disposition |
|---|---|---|---|---|
| `license-checker` | npm | published 2019-01-10, 556,176 downloads/wk, repo `davglass/license-checker`, no postinstall | OK | Approved (optional) |
| `license-checker-rseidelsohn` | npm | published 2026-05-27, 277,801/wk, repo present, no postinstall | OK | Approved (optional) |
| `cargo-about` | crates | 2019, 23,890/wk, `EmbarkStudios/cargo-about` | OK | Approved |
| `cargo-deny` | crates | 2019, 157,673/wk, `EmbarkStudios/cargo-deny` | OK | Approved |
| `reuse` | PyPI | exists; **`unknown-downloads`** | **SUS** | `reuse` [WARNING: flagged as suspicious — verify before using.] Flag is a missing-download-statistic artifact, not a provenance problem: the tool is the FSFE reference implementation linked from `reuse.software` (the spec page names `codeberg.org/fsfe/reuse-tool`). Planner must add `checkpoint:human-verify` before installing; it is **optional** (drop it if unverified). |
| `pip-licenses` | PyPI | exists; **`unknown-downloads`, `no-repository`** | **SUS** | `pip-licenses` [WARNING: flagged as suspicious — verify before using.] Note the seam reported `repoUrl: null`, while the PyPI metadata I read lists `project_urls.homepage = https://github.com/raimon49/pip-licenses` — the discrepancy is a seam-field limitation, not evidence of a malicious package. Same checkpoint requirement; optional for Phase 1. |

**Verdicts are for the tools listed; Phase 1 installs no npm/PyPI package into the shipped product.**

**Confidence:** HIGH for the seam output (verbatim); MEDIUM for my interpretation of the two SUS verdicts.

---

## Architecture Patterns

### System Architecture Diagram (import → ledger → replay)

```
                 upstream (network, once)
   ┌─────────────────────────────────────────────────┐
   │ github.com/{can1357/oh-my-pi, NousResearch/…,   │
   │           vectorize-io/hindsight, tchivs/…}     │
   └───────────────────────┬─────────────────────────┘
                           │ git init --bare + fetch --filter=blob:none
                           ▼
   ┌─────────────────────────────────────────────────┐
   │ upstream-cache/<name>.git   (bare, partial,     │
   │ promisor remote, gitignored, CI-cached)         │
   └───────────────────────┬─────────────────────────┘
                           │ git archive <SHA> | bsdtar -x
                           ▼
   ┌─────────────────────────────────────────────────┐
   │ pristine scratch tree  ──► MANIFEST.upstream.tsv│  (mode, blob OID, sha256, path)
   └───────────────────────┬─────────────────────────┘
                           │ git apply patches/series (in order)
                           ▼
   ┌─────────────────────────────────────────────────┐
   │ patched scratch tree   ──► MANIFEST.vendored.tsv│
   └───────────────────────┬─────────────────────────┘
                           │ compare; fail on any difference
                           ▼
   ┌─────────────────────────────────────────────────┐
   │ vendor/<name>/  (committed)                     │
   │  ├─ provenance/{UPSTREAM,PATHS,RENAMES,EXCLUDES}.json
   │  ├─ provenance/{MANIFEST.upstream,MANIFEST.vendored}.tsv
   │  ├─ provenance/LFS.json
   │  ├─ provenance/patches/{series,NNNN-*.patch}
   │  └─ LICENSE (verbatim, manifest-covered)
   └───────────────────────┬─────────────────────────┘
                           │ same staging function
                           ▼
   ┌─────────────────────────────────────────────────┐
   │ `just provenance-replay`  ──► tree equality     │
   │ `just provenance-verify`  ──► fast drift check  │
   │ `just provenance-where`   ──► path/symbol lookup│
   └─────────────────────────────────────────────────┘
```

### Recommended Project Structure (Phase 1 additions only)

```
/
├── .gitattributes            # HALO-owned paths only; NO vendor/ normalization
├── .gitignore                # upstream-cache/, node_modules/, target/, .venv/, dist/
├── justfile                  # the single entry point
├── package.json              # root Bun workspace: ["apps/*","packages/*"] — never vendor/**
├── provenance/
│   ├── README.md             # runbook: import, replay, CVE triage
│   ├── watchlist.json        # cross-tree watchlist
│   └── schema/*.schema.json  # JSON Schema for every ledger file
├── tools/provenance/         # importer, verifier, replay, manifest, lookup (Bun/TS, zero deps)
├── tests/provenance/         # acceptance fixtures and failure tests
└── vendor/
    ├── oh-my-pi/
    │   ├── provenance/{UPSTREAM,PATHS,RENAMES,EXCLUDES}.json, LFS.json,
    │   │                MANIFEST.upstream.tsv, MANIFEST.vendored.tsv,
    │   │                patches/{series,0001-*.patch}
    │   └── <entire upstream tree>
    ├── hermes-agent/ …
    ├── hindsight/ …
    └── gsd-omp/ …
```

`vendor/<name>/provenance/` is deliberately **inside** the subtree: if the tree is copied out, its licence and audit trail go with it (PITFALLS P-02). `PATHS.json` marks the whole `provenance/` directory as HALO-**added**, so replay never expects it upstream.

### Pattern 1: archive-based import (one staging function)

**What:** materialize a commit's tree from the object database, never through a worktree checkout.
**When to use:** all four imports, every replay.

```bash
# one-time cache (bare + partial; GitHub advertises filter support — verified:
#   fetch=shallow wait-for-done filter, object-format=sha1)
git init --bare upstream-cache/oh-my-pi.git
git -C upstream-cache/oh-my-pi.git remote add origin https://github.com/can1357/oh-my-pi.git
git -C upstream-cache/oh-my-pi.git config remote.origin.promisor true
git -C upstream-cache/oh-my-pi.git config remote.origin.partialclonefilter blob:none
git -C upstream-cache/oh-my-pi.git fetch --filter=blob:none origin main

# immutability gate: the recorded SHA must resolve to a commit
git -C upstream-cache/oh-my-pi.git cat-file -e "<SHA>^{commit}"

# materialize exactly
git -C upstream-cache/oh-my-pi.git archive --format=tar "<SHA>" | tar -xf - -C "$SCRATCH"
```

Properties that matter:
- `git archive`'s documented attribute surface is `export-ignore` and `export-subst` only — it emits the committed blob for everything else.
- It writes the commit id into a pax header (tar) / file comment (zip), so the archive is self-identifying.
- No `.git` directory is produced, so `vendor/**/.git` absence is a testable invariant and submodules cannot appear.

**Caveat `[INFERENCE]`:** a partial clone fetches missing blobs on demand from the promisor remote. `git archive` on a `blob:none` cache therefore requires the remote to be reachable *unless* the blobs are already present. This is the offline trade-off discussed in §Replay Design.

### Pattern 2: quilt-format patch series applied with `git apply`

**What:** every HALO-local edit to a vendored file is a patch file listed in `patches/series`.
**When to use:** always; there is no "small enough to skip the patch" exemption.

`git apply` is documented to work outside a git repository ("Without these options, the command applies the patch only to files, and does not require them to be in a Git repository"), supports `--directory=<root>` to prepend a path (the documented example applies a `a/git-gui.sh` patch to `modules/git-gui/git-gui.sh`), and refuses paths outside the working area unless `--unsafe-paths` is passed — a safety default we never disable.

Patch generation uses a scratch repo whose index is protected from filters:

```bash
# 1. scratch repo holding the pristine tree, staged with filtering disabled
git init "$PATCHREPO"
printf '* -text -filter -ident -working-tree-encoding\n' > "$PATCHREPO/.git/info/attributes"
cp -a "$SCRATCH"/. "$PATCHREPO"/           # PowerShell: Copy-Item -Recurse -Force "$SCRATCH\*" $PATCHREPO
git -C "$PATCHREPO" add -A
git -C "$PATCHREPO" -c core.autocrlf=false commit -m "pristine <sha>"

# 2. overlay the HALO-edited vendored tree, diff against the pristine commit
cp -a vendor/<name>/. "$PATCHREPO"/
git -C "$PATCHREPO" add -A
git -C "$PATCHREPO" diff --cached --binary --full-index > vendor/<name>/provenance/patches/0001-<slug>.patch
```

The `.git/info/attributes` write must happen **before** the first `git add -A` — that is the whole point of the pattern.

**Why `.git/info/attributes`:** the gitattributes docs state Git consults `$GIT_DIR/info/attributes` **"which has the highest precedence"**, above any in-tree `.gitattributes`. Writing `* -text -filter` there is the only way to guarantee that staging does not normalize CRLF, disable a smudge filter, or apply `ident`/`working-tree-encoding`.

### Pattern 3: two manifests (the replay oracle)

| Artifact | Describes | Produced by | Used by |
|---|---|---|---|
| `MANIFEST.upstream.tsv` | the tree as it exists at the recorded SHA, minus recorded excludes | `ls-tree -r -z` on the cache | replay pre-patch comparison |
| `MANIFEST.vendored.tsv` | the committed tree after patches | the staging function over `vendor/<name>` | fast drift check on every build |

Both are sorted by path using byte order on POSIX separators; each line is `mode<TAB>bloboid<TAB>sha256<TAB>path`. A single `manifest_sha256` in `UPSTREAM.json` covers the body, so a one-line check detects any tampering with the oracle itself.

**Why both:** one manifest alone cannot distinguish "HALO edited this file" from "the import was corrupted", which is the whole point of the ledger.

### Pattern 4: per-tree workspace isolation

| Tree | Own workspace root (read from upstream) | Root must NOT do |
|---|---|---|
| oh-my-pi | `package.json` `workspaces = { packages: ["packages/*","python/robomp/web"], catalog: {...} }`, `packageManager: bun@>=1.4`; `Cargo.toml` `[workspace]` with explicit `crates/*` members, `resolver = "3"`; plus Bazel (`MODULE.bazel`, `BUILD.bazel`) | Include any `vendor/**` package in the root Bun workspace; declare a root Cargo workspace containing `vendor/oh-my-pi/crates/*` |
| hermes-agent | `pyproject.toml` (`name = "hermes-agent"`, `requires-python = ">=3.11,<3.15"`, `[tool.uv]` at line 607), plus `web/` (its own `package-lock.json` per upstream `.gitattributes`) | Add `vendor/hermes-agent` as a member of a root uv workspace |
| hindsight | `pyproject.toml` **begins** with `[tool.uv.workspace]`; also root `package.json` + `package-lock.json` and a `deno.lock` | Re-root its uv workspace; hand-edit `uv.lock` |
| gsd-omp | plain `package.json` (`engines.node >= 24.0.0`, one dependency `@opengsd/gsd-core ^1.12.0`, `node --test`) | Hoist it into the root Bun workspace before its `engines` is satisfied |

The failure modes are documented, not hypothetical:
- Cargo: "When inside a subdirectory within the workspace, Cargo will automatically search the parent directories for a `Cargo.toml` file with a `[workspace]` definition to determine which workspace to use." A root `[workspace]` therefore **captures** vendored crates unless `exclude`d, and `[patch]`/`[replace]`/`[profile.*]` "are only recognized in the *root* manifest, and ignored in member crates' manifests" — absorbing the tree would silently drop its profile tuning.
- uv: "uv's workspaces enforce a single `requires-python` for the entire workspace, taking the intersection of all members' `requires-python` values"; and "Workspaces are *not* suited for cases in which members have conflicting requirements". `hindsight` and `hermes-agent` are independent resolved graphs — do not merge them in Phase 1.
- Bun: the root `workspaces` list is what Bun reads; it supports globs and negative patterns (`!**/excluded/**`) and "self-contained workspaces" (`installConfig.hoistingLimits: "workspaces"`) which is what an Electron packager needs. A vendored tree's own `workspaces` key is not consulted by the root install. `[INFERENCE]` — untested here; the Phase 1 test `tests/provenance/workspace-isolation.test.ts` should assert that `bun install` at the root does not attempt to resolve `@oh-my-pi/pi-*` from the registry.

### Anti-Patterns to Avoid

- **`git clone` + checkout into `vendor/`.** Filters + `core.autocrlf=true` + lost +x + lost symlink modes. One command, four fidelity bugs.
- **A monorepo-wide `* text=auto eol=lf`.** It rewrites any upstream blob that legitimately holds CRLF, and two upstreams have no `.gitattributes` to re-normalize back.
- **Editing a vendored file and "remembering" it.** If the replay diff is the only enforcement, an unrecorded edit is caught; if replay is advisory, the ledger rots by the second week.
- **`--unsafe-paths` in any `git apply` invocation.** It disables the traversal guard for hostile patches.
- **Committing `upstream-cache/` or `.git` directories under `vendor/`.** Violates the no-submodule/no-remote exit gate in `ARCHITECTURE.md` §8.
- **Running upstream install scripts during import.** `bun install`/`npm ci` execute lifecycle scripts from code you have not reviewed yet; defer all installs to `vendor-build`.

---

## Ledger Schemas

**Confidence:** HIGH on mechanism, MEDIUM on field naming (these are HALO designs, not upstream formats). Every file gets a JSON Schema in `provenance/schema/` and is validated on both write and replay.

### `vendor/<name>/provenance/UPSTREAM.json`

```json
{
  "schema": "halo/upstream/v1",
  "subtree": "oh-my-pi",
  "local_root": "vendor/oh-my-pi",
  "repo": "https://github.com/can1357/oh-my-pi",
  "commit": "0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0",
  "commit_committed_at": "2026-10-23T02:16:10Z",
  "default_branch": "main",
  "tag": null,
  "object_format": "sha1",
  "import": {
    "mode": "archive",
    "date": "2026-10-23",
    "tool": "halo-provenance/0.1.0",
    "git_version": "2.55.0.windows.3",
    "lfs_version": "3.7.1",
    "staging_attributes": "provenance/import.attributes"
  },
  "license": {
    "spdx": "MIT",
    "files": [{ "path": "LICENSE", "blob": "<oid>", "sha256": "<hex>" }],
    "copyright_notice_count": 1
  },
  "lockfiles": [
    { "path": "Cargo.lock", "sha256": "<hex>" },
    { "path": "bun.lock", "sha256": "<hex>" }
  ],
  "counts": { "files": 0, "bytes": 0, "lfs_files": 0, "symlinks": 0, "executables": 0 },
  "manifests": {
    "upstream": "provenance/MANIFEST.upstream.tsv",
    "upstream_sha256": "<hex>",
    "vendored": "provenance/MANIFEST.vendored.tsv",
    "vendored_sha256": "<hex>"
  },
  "excludes_sha256": "<hex>",
  "renames_sha256": "<hex>"
}
```

`commit_committed_at` is recorded because the import date and the upstream commit date are different facts and both are needed to reason about a CVE window. `counts` is what makes an accidental mass deletion visible in review.

### `vendor/<name>/provenance/PATHS.json`

```json
{
  "schema": "halo/paths/v1",
  "subtree": "oh-my-pi",
  "resolution": "exceptions first, then longest-prefix-first, then file rules, then identity (a path matched by both a prefix rule and a file exception resolves by the exception)",
  "rules": [
    { "kind": "prefix", "from": "packages/", "to": "packages/", "reason": "verbatim subtree" },
    { "kind": "prefix", "from": "crates/",   "to": "crates/",   "reason": "verbatim subtree" },
    { "kind": "file",   "from": "docs/rpc.md", "to": "docs/rpc.md" }
  ],
  "exceptions": [
    { "from": "python/robomp/web/", "to": null, "reason": "example for the exclude form; delete if unused" }
  ],
  "added": [
    { "to": "provenance/", "reason": "HALO provenance record (not upstream)" }
  ]
}
```

Resolution function (single implementation, unit-tested):
`resolve(p) = exceptions[p] ?? longest matching rule ?? identity`, and `to: null` means "deliberately absent".
Paths are always POSIX-separated in the ledger regardless of the host OS.

### `vendor/<name>/provenance/RENAMES.json`

```json
{
  "schema": "halo/renames/v1",
  "subtree": "oh-my-pi",
  "generated_from": "brand.json",
  "phase_populated": 2,
  "rules": []
}
```

Rule shape (documented now, populated in Phase 2):

```json
{
  "id": "R-OMP-0001",
  "kind": "identifier",
  "from": "PI_NO_TITLE",
  "to": "HALO_NO_TITLE",
  "scope": ["vendor/oh-my-pi/**"],
  "applied_by": "tools/rebrand/rename.yml#R-OMP-0001"
}
```

`kind ∈ {identifier, string, path, env, pkg, schema}`. Reverse lookup (`to → from`) is the operation the CVE runbook needs, so the tool must index both directions.

> **Phase-1 gap the planner must close:** criterion 4 requires triaging a *synthetic* fix "through the watchlist, path map and rename map", but no real rename exists until Phase 2. Ship a test-only rename rule in `tests/provenance/fixtures/renames.synthetic.json` and run the triage drill against it. Do not pollute the real map with fiction.

### `vendor/<name>/provenance/EXCLUDES.json`

```json
{
  "schema": "halo/excludes/v1",
  "subtree": "hermes-agent",
  "rules": [
    { "glob": "docs/assets/**", "reason": "documentation images; not built or shipped", "approved_by": "plan 01-03" }
  ]
}
```

An exclusion is a **decision with a reason**, never a silent omission. Replay asserts excluded paths are absent (so an excluded path reappearing is also drift).

### `vendor/<name>/provenance/LFS.json`

```json
{
  "schema": "halo/lfs/v1",
  "subtree": "oh-my-pi",
  "tracked": [
    { "path": "packages/x/foo.wasm", "oid": "sha256:<64 hex>", "size": 12345, "pointer_verified": true, "object_verified": false }
  ],
  "upstream_gitattributes_lfs_lines": ["*.wasm filter=lfs diff=lfs merge=lfs -text linguist-vendored"]
}
```

### `vendor/<name>/provenance/patches/series`

Plain text, quilt-compatible: one patch filename per line, relative to `patches/`, applied top-to-bottom; `#` starts a comment (quilt's documented `series` semantics). Order is significant and never sorted.

```text
# halo patch series — vendor/oh-my-pi
# generated never; hand-maintained; every entry must apply cleanly in order
0001-rpc-tool-backend-dispatch-guard.patch
```

> **Name collision to avoid:** oh-my-pi ships its own root-level `patches/` directory (contents not read; most likely its Bun patched-dependency store). HALO's patch set lives at `provenance/patches/`, so the upstream directory is imported unchanged and must never be confused with — or written by — the HALO tooling.

### Patch file header (git-apply-compatible, `format-patch`-shaped)

```text
From: HALO <halo@localhost>
Subject: [PATCH 0001] rpc: refuse agent-loop commands in tool-backend mode

Upstream-Ref: 1f2e3d4c5b6a79880a1b2c3d4e5f60718293a4b5   (or "none")
Halo-Reason: CORE-01 requires the core to be a tool backend only
Halo-Touches: packages/coding-agent/src/modes/rpc/rpc-types.ts
Halo-CVE: OSV-2026-XXXX                                   (only for backports)

---
 <unified diff>
```

`git apply` ignores mail headers, so the same file is both human-auditable and machine-applicable. `Upstream-Ref` is what makes a later re-import or a CVE audit answerable.

### `provenance/watchlist.json` — see §Watchlist Design

### Manifest canonicalization (must be specified or the digests are not reproducible)

- Lines joined with `\n`, final newline included, UTF-8, no BOM, no CR.
- Fields: `%06o` mode, 40-hex SHA-1 blob OID (or `-` when unknown), 64-hex SHA-256 of **raw bytes**, POSIX path.
- Sort by path bytes (memcmp), not locale collation.
- Excluded paths are omitted from both manifests and asserted absent separately.
- First line is `#halo-manifest v1`; the digest is computed over lines 2..n.

---

## Patch Tooling Decision

| Option | Windows | Deterministic | Handles adds/deletes/modes | Verdict |
|---|---|---|---|---|
| **`patches/series` + `git apply`** (quilt file format, git applier) | Yes (git is native) | Yes — order fixed, `--check` before apply | Adds/deletes yes; mode changes only via explicit chmod patch lines | **Chosen** |
| quilt proper | No — POSIX shell tool, not installed here, needs GNU diff/patch | Yes | Yes | Format only, not the tool |
| `git format-patch` + `git am` | Yes | Yes, and carries author/date/message | Yes | Rejected as the *primary*: `git am` creates commits (we need file-level replay on a pristine tree, not a commit chain) and mail metadata invites noise. The *header shape* is reused. |
| `git diff --no-index` over two directories | Yes | Yes | No mode tracking; `--no-index` treats paths as non-git things | Useful for ad-hoc inspection only; not the ledger |
| StGit / Mercurial MQ | StGit needs a git repo + its own workflow; MQ is analogue-only | — | — | Rejected: extra state store to keep in sync, and neither solves Windows fidelity |

**Decision:** quilt's **file convention**, git's **applier**, one patch per logical change, plus the header fields above. Delete any temptation to use `git am` — Phase 1 has no interest in reconstructing upstream *commits*, only upstream *content*.

**Confidence:** HIGH on the mechanism; MEDIUM on file-mode representation (a `new file mode 100755` line in a diff is honoured by `git apply`, but a mode-only change needs `old mode`/`new mode` lines and should be rare).

---

## Replay Design

**Confidence:** HIGH on plumbing; MEDIUM on the offline story (a genuine trade-off, below).

### Exact command sequence (`just provenance-replay`)

```text
for each subtree S in vendor/*:
  1. assert cache exists and S.commit resolves:      git -C cache cat-file -e <sha>^{commit}
  2. assert cache object format is sha1:              git -C cache rev-parse --show-object-format
  3. scratch := mktemp; git archive <sha> | tar -xf - -C scratch
  4. drop paths matched by EXCLUDES.json
  5. assert manifest(scratch) == MANIFEST.upstream.tsv
  6. for patch in patches/series:                     git -C scratch apply --whitespace=nowarn -p1 <patch>
     (fail immediately, naming the patch index and file)
  7. stage scratch through the staging function       → manifest(scratch) == MANIFEST.vendored.tsv
  8. compare committed vendor/S/provenance files      → byte equality with the scratch copies
  9. assert no vendor/S/**/.git, no .gitmodules, no gitlink modes (160000)
```

Step 7 matters: applying a patch to a bare directory loses mode information, so the comparison of *modes* is done on the staged index (same function as import), while the *content* comparison uses SHA-256 of raw bytes.

### Making it offline-reproducible — the honest trade-off

| Approach | Offline? | Repo cost | Verdict |
|---|---|---|---|
| A. Bare `--filter=blob:none` cache (gitignored, CI-cached) | No for blobs (lazy fetch); yes for drift detection via manifests | ~0 (commits+trees only) | **Default** |
| B. Commit a pristine snapshot per subtree (tar.zst of imported paths) | Yes | Size of the four working trees, unknown until measured | Only if CI must run air-gapped |
| C. Commit a `git bundle` | Yes | Full object set per repo; `git-bundle(1)`'s documented options that I read show no depth/shallow switch, so a bundle is effectively the whole history | Not viable at these sizes |
| D. Manifest-only verification (`provenance-verify`) | Yes | ~ a few MB of TSV | Always available, runs on every build |

**Recommendation:** ship A + D in Phase 1; make B a config flag (`provenance.snapshot: true`) that the planner can enable if the trees turn out small after measurement. Do not pretend C works.

### Fail-on-drift semantics

- Any manifest mismatch → exit non-zero, print `path | expected | actual | kind(added|removed|modified|mode)` for every differing path (cap at 200, then a count).
- A missing `UPSTREAM.json`, `patches/series`, `MANIFEST.*.tsv` is a hard failure, not a skip — silence is how a ledger dies.
- A patch that applies with fuzz or offset is a failure: run `git apply --check` first and treat exit 0 only as acceptable, then apply.
- A `vendor/**` file whose `git ls-files -s` mode is 100644 while upstream recorded 100755 is a **failure**, even though the file is physically unexecutable on Windows.

### Why not "compare the tree hash"

`git write-tree` produces a tree OID that depends on the *filtered* index and on which extra files (provenance, overrides) are present. It cannot express "this file's bytes equal upstream's bytes but its mode differs", and it changes whenever HALO adds a provenance file. The manifest is strictly more informative and toolchain-independent.

---

## Import Fidelity Verification

**Confidence:** HIGH — every invariant below is expressed with documented git behaviour and is testable without rebuilding anything.

### The six invariants (IMPT-06)

**I1 — Byte identity.** For every non-patched path:
`git ls-files -s -- vendor/<name>` OID == `git hash-object --no-filters <file>` == upstream `git ls-tree` OID.
The middle term is the filter detector: `--no-filters` means "ignore any input filter that would have been chosen by the attributes mechanism, including the end-of-line conversion". If the index OID differs from the raw-hash OID, a filter changed the bytes during staging. If the raw-hash OID differs from upstream, the bytes on disk are wrong.

**I2 — No attribute-induced normalization.** Per path, assert `git check-attr --all -- <path>` reports none of `text`, `eol`, `filter`, `ident`, `working-tree-encoding` as set (or that the effective values are exactly those that reproduce upstream bytes). Complement with `git ls-files --eol`, which prints `i/<eolinfo> w/<eolinfo> attr/<eolattr>`; a mismatch between `i/` and `w/` is conversion in progress.

**I3 — Lockfile bytes.** Named set (`Cargo.lock`, `bun.lock`, `bun.lockb` if present, `package-lock.json`, `uv.lock`, `deno.lock`) must exist where upstream has them, be byte-identical (I1 covers it), and appear in `UPSTREAM.json.lockfiles` with their SHA-256. A lockfile regenerated by the import (Bun reformatting, uv re-locking) is drift even if it "works".

**I4 — Modes and symlinks.** Compare the mode column of upstream `ls-tree` with `git ls-files -s`:
- `100755` → repair with `git update-index --chmod=+x -- <path>` after staging. The git-update-index docs say exactly this is required on filesystems whose executable bits are unreliable ("On such an unfortunate filesystem, you may need to use `git update-index --chmod=`").
- `120000` → do **not** rely on tar extraction (bsdtar on Windows may materialize the link target as a file). Extract the link text as file content and register it with `git update-index --add --cacheinfo 120000,<blob>,<path>`. `core.symlinks=false` is the Windows default and the docs note update-index "does not modify a recorded file mode from symbolic link to regular file", so the index keeps 120000 even though the worktree cannot represent it.
- `160000` (gitlink/submodule) → fail the import and open a decision: submodules are out of scope.

**I5 — LFS.** Generate `LFS.json` from `git lfs ls-files <sha> --json --long --size` in the cache. Pointer files are ordinary blobs, so I1 already proves the pointer bytes match; `LFS.json` adds the declared `oid`/`size`, which lets a later step verify content with `sha256sum <file>` without re-fetching the pointer. Pointer format facts that matter: keys sorted with `version` first, `<1024` bytes, and "Pointer files MUST be stored in Git with their executable bit matching that of the replaced file" (so a 100755 wasm fixture is possible).

**I6 — Windows-hostile paths.** Run three gates on `ls-tree -r --name-only -z` before extracting anything:
- **Case collisions:** lowercase every path; any duplicate group fails. Windows is case-insensitive by default ("Do not assume case sensitivity… consider the names OSCAR, Oscar, and oscar to be the same").
- **Illegal names:** reserved device names (`CON, PRN, AUX, NUL, COM1…COM9, LPT1…LPT9`, including with an extension), and components ending in a space or period. Microsoft's rules are explicit that a `<`, `>`, `:`, `"`, `/`, `\`, `|`, `?`, `*` character is reserved and that "NUL.txt and NUL.tar.gz are both equivalent to NUL".
- **Length:** flag any path whose `vendor/<name>/` + path exceeds ~240 chars. Git for Windows disables long-path support by default and documents the opt-in `git config core.longpaths true` with the caveat "Scripted git commands may still fail with this option".

### Corpus-level sanity checks (cheap, catch catastrophic mistakes)

- File count and total byte count within ±0.1% of the upstream `ls-tree -l` totals (excluding registered excludes).
- `LICENSE` present and its SHA-256 equal to upstream's `LICENSE` blob.
- `copyright_notice_count` (count of lines matching `(?i)copyright`) never decreases across commits.
- No `vendor/**/.git`, no `.gitmodules`, no `.gitignore` edits inside vendored trees (upstream `.gitignore` files are content, not policy).

### Why not verify by building

`cargo build`/`bun install`/`uv sync` all mutate the tree (lockfile refresh, `node_modules`, `target`). Fidelity must be provable *before* any build runs — that is also what makes the check safe in a pre-commit hook.

---

## MIT Obligation Mechanics

**Confidence:** HIGH on the obligation text; MEDIUM on the notice-assembly convention, because there are three competing standards and the choice affects Phase 12.

### What must be retained, exactly

The MIT text's operative sentence, verbatim from the SPDX licence record:

> "The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software."

Therefore, per subtree:

1. `vendor/<name>/LICENSE` — the upstream file, byte-identical, never edited, never merged into a root LICENSE. Enforced by the manifest (I1).
2. Any additional per-file notices that upstream carries in source headers — these stay physically in place because Phase 2's rewrite tool must be path-denied from `**/LICENSE*`, `**/NOTICE*`, `**/COPYRIGHT*`, `**/THIRD_PARTY*` and from `copyright`/`license`/`authors` manifest fields.
3. `UPSTREAM.json.license` records SPDX id, the licence file's blob OID + SHA-256, and a notice count — so drift in the *notice* is distinguishable from drift in the *code*.
4. The compiled CLI and the Electron installer are "copies": the notice has to be inside the distributed artifact and reachable from the app (Phase 12, IMPT-04).

**Do not assume the GitHub owner is the copyright holder.** The holder line is whatever `LICENSE` says (four different holders across the four repos); Phase 1 records it, Phase 2 must not touch it.

### Assembly conventions — pick one and say why

| Convention | What it is | Fit here |
|---|---|---|
| **Plain `THIRD_PARTY_NOTICES.txt` + SPDX ids** | A generated text file: four verbatim upstream licences first, then per-ecosystem dependency listings | **Recommended** — simplest to ship in an installer and to display in About; matches PITFALLS P-02's binary-notice requirement |
| **REUSE 3.3** | `LICENSES/` + `REUSE.toml` annotations; tool verifies every file is covered | Valuable as a *verifier*, and `REUSE.toml` can declare `vendor/<name>/**` with `precedence = "override"` + `SPDX-License-Identifier = "MIT"` **without editing a single vendored file**. Requires a top-level `LICENSES/MIT.txt` and a SUS-flagged tool (see audit). Adopt only if the team wants machine-checkable coverage. |
| **DEP-5 (`debian/copyright`)** | Machine-readable Debian copyright file | Not a fit: Debian-packaging-shaped, and REUSE's own spec lists DEP5 as deprecated. |

Per-ecosystem generators (all verified to exist):
- Rust: `cargo about generate about.hbs` (0.9.2) — note oh-my-pi already ships `about.toml` + `THIRD-PARTY-NOTICES.txt` and a `deny.toml`, which is a strong hint its notices are cargo-about/cargo-deny generated.
- Python: `pip-licenses --format=json --with-license-file --with-notice-file`.
- npm/Bun: `license-checker --json`.

### What verifies notices did not drift

1. I1 on `LICENSE` (byte identity, every commit).
2. `copyright_notice_count` monotonicity per subtree.
3. A rebrand-tool test: run the Phase 2 rewriter over a fixture tree and assert the SHA-256 of every licence-ish path is unchanged.
4. Phase 12 only: unpack the built installer and assert the notices file is present and mentions all four holders (PITFALLS P-02's "inspect the built installer, not the source tree").

---

## Monorepo Layout & Build Orchestration

**Confidence:** HIGH on tool behaviour; MEDIUM on the exact per-tree commands (upstream trees not yet fetched, so their scripts are unread).

### Layout

See §Recommended Project Structure. The key structural rule from `ARCHITECTURE.md` §7 is preserved: `vendor/` is quarantined, `contracts/` is the only ownership declaration, and no HALO logic lives inside a vendored tree except explicitly patched files.

### Root `justfile` skeleton (Windows-first)

```just
# justfile — the only entry point. Every recipe is idempotent.
[windows]
set shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]

default:
    @just --list

bootstrap:            # installs the two missing host tools
    winget install --id Casey.Just --exact --accept-source-agreements --accept-package-agreements
    winget install --id Rustlang.Rustup --exact --accept-source-agreements --accept-package-agreements

provenance-fetch:     # network; populates upstream-cache/ (gitignored)
    bun run tools/provenance/cli.ts fetch --all

provenance-verify:    # offline; every build runs this
    bun run tools/provenance/cli.ts verify --all

provenance-replay:    # reconstructs from SHA + patches, fails on drift
    bun run tools/provenance/cli.ts replay --all

vendor-build: provenance-verify
    cd vendor/oh-my-pi; bun install --frozen-lockfile
    cargo build --locked --manifest-path vendor/oh-my-pi/Cargo.toml
    uv sync --project vendor/hermes-agent --locked
    cd vendor/hermes-agent/web; npm ci
    uv sync --project vendor/hindsight --locked
    cd vendor/gsd-omp; npm ci

verify: provenance-replay vendor-build
    bun test tools/provenance
    bun test tests/provenance
```

Notes that come from documented behaviour, not taste:
- `just` uses `sh` on Windows by default; `[windows] set shell` is required or every recipe dies with "could not find `sh`".
- PowerShell does not handle positional arguments the way other shells do; parameterise with `just` variables/env, not `just recipe arg`.
- `uv sync --project <dir>` and `--directory <dir>` are both documented; `--project` changes only project discovery, `--directory` changes cwd.
- `cargo --manifest-path` works because each vendored `Cargo.toml` is its own workspace root.

### Where the vendored build systems fight the root (concrete list)

| Conflict | Mechanism (documented) | Phase 1 stance |
|---|---|---|
| Cargo workspace capture | parent-directory search finds the nearest `[workspace]`; a root workspace without `exclude` breaks every vendored crate | Root has **no** `Cargo.toml` in Phase 1 |
| Cargo profile/patch loss | `[patch]`, `[replace]`, `[profile.*]` are "only recognized in the root manifest" | Do not absorb crates as members; keep them a separate workspace |
| uv `requires-python` intersection | one requirement for the whole workspace | Root has **no** uv workspace in Phase 1; each tree syncs independently |
| uv dependency conflict | "not suited for cases in which members have conflicting requirements" | Defer unification to the phase that actually fuses the Python code |
| Bun nested workspaces | root `workspaces` is authoritative; a member's own `workspaces` key is not read | Root workspace = `["apps/*","packages/*"]`, never `vendor/**` |
| Electron packaging + hoisting | packagers walk one workspace's `node_modules`; Bun's `installConfig.hoistingLimits: "workspaces"` exists for this | When Desktop lands, mark it self-contained rather than fighting hoisting |
| Bazel in oh-my-pi | a third build graph (`MODULE.bazel`, `BUILD.bazel`, `bazel/`) | Import the files; **do not** make Bazel part of `vendor-build` in Phase 1 |
| Node engines | gsd-omp declares `engines.node >= 24.0.0`; this machine has 22.23.2 | Its `npm ci`/`node --test` is best-effort in Phase 1; the import and fidelity checks do not depend on Node |
| Three lockfile ecosystems | `Cargo.lock`, `bun.lock`/`package-lock.json`, `uv.lock` | All are preserved verbatim; nothing is unified in Phase 1 |

### The "one documented command" question

PLAT-01 is Phase 12. Phase 1 should still deliver `just verify` as the gate, but it must be honest about prerequisites: `just` and `cargo` are **not installed** on this machine today (verified), so `just bootstrap` is a required first step. Two `winget` packages are the whole bootstrap.

---

## Watchlist Design & CVE Triage Runbook

**Confidence:** HIGH on the lookup mechanics (OSV commit query verified); MEDIUM on how much of each tree deserves a watch entry.

### What the watchlist has to answer

> "An upstream CVE was fixed in repo X at commit F, touching path P — where is that in HALO, and what do I do?"

That decomposes into: (a) find the changed upstream paths, (b) map upstream path → local path, (c) map upstream symbol/string → local symbol/string, (d) land it as a patch, (e) prove the tree is still reconstructible.

### `provenance/watchlist.json`

```json
{
  "schema": "halo/watchlist/v1",
  "entries": [
    {
      "id": "WL-OMP-RPC-WIRE",
      "subtree": "oh-my-pi",
      "upstream_paths": [
        "packages/coding-agent/src/modes/rpc/rpc-types.ts",
        "packages/coding-agent/src/modes/rpc/rpc-frame.ts",
        "docs/rpc.md"
      ],
      "local_paths": ["vendor/oh-my-pi/packages/coding-agent/src/modes/rpc/"],
      "symbols": ["RpcCommand", "agent_end", "isTerminal", "rpc_chunk", "protocolVersion"],
      "why": "HALO's Python adapter encodes this command/frame set; a wire change is a contract break",
      "contract_tests": ["tests/contracts/rpc-command-set.test.ts"],
      "advisory_sources": ["osv-commit", "github-advisory"],
      "last_checked": "2026-10-23"
    },
    {
      "id": "WL-HERMES-PLUGIN-LOADER",
      "subtree": "hermes-agent",
      "upstream_paths": ["agent/plugins/", "agent/hooks/"],
      "local_paths": ["vendor/hermes-agent/agent/plugins/", "vendor/hermes-agent/agent/hooks/"],
      "symbols": ["plugins.enabled", "pre_tool_call"],
      "why": "plugin loading is a policy-bypass surface (PITFALLS P-07)",
      "contract_tests": ["tests/policy/plugin-fixture.test.ts"],
      "advisory_sources": ["osv-commit", "github-advisory"],
      "last_checked": "2026-10-23"
    }
  ]
}
```

Minimum viable watch set (planner should confirm against the fetched trees): OMP RPC types/frames + the Rust shell/LSP process spawn sites; Hermes plugin loader/hooks + session store; Hindsight retrieval + embedding clients + the API surface HALO calls over HTTP; gsd-omp ExtensionAPI. Everything else is covered by the *manifest*, not by a watch entry.

### The runbook (five steps, into `provenance/README.md`)

1. **Get the fix commit.** OSV's `POST /v1/query` accepts `{"commit": "<sha>"}` and returns `affected[].ranges[].events[]` with `introduced`/`fixed` git hashes (verified from the OSV API docs and sample response).
2. **Expand to paths.**
   `git -C upstream-cache/<name>.git diff --stat <introduced>..<fixed>` (or `--name-only`), restricted to the affected range.
3. **Map paths and symbols.** `just provenance-where <upstream-path-or-symbol>` prints: matching upstream paths, resolved local paths via `PATHS.json`, matching watchlist ids, and (Phase 2+) reverse `RENAMES.json` hits. For a file that no longer matches by path, fall back to content identity: `git -C cache log --all --find-object=<blob-oid>` finds the commits that touched a blob you can locate in `MANIFEST.upstream.tsv`.
4. **Land it as a patch.** Apply the upstream diff to the pristine scratch tree, resolve against the rebranded vendored file (`git apply -3` inside the scratch repo gives conflict markers), regenerate with the standard patch flow, set `Upstream-Ref:` and `Halo-CVE:` headers, append to `series`.
5. **Prove it.** `just provenance-replay` → regenerate `MANIFEST.vendored.tsv` → commit the patch and the manifest together. If replay fails, the patch is wrong, not the manifest.

### Why this beats searching the trees

The manifest can answer "which files did this commit change that we imported" **without** a network round-trip to GitHub, because it holds the upstream blob OIDs. The triage never depends on remembering a rename.

---

## Runtime State Inventory

Phase 1 is an import/migration phase, so each category is answered explicitly.

| Category | Items found | Action required |
|---|---|---|
| **Stored data** | None. Repo has no database, no sessions, no user data (verified: root contains only `.git`, `.planning`, `AGENTS.md`). Upstream trees contain no committed data stores; Hindsight's schema lives in code and is not created until Phase 8. | none |
| **Live service config** | None owned by HALO. Upstream CI configs (`.github/workflows/*`) come along as inert content inside `vendor/**` and are never executed — GitHub executes workflows only from the repository-root `.github/workflows` `[ASSUMED]`. | none; add a test asserting no workflow file exists outside root `.github` |
| **OS-registered state** | None yet. The only host-level state Phase 1 creates is the git config it depends on: `core.longpaths`, `core.autocrlf` behaviour. | Document `git config --local core.longpaths true` in the runbook; do not change the *system* config |
| **Secrets / env vars** | None. Upstream `.env.example` files are content and must stay untouched; no secrets are read or written. Note: vendored code may reference `HERMES_*`/`HINDSIGHT_*` env names — that is Phase 2's rename surface, not Phase 1. | none |
| **Build artifacts** | None committed. The import must add a root `.gitignore` (currently there is **no** `.gitignore`) covering `upstream-cache/`, `node_modules/`, `target/`, `.venv/`, `dist/`, `build/`, `*.pyc`, `__pycache__/`. Without it the first `vendor-build` would try to commit gigabytes. | create `.gitignore` before the first vendor commit |

**Confidence:** HIGH (verified against the actual repo state).

---

## Common Pitfalls

### P1 — The system `core.autocrlf=true` rewrites the import
**What goes wrong:** files staged from CRLF-containing upstream blobs are normalized to LF; the monorepo's blob differs from upstream's forever.
**Why:** Git for Windows was installed with `core.autocrlf=true` in `C:/Program Files/Git/etc/gitconfig` (verified on this machine), and `text` unspecified means "Git uses the `core.autocrlf` configuration variable".
**Avoid:** stage with a generated `.git/info/attributes` = `* -text -filter -ident -working-tree-encoding`; verify with I1/I2.
**Warning signs:** `git ls-files --eol` shows `i/lf w/crlf` on vendored files; index OID ≠ `hash-object --no-filters` OID.

### P2 — Two upstreams have no `.gitattributes`, so "normalizing the monorepo" is destructive
**What goes wrong:** a well-meaning root `* text=auto eol=lf` rewrites any `hindsight`/`gsd-omp` file committed with CRLF (verified: both return HTTP 404 for `.gitattributes`).
**Why:** the attribute is applied at *staging*, not import, so the corruption appears when a later commit touches the tree.
**Avoid:** root `.gitattributes` governs HALO-owned paths only; `vendor/**` is exempted explicitly, and I2 asserts it stays that way.

### P3 — oh-my-pi's LFS `.wasm` files become unusable or bloat the repo
**What goes wrong:** either the pointers are replaced by binaries (repo grows, blob identity lost) or the pointers are committed and nothing can build the wasm-dependent features offline.
**Why:** upstream `.gitattributes` line 1 is `*.wasm filter=lfs diff=lfs merge=lfs -text linguist-vendored` (verified from the repo).
**Avoid:** keep pointers verbatim; record `LFS.json`; make `just provenance-lfs` an explicit, optional fetch into a cache. Never run `git lfs pull` inside `vendor/`.

### P4 — A four-tree commit of ~2.7 GiB looks hung and then fails
**What goes wrong:** `git add vendor/` stalls for many minutes, antivirus scans every object, and a failure loses the whole staging run.
**Why:** GitHub-reported sizes are oh-my-pi 721,019 KB, hermes-agent 1,301,971 KB, hindsight 824,746 KB, gsd-omp 497 KB (API `size`, includes history; LFS objects likely not counted — `[INFERENCE]`).
**Avoid:** one commit per subtree, smallest first; `git config core.fsmonitor true` locally; measure working-tree size *before* committing and revisit the excludes decision.

### P5 — `git clone` + checkout into `vendor/` silently changes bytes and modes
**What goes wrong:** line endings converted, `+x` lost, symlinks materialized as text files.
**Why:** checkout applies smudge filters; `core.filemode=false` and `core.symlinks=false` are the Windows defaults.
**Avoid:** archive-based materialization + explicit `update-index --chmod` / `--cacheinfo`.

### P6 — Node 24 requirement in gsd-omp
**What goes wrong:** `node --test` and `npm ci` fail or warn on this machine's Node 22.23.2 while the package declares `engines.node >= 24.0.0`.
**Avoid:** treat gsd-omp's own test suite as non-gating in Phase 1; import and verify it like any other tree.

### P7 — Rust is not installed, so "the build works" is unprovable today
**What goes wrong:** `vendor-build` fails on `cargo` and the phase looks broken.
**Avoid:** `just bootstrap` first (winget `Rustlang.Rustup`); keep import and fidelity independent of any compiler.

### P8 — Path hostility on Windows
**What goes wrong:** checkout of a case-colliding pair silently overwrites one file; a reserved device name or a trailing dot makes extraction fail midway; a 260+ char path fails in `cmd`-based tooling.
**Why:** documented Windows naming rules and Git for Windows' default-off long-path support.
**Avoid:** the I6 pre-flight gate; if a path is hostile, record it as an exclude (with reason) rather than renaming it, because renaming destroys path identity for the CVE lookup.

### P9 — Patches that only "sort of" apply
**What goes wrong:** a patch applies with fuzz after a Phase 2 edit, replay passes today, and next month it applies to the wrong lines.
**Avoid:** `git apply --check` with zero fuzz as a gate; one logical change per patch; regenerate rather than hand-edit a patch.

### P10 — The ledger is written by hand once and never again
**What goes wrong:** the first emergency fix is applied directly to the vendored tree; replay then permanently fails or is disabled, and the ledger stops being true.
**Avoid:** make the importer the *only* writer of manifests, and make `provenance-verify` a pre-commit hook so an unpatched edit cannot be committed.

### P11 — Rebranding "fixes" the licence files
**What goes wrong:** a bulk `s/hermes/halo/gi` rewrites the attribution paragraph; the notice still says MIT but no longer identifies the work.
**Avoid:** path deny-list in the rewriter + hash assertion on `LICENSE`/`NOTICE`/`COPYRIGHT`/`THIRD_PARTY`; record the rule in the tool's docstring.

### P12 — Root workspace capture
**What goes wrong:** adding `"vendor/*"` to the root Bun workspace, or a root `Cargo.toml` without `exclude`, makes the whole tree resolve differently or fail to build.
**Avoid:** the isolation table in §Pattern 4 plus a test that asserts the root manifests do not name `vendor`.

---

## Code Examples

All commands below are documented behaviour; those marked ✅ were also exercised on this workstation. Shell snippets are **bash** (Git Bash or CI); the PowerShell equivalents for `just` recipes are in §Root `justfile` skeleton.

### ✅ Resolve and pin an upstream commit (no clone)

```bash
git ls-remote https://github.com/can1357/oh-my-pi.git refs/heads/main
# 0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0	refs/heads/main   (2026-10-23)
git ls-remote https://github.com/NousResearch/hermes-agent.git refs/heads/main
# 3ba2b0787ed3a73ec3b08085ed0137f235209cf4
git ls-remote https://github.com/vectorize-io/hindsight.git refs/heads/main
# 0691b504a88480844b2db53384b8c81971b7cf1e
git ls-remote https://github.com/tchivs/gsd-omp.git refs/heads/main
# 7df847d2224b90f4b601f97152e6e6e8975fc2d0
```

> These are **evidence that the mechanism works**, not the pins. The import must re-resolve, record, and then treat the recorded value as immutable.

### ✅ Confirm the remote can serve exactly what we need

```bash
GIT_TRACE_PACKET=1 git ls-remote https://github.com/tchivs/gsd-omp.git refs/heads/main 2>&1 |
  grep -E "version 2|fetch=|object-format"
# git< version 2
# git< fetch=shallow wait-for-done filter     → --filter=blob:none is supported
# git< object-format=sha1                     → blob OIDs are comparable to ours
```

### Bare partial cache + immutability gate

```bash
git init --bare upstream-cache/oh-my-pi.git
git -C upstream-cache/oh-my-pi.git remote add origin https://github.com/can1357/oh-my-pi.git
git -C upstream-cache/oh-my-pi.git config remote.origin.promisor true
git -C upstream-cache/oh-my-pi.git config remote.origin.partialclonefilter blob:none
git -C upstream-cache/oh-my-pi.git fetch --filter=blob:none origin main
git -C upstream-cache/oh-my-pi.git cat-file -e "0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0^{commit}" && echo "pinned commit present"
```

### Pre-flight: hostile-path gate (run before extracting)

```bash
SHA=0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0
# case collisions (Windows is case-insensitive by default)
git -C upstream-cache/oh-my-pi.git ls-tree -r --name-only "$SHA" |
  awk '{print tolower($0)}' | sort | uniq -d
# reserved device names and trailing dot/space
git -C upstream-cache/oh-my-pi.git ls-tree -r --name-only "$SHA" |
  grep -Ei '(^|/)(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|/|$)|[ .](/|$)'
# gitlinks (submodules) — must be empty
git -C upstream-cache/oh-my-pi.git ls-tree -r "$SHA" | awk '$1=="160000"'
# symlinks and executables — feed the manifest
git -C upstream-cache/oh-my-pi.git ls-tree -r "$SHA" | awk '$1=="120000"' | wc -l
git -C upstream-cache/oh-my-pi.git ls-tree -r "$SHA" | awk '$1=="100755"' | wc -l
```

### Materialize + stage with filters disabled

```bash
git -C upstream-cache/oh-my-pi.git archive --format=tar "$SHA" | tar -xf - -C vendor/oh-my-pi
printf '* -text -filter -ident -working-tree-encoding\n' > .git/info/attributes
git -c core.autocrlf=false add -- vendor/oh-my-pi
```

### Fidelity assertion (the one check that matters)

```bash
# for every path: index OID == raw-hash OID == upstream OID
git ls-files -s -z -- vendor/oh-my-pi |
  while IFS= read -r -d '' rec; do
    mode=${rec%% *}; rest=${rec#* }; oid=${rest%% *}; path=${rest#*$'\t'}
    raw=$(git hash-object --no-filters -- "$path")
    up=$(git -C upstream-cache/oh-my-pi.git ls-tree -r "$SHA" -- "${path#vendor/oh-my-pi/}" | awk '{print $3}')
    [ "$oid" = "$raw" ] && [ "$raw" = "$up" ] || echo "DRIFT $path idx=$oid raw=$raw upstream=$up"
  done
echo "exit=$?"
```

### Attribute drift detector

```bash
git check-attr text eol filter ident working-tree-encoding -- vendor/oh-my-pi/packages/foo.ts
git ls-files --eol -- vendor/oh-my-pi | awk '$1 != $2 {print}'   # i/ vs w/ mismatch = conversion
```

### Mode repair after staging

```bash
git ls-tree -r "$SHA" | awk '$1=="100755"{print $4}' |
  while read -r p; do git update-index --chmod=+x -- "vendor/oh-my-pi/$p"; done
```

### LFS inventory

```bash
git -C upstream-cache/oh-my-pi.git lfs ls-files "$SHA" --json --long --size > /tmp/lfs.json
# '*' after the OID = full object present locally, '-' = pointer only
```

### Apply a patch series (works with or without a repo)

```bash
while IFS= read -r p; do
  case "$p" in ''|'#'*) continue;; esac
  git apply --check --whitespace=nowarn -p1 "vendor/oh-my-pi/provenance/patches/$p" &&
  git apply         --whitespace=nowarn -p1 "vendor/oh-my-pi/provenance/patches/$p" || exit 1
done < vendor/oh-my-pi/provenance/patches/series
```

---

## State of the Art

| Old Approach | Current Approach | When Changed / Why | Impact |
|---|---|---|---|
| `git submodule` for vendoring | Squash + provenance manifest | submodules reintroduce upstream reachability and a second clone step | No upstream, no drift, but provenance becomes a first-class artifact (this phase) |
| `git subtree add` | `git archive` from a `blob:none` partial clone | partial clone (`--filter`) became widely supported; GitHub advertises `filter` | Import is a one-shot data copy with no ongoing relationship |
| `sed`-driven vendoring edits | Patch series + replay | — | Every divergence is reviewable and reversible |
| quilt-managed `debian/patches` | `series` format + `git apply` | quilt is POSIX-only, unmaintained for Windows workflows | Windows-native patch handling, same auditability |
| "License file in the repo" | Per-subtree verbatim licence + generated notices + machine-checked declaration (REUSE/SPDX) | REUSE 3.3 (2024-11-14) makes file-level licensing machine-checkable | The obligation becomes testable instead of aspirational |
| Full clone into monorepo | `--filter=blob:none` cache + manifest oracle | partial clone support | Verifiable with less repo weight, at the cost of network for reconstruction |

**Deprecated / do not use:** `core.autocrlf=true` for a multi-language monorepo; hand-maintained `THIRD_PARTY` files; `git am`-based replay; submodules.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Patch application | A custom diff applier | `git apply` (or `git apply -3` in a scratch repo) | Traversal guards, whitespace rules, binary handling, conflict markers |
| Hashing / normalization | Custom line-ending detection | `git hash-object --no-filters`, `git ls-files --eol`, `git check-attr` | They already implement the exact attribute semantics that cause drift |
| LFS pointer parsing | Regex over `version/oid/size` | `git lfs ls-files --json`, `git lfs pointer --file` | The pointer grammar is specified and versioned; the CLI preserves unknown keys |
| Dependency licence listing | Scraping `node_modules` | `cargo-about` / `cargo-deny` / `license-checker` / `pip-licenses` | Handles SPDX expressions, dual licences, NOTICE files |
| Archive extraction | `Expand-Archive`/custom unzip | bsdtar (present) on `git archive` output | Preserves mtimes/modes and handles pax headers with the commit id |
| Build orchestration | A bespoke Bun task runner with dependency graphs | `just` | Cross-language recipe dependencies, `--list`, no runtime dependency |

**Key insight:** every fidelity bug in this phase is a *filter* bug. The correct move is to stop filters from running (staging attributes) rather than to detect and repair their output afterwards.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | `git archive` applies no line-ending conversion (only `export-ignore`/`export-subst`) | Import pipeline | If it does convert, the pristine manifest is wrong on day one — caught immediately by I1 vs upstream `ls-tree`, so the risk is a failed gate, not silent corruption |
| A2 | The four upstreams' working trees are small enough to commit (API `size` includes history; LFS objects likely excluded) | P4 | The decision to prune/exclude changes; the ledger can record it later but re-import cost is a day |
| A3 | No case collisions / reserved names / >260-char paths exist in the four trees | I6 | Import halts at the gate; each hit needs an exclude decision |
| A4 | `bun install --frozen-lockfile` in `vendor/oh-my-pi` works with the installed Bun 1.4.2 (`packageManager: bun@>=1.4`) | Build orchestration | Upgrade to 1.4.4, or accept a lockfile rewrite (which would violate I3) |
| A5 | Upstream `hermes-agent/web` is npm-driven (`package-lock.json` in `.gitattributes`) | Build orchestration | Wrong package manager in `vendor-build`; fix is one recipe line |
| A6 | `reuse` and `pip-licenses` are legitimate despite SUS verdicts | Legitimacy audit | If wrong, they are dev-only tools in a sandboxed CI step, and can be dropped — neither is needed for IMPT-01/03/05/06 |
| A7 | GitHub keeps serving `--filter=blob:none` and the recorded SHAs forever | Replay | If a SHA is deleted upstream, only committed snapshots (option B) can restore reproducibility |
| A8 | Hindsight and Hermes Python graphs cannot be unified now | Patterns | If they can, the layout could be simpler — but the uv docs are explicit about the intersection rule |
| A9 | Vendored `.github/workflows` content is inert because only the repository-root workflows directory is executed | Runtime State Inventory | If wrong, upstream CI could attempt to run against HALO's repo and fail loudly (never silently ship), so the blast radius is CI noise |

---

## Open Questions

1. **How big are the working trees, really?**
   *Known:* GitHub `size` is 0.7 GB / 1.3 GB / 0.8 GB / 0.5 MB.
   *Unclear:* how much is history vs. tree vs. LFS.
   *Recommendation:* measure with `du` after fetch, before the first commit; decide excludes then.
   *(RESOLVED: measured at import time — `import` in `stage.ts` prints `SIZE <tree> files=<n> bytes=<n>` from `git ls-tree -r -l <sha>` before extraction, and the importing task stops at the 600 MB budget, recording the measured figure in the SUMMARY. Owner of the signal: plan 01-01 Task 1, which every later import reuses; consumers: 01-03 Task 2 for `hermes-agent`, 01-03 Task 3 for `hindsight`, 01-04 Task 1 for `oh-my-pi`.)*
2. **Do the trees contain symlinks or gitlinks?**
   *Known:* neither repo's `.gitattributes` proves anything either way.
   *Recommendation:* the I6 pre-flight answers it in seconds; the plan must not assume "no".
   *(RESOLVED: the preflight enumerates `git ls-tree -r` and gates both modes — a `160000` entry exits 2 with `submodule entry: <path>`, and every `120000` link text is read from the blob and rejected when absolute or escaping (T-1-11). Owners: plan 01-01 Task 1 (gate scaffolding), 01-02 Task 3 (symlink gate), 01-04 Task 1 (assert on the largest tree).)*
3. **Does `hindsight` support Python 3.13/3.14?**
   *Known:* its `pyproject.toml` is a uv workspace with constraints; `requires-python` was not read (the file begins with `[tool.uv.workspace]`).
   *Recommendation:* read `requires-python` at import and record it in `UPSTREAM.json`; do not assume the system 3.13.15 is acceptable.
   *(RESOLVED: plan 01-03 reads `requires-python` at import and records it in `UPSTREAM.json.notes`; this root declares none, so the members' declarations (`hindsight-api`, `hindsight-all`, `hindsight-embed` all `>=3.11`) are recorded under `notes["requires-python-members"]` and the root is recorded as declaring none. Phase 1 makes no claim that the system interpreter can run either Python tree, and no install is attempted.)*
4. **Where does the replay run — local pre-commit or CI only?**
   *Known:* `provenance-verify` is cheap; `provenance-replay` needs the cache.
   *Recommendation:* verify on every commit (hook + CI), replay on CI with a cached bare mirror.
   *(RESOLVED: DEC-09 + DEC-02 — `provenance-verify` runs in the `.githooks/pre-commit` hook (plan 01-08) and in CI; `provenance-replay` runs from the root `justfile` and in the `.github/workflows/provenance.yml` job (plan 01-09), with the bare cache restored and a `fetch --all --from-ledger` step covering a cold cache.)*
5. **Is the "synthetic upstream fix" drill a permanent test or a one-off acceptance?**
   *Recommendation:* permanent, against a tiny fixture repo — it is the only test that proves IMPT-05 stays true after Phase 1.
   *(RESOLVED: DEC-10 — permanent fixture-backed test at `tests/provenance/cve-drill.test.ts`, owned by plan 01-07 Task 3 and listed in every watch entry's `contract_tests`.)*
6. **Does `vendor-build` belong in Phase 1 at all?**
   *Recommendation:* yes, but only as a smoke gate, because "the import is faithful" and "the import compiles" are different claims and the phase should report them separately.
   *(RESOLVED — superseded by DEC-08: `vendor-build` is out of the Phase 1 gate. `cargo`/Node 24 are absent and a red build would block the phase without saying anything about provenance; the compilation smoke moves to the first phase that needs a built core.)*

---

## Environment Availability

Probed on 2026-10-23 on this workstation (`win32 10.0.26300`, x64).

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| git | everything | ✓ | 2.55.0.windows.3 | — |
| git-lfs | IMPT-06 | ✓ | 3.7.1 | — |
| `git subtree` (contrib) | *rejected alternative* | ✓ | bundled | not needed |
| bsdtar | extraction | ✓ | 3.8.9 | 7-Zip (**not installed**) |
| bun | provenance tool + tests + JS install | ✓ | 1.4.2 | upgrade to 1.4.4 (pin) |
| node | gsd-omp, hermes `web/` | ✓ | 22.23.2 | gsd-omp wants ≥24 — non-gating |
| npm | `web/`, gsd-omp | ✓ | 10.9.8 | bun as installer |
| uv | Python trees | ✓ | 0.12.17 | upgrade to 0.13.5 (pin) |
| python | Python trees | ✓ | 3.13.15 | uv-managed 3.14 |
| PowerShell | `just` recipes | ✓ | 7.6.7 | — |
| just | build entry point | ✗ | — | install `Casey.Just` 1.59.0 via winget (verified present) |
| cargo / rustc | `vendor-build` Rust | ✗ | — | install `Rustlang.Rustup` 1.29.1 via winget |
| winget | bootstrap | ✓ | 1.29.380 | download MSIs manually |
| quilt | *format only* | ✗ | — | not needed (`git apply`) |
| GNU patch | — | ✓ | 2.7.6 | not needed |
| 7z | — | ✗ | — | bsdtar |
| `core.autocrlf` (system) | line-ending safety | **true** | `C:/Program Files/Git/etc/gitconfig` | must be neutralised per-command/per-repo |
| `core.filemode` (repo) | exec-bit fidelity | false | `.git/config` | index modes + `update-index --chmod` |

**Missing dependencies with no fallback:** `just`, `cargo` — both installable via winget; there is no viable substitute for `cargo` when building the Rust core.
**Missing dependencies with fallback:** `7z` (bsdtar), `quilt` (git apply), Node ≥24 (defer gsd-omp tests), `reuse`/`pip-licenses` (optional tooling).

---

## Validation Architecture

`workflow.nyquist_validation` is `true` (`.planning/config.json:24`), so this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `bun test` — built into Bun 1.4.2, zero install; fixture repos created with git plumbing |
| Config file | none needed; `tools/provenance/package.json` only if the tool is later published |
| Quick run command | `bun test tools/provenance --timeout 20000` |
| Full suite command | `just verify` (= `provenance-replay` + `bun test tools/provenance` + `bun test tests/provenance` + `vendor-build`) |
| Hermetic fixture | `tests/provenance/fixtures/tiny-upstream/` — a 10-file git repo built by a script: LF file, CRLF file, 100755 script, 120000 symlink, an LFS pointer, a lockfile, a `LICENSE`, a CRLF `.bat`, a file with a Unicode name, and a deliberately hostile-name branch for negative tests |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| IMPT-01 | Each subtree has a schema-valid `UPSTREAM.json` whose `commit` resolves and whose recorded digests match the ledger files | unit + integration | `bun test tools/provenance/test/upstream-json.test.ts` | ❌ Wave 0 |
| IMPT-01 | No vendored file lacks a patch entry (unrecorded-edit detector) | integration | `bun test tests/provenance/unrecorded-edit.test.ts` | ❌ Wave 0 |
| IMPT-02 | `LICENSE` byte-identical to upstream blob after every commit | unit | `bun test tools/provenance/test/license-pin.test.ts` | ❌ Wave 0 |
| IMPT-02 | Rebrand deny-list leaves licence paths byte-identical (fixture run) | integration | `bun test tests/provenance/rebrand-denylist.test.ts` | ❌ Wave 0 |
| IMPT-03 | Replay reconstructs the tiny fixture from SHA + patches and passes | integration | `bun test tests/provenance/replay-tiny.test.ts` | ❌ Wave 0 |
| IMPT-03 | Replay fails on: modified byte, added file, removed file, changed mode, broken patch order | integration (5 negative cases) | `bun test tests/provenance/replay-drift.test.ts` | ❌ Wave 0 |
| IMPT-03 | Real replay for all four trees | CI job | `just provenance-replay` | ❌ Wave 0 (self-hosting) |
| IMPT-05 | `provenance-where <upstream path>` returns the local path | unit | `bun test tools/provenance/test/paths-resolve.test.ts` | ❌ Wave 0 |
| IMPT-05 | `provenance-where <symbol>` reverse-resolves through a synthetic `RENAMES.json` | unit | `bun test tools/provenance/test/renames-reverse.test.ts` | ❌ Wave 0 |
| IMPT-05 | End-to-end triage drill: synthetic CVE diff → patch → replay green | integration | `bun test tests/provenance/cve-drill.test.ts` | ❌ Wave 0 |
| IMPT-06 | Filter detector: staged CRLF under `text=auto` must fail I1 | unit (negative) | `bun test tools/provenance/test/fidelity-attributes.test.ts` | ❌ Wave 0 |
| IMPT-06 | LFS pointer manifest round-trip; `sha256` vs `oid` check | unit | `bun test tools/provenance/test/lfs.test.ts` | ❌ Wave 0 |
| IMPT-06 | Lockfile set present and byte-identical | integration | `bun test tests/provenance/lockfiles.test.ts` | ❌ Wave 0 |
| IMPT-06 | Hostile-path gate: case collision, reserved name, trailing dot, long path | unit (4 negative) | `bun test tools/provenance/test/win-paths.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `bun test tools/provenance` (target < 15 s; the fixture repo makes this possible).
- **Per wave merge:** `just provenance-verify` + `bun test tests/provenance` (offline, < 2 min).
- **Phase gate:** `just provenance-replay` against all four real trees + `just vendor-build`; both must be green before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `tools/provenance/{cli,manifest,fetch,stage,replay,verify,where}.ts` — the tool itself (zero external deps: `node:fs`, `node:crypto`, `child_process`)
- [ ] `tools/provenance/test/*.test.ts` — 8 unit suites listed above
- [ ] `tests/provenance/fixtures/make-fixture.ts` — builds the hermetic tiny-upstream repo (including a deliberately hostile-path variant)
- [ ] `tests/provenance/*.test.ts` — 7 integration suites listed above
- [ ] `provenance/schema/*.schema.json` — one schema per ledger file
- [ ] `justfile` — `bootstrap`, `provenance-fetch`, `provenance-verify`, `provenance-replay`, `vendor-build`, `verify`
- [ ] `.gitignore`, `.gitattributes`, root `package.json`
- [ ] No framework install needed (`bun test` is built in).

---

## Security Domain

`security_enforcement` is `true`, ASVS level 1 (`.planning/config.json:48`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | no | no runtime auth in this phase |
| V3 Session Management | no | — |
| V4 Access Control | partial | CI credentials for upstream fetch; no write tokens in the replay job |
| V5 Input Validation | **yes** | JSON Schema validation of every ledger file; path validation (traversal, reserved names, absolute paths) on every path read from a ledger or archive |
| V6 Cryptography | **yes** | SHA-256 / SHA-1 via git and `node:crypto` only; never hand-rolled hashing or comparison |
| V7 Error handling / logging | partial | replay must print paths and hashes, never file contents of unpinned downloads |
| V9 Communication | partial | HTTPS git only; no `http://` remotes, no `--remote` archive over plaintext |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Archive/path traversal (`../` in tar entries or ledger paths) | Tampering | Extract with bsdtar into a dedicated dir; validate every path is relative, normalized, and inside the target; never pass `--unsafe-paths` to `git apply` |
| Malicious patch series | Tampering / Elevation | Patches are reviewed code; `git apply --check` first; replay applies only files listed in `series`, in order |
| Upstream supply-chain substitution | Spoofing | Pin SHA + verify `cat-file -e <sha>^{commit}`; record `object_format`; record tool versions in `UPSTREAM.json` |
| Execution of unreviewed upstream code | Elevation | No `bun install`/`npm ci`/`cargo build` during import; imports are data operations only |
| Ledger tampering (editing a manifest to hide drift) | Repudiation | `manifest_sha256` in `UPSTREAM.json`; CI compares the checked-in digest against a recomputation |
| Secret leakage through vendored `.env.example` | Information disclosure | Files are content; the importer never reads `.env*` into logs; `UPSTREAM.json` records paths, not contents |
| Case-collision overwrite (one file silently replaces another) | Tampering | I6 gate before extraction |

---

## Sources

### Primary (HIGH confidence — read or executed this session)
- `git --version` → 2.55.0.windows.3; `git lfs version` → 3.7.1; `tar --version` → bsdtar 3.8.9; `bun --version` → 1.4.2; `uv --version` → 0.12.17; `python --version` → 3.13.15; `pwsh` → 7.6.7; `winget --version` → 1.29.380
- `git config --list --show-origin` → `file:C:/Program Files/Git/etc/gitconfig core.autocrlf=true`, `file:.git/config core.filemode=false`
- https://git-scm.com/docs/git-hash-object — `--no-filters` "ignoring any input filter… including the end-of-line conversion"
- https://git-scm.com/docs/gitattributes — text/eol/precedence/`binary` macro/`git add --renormalize`
- https://git-scm.com/docs/git-config — `core.autocrlf`, `core.fileMode`, `core.symlinks`, `uploadpack.allowReachableSHA1InWant`, `uploadpack.allowAnySHA1InWant`
- https://git-scm.com/docs/git-update-index — `--chmod=(+|-)x`; the unreliable-executable-bit note
- https://git-scm.com/docs/git-ls-files — `--eol`, `i/` `w/` `attr/`
- https://git-scm.com/docs/git-check-attr — `-a`, `--source`
- https://git-scm.com/docs/git-archive — attributes limited to `export-ignore`/`export-subst`; commit id in pax header
- https://git-scm.com/docs/git-apply — works outside a repo; `--directory`; `--check`; `--unsafe-paths` opt-in
- https://git-scm.com/docs/git-fetch — `--filter=blob:none`, `--depth`
- https://git-scm.com/docs/git-ls-tree, https://git-scm.com/docs/git-cat-file, https://git-scm.com/docs/git-log (`--find-object`), https://git-scm.com/docs/git-bundle
- https://git-scm.com/docs/git-diff — `--no-index`, `--binary`
- https://git-scm.com/docs/git-format-patch — `--full-index`, `--binary`, `--no-numbered`
- https://raw.githubusercontent.com/git/git/master/contrib/subtree/git-subtree.adoc — `--squash` semantics
- https://raw.githubusercontent.com/git-lfs/git-lfs/main/docs/spec.md — pointer grammar
- https://raw.githubusercontent.com/git-lfs/git-lfs/main/docs/man/git-lfs-ls-files.adoc — `--json --long --size`, `*`/`-` markers
- https://doc.rust-lang.org/cargo/reference/workspaces.html — member capture, `exclude`, root-only `[profile]`
- https://docs.astral.sh/uv/concepts/projects/workspaces/ — single `requires-python`, conflicting requirements
- https://docs.astral.sh/uv/reference/cli/ — `--project`, `--directory`, `--locked`
- https://bun.com/docs/pm/workspaces — glob/negative patterns, `installConfig.hoistingLimits`
- https://manpages.debian.org/bookworm/quilt/quilt.1.en.html — `series` format and stack semantics
- https://google.github.io/osv.dev/post-v1-query/ — commit queries
- https://spdx.org/licenses/MIT.html — verbatim MIT text
- https://reuse.software/spec-3.3/ — REUSE 3.3, `REUSE.toml`, precedence, DEP5 deprecated
- https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file — reserved names, reserved characters, trailing dot/space, case-insensitivity
- https://gitforwindows.org/git-cannot-create-a-file-or-directory-with-a-long-path.html — `core.longpaths` off by default
- GitHub REST API `repos/{owner}/{repo}` and `contents/` — sizes, licences, default branches, root layouts (read 2026-10-23)
- `git ls-remote` — current SHAs; `GIT_TRACE_PACKET=1 git ls-remote` — `fetch=shallow wait-for-done filter`, `object-format=sha1`
- `raw.githubusercontent.com` reads of each repo's `.gitattributes`, `package.json`, `Cargo.toml`, `pyproject.toml`
- `gsd-tools query package-legitimacy check` — verdicts for `license-checker`, `license-checker-rseidelsohn`, `reuse`, `pip-licenses`, `cargo-about`, `cargo-deny`

### Secondary (MEDIUM)
- `.planning/research/STACK.md` — pins for Bun 1.4.4, Rust 1.99.1, uv 0.13.5, just 1.59.0, ast-grep 0.51.0
- `.planning/research/PITFALLS.md` P-01 / P-02 — ledger and MIT framing (independently re-verified here)
- `.planning/research/ARCHITECTURE.md` §7/§8 — `vendor/` layout and the P1 exit gate

### Tertiary (LOW / inference)
- Working-tree sizes and the LFS object set — not measured; inferred from API size fields
- Bun's behaviour with a nested workspace root — untested `[INFERENCE]`

---

## Metadata

**Confidence breakdown:**
- Import mechanics (archive vs subtree vs checkout): **HIGH** — documented behaviour, one live capability probe
- Fidelity verification: **HIGH** — every check uses a documented primitive; only `git archive`'s non-conversion is inferred (and is fail-closed)
- Ledger schemas: **MEDIUM** — sound design, but naming/shape are HALO inventions and will evolve
- Replay/offline: **MEDIUM** — plumbing is documented; the offline trade-off is a real cost, not a solved problem
- MIT/notice mechanics: **HIGH** on obligation, **MEDIUM** on which convention to adopt
- Build isolation: **HIGH** on the conflicts, **MEDIUM** on exact per-tree commands (scripts unread)
- Sizing/exclusions: **LOW** — must be measured after fetch

**Research date:** 2026-10-23
**Valid until:** ~2026-11-22 for tooling/doc facts (30 days); re-resolve upstream SHAs and re-run the capability probe at import time regardless — they are expected to move.

---

## What the Planner Must Decide

1. **Import scope.** Import all four trees whole, or record excludes (docs assets, images, non-English READMEs, examples) in `EXCLUDES.json`? Decide *after* measuring the fetched working trees; the ledger makes the decision reversible only in the "we excluded it" direction.
2. **Offline replay.** Network-backed replay with a manifest oracle (recommended default) vs. committing pristine snapshots for fully air-gapped CI. This is a repo-weight vs. reproducibility trade-off with no free option.
3. **Manifest granularity.** Full per-file TSV (diagnosable, a few MB per tree) vs. a single tree digest (tiny, useless when it drifts). Recommendation: full TSV.
4. **Workspace unification in Phase 1.** Keep four isolated build roots (recommended, and what the uv/Cargo docs force) vs. attempt a unified root workspace now. If unified, which tree's version constraints win?
5. **Notice convention.** Plain generated `THIRD_PARTY_NOTICES.txt` (recommended) vs. adopting REUSE 3.3 as the machine-checkable layer — the latter adds `LICENSES/`, `REUSE.toml`, and a tool that the legitimacy gate flagged SUS (requires a human-verify checkpoint).
6. **Toolchain language for `tools/provenance`.** Bun/TS (recommended: zero install, `bun test` built in) vs. Python (uv project, but bootstraps later).
7. **Binary edits policy.** Text patches only, with whole-file replacements in `overrides/` (recommended) vs. attempting binary diffs. LFS-tracked `.wasm` files must never be edited.
8. **Phase-1 `vendor-build` scope.** Smoke-build all four trees (needs `cargo` + Node 24) vs. verify-and-import only, deferring compilation. Either is defensible; say which, because a red `vendor-build` at phase gate blocks verification.
9. **Where the replay job runs.** CI with a cached bare mirror (recommended) vs. developer-local only. The cached-mirror retention policy needs a number (days/size) before CI costs become a surprise.
10. **The synthetic-CVE drill's permanence.** Ship it as a permanent fixture-backed test (recommended — it is the only guard that IMPT-05 stays true) or as a one-off acceptance script.
