import { ref } from "vue"

export function useApiDataComposable<TData>(initialData: TData) {
  const data = ref<TData>(initialData)
  const loading = ref(false)
  const error = ref<unknown>(null)

  async function fetch(fetcher: () => Promise<TData>): Promise<TData> {
    loading.value = true
    error.value = null

    try {
      const result = await fetcher()
      data.value = result
      return result
    } catch (caughtError) {
      error.value = caughtError
      throw caughtError
    } finally {
      loading.value = false
    }
  }

  function reset(nextData?: TData): void {
    data.value = nextData ?? initialData
    loading.value = false
    error.value = null
  }

  return {
    data,
    loading,
    error,
    fetch,
    reset,
  }
}
