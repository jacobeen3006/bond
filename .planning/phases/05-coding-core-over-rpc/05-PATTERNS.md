# Phase 5: Coding Core over RPC - Pattern Map

**Mapped:** 2026-10-25
**Files analyzed:** 17 file rows derived from `05-RESEARCH.md` §Recommended Project Structure (`:116-136`), §Validation Architecture / Wave 0 Gaps (`:371-413`), §Code Examples (`:244-312`), and the `contracts/rpc-wire.json` extension named in §Open Questions Q1 (`:337-340`). No `CONTEXT.md` exists for this phase.
**Analogs found:** 17 / 17 (3 exact same-file, 2 exact-planned convention, 4 role-match, 8 partial-planned; 0 with no analog — the three genuinely-new mechanisms are listed under "No Analog Found" with their substitute specs)

## Repo reality

**Mixed reality — read before trusting any citation.**

- **Executed (Phase 1 landed, on disk):** `vendor/oh-my-pi/` (the full vendored OMP tree, including the headless RPC mode `--mode rpc` / `runRpcMode`), `vendor/hermes-agent/`, `vendor/hindsight/`, `vendor/gsd-omp/`, `tools/provenance/`, `tests/provenance/`, `provenance/README.md`, `justfile`, root `package.json` (workspaces `apps/*`, `packages/*`). All core-side citations below are REAL source with line numbers.
- **Planned, NOT executed (Phases 2–4 authored but never run):** `packages/halo_agent/` (the whole Python package — `tools/backends/`, `adapter/`, `loop/`, `tests/`) and `contracts/` (`rpc-wire.json`, `tools/contract/gen.ts`, generated codecs) do NOT exist on disk (`git ls-files -- packages contracts` → 0 files). Every Python-side citation below is a `[PLANNED]` precedent from `03-07-PLAN.md`, `04-02-PLAN.md`, `04-PATTERNS.md`, or `02-02-PLAN.md` / `02-03-PLAN.md`.
- **Provenance state:** all four `vendor/*/provenance/patches/series` files contain only the header comment `# halo patch series — generated never; hand-maintained; every entry must apply cleanly in order` — no patch entries exist yet. Phase 5's `halo-tool-invoke.patch` is the first oh-my-pi entry.
- **Environment (from `05-RESEARCH.md:360-378`):** Bun 1.4.2 ✓, uv 0.12.17 ✓, Python 3.14.7 ✓, cargo/rustc ✗ (BLOCKING for native tool builds at execution time — not for planning; the stub core works around it).

## File Classification

| # | New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|-------------------|------|-----------|----------------|---------------|
| 1 | `packages/halo_agent/halo_agent/tools/backends/omp.py` (new) | service (supervised tool backend) | request-response + streaming (JSONL) + file I/O (recording) | planned `echo_test.py` (`04-02-PLAN.md:85`) + `03-07-PLAN.md:155` seam + `05-RESEARCH.md:272-312` sketches | role-match (planned) |
| 2 | `packages/halo_agent/tests/backends/test_omp.py` (new, shared fixture) | test fixture | request-response | `04-02-PLAN.md:111-112` conftest scaffolding + `03-01-PLAN.md:192` `run_child` | role-match (planned) |
| 3 | `packages/halo_agent/tests/backends/test_omp_handshake.py` (new, CORE-01) | test (integration) | request-response | `05-RESEARCH.md:386-395` requirement→test map + `04-PATTERNS.md:434` assertion discipline | partial (planned) |
| 4 | `packages/halo_agent/tests/backends/test_omp_tools.py` (new, CORE-02) | test (integration) | request-response | same as #3 | partial (planned) |
| 5 | `packages/halo_agent/tests/backends/test_omp_edit_stale.py` (new, CORE-03) | test (integration) | request-response | same as #3 + `mismatch.rs:74-144` + `edit/index.ts:567-569` (real) | partial (planned) |
| 6 | `packages/halo_agent/tests/backends/test_omp_cancel.py` (new, CORE-04) | test (integration) | request-response | same as #3 + `rpc-mode.ts:1956-1961` abort (real) | partial (planned) |
| 7 | `packages/halo_agent/tests/backends/test_omp_crash_restart.py` (new, CORE-05) | test (integration) | request-response + supervision | same as #3 + `05-RESEARCH.md:220-224` Pitfall 3 | partial (planned) |
| 8 | `packages/halo_agent/tests/backends/test_omp_replay.py` (new, CORE-06) | test (integration) | file I/O (record/replay) | same as #3 + `05-RESEARCH.md:347-350` normalization rules | partial (planned) |
| 9 | `packages/halo_agent/tests/backends/test_omp_chunk_parallel.py` (new, CORE-07) | test (integration) | streaming (chunked) | same as #3 + `rpc-frame.ts:153-249` (real) | partial (planned) |
| 10 | `packages/halo_agent/tests/backends/test_omp_overhead.py` (new, CORE-08) | test (benchmark) | request-response (timing) | `04-PATTERNS.md` `test_gate_budget.py` budget-test style (planned) | partial (planned) |
| 11 | Stub/fake core Bun script (new; path unnamed in RESEARCH — propose `packages/halo_agent/tests/backends/stub_core.ts`) | test fixture (fake core) | streaming (JSONL) | `rpc-mode.ts:1366-1374` ready frame + `:1895-1899` negotiate + `:2424-2427` bash (real) | role-match |
| 12 | `vendor/oh-my-pi/provenance/patches/halo-tool-invoke.patch` (new) | config (provenance patch) | batch (apply/replay) | `provenance/README.md:106-130` landing convention + `02-03-PLAN.md:161-168` `halo-rpc-handshake.patch` task (planned) | exact (planned convention) |
| 13 | `vendor/oh-my-pi/provenance/patches/series` (modify) | config (patch series index) | batch | current series file (header comment only) + `README.md:110-112` append rule | exact |
| 14 | `vendor/oh-my-pi/packages/coding-agent/src/modes/rpc/rpc-types.ts` (modify via patch) | model (wire types) | request-response | the file itself: `RpcCommand` union `:35-145`, `RpcReadyFrame` `:319-325`, `RpcChunkFrame` `:327-334` | exact (same file, additive) |
| 15 | `vendor/oh-my-pi/packages/coding-agent/src/modes/rpc/rpc-mode.ts` (modify via patch) | service (RPC command handler) | request-response + streaming | the file itself: ready frame `:1366-1374`, `success`/`error` `:1382-1395`, `handleCommand` `:1891-1899`, `bash` `:2424-2427` | exact (same file, additive) |
| 16 | `vendor/oh-my-pi/packages/coding-agent/test/rpc-tool-invoke.test.ts` (new) | test (core-side) | request-response | `test/rpc-frame.test.ts` (bun:test) + `test/rpc-wire/conformance.types.ts` | role-match |
| 17 | `contracts/rpc-wire.json` (modify — Phase 2 prerequisite) | config (wire contract) | batch (code generation) | `02-02-PLAN.md:129-133` schema + seed content + `CONTRACT_HASH` (planned) | exact (planned convention) |

