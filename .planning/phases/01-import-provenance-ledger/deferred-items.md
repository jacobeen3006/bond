# Deferred items — phase 01

Discoveries made during plan execution that fall outside the executing plan's
scope. The executor records them here instead of fixing them.

## From plan 01-09 (the gate)

| Item | Where | Why deferred |
|---|---|---|
| `vendor/<tree>/provenance/LFS.json` exists only for `oh-my-pi`. `gsd-omp`, `hermes-agent` and `hindsight` have none, so `lfs --all` (and therefore `just provenance-lfs`) exits 2 with `missing LFS inventory: vendor/<tree>/provenance/LFS.json`. Module and CLI behave identically; `just verify` does not include the LFS step, so the gate is unaffected. | `vendor/*/provenance/`, `tools/provenance/lfs.ts` | Plan 01-06 owns the LFS inventory artifact (its SUMMARY records only `vendor/oh-my-pi/provenance/LFS.json`). 01-09 only exposes the command. Decide whether the remaining trees need an inventory, or whether `--all` should skip trees whose upstream `.gitattributes` declares no LFS filter. |
| `.github/workflows/provenance.yml` has never executed. | `.github/workflows/provenance.yml` | Not a defect: the repository has no remote, and `provenance/README.md` states "workflow committed; remote not configured". Pushing to a remote activates it. |
