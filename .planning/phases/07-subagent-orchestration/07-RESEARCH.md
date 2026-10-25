# Phase 7: Subagent Orchestration - Research

**Researched:** 2026-10-25
**Domain:** In-process subagent orchestration (child HALO sessions under the single loop, governed by the single gate, over the shared coding core)
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SUB-01 | `task` spawns child sessions with configurable isolation and returns typed results to the parent | §Pattern 1 (HALO-owned `task` backend, child session via `create_session(source="subagent", parent_session_id=…)`), §Pattern 2 (typed result envelope), §Pattern 4 (worktree isolation), the OMP `TaskTool` + Hermes `delegate_tool` references. |
| SUB-02 | Every child tool call carries its own policy decision and inherits the parent's policy — no child executes ungoverned | §Pattern 3 (gate inheritance via `session_gate_state` + `agent_kind="sub"`), the Phase 4 `PolicySnapshot`-per-batch seam, the `tool_invocations.policy_decision_id` column. |
| SUB-03 | A user can steer, kill and restore a child session, and a killed child leaves no orphaned process or bound port | §Pattern 5 (steer/kill/restore via the loop's `steer`/`interrupt`/`enqueue` + resume), §Pattern 6 (orphan-process + bound-port cleanup), the Hermes `_ChildRun.cleanup` + `account_background_processes` reference. |
| SUB-04 | Concurrency caps and per-child cost accounting appear in the session record | §Pattern 7 (bounded worker pool / spawn semaphore), the `session_model_usage` rollup, the OMP `cfgTaskMaxConcurrency` + Hermes `max_concurrent_children` references. |
</phase_requirements>

## Summary

Phase 7 makes a parent turn able to fan out **child HALO sessions** that are governed by the same gate and can be steered, killed and restored. The load-bearing decision is already locked in `STATE.md` (decision B4): **`task` is HALO-owned** — it creates a child HALO session (`parent_session_id`) and drives it through the **same loop** through the **same adapter**; OMP's `task` tool is **unregistered** (it is `EXCLUDE` in the Phase 5 invocability table because it "needs agent loop + spawn coordination"). The coding core supplies tool implementations, never agents.

The good news for planning: **the Phase 3 schema already reserves every seam Phase 7 needs.** `sessions.source` already has a `subagent` value, `sessions.parent_session_id` already exists, `turn_background_work.kind` already has `task`, `session_admissions.kind` already has `steer`, `session_model_usage` already records per-request usage, and `tool_invocations.policy_decision_id` already links a call to its gate decision. Phase 7 is therefore **additive** — it wires up reserved columns and adds a `task` backend, a child-session runner, and a concurrency/cost layer. It does **not** rebuild the loop, the gate, or the store.

The upstream references are clear. **Hermes** runs subagents as in-process `AIAgent` children on daemon worker threads, with a `_ChildRun` lifecycle (seed → await → cleanup), heartbeat/stale detection, opt-in git-worktree isolation, orphan-process accounting (`account_background_processes`), per-child cost rollup, and a steer linearization boundary. **OMP** runs `TaskTool` with a per-session spawn **semaphore** (the concurrency cap), `canSpawnAtDepth` (recursion depth), `cfgTaskMaxRuntimeMs` (runtime cap), a structured output schema, worktree isolation, and a `persisted-revive` path (restore). HALO's design is the union of these, constrained by the single-loop / single-gate / single-store invariants.

**Primary recommendation:** Implement `task` as a `runtime`-backend tool that (1) creates a child session via `SessionStore.create_session(source="subagent", parent_session_id=<parent>)`, (2) runs the child's turns on a **bounded worker pool** (the concurrency cap, SUB-04) that calls the **same** `AgentLoop.run_turn(child_session_id, …)`, (3) inherits the parent's `session_gate_state` into the child's row and stamps every child tool call with `agent_kind="sub"` so the gate evaluates it independently (SUB-02), (4) exposes steer/kill/restore through the loop's existing `steer`/`interrupt`/`enqueue` + Phase 3 resume, with kill = interrupt + abort of the child's in-flight core calls + kill of the child's spawned process tree (SUB-03), and (5) rolls the child's `session_model_usage` into a per-child cost record on the session row (SUB-04).

**Critical planning caveat (seam re-validation):** Phases 3/4/5 are **planned but not executed** at planning time — there is no `packages/` directory in the repo yet (verified this session: `ls` shows no `packages/`). The seam shapes quoted below are the *planned* shapes from the Phase 3/4/5 plan documents. **The Phase 7 plan MUST open with a Wave-0 task that re-reads the landed Phase 3/4/5 code and appends a `SEAM-REVALIDATION` line** (exactly the pattern Phase 4 used against Phase 3, `04-DECISIONS.md:90-96`). Do not plan against the planned shapes as if they are landed.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `task` tool (spawn/await/collect) | Python loop (`packages/halo_agent/tools/backends/task.py`) | — | HALO-owned per B4; a `runtime`-backend handler, not a core tool. |
| Child session creation + lineage | SQLite store (`SessionStore.create_session`) | — | `source='subagent'` + `parent_session_id` are reserved Phase 3 columns; one writer. |
| Child turn execution (concurrent) | Python loop (`AgentLoop.run_turn`, per-session) | Bounded worker pool (new, `halo_agent/loop/child_runner.py`) | The loop is per-session; the pool bounds concurrency (SUB-04) and is the only new runtime surface. |
| Child policy governance | Gate (`policy/` + `session_gate_state`) | — | The child's row inherits the parent's mode; `agent_kind="sub"` is evaluated by the same per-batch `PolicySnapshot`. No second gate. |
| Child tool execution (file/shell) | Coding core (shared, Phase 5 `omp` backend) | — | The core supplies tool implementations, never agents; parent and child share one supervised core. |
| Steer / kill / restore | Python loop (`steer`/`interrupt`/`enqueue` + Phase 3 resume) | Core `abort` command (keyed by `id`) | Kill = loop interrupt + abort of the child's in-flight core calls + kill of the child's process tree. |
| Orphan process / bound-port cleanup | Python side (per-session process registry, new) | Core `bash` abort | The core is shared, so per-session process ownership must be tracked on the Python side and killed on child kill. |
| Per-child cost accounting | SQLite store (`session_model_usage` rollup) | — | Usage rows already exist per request; Phase 7 adds a per-child rollup onto the session record. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python | 3.14.7 (via uv) | `halo_agent` runtime | The single agent loop; pinned by AGENTS.md (3.14.9 target, 3.14.7 resolved — see `D-PYTHON` escape hatch). |
| `pydantic` | v2 (Phase 3 pin) | `ToolCallIn`, result envelope, structured output schema | Already the Phase 3/4 boundary model; `extra="forbid"` for the typed result (SUB-01). |
| `pytest` + `pytest-asyncio` | Phase 3 pins | Test lanes | The established validation harness (`uv run --project packages/halo_agent pytest`). |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `git` (CLI) | 2.55.0 | Worktree isolation (SUB-01 "configurable isolation") | Only when isolation is requested; silent downgrade outside a repo (Hermes pattern). |
| The coding core (Bun, Phase 5) | Bun 1.4.2 | Child tool execution (file/shell) | Shared supervised child; parent and child both invoke through the `omp` backend. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-process child sessions (same loop) | Out-of-process child `halo-agent` processes (each with its own core) | Out-of-process gives hard process isolation but breaks the "single loop / single store" invariant, doubles core supervision, and loses the shared-core cost model. Rejected by B4. |
| Bounded worker pool for concurrency | One thread per child (unbounded) | Unbounded threads exhaust the store writer and the core's RPC; the semaphore is the cap (SUB-04). |
| Per-session process registry for orphan cleanup | Kill the whole core on child kill | The core is shared with the parent; killing it orphans the parent. Per-session ownership is required. |

**Installation:**
```bash
# No new runtime package. Phase 7 is additive on the Phase 3/4/5 stack.
# git is a system dependency (verified present: 2.55.0).
```

**Version verification:** No new package is installed by Phase 7 (see Package Legitimacy Audit). `git 2.55.0.windows.3`, `uv 0.12.17`, `bun 1.4.2`, `node v22.23.2` were probed this session.

## Package Legitimacy Audit

> Phase 7 installs **no new external package**. It is additive on the Phase 3/4/5 stack (Python 3.14, `pydantic` v2, `pytest`, `pytest-asyncio`, the Bun coding core, `git`). Therefore there is no new package to gate.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none new) | — | — | — | — | — | No install |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

