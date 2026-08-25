import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { equipmentApi } from '../../api/endpoints'
import { useApi, useDebounced } from '../../hooks/useApi'
import PageHeader from '../../components/PageHeader'
import Spinner from '../../components/Spinner'
import { CertificationPill, Empty, Pager, formatDate } from '../../components/ui'

const CERT_FILTERS = [
  { value: 'valid', label: 'Valid' },
  { value: 'upcoming', label: 'Due within 60 days' },
  { value: 'due', label: 'Due within 30 days' },
  { value: 'critical', label: 'Due within 7 days' },
  { value: 'expired', label: 'Expired' },
  { value: 'uncertified', label: 'No certificate' },
]

/** The client's own equipment register, read-only, focused on certification status. */
export default function PortalEquipment() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debounced = useDebounced(search)

  const certStatus = params.get('certification_status') || ''

  const equipment = useApi(
    () =>
      equipmentApi.list({
        page,
        per_page: 25,
        search: debounced || undefined,
        certification_status: certStatus || undefined,
      }),
    [page, debounced, certStatus],
  )

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
    setPage(1)
  }

  return (
    <>
      <PageHeader
        icon="fa-gears"
        title="My Equipment"
        subtitle="Every item on your sites, with its inspection history and certification status."
        crumbs={[{ label: 'My Equipment' }]}
      />

      <div className="section-card">
        <div className="filter-bar">
          <div className="search-field">
            <i className="fas fa-search" />
            <input
              type="text"
              placeholder="Search tag, serial number or location…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <select value={certStatus} onChange={(e) => setFilter('certification_status', e.target.value)}>
            <option value="">Any certification status</option>
            {CERT_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        {equipment.loading ? (
          <Spinner label="Loading equipment" />
        ) : equipment.data?.items?.length ? (
          <>
            <div className="table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th>Type</th>
                    <th>Location</th>
                    <th>SWL</th>
                    <th>Last inspected</th>
                    <th>Expires</th>
                    <th className="text-right">Certification</th>
                  </tr>
                </thead>
                <tbody>
                  {equipment.data.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Link to={`/equipment/${item.id}`} className="cell-strong">{item.tag_number}</Link>
                        {item.serial_number && <div className="cell-sub">S/N {item.serial_number}</div>}
                      </td>
                      <td>{item.type_name}</td>
                      <td>{item.location || '—'}</td>
                      <td>{item.swl || '—'}</td>
                      <td className="nowrap">{formatDate(item.last_inspection_date)}</td>
                      <td className="nowrap">{formatDate(item.certificate_expiry_date)}</td>
                      <td className="text-right">
                        <CertificationPill status={item.certification_status} days={item.days_to_expiry} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager meta={equipment.data.meta} onPage={setPage} />
          </>
        ) : (
          <Empty icon="fa-gears" title="No equipment matches those filters" />
        )}
      </div>
    </>
  )
}
