# emoTrack — Post-MVP Roadmap + AGENTS.md Draft

## 1. Цель следующего этапа

MVP уже собран и работает. Следующая цель — не распыляться, а перевести проект в режим **контролируемого развития**.

Для этого нужны 3 вещи:

1. понятный post-MVP roadmap;
2. строгие правила работы Codex с проектом;
3. дисциплина по документации и тестам после каждого изменения.

Ключевая идея:

- сначала улучшаем уже существующий продукт;
- затем стабилизируем и усиливаем UX/аналитику;
- только после этого начинаем осторожный переход к AI layer.

---

## 2. Общая стратегия развития

Дальнейшее развитие проекта делится на 3 больших этапа:

### Этап A — Улучшение текущего продукта

Фокус: довести уже существующий функционал до более зрелого состояния.

### Этап B — Product v1.1 / v1.2

Фокус: усиление полезности, аналитики, UX, operational readiness.

### Этап C — Медленный переход к AI layer

Фокус: аккуратное добавление ИИ как усилителя трекера, а не как замены продукта.

---

## 2.1 Текущий план действий

Текущая рабочая позиция: **основа Telegram-бота готова для первого серверного запуска**. Следующие этапы должны идти не как разрозненные фичи, а как контролируемое расширение одного продукта.

### Шаг 1 — Серверный запуск текущего Telegram-бота

Цель: перенести уже готовую основу бота в стабильную серверную среду.

Что нужно сделать:

- поднять backend, Telegram bot runtime и PostgreSQL на сервере;
- настроить production/staging `.env` без нарушения локального Windows workflow;
- выбрать и закрепить Telegram runtime mode для сервера: polling или webhook;
- прогнать Prisma migrations/seed на серверной БД;
- проверить `/health/live`, `/health/ready`, Telegram startup logs и основные пользовательские flow;
- подготовить простую дисциплину backup/rollback для БД;
- включать Redis/jobs только когда это нужно и явно настроено.

Критерий готовности: бот стабильно работает на сервере, health checks проходят, логи позволяют быстро понять проблемы запуска, БД сохраняет пользовательские данные.

### Шаг 2 — Web-интерфейс поверх того же backend

Цель: добавить удобный web flow без дублирования бизнес-логики Telegram-бота.

Архитектурное правило:

- web-интерфейс должен использовать тот же backend и те же domain/application services;
- новые HTTP API должны быть тонким transport layer, как Telegram router;
- бизнес-логика check-ins, events, stats, settings и analytics не должна переезжать в web-клиент;
- сначала web должен закрыть полезные пользовательские сценарии: история, статистика, графики, настройки, обзор событий.

Критерий готовности: пользователь может смотреть и управлять ключевыми данными через web, а Telegram и web показывают согласованную картину.

### Шаг 3 — Общий AI analytics layer

Цель: добавить ИИ-аналитику как общий слой продукта, доступный и Telegram-боту, и будущему web-интерфейсу.

Архитектурное правило:

- AI analytics не должен быть Telegram-only функцией;
- на первом этапе AI layer лучше делать изолированным модулем внутри текущего NestJS modular monolith;
- Telegram и web должны обращаться к нему через общий service/API contract;
- AI layer должен получать подготовленные analytics snapshots, summaries и user context, а не работать с сырыми handler-level данными;
- тяжелые AI-задачи, weekly insights и пересчеты лучше выносить в jobs/queue после появления реальной необходимости;
- физическое выделение AI в отдельный service/worker допустимо позже, если появятся нагрузка, отдельный deploy cycle или операционная потребность.

Критерий готовности: Telegram и web могут показывать одну и ту же AI-аналитику, а архитектура остается проверяемой, тестируемой и не привязанной к одному UI-каналу.

---

## 3. Post-MVP Roadmap

# ЭТАП A — Stabilization + Improvement of Existing Core

## 3.1 Цель этапа

Довести существующий MVP до состояния, где:

- им приятно пользоваться;
- статистика действительно полезна;
- runtime стабилен;
- продукт не требует постоянной ручной донастройки;
- UX выглядит цельным, а не как набор этапов разработки.

## 3.2 Основные направления работ

### A1. Улучшение check-in UX

Что можно улучшить:

- сделать flow чуть мягче и быстрее;
- улучшить кнопки и порядок экранов;
- проверить, не слишком ли длинный сценарий после добавления note/tags/event;
- сделать финальное подтверждение записи более полезным и лаконичным;
- улучшить back/cancel поведение в edge-cases.

Текущее состояние:

- финальное подтверждение записи стало компактнее и показывает только реально сохраненные значения;
- черновые выбранные теги не считаются сохраненными, пока пользователь явно не нажмет `Готово`.

- Telegram UI polish: `/menu` now owns secondary navigation, the bottom keyboard keeps only check-in/event actions, safe callback screens edit the current message where possible, and key bot copy uses Telegram HTML formatting.
- First-run UX polish: onboarding now explains the product upfront, offers reminder setup without blocking the first check-in route, and settings sleep/reminder screens use `Назад` instead of generic `Отмена`.
- Message cleanup polish: onboarding/check-in/event screens now edit or delete the current inline message where practical, text-input flow prompts remember the active prompt id in FSM payload for best-effort cleanup, first-run completion and ready-user `/start` open the inline navigation menu, check-in step titles name the active metric, cancel in stats/settings returns to navigation, event optional steps use `Далее`, and history text is more structured.

### A2. Улучшение /history

Что можно улучшить:

- сделать более читаемый формат;
- добавить раскрытие деталей конкретного дня;
- добавить limit + pagination или «Еще»;
- улучшить отображение note/event markers;
- лучше отображать теги.

### A3. Улучшение /stats

Что можно улучшить:

- сделать summary полезнее и приятнее визуально;
- улучшить wording статистики;
- улучшить fallback при малом количестве данных;
- сделать графики более читаемыми в Telegram;
- улучшить формат period comparisons;
- лучше отображать event breakdown.

### A4. Улучшение /settings

Что можно улучшить:

- добавить более понятную структуру меню;
- улучшить подтверждения после изменения настройки;
- возможно добавить toggles notes/tags/events, если это реально полезно пользователю;
- улучшить UX изменения reminder time.

### A5. Reminder UX

Что можно улучшить:

- тексты reminder;
- поведение при already completed daily entry;
- weekly summary UX;
- безопасное поведение при отключенных jobs;
- подготовка к staging/production jobs.

### A6. Operational polish

Что можно улучшить:

- резервные копии БД;
- health checks;
- runtime diagnostics;
- более удобное логирование;
- ручной admin/dev troubleshooting guide.

Текущее состояние:

- webhook mode has a real `POST /telegram/webhook` runtime endpoint with optional secret-token validation;
- `npm run verify` combines lint/build/coverage, DB smoke tests, and the production dependency audit;
- local `.env` is loaded before conditional BullMQ wiring, so jobs mode is not silently lost in the normal local workflow;
- readiness now reports Telegram runtime failures when a real bot token is configured;
- repeatable reminder and weekly digest jobs are reconciled on startup when jobs are enabled;
- stats metric selector option logic is extracted from the large Telegram router into a focused helper.

## 3.3 Результат этапа A

После завершения этапа A проект должен стать:

- более удобным;
- более цельным;
- более надежным;
- готовым к более активному использованию и тестированию.

---

# ЭТАП B — Product Strengthening (v1.1 / v1.2)

## 4.1 Цель этапа

Добавить не фундамент, а **ценность поверх уже работающего ядра**.

## 4.2 Основные направления работ

### B1. Более сильная аналитика

Добавить:

- richer pattern detection;
- корреляции sleep ↔ mood/energy/stress;
- more meaningful weekly summaries;
- сравнение периодов;
- more actionable observations;
- better best/worst day explanations.

### B2. Более сильная визуализация

Добавить:

