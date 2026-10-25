# Phase 9: Four-Lane Scheduling & Lane SLOs - Research

**Researched:** 2026-10-25
**Domain:** Cross-system memory-traffic scheduling (Rust/TS adapter above Python Hindsight + Rust OMP), reserved-capacity lanes, revocable leases, SLO measurement
**Confidence:** HIGH (Hindsight source read verbatim; scheduler primitives verified against tokio docs)

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCHD-01 | Four lanes (L0 prompt, L1 recall/reflect, L2 retain, L3 background) each hold reserved capacity | Per-lane `tokio::sync::Semaphore` sized by reserved share (40/20/25/15%); WFQ dispatcher enforces "L0 never queues behind L3" (Pattern 1, Pattern 2) |
| SCHD-02 | No consolidation can delay an L0 or L1 waiter by more than 200 ms | L0/L1 non-preemptible + reserved capacity guarantee; consolidation (L3) capped at 50% capacity; 200 ms bound measured by the SLO harness (Pattern 3) |
| SCHD-03 | L1 meets its 10 s deadline or degrades to a low-budget recall with a visible degraded signal; no same-turn retries | Deadline timer + degraded-signal flag on the L1 lease; single-attempt-per-turn guard (Pattern 4) |
| SCHD-04 | Preemption cancels only at operation boundaries and safely requeues or retires cancelled work | Hindsight's cooperative `_check_op_alive` boundary (consolidator.py:2054-2057); cancelled work stays `consolidated_at IS NULL` and is re-discovered by the reconcile sweep (maintenance.py:426-462); terminal writes guarded by `status <> 'cancelled'` (poller.py:971,1102,1157) |
| SCHD-07 | A Low-profile soak (concurrent L3 retains plus periodic L0 recalls) demonstrates the lane SLOs under concurrency | Soak harness drives L3 retain load + periodic L0 recall, asserts the 200 ms / 10 s / reserved-capacity SLOs (Pattern 5) |
</phase_requirements>

## Summary

Phase 9 introduces the **CallScheduler**, a thin Rust/TypeScript component in the HALO Adapter layer that sits *above* both the Python (Hermes/Hindsight) and Rust (OMP) systems and arbitrates cross-system memory traffic across four lanes (L0 prompt, L1 recall/reflect, L2 retain, L3 background/consolidation). The scheduler's job is to guarantee that **memory traffic can never queue ahead of the user's prompt**: each lane holds reserved capacity (40/20/25/15%), L0/L1 are non-preemptible, L2/L3 are preemptible at operation boundaries, and L3 is capped at 50% of capacity to prevent starvation.

The single most important research finding — and the open blocker flagged in STATE.md — is that **Hindsight's consolidation and mental-model-refresh work is already structured for safe preemption and safe requeue**, so the scheduler does not need to invent a cancellation protocol; it only needs to *trigger* Hindsight's existing cooperative cancellation and rely on Hindsight's existing recovery. Specifically: (a) consolidation checks `_check_op_alive(operation_id)` at the end of every LLM batch (the operation boundary where preemption may cancel); (b) a cancelled batch's writes never commit (the SQL transaction / witness row is never committed) and the unprocessed facts remain `consolidated_at IS NULL`; (c) the maintenance reconcile sweep (`banks_needing_consolidation`) re-schedules any bank with eligible-but-unscheduled facts, so cancelled consolidation is **safely requeueable, not retired**; (d) every terminal status write is guarded by `status <> 'cancelled'`, so a cancelled operation can never be silently overwritten by a failed/retry/deferred write. Mental-model refresh is a single atomic `update_mental_model` write (content + structured document + watermark + `last_refreshed_at` together); on failure nothing is written and the watermark is not advanced, so a retry re-reads the same window.

