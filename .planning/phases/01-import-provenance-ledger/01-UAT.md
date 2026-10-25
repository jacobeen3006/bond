---
status: complete
phase: 01-import-provenance-ledger
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md, 01-05-SUMMARY.md, 01-06-SUMMARY.md, 01-07-SUMMARY.md, 01-08-SUMMARY.md, 01-09-SUMMARY.md]
started: 2026-10-25T00:00:00Z
updated: 2026-10-25T17:31:10.534Z
---

## Current Test

[testing complete]

## Tests

### 1. gsd-omp imported at recorded SHA with UPSTREAM.json and both manifests, every digest recomputes
expected: gsd-omp is imported at a recorded SHA with UPSTREAM.json and both manifests, and every digest recomputes
result: pass
source: automated
coverage_id: 01-01/D1

### 2. replay reconstructs the tree from SHA + patches/series + RENAMES.json, byte-for-byte
expected: replay reconstructs the tree from SHA + patches/series + RENAMES.json and compares byte-for-byte
result: pass
source: automated
coverage_id: 01-01/D2

### 3. manifest canonical form, UPSTREAM.json schema, archive gate and IMPT-01/IMPT-03 edges are executable assertions
expected: manifest canonical form, UPSTREAM.json schema, archive gate and the IMPT-01/IMPT-03 edges are executable assertions
result: pass
source: automated
coverage_id: 01-01/D3

### 4. just provenance-replay tree=gsd-omp is the single documented command and reproduces the imported tree
expected: just provenance-replay tree=gsd-omp is the single documented command and reproduces the imported tree
result: pass
source: automated
coverage_id: 01-01/D4

### 5. hermetic fixture exists, is deterministic, self-reports ten shapes plus four hostile shapes
expected: The hermetic fixture exists, is deterministic, and self-reports its ten shapes plus four hostile shapes
result: pass
source: automated
coverage_id: 01-02/D1

### 6. case collisions, reserved names, trailing dots/spaces, over-long paths and every escape class are classified with the offending path named
expected: Case collisions, reserved names, trailing dots/spaces, over-long paths and every escape class are classified with the offending path named
result: pass
source: automated
coverage_id: 01-02/D2

### 7. a CRLF file staged under text=auto fails the fidelity detector; staging attributes yield index == raw == upstream OID
expected: A CRLF file staged under text=auto fails the fidelity detector, while the staging attributes yield index == raw == upstream OID
result: pass
source: automated
coverage_id: 01-02/D3

### 8. import then replay on the happy fixture reproduces ten files byte-identically offline, including empty-series and second-replay determinism edges
expected: Import then replay on the happy fixture reproduces ten files byte-identically offline, including the empty-series and second-replay determinism edges
result: pass
source: automated
coverage_id: 01-02/D4

### 9. four ledger schemas exist and every vendored tree's PATHS/RENAMES/EXCLUDES validate against them
expected: Four ledger schemas exist and every vendored tree's PATHS/RENAMES/EXCLUDES validate against them
result: pass
source: automated
coverage_id: 01-03/D1

### 10. ledger --tree is idempotent: unchanged bytes report LEDGER OK <tree> unchanged, drift exits 1
expected: `ledger --tree` is idempotent: unchanged bytes report `LEDGER OK <tree> unchanged`, drift exits 1
result: pass
source: automated
coverage_id: 01-03/D2

### 11. hermes-agent imported at its pinned SHA, byte-identical pyproject.toml, replayable, with a validated watch entry
expected: hermes-agent imported at its pinned SHA, byte-identical pyproject.toml, replayable, with a validated watch entry
result: pass
source: automated
coverage_id: 01-03/D3

### 12. hindsight imported at its pinned SHA with every lockfile recorded and its own uv/npm workspace roots preserved
expected: hindsight imported at its pinned SHA with every lockfile recorded and its own uv/npm workspace roots preserved
result: pass
source: automated
coverage_id: 01-03/D4

### 13. oh-my-pi is imported whole at its pinned SHA with a complete ledger, replayable byte-for-byte
expected: oh-my-pi is imported whole at its pinned SHA with a complete ledger, replayable byte-for-byte
result: pass
source: automated
coverage_id: 01-04/D1

### 14. LFS-tracked content is inventoried as pointers, with the payload never fetched into vendor/
expected: LFS-tracked content is inventoried as pointers, with the payload never fetched into vendor/
result: pass
source: automated
coverage_id: 01-04/D2

### 15. the three upstream build graphs are recorded and not absorbed
expected: The three upstream build graphs are recorded and not absorbed
result: pass
source: automated
coverage_id: 01-04/D3

### 16. every imported tree maps to a watch entry with verified paths and symbols
expected: Every imported tree maps to a watch entry with verified paths and symbols
result: pass
source: automated
coverage_id: 01-04/D4

### 17. every licence-ish path in all four imported trees is pinned in UPSTREAM.json.license.files by blob OID and raw-byte SHA-256
expected: Every licence-ish path in all four imported trees is pinned in UPSTREAM.json.license.files by blob OID and raw-byte SHA-256, with a recomputable line-wise copyright_notice_count
result: pass
source: automated
coverage_id: 01-05/D1

