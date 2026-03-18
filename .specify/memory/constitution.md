<!--
SYNC IMPACT REPORT
==================
Version change: N/A (initial) → 1.0.0
Modified principles: N/A — first ratification
Added sections:
  - Core Principles: I. Code Quality, II. Testing Discipline, III. UX Consistency, IV. Verification
  - Plugin Architecture Standards
  - Development Workflow
  - Governance

Removed sections: N/A

Templates requiring updates:
  ✅ .specify/templates/plan-template.md — Constitution Check updated with concrete gates
  ✅ .specify/templates/spec-template.md — aligned; no structural changes required
  ✅ .specify/templates/tasks-template.md — aligned; test/lint/verification tasks already supported

Deferred TODOs: None
-->

# Midi-Datasource Constitution

## Core Principles

### I. Code Quality

Every contribution MUST pass linting and type checking before merge:

- Run `npm run lint` (ESLint) — zero errors allowed; warnings MUST be resolved or explicitly
  documented as accepted technical debt with a code comment.
- Run TypeScript type checking (`tsc --noEmit`) — zero type errors allowed.
- No new `any` types introduced without a documented justification comment in the source file.
- Dead code and unused imports MUST be removed; the TypeScript compiler will catch these.
- Code reviews MUST flag violations; PRs with open quality failures MUST NOT be merged.

**Rationale**: Grafana plugin APIs evolve rapidly. Strict typing and linting catch interface
changes early and prevent silent runtime failures in user dashboards.

### II. Testing Discipline

All plugin behavior MUST be covered by an appropriate test layer:

- **Unit tests** (Jest, `npm run test`): Cover individual functions, query transformations, and
  data-mapping logic. Tests MUST be written before implementation (TDD). The red-green-refactor
  cycle is enforced — tests MUST be observed failing before implementation begins.
- **E2E tests** (`@grafana/plugin-e2e`, Playwright, `npm run e2e`): Cover user-facing acceptance
  scenarios defined in spec.md. Each user story MUST have at least one passing E2E test before
  that story is considered complete.
- Tests MUST run against the minimum supported Grafana version (`>=12.3.0`) in CI.
- A user story is NOT complete until all its tests pass in CI. Implementation without passing
  tests MUST NOT be merged.
- Test coverage MUST include both positive cases (new behavior works) and negative cases
  (previous behavior preserved) for every change.

**Rationale**: Plugin-to-Grafana compatibility breaks silently across versions. Automated tests
at both unit and E2E layers are the primary safety net against regressions.

### III. UX Consistency

All UI contributed to the plugin MUST follow the Grafana design system:

- Components MUST be sourced from `@grafana/ui` wherever a suitable component exists. Custom
  components are only permitted when `@grafana/ui` has no equivalent, and the gap MUST be
  documented in the PR.
- Configuration forms MUST use `InlineField`, `InlineFieldRow`, and `Input` patterns consistent
  with other Grafana data source plugins.
- Credentials and secrets MUST use `secureJsonData`; non-sensitive settings MUST use `jsonData`.
- Color, typography, spacing, and iconography MUST NOT override Grafana theme variables.
- Every UI change MUST be verified visually in a running Grafana instance before the task is
  marked complete (see Principle IV).

**Rationale**: Users expect a consistent experience across all Grafana plugins. Deviating from
`@grafana/ui` fragments the UX and creates maintenance burden when the design system updates.

### IV. Verification

No feature is considered done until all verification gates pass:

- **Automated quality**: `npm run lint` and `tsc --noEmit` MUST succeed with zero errors.
- **Automated tests**: `npm run test:ci` (unit) and `npm run e2e` (E2E) MUST pass in CI.
- **Build**: `npm run build` MUST succeed; build warnings are treated as errors and MUST be
  resolved before merge.
- **Visual**: The `grafana-verifier` agent MUST be run after any UI change to confirm rendering
  correctness against a live Grafana instance (default: http://localhost:3000, admin/admin).
- **Plugin release**: Any release candidate MUST be signed via `@grafana/sign-plugin` and
  verified as loadable in a clean Grafana instance before tagging.
- Verification evidence (CI status, screenshots for UI changes) MUST be included in the PR
  description.

**Rationale**: Grafana plugins run inside the host application. Silent build or rendering
failures are invisible until users report broken dashboards. Explicit, documented verification
gates prevent regressions from reaching production.

## Plugin Architecture Standards

- **Do not modify** anything inside the `.config/` folder — it is managed by Grafana plugin
  tools and MUST remain unmodified.
- The plugin ID (`tskarhed-midi-datasource`) and type (`datasource`) in `plugin.json` MUST NOT
  change.
- Any modification to `plugin.json` requires a Grafana server restart — this MUST be noted in
  the PR description.
- The webpack configuration in `.config/` MUST be the basis for frontend builds. Extensions
  MUST follow the guide at:
  https://grafana.com/developers/plugin-tools/how-to-guides/extend-configurations.md
- Backend builds (if added) MUST use `mage` with the build targets from the Grafana plugin Go SDK.
- Grafana API usage MUST be validated against current documentation at
  https://grafana.com/developers/plugin-tools/ — training data is out of date.

## Development Workflow

The required cycle for every task is: **Research → Implement → Validate → Test**

- Before implementation: run parallel Explore agents to understand existing patterns and APIs.
- After editing code: launch `code-reviewer` in the background to check for quality issues.
- After UI changes: launch `grafana-verifier` to confirm visual correctness in the browser.
- After writing or modifying tests: launch `test-runner` to verify they pass.
- Commits MUST be atomic per logical unit of work (one task = one commit).
- PRs MUST document: what changed, how it was verified, and any plugin.json restart requirements.

## Governance

This constitution supersedes all other development practices for the `tskarhed-midi-datasource`
plugin. All PRs and code reviews MUST verify compliance with the four Core Principles above.

**Amendment procedure**:

1. Propose the change with rationale in a PR that updates this file.
2. The version MUST be incremented following the policy below.
3. All dependent templates (plan, spec, tasks) MUST be updated in the same PR.
4. The Sync Impact Report HTML comment MUST be updated to reflect the amendment.

**Versioning policy**:

- MAJOR: Backward-incompatible governance change — a principle removed or fundamentally redefined.
- MINOR: New principle or section added, or material expansion of guidance.
- PATCH: Clarifications, wording fixes, or non-semantic refinements.

**Compliance review**: Every PR author is responsible for self-certifying compliance with all
four Core Principles. Reviewers MUST reject PRs that skip any verification gate defined in
Principle IV.

**Version**: 1.0.0 | **Ratified**: 2026-03-18 | **Last Amended**: 2026-03-18
