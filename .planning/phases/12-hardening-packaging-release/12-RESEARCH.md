# Research: Phase 12 — Hardening, Packaging & Release

**Phase:** 12 · **Mode:** mvp · **Granularity:** fine  
**Discovered:** 2026-10-26 · **Source of truth:** AGENTS.md / STACK.md / justfile / ROADMAP

---

## Executive Summary

Phase 12 closes the gap between an internally-built monorepo and a clean-installable desktop product on Windows. The single biggest unresolved risk is that **the justfile has no `build` recipe** — there are only `provenance-*`, `brand`, and `verify-*` recipes. A final end-to-end orchestrator command (`just build`) does not exist yet. All other areas have documented design decisions in AGENTS.md; this phase's work is mainly assembly, verification, and packaging glue.

---

## 1. Justfile Recipe Audit

### Finding

The current justfile contains:
- `provenance-*` family (check, verify, watchlist)
- `brand` (rebrand apply)
- `verify-*` (lint, test scaffolds)
- `cargo-*` wrappers around Rust toolchain
- `uv-sync`, `bun-*`, `electron-builder` packaging targets

**No `build` target exists.** No recipe chains cargo release → bun install → electron-builder → NSIS installer in a single invocation.

### Recommendation

Create a top-level `build` recipe in the justfile that:
```make
build:
	cargo build --release --locked
	bun install --frozen-lockfile
	uv sync --locked
	bun x electron-builder --win nsis --x64
```

Each step already has its own recipe; `build` ties them together with exit-on-failure semantics. Add a `--fast` flag variant that skips rebuilds when lockfiles haven't changed. Document this as the "one documented build command."

### Risk

If any step depends on environment variables set by previous steps (e.g., Python venv path), the recipe needs explicit `export` lines. Test on a fresh machine without Python installed.

---

## 2. Packaging Strategy

### Electron + electron-builder Configuration

From AGENTS.md, the packaging plan is well-defined:

| Component | Path in Bundle | asarUnpack? | extraResources? |
|-----------|----------------|-------------|-----------------|
| postgres.exe, lib/*, share/ | `resources/pg-binaries/` | Yes | Yes |
| pgvector vector.dll/control/sql | `resources/pg-binaries/share/extension/` | Yes | Yes |
| TEI embed server | `resources/tei-embed/` | Yes | Yes |
| TEI rerank server | `resources/tei-rerank/` | Yes | Yes |
| llama.cpp binaries (fallback) | `resources/llama-cpp/` | Yes | Yes |
| python-build-standalone runtime | `resources/python-runtime/` | Yes | Yes |
| uv executable | `resources/uv/` | Yes | Yes |

### Runtime Path Resolution

Sidecar supervisor resolves paths at startup using `path.join(app.getPath('userData'), '../..')` to find bundled sidecars next to the main executable. Key rule: **never hardcode relative paths** — always resolve from `app.getPath('exe').parent`.

### NSIS Installer Structure

The electron-builder NSIS config should:
- Run as non-elevated user (PostgreSQL refuses admin)
- Install to `%LOCALAPPDATA%\HALO\` (not `%APPDATA%` — roaming profile risk)
- Create Start Menu shortcut
- Auto-start option (optional, off by default)
- Register file association (optional)

### Version Pinning in Final Bundle

Lock versions at build time:
- `electron-builder --win nsis --x64` reads `package.json.version` for installer filename
- PG binaries from zonky artifact: versioned 18.6.0, baked at release time
- TEI built from pinned commit SHA, baked at release time
- Model weights downloaded at first-run with SHA-256 verification (see §5)

---

## 3. Orphan / Shutdown Contract

### Supervisor Lifecycle (from AGENTS.md)

```
Start: spawn postgres.exe directly (NOT pg_ctl start)
Health: pg_isready -h 127.0.0.1 -p <port> polls every 250ms, backoff to 2s
Stop:   pg_ctl stop -D <dir> -m fast (graceful)
        → wait 10s → taskkill /PID <pid> /T /F (force)
Restart: 250ms → 500ms → 1s → 2s → 4s → cap 30s
       >5 crashes in 10min → failed state, show diagnostic card
Exit code 0 = asked to stop: NEVER restart
```

### Single-Instance Locking

- Desktop: `app.requestSingleInstanceLock()`
- CLI: exclusive-create lock file in `%LOCALAPPDATA%\HALO\run\daemon.lock`; stale PID reclaimed

### Job Object Helper (Windows)

Wrap all sidecar children in a Windows Job Object so killing the parent process tree kills children too. This prevents orphaned child processes after crash or force-exit. The existing supervisor TS module needs a Job Object wrapper — check if it's already implemented in phases 01-11 or needs new creation.

---

## 4. Security Hardening Checklist

### Model Credentials

Hard boundary: credentials live ONLY in Hermes secret store. Never:
- Written to `.env`, `config.json`, or log files
- Printed in error messages or stack traces
- Passed as command-line arguments (visible in task manager)

The supervisor passes credentials via stdin or environment variable with restricted permissions. Log redaction must strip anything matching credential patterns before writing to disk.

### Non-UTF8 Child Output

Child processes (PostgreSQL, TEI, Python) may produce non-UTF8 output on Windows error codes or locale-specific messages. The supervisor pipe must:
- Read stdout/stderr as buffers (not strings)
- Replace invalid UTF-8 sequences with `[NON-UTF8]` placeholders
- Write line-prefixed logs (`[pg]`, `[tei:embed]`, etc.)

This was explicitly called out in AGENTS.md PLAT-06.

### MAX_PATH 260 Limit (PLAT-05)

Windows MAX_PATH applies to individual path components AND total path length. Potential bite points:
- Vendor directories deep in the tree (e.g., `node_modules/.pnpm/@scope+pkg@.../...`)
- Electron-builder output paths
- PostgreSQL data directory under `%LOCALAPPDATA%`

Mitigation: enable long path support in Windows registry (`HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled`), use short intermediate paths where possible, and add integration tests with deeply-named files.

### Offline Model Provisioning with SHA-256

At first-run (or install-time), download model files and verify against a SHA-256 manifest. If offline, skip downloads but fail gracefully (degraded badge, not spinner). Manifest stored alongside models or embedded in binary resources.

---

## 5. Bypass Matrix (GATE-04)

### Definition

"Every inventoried entry point" = every mechanism that can execute external commands or access system resources without passing through the policy gate. From phases 01-11, these include:

| Entry Point | Risk | Needs Gate? |
|------------|------|-------------|
| Plugin handlers (Hermes plugins) | Execute arbitrary tools/commands | Yes |
| MCP tool servers | Execute external processes | Yes |
| Host tools API | Execute shell commands | Yes |
| Subagent delegation | Spawn LLM workers with tool access | Yes |
| Cron/Kanban workers | Scheduled automated execution | Yes |
| Eval re-entry | Agent calling itself recursively | Yes |
| Renderer (Electron webview) | Script injection, DOM XSS | Depends |

### Concrete Test Requirement

The bypass matrix test should iterate every entry point listed above and attempt:
1. Executing a no-op command (e.g., `echo test`)
2. Checking if the command ran WITHOUT a policy decision
3. Asserting failure if unauthorized execution occurred

This is a structural test, not a functional one. It verifies that the policy gate exists at each point, not that it correctly handles specific tool invocations.

### Open Question

Which of these entry points are actually created by phases 01-11? Some may be deferred to later phases. Need to grep phase 12 plans against actual asset inventories from phases 01-11 to avoid testing hypothetical entry points.

---

## 6. Third-Party Notices / Import Compliance (IMPT-04, PLAT-08)

### Required Attribution

Four MIT-licensed subtrees plus three dependency ecosystems:

| Ecosystem | Components | Notice Location |
|-----------|------------|-----------------|
| Vendored subtrees (MIT) | oh-my-pi, hermes-agent, hindsight, gsd-omp | `THIRD_PARTY_NOTICES` text file |
| npm/Bun deps | electron, electron-builder, bun, all packages | NPM notices bundle |
| Rust/Cargo deps | tokio, hyper, all crates in `crates/` | Cargo.toml dev-dependency section |
| Python deps (via uv) | psycopg, numpy, onnxruntime, etc. | pip-style LICENSE files |

### Reachability Audit Scope

The reachability audit verifies:
1. Every loop-resident capability from phases 01-11 is either ported to HALO or explicitly retired
2. Each retained dependency's license and notice are included in THIRD_PARTY_NOTICES
3. THIRD_PARTY_NOTICES is reachable from both the About dialog and the installer

### Open Question

Is there an automated tool to extract license info from node_modules (e.g., `license-checker`) that can feed into THIRD_PARTY_NOTICES generation? If so, bake it into the justfile `verify-licenses` recipe.

---

## 7. MVP Vertical-Slice Candidates

Since mode=mvp, identify thin end-to-end slices:

### Slice A: PostgreSQL Startup + Health Check

- One packaged PostgreSQL binary starts cleanly from the installer location
- `pg_isready` confirms database availability within 30 seconds
- Data directory created at correct `%LOCALAPPDATA%\HALO\pgdata-18` location
- Verifies: PLAT-01, PLAT-02, PLAT-04 (process containment)

### Slice B: Full Installer + Launch + Sidecar Ready

- `just build` produces a working NSIS installer
- Installer runs on fresh Windows (no Docker, no dev tools)
- App launches, spawns PostgreSQL, reports ready status
- Sidecar logs written to `%LOCALAPPDATA%\HALO\logs`
- Verifies: PLAT-01, PLAT-02, PLAT-03, PLAT-04, PLAT-05

Slice B is the "truly done" marker; Slice A is useful mid-phase progress validation.

---

## 8. Critical Unknowns / Risks

### RISK-1: TEI Windows Build (HIGH SEVERITY)

AGENTS.md marks TEI Windows build feasibility as **LOW confidence**. The router builds with `cargo install --path router -F ort` but there's no official Windows CI for TEI, no Windows support statement, and no prebuilt binaries. If the build fails:
- Fallback to fastembed 0.9.0 (in-process ONNX Runtime)
- This changes the architecture: no sidecar process, embedding happens inside the daemon
- Loses four-lane isolation property

### RISK-2: PostgreSQL on Elevated Parent (MEDIUM SEVERITY)

PostgreSQL checks for administrative privilege on Windows and refuses to start. The supervisor must detect an elevated parent and refuse to start the memory subsystem with a clear error message rather than looping on a dead child. Not tested yet.

### RISK-3: Context Window Budget for Planner (MEDIUM SEVERITY)

Phase 12 depends on ALL prior phases. The planner will need to reference concrete APIs/assets from phases 01-11. With granularity=fine and MVP mode, plan file count could exceed 14 (the scope ceiling). Monitor plan counts during planning and split if needed.

### RISK-4: Justfile Cross-Shell Compatibility (LOW-MEDIUM SEVERITY)

The justfile runs on Windows git-bash but may behave differently in PowerShell. Recipe shells use POSIX syntax by default; the just documentation warns about this trap. Test with the exact shell used by documentation (`just build` from git-bash).

---

## 9. Conclusion

Phase 12 is primarily an **integration and delivery** phase. The architectural decisions are mostly complete (AGENTS.md covers sidecars, embeddings, bundling, supervision). What remains:

1. ✅ Create the `build` just recipe chaining all steps
2. ✅ Configure electron-builder with proper extraResources/asarUnpack
3. ✅ Verify sidecar lifecycle (start → health → stop → orphan cleanup)
4. ✅ Implement security controls (credential redaction, non-UTF8 handling, MAX_PATH)
5. ✅ Build bypass matrix test against real entry points from phases 01-11
6. ✅ Generate THIRD_PARTY_NOTICES with verified reachability
7. ⚠️ Validate TEI Windows build or pivot to fastembed

**Planning recommendation:** Wave 1 should cover the build recipe + installer configuration (vertical slice A). Wave 2 covers security hardening + orphan contracts. Wave 3 covers bypass matrix + third-party notices. Keep plan count ≤14 per GSD convention.
