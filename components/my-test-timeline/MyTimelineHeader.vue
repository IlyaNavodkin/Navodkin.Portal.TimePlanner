<script setup lang="ts">
import { computed } from "vue"
import { formatMonthLabel } from "~/composables/my-test-timeline/useMyTimelineDate"
import type { TimelineZoomPreset } from "~/composables/my-test-timeline/types"

const props = defineProps<{
  visibleDays: string[]
  pxPerDay: number
  activeZoomPreset: TimelineZoomPreset
}>()

const labelStep = computed(() => {
  if (props.activeZoomPreset === "1w") {
    return 1
  }
  if (props.activeZoomPreset === "1m") {
    return 2
  }
  if (props.activeZoomPreset === "3m") {
    return 7
  }
  return 30
})

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${props.visibleDays.length}, ${props.pxPerDay}px)`,
}))

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
      >
        <span v-if="shouldRenderMonth(index)">{{ formatMonthLabel(day) }}</span>
      </div>
    </div>

    <div class="my-timeline-header__row my-timeline-header__row--days" :style="gridStyle">
      <div
        v-for="(day, index) in visibleDays"
        :key="`day-${day}`"
        class="my-timeline-header__cell my-timeline-header__cell--day"
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
}

.my-timeline-header__row--month {
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg-accented);
}

.my-timeline-header__row--days {
  background: var(--ui-bg-elevated);
}

.my-timeline-header__cell {
  min-width: 0;
  border-right: 1px solid var(--ui-border-muted);
  color: var(--ui-text-toned);
  font-size: 11px;
  text-align: center;
  white-space: nowrap;
}

.my-timeline-header__cell--month {
  min-height: 26px;
  padding-top: 4px;
}

.my-timeline-header__cell--day {
  min-height: 30px;
  padding-top: 6px;
}
</style>
