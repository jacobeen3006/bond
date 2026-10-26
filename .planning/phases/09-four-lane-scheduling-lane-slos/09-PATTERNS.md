# Phase 9: Four-Lane Scheduling & Lane SLOs - Pattern Map

**Mapped:** 2026-10-25
**Files analyzed:** 12 (11 new in `pi-scheduler` + 1 modified workspace manifest)
**Analogs found:** 10 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `vendor/oh-my-pi/crates/pi-scheduler/Cargo.toml` | config | — | `vendor/oh-my-pi/crates/pi-vcs/Cargo.toml` | exact |
| `vendor/oh-my-pi/crates/pi-scheduler/src/lib.rs` | service (public API) | request-response (submit → dispatch → result) | `vendor/oh-my-pi/crates/pi-walker/src/lib.rs` | role-match |
| `vendor/oh-my-pi/crates/pi-scheduler/src/lanes.rs` | model (lane definitions) | config/transform | `vendor/oh-my-pi/crates/pi-diff/src/lib.rs` (typed constants + small structs) | role-match (weak) |
| `vendor/oh-my-pi/crates/pi-scheduler/src/dispatcher.rs` | service (WFQ dispatcher) | event-driven (lane selection) | — (new code; RESEARCH.md Pattern 2 sketch) | none |
| `vendor/oh-my-pi/crates/pi-scheduler/src/lease.rs` | service (revocable lease) | request-response + event (revoke) | `vendor/oh-my-pi/crates/pi-shell/src/cancel.rs` | role-match |
| `vendor/oh-my-pi/crates/pi-scheduler/src/deadline.rs` | service (L1 deadline) | request-response (timeout) | `vendor/oh-my-pi/crates/pi-builtins/src/pidwait.rs` | role-match |
| `vendor/oh-my-pi/crates/pi-scheduler/src/slo.rs` | utility (SLO metrics) | transform (counters/timing) | `vendor/oh-my-pi/crates/pi-walker/tests/perf.rs` (timing harness) | role-match |
| `vendor/oh-my-pi/crates/pi-scheduler/tests/lane_capacity.rs` | test | request-response | `vendor/oh-my-pi/crates/pi-edit/tests/apply_patch.rs` | exact |
| `vendor/oh-my-pi/crates/pi-scheduler/tests/deadline.rs` | test | request-response | `vendor/oh-my-pi/crates/pi-edit/tests/apply_patch.rs` | exact |
| `vendor/oh-my-pi/crates/pi-scheduler/tests/preemption.rs` | test | event-driven (cancel + requeue) | `vendor/oh-my-pi/crates/pi-shell/tests/vfs.rs` (cancel + timeout tests) | role-match |
| `vendor/oh-my-pi/crates/pi-scheduler/tests/soak.rs` | test (soak) | batch/concurrency | `vendor/oh-my-pi/crates/pi-walker/tests/perf.rs` (`#[ignore]` + `run_bench`) | exact |
| `vendor/oh-my-pi/Cargo.toml` (modified) | config | — | itself (members list + `[workspace.dependencies]`) | exact |

## Pattern Assignments

### `vendor/oh-my-pi/crates/pi-scheduler/Cargo.toml` (config)

**Analog:** `vendor/oh-my-pi/crates/pi-vcs/Cargo.toml` (lines 1–27)

Every OMP crate uses workspace inheritance for package metadata and `[lints] workspace = true`; dependencies are referenced as `<dep>.workspace = true`. `pi-vcs` is the closest analog because it already depends on `tokio` + `tokio-util` the way `pi-scheduler` will.

**Package header pattern** (lines 1–11):
```toml
[package]
name = "pi-vcs"
version.workspace = true
edition.workspace = true
license.workspace = true
authors.workspace = true
homepage.workspace = true
repository.workspace = true

[lints]
workspace = true
```

**Dependencies pattern** (lines 13–21):
```toml
[dependencies]
futures.workspace = true
...
thiserror.workspace = true
tokio.workspace = true
tokio-util.workspace = true
```

**For `pi-scheduler`** the dependency block is minimal — `tokio.workspace = true` (the workspace declares `tokio = { version = "1", features = ["full"] }` at `vendor/oh-my-pi/Cargo.toml:251`) plus `thiserror.workspace = true` for the error type. No new external packages (RESEARCH.md: "No new external packages are required").

---

### `vendor/oh-my-pi/crates/pi-scheduler/src/lib.rs` (service, request-response)

