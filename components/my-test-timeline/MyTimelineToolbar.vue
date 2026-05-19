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
}>()
</script>

<template>
  <div class="my-timeline-toolbar" data-no-pan="true">
    <div class="my-timeline-toolbar__group my-timeline-toolbar__group--filters">
      <div class="my-timeline-toolbar__group-title">Filters</div>
      <div class="my-timeline-toolbar__controls my-timeline-toolbar__controls--filters">
        <div class="my-timeline-toolbar__filter-selects">
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
        </div>
        <UButton color="primary" variant="soft" icon="i-lucide-filter-x" @click="emit('reset-filters')">
          Reset filters
        </UButton>
      </div>
    </div>

    <div class="my-timeline-toolbar__secondary">
      <div class="my-timeline-toolbar__group my-timeline-toolbar__group--compact">
        <div class="my-timeline-toolbar__group-title">Zoom</div>
        <div class="my-timeline-toolbar__controls my-timeline-toolbar__controls--compact">
          <UButton color="neutral" size="xs" :variant="activeZoomPreset === '1w' ? 'solid' : 'soft'" @click="emit('set-zoom', '1w')">1w</UButton>
          <UButton color="neutral" size="xs" :variant="activeZoomPreset === '1m' ? 'solid' : 'soft'" @click="emit('set-zoom', '1m')">1m</UButton>
          <UButton color="neutral" size="xs" :variant="activeZoomPreset === '3m' ? 'solid' : 'soft'" @click="emit('set-zoom', '3m')">3m</UButton>
          <UButton color="neutral" size="xs" :variant="activeZoomPreset === '1y' ? 'solid' : 'soft'" @click="emit('set-zoom', '1y')">1y</UButton>
        </div>
      </div>

      <div class="my-timeline-toolbar__group my-timeline-toolbar__group--compact">
        <div class="my-timeline-toolbar__group-title">Pan</div>
        <div class="my-timeline-toolbar__controls my-timeline-toolbar__controls--compact">
          <UButton color="neutral" variant="soft" size="xs" icon="i-lucide-arrow-left" @click="emit('pan-left')">Left</UButton>
          <UButton color="primary" variant="soft" size="xs" icon="i-lucide-calendar-days" @click="emit('pan-today')">Today</UButton>
          <UButton color="neutral" variant="soft" size="xs" icon="i-lucide-arrow-right" @click="emit('pan-right')">Right</UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.my-timeline-toolbar {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}

.my-timeline-toolbar__group {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg);
}

.my-timeline-toolbar__group--filters {
  width: 100%;
}

.my-timeline-toolbar__secondary {
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  gap: 10px;
}

.my-timeline-toolbar__group--compact {
  flex: 0 0 auto;
  width: fit-content;
}

.my-timeline-toolbar__group-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgb(var(--color-text-muted));
}

.my-timeline-toolbar__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.my-timeline-toolbar__controls--filters {
  width: 100%;
  justify-content: flex-start;
}

.my-timeline-toolbar__filter-selects {
  flex: 1 1 auto;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
}

.my-timeline-toolbar__controls--compact {
  justify-content: space-between;
}

.my-timeline-toolbar__select {
  width: 100%;
  min-width: 0;
}

.my-timeline-toolbar__select--year {
  min-width: 160px;
}

@media (max-width: 1024px) {
  .my-timeline-toolbar__secondary {
    flex-direction: column;
  }

  .my-timeline-toolbar__group--compact {
    width: 100%;
  }

  .my-timeline-toolbar__controls--compact {
    justify-content: flex-start;
  }

  .my-timeline-toolbar__filter-selects {
    grid-template-columns: 1fr;
  }
}
</style>
