<!-- GSD:project-start source:PROJECT.md -->

## Project

**HALO**

HALO is a single fused agent product assembled from four MIT-licensed codebases — oh-my-pi (coding harness: LSP/DAP/AST/Rust shell), Hermes Agent (agent runtime, plugins, Kanban, skills), Hindsight (knowledge-graph memory), and gsd-omp (TDD workflow policy) — vendored into one monorepo, rebranded end to end, and cut off from upstream. It ships as a Hermes-Desktop-derived Electron app plus a CLI, and presents one agent loop whose every tool call passes through one policy gate: Hermes-native capabilities in Python, coding capabilities over stdio RPC into the fused TS/Rust core. Durable memory is embedded Hindsight running against a bundled native PostgreSQL+pgvector instance, with CPU-only llama.cpp `llama-server` sidecars for embedding and reranking (no Docker, no GPU requirement).

**Core Value:** One non-bypassable tool path: every LLM tool decision reaches exactly one backend through a single adapter and a single policy gate, so no policy (TDD enforcement, safety, memory routing) can be skipped by choosing the other runtime.

### Constraints

- **License**: all four upstreams are MIT (verified: oh-my-pi, hermes-agent, hindsight, gsd-omp). Rebranding and redistribution are permitted, but each vendored subtree must retain its original copyright notice and permission text, plus a provenance record (repo, commit SHA, import date).
- **Tech stack**: Rust + Bun/TypeScript + Python for the core, Electron for Desktop, PostgreSQL+pgvector bundled natively, llama.cpp CPU inference sidecars bundled. No Docker. Build orchestration is a single documented Windows command.
- **Platform**: Windows-first (win32 x64). Cross-platform code paths must not be consciously broken, but only Windows is tested and supported.
- **Hardware**: CPU-only inference for embedding and reranking. Hardware-profile heuristic (Low ≤4 vCPU/8GB, Standard 8 vCPU/16GB, High ≥16 vCPU/32GB) drives llama.cpp context/batch/thread flags and the scheduler's per-provider ceilings.
- **Upstream cutoff**: after import there is no upstream sync. Provider additions, security fixes, and RPC growth that land upstream will not reach HALO automatically; the provenance manifest must make locating such changes tractable.
- **Single process boundary**: tool calls that cross into the coding core are RPC frames, not in-process calls. Per-call overhead budget: < 150ms adapter-added per tool round-trip.
- **Performance**: scheduler permit acquire < 5ms p99 uncontended; L0 p95 first-token latency ≤ 2× baseline under synthetic memory load; no consolidation can block an L0/L1 waiter > 200ms.
- **Security**: model credentials for Memory Model providers live in the Hermes secret store, never in `.env`/`config.json`, and must never be logged by the memory plugin.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Version Snapshot