**Analog:** `vendor/oh-my-pi/crates/pi-walker/src/lib.rs` (lines 1–43)

Crate-root convention: `//!` crate-level doc comment with an `# Overview` section, then `mod` declarations for each module, then `pub use` re-exports of the public API.

**Crate root pattern** (lines 1–43):
```rust
//! Reusable platform directory traversal primitives.
//!
//! # Overview
//! `pi-walker` owns the native directory-read fast path that higher-level tools
//! use for globbing, grep candidate discovery, AST scans, and shell builtins.
//! ...

mod cache;

#[cfg(not(unix))]
use std::ffi::OsString;
...

pub use cache::{
	cache_ttl_ms, classify_file_type, contains_component, empty_recheck_ms, invalidate_all,
	invalidate_path, invalidate_path_string, max_cache_entries, normalize_path,
	normalize_relative_path, parallel_for_each, parallel_for_each_init, resolve_search_path,
	should_parallelize, should_skip_path, walk_workers,
};
```

**For `pi-scheduler`**: `//!` doc describing the four-lane scheduler (lanes, reserved shares, WFQ, cooperative preemption), then:
```rust
mod lanes;
mod dispatcher;
mod lease;
mod deadline;
mod slo;

pub use lanes::{Lane, LaneConfig};
pub use dispatcher::Dispatcher;
pub use lease::{Lease, LeaseHandle};
pub use deadline::{Deadline, RecallResult};
pub use slo::SloMetrics;
```
The public API surface per RESEARCH.md: `submit(lane, op)`, preemption trigger, SLO metrics.

**Note:** OMP crates use tabs for indentation (visible in every source file read). Match that.

---

### `vendor/oh-my-pi/crates/pi-scheduler/src/lanes.rs` (model, config/transform)

**Analog:** `vendor/oh-my-pi/crates/pi-diff/src/lib.rs` (lines 10–36) — typed constants + small `#[derive]` structs with doc comments on every field.

**Typed constant + struct pattern** (lines 10–22):
```rust
/// UTF-16 code unit for `\n`.
const LF: u16 = 0x000a;

/// A run of tokens sharing one edit classification, in forward order.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Run {
	/// Number of tokens in this run.
	pub count:   u32,
	/// True when this run exists only in the new input.
	pub added:   bool,
	/// True when this run exists only in the old input.
	pub removed: bool,
}
```

**For `lanes.rs`**: a `Lane` enum (`L0` prompt, `L1` recall/reflect, `L2` retain, `L3` background) plus a `LaneConfig` struct carrying the reserved share (40/20/25/15%), the semaphore permit count (derived from the total concurrency budget — RESEARCH.md A1: budget 10 → 4/2/2/1), the queue depth cap, and the preemption class (L0/L1 non-preemptible, L2/L3 preemptible). Every field gets a `///` doc comment.

---

### `vendor/oh-my-pi/crates/pi-scheduler/src/dispatcher.rs` (service, event-driven)

**Analog:** none — the WFQ dispatcher is new code (RESEARCH.md Pattern 2, "the dispatcher is NEW code in pi-scheduler/src/dispatcher.rs"). No priority scheduler or weighted queue exists anywhere in the OMP crates (verified by grep: the only `dispatch` functions are command dispatch in `pi-builtins/src/host.rs:1072`, `pi-natives/src/desktop/mod.rs:938`, `pi-natives/src/ipc/conn.rs:481` — none are schedulers).

**Use the RESEARCH.md Pattern 2 sketch** (09-RESEARCH.md:166–182):
```rust
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

**Key constraint from RESEARCH.md:** do NOT rely on `tokio::sync::Semaphore` for priority — it is FIFO-fair (tokio-rs/tokio#3242). The dispatcher is the single place the priority and L3-cap invariants live. The L3 cap is on *active* (in-flight) L3 permits, not queued depth (RESEARCH.md Open Question 3 recommendation).

---

### `vendor/oh-my-pi/crates/pi-scheduler/src/lease.rs` (service, request-response + event)

**Analog:** `vendor/oh-my-pi/crates/pi-shell/src/cancel.rs` (lines 35–63) — the `Notify` + atomic-flag + `wait`/`abort` pattern is exactly a grant/revoke primitive.

**Grant/revoke pattern** (lines 35–63):
```rust
#[derive(Default)]
struct Flag {
	reason:   AtomicU8,
	notifier: Notify,
}