*No package discovered via WebSearch or training data requires a `checkpoint:human-verify` gate because Phase 7 adds no dependency. If the executor finds a need for a new package (e.g., a worktree library), it MUST run the Package Legitimacy Gate before install and record the verdict here.*

## Architecture Patterns

### System Architecture Diagram

```
Parent turn (AgentLoop.run_turn(parent_session_id, …))
│  provider reply carries a `task` tool_call
│  gate: admit_batch → PolicySnapshot (parent session row) → allow
│  dispatch_batch → "runtime" backend → task.py handler
│
├── 1. create child session: create_session(source="subagent",
│        parent_session_id=parent, origin="fresh")
│        → child session_gate_state inherits parent's approval_mode
│
├── 2. acquire spawn permit (bounded pool, cap = SUB-04)
│
├── 3. run child turns on the SAME AgentLoop (per-session):
│        run_turn(child_session_id, goal)  [on a pool worker]
│        │  child tool_call → gate: PolicySnapshot (CHILD row,
│        │     agent_kind="sub") → own policy_decision_id  (SUB-02)
│        │  → dispatch_batch → "omp" backend → shared coding core
│        │     (bash spawns tracked per child session)
│        └── child turn closes → typed result envelope (SUB-01)
│
├── 4. steer/kill/restore (SUB-03):
│        steer  → loop.steer(child_session_id, text)
│        kill   → loop.interrupt(child turn) + abort child's in-flight
│                 core calls (by id) + kill child's process tree
│        restore→ Phase 3 resume(child_session_id)
│
└── 5. roll child's session_model_usage into per-child cost record
         on the session row (SUB-04); release spawn permit
```

### Recommended Project Structure
```
packages/halo_agent/halo_agent/
├── tools/backends/
│   └── task.py            # Phase 7: the HALO-owned "task" tool (runtime backend)
│                          #   - spawn child session (create_session source="subagent")
│                          #   - typed result envelope (Pydantic, extra="forbid")
│                          #   - worktree isolation (opt-in, git)
├── loop/
│   ├── child_runner.py    # Phase 7: bounded worker pool (spawn semaphore, SUB-04)
│   │                      #   - acquire/release permit
│   │   - run child turns on the same AgentLoop
│   │   - per-child cost rollup (session_model_usage)
│   └── child_control.py   # Phase 7: steer/kill/restore + orphan cleanup (SUB-_control)
│                          #   - steer → loop.steer(child)
│                          #   - kill → interrupt + core abort + process-tree kill
│                          #   - restore → Phase 3 resume
├── state/
│   └── (Phase 3 store — unchanged; reserved columns wired up)
└── policy/
    └── (Phase 4 gate — unchanged; agent_kind="sub" evaluated per batch)
```

