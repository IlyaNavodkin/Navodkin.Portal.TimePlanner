import { computed, ref, watch, type Ref } from "vue"
import type { TimelineFilterOptionModel, TimelineGridRowModel } from "./types"

const ALL_FILTER_VALUE = "__all"

export function useMyTimelineFilters(rows: Ref<TimelineGridRowModel[]>) {
  const selectedProjectId = ref(ALL_FILTER_VALUE)
  const selectedChargeId = ref(ALL_FILTER_VALUE)

  const projectOptions = computed<TimelineFilterOptionModel[]>(() => {
    const options = new Map<string, TimelineFilterOptionModel>()
    for (const row of rows.value) {
      if (!options.has(row.projectExternalId)) {
        options.set(row.projectExternalId, {
          value: row.projectExternalId,
          label: row.projectName,
        })
      }
    }

    return [
      { label: "All projects", value: ALL_FILTER_VALUE },
      ...[...options.values()].sort((left, right) => left.label.localeCompare(right.label)),
    ]
  })

  const chargeOptions = computed<TimelineFilterOptionModel[]>(() => {
    const options = new Map<string, TimelineFilterOptionModel>()
    for (const row of rows.value) {
      if (selectedProjectId.value !== ALL_FILTER_VALUE && row.projectExternalId !== selectedProjectId.value) {
        continue
      }

      if (!options.has(row.chargeExternalId)) {
        options.set(row.chargeExternalId, {
          value: row.chargeExternalId,
          label: `${row.chargeName} (${row.projectName})`,
        })
      }
    }

    return [
      { label: "All charges", value: ALL_FILTER_VALUE },
      ...[...options.values()].sort((left, right) => left.label.localeCompare(right.label)),
    ]
  })

  const filteredRows = computed(() =>
    rows.value.filter((row) => {
      if (selectedProjectId.value !== ALL_FILTER_VALUE && row.projectExternalId !== selectedProjectId.value) {
        return false
      }

      if (selectedChargeId.value !== ALL_FILTER_VALUE && row.chargeExternalId !== selectedChargeId.value) {
        return false
      }

      return true
    }),
  )

  function resetFilters(): void {
    selectedProjectId.value = ALL_FILTER_VALUE
    selectedChargeId.value = ALL_FILTER_VALUE
  }

  watch(projectOptions, (options) => {
    const isValid = options.some((option) => option.value === selectedProjectId.value)
    if (!isValid) {
      selectedProjectId.value = ALL_FILTER_VALUE
    }
  })

  watch(chargeOptions, (options) => {
    const isValid = options.some((option) => option.value === selectedChargeId.value)
    if (!isValid) {
      selectedChargeId.value = ALL_FILTER_VALUE
    }
  })

  return {
    ALL_FILTER_VALUE,
    selectedProjectId,
    selectedChargeId,
    projectOptions,
    chargeOptions,
    filteredRows,
    resetFilters,
  }
}
