import { useEffect, useState } from 'react'
import { clientApi } from '../api/endpoints'

// Exactly these 7, alphabetical. Must match SBU_OPTIONS in backend/models/client.py.
export const SBU_OPTIONS = [
  'Affiliate',
  'Infrastructure',
  'Manufacturing',
  'Oil & Gas',
  'Others',
  'Power & Utilities',
  'Service Provider',
]

/** Fired after a request is approved or rejected, so the navbar badge refetches. */
export const APPROVALS_CHANGED = 'client-approvals-changed'

/*
 * The approved-client list (~2,300 rows) is fetched once and shared by every
 * picker on screen. `refreshClientDirectory()` reloads it for all of them -
 * call it after a client is approved, created or edited.
 */
let cache = null
let pending = null
const listeners = new Set()

function load(force = false) {
  if (cache && !force) return Promise.resolve(cache)
  if (pending && !force) return pending
  pending = clientApi
    .directory()
    .then(({ clients }) => {
      cache = clients
      listeners.forEach((notify) => notify(cache))
      return cache
    })
    .finally(() => {
      pending = null
    })
  return pending
}

export function refreshClientDirectory() {
  return load(true).catch(() => cache)
}

export function useClientDirectory() {
  const [clients, setClients] = useState(cache)
  const [error, setError] = useState(null)

  useEffect(() => {
    listeners.add(setClients)
    load()
      .then(setClients)
      .catch((err) => setError(err))
    return () => listeners.delete(setClients)
  }, [])

  return { clients: clients || [], loading: !clients && !error, error }
}

/** Case-insensitive match on name, code or sub sector. */
export function matchesClient(client, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [client.name, client.code, client.sub_sector].some((v) =>
    String(v || '').toLowerCase().includes(q),
  )
}

/** The SBU -> sub sector map, fetched once. */
let sbuMapCache = null
export function useSbuSubSectorMap() {
  const [map, setMap] = useState(sbuMapCache || {})
  useEffect(() => {
    if (sbuMapCache) return
    clientApi
      .sbuSubSectorMap()
      .then(({ map: data }) => {
        sbuMapCache = data
        setMap(data)
      })
      .catch(() => {})
  }, [])
  return map
}

export function forgetSbuSubSectorMap() {
  sbuMapCache = null
}