- улучшенные chart styles;
- event markers on charts;
- richer timeline view;
- heatmap/calendar-style views (если Telegram UX позволит);
- возможно отдельный lightweight web view позже.

### B3. Более сильная модель событий

Добавить:

- richer event categories;
- repeated events;
- long-running periods (например сессия / отпуск / проект);
- event tags;
- better linking between events and stats.

### B4. Better summaries

Добавить:

- weekly summary richer than current concise format;
- monthly summary;
- comparison vs previous period;
- more readable structured cards/messages.

### B5. Better user control

Добавить:

- больше персональных настроек;
- custom reminder preferences;
- preferences for check-in depth;
- maybe optional lighter mode / deeper mode.

### B6. Release / Staging discipline

Добавить:

- staging environment rules;
- production env template;
- deployment checklist;
- rollback checklist;
- migration discipline rules.

## 4.3 Результат этапа B

После завершения этапа B продукт должен ощущаться уже не как «MVP для проверки идеи», а как **сильный tracker product v1.x**.

---

# ЭТАП C — Медленный переход к AI Layer

## 5.1 Ключевой принцип

ИИ добавляется **не вместо продукта**, а **поверх уже устойчивого tracker core**.

То есть AI должен усиливать:

- историю;
- паттерны;
- summaries;
- personalization;
- interpretation.

А не подменять собой ядро.

## 5.2 Что делать сначала

### C1. Internal AI utilities

Сначала добавить ИИ как внутренний инструмент системы, а не как публичный чат:

- AI-assisted summary generation;
- AI-assisted notes condensation;
- AI-assisted pattern candidate generation;
- memory extraction from notes/events.

### C2. Derived user memory

Построить memory layer:

- recurring topics;
- tone preferences;
- repeating event patterns;
- stable user context summaries.

### C3. AI-enhanced summaries

Добавить:

- более умные weekly insights;
- аккуратные personalized observations;
- richer explanations of repeated patterns.

### C4. Only then — conversational AI

И только после этого:

- мягкий reflective chat;
- contextual follow-up questions;
- adaptive tone;
- user-specific memory use.

## 5.3 Чего не делать слишком рано

Не надо слишком рано делать:

- full AI chat as core feature;
- pseudo-therapy experience;
- overpromising mental health support;
- deep memory system before product data quality is stable.

## 5.4 Результат этапа C

После завершения этапа C AI будет:

- полезным;
- grounded in user data;
- встроенным в продукт логично;
- не разрушающим архитектуру.

---

## 6. Приоритеты между этапами

Рекомендуемый порядок:

### Сейчас

Этап A

### Потом

Этап B

### Только после этого

Этап C

Смысл:

- сначала polishing and strengthening;
- потом richer product value;
- потом AI layer.

---

## 7. Как вести дальнейшую работу в Codex

Дальше основная работа действительно может идти уже в Codex в VS Code. Но для этого Codex должен работать не «как генератор кода», а как **строго ограниченный инженерный агент**.

Для этого нужен файл `AGENTS.md`.

Ниже — готовый draft.

---

# AGENTS.md

## 1. Purpose

This repository is developed with the help of coding agents (Codex / similar tools).

The agent must act as a **disciplined engineering assistant**, not as an autonomous product owner.

The agent must preserve:

- architecture integrity;
- runtime stability;
- documentation quality;
- test discipline;
- change traceability.

The agent must not make uncontrolled product decisions.

---

## 2. General Working Rules

### 2.1 Scope discipline

The agent must work only within the explicitly requested scope.

The agent must NOT:

- silently expand product scope;
- add unrelated features;
- perform broad refactors without approval;
- change architecture direction without approval;
- modify business behavior outside the requested task.

### 2.2 Safety-first development

Every change must preserve:

- current local runtime behavior;
- existing accepted flows;
- build stability;
- lint stability;
- test stability.

### 2.3 Incremental delivery

The agent must prefer:

- small controlled changes;
- narrow patches;
- clear summaries of what changed;
- explicit mention of risks and assumptions.

### 2.4 No hidden decisions

The agent must explicitly state:

