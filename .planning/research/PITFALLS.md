# Pitfalls Research

**Domain:** Fused multi-runtime agent product, assembled by vendoring and rebranding four MIT codebases
**Project:** HALO (workspace: Bond)
**Researched:** 2026-10-23
**Confidence:** HIGH on documented mechanics (primary docs and upstream source); MEDIUM on composite risk ranking and phase mapping

---

## Why this program is unusually exposed

Every line of HALO starts as someone else's code, and every one of the four imports is a *fork*, not a dependency. A dependency has a version number and an upgrade path. A fork has a commit SHA and a memory.

| Import | What HALO takes | What breaks silently |
|---|---|---|
| `can1357/oh-my-pi` | Coding core, 185 RPC commands, 18 async frame categories, Rust shell, LSP/DAP | Wire protocol, `agent_end` semantics, provider catalog, `~/.omp` paths |
| `NousResearch/hermes-agent` | Agent loop, sessions/FTS5, plugins + hooks, Kanban, skills, Desktop | `HERMES_*` env vars, `%LOCALAPPDATA%\hermes`, `plugins.enabled` gate, `.env` secret store |
| `vectorize-io/hindsight` | Knowledge-graph memory, retrieval, TEI integration, per-op LLM config | `HINDSIGHT_API_*` (~200 vars), schema name, ports, embedded `pg0` |
| `tchivs/gsd-omp` | Protocol-v1 GSD integration, ExtensionAPI, skill projection | Extension API version, slash-command contract |

Four properties make the usual "vendor a library" advice insufficient here:

1. **The rebrand is intentional at the internals level** (PROJECT.md Key Decisions). Env vars, config dirs, plugin ids, DB schema, and RPC method names are all in scope. That is a rename of the *ABI* of four systems at once.
2. **The systems are fused at runtime, not linked.** A missed rename does not fail a build; it makes two halves of the product resolve different configuration and diverge at runtime.
3. **Two agent loops exist in the tree by default.** Demoting OMP to a tool backend is an architectural intent, not a property of the code. The code will happily run its own loop.
4. **Only Windows is supported, and the memory stack is the least Windows-ready part of the stack.** TEI's distribution model is Docker-first; the bundled Postgres path is native-process-first.

Phases below are capability-named (`P1`…`P8`) because the roadmap is not yet fixed. Renumber when ROADMAP.md lands; keep the *owner* of each pitfall, which is the part that matters:

| Ref | Phase (proposed) | Owns |
|---|---|---|
| P1 | Import & Provenance | Provenance ledger, license retention, import fidelity |
| P2 | Rebrand & Migration | Identifier inventory, config/env migration, plugin ids, DB schema |
| P3 | Unified Adapter & Policy Gate | Single execution path, closure proof |
| P4 | Coding-Core RPC Integration | Loop demotion, transcript mirroring, framing |
| P5 | Memory Runtime & Bundling | Postgres/pgvector, embedder/reranker supervision, first boot |
| P6 | Four-Lane Scheduler & Memory Model UI | Lane isolation, preemption, degradation |
| P7 | Desktop/CLI Surfaces & Packaging | Installer, shutdown, Windows integration |
| P8 | Hardening & Release | Cross-cutting verification, soak, upgrade drills |

---

## Critical Pitfalls

### P-01: Fork-and-cut-off debt — the fix exists upstream and is unreachable

**What goes wrong:**
HALO freezes four trees at import SHAs and forbids upstream sync (PROJECT.md Out of Scope). Within months, three classes of change accumulate upstream:

- **Provider and model growth.** OMP's provider/model policy is generated from a KDL rule tree into `rules.json` and `models.json` ([OMP AGENTS.md](https://github.com/can1357/oh-my-pi/blob/main/AGENTS.md)). New model families arrive as catalog + compat-rule changes. HALO cannot regenerate them from upstream and has no in-tree precedent for hand-authoring one.
- **Security fixes.** All four systems execute untrusted input: OMP runs shell/LSP/DAP processes, Hermes imports in-process plugin and hook code, Hindsight parses arbitrary memory content. A CVE in vendored code or a vendored dependency requires a port with no diff baseline.
- **Protocol growth.** OMP's RPC wire is explicitly versioned (`protocolVersion: 1`, negotiable `2`, with `rpc_chunk` reassembly) and grows by adding commands and frame categories ([RPC Protocol Reference](https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md)). HALO's Python adapter is written against the frozen frame set.

The failure is not the missing fix. It is that **nobody can find where the fix goes**. After squashing history and renaming identifiers, the upstream commit touches `packages/coding-agent/src/modes/rpc/rpc-types.ts` and the HALO equivalent has a different path *and* different symbol names. Locating it becomes an archaeology exercise performed under security pressure.

**Why it happens:**
A squash import preserves files but destroys the two indexes that make upstream work addressable: path identity and symbol identity. Rebranding then removes the third index — string search. Teams discover this only when the first urgent upstream fix arrives, at which point they hand-apply a patch with no record, and the ledger they never built becomes permanently stale.

**How to avoid:**
Build the ledger **during import**, from the import script, never by hand. Per component, commit five artifacts under `vendor/<name>/`:

1. `UPSTREAM.json` — repo URL, commit SHA, commit date, import date, import mode (`squash`), SHA-256 of the imported tree, SPDX license id, upstream tag/version if any.
2. `PATHS.json` — upstream path → HALO path map. Directory-prefix entries plus per-file exceptions, generated by the importer. This is what replaces `git log --follow`.
3. `RENAMES.json` — the ordered rename rules actually applied, with scope (e.g. `{"from":"HERMES_HOME","to":"HALO_HOME","scope":"vendor/hermes-agent/**"}`). Reverse lookup is the whole point: upstream symbol → HALO symbol.
4. `patches/` + `series` — every HALO-local edit as a patch against the pristine import. Rule: **no edit to a vendored file without a patch entry**.
5. `WATCHLIST.md` — the specific upstream areas HALO depends on (OMP `rpc-types.ts` + `rpc-frame.ts`; Hermes `plugins/*` + `hooks/*`; Hindsight retrieval + embedding clients), each with a local test that pins the behavior HALO relies on.

Add one CI job, `provenance-replay`: reconstruct each subtree from the pristine upstream tarball at the recorded SHA, apply `patches/series`, compare the tree hash to `importedTreeSha256` **plus the renames applied in order**. It fails on drift. This is also the escape hatch for a security port: apply the upstream commit to the pristine tree, let the rename map transform it, review the diff.

**Upstream-fix triage runbook (5 steps, put this in `docs/upstream-fixes.md`):**
1. Identify the upstream commit and its changed paths.
2. Map paths through `PATHS.json`.
3. Map symbols through `RENAMES.json` (reverse direction).
4. Land the change as a new patch in `patches/series` with the upstream commit SHA in the patch header.
5. Run `provenance-replay`; the new tree hash becomes the recorded one.

**Warning signs:**
- A one-line upstream fix takes a day because the HALO equivalent cannot be found.
- `grep` for the upstream identifier returns zero hits anywhere in the repo.
- Nobody can answer "which upstream commit is this file from?" without opening GitHub.
- Vendored files carry edits with no corresponding patch.
- Two copies of the same transitive dependency at different versions (the monorepo has three lockfile ecosystems: `Cargo.lock`, Bun lockfiles, `uv.lock`).

**Phase to address:** P1 (Import & Provenance). Verification: `provenance-replay` green on a clean checkout; a synthetic upstream fix can be triaged end-to-end in under 30 minutes.

---

### P-02: MIT compliance after rebrand — the notice requirement survives the rename

**What goes wrong:**
The rebrand pass is a bulk string replacement over four trees. MIT's operative sentence is: *"The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software"* ([OSI MIT text](https://opensource.org/license/mit)). That means:

- Bulk replacement rarely hits the holder name — the four holders are "Nous Research", "Vectorize, Inc.", the `can1357` handle, and `tchivs` — and that is exactly what makes it dangerous. It looks safe because the obvious `Copyright (c) …` lines survive, while the rule `s/hermes/halo/gi` rewrites the project name in attribution paragraphs, README "License" sections, header comments naming the work, attribution URLs, and `@oh-my-pi/pi-*` package names inside license-adjacent manifests. The resulting notice still exists, still says MIT, and no longer identifies the work it covers.
- Consolidating four `LICENSE` files into one root `LICENSE` is not compliance. Each subtree is a separate work with a separate holder; the notice must travel with that work.
- Source distribution is the easy case. The Electron installer and the compiled CLI are "copies" too; if `THIRD_PARTY_NOTICES` is not inside the installer and reachable from the app, the distributed binary ships without the notice.
- The fork adds a **transitive surface** nobody counts: hundreds of Rust crates, Bun packages, and Python wheels. Four MIT licenses do not cover an Apache-2.0 or BSD dependency inside OMP's Rust graph or Hindsight's Python graph. Apache-2.0 §4(d) additionally requires propagating a `NOTICE` file *if the work has one* ([Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)). MIT has no NOTICE concept at all — so copying an Apache-style NOTICE workflow proves nothing about MIT compliance, and vice versa.

