import { ref, type Ref } from "vue"

interface UseMyTimelinePanOptions {
  viewportRef: Ref<HTMLElement | null>
  pxPerDay: Ref<number>
  onPanByDays: (deltaDays: number) => void
}

export function useMyTimelinePan(options: UseMyTimelinePanOptions) {
  const isPanning = ref(false)

  const panPointerId = ref<number | null>(null)
  const pointerDown = ref(false)
  const startClientX = ref(0)
  const lastClientX = ref(0)
  const totalMoveX = ref(0)
  const dayRemainder = ref(0)
  const PAN_ACTIVATION_THRESHOLD_PX = 4

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.button !== 1) {
      return
    }

    const target = event.target
    if (!(target instanceof Element)) {
      return
    }

    if (target.closest("[data-no-pan='true']")) {
      return
    }

    const viewport = options.viewportRef.value
    if (!viewport) {
      return
    }

    pointerDown.value = true
    isPanning.value = false
    panPointerId.value = event.pointerId
    startClientX.value = event.clientX
    lastClientX.value = event.clientX
    totalMoveX.value = 0
    dayRemainder.value = 0
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pointerDown.value || event.pointerId !== panPointerId.value) {
      return
    }

    const viewport = options.viewportRef.value
    if (!viewport) {
      return
    }

    totalMoveX.value = event.clientX - startClientX.value
    if (!isPanning.value) {
      if (Math.abs(totalMoveX.value) < PAN_ACTIVATION_THRESHOLD_PX) {
        return
      }

      isPanning.value = true
      viewport.setPointerCapture(event.pointerId)
      lastClientX.value = event.clientX
      dayRemainder.value = 0
      event.preventDefault()
      return
    }

    const deltaX = event.clientX - lastClientX.value
    lastClientX.value = event.clientX

    const pxPerDay = Math.max(options.pxPerDay.value, 1)
    const deltaDaysFloat = -deltaX / pxPerDay
    const totalDelta = dayRemainder.value + deltaDaysFloat
    const wholeDelta = totalDelta >= 0 ? Math.floor(totalDelta) : Math.ceil(totalDelta)
    dayRemainder.value = totalDelta - wholeDelta

    if (wholeDelta !== 0) {
      options.onPanByDays(wholeDelta)
    }

    event.preventDefault()
  }

  function stopPan(event: PointerEvent): void {
    if (!pointerDown.value || event.pointerId !== panPointerId.value) {
      return
    }

    const viewport = options.viewportRef.value
    if (isPanning.value && viewport && panPointerId.value !== null && viewport.hasPointerCapture(panPointerId.value)) {
      viewport.releasePointerCapture(panPointerId.value)
    }

    pointerDown.value = false
    isPanning.value = false
    panPointerId.value = null
    totalMoveX.value = 0
    dayRemainder.value = 0
  }

  function onPointerUp(event: PointerEvent): void {
    stopPan(event)
  }

  function onPointerCancel(event: PointerEvent): void {
    stopPan(event)
  }

  return {
    isPanning,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  }
}
