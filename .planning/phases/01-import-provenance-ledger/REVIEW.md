---
phase: 01-import-provenance-ledger
reviewed: 2026-10-25T00:00:00Z
depth: deep
files_reviewed: 23
files_reviewed_list:
  - tools/provenance/paths.ts
  - tools/provenance/fetch.ts
  - tools/provenance/stage.ts
  - tools/provenance/verify.ts
  - tools/provenance/replay.ts
  - tools/provenance/lfs.ts
  - tools/provenance/license.ts
  - tools/provenance/where.ts
  - tools/provenance/manifest.ts
  - tools/provenance/ledger.ts
  - tools/provenance/cli.ts
  - .githooks/pre-commit
  - justfile
  - .github/workflows/provenance.yml
  - provenance/watchlist.json
  - provenance/rebrand-denylist.json
  - provenance/schema/lfs.schema.json
  - provenance/schema/renames.schema.json
  - provenance/schema/denylist.schema.json
  - provenance/schema/upstream.schema.json
  - provenance/schema/watchlist.schema.json
  - provenance/schema/excludes.schema.json
  - provenance/schema/paths.schema.json
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-10-25T00:00:00Z
**Depth:** deep
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Deep adversarial review of the Phase 1 "Import & Provenance Ledger" provenance subsystem: the 11 TypeScript modules under `tools/provenance/`, the pre-commit gate, the `justfile` recipes, the CI workflow, and the 7 JSON schemas plus the two committed JSON documents.

**All security design invariants hold.** The import path never runs `git clone`/`checkout` (the smudge-filter byte-rewrite risk is avoided; `git archive` + `tar -x` is used instead). Every `git()` call applies a CRLF+filter-neutral `NEUTRAL_CONFIG`. The pre-extraction `assertSafeArchiveEntries` gate runs on the `tar -tf` listing BEFORE `tar -x` in both the import and the replay, on the same temp file (no TOCTOU). The symlink gate `validateSymlinkTarget` refuses absolute, drive-letter, UNC, and escape targets. The four-digest TAMPERED gate (upstream manifest, vendored manifest, excludes, renames) runs before any per-file comparison in both `verifyTree` and `replayTree`. HTTPS-only remotes are enforced through the `TREE_REPOS` registry (never built from argv), and `verify.ts` re-checks the `repo` field against `^https://`. All git/tar invocations use `execFileSync` with argv arrays — no shell injection anywhere in the pre-commit hook, the justfile, or the CI workflow. No secrets or credentials appear in any reviewed file. `hashBlobs` (manifest.ts) is fail-closed (throws `batch-missing` on a non-blob header). `parsePointer` (lfs.ts) is a thorough grammar check. `decodeGitPath` (verify.ts) handles octal and escape sequences correctly. `globToRegExp` (license.ts) correctly maps `**/` to `(?:.*/)?`. The `rebrand-denylist.json` is well-formed and matches `assertDenylistShape`. The `upstream.schema.json` is thorough (HTTPS repo pattern, 40-hex commit, const staging values).

**One Warning** (a latent divergence between the two LFS-inventory writers) and **four Info** items (robustness and design-observation notes). No Critical findings.

## Warnings

### WR-01: `deriveLfsLedger` reads only the root `.gitattributes`; `emitLfsInventory` reads all of them

**File:** `tools/provenance/lfs.ts:403` (vs. `tools/provenance/stage.ts:511`)
**Issue:** `deriveLfsLedger` (the `--write` path) reads ONLY the root `.gitattributes` via `git(['show', `${upstream.commit}:.gitattributes`]`, falling back to `''` on error). But `emitLfsInventory` (the import path) reads ALL `.gitattributes` files via `rows.filter((row) => row.path.split('/').pop() === '.gitattributes')`. For a tree with subdirectory LFS declarations, `--write` would produce a different `upstream_gitattributes_lfs_lines` than the import, breaking the "byte-identical derivation" invariant the module doc promises ("This is the only writer, so the committed document and a fresh derivation agree byte for byte"). Because `verifyTree` (lfs.ts) derives its patterns from `upstream_gitattributes_lfs_lines`, a document produced by `--write` for such a tree would cause `--check` to under-check the subdirectory-declared LFS paths. Latent: the current four trees declare LFS only in the root `.gitattributes`, so it does not manifest today.
**Fix:** Make `deriveLfsLedger` enumerate every `.gitattributes` in the tree (via `git ls-tree`, exactly as `emitLfsInventory` does) rather than `git show <commit>:.gitattributes`, or route both writers through one shared reader so the "one matcher, two callers" principle holds for the LFS inventory as it does for the deny-list.

