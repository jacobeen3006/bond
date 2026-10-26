# Phase 11: Skills, Plugins, GSD & Kanban - Research

**Researched:** 2026-10-26
**Domain:** Extension surface — skill registry + hub + curator, Desktop plugin host, Kanban dispatch, GSD TDD skills, gate-enforced TDD invariants, advisor, plan/goal/vibe modes + prewalk — all governed by the Phase 4 policy gate
**Confidence:** MEDIUM-HIGH. Every anchor below was read verbatim this session from committed Phase 1–10 planning artifacts (`.planning/`) and the four vendored trees (`vendor/hermes-agent`, `vendor/oh-my-pi`, `vendor/gsd-omp`). Items that could not be read verbatim (gsd-core skill-set contents, `prewalk.md` body) are tagged `[ASSUMED]`/Open Question. The phase is a *port* of vendored machinery: no new architectural substrate is expected, which is why the Standard Stack section is short.

> **Hard dependency — state this in every plan.** Phases 2–10 are *planned, unexecuted*: the repo contains `.planning/`, `AGENTS.md`, `vendor/`, `tools/`, `tests/`, `package.json`, `justfile` — but no `apps/`, `packages/`, or `contracts/` yet [VERIFIED: `ls` of repo root this session]. Phase 11 therefore: (a) carries an explicit `<precondition>` that Phases 3 (loop + store), 4 (gate), 5 (coding core over RPC), 7 (subagents), and 10 (Desktop/CLI surface) have executed; (b) grounds every seam on the prior-phase PLAN.md/RESEARCH.md, not on implemented code; (c) puts the vendored-mechanism verification (skill catalog scan, plugin SDK, kanban db, gsd-core projection) in a Wave-0 task that runs against the imported tree and the pinned gsd-core release.

## Summary

Phase 11 is the extension surface. It turns the governed core (loop + gate from Phases 3–4, coding core over RPC from Phase 5, subagents from Phase 7, Desktop/CLI from Phase 10) into a product that can *grow*: skills install from a hub and are improved by a curator; a Desktop plugin host contributes pages/panes/widgets/commands through a scoped backend; a Kanban board dispatches dependent tasks with heartbeats, reclaim and zombie detection; GSD TDD skills become first-class in both skill registries; the gate enforces TDD phase invariants (RED→GREEN requires recorded failing-test evidence); a second "advisor" model reviews turns; and plan/goal/vibe modes plus prewalk live inside the unified loop. The phase is a **port of vendored machinery, not new architecture** — every mechanism already exists in `vendor/hermes-agent` (skills, plugins, kanban, curator, advisor catalog entry), `vendor/oh-my-pi` (`.omp/skills` + mode docs) or `vendor/gsd-omp` (GSD projection plugin); the HALO-specific work is the policy overlay that keeps every one of them inside the gate.

The single most important architectural fact, inherited verbatim from the locked decisions: **"One non-bypassable tool path: every LLM tool decision reaches exactly one locked backend through a single adapter and a single policy gate, so no policy (TDD enforcement, safety, memory routing) can be skipped by choosing the other runtime"** [VERIFIED: `.planning/PROJECT.md:9` via 04-RESEARCH.md:18]. Concretely: a dispatched tool row with no decision path is *a defect, not a placeholder state* [VERIFIED: 03-07-PLAN.md:155 via 04-RESEARCH.md:20]; `adapter.dispatch_batch` is *the only boundary a tool call may leave through* [VERIFIED: 03-07-PLAN.md:55 via 04-RESEARCH.md:21]. Phase 4 already reserved the exact slot this phase fills: the gate's per-turn policy snapshot includes a **`phase` (TDD phase) input slot**, and 04-RESEARCH.md:42 states explicitly "TDD-phase gate rules with evidence rows (EXT-05, Phase 11) — the `phase` input slot exists; the RED/GREEN/REFACTOR rule family does not ship" [VERIFIED: 04-RESEARCH.md:42]. The same document reserves "plugin host / MCP backends (Phase 11)" [VERIFIED: 04-RESEARCH.md:43]. Phase 11's job is to ship those reserved pieces, plus the extension surfaces, without creating a single path to a backend that does not pass `admit_batch` → `PolicyGate.evaluate` [VERIFIED: 04-DECISIONS.md D-G1, 04-RESEARCH.md:22-24].

The governance rules that shape every design decision in this phase: the gate is **pure** (no network, no model, no plugin call), **bounded** (p99 ≤ 5 ms; a timeout is a deny), **capability-keyed** (`write`/`patch`/`ast_edit` surface `fs.write`; `bash` surfaces `proc.exec`; unknown capability ⇒ denied), and **auditable** (every decision row stores `decision_id`, rule ids, verdict, SHA-256 of the canonicalized request, redaction list) [VERIFIED: 04-RESEARCH.md:24]. And the store principle: "Safety layer wins the gate. `pre_tool_call`, approvals, and policy live once, in Hermes' hook bus. Backends receive already-approved calls" [VERIFIED: `.planning/research/FEATURES.md:122-125` via 04-RESEARCH.md:25].

**Primary recommendation:** Build in this order — (1) **Wave 0:** verify the vendored mechanism seams against the imported tree (skill catalog scan + `skills_sync` seeding, `@hermes/plugin-sdk` areas, `kanban.db` dispatch, OMP `.omp/skills` validation fixtures) and pin + enumerate the `@opengsd/gsd-core` skill set; (2) **skills:** port the skill registry (SKILL.md model, catalog scan, `skills_list`/`skill_view` progressive disclosure) + hub install (index-cache + hub-lock provenance) + curator (inactivity/idle trigger, archive-only, pinned-skill bypass) with the TDD-cycle trigger and the Skills Store approval surface (EXT-01/06); (3) **gate TDD rules:** the RED/GREEN/REFACTOR rule family with evidence rows — the `phase` slot already exists, so this is rule-table + evidence-store work inside the existing pure gate (EXT-05); (4) **GSD TDD skills:** project the pinned gsd-core skill set into both `~/.halo/skills/` (Hermes registry) and the coding core's skill dir, with the coding-core extension host left **disabled** (EXT-04); (5) **plugin host:** the Desktop plugin host over the vendored SDK (pages/panes/widgets/commands areas) with the HALO policy overlay — namespace-scoped backend, no backend handles, deny-only hooks; a plugin reaching a backend fails (EXT-02); (6) **Kanban:** port the 15 registered kanban tools (reconcile the "14" requirement text — see Open Questions) + dispatcher (claim TTL, heartbeat stale-reclaim, zombie/orphan counters) + Desktop board plugin; worker spawns are gate-admitted sessions (EXT-03); (7) **advisor + modes:** advisor as a read-only second-model review pass inside the unified loop (no separate turn; notes injected into the same session), and plan/goal/vibe session modes + prewalk implemented as loop state that narrows the toolset and routes work to Phase-7 subagent workers (EXT-07/08).

## Phase Requirements

| ID | Description (verbatim, `.planning/REQUIREMENTS.md:106-113` [VERIFIED]) | Research Support |
|----|-------------|------------------|
| EXT-01 | "Skills registry supports install from the Hub, invocation, and curator-driven improvement" | §EXT-01 (skill model, catalog scan, hub index-cache + hub-lock, curator invariants, Skills Store UI) |
| EXT-02 | "Desktop plugin host provides pages, panes, widgets, and commands through a scoped backend with deny-only hooks and no backend handles" | §EXT-02 (plugin SDK areas + ctx, namespace-scoped REST, default-off inventory; HALO policy overlay) |
| EXT-03 | "Kanban board dispatches tasks with dependencies, heartbeats, reclaim, zombie detection, and all 14 kanban tools" | §EXT-03 (tool registry list — note 15 vs 14, claim TTL, heartbeat stale-reclaim, dispatch counters, dependency edges) |
| EXT-04 | "GSD TDD skills are installed as first-class skills in both the Hermes registry and the coding core's skill directory" | §EXT-04 (gsd-omp projection, gsd-core dependency, OMP `.omp/skills` + validation fixtures, Hermes skills dir) |
| EXT-05 | "TDD phase invariants are enforced at the gate, and RED→GREEN requires recorded failing-test evidence" | §EXT-05 (Phase 4 `phase` slot + RED/GREEN/REFACTOR rule family slot, gate purity/bound/audit properties, evidence rows) |
| EXT-06 | "Curator proposes skill improvements after a successful TDD cycle, visible in the Skills Store for approval" | §EXT-06 (curator fork via `skill_manage`, archive-only + pinned invariants, TDD-cycle trigger, approval surface) |
| EXT-07 | "Advisor second model reviews turns and injects notes without a separate turn" | §EXT-07 (advisor plugin semantics: read-only second model, [NIT]/[CONCERN]/[BLOCKER], hold-and-reconfirm, hook points, injection path) |
| EXT-08 | "Plan/goal/vibe loop modes and prewalk behavior live in the unified loop" | §EXT-08 (OMP vibe-mode director/worker model, plan/goal mutual exclusion, Phase 3 `run_turn` mode verbs vs session modes, prewalk) |

## Architectural Responsibility Map