impl Flag {
	async fn wait(&self) -> AbortReason {
		if let Some(reason) = self.cause() {
			return reason;
		}
		let notifier = self.notifier.notified();
		if let Some(reason) = self.cause() {
			return reason;
		}
		notifier.await;
		self.cause().unwrap_or(AbortReason::Unknown)
	}

	fn abort(&self, reason: AbortReason) {
		let old = self.reason.swap(reason as u8, Ordering::SeqCst);
		if old == 0 {
			self.notifier.notify_waiters();
		}
	}
}
```

**For `lease.rs`**: a `Lease` that wraps a lane permit (`tokio::sync::Semaphore` permit) plus a revocation flag in the `cancel.rs` shape. On preemption the scheduler does NOT hard-cancel the task — it flips the Hindsight operation to `cancelled` (the cooperative trigger, see Shared Patterns → Hindsight preemption contract) and the lease's `wait()` returns the revocation reason at the next operation boundary. L0/L1 leases are non-revocable; L2/L3 leases are revocable.

---

### `vendor/oh-my-pi/crates/pi-scheduler/src/deadline.rs` (service, request-response)

**Analog:** `vendor/oh-my-pi/crates/pi-builtins/src/pidwait.rs` (lines 43–47) — `tokio::time::timeout` wrapping a future with a descriptive `.expect`.

**Deadline pattern** (lines 43–47):
```rust
Ok(tokio::time::timeout(Duration::from_secs(2), command.execute(context))
	.await
	.expect("pidwait exceeded its two-second test bound")?)
```

**For `deadline.rs`** (RESEARCH.md Pattern 4, 09-RESEARCH.md:197–211):
```rust
use tokio::time::{timeout, Duration};

let result = match timeout(Duration::from_secs(10), run_recall()).await {
	Ok(r) => RecallResult { inner: r, degraded: false },
	Err(_elapsed) => RecallResult { inner: low_budget_fallback(), degraded: true }, // visible
};
// No same-turn retry: a per-turn token is consumed on the first attempt; a second
// recall in the same turn returns the cached/degraded result (SCHD-03).
```
The `degraded` flag must be visible (surfaced to the caller), and the no-same-turn-retry guard is a per-turn monotonic token, not a global lock.

---

### `vendor/oh-my-pi/crates/pi-scheduler/src/slo.rs` (utility, transform)

**Analog:** `vendor/oh-my-pi/crates/pi-walker/tests/perf.rs` (lines 87–103) — the `run_bench` timing harness (median of N iterations, `Instant::now()`/`elapsed()`, `black_box` to prevent elision).

**Timing harness pattern** (lines 87–103):
```rust
fn run_bench(mut name: &str, mut run: impl FnMut() -> usize) {
	black_box(run());

	let mut timings = [Duration::ZERO; MEASURED_ITERATIONS];
	for timing in &mut timings {
		let started = Instant::now();
		let observed = run();
		let elapsed = started.elapsed();
		black_box(observed);
		*timing = elapsed;
	}

	timings.sort_unstable();
	let median_ms = timings[MEASURED_ITERATIONS / 2].as_secs_f64() * 1_000.0;
	name = black_box(name);
	println!("BENCH {name}: {median_ms:.3} ms");
}
```

**For `slo.rs`**: SLO metric counters — per-lane enqueue→first-service delay (the 200 ms bound, SCHD-02), L1 deadline hits vs. degraded fallbacks (SCHD-03), and reserved-capacity counters (per-lane active permits vs. the 40/20/25/15% shares, SCHD-01). Use `tokio::time::Instant` for monotonic timing (RESEARCH.md Pattern 3, 09-RESEARCH.md:188–194):
```rust
let enqueued = Instant::now();
let _permit = l0.acquire().await;
let delay = enqueued.elapsed();
assert!(delay.as_millis() <= 200, "L0 delayed {delay:?} by consolidation");
```
RESEARCH.md notes `crossbeam` is only needed "if `tokio` atomics are insufficient for the metrics path" — start with `std::sync::atomic` / `parking_lot` (both already workspace deps).

---

### `vendor/oh-my-pi/crates/pi-scheduler/tests/lane_capacity.rs` (test, request-response)

**Analog:** `vendor/oh-my-pi/crates/pi-edit/tests/apply_patch.rs` (lines 1–48) — integration test file: `mod common;` (optional shared helper), `use` of the crate's public API, then `#[tokio::test]` async fns.

