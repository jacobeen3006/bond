# Phase 8: Memory Runtime & Bundling — Pattern Map

**Mapped:** 2026-10-25
**Files analyzed:** 18 explicit (8 structure + 5 tests + 5 implied/modified)
**Analogs found:** 11 / 18 (7 greenfield — no long-lived process supervision exists in the repo yet)

> Codebase state: Phase 1 (import/provenance tooling) is the only completed phase. `packages/` and `apps/` do not exist yet; `packages/sidecars/` is greenfield. The only tracked first-party code is `tools/provenance/`, `tests/provenance/`, `provenance/`, `.github/workflows/provenance.yml`, `justfile`, `package.json`. All analog paths below are git-tracked (verified via `git ls-files`).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/sidecars/src/supervisor/postgres.ts` | service (process supervision) | process supervision + request-response (health) | `tools/provenance/fetch.ts` (one-shot exec convention only) | none (greenfield) |
| `packages/sidecars/src/supervisor/llama.ts` | service (process supervision) | process supervision + request-response (health poll) | `tools/provenance/fetch.ts` (one-shot exec convention only) | none (greenfield) |
| `packages/sidecars/src/supervisor/hindsight.ts` | service (process supervision) | process supervision + env-var wiring | `tools/provenance/fetch.ts` (one-shot exec convention only) | none (greenfield) |
| `packages/sidecars/src/supervisor/ports.ts` | utility | port allocation + file I/O (runtime config) | — | none (greenfield) |
| `packages/sidecars/src/supervisor/state.ts` | state machine | event-driven | — | none (greenfield) |
| `packages/sidecars/src/pgvector/version-check.ts` | utility (validation) | file I/O + validation | `tools/provenance/verify.ts` | role-match |
| `packages/sidecars/tools/build-pgvector.ps1` | CI script (PowerShell) | build + gate | `justfile` + `.github/workflows/provenance.yml` | role-match |
| `packages/sidecars/tools/models/manifest.json` | config (digest pins) | static data | `tools/provenance/manifest.ts` + `provenance/schema/upstream.schema.json` | exact |
| `packages/sidecars/tests/pg-boot.test.ts` | test (integration) | process supervision + DB | `tests/provenance/verify-drift.test.ts` + `tests/provenance/fixtures/scratch.ts` | exact |
| `packages/sidecars/tests/pgvector-version.test.ts` | test (integration) | file I/O + validation | `tools/provenance/test/manifest.test.ts` | exact |
| `packages/sidecars/tests/llama-sidecar.test.ts` | test (integration) | process supervision + HTTP | `tests/provenance/verify-drift.test.ts` | exact |
| `packages/sidecars/tests/hindsight-embed.test.ts` | test (integration) | process supervision + env | `tests/provenance/verify-drift.test.ts` | exact |
| `packages/sidecars/tests/retain-idempotency.test.ts` | test (integration) | HTTP + DB | `tests/provenance/verify-drift.test.ts` | exact |
| `.github/workflows/build-pgvector.yml` (implied — Wave 0 gap names the CI job, not the file) | CI workflow | build + gate | `.github/workflows/provenance.yml` | exact |
| `packages/sidecars/package.json` (implied — bun workspace member) | config | — | `package.json` (root) | exact |
| `package.json` (root, modified) | config | — | itself — add `packages/sidecars` to the `test` script | exact |
| `justfile` (modified, implied) | build orchestration | — | itself — add a `sidecars-tests` recipe mirroring `provenance-tests` | exact |
| HALO retain shim (2s coalescing, implied by RESEARCH.md Pattern 4 / Q1) | service | event-driven debounce | — | none (greenfield; the HALO app does not exist yet — likely a later phase) |

## Pattern Assignments

### `packages/sidecars/src/supervisor/postgres.ts` (service, process supervision)

**Analog:** none for long-lived supervision — greenfield. Reuse the one-shot process-execution convention and the error-class shape below.

**Process-execution convention** — `tools/provenance/fetch.ts` lines 60-68 (argv array, no shell, `cwd`, `maxBuffer`, stdio discipline):
```typescript
export function git(args: string[], cwd: string, stdin?: string): string {
  return execFileSync('git', [...NEUTRAL_CONFIG, ...args], {
    cwd,
    encoding: 'utf8',
    input: stdin,
    maxBuffer: MAX_BUFFER,
    stdio: stdin === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
  });
}
```
Phase 8's long-lived children use `child_process.spawn` (not `execFileSync`) with the same discipline: argv array (never `shell: true`), `-D` as a separate argument (paths contain spaces + non-ASCII — RESEARCH.md Pattern 6), `windowsHide: true`, `detached: false`, `stdio: ['ignore','pipe','pipe']` (AGENTS.md §4, quoted in RESEARCH.md Pitfall 6).

**Version-probe pattern** — `tools/provenance/stage.ts` lines 606-610 (probe a binary's `--version`, fall back on failure):
```typescript
    const output = execFileSync(command, ['--version'], { encoding: 'utf8' });
    return output.match(pattern)?.[1] ?? fallback;
  } catch {
    return fallback;
```

**Error class** — copy the `ProvenanceError` shape (see Shared Patterns) as a `SidecarError` (or reuse a shared error module) with a numeric `code`.

**Health check (the recorded deviation):** no `pg_isready.exe` in the zonky bundle — health = TCP connect + a real authenticated (scram-sha-256) client connection (RESEARCH.md Pattern 6 / Pitfall 1). No existing code in the repo does a DB client connection; this is new.

---

### `packages/sidecars/src/supervisor/llama.ts` (service, process supervision)

**Analog:** none for long-lived supervision — greenfield. Same spawn convention as `postgres.ts` (argv array, `windowsHide: true`, `detached: false`, `shell: false`, `stdio: ['ignore','pipe','pipe']`).

**Health poll:** `GET /health` (503 while loading, 200 ready, public/no key — RESEARCH.md Pattern 3). No existing HTTP-polling code in the repo; greenfield. The per-sidecar argv (embedder `--embedding --pooling mean --embd-normalize 2 --no-ui --warmup -t/-tb/-c/-b/-ub <profile>`; reranker `--reranking --no-ui --warmup …`) comes verbatim from RESEARCH.md Pattern 3.

**Restart-per-hardware-profile:** the profile flag values come from the locked decision (AGENTS.md §3, quoted in RESEARCH.md); the restart loop itself is greenfield (see `state.ts`).

---

### `packages/sidecars/src/supervisor/hindsight.ts` (service, process supervision)

**Analog:** none for long-lived supervision — greenfield. Same spawn convention.

**Env wiring (the load-bearing part):** spawn **one** `hindsight-api` process (in-process `WorkerPoller` is the default — RESEARCH.md Pattern 1; do NOT spawn a separate `hindsight-worker`, do NOT use the `hindsight-embed` daemon client). The exact env set is in RESEARCH.md Pattern 3 + Code Examples: `HINDSIGHT_API_DATABASE_URL=postgresql://halo:<pw>@127.0.0.1:55432/hindsight` (plain `postgresql://`, **not** `pg0://` — Pitfall 3), `HINDSIGHT_API_LLM_MAX_CONCURRENT=4`, `HINDSIGHT_API_LLM_PROVIDER=none` (degraded default), the `litellm` embedder/reranker block (NOT `tei` — Pitfall 4), `HINDSIGHT_API_EMBEDDINGS_LITELLM_DIMENSIONS=384` (skips the startup probe), `HINDSIGHT_API_RERANKER_LITELLM_TIMEOUT=45`.

**Secret store:** the PG password is generated at first launch and stored in the Hermes secret store (`auth.json` under `HERMES_HOME` — RESEARCH.md Pattern 6 / Assumption A4). No existing code in the repo reads/writes that store; greenfield.

---

### `packages/sidecars/src/supervisor/ports.ts` (utility, port allocation)

**Analog:** none — greenfield. No port-allocation code exists in the repo.

**Contract (RESEARCH.md architecture diagram):** preferred ports 55432 / 58080 / 58081; on `EADDRINUSE` fall back to an ephemeral port; the resolved port is written to a runtime config file that all children read. The data-dir naming rule (`pgdata-18`, named with the major) is RESEARCH.md Pattern 6.

---

### `packages/sidecars/src/supervisor/state.ts` (state machine, event-driven)

**Analog:** none — greenfield. No state machine exists in the repo.

**States (locked, AGENTS.md §4 via RESEARCH.md):** `stopped → starting → ready → degraded → restarting → failed`. The four-lane controller reads `ready`/`degraded` (RESEARCH.md Pattern 5: the UI surfaces a degraded badge, auto-recall must not block the first turn).

---

### `packages/sidecars/src/pgvector/version-check.ts` (utility, validation)

**Analog:** `tools/provenance/verify.ts` (validation → findings + exit code + actionable messages)

**Result shape** — `tools/provenance/verify.ts` lines 81-85 (the findings/exitCode contract to copy):
```typescript
  /** 0 clean, 1 findings, 2 malformed ledger. */
  exitCode: 0 | 1 | 2;
  /** Every finding line, uncapped, in a deterministic order. */
  findings: string[];
```

**Actionable-failure message style** — `tools/provenance/verify.ts` lines 304-311 (name the bad value and the fix, don't just fail):
```typescript
  if (typeof repo !== 'string' || !/^https:\/\//.test(repo)) {
    return malformedResult(tree, new ProvenanceError(`upstream repo is not https: ${String(repo)}`, 2));
  }
```
For MEM-02 the message must be the RESEARCH.md Pitfall 2 text: `"pgvector version mismatch: expected 0.8.7, found <x>. Re-run the pgvector build against this PostgreSQL 18.6 runtime (see tools/build-pgvector.ps1)."` — check `vector.control` `default_version = '0.8.7'` + `module_pathname = '$libdir/vector'` + `vector.dll` presence before first start.

**Version-probe pattern** — `tools/provenance/stage.ts` lines 606-610 (see `postgres.ts` above).

---

### `packages/sidecars/tools/build-pgvector.ps1` (CI script, build + gate)

**Analog:** `justfile` (PowerShell shell convention) + `.github/workflows/provenance.yml` (CI job shape)

**PowerShell shell convention** — `justfile` lines 14-15 (the repo's one PowerShell invocation style):
```
[windows]
set shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]
```
Also note the justfile's `bun.exe`-not-`bun` rationale (line 11-12): this workstation's PATH holds an extensionless `bun` that PowerShell resolves but does not execute — name the file explicitly in any PowerShell script.

**Build sequence (RESEARCH.md Code Examples, verbatim):** `set PGROOT=<the exact bundled zonky PG root>` → `nmake /F Makefile.win` → `nmake /F Makefile.win install` → `nmake /F Makefile.win installcheck` (pg_regress gate, must pass) → publish SHA-256 of `{vector.dll, vector.control, vector--0.8.7.sql}`.

**CI job shape** — `.github/workflows/provenance.yml` lines 15-27 (windows-latest + setup-bun + pwsh shell; the new `build-pgvector` job copies this header and adds the MSVC steps):
```yaml
jobs:
  provenance-replay:
    name: provenance-replay
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.2
```
The workflow's comment discipline (every step explains why it exists, lines 22-24, 39-40, 47-50) is the house style to copy.

---

### `packages/sidecars/tools/models/manifest.json` (config, digest pins)

**Analog:** `tools/provenance/manifest.ts` (SHA-256 hashing) + `provenance/schema/upstream.schema.json` (JSON data-file + schema shape)

**SHA-256 hashing** — `tools/provenance/manifest.ts` lines 40-47 (the repo's one hashing implementation — reuse, don't re-roll):
```typescript
/** SHA-256 of raw file bytes. Never routed through a git filter. */
export function hashFile(filePath: string): string {
  return hashBytes(readFileSync(filePath));
}

export function hashBytes(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
```

**JSON data-file shape** — `provenance/schema/upstream.schema.json` lines 1-27 (versioned `const` schema tag, `additionalProperties: false`, explicit `required`, digest fields as top-level properties):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://halo.local/provenance/upstream.schema.json",
  "title": "HALO upstream provenance ledger",
  "type": "object",
  "additionalProperties": false,
  "required": [ "schema", "subtree", "local_root", "repo", "commit", … ],
  "properties": {
    "schema": { "const": "halo/upstream/v1" },
    "commit": { "type": "string", "pattern": "^[0-9a-f]{40}$" },
```
The model manifest should follow the same discipline: a `const` schema tag (e.g. `halo/models/v1`), `additionalProperties: false`, one entry per GGUF (`bge-small-en-v1.5` → `ggml-org/bge-small-en-v1.5-Q8_0-GGUF`, 384-d; `ms-marco-MiniLM-L-6-v2` → `cstr/ms-marco-MiniLM-L-6-v2-GGUF`) with its SHA-256 pin (RESEARCH.md Standard Stack / Package Legitimacy Audit). A companion `provenance/schema/models.schema.json` in the same style is the natural fit.

---

### `packages/sidecars/tests/pg-boot.test.ts` (test, integration — MEM-01)

**Analog:** `tests/provenance/verify-drift.test.ts` (integration test structure) + `tests/provenance/fixtures/scratch.ts` (scratch harness)

**Test structure** — `tests/provenance/verify-drift.test.ts` lines 23-33 (assert the literal finding token, never merely a non-zero exit — the house test rule):
```typescript
/** Assert the finding through both the module return and the CLI entry. */
function expectFinding(base: string, finding: string): string {
  const result = verifyTree(base, TREE);
  expect(result.exitCode).toBe(1);
  expect(result.findings).toContain(finding);

  const cli = captureStdout(() => verifyMain(['--tree', TREE], base));
  expect(cli.result).toBe(1);
  expect(cli.output).toContain(finding);
  return cli.output;
}
```

**Scratch harness** — `tests/provenance/fixtures/scratch.ts` lines 75-90 (one fresh fixture in its own temp dir, `dispose()` in `finally`):
```typescript
export type Scratch = { … };

/** One fresh fixture + cache + import, isolated in its own temp directory. */
export function scratchImport(prefix: string): Scratch { … }
```
The pg-boot test needs a `scratchPg(prefix)` equivalent: `mkdtempSync(join(tmpdir(), 'halo-pg-boot-'))`, initdb into it, dispose in `finally` — same shape.

**Header comment style** — every test file opens with a doc block naming the requirement ID and what is asserted (e.g. `verify-drift.test.ts` lines 1-10: "IMPT-03 / T-1-03 — the four worktree/index drift classes…"). The five new tests should open with `MEM-01` … `MEM-06` the same way.

---

### `packages/sidecars/tests/pgvector-version.test.ts` (test, integration — MEM-02)

**Analog:** `tools/provenance/test/manifest.test.ts` (beforeAll/afterAll scratch + error-condition helper)

**Scratch lifecycle** — `tools/provenance/test/manifest.test.ts` lines 44-58:
```typescript
  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'halo-manifest-test-'));
    execFileSync('git', ['init', '-q', '.'], { cwd: scratch });
    linkOid = execFileSync('git', ['hash-object', '-w', '--stdin'], { … });
  });

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });
```

**Error-condition helper** — `tools/provenance/test/manifest.test.ts` lines 29-37 (capture the thrown error's message instead of a bare `toThrow`):
```typescript
function conditionOf(run: () => unknown): string {
  try {
    run();
  } catch (error) { … }
  throw new Error('expected a ManifestError');
}
```
For MEM-02: assert the literal actionable message (`pgvector version mismatch: expected 0.8.7, found <x>…`), not just that startup failed.

---

### `packages/sidecars/tests/llama-sidecar.test.ts` (test, integration — MEM-03)

**Analog:** `tests/provenance/verify-drift.test.ts` (structure + literal assertions) + `tests/provenance/fixtures/scratch.ts` (scratch harness).

**Windows-specific case style** — `tools/provenance/test/win-paths.test.ts` lines 1-9 (the house style for Windows-behavior tests: assert the finding `kind` AND that the reported path is the exact input):
```typescript
/**
 * IMPT-06 / T-1-07 — the Windows-representability gate.
 *
 * Every case asserts the finding `kind` AND that `finding.path` is the input
 * string, so a refactor cannot start reporting a different path than the one
 * that was refused.
 */