| Component | Pin | Evidence |
|---|---|---|
| Bun | **1.4.4** | `bun-v1.4.4`, published 2026-10-22 — [release](https://github.com/oven-sh/bun/releases/tag/bun-v1.4.4) |
| Rust | **1.99.1** | published 2026-10-16 — [release](https://github.com/rust-lang/rust/releases/tag/1.99.1) |
| Python | **3.14.9** | released 2026-10-21 — [python.org/downloads](https://www.python.org/downloads/) |
| Python distribution (shipped) | **python-build-standalone 20261021**, `cpython-3.14.9+20261021-x86_64-pc-windows-msvc-install_only.tar.gz` | asset name verified in [PBS release 20261021](https://github.com/astral-sh/python-build-standalone/releases/tag/20261021) |
| uv | **0.13.5** | 2026-10-22 — [release](https://github.com/astral-sh/uv/releases/tag/0.13.5) |
| just | **1.59.0** | 2026-10-15, ships `just-1.59.0-x86_64-pc-windows-msvc.zip` — [release](https://github.com/casey/just/releases/tag/1.59.0) |
| Turborepo (`turbo`) | **2.11.10** (evaluated, not the orchestrator) | `registry.npmjs.org/turbo/latest`, `@turbo/windows-64` optional dep |
| Nx | **24.0.0** (evaluated, rejected) | `registry.npmjs.org/nx/latest`, napi target `x86_64-pc-windows-msvc` |
| TypeScript | **7.0.2** | `registry.npmjs.org/typescript/latest`; dist-tag `beta` = 7.1.0-beta |
| Electron | **45.0.0** | `registry.npmjs.org/electron/latest`; `engines.node >= 22.12.0` |
| electron-builder | **26.15.3** | `registry.npmjs.org/electron-builder/latest` |
| Node (tooling only) | **26.12.1** | `nodejs.org/dist/index.json`, 2026-10-21 |
| PostgreSQL | **18.6** (major 18, not 19) | EDB binary archives "installerVersion 18.6" — [EDB binaries](https://www.enterprisedb.com/download-postgresql-binaries); PG 19 is still RC1 as of 2026-10-15 — [licence page news](https://www.postgresql.org/about/licence/) |
| PostgreSQL Windows binaries (shipped) | `io.zonky.test.postgres:embedded-postgres-binaries-windows-amd64:18.6.0` | [Maven Central listing](https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-windows-amd64/), 18.6.0 published 2026-08-26 |
| pgvector | **0.8.7** | [tags](https://api.github.com/repos/pgvector/pgvector/tags) |
| TEI (text-embeddings-inference) | **v1.9.4** | released 2026-09-15 — [release](https://github.com/huggingface/text-embeddings-inference/releases/tag/v1.9.4) |
| ONNX Runtime (fallback path) | **1.31.0** | `pypi.org/pypi/onnxruntime/json`; classifiers include `Microsoft :: Windows`, `Python :: 3.14` |
| fastembed (fallback path) | **0.9.0** | `pypi.org/pypi/fastembed/json` |
| llama.cpp (fallback path) | **b11669** | `llama-b11669-bin-win-cpu-x64.zip` verified 2026-10-15 — [release](https://github.com/ggml-org/llama.cpp/releases/tag/b11669) |
| ast-grep | **0.51.0** | `@ast-grep/cli` with `@ast-grep/cli-win32-x64-msvc` optional dep |

## 1. Build orchestration: one command, one coordinator

### Decision

| Layer | Tool | Invoked as | Why this one |
|---|---|---|---|
| Orchestrator | just 1.59.0 | `just build` | Only candidate that is a single static `.exe`, has no runtime dependency, models arbitrary cross-language dependencies, and cannot silently skip a step |
| JS/TS workspace | Bun 1.4.4 | `bun install`, `bun run --filter`, `bun build --compile` | Already the product's TS runtime and CLI compiler; ships Windows x64 builds and `bun-windows-x64` compile targets |
| Rust core | cargo 1.99.1 (`rust-toolchain.toml`) | `cargo build --release --locked` | Toolchain file pins the exact compiler for every contributor and CI |
| Python runtime | uv 0.13.5 + CPython 3.14.9 | `uv sync --locked`, `uv run` | Lockfile-first, installs its own managed CPython (PBS), same distribution we ship |
| Desktop package | electron-builder 26.15.3 | `bun x electron-builder --win nsis --x64` | Produces the NSIS installer and implements `extraResources`/`asarUnpack` for sidecar binaries |
| CI | `windows-latest` (win32 x64 only for v1) | — | PROJECT.md: only Windows is tested and supported |

# justfile — the only entry point. Every recipe is idempotent.

# The one documented command.

### Why not the alternatives (and exactly where each fails on Windows)

| Candidate | Runs on Windows? | Where it fails for HALO |
|---|---|---|
| **Turborepo 2.11.10** | Yes — it publishes `@turbo/windows-64` as an optional dependency, so the Go/Rust binary installs fine. | Its task model is *"search your packages for scripts in their `package.json` that have the same name as the task"* ([Turborepo: configuring tasks](https://turborepo.dev/docs/crafting-your-repository/configuring-tasks)). Cargo, uv and electron-builder are not packages; expressing them means wrapping each in a root `package.json` script, at which point turbo adds a second task graph and a cache that hashes Git-tracked files, not Cargo/uv lockfiles. It would be orchestration theatre. |
| **Nx 24.0.0** | Yes — napi target `x86_64-pc-windows-msvc` is in the package metadata. | Same mismatch, plus weight: 21 MB unpacked of plugin machinery, a project graph built from JS config files, and a daemon. `nx:run-commands` can shell out to cargo/uv, so it *can* work — it is simply more moving parts than a 600-line justfile for a 4-language repo. Choose Nx only if HALO later adds many JS apps with shared build caches. |
| **GNU make** | **No native Windows support.** | make is a POSIX tool; on Windows it needs MSYS2/MinGW or WSL. A fresh Windows workstation has neither, which violates "one documented build command" on the target OS. Also: recipe lines are `sh`, path separators are `/`, and `SHELL` override is fragile. Do not use. |
| **npm/pnpm workspace scripts** | Yes | No dependency model between a Rust crate and a Python package; you get `&&` chains that re-run everything. |
| **Bun shell (`bun run build.ts`)** | Yes — Bun implements a cross-platform shell. | Viable fallback if `just` is deemed an extra binary: Bun is already mandatory. Loses `just --list` discoverability and per-recipe dependency ordering. Acceptable; **not** preferred. |

### just on Windows: the specific trap

### Toolchain prerequisites (and why the build shell must be non-elevated)

### Python: ship the interpreter, do not freeze it

| Option | Verdict |
|---|---|
| **python-build-standalone `install_only` + venv (chosen)** | Self-contained, relocatable CPython 3.14.9 for `x86_64-pc-windows-msvc`, published every night ([PBS 20261021](https://github.com/astral-sh/python-build-standalone/releases/tag/20261021)). uv installs the identical distribution in dev, so dev == ship. Cost: ~45 MB compressed, plus a `pythonw.exe` child process. |
| PyInstaller / Nuitka one-file | Rejected. Hindsight + Hermes pull in native wheels (psycopg, numpy, tokenizers); one-file extraction to temp on every launch costs seconds, breaks native DLL resolution, and makes tracebacks unreadable. |
| System Python | Rejected. The product must not depend on what the user has installed; PROJECT.md forbids Docker-style prerequisites and the same logic applies to Python. |

### CLI distribution

### TypeScript version

## 2. PostgreSQL 18.6 + pgvector 0.8.7 as a supervised child process

### Decision

| Piece | Choice |
|---|---|
| Server binaries | **zonky `embedded-postgres-binaries-windows-amd64:18.6.0`** from Maven Central, vendored into the installer at build time |
| Extension | **pgvector 0.8.7 compiled by us with MSVC** against matching PG 18 headers; `vector.dll` + `vector.control` + `vector--*.sql` shipped alongside |
| Supervisor | One TS module in the shared core (`packages/sidecars`), used by both Desktop main process and CLI |
| Port | `55432` default, configurable, bound to `127.0.0.1` only |
| Auth | `scram-sha-256`, random password generated at `initdb`, stored in the Hermes secret store, never in `config.json` |

### Why zonky and not EDB's zip

| Source | Versioned artifact | Checksums | Redistribution | Fit |
|---|---|---|---|---|
| **zonky Maven artifact (chosen)** | `18.6.0`, one POM per minor, with published digests | `.sha1/.sha256/.sha512` published next to every artifact ([listing](https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-windows-amd64/)) | Binaries are PostgreSQL under the PostgreSQL License; the *packaging* is Apache-2.0 ([zonky README](https://github.com/zonkyio/embedded-postgres-binaries)) | Designed for embedding: `bin/`, `lib/`, `share/` layout, no installer, no service registration |
| EDB binary archive | `18.6` behind an opaque `getfile.jsp?fileid=…` link ([EDB binaries](https://www.enterprisedb.com/download-postgresql-binaries)) | Not published beside the link | PostgreSQL License | Canonical upstream build, but the URL is not stable/pinnable and there is no digest to verify |
| EDB *installer* | `postgresql-18.x-windows-x64.exe` | — | — | **Rejected.** Installs a Windows service, requires admin, chooses its own data dir. Not embeddable. |

### pgvector on Windows: build it, ship it, verify it

### initdb, first start, and the Windows rules that bite

- **Never run elevated.** PostgreSQL checks for administrative privilege on Windows and refuses: "Execution of PostgreSQL by a user with administrative permissions is not permitted." The PostgreSQL wiki documents that the server must run under a non-administrator account and that the check tests Administrators/Power Users group membership ([PostgreSQL wiki: Running PostgreSQL on Native Windows](https://wiki.postgresql.org/wiki/Running_%26_Installing_PostgreSQL_On_Native_Windows)). The supervisor must detect an elevated parent and refuse to start the memory subsystem with a clear error instead of looping on a dead child.
- **Data directory goes in `%LOCALAPPDATA%`, never `%APPDATA%`.** Electron's `userData` defaults to `appData` (i.e. `%APPDATA%`) plus the app name ([Electron app.getPath](https://www.electronjs.org/docs/latest/api/app)), and Electron itself warns that roaming `userData` may be synced to cloud storage. A multi-GB PostgreSQL data directory in a roaming profile is a data-loss machine. Use `app.getPath('userData')` for config and `%LOCALAPPDATA%\HALO\pgdata-18` for the cluster.
- **No Unix sockets.** Windows has no `unix_socket_directories` equivalent, so TCP on loopback plus `scram-sha-256` is the only isolation. Bind `127.0.0.1`, never `0.0.0.0`, and set a real password even for localhost.
- **Spaces in paths are fine, but quoting is not optional.** `C:\Users\Jakub Novák\AppData\Local\HALO` contains a space *and* a non-ASCII character: always `spawn` with an argv array (no `shell: true`), and pass `-D` as a separate argument. **Confidence: HIGH** (direct consequence of Node's argv semantics), but add a CI test with a path containing a space and a diacritic.

### Lifecycle and upgrade path

- **Start:** spawn `postgres.exe -D … ` directly (not `pg_ctl start`, which detaches and loses the PID we must supervise), wait for `pg_isready -h 127.0.0.1 -p <port>`, then run migrations. Keep the child as a direct child so `exit`/`error` events are meaningful.
- **Stop:** `pg_ctl stop -D <dir> -m fast` first (graceful checkpoint), then `taskkill /PID <pid> /T /F` after a 10 s timeout.
- **Minor upgrades (18.6 → 18.7):** binary swap only. Stop, replace `bin/`+`lib/` (keep `share/extension/` from our pgvector zip), start. The cluster format is stable within a major.
- **Major upgrades (18 → 19):** **out of scope for v1** and must stay out until designed. The safe shape is: ship `pg_dump` from the *old* major as a migration payload, dump at shutdown, start the new cluster, restore, verify row counts, keep the old data dir until the user confirms. `pg_upgrade` also needs old binaries, so it does not avoid the problem. Name the data directory with the major (`pgdata-18`) so a future migrator can never silently open an incompatible cluster — PostgreSQL's on-disk version check will fail anyway, but a clear path beats a crash.

### Licensing / redistribution (must be in the installer's notices file)

| Component | Licence | Obligation |
|---|---|---|
| PostgreSQL 18.6 server | PostgreSQL License (BSD/MIT-like) | Include the copyright + permission text; redistribution permitted ([postgresql.org/about/licence](https://www.postgresql.org/about/licence/)) |
| pgvector 0.8.7 | PostgreSQL License, verbatim the same terms ([pgvector LICENSE](https://github.com/pgvector/pgvector/blob/master/LICENSE)) | Same notice text |
| zonky binary packaging | Apache-2.0 ([zonky README](https://github.com/zonkyio/embedded-postgres-binaries)) | Ship `LICENSE` + any `NOTICE`, state that files were repackaged |

### What NOT to use here

| Avoid | Why | Use instead |
|---|---|---|
| **Docker / docker-compose Postgres** | PROJECT.md out-of-scope; Docker Desktop is an unacceptable prerequisite on the target workstation | Bundled zonky binaries + our supervisor |
| **PGlite (`@electric-sql/pglite` 0.5.11)** | WASM Postgres embedded in the Node/Bun process. It has no wire protocol server, and Hindsight is a Python process connecting with a TCP driver — it literally cannot connect. Also single-connection semantics ([pglite](https://pglite.dev)) | Real `postgres.exe` on loopback |
| **`embedded-postgres` npm at its `latest` tag** | `latest` is `18.4.0-beta.17` (dist-tags read 2026-10-23) — a beta. It ships the binaries as per-platform packages (`@embedded-postgres/windows-x64` is ~104 MiB unpacked, win32/x64) and owns `initdb`/start/stop itself, so adopting it means inheriting its supervision model instead of ours. Its layout is a good reference; its current release is not a dependency | Vendor the same zonky binaries ourselves, keep supervision in our code |
| **`pg-embed` 1.0.0 as the runtime** | Rust crate, Windows amd64 supported, PG 10–18, but it *downloads* binaries on first use into `%LOCALAPPDATA%\pg-embed\` and explicitly does not bundle extensions ([docs](https://docs.rs/crate/pg-embed/latest)). Fine for tests; wrong for a shipped installer | It is a useful *test-only* dependency and a reference for `install_extension` semantics |
| **EDB installer `.exe`** | Windows service, admin rights, own data dir, uninstall behaviour outside our control | The binary archive |
| **`initdb` with `--locale` from the OS** | Windows locale names differ from POSIX and can produce a cluster that sorts differently across machines | `--locale=C --encoding=UTF8` (deterministic; do text collation in the app if needed) |

## 3. CPU embedding and reranking on Windows

### The plain finding

### Decision: build `text-embeddings-router.exe` from pinned source, ONNX backend

| Parameter | Value | Rationale |
|---|---|---|
| Source | TEI **v1.9.4** at a pinned commit SHA, vendored as a build input (not modified) | PROJECT.md requires source-level provenance; a git tag alone can move |
| Toolchain | Rust **1.99.1** as in the repo's `rust-toolchain.toml` | Upstream builds with the toolchain file (release notes mention Dockerfiles using it) |
| Features | `--no-default-features -F ort -F http` | `ort` is the ONNX Runtime backend and the README's recommendation for x86 CPU; `mkl` pulls `intel-mkl-src` (Intel-specific, no AMD story), `accelerate`/`metal` are macOS, `python` would drag a libpython into the build |
| Output | `text-embeddings-router.exe`, one binary, two supervised instances | Embedder and reranker are the same server with different `--model-id` and, for rerankers, `--auto-truncate` |
| Build host | `windows-latest`, MSVC | Cross-compiling is not supported by the project and not worth discovering |
| Gate | A phase acceptance test: start, `GET /health` → 200, `POST /embed` returns a 384-dim vector | If the build or the smoke test fails, execute the fallback ladder below rather than shipping a broken sidecar |

### Model selection for an 8-vCPU CPU-only box

| Role | Model | Params | Tokens/pair | FLOP/pair | Est. latency `[INFERENCE]` |
|---|---|---|---|---|---|
| Embed (Standard) | `BAAI/bge-small-en-v1.5` (384 d) | 33 M | 128 | 8.4 GFLOP | **~25–45 ms** |
| Embed (multilingual) | `intfloat/multilingual-e5-small` (384 d) | 118 M | 128 | 30 GFLOP | ~80–150 ms |
| Embed (quality tier) | `BAAI/bge-m3` (1024 d) | 568 M | 128 | 145 GFLOP | ~400–750 ms — **do not default** |
| Rerank (Standard) | `Xenova/ms-marco-MiniLM-L-6-v2` (6 layers) | 22 M | 160 | 7 GFLOP | **~20–35 ms/pair** → 25 candidates ≈ 0.5–0.9 s |
| Rerank (quality tier) | `BAAI/bge-reranker-base` | 278 M | 160 | 89 GFLOP | ~250–450 ms/pair → 25 candidates ≈ 6–11 s — **too slow for interactive recall** |
| Rerank (GPU tier) | `BAAI/bge-reranker-v2-m3` | 568 M | 160 | 182 GFLOP | ~0.5–0.9 s/pair — **not viable on CPU** |
- Default embeddings to a **33 M** model; treat `bge-m3` as an explicit "quality" option with a stated latency warning in Settings.
- **Cap rerank candidates at 20–30** and make the cap a function of the hardware profile. Reranking 100 candidates with a 278 M model costs ~25–45 s on 8 vCPU, which is exactly the pathology the four-lane scheduler exists to prevent.
- First-token correctness beats warm latency: PROJECT.md already rules that auto-recall must not block the first turn on TEI readiness. Keep that, and surface a degraded badge rather than a spinner.
- **Measure in the phase that installs the sidecars** and replace this table with observed p50/p95 per hardware profile. The `[INFERENCE]` tag means these numbers are not evidence.

### Fallback ladder (in order; each is real, with its cost)

| # | Option | Windows-native? | Version | What you lose |
|---|---|---|---|---|
| 1 | **TEI built from source (`ort`)** | Builds; not upstream-supported | v1.9.4 + Rust 1.99.1 | Nothing structurally; you own the build |
| 2 | **fastembed in the Python daemon** | **Yes** — `onnxruntime` 1.31.0 publishes Windows wheels and lists Python 3.14 ([PyPI](https://pypi.org/project/onnxruntime/)); fastembed 0.9.0 uses it for embeddings and cross-encoder reranking | fastembed **0.9.0**, onnxruntime **1.31.0** | No sidecar process (in-process, so a model crash takes the daemon), no HTTP boundary, reranker is a Python call. Loses the four-lane isolation property, so it is a degradation, not an equivalent |
| 3 | **llama.cpp `llama-server`** | **Yes** — `llama-b11669-bin-win-cpu-x64.zip` is published; the server has `--embeddings`, `--reranking`, `/v1/embeddings`, `/v1/rerank` ([server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)) | **b11669** | GGUF models instead of HF safetensors/ONNX: conversion pipeline, different rerank scoring, quality differs from TEI on the same model |
| 4 | **TEI under WSL2** | Runs, but depends on virtualization being enabled | any | Introduces a WSL distro as a prerequisite — the same class of dependency as Docker. **Rejected.** |
| 5 | **TEI in Docker** | Yes | any | Out of scope by PROJECT.md |

### What NOT to use here

| Avoid | Why | Use instead |
|---|---|---|
| **`sentence-transformers` / raw PyTorch in the daemon** | Pulls a multi-GB torch wheel into a desktop installer and puts model execution inside the agent's own process; a model bug becomes an agent outage | fastembed 0.9.0 (onnxruntime 1.31.0, ~50 MB) if TEI is unavailable |
| **Any CUDA TEI image or `-F candle-cuda`** | PROJECT.md is CPU-only for v1; a GPU path doubles the build matrix and the support surface | `-F ort` on CPU |
| **TEI's default `--max-concurrent-requests 512` / `--max-batch-tokens 16384`** | These are server defaults for datacenter boxes; on 8 vCPU they convert concurrency into latency, which is the exact pathology already measured in Hindsight | Profile-scaled values in section 3 |
| **`--dtype float16` on CPU** | fp16 is a GPU path; the CPU backends expect float32 | `--dtype float32` |
| **Big rerankers by default (`bge-reranker-v2-m3`, 568 M)** | ~0.5–0.9 s per candidate pair on 8 vCPU — 20 candidates is 10–18 s | 22 M cross-encoder, candidate cap 20–30 |
| **Runtime model download from huggingface.co** | Offline installs, corporate proxies, and a supply-chain surface with no digest pin | Local model dir + first-run downloader with a SHA-256 manifest |

## 4. Sidecar supervision in an Electron app (+ the CLI)

### Decision

### Process settings that are not optional on Windows

| Setting | Value | Why |
|---|---|---|
| `windowsHide` | **`true`** | Node's default is `false`: *"Hide the subprocess console window that would normally be created on Windows systems. Default: false"* ([Node child_process](https://nodejs.org/api/child_process.html)). Without it every sidecar flashes a black console window |
| `detached` | **`false`** | On Windows `detached: true` gives the child *its own console window* and lets it outlive the parent ([Node docs §options.detached](https://nodejs.org/api/child_process.html#optionsdetached)) — the exact opposite of supervised |
| `stdio` | `['ignore', 'pipe', 'pipe']` | Pipes let the supervisor prefix, buffer and persist every line; `'ignore'` for stdin because none of the three needs it |
| `shell` | **`false`** | No argument re-parsing; paths contain spaces and non-ASCII characters |
| `env` | explicit allowlist + `PGDATA`, `HALO_*` | Prevents inheriting a developer's `PGPORT`/`HF_HOME` and producing "works on my machine" |

### Lifecycle contract

| Concern | Rule |
|---|---|
| **Ports** | Defaults `55432` (PG), `58080` (embed), `58081` (rerank). On `EADDRINUSE`, bind an ephemeral port on `127.0.0.1` to discover a free one and pass it explicitly; the resolved port is written to the runtime config that *both* supervisor and children read. Children never guess, and the UI never hardcodes |
| **Health** | TEI: `GET /health`, treat 200 as ready and 503 as "not yet"; PG: `pg_isready -h 127.0.0.1 -p <port>`; daemon: its own `/health`. Poll 250 ms with backoff to 2 s, hard cap per child, then `degraded` |
| **Crash restart** | Backoff 250 ms → 500 ms → 1 s → 2 s → 4 s → cap 30 s. **>5 crashes in 10 minutes → `failed`**, stop restarting, show a diagnostic card with the last 200 log lines. Exit code 0 means we asked it to stop: never restart |
| **State machine** | `stopped → starting → ready → degraded → restarting → failed`, exposed to the UI. The four-lane controller reads `ready` for TEI and `degraded` for the local embedder fallback |
| **Logging** | Line-prefixed (`[pg]`, `[tei:embed]`, `[tei:rerank]`, `[mem]`), 2 000-line ring buffer for the Health page, rotating file 10 MB × 3 under `%LOCALAPPDATA%\HALO\logs` |
| **Single instance** | Desktop: `app.requestSingleInstanceLock()`. CLI: exclusive-create lock file in `%LOCALAPPDATA%\HALO\run\daemon.lock`; stale lock (PID not alive) is reclaimed, never blindly trusted |

### The Windows-specific hard parts, stated honestly

## 5. Rebranding mechanics at scale (TS + Rust + Python + config)

### Decision: inventory → manifest → AST rewrite → gate

| Stage | Tool | What it does |
|---|---|---|
| 1. Inventory | `rg` (ripgrep) + `git grep -l` | Produce a **hit list per token case-sensitively**. Separate identifiers from strings from paths |
| 2. Manifest | one checked-in `tools/rebrand/rename.yml` | Ordered rules: `{from, to, langs, kind: identifier\|string\|path\|env\|pkg}`. This file is the audit trail and the resume point |
| 3. Code rewrite | **ast-grep 0.51.0** (`sg`) | `sg run -p '<pattern>' -r '<rewrite>' -l ts\|rust\|python -U`; `--json=stream` for machine review; the CLI ships a `win32-x64-msvc` binary ([ast-grep run reference](https://ast-grep.github.io/reference/cli/run.html), [npm](https://www.npmjs.com/package/@ast-grep/cli)) |
| 4. Path renames | `git mv` driven by the manifest | Keeps history and case-only renames visible; run on a case-sensitive CI checkout to defeat Windows' case-insensitivity masking `Foo`→`foo` bugs |
| 5. Structured files | one Bun script (`tools/rebrand/apply.ts`) | `package.json`, `Cargo.toml`, `pyproject.toml`, `*.json`, Windows resource metadata — parse, mutate, re-serialise. Never regex JSON |
| 6. Gate | CI job `rebrand-deny` | `rg -i '<upstream-token>'` must return only allowlisted paths (`PROVENANCE.md`, `licenses/**`, `tools/rebrand/**`, migration shims, tests) |

### Migration shims (the part users feel)

| Surface | New | Shim |
|---|---|---|
| Env vars | `HALO_*` | Read `HERMES_*`/`OMP_*` once at startup into the same settings object, log a single deprecation line, write only `HALO_*` from then on. Keep the table in code (`legacyEnv.ts`), not in prose |
| Config dir | `%APPDATA%\HALO` | Electron's `userData` is `appData` + app name ([Electron app.getPath](https://www.electronjs.org/docs/latest/api/app)), so **renaming `productName` silently moves the profile**. Before `app.whenReady()`, if the new dir is absent and `%APPDATA%\<old-name>` exists, copy it, rewrite known keys, write a `.migrated-from` marker |
| Large data | `%LOCALAPPDATA%\HALO` | Never migrate the PostgreSQL data dir across brands; detect an old cluster and run `pg_dump`/restore or refuse with instructions. A half-copied `pgdata` is unrecoverable |
| DB schema | `halo_*` | `ALTER SCHEMA old RENAME TO new` inside a transactional migration; the migration runner must be idempotent |
| Package names | `@halo/*`, `halo-core`, `halo` | Regenerate lockfiles; never text-edit `bun.lock` or `Cargo.lock` |
| RPC methods | `halo.*` | Both sides are ours and ship together, so there is no external consumer — but imported gsd-omp extensions may call by name. Keep an alias map for one minor version, then delete it (a shim with no expiry is a permanent second vocabulary) |
| Windows file metadata | `HALO` | electron-builder `win.*` (product name, icon, version info) plus `bun build --compile --windows-*` flags for the CLI; both are configuration, not code |

### Provenance and licences (must survive the rename)

# Provenance — <upstream repo>

- Source: <git url>
- Commit SHA: <sha>
- Import date: 2026-XX-XX
- Imported by: squash of <first-sha>..<last-sha>; history dropped by decision (see PROJECT.md)
- Local modifications: see tools/rebrand/rename.yml and docs/upstream-divergence.md

## Alternatives Summary (whole stack)

| Category | Recommended | Alternative | When the alternative wins |
|---|---|---|---|
| Build orchestration | just 1.59.0 | Bun shell script; Nx 24.0.0 | Zero-extra-binary teams (Bun); many JS apps needing shared caches (Nx) |
| JS runtime/package manager | Bun 1.4.4 | Node 26.12.1 + npm | If a native dependency misbehaves under Bun during the import; Node is the fallback for the Electron main process only |
| Python env | uv 0.13.5 + PBS 3.14.9 | Conda | Never here: conda's size and solver cost dwarf uv, and we ship the interpreter |
| Database | zonky PG 18.6.0 + pgvector 0.8.7 | EDB archives; PGlite; embedded-postgres npm | EDB if zonky lags a CVE; PGlite only if the DB consumer were in-process JS |
| Embeddings/rerank | TEI v1.9.4 built from source | fastembed 0.9.0; llama.cpp b11669 | fastembed if the Windows build of TEI fails; llama.cpp if GGUF models are preferred |
| Sidecar supervision | Custom TS supervisor (+ Rust Job Object helper) | `embedded-postgres` npm package | If HALO ever needs many embedded DBs for tests — then use it *in tests* |
| Rebranding | ast-grep 0.51.0 + manifest | `sed`, IDE refactors, ts-morph | ts-morph only if TS-specific type-aware rewrites (rename symbol) are needed beyond syntax |
| Desktop packaging | electron-builder 26.15.3 | Electron Forge | Forge if the team standardises on its plugin model; builder has better NSIS/`extraResources` ergonomics |

## Version Compatibility

| A | B | Note |
|---|---|---|
| Electron 45.0.0 | Node ≥ 22.12.0 | The `electron` package's `engines` covers the tooling that installs and launches Electron, not the runtime inside it. Do not use Node 26-only APIs in the main process; check the embedded version at runtime |
| bun 1.4.4 | electron-builder 26.15.3 | builder walks `node_modules` and reads `package.json`; validate packaging early — Bun's install layout is the one integration risk in the JS half of the stack `[INFERENCE]` |
| Rust 1.99.1 | TEI v1.9.4 | Build TEI with the repo's `rust-toolchain.toml`; do not force 1.99.1 if the file pins something else |
| PostgreSQL 18.6 | pgvector 0.8.7 built against 18.6 headers | ABI mismatch is the #1 way this fails; build against the exact runtime `PGROOT` |
| zonky 18.6.0 | Python `psycopg` (Hindsight) | Wire protocol stable; no client-side pin needed beyond a modern psycopg 3 |
| Python 3.14.9 | onnxruntime 1.31.0 / fastembed 0.9.0 | fastembed requires `onnxruntime>=1.24.2` on 3.14 |
| TEI v1.9.4 | `--max-batch-tokens`/`--max-concurrent-requests` | Names verified in source; defaults are server-class and must be lowered |
| TypeScript 7.0.2 | vendored TS subtrees | Gate imports with `tsc --noEmit` baseline; per-package 5.x pin is the escape hatch |

## Sources

- https://github.com/oven-sh/bun/releases/tag/bun-v1.4.4 — Bun 1.4.4
- https://github.com/rust-lang/rust/releases/tag/1.99.1 — Rust 1.99.1
- https://www.python.org/downloads/ — Python 3.14.9, 3.15.1
- https://github.com/astral-sh/python-build-standalone/releases/tag/20261021 — `cpython-3.14.9+20261021-x86_64-pc-windows-msvc-install_only.tar.gz`
- https://github.com/astral-sh/uv/releases/tag/0.13.5 — uv 0.13.5
- https://github.com/casey/just/releases/tag/1.59.0 — just 1.59.0 (+ Windows MSVC zip)
- https://registry.npmjs.org/turbo/latest — turbo 2.11.10
- https://registry.npmjs.org/nx/latest — Nx 24.0.0
- https://registry.npmjs.org/typescript/latest — TypeScript 7.0.2
- https://registry.npmjs.org/electron/latest — Electron 45.0.0
- https://registry.npmjs.org/electron-builder/latest — electron-builder 26.15.3
- https://nodejs.org/dist/index.json — Node 26.12.1
- https://www.enterprisedb.com/download-postgresql-binaries — PostgreSQL 18.6 Windows x86-64 archives
- https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-windows-amd64/ — 18.6.0 (2026-08-26)
- https://api.github.com/repos/pgvector/pgvector/tags — pgvector v0.8.7
- https://github.com/huggingface/text-embeddings-inference/releases/tag/v1.9.4 — TEI v1.9.4, `assets: []`
- https://github.com/ggml-org/llama.cpp/releases/tag/b11669 — `llama-b11669-bin-win-cpu-x64.zip`
- https://pypi.org/project/onnxruntime/ — onnxruntime 1.31.0, Windows + 3.14
- https://pypi.org/project/fastembed/ — fastembed 0.9.0
- https://www.npmjs.com/package/@ast-grep/cli — ast-grep 0.51.0
- https://registry.npmjs.org/@electric-sql/pglite/latest — PGlite 0.5.11
- https://registry.npmjs.org/embedded-postgres — dist-tag `latest` = 18.4.0-beta.17
- https://docs.rs/crate/pg-embed/latest — pg-embed 1.0.0
- https://github.com/casey/just/blob/master/README.md — `sh` default on Windows, `[windows] set shell`, PowerShell positional-argument caveat
- https://turborepo.dev/docs/crafting-your-repository/configuring-tasks — tasks are `package.json` scripts
- https://rust-lang.github.io/rustup/installation/windows-msvc.html — MSVC prerequisites
- https://bun.com/docs/bundler/executables — `bun-windows-x64`, `--windows-hide-console`, no cross-compiled metadata flags
- https://docs.astral.sh/uv/concepts/python-versions/ — managed Python uses python-build-standalone; Windows supported
- https://www.electron.build/v26/docs/contents/ — `extraResources`, `asarUnpack`, execute-directly rule
- https://www.electronjs.org/docs/latest/tutorial/asar-archives — APIs needing unpacked files
- https://www.electronjs.org/docs/latest/api/app — `userData` = appData + name; `before-quit`/`will-quit` not emitted on Windows shutdown/logout
- https://nodejs.org/api/child_process.html — `windowsHide` default false, `detached` semantics on Windows
- https://github.com/huggingface/text-embeddings-inference — Docker/Homebrew/`cargo install` routes; air-gapped model dirs
- https://huggingface.co/docs/text-embeddings-inference/main/en/local_cpu.md — CPU install is source-only
- https://github.com/huggingface/text-embeddings-inference/blob/main/router/src/main.rs — CLI flag names and defaults
- https://github.com/huggingface/text-embeddings-inference/blob/main/router/src/http/server.rs — `/health` 200/503, `/info`
- https://github.com/huggingface/text-embeddings-inference/issues/503 — open request for a non-Docker consumer sidecar
- https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md — `--embeddings`, `--reranking`, `/v1/rerank`
- https://www.postgresql.org/about/licence/ — PostgreSQL License text; PG 19 RC1 news
- https://wiki.postgresql.org/wiki/Running_%26_Installing_PostgreSQL_On_Native_Windows — non-administrator account requirement
- https://github.com/pgvector/pgvector/blob/master/README.md — MSVC `nmake` Windows build
- https://github.com/zonkyio/embedded-postgres-binaries — supported platforms, Apache-2.0 packaging
- https://ast-grep.github.io/reference/cli/run.html — `run -p/-r/-l/-U`
- https://www.apache.org/licenses/LICENSE-2.0 — Apache-2.0 §4 redistribution duties

## Confidence Assessment

| Area | Confidence | Basis |
|---|---|---|
| Versions and pins | **HIGH** | Every pin read from a registry/release API today; no training-data versions used |
| Build orchestration (just + per-language tools) | **HIGH** for the mechanism, **MEDIUM** for just-on-PowerShell ergonomics | Documented Windows behaviour; the multi-shell maintenance cost is real |
| PostgreSQL bundling (zonky 18.6.0 + own pgvector build) | **MEDIUM-HIGH** | Binaries verified present; pgvector MSVC recipe documented; the `nmake install` layout must be asserted in CI |
| TEI on Windows | **LOW** | No official binaries (verified), no Windows CI, no Windows support statement. The build is an experiment with a fallback |
| CPU latency/concurrency numbers | **LOW** (explicitly `[INFERENCE]`) | Derived from FLOP arithmetic, not measured; must be replaced with measurements |
| Sidecar supervision | **HIGH** for the Electron/Node mechanics, **MEDIUM** for orphan-proof shutdown | `will-quit` gap on Windows is documented; Job Object approach needs implementation |
| Rebranding mechanics | **HIGH** for tooling, **MEDIUM** for shim coverage | ast-grep and the deny-gate are straightforward; the set of surfaces is only complete once the inventory runs |

## Gaps to Address

- **TEI Windows build feasibility** is the single largest unvalidated assumption in this stack. Time-box a spike; if `cargo install --path router -F ort` fails on `windows-latest`, switch to fastembed 0.9.0 in the Python daemon and record the decision, because "no TEI on Windows" changes the memory architecture's shape, not just its packaging.
- **Bun ↔ electron-builder** packaging has not been validated. Prove `bun install --frozen-lockfile` → `electron-builder --win nsis` produces a working installer in the first packaging phase, before more code depends on it.
- **Python venv relocation** from a build directory into `resources/` needs a smoke test on a machine without Python installed.
- **Model bundle size** (bge-small float32 ≈ 130 MB) versus first-run download: a product decision with offline-install consequences, not a technical one.
- **Code signing** is unplanned here and gates any beta distribution; SmartScreen behaviour of a sidecar-spawning installer is unverified.
- **PostgreSQL across majors** (18 → 19, once 19 GA ships) needs a designed `pg_dump`/restore migration before the first user has data worth losing.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-fast` for a trivial task inline, with no subagents and no PLAN.md
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