Tiers follow the Phase 10 map convention (daemon = the Python `halo_agent` package; coding core = fused TS/Rust over RPC; gate = the Phase 4 policy gate).

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Skill registry (discover/scan/serve) | Daemon (Python `halo_agent`) | — | Vendored Hermes model: SKILL.md dirs, stat-signature catalog scan (30 s TTL), `skills_list`/`skill_view` progressive disclosure [VERIFIED: `vendor/hermes-agent/tools/skills_tool.py:1-5,33-41`] |
| Skill invocation | Daemon (loop + gate) | Coding core (RPC) | Invoking a skill = loading its text into the session, then acting with *normal tools* — those tool calls go through the gate exactly as any other call; the skill itself is never a bypass [VERIFIED: `vendor/hermes-agent/apps/desktop/src/AGENTS.md:55-56` (skill command → `{type: "skill", message}` submitted as a normal prompt)] |
| Hub install + provenance | Daemon (skill sync) | Desktop (Skills Store UI) | Vendored `skills_sync` seeding (`.bundled_manifest` v2 `name:hash`) + hub-lock backfill; UI = Capabilities ▸ Skills tab [VERIFIED: `vendor/hermes-agent/tools/skills_sync.py:1-7`; `vendor/hermes-agent/apps/desktop/src/app/capabilities/skills/` (skills-tab, skill-provenance)] |
| Curator (improvement proposals) | Daemon (background review) | Desktop (Skills Store approval) | Vendored curator: inactivity-triggered, archive-only, pinned-skill bypass, fork uses the auxiliary client; HALO replaces the bare fork with a gate-admitted review session [VERIFIED: `vendor/hermes-agent/agent/curator.py:1-41`] |
| Desktop plugin host (pages/panes/widgets/commands) | Desktop (Electron renderer) | Daemon (scoped REST per plugin) | Vendored `@hermes/plugin-sdk` contribution model (areas + `ctx`); the HALO overlay makes the backend namespace-scoped, handle-free and deny-only [VERIFIED: `vendor/hermes-agent/apps/desktop/src/sdk/areas.ts:1-37`; `vendor/hermes-agent/apps/desktop/src/plugins/kanban/plugin.tsx:5-9,81-88`] |
| Backend (Python) plugins | Daemon (Python `halo_agent`) | — | Vendored `plugins/<name>/plugin.yaml + provider.py` model; these are *backend providers* (web search etc.), a distinct system from the Desktop UI plugin host [VERIFIED: `vendor/hermes-agent/plugins/` layout] |
| Kanban dispatch (deps, heartbeats, reclaim, zombie) | Daemon (kanban dispatcher + `kanban.db`) | Coding core (worker sessions) | Vendored dispatcher: claim TTL 15 min, heartbeat stale-reclaim 1 h, dispatch counters (spawned/reclaimed/reconciled_orphans/reaped_terminal_workers/crashed/stale/timed_out/…); workers are gate-admitted HALO sessions [VERIFIED: `vendor/hermes-agent/hermes_cli/kanban_db.py:233-288`] |
| Kanban tools (14/15) | Daemon (tool registry, `toolset="kanban"`) | — | Registered with mode-gating (`_check_kanban_mode` vs `_check_kanban_orchestrator_mode`) and run-ownership CAS on lifecycle tools [VERIFIED: `vendor/hermes-agent/tools/kanban_tools.py:37-114,1295-1315`] |
| GSD TDD skills (both registries) | Daemon (skill projection) | Coding core (`.omp/skills` equivalent) | `gsd-omp install` projects managed skills/agents into the OMP host dir; gsd-core is the skill source [VERIFIED: `vendor/gsd-omp/README.md:38-55`, `vendor/gsd-omp/package.json:26-32`; OMP skill dir `vendor/oh-my-pi/.omp/skills/`] |
| TDD phase gate rules (RED/GREEN/REFACTOR + evidence) | Gate (Phase 4 `PolicyGate`) | Daemon (evidence store) | The `phase` input slot already exists in the per-turn policy snapshot; Phase 11 ships the rule family + evidence rows; must stay pure and p99 ≤ 5 ms [VERIFIED: 04-RESEARCH.md:24,42] |
| Coding-core extension host | — (disabled) | — | OUT OF SCOPE locked: "A public fourth plugin surface (coding-core extension host) — three plugin systems already exist; a fourth unsandboxed runtime doubles the trust boundary" [VERIFIED: `.planning/REQUIREMENTS.md` Out of Scope]; success criterion 4 requires it stay disabled |
| Advisor (second-model review) | Daemon (loop review pass) | — | Read-only second model over the turn transcript; notes injected into the same session (no separate turn); HALO ports it as a loop-resident pass, not a third-party plugin [VERIFIED: `vendor/hermes-agent/plugin-catalog/advisor.yaml:6-25`] |
| Plan/goal/vibe modes + prewalk | Daemon (unified loop state) | Coding core (RPC) / subagents (Phase 7) | OMP semantics: vibe = director + background worker subagents (fast/good tiers), mutually exclusive with plan/goal; Phase 3 `run_turn(mode: "prompt" | "steer" | "queue"/"follow_up")` are *turn-control verbs* — session modes are a new loop-state layer [VERIFIED: `vendor/oh-my-pi/docs/vibe-mode.md:1-22`; 03-AI-SPEC.md:185-194] |

## Standard Stack

This phase installs **one new external dependency** (`@opengsd/gsd-core`) and ports everything else from the four vendored MIT trees. No new architectural substrate is expected.

### Core (all vendored — verify, don't reinstall)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hermes skill machinery (`skills_tool`, `skill_manager_tool`, `skills_sync`, `skills_sync_optional`) | vendored (Phase 1 import) | SKILL.md model, catalog scan, hub-lock provenance, bundled seeding | The rebranding base for the skill registry; stat-signature scan (30 s TTL) + `.bundled_manifest` v2 already solved install/update/customization conflicts [VERIFIED: `vendor/hermes-agent/tools/skills_sync.py:1-7`, `skills_tool.py:33-41`] |
| Hermes curator (`agent/curator.py`) | vendored | Background skill maintenance: pin/archive/consolidate/patch via `skill_manage`; state in `skills/.curator_state` | Inactivity-triggered (no cron daemon), archive-only, pinned-skill bypass — exactly the invariants EXT-06 needs [VERIFIED: `vendor/hermes-agent/agent/curator.py:1-41`] |
| Hermes kanban (`tools/kanban_tools.py`, `hermes_cli/kanban_db.py` + `_dispatch`/`_owner_recovery`/`_diagnostics`/`_worker_client`) | vendored | Tool surface (15 registered tools) + dispatcher (claim TTL, stale-heartbeat reclaim, orphan reaping) | Battle-tested in upstream; the 15-minute claim TTL and 1-hour stale-heartbeat wedge rule are the heart of zombie detection [VERIFIED: `kanban_db.py:233-288`] |
| `@hermes/plugin-sdk` (Desktop) | vendored (Hermes-Desktop base) | Plugin contribution areas (routes/panes/statusbar/titlebar/keybinds/palette + data contributions) and `ctx` (rest/storage/socket/os/i18n/onDispose) | The Kanban plugin is the founding SDK-consumer exemplar: "No new backend, no core edits" [VERIFIED: `apps/desktop/src/plugins/kanban/plugin.tsx:1-10,81-88`] |
| OMP skill discovery/validation (`packages/coding-agent` skill loader + fixtures) | vendored | `.omp/skills` loading with frontmatter validation (name/description rules, name-mismatch, invalid-name-chars, long-name) | The coding core's skill directory contract that GSD TDD skills must satisfy [VERIFIED: `vendor/oh-my-pi/.omp/skills/` (3 bundled skills); `packages/coding-agent/test/fixtures/skills/*` fixture set] |
| gsd-omp (host plugin) | 1.0.25 (vendored) | Projects managed GSD extension/agents/skills into the OMP host; registers 39 slash commands + `gsd_invoke` | The sanctioned GSD→host binding (Host-Integration SDK v1) [VERIFIED: `vendor/gsd-omp/README.md:15-66`] |

### Supporting (new)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@opengsd/gsd-core` | ^1.12.0 (pin exact at Wave 0) | Source of the GSD skill set (TDD workflow policy included) | Installed as gsd-omp's dependency; Wave 0 must pin the resolved version and enumerate the projected skill set, because skill names/paths are the EXT-04 contract [VERIFIED: `vendor/gsd-omp/package.json:26-32` (`"dependencies": { "@opengsd/gsd-core": "^1.12.0" }`, `engines.node >=24.0.0`)] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vendored skill machinery | Reimplement skill loading | Re-creates 80+ files of provenance/dedup/setup logic (skills_tool + _plugin + _dedup + _setup) with no benefit; the manifest/hash model already handles user-customized vs bundled conflicts |
| `@hermes/plugin-sdk` areas | Custom plugin registration | The area constants (routes/panes/statusbar/titlebar/keybinds/palette) are the Desktop's stable contribution contract; custom registration would desync from the Kanban exemplar |
| gsd-core projection | Hand-copying GSD skills | Projection is versioned and re-runnable; hand-copying loses the gsd-core version↔skill-set binding and the `GSD_AGENTS_DIR` override contract [VERIFIED: `gsd-omp/README.md:49-55`] |
| Ported advisor pass | Running the third-party advisor plugin in the plugin host | The plugin host is scope-limited (EXT-02); a review pass that reads every turn transcript and injects notes is loop-resident infrastructure, not a scoped contribution |

**Installation:**
```bash
# New dependency (Wave 0) — inside the gsd-omp workspace
npm install   # resolves @opengsd/gsd-core ^1.12.0; record the exact resolved version
# Everything else: verify the vendored trees, do not re-source
bun install   # apps/desktop (vendored base)
uv sync --locked   # halo_agent (Phases 3-4) — no new packages expected in this phase
```

## Package Legitimacy Audit