Also touched by tooling (never hand-edited): `vendor/oh-my-pi/MANIFEST.vendored.tsv` + `vendor/oh-my-pi/provenance/UPSTREAM.json` — refreshed by `just provenance-manifest tree=oh-my-pi` after the patch lands (`provenance/README.md:132-154`).
## Pattern Assignments

### `packages/halo_agent/halo_agent/tools/backends/omp.py` (service, request-response + streaming + file I/O)

**Analog (planned):** `echo_test.py` backend shape (`04-02-PLAN.md:85`) + the Phase 3 dispatch seam (`03-07-PLAN.md:155`) + the RESEARCH spawn/handshake/invoke sketches (`05-RESEARCH.md:272-312`).

**Registration + import-time purity pattern** — `[PLANNED]` `04-02-PLAN.md:26` (must_haves) and `:85`:

```python
# nothing under tools/backends/ touches disk, spawns, or opens sockets at import
# time; each backend is registered via BatchDispatcher.register_backend(name, backend)
```

**Dispatch seam to implement against** — `[PLANNED]` `03-07-PLAN.md:155` (verbatim):

```python
# ToolRequest (frozen dataclass: tool_call_uid, tool_call_id, tool_name, args, backend)
# ToolResultEnvelope v1 (ok, text, content, artifacts, backend, invocation_id,
#   policy_decision_id, duration_ms, truncated, error_kind)
# PHASE3_BACKEND = "runtime"
# BatchDispatcher.register_backend(name, backend)
# BatchDispatcher.dispatch_batch(turn_id, requests, cancel) -> tuple[ToolResultEnvelope, ...]
#   returns exactly one envelope per request in the input order even when
#   backends complete out of order
```

The `omp` backend registers as `register_backend("omp", backend)` beside `echo_test`; `dispatch_batch`'s in-order guarantee is what CORE-07's "parallel results matched to call ids in order" rides on — the backend may complete RPC calls out of order internally, but must return envelopes in input order.

**Windows-first spawn pattern** — `AGENTS.md:15` (Windows-first, win32 x64 only tested) + `[PLANNED]` `03-01-PLAN.md:192` (`run_child(argv)` helper: "spawns with an argv list, no shell, no pipes") + `05-RESEARCH.md:226-230` (Pitfall 2):

```python
# argv array (never a string), creationflags=CREATE_NO_WINDOW,
# no shell=True, no detached — the core is a supervised child, not a daemon
```

**Handshake pattern (per-process, never per-call)** — `05-RESEARCH.md:232-236` (Pitfall 5) + `:272-297` sketch + `[PLANNED]` `02-03-PLAN.md:26-27` (handshake spec, verbatim):

```python
# the core's first stdout frame is halo.ready carrying protocolVersion,
# supportedProtocolVersions, contractHash, contractVersion, maxFrameBytes,
# maxReassembledFrameBytes; the adapter sends nothing until halo.ready validates,
# then sends halo.negotiate_protocol with its own contractHash before any command
# Hash mismatch — in either direction — and an ABSENT contractHash field both refuse:
# typed error contract_mismatch with fields expected, got, core_version,
# adapter_version, action: "rebuild or replace the coding core; do not mix HALO majors"
# written to stderr + the structured log, never mid-session on the frame stream;
# both sides exit and no command executes
```