### Pattern 1: HALO-owned `task` backend (B4)
**What:** `task` is a `runtime`-backend tool registered on the `BatchDispatcher` (Phase 4 seam). Its handler creates a child session via `SessionStore.create_session(source="subagent", parent_session_id=<parent>, origin="fresh")` and drives it through the **same** `AgentLoop` and **same** adapter. OMP's `TaskTool` is **unregistered** (EXCLUDE in the Phase 5 invocability table).
**When to use:** Every `task` tool call.
**Why:** B4 (STATE.md) locks this; the Phase 5 invocability table excludes `task` because it "needs agent loop + spawn coordination." The child is a real HALO session in the same store, so it inherits the store's single-writer, admission-FIFO, and resume semantics for free.

### Pattern 2: Typed result envelope (SUB-01)
**What:** The child's final answer is returned to the parent as a typed, `extra="forbid"` Pydantic envelope: `{ status, exit_reason, summary, error, duration_seconds, api_calls, input_tokens, output_tokens, reasoning_tokens, cost_usd, files_read, files_written, worktree?, structured_output? }`. With a structured output schema (OMP `task.structured` / Hermes `output_schema`), the child's final answer is validated against the schema with one bounded retry (Hermes `_validate_child_output_schema`).
**When to use:** Every child completion, failure, timeout, or kill.
**Why:** SUB-01 requires "typed results to the parent." The envelope is the parent-visible contract; a schema-less child degrades to `structured_output=None`.

### Pattern 3: Gate inheritance — no ungoverned child (SUB-02)
**What:** On child creation, the child's `session_gate_state` row is seeded from the parent's row (same `approval_mode`, `allowlist`, `session_grants`). Every child tool call is stamped `agent_kind="sub"` (the Phase 4 `ToolRequest` field, currently `"main"`-only) and evaluated by the **same** per-batch `PolicySnapshot` built from the **child's** row. Each child call gets its own `policy_decision_id` on its `tool_invocations` row.
**When to use:** Every child tool call, in every batch.
**Why:** SUB-02 requires "every child tool call carries its own policy decision and inherits the parent's policy." Inheritance is a one-time row copy at creation (not a live pointer), so a mid-run parent mode change does not silently widen the child; the child's own row is the authority. The deny floor still applies to the child exactly as to the parent (Phase 4: the floor is never a mode input).

### Pattern 4: Configurable isolation (SUB-01)
**What:** Opt-in git-worktree isolation, modeled on Hermes `subagent_worktree.py` and OMP `isolation-runner.ts`. When requested and the parent cwd is a git repo: create `<repo>/.worktrees/subagent-<id>` on branch `halo-subagent/<id>` off the parent HEAD; the child's cwd is seeded to the worktree; on finish, zero-commits-and-clean → pruned, work-left-behind → archived to `refs/halo/archive/<tree>` then pruned (branch kept so the parent can merge), failed probe → kept + flagged. Outside a repo or on failure: silent downgrade to the shared cwd (the worktree payload is flagged `unproven`).
**When to use:** When the `task` call requests isolation (and plan mode is off, per OMP).
**Why:** SUB-01 requires "configurable isolation." Git worktrees are the standard, low-risk mechanism; the silent-downgrade + flagged-payload contract (Hermes `mark_worktree_payload_unproven`) prevents a failed isolation from reading as "the child produced nothing."

### Pattern 5: Steer / kill / restore (SUB-03)
**What:** Reuse the loop's existing per-session controls, keyed by the child `session_id`:
- **steer** → `AgentLoop.steer(child_session_id, text)` (Phase 3: admits `kind='steer'`, folds at the next legal user boundary). Hermes adds a **linearization boundary** (`_merge_late_steer`): steer acceptance closes before the stop signal on the failure path, so a concurrent steer is drained into the result or rejected, never lost.
- **kill** → `AgentLoop.interrupt(child turn)` (Phase 3: cancel token → `dispatch_gate` checkpoint / `dispatch_batch` cancel → `turn.resolve_open_tool_invocations` synthetic results in `call_ordinal` order → `close_turn(reason='interrupted')`) **plus** abort of the child's in-flight core calls (the Phase 5 `abort` command keyed by `id`) **plus** kill of the child's spawned process tree (Pattern 6).
- **restore** → Phase 3 `resume(child_session_id)` (LOOP-03). A killed child's turn is closed `interrupted` with a continuable history, so resume continues from the last closed turn.
**When to use:** On user steer/kill/restore of a live or killed child.
**Why:** SUB-03 requires all three. The loop already owns steer/interrupt/queue per session (Phase 3 plan 08); Phase 7 only adds the core-abort + process-tree-kill half of kill and routes restore through the existing resume.

### Pattern 6: Orphan process + bound-port cleanup (SUB-03)
**What:** The coding core is **shared** between parent and child, so it cannot be killed on child kill. Instead: the core's `bash` tool spawns are tracked **per child session** (a per-session process registry on the Python side, keyed by the child `session_id` / the core call `id`). On child kill, the Python side (a) sends `abort` for the child's in-flight core calls, (b) kills the child's spawned process tree (process-group kill on Windows via the job object / `taskkill /T /F` on the process tree), and (c) closes any bound port the child's processes held (the kill of the process tree releases the port; a post-kill probe confirms the port is free). Hermes reference: `account_background_processes` names the child's background processes on the result **before** `cleanup` kills them; `process_registry.running_owned_by(child_task_id)` is the ownership query.
**When to use:** On every child kill (and on child timeout/abandon).
**Why:** SUB-03 requires "a killed child leaves no orphaned process or bound port." Because the core is shared, per-session ownership + process-tree kill is the only mechanism that cleans the child without orphaning the parent.