### 18. a machine-readable rebrand deny-list that covers every imported licence path, and a gate that fails on both a dead glob and an uncovered licence path
expected: A machine-readable rebrand deny-list that covers every imported licence path, and a gate that fails on both a dead glob and an uncovered licence path
result: pass
source: automated
coverage_id: 01-05/D2

### 19. proof that a filtered rewrite leaves every licence byte unchanged while an unfiltered one does not
expected: Proof that a filtered rewrite leaves every licence byte unchanged while an unfiltered one does not, so the guard is sensitive rather than vacuous
result: pass
source: automated
coverage_id: 01-05/D3

### 20. LFS pointer grammar parsed with typed line-numbered errors; edited oid, size drift, payload substitution and missing files each fail by name
expected: LFS pointer grammar parsed with typed line-numbered errors; edited oid, size drift, payload substitution and missing files each fail by name
result: pass
source: automated
coverage_id: 01-06/D1

### 21. vendor/oh-my-pi/provenance/LFS.json is schema-valid, derived from the cache at the pinned commit, and verifies clean against disk
expected: vendor/oh-my-pi/provenance/LFS.json is schema-valid, derived from the cache at the pinned commit, and verifies clean against disk
result: pass
source: automated
coverage_id: 01-06/D2

### 22. every lockfile the four trees ship is listed with a matching SHA-256, blob OIDs agree across both manifests and the git index, and undocumented lockfiles are reported by name
expected: Every lockfile the four trees ship is listed with a matching SHA-256, blob OIDs agree across both manifests and the git index, and undocumented lockfiles are reported by name
result: pass
source: automated
coverage_id: 01-06/D3

### 23. an upstream path or symbol resolves to a local path from the ledger, with the deciding rule, matching watch ids and an EXISTS probe
expected: An upstream path or symbol resolves to a local path from the ledger, with the deciding rule, matching watch ids and an EXISTS probe
result: pass
source: automated
coverage_id: 01-07/D1

### 24. reverse symbol lookup works against a schema-valid rename map, with collisions reported rather than resolved silently
expected: Reverse symbol lookup works against a schema-valid rename map, with collisions reported rather than resolved silently
result: pass
source: automated
coverage_id: 01-07/D2

### 25. a synthetic advisory is triaged end to end and a reordered series fails naming index and path
expected: A synthetic advisory is triaged end to end — commit pair, changed paths, local paths, watch and rename hits, a two-patch series, a restaged manifest and a green replay — and a reordered series fails naming index and path
result: pass
source: automated
coverage_id: 01-07/D3

### 26. offline provenance-verify recomputes all four ledger digests, compares index and worktree to MANIFEST.vendored.tsv, and reports one line per finding
expected: Offline `provenance-verify` recomputes all four ledger digests, compares index and worktree to MANIFEST.vendored.tsv, and reports one line per finding
result: pass
source: automated
coverage_id: 01-08/D1

### 27. a vendored edit with no entry in patches/series is named UNRECORDED and fails; a recorded patch clears it
expected: A vendored edit with no entry in patches/series is named UNRECORDED and fails; a recorded patch clears it
result: pass
source: automated
coverage_id: 01-08/D2

### 28. the four worktree/index drift classes (modified byte, added file, removed file, changed mode) are detected and named
expected: The four worktree/index drift classes (modified byte, added file, removed file, changed mode) are detected and named
result: pass
source: automated
coverage_id: 01-08/D3

### 29. committed-ledger drift prints exactly one TAMPERED line for the mutated ledger file before any per-file comparison
expected: Committed-ledger drift prints exactly one TAMPERED line for the mutated ledger file before any per-file comparison; a reordered series names the failing patch index and file
result: pass
source: automated
coverage_id: 01-08/D4

### 30. pre-commit hook refuses an unpatched vendored edit with an UNRECORDED line, allows a clean commit, and exits 0 for a .planning/-only commit
expected: A pre-commit hook refuses an unpatched vendored edit with an UNRECORDED line, allows a clean commit, and exits 0 for a commit that touches only .planning/
result: pass
coverage_id: 01-08/D5
note: verified via scratch-clone test (unpatched edit refused exit 1 with one UNRECORDED line; restored edit committed; .planning/-only commit committed); user confirmed pass

### 31. one command, just verify, runs the whole provenance gate and exits non-zero on any failure
expected: One command, `just verify`, runs the whole provenance gate and exits non-zero on any failure
result: pass
source: automated
coverage_id: 01-09/D1

### 32. all eleven subcommands are reachable through cli.ts with their module's own flags
expected: All eleven subcommands are reachable through cli.ts with their module's own flags
result: pass
source: automated
coverage_id: 01-09/D2

### 33. workspace isolation and the no-gitlink rule fail the suite if violated
expected: Workspace isolation and the no-gitlink rule fail the suite if violated
result: pass
source: automated
coverage_id: 01-09/D4

### 34. the provenance-replay CI job runs the same gate, from a cold cache, with a cache key derived from the recorded SHAs
expected: The `provenance-replay` CI job runs the same gate, from a cold cache, with a cache key derived from the recorded SHAs
result: pass
coverage_id: 01-09/D3
note: CI has never run (repo has no remote); shape asserted (WORKFLOW OK jobs=1 id=provenance-replay tokens=6); user accepted as sign-off — execution stays a known limitation until a remote exists

## Summary

total: 34
passed: 34
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