**Invoke + id-matched pairing pattern** — `05-RESEARCH.md:300-312` sketch (read frames until `frame.get("id") == call_id`, routing other ids to waiters) + `docs/rpc.md:110-113` (real: "All commands accept optional `id?: string`. If provided, normal command responses echo the same `id`") + `docs/rpc.md:221-222` (real: "Ordering across concurrent commands is not guaranteed — clients MUST match responses on `id`, not on emission order").

**Frame reassembly pattern (CORE-07)** — reuse the core's own machinery, never re-roll it: `rpc-frame.ts:1-10` (real constants: `MAX_RPC_FRAME_BYTES = 1024 * 1024`, `MAX_RPC_REASSEMBLED_BYTES = 64 * 1024 * 1024`, `RPC_CHUNK_PAYLOAD_BYTES = 256 * 1024`), `RpcFrameDecoder.push` `:196-249` (real: strict chunk metadata validation, sequence must start at index 0, length checks, strict UTF-8 decode), `RpcFrameEncoder.encodeFrames` `:355-385` (real: chunks only when v2 and > 1 MiB). The Python client mirrors `RpcFrameDecoder`'s validation rules (see Shared Pattern P4).

**FrameRecorder pattern (CORE-06)** — new mechanism, no analog; substitute spec `05-RESEARCH.md:347-350` (Open Question 3): record every frame (inbound + outbound) with a monotonic sequence number; replay = feed recorded frames to the same client state machine; normalize `id`/timestamps/absolute-path prefixes before comparison.

**Crash/restart supervision pattern (CORE-05)** — new mechanism, no analog; substitute spec `05-RESEARCH.md:34` (responsibility map: supervision lives in the adapter, never the core) + `:220-224` (Pitfall 3: no replay of side-effecting in-flight call after crash — the in-flight call is reported as a failed envelope, the session is restarted, and the NEXT call proceeds).

---

### `packages/halo_agent/tests/backends/test_omp.py` (test fixture, request-response)

**Analog (planned):** `04-02-PLAN.md:111-112` conftest scaffolding + `03-01-PLAN.md:192` `run_child`.

**Fixture pattern** — `[PLANNED]` `04-02-PLAN.md:111-112`:

```python
# tests/conftest.py provides tmp_home, tmp_store (fresh temp home per test,
# never %LOCALAPPDATA%\HALO), an injectable clock, and a run_child(argv) helper
# that spawns with an argv list, no shell, no pipes
```

The shared fixture spawns the stub core (row 11) via `run_child`, performs the handshake, and yields a ready `HaloRpcClient` plus one completed invoke; per-requirement test files (rows 3–10) import it and never re-spawn.

**Assertion discipline** — `[PLANNED]` `04-PATTERNS.md:434`: assert literal tokens from the wire (e.g. the exact `contract_mismatch` field set, the exact `capability_disabled` error kind), never only a non-zero exit code.

---

### `packages/halo_agent/tests/backends/test_omp_{handshake,tools,edit_stale,cancel,crash_restart,replay,chunk_parallel,overhead}.py` (rows 3–10, tests)

**Analog (planned):** the requirement→test map is given verbatim in `05-RESEARCH.md:386-395`; assertion discipline from `04-PATTERNS.md:434`; Wave 0 gap list from `05-RESEARCH.md:402-413`.

**Requirement → test map (verbatim, `05-RESEARCH.md:386-395`):**

```
CORE-01  test_omp_handshake.py       — spawn, ready frame, negotiate, contractHash mismatch refusal
CORE-02  test_omp_tools.py           — read/write/edit/grep/glob/bash/lsp via halo.tool.invoke; capability_disabled refusal
CORE-03  test_omp_edit_stale.py      — stale hashline anchor → recoverable isError, not a throw
CORE-04  test_omp_cancel.py          — cancel propagates, bounded abort
CORE-05  test_omp_crash_restart.py   — crash detected, surfaced, restarted without losing session
CORE-06  test_omp_replay.py          — frame recorder + deterministic replay
CORE-07  test_omp_chunk_parallel.py  — oversized frame chunking/reassembly; parallel results matched to call ids in order
CORE-08  test_omp_overhead.py        — adapter overhead < 150 ms per round-trip
```

**Test commands (verbatim, `05-RESEARCH.md:380-395`):**

```
uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/backends/test_omp.py -x
uv run --project packages/halo_agent pytest -q packages/halo_agent/tests -x
```

**Per-row core-side anchors (real source the tests must exercise through the wire):**

- **CORE-03** (`test_omp_edit_stale.py`): the rejection is produced by Rust `pi-edit` — `mismatch.rs:142-144` (real):

```rust
/// Construct a match failure from mismatch details.
pub fn mismatch_error(details: &MismatchDetails) -> EditError {
	EditError::matched(format_mismatch_message(details))
}
```

`EditError::Match(String)` is the variant (`error.rs:27`, real; constructor `matched()` at `:64-66`). The model-facing diagnostic is `format_mismatch_message` (`mismatch.rs:74-122`, real) — the test asserts the literal token `Edit rejected` plus the `#<expected>` vs `#<actual>` hash pair, and that the envelope is a recoverable returned error, not a process crash. The TS side converts it at `edit/index.ts:567-569` (real):

