# Стек и архитектура

## 1. Технологический стек
- Frontend: `Nuxt 3` + `TypeScript` + `Tailwind CSS`.
- UI библиотека компонентов: `Nuxt UI` (основная библиотека компонентов проекта).
- График таймлайна: кастомная реализация на `CSS Grid + absolute positioning` (без тяжелой gantt-библиотеки).
- Вспомогательные библиотеки для графика и UX:
  - `@floating-ui/vue` (popover/позиционирование),
  - `@tanstack/vue-virtual` (виртуализация списков/строк),
  - `date-fns` (даты и вычисления по дням/неделям).
- Backend API: `Node.js` + `TypeScript` (например, `h3`/`nitro` или `Fastify`).
- База данных: `PostgreSQL`.
- Драйвер БД: `pg@^8.13.3` (без ORM).
- Контейнеризация: `Docker`, `Docker Compose`.
- Конфигурация: `.env` файлы.

## 2. Высокоуровневая архитектура
1. `web` (Nuxt):
   - UI фильтров и таймлайна;
   - вызовы backend API.
2. `api` (backend service):
   - REST endpoints;
   - бизнес-валидации;
   - доступ к PostgreSQL через `pg`;
   - provider-абстракция для внешнего микросервиса (руководители, сотрудники, проекты, чарджи) с режимами:
     - `mock` (встроенный мок в backend),
     - `http` (реальные HTTP-вызовы во внешний сервис).
3. `db` (PostgreSQL):
   - хранение только `timelines` и `timeline_days`.

## 3. Рекомендуемая структура модулей backend
- `modules/timelines` (локальная БД).
- `modules/managers` (proxy к внешнему сервису).
- `modules/employees` (proxy к внешнему сервису).
- `modules/projects` (proxy к внешнему сервису, без локального хранения).
- `modules/charges` (proxy к внешнему сервису, без локального хранения).
- `shared/db` (pool, транзакции, sql helpers).

Архитектурный поток backend фиксируется как:
- `Controller (server/api)` -> `UseCase Handler` -> `Services` -> `Read/Mutate DataAccess` -> `UnitOfWork` -> `Utils`.

## 4. Работа с PostgreSQL через pg
Базовый подход:
- единый `Pool` из `pg`;
- запросы параметризованные (`$1`, `$2`, ...);
- транзакции для create/update timeline + timeline_days;
- отдельные SQL-репозитории по модулям.

Пример инициализации:
```ts
import { Pool } from 'pg'

export const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
})
```

## 5. Docker и env
Обязательные переменные:
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `API_PORT`
- `NUXT_PUBLIC_API_BASE_URL`
- `PROVIDER_BASE_URL` (внешний/mocked сервис)

Минимальный состав `docker-compose.yml`:
- `web` (Nuxt),
- `api` (Node backend),
- `db` (PostgreSQL).

## 6. Интеграция с внешним микросервисом
- Источник истины по руководителям, сотрудникам, проектам и чарджам: внешний сервис.
- В режиме разработки по умолчанию используется встроенный mock-provider (`PROVIDER_MODE=mock`).
- В локальном хранении держим только внешние ссылки:
  - `project_external_id`,
  - `charge_external_id`,
  - `manager_external_id`,
  - `employee_external_id`.
- При недоступности внешнего сервиса:
  - читаем уже сохраненные таймлайны;
  - показываем предупреждение в UI;
  - блокируем создание/редактирование, если нельзя провалидировать ссылки.

## 7. Архитектурный поток frontend
- `Page` -> `Feature Composable` -> `API Composable` -> `API Client` -> `/api/*`.
- `Page` отвечает за рендер и UI-связку компонентов.
- `Feature Composable` хранит состояние экрана и действия (load/create/update/delete).
- `API Composable` дает общее состояние запроса (`data/loading/error`).
- `API Client` содержит typed-функции вызова backend.
