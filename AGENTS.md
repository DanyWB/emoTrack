# AGENTS.md

## Purpose

This repository is developed with the help of coding agents (Codex or similar tools).

The agent must act as a disciplined engineering assistant, not as an autonomous product owner.

The agent must preserve:

- architecture integrity
- runtime stability
- documentation quality
- test discipline
- change traceability

The agent must not make uncontrolled product decisions.

---

## General Working Rules

### Scope discipline

The agent must work only within the explicitly requested scope.

The agent must NOT:

- silently expand product scope
- add unrelated features
- perform broad refactors without approval
- change architecture direction without approval
- modify business behavior outside the requested task

### Safety-first development

Every change must preserve:

- current local runtime behavior
- existing accepted flows
- build stability
- lint stability
- test stability

### Incremental delivery

The agent must prefer:

- small controlled changes
- narrow patches
- clear summaries of what changed
- explicit mention of risks and assumptions

### No hidden decisions

The agent must explicitly state:

- what was changed
- what files were changed
- what assumptions were made
- what tests were added or updated
- what documentation was updated

---

## Documentation Discipline

### Documentation update is mandatory

After every meaningful change, the agent must update documentation automatically.

Documentation update is not optional.

### What must be updated after each change

Depending on scope, the agent must update one or more of:

- `README.md`
- `docs/QA_CHECKLIST.md`
- architecture notes
- module docs
- roadmap docs
- release notes or changelog if present
- setup instructions if env or runtime changed
- testing instructions if test behavior changed

### Documentation minimum standard

Any doc update must explain:

- what changed
- why it changed
- how to use it
- how to verify it

### No stale docs

If a change makes documentation outdated, the agent must update that documentation in the same task.

The agent must not leave knowingly stale docs behind.

---

## Test Discipline

### Tests are mandatory after every meaningful change

For every meaningful logic change, the agent must propose and/or add tests.

Tests should be added automatically as part of the change process.

### Test creation must remain under user control

Because tests are important and can become noisy or misleading, the agent must not silently generate a large uncontrolled test suite.

For all non-trivial changes, the agent must clearly state:

- what tests it wants to add
- what exactly those tests cover
- whether they are unit or integration tests
- whether they change existing test infrastructure

### Approval rule for larger test changes

If the change requires:

- many new tests
- new fixtures
- new test infra
- updated mocks
- refactoring old tests

then the agent must first provide a short test plan and wait for approval before making the larger test expansion.

### Small safe test changes

For very small logic fixes, the agent may add a small focused test immediately, but it still must report clearly what test was added.

### Test quality rules

Tests must be:

- deterministic
- minimal but meaningful
- understandable
- aligned with real business behavior
- not over-mocked when real integration is important
- not brittle

### No fake test coverage

The agent must not add superficial tests only to increase test count.

Tests must verify real behavior.

---

## Required Change Report After Every Task

After every completed task, the agent must provide a structured report containing:

1. Summary of changes
2. Files changed
3. Runtime impact
4. Database impact (if any)
5. Env/config impact (if any)
6. Documentation updated
7. Tests added or updated
8. Remaining risks or assumptions

This report is mandatory.

---

## Runtime Preservation Rules

The agent must preserve current known-good behavior unless explicitly asked to change it.

Current key local assumptions:

- Windows local development must keep working
- Docker is not required for local development
- PostgreSQL is local
- Redis may be disabled
- jobs may be disabled
- Telegram polling mode must keep working locally
- build, lint, and tests must remain green

Any change that affects these assumptions must be called out explicitly.

---

## Architecture Rules

### Preserve modular monolith structure

The agent must keep the project as a modular NestJS monolith.

### No script-style degradation

The agent must not move logic into giant Telegram handlers or script-like files.

### Thin transport layer

Telegram handlers and router must remain thin.
Business logic belongs in services and repositories.

### Reuse existing helpers

The agent must reuse established helpers and strategies, especially:

- date normalization logic
- validation helpers
- centralized copy/messages
- config-driven runtime flags

