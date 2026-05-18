<script setup lang="ts">
defineProps<{
  projectName: string
  chargesCount: number
  collapsed: boolean
  labelColumnWidth: number
  mode?: "full" | "label" | "track"
  rowHeightPx?: number
}>()

const emit = defineEmits<{
  toggle: []
}>()
</script>

<template>
  <div
    v-if="mode === 'label'"
    class="my-timeline-project-row__label"
    :style="{ width: `${labelColumnWidth}px`, height: `${rowHeightPx ?? 42}px` }"
  >
    <button
      type="button"
      class="my-timeline-project-row__toggle"
      data-no-pan="true"
      @click="emit('toggle')"
    >
      <UIcon :name="collapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'" class="size-4 text-muted" />
      <span class="truncate">{{ projectName }}</span>
      <UBadge color="neutral" size="sm" variant="soft">{{ chargesCount }}</UBadge>
    </button>
  </div>

  <div
    v-if="mode === 'track'"
    class="my-timeline-project-row__fill"
    :style="{ height: `${rowHeightPx ?? 42}px` }"
  />

  <div
    v-if="!mode || mode === 'full'"
    class="my-timeline-project-row my-timeline-project-row--full"
    :style="{ gridTemplateColumns: `${labelColumnWidth}px 1fr` }"
  >
    <div class="my-timeline-project-row__label my-timeline-project-row__label--full">
      <button
        type="button"
        class="my-timeline-project-row__toggle"
        data-no-pan="true"
        @click="emit('toggle')"
      >
        <UIcon :name="collapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'" class="size-4 text-muted" />
        <span class="truncate">{{ projectName }}</span>
        <UBadge color="neutral" size="sm" variant="soft">{{ chargesCount }}</UBadge>
      </button>
    </div>
    <div class="my-timeline-project-row__fill my-timeline-project-row__fill--full" />
  </div>
</template>

<style scoped>
.my-timeline-project-row {
  display: grid;
  background: var(--ui-bg);
}

.my-timeline-project-row__label {
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg);
  padding: 8px 10px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
}

.my-timeline-project-row__toggle {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--ui-text-highlighted);
  font-size: 13px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.my-timeline-project-row__fill {
  min-height: 42px;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg);
  box-sizing: border-box;
}

.my-timeline-project-row--full {
  display: grid;
}

.my-timeline-project-row__label--full {
  min-height: 42px;
}

.my-timeline-project-row__fill--full {
  border-top: 0;
}
</style>