```
Covers: start, `/health` poll (503→200), restart per hardware profile, `--no-ui`/`--warmup` argv, `--api-key` presence.

---

### `packages/sidecars/tests/hindsight-embed.test.ts` (test, integration — MEM-04)

**Analog:** `tests/provenance/verify-drift.test.ts` (structure) + `tests/provenance/fixtures/scratch.ts` (scratch harness).

Covers: one `hindsight-api` process (in-process `WorkerPoller` — assert no separate worker is spawned), the per-op env set from RESEARCH.md Pattern 3, the degraded default (`HINDSIGHT_API_LLM_PROVIDER=none` + rrf failover). Assert the literal env values (the `HINDSIGHT_API_*` names) the way `verify-drift.test.ts` asserts literal finding tokens.

---

### `packages/sidecars/tests/retain-idempotency.test.ts` (test, integration — MEM-06)

**Analog:** `tests/provenance/verify-drift.test.ts` (structure) + `tests/provenance/fixtures/scratch.ts` (scratch harness).

Covers: `operation_id` parent-PK replay (same payload → dedup; conflicting payload → HTTP 409), `WorkerPoller.recover_own_tasks` on poller start (a cancelled retain is re-claimed, not lost), `async_operations` claimed with `FOR UPDATE SKIP LOCKED`.

---

### `.github/workflows/build-pgvector.yml` (CI workflow, implied)

**Analog:** `.github/workflows/provenance.yml` (exact — the only tracked workflow)

Copy the whole file's shape: `name`, `on: push/pull_request`, `permissions: contents: read`, `runs-on: windows-latest`, `actions/checkout@v4`, `oven-sh/setup-bun@v2` (bun 1.4.2), `shell: pwsh` steps with the house comment discipline (every step explains why). Add: MSVC environment (the windows-latest image ships it), `set PGROOT=<bundled zonky PG root>`, `nmake /F Makefile.win` / `install` / `installcheck`, and the SHA-256 manifest publication of `{vector.dll, vector.control, vector--0.8.7.sql}` (RESEARCH.md Wave 0 Gaps).

---

### `packages/sidecars/package.json` (config, implied)

**Analog:** `package.json` (root) — the root already declares the workspace slot:
```json
{
  "name": "halo",
  "version": "0.0.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "test": "bun test tools/provenance tests/provenance"
  }
}
```
The new package is a `bun` workspace member (no build step needed for `bun test` discovery of `*.test.ts` — RESEARCH.md Validation Architecture: "Config file: none (bun test discovers `*.test.ts`)").

---

### `package.json` (root, modified)

**Change:** add `packages/sidecars` to the `test` script so the phase gate (`bun test tools/provenance tests/provenance packages/sidecars` — RESEARCH.md Validation Architecture) is one command:
```json
"test": "bun test tools/provenance tests/provenance packages/sidecars"
```

---

### `justfile` (modified, implied)

**Analog:** itself — `provenance-tests` recipe (lines 63-66) is the template:
```
# The two provenance suites, split so a failure names the layer it came from.
provenance-tests:
    bun.exe test tools/provenance
    bun.exe test tests/provenance