### Pattern 7: Concurrency cap + per-child cost (SUB-04)
**What:** A **bounded worker pool** (a spawn semaphore, OMP `#spawnSemaphore` / Hermes `max_concurrent_children`) bounds concurrent child sessions. The cap is a setting (OMP `cfgTaskMaxConcurrency`, default 3; Hermes `_DEFAULT_MAX_CONCURRENT_CHILDREN = 10`), resized in place so a mid-session change applies to new spawns and work already parked in the queue. A recursion-depth cap (OMP `canSpawnAtDepth`, `cfgTaskMaxRecursionDepth` default 2; Hermes `MAX_DEPTH = 1` flat by default) bounds nesting. Per-child cost: the child's `session_model_usage` rows (already written per request by the Phase 3 loop) are rolled up into a per-child cost record on the child session row (tokens + `cost_usd`), and the parent's record carries the per-child rollup.
**When to use:** Every spawn (permit acquire), every completion (permit release + cost rollup).
**Why:** SUB-04 requires "concurrency caps and per-child cost accounting appear in the session record." The semaphore is the cap; the `session_model_usage` rollup is the accounting.

### Anti-Patterns to Avoid
- **Registering OMP's `task` tool in the core:** Rejected by B4 — `task` needs the agent loop + spawn coordination; it is HALO-owned, a `runtime` backend.
- **A second gate or a live policy pointer from parent to child:** Rejected — the child's own `session_gate_state` row is the authority (one-time copy at creation); a live pointer lets a parent mode change silently widen the child.
- **Killing the shared core on child kill:** Rejected — the parent still needs the core; per-session process ownership + process-tree kill is required.
- **Unbounded one-thread-per-child:** Rejected — exhausts the store writer and the core RPC; the semaphore is the cap.
- **Replaying a side-effecting child call after a core crash:** Rejected (Phase 5 Pitfall 3) — on core crash, surface a typed error for the child's in-flight call; do not re-send it.
- **`shell: true` / string argv / `detached` for the worktree or process kill on Windows:** Rejected — AGENTS.md Windows-first; argv arrays, `CREATE_NO_WINDOW`, process-group kill.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Child session creation + lineage | A custom child-session table | `SessionStore.create_session(source="subagent", parent_session_id=…)` | The reserved Phase 3 columns + single writer already provide lineage, resume, and admission. |
| Per-batch policy for the child | A second gate or a per-tool mode check | The Phase 4 `PolicySnapshot` built from the child's `session_gate_state` row, with `agent_kind="sub"` | One gate, one snapshot per batch; the deny floor is never a mode input. |
| Concurrency cap | A home-grown thread limiter | A bounded worker pool / spawn semaphore (OMP `Semaphore` pattern) | Resizable in place; bounds the store writer + core RPC. |
| Worktree isolation | A custom file-copy sandbox | `git worktree add` (Hermes `subagent_worktree.py` pattern) with silent downgrade + flagged payload | Standard, low-risk; the flagged-payload contract prevents a failed isolation from reading as "nothing produced." |
| Orphan process cleanup | Kill the whole core | Per-session process registry + process-tree kill + core `abort` by `id` | The core is shared; per-session ownership is the only clean mechanism. |
| Per-child cost | A custom token counter | The `session_model_usage` rollup (Phase 3 already writes per-request usage) | The accounting is already single-sourced to provider usage; roll it up, don't re-count. |
| Steer / kill / restore | A new control channel | The loop's `steer`/`interrupt`/`enqueue` + Phase 3 `resume` | The loop already owns per-session steer/interrupt/queue; Phase 7 adds only the core-abort + process-tree-kill half. |

**Key insight:** Phase 7 is almost entirely **wiring up reserved seams** (Phase 3 columns, Phase 4 gate, Phase 5 core) plus three new modules (`task.py`, `child_runner.py`, `child_control.py`). The hard parts (single-writer store, per-batch gate, supervised core, resume) already exist. Hand-rolling any of them would create a second authority the invariants forbid.

## Runtime State Inventory

> Phase 7 is a **greenfield feature** (no rename/refactor/migration). No runtime state is renamed or moved. The only state Phase 7 **adds** is: child session rows (`source='subagent'`, `parent_session_id` set), per-child cost rollup rows, and a per-session process registry (in-memory, keyed by child `session_id`). Nothing pre-existing is touched.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None renamed. Phase 7 **adds** child `sessions` rows + cost rollup rows. | Code (additive). |
| Live service config | None. The core is a supervised child, not a service. | None. |
| OS-registered state | None. | None. |
| Secrets / env vars | None. The child inherits the parent's credential context (no new secret surface). | None. |
| Build artifacts | None. No new package. | None. |

## Common Pitfalls

### Pitfall 1: Planning against planned (not landed) seams
**What goes wrong:** The plan quotes Phase 3/4/5 seam shapes as if they are landed code, but `packages/` does not exist yet — Phases 3/4/5 are planned, not executed.
**Why it happens:** The plan documents are detailed and read like landed code.
**How to avoid:** Open the Phase 7 plan with a **Wave-0 task** that re-reads the landed Phase 3/4/5 code and appends a `SEAM-REVALIDATION: …` line (the Phase 4 pattern, `04-DECISIONS.md:90-96`). Gate every Phase 7 task on the re-validated shapes.
**Warning signs:** A Phase 7 task that imports a symbol that does not yet exist in `packages/`.

