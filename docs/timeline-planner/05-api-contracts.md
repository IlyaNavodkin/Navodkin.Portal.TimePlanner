# API-контракты (черновик)

## 1. Backend API для frontend

### `GET /api/managers`
Proxy к внешнему сервису. Возвращает список руководителей.

Response:
```json
[
  { "id": "mgr-1", "name": "Руководитель 1" }
]
```

### `GET /api/managers/:managerId/employees`
Proxy к внешнему сервису. Возвращает сотрудников выбранного руководителя.

Response:
```json
[
  { "id": "emp-1", "name": "Сотрудник 1" }
]
```

### `GET /api/projects`
Proxy к внешнему сервису. Данных в локальной БД нет.

Опциональные query-параметры:
- `search`

### `GET /api/charges`
Proxy к внешнему сервису. Данных в локальной БД нет.

Опциональные query-параметры:
- `projectIds[]`
- `search`

### `GET /api/timeline`
Параметры:
- `managerId` (required)
- `from` (required, date)
- `to` (required, date)
- `projectIds[]` (optional)
- `chargeIds[]` (optional)

Возвращает:
- строки проект/чардж (по данным внешнего сервиса);
- `timelines[]`, где каждый timeline содержит `days[]`.

Пример фрагмента:
```json
{
  "timelines": [
    {
      "id": "tl-1",
      "projectExternalId": "pr-1",
      "chargeExternalId": "ch-1",
      "managerExternalId": "mgr-1",
      "employeeExternalId": "emp-1",
      "employeeName": "Сотрудник 1",
      "days": ["2026-05-21", "2026-05-22", "2026-05-23"]
    }
  ]
}
```

### `POST /api/timelines`
Создание одной сущности таймлайна + его дней.

Request:
```json
{
  "projectExternalId": "pr-1",
  "chargeExternalId": "ch-1",
  "managerExternalId": "mgr-1",
  "employeeExternalId": "emp-1",
  "days": ["2026-05-21", "2026-05-22", "2026-05-23"],
  "comment": "Опционально"
}
```

### `PATCH /api/timelines/:id`
Изменение сотрудника/комментария и пересборка дней (`days[]` полная замена или diff-режим).

### `DELETE /api/timelines/:id`
Удаление таймлайна и связанных `timeline_days`.

## 2. Контракт с внешним микросервисом (mockable)

### `GET /provider/managers`
```json
[
  { "id": "mgr-1", "name": "Житкевич" }
]
```

### `GET /provider/managers/:managerId/employees`
```json
[
  { "id": "emp-1", "name": "Сотрудник 1", "managerId": "mgr-1" }
]
```

### `GET /provider/projects`
```json
[
  { "id": "pr-1", "name": "Проект 1" }
]
```

### `GET /provider/charges?projectId=pr-1`
```json
[
  { "id": "ch-1", "projectId": "pr-1", "name": "Чардж 1" }
]
```

## 3. Что хранится в нашей БД
- Только `timelines` и `timeline_days`.
- Для проекта/чарджа/руководителя/сотрудника хранятся только внешние ссылки (ID).
- Проекты и чарджи не создаются и не обновляются в нашей БД.
