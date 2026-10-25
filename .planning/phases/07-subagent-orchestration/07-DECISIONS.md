# Phase 7 — Subagent Orchestration: Recorded Decisions

**Recorded:** 2026-10-25 by the phase planner.
**Why this file exists:** Phase 7 has no `CONTEXT.md` — the user chose to plan from
`07-RESEARCH.md` + requirements only. Every fork RESEARCH left open is therefore adopted here
from the research recommendation and recorded as one grep-checkable line, so no fork is
silently defaulted. Each plan's `<automated>` gate greps the line it depends on. A line is
authoritative for the whole phase; re-opening one requires editing this file first and
re-running every plan that cites it.

## Adopted forks

D-G7-A1: verify-concurrent-run-turn
  Whether `AgentLoop.run_turn` is safe for concurrent per-session calls (one child per
  session, the shared loop driving many sessions at once). Adopted: **verify in Wave 0**
  (plan 07-01, task 1) by reading the landed `run_turn` for shared mutable state (a single
  `runtime_epoch`, a single `admissions` writer, a single `store` connection) and by running
  two child sessions' turns concurrently in the tracer test. If `run_turn` is NOT safe for
  concurrent per-session calls, the fallback is **serialize per session**: the spawn
  semaphore (D-G7-cap) bounds the queue and each session's turns run one at a time, so the
  shared loop is never driven by two sessions in the same instant. The fallback is recorded
  as a `SEAM-DIVERGENCE:` line in this file at execution. Flagged, not settled by the user:
  if the product wants true concurrent per-session turns, the loop's shared state must be
  made per-session; that is a Phase 3 change, not a Phase 7 one.

D-G7-A2: probe-bash-process-attribution
  Whether the core's `bash` tool can attribute spawned processes to a session/call for
  orphan cleanup (SUB-03). Adopted: **probe in Wave 0** (plan 07-01, task 1) by reading the
  landed core `bash` tool for a per-session process group or a session-keyed process table.
  If the core CANNOT attribute spawned processes to a session/call, the fallback is a
  **minimal provenance patch** in `vendor/oh-my-pi/provenance/patches/` (the Phase 5
  hand-maintained series, four-header format) that tags each spawned process with the
  invoking session id so the per-session process-tree kill (SUB-03) can find and reap it.
  The patch is recorded as a `SEAM-DIVERGENCE:` line in this file at execution. Flagged,
  not settled by the user: if the product wants the core to own process attribution natively,
  the patch is the minimal path; a core-side change is a vendor change, not a HALO one.

D-G7-cap: cap-3-depth-2
  Default concurrency cap and recursion depth. Adopted from OMP's conservative defaults
  (`07-RESEARCH.md`): **3 concurrent children, recursion depth 2** (a main session may spawn
  up to 3 children; a child at depth 1 may spawn up to 3 grandchildren; a session at depth 2
  may not spawn). The cap is a bounded worker pool / spawn semaphore (OMP `#spawnSemaphore`
  + `parallel.ts` `Semaphore` analog); the depth cap is enforced at spawn by reading the
  child's `parent_session_id` chain. Rejected alternative: Hermes' default 10 concurrent —
  too permissive for a shared core; 3 bounds the queue and the process tree.

D-G7-nesting: allow-sub-spawns-to-depth-cap
  Whether a child session may itself spawn children (nesting). Adopted: **allow sub-spawns
  up to the depth cap** (D-G7-cap, depth 2). A child at depth 1 may call `task` and spawn
  grandchildren at depth 2; a session at depth 2 may not. Rejected alternative: flat (Hermes
  default) — a child may never spawn; this loses the recursive-delegation capability the
  depth cap was designed to bound. The depth cap is the safety mechanism; flat is the
  degenerate case of it.

## Interpreter pin (conditional, appended at execution)

`D-PYTHON:` follows Phase 3's escape hatch (`03-01-PLAN.md:204`, `04-RESEARCH.md:502`).
AGENTS.md pins Python 3.14.9; this workstation's uv can fetch only 3.14.7. The rule: if the
resolved interpreter for `uv run --project packages/halo_agent` is not exactly 3.14.9, append
one line `D-PYTHON: <resolved-version> <source>` to this file in plan 07-01. No verify
command greps this line, because the pin resolving correctly must not fail a gate.

## Seam re-validation (appended at execution by plan 07-01, task 1)

Phase 7's quoted seam shapes are 03/04/05's *planned* shapes; Phases 3-5 are authored but
unexecuted at planning time (no `packages/` dir exists yet). Plan 07-01 runs the landed-code
checks first and appends one
`SEAM-REVALIDATION: loop=<ok|diverged> gate=<ok|diverged> store=<ok|diverged> core=<ok|diverged>`
line plus a `SEAM-DIVERGENCE: <file> <observation>` line per mismatch before any Phase 7
edit lands. The same task probes D-G7-A1 (concurrent `run_turn`) and D-G7-A2 (bash process
attribution) and records the outcome as a `SEAM-DIVERGENCE:` line when the fallback applies.
