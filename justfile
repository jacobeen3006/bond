# justfile — the only entry point. Every recipe is idempotent.
#
# Every provenance recipe takes a named `tree` parameter (empty = `--all`);
# `provenance-where` additionally takes `query` first. PowerShell does not pass
# positional recipe arguments the way POSIX shells do, so just hands the recipe
# the literal `name=value` token; the recipes strip that prefix and pass the
# bare value. Named on the command line, the documented forms work:
#   just provenance-where query=docs/rpc.md tree=oh-my-pi
#   just provenance-replay tree=gsd-omp
#
# `bun.exe`, not `bun`: this workstation's PATH also holds an extensionless bun
# that PowerShell resolves but does not execute, so the recipes name the file.

[windows]
set shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]

default:
    @just --list

# Installs the one missing host tool. Nothing else is installed (DEC-11).
bootstrap:
    @$present = Get-Command just -ErrorAction SilentlyContinue; if ($present) { just --version } elseif (winget list --id Casey.Just --exact | Select-String -Quiet 'Casey\.Just') { Write-Output 'just is already installed; restart the shell to refresh PATH' } else { winget install --id Casey.Just --exact --accept-source-agreements --accept-package-agreements }

# Network; populates the gitignored upstream-cache/. Empty tree selects --all.
provenance-fetch tree="":
    bun.exe run tools/provenance/cli.ts fetch {{ if replace(tree, "tree=", "") == "" { "--all" } else { "--tree " + replace(tree, "tree=", "") } }}

# Archives the resolved commit, stages it, and writes the ledger. Network on a
# cold cache; `--fixture` (offline) is available through the CLI directly.

# Import the pinned commits.
provenance-import tree="":
    bun.exe run tools/provenance/cli.ts import {{ if replace(tree, "tree=", "") == "" { "--all" } else { "--tree " + replace(tree, "tree=", "") } }}

# Re-derives PATHS/RENAMES/EXCLUDES from the pinned commit; fails on drift.
provenance-ledger tree="":
    bun.exe run tools/provenance/cli.ts ledger {{ if replace(tree, "tree=", "") == "" { "--all" } else { "--tree " + replace(tree, "tree=", "") } }}

# Stages the worktree and refreshes the vendored manifest after a patch.
provenance-manifest tree="":
    bun.exe run tools/provenance/cli.ts manifest {{ if replace(tree, "tree=", "") == "" { "--all" } else { "--tree " + replace(tree, "tree=", "") } }}

# Reconstructs from SHA + patches/series + renames; fails on drift.
provenance-replay tree="":
    bun.exe run tools/provenance/cli.ts replay {{ if replace(tree, "tree=", "") == "" { "--all" } else { "--tree " + replace(tree, "tree=", "") } }}

# The offline ledger gate: digests, index, worktree, unrecorded edits.
provenance-verify tree="":
    bun.exe run tools/provenance/cli.ts verify {{ if replace(tree, "tree=", "") == "" { "--all" } else { "--tree " + replace(tree, "tree=", "") } }}

# IMPT-05 lookup: an upstream path or symbol to its local path, or reverse.
provenance-where query="" tree="":
    bun.exe run tools/provenance/cli.ts where "{{ replace(query, "query=", "") }}" {{ if replace(tree, "tree=", "") == "" { "" } else { "--tree " + replace(tree, "tree=", "") } }}

# Re-pins every licence-ish path from the upstream manifest, by raw bytes.
provenance-license tree="":
    bun.exe run tools/provenance/cli.ts license {{ if replace(tree, "tree=", "") == "" { "--all" } else { "--tree " + replace(tree, "tree=", "") } }}

# Git LFS inventory and pointer check. Never touches the network.
provenance-lfs tree="":
    bun.exe run tools/provenance/cli.ts lfs {{ if replace(tree, "tree=", "") == "" { "--all" } else { "--tree " + replace(tree, "tree=", "") } }}

# The two provenance suites, split so a failure names the layer it came from.
provenance-tests:
    bun.exe test tools/provenance
    bun.exe test tests/provenance

# The single gate. Step 0 rehydrates the gitignored cache from each ledger: a
# no-op when warm, and the difference between green and `exit 2` on a clone
# that has never fetched. Every later step fails closed, and just stops at the
# first non-zero exit. CI runs this exact recipe.

# Run the whole provenance gate.
verify:
    bun.exe run tools/provenance/cli.ts fetch --all
    bun.exe run tools/provenance/cli.ts verify --all
    bun.exe run tools/provenance/cli.ts replay --all
    bun.exe test tools/provenance
    bun.exe test tests/provenance
