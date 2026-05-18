# Frontend Architecture (Nuxt)

## 1. Целевая цепочка
`Page -> Feature Composable -> API Composable -> API Client -> /api/*`

## 2. Адаптация под текущий проект

### Page
- `pages/planner.vue` (или `pages/timeline-planner.vue`).
- Рендерит:
  - селект руководителя;
  - мультифильтр проектов;
  - мультифильтр чарджей;
  - timeline grid;
  - popover выбора сотрудника.
- Не содержит бизнес-логики и прямых HTTP-запросов.

### Feature Composable
- `composables/useTimelinePlanner.ts`.
- Оркестрирует:
  - загрузку справочников (managers/projects/charges/employees);
  - загрузку timeline;
  - действия `create/update/delete timeline`;
  - локальное UI-состояние (выбранный день/строка/popover state).

### API State Composable
- `composables/useApiDataComposable.ts`.
- Универсальный state-контейнер:
  - `data`,
  - `loading`,
  - `error`,
  - `fetch`,
  - `reset`.

### API Client
- `services/api/timeline.api.ts`.
- Тонкие typed-функции над `$fetch`:
  - `getTimeline(...)`,
  - `createTimeline(...)`,
  - `updateTimeline(...)`,
  - `deleteTimeline(...)`,
  - `getManagers/getProjects/getCharges/getEmployees`.

### Types
- `features/timeline/types.ts` (или `pages/timeline-planner/types.ts`).
- Хранятся DTO запроса/ответа и UI-модели.

## 3. Рекомендуемая структура каталогов
```txt
app/
  pages/
    planner.vue
  components/
    timeline/
      TimelineGrid.vue
      TimelineHeader.vue
      TimelineRow.vue
      AssignmentBlock.vue
      EmployeePickerPopover.vue
  composables/
    useApiDataComposable.ts
    useTimelinePlanner.ts
  services/
    api/
      timeline.api.ts
  features/
    timeline/
      types.ts
      mappers.ts
```

## 4. Пример типов
```ts
export type TimelineFilter = {
  managerId: string
  projectIds: string[]
  chargeIds: string[]
  from: string
  to: string
}

export type TimelineItemDto = {
  id: string
  projectExternalId: string
  chargeExternalId: string
  managerExternalId: string
  employeeExternalId: string
  employeeName: string
  days: string[]
}

export type TimelineListResponse = {
  timelines: TimelineItemDto[]
}
```

## 5. Пример API-клиента
```ts
export async function fetchTimeline(query: TimelineFilter): Promise<TimelineListResponse> {
  return await $fetch("/api/timeline", { query })
}
```

## 6. Пример feature composable (идея)
```ts
export function useTimelinePlanner() {
  const timelineState = useApiDataComposable<TimelineListResponse>()
  const managerId = ref<string>("")
  const projectIds = ref<string[]>([])
  const chargeIds = ref<string[]>([])

  async function loadTimeline() {
    await timelineState.fetch(() =>
      fetchTimeline({
        managerId: managerId.value,
        projectIds: projectIds.value,
        chargeIds: chargeIds.value,
        from: formatDateRangeStart(),
        to: formatDateRangeEnd(),
      }),
    )
  }

  return {
    state: {
      managerId,
      projectIds,
      chargeIds,
      loading: timelineState.loading,
      error: timelineState.error,
      timelines: computed(() => timelineState.data.value?.timelines ?? []),
    },
    actions: {
      loadTimeline,
    },
  }
}
```

## 7. Правила слоя UI
- Компоненты timeline получают уже подготовленные данные (без SQL/API-логики).
- Все преобразования DTO -> UI model делать в `mappers.ts`.
- Для долгих списков сотрудников применять виртуализацию.
- Для popover выбора сотрудника использовать `Nuxt UI` + `@floating-ui/vue`.