```typescript
if (outcome.isError) {
	return { content: [{ type: "text", text: outcome.text }], isError: true };
}
```

- **CORE-04** (`test_omp_cancel.py`): the existing non-turn abort is `rpc-mode.ts:1956-1961` (real):

```typescript
case "abort": {
	goalController.stopForHostAbort();
	abortBuiltinCommands("RPC command aborted by host");
	await session.abort({ reason: USER_INTERRUPT_LABEL });
	return success(id, "abort");
}
```

`bash` is the only existing non-turn execution command (`rpc-types.ts:107-108`, real: `{ id?, type: "bash", command: string }` / `{ id?, type: "abort_bash" }`); `docs/rpc.md:217-222` (real) documents that `bash` is dispatched concurrently and `abort_bash` sent during a long `bash` is handled without waiting. Phase 5's `halo.tool.invoke` cancellation follows the same shape: a separate `abort`-style command keyed by `id` (RESEARCH Open Question 1), not a field on the invoke frame.

- **CORE-07** (`test_omp_chunk_parallel.py`): the chunk wire shape is `RpcChunkFrame` (`rpc-types.ts:327-334`, real: `chunkId, index, count, byteLength, data`) and the encoder is `encodeChunkedRpcFrames` (`rpc-frame.ts:153-177`, real: base64 subarray chunks, overflow frame when > reassembled cap). The test drives the stub core (row 11) to emit a > 1 MiB logical frame as `rpc_chunk` sequences and asserts the client reassembles it byte-identically; parallel invokes assert envelopes arrive in input order despite out-of-order completion.

- **CORE-08** (`test_omp_overhead.py`): first performance benchmark in the Python suite; substitute style `[PLANNED]` `04-PATTERNS.md` `test_gate_budget.py` (budget test: measure, assert against a fixed budget constant, no flaky wall-clock lower bounds). Budget: < 150 ms per round-trip (CORE-08), measured as wall time of one `halo.tool.invoke` of a no-op-capable tool (e.g. `read` of a small file) minus the stub's own processing, over a fixed sample count with a median, not a single shot.

**Wave 0 gaps to close first (`05-RESEARCH.md:402-413`):** the `tests/backends/` directory, the `test_omp.py` shared fixture, and the stub core do not exist yet — rows 2 and 11 are prerequisites for rows 3–10.

---

### Stub/fake core Bun script (row 11, test fixture; propose `packages/halo_agent/tests/backends/stub_core.ts`)

**Analog (real):** the core's own RPC mode — the stub speaks a strict subset of the real protocol so the Python tests exercise the same wire shapes.

**Ready frame to emit (real, `rpc-mode.ts:1366-1374`):**

```typescript
// { type: "ready", protocolVersion: 1, supportedProtocolVersions: [1, 2],
//   maxFrameBytes: MAX_RPC_FRAME_BYTES, maxReassembledFrameBytes: MAX_RPC_REASSEMBLED_BYTES }
```

**Negotiation to accept (real, `rpc-mode.ts:1895-1899`):** `case "negotiate_protocol"` — reject `protocolVersion !== 2`, otherwise flip the encoder to v2 (real, `rpc-mode.ts:1375-1379`: `frameEncoder.setProtocolVersion(2)` after a successful `negotiate_protocol` response).

**Non-turn command shape to mirror (real, `rpc-mode.ts:2424-2427`):**

```typescript
case "bash": {
	const result = await session.executeBash(command.command);
	return success(id, "bash", result);
}
```

The stub's `tool_invoke` handler echoes a scripted result keyed by `id` (no real tool execution), and can be told to (a) emit a > 1 MiB response as `rpc_chunk` frames (shape per `rpc-frame.ts:153-177`), (b) complete two parallel invokes out of order, (c) exit(1) on a sentinel command to simulate a crash, (d) hang on a sentinel to test bounded abort.

**Why a stub and not the real core:** cargo/rustc are absent on this workstation (`05-RESEARCH.md:360-378`), so the native tool builds (including `pi-edit`) cannot run; the stub works around that for the Python-side tests, while row 16 (`rpc-tool-invoke.test.ts`) covers the real core under `bun test`.

---

### `vendor/oh-my-pi/provenance/patches/halo-tool-invoke.patch` (config, batch)

**Analog (planned convention, fully specified):** `provenance/README.md:106-130` (real) + `02-03-PLAN.md:161-168` (planned `halo-rpc-handshake.patch` task).

**Patch file format (real, `provenance/README.md:115-126`):**

```
From: HALO <halo@localhost>
Subject: [PATCH 0001] <what the patch changes>

Upstream-Ref: <fixed-commit-sha>
Halo-Reason: <why HALO differs from upstream here>
Halo-Touches: <upstream path>
Halo-CVE: <advisory-id>

---
<unified diff>
```

`git apply` ignores the four headers, so the same file is both auditable and machine-applicable. `Upstream-Ref` is what makes a later audit or re-import answerable.

