# Phase 7: Subagent Orchestration - Pattern Map

**Mapped:** 2026-10-25
**Analogs found:** 15 / 15 (2 exact code, 9 role-match, 4 plan-specified seam)

> **Ground truth for this map:** Phases 3/4/5 are PLANNED but NOT EXECUTED — `packages/` does not exist yet. The closest existing analogs are (a) the vendored upstreams under `vendor/` (oh-my-pi, hermes-agent — MIT, rebranded; HALO's patch model applies local modifications as patches, not in-place edits), and (b) the Phase 3/4/5 PLAN.md / RESEARCH.md files in `.planning/phases/`, which specify the exact module paths, schema columns, and seams Phase 7 wires up. Code analogs cite `vendor/` file + line range; plan-specified seams cite the plan file + section. All 12 cited vendor files are git-tracked (verified via `git ls-files`).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/halo_agent/halo_agent/tools/backends/task.py` | tool backend | request-response + spawn/await | `vendor/hermes-agent/tools/delegate_tool.py` + `vendor/oh-my-pi/.../task/index.ts` | exact |
| `packages/halo_agent/halo_agent/loop/child_runner.py` | service (runner) | concurrency control | `vendor/oh-my-pi/.../task/index.ts` (`#spawnSemaphore`) + `parallel.ts` (`Semaphore`) | exact |
| `packages/halo_agent/halo_agent/loop/child_control.py` | service (control) | event-driven / lifecycle | `vendor/hermes-agent/tools/delegate_tool_child_run.py` (`_ChildRun`) + `03-08-PLAN.md` (interrupt path) | role-match |
| `packages/halo_agent/tests/subagent/conftest.py` | test fixture | fixture | `03-01-PLAN.md` (`tests/conftest.py`: `tmp_home`, `tmp_store`, `clock`, `run_child`) | role-match |
| `packages/halo_agent/tests/subagent/test_task_spawn.py` | test | integration | `07-RESEARCH.md` Validation Architecture (SUB-01 row) + `03-01-PLAN.md` test pattern | role-match |
| `packages/halo_agent/tests/subagent/test_isolation.py` | test | integration | `07-RESEARCH.md` Validation Architecture (SUB-01 row) + `vendor/hermes-agent/tools/subagent_worktree.py` | role-match |
| `packages/halo_agent/tests/subagent/test_child_governance.py` | test | integration + DB-constraint | `07-RESEARCH.md` Validation Architecture (SUB-02 row) + `04-06-PLAN.md` (gate) | role-match |
| `packages/halo_agent/tests/subagent/test_steer_kill_restore.py` | test | integration | `07-RESEARCH.md` Validation Architecture (SUB-03 row) + `03-08-PLAN.md` / `03-09-PLAN.md` | role-match |
| `packages/halo_agent/tests/subagent/test_orphan_cleanup.py` | test | integration | `07-RESEARCH.md` Validation Architecture (SUB-03 row) + `delegate_tool_child_run.py` (`account_background_processes`) | role-match |
| `packages/halo_agent/tests/subagent/test_concurrency_cap.py` | test | integration | `07-RESEARCH.md` Validation Architecture (SUB-04 row) + `task/index.ts` (`#spawnSemaphore`) | role-match |
| `packages/halo_agent/tests/subagent/test_cost_rollup.py` | test | integration + DB-constraint | `07-RESEARCH.md` Validation Architecture (SUB-04 row) + `03-RESEARCH.md` (`session_model_usage` DDL) | role-match |
| `packages/halo_agent/halo_agent/state/store.py` (wired) | store | CRUD | `03-01-PLAN.md` (`create_session`) + `04-06-PLAN.md` (`session_gate_state`) | plan-specified |
| `packages/halo_agent/halo_agent/adapter/dispatch.py` (wired) | adapter | request-response | `03-07-PLAN.md` (`ToolRequest`) + `04-DECISIONS.md` (D-G5 `agent_kind`) | plan-specified |
| `packages/halo_agent/halo_agent/loop/agent_loop.py` (reused) | loop | request-response | `03-08-PLAN.md` (`steer`/`interrupt`/`enqueue`) + `03-09-PLAN.md` (`resume`) | plan-specified |
| Phase 5 coding core (wired: `abort` + per-session process tracking) | core (Rust, vendored) | request-response | `05-RESEARCH.md` (`abort` command, `task` EXCLUDE, Windows spawn rules) | plan-specified |

## Pattern Assignments

### `packages/halo_agent/halo_agent/tools/backends/task.py` (tool backend, request-response + spawn/await)

**Analog (code):** `vendor/hermes-agent/tools/delegate_tool.py` — the HALO-owned `task` is a `runtime`-backend handler registered on the `BatchDispatcher` (Phase 4 seam); OMP's `TaskTool` is **unregistered** (EXCLUDE in the Phase 5 invocability table, `05-RESEARCH.md:174`). The child is a real HALO session in the same store, driven through the **same** `AgentLoop` and **same** adapter (B4, `STATE.md`).

**Registration seam (plan-specified):** `03-07-PLAN.md:155` — the backend is registered on the dispatcher and returns one envelope per request in input order:

```python
# 03-07-PLAN.md:155 (adapter/dispatch.py seam)
PHASE3_BACKEND = "runtime"   # the single backend name every Phase 3 tool call uses
BatchDispatcher.register_backend(name, backend)
BatchDispatcher.dispatch_batch(turn_id, requests, cancel) -> tuple[ToolResultEnvelope, ...]
# ToolResultEnvelope v1: (ok, text, content, artifacts, backend, invocation_id,
#                        policy_decision_id, duration_ms, truncated, error_kind)
```

**Child-session creation (plan-specified):** `03-01-PLAN.md:187` — `create_session` is the only producer of a `sessions` row + its generation-0 `transcripts` row, in one `BEGIN IMMEDIATE`. `source='subagent'` and `parent_session_id` are reserved Phase 3 columns:

```python
# 03-01-PLAN.md:187 (state/store.py seam)
SessionStore.create_session(*, source, model=None, origin="fresh",
                           parent_session_id=None, session_id=None) -> str
# sessions(id=<uuid7 hex>, source=<source>, origin=<'fresh'|'branch'|'import'>,
#         parent_session_id=<parent or NULL>, transcript_id=<new uuid7 hex>,
#         generation=0, next_seq=0, ...)
```

**Child build (code analog):** `vendor/hermes-agent/tools/delegate_tool.py:203-262` — `_build_child_agent` builds (doesn't run) the child on the main thread; depth is derived, not a stored role:

```python
# vendor/hermes-agent/tools/delegate_tool.py:232-240
child_depth = getattr(parent_agent, "_delegate_depth", 0) + 1
max_spawn = _get_max_spawn_depth()
effective_role = "orchestrator" if _get_orchestrator_enabled() and child_depth < max_spawn else "leaf"
subagent_id = f"sa-{task_index}-{_uuid.uuid4().hex[:8]}"
parent_subagent_id = getattr(parent_agent, "_subagent_id", None)
```

**Child run (code analog):** `vendor/hermes-agent/tools/delegate_tool.py:362-430` — `_run_single_child` runs the pre-built child on a worker thread and returns its result entry; the contract is derived from the child's structured completion fields:

```python
# vendor/hermes-agent/tools/delegate_tool.py:362-429 (contract, abridged)
#   status      ∈ {completed, interrupted, failed}
#   exit_reason ∈ {completed, max_iterations, interrupted, error}
#   truncated   == (exit_reason == "max_iterations")
run = _ChildRun(child, parent_agent, task_index, goal, _subagent_id, child_progress_cb, heartbeat=heartbeat)
try:
    heartbeat.start()
    run.seed_workspace()
    result, failure_entry, _child_close_deferred = run.await_child()
    if failure_entry is not None:
        return failure_entry
    schema = _validate_child_output_schema(child, result, task_index, run.child_task_id, run.relay_text)
    _merge_late_steer(result, _subagent_id, child)
    entry = _build_result_entry(child, result, task_index, run.elapsed(), schema)
    run.account_background_processes(entry)
    run.emit_complete(result, entry, run.elapsed())
    return run.attach_worktree(entry)
except Exception as exc:
    _late_pending_steer = run.close_steering()
    return run.finish_failed(_fabricated_entry(task_index, "error", str(exc), child, run.elapsed()),
                            _late_pending_steer, status="failed")
finally:
    run.cleanup(heartbeat=heartbeat, child_pool=child_pool, leased_cred_id=leased_cred_id,
                close_deferred=_child_close_deferred)
```

**Typed result envelope (SUB-01):** `07-RESEARCH.md:148-151` (Pattern 2) — the child's final answer is a typed, `extra="forbid"` Pydantic envelope: `{ status, exit_reason, summary, error, duration_seconds, api_calls, input_tokens, output_tokens, reasoning_tokens, cost_usd, files_read, files_written, worktree?, structured_output? }`. With a structured output schema, the child's final answer is validated with one bounded retry (Hermes `_validate_child_output_schema`, `delegate_tool_child_run.py:519-560`). A schema-less child degrades to `structured_output=None`.

---

### `packages/halo_agent/halo_agent/loop/child_runner.py` (service/runner, concurrency control)

**Analog (code, exact):** `vendor/oh-my-pi/packages/coding-agent/src/task/index.ts` — one semaphore per `TaskTool` instance (i.e. per session) bounds concurrent subagents across parallel `task` calls; resized in place from `task.maxConcurrency` before every acquire/release so a mid-session settings change applies to both new spawns and work already parked in the queue.

**Per-session semaphore + permit (code analog):** `vendor/oh-my-pi/.../task/index.ts:660-672`:

```typescript
// vendor/oh-my-pi/.../task/index.ts:660-672
#spawnSemaphore: Semaphore | undefined;
readonly #permit: SpawnPermit = {
    acquire: signal => this.#getSpawnSemaphore().acquire(signal),
    release: () => this.#releaseSpawnSemaphore(),
};
```

**Resize-in-place (code analog):** `vendor/oh-my-pi/.../task/index.ts:895-905`:

```typescript
// vendor/oh-my-pi/.../task/index.ts:895-905
#getSpawnSemaphore(): Semaphore {
    const max = cfgTaskMaxConcurrency.get(this.session.settings);
    if (this.#spawnSemaphore) {
        this.#spawnSemaphore.resize(max);   // in-place: in-flight slots stay counted
    } else {
        this.#spawnSemaphore = new Semaphore(max);
    }
    return this.#spawnSemaphore;
}
#releaseSpawnSemaphore(): void {
    this.#getSpawnSemaphore().release();
}
```

**Recursion-depth cap (code analog):** `vendor/oh-my-pi/.../task/types.ts:266-268` + `index.ts:1035-1038`:

```typescript
// vendor/oh-my-pi/.../task/types.ts:266-268
export function canSpawnAtDepth(maxRecursionDepth: number, taskDepth: number): boolean {
    return maxRecursionDepth < 0 || taskDepth < maxRecursionDepth;
}
// vendor/oh-my-pi/.../task/index.ts:1035-1038
const depthCapacity = canSpawnAtDepth(
    cfgTaskMaxRecursionDepth.get(this.session.settings),
    this.session.taskDepth ?? 0,
);
```

**Semaphore primitive (code analog):** `vendor/oh-my-pi/.../task/parallel.ts:140-194` — `acquire(signal)` parks beyond the cap and, on abort, splices the abandoned waiter out of the queue so a later `release()` never resolves it (issue #3464); `release()` admits the next waiter only if under the (possibly just-lowered) ceiling:

```typescript
// vendor/oh-my-pi/.../task/parallel.ts:157-194 (abridged)
async acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw semaphoreAbortReason(signal);
    if (this.#current < this.#max) { this.#current++; return; }
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    let waiter: () => void = resolve;
    if (signal) {
        const onAbort = () => {
            const index = queue.indexOf(waiter);
            if (index >= 0) queue.splice(index, 1);
            reject(semaphoreAbortReason(signal));
        };
        waiter = () => { signal.removeEventListener("abort", onAbort); resolve(); };
        signal.addEventListener("abort", onAbort, { once: true });
    }
    queue.push(waiter);
    return promise;
}
release(): void {
    if (this.#current > 0) this.#current--;
    if (this.#current < this.#max) {
        const next = this.#queue.shift();
        if (next) { this.#current++; next(); }
    }
}
```

**Cap defaults (code analog):** `vendor/oh-my-pi/.../task/settings.ts:294-345` — `task.maxConcurrency` default 32 (0 = unlimited), `task.maxRecursionDepth` default 2, `task.maxRuntimeMs` default 0 (disabled; a hard wall-clock limit that triggers a normal subagent abort with a 'timed out' reason). Hermes floor: `vendor/hermes-agent/tools/delegate_tool_config.py:17,21,93-110` — `_DEFAULT_MAX_CONCURRENT_CHILDREN = 10`, `MAX_DEPTH = 1` (flat by default: parent 0 → child 1; deeper needs `max_spawn_depth`), `DEFAULT_CHILD_TIMEOUT = None` (no default wall-clock cap; stuck-child detection is the heartbeat staleness monitor).

**Per-child cost rollup (SUB-04):** `07-RESEARCH.md:176-179` (Pattern 7) — the child's `session_model_usage` rows (already written per request by the Phase 3 loop, `03-07-PLAN.md:155` step 3) roll up into a per-child cost record on the session row (tokens + `cost_usd`). The `session_model_usage` DDL is `03-RESEARCH.md:463-473` (columns: `prompt_tokens`, `completion_tokens`, `total_tokens`, `cache_read_tokens`, `cache_write_tokens`, `reasoning_tokens`, `estimated_cost_usd`, `actual_cost_usd`, `pricing_version`). Hermes cost rollup analog: `delegate_tool_child_run.py:1075-1100` (`emit_complete` reads `session_prompt_tokens` / `session_completion_tokens` / `session_reasoning_tokens` / `session_estimated_cost_usd` and emits them on the `subagent.complete` event).

---

### `packages/halo_agent/halo_agent/loop/child_control.py` (service/control, event-driven / lifecycle)

**Analog (code + plan):** `vendor/hermes-agent/tools/delegate_tool_child_run.py` (`_ChildRun` lifecycle: seed → await → cleanup) + `03-08-PLAN.md` (the loop's per-session `steer`/`interrupt`/`enqueue` controls) + `03-09-PLAN.md` (`resume`) + `05-RESEARCH.md` (the core `abort` command).

**Steer / kill / restore (plan-specified):** `03-08-PLAN.md:28-40` (key links) — the loop's existing per-session controls, keyed by the child `session_id`:

```
# 03-08-PLAN.md:28-40 (key_links)
AgentLoop.steer    -> admissions.admit(kind='steer')      -> input_modes.fold_user -> one user row with absorbed uid
AgentLoop.interrupt-> cancel token -> dispatch_gate checkpoint or dispatch_batch cancel
                     -> turn.resolve_open_tool_invocations (synthetic results in call_ordinal order)
                     -> close_turn(reason='interrupted')
AgentLoop.enqueue  -> admissions.admit(kind='follow_up')  -> drain after close_turn
```

`03-09-PLAN.md:27` (LOOP-03) — `resume(session_id)` loads the `active=1` rows of the active transcript in `seq` order (the `role='system'` row included, at position 0), restores `message_uid` unconditionally, validates alternation, returns the last usage anchor and any blocking `unknown` admission, and raises `SessionNotFound` for an unknown id.

**Steer linearization boundary (code analog):** `vendor/hermes-agent/tools/delegate_tool_child_run.py:503-512` — from the linearization boundary the child cannot consume another steer; closing under the registry lock either rejects a concurrent caller or drains every accepted exact text into the result before callbacks/result assembly run:

```python
# vendor/hermes-agent/tools/delegate_tool_child_run.py:503-512
def _merge_late_steer(result: dict[str, Any], subagent_id: Optional[str], child: Any) -> None:
    late = _close_subagent_steering(subagent_id, child) if subagent_id else None
    if late:
        existing = result.get("pending_steer")
        result["pending_steer"] = f"{existing}\n{late}" if isinstance(existing, str) and existing else late
```

**Kill = interrupt + core abort + process-tree kill (plan-specified + code):** `07-RESEARCH.md:300-310` (Pattern 5/6 code example) + `05-RESEARCH.md:258-266` (the core `abort` command, keyed by `id`):

```python
# 07-RESEARCH.md:300-310 (kill contract)
def kill_child(child_id, in_flight_core_ids, child_process_tree):
    loop.interrupt(child_turn_id)              # Phase 3: synthetic results in call_ordinal order
    for cid in in_flight_core_ids:
        core.abort(cid)                         # Phase 5: abort command keyed by id
    kill_process_tree(child_process_tree)       # Windows: job object / taskkill /T /F
    assert_port_free(child_port)                # post-kill probe (Pitfall 5)
```

```typescript
// 05-RESEARCH.md:258-266 (core abort wiring)
const signal = abortControllers.get(id); // wired to the "abort" command
const result = await toolImpl.execute(id, args, signal);
```

**Orphan process + bound-port cleanup (code analog):** `vendor/hermes-agent/tools/delegate_tool_child_run.py:1044-1062` — `account_background_processes` names the child's background processes on the result **before** `cleanup` kills them: handed-off ones now belong to the parent; anything else still running is about to be terminated, and the parent must hear that from the runtime rather than trust a child's "watcher running":

```python
# vendor/hermes-agent/tools/delegate_tool_child_run.py:1044-1062 (abridged)
def account_background_processes(self, entry: dict[str, Any]) -> None:
    handed = list(getattr(self.child, "_handed_off_processes", None) or [])
    if handed:
        entry["handed_off_processes"] = handed
    leftover = process_registry.running_owned_by(self.child_task_id)
    if leftover:
        entry["orphaned_processes"] = [
            {"session_id": s.id, "command": redact_child_text(s.command, force=False)[:200],
             "runtime_seconds": round(time.time() - s.started_at)} for s in leftover]
    unread = process_registry.unread_completions_owned_by(self.child_task_id)
    if unread:
        entry["unread_completions"] = [ ... ]
```

**Idempotent teardown order (code analog):** `vendor/hermes-agent/tools/delegate_tool_child_run.py:1103-1146` — `cleanup` is the finally-path teardown (idempotent, never raises). Order matters: stop heartbeat → drop registry entry → release credential lease → restore the parent's process-global tool names → detach from the parent's interrupt list → close the child (unless a timed-out worker still owns it) → pop the child's Relay scope if no turn is active. **HALO divergence:** the shared coding core is **never** killed on child kill (Pitfall 3, `07-RESEARCH.md:229-233`); per-session process ownership + process-tree kill + core `abort` by `id` is the only mechanism that cleans the child without orphaning the parent.

**Await / timeout (code analog):** `vendor/hermes-agent/tools/delegate_tool_child_run.py:879-950` — `await_child` runs the child's conversation on a daemon worker; the hard timeout is off by default (stuck children are the heartbeat's job); on failure, steer acceptance closes **before** the stop signal (a concurrent steer is drained into the entry or rejected, never lost); a worker that still owns the child gets `child.close()` via a Future done-callback (`close_deferred=True`) — closing here would race its still-unwinding finally path.

---

### `packages/halo_agent/tests/subagent/conftest.py` (test fixture)

**Analog (plan-specified):** `03-01-PLAN.md:190` — the Phase 3 `tests/conftest.py` is the fixture template Phase 7's `tests/subagent/conftest.py` copies:

```python
# 03-01-PLAN.md:190 (tests/conftest.py seam)
# provides: tmp_home, tmp_store (fresh temp home per test, never %LOCALAPPDATA%\HALO),
#          an injectable clock, and a run_child(argv) helper that spawns with an
#          argv list, no shell, no pipes.
```

**Windows spawn rule (plan-specified):** `05-RESEARCH.md:18-26` — child-process supervision must use `windowsHide`, no `detached`, argv arrays (paths contain spaces + non-ASCII), no `shell: true`. The `run_child` helper is the single place this rule is enforced in tests.

**Test map (plan-specified):** `07-RESEARCH.md:383-397` — the Phase Requirements → Test Map assigns each `tests/subagent/test_*.py` file to a SUB requirement with its automated command (`uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/subagent/<file> -x`).

---

### `packages/halo_agent/tests/subagent/test_task_spawn.py` (test, integration)

**Analog (plan-specified):** `07-RESEARCH.md:386` (SUB-01 row) — `task` spawns a child session (`source='subagent'`, `parent_session_id` set) and returns a typed result. Assert: the child `sessions` row has `source='subagent'` and `parent_session_id=<parent>`; the typed envelope (`07-RESEARCH.md:148-151`) is returned; the child ran through the **same** `AgentLoop` (one `session_model_usage` row per provider request, `03-07-PLAN.md:155` step 3).

### `packages/halo_agent/tests/subagent/test_isolation.py` (test, integration)

**Analog (code + plan):** `vendor/hermes-agent/tools/subagent_worktree.py` + `07-RESEARCH.md:158-161` (Pattern 4). Assert: a worktree is created off the parent HEAD (`<repo>/.worktrees/subagent-<id>` on branch `halo-subagent/<id>`); the child cwd is the worktree; on finish, zero-commits-and-clean → pruned, work-left-behind → archived to `refs/halo/archive/<tree>` then pruned (branch kept), failed probe → kept + flagged.

**Worktree create (code analog):** `vendor/hermes-agent/tools/subagent_worktree.py:66-99` — `create_subagent_worktree` creates an isolated worktree for one child; `None` (silent downgrade) outside git / on failure:

```python
# vendor/hermes-agent/tools/subagent_worktree.py:66-99 (abridged)
def create_subagent_worktree(parent_cwd, subagent_id=None) -> Optional[dict[str, str]]:
    repo_root = resolve_repo_root(parent_cwd)
    if not repo_root:
        return None
    wt_name = f"subagent-{(subagent_id or uuid.uuid4().hex[:8]).replace('/', '-')}"
    branch = f"hermes-subagent/{wt_name}"
    wt_path = Path(repo_root) / ".worktrees" / wt_name
    ...
    result = _run_git(["worktree", "add", str(wt_path), "-b", branch, "HEAD"], cwd=repo_root, env=add_env)
    if result.returncode != 0:
        return None   # common on repos with zero commits (unborn HEAD) — degrade silently
    return {"path": str(wt_path), "branch": branch, "repo_root": repo_root, "base_commit": base_commit}
```

**Flagged payload on failed probe (code analog):** `vendor/hermes-agent/tools/subagent_worktree.py:116-133` — `mark_worktree_payload_unproven` flags a worktree result payload as un-inspected, in place; the parent only sees this dict, so the uncertainty must travel in it or "0 commits, clean" reads as "the child produced nothing":

```python
# vendor/hermes-agent/tools/subagent_worktree.py:116-133 (abridged)
def mark_worktree_payload_unproven(payload, reason, *, unmeasured="commits/dirty"):
    payload["inspection_failed"] = True
    payload["note"] = (f"git inspection failed ({reason}): {unmeasured} UNKNOWN — not proven "
                      f"zero/clean. The worktree and branch were preserved — inspect {path} "
                      f"(branch {branch}) before assuming no work.")
    return payload
```

**Prune/archive decision (code analog):** `vendor/hermes-agent/tools/subagent_worktree.py:135-213` — `finalize_subagent_worktree` prunes only when `prune`, `commits==0`, clean tree AND both git probes succeeded; otherwise keeps it with `inspection_failed` + `note`. Destructive cleanup requires affirmative proof; defaults prove nothing.

**Hardened git (code analog):** `vendor/hermes-agent/tools/subagent_worktree.py:24-36` — `_run_git` runs git capturing output, never raises on non-zero exit; `worktree add` runs hooks, so a malicious `.git/config` must not execute (GHSA-7x36-8jrh-v4pw):

```python
# vendor/hermes-agent/tools/subagent_worktree.py:24-36
def _run_git(args, cwd, timeout=_GIT_TIMEOUT, env=None):
    return subprocess.run(["git", *harden_git_argv(args)], cwd=cwd, capture_output=True,
                          text=True, encoding="utf-8", errors="replace", timeout=timeout,
                          stdin=subprocess.DEVNULL, env=env or noninteractive_git_env(), check=False)
```

### `packages/halo_agent/tests/subagent/test_child_governance.py` (test, integration + DB-constraint)

**Analog (plan-specified):** `07-RESEARCH.md:388` (SUB-02 row) + `04-06-PLAN.md` (the gate). Assert: every child tool call has a `policy_decision_id`; the child inherits the parent's mode (one-time row copy at creation, `07-RESEARCH.md:153-156` Pattern 3); a parent mid-run mode change does **NOT** widen the child (Pitfall 2, `07-RESEARCH.md:223-226`); a child call with no `policy_decision_id` is a test failure (Pitfall 4, `07-RESEARCH.md:235-238`).

**Gate inheritance (plan-specified):** `07-RESEARCH.md:257-269` (code example) — on child creation, the child's `session_gate_state` row is seeded from the parent's row (same `approval_mode`, `allowlist`, `session_grants`); every child tool call is stamped `agent_kind="sub"` and evaluated by the **same** per-batch `PolicySnapshot` built from the **child's** row:

```python
# 07-RESEARCH.md:257-269 (gate inheritance contract)
child_id = store.create_session(source="subagent", parent_session_id=parent_id, origin="fresh")
parent_gate = store.get_session_gate_state(parent_id)   # approval_mode, allowlist, session_grants
store.set_session_gate_state(child_id, **parent_gate)   # child's own row is now the authority
# ...
req = ToolRequest(..., session_id=child_id, turn_id=child_turn_id, agent_kind="sub")
snap = build_policy_snapshot(child_id)   # per-batch, from the CHILD row
decision = gate.evaluate(req, snap)       # own policy_decision_id
```

**`session_gate_state` DDL (plan-specified):** `04-RESEARCH.md:394-400`:

```sql
CREATE TABLE session_gate_state(
  session_id TEXT PRIMARY KEY,
  approval_mode TEXT NOT NULL CHECK(approval_mode IN ('auto_approve','allowlist','yolo')),
  allowlist TEXT NOT NULL DEFAULT '[]',
  session_grants TEXT NOT NULL DEFAULT '[]',
  updated_at REAL NOT NULL
);
```

### `packages/halo_agent/tests/subagent/test_steer_kill_restore.py` (test, integration)

**Analog (plan-specified):** `07-RESEARCH.md:389` (SUB-03 row) + `03-08-PLAN.md` (steer/interrupt) + `03-09-PLAN.md` (resume). Assert: steer a live child (folds at the next user boundary, `03-08-PLAN.md:28-40`); kill a child (interrupt + core abort + process-tree kill, `07-RESEARCH.md:300-310`); restore a killed child (`resume`, `03-09-PLAN.md:27`).

### `packages/halo_agent/tests/subagent/test_orphan_cleanup.py` (test, integration)

**Analog (code + plan):** `07-RESEARCH.md:390` (SUB-03 row) + `vendor/hermes-agent/tools/delegate_tool_child_run.py:1044-1062` (`account_background_processes`). Assert: a killed child leaves no orphaned process or bound port (post-kill probe, Pitfall 5, `07-RESEARCH.md:241-244`).

### `packages/halo_agent/tests/subagent/test_concurrency_cap.py` (test, integration)

**Analog (code + plan):** `07-RESEARCH.md:391` (SUB-04 row) + `vendor/oh-my-pi/.../task/index.ts:660-672` (`#spawnSemaphore`). Assert: a fan-out beyond the cap parks in the queue; the cap is resizable in place (`index.ts:895-905`).

### `packages/halo_agent/tests/subagent/test_cost_rollup.py` (test, integration + DB-constraint)

**Analog (plan-specified):** `07-RESEARCH.md:392` (SUB-04 row) + `03-RESEARCH.md:463-473` (`session_model_usage` DDL). Assert: the child's `session_model_usage` rows roll up into a per-child cost record on the session row (tokens + `cost_usd`).

---

### `packages/halo_agent/halo_agent/state/store.py` (wired, store, CRUD)

**Analog (plan-specified):** `03-01-PLAN.md:187` (`create_session` — the only producer of a `sessions` row + generation-0 `transcripts` row, in one `BEGIN IMMEDIATE`; `source='subagent'` + `parent_session_id` are reserved columns) + `04-06-PLAN.md` (`session_gate_state` row, `set_session_approval_mode` / `grant_session_pattern` writers) + `03-RESEARCH.md:291-303` (`sessions` DDL) + `03-RESEARCH.md:463-473` (`session_model_usage` DDL).

**`sessions` DDL (plan-specified):** `03-RESEARCH.md:291-303`:

```sql
CREATE TABLE sessions(
  id TEXT PRIMARY KEY,                       -- uuid7 hex
  source TEXT NOT NULL,                      -- cli|desktop|subagent|cron|kanban|tool
  parent_session_id TEXT REFERENCES sessions(id),
  origin TEXT NOT NULL CHECK(origin IN ('fresh','branch','import')),
  title TEXT,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL,
  model TEXT, model_config TEXT, cwd TEXT,
  transcript_id TEXT NOT NULL,               -- active generation
  generation INTEGER NOT NULL DEFAULT 0,
  next_seq INTEGER NOT NULL DEFAULT 0,
  ...
);
```

**Wiring Phase 7 adds:** (1) `create_session(source="subagent", parent_session_id=<parent>)` is already the reserved seam — no new column; (2) a `set_session_gate_state(child_id, **parent_gate)` one-time row copy (the `session_gate_state` table is Phase 4's, `04-RESEARCH.md:394-400`); (3) a `rollup_child_cost(child_id)` that aggregates the child's `session_model_usage` rows into a per-child cost record on the session row.

---

### `packages/halo_agent/halo_agent/adapter/dispatch.py` (wired, adapter, request-response)

**Analog (plan-specified):** `03-07-PLAN.md:155` (`ToolRequest` frozen dataclass: `tool_call_uid`, `tool_call_id`, `tool_name`, `args`, `backend`) + `04-DECISIONS.md:56-65` (D-G5: extend `ToolRequest` with trailing defaulted fields, `agent_kind="main"` is the only producer until Phase 7).

**D-G5 (plan-specified):** `04-DECISIONS.md:56-65`:

```
D-G5: extend-toolrequest
  Adopted from 04-RESEARCH.md:498: one ToolRequest flows loop -> adapter -> gate by
  extending the landed 5-field frozen dataclass with trailing defaulted fields
  (session_id="", turn_id="", capabilities=frozenset(), cwd="", phase=None,
  agent_kind="main") so every existing positional construction in 03-07's code
  keeps compiling. `agent_kind="main"` is the only producer until Phase 7.
```

**Wiring Phase 7 adds:** the `agent_kind="sub"` producer — every child tool call stamps `agent_kind="sub"` (the Phase 4 `ToolRequest` field, currently `"main"`-only). No new field; the `"sub"` value is the only addition.

---

### `packages/halo_agent/halo_agent/loop/agent_loop.py` (reused, loop, request-response)

**Analog (plan-specified):** `03-08-PLAN.md:28-40` (`steer`/`interrupt`/`enqueue` key links) + `03-09-PLAN.md:27` (`resume`). **Phase 7 reuses these per-session controls keyed by the child `session_id`; it does not modify `agent_loop.py`.** The child turn runs on the **same** `AgentLoop` (B4, `STATE.md`); the loop is per-session, the store has one writer thread, the authority is a singleton (`07-RESEARCH.md:337-338`, Open Question A1 — confirm `run_turn` is safe for concurrent per-session calls, or serialize per-session).

---

### Phase 5 coding core (wired: `abort` + per-session process tracking)

**Analog (plan-specified):** `05-RESEARCH.md:258-266` (the `abort` command, keyed by `id`) + `05-RESEARCH.md:174` (`task` EXCLUDE — "needs agent loop + spawn coordination") + `05-RESEARCH.md:18-26` (Windows spawn rules).

**`task` EXCLUDE (plan-specified):** `05-RESEARCH.md:174`:

```
| task | TaskTool.create(s) [tools/index.ts:578] | spawns subagents | — | No — needs agent loop + spawn coordination | EXCLUDE |
```

**Wiring Phase 7 adds:** (1) the core `abort` command is already present (`05-RESEARCH.md:258-266`) — Phase 7 sends `abort` for the child's in-flight core calls by `id`; (2) per-session process tracking — the core's `bash` tool spawns are tracked **per child session** (a per-session process registry on the Python side, keyed by the child `session_id` / the core call `id`); if the core does not already attribute spawned processes per session/call, a **minimal provenance patch** is added under `vendor/oh-my-pi/provenance/patches/` (the patch model: hand-maintained series, every entry must apply cleanly in order, `05-RESEARCH.md:18-26`). **The shared core is never killed on child kill** (Pitfall 3, `07-RESEARCH.md:229-233`).

---

## Shared Patterns

### Gate inheritance (one-time row copy, not a live pointer)
**Source:** `07-RESEARCH.md:153-156` (Pattern 3) + `04-RESEARCH.md:394-400` (`session_gate_state` DDL) + `04-DECISIONS.md:56-65` (D-G5 `agent_kind`)
**Apply to:** `task.py` (child creation), `store.py` (`set_session_gate_state`), `dispatch.py` (`agent_kind="sub"`)
```python
# Inheritance is a ONE-TIME row copy at child creation (not a live pointer):
parent_gate = store.get_session_gate_state(parent_id)   # approval_mode, allowlist, session_grants
store.set_session_gate_state(child_id, **parent_gate)   # child's own row is now the authority
# Every child tool call is stamped agent_kind="sub" and evaluated by the SAME
# per-batch PolicySnapshot built from the CHILD's row. A mid-run parent mode
# change does NOT widen the child (Pitfall 2). The deny floor still applies to
# the child exactly as to the parent (Phase 4: the floor is never a mode input).
```

### Single loop / single gate / single store (B4 invariants)
**Source:** `07-RESEARCH.md:20-28` (Summary) + `07-RESEARCH.md:181-187` (Anti-Patterns) + `STATE.md` (decision B4)
**Apply to:** all three new modules
- **Registering OMP's `task` tool in the core:** Rejected by B4 — `task` needs the agent loop + spawn coordination; it is HALO-owned, a `runtime` backend.
- **A second gate or a live policy pointer from parent to child:** Rejected — the child's own `session_gate_state` row is the authority (one-time copy at creation).
- **Killing the shared core on child kill:** Rejected — the parent still needs the core; per-session process ownership + process-tree kill is required.
- **Hand-rolling the single-writer store, per-batch gate, supervised core, or resume:** Rejected — `07-RESEARCH.md:201`: "Phase 7 is almost entirely wiring up reserved seams (Phase 3 columns, Phase 4 gate, Phase 5 core) plus three new modules. The hard parts already exist. Hand-rolling any of them would create a second authority the invariants forbid."

### Windows-first child-process supervision
**Source:** `05-RESEARCH.md:18-26` (User Constraints) + `03-01-PLAN.md:190` (`run_child` helper)
**Apply to:** `conftest.py` (`run_child`), `child_control.py` (process-tree kill)
- `windowsHide`, no `detached`, argv arrays (paths contain spaces + non-ASCII), no `shell: true`.
- Process-tree kill on Windows via the job object / `taskkill /T /F` on the process tree.

### Seam re-validation (Wave 0, first task)
**Source:** `07-RESEARCH.md:217-221` (Pitfall 1) + `04-DECISIONS.md:88-96` (the Phase 4 pattern)
**Apply to:** the first task of the phase
```
# 04-DECISIONS.md:88-96 (seam re-validation pattern)
Phase 7's quoted seam shapes are 03-07/04-06/05's *planned* shapes; Phases 1-5 are
authored but unexecuted at planning time. The first task re-reads the landed
Phase 3/4/5 code and appends one
  SEAM-REVALIDATION: loop=<ok|diverged> gate=<ok|diverged> store=<ok|diverged> core=<ok|diverged>
line plus a SEAM-DIVERGENCE: <file> <observation> line per mismatch before any
Phase 7 edit lands. Gate every Phase 7 task on the re-validated shapes.
```

## No Analog Found

None. Every file has either a code analog (vendored upstream) or a plan-specified seam (Phase 3/4/5 PLAN.md / RESEARCH.md). The 5 plan-specified seams (`store.py`, `dispatch.py`, `agent_loop.py`, Phase 5 core) do not exist on disk yet (`packages/` is unexecuted); their authoritative shape is the cited plan file + section, and the Wave-0 seam re-validation task confirms the landed shape before any Phase 7 edit lands.

## Metadata

**Analog search scope:** `vendor/hermes-agent/tools/` (delegate_tool.py, delegate_tool_child_run.py, delegate_tool_config.py, subagent_worktree.py), `vendor/oh-my-pi/packages/coding-agent/src/task/` (index.ts, settings.ts, parallel.ts, types.ts, spawn-run.ts, isolation-runner.ts, persisted-revive.ts, structured-subagent.ts), `.planning/phases/03-unified-loop-session-authority/` (03-01-PLAN.md, 03-07-PLAN.md, 03-08-PLAN.md, 03-09-PLAN.md, 03-RESEARCH.md), `.planning/phases/04-tool-registry-policy-gate/` (04-06-PLAN.md, 04-DECISIONS.md, 04-RESEARCH.md), `.planning/phases/05-coding-core-over-rpc/` (05-RESEARCH.md)
**Files scanned:** 12 vendor (all git-tracked, verified) + 8 plan/research
**Pattern extraction date:** 2026-10-25
**Tracked-source gate:** all 12 cited vendor files verified git-tracked via `git ls-files` (12/12); plan files are in tracked `.planning/`. No gitignored mirror paths emitted.