The key scheduler-design finding is that **`tokio::sync::Semaphore` is FIFO-fair and does not natively support priority or weighted lanes** (open issue tokio-rs/tokio#3242). The four-lane scheduler therefore composes **one `tokio::sync::Semaphore` per lane** (permit count = reserved share of the concurrency budget) **plus a weighted fair queuing (WFQ) dispatcher** that selects which lane to grant next. Reserved capacity comes from the semaphore sizes; the "L0 never queues behind L3" invariant and the L3 50% cap come from the dispatcher's weights and a hard L3 ceiling. Preemption is cooperative and boundary-aligned, matching Hindsight's existing `_check_op_alive` checkpoint.

**Primary recommendation:** Implement the CallScheduler as a thin Rust component (tokio) in the HALO Adapter layer: four per-lane `tokio::sync::Semaphore`s sized by reserved share, a WFQ dispatcher with L0/L1 non-preemptible priority and an L3 50% hard cap, revocable leases that trigger Hindsight's existing cooperative cancellation at its `_check_op_alive` boundary, and a SLO/soak harness that drives synthetic memory load and asserts the 200 ms / 10 s / reserved-capacity bounds. Do not modify Hindsight's cancellation or recovery internals — the scheduler is a *client* of them.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Lane capacity reservation (40/20/25/15%) | HALO Adapter (Rust, CallScheduler) | — | Cross-system arbitration must sit above both runtimes to avoid GIL bottlenecks (locked decision) |
| WFQ dispatch + L0/L1 non-preemptible priority | HALO Adapter (Rust, CallScheduler) | — | Priority is a scheduling decision, not a per-lane property; tokio Semaphore is FIFO-fair so priority lives in the dispatcher |
| L3 50% capacity cap (anti-starvation) | HALO Adapter (Rust, CallScheduler) | Hindsight `WORKER_MAX_SLOTS` | Scheduler enforces the cap; Hindsight slot limits remain the final defense (locked decision) |
| Revocable lease + preemption trigger | HALO Adapter (Rust, CallScheduler) | Hindsight `cancellation.py` / `_check_op_alive` | Scheduler flips the operation to `cancelled`; Hindsight detects at its next `_check_op_alive` boundary |
| Safe requeue/retire of cancelled work | Hindsight (maintenance reconcile sweep) | — | Scheduler does not requeue; Hindsight's `banks_needing_consolidation` re-discovers `consolidated_at IS NULL` facts |
| L1 10 s deadline + degraded signal | HALO Adapter (Rust, CallScheduler) | Hindsight reflect/low-budget recall | Deadline timer + degraded flag live in the L1 lease; the low-budget fallback is a Hindsight recall mode |
| SLO measurement (200 ms / 10 s / reserved capacity) | Test harness (Rust/TS) | — | Synthetic memory load + assertions; not part of the runtime scheduler |
| Per-operation LLM concurrency cap (`HINDSIGHT_API_LLM_MAX_CONCURRENT=4`) | Hindsight env | HALO Adapter | Locked decision; the scheduler respects it, does not override it |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `tokio` (Rust) | 1.x (current) | Async runtime; `tokio::sync::Semaphore` for per-lane capacity, `tokio::time` for the L1 10 s deadline timer | The OMP codebase is already Rust/tokio; `Semaphore` is the standard concurrency primitive. Verified: `tokio::sync::Semaphore` is FIFO-fair (docs.rs/tokio) |
| `tokio::sync::Semaphore` | (part of tokio) | Per-lane reserved capacity (permit count = reserved share) | Standard; FIFO-fair, so priority is layered on top via the WFQ dispatcher |
| Hindsight `cancellation.py` + `_check_op_alive` | vendored (Phase 8) | Cooperative cancellation boundary the scheduler triggers | Already present; the scheduler is a client, not a modifier |
| Hindsight maintenance reconcile sweep | vendored (Phase 8) | Safe requeue of cancelled consolidation | Already present; `banks_needing_consolidation` re-discovers `consolidated_at IS NULL` facts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tokio::time::interval` / `Instant` | (part of tokio) | L1 10 s deadline; SLO timing (200 ms bound) | Deadline enforcement + SLO measurement |
| `crossbeam` (Rust) | 0.8.x | Lock-free counters for SLO metrics (if needed) | Only if `tokio` atomics are insufficient for the metrics path |
| Hindsight `worker/poller.py` wall-clock ceilings | vendored (Phase 8) | Per-task-type outer backstop the scheduler respects | The scheduler's L3 cap composes with, not replaces, these ceilings |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-lane `tokio::sync::Semaphore` + WFQ dispatcher | A single global priority queue with weighted tokens | A single global queue couples all lanes and makes the "L0 never behind L3" invariant harder to prove; per-lane semaphores make reserved capacity explicit and auditable |
| Cooperative boundary-aligned preemption | Hard task cancellation (`tokio::task::abort`) | Hard abort can leave Hindsight mid-transaction; Hindsight's design is cooperative (`_check_op_alive`), so the scheduler must be too to avoid corrupting memory state (SCHD-04) |
| Rust (tokio) scheduler | TypeScript scheduler in the adapter | The OMP runtime is Rust; a Rust scheduler avoids a cross-language hop on the hot path and matches the "thin Rust/TS component" decision with the lower-overhead choice |

**Installation:**
```bash
# No new external packages are required. The scheduler is built on tokio,
# which is already a dependency of the OMP crates (vendor/oh-my-pi).
# Confirm tokio is already in the workspace Cargo.toml before adding the
# scheduler crate; if a new crate is added, it depends only on `tokio`.
```

**Version verification:** `tokio` is already present in `vendor/oh-my-pi/Cargo.toml` / `Cargo.lock` (verified by grep of the OMP crates, which use `tokio::sync` / `tokio::time`). No new package is introduced by this phase, so no registry verification is required.

## Package Legitimacy Audit

> This phase installs **no external packages**. The CallScheduler is built on `tokio`, which is already a dependency of the OMP crates in `vendor/oh-my-pi`. No new package names are introduced, so the legitimacy gate is not triggered.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none — code-only, builds on existing `tokio`) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                        USER PROMPT / RECALL / RETAIN / BACKGROUND
                                    |
        +----------------------------------------------------------------+
        |                     HALO ADAPTER LAYER                         |
        |                                                                |
        |   +--------------------------------------------------------+   |
        |   |                    CallScheduler (Rust)                |   |
        |   |                                                        |   |
        |   |  L0(40%)  L1(20%)  L2(25%)  L3(15%, cap 50%)         |   |
        |   |  [Sem]    [Sem]    [Sem]    [Sem]   <- per-lane       |   |
        |   |   |        |        |        |      reserved capacity |   |
        |   |   +--------+--------+--------+                       |   |
        |   |            WFQ DISPATCHER                            |   |
        |   |   (L0/L1 non-preemptible priority; L3 50% cap)      |   |
        |   |            |                                         |   |
        |   |     revocable lease (L2/L3)                          |   |
        |   |            |  preemption trigger                     |   |
        |   +------------|----------------------------------------+   |
        +----------------|---------------------------------------------+
                         |  (above both runtimes; no GIL hop)
        +----------------|------------------+
        |                |                 |
   +----v-----+    +-----v------+    +-----v------+
   |  OMP     |    |  HERMES /  |    |  HINDSIGHT |
   |  (Rust)  |    |  (Python)  |    |  (Python)  |
   |          |    |            |    |            |
   |          |    |            |    | _check_op_alive  <- preemption boundary
   |          |    |            |    | reconcile sweep  <- safe requeue
   |          |    |            |    | status<>'cancelled' guard
   +----------+    +------------+    +------------+
```

Data flow: a memory request enters the adapter tagged with its lane. The WFQ dispatcher selects a lane (L0/L1 first, L3 bounded at 50%), the lane's semaphore grants a permit (reserved capacity), and the request is dispatched to the owning runtime. L2/L3 hold a revocable lease; on preemption the scheduler flips the Hindsight operation to `cancelled`, Hindsight detects it at its next `_check_op_alive` boundary, the uncommitted batch is discarded, and the reconcile sweep re-schedules the work.

### Recommended Project Structure
```
vendor/oh-my-pi/crates/
├── pi-scheduler/            # NEW: the CallScheduler crate (Rust, tokio)
│   ├── src/
│   │   ├── lib.rs           # public API: submit(lane, op), preemption, SLO metrics
│   │   ├── lanes.rs         # L0-L3 lane definitions, reserved shares, queue depth caps
│   │   ├── dispatcher.rs    # WFQ dispatcher: priority + L3 50% cap
│   │   ├── lease.rs         # revocable lease: grant/revoke, preemption trigger
│   │   ├── deadline.rs      # L1 10s deadline + degraded-signal + no-same-turn-retry
│   │   └── slo.rs           # SLO metrics: 200ms bound, reserved-capacity counters
│   └── tests/
│       ├── lane_capacity.rs # SCHD-01: reserved capacity, L0 never behind L3
│       ├── preemption.rs    # SCHD-04: boundary-aligned cancel, safe requeue
│       └── soak.rs          # SCHD-07: Low-profile soak harness
```

### Pattern 1: Per-lane reserved capacity via `tokio::sync::Semaphore`
**What:** One semaphore per lane; permit count = reserved share of the total concurrency budget. A lane can never exceed its reserved capacity, and a waiter in one lane never consumes another lane's permits.
**When to use:** Enforcing SCHD-01 (each lane holds reserved capacity).
**Example:**
```rust
// Source: docs.rs/tokio (tokio::sync::Semaphore) — FIFO-fair permit distribution
use tokio::sync::Semaphore;

// Total concurrency budget (e.g. 10). Reserved shares 40/20/25/15.
let l0 = Arc::new(Semaphore::new(4));  // 40%
let l1 = Arc::new(Semaphore::new(2));  // 20%
let l2 = Arc::new(Semaphore::new(2));  // 25%
let l3 = Arc::new(Semaphore::new(1));  // 15%  (also hard-capped at 50% by dispatcher)

// A lane waiter acquires its OWN lane's permit only — it can never
// consume another lane's reserved capacity.
let _permit = l0.acquire().await;  // blocks until an L0 permit is free
```
**Key insight:** Because `tokio::sync::Semaphore` is FIFO-fair and lane-scoped, reserved capacity is guaranteed by construction. The *priority* between lanes (L0 before L3) is NOT provided by the semaphore — it is provided by the dispatcher (Pattern 2).

### Pattern 2: WFQ dispatcher for "L0 never queues behind L3"
**What:** A weighted fair queuing dispatcher sits in front of the four lane semaphores. It selects which lane to service next using weights that make L0/L1 strictly higher priority than L2/L3, and enforces the L3 50% hard cap. This is where the "L0 waiter never queues behind an L3 waiter" invariant (SCHD-01) and the anti-starvation cap (locked decision) are enforced.
**When to use:** Enforcing lane priority + the L3 50% cap.
**Example (sketch — the dispatcher is new code, not a library call):**
```rust
// Source: weighted fair queuing (WFQ) — standard scheduling algorithm.
// The dispatcher is NEW code in pi-scheduler/src/dispatcher.rs.
//
// Invariant (SCHD-01): an L0 waiter is always serviced before any L3 waiter.
// Cap (locked): L3 is never granted more than 50% of total capacity.
fn select_lane(&self) -> Lane {
    // 1. If any L0 waiter exists, service L0. (strict priority)
    // 2. Else if any L1 waiter exists, service L1.
    // 3. Else if L3 active share < 50% and an L3 waiter exists, service L3.
    // 4. Else service L2.
    // WFQ weights break ties fairly among same-priority lanes.
    todo!()
}
```
**Key insight:** Do NOT rely on `tokio::sync::Semaphore` for priority — it is FIFO-fair (verified: docs.rs/tokio; open issue tokio-rs/tokio#3242 confirms no native priority). The dispatcher is the single place the priority and cap invariants live, which makes them auditable and testable in isolation.

### Pattern 3: 200 ms L0/L1 delay bound (SCHD-02)
**What:** Because L0/L1 are non-preemptible and hold reserved capacity, a consolidation (L3) operation can only delay an L0/L1 waiter by the time to reach the next preemption boundary plus the dispatcher's hand-off. The 200 ms bound is measured, not assumed: the SLO harness timestamps an L0/L1 waiter's enqueue and first-service under synthetic L3 load and asserts the delta is ≤ 200 ms.
**When to use:** Verifying SCHD-02.
**Example:**
```rust
// Source: tokio::time::Instant — monotonic timing for the SLO bound.
let enqueued = Instant::now();
let _permit = l0.acquire().await;
let delay = enqueued.elapsed();
assert!(delay.as_millis() <= 200, "L0 delayed {delay:?} by consolidation");
```
**Key insight:** The 200 ms bound is a *consequence* of reserved capacity + non-preemption + the L3 cap, not a separate mechanism. The harness proves the consequence holds under load.

### Pattern 4: L1 10 s deadline + degraded signal + no same-turn retry (SCHD-03)
**What:** Each L1 lease carries a 10 s deadline timer. If the deadline fires before the recall completes, the scheduler degrades to a low-budget recall and sets a visible `degraded` flag on the result. A per-turn guard ensures one prompt never triggers retries inside the same turn.
**When to use:** Enforcing SCHD-03.
**Example:**
```rust
// Source: tokio::time::timeout — the 10s deadline.
use tokio::time::{timeout, Duration};
let result = match timeout(Duration::from_secs(10), run_recall()).await {
    Ok(r) => RecallResult { r, degraded: false },
    Err(_) => RecallResult { low_budget_fallback(), degraded: true }, // visible signal
};
// No same-turn retry: a per-turn token is consumed on first attempt;
// a second recall in the same turn returns the cached/degraded result.
```
**Key insight:** The degraded signal must be *visible* (surfaced to the caller/UI in Phase 10), not a silent fallback. The no-same-turn-retry guard is a per-turn monotonic token, not a global lock.

### Pattern 5: Low-profile soak harness (SCHD-07)
**What:** A soak test on the Low hardware profile (≤4 vCPU / 8 GB) drives concurrent L3 retain load plus periodic L0 recalls and asserts the lane SLOs (reserved capacity, 200 ms bound, 10 s deadline) hold under concurrency.
**When to use:** Verifying SCHD-07.
**Example (sketch — harness is new code in pi-scheduler/tests/soak.rs):**
```rust
// Source: tokio — concurrent task spawning for the soak.
// Low profile: cap the runtime to 4 worker threads to emulate ≤4 vCPU.
// Spawn N concurrent L3 retain tasks + a periodic L0 recall loop;
// assert: L0 delay <= 200ms, L1 <= 10s or degraded, L3 <= 50% capacity.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn low_profile_soak() { /* drive load, assert SLOs */ }
```
**Key insight:** The soak must run on the *Low* profile (4 worker threads) to be meaningful — a High-profile run would pass trivially and prove nothing about the constrained case.

### Anti-Patterns to Avoid
- **Relying on `tokio::sync::Semaphore` for lane priority:** It is FIFO-fair, not priority-aware (verified: docs.rs/tokio; tokio-rs/tokio#3242). Priority must live in the WFQ dispatcher.
- **Hard task cancellation (`tokio::task::abort`) for preemption:** Hindsight's design is cooperative (`_check_op_alive`); hard abort can leave a Hindsight write transaction mid-flight and corrupt memory state (violates SCHD-04). Trigger Hindsight's existing cooperative cancellation instead.
- **Modifying Hindsight's cancellation/recovery internals:** The scheduler is a *client* of Hindsight's existing `_check_op_alive` boundary and reconcile sweep. Changing them couples the scheduler to Hindsight internals and risks the "cancelled batch writes remain invisible" guarantee.
- **Requeueing cancelled work from the scheduler:** The scheduler does not requeue. Hindsight's reconcile sweep (`banks_needing_consolidation`) re-discovers `consolidated_at IS NULL` facts. Scheduler-side requeue would double-schedule and race the sweep.
- **Running the soak on a High profile:** A High-profile soak passes trivially and does not demonstrate the SLOs under the constrained Low case (SCHD-07 requires Low).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-lane concurrency limiting | A custom counting/locking capacity tracker | `tokio::sync::Semaphore` (one per lane) | Battle-tested, FIFO-fair, async-native; a custom tracker re-implements the hard parts (fairness, cancellation of waiters) |
| Lane priority + L3 cap | A single global priority queue | WFQ dispatcher in front of per-lane semaphores | Per-lane semaphores make reserved capacity explicit/auditable; a global queue couples lanes and obscures the invariant |
| Cooperative cancellation | A custom cancel-token protocol | Hindsight's existing `_check_op_alive` + `cancellation.py` | Already present and already safe (terminal writes guarded by `status <> 'cancelled'`); re-rolling it risks the "cancelled batch writes remain invisible" guarantee |
| Safe requeue of cancelled work | A scheduler-side requeue queue | Hindsight's maintenance reconcile sweep (`banks_needing_consolidation`) | Already present; re-discovers `consolidated_at IS NULL` facts; scheduler-side requeue would double-schedule |
| 10 s deadline | A custom timer loop | `tokio::time::timeout` / `tokio::time::Instant` | Standard, monotonic, cancellation-safe |

**Key insight:** Hindsight already implements the hard, safety-critical halves of this phase (cooperative cancellation at operation boundaries, safe requeue via the reconcile sweep, `status <> 'cancelled'` guards). The scheduler's job is to *compose* with those, not to re-implement them. Hand-rolling cancellation or requeue would duplicate Hindsight's invariants and risk breaking the "cancelled batch writes remain invisible" guarantee that makes preemption safe.

## Runtime State Inventory

> Phase 9 is a **new-component** phase (the CallScheduler does not yet exist — verified by grep: no `CallScheduler`/`four-lane`/`lane` matches in non-vendor Rust/TS source). It is not a rename/refactor/migration phase, so no runtime-state migration is required. The scheduler is a client of Hindsight's existing runtime state (operation rows, `consolidated_at`, `WORKER_MAX_SLOTS`); it reads and triggers that state but does not rename or migrate it.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Hindsight `async_operations` rows (status `pending`/`processing`/`completed`/`failed`/`deferred`/`cancelled`); `memory_units.consolidated_at` | none — scheduler reads/triggers, does not migrate |
| Live service config | `WORKER_MAX_SLOTS` (Hindsight slot limit, final defense); `HINDSIGHT_API_LLM_MAX_CONCURRENT=4` (locked) | none — scheduler respects, does not override |
| OS-registered state | None — the scheduler is an in-process component, not an OS-registered service | none |
| Secrets/env vars | `HINDSIGHT_API_LLM_MAX_CONCURRENT` (locked decision, default 32 → 4); reranker timeout 45.0 s (default 30.0 s) | none — already set in Phase 8 |
| Build artifacts | None new — the `pi-scheduler` crate is new source, not a renamed artifact | add crate to workspace `Cargo.toml` |

**Nothing found in category:** OS-registered state — none (the scheduler is in-process). No rename/refactor/migration applies to this phase.

## Common Pitfalls

### Pitfall 1: Expecting `tokio::sync::Semaphore` to provide lane priority
**What goes wrong:** The scheduler relies on the semaphore to service L0 before L3, but L3 waiters are served FIFO and can starve L0.
**Why it happens:** `tokio::sync::Semaphore` is FIFO-fair (verified: docs.rs/tokio); it has no priority or weighting (open issue tokio-rs/tokio#3242).
**How to avoid:** Put priority in the WFQ dispatcher (Pattern 2); use the semaphore only for per-lane reserved capacity.
**Warning signs:** Under L3 load, L0 wait times grow unbounded; the 200 ms SLO (SCHD-02) is violated.

### Pitfall 2: Hard-cancelling a Hindsight task for preemption
**What goes wrong:** `tokio::task::abort` kills a consolidation mid-transaction; the "cancelled batch writes remain invisible" guarantee is broken and memory state can be corrupted (violates SCHD-04).
**Why it happens:** Hindsight's cancellation is cooperative (`_check_op_alive` at the end of each LLM batch); a hard abort bypasses the boundary and the `status <> 'cancelled'` guards.
**How to avoid:** Trigger Hindsight's existing cooperative cancellation (flip the operation to `cancelled`); let Hindsight detect it at its next `_check_op_alive` boundary and discard the uncommitted batch.
**Warning signs:** Partial consolidation writes appear; `consolidated_at` is stamped on facts whose batch was aborted; the reconcile sweep re-processes already-written facts.

### Pitfall 3: Requeueing cancelled work from the scheduler
**What goes wrong:** The scheduler re-schedules a cancelled consolidation, racing Hindsight's reconcile sweep and double-scheduling the bank.
**Why it happens:** The scheduler "helps" by requeueing, but Hindsight's `banks_needing_consolidation` already re-discovers `consolidated_at IS NULL` facts.
**How to avoid:** The scheduler only *triggers* cancellation; Hindsight's reconcile sweep owns requeue. Do not add a scheduler-side requeue queue.
**Warning signs:** The same bank is consolidated twice; duplicate writes; the reconcile sweep and the scheduler fight over the same operation row.

### Pitfall 4: Running the soak on a High profile
**What goes wrong:** The soak passes trivially on a High profile and does not demonstrate the SLOs under the constrained Low case (SCHD-07).
**Why it happens:** More vCPU/RAM means the L3 cap and reserved capacity are never actually stressed.
**How to avoid:** Run the soak with the tokio runtime capped to 4 worker threads (Low profile, ≤4 vCPU / 8 GB) and assert the SLOs hold.
**Warning signs:** The soak passes on High but the 200 ms / 10 s bounds are never actually exercised under contention.

### Pitfall 5: Silent L1 degradation
**What goes wrong:** The L1 10 s deadline fires and the scheduler falls back to a low-budget recall without a visible signal, so the user/UI never knows the result is degraded (violates SCHD-03).
**Why it happens:** The degraded flag is computed but not surfaced to the caller.
**How to avoid:** Set a visible `degraded` flag on the result and propagate it to the Phase 10 product surface; enforce the no-same-turn-retry guard so one prompt never triggers retries inside the same turn.
**Warning signs:** The UI shows a full-quality result that is actually a low-budget fallback; the same prompt triggers multiple recalls in one turn.

## Code Examples

Verified patterns from official sources:

### Per-lane reserved capacity (tokio Semaphore)
```rust
// Source: docs.rs/tokio (tokio::sync::Semaphore) — FIFO-fair permit distribution.
// "This method uses a queue to fairly distribute permits in the order they were
//  requested. Cancelling a call to acquire_many makes you lose your place in the
//  queue."
use std::sync::Arc;
use tokio::sync::Semaphore;

// Total budget 10; reserved shares 40/20/25/15.
let l0 = Arc::new(Semaphore::new(4));
let l1 = Arc::new(Semaphore::new(2));
let l2 = Arc::new(Semaphore::new(2));
let l3 = Arc::new(Semaphore::new(1));

// A lane waiter acquires only its OWN lane's permit — it can never consume
// another lane's reserved capacity (SCHD-01).
let _permit = l0.acquire().await;
```

### L1 10 s deadline + degraded signal (tokio::time::timeout)
```rust
// Source: docs.rs/tokio (tokio::time::timeout).
use tokio::time::{timeout, Duration};

let result = match timeout(Duration::from_secs(10), run_recall()).await {
    Ok(r) => RecallResult { inner: r, degraded: false },
    Err(_elapsed) => RecallResult { inner: low_budget_fallback(), degraded: true }, // visible
};
// No same-turn retry: a per-turn token is consumed on the first attempt; a second
// recall in the same turn returns the cached/degraded result (SCHD-03).
```

### Hindsight preemption boundary (cooperative, from source)
```python
# Source: vendor/hindsight/.../engine/consolidation/consolidator.py:2054-2057
# (verbatim, read this session) — the operation boundary where preemption may cancel.
# At the end of each LLM batch the job checks whether its operation is still alive:
if not await memory_engine._check_op_alive(operation_id):
    # The operation was cancelled (status flipped to 'cancelled' by the API /
    # the scheduler). Stop; the uncommitted batch's writes remain invisible
    # (its witness row is never committed) and are resolved by the recovery sweep.
    return {"status": "cancelled"}
```
```python
# Source: vendor/hindsight/.../engine/memory_engine.py:5489-5560 (verbatim, read this session)
# _check_op_alive reads the operation's status from the DB and returns False when
# the status is 'cancelled' — this is the cooperative signal the scheduler triggers.
async def _check_op_alive(self, operation_id: str, ...) -> bool:
    ...
    # returns False when the operation row's status is 'cancelled'
```

### Hindsight safe requeue (reconcile sweep, from source)
```python
# Source: vendor/hindsight/.../engine/maintenance.py:426-462 (verbatim, read this session)
# The reconcile sweep re-schedules consolidation for banks with eligible-but-
# unscheduled facts — this is how cancelled work is safely requeued, not retired.
async def _run_reconcile(self) -> None:
    """Re-schedule consolidation for banks with eligible-but-unscheduled facts."""
    ...
    rows = await conn.fetch(
        f"SELECT schema_name, bank_id FROM {fq_routine('banks_needing_consolidation')}()"
    )
    ...
    # A fact stranded (or requeued) with consolidated_at IS NULL is re-discovered here.
```
```python
# Source: vendor/hindsight/.../worker/poller.py:971,1102,1157 (verbatim, read this session)
# Every terminal status write is guarded so a cancelled operation is never
# overwritten by a failed/retry/deferred write:
#   SET status = 'failed', ... WHERE operation_id = $1 AND status <> 'cancelled'
#   ... WHERE operation_id = $1 AND status <> 'cancelled'   (retry)
#   ... WHERE operation_id = $1 AND status <> 'cancelled'   (defer)
```

### Hindsight mental-model refresh write ordering (from source)
```python
# Source: vendor/hindsight/.../engine/memory_engine.py:18803-18953 (verbatim, read this session)
# refresh_mental_model: (1) get the pinned model, (2) run source_query through
# reflect, (3) update content, (4) update last_refreshed_at — as ONE atomic
# update_mental_model write (content + structured document + watermark together).
# On failure: nothing is written, the watermark is NOT advanced, so a retry
# re-reads the same window. This is the write ordering the scheduler must respect.
async def refresh_mental_model(self, bank_id, mental_model_id, *, mode=None, request_context):
    ...
    mental_model = await self.get_mental_model(bank_id, mental_model_id, ...)
    ...
    run = await self._execute_mental_model_refresh(bank_id, mental_model, mode=mode, ...)
    ...
    # Single atomic write — content, structured document, watermark, last_refreshed_at
    return await self.update_mental_model(
        bank_id, mental_model_id,
        reflect_response=reflect_response_payload,
        last_refreshed_source_query=run.source_query,
        refresh_watermark=run.processed_watermark,
        refresh_completed=True,
        ...
    )
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|-------------|--------|
| Single global priority queue for all memory traffic | Per-lane `tokio::sync::Semaphore` + WFQ dispatcher | This phase (Phase 9) | Reserved capacity is explicit/auditable per lane; the "L0 never behind L3" invariant lives in one auditable place |
| Hard task cancellation for preemption | Cooperative boundary-aligned cancellation (Hindsight `_check_op_alive`) | Hindsight design (Phase 8); scheduler composes with it | Preemption never corrupts memory state (SCHD-04); cancelled batch writes remain invisible |
| Scheduler-side requeue of cancelled work | Hindsight reconcile sweep (`banks_needing_consolidation`) re-discovers `consolidated_at IS NULL` | Hindsight design (Phase 8) | No double-scheduling; requeue is idempotent and owned by Hindsight |
| Assumed SLOs | Measured SLOs under synthetic Low-profile load (soak harness) | This phase (Phase 9) | The 200 ms / 10 s / reserved-capacity bounds are proven under contention, not assumed |

**Deprecated/outdated:**
- **Relying on `tokio::sync::Semaphore` for priority:** Outdated for this use — it is FIFO-fair, not priority-aware (tokio-rs/tokio#3242 open). Use the WFQ dispatcher for priority.
- **`tokio::task::abort` for preemption:** Outdated/unsafe for Hindsight work — bypasses the cooperative boundary and the `status <> 'cancelled'` guards. Use Hindsight's cooperative cancellation.

## Assumptions Log

> Claims tagged `[ASSUMED]` in this research. The planner and discuss-phase use this to identify decisions needing user confirmation.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The total concurrency budget is 10 (so reserved shares 40/20/25/15% = 4/2/2/1 permits) | Standard Stack, Pattern 1 | The absolute permit counts scale with the real budget; the *ratios* are locked. If the real budget differs, recompute permit counts — the design is unchanged. |
| A2 | The CallScheduler is implemented in Rust (tokio), matching the OMP runtime | Standard Stack, Alternatives | A TypeScript implementation is also permitted by the locked "thin Rust/TS component" decision; the patterns transfer. Rust is recommended for lower hot-path overhead. |
| A3 | The L1 low-budget fallback is an existing Hindsight recall mode (reduced token budget / fewer hops) | Pattern 4 | If no such mode exists, Phase 9 must add a minimal low-budget recall path in Hindsight. Confirm the exact fallback semantics with the Hindsight source before locking. |
| A4 | The "witness row" is the Hindsight write-batch atomicity marker whose non-commit keeps a cancelled batch's writes invisible | Code Examples (consolidator write path) | The exact witness-row mechanism is in the Hindsight write-batch / store layer; the *guarantee* (cancelled batch writes remain invisible, resolved by the recovery sweep) is verified from the consolidator comment. Confirm the witness-row implementation detail if the plan needs to reason about it directly. |

**If this table is empty:** All claims were verified or cited. (Not empty — A1–A4 above need confirmation.)

## Open Questions

1. **Exact total concurrency budget for the Low profile**
   - What we know: Reserved shares are 40/20/25/15% (locked); `HINDSIGHT_API_LLM_MAX_CONCURRENT=4` (locked).
   - What's unclear: The absolute permit count per lane (A1 assumes budget 10 → 4/2/2/1).
   - Recommendation: Derive the budget from the Low-profile hardware (≤4 vCPU) and `HINDSIGHT_API_LLM_MAX_CONCURRENT=4`; confirm the per-lane permit counts in the plan.

2. **Exact L1 low-budget fallback semantics**
   - What we know: L1 degrades to a "low-budget recall" with a visible degraded signal (SCHD-03).
   - What's unclear: Whether a low-budget recall mode already exists in Hindsight or must be added (A3).
   - Recommendation: Read the Hindsight recall path to confirm the fallback mode before locking the degraded-signal contract.

3. **Where the WFQ dispatcher's L3 50% cap is measured**
   - What we know: L3 is capped at 50% of capacity (locked).
   - What's unclear: Whether the cap is on *active* L3 permits (in-flight) or *queued* L3 depth.
   - Recommendation: Cap on *active* L3 permits (in-flight), so a burst of queued L3 work cannot starve L0/L1; confirm in the plan.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust / tokio | CallScheduler crate | ✓ | (present in `vendor/oh-my-pi/Cargo.toml`/`Cargo.lock`) | — |
| Node / Bun | Test harness (root `package.json` test script, Phase 8) | ✓ | (present — `bun.exe test` used by justfile) | — |
| Python (Hindsight) | Preemption boundary + reconcile sweep | ✓ | vendored (Phase 8) | — |
| PostgreSQL + pgvector | Hindsight store (operation rows, `consolidated_at`) | ✓ | bundled (Phase 8) | — |
| llama-server sidecars | LLM calls under load (soak) | ✓ | supervised (Phase 8) | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Rust `#[tokio::test]` (unit/integration in `pi-scheduler/tests/`) + Bun (`bun.exe test`) for the root harness |
| Config file | `vendor/oh-my-pi/Cargo.toml` (workspace) + root `package.json` test script (Phase 8) |
| Quick run command | `cargo test -p pi-scheduler` |
| Full suite command | `cargo test -p pi-scheduler && bun.exe test tests/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHD-01 | Each lane holds reserved capacity; L0 never queues behind L3 | unit | `cargo test -p pi-scheduler --test lane_capacity` | ❌ Wave 0 |
| SCHD-02 | No consolidation delays an L0/L1 waiter > 200 ms under load | integration | `cargo test -p pi-scheduler --test lane_capacity -- delay_bound` | ❌ Wave 0 |
| SCHD-03 | L1 meets 10 s deadline or degrades with visible signal; no same-turn retry | unit | `cargo test -p pi-scheduler --test deadline` | ❌ Wave 0 |
| SCHD-04 | Preemption cancels at operation boundaries; safe requeue/retire | integration | `cargo test -p pi-scheduler --test preemption` | ❌ Wave 0 |
| SCHD-07 | Low-profile soak demonstrates lane SLOs under concurrency | integration (soak) | `cargo test -p pi-scheduler --test soak -- --ignored` (or justfile recipe) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cargo test -p pi-scheduler`
- **Per wave merge:** `cargo test -p pi-scheduler && bun.exe test tests/`
- **Phase gate:** Full suite green before `/gsd-verify-work`; the Low-profile soak (SCHD-07) must pass on a 4-worker-thread runtime.

### Wave 0 Gaps
- [ ] `vendor/oh-my-pi/crates/pi-scheduler/` — new crate (Cargo.toml + src)
- [ ] `vendor/oh-my-pi/crates/pi-scheduler/tests/lane_capacity.rs` — covers SCHD-01, SCHD-02
- [ ] `vendor/oh-my-pi/crates/pi-scheduler/tests/deadline.rs` — covers SCHD-03
- [ ] `vendor/oh-my-pi/crates/pi-scheduler/tests/preemption.rs` — covers SCHD-04
- [ ] `vendor/oh-my-pi/crates/pi-scheduler/tests/soak.rs` — covers SCHD-07 (Low profile, 4 worker threads)
- [ ] Add `pi-scheduler` to the workspace `Cargo.toml` members

*(The scheduler crate is new; all test files are Wave 0 gaps.)*

## Security Domain

> `security_enforcement` is enabled (absent = enabled). ASVS L1; block on high.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | The scheduler is an in-process component; it does not handle auth (Hindsight `request_context` / `_authenticate_tenant` own that) |
| V3 Session Management | no | No session state in the scheduler; leases are in-process and short-lived |
| V4 Access Control | yes | Lane admission is the access control: a request may only acquire its own lane's permit (no cross-lane consumption); the L3 50% cap is a hard admission bound |
| V5 Input Validation | yes | Lane tag + operation payload validated at the adapter boundary before dispatch (reject unknown lanes / malformed ops) |
| V6 Cryptography | no | No crypto in the scheduler |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-lane permit consumption (a lane drains another lane's capacity) | Denial of Service | Per-lane `tokio::sync::Semaphore` (a waiter acquires only its own lane's permit); WFQ dispatcher enforces the invariant |
| L3 starvation of L0/L1 (background work starves the prompt) | Denial of Service | L3 50% hard cap in the dispatcher; L0/L1 non-preemptible priority |
| Preemption corrupting memory state (hard cancel mid-transaction) | Tampering | Cooperative boundary-aligned cancellation (Hindsight `_check_op_alive`); `status <> 'cancelled'` guards on all terminal writes |
| Double-scheduling cancelled work (scheduler + reconcile sweep race) | Tampering | Scheduler only triggers cancellation; Hindsight reconcile sweep owns requeue (single owner) |
| Unvalidated lane tag / malformed op at the adapter boundary | Tampering | Validate lane tag + payload before dispatch (V5 input validation) |

## Sources

### Primary (HIGH confidence)
- `vendor/hindsight/hindsight-api-slim/hindsight_api/engine/consolidation/consolidator.py:2054-2057` (cancellation boundary), `:2890-2963` (write transaction / witness row) — read verbatim this session
- `vendor/hindsight/hindsight-api-slim/hindsight_api/engine/memory_engine.py:5489-5560` (`_check_op_alive`), `:18803-18953` (`refresh_mental_model` write ordering) — read verbatim this session
- `vendor/hindsight/hindsight-api-slim/hindsight_api/worker/poller.py:971,1102,1157` (`status <> 'cancelled'` guards), `:1214-1250` (wall-clock ceiling) — read verbatim this session
- `vendor/hindsight/hindsight-api-slim/hindsight_api/engine/maintenance.py:426-462` (`_run_reconcile` / `banks_needing_consolidation`) — read verbatim this session
- docs.rs/tokio (`tokio::sync::Semaphore` — FIFO-fair), tokio-rs/tokio#3242 (no native priority) — verified via web search this session

### Secondary (MEDIUM confidence)
- Weighted fair queuing (WFQ) — standard scheduling algorithm (training knowledge; the dispatcher is new code, not a library)

### Tertiary (LOW confidence)
- A1 (total concurrency budget = 10), A3 (L1 low-budget fallback mode) — `[ASSUMED]`, need confirmation (see Assumptions Log)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `tokio` verified present in OMP; `tokio::sync::Semaphore` FIFO-fair behavior verified against docs.rs/tokio
- Architecture: HIGH — Hindsight cancellation/recovery/write-ordering read verbatim from source; the scheduler composes with existing invariants
- Pitfalls: HIGH — each pitfall maps to a verified Hindsight invariant or a verified tokio limitation

**Research date:** 2026-10-25
**Valid until:** ~30 days (stable domain; Hindsight source is vendored and fixed at Phase 8)