- what was changed;
- what files were changed;
- what assumptions were made;
- what tests were added/updated;
- what documentation was updated.

---

## 3. Documentation Discipline

### 3.1 Documentation update is mandatory

After every meaningful change, the agent must update documentation automatically.

Documentation update is not optional.

### 3.2 What must be updated after each change

Depending on scope, the agent must update one or more of:

- `README.md`
- `docs/QA_CHECKLIST.md`
- architecture notes
- module docs
- roadmap docs
- release notes / changelog if present
- setup instructions if env/runtime changed
- testing instructions if test behavior changed

### 3.3 Documentation minimum standard

Any doc update must explain:

- what changed;
- why it changed;
- how to use it;
- how to verify it.

### 3.4 No stale docs

If a change makes documentation outdated, the agent must update that documentation in the same task.

The agent must not leave knowingly stale docs behind.

---

## 4. Test Discipline

### 4.1 Tests are mandatory after every meaningful change

For every meaningful logic change, the agent must propose and/or add tests.

Tests should be added automatically as part of the change process.

### 4.2 However: test creation must remain under user control

Because tests are important and can become noisy or misleading, the agent must not silently generate a large uncontrolled test suite.

For all non-trivial changes, the agent must clearly state:

- what tests it wants to add;
- what exactly those tests cover;
- whether they are unit or integration tests;
- whether they change existing test infrastructure.

### 4.3 Approval rule for larger test changes

If the change requires:

- many new tests,
- new fixtures,
- new test infra,
- updated mocks,
- refactoring old tests,

then the agent must first provide a short **test plan** and wait for approval before making the large test expansion.

### 4.4 Small safe test changes

For very small logic fixes, the agent may add a small focused test immediately, but it still must report clearly what test was added.

### 4.5 Test quality rules

Tests must be:

- deterministic;
- minimal but meaningful;
- understandable;
- aligned with real business behavior;
- not over-mocked when real integration is important;
- not brittle.

### 4.6 No fake test coverage

The agent must not add superficial tests only to increase test count.

Tests must verify real behavior.

---

## 5. Required Change Report After Every Task

After every completed task, the agent must provide a structured report containing:

1. Summary of changes
2. Files changed
3. Runtime impact
4. Database impact (if any)
5. Env/config impact (if any)
6. Documentation updated
7. Tests added/updated
8. Remaining risks / assumptions

This report is mandatory.

---

## 6. Runtime Preservation Rules

The agent must preserve current known-good behavior unless explicitly asked to change it.

Current key local assumptions:

- Windows local development must keep working;
- Docker is not required for local dev;
- PostgreSQL is local;
- Redis may be disabled;
- jobs may be disabled;
- Telegram polling mode must keep working locally;
- build/lint/tests must remain green.

Any change that affects these assumptions must be called out explicitly.

---

## 7. Architecture Rules

### 7.1 Preserve modular monolith structure

The agent must keep the project as a modular NestJS monolith.

### 7.2 No script-style degradation

The agent must not move logic into giant Telegram handlers or script-like files.

### 7.3 Thin transport layer

Telegram handlers/router must remain thin.
Business logic belongs in services and repositories.

### 7.4 Reuse existing helpers

The agent must reuse established helpers and strategies, especially:

- date normalization logic;
- validation helpers;
- centralized copy/messages;
- config-driven runtime flags.

### 7.5 Avoid duplicate logic

If a helper or service already exists, the agent should extend or reuse it instead of creating parallel logic.

---

## 8. Database and Migration Rules

### 8.1 Migration discipline

If DB schema changes are needed, the agent must:

- explain them clearly;
- add/update Prisma migration cleanly;
- mention runtime/data impact.

### 8.2 No silent data-model changes

The agent must not change critical data semantics without explicit approval.

### 8.3 Seed discipline

If seeds are affected, the agent must update seed logic and mention it in the report.

---

## 9. Environment and Config Rules

### 9.1 Env changes must be explicit

If env/config is changed, the agent must update:

