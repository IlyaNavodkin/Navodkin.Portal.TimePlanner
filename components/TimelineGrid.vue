<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"

interface TimelineGridBlock {
  id: string
  employeeName: string
  startIndex: number
  endIndex: number
  lane: number
}

interface TimelineGridRow {
  id: string
  projectExternalId: string
  chargeExternalId: string
  projectName: string
  chargeName: string
  label: string
  lanesCount: number
  blocks: TimelineGridBlock[]
}

interface TimelineProjectGroup {
  projectExternalId: string
  projectName: string
  rows: TimelineGridRow[]
}

interface TimelineCreatePayload {
  row: TimelineGridRow
  day: string
}

const props = withDefaults(
  defineProps<{
    days: string[]
    rows: TimelineGridRow[]
    loading?: boolean
  }>(),
  {
    loading: false,
  },
)

const emit = defineEmits<{
  create: [payload: TimelineCreatePayload]
  edit: [timelineId: string]
  delete: [timelineId: string]
}>()

const DAY_COLUMN_WIDTH = 96
const LANE_HEIGHT = 44
const LABEL_COLUMN_WIDTH = 280
const collapsedProjectIds = ref<Set<string>>(new Set())
const contextMenu = ref<{
  x: number
  y: number
  timelineId: string
} | null>(null)
const contextMenuRef = ref<HTMLElement | null>(null)

function getGridTemplateColumns(daysCount: number): string {
  return `${LABEL_COLUMN_WIDTH}px repeat(${daysCount}, ${DAY_COLUMN_WIDTH}px)`
}

function getTrackHeight(lanesCount: number): string {
  const normalizedLanes = Math.max(lanesCount, 1)
  return `${normalizedLanes * LANE_HEIGHT}px`
}

function getBlockStyle(block: TimelineGridBlock): Record<string, string> {
  return {
    gridColumn: `${block.startIndex + 1} / ${block.endIndex + 2}`,
    gridRow: `${block.lane + 1}`,
  }
}

function formatDay(day: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(day))
}

const groupedRows = computed<TimelineProjectGroup[]>(() => {
  const groups = new Map<string, TimelineProjectGroup>()

  for (const row of props.rows) {
    const existing = groups.get(row.projectExternalId)
    if (existing) {
      existing.rows.push(row)
      continue
    }

    groups.set(row.projectExternalId, {
      projectExternalId: row.projectExternalId,
      projectName: row.projectName,
      rows: [row],
    })
  }

  const result = [...groups.values()]
  for (const group of result) {
    group.rows.sort((left, right) => left.chargeName.localeCompare(right.chargeName))
  }

  return result.sort((left, right) => left.projectName.localeCompare(right.projectName))
})

function isProjectCollapsed(projectExternalId: string): boolean {
  return collapsedProjectIds.value.has(projectExternalId)
}

function toggleProject(projectExternalId: string): void {
  if (collapsedProjectIds.value.has(projectExternalId)) {
    collapsedProjectIds.value.delete(projectExternalId)
    return
  }

  collapsedProjectIds.value.add(projectExternalId)
}

function closeContextMenu(): void {
  contextMenu.value = null
}

function openBlockContextMenu(event: MouseEvent, timelineId: string): void {
  event.preventDefault()
  contextMenu.value = {
    x: event.clientX,
    y: event.clientY,
    timelineId,
  }
}

function handleEditFromMenu(): void {
  if (!contextMenu.value) {
    return
  }

  emit("edit", contextMenu.value.timelineId)
  closeContextMenu()
}

function handleDeleteFromMenu(): void {
  if (!contextMenu.value) {
    return
  }

  emit("delete", contextMenu.value.timelineId)
  closeContextMenu()
}

function handleGlobalPointerDown(event: PointerEvent): void {
  if (!contextMenu.value) {
    return
  }

  const target = event.target
  if (target instanceof Node && contextMenuRef.value?.contains(target)) {
    return
  }

  closeContextMenu()
}

function handleGlobalKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    closeContextMenu()
  }
}

onMounted(() => {
  if (!import.meta.client) {
    return
  }

  window.addEventListener("pointerdown", handleGlobalPointerDown)
  window.addEventListener("resize", closeContextMenu)
  window.addEventListener("scroll", closeContextMenu, true)
  window.addEventListener("keydown", handleGlobalKeyDown)
})