**Landing procedure (real, `provenance/README.md:106-154`):** apply the diff to a scratch tree, resolve against the vendored file (`git apply -3` gives conflict markers), regenerate the patch, append its filename to `vendor/oh-my-pi/provenance/patches/series` — after every earlier entry, never sorted. Then `just provenance-manifest tree=oh-my-pi` (the ONLY supported way to refresh `MANIFEST.vendored.tsv`; never hand-edit the TSV or `UPSTREAM.json`), then `just provenance-replay tree=oh-my-pi` to prove the tree is still reconstructible. Commit the patch file, `MANIFEST.vendored.tsv` and `UPSTREAM.json` together — "if replay fails, the patch is wrong — not the manifest."

**Patch verification pattern (planned, `02-03-PLAN.md:168`):** grep the patch body for brand/wire literals — every brand/wire token in added lines comes from generated-module imports; a `halo.` literal in the patch body is a failure.

**Patch content (from `05-RESEARCH.md:246-270` handler sketch):** keep the core patch surface minimal — one command (`halo.tool.invoke`) + the `contractHash`/`contractVersion` ready-frame fields (Pitfall 6). The handler: allowlist check (the seven CORE-02 capabilities; anything else → typed `capability_disabled` refusal, `05-RESEARCH.md:192`) → minimal `ToolSession` (`cwd`, `settings` via `Settings.init({ cwd, inMemory: true })` — `settings.ts:718`, real) → `createTools(session, [tool])` → `toolImpl.execute(id, args, signal)` → `success(id, "tool_invoke", { ok, text, isError })`.

---

### `vendor/oh-my-pi/provenance/patches/series` (config, batch)

**Analog (real):** the current series file — header comment only:

```
# halo patch series — generated never; hand-maintained; every entry must apply cleanly in order
```

**Append rule (real, `provenance/README.md:110-112`):** append the patch filename after every earlier entry, never sorted. `README.md:128-130` (real): "Keep the series ordered: a patch authored against post-previous content does not apply to the pristine tree, and replay names the failing index and path." Phase 5 appends exactly one line: `halo-tool-invoke.patch`.

---

### `vendor/oh-my-pi/packages/coding-agent/src/modes/rpc/rpc-types.ts` (model, request-response — modify via patch)

**Analog (exact, same file):** the file itself. Additive changes only: a new `RpcToolInvokeCommand` arm on the `RpcCommand` union, a `RpcToolInvokeResult` type, and `contractHash`/`contractVersion` fields on `RpcReadyFrame`.

**`RpcCommand` union to extend (real, `:35-47`):**

```typescript
export type RpcCommand =
	// Protocol
	| { id?: string; type: "negotiate_protocol"; protocolVersion: number }

	// Prompting
	| { id?: string; type: "prompt"; message: string; images?: ImageContent[]; streamingBehavior?: "steer" | "followUp" }
	| { id?: string; type: "steer"; message: string; images?: ImageContent[] }
	| { id?: string; type: "follow_up"; message: string; images?: ImageContent[] }
	| { id?: string; type: "remove_queued_message"; message: string; queue: "steering" | "followUp" }
	| { id?: string; type: "promote_queued_message"; message: string }
	| { id?: string; type: "abort" }
```

The new arm follows the `bash` shape (real, `:107-108`): `{ id?: string; type: "tool_invoke"; tool: string; args: Record<string, unknown> }` — `id` optional, echoed on the response (`docs/rpc.md:110-113`, real).

**`RpcReadyFrame` to extend (real, `:319-325`):**

```typescript
export interface RpcReadyFrame {
	type: "ready";
	protocolVersion: 1;
	supportedProtocolVersions: [1, 2];
	maxFrameBytes: number;
	maxReassembledFrameBytes: number;
}
```

Add `contractHash: string` and `contractVersion: string` (the Phase 2 handshake spec, `[PLANNED]` `02-03-PLAN.md:26`).

**`RpcChunkFrame` (real, `:327-334`) — unchanged, cited for CORE-07:**

```typescript
export interface RpcChunkFrame {
	type: "rpc_chunk";
	chunkId: string;
	index: number;
	count: number;
	byteLength: number;
	data: string;
}
```

---

### `vendor/oh-my-pi/packages/coding-agent/src/modes/rpc/rpc-mode.ts` (service, request-response + streaming — modify via patch)

**Analog (exact, same file):** the file itself. Additive changes only: the `contractHash`/`contractVersion` ready-frame fields and one `case "tool_invoke"` handler.

**Ready frame emission to extend (real, `:1366-1374`):**

```typescript
// { type: "ready", protocolVersion: 1, supportedProtocolVersions: [1, 2],
//   maxFrameBytes: MAX_RPC_FRAME_BYTES, maxReassembledFrameBytes: MAX_RPC_REASSEMBLED_BYTES }
```

**Response helpers to reuse (real, `:1382-1395`):**

```typescript
const success = <T extends RpcCommand["type"]>(
	id: string | undefined,
	command: T,
	data?: object | null,
): RpcResponse => {
	if (data === undefined) {
		return { id, type: "response", command, success: true } as RpcResponse;
	}
	return { id, type: "response", command, success: true, data } as RpcResponse;
};

const error = (id: string | undefined, command: string, message: string, code?: string): RpcResponse => {
	return { id, type: "response", command, success: false, error: message, ...(code ? { code } : {}) };
};
```

**Dispatch switch to extend (real, `:1891-1899`):** `handleCommand` with `case "negotiate_protocol"` (rejects `protocolVersion !== 2`). The new `case "tool_invoke"` goes in the same switch.

