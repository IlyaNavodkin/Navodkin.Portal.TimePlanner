<script setup lang="ts">
import { computed } from "vue"
import { formatMonthLabel } from "~/composables/my-test-timeline/useMyTimelineDate"
import type { TimelineZoomPreset } from "~/composables/my-test-timeline/types"

const props = defineProps<{
  visibleDays: string[]
  pxPerDay: number
  activeZoomPreset: TimelineZoomPreset
}>()
const todayIso = new Date().toISOString().slice(0, 10)

const labelStep = computed(() => {
  if (props.activeZoomPreset === "1w") {
    return 1
  }
  if (props.activeZoomPreset === "1m") {
    return 1
  }
  if (props.activeZoomPreset === "3m") {
    return 7
  }
  return 30
})

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${props.visibleDays.length}, ${props.pxPerDay}px)`,
}))

const monthGroups = computed(() => {
  const groups: Array<{ key: string; label: string; startIndex: number; endIndex: number }> = []
  if (props.visibleDays.length === 0) {
    return groups
  }

  let startIndex = 0
  let currentKey = props.visibleDays[0]?.slice(0, 7) ?? ""

  for (let index = 1; index <= props.visibleDays.length; index += 1) {
    const key = props.visibleDays[index]?.slice(0, 7) ?? ""
    if (index < props.visibleDays.length && key === currentKey) {
      continue
    }

    const day = props.visibleDays[startIndex] ?? ""
    groups.push({
      key: `${currentKey}-${startIndex}`,
      label: day ? formatMonthLabel(day) : currentKey,
      startIndex,
      endIndex: index - 1,
    })

    startIndex = index
    currentKey = key
  }

  return groups
})

function shouldRenderMonth(index: number): boolean {
  if (index === 0) {
    return true
  }

  const current = props.visibleDays[index]
  const previous = props.visibleDays[index - 1]
  if (!current || !previous) {
    return false
  }

  return current.slice(0, 7) !== previous.slice(0, 7)
}
</script>

<template>
  <div class="my-timeline-header">
    <div class="my-timeline-header__row my-timeline-header__row--month" :style="gridStyle">
      <div
        v-for="(day, index) in visibleDays"
        :key="`month-${day}`"
        class="my-timeline-header__cell my-timeline-header__cell--month"
        :class="{ 'my-timeline-header__cell--month-boundary': shouldRenderMonth(index) && index > 0 }"
      />
      <div class="my-timeline-header__month-labels">
        <div
          v-for="group in monthGroups"
          :key="group.key"
          class="my-timeline-header__month-label"
          :style="{
            left: `${group.startIndex * pxPerDay}px`,
            width: `${(group.endIndex - group.startIndex + 1) * pxPerDay}px`,
          }"
        >
          {{ group.label }}
        </div>
      </div>
    </div>

    <div class="my-timeline-header__row my-timeline-header__row--days" :style="gridStyle">
      <div
        v-for="(day, index) in visibleDays"
        :key="`day-${day}`"
        class="my-timeline-header__cell my-timeline-header__cell--day"
        :class="{
          'my-timeline-header__cell--month-boundary': shouldRenderMonth(index) && index > 0,
          'my-timeline-header__cell--today': day === todayIso,
        }"
      >
        <span v-if="index % labelStep === 0">{{ day.slice(8, 10) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.my-timeline-header {
  border-left: 1px solid var(--ui-border);
}

.my-timeline-header__row {
  display: grid;
  border-bottom: 1px solid var(--ui-border);
}

.my-timeline-header__row--month {
  position: relative;
  background: var(--ui-bg);
}

.my-timeline-header__row--days {
  background: var(--ui-bg);
}

.my-timeline-header__cell {
  min-width: 0;
  color: var(--ui-text-toned);
  font-size: 11px;
  text-align: center;
  white-space: nowrap;
}

.my-timeline-header__cell--month {
  min-height: 26px;
  padding-top: 4px;
}

.my-timeline-header__month-labels {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.my-timeline-header__month-label {
  position: absolute;
  bottom: 0;
  padding-top: 4px;
  top: 0px;
  box-sizing: border-box;
  text-align: center;
  font-size: 11px;
  color: var(--ui-text-toned);
  white-space: nowrap;
}

.my-timeline-header__month-label + .my-timeline-header__month-label {
  border-left-color: var(--ui-border);
}

.my-timeline-header__cell--day {
  min-height: 30px;
  padding-top: 6px;
  border-right: 1px solid var(--ui-border-muted);
}

.my-timeline-header__cell--today {
  background: color-mix(in srgb, var(--ui-primary) 18%, transparent);
}

.my-timeline-header__cell--month-boundary {
  border-left: 1px solid var(--ui-border);
}
</style>
