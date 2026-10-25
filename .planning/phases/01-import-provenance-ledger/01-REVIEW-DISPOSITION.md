# Phase 01 Review Disposition

Advisory code review of Phase 1 (Import & Provenance Ledger). 0 Critical, 1 Warning, 4 Info. All security design invariants hold (no smudge-filter byte-rewrite path, CRLF+filter-neutral git config, pre-extraction archive gate, symlink gate, four-digest TAMPERED gate, HTTPS-only remotes, argv-array exec, fail-closed hashBlobs).

| ID | Severity | File | Finding | Disposition |
|----|----------|------|---------|-------------|
| WR-01 | Warning | tools/provenance/lfs.ts:403 | `deriveLfsLedger` reads only the root `.gitattributes` while `emitLfsInventory` (stage.ts:511) reads all of them; for a tree with subdirectory LFS declarations, `--write` would produce a different `upstream_gitattributes_lfs_lines` than the import, breaking the byte-identical derivation invariant and causing `--check` to under-check. Latent — current trees declare LFS only in the root `.gitattributes`. | open (latent; no current tree triggers it) |
| IN-01 | Info | tools/provenance | `readBlobs` fail-open on missing object (vs. `hashBlobs` fail-closed). | open |
| IN-02 | Info | tools/provenance | `GLOB_CACHE` unbounded (bounded in practice). | open |
| IN-03 | Info | tools/provenance | `matchesAttributePattern` `.gitattributes` leading-`/` semantics. | open |
| IN-04 | Info | justfile | `just verify` omits LFS/denylist/license steps (gate sufficient via manifest digest). | open |