### Pitfall 2: A live policy pointer from parent to child
**What goes wrong:** The child reads the parent's `approval_mode` live, so a mid-run parent toggle silently widens (or narrows) the child's permissions.
**Why it happens:** "Inherit the parent's policy" is easy to implement as a pointer.
**How to avoid:** Inheritance is a **one-time row copy** at child creation; the child's own `session_gate_state` row is the authority for its lifetime.
**Warning signs:** A child call whose verdict changes when the parent's mode changes mid-run.

### Pitfall 3: Killing the shared core on child kill
**What goes wrong:** Child kill terminates the coding core, orphaning the parent (and any other live child).
**Why it happens:** "Kill the child's processes" is easy to implement as "kill the core."
**How to avoid:** Per-session process ownership + process-tree kill + core `abort` by `id`; the core itself is never killed by a child kill.
**Warning signs:** The parent's next tool call failing with a dead-core error after a child kill.

### Pitfall 4: An ungoverned child (a child call with no policy decision)
**What goes wrong:** A child tool call dispatches without a `policy_decision_id`, so the child executes ungoverned (SUB-02 violation).
**Why it happens:** The child runner bypasses the gate and calls the backend directly.
**How to avoid:** Every child tool call flows through the **same** `admit_batch` → `PolicySnapshot` (child row, `agent_kind="sub"`) → `dispatch_batch` path; a child call with no `policy_decision_id` is a test failure.
**Warning signs:** A `tool_invocations` row for a child call with a NULL `policy_decision_id`.

### Pitfall 5: An orphaned process or bound port after child kill
**What goes wrong:** A killed child's `bash`-spawned process (or bound port) survives the kill.
**Why it happens:** The kill interrupts the loop turn but does not abort the in-flight core call or kill the spawned process tree.
**How to avoid:** Kill = loop interrupt **plus** core `abort` by `id` **plus** process-tree kill; a post-kill probe asserts the process is gone and the port is free.
**Warning signs:** A process or bound port still present after a child kill.

### Pitfall 6: Unbounded child concurrency
**What goes wrong:** One thread per child exhausts the store writer and the core RPC under a large fan-out.
**Why it happens:** "Run each child on its own thread" is the path of least resistance.
**How to avoid:** A bounded worker pool / spawn semaphore (the cap, SUB-04); a spawn beyond the cap parks in the queue.
**Warning signs:** Store-writer contention or core-RPC saturation under a large `task` batch.

## Code Examples

Verified patterns from the in-repo plan documents and the vendored upstream:

### Child session creation + gate inheritance (SUB-01, SUB-02)
```python
# Source: .planning/phases/03-.../03-01-PLAN.md:190 (create_session signature);
#         .planning/phases/04-.../04-06-PLAN.md (session_gate_state row)
child_id = store.create_session(
    source="subagent",            # reserved Phase 3 value
    parent_session_id=parent_id,  # reserved Phase 3 column
    origin="fresh",
)
# Inherit the parent's policy as a ONE-TIME row copy (not a live pointer):
parent_gate = store.get_session_gate_state(parent_id)   # approval_mode, allowlist, session_grants
store.set_session_gate_state(child_id, **parent_gate)   # child's own row is now the authority
```

### Every child tool call is governed (SUB-02)
```python
# Source: .planning/phases/04-.../04-DECISIONS.md (D-G5: ToolRequest agent_kind);
#         .planning/phases/03-.../03-07-PLAN.md (admit_batch -> dispatch_batch)
# The child's turn runs on the SAME loop; each tool call stamps agent_kind="sub":
req = ToolRequest(
    tool_call_uid=…, tool_call_id=…, tool_name=…, args=…, backend="omp",
    session_id=child_id, turn_id=child_turn_id,
    capabilities=…, cwd=…, phase=None,
    agent_kind="sub",            # Phase 7 introduces the "sub" producer
)
snap = build_policy_snapshot(child_id)   # per-batch, from the CHILD row
decision = gate.evaluate(req, snap)       # own policy_decision_id
# A child call with no policy_decision_id is a test failure (Pitfall 4).
```

### Concurrency cap + cost rollup (SUB-04)
```python
# Source: vendor/oh-my-pi/.../task/index.ts:661-672 (per-session semaphore);
#         vendor/hermes-agent/tools/delegate_tool.py (_DEFAULT_MAX_CONCURRENT_CHILDREN = 10)
pool = ChildRunner(max_concurrent=cfg_task_max_concurrency)  # resizable in place
permit = pool.acquire(signal)          # parks beyond the cap
try:
    result = loop.run_turn(child_id, goal)   # SAME AgentLoop, per-session
finally:
    pool.release()
    store.rollup_child_cost(child_id)        # session_model_usage -> per-child record
```