**Non-turn handler shape to mirror (real, `:2424-2427`):**

```typescript
case "bash": {
	const result = await session.executeBash(command.command);
	return success(id, "bash", result);
}
```

**`tool_invoke` handler sketch (from `05-RESEARCH.md:246-270`):**

```typescript
case "tool_invoke": {
	if (!TOOL_INVOKE_ALLOWLIST.has(command.tool)) {
		return error(id, "tool_invoke", "capability disabled", "capability_disabled");
	}
	const settings = await Settings.init({ cwd, inMemory: true });
	const toolSession: ToolSession = { cwd, settings, hasUI: false, getSessionFile: () => null };
	const [tool] = await createTools(toolSession, [command.tool]);
	const result = await tool.execute(id, command.args, signal);
	return success(id, "tool_invoke", { ok: !result.isError, text: /* text of result.content */, isError: result.isError });
}
```

**Supporting real source for the sketch:**

- `ToolSession` required fields (`tools/index.ts`, real): `cwd: string` (`:211`), `hasUI: boolean` (`:215`), `settings: Settings` (`:446`), `getSessionFile: () => string | null` (`:333`). Optional turn-bound fields that stay unset in the minimal session: `isDisposed` (`:223`), `sessionManager` (`:338`), `getActiveModel` (`:421`), `getPlanModeState` (`:448`), `enableLsp` (`:291`), `lspReadOnly` (`:293`).
- `BUILTIN_TOOLS` factory map (`tools/index.ts:558-589`, real) — the seven CORE-02 capabilities are all present: `read: s => new ReadTool(s)`, `bash: s => new BashTool(s)`, `edit: s => new EditTool(s)`, `glob: s => new GlobTool(s, { rootPathAlias: true })`, `grep: s => new GrepTool(s)`, `write: s => new WriteTool(s)`, `lsp: LspTool.createIf`.
- `createTools(session, toolNames?)` (`tools/index.ts:835-865`, real): async, resolves the builtin tool plan, per-tool `isAllowed` settings gates (`:746-796`), returns `Tool[]`.
- `AgentToolExecFn` (`packages/agent/src/types.ts:1100-1107`, real):

```typescript
export type AgentToolExecFn<TParameters extends TSchema = TSchema, TDetails = any, TTheme = unknown> = (
	this: AgentTool<TParameters, TDetails, TTheme>,
	toolCallId: string,
	params: Static<TParameters>,
	signal?: AbortSignal,
	onUpdate?: AgentToolUpdateCallback<TDetails, TParameters>,
	context?: AgentToolContext,
) => Promise<AgentToolResult<TDetails, TParameters>>;
```

**Concurrency note (real, `:423-428`):** `BACKGROUND_COMMANDS` is a `ReadonlySet` of command types dispatched in the background (`bash`, `predict_word`, `live_start`, `btw_cancel`) so the server keeps reading frames while one is settling. If `tool_invoke` must run concurrently (CORE-07 parallel results), the patch adds `"tool_invoke"` to this set — otherwise invokes serialize and the parallel test cannot interleave.

---

### `vendor/oh-my-pi/packages/coding-agent/test/rpc-tool-invoke.test.ts` (test, request-response)

**Analog (role-match, same directory, same runner):** `test/rpc-frame.test.ts` (bun:test) + `test/rpc-wire/conformance.types.ts`.

**Test style to copy (real, `rpc-frame.test.ts:1-10`):**

```typescript
import { describe, expect, it } from "bun:test";
import {
	encodeRpcFrame,
	MAX_RPC_FRAME_BYTES,
	MAX_RPC_REASSEMBLED_BYTES,
	RpcFrameDecoder,
	RpcFrameEncoder,
} from "../src/modes/rpc/rpc-frame";

function decode(frame: string): Record<string, unknown> {
	return JSON.parse(frame) as Record<string, unknown>;
}
```

The new test imports from `../src/modes/rpc/rpc-types` (and `rpc-mode` where the handler is reachable) and uses `describe`/`it`/`expect` from `bun:test`. Test command (verbatim, `05-RESEARCH.md:380-395`): `bun test packages/coding-agent/test/rpc-tool-invoke.test.ts`; full suite: `bun test packages/coding-agent/test/rpc-*.test.ts`.

**Cases (per `05-RESEARCH.md:246-270` A1/A2 mitigation — per-handler test, not just the wire):** (1) `tool_invoke` of `read` on a temp file returns `ok: true` with the file text; (2) `tool_invoke` of a non-allowlisted tool name returns `success: false` with `code: "capability_disabled"`; (3) `tool_invoke` of `edit` with a stale hashline anchor returns `ok: false` / `isError: true` with the `Edit rejected` diagnostic (the recoverable-error path, `edit/index.ts:567-569`, real); (4) the ready frame carries `contractHash`/`contractVersion`.

**Conformance docstring pattern (real, `rpc-wire/conformance.types.ts:1-15`):** type-only conformance between generated wire types and the server's own types, checked by `bun check`; a failure names the definition and the drifted keys. If the Phase 2 wire contract (row 17) lands first, the new `tool_invoke` arm gets a conformance entry there too.

---

### `contracts/rpc-wire.json` (config, batch — modify; Phase 2 prerequisite)

