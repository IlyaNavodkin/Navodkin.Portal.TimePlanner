<script setup lang="ts">
import type { TimelineFilterOptionModel, TimelineZoomPreset } from "~/composables/my-test-timeline/types"

defineProps<{
  projectOptions: TimelineFilterOptionModel[]
  chargeOptions: TimelineFilterOptionModel[]
  yearOptions: TimelineFilterOptionModel[]
  selectedProjectId: string
  selectedChargeId: string
  selectedYear: string
  activeZoomPreset: TimelineZoomPreset
  projectsCount: number
  chargesCount: number
  timelinesCount: number
}>()

const emit = defineEmits<{
  "update:selectedProjectId": [value: string]
  "update:selectedChargeId": [value: string]
  "update:selectedYear": [value: string]
  "set-zoom": [value: TimelineZoomPreset]
  "reset-filters": []
  "pan-left": []
  "pan-right": []
  "pan-today": []
  "expand-all": []
  "collapse-all": []
}>()
</script>

<template>
  <div class="my-timeline-toolbar" data-no-pan="true">
    <div class="my-timeline-toolbar__head">
      <div>
        <h2 class="text-base font-semibold text-highlighted">My Test Timeline View</h2>
        <p class="text-xs text-muted">Pan, zoom, collapse projects, drag and resize timeline bars.</p>
      </div>
      <div class="my-timeline-toolbar__badges">
        <UBadge color="neutral" variant="soft">{{ projectsCount }} projects</UBadge>
        <UBadge color="neutral" variant="soft">{{ chargesCount }} charges</UBadge>
        <UBadge color="primary" variant="soft">{{ timelinesCount }} bars</UBadge>
      </div>
    </div>

    <div class="my-timeline-toolbar__controls">
      <USelect
        :model-value="selectedProjectId"
        :items="projectOptions"
        value-key="value"
        label-key="label"
        class="my-timeline-toolbar__select"
        @update:model-value="emit('update:selectedProjectId', String($event))"
      />
      <USelect
        :model-value="selectedChargeId"
        :items="chargeOptions"
        value-key="value"
        label-key="label"
        class="my-timeline-toolbar__select"
        @update:model-value="emit('update:selectedChargeId', String($event))"
      />
      <USelect
        :model-value="selectedYear"
        :items="yearOptions"
        value-key="value"
        label-key="label"
        class="my-timeline-toolbar__select my-timeline-toolbar__select--year"
        @update:model-value="emit('update:selectedYear', String($event))"
      />
      <UButton color="neutral" variant="soft" icon="i-lucide-filter-x" @click="emit('reset-filters')">
        Reset filters
      </UButton>
    </div>

    <div class="my-timeline-toolbar__controls">
      <span class="my-timeline-toolbar__label">Zoom:</span>
      <UButton color="neutral" size="xs" :variant="activeZoomPreset === '1w' ? 'solid' : 'soft'" @click="emit('set-zoom', '1w')">1w</UButton>
      <UButton color="neutral" size="xs" :variant="activeZoomPreset === '1m' ? 'solid' : 'soft'" @click="emit('set-zoom', '1m')">1m</UButton>
      <UButton color="neutral" size="xs" :variant="activeZoomPreset === '3m' ? 'solid' : 'soft'" @click="emit('set-zoom', '3m')">3m</UButton>
      <UButton color="neutral" size="xs" :variant="activeZoomPreset === '1y' ? 'solid' : 'soft'" @click="emit('set-zoom', '1y')">1y</UButton>

      <span class="my-timeline-toolbar__label my-timeline-toolbar__label--spaced">Pan:</span>
      <UButton color="neutral" variant="soft" size="xs" icon="i-lucide-arrow-left" @click="emit('pan-left')">Left</UButton>
      <UButton color="neutral" variant="soft" size="xs" icon="i-lucide-calendar-days" @click="emit('pan-today')">Today</UButton>
      <UButton color="neutral" variant="soft" size="xs" icon="i-lucide-arrow-right" @click="emit('pan-right')">Right</UButton>

      <span class="my-timeline-toolbar__label my-timeline-toolbar__label--spaced">Projects:</span>
      <UButton color="neutral" variant="soft" size="xs" @click="emit('expand-all')">Expand all</UButton>
      <UButton color="neutral" variant="soft" size="xs" @click="emit('collapse-all')">Collapse all</UButton>
    </div>
  </div>
</template>

<style scoped>
.my-timeline-toolbar {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.my-timeline-toolbar__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.my-timeline-toolbar__badges {
  display: flex;
  align-items: center;
  gap: 8px;
}

.my-timeline-toolbar__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.my-timeline-toolbar__label {
  font-size: 12px;
  color: rgb(var(--color-text-muted));
}

.my-timeline-toolbar__label--spaced {
  margin-left: 6px;
}

.my-timeline-toolbar__select {
  min-width: 220px;
}

.my-timeline-toolbar__select--year {
  min-width: 190px;
}
</style>