### Kill = interrupt + core abort + process-tree kill (SUB-03)
```python
# Source: .planning/phases/03-.../03-08-PLAN.md (interrupt path);
#         vendor/hermes-agent/tools/delegate_tool_child_run.py (account_background_processes, cleanup)
def kill_child(child_id, in_flight_core_ids, child_process_tree):
    loop.interrupt(child_turn_id)              # Phase 3: synthetic results in call_ordinal order
    for cid in in_flight_core_ids:
        core.abort(cid)                         # Phase 5: abort command keyed by id
    kill_process_tree(child_process_tree)       # Windows: job object / taskkill /T /F
    assert_port_free(child_port)                # post-kill probe (Pitfall 5)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OMP `task` tool in the core | HALO-owned `task` backend (B4) | Phase 7 (this phase) | The child is a real HALO session in the same store; the core supplies tool implementations, never agents. |
| Ungoverned / per-tool child policy | Per-batch `PolicySnapshot` from the child's own row, `agent_kind="sub"` | Phase 7 (this phase) | No child executes ungoverned (SUB-02); the deny floor applies to the child exactly as to the parent. |
| No child lifecycle control | Steer/kill/restore via the loop's per-session controls + core abort + process-tree kill | Phase 7 (this phase) | A killed child leaves no orphaned process or bound port (SUB-03). |
| Unbounded child fan-out | Bounded worker pool / spawn semaphore + recursion-depth cap | Phase 7 (this phase) | Concurrency is capped and per-child cost is recorded (SUB-04). |

**Deprecated/outdated:**
- OMP `TaskTool` in the core: superseded by the HALO-owned `task` backend (B4); it is `EXCLUDE` in the Phase 5 invocability table.

## Assumptions Log

> Claims tagged `[ASSUMED]` that need user confirmation before becoming locked decisions.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `AgentLoop.run_turn` is safe to call concurrently for **different** sessions (per-session state; the store writer thread serializes writes; the loop's shared state — authority, builder, transport, dispatcher — is either stateless or thread-safe). | Pattern 1, Pattern 7 | If `run_turn` has unguarded shared mutable state, concurrent child turns corrupt each other. **Mitigation:** Wave-0 task verifies the landed `AgentLoop` for per-session isolation before the pool is built; if not safe, the pool serializes per-session and the cap bounds the queue, not parallelism. |
| A2 | The coding core's `bash` tool can be made to track spawned processes **per child session** (keyed by the core call `id` / a session tag) so the Python side can kill only the child's process tree. | Pattern 6 | If the core cannot attribute processes to a session, orphan cleanup degrades to "abort the in-flight call" only, and a long-running child process survives the kill (SUB-03 partial). **Mitigation:** Wave-0 task probes the core's `bash` process tracking; if absent, a minimal provenance patch adds per-call process attribution (the Phase 5 patch surface is already minimal). |
| A3 | The child's `session_gate_state` can be seeded from the parent's row with the existing `store.set_session_approval_mode` / `grant_session_pattern` writers (no new writer needed). | Pattern 3 | If a bulk "copy gate row" writer is needed, it is a small additive store method; low risk. |
| A4 | A killed child's turn closes `interrupted` with a continuable history, so Phase 3 `resume(child_session_id)` is a valid "restore." | Pattern 5 | If the interrupt path leaves a non-resumable transcript, restore needs a dedicated path. **Mitigation:** the Phase 3 plan 08 already guarantees a continuable, truthful history after interrupt; Wave-0 verifies. |

## Open Questions

1. **Concurrent `run_turn` safety (A1).**
   - What we know: the loop is per-session; the store has one writer thread; the authority is a singleton.
   - What's unclear: whether `AgentLoop` has unguarded shared mutable state that breaks concurrent per-session `run_turn`.
   - Recommendation: Wave-0 verification task; if not safe, serialize per-session and let the cap bound the queue.

2. **Per-session process attribution in the core (A2).**
   - What we know: the core's `bash` tool spawns processes; the `abort` command is keyed by `id`.
   - What's unclear: whether the core attributes spawned processes to a session/call so the Python side can kill only the child's tree.
   - Recommendation: Wave-0 probe; if absent, a minimal provenance patch adds per-call process attribution.

3. **Default concurrency cap and recursion depth.**
   - What we know: OMP defaults to `maxConcurrency=3`, `maxRecursionDepth=2`; Hermes defaults to `max_concurrent_children=10`, `MAX_DEPTH=1` (flat).
   - What's unclear: HALO's product defaults.
   - Recommendation: adopt OMP's conservative defaults (`3` concurrent, depth `2`) as the recorded default; flag for product confirmation (mirrors the Phase 4 D-G7 pattern of recording, not settling, a default).

4. **Whether a child can spawn its own children (nesting).**
   - What we know: the recursion-depth cap bounds nesting; `agent_kind="sub"` + the depth cap gate it.
   - What's unclear: whether HALO allows a sub to spawn a sub (depth 2) or is flat (depth 1, Hermes default).
   - Recommendation: default to the depth cap (allow nesting up to the cap); the cap is the authority, not a hard flat rule.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.14 | `halo_agent` runtime | ✓ (via uv) | 3.14.7 | — |
| `uv` | `halo_agent` verification | ✓ | 0.12.17 | — |
| `pytest` / `pytest-asyncio` | Test lanes | ✓ (Phase 3 pins) | Phase 3 pins | — |
| `git` | Worktree isolation (SUB-01) | ✓ | 2.55.0.windows.3 | Silent downgrade to shared cwd (Hermes pattern) |
| Bun | Coding core (shared, Phase 5) | ✓ | 1.4.2 | — |
| `cargo` / `rustc` | Core native tools (Phase 5) | ✗ | — | Phase 5 blocker, not a Phase 7 blocker (the Python-side tests use a stub core) |
| `just` | Build orchestration | ✗ | — | Use `bun` scripts directly |

**Missing dependencies with no fallback (BLOCKING):** none for Phase 7 (the `cargo` blocker is a Phase 5 execution prerequisite, worked around by the stub core in the Python-side tests).

**Missing dependencies with fallback:** `just` (use `bun` scripts), `cargo`/`rustc` (stub core for Python-side tests).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `pytest` + `pytest-asyncio` (via `uv run --project packages/halo_agent pytest`) |
| Config file | `packages/halo_agent` pytest config (Phase 3) |
| Quick run command | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/subagent -x` |
| Full suite command | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests -x` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUB-01 | `task` spawns a child session (`source='subagent'`, `parent_session_id` set) and returns a typed result | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/subagent/test_task_spawn.py -x` | ❌ Wave 0 |
| SUB-01 | Configurable isolation: a worktree is created off the parent HEAD; the child cwd is the worktree; on finish it is pruned/archived/flagged | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/subagent/test_isolation.py -x` | ❌ Wave 0 |
| SUB-02 | Every child tool call has a `policy_decision_id`; the child inherits the parent's mode; a parent mid-run mode change does NOT widen the child | integration + DB-constraint | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/subagent/test_child_governance.py -x` | ❌ Wave 0 |
| SUB-03 | Steer a live child (folds at the next user boundary); kill a child (interrupt + core abort + process-tree kill); restore a killed child (resume) | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/subagent/test_steer_kill_restore.py -x` | ❌ Wave 0 |
| SUB-03 | A killed child leaves no orphaned process or bound port (post-kill probe) | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/subagent/test_orphan_cleanup.py -x` | ❌ Wave 0 |
| SUB-04 | Concurrency cap: a fan-out beyond the cap parks in the queue; the cap is resizable in place | integration | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/subagent/test_concurrency_cap.py -x` | ❌ Wave 0 |
| SUB-04 | Per-child cost: the child's `session_model_usage` rolls up into a per-child cost record on the session row | integration + DB-constraint | `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/subagent/test_cost_rollup.py -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests/subagent -x` (the touched subagent test file)
- **Per wave merge:** `uv run --project packages/halo_agent pytest -q packages/halo_agent/tests -x` (full Python suite)
- **Phase gate:** Full Python suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] **Seam re-validation task** (Pitfall 1): re-read the landed Phase 3/4/5 code; append `SEAM-REVALIDATION: loop=<ok|diverged> gate=<ok|diverged> store=<ok|diverged> core=<ok|diverged>` + a `SEAM-DIVERGENCE:` line per mismatch. **This is the first task of the phase.**
- [ ] **A1 verification:** confirm `AgentLoop.run_turn` is safe for concurrent per-session calls (or serialize per-session).
- [ ] **A2 probe:** confirm the core's `bash` tool attributes spawned processes per session/call (or add a minimal provenance patch).
- [ ] `packages/halo_agent/tests/subagent/conftest.py` — shared fixtures: a parent session, a child session, a stub core, a killable child process, a bound-port probe.
- [ ] `packages/halo_agent/tests/subagent/test_task_spawn.py` — covers SUB-01 (spawn + typed result).
- [ ] `packages/halo_agent/tests/subagent/test_isolation.py` — covers SUB-01 (worktree isolation).
- [ ] `packages/halo_agent/tests/subagent/test_child_governance.py` — covers SUB-02 (per-call decision + inheritance + no live pointer).
- [ ] `packages/halo_agent/tests/subagent/test_steer_kill_restore.py` — covers SUB-03 (steer/kill/restore).
- [ ] `packages/halo_agent/tests/subagent/test_orphan_cleanup.py` — covers SUB-03 (no orphaned process/port).
- [ ] `packages/halo_agent/tests/subagent/test_concurrency_cap.py` — covers SUB-04 (cap + resizable).
- [ ] `packages/halo_agent/tests/subagent/test_cost_rollup.py` — covers SUB-04 (per-child cost).

## Security Domain

> `security_enforcement` is enabled (absent = enabled); ASVS L1; block on high.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | The child is an in-process HALO session; no external auth. The core handshake (Phase 2/5) is a contract-hash check, not authentication. |
| V3 Session Management | yes | The child session is a real store row (`source='subagent'`, `parent_session_id`); its lifecycle (steer/kill/restore) is owned by the loop; the per-session process registry is the child's process authority. |
| V4 Access Control | yes | The Phase 4 `PolicyGate` is the single access-control point; the child's own `session_gate_state` row + `agent_kind="sub"` is evaluated per batch; the deny floor applies to the child exactly as to the parent. No child executes ungoverned (SUB-02). |
| V5 Input Validation | yes | The `task` tool args are validated at the `ToolCallIn` boundary (Phase 3, `extra="forbid"`); the structured output schema is validated with one bounded retry; the worktree payload is flagged `unproven` on a failed probe. |
| V6 Cryptography | yes | No new crypto. The core `CONTRACT_HASH` (Phase 2) is unchanged; never hand-roll canonicalization. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| An ungoverned child (a child call with no policy decision) | Elevation of privilege | Every child call flows through `admit_batch` → `PolicySnapshot` (child row, `agent_kind="sub"`) → `dispatch_batch`; a child call with no `policy_decision_id` is a test failure (Pitfall 4). |
| A live parent→child policy pointer (a parent mode change widens the child) | Elevation of privilege | Inheritance is a one-time row copy at creation; the child's own row is the authority (Pitfall 2). |
| A child kill that orphans a process or bound port | Tampering / Denial of service | Kill = loop interrupt + core `abort` by `id` + process-tree kill; a post-kill probe asserts the process is gone and the port is free (Pitfall 5). |
| A child kill that kills the shared core (orphaning the parent) | Denial of service | Per-session process ownership; the core is never killed by a child kill (Pitfall 3). |
| Unbounded child fan-out (store-writer / core-RPC exhaustion) | Denial of service | A bounded worker pool / spawn semaphore (the cap, SUB-04); a spawn beyond the cap parks in the queue (Pitfall 6). |
| A replayed side-effecting child call after a core crash | Tampering | On core crash, surface a typed error for the child's in-flight call; do not re-send it (Phase 5 Pitfall 3). |
| A `git worktree add` that runs a malicious repo hook | Tampering | The worktree git runs with a hardened, non-interactive env (Hermes `harden_git_argv` / `noninteractive_git_env` pattern); a failed probe degrades to a flagged `unproven` payload, never a silent pass. |
| Path traversal via a child tool `args` path | Tampering / Information disclosure | The Phase 4 `PolicyGate` validates `fs.*` capabilities and `cwd` against the per-turn workspace-roots snapshot; the child's worktree cwd is the isolation boundary. |

## Sources

### Primary (HIGH confidence — read directly this session)
- `vendor/hermes-agent/tools/delegate_tool.py` — `_build_child_agent`, `_run_single_child`, `_DEFAULT_MAX_CONCURRENT_CHILDREN = 10`, `MAX_DEPTH = 1`, `_subagent_auto_deny`, `delegation.worktree_isolation`, `delegation.max_spawn_depth`, `delegation.orchestrator_enabled`.
- `vendor/hermes-agent/tools/delegate_tool_dispatch.py` — the dispatch/heartbeat wiring.
- `vendor/hermes-agent/tools/delegate_tool_child_run.py` — `_ChildRun` lifecycle (seed → await → cleanup), `account_background_processes`, `process_registry.running_owned_by`, `_validate_child_output_schema`, `_merge_late_steer`, `emit_complete` (cost rollup), `cleanup` (idempotent teardown order).
- `vendor/hermes-agent/tools/subagent_worktree.py` — `create_subagent_worktree`, `mark_worktree_payload_unproven`, the hardened-git-env pattern.
- `vendor/hermes-agent/website/docs/developer-guide/subagent-lifecycle-api.md` — the public subagent lifecycle API (launch request, handle, states, steer/cancel/wait/result/reconnect).
- `vendor/oh-my-pi/packages/coding-agent/src/task/index.ts` — `TaskTool`, `#spawnSemaphore` / `SpawnPermit`, `canSpawnAtDepth`, `cfgTaskMaxConcurrency`, `cfgTaskMaxRecursionDepth`, `cfgTaskMaxRuntimeMs`, `cfgTaskIsolationEnabled`, the structured result contract.
- `vendor/oh-my-pi/packages/coding-agent/src/task/settings.ts` — the `task.*` setting definitions.
- `vendor/oh-my-pi/packages/coding-agent/src/task/isolation-runner.ts` — the worktree isolation runner.
- `vendor/oh-my-pi/packages/coding-agent/src/task/persisted-revive.ts` — the restore/revive path (taskDepth derived from the persisted parent chain).
- `vendor/oh-my-pi/packages/coding-agent/src/task/structured-subagent.ts` — the structured output schema + depth/spawn preflight.
- `.planning/phases/03-.../03-RESEARCH.md` — the reserved schema columns (`sessions.source='subagent'`, `parent_session_id`, `turn_background_work.kind='task'`, `session_admissions.kind='steer'`, `session_model_usage`, `tool_invocations.policy_decision_id`).
- `.planning/phases/03-.../03-01-PLAN.md` — `SessionStore.create_session(*, source, model=None, origin="fresh", parent_session_id=None, session_id=None)`.
- `.planning/phases/03-.../03-07-PLAN.md` — `ToolRequest` / `ToolResultEnvelope` / `BatchDispatcher` / `register_backend` / `PHASE3_BACKEND`.
- `.planning/phases/03-.../03-08-PLAN.md` — `AgentLoop.steer` / `interrupt` / `enqueue` / `drain_queue`; the interrupt path (`resolve_open_tool_invocations`, synthetic results in `call_ordinal` order).
- `.planning/phases/04-.../04-06-PLAN.md` — `session_gate_state`, `PolicySnapshot` per batch, `set_session_approval_mode`, `grant_session_pattern`, the deny floor.
- `.planning/phases/04-.../04-DECISIONS.md` — D-G5 (`ToolRequest.agent_kind="main"`, "the only producer until Phase 7"), D-G7 (default mode), the seam re-validation pattern.
- `.planning/phases/05-.../05-RESEARCH.md` — the `omp` backend supervisor, the `abort` command keyed by `id`, the `task` EXCLUDE in the invocability table, the Windows spawn rule.
- `AGENTS.md` — Windows-first, TDD, the provenance/patch model for `vendor/`.

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — decision B4 (HALO-owned `task`), the single-loop / single-gate / single-store invariants.
- `.planning/REQUIREMENTS.md` — SUB-01..04.
- `.planning/ROADMAP.md` — the Phase 7 section + the Phase 3/4/5 landed-seam descriptions.

### Tertiary (LOW confidence)
- None. All load-bearing claims are codebase-grounded (Primary) or plan-grounded (Secondary).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new package; the Phase 3/4/5 stack + `git` were verified directly.
- Architecture: HIGH — the reserved schema columns, the gate seam, the core seam, and the upstream subagent references were all read from source/plan this session.
- Pitfalls: HIGH — each pitfall maps to a verified invariant (single loop/gate/store) or an AGENTS.md rule.

**Research date:** 2026-10-25
**Valid until:** ~30 days (the vendored core is pinned; the Phase 3/4/5 prerequisites landing is the main invalidation risk — the Wave-0 seam re-validation is the mitigation).