**Analog (planned convention, fully specified):** `02-02-PLAN.md:129-133` (schema + seed content + `gen.ts`) + `:32` (`CONTRACT_HASH`).

**Schema shape (planned, `02-02-PLAN.md:129`):** draft 2020-12, `required` at root covering `schema` (`halo/rpc-wire/v1`), `protocolOwner`, `contractVersion` (`2.0.0`), `contractHash` (pattern `^[0-9a-f]{64}$`), `aliasExpiresMinor`, `alias_window_anchor`, `commands`, `frames`, `event_filter_vocab`, `transport` (with `maxFrameBytes`, `maxReassembledFrameBytes` — upstream v2 limits 1048576 / 67108864 per `docs/rpc.md`), `provenance_notes`; `minItems: 1` on `commands`/`frames`; entry `required` of `upstream` + `name` (+ `backend_mode` in {`retained`, `disabled`} for commands, `direction` in {`outbound`, `inbound`} for frames).

**`CONTRACT_HASH` convention (planned, `02-02-PLAN.md:32`):** "`CONTRACT_HASH = sha256` of the contract's canonical sorted-key fixed-separator UTF-8 bytes (covering the document minus its own `contractHash` field) is embedded identically in the TS, Rust, and Python generated modules, the alias artifact, and the adapter — three languages hash identical bytes." Canonical form (planned, `:38`): "sorted object keys, `\":\"`/`\",\"` separators, UTF-8 bytes, no Unicode normalization, no locale separators."

**Phase 5 modification (RESEARCH Open Question 1, `:337-340`):** add the `halo.tool.invoke` command entry (`upstream: "tool_invoke"`, `name: "halo.tool.invoke"`, `backend_mode: retained`) and the `contractHash`/`contractVersion` ready-frame fields to the `frames` list; re-run `bun run tools/contract/gen.ts` so every generated artifact carries the new `CONTRACT_HASH`. The `abort` for an in-flight invoke is a separate command keyed by `id` (matching the `abort_bash` pattern, `rpc-types.ts:108`, real) — not a field on the invoke entry.

## Shared Patterns

### P1 — Windows-first child spawn
**Source:** `AGENTS.md:15` (real) + `[PLANNED]` `03-01-PLAN.md:192` (`run_child`) + `05-RESEARCH.md:226-230` (Pitfall 2)
**Apply to:** `omp.py` (CoreSupervisor), `test_omp.py` fixture, stub core spawn

```python
# argv array (never a string); creationflags=CREATE_NO_WINDOW;
# no shell=True; no detached — supervised child, not a daemon
```

### P2 — Per-process handshake, never per-call
**Source:** `05-RESEARCH.md:232-236` (Pitfall 5) + `[PLANNED]` `02-03-PLAN.md:26-27`
**Apply to:** `omp.py` (HaloRpcClient), `test_omp_handshake.py`

```python
# one handshake per spawned core process: read halo.ready, validate
# contractHash (absent IS a mismatch), send halo.negotiate_protocol,
# then commands. Never re-handshake per invoke.
# contract_mismatch typed error: expected, got, core_version,
# adapter_version, action — stderr + structured log, both sides exit
```

### P3 — id-matched, order-independent pairing
**Source:** `docs/rpc.md:110-113` + `:221-222` (real) + `05-RESEARCH.md:143-146`
**Apply to:** `omp.py` (HaloRpcClient invoke loop), `test_omp_chunk_parallel.py`

```python
# read frames until frame.get("id") == call_id; route other ids to
# their waiters. NEVER match on emission order — "Ordering across
# concurrent commands is not guaranteed — clients MUST match responses
# on id, not on emission order."
```

### P4 — Reuse the core's frame machinery; never re-roll it
**Source:** `rpc-frame.ts:1-10`, `:153-249`, `:355-385` (real)
**Apply to:** `omp.py` (chunk reassembly), stub core (chunk emission)

```typescript
// MAX_RPC_FRAME_BYTES = 1024 * 1024 (physical, incl. newline)
// MAX_RPC_REASSEMBLED_BYTES = 64 * 1024 * 1024 (logical, v2)
// RPC_CHUNK_PAYLOAD_BYTES = 256 * 1024 (chunk payload)
// RpcFrameDecoder.push: validate chunkId/index/count/byteLength,
// sequence must start at index 0, no interleaved sequences,
// receivedBytes must equal declared byteLength, strict UTF-8 decode
```

### P5 — Provenance patch discipline
**Source:** `provenance/README.md:106-154` (real) + `[PLANNED]` `02-03-PLAN.md:161-168`
**Apply to:** `halo-tool-invoke.patch`, `series`, manifest refresh

```
# four headers (From/Subject/Upstream-Ref/Halo-Reason/Halo-Touches/Halo-CVE)
# + --- + unified diff; git apply ignores the headers
# append to series after every earlier entry, never sorted
# just provenance-manifest tree=oh-my-pi (never hand-edit TSV/UPSTREAM.json)
# just provenance-replay tree=oh-my-pi — if replay fails, the patch is wrong
# grep the patch body for brand/wire literals — a halo. literal is a failure
```