**Why it happens:**
The rebrand is executed as a text transformation with a "make it look like HALO" success criterion. License obligations are prose, not strings, so no test fails. The legal review happens (if at all) after the installer is built.

**How to avoid:**
- **Per-subtree license material:** `vendor/<name>/LICENSE` verbatim, plus `vendor/<name>/COPYRIGHT` when upstream has per-file notices that are not in `LICENSE`. Never edit these files; they are excluded from every rewrite tool's scope by path, not by heuristic.
- **A rebrand denylist:** the rewrite tool must skip `**/LICENSE*`, `**/NOTICE*`, `**/COPYRIGHT*`, `**/THIRD_PARTY*`, and any `copyright`/`license`/`authors` field in manifests. Make this a hard-coded path filter in the tool, then assert the file hashes of those paths are unchanged after a rebrand run.
- **Binary notice bundle:** generate `THIRD_PARTY_NOTICES.txt` at build time from the three lockfile ecosystems (`cargo-about` or `cargo metadata` for Rust; a Bun lockfile scan for npm; `pip-licenses`/`uv` metadata for Python), include the four upstream texts at the top, embed the file in the Electron `resources/`, and expose it via `HALO → About → Open source licenses` and `halo --licenses`. A notice you cannot reach from the running app is a notice you did not ship.
- **Trademark separation, deliberately:** MIT grants no trademark rights (Apache's §6 says so explicitly; MIT is silent, which is worse). Removing upstream names and logos from the *product surface* is correct and necessary. Removing them from *copyright notices* is a license violation. Write this distinction into the rebrand tool's docstring so nobody "fixes" it later. Keep a short "Built on" attribution page naming the four upstreams — it is honest, useful, and reduces the appearance of endorsement ambiguity.
- **A compliance test that fails:** assert (a) each `vendor/*/LICENSE` exists and is byte-identical to the upstream file at the recorded SHA, (b) `Copyright` line count per vendored tree never decreases across commits, (c) the built installer contains `THIRD_PARTY_NOTICES.txt` and it mentions all four holders.

**Warning signs:**
- `git log -S "Copyright (c)" -- vendor/` shows deletions caused by a rebrand commit.
- Any `LICENSE` file is modified by a non-license commit.
- The About dialog says "MIT" but names no upstream.
- `cargo metadata`/lockfile audit shows Apache/BSD/MIT-OR-Apache deps absent from the notices bundle.
- A `NOTICE` file was invented at the repo root to "cover" MIT code.

**Phase to address:** P1 (Import), re-verified in P8 (Release) by inspecting the built installer, not the source tree.

---

### P-03: Internal-identifier rebrand fallout — half-renamed trees resolve two different homes

**What goes wrong:**
The rebrand touches surfaces that are read from hundreds of call sites, in four languages, with no compiler help. The concrete inventory in this codebase:

| Surface | Real identifiers in the vendored trees |
|---|---|
| Hermes home | `HERMES_HOME`; default `~/.hermes` on POSIX, `%LOCALAPPDATA%\hermes` on Windows ([env reference](https://hermes-agent.nousresearch.com/docs/reference/environment-variables)) |
| Hermes injected env | `HERMES_KANBAN_HOME`, `HERMES_KANBAN_BOARD`, `HERMES_KANBAN_DB`, `HERMES_KANBAN_WORKSPACES_ROOT` — injected by the dispatcher into worker subprocesses |
| Hermes paths | `~/.hermes/.env`, `~/.hermes/plugins/`, `~/.hermes/hooks/`, `~/.hermes/config.yaml`, `~/.hermes/logs/` |
| Hermes plugin ids | directory names + `plugin.yaml: name`; the `plugins.enabled` **allow-list gate** in `config.yaml` |
| Hermes entry point | `hermes_agent.plugins` Python entry-point group |
| Hermes Windows | `HERMES_DISABLE_WINDOWS_UTF8`, `HERMES_SESSION_*` bound around slash-command handlers |
| OMP home/logs | `~/.omp/logs/omp.YYYY-MM-DD.log`; `.omp` project dir ([AGENTS.md](https://github.com/can1357/oh-my-pi/blob/main/AGENTS.md)) |
| OMP env | `PI_NO_TITLE`, `PI_NO_PTY` — note the `PI_` prefix, inherited from OMP's upstream `pi`, *not* `OMP_` |
| OMP packages | `@oh-my-pi/pi-*`, `@oh-my-pi/pi-coding-agent/modes/rpc/rpc-frame` |
| OMP config | `config.yml`, `--config`, project/global settings precedence |
| OMP wire | 185 command types, frame types (`agent_end`, `host_tool_call`, `rpc_chunk`), `protocolVersion` |
| Hindsight env | ~200 `HINDSIGHT_API_*` variables; `HINDSIGHT_API_DATABASE_SCHEMA=public` default |
| Hindsight paths/scripts | `hindsight-api` console script, `hindsight-all`, `/mcp/{bank_id}/`, ports 8888/9999 |
| Hindsight DB | `vector` extension, `pg_extension.extversion`, table names, per-bank schema prefixes |
| gsd-omp | ExtensionAPI symbols, protocol v1, managed skill projection paths |

Four distinct failure modes, in order of likelihood:

**(a) Split-brain home.** HALO's Python core resolves `HALO_HOME`; a vendored Hermes call site still reads `HERMES_HOME` (or vice versa). On a machine that has both, the plugin loader reads one directory while the session store writes the other. Nothing errors. The user sees "my skills disappeared" or "settings reset" depending on which surface they opened. This is the highest-probability bug in the whole rebrand because environment reads are untyped string lookups scattered across modules.

**(b) One-way shims.** The migration reads the old config, writes the new one once, then never again. The user edits the old file out of habit; HALO ignores it. Or the shim *moves* instead of copies, so rollback to a pre-HALO build loses the user's data.

**(c) Tests pinned to old strings.** Vendor test suites assert `~/.omp/logs/...`, `hermes plugins enable`, or exact config paths. They keep passing (they are testing the old names) while HALO-owned tests assert the new names. CI is green; the product is half-renamed. The inverse is worse: a snapshot test that asserts the *new* name while a production code path still emits the old one, and nobody notices because the test exercises a different code path.

**(d) Gate drift on plugin ids.** `plugins.enabled` is an allow-list, so a missed rename does not produce a warning — plugins simply do not load. The inverse (`plugins.disabled` missed) can load something the user disabled. Because bundled plugin kinds bypass the allow-list entirely (see P-07), the observable behavior differs by plugin category, which makes this look like a plugin bug rather than a rename bug.

**(e) Schema rename without a migration.** Renaming the Hindsight schema away from `public` requires moving tables *and* the `vector` extension's objects, plus setting `search_path` for every pooled connection. Hindsight re-applies per-connection settings on acquire (`HINDSIGHT_API_DB_SESSION_SETUP_ON_ACQUIRE=true`), which includes a "vchord search path" — a schema rename that misses `search_path` fails only on the vector path, i.e. recall returns nothing while the app looks healthy.

**Why it happens:**
Renaming is treated as a find-and-replace task with a "zero hits" completion criterion. Zero hits in HALO-owned code is necessary but not sufficient: the failure lives at the seam between renamed and un-renamed layers, and at the seam between a migrated user and a fresh user.

**How to avoid:**
- **Generate, don't type.** One `brand.json` at the repo root; emit `brand.py`, `brand.ts`, and `brand.rs` constants from it. A lint/CI rule forbids literal `hermes`, `omp`, `hindsight`, `@oh-my-pi`, `HERMES_`, `HINDSIGHT_` in HALO-owned paths, with a narrow allowlist for `vendor/**`, license files, and the single shim module per language. The allowlist is a file, reviewed like code.
- **One resolver per language, read-old/write-new.** `resolve_home()` in Python and TS implements exactly this order: `HALO_HOME` → migrated marker → legacy `HERMES_HOME` → default `%LOCALAPPDATA%\HALO`. The migration **copies** (never moves) `~/.hermes` → HALO home, hash-verifies, writes `migration.json` with source path, source mtime, and HALO version, and refuses to run if a non-empty HALO home already exists (merging two user states is unrecoverable).
- **Env shims are read-only and logged once.** Accept `HERMES_*` only when the corresponding `HALO_*` is unset; emit one deprecation line per process. Never write legacy variables from new code.
- **Keep the RPC wire ABI, rebrand the UX.** The 185 OMP command names and frame types are an internal ABI between HALO's Python adapter and HALO's TS core. They are not user-visible. Renaming them buys nothing and buys a whole class of desync bugs (a stale binary on `PATH` answering an old schema). Rebrand the CLI name, config dirs, env vars, plugin ids, error messages, and docs. Leave the wire names alone unless there is a separate, versioned reason to change them.
- **Plugin ids: migrate the allow-list, don't just rename the plugin.** The migration must rewrite `plugins.enabled`/`plugins.disabled`, plus `hermes_agent.plugins` entry points. Test with a fixture `config.yaml` containing three old ids and assert all three still load after migration; test the deny case too (a disabled plugin must stay disabled).
- **Docs from code.** Generate the CLI reference from `--help` output in CI. Any doc that hard-codes a command name will drift; make drift impossible rather than reviewed.
- **Rename the schema in a migration step, not by editing `CREATE EXTENSION`.** Pin `search_path` explicitly on every pool connection, then assert at startup: `SELECT current_schema()`, `SELECT extversion FROM pg_extension WHERE extname='vector'`, and one vector query that must return rows.

**Warning signs:**
- `rg -i "hermes|hindsight|oh-my-pi"` returns hits outside `vendor/` and license files.
- Two config directories exist on a developer machine (`~/.hermes` and `%LOCALAPPDATA%\HALO`), both being written.
- A plugin works in the CLI but not in Desktop (different home resolution).
- Log lines contain both brands in one session.
- `halo doctor` prints upstream paths.
- User reports "my settings reset" that cannot be reproduced on a fresh profile.

**Phase to address:** P2 (Rebrand & Migration). Verification: identifier inventory test green; migration fixture tests (fresh, legacy-only, both-present, deny-listed plugin) green; `halo doctor` prints only HALO paths.

### P-04: The demoted loop comes back — transcript divergence in three independent ways

**What goes wrong:**
PROJECT.md asserts one Python agent loop owns every turn and OMP is a tool backend. That is a design decision, not an enforced property: OMP's RPC surface still exposes `prompt`, `steer`, `follow_up`, `compact`, `set_auto_compaction`, `new_session`, `fork`, and a goal engine. Any code path that sends `prompt` re-enables a second loop with its own compaction, its own model selection, and its own transcript. The result is two writers to one conversation and three separate divergence mechanisms:

1. **End-of-run misdetection.** `agent_end` carries `isTerminal?: boolean`, `yielded?: boolean`, `awaitingAsyncWork?: boolean`. The documented completion predicate is *"a run completes on an `agent_end` frame where `isTerminal !== false`"* ([RPC reference](https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md)). A host that keys on `type === "agent_end"` ends the user's turn when a subagent's run ends, or mid-continuation, and renders a partial answer as final.
2. **Truncated `agent_end.messages`.** The same reference states that for an oversized `agent_end` the encoder *"first removes the leading messages already delivered unchanged in `message_end` frames and adds `messageCount`"* and that *"Hosts must retain streamed messages rather than treating `agent_end.messages` as a complete transcript."* A Python adapter that snapshots `agent_end.messages` as the turn transcript silently drops the prefix — and the loss is size-dependent, so it appears only on long turns. Note the branch in the OMP reference docs: if even the compacted frame exceeds 64 MiB, `agent_end` falls back to an **empty** `messages` array plus `messageCount`.
3. **Unmirrored context (`context_message_added`).** A recall injection, a TDD policy reminder, or a compaction summary is appended to the model-facing message list, but no corresponding visible event is emitted. The documented pathology is exactly this: *"Mirrored context that is not surfaced (`context_message_added`) causes the visible transcript to diverge from what the model received"* (PROJECT.md "Known pathologies"). The user cannot see the instruction the model is obeying, or sees one it never got, and a bug report ("the model ignores my correction") cannot be reproduced from the transcript. This is the hardest bug class in the product because both sides are individually correct. The fix is a type-level invariant, not discipline: the only function that appends to the model-facing list also emits the event, and the adapter refuses to build a request from a list whose additions are not all mirrored.

A fourth, quieter variant: **yield vs settled**. `agent_end` with `yielded: true` and `awaitingAsyncWork: true` means background work (auto-backgrounded `bash`, async `task`, `eval`) can still wake the agent. If the UI marks the turn "complete" there, later tool results append to a finished answer, or are dropped.

**Why it happens:**
Event streams are consumed opportunistically: whichever flag is present is used as the terminal condition. The protocol is more expressive than the client, so the client collapses it. And because both loops are usually *off* in the same session (HALO's Python loop drives, OMP idles), the second-loop path is untested until a feature (goal continuation, `/fork`, a retry helper, a "resume" button) sends a prompt "just this once".

**How to avoid:**
- **Make the demotion structural.** The adapter exposes only tool-level commands. `prompt`, `steer`, `follow_up`, `compact`, `set_auto_compaction(true)`, `new_session`, `fork`, and the goal ops are not wrapped at all, so no HALO code can call them by accident. Configure the OMP session with auto-compaction off at creation.
- **Runtime assertion, not documentation.** The adapter treats `agent_start`, `agent_end`, `prompt_result`, `session_settled`, and `command_output` as protocol violations for the tool-backend session and raises a typed `SecondLoopDetected` error. If subagents are used later, allow exactly the `subagent_*` frames and nothing else.
- **Turn-end predicate in one function.** `is_turn_complete(frame) := frame.type == "agent_end" and frame.get("isTerminal", True) is not False and frame.get("yielded") is True`. UI quiescence is a separate predicate: `session_settled`. Never derive one from the other.
- **Mirror-or-drop rule.** Every message that enters the model request must produce exactly one transcript event, with a content hash. The adapter logs `(event_seq, role, content_sha256)` for the mirrored transcript and for the outgoing request, and a dev-build check diffs them every turn. OMP already ships a fake-provider harness (`packages/coding-agent/test/rpc-wire/fake-openai-server.ts`) that makes this cheap.
- **Sequence numbers with gap detection.** Carry a monotonic `seq` per session in the adapter's own envelope. A gap or reorder fails the turn loudly rather than rendering a plausible partial transcript.
- **Never infer transcript from a completion frame.** Persist from `message_start`/`message_update`/`message_end` events; treat `agent_end.messages` as a convenience field that may be partial or empty.
- **Respect the transport contract.** OMP caps physical stdout frames at 1 MiB and offers protocol v2 `rpc_chunk` reassembly ([RPC reference](https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md)). A Python client that reads line-by-line with a small buffer will truncate large tool outputs — which then look like model failures. Negotiate v2 in the `ready` handshake and validate `chunkId`/`index`/`count`/`byteLength`.

**Warning signs:**
- Two `agent_end` frames per user turn, or a turn that ends while a tool result is still streaming.
- `agent_end.messages` shorter than the streamed message count; `messageCount` present and larger than `len(messages)`.
- OMP's `get_session_stats` token counts diverge from HALO's accounting.
- A compaction summary the user never saw, or compaction running twice.
- The model "ignores" an instruction visible in the UI, or cites one that is not visible.
- `unknown command` or `command: "parse"` failures after shipping a new CLI next to an old core.

**Phase to address:** P4 (Coding-Core RPC Integration) owns the demotion and framing; P3 owns the mirror rule because the adapter is the only writer.

---

### P-05: Memory-vs-prompt contention — a deadline is not capacity

**What goes wrong:**
The documented pathology: interactive auto-recall shares a semaphore with deadline-free consolidation. Observed p50 wait **11.59 s against 1.12 s of work** across **44,342 recalls in 24 h**, and *raising the deadline made it worse* (PROJECT.md). The four-lane controller exists to prevent it. The pitfall is reproducing it anyway, in four specific ways:

**(a) Priority without reserved capacity.** A lane controller that only reorders *admission* leaves the actual bottleneck shared: one Postgres pool, one embedder client, one reranker semaphore, one Python worker pool. L0 wins the queue and then waits for a connection held by an L3 bulk retain. Hindsight's own config hints at this: `HINDSIGHT_API_DB_POOL_SLOW_ACQUIRE_THRESHOLD_SECONDS=0.05` warns on pool acquisition, and `DB_MAX_PARALLEL_WORKERS_PER_GATHER=0` exists so "background/bulk queries run serially (useful on worker processes sharing a primary with latency-sensitive traffic)" ([.env.example](https://github.com/vectorize-io/hindsight/blob/main/.env.example)).

**(b) Deadline as patience instead of shedding.** Hindsight's admission block is explicit that `*_MAX_CONCURRENT` caps *"let an unbounded queue form behind them"* and that the `*_MAX_WAIT_MS` values bound *"how long a request may WAIT before it is refused with 503 + Retry-After"*. Raising `ADMISSION_RECALL_MAX_WAIT_MS` does not add throughput; by Little's law it increases occupancy (L = λW), so more requests are in flight waiting, which lengthens the queue it was meant to shorten. Bronson et al. call the resulting state **metastable**: a trigger (a consolidation burst) moves the system into a bad state that persists after the trigger is gone, sustained by work amplification — retries, requeues, and timeouts that do work and return nothing ([Metastable Failures in Distributed Systems, HotOS '21](https://sigops.org/s/conferences/hotos/2021/papers/hotos21-s11-bronson.pdf)). Their prescription is exactly the opposite of a longer deadline: *"reduce internal queue sizes, enforce priorities during overload, shed load by rejecting a fraction of requests"*, and use **LIFO** so some requests actually meet their deadline.

**(c) Unpreemptible units.** A retain that submits a batch of texts to TEI holds the embedder for the whole request. TEI's `--max-client-batch-size` defaults to **32** and is documented as the maximum number of inputs a client may send in one request ([TEI README](https://github.com/huggingface/text-embeddings-inference)); Hindsight notes that TEI *"rejects anything larger outright rather than clamping it"* ([.env.example](https://github.com/vectorize-io/hindsight/blob/main/.env.example)). An L0 query embed arriving mid-batch waits for the entire batch. Likewise a 16k-token batch can occupy a CPU core for seconds. Cancellation cannot interrupt a single `/embed` call, so "preempt the lane" must mean "don't start the batch", not "stop it".

**(d) Preemption that corrupts state.** If L0 preempts L2/L3 by cancellation, the cancellation boundary matters more than the scheduling policy:
- A retain cancelled between "fact row written" and "embedding + entity edges written" leaves a memory that exists and can never be retrieved. Without a repair queue, it is permanent.
- A mental-model refresh cancelled after reading observations but before writing the page leaves the page inconsistent with its `last_refreshed` timestamp. Hindsight parks refresh triggers inside `HINDSIGHT_API_MENTAL_MODEL_MIN_REFRESH_INTERVAL_SECONDS` and folds bursts; a cancelled refresh that advances that window suppresses the retry. The refresh LLM timeout is **2700 s** — a 45-minute unit that must never be cancelled halfway through a write. [INFERENCE: the exact write ordering is Hindsight-internal; the invariant HALO must impose is atomic page+timestamp commit.]

**Why it happens:**
The pathology is a queueing phenomenon, not a bug, so it has no stack trace. Each local fix looks correct: raise the timeout (more patience), add a retry (robustness), increase concurrency (throughput). Each increases the work amplification that sustains the failure. And the seam is cross-system: nothing inside Hindsight knows a human is waiting on the first token, and nothing inside the CLI/Desktop knows Hindsight's queue depth.

**How to avoid:**
- **Reserve, don't just prioritize.** Give L0 a dedicated slice of every bottleneck: its own connection pool (or at minimum N reserved connections), one reserved embedder slot, and a query-lane client that never shares a batch with retain. Capacity domains, not labels.
- **Deadline = shed trigger.** On expiry, return a typed `degraded: no_memories` result with a UI-visible marker. Do **not** retry inside the same turn, and do not let the UI auto-retry. One recall attempt per turn, plus an explicit user-initiated refresh.
- **Bounded queues with LIFO for L0.** If the L0 queue is non-empty, a new prompt evicts the oldest queued recall rather than appending. L3 rejects immediately when its queue is full — a 503 that the background job logs beats a 30 s wait that no human is watching.
- **Measure the right metric.** p50 wait hides this failure by definition (the pathology *is* the median). Track per-lane p99 permit wait, queue depth, and **minimum queueing delay over a sliding window** — Bronson et al. recommend the CoDel-style minimum because a small minimum proves the queue drained at some point. Alert when the minimum is high for an entire window, not when an average is high.
- **Cancellation boundaries are transactional.** Retain: one transaction covering fact + embedding reference + entity edges, or a durable `pending_embedding` row with a startup repair job. Refresh: commit page content and `last_refreshed` together; only advance the min-interval window on successful commit. Document the allowed cancellation points.
- **Never tune the timeout to fix latency.** Put this in the code review checklist: a PR that raises a memory deadline must add capacity, add reservation, or reduce work — otherwise it is rejected.
- **Assert the invariant in test.** Soak test: 20 concurrent L3 retains + one L0 recall every 200 ms for 10 minutes; assert L0 p95 first-token ≤ 2× baseline and that no consolidation blocks an L0/L1 waiter > 200 ms (PROJECT.md performance constraint). Run it on the Low hardware profile too.

**Warning signs:**
- Recall p50 wait exceeds recall work time (the original 10×).
- Queue depth rises while throughput is flat.
- Recall timeouts correlate with consolidation start times in logs.
- Memory "disappears" after a crash/restart (partial retain).
- A mental model looks stale while `last_refreshed` is recent.
- `hindsight.db.pool.waiting` spikes during background jobs; `DB_POOL_SLOW_ACQUIRE` warnings appear.
- TEI shows a full batch queue while a single query embed is pending.

**Phase to address:** P6 (Four-Lane Scheduler) owns lanes and metrics; P5 owns transactional boundaries and the repair job. The soak test belongs to P8.

---

### P-06: CPU TEI on Windows — the distribution model does not exist

**What goes wrong:**
PROJECT.md requires "CPU TEI embedder and CPU TEI reranker as supervised child processes, no Docker requirement" on Windows. The evidence says that path is not available off the shelf:

- TEI's own release does not ship binaries. The **v1.9.4 GitHub release has zero assets** ([release](https://api.github.com/repos/huggingface/text-embeddings-inference/releases/latest)); distribution is container images (`ghcr.io/huggingface/text-embeddings-inference:cpu-*`) plus a Homebrew formula for Apple Silicon. The README's "Local Install" section lists **only** "Apple Silicon (Homebrew)"; there is no Windows install path ([README](https://github.com/huggingface/text-embeddings-inference)).
- Hindsight does not use TEI by default either. `HINDSIGHT_API_EMBEDDINGS_PROVIDER` defaults to `local` (sentence-transformers), with an `onnx` provider described as *"CPU by default, opt-in CUDA; no Ollama/TEI sidecar"*, and the reranker defaults to `local`; TEI is opt-in via `EMBEDDINGS_TEI_URL` / `RERANKER_TEI_URL` ([.env.example](https://github.com/vectorize-io/hindsight/blob/main/.env.example)).
- Hindsight's Windows CI proves the *non-TEI* path: it pre-downloads `BAAI/bge-small-en-v1.5` and a cross-encoder, runs embedded `pg0`, and budgets **300 s** for first boot because *"pg0 unpacks Postgres + runs initdb on first boot, which is slow on a cold Windows runner"* ([windows-smoke.yml](https://github.com/vectorize-io/hindsight/blob/main/.github/workflows/windows-smoke.yml)).

So the intended architecture has HALO shipping, building, supervising, and updating a Windows binary that upstream does not publish. That is a project, not a packaging step. Compounding it, TEI's defaults are server defaults: `--max-concurrent-requests` 512, `--max-batch-tokens` 16384, `--max-client-batch-size` 32, and the README itself warns that a low concurrency limit *"will refuse clients requests instead of having them wait for too long and is usually good to handle backpressure correctly"* — i.e. the default is tuned for a GPU host that can absorb 512 in flight. Hindsight's own defaults inherit the same assumption: the documented failure is `HTTP_TIMEOUT=30.0` and `LLM_MAX_CONCURRENT=32`, both of which fail under CPU reranking and local model endpoints (PROJECT.md). The timeout is the specific trap: 30 s is generous for a GPU rerank and short for a CPU rerank of a few dozen candidates, so the system reports a timeout that reads as "the model is slow" rather than "we sized the pool for hardware we do not have".

The remaining failure modes are Windows-process failures, not model failures:

- **First-boot download.** Weights come from the Hugging Face hub at startup. On a cold, offline, or proxied machine, `halo` starts, the sidecar never becomes healthy, and the first chat hangs or silently degrades. Model sizes are hundreds of MB.
- **Port collisions.** Hindsight's documented TEI endpoints are `http://localhost:8080` (embed) and `http://localhost:8081` (rerank); the API is 8888 and the UI 9999; Postgres is 5432. Windows has **no Unix-domain sockets for Postgres** — `unix_socket_directories` defaults to empty there, so the DB must listen on TCP ([PostgreSQL docs](https://www.postgresql.org/docs/current/runtime-config-connection.html)). Every one of those ports is a collision with a dev machine's other tools.
- **Orphaned sidecars.** Node's `subprocess.kill()` sends a signal to one PID; on Windows the signal terminates that process "forcefully and abruptly" but there is no process-group semantics ([Node docs](https://nodejs.org/api/child_process.html)). A TEI or Postgres launched through a shim leaves children behind. The next launch either fails to bind or, worse, connects to a stale sidecar from a previous version with a stale model loaded.
- **Extension/ABI mismatch after a Postgres upgrade.** `pgvector` is a native extension; its DLL must match the server major version, and after installing new binaries you must run `ALTER EXTENSION vector UPDATE` in each database ([pgvector README](https://github.com/pgvector/pgvector)). `pg_upgrade` step 5 is explicit: *"shared object files matching the new server binary must be installed in the new cluster"* ([pg_upgrade](https://www.postgresql.org/docs/current/pgupgrade.html)). On Windows the extension is built with `nmake` against `PGROOT`, and Postgres 17.0–17.2 has a known link failure fixed in 17.3+ ([pgvector README](https://github.com/pgvector/pgvector)).

**Why it happens:**
"Bundle TEI" is written as a deployment detail in the requirements, and it reads like `npm install` for a service. The distribution channel (Docker) is excluded by a separate decision (no Docker), and the platform (Windows) is the one TEI does not build for. Neither constraint is visible where the requirement is written.

**How to avoid:**
- **Decide the embedder story before the memory phase starts.** Two acceptable shapes:
  1. *Recommended:* ship the ONNX/local embedder + reranker as the Windows default (upstream's own default, in-process, no extra binary, no port, no download at chat time), and treat TEI as an optional advanced backend behind a capability probe. This satisfies "CPU-only inference" and removes the largest unbounded risk in the plan.
  2. *If TEI is mandatory:* own the build. Pin a Rust toolchain, build `text-embeddings-router.exe` on Windows in CI, publish it as a HALO artifact with a checksum, and gate P5 on a spike that proves CPU throughput on the Low profile (≤4 vCPU/8GB). Do not assume the crate builds cleanly on MSVC until the spike says so.
- **Provision models at install time.** Download to `%LOCALAPPDATA%\HALO\models` during install/first run with a progress UI, verify SHA-256, write a manifest, then set offline mode (`HF_HUB_OFFLINE=1`) for the sidecar. Never let a chat turn trigger a multi-hundred-MB download. Fail with an actionable message ("run `halo models prepare`") rather than degrading silently.
- **Profile-driven flags, explicit, never defaults.** Derive from the hardware heuristic (PROJECT.md): Low (≤4 vCPU/8GB) `--max-concurrent-requests 8–16`, `--max-batch-tokens 2048–4096`, `--max-client-batch-size 8`; Standard `32 / 8192 / 16`; High `64 / 16384 / 32`. Always set `--auto-truncate` explicitly. Ensure `--max-client-batch-size ≥ HINDSIGHT_API_EMBEDDINGS_TEI_BATCH_SIZE` (default 32) or TEI rejects the request outright.
- **No fixed ports.** Bind port `0`, read the assigned port, and pass it to Hindsight as `*_TEI_URL`. For Postgres choose a free port, persist it in the HALO home, bind `127.0.0.1` only, and set a per-install random DB password with `scram-sha-256`. Use a single-instance mutex so a second launch attaches to the running stack instead of spawning a second one.
- **One supervisor owns every child.** On Windows, create a Job Object per app instance with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` and assign each spawned process at creation; closing the last handle then terminates the whole tree ([Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)). Persist `{pid, image_path, creation_time, port}` to `runtime.json`; on startup, reclaim only PIDs whose creation time and image path match (never kill by image name).
- **Treat the data directory as a versioned unit.** Record the Postgres major in `PG_VERSION` (Postgres writes it); store HALO's expected major beside it. On mismatch, run a typed upgrade flow: stop stack → install new server + matching pgvector DLL → `pg_upgrade --check` → upgrade → `ALTER EXTENSION vector UPDATE` → verify `SELECT extversion FROM pg_extension`. Pin Postgres ≥ 17.3 on Windows for the pgvector link fix. Never open an old data dir with a new major "to see if it works".
- **Health, not sleep.** Poll `/health` with backoff and a hard deadline; surface the sidecar's last 40 log lines in the failure UI. Hindsight's Windows job needed 300 s for cold initdb — plan the UX for that, don't paper over it with a longer timeout in the chat path.

**Warning signs:**
- First chat takes 60 s or hangs with no progress UI.
- `/health` not green after the deadline; TEI process alive but no listening port.
- Two `postgres.exe` trees, or a stack that survives app exit.
- Second launch "works" but shows stale data (connected to a zombie).
- `FATAL: database files are incompatible with server`; `could not access file "$libdir/vector"`; `extension "vector" is not available`; `extension "vector" has no update path`.
- Recall returns zero results while the app reports healthy (schema/`search_path` miss).
- A TEI request rejected with a batch-size error because `max-client-batch-size` < Hindsight's batch setting.

**Phase to address:** P5 (Memory Runtime & Bundling) owns binaries, flags, ports, and supervision; P7 owns app-exit teardown. The TEI build spike is a **P5 entry gate**, not a P5 task.

### P-07: Policy-gate bypass — "one path" is a claim until closure is proven

**What goes wrong:**
PROJECT.md's core value is that every tool decision reaches exactly one backend through one adapter and one `pre_tool_call` gate. The vendored systems each contain *documented* alternate execution paths that do not go through a model tool call. Every one of them is a bypass if HALO wires it up without a wrapper:

| Bypass path | Where it comes from | Why it skips the gate |
|---|---|---|
| Plugin `ctx.dispatch_tool(name, args)` | Hermes plugin API — *"invokes a registered tool with parent-agent context auto-wired"* ([plugins doc](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/plugins.md)) | Plugin code calls a tool directly; no model decision, no registry precedence, no gate |
| Plugin tools via `ctx.register_tool(handler=...)` | same doc | Handler runs in-process; if registered straight into the model-facing registry, the adapter is bypassed |
| `ctx.call_mcp(server, tool, arguments)` | same doc | MCP tool executes without passing the HALO adapter |
| Gateway hooks `~/.hermes/hooks/<name>/handler.py` | *"imported in-process… no sandbox, no first-use prompt, and `HERMES_SAFE_MODE` does not skip this loader"*; not gated by `plugins.enabled` ([hooks doc](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/hooks.md)) | Arbitrary code with the gateway's credentials and tool access, by file placement |
| Shell hooks in `config.yaml` | hooks doc | Arbitrary process execution outside the registry |
| Bundled plugin kinds | `plugins.enabled` explicitly does **not** gate bundled platforms, backends, memory providers, context engines, model providers (plugins doc) | A user cannot disable them; they run regardless of the allow-list |
| OMP `set_host_tools` + `host_tool_call` | RPC doc: host defines a tool, OMP's loop calls it, the host executes | The decision originates in OMP's registry; the gate must be in the host handler or it is absent |
| OMP `bash` command | RPC doc: `bash` is a command, *"dispatched concurrently"* while the server keeps reading | A caller can run a shell without the tool path |
| OMP subagents | `subagent_lifecycle` / `subagent_event`, `cancel_subagent`, `steer_subagent` | Tool calls inside a subagent never cross the Python adapter |
| gsd-omp extensions | ExtensionAPI, programmatic slash commands | Extension-internal calls |
| Kanban workers / cron | Hermes dispatcher injects `HERMES_KANBAN_DB` into worker processes | Worker agents act without the interactive gate |

The deeper problem is **claim integrity**. If the product says "no policy can be skipped" while a `handler.py` dropped in the user's home runs in-process with full tool access, the security model is false even though the model-facing path is correct.

**Why it happens:**
The gate is designed as middleware in front of the *model's* tool call. Vendored systems have more than one caller of their tool executor. Wiring the model path first is natural; the other entry points are discovered later, one bug report at a time, and each is patched locally instead of being inventoried.

**How to avoid:**
1. **One executor, structurally unreachable otherwise.** Exactly one function performs side effects (`execute_tool_call`). Backend modules (`tools/*`, `bash`, plugin handlers) are private to the adapter package. A lint/import test asserts no module outside `halo/policy/` imports a backend executor. This is enforcement by dependency direction, not review.
2. **Backend receipts, not Python-side trust.** Every backend call carries `{decision_id, tool, args_hash, nonce}` derived per session by the gate. The backend refuses to execute without a valid receipt and logs a `gate_bypass_attempt` counter. Now a bypass produces a visible metric rather than a silent side effect. This is the only way to catch a path you did not think of.
3. **A per-entry-point matrix test.** `docs/policy-surface.md` enumerates every entry point above (plus future ones) and, for each, two tests: allow → executes and records exactly one decision; deny → no side effect. Assert the *side effect*, not the return value: a denied `write` must leave the file untouched; a denied `bash` must leave no process and no output file. A test that only checks `success: false` will pass while the file is already written.
4. **Deny-by-default registry.** Unknown tool name, unknown plugin tool, unknown MCP tool → deny with a typed error. The unified registry precedence rules decide *which* handler wins; the gate decides *whether* anything runs. Do not let precedence resolution be the only lookup.
5. **Subagents are a policy decision, not a detail.** If OMP subagents are enabled, their tools must be host tools executed by HALO (so the gate applies), or subagents are disabled in the tool-backend session. Write the choice down; do not leave it to whichever code path a feature uses.
6. **Confront the ungated loaders.** Either (a) do not load `~/.hermes/hooks` in HALO, or (b) load them but state the trust model honestly: *"placing a file in the HALO home grants code execution as your user; the policy gate governs model-initiated tool calls, not user-installed extension code."* Then protect the home with ACLs and document it. Do not claim a closed system while an in-process, unsandboxed loader exists.
7. **Fail closed.** Keep the upstream behavior where a timed-out policy callback blocks the call (`hook_callback_timeout` default 30 s fails closed for `pre_tool_call`). A gate that times out open is a bypass.
8. **Log both sides.** Every decision gets a row; every execution gets a row; a daily invariant check asserts `executions_without_decision == 0` and alerts on divergence.

**Warning signs:**
- A tool works with plugin A enabled and silently changes behavior when it is disabled.
- Side effects occur on `success: false`.
- Execution logs contain tools with no matching decision id.
- `bash` is reachable from anywhere other than the tool adapter.
- Two different code paths can produce the same tool result shape (host tool vs adapter tool).
- Deny tests pass, but a filesystem/process inspection shows work was done.
- Documentation says "all ~100 tools" while the plugin loader executes arbitrary code.

**Phase to address:** P3 (Unified Adapter & Policy Gate). Verification: matrix tests per entry point with side-effect assertions; zero `gate_bypass_attempt` in a full test run; a red-team task that tries every path in `policy-surface.md` and reports which one executes unrecorded.

---

### P-08: Windows traps — paths, line endings, locks, scanners, and orphans

**What goes wrong:**
Six independent Windows behaviors, each of which looks like a different bug:

**(a) MAX_PATH.** The Win32 path limit is 260 characters unless the app both opts in via the `longPathAware` manifest element and the machine has `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled = 1`; the `\\?\` prefix reaches 32,767 but cannot be used with relative paths, forward slashes, `.` or `..` ([Microsoft docs](https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation)). HALO stacks depth: `%LOCALAPPDATA%\HALO\...` + `vendor/oh-my-pi/packages/coding-agent/src/...` + a user project path + `node_modules/.bin/...`. The failure is inconsistent: some APIs accept the path, the shell UI does not, and `DeleteFileW` defaults to MAX_PATH as well ([DeleteFileW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-deletefilew)).

**(b) CRLF and import fidelity.** OMP ships a `.gitattributes` that sets `* text=auto eol=lf`, `*.cmd`/`*.bat` to `crlf`, marks `*.lock`/`Cargo.lock`/`bun.lock` as `-text`, `packages/catalog/src/models.json` as `binary`, and `*.wasm filter=lfs` ([.gitattributes](https://github.com/can1357/oh-my-pi/blob/main/.gitattributes)). A squash import that (i) drops per-subtree `.gitattributes`, (ii) clones with `core.autocrlf=true`, or (iii) copies the working tree without smudging LFS, produces: CRLF source that breaks exact-content tests, lockfiles whose bytes changed (Cargo may re-resolve), and 130-byte LFS pointer files where parser tests expect a WASM module. All three look like "the vendored tests are flaky".

**(c) File locks.** `DeleteFile` fails while another handle is open unless that handle specified `FILE_SHARE_DELETE`; the file is then marked for delete-on-close and subsequent opens fail with `ERROR_ACCESS_DENIED` ([DeleteFileW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-deletefilew)). Consequences: auto-update cannot replace `halo.exe` while running; log rotation cannot delete an open log; `rm -rf node_modules` fails while a watcher holds a file; and OMP's RPC server *spills oversized pending output to a private temp file under backpressure* ([RPC doc](https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md)) — if the process is killed, that file leaks, and a cleanup pass that races an open handle fails.

**(d) Antivirus on hot paths.** Every spawn and every dependency read is scanned. This shows up as a 3–5× build slowdown, random `EBUSY`/`EPERM`, and false positives on unsigned Rust binaries that download packages — Hermes documents exactly this for its bundled `uv.exe` and recommends a folder exclusion under `%LOCALAPPDATA%\hermes\bin` ([Hermes README](https://github.com/NousResearch/hermes-agent#troubleshooting)). Microsoft's own position is that *"Every exclusion is a protection gap that lowers your defenses"*, with contextual exclusions (`PathType`, `ScanTrigger`, `Process`) as the narrower tool ([Defender exclusions](https://learn.microsoft.com/en-us/defender-endpoint/microsoft-defender-antivirus-exclusions-overview)). A product that instructs users to exclude a folder teaches them to weaken their machine.

**(e) Console encoding.** Hermes ships a UTF-8 stdio shim and an escape hatch (`HERMES_DISABLE_WINDOWS_UTF8`) because the default console code page mangles output. Hindsight's Windows CI sets `PYTHONUTF8=1` and `PYTHONIOENCODING=utf-8` specifically so *"the API/CLI's ✓/box-drawing output doesn't crash the default Windows cp1252 codec"* ([windows-smoke.yml](https://github.com/vectorize-io/hindsight/blob/main/.github/workflows/windows-smoke.yml)). HALO's JSONL RPC framing must be UTF-8 end-to-end; a child process inheriting cp1252 will either crash on a checkmark or corrupt a tool result containing non-ASCII text.

**(f) Orphaned process trees.** Node's `kill()` terminates the named process; on Windows signals are coercions to forceful termination of *that* process, with no tree semantics ([Node docs](https://nodejs.org/api/child_process.html)). `cmd.exe /c`, package-manager shims, LSP servers, and DAP adapters all create grandchildren. On app exit they keep ports, file handles, and CPU. Electron's quit sequence is synchronous by default, so async cleanup without `event.preventDefault()` + `app.exit()` simply does not run. The correct fix is a Job Object with `KILL_ON_JOB_CLOSE` ([Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)).

**Why it happens:**
Each trap is a platform behavior, not a code defect, so it is invisible in review on a Linux CI runner and only appears on the one supported target. The project explicitly supports only Windows, which means Windows is also the *only* place these bugs are found — after they ship.

**How to avoid:**
- **Path budget by construction.** Keep the install root short (`%LOCALAPPDATA%\HALO`), forbid user-configurable deep install roots, enable `longPathAware` in every executable's manifest, and set `LongPathsEnabled` in the installer (or detect and warn). Add a test that creates a file at 300 characters through every file API HALO uses (Python `open`, Bun `Bun.write`, Rust `std::fs`, Electron `fs`). Normalize to absolute paths at the boundary; never mix `\\?\` with relative paths.
- **Preserve `.gitattributes` at every vendored root** and verify the import: compare each imported file's SHA-256 to the upstream blob for text files, and assert LFS artifacts are real binaries (size > 1 KB, expected magic bytes for `.wasm`). Add a root `.gitattributes` that keeps `vendor/**` binary assets `-text`. Never run a formatter or line-ending normalizer over `vendor/**`.
- **Assume locks, don't fight them.** Write-temp-then-`os.replace` for config files; retry-with-backoff on `EPERM`/`EBUSY` for delete/rename; auto-update writes a new versioned directory and swaps a shim, or requires app exit before replacing the exe; cleanup jobs skip open handles and retry next boot. Persist the RPC spool path in `runtime.json` so a crash's leftovers are reclaimable.
- **Measure before excluding.** Ship a one-click diagnostic that reports build/test timings, then offer a **Dev Drive** or a contextual exclusion — never a blanket folder exclusion by default, and never an extension-wide exclusion. If HALO's own unsigned binaries trigger false positives, sign them; do not ask users to disable protection.
- **Force UTF-8 at every boundary.** Set `PYTHONUTF8=1` and `PYTHONIOENCODING=utf-8` in every Python child HALO spawns; use `SetConsoleOutputCP(CP_UTF8)`/wide APIs in the Rust core; configure Node streams as UTF-8; ensure the JSONL frame codec is byte-exact UTF-8 with explicit `\n` (never platform newline translation).
- **One job object per app instance.** Assign at spawn (including grandchildren, since job membership is inherited by default); `KILL_ON_JOB_CLOSE` guarantees teardown even if the app crashes. On graceful quit: stop accepting work → flush → wait with a deadline → `TerminateJobObject` → verify no matching PIDs remain → exit. Add `windowsHide: true` on every Node spawn so the GUI never flashes consoles.
- **Test on the target, always.** A Windows-only product with Linux CI is untested. At minimum: build + a smoke scenario on `windows-latest` per PR, and a nightly full-stack boot/shutdown test that asserts zero surviving `postgres.exe`/`tei.exe` after exit.

**Warning signs:**
- `ENAMETOOLONG`/`ENOENT` on deep paths, or a file visible in Explorer but not in the app.
- `git status` shows files modified after a fresh clone (line endings).
- `git diff` on lockfiles after import.
- "The process cannot access the file because it is being used by another process" during update, rotation, or cleanup.
- Builds that are 3–5× slower on one machine than another with identical specs.
- Garbled characters or `UnicodeEncodeError` in tool output.
- Every tool spawn flashes a black console window.
- A second launch fails to bind a port; Task Manager shows sidecars after quit.

**Phase to address:** P7 (Desktop/CLI Surfaces & Packaging) owns paths, encoding, jobs, and shutdown; P1 owns import fidelity (`.gitattributes`, LFS); P5 owns sidecar supervision.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|---|---|---|---|
| Squash import without `PATHS.json`/`RENAMES.json` | One afternoon saved | Every future security port becomes archaeology; the ledger can never be reconstructed reliably | **Never** — the ledger is cheapest at import and impossible later |
| Rebrand the 185 RPC command names "for consistency" | Looks thorough | Wire ABI desync between a stale binary and a new core; every frame type becomes a failure mode | Never, unless versioned as a separate breaking protocol |
| Delete vendored tests that reference upstream paths | Green CI | Removes the only behavioral pin on vendored code; the P-01 watchlist has nothing to attach to | Only with a replacement test that pins the same contract |
| One shared semaphore "for now" between recall and consolidation | Simpler to write | Reproduces the exact p50 11.59 s pathology the four-lane controller exists to prevent | Never in the memory path |
| Gate only in Python, no backend receipt | No schema work | Undetectable bypasses; cannot prove closure | Only for a throwaway prototype, never in a release |
| TEI binary built ad hoc on the dev machine | Unblocks the demo | Unreproducible installs; no Windows CI artifact; upgrade path undefined | Never for a shipped build |
| Keep two config homes "for compatibility" | No migration code | Split-brain: two surfaces write different homes, users lose settings | Only with a read-old/write-new shim and a deletion date for the old path |
| Long-path workaround: "clone to `C:\h`" | No manifest changes | Users still hit it; tool outputs embed wrong paths | Never as the only mitigation |
| Load `~/.hermes/hooks` because a user asked | Feature parity | Arbitrary code execution the gate does not cover, contradicting the product's core claim | Only with an explicit, documented trust statement |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|---|---|---|
| OMP stdio RPC | Reading line-delimited frames with a small buffer and assuming 1 MiB is enough | Negotiate protocol v2 in the `ready` handshake; validate `rpc_chunk` `chunkId/index/count/byteLength`; enforce the reassembly limit |
| OMP run completion | Treating any `agent_end` as terminal | `isTerminal !== false` **and** `yielded` for the turn; `session_settled` for quiescence; never treat `agent_end.messages` as complete |
| OMP as a backend | Wrapping `prompt` "for convenience" | Wrap only tool-level commands; assert no `agent_start`/`prompt_result` frames arrive |
| OMP host tools | Letting OMP's loop decide and the host execute without a gate | Gate inside the host handler; treat `host_tool_call` as untrusted input |
| Hermes plugins | Assuming `plugins.enabled` gates everything | Bundled platforms/backends/memory/model providers bypass the allow-list; inventory what actually loads |
| Hermes hooks | Assuming `HERMES_SAFE_MODE` disables hooks | It does not skip the gateway hook loader; disable the loader or document the trust model |
| Hindsight embeddings | Pointing `TEI_URL` at a default port and using TEI defaults | Bind port 0, pass the real port; set concurrency/batch for the CPU profile; keep `TEI_BATCH_SIZE ≤ max-client-batch-size` |
| Hindsight schema | Renaming away from `public` with `CREATE EXTENSION` edits | Migrate objects, pin `search_path` per pooled connection, assert `current_schema()` + a working vector query at startup |
| Postgres on Windows | Trying Unix-domain sockets | Windows has none by default; use TCP on `127.0.0.1` with a per-install port and password |
| pgvector | Copying a DLL from another Postgres major | Build against the exact major (`nmake PGROOT=...`), pin ≥17.3, run `ALTER EXTENSION vector UPDATE` |
| Electron quit | Relying on `will-quit` for async teardown | `preventDefault()` → cleanup with deadline → `app.exit()`; Job Object as the backstop |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|---|---|---|---|
| Lanes share one DB pool / embedder semaphore | L0 waits behind L3 despite priority | Reserved capacity per lane; separate pools; `DB_MAX_PARALLEL_WORKERS_PER_GATHER=0` for bulk | As soon as one consolidation overlaps a prompt (low load) |
| Deadline raised instead of capacity added | p50 wait grows with the new deadline | Treat deadline as a shed trigger; reject rather than queue | Immediately — it is the documented pathology |
| Retry on recall timeout | Load doubles while goodput goes to zero | One attempt per turn; degrade visibly | When p99 crosses the deadline |
| TEI batch of 32 blocks a query embed | Single-query latency spikes during retain | Separate query-lane client or reserved slot; smaller batch on Low profile | During any background retain |
| `--max-batch-tokens 16384` on 4 vCPU | Core pegged, latency in seconds | Profile flags: 2048–4096 on Low | First real use on a laptop |
| First-boot model download in the chat path | 60 s+ first turn, timeouts offline | Provision at install; offline mode; progress UI | Every fresh install |
| HNSW index build during first import | Startup appears hung; memory spikes | Raise `maintenance_work_mem` for the build; build in a migration step with progress | Corpus > a few thousand vectors |
| 2700 s mental-model refresh competing with recall | Multi-minute recall stalls, then a burst | Lane isolation; min-refresh-interval; never in L0/L1 capacity | Whenever a refresh triggers during use |
| Defender scanning `node_modules`/`target/`/data dir | Builds 3–5× slower; random `EBUSY` | Dev Drive for development; measure first; sign binaries | Every machine with real-time protection on |
| p50-only latency dashboards | The pathology is invisible | p99 permit wait, queue depth, sliding-window minimum queueing delay | From the first incident |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---|---|---|
| Storing Memory Model credentials in `.env` because Hermes uses `~/.hermes/.env` for secrets | Credential theft by any process running as the user; accidental commit | OS keyring (DPAPI) as the store; inject into child env only for the sidecar lifetime; never log or dump env |
| Passing model API keys via env to sidecars | Windows process environment is readable by same-user processes | Pass via inherited handle or a short-lived file with restrictive ACL; scope to the child |
| Local Postgres with trust auth / default port | Any local process reads the entire memory graph | `scram-sha-256`, random password, `127.0.0.1` only, per-install port |
| Gateway hooks / plugin loaders as "just extensions" | Arbitrary code execution by file placement, outside the gate | Do not load them, or document the trust boundary and ACL the home directory |
| Logging memory payloads (retain content, recall queries) | Private user data in plaintext logs, exfiltrated by support bundles | Redact at the logger, not at the call site; `HERMES_DUMP_REQUESTS` off by default and loudly labeled |
| Treating tool output as trusted | Prompt injection from file/web content reaches the policy layer | Gate decisions on structured args, not model-authored text; never parse policy from tool output |
| Shipping unsigned sidecars | AV quarantine, SmartScreen warnings, users disabling protection | Sign all binaries; publish hashes; never instruct users to exclude folders |
| RPC surface exposed beyond stdio | Local privilege escalation via `bash`/tool commands | Keep the transport on inherited stdio; no TCP listener; authenticate if a listener is ever added |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---|---|---|
| Silent first-boot download/unpack | "HALO is broken" on first launch | Blocking progress screen with model size, ETA, and a retry/offline path |
| Degraded recall with no indicator | User trusts an answer that had no memories | Visible "memory unavailable" chip with a one-click retry |
| Two config homes after migration | Settings appear to reset depending on surface | Single resolver, migration banner, `halo doctor` shows the active home |
| Console windows flashing on every tool | Looks like malware | `windowsHide` on every spawn |
| Memory "thinking" with no lane feedback | User cannot tell if it is waiting or working | Show lane + queue state in the memory panel; never block the composer |
| Turn marked complete, then results append | Answer changes under the user | Use yield-vs-settled semantics to keep a "still working" state until settled |
| License/attribution unreachable | Compliance and trust failure | About → Open source licenses, and `halo --licenses` |
| Migrating by moving (not copying) the old home | Rollback loses everything | Copy, verify, keep the source, offer export |

---

## "Looks Done But Isn't" Checklist

- [ ] **Provenance:** every vendored subtree has `UPSTREAM.json`, `PATHS.json`, `RENAMES.json`, `patches/series`; `provenance-replay` reconstructs the committed tree from pristine upstream + patches.
- [ ] **Licenses:** four verbatim `LICENSE` files untouched by the rebrand; copyright-line count per tree non-decreasing; installer contains `THIRD_PARTY_NOTICES.txt` covering Rust, npm, and Python graphs.
- [ ] **Identifiers:** zero `HERMES_`/`HINDSIGHT_`/`@oh-my-pi`/`~/.omp` in HALO-owned paths; migration fixture tests pass for fresh, legacy-only, both-present, and deny-listed-plugin profiles.
- [ ] **Single loop:** OMP session never receives `prompt`; adapter raises on `agent_start`; turn-end uses `isTerminal !== false && yielded`.
- [ ] **Transcript:** mirrored events reconstruct the model request hash byte-for-byte on a long turn (>1 MiB) and on a background-wake turn.
- [ ] **Gate:** `policy-surface.md` matrix tests pass with side-effect assertions; `executions_without_decision == 0`; deny-by-default proven for unknown tools.
- [ ] **Memory isolation:** Low-profile soak shows L0 p95 ≤ 2× baseline with concurrent L3; no consolidation blocks an L0 waiter > 200 ms.
- [ ] **Bundled runtime:** works on a clean Windows VM with no Docker and no dev tools; first boot completes or fails with an actionable message; models provisioned offline.
- [ ] **Upgrade:** an install from the previous Postgres major upgrades via a tested path (`pg_upgrade --check` → upgrade → `ALTER EXTENSION vector UPDATE` → vector query).
- [ ] **Shutdown:** after quit and after a forced kill, zero matching `postgres.exe`/`tei.exe` remain; the next launch binds fresh ports.
- [ ] **Windows fidelity:** 300-character path test passes through all four file APIs; lockfile bytes match upstream; LFS artifacts are real binaries.
- [ ] **Encoding:** non-ASCII tool output round-trips through the RPC and the CLI on a cp1252-default machine.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---|---|---|
| Fork debt with no ledger | HIGH | Reconstruct `UPSTREAM.json` by matching file hashes against upstream tags; rebuild `PATHS.json` from the import script's commit if it exists in CI logs; otherwise accept a best-effort map and add the replay job immediately |
| License notice stripped | MEDIUM | Restore `LICENSE`/headers from upstream at the recorded SHA; regenerate notices; re-release the installer; audit prior distributed artifacts |
| Split-brain home | MEDIUM | Detect both homes at startup; choose the one with the newer session DB; export the other to a backup dir; log the decision; add a migration banner |
| Second loop discovered in production | MEDIUM | Disable the prompt path behind a flag; replay affected sessions from `message_*` events to repair transcripts; add the runtime assertion |
| Contention regression | HIGH | Drop the deadline to a shed threshold, enable LIFO and queue caps, isolate the pool; then add capacity; only then re-raise limits with measurement |
| Orphaned sidecars / port occupied | LOW | Ship `halo stack reset` that finds processes by recorded image path + creation time, terminates them, and clears stale runtime files; add job objects |
| Postgres major mismatch | HIGH | Do not start the app against the old dir; restore the prior binary to read/export; run `pg_upgrade` with matching extension DLLs in a separate maintenance flow |
| Bypass found after release | HIGH | Rotate any credentials the bypass could reach; enable backend receipts; audit decision logs for the bypass window; publish a security note if user data was affected |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---|---|---|
| P-01 Fork-and-cut-off debt | P1 Import & Provenance | `provenance-replay` reproduces each tree; a mock upstream fix is triaged in <30 min |
| P-02 MIT compliance | P1 (re-verified P8) | License hashes unchanged by rebrand; installer notice bundle mentions all four holders + transitive licenses |
| P-03 Identifier rebrand | P2 Rebrand & Migration | Inventory grep clean; four migration fixtures pass; `halo doctor` shows only HALO paths |
| P-04 Two-loop/transcript divergence | P4 (mirror rule owned by P3) | No `agent_start` in normal operation; mirrored-vs-sent hash match on a >1 MiB turn and a background-wake turn |
| P-05 Memory/prompt contention | P6 (transactionality in P5) | Low-profile soak: L0 p95 ≤ 2× baseline; no L0 block > 200 ms; partial-retain repair job drains |
| P-06 CPU TEI on Windows | P5 (spike as entry gate) | Clean-VM install works offline; profile flags applied; no orphan after quit; Postgres upgrade drill passes |
| P-07 Policy-gate bypass | P3 Unified Adapter | Entry-point matrix with side-effect assertions; `gate_bypass_attempt == 0`; red-team report |
| P-08 Windows traps | P7 (import fidelity in P1) | 300-char path test; lockfile byte-equality; zero surviving sidecars; non-ASCII round-trip |

**Research flags for phases:**
- **P1:** no deeper research needed; the ledger is engineering.
- **P2:** needs a full identifier inventory extracted from the four trees before planning (enumerate every env var, path, and id — the tables above are the starting set, not the complete set).
- **P3:** needs the actual Hermes hook and plugin loader source read end-to-end; the docs describe behavior, but the bypass inventory must be code-derived.
- **P4:** read `rpc-types.ts`, `rpc-frame.ts`, and `rpc-session-events.ts` at the import SHA; the docs are authoritative on semantics but the frame list is code.
- **P5:** **highest research need.** TEI-on-Windows feasibility spike (build + CPU throughput on the Low profile) before any planning commitment. Also verify embedded-Postgres first-boot behavior on the target workstation.
- **P6:** needs the Hindsight retrieval and consolidation code paths (semaphore scope, transaction boundaries, refresh write ordering) — the `.env` surface documents the knobs but not the write ordering.
- **P7:** packaging/updater behavior on Windows (code signing, installer, single instance) is not yet researched.
- **P8:** verification-only; no new research.

---

## Sources

Primary documentation and source read for this research (all fetched 2026-10-23):

- MIT license text — https://opensource.org/license/mit (HIGH)
- Apache License 2.0, §4 redistribution, §6 trademarks — https://www.apache.org/licenses/LICENSE-2.0 (HIGH)
- Machine-readable copyright file (DEP-5) — https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/ (HIGH; precedent for per-path license manifests)
- OMP RPC protocol reference — https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md (HIGH)
- OMP `.gitattributes` — https://github.com/can1357/oh-my-pi/blob/main/.gitattributes (HIGH)
- OMP development rules / worker re-entry history — https://github.com/can1357/oh-my-pi/blob/main/AGENTS.md (HIGH)
- Hermes environment variables — https://hermes-agent.nousresearch.com/docs/reference/environment-variables (HIGH)
- Hermes plugins (allow-list, `dispatch_tool`, `call_mcp`, loader categories) — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/plugins.md (HIGH)
- Hermes hooks (gateway hook trust model, `pre_tool_call` fail-closed) — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/hooks.md (HIGH)
- Hermes README (Windows install, Defender/`uv.exe` false positive) — https://github.com/NousResearch/hermes-agent#troubleshooting (HIGH)
- Hindsight README (platform support, `pg0`, operations) — https://github.com/vectorize-io/hindsight (HIGH)
- Hindsight `.env.example` (admission-control semantics, TEI defaults, DB pool settings, refresh timeout) — https://github.com/vectorize-io/hindsight/blob/main/.env.example (HIGH)
- Hindsight Windows smoke workflow (`pg0` first-boot budget, cp1252 crash, UTF-8 env) — https://github.com/vectorize-io/hindsight/blob/main/.github/workflows/windows-smoke.yml (HIGH)
- TEI README (local install paths, `--max-concurrent-requests`, `--max-batch-tokens`, `--max-client-batch-size`) — https://github.com/huggingface/text-embeddings-inference (HIGH)
- TEI v1.9.4 release (zero binary assets) — https://github.com/huggingface/text-embeddings-inference/releases/tag/v1.9.4 (HIGH)
- pgvector README (Windows build, upgrade via `ALTER EXTENSION vector UPDATE`, 17.3+ link fix) — https://github.com/pgvector/pgvector (HIGH)
- PostgreSQL `pg_upgrade` (extension shared objects must match the new server) — https://www.postgresql.org/docs/current/pgupgrade.html (HIGH)
- PostgreSQL connection settings (Windows has no Unix-domain socket by default) — https://www.postgresql.org/docs/current/runtime-config-connection.html (HIGH)
- Windows maximum path length — https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation (HIGH)
- `DeleteFileW` (open-handle semantics, `FILE_SHARE_DELETE`) — https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-deletefilew (HIGH)
- Windows Job Objects (`KILL_ON_JOB_CLOSE`, child inheritance) — https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects (HIGH)
- Defender exclusions (protection-gap framing, contextual exclusions) — https://learn.microsoft.com/en-us/defender-endpoint/microsoft-defender-antivirus-exclusions-overview (HIGH)
- Node `child_process` (Windows signal coercion, single-PID kill, `windowsHide`) — https://nodejs.org/api/child_process.html (HIGH)
- Bronson et al., *Metastable Failures in Distributed Systems*, HotOS '21 — https://sigops.org/s/conferences/hotos/2021/papers/hotos21-s11-bronson.pdf (HIGH; retries, LIFO, queue caps, characteristic metrics)
- OpenSearch breaking changes (legacy `opendistro` prefixes and compatibility flags removed at a major version) — https://docs.opensearch.org/latest/breaking-changes/ (HIGH; precedent for bounded legacy-name windows)
- HALO project brief — `.planning/PROJECT.md` (internal; authoritative for requirements and documented pathologies)

**Confidence notes:**
- HIGH: platform limits, license terms, protocol semantics, upstream defaults — all read from primary sources.
- MEDIUM: interaction claims (e.g. "a missed rename causes split-brain", "priority without reservation reintroduces the pathology"). These follow from the code and configs but were not reproduced in this program.
- MEDIUM: phase mapping. It is a recommendation; ROADMAP.md has not been written.
- The claim that TEI has **no** Windows binary is a verified negative for the current release: the release asset list is empty and the documented local-install paths exclude Windows. It is not a proof that no Windows build is possible from source — that is the P5 spike.

---

*Pitfalls research for: HALO — fused, rebranded, Windows-first agent product*
*Researched: 2026-10-23*
