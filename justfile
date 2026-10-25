# justfile — the only entry point. Every recipe is idempotent.

[windows]
set shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]

default:
    @just --list

# Installs the one missing host tool. Nothing else is installed (DEC-11).
bootstrap:
    @$present = Get-Command just -ErrorAction SilentlyContinue; if ($present) { just --version } elseif (winget list --id Casey.Just --exact | Select-String -Quiet 'Casey\.Just') { Write-Output 'just is already installed; restart the shell to refresh PATH' } else { winget install --id Casey.Just --exact --accept-source-agreements --accept-package-agreements }

# Network; populates the gitignored upstream-cache/. Empty tree selects --all.
provenance-fetch tree="":
    bun.exe run tools/provenance/cli.ts fetch {{ if tree == "" { "--all" } else { "--tree " + replace(tree, "tree=", "") } }}

# Reconstructs from SHA + patches/series + renames; fails on drift.
provenance-replay tree="":
    bun.exe run tools/provenance/cli.ts replay {{ if tree == "" { "--all" } else { "--tree " + replace(tree, "tree=", "") } }}

# Stages the worktree and refreshes the vendored manifest after a patch.
provenance-manifest tree="":
    bun.exe run tools/provenance/cli.ts manifest {{ if tree == "" { "--all" } else { "--tree " + replace(tree, "tree=", "") } }}
