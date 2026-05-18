# Layered Flow for Backend (Nuxt + pg)

## 1. Целевая цепочка вызова
`Controller -> UseCase Handler -> Services -> DataAccess(Read/Mutate) -> UnitOfWork -> Utils`

Адаптация под Nuxt:
- `Controller` = обработчики в `server/api/*.ts` (`defineEventHandler`).
- `UseCase Handler` = orchestration-класс в `server/modules/*/use-cases`.
- `Services` = доменная логика в `server/modules/*/services`.
- `DataAccess` = pg-репозитории в `server/modules/*/data-access`.
- `UnitOfWork` = `server/core/db/unit-of-work.ts`.
- `Utils` = `server/core/utils` и `server/core/errors`.

## 2. Ответственности слоев

### Controller (`server/api`)
- принимает HTTP-запрос;
- валидирует формат/DTO;
- вызывает use-case handler;
- маппит доменные ошибки в HTTP-коды.

Controller ничего не знает про SQL, `pg.Client` и транзакции.

### UseCase Handler
- orchestrates шаги бизнес-операции;
- решает, нужен ли `UnitOfWork`;
- вызывает service-слой;
- возвращает DTO результата.

### Services
- бизнес-правила домена (валидации, инварианты);
- работают через интерфейсы репозиториев;
- не знают про конкретную реализацию БД.

### Read/Mutate DataAccess
- `Read` слой: только `SELECT`;
- `Mutate` слой: только `INSERT/UPDATE/DELETE`;
- реализации работают через `pg` (`Pool` или `PoolClient`).

### UnitOfWork
- открывает/закрывает транзакцию (`BEGIN/COMMIT/ROLLBACK`);
- создает read/mutate репозитории на одном `PoolClient`;
- гарантирует консистентность операции.

### Utils
- валидация DTO;
- mappers;
- error helpers;
- date helpers для `timeline_days`.

## 3. Структура каталогов
```txt
server/
  api/
    timeline.get.ts
    timelines.post.ts
    timelines/[id].patch.ts
    timelines/[id].delete.ts
  core/
    db/
      pg.ts
      unit-of-work.ts
      tx-context.ts
    errors/
      app-error.ts
    utils/
      validation.ts
      date.ts
  modules/
    timelines/
      contracts/
        timeline-read.repository.ts
        timeline-mutate.repository.ts
      data-access/
        timeline-read.pg.ts
        timeline-mutate.pg.ts
      services/
        timeline.service.ts
      use-cases/
        create-timeline.handler.ts
        update-timeline.handler.ts
        get-timeline.handler.ts
      dto/
        timeline.dto.ts
    provider/
      services/
        provider.service.ts
```

## 4. Пример: Create Timeline

### 4.1 Controller
`POST /api/timelines`:
1. читает body;
2. валидирует поля (`projectExternalId`, `chargeExternalId`, `managerExternalId`, `employeeExternalId`, `days[]`);
3. вызывает `CreateTimelineHandler.execute(input)`.

### 4.2 UseCase Handler
`CreateTimelineHandler`:
1. вызывает `ProviderValidationService` (до транзакции):
   - проверка `charge` принадлежит `project`;
   - проверка `employee` принадлежит `manager`.
2. запускает `unitOfWork.execute(...)`;
3. внутри транзакции:
   - `timelinesMutate.createTimeline(...)`;
   - `timelinesMutate.replaceTimelineDays(...)`.
4. возвращает DTO (`timelineId`, `daysCount`).

### 4.3 Service
`TimelineService`:
- нормализует `days[]` (deduplicate + sort);
- валидирует, что список не пуст;
- применяет доменные ограничения (например, запрет конфликтов на день, если включено).

### 4.4 DataAccess
- `TimelineReadRepository`: `findById`, `listByFilter`, `listDaysByTimelineIds`.
- `TimelineMutateRepository`: `createTimeline`, `updateTimelineMeta`, `replaceTimelineDays`, `deleteTimeline`.

### 4.5 UnitOfWork
- единый `PoolClient` для read/mutate в рамках одной операции;
- `client.release()` строго в `finally`.

## 5. Read-only flow
Для `GET /api/timeline`:
- без транзакции;
- `GetTimelineHandler` использует только `TimelineReadRepository` на `Pool`;
- provider вызывается только для обогащения отображения (если нужно).

## 6. Правила внедрения зависимостей
- UseCase/Service принимают интерфейсы, не concrete-классы.
- Repository factory создается в composition root (`server/core/container.ts`).
- `server/api/*` получает готовый handler из контейнера.

## 7. PostgreSQL-практики
- не держать транзакции во время сетевых вызовов;
- использовать параметризованные SQL;
- bulk insert для `timeline_days` выполнять батчем;
- индексы из `03-database-schema.md` обязательны.