> **Required** — this phase installs one new external package (`@opengsd/gsd-core`). The gsd-tools seam is not available in this research environment (no `gsd-tools.cjs` shim in the repo), so verdicts below use the package's declared provenance instead: gsd-omp is a MIT-licensed, actively-released npm package (v1.0.25) whose `package.json` declares the dependency, and `@opengsd/gsd-core` is the GSD Core package referenced by gsd-omp's own docs and CI. The planner must still run `gsd_run query package-legitimacy check --ecosystem npm @opengsd/gsd-core` at Wave 0 and paste the verdict.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@opengsd/gsd-core` | npm | ≥1.11.0 since 2025 (gsd-omp engines require `gsd >=1.11.0`) | unknown (not measured) | github.com/open-gsd/gsd-core [CITED: gsd-omp README badge link] | [SUS-unmeasured] — declared by a verified vendored package; repo + version line present in `package.json` | Flagged — planner inserts `checkpoint:human-verify` + run the seam at Wave 0; real risk low (it is the GSD core this entire workflow already runs on) |
| gsd-omp (vendored) | npm (already in tree) | 1.0.25 | — | github.com/tchivs/gsd-omp | [OK] (vendored, MIT) | Approved — verify at Wave 0 against the import manifest |
| Hermes skill/plugin/kanban/curator machinery (vendored) | — (in tree) | Phase 1 import | — | Phase 1 provenance manifest | [OK] (vendored) | Approved — verify at Wave 0 |
| `@hermes/plugin-sdk` (vendored) | — (in tree) | Phase 1 import | — | Phase 1 provenance manifest | [OK] (vendored) | Approved — verify at Wave 0 |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `@opengsd/gsd-core` (unmeasured — the seam is not runnable in this research environment; the declared provenance is clean).

*`@opengsd/gsd-core` is not tagged `[VERIFIED: npm registry]` because registry existence alone does not confer verified status and the legitimacy seam could not be run here; the planner gates its install behind `checkpoint:human-verify`.*

## Architecture Patterns

### System Architecture Diagram

```
                              ┌────────────────────────────────────────────────────────────┐
                              │              ONE DAEMON (Python, Phase 3)               │
                              │                                                       │
  ┌──────────┐  scoped REST  │  ┌──────────────────────────────────────────────────┐   │
  │ DESKTOP  │◄──────────────┼──┤  Plugin host (HALO overlay)                    │   │
  │ Electron │  /api/plugins/│  │  • pages (ROUTES_AREA)  panes (PANES_AREA)     │   │
  │ (Phase   │    <pluginId> │  │  • widgets (STATUSBAR/TITLEBAR)  commands      │   │
  │  10)     │  namespace-   │  │    (KEYBINDS/PALETTE)   ctx: rest/storage/    │   │
  └──────────┘  scoped, NO   │  │    socket/os — NO backend handles,            │   │
                             │  │    deny-only hooks                             │   │
                             │  └───────────────┬───────────────────────────────┘   │
                             │                  │ every call = a tool request        │
                             │                  ▼                                   │
  ┌──────────┐  WS (Phase   │  ┌──────────────────────────────────────────────────┐   │
  │    CLI   │◄──────────────┼──┤  ADMIT_BATCH → POLICY GATE (Phase 4, pure)    │   │
  │(Phase 10)│  loopback     │  │  per-turn snapshot: { phase(TDD), workspace    │   │
  └──────────┘               │  │  roots, approval cache, settings }            │   │
                             │  │  • RED/GREEN/REFACTOR rule family (NEW)       │   │
                             │  │  • verdict allow | deny | ask(→deny unattended)│   │
                             │  │  • decision rows: id, rules, SHA-256 request  │   │
                             │  └───────────────┬───────────────────────────────┘   │
                             │                  │ admitted only                     │
                             │  ┌───────────────▼───────────────────────────────┐   │
                             │  │  UNIFIED LOOP (Phase 3)                      │   │
                             │  │  run_turn(mode: prompt|steer|queue)          │   │
                             │  │  + SESSION MODES (NEW): plan/goal/vibe       │   │
                             │  │  + prewalk pass (NEW)                        │   │
                             │  │  + advisor review pass (NEW, read-only,      │   │
                             │  │    same-turn note injection)                │   │
                             │  │  skill_view loads skill text → agent acts    │   │
                             │  │  with normal tools (all gated)              │   │
                             │  └───────┬──────────────┬──────────────┬───────┘   │
                             │          │              │              │            │
                             │          ▼              ▼              ▼            │
                             │  ┌────────────┐ ┌──────────────┐ ┌──────────────┐  │
                             │  │ Skill      │ │ Curator      │ │ Kanban       │  │
                             │  │ registry   │ │ (background, │ │ dispatcher   │  │
                             │  │ + hub lock │ │  archive-    │ │ claim TTL 15m│  │
                             │  │ + skills   │ │  only) ─────►│  heartbeat    │  │
                             │  │ store UI   │ │  TDD-cycle  │  stale-reclaim │  │
                             │  │ (approval) │ │  trigger    │  zombie/orphan │  │
                             │  └────────────┘ └──────────────┘  counters      │  │
                             │                                  │              │  │
                             │  GSD TDD skills (both dirs):     │ worker      │  │
                             │  • ~/.halo/skills/  (Hermes)     │ sessions    │  │
                             │  • coding-core skill dir         ▼ (gate-      │  │
                             │    (.omp/skills equivalent)   admitted,        │  │
                             │                                 policy rows)   │  │
                             └────────────────────────────────────────────────┘
   GSD skills source: @opengsd/gsd-core (pinned) ── projected via gsd-omp install
   Hub install: index-cache (lobehub/openai/anthropics) → download → hub-lock provenance
   Coding-core extension host: DISABLED (out-of-scope lock)
```

A skill invocation, a plugin command, a kanban worker spawn, a curator review, and an advisor review all converge on the same path: **tool request → `admit_batch` → `PolicyGate.evaluate` → dispatch** [VERIFIED: 04-RESEARCH.md:22-24; 04-DECISIONS.md D-G1].

### Recommended Project Structure

Additive to the Phase 3–10 structure (names follow the prior plans' `halo_agent` package layout):

```
packages/halo_agent/
├── skills/                # NEW — port of the vendored skill machinery
│   ├── registry.py        #   catalog scan (stat signature, TTL), discovery
│   ├── hub.py             #   hub install: index cache, download, hub-lock provenance
│   ├── sync.py            #   bundled seeding (.bundled_manifest v2 name:hash)
│   └── curator.py         #   background maintenance (archive-only, pinned bypass)
├── gate/                  # Phase 4 package (existing in plan)
│   └── tdd_rules.py       # NEW — RED/GREEN/REFACTOR rule family + evidence rows
├── kanban/                # NEW — port of vendored dispatcher + db
│   ├── db.py              #   tasks, boards, dependency edges, notify subs
│   └── dispatch.py        #   claim TTL, heartbeat stale-reclaim, orphan reaping
├── extensions/            # NEW — loop-resident extension passes
│   ├── advisor.py         #   second-model review (read-only, same-turn injection)
│   └── modes.py           #   plan/goal/vibe session modes + prewalk
apps/desktop/
└── src/plugins/           # vendored base + HALO host overlay
    └── (host)            # NEW — scoped backend (namespace per plugin, no handles,
                         #    deny-only hooks) over the vendored @hermes/plugin-sdk
skills/ (repo root)        # GSD TDD skill projections (Hermes-registry side)
<coding-core>/skills/      # GSD TDD skill projections (coding-core side)
```

### Pattern 1: Skill = prompt document, never a tool
**What:** A skill is a directory holding `SKILL.md` (YAML frontmatter + instructions) plus optional `references/`, `templates/`, `assets/`, `scripts/` [VERIFIED: `vendor/hermes-agent/tools/skills_tool.py:1-5`]. Discovery is a per-session catalog scan with a stat-based change signature over every directory the catalog walks and a 30-second TTL bounding staleness from in-place `SKILL.md` edits [VERIFIED: `skills_tool.py:33-41`]. Invocation is progressive disclosure: `skills_list` returns name/description only; `skill_view` returns full content and linked files [VERIFIED: `skills_tool.py:1-5`]. A skill *command* resolves to `{type: "skill", message}` and is **submitted as a normal prompt** [VERIFIED: `apps/desktop/src/AGENTS.md:55-56`].
**When to use:** Always — this is the model. The agent then acts with normal tools; every one of those tool calls passes the gate as usual. The skill text itself has no execution power.
**HALO delta:** `skill_view` and `skills_list` are registered as normal tools in the Phase 4 registry (read capability) so their invocation is itself a policy decision; the TDD gate rules can deny skill loading in a sensitive phase.

### Pattern 2: Hub install = index → fetch → provenance-locked copy
**What:** The vendored `skills/` tree ships an `index-cache/` of hub catalogs — e.g. `lobehub_index.json` is `{"schemaVersion": 1, "agents": [{author, createdAt, homepage, identifier, meta: {avatar, description, tags, title, category}, tokenUsage, ...}]}` [VERIFIED: `vendor/hermes-agent/skills/index-cache/lobehub_index.json` head read this session]. `skills_sync.py` seeds bundled skills into the per-home `skills/` dir and tracks each synced skill's origin hash in `.bundled_manifest` (v2 `name:hash` lines); existing skills update only when the bundled copy changed **and** the user copy still matches the origin hash (else user-customized → skip); user-deleted skills are not re-added [VERIFIED: `skills_sync.py:1-7`]. `skills_sync_optional.py` is the "hub-lock backfill and restore" for official optional-skill provenance, with `_read_hub_install_paths` [VERIFIED: `skills_sync_optional.py:1-2`].
**When to use:** EXT-01 "install from the Hub." HALO is upstream-cut, so the hub is a **bundled snapshot** of these indexes (no live fetch by default; optional fetch behind a gate-approved `proc.exec`/network capability if the user opts in).
**HALO delta:** every hub install writes a hub-lock entry (source, identifier, hash, date) so provenance survives — this is what the Skills Store UI displays via `skill-provenance.ts` [VERIFIED: `apps/desktop/src/app/capabilities/skills/skill-provenance.ts` exists in the vendored tree].

### Pattern 3: Curator = inactivity-triggered, archive-only, gate-admitted review
**What:** The vendored curator is "inactivity-triggered (no cron daemon): when the agent is idle and the last run is older than `interval_hours`, `maybe_run_curator()` auto-transitions lifecycle states from activity timestamps, optionally forks an AIAgent that may pin/archive/consolidate/patch skills via skill_manage, and persists scheduler state in `.curator_state`. Invariants: only curator-managed skills are touched; **never delete, only archive (recoverable); pinned skills bypass all auto-transitions**; the fork uses the auxiliary client and never touches the main session's prompt cache" [VERIFIED: `vendor/hermes-agent/agent/curator.py:1-7`]. Defaults: `DEFAULT_INTERVAL_HOURS, DEFAULT_MIN_IDLE_HOURS = 24 * 7, 2`, `DEFAULT_STALE_AFTER_DAYS, DEFAULT_ARCHIVE_AFTER_DAYS = 14, 30`, `DEFAULT_CONSOLIDATE = False` [VERIFIED: `curator.py:31-35`].
**When to use:** EXT-01 "curator-driven improvement" + EXT-06 "after a successful TDD cycle." HALO adds a second trigger (a completed TDD cycle in session state) alongside the inactivity trigger, and routes the improvement fork as a **gate-admitted review session** (the upstream bare fork is replaced; the invariants are kept).
**HALO delta:** proposals (patches to skills) are not applied directly — they land in the **Skills Store for approval** (success criterion 1), i.e. a human decision precedes any `skill_manage` write.

### Pattern 4: Kanban dispatcher = claim TTL + heartbeat stale-reclaim + orphan counters
**What:** The vendored dispatcher tracks, per tick, counters whose non-zero value means the tick did something: `"spawned", "reclaimed", "promoted", "reconciled_orphans", "reaped_terminal_workers", "crashed", "stale", "timed_out", "auto_blocked", "rate_limited", "auto_assigned_default", "respawn_guarded", "skipped_per_profile_capped", "skipped_unassigned"` [VERIFIED: `vendor/hermes-agent/hermes_cli/kanban_db.py:233-237`]. Zombie/reclaim mechanics: "Claim window before the next tick reclaims a running task" `DEFAULT_CLAIM_TTL_SECONDS = 15 * 60`; "A live PID with a heartbeat older than this is wedged and reclaimed anyway … If a worker's PID is still alive but its `last_heartbeat_at` is older than this when `release_stale_claims` runs, treat the worker as wedged and reclaim regardless of PID liveness … This catches the logic-loop case where the process is technically running but not making observable progress" `DEFAULT_CLAIM_HEARTBEAT_MAX_STALE_SECONDS = 60 * 60` [VERIFIED: `kanban_db.py:276-288`].
**Tool surface:** 15 tools are registered under `toolset="kanban"`, in this order: `kanban_show, kanban_list, kanban_complete, kanban_block, kanban_schedule, kanban_request_review, kanban_request_changes, kanban_heartbeat, kanban_comment, kanban_attach, kanban_attach_url, kanban_attachments, kanban_create, kanban_unblock, kanban_link` [VERIFIED: `vendor/hermes-agent/tools/kanban_tools.py:1295-1310` — quoted verbatim]. **Note: the requirement text says 14; the source registers 15 — see Open Questions.**
**Gating (ported):** lifecycle tools (`kanban_complete`, `kanban_block`, `kanban_schedule`, `kanban_request_review`, `kanban_request_changes`) require a resolvable `HERMES_KANBAN_RUN_ID` for the run-ownership CAS; `_check_kanban_mode` shows lifecycle tools to dispatcher workers, `_check_kanban_orchestrator_mode` hides `kanban_list`/`kanban_unblock` from task workers [VERIFIED: `kanban_tools.py:107-114,1293-1314`]. Dependencies: `kanban_link` adds a parent→child edge "after the fact (cycles/self-links/running children → ValueError)" [VERIFIED: `kanban_tools.py:1274-1278`].
**When to use:** EXT-03. HALO delta: worker "spawn" = a gate-admitted HALO session (the GATE-04 bypass matrix explicitly lists "cron/Kanban workers" as entry points that must produce a policy decision) [VERIFIED: ROADMAP Phase 12 success criterion 4 via 04-RESEARCH.md:26].

### Pattern 5: Plugin host = areas + scoped ctx; HALO overlay = no handles, deny-only
**What (vendored):** a plugin is `HermesPlugin = { id, name, description, defaultEnabled, register(ctx) }`; the Kanban exemplar reuses the existing REST router "through `ctx.rest` (namespace-scoped to `/api/plugins/kanban`). No new backend, no core edits" and ships `defaultEnabled: false` — "it inventories in Capabilities ▸ Plugins and registers nothing until the user flips the switch" [VERIFIED: `apps/desktop/src/plugins/kanban/plugin.tsx:1-10,81-88`]. Contribution areas: `PANES_AREA = 'panes'`, `STATUSBAR_AREAS = { left: 'statusBar.left', right: 'statusBar.right' }`, `TITLEBAR_AREAS = { center/left/right }` (permanent mount points), `ROUTES_AREA`, `SIDEBAR_NAV_AREA`, `KEYBINDS_AREA`, `PALETTE_AREA`, plus data contributions (`KANBAN_CARD_AREAS.badges` with per-plugin caps, `TOOL_MEDIA_RENDERER_AREA`) [VERIFIED: `apps/desktop/src/sdk/areas.ts:1-37`].
**What (HALO overlay — the part that does not exist upstream yet):** the plugin backend is **namespace-scoped** (a plugin may only reach `/api/plugins/<id>` — the vendored kanban plugin already demonstrates the pattern), exposes **no backend handles** (no raw daemon token, no session-store access, no direct sidecar control — consistent with UI-03 "the renderer holds no daemon token" [VERIFIED: ROADMAP Phase 10 success criteria]), and its hooks are **deny-only**: a plugin hook can veto an operation (produce a deny), never allow or mutate one. A plugin that tries to reach a backend outside its namespace fails by construction.
**When to use:** EXT-02. The Kanban board, the Skills Store, and the Plugins inventory page are all plugin/contrib surfaces on this host.

### Pattern 6: GSD TDD skills = projected once, installed in two skill dirs
**What:** `gsd-omp` is "an independently maintained Oh My Pi host plugin … that binds OMP's native extension, command, event, task, and filesystem surfaces to GSD through protocol version 1 of the public Host-Integration SDK" [VERIFIED: `vendor/gsd-omp/README.md:15`]. `gsd-omp install` "project[s] its managed extension, agents, and skills into OMP" under `PI_CODING_AGENT_DIR` or `~/.omp/agent` [VERIFIED: `README.md:40-47`]; the in-session extension exports `GSD_AGENTS_DIR` (defaulting to `~/.omp/agent/agents`) as "the highest-priority override in gsd-core's `getAgentsDir` contract" [VERIFIED: `README.md:49-53`]; it "registers 39 core slash commands and the `gsd_invoke` tool" [VERIFIED: `README.md:70`]. The skill/agent content itself comes from `@opengsd/gsd-core` (declared dependency `^1.12.0`) [VERIFIED: `package.json:26-28`]. The OMP skill dir contract: `.omp/skills/<name>/SKILL.md` with frontmatter validation (fixtures cover `no-frontmatter`, `missing-description`, `name-mismatch`, `invalid-name-chars`, `consecutive-hyphens`, `long-name`) [VERIFIED: `vendor/oh-my-pi/.omp/skills/` (3 bundled: tool-prompt-optimization, system-prompts, semantic-compression) + `packages/coding-agent/test/fixtures/skills/*`].
**When to use:** EXT-04. HALO runs the projection (or an equivalent copy) so the same pinned GSD skill set lands in (a) the Hermes-registry skills dir and (b) the coding core's skill dir — one version, two locations, both validated by the respective loader.
**HALO delta:** the coding-core **extension host stays disabled** (out-of-scope lock: "A public fourth plugin surface … doubles the trust boundary" [VERIFIED: REQUIREMENTS.md Out of Scope]) — only the *skills* are projected; the gsd-omp extension/commands surface is not registered into the coding core.

### Pattern 7: TDD gate rules = pure rule family over the `phase` slot + evidence rows
**What:** The gate is "Pure. No network, no model, no plugin call. Inputs are the request plus an immutable per-turn snapshot of policy state (TDD phase, workspace roots, approval cache, settings). Bounded. p99 ≤ 5 ms; a timeout is a deny. Capability-keyed … Auditable. Every decision row stores decision_id, rule ids, verdict, a SHA-256 of the canonicalized request, and redaction list" [VERIFIED: 04-RESEARCH.md:24]. Phase 4 reserved the exact slot: "TDD-phase gate rules with evidence rows (EXT-05, Phase 11) — the `phase` input slot exists; the RED/GREEN/REFACTOR rule family does not ship" [VERIFIED: 04-RESEARCH.md:42].
**When to use:** EXT-05. The rule family (shipped in Phase 11): in phase `RED`, only test-writing/running is admitted (source edits that would make the test pass are denied, or routed to `ask`→deny-unattended); in phase `GREEN`, **admission of the phase transition itself requires an evidence row** — a recorded failing-test run (test id, exit status, output hash) tied to the session + phase — i.e. RED→GREEN without recorded failing-test evidence is a deny with a rule id the UI can explain. Evidence rows are append-only store rows (data owner wins the store); the gate reads them by indexed lookup to stay inside the 5 ms budget.
**HALO delta:** none — this is exactly the reserved slot being filled.

### Pattern 8: Advisor = read-only second-model review inside the loop, same-turn notes
**What:** The advisor catalog entry: "A persistent second model reviews every agent turn. After each turn the plugin hands the transcript to the model you nominate as advisor and delivers its findings as advice in the same session: [NIT], [CONCERN] or [BLOCKER] notes, held back until a later review raises the same point again, so the primary agent is not interrupted by a one-off remark. It reviews, it does not act: the advisor never edits files, calls tools or changes session state, and only reads the turn transcript." Hooks: `provides_hooks: [post_llm_call, on_session_finalize]`; "Advice is injected into the live conversation with ctx.inject_message … state is kept under $HERMES_HOME/advisor/" [VERIFIED: `vendor/hermes-agent/plugin-catalog/advisor.yaml:6-25`]. Known issues (ported semantics): reviews run in the background "so a long advisor call delays advice, not the agent"; "Concerns are only delivered once a later review repeats them (hold-and-reconfirm)"; "The cross-provider trust gate is conservative" [VERIFIED: `advisor.yaml:20-23`].
**When to use:** EXT-07. HALO ports it as a **loop-resident review pass** (not a third-party plugin): after turn finalization, a background review (scheduler lane L2/L3 territory, Phase 9) reads the turn transcript, and deliverable notes are **injected into the same session** as queued context — no separate turn is started, and the advisor never holds a tool surface.
**HALO delta:** the "second model" is resolved through the existing model provisioning; the hold-and-reconfirm de-duplication is kept (a one-off [NIT] stays silent; a repeated [CONCERN]/[BLOCKER] is delivered).

### Pattern 9: Plan/goal/vibe = session modes that narrow the toolset; prewalk = pre-turn pass
**What:** OMP's vibe mode: "Vibe mode turns the top-level interactive session into a **director** for persistent background worker sessions instead of letting it edit or execute commands itself. The director's active tools are reduced to `read`, optional parent-owned `todo`, and five worker-control tools" — `vibe_spawn { cli: "fast" | "good", prompt, name? }`, `vibe_send`, `vibe_wait`, `vibe_kill`, `vibe_list` [VERIFIED: `vendor/oh-my-pi/docs/vibe-mode.md:1-45`]; tiers: "`fast` = bundled `sonic` (mechanical execution), `good` = bundled `task` (design, judgment calls)" [VERIFIED: `vibe-mode.md:26-35`]; "Vibe mode is mutually exclusive with both active **and paused** plan/goal modes; exit those modes first" [VERIFIED: `vibe-mode.md:18`]. Prewalk: a per-worker pre-task pass ("workers normally omit `todo`, except when their own prewalk handoff requires it" [VERIFIED: `vibe-mode.md:3`); the full spec is `vendor/oh-my-pi/docs/prewalk.md` (file verified present; body not read — Open Question). The Phase 3 loop already has `run_turn(loop, session_id, user_text, mode: str)` with `mode: "prompt" | "steer" | "queue"/"follow_up"` — these are **turn-control verbs, not session modes** [VERIFIED: 03-AI-SPEC.md:185-188].
**When to use:** EXT-08. HALO adds a **session-mode layer** (plan / goal / vibe) on top of the turn verbs: a mode is loop state that (a) narrows the admitted toolset for the session (vibe → `read` + todo + worker control; plan → read + planning tools; goal → goal-tracking + normal tools), (b) gates mode transitions (vibe ↔ plan/goal mutual exclusion), and (c) routes worker work to **Phase-7 subagent sessions** (the `fast`/`good` tiers map to HALO's subagent profiles — no new worker runtime is built). Prewalk is a pre-task pass the loop runs before dispatching a worker turn.
**HALO delta:** the mode's toolset narrowing is expressed as the per-turn policy snapshot (`settings` input) — the gate still decides every call; a mode never grants capability, it only constrains it.

### Anti-Patterns to Avoid
- **Giving a plugin a raw backend handle (token, store, sidecar socket):** the scoped-backend invariant (EXT-02) exists so a plugin's blast radius is its namespace; a raw handle re-creates the renderer-token leak UI-03 forbids and makes the GATE-04 bypass matrix unprovable.
- **Registering a skill as a tool:** a skill is prompt content; registering `skill_foo` as an executable tool creates a second, ungoverned execution path. Skills load; *tools* execute.
- **Bypassing the gate for "internal" paths (curator fork, kanban worker spawn, advisor injection, skill install writes):** every one of these is an entry point on the GATE-04 bypass matrix [VERIFIED: 04-RESEARCH.md:26]; an internal shortcut is exactly the policy skip the Core Value forbids.
- **Applying curator patches directly:** "never delete, only archive (recoverable)" + the Skills Store approval step — auto-applying improvements breaks recoverability and the success criterion.
- **Hand-rolling worker runtimes for vibe mode:** OMP's worker tiers map to Phase-7 subagent sessions; a bespoke spawner is a second agent loop (an explicit Out-of-Scope: "Second autonomous agent loop … violates Core Value").
- **Shipping TDD rules outside the pure gate (network/model checks in `evaluate`):** the 5 ms bound and purity are load-bearing; evidence lookup must be an indexed local read.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Skill discovery/scan | Custom skill-directory scanner | Vendored `skills_tool` catalog scan (stat signature + 30 s TTL) | Already handles mtime-coarse ticks (child dir names in the signature), excluded/support dirs, and disabled sets [VERIFIED: `skills_tool.py:33-53`] |
| Skill install conflict resolution | Naive copy-overwrite | Vendored `skills_sync` manifest model (`.bundled_manifest` v2 `name:hash`; user-customized → skip; user-deleted → not re-added) | Hand-rolled overwrites destroy user edits; the hash model distinguishes "user changed it" from "upstream changed it" [VERIFIED: `skills_sync.py:1-7`] |
| Skill provenance | Ad-hoc metadata files | Vendored hub-lock backfill (`skills_sync_optional`) + Skills Store `skill-provenance.ts` | Provenance must survive sync/restore; the hub-lock is the single source [VERIFIED: `skills_sync_optional.py:1-2`] |
| Kanban zombie/orphan detection | Custom process-poll loop | Vendored `kanban_db` dispatcher: claim TTL (15 min) + `release_stale_claims` with the 1 h stale-heartbeat wedge rule + the 14 dispatch counters | The PID-alive-but-wedged logic-loop case is exactly what the heartbeat rule catches [VERIFIED: `kanban_db.py:276-288`] |
| Skill run-ownership (CAS) | Ad-hoc locking | Vendored `_RUN_LIFECYCLE_TOOLS` + `HERMES_KANBAN_RUN_ID` expected_run_id CAS in `kanban_db` | An unbound worker would "silently skip the run-ownership CAS" and race the dispatcher [VERIFIED: `kanban_tools.py:107-114`] |
| Desktop plugin contribution | Custom registration API | Vendored `@hermes/plugin-sdk` areas + `ctx` (the Kanban plugin is the reference consumer) | The areas are the Desktop's stable contract; the SDK already provides storage/socket/i18n/onDispose lifecycle [VERIFIED: `sdk/areas.ts:1-37`; `plugin.tsx:1-10`] |
| GSD skill distribution | Hand-copied, versionless skill files | gsd-omp projection of the pinned `@opengsd/gsd-core` skill set | Keeps the version↔skill-set binding and the `GSD_AGENTS_DIR` override contract [VERIFIED: `gsd-omp/README.md:40-55`] |
| Skill frontmatter validation (coding core) | Custom parser | OMP's existing skill loader validation (the `test/fixtures/skills/*` fixture set is the spec) | The fixtures define the contract (no-frontmatter, missing-description, name-mismatch, invalid-name-chars, consecutive-hyphens, long-name) [VERIFIED: fixture listing] |
| Advisor de-duplication | Ad-hoc note filtering | Ported hold-and-reconfirm (deliver a concern only when a later review repeats it) | Prevents one-off [NIT] noise; it is the advisor's documented delivery semantics [VERIFIED: `advisor.yaml:20-22`] |
| Policy decision storage | Per-extension bespoke logs | The Phase 4 decision-row model (decision_id, rule ids, verdict, SHA-256 of canonicalized request, redaction list) | "A dispatched tool row with no decision path is a defect, not a placeholder state" [VERIFIED: 03-07-PLAN.md:155 via 04-RESEARCH.md:20] |

**Key insight:** this phase is a port, not an invention. Every mechanism has a vendored implementation that upstream has stress-tested; the only genuinely new code is the HALO policy overlay (scoped/deny-only plugin host, TDD rule family + evidence rows, TDD-cycle curator trigger, loop-resident advisor, session-mode layer). Hand-rolling any of the ported pieces re-introduces bugs upstream already fixed (mtime ticks, CAS races, wedged-PID reclaims, user-customized-skill conflicts).

## Common Pitfalls

### Pitfall 1: 14 vs 15 kanban tools
**What goes wrong:** the plan asserts "all 14 kanban tools" and the test matrix misses one, or the plan ships 15 and the acceptance test fails.
**Why it happens:** the requirement text (EXT-03) says 14; the vendored source registers 15 (`kanban_show, kanban_list, kanban_complete, kanban_block, kanban_schedule, kanban_request_review, kanban_request_changes, kanban_heartbeat, kanban_comment, kanban_attach, kanban_attach_url, kanban_attachments, kanban_create, kanban_unblock, kanban_link`) [VERIFIED: `kanban_tools.py:1295-1310`].
**How to avoid:** reconcile in Wave 0 (count the tools the source registers; treat the source as the implementation truth and record the reconciliation in the plan).
**Warning signs:** a test that hard-codes "14" while the registry registers 15.

### Pitfall 2: Treating a skill as an executable
**What goes wrong:** `skill_view` output is treated as a command surface, or a skill's `scripts/` are executed on load.
**Why it happens:** SKILL.md carries `scripts/` dirs (e.g. `skills/research/arxiv/scripts/search_arxiv.py` [VERIFIED: skills tree listing]); scripts run only when the agent explicitly invokes a normal tool (terminal) with a gate decision.
**How to avoid:** registration keeps skills read-only; any script execution is an ordinary `proc.exec`/terminal call.
**Warning signs:** a code path that shells out during `skill_view`.

### Pitfall 3: Plugin escapes the namespace
**What goes wrong:** a plugin reaches the daemon directly (token, store, sidecar) because the host handed it a raw handle.
**Why it happens:** the upstream `ctx` already carries `ctx.socket` and `ctx.rest` — an unscoped port would let a plugin talk to the whole backend.
**How to avoid:** the HALO overlay restricts `ctx.rest` to `/api/plugins/<id>` (the vendored kanban plugin already uses exactly this shape [VERIFIED: `plugin.tsx:5-9`]), drops raw handles, and makes hooks deny-only; add the bypass-matrix test "a plugin that tries to reach a backend fails" (success criterion 2).
**Warning signs:** any plugin code path with an un-namespaced URL or a raw token.

### Pitfall 4: TDD evidence gap
**What goes wrong:** RED→GREEN is admitted because no evidence row exists to check.
**Why it happens:** the gate snapshot has the `phase` slot, but if the evidence store is not written on the recorded failing-test run, the rule family has nothing to match — and a rule that can't find evidence must **deny** (fail-closed), which is only discoverable if the test asserts it.
**How to avoid:** evidence rows are append-only and written by the test-run tooling (a gate-admitted call) at the moment of a recorded failure; the RED→GREEN rule denies when no matching row (test id + failing exit status + output hash, session + phase) exists.
**Warning signs:** a GREEN-phase admission with `rule_ids` not citing the evidence rule.

### Pitfall 5: gsd-core version drift
**What goes wrong:** the projected GSD skill set silently changes between gsd-core patch releases, breaking skill-name assertions or the two-dir consistency (Hermes dir ≠ coding-core dir).
**Why it happens:** the dependency is declared `^1.12.0` (range, not exact) [VERIFIED: `package.json:26-28`].
**How to avoid:** pin the exact resolved version in the lockfile; Wave 0 enumerates the skill set and stores the enumeration as a test fixture; a projection test asserts dir-to-dir equality of names/paths.
**Warning signs:** the two skill dirs disagree on name or count.

### Pitfall 6: Curator delete / un-pinned auto-transition
**What goes wrong:** a "cleanup" permanently removes a skill, or a pinned skill is archived.
**Why it happens:** the invariants live in the curator's docstring and must be re-asserted by tests in the port: "never delete, only archive (recoverable); pinned skills bypass all auto-transitions" [VERIFIED: `curator.py:1-7`].
**How to avoid:** port the invariants verbatim and add a test that a pinned skill survives a full curator cycle and that every "removal" is an archive row.
**Warning signs:** a curator cycle that shrinks the skill count rather than moving it to the archive set.

### Pitfall 7: Advisor on a separate turn
**What goes wrong:** the advisor "review" spawns a new user turn, breaking "inject notes without a separate turn" (EXT-07) and double-charging the transcript.
**Why it happens:** the upstream plugin delivers advice "queued into the CLI session as a user-role message, which starts or interrupts an agent turn" [VERIFIED: `advisor.yaml:6` — that is the *upstream* behavior HALO must not copy verbatim].
**How to avoid:** the HALO pass injects notes as queued context consumed by the *current or next* turn's prompt assembly, with no new turn row; hold-and-reconfirm de-duplicates [VERIFIED: `advisor.yaml:20-22`].
**Warning signs:** a new turn row with author `advisor` in the transcript store.

### Pitfall 8: Mode narrows nothing / grants something
**What goes wrong:** a "vibe mode" that doesn't actually reduce the director's toolset, or a mode that *adds* capability outside the gate.
**Why it happens:** the mode is loop state; the actual narrowing happens in the per-turn policy snapshot. If the port forgets to feed the mode into the snapshot, the gate sees the full toolset.
**How to avoid:** express the mode as a `settings`-input constraint on the per-turn snapshot; add a test: in vibe mode a director `write`/`bash` request is denied by a rule id citing the mode; plan↔vibe mutual exclusion enforced at transition [VERIFIED: `vibe-mode.md:18`].
**Warning signs:** a denied-by-mode rule id never appearing in decision rows while a mode is active.

### Pitfall 9: Windows path handling in skill dirs
**What goes wrong:** skill discovery or GSD projection breaks on non-ASCII or spaced paths (`C:\Users\Jakub Novák\...`).
**Why it happens:** the vendored code already handles UTF-8 stdout reconfigure for Windows locales [VERIFIED: `skills_sync.py:19-25`] but path joining in the port must stay in `pathlib`/argv-array form.
**How to avoid:** no `shell=True`, no string-concatenated paths in projection; add the CI test with a spaced + diacritic path (the same discipline STACK.md demands for PostgreSQL).
**Warning signs:** a projection test that only uses ASCII temp dirs.

### Pitfall 10: Gate budget blowout on evidence lookup
**What goes wrong:** the TDD rule family makes a slow lookup (file scan / network) inside `evaluate`, pushing p99 past 5 ms — "a timeout is a deny" [VERIFIED: 04-RESEARCH.md:24] means a slow gate is a *denying* gate.
**Why it happens:** evidence rows are easy to make into a full-text search.
**How to avoid:** evidence rows are indexed (session id + phase + test id) point lookups in the single-writer store; benchmark the rule family in the gate's existing budget test.
**Warning signs:** gate p99 regression in the Phase-4 budget test after enabling TDD rules.

## Code Examples

Verified patterns from the vendored sources (signatures quoted verbatim where they are the contract):

### Skill catalog scan (signature + TTL)
```python
# Source: vendor/hermes-agent/tools/skills_tool.py:33-41 (read this session)
# Per-session discovery cache: {cache_key: (signature, timestamp, skills_list)}. Signature =
# every catalog directory's mtime and child-dir names, walked like the catalog itself (an install
# under an existing category such as ``mlops/training/`` moves only that dir's mtime) + the disabled
# set (config-only change, no mtime) + platform; the TTL bounds staleness from in-place SKILL.md
# edits, which no directory signature can see.
_SKILLS_CACHE: dict = {}
_SKILLS_CACHE_TTL_SECONDS = 30.0
# Deepest directory the signature descends to below a root (a skill sits at <cat>/<sub>/<skill>/).
_SIGNAIRE_MAX_DEPTH = 6   # (verbatim: _SIGNATURE_MAX_DEPTH)
```
HALO ports this 1:1 into `halo_agent/skills/registry.py`; the cache key adds the profile id.

### Kanban dispatch constants
```python
# Source: vendor/hermes-agent/hermes_cli/kanban_db.py:276-288 (read this session)
# Claim window before the next tick reclaims a running task; long workers
# ``heartbeat_claim`` or raise it via HERMES_KANBAN_CLAIM_TTL_SECONDS.
DEFAULT_CLAIM_TTL_SECONDS = 15 * 60

# A live PID with a heartbeat older than this is wedged and reclaimed anyway
# (``_touch_activity`` keeps genuinely active workers fresh).
DEFAULT_CLAIM_HEARTBEAT_MAX_STALE_SECONDS = 60 * 60
```
The dispatch tick reports `spawned, reclaimed, promoted, reconciled_orphans, reaped_terminal_workers, crashed, stale, timed_out, auto_blocked, rate_limited, auto_assigned_default, respawn_guarded, skipped_per_profile_capped, skipped_unassigned` [VERIFIED: `kanban_db.py:233-237`]. HALO maps the counters to the lane-scheduler metrics (Phase 9 observability) and to the Kanban board's run-clock UI (the vendored `run-clock.test.tsx` covers it).

### Plugin registration (the contract surface)
```tsx
// Source: vendor/hermes-agent/apps/desktop/src/plugins/kanban/plugin.tsx:81-88 (read this session)
const plugin: HermesPlugin = {
  id: 'kanban',
  name: 'Kanban',
  description: 'Multi-agent task board — board page, sidebar entry, and a live in-flight count in the status bar.',
  defaultEnabled: false,
  register(ctx) {
    ctx.i18n.register(KANBAN_LOCALES)
    ctx.onDispose(bindApi(ctx.rest, ctx.storage, ctx.socket, { os: ctx.os, t: ctx.i18n.t }))
    // ... contributions into ROUTES_AREA, SIDEBAR_NAV_AREA, STATUSBAR_AREAS, KEYBINDS_AREA, PALETTE_AREA
  }
}
```
HALO overlay: `ctx.rest` is namespace-scoped to `/api/plugins/<id>` (the vendored plugin already assumes exactly this: "namespace-scoped to `/api/plugins/kanban`" [VERIFIED: `plugin.tsx:5-9`]); `ctx.socket` is replaced by a scoped message channel; hooks are deny-only.

### TDD gate rule (shape, per the Phase 4 contract)
```python
# HALO code (new) — shaped by 04-RESEARCH.md:24 (gate properties) and 04-RESEARCH.md:42 (reserved slot)
def tdd_transition_rule(req: ToolRequest, snap: PolicySnapshot) -> Verdict:
    # snap.phase: "RED" | "GREEN" | "REFACTOR" (the slot Phase 4 reserved)
    if req.phase_transition == ("RED", "GREEN") and not evidence_store.has_failing_run(
            session=req.session_id, phase="RED", test_id=req.test_id):
        return Verdict("deny", rule_ids=("tdd_no_failed_evidence",))   # fail-closed
    if snap.phase == "GREEN" and req.capability in ("fs.write",) and not req.is_test_related:
        return Verdict("ask", rule_ids=("tdd_green_source_edit",))    # ask → deny-unattended (D-ASK)
    return Verdict("allow", rule_ids=())
```
Note the `ask` → `verdict='deny'` with `rule_ids=('unattended',)` until the Phase 10 approval surface lands [VERIFIED: 04-DECISIONS.md D-ASK].

### GSD projection (two dirs, one pinned version)
```bash
# Wave 0 / install (mirrors vendor/gsd-omp/README.md:40-55 semantics)
npm install            # resolves the PINNED @opengsd/gsd-core (exact version recorded)
gsd-omp install       # projects managed skills/agents (GSD_RUNTIME=omp; GSD_AGENTS_DIR honored)
# HALO delta: additionally copy the same projected skill set into the Hermes-registry dir,
# then assert dir-to-dir equality (names + frontmatter hashes) in a test fixture.
```

### Curator state + invariants
```python
# Source: vendor/hermes-agent/agent/curator.py:31-41 (read this session)
DEFAULT_INTERVAL_HOURS, DEFAULT_MIN_IDLE_HOURS = 24 * 7, 2  # 7 days
DEFAULT_STALE_AFTER_DAYS, DEFAULT_ARCHIVE_AFTER_DAYS = 14, 30
# The LLM consolidation fork is opt-in; the deterministic inactivity prune
# (apply_automatic_transitions) always runs when the curator is enabled.
DEFAULT_CONSOLIDATE = False

def _state_file() -> Path:
    return get_hermes_home() / "skills" / ".curator_state"
```
HALO: the state file moves to the HALO home; a second trigger (TDD cycle completed) wakes `maybe_run_curator()`; proposals route to the Skills Store approval surface instead of applying.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Skills as static bundled docs | Progressive-disclosure skill registry (list → view) + hub install with provenance lock + curator lifecycle | upstream Hermes (pre-import) | EXT-01/06 ports the whole lifecycle; HALO adds the TDD-cycle trigger and the approval gate |
| Desktop extensions = core edits | SDK contribution areas + `ctx` (pages/panes/widgets/commands), plugins default-off, inventories in Capabilities | upstream Hermes-Desktop (pre-import) | EXT-02 is an overlay on a stable SDK; "no core edits" is the design rule [VERIFIED: `plugin.tsx:5-9`] |
| Kanban as shell-outs (`hermes kanban` CLI) | In-process structured tool calls (`tools/kanban_tools.py`) with mode-gating + run-ownership CAS | upstream Hermes (pre-import): "Tools rather than `hermes kanban` shell-outs: they run in the agent's process (reach `kanban.db` from a container/SSH terminal backend, no shlex quoting of JSON metadata, structured-JSON failures)" [VERIFIED: `kanban_tools.py:1-7`] | Port keeps the tool shape; worker spawn is re-targeted at gate-admitted HALO sessions |
| GSD as a standalone CLI tree | gsd-omp host plugin projecting GSD into an agent host (Host-Integration SDK v1) | gsd-omp 1.0.25 [VERIFIED: `package.json:2-4`] | EXT-04 uses the projection contract; HALO disables the extension surface, keeps only the skills |
| Review = a second chat / separate turn | In-session advisor pass (hold-and-reconfirm, read-only) | advisor plugin 1.2.0 [VERIFIED: `advisor.yaml:4-6`] | EXT-07 ports the pass as loop-resident; the upstream "starts or interrupts an agent turn" delivery is explicitly *not* copied |
| Modes = CLI slash commands only (`/vibe`) | Session-mode state that narrows the policy snapshot + subagent workers | OMP (pre-import) | EXT-08 maps the OMP mode semantics onto the unified loop's per-turn snapshot; workers = Phase-7 subagents |

**Deprecated/outdated:**
- Direct `hermes kanban` shell-outs: superseded by the structured tool surface (see above) — do not re-introduce shlex-quoted JSON metadata.
- Upstream advisor delivery via a user-role message that starts a turn: superseded for HALO by same-session context injection (EXT-07).
- Bare `override=True` tool-name shadowing: HALO "removes the override path entirely" [VERIFIED: 04-RESEARCH.md:23] — extension surfaces must never shadow a registered tool name.

## Assumptions Log

| # | Assumption | Basis | Consequence if wrong |
|---|-----------|-------|---------------------|
| 1 | The 15th registered kanban tool (source registers 15: `kanban_show … kanban_link`) is in scope — the requirement text's "14" is stale or excludes one tool (e.g. `kanban_link`) | `kanban_tools.py:1295-1310` registers 15 [VERIFIED]; EXT-03 says 14 [VERIFIED: REQUIREMENTS.md:106-113] | Test matrix miscounts; reconciled in Wave 0 (source = implementation truth) |
| 2 | `@opengsd/gsd-core`'s skill set (names, paths, frontmatter) cannot be enumerated from the vendored tree — gsd-omp is a thin Node package (34 files) that *projects* gsd-core's skills at install time | `vendor/gsd-omp/` has no `skills/` tree [VERIFIED this session]; `README.md:40-55` describes projection; `package.json:26-28` declares `^1.12.0` | Wave 0 must pin the exact resolved version and capture the enumeration as a fixture; EXT-04's "both dirs equal" test depends on it |
| 3 | `prewalk.md`'s full semantics (handoff format, todo-omission rules, per-worker pre-task pass details) follow the references found in `vibe-mode.md` | `vibe-mode.md:3` ("workers normally omit `todo`, except when their own prewalk handoff requires it") [VERIFIED]; `vendor/oh-my-pi/docs/prewalk.md` verified present, body not read | Prewalk port may miss details; Wave 0 reads the body before implementing the pre-task pass |
| 4 | HALO's hub is a **bundled snapshot** of the vendored `index-cache/` catalogs (lobehub, openai), not a live service | HALO is upstream-cut (PROJECT.md constraint); `skills/index-cache/lobehub_index.json` ships with the vendored tree [VERIFIED head read] | If live fetch is wanted later, it is an add-on behind a gate-approved network capability — the install/provenance model (hub-lock) is unchanged |
| 5 | The coding core's skill dir is the OMP `.omp/skills/` equivalent (layout + frontmatter validation per the coding-agent fixtures) | `vendor/oh-my-pi/.omp/skills/` (3 bundled skills) + `packages/coding-agent/test/fixtures/skills/*` fixture set [VERIFIED] | Phase 5's final skill-dir path (planned, unexecuted) may name it differently; the *contract* (SKILL.md + frontmatter validation) is what is assumed |
| 6 | The TDD phase (RED/GREEN/REFACTOR) for the per-turn gate snapshot is written into session state by Phase 11's extension (the session state layer from Phase 3 already exists; the TDD-phase writer is this phase's) | 04-RESEARCH.md:42 reserves the `phase` slot; 03-AI-SPEC.md:185-188 defines `run_turn` without a TDD phase | If Phase 3's session state already carries TDD phase, the writer is a thinner adapter |
| 7 | The advisor's "second model" is resolved through the existing model provisioning/settings (no new sidecar) | `advisor.yaml:6-25` (a model is nominated; no runtime of its own) [VERIFIED] | A dedicated model config surface may be added in the Settings page (Phase 10) — additive, not a new runtime |

## Open Questions

1. **14 vs 15 kanban tools (blocking for the test matrix).** EXT-03 says "all 14 kanban tools"; `kanban_tools.py` registers 15 [VERIFIED: `kanban_tools.py:1295-1310`]. Which is the exclusion, if any? **Decision needed at Wave 0**; default: ship 15, correct the requirement text in the phase plan.
2. **GSD TDD skill set enumeration.** Which skills of `@opengsd/gsd-core` are the "GSD TDD skills" (names/paths)? Cannot be enumerated without running the pinned package. **Wave 0 checkpoint:human-verify** after the package-legitimacy seam + enumeration fixture.
3. **prewalk.md full spec.** Read the body before implementing the pre-task pass (Assumption 3).
4. **TDD phase writer (Assumption 6).** Confirm with the Phase 3 plan whether the session state already carries the TDD phase or Phase 11 adds the writer.
5. **Evidence row write path.** Which gate-admitted tool call writes a failing-run evidence row (test id, exit status, output hash)? The test-runner tooling must be the sole writer (append-only store rows).
6. **Hub live-fetch posture.** Bundled snapshot only (recommended, upstream-cut) vs. optional live fetch behind a network capability.
7. **fast/good tier → subagent profile mapping (EXT-08).** Confirm Phase 7's subagent profile names map 1:1 to OMP's `sonic` (fast, mechanical) / `task` (good, judgment) semantics before the mode layer is built.
8. **Advisor model selection surface.** Settings page (Phase 10) vs. hardcoded default — which model is the default "advisor".

## Environment Availability

| Item | Status | Notes |
|------|--------|-------|
| `vendor/hermes-agent` (skills, plugins, plugin-catalog, tools, agent, hermes_cli, apps/desktop) | ✅ present (Phase 1 import) | All skill/kanban/curator/plugin/advisor anchors read verbatim this session |
| `vendor/oh-my-pi` (`.omp/skills`, `docs/vibe-mode.md`, `docs/prewalk.md`, `packages/coding-agent` fixtures) | ✅ present (Phase 1 import) | `prewalk.md` body not read (Open Question 3) |
| `vendor/gsd-omp` (Node package, 34 files, MIT, v1.0.25) | ✅ present (Phase 1 import) | `gsd-core` dependency `^1.12.0` not vendored in-tree; needs a pinned install at Wave 0 |
| `apps/`, `packages/`, `contracts/` | ❌ absent | Phases 2–10 planned, unexecuted — every seam in this research is grounded on the prior-phase PLAN/RESEARCH artifacts, and Wave 0 verifies the vendored mechanism seams against the imported tree |
| gsd-tools seam (`package-legitimacy check`) | ❌ not available in this research environment | No `gsd-tools.cjs` shim in the repo; the planner runs it at Wave 0 with a `checkpoint:human-verify` |
| Windows host + git-bash | ✅ (this environment) | Path discipline per STACK.md (argv arrays, no `shell=True`; spaced + diacritic CI test) |

## Validation Architecture

> `workflow.nyquist_validation` is `true` [VERIFIED: .planning/config.json:25].

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.1.1 + pytest-asyncio 1.4.0 (daemon `halo_agent`); Bun test (Desktop/CLI) |
| Config file | `packages/halo_agent/pyproject.toml` (daemon); `apps/desktop/package.json` (Desktop) |
| Quick run command | `uv run pytest tests/skills tests/kanban tests/policy -x` (daemon); `bun test apps/desktop/src/plugins` (Desktop) |
| Full suite command | `uv run pytest` + `bun test` (no Rust crate is touched by this phase; Phase 9's `pi-scheduler` is exercised indirectly via kanban worker dispatch) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXT-01 | Skill registry: hub install (provenance-locked), invocation (list→view), curator improvement | integration | `uv run pytest tests/skills::test_hub_install_provenance` | ❌ Wave 0 |
| EXT-02 | Plugin host: pages/panes/widgets/commands via scoped backend; a plugin reaching a backend outside its namespace **fails**; hooks deny-only | integration | `bun test apps/desktop/src/plugins` (namespace-escape test) | ❌ Wave 0 |
| EXT-03 | Kanban: dependency edges (cycle → ValueError), claim TTL reclaim, stale-heartbeat wedge reclaim, 14/15 tool registry, run-ownership CAS | integration | `uv run pytest tests/kanban::test_dispatch_counters` + `test_zombie_reclaim` | ❌ Wave 0 |
| EXT-04 | GSD TDD skills present in BOTH skill dirs, dir-to-dir equality (names + frontmatter hashes), pinned gsd-core version | integration | `uv run pytest tests/skills::test_gsd_projection_two_dirs` | ❌ Wave 0 |
| EXT-05 | RED→GREEN denied without recorded failing-test evidence (fail-closed); GREEN source-edit → ask→deny-unattended; gate p99 ≤ 5 ms with TDD rules on | unit + integration | `uv run pytest tests/policy::test_tdd_evidence` + `test_gate_budget_with_tdd` | ❌ Wave 0 |
| EXT-06 | Curator after a successful TDD cycle: proposal lands in Skills Store (not applied); archive-only; pinned skill survives a full cycle | unit + integration | `uv run pytest tests/skills::test_curator_tdd_trigger` | ❌ Wave 0 |
| EXT-07 | Advisor: review pass reads transcript only; injected notes create **no new turn row**; hold-and-reconfirm de-dup | integration | `uv run pytest tests/extensions::test_advisor_no_separate_turn` | ❌ Wave 0 |
| EXT-08 | Vibe mode: director `write`/`bash` denied by a rule id citing the mode; plan↔vibe mutual exclusion; worker tiers route to Phase-7 subagents; prewalk runs before a worker turn | unit + integration | `uv run pytest tests/extensions::test_mode_toolset_narrowing` | ❌ Wave 0 |

Plus the GATE-04 bypass-matrix entries this phase must cover (cron/Kanban workers, plugin commands, curator fork, skill install writes) [VERIFIED: 04-RESEARCH.md:26]: every entry point produces a policy decision row — asserted in `tests/policy::test_bypass_matrix_phase11`.

### Sampling Rate
- **Per task commit:** `uv run pytest tests/skills tests/kanban tests/policy -x` (daemon) + `bun test` (touched surface).
- **Per wave merge:** full suite (`uv run pytest` + `bun test`).
- **Phase gate:** Full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/skills/` — catalog scan, hub install + hub-lock, GSD two-dir projection (EXT-01, EXT-04).
- [ ] `tests/kanban/` — dispatcher counters, claim TTL / stale-heartbeat reclaim, dependency cycle, run-ownership CAS (EXT-03).
- [ ] `tests/policy/test_tdd_evidence.py` + gate-budget-with-TDD-rules (EXT-05, plus the bypass-matrix rows).
- [ ] `tests/extensions/` — advisor no-separate-turn, mode toolset narrowing, prewalk (EXT-07, EXT-08).
- [ ] `tests/skills/test_curator_tdd_trigger.py` — TDD-cycle trigger + archive-only + pinned bypass (EXT-06).
- [ ] `apps/desktop/src/plugins` namespace-escape test — "a plugin that tries to reach a backend fails" (success criterion 2).
- [ ] gsd-core pin + skill-set enumeration fixture (the EXT-04 contract); spaced + diacritic path CI test for projection.
- [ ] Package-legitimacy seam run + `checkpoint:human-verify` for `@opengsd/gsd-core`.

## Security Domain

> `security_enforcement` is `true`, ASVS level 1, block on `high` [VERIFIED: .planning/config.json:49-51].

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Loopback-only binds (Phase 8/10); the plugin backend exposes **no raw handles** — a plugin reaches `/api/plugins/<id>` only (no daemon token in reach); IPC sender validation (UI-03) |
| V3 Session Management | yes | Kanban run-ownership CAS (`HERMES_KANBAN_RUN_ID` expected_run_id [VERIFIED: `kanban_tools.py:107-114`]); claim TTL (15 min) + stale-heartbeat reclaim (1 h) [VERIFIED: `kanban_db.py:276-288`]; session-mode transitions are gated, not freely writable |
| V4 Access Control | yes | Gate is deny-by-default and fail-closed (a timeout is a deny [VERIFIED: 04-RESEARCH.md:24]); unknown capability ⇒ denied; session modes *constrain* the policy snapshot, never grant; plugin hooks are deny-only; TDD rules fail closed on missing evidence |
| V5 Input Validation | yes | Skill frontmatter validation (the OMP `test/fixtures/skills/*` set: no-frontmatter, missing-description, name-mismatch, invalid-name-chars, consecutive-hyphens, long-name) [VERIFIED: fixture listing]; kanban metadata is structured JSON, never shlex-quoted [VERIFIED: `kanban_tools.py:1-7`]; plugin namespace scoping; `kanban_link` rejects cycles/self-links/running children [VERIFIED: `kanban_tools.py:1274-1278`] |
| V6 Cryptography | no | No new crypto; evidence rows carry output hashes (SHA-256 of canonicalized request in decision rows is Phase 4's existing control [VERIFIED: 04-RESEARCH.md:24]) |

### Known Threat Patterns for the stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Plugin reaches the backend outside its namespace | Elevation of Privilege | Namespace-scoped backend (`/api/plugins/<id>`); the bypass-matrix test "a plugin that tries to reach a backend fails" (success criterion 2); hooks deny-only |
| A skill's `scripts/` auto-executes on load | Elevation of Privilege / Tampering | Skills are read-only prompt content; script execution is an ordinary `proc.exec`/terminal call that must pass the gate (Pitfall 2) |
| Curator deletes or auto-applies skill changes | Tampering | "never delete, only archive (recoverable); pinned skills bypass all auto-transitions" [VERIFIED: `curator.py:1-7`]; proposals route to the Skills Store approval surface (EXT-06) |
| TDD phase skipped (RED→GREEN without evidence) | Tampering (process integrity) | Fail-closed evidence rule (Pitfall 4); evidence rows append-only, written only by the gate-admitted test-runner call; decision rows cite the rule id |
| Advisor mutates session state or starts a turn | Tampering | Read-only review pass; the advisor never holds a tool surface; notes inject as queued context with **no new turn row** (Pitfall 7) |
| Kanban worker bypasses the gate (unbound run id) | Elevation of Privilege | Run-ownership CAS: lifecycle tools require a resolvable `HERMES_KANBAN_RUN_ID` [VERIFIED: `kanban_tools.py:107-114`]; worker spawns are gate-admitted sessions on the GATE-04 bypass matrix [VERIFIED: 04-RESEARCH.md:26] |
| gsd-core supply-chain drift | Tampering | Pin the exact resolved version; the enumeration is a test fixture; package-legitimacy seam + `checkpoint:human-verify` at Wave 0 |
| Hub install overwrites a user-customized skill | Tampering | `.bundled_manifest` v2 `name:hash` model: update only when the bundled copy changed **and** the user copy still matches the origin hash; user-deleted skills are not re-added [VERIFIED: `skills_sync.py:1-7`] |
| A session mode grants capability | Elevation of Privilege | Modes constrain the per-turn policy snapshot (`settings` input); the gate still decides every call; unknown capability ⇒ denied [VERIFIED: 04-RESEARCH.md:24] |

## Sources

### Primary (HIGH confidence)
- `vendor/hermes-agent/tools/skills_tool.py` — skill model (SKILL.md + frontmatter + linked files), per-session catalog scan (stat signature, 30 s TTL, `_SIGNATURE_MAX_DEPTH`), `skills_list`/`skill_view` progressive disclosure.
- `vendor/hermes-agent/tools/kanban_tools.py` — 15 registered tools (quoted verbatim at `:1295-1310`), `_check_kanban_mode`/`_check_kanban_orchestrator_mode`, run-ownership CAS via `HERMES_KANBAN_RUN_ID`, `kanban_link` dependency edges, "tools rather than shell-outs" rationale.
- `vendor/hermes-agent/hermes_cli/kanban_db.py` — dispatch tick counters (14 named), `DEFAULT_CLAIM_TTL_SECONDS = 15 * 60`, `DEFAULT_CLAIM_HEARTBEAT_MAX_STALE_SECONDS = 60 * 60` (the wedged-PID reclaim rule).
- `vendor/hermes-agent/agent/curator.py` — inactivity trigger, archive-only + pinned-skill invariants, auxiliary-client fork, `.curator_state`, default constants.
- `vendor/hermes-agent/tools/skills_sync.py` + `skills_sync_optional.py` — `.bundled_manifest` v2 `name:hash` seeding model; hub-lock backfill and restore.
- `vendor/hermes-agent/skills/index-cache/lobehub_index.json` (+ openai catalog) — the bundled hub snapshot (schema, agent entries).
- `vendor/hermes-agent/apps/desktop/src/AGENTS.md` + `sdk/areas.ts` + `plugins/kanban/plugin.tsx` + `app/capabilities/` (Skills Store, `skill-provenance.ts`) — Desktop plugin host, SDK areas, the Kanban exemplar, skill-provenance UI.
- `vendor/hermes-agent/plugin-catalog/advisor.yaml` — advisor semantics ([NIT]/[CONCERN]/[BLOCKER], hold-and-reconfirm, `post_llm_call`/`on_session_finalize`, read-only).
- `vendor/oh-my-pi/docs/vibe-mode.md` — director + five worker-control tools, `fast`/`good` tiers, plan/goal mutual exclusion.
- `vendor/oh-my-pi/.omp/skills/` (3 bundled) + `packages/coding-agent/test/fixtures/skills/*` — the coding-core skill-dir contract and validation fixture set.
- `vendor/gsd-omp/README.md`, `package.json`, `provenance/MANIFEST.vendored.tsv` — the host-plugin contract (Host-Integration SDK v1, projection, `GSD_AGENTS_DIR`, 39 commands + `gsd_invoke`, `@opengsd/gsd-core ^1.12.0`).
- `.planning/REQUIREMENTS.md:106-113` — EXT-01…EXT-08 verbatim.
- `.planning/phases/04-tool-registry-policy-gate/04-RESEARCH.md` + `04-DECISIONS.md` — the gate (purity, p99 ≤ 5 ms, capability-keyed, audit rows), the reserved `phase` slot, `ask` → deny 'unattended', D-G1, the GATE-04 bypass matrix.
- `.planning/phases/03-unified-loop-session-authority/03-AI-SPEC.md` — `run_turn` turn-control verbs (prompt/steer/queue), store/adapter invariants.
- `.planning/phases/10-desktop-cli-product-surface/10-RESEARCH.md` — the structural model + the GATE-04 bypass-matrix context (cron/Kanban workers entry point).
- `.planning/config.json` — `nyquist_validation: true`, `security_enforcement: true` (ASVS level 1, block on `high`).

### Secondary (MEDIUM confidence)
- [CITED: gsd-omp README badge link] `github.com/open-gsd/gsd-core` — the gsd-core source repo (not directly verified in this environment; the package's declared provenance is clean).

### Tertiary (LOW confidence)
- `vendor/oh-my-pi/docs/prewalk.md` — file verified present; body not read (Assumption 3, Open Question 3).
- `@opengsd/gsd-core` skill-set contents — not enumerable from the vendored tree (Assumption 2, Open Question 2).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — one new package (`@opengsd/gsd-core`, flagged [SUS-unmeasured] pending the Wave 0 seam run); everything else is vendored and verified.
- Architecture: MEDIUM-HIGH — every vendored seam and every Phase 3–4/10 contract anchor is read verbatim; the HALO overlay (scoped plugin host, TDD rules, session modes) is a direct consequence of the locked decisions (out-of-scope locks, D-G1, the reserved `phase` slot), not new invention.
- Pitfalls: HIGH — each pitfall maps to a verified invariant (run-ownership CAS, archive-only curator, fail-closed evidence, namespace scoping, gate budget, two-dir projection).

**Research date:** 2026-10-26
**Valid until:** ~30 days (stable planning artifacts; the vendored base is pinned at the Phase 1 import; `@opengsd/gsd-core` must be re-verified at Wave 0 when the pin is recorded).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXT-01 | Skills registry supports install from the Hub, invocation, and curator-driven improvement | §Standard Stack (skill machinery, hub index-cache); §Architecture Patterns (Patterns 1–3); §Code Examples (catalog scan, sync); §Common Pitfalls (2, 6) |
| EXT-02 | Desktop plugin host provides pages, panes, widgets, and commands through a scoped backend with deny-only hooks and no backend handles | §Architecture Patterns (Pattern 5, Anti-Pattern 1); §Code Examples (plugin registration); §Security Domain (V2, V4); §Common Pitfalls (3) |
| EXT-03 | Kanban board dispatches tasks with dependencies, heartbeats, reclaim, zombie detection, and all 14 kanban tools | §Architecture Patterns (Pattern 4 — 15 vs 14 noted); §Code Examples (dispatch constants); §Common Pitfalls (1); §Validation Architecture (EXT-03 test row) |
| EXT-04 | GSD TDD skills are installed as first-class skills in both the Hermes registry and the coding core's skill directory | §Architecture Patterns (Pattern 6); §Don't Hand-Roll (projection row); §Common Pitfalls (5, 9); §Assumptions Log (2) |
| EXT-05 | TDD phase invariants are enforced at the gate, and RED→GREEN requires recorded failing-test evidence | §Architecture Patterns (Pattern 7); §Code Examples (TDD gate rule); §Common Pitfalls (4, 10); §Security Domain (V4) |
| EXT-06 | Curator proposes skill improvements after a successful TDD cycle, visible in the Skills Store for approval | §Architecture Patterns (Pattern 3 — TDD-cycle trigger, approval surface); §Code Examples (curator state); §Common Pitfalls (6) |
| EXT-07 | Advisor second model reviews turns and injects notes without a separate turn | §Architecture Patterns (Pattern 8); §State of the Art (delivery delta); §Common Pitfalls (7); §Security Domain (advisor row) |
| EXT-08 | Plan/goal/vibe loop modes and prewalk behavior live in the unified loop | §Architecture Patterns (Pattern 9); §Code Examples (mode snapshot constraint); §Common Pitfalls (8); §Open Questions (3, 7) |
</phase_requirements>