```
Add a `sidecars-tests` recipe (`bun.exe test packages/sidecars`) and extend the `verify` gate (lines 74-79) with it, keeping the `bun.exe`-not-`bun` convention (lines 11-12).

## Shared Patterns

### Process execution (one-shot convention; the spawn contract for long-lived children)
**Source:** `tools/provenance/fetch.ts` lines 60-68
**Apply to:** `postgres.ts`, `llama.ts`, `hindsight.ts`
```typescript
return execFileSync('git', [...NEUTRAL_CONFIG, ...args], {
  cwd,
  encoding: 'utf8',
  input: stdin,
  maxBuffer: MAX_BUFFER,
  stdio: stdin === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
});
```
Long-lived children: `spawn` with an argv array (never `shell: true`), `windowsHide: true`, `detached: false`, `shell: false`, `stdio: ['ignore','pipe','pipe']` (AGENTS.md §4 via RESEARCH.md Pitfall 6). `-D` as a separate argument — paths contain spaces + non-ASCII (RESEARCH.md Pattern 6).

### Typed error with exit code
**Source:** `tools/provenance/paths.ts` lines 37-46
**Apply to:** all `packages/sidecars` modules (define `SidecarError` once; do not scatter raw `throw new Error`)
```typescript
/** The shared typed CLI error. `code` is the process exit code the CLI must use. */
export class ProvenanceError extends Error {
  readonly code: number;