**Integration test pattern** (lines 45–48):
```rust
#[tokio::test]
async fn core_fixture_cases() {
	common::run_fixture("apply_patch/core.json", EditMode::ApplyPatch).await;
}
```

**For `lane_capacity.rs`** (SCHD-01, SCHD-02): `#[tokio::test]` fns that (a) assert each lane's semaphore never exceeds its reserved permit count and a waiter in one lane never consumes another lane's permits, and (b) under synthetic L3 load, timestamp an L0/L1 waiter's enqueue and first-service and assert the delta ≤ 200 ms.

---

### `vendor/oh-my-pi/crates/pi-scheduler/tests/deadline.rs` (test, request-response)

**Analog:** `vendor/oh-my-pi/crates/pi-edit/tests/apply_patch.rs` (lines 45–48) — same `#[tokio::test]` integration-test shape.

**For `deadline.rs`** (SCHD-03): `#[tokio::test]` fns that (a) let the L1 10 s deadline fire (use `tokio::time::pause()` + `tokio::time::advance()` to fast-forward instead of real 10 s waits) and assert the result carries `degraded: true`, and (b) assert a second recall in the same turn returns the cached/degraded result without re-running (the per-turn token guard).

---

### `vendor/oh-my-pi/crates/pi-scheduler/tests/preemption.rs` (test, event-driven)

**Analog:** `vendor/oh-my-pi/crates/pi-shell/tests/vfs.rs` (lines 586–590) — cancellation + `tokio::time::timeout` test shape.

**Cancel + timeout test pattern** (lines 586–590):
```rust
	cancel.cancel();
	tokio::time::timeout(Duration::from_secs(5), runner)
		.await
		.expect("cancelled tail exits")
		.expect("tail worker")
```