onBeforeUnmount(() => {
  if (!import.meta.client) {
    return
  }

  window.removeEventListener("pointerdown", handleGlobalPointerDown)
  window.removeEventListener("resize", closeContextMenu)
  window.removeEventListener("scroll", closeContextMenu, true)
  window.removeEventListener("keydown", handleGlobalKeyDown)
})
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-base font-semibold">Timeline Grid</h2>
        <UBadge color="neutral" variant="soft">{{ groupedRows.length }} projects</UBadge>
      </div>
    </template>

    <div v-if="loading" class="space-y-2">
      <USkeleton class="h-10 w-full" />
      <USkeleton class="h-10 w-full" />
      <USkeleton class="h-10 w-full" />
    </div>

    <div v-else-if="days.length === 0" class="text-sm text-muted">Set a valid date range.</div>

    <div v-else class="overflow-x-auto rounded-md border border-default">
      <div :style="{ minWidth: `${LABEL_COLUMN_WIDTH + days.length * DAY_COLUMN_WIDTH}px` }">
        <div
          class="grid border-b border-default bg-elevated/60"
          :style="{ gridTemplateColumns: getGridTemplateColumns(days.length) }"
        >
          <div class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-toned">Project / Charge</div>
          <div
            v-for="day in days"
            :key="`header-${day}`"
            class="border-l border-default px-2 py-2 text-center text-xs font-medium text-toned"
          >
            {{ formatDay(day) }}
          </div>
        </div>

        <div v-for="group in groupedRows" :key="group.projectExternalId" class="border-b border-default">
          <div class="grid bg-elevated/40" :style="{ gridTemplateColumns: `${LABEL_COLUMN_WIDTH}px 1fr` }">
            <div class="border-r border-default px-3 py-2">
              <button
                type="button"
                class="flex w-full items-center gap-2 text-left text-sm font-semibold text-highlighted"
                @click="toggleProject(group.projectExternalId)"
              >
                <UIcon
                  :name="isProjectCollapsed(group.projectExternalId) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
                  class="size-4 text-muted"
                />
                <span>{{ group.projectName }}</span>
                <UBadge color="neutral" variant="soft" size="sm">{{ group.rows.length }}</UBadge>
              </button>
            </div>
            <div />
          </div>

          <div v-if="!isProjectCollapsed(group.projectExternalId)">
            <div
              v-for="row in group.rows"
              :key="row.id"
              class="grid border-t border-default"
              :style="{ gridTemplateColumns: `${LABEL_COLUMN_WIDTH}px 1fr` }"
            >
              <div class="border-r border-default px-3 py-3">
                <div class="text-sm font-medium text-highlighted">{{ row.chargeName }}</div>
                <p class="mt-1 text-xs text-muted">Lanes: {{ Math.max(row.lanesCount, 1) }}</p>
              </div>

              <div class="relative" :style="{ height: getTrackHeight(row.lanesCount) }">
                <div
                  class="absolute inset-0 grid"
                  :style="{
                    gridTemplateColumns: `repeat(${days.length}, ${DAY_COLUMN_WIDTH}px)`,
                    gridTemplateRows: `repeat(${Math.max(row.lanesCount, 1)}, ${LANE_HEIGHT}px)`,
                  }"
                >
                  <template v-for="lane in Math.max(row.lanesCount, 1)" :key="`lane-${row.id}-${lane}`">
                    <div
                      v-for="day in days"
                      :key="`cell-${row.id}-${lane}-${day}`"
                      class="border-l border-t border-default/50"
                    />
                  </template>
                </div>

                <div
                  class="absolute inset-0 z-10 grid p-1"
                  :style="{
                    gridTemplateColumns: `repeat(${days.length}, ${DAY_COLUMN_WIDTH}px)`,
                    gridTemplateRows: `repeat(${Math.max(row.lanesCount, 1)}, ${LANE_HEIGHT}px)`,
                  }"
                >
                  <template v-for="lane in Math.max(row.lanesCount, 1)" :key="`add-lane-${row.id}-${lane}`">
                    <div
                      v-for="day in days"
                      :key="`add-cell-${row.id}-${lane}-${day}`"
                      class="group/add-cell relative"
                    >
                      <button
                        type="button"
                        class="pointer-events-none absolute inset-0 flex items-center justify-center group-hover/add-cell:pointer-events-auto"
                        @click.stop="emit('create', { row, day })"
                      >
                        <span
                          class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary opacity-0 transition-opacity group-hover/add-cell:opacity-100"
                        >
                          <UIcon name="i-lucide-plus" class="size-4" />
                        </span>
                      </button>
                    </div>
                  </template>
                </div>

                <div
                  class="pointer-events-none absolute inset-0 z-20 grid p-1"
                  :style="{
                    gridTemplateColumns: `repeat(${days.length}, ${DAY_COLUMN_WIDTH}px)`,
                    gridTemplateRows: `repeat(${Math.max(row.lanesCount, 1)}, ${LANE_HEIGHT}px)`,
                  }"
                >
                  <div
                    v-for="block in row.blocks"
                    :key="block.id"
                    class="pointer-events-auto flex h-[36px] items-center justify-between gap-2 rounded bg-primary/10 px-2 text-xs text-primary"
                    :style="getBlockStyle(block)"
                    @contextmenu="openBlockContextMenu($event, block.id)"
                  >
                    <span class="truncate font-medium">{{ block.employeeName }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="groupedRows.length === 0" class="px-3 py-6 text-sm text-muted">No timeline rows.</div>
      </div>
    </div>
  </UCard>

  <Teleport to="body">
    <div
      v-if="contextMenu"
      ref="contextMenuRef"
      class="fixed z-[120] min-w-[180px] rounded-md border border-default bg-default p-1 shadow-lg"
      :style="{
        left: `${contextMenu.x}px`,
        top: `${contextMenu.y}px`,
      }"
      @contextmenu.prevent
      @pointerdown.stop
    >
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-highlighted hover:bg-elevated"
        @click.stop="handleEditFromMenu"
      >
        <UIcon name="i-lucide-pencil" class="size-4" />
        <span>Редактировать</span>
      </button>
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-error hover:bg-elevated"
        @click.stop="handleDeleteFromMenu"
      >
        <UIcon name="i-lucide-trash-2" class="size-4" />
        <span>Удалить</span>
      </button>
    </div>
  </Teleport>
</template>