  constructor(message: string, code = 2) {
    super(message);
    this.name = 'ProvenanceError';
    this.code = code;
  }
}
```

### Findings + exitCode result shape
**Source:** `tools/provenance/verify.ts` lines 81-85
**Apply to:** `version-check.ts` (and any startup gate)
```typescript
  /** 0 clean, 1 findings, 2 malformed ledger. */
  exitCode: 0 | 1 | 2;
  /** Every finding line, uncapped, in a deterministic order. */
  findings: string[];
```
Actionable messages name the bad value and the fix (verify.ts lines 304-311) — for MEM-02 the exact message is in RESEARCH.md Pitfall 2.

### SHA-256 digest
**Source:** `tools/provenance/manifest.ts` lines 40-47
**Apply to:** `tools/models/manifest.json` verification, the pgvector artifact gate
```typescript
export function hashFile(filePath: string): string {
  return hashBytes(readFileSync(filePath));
}
export function hashBytes(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
```

### Test harness (scratch temp dir + dispose)
**Source:** `tests/provenance/fixtures/scratch.ts` lines 75-90; `tools/provenance/test/manifest.test.ts` lines 44-58
**Apply to:** all five `packages/sidecars/tests/*.test.ts`
One fresh fixture per test in `mkdtempSync(join(tmpdir(), 'halo-<name>-'))`, `dispose()`/`rmSync(…, { recursive: true, force: true })` in `finally` (or `afterAll`).

### Literal assertion rule
**Source:** `tests/provenance/verify-drift.test.ts` lines 23-33; `tools/provenance/test/win-paths.test.ts` lines 1-9
**Apply to:** all five new tests
Assert the literal finding token / message / env value — never merely a non-zero exit — so a checker that fails for an unrelated reason cannot pass the suite.

### JSON data file + schema discipline
**Source:** `provenance/schema/upstream.schema.json` lines 1-27
**Apply to:** `tools/models/manifest.json` (+ companion schema)
`const` schema version tag, `additionalProperties: false`, explicit `required`, digest fields as top-level properties, `pattern` constraints on digests.

### Windows path safety
**Source:** `tools/provenance/paths.ts` (reserved device names, `DEFAULT_MAX_VENDORED_PATH_LENGTH = 240`, case-collision detection)
**Apply to:** `postgres.ts` (the `pgdata-18` data dir), `ports.ts` (runtime config path)
The PG data dir is named with the major (`pgdata-18`) so a future migrator can never silently open an incompatible cluster (RESEARCH.md Pattern 6); keep path lengths under the 240-char house cap.

## No Analog Found

Files with no close match (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `packages/sidecars/src/supervisor/postgres.ts` | service | process supervision | No long-lived child-process supervision exists in the repo; `tools/provenance` is one-shot `execFileSync` only. Spawn contract comes from AGENTS.md §4 (quoted in RESEARCH.md Pattern 6 / Pitfall 6); the client-connection health check is new (no DB client code exists yet) |
| `packages/sidecars/src/supervisor/llama.ts` | service | process supervision | Same as above; the `/health` HTTP poll is new (no HTTP-polling code exists yet) |
| `packages/sidecars/src/supervisor/hindsight.ts` | service | process supervision | Same as above; the Hermes `auth.json` secret-store read/write is new (no code in the repo touches it) |
| `packages/sidecars/src/supervisor/ports.ts` | utility | port allocation | No port-allocation code exists in the repo |
| `packages/sidecars/src/supervisor/state.ts` | state machine | event-driven | No state machine exists in the repo |
| HALO retain shim (2s coalescing) | service | event-driven debounce | The HALO app does not exist yet (`apps/` is empty); RESEARCH.md Pattern 4 / Q1 assigns the 2s window to this shim — likely a later phase |

## Metadata

**Analog search scope:** `tools/provenance/` (11 modules + 9 tests), `tests/provenance/` (8 tests + fixtures), `provenance/` (7 schemas + 2 data files), `.github/workflows/`, `justfile`, `package.json`; `packages/` and `apps/` confirmed absent
**Files scanned:** 30
**Pattern extraction date:** 2026-10-25
**Tracked-source gate:** all analog paths verified present in `git ls-files`