### P6 — capability_disabled refusal (core-side allowlist)
**Source:** `05-RESEARCH.md:192` + `rpc-mode.ts:1393-1395` (real `error` helper)
**Apply to:** `rpc-mode.ts` `tool_invoke` handler, `test_omp_tools.py`

```typescript
// only the seven CORE-02 capabilities (read, write, edit, grep, glob,
// bash, lsp) are reachable via halo.tool.invoke; any other tool name
// is refused with a typed capability_disabled error — never a generic
// failure, never a turn-driven fallback
```

### P7 — Recoverable isError, never a throw
**Source:** `edit/index.ts:567-569` + `mismatch.rs:142-144` (real)
**Apply to:** `rpc-mode.ts` `tool_invoke` handler, `test_omp_edit_stale.py`

```typescript
// a stale hashline anchor is a returned error, not a process crash:
// if (outcome.isError) return { content: [{ type: "text", text: outcome.text }], isError: true };
// the envelope carries ok: false / isError: true with the "Edit rejected"
// diagnostic; the session stays alive for the next call
```

### P8 — No replay of side-effecting in-flight calls after crash
**Source:** `05-RESEARCH.md:220-224` (Pitfall 3) + `:34` (responsibility map)
**Apply to:** `omp.py` (CoreSupervisor), `test_omp_crash_restart.py`

```python
# on crash: the in-flight call is reported as a failed envelope (never
# re-sent to the restarted core — a bash or edit may have half-run);
# the session is restarted; the NEXT call proceeds. Supervision lives
# in the adapter, never the core.
```

### P9 — Literal-token assertion discipline
**Source:** `[PLANNED]` `04-PATTERNS.md:434`
**Apply to:** all `test_omp_*.py` files

```python
# assert literal tokens from the wire (exact contract_mismatch field set,
# exact capability_disabled error kind, exact "Edit rejected" prefix),
# never only a non-zero exit code
```

### P10 — Import-time purity for backends
**Source:** `[PLANNED]` `04-02-PLAN.md:26` (must_haves)
**Apply to:** `omp.py`

```python
# nothing under tools/backends/ touches disk, spawns, or opens sockets
# at import time; the core is spawned on first dispatch, not on import
```

## No Analog Found

Genuinely-new mechanisms with no existing analog (planner should use the substitute specs above, not an analog):

| File / Mechanism | Role | Data Flow | Reason + Substitute Spec |
|------------------|------|-----------|--------------------------|
| `FrameRecorder` + deterministic replay (in `omp.py`, CORE-06) | service | file I/O (record/replay) | No recorder exists in the core or the planned Python side. Substitute: `05-RESEARCH.md:347-350` (record every frame with a monotonic sequence; replay = feed recorded frames to the same client state machine; normalize `id`/timestamps/absolute-path prefixes before comparison) + `docs/rpc.md:81-99` (the 15 outbound + 4 inbound frame categories to record) |
| Crash/restart supervision (in `omp.py`, CORE-05) | service | supervision | No supervisor exists anywhere. Substitute: `05-RESEARCH.md:34` (supervision lives in the adapter, never the core) + `:220-224` (Pitfall 3: no replay of side-effecting in-flight call) |
| CORE-08 overhead benchmark (`test_omp_overhead.py`) | test (benchmark) | timing | First performance benchmark in the Python suite. Substitute: `[PLANNED]` `04-PATTERNS.md` `test_gate_budget.py` budget-test style (measure over a fixed sample, assert a median against a fixed budget constant of 150 ms, no flaky single-shot wall-clock) |

## Metadata

**Analog search scope:** `vendor/oh-my-pi/packages/coding-agent/src/modes/rpc/` (all 14 modules + `wire/`), `vendor/oh-my-pi/packages/coding-agent/src/tools/index.ts`, `vendor/oh-my-pi/packages/coding-agent/src/edit/index.ts`, `vendor/oh-my-pi/packages/coding-agent/src/config/settings.ts`, `vendor/oh-my-pi/packages/agent/src/types.ts`, `vendor/oh-my-pi/crates/pi-edit/src/` (`error.rs`, `modes/hashline/mismatch.rs`), `vendor/oh-my-pi/packages/coding-agent/test/` (`rpc-frame.test.ts`, `rpc-wire/conformance.types.ts`, ~30 `rpc-*.test.ts`), `vendor/oh-my-pi/docs/rpc.md`, `provenance/README.md`, `vendor/oh-my-pi/provenance/patches/series`, `.planning/phases/02-rebrand-wire-contract-migration/02-02-PLAN.md` + `02-03-PLAN.md`, `.planning/phases/03-unified-loop-session-authority/03-01-PLAN.md` + `03-07-PLAN.md`, `.planning/phases/04-tool-registry-policy-gate/04-01-PLAN.md` + `04-02-PLAN.md` + `04-PATTERNS.md`, `AGENTS.md`.

**Files scanned:** ~45 (17 target rows + ~28 analog/precedent sources)

**Tracked-source gate:** every cited analog path verified git-tracked via `git ls-files` (all non-empty). `packages/` and `contracts/` are NOT on disk (`git ls-files -- packages contracts` → 0 files) — all Python-side citations are `[PLANNED]` precedents from the Phase 2–4 plan documents, never from source. No gitignored mirror paths emitted.

**Pattern extraction date:** 2026-10-25