### Avoid duplicate logic

If a helper or service already exists, the agent should extend or reuse it instead of creating parallel logic.

---

## Database and Migration Rules

### Migration discipline

If DB schema changes are needed, the agent must:

- explain them clearly
- add or update Prisma migration cleanly
- mention runtime and data impact

### No silent data-model changes

The agent must not change critical data semantics without explicit approval.

### Seed discipline

If seeds are affected, the agent must update seed logic and mention it in the report.

---

## Environment and Config Rules

### Env changes must be explicit

If env or config is changed, the agent must update:

- `.env.example`
- README setup docs
- any relevant deployment or setup note

### Safe local defaults

The agent must preserve safe local development defaults whenever possible.

---

## Logging and Error Handling Rules

### No silent failures

The agent must avoid hiding important runtime failures.

### No raw internal errors to users

User-facing Telegram flows must not expose raw stack traces.

### Logs must remain useful

If logging is changed, it must improve debugging clarity, not increase noise pointlessly.

---

## Working Modes for the Agent

The agent must distinguish between 3 work modes.

### Mode A — Small safe fix

Examples:

- a bug fix
- a small validation issue
- a tiny copy correction

Agent may:

- implement directly
- add a small focused test
- update relevant docs
- report changes

### Mode B — Medium feature or enhancement

Examples:

- improving stats output
- adding a settings branch
- improving history rendering

Agent must:

- define scope clearly
- implement incrementally
- update docs
- add or update tests
- report all changes

### Mode C — Large change or structural work

Examples:

- new module
- DB model changes
- AI layer introduction
- broad test expansion
- deployment or runtime changes

Agent must:

- first produce a short implementation plan
- first produce a short test plan
- wait for approval before executing the broader change

---

## Test Plan Requirement for Important Changes

For medium-to-large tasks, before changing tests significantly, the agent must present a short test plan in this form:

### Proposed tests

- Test 1 — what it checks
- Test 2 — what it checks
- Test 3 — what it checks

### Type

- unit or integration

### Infra impact

- new fixture?
- new mock?
- new helper?
- no infra impact?

### Risk

- low / medium / high

Then the agent must wait for approval if the change is not trivial.

---

## Documentation Update Requirement for Important Changes

For medium-to-large tasks, the agent must also state:

- which documentation files will be updated
- what sections will change
- whether setup or runtime behavior changes

---

## Default Output Format for the Agent

After each task, the agent should answer in a structured format like:

### Summary

...

### Files changed

- ...

### Docs updated

- ...

### Tests

- added: ...
- updated: ...
- not added: reason

### Runtime / env impact

...

### Risks / assumptions

...

This structure should be used by default.

---

## Roadmap Guidance for Future Work

The agent should treat future work in this order unless explicitly instructed otherwise:

### Priority 1

Improve and strengthen existing product behavior.

### Priority 2

Enhance analytics, UX, and operational quality.

### Priority 3

Introduce AI layer gradually and carefully.

The agent must not jump to the AI layer too early.

---

## Practical Next-Step Roadmap for Codex

### Stage A — Improve existing product

Primary focus:

- improve check-in UX
- improve history UX
- improve stats readability
- improve chart quality
- improve settings UX
- improve reminder UX
- improve operational polish

### Stage B — Strengthen product value

Primary focus:

- richer analytics
- richer summaries
- better event modeling
- stronger visual interpretation
- better release and staging discipline

### Stage C — AI layer

Primary focus:

- internal AI utilities first
- memory extraction next
- AI-enhanced summaries next
- conversational AI last

---

## Rule for AI Layer Work

Any AI-layer work must begin with:

1. architecture plan
2. data-flow plan
3. memory strategy
4. test plan
5. documentation update plan

No direct implementation of AI features should start without that planning step.

---

## Final Principle

This project must evolve in a controlled way.

The coding agent is expected to:

- preserve quality
- preserve traceability
- preserve runtime stability
- preserve documentation discipline
- preserve test discipline under user control

The agent must help accelerate the project without making it opaque or chaotic.
