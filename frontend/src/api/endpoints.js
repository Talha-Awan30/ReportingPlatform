import api from './client'

const unwrap = (promise) => promise.then((r) => r.data)

export const authApi = {
  login: (employee_id, password) => unwrap(api.post('/auth/login', { employee_id, password })),
  me: () => unwrap(api.get('/auth/me')),
  updateProfile: (payload) => unwrap(api.patch('/auth/me', payload)),
  changePassword: (payload) => unwrap(api.post('/auth/change-password', payload)),
}

export const dashboardApi = {
  summary: () => unwrap(api.get('/dashboard/summary')),
  activity: () => unwrap(api.get('/dashboard/activity')),
  expiring: () => unwrap(api.get('/dashboard/expiring')),
  byModule: () => unwrap(api.get('/dashboard/by-module')),
  monthly: () => unwrap(api.get('/dashboard/monthly')),
}

export const moduleApi = {
  list: (params) => unwrap(api.get('/modules', { params })),
  get: (slug) => unwrap(api.get(`/modules/${slug}`)),
  formSchema: (slug) => unwrap(api.get(`/modules/${slug}/form-schema`)),
  stats: (slug) => unwrap(api.get(`/modules/${slug}/stats`)),
}

export const clientApi = {
  list: (params) => unwrap(api.get('/clients', { params })),
  get: (id) => unwrap(api.get(`/clients/${id}`)),
  create: (payload) => unwrap(api.post('/clients', payload)),
  update: (id, payload) => unwrap(api.patch(`/clients/${id}`, payload)),
  deactivate: (id) => unwrap(api.delete(`/clients/${id}`)),
  addContact: (id, payload) => unwrap(api.post(`/clients/${id}/contacts`, payload)),
  updateContact: (id, contactId, payload) =>
    unwrap(api.patch(`/clients/${id}/contacts/${contactId}`, payload)),
  deleteContact: (id, contactId) => unwrap(api.delete(`/clients/${id}/contacts/${contactId}`)),
}

export const jobApi = {
  list: (params) => unwrap(api.get('/jobs', { params })),
  get: (id) => unwrap(api.get(`/jobs/${id}`)),
  create: (payload) => unwrap(api.post('/jobs', payload)),
  update: (id, payload) => unwrap(api.patch(`/jobs/${id}`, payload)),
  cancel: (id) => unwrap(api.delete(`/jobs/${id}`)),
  nextNumber: () => unwrap(api.get('/jobs/next-number')),
}

export const equipmentApi = {
  list: (params) => unwrap(api.get('/equipment', { params })),
  get: (id) => unwrap(api.get(`/equipment/${id}`)),
  create: (payload) => unwrap(api.post('/equipment', payload)),
  update: (id, payload) => unwrap(api.patch(`/equipment/${id}`, payload)),
  deactivate: (id) => unwrap(api.delete(`/equipment/${id}`)),
  types: (params) => unwrap(api.get('/equipment/types', { params })),
  createType: (payload) => unwrap(api.post('/equipment/types', payload)),
  updateType: (id, payload) => unwrap(api.patch(`/equipment/types/${id}`, payload)),
}

export const reportApi = {
  list: (params) => unwrap(api.get('/reports', { params })),
  queue: (params) => unwrap(api.get('/reports/queue', { params })),
  get: (id) => unwrap(api.get(`/reports/${id}`)),
  create: (payload) => unwrap(api.post('/reports', payload)),
  update: (id, payload) => unwrap(api.patch(`/reports/${id}`, payload)),
  remove: (id) => unwrap(api.delete(`/reports/${id}`)),
  submit: (id) => unwrap(api.post(`/reports/${id}/submit`)),
  approve: (id, payload) => unwrap(api.post(`/reports/${id}/approve`, payload)),
  returnForCorrection: (id, reason) => unwrap(api.post(`/reports/${id}/return`, { reason })),
  clientApprove: (id) => unwrap(api.post(`/reports/${id}/client-approve`)),
  clientQuery: (id, query) => unwrap(api.post(`/reports/${id}/client-query`, { query })),
  generate: (id) => unwrap(api.post(`/reports/${id}/generate`)),
  uploadPhotos: (id, files, kind, extra = {}) => {
    const form = new FormData()
    Array.from(files).forEach((file) => form.append('files', file))
    form.append('kind', kind)
    Object.entries(extra).forEach(([key, value]) => value && form.append(key, value))
    return unwrap(api.post(`/reports/${id}/photos`, form))
  },
  updatePhoto: (id, photoId, payload) => unwrap(api.patch(`/reports/${id}/photos/${photoId}`, payload)),
  deletePhoto: (id, photoId) => unwrap(api.delete(`/reports/${id}/photos/${photoId}`)),
  downloadUrl: (id) => `/api/reports/${id}/download`,
}