**For `preemption.rs`** (SCHD-04): `#[tokio::test]` fns that drive a L2/L3 lease, revoke it (preemption trigger), and assert: (a) cancellation only takes effect at an operation boundary (the test's fake Hindsight op store mimics `_check_op_alive` — see Shared Patterns), (b) the cancelled work's writes never commit (the fake store keeps `consolidated_at IS NULL`), and (c) the reconcile sweep re-discovers the work. The scheduler under test must NOT hard-cancel (`tokio::task::abort`) and must NOT requeue — Hindsight's reconcile sweep owns requeue (RESEARCH.md Anti-Patterns).

---

### `vendor/oh-my-pi/crates/pi-scheduler/tests/soak.rs` (test, batch/concurrency)

**Analog:** `vendor/oh-my-pi/crates/pi-walker/tests/perf.rs` (lines 26–103) — `#[ignore]`-gated harness with a `run_bench` timing loop.

**Ignored-harness pattern** (lines 26–44):
```rust
#[test]
#[ignore = "run with: cargo nextest run --cargo-profile ci -p pi-walker --test perf --run-ignored \
            ignored-only --no-capture --test-threads=1"]
fn perf_walk_candidates_unordered_gitignore() {
	let root = SYNTHETIC_ROOT.as_path();
	run_bench("perf_walk_candidates_unordered_gitignore", || {
		...
	});
}
```

**For `soak.rs`** (SCHD-07): a `#[tokio::test(flavor = "multi_thread", worker_threads = 4)]` fn (the `multi_thread` flavor is the established OMP pattern — `vendor/oh-my-pi/crates/pi-shell/src/shell.rs:7631`) gated with `#[ignore]` (RESEARCH.md Validation Architecture: `cargo test -p pi-scheduler --test soak -- --ignored`). It caps the runtime to 4 worker threads (Low profile, ≤4 vCPU / 8 GB), spawns N concurrent L3 retain tasks plus a periodic L0 recall loop, and asserts: L0 delay ≤ 200 ms, L1 ≤ 10 s or degraded, L3 ≤ 50% capacity. **Must run on the Low profile** — a High-profile run passes trivially (RESEARCH.md Pitfall 4).

---

### `vendor/oh-my-pi/Cargo.toml` (modified, config)

**Analog:** itself — two edits, both following the existing in-file convention.

**Edit 1 — workspace members** (lines 6–24): add `"crates/pi-scheduler"` to the explicit `members` list (alphabetical position: after `"crates/pi-shell"`, before `"crates/pi-vcs"`). The list is deliberately explicit, not a glob (comment at lines 2–5: a glob member resolving to a directory without a Cargo.toml is a hard error).

**Edit 2 — workspace dependencies** (lines 226–242, "Internal Libraries" section): add `pi-scheduler = { path = "crates/pi-scheduler" }` alongside the other `pi-*` path deps (e.g. `pi-shell = { path = "crates/pi-shell" }` at line 235). `tokio` is already declared at line 251 (`tokio = { version = "1", features = ["full"] }`) — no new external dependency.

## Shared Patterns

### Workspace inheritance (crate manifests)
**Source:** `vendor/oh-my-pi/crates/pi-vcs/Cargo.toml`, `pi-walker/Cargo.toml`, `pi-diff/Cargo.toml`
**Apply to:** `pi-scheduler/Cargo.toml`
```toml
[package]
name = "pi-scheduler"
version.workspace = true
edition.workspace = true
license.workspace = true
authors.workspace = true
homepage.workspace = true
repository.workspace = true

[lints]
workspace = true
```
The workspace lints (`vendor/oh-my-pi/Cargo.toml:113–224`) are strict: `clippy::correctness` and `clippy::suspicious` are `deny`, `pedantic`/`perf`/`style` are `warn`, and `allow_attributes_without_reason = "warn"` (every `#[allow]` needs a reason). New code must compile clean under these.

### Crate root layout
**Source:** `vendor/oh-my-pi/crates/pi-walker/src/lib.rs:1–43`
**Apply to:** `pi-scheduler/src/lib.rs`
`//!` crate doc with `# Overview`, `mod` declarations, `pub use` re-exports. Tabs for indentation.

### Cooperative cancellation (lease revoke)
**Source:** `vendor/oh-my-pi/crates/pi-shell/src/cancel.rs:35–63`
**Apply to:** `pi-scheduler/src/lease.rs`
`Notify` + atomic flag + `wait()`/`abort()` — the grant/revoke primitive. The scheduler's preemption is cooperative and boundary-aligned; never `tokio::task::abort` (RESEARCH.md Anti-Pattern 2).

### Deadline (timeout)
**Source:** `vendor/oh-my-pi/crates/pi-builtins/src/pidwait.rs:43–47`
**Apply to:** `pi-scheduler/src/deadline.rs`
`tokio::time::timeout(Duration, future).await` with a descriptive `.expect`.

### SLO timing
**Source:** `vendor/oh-my-pi/crates/pi-walker/tests/perf.rs:87–103`
**Apply to:** `pi-scheduler/src/slo.rs`
`Instant::now()` / `elapsed()`, median-of-N, `black_box` to prevent elision.

### Error type
**Source:** `vendor/oh-my-pi/crates/vendor/brush-core/src/error.rs:9–23`
**Apply to:** `pi-scheduler/src/lib.rs` (or a `src/error.rs`)
```rust
#[derive(thiserror::Error, Debug)]
#[error("{kind}")]
pub struct Error {
	/// The kind of error.
	kind: ErrorKind,
}

#[derive(thiserror::Error, Debug)]
pub enum ErrorKind {
	#[error("cannot expand tilde expression with HOME not set")]
	...
}
```
`thiserror.workspace = true` is the workspace error-handling convention.

### Test shape
**Source:** `vendor/oh-my-pi/crates/pi-edit/tests/apply_patch.rs:45–48`, `vendor/oh-my-pi/crates/pi-shell/src/shell.rs:7631–7646`, `vendor/oh-my-pi/crates/pi-walker/tests/perf.rs:26–44`
**Apply to:** all `pi-scheduler/tests/*.rs`
- `#[tokio::test]` for unit/integration async tests.
- `#[tokio::test(flavor = "multi_thread", worker_threads = 4)]` for the Low-profile soak.
- `#[ignore = "run with: ..."]` for the soak harness (run via `--ignored`).
- `tokio::time::timeout` as the safety net that turns a hang into a bounded failure (the `shell.rs:7628–7643` pattern).

### Hindsight preemption contract (the scheduler is a client, not a modifier)
**Source:** `vendor/hindsight/hindsight-api-slim/hindsight_api/engine/memory_engine.py:22013–22075` (`cancel_operation`), `:5490–5512` (`_check_op_alive`); `vendor/hindsight/hindsight-api-slim/hindsight_api/engine/consolidation/consolidator.py:2054–2057` (boundary); `vendor/hindsight/hindsight-api-slim/hindsight_api/worker/poller.py:967–978` (`status <> 'cancelled'` guard); `vendor/hindsight/hindsight-api-slim/hindsight_api/engine/maintenance.py:426–462` (reconcile sweep); `vendor/hindsight/hindsight-api-slim/hindsight_api/api/http.py:7525–7560` (HTTP trigger)
**Apply to:** `pi-scheduler/src/lease.rs` (preemption trigger), `tests/preemption.rs` (fake op store)

The scheduler triggers Hindsight's existing cooperative cancellation and relies on Hindsight's existing recovery. It does NOT modify Hindsight internals and does NOT requeue.

**Trigger** — flip the operation to `cancelled` (memory_engine.py:22066–22070):
```python
updated = await conn.fetchrow(
    f"UPDATE {fq_table('async_operations')} SET status = 'cancelled', updated_at = now() "
    f"WHERE operation_id = $1 AND status IN ('pending', 'processing') RETURNING status",
    op_uuid,
)
```
Exposed over HTTP as `DELETE /v1/default/banks/{bank_id}/operations/{operation_id}` (http.py:7525–7560). A `processing` op is cancelled cooperatively: "the row is marked 'cancelled' immediately and the worker running it stops at its next checkpoint" (http.py:7531–7534). Returns 409 for terminal states.

**Boundary** — the running task checks liveness at the end of each LLM batch (consolidator.py:2054–2057):
```python
cancelled_local = False
if operation_id and not await memory_engine._check_op_alive(operation_id):
    logger.info(f"[CONSOLIDATION] bank={bank_id} operation {operation_id} cancelled, stopping early")
    cancelled_local = True
```
`_check_op_alive` (memory_engine.py:5490–5512) returns `False` when the row's status is `cancelled` (one indexed primary-key read at a boundary that already touches the DB).

**Safe requeue** — the maintenance reconcile sweep re-discovers `consolidated_at IS NULL` facts (maintenance.py:426–433):
```python
async def _run_reconcile(self) -> None:
    """Re-schedule consolidation for banks with eligible-but-unscheduled facts."""
    ...
    rows = await conn.fetch(
        f"SELECT schema_name, bank_id FROM {fq_routine('banks_needing_consolidation')}()"
    )
```

**Terminal-write guard** — every non-cancel status write is guarded so a cancelled row is never overwritten (poller.py:967–978):
```python
result = await conn.execute(
    f"""
    UPDATE {table}
    SET status = 'failed', error_message = $2, completed_at = now(), updated_at = now()
    WHERE operation_id = $1 AND status <> 'cancelled'
    """,
    ...
)
if not _updated_row_count(result):
    logger.info(f"Operation {operation_id} was cancelled or deleted, skipping mark-failed")
    return
```

**For `tests/preemption.rs`:** the test's fake Hindsight op store must replicate these three semantics — (1) `cancel` flips status to `cancelled` only from `pending`/`processing`, (2) the running task's `_check_op_alive` returns `False` at the next batch boundary, (3) terminal writes are guarded by `status <> 'cancelled'` and the reconcile sweep re-discovers `consolidated_at IS NULL`. The scheduler under test only triggers (1); (2) and (3) are Hindsight's.

## No Analog Found

Files with no close match (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `vendor/oh-my-pi/crates/pi-scheduler/src/dispatcher.rs` | service (WFQ dispatcher) | event-driven | No priority scheduler or weighted fair queue exists in the OMP crates (verified by grep). Use RESEARCH.md Pattern 2 sketch (09-RESEARCH.md:166–182). |
| `vendor/oh-my-pi/crates/pi-scheduler/src/lanes.rs` | model (lane definitions) | config/transform | No lane-config analog; closest is `pi-diff/src/lib.rs` typed constants + small structs (weak role-match). Use RESEARCH.md Pattern 1 (per-lane semaphore sizing, 09-RESEARCH.md:143–161). |

## Metadata

**Analog search scope:** `vendor/oh-my-pi/crates/` (all 12 `pi-*` crates + `crates/vendor/`), `vendor/oh-my-pi/Cargo.toml` (workspace), `vendor/hindsight/hindsight-api-slim/hindsight_api/` (engine, worker, api)
**Files scanned:** ~40 (12 crate manifests, 6 crate `lib.rs`/module heads, 4 test files, 5 Hindsight source files)
**Pattern extraction date:** 2026-10-25
**Tracked-source gate:** all analog paths verified git-tracked via `git ls-files` (10/10)
