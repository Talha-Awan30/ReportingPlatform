import { useState } from 'react'
import { clientApprovalApi } from '../../api/endpoints'
import { errorMessage } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import {
  APPROVALS_CHANGED,
  forgetSbuSubSectorMap,
  refreshClientDirectory,
} from '../../hooks/useClientDirectory'
import PageHeader from '../../components/PageHeader'
import Spinner from '../../components/Spinner'
import { useToast } from '../../components/Toast'
import { Empty, Modal, formatDateTime } from '../../components/ui'

/**
 * Requests for clients that are not on the approved list yet. Approving one
 * issues it a fresh CL- code and makes it selectable everywhere.
 */
export default function ClientApprovals() {
  const toast = useToast()
  const requests = useApi(() => clientApprovalApi.list(), [])
  const [busyId, setBusyId] = useState(null)
  const [rejecting, setRejecting] = useState(null)

  const act = async (row, action) => {
    setBusyId(row.id)
    try {
      if (action === 'approve') {
        const { client } = await clientApprovalApi.approve(row.id)
        toast.success(`${client.name} approved as ${client.code}.`)
        refreshClientDirectory()
        forgetSbuSubSectorMap()
      } else {
        await clientApprovalApi.reject(row.id)
        toast.success(`${row.client_name} rejected.`)
      }
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusyId(null)
      setRejecting(null)
      requests.reload({ silent: true })
      window.dispatchEvent(new Event(APPROVALS_CHANGED))
    }
  }

  const pending = requests.data?.pending || []

  return (
    <>
      <PageHeader
        icon="fa-user-check"
        title="Client approvals"
        subtitle={
          requests.data
            ? `${pending.length} pending request${pending.length === 1 ? '' : 's'}`
            : 'New clients requested by the team.'
        }
        crumbs={[{ label: 'Admin' }, { label: 'Client approvals' }]}
      />

      <div className="section-card">
        {requests.loading ? (
          <Spinner label="Loading requests" />
        ) : requests.error ? (
          <Empty icon="fa-triangle-exclamation" title="Could not load requests">{requests.error}</Empty>
        ) : pending.length ? (
          <div className="table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Client name</th>
                  <th>SBU</th>
                  <th>Sub sector</th>
                  <th>Requested by</th>
                  <th>Requested</th>
                  <th>Expires</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((row) => (
                  <tr key={row.id}>
                    <td><span className="cell-strong">{row.client_name}</span></td>
                    <td>{row.sbu}</td>
                    <td>{row.sub_sector || '—'}</td>
                    <td>{row.requested_by || '—'}</td>
                    <td className="cell-sub">{formatDateTime(row.created_at)}</td>
                    <td className="cell-sub">{formatDateTime(row.expires_at)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-cta btn-sm"
                          disabled={busyId === row.id}
                          onClick={() => act(row, 'approve')}
                        >
                          <i className="fas fa-check" /> Approve
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={busyId === row.id}
                          onClick={() => setRejecting(row)}
                        >
                          <i className="fas fa-xmark" /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="fa-user-check" title="No pending client requests">
            Requests made with &ldquo;Request new client&rdquo; appear here for approval.
          </Empty>
        )}
      </div>

      <Modal
        open={Boolean(rejecting)}
        title="Reject client request"
        onClose={() => setRejecting(null)}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setRejecting(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-cta"
              disabled={busyId === rejecting?.id}
              onClick={() => act(rejecting, 'reject')}
            >
              Reject request
            </button>
          </>
        }
      >
        <p>
          Reject the request for <strong>{rejecting?.client_name}</strong>? It will not be added to
          the client list.
        </p>
      </Modal>
    </>
  )
}