export const inspectionSetApi = {
  list: (params) => unwrap(api.get('/inspection-sets', { params })),
  get: (id) => unwrap(api.get(`/inspection-sets/${id}`)),
  create: (payload) => unwrap(api.post('/inspection-sets', payload)),
  update: (id, payload) => unwrap(api.patch(`/inspection-sets/${id}`, payload)),
  addUnit: (id) => unwrap(api.post(`/inspection-sets/${id}/units`)),
  remove: (id) => unwrap(api.delete(`/inspection-sets/${id}`)),
  generate: (id, force) =>
    unwrap(api.post(`/inspection-sets/${id}/generate`, null, { params: force ? { force: 1 } : {} })),
  downloadUrl: (id) => `/api/inspection-sets/${id}/download`,
  uploadPhotos: (id, files, slotKey, caption) => {
    const form = new FormData()
    Array.from(files).forEach((file) => form.append('files', file))
    form.append('slot_key', slotKey)
    if (caption) form.append('caption', caption)
    return unwrap(api.post(`/inspection-sets/${id}/photos`, form))
  },
  deletePhoto: (id, photoId) => unwrap(api.delete(`/inspection-sets/${id}/photos/${photoId}`)),
}

export const userApi = {
  list: (params) => unwrap(api.get('/users', { params })),
  get: (id) => unwrap(api.get(`/users/${id}`)),
  create: (payload) => unwrap(api.post('/users', payload)),
  update: (id, payload) => unwrap(api.patch(`/users/${id}`, payload)),
  resetPassword: (id, payload) => unwrap(api.post(`/users/${id}/reset-password`, payload)),
  deactivate: (id) => unwrap(api.delete(`/users/${id}`)),
  roles: () => unwrap(api.get('/users/roles')),
  assignable: () => unwrap(api.get('/users/assignable')),
}

export const masterListApi = {
  list: (params) => unwrap(api.get('/master-lists', { params })),
  get: (id) => unwrap(api.get(`/master-lists/${id}`)),
  create: (payload) => unwrap(api.post('/master-lists', payload)),
  update: (id, payload) => unwrap(api.patch(`/master-lists/${id}`, payload)),
  remove: (id) => unwrap(api.delete(`/master-lists/${id}`)),
  addOption: (id, payload) => unwrap(api.post(`/master-lists/${id}/options`, payload)),
  updateOption: (id, optionId, payload) =>
    unwrap(api.patch(`/master-lists/${id}/options/${optionId}`, payload)),
  deleteOption: (id, optionId) => unwrap(api.delete(`/master-lists/${id}/options/${optionId}`)),
}

export const alertApi = {
  list: (params) => unwrap(api.get('/alerts', { params })),
  thresholds: () => unwrap(api.get('/alerts/thresholds')),
  scan: (payload) => unwrap(api.post('/alerts/scan', payload)),
}

/**
 * Download a protected file. The browser cannot send the bearer token on a
 * plain link, so the file is fetched as a blob and saved from memory.
 */
export async function downloadFile(url, filename) {
  const response = await api.get(url.replace('/api', ''), { responseType: 'blob' })
  const href = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = href
  link.download = filename || 'download'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}
