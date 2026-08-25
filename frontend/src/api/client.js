import axios from 'axios'

const ACCESS_KEY = 'sgs.access_token'
const REFRESH_KEY = 'sgs.refresh_token'

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY)
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY)
  },
  set({ access_token, refresh_token }) {
    if (access_token) localStorage.setItem(ACCESS_KEY, access_token)
    if (refresh_token) localStorage.setItem(REFRESH_KEY, refresh_token)
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = tokens.access
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// A 401 gets one silent refresh attempt before the user is signed out. Parallel
// 401s share the same refresh call rather than each firing their own.
let refreshing = null

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error
    const isAuthCall = config?.url?.includes('/auth/login') || config?.url?.includes('/auth/refresh')

    if (response?.status === 401 && !config._retried && !isAuthCall && tokens.refresh) {
      config._retried = true
      try {
        refreshing =
          refreshing ||
          axios
            .post('/api/auth/refresh', null, {
              headers: { Authorization: `Bearer ${tokens.refresh}` },
            })
            .finally(() => {
              refreshing = null
            })

        const { data } = await refreshing
        tokens.set(data)
        config.headers.Authorization = `Bearer ${data.access_token}`
        return api(config)
      } catch {
        tokens.clear()
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login?expired=1'
        }
      }
    }

    return Promise.reject(error)
  },
)

/** Pull the human-readable message out of the API's error envelope. */
export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  return error?.response?.data?.error?.message || error?.message || fallback
}

/** Structured details, e.g. the list of missing checkpoints on a failed submit. */
export function errorDetails(error) {
  return error?.response?.data?.error?.details || {}
}

export default api
