import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue"

interface UseMyTimelineAdaptiveWidthOptions {
  viewportRef: Ref<HTMLElement | null>
  labelColumnWidth: number
  visibleDays: Ref<string[]>
  basePxPerDay: Ref<number>
}

export function useMyTimelineAdaptiveWidth(options: UseMyTimelineAdaptiveWidthOptions) {
  const viewportWidth = ref(0)
  let resizeObserver: ResizeObserver | null = null

  function syncViewportWidth(): void {
    const element = options.viewportRef.value
    viewportWidth.value = element?.clientWidth ?? 0
  }

  function bindResizeObserver(): void {
    if (!import.meta.client) {
      return
    }

    resizeObserver?.disconnect()
    resizeObserver = null

    const element = options.viewportRef.value
    if (!element) {
      return
    }

    resizeObserver = new ResizeObserver(() => {
      syncViewportWidth()
    })

    resizeObserver.observe(element)
    syncViewportWidth()
  }

  const viewportBodyWidth = computed(() =>
    Math.max(0, viewportWidth.value - options.labelColumnWidth - 1),
  )

  const effectivePxPerDay = computed(() => {
    const daysCount = Math.max(1, options.visibleDays.value.length)
    const fitPx = viewportBodyWidth.value / daysCount
    return Math.max(options.basePxPerDay.value, fitPx > 0 ? fitPx : options.basePxPerDay.value)
  })

  const timelineWidthPx = computed(() =>
    Math.max(1, options.visibleDays.value.length * effectivePxPerDay.value),
  )

  const canvasMinWidthPx = computed(() =>
    options.labelColumnWidth + timelineWidthPx.value,
  )

  watch(
    () => options.viewportRef.value,
    () => {
      bindResizeObserver()
    },
  )

  onMounted(() => {
    bindResizeObserver()
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
  })

  return {
    viewportBodyWidth,
    effectivePxPerDay,
    timelineWidthPx,
    canvasMinWidthPx,
  }
}
