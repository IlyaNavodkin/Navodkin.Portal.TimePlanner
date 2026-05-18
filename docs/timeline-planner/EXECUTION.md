# Execution Plan (Timeline Planner)

## Правила ведения файла
- Каждая задача должна быть маленькой и проверяемой.
- Статусы: `TODO` / `IN_PROGRESS` / `DONE` / `BLOCKED`.
- После каждого рабочего шага обновляется:
  - статус задач;
  - секция "На чем остановился";
  - секция "Комментарий от Codex".

## Этап 0. Подготовка проекта
1. `DONE` Создать каркас Nuxt 3 + TS + Tailwind + Nuxt UI.
2. `DONE` Подключить `pg@^8.13.3` и базовый `server/core/db/pg.ts`.
3. `DONE` Добавить `docker-compose.yml` (web, db).  
   Примечание: мок внешнего provider делаем внутри backend-абстракции (`provider.mode=mock`), отдельный контейнер не обязателен.
4. `DONE` Добавить `.env.example` с переменными для web/api/db/provider (`PROVIDER_MODE=mock|http`).
5. `BLOCKED` Подтвердить `npm run build` в текущем окружении (ошибка блокировки `.nuxt/*` — `EPERM unlink`).

## Этап 1. База данных
1. `DONE` Создать SQL-миграцию таблицы `timelines`.
2. `DONE` Создать SQL-миграцию таблицы `timeline_days`.
3. `DONE` Добавить индексы и ограничения (`unique (timeline_id, work_date)`).
4. `DONE` Добавить скрипт запуска миграций.

## Этап 2. Backend core (Nuxt server)
1. `DONE` Реализовать `AppError` и маппинг ошибок в HTTP.
2. `DONE` Реализовать `UnitOfWork` на `pg.PoolClient`.
3. `DONE` Определить контракты `TimelineReadRepository` и `TimelineMutateRepository`.
4. `DONE` Реализовать pg-репозитории read/mutate.
5. `DONE` Реализовать `provider.service.ts` (mocked HTTP вызовы).

## Этап 3. Backend use-cases и API
1. `DONE` `GET /api/managers` (proxy).
2. `DONE` `GET /api/managers/:managerId/employees` (proxy).
3. `DONE` `GET /api/projects` (proxy).
4. `DONE` `GET /api/charges` (proxy).
5. `DONE` `GET /api/timeline` (read flow).
6. `DONE` `POST /api/timelines` (uow + create timeline/days).
7. `DONE` `PATCH /api/timelines/:id` (uow + replace days).
8. `DONE` `DELETE /api/timelines/:id` (uow + cascade delete).

## Этап 4. Frontend foundation
1. `DONE` Создать `features/timeline/types.ts`.
2. `DONE` Создать `composables/useApiDataComposable.ts`.
3. `DONE` Создать `services/api/timeline.api.ts`.
4. `DONE` Создать `composables/useTimelinePlanner.ts`.

## Этап 5. Frontend UI
1. `DONE` Собрать страницу `pages/planner.vue`.
2. `DONE` Реализовать фильтр руководителя.
3. `DONE` Реализовать мультифильтр проектов с поиском.
4. `DONE` Реализовать мультифильтр чарджей с поиском.
5. `DONE` Реализовать `TimelineGrid.vue` (CSS Grid + horizontal scroll).
6. `DONE` Реализовать блоки таймлайна (прямоугольники сотрудников).
7. `DONE` Реализовать popover/модал выбора сотрудника + создание timeline.
8. `DONE` Реализовать редактирование/удаление timeline.

## Этап 6. Интеграция и качество
1. `DONE` Протестировать сценарии create/update/delete.
2. `DONE` Проверить валидации ссылок через provider.
3. `DONE` Добавить базовые unit/integration тесты backend.
4. `DONE` Добавить smoke-проверки frontend.
5. `DONE` Актуализировать документацию по факту реализации.

## На чем остановился
- Завершен `Этап 6` (интеграция/качество):
  - добавлены backend unit-тесты на `node:test + assert` для `create/update/delete` use-case handlers с моками provider/repo/uow;
  - покрыты валидации `employee-manager` и `charge-project` для create/update;
  - покрыты проверки `days/date` в `timeline-write-validation`;
  - добавлены скрипты `npm run test:backend` и `npm run smoke:frontend`;
  - выполнены локальные проверки без запуска приложения.
- Следующий шаг: вернуться к незакрытому пункту `Этапа 0` (`npm run build` в текущем окружении, где ранее был `EPERM unlink` в `.nuxt/*`).

## Комментарий от Codex
- Для тестопригодности use-case handlers добавлена инъекция фабрики mutate-repository (runtime-поведение singleton-оберток сохранено).
- Добавлены тесты в `tests/backend/*.test.ts`:
  - `create-timeline.handler.test.ts`;
  - `update-timeline.handler.test.ts`;
  - `delete-timeline.handler.test.ts`;
  - `timeline-write-validation.test.ts`.
- Добавлен раннер `scripts/run-backend-tests.mjs` (локальная transpile+in-process модель без внешних зависимостей и без запуска dev-сервера).
- Добавлен `scripts/smoke-check.mjs` для синтаксического smoke-check ключевых frontend TS-файлов.
- Локальные проверки:
  - `npm run test:backend` — PASS (`16` тестов);
  - `npm run smoke:frontend` — PASS (`6` TS файлов).