- `.env.example`
- README setup docs
- any relevant deployment/setup note

### 9.2 Safe local defaults

The agent must preserve safe local-dev defaults whenever possible.

---

## 10. Logging and Error Handling Rules

### 10.1 No silent failures

The agent must avoid hiding important runtime failures.

### 10.2 No raw internal errors to users

User-facing Telegram flows must not expose raw stack traces.

### 10.3 Logs must remain useful

If logging is changed, it must improve debugging clarity, not increase noise pointlessly.

---

## 11. Working Modes for the Agent

The agent must distinguish between 3 work modes.

### Mode A — Small safe fix

Examples:

- a bug fix;
- a small validation issue;
- a tiny copy correction.

Agent may:

- implement directly;
- add a small focused test;
- update relevant docs;
- report changes.

### Mode B — Medium feature / enhancement

Examples:

- improving stats output;
- adding a settings branch;
- improving history rendering.

Agent must:

- define scope clearly;
- implement incrementally;
- update docs;
- add/update tests;
- report all changes.

### Mode C — Large change / structural work

Examples:

- new module;
- DB model changes;
- AI layer introduction;
- broad test expansion;
- deployment/runtime changes.

Agent must:

- first produce a short implementation plan;
- first produce a short test plan;
- wait for approval before executing the broader change.

---

## 12. Test Plan Requirement for Important Changes

For medium-to-large tasks, before changing tests significantly, the agent must present a short test plan in this form:

### Proposed tests

- Test 1 — what it checks
- Test 2 — what it checks
- Test 3 — what it checks

### Type

- unit / integration

### Infra impact

- new fixture?
- new mock?
- new helper?
- no infra impact?

### Risk

- low / medium / high

Then the agent must wait for approval if the change is not trivial.

---

## 13. Documentation Update Requirement for Important Changes

For medium-to-large tasks, the agent must also state:

- which documentation files will be updated;
- what sections will change;
- whether setup/runtime behavior changes.

---

## 14. Default Output Format for the Agent

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

## 15. Roadmap Guidance for Future Work

The agent should treat future work in this order unless explicitly instructed otherwise:

### Priority 1

Improve and strengthen existing product behavior.

### Priority 2

Enhance analytics, UX, and operational quality.

### Priority 3

Introduce AI layer gradually and carefully.

The agent must not jump to AI layer too early.

---

## 16. Practical Next-Step Roadmap for Codex

### Stage A — Improve existing product

Primary focus:

- improve check-in UX;
- improve history UX;
- improve stats readability;
- improve chart quality;
- improve settings UX;
- improve reminder UX;
- operational polish.

### Stage B — Strengthen product value

Primary focus:

- richer analytics;
- richer summaries;
- better event modeling;
- stronger visual interpretation;
- better release/staging discipline.

### Stage C — AI layer

Primary focus:

- internal AI utilities first;
- memory extraction next;
- AI-enhanced summaries next;
- conversational AI last.

---

## 17. Rule for AI Layer Work

Any AI-layer work must begin with:

1. architecture plan;
2. data-flow plan;
3. memory strategy;
4. test plan;
5. documentation update plan.

No direct implementation of AI features should start without that planning step.

---

## 18. Final Principle

This project must evolve in a controlled way.

The coding agent is expected to:

- preserve quality;
- preserve traceability;
- preserve runtime stability;
- preserve documentation discipline;
- preserve test discipline under user control.

The agent must help accelerate the project without making it opaque or chaotic.

---

## 8. Recommended immediate next work after MVP

Right after MVP completion, the next recommended order is:

1. deploy the current Telegram bot foundation with PostgreSQL to the server;
2. verify production/staging env, migrations, health checks, logs, backup, and rollback basics;
3. add the web interface as a second client of the same backend and domain services;
4. expose only thin HTTP transport/API layers for web flows, without duplicating business logic;
5. design the shared AI analytics layer for both Telegram and web;
6. only then implement AI features through the required architecture, data-flow, memory, test, and documentation plan.

This is the default direction unless explicitly changed.
