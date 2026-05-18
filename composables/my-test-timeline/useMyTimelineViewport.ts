import { computed, ref, watch, type Ref } from "vue"
import { clampNumber, toIsoDateUtc } from "./useMyTimelineDate"
import type { TimelineZoomPreset } from "./types"

const SPAN_BY_ZOOM: Record<TimelineZoomPreset, number> = {
  "1w": 7,
  "1m": 31,
  "3m": 92,
  "1y": 365,
}

const PX_BY_ZOOM: Record<TimelineZoomPreset, number> = {
  "1w": 56,
  "1m": 28,
  "3m": 12,
  "1y": 4,
}

export function useMyTimelineViewport(days: Ref<string[]>) {
  const activeZoomPreset = ref<TimelineZoomPreset>("1m")
  const startIndex = ref(0)

  const spanDays = computed(() => Math.max(1, Math.min(days.value.length, SPAN_BY_ZOOM[activeZoomPreset.value])))
  const pxPerDay = computed(() => PX_BY_ZOOM[activeZoomPreset.value])
  const maxStartIndex = computed(() => Math.max(0, days.value.length - spanDays.value))
  const endIndex = computed(() => clampNumber(startIndex.value + spanDays.value - 1, 0, Math.max(days.value.length - 1, 0)))
  const visibleDays = computed(() => days.value.slice(startIndex.value, startIndex.value + spanDays.value))

  function setStartIndex(nextIndex: number): void {
    startIndex.value = clampNumber(Math.round(nextIndex), 0, maxStartIndex.value)
  }

  function panByDays(deltaDays: number): void {
    if (deltaDays === 0) {
      return
    }
    setStartIndex(startIndex.value + deltaDays)
  }

  function panLeft(): void {
    const step = Math.max(1, Math.round(spanDays.value / 4))
    panByDays(-step)
  }

  function panRight(): void {
    const step = Math.max(1, Math.round(spanDays.value / 4))
    panByDays(step)
  }

  function panToToday(): void {
    const today = toIsoDateUtc(new Date())
    const todayIndex = days.value.findIndex((day) => day === today)
    if (todayIndex === -1) {
      setStartIndex(0)
      return
    }

    const centered = todayIndex - Math.floor(spanDays.value / 2)
    setStartIndex(centered)
  }

  function setZoomPreset(nextPreset: TimelineZoomPreset, focusRatio = 0.5): void {
    if (nextPreset === activeZoomPreset.value) {
      return
    }

    const currentSpan = spanDays.value
    const focusIndex = startIndex.value + Math.round(clampNumber(focusRatio, 0, 1) * Math.max(0, currentSpan - 1))

    activeZoomPreset.value = nextPreset

    const nextSpan = Math.max(1, Math.min(days.value.length, SPAN_BY_ZOOM[nextPreset]))
    const nextStart = focusIndex - Math.round(clampNumber(focusRatio, 0, 1) * Math.max(0, nextSpan - 1))
    setStartIndex(nextStart)
  }

  watch([spanDays, maxStartIndex], () => {
    setStartIndex(startIndex.value)
  })

  return {
    activeZoomPreset,
    spanDays,
    pxPerDay,
    startIndex,
    endIndex,
    visibleDays,
    setStartIndex,
    panByDays,
    panLeft,
    panRight,
    panToToday,
    setZoomPreset,
  }
}
