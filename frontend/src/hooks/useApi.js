import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '../api/client'

/**
 * Run an async loader on mount and whenever `deps` change.
 *
 * Returns { data, loading, error, reload, setData }. A result that arrives
 * after the component unmounts (or after a newer request started) is discarded,
 * so fast filter typing cannot render a stale response.
 */
export function useApi(loader, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(immediate)
  const [error, setError] = useState(null)

  const requestId = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const result = await loader()
      if (mounted.current && id === requestId.current) setData(result)
      return result
    } catch (err) {
      if (mounted.current && id === requestId.current) setError(errorMessage(err))
      return null
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    if (immediate) run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, immediate])

  return { data, loading, error, reload: run, setData }
}

/** Debounce a value - used so a search box does not fire a request per keystroke. */
export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