## Info

### IN-01: `readBlobs` breaks (fail-open) on a missing object; `hashBlobs` throws (fail-closed)

**File:** `tools/provenance/stage.ts:448`
**Issue:** The `git cat-file --batch` parse loop does `if (header[1] !== 'blob' || !Number.isFinite(size)) break;`. A missing object (`<oid> missing`) has `header[1] === 'missing'`, so the loop `break`s and drops ALL subsequent objects. Contrast `hashBlobs` (manifest.ts) which THROWS (`batch-missing`) on the same condition. In `emitLfsInventory`, a missing attribute blob throws (`unreadable attributes`) but a missing candidate blob is silently skipped (`if (bytes === undefined) continue;`) — fail-open. Impact is limited (OIDs come from the complete `readTreeRows` tree), but it is a robustness inconsistency: a corrupted cache would silently produce an incomplete LFS inventory rather than failing.
**Fix:** `continue` past a `missing` header (skip just that object) or throw like `hashBlobs`, so a corrupted cache fails loudly instead of silently dropping the rest of the batch.

### IN-02: `GLOB_CACHE` is an unbounded module-level `Map`

**File:** `tools/provenance/paths.ts:212`
**Issue:** `GLOB_CACHE` is a module-level `Map<string, RegExp>` that caches compiled regexes. It is unbounded, but in practice the number of distinct globs is small (a few dozen: exclude rules, LFS patterns, deny-list globs, watch paths). Not a real memory concern, but worth noting for completeness.
**Fix:** No action required; the cache is bounded in practice. If the glob set were ever to grow unbounded (e.g., user-supplied globs), consider an LRU bound.

### IN-03: `matchesAttributePattern` uses `globToRegExp` for `.gitattributes` patterns with different semantics

**File:** `tools/provenance/lfs.ts:201`
**Issue:** `matchesAttributePattern` uses `globToRegExp` (paths.ts) for `.gitattributes` patterns, but `.gitattributes` patterns have their own semantics (e.g., a leading `/` anchors the pattern to the root of the tree). A pattern like `/assets/*.bin` would not match `assets/foo.bin` because `globToRegExp` treats `/` as a literal and the test path is tree-relative (no leading `/`). Edge case: the current trees use `*.wasm` (no slash, no leading `/`), so it does not manifest today.
**Fix:** If subdirectory-anchored `.gitattributes` patterns are ever used, strip a leading `/` from the pattern before matching, or implement the `.gitattributes` pattern semantics (root-anchoring, `**` spanning) explicitly.

### IN-04: `just verify` does not run the LFS, deny-list, or license steps

**File:** `justfile:74`
**Issue:** The `verify` recipe runs `fetch --all` → `verify --all` → `replay --all` → both test suites, but NOT `lfs --all`, `denylist-check`, or `license`. The `verify` command catches a pointer→payload substitution via the manifest digest (`MODIFIED`), so the gate is sufficient for detecting payload substitution; the LFS check is an optional belt-and-suspenders that adds the declared oid/size. The deny-list check is a Phase 2 concern (the rewriter). The license re-pin is idempotent and not a gate. Deliberate, but worth noting that these three checks are not enforced by the gate.
**Fix:** No action required; the gate is sufficient. If the LFS check is ever promoted to a gate requirement, add `bun.exe run tools/provenance/cli.ts lfs --all` to the `verify` recipe.

---

_Reviewed: 2026-10-25T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
