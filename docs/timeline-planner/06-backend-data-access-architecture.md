# Backend Data Access Architecture (pg + TypeScript)

## 1. Принципы
- `Read` слой: только операции чтения (`SELECT`), без мутаций.
- `Mutate` слой: только операции изменения (`INSERT/UPDATE/DELETE`).
- `UnitOfWork`: управляет транзакцией `BEGIN/COMMIT/ROLLBACK` и создает `Read/Mutate` репозитории на одном `pg.PoolClient`.
- UseCase зависит от интерфейсов репозиториев и/или `UnitOfWork`, а не от `pg` напрямую.

## 2. Ключевое правило транзакции
Внутри одного `UnitOfWork`:
- `TimelineReadRepository` и `TimelineMutateRepository` обязаны использовать один и тот же `PoolClient`.
- Нельзя создавать новый `Pool`/`Client` внутри репозиториев.

## 3. Рекомендуемая структура каталогов
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
      dto/
        timeline.dto.ts
```

## 4. Интерфейсы
```ts
export interface TimelineReadRepository {
  findById(id: string): Promise<TimelineEntity | null>
  listByFilter(filter: TimelineFilter): Promise<TimelineListItem[]>
}

export interface TimelineMutateRepository {
  createTimeline(input: CreateTimelineRow): Promise<{ id: string }>
  replaceTimelineDays(timelineId: string, days: string[]): Promise<void>
  deleteTimeline(id: string): Promise<void>
}
```

## 5. Transaction Context
```ts
import type { Pool, PoolClient } from "pg"

export type Queryable = Pool | PoolClient
```

Репозитории должны принимать `Queryable` в конструкторе, чтобы работать:
- либо на `Pool` (вне транзакции, read-only use cases),
- либо на `PoolClient` (внутри `UnitOfWork`).

## 6. UnitOfWork
```ts
import type { Pool, PoolClient } from "pg"

export class UnitOfWork {
  constructor(private readonly pool: Pool) {}

  async execute<T>(work: (ctx: {
    timelinesRead: TimelineReadRepository
    timelinesMutate: TimelineMutateRepository
  }) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.pool.connect()
    try {
      await client.query("BEGIN")

      const timelinesRead = new PgTimelineReadRepository(client)
      const timelinesMutate = new PgTimelineMutateRepository(client)

      const result = await work({ timelinesRead, timelinesMutate })

      await client.query("COMMIT")
      return result
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  }
}
```

## 7. Как использовать в UseCase

### Read-only сценарий
- Без транзакции:
  - `new PgTimelineReadRepository(pool)`
  - `service.getTimeline(...)`

### Mutate сценарий
- Через `UnitOfWork.execute(...)`:
  - валидация текущего состояния через `timelinesRead`,
  - запись в `timelines` и `timeline_days` через `timelinesMutate`,
  - коммит одной транзакцией.

## 8. Применение к вашей доменной модели

### Создание таймлайна
1. Проверить ссылки (`project_external_id`, `charge_external_id`, `manager_external_id`, `employee_external_id`) через внешний provider.
2. `uow.execute(...)`:
   - `createTimeline(...)`
   - `replaceTimelineDays(...)` (или batch insert дней)
3. Вернуть `timelineId`.

### Обновление таймлайна
1. Найти `timeline`.
2. Проверить права/валидность.
3. В транзакции:
   - `updateTimeline(...)`
   - пересобрать `timeline_days`.

### Удаление таймлайна
1. В транзакции удалить `timeline`.
2. `timeline_days` удалятся каскадом (`ON DELETE CASCADE`).

## 9. Ограничения и best practices
- Транзакции держать короткими.
- Сетевые вызовы во внешний provider выполнять до `BEGIN` (по возможности).
- Использовать параметризованные SQL-запросы.
- Для bulk-вставки дней использовать один `INSERT ... VALUES ...` батч.
