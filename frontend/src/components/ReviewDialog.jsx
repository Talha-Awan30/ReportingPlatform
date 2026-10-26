import { useEffect, useState } from 'react'

import { errorMessage } from '../api/client'
import { downloadFile, inspectionSetApi, reportApi } from '../api/endpoints'
import { openPdfInNewTab } from '../api/openPdf'
import RevisionChanges from './RevisionChanges'
import { useToast } from './Toast'
import { Modal, TextArea, formatDateTime } from './ui'

/**
 * The reviewer's decision, from the queue: view the complete report in a new
 * tab, download it, then approve or return it with comments.
 *
 * `item` is a review-queue row: { kind: 'set' | 'report', id, number, ... }.
 */
export default function ReviewDialog({ item, onClose, onDone }) {
  const toast = useToast()
  const [step, setStep] = useState(null) // null | 'approve' | 'return'
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState(false)
  const [changes, setChanges] = useState(null)

  // A fresh dialog for every item.
  useEffect(() => {
    setStep(null)
    setText('')
    setBusy(false)
  }, [item?.kind, item?.id])

  // A resubmission: show what the inspector changed since the returned revision.
  useEffect(() => {
    setChanges(null)
    if (!item || !(item.revision > 0)) return undefined
    let cancelled = false
    const many = (item.units || []).length > 1
    Promise.all(
      (item.units || []).map((unit) =>
        reportApi.revisions(unit.id).then(({ revisions }) => ({ unit, latest: revisions[0] })),
      ),
    )
      .then((results) => {
        if (cancelled) return
        const seen = new Set()
        const merged = []
        for (const { unit, latest } of results) {
          for (const change of latest?.changes || []) {
            // The title page is shared by every unit - list its changes once.
            const shared = change.group === 'Title page' || change.field === 'Added' || change.field === 'Removed'
            const key = `${change.group}|${change.field}|${change.old}|${change.new}`
            if (shared && seen.has(key)) continue
            seen.add(key)
            merged.push(
              many && change.group !== 'Title page'
                ? { ...change, group: `${capitalise(item.unit_noun)} #${unit.sequence} · ${change.group}` }
                : change,
            )
          }
        }
        setChanges(merged)
      })
      .catch(() => !cancelled && setChanges([]))
    return () => {
      cancelled = true
    }
  }, [item])

  if (!item) return null

  const isSet = item.kind === 'set'
  const unitWord = isSet
    ? `${item.unit_count} ${item.unit_count === 1 ? item.unit_noun : item.unit_noun_plural}`
    : null
  const pdfUrl = isSet ? inspectionSetApi.pdfUrl(item.id) : reportApi.pdfUrl(item.id)
  const wordUrl = isSet ? inspectionSetApi.downloadUrl(item.id) : reportApi.downloadUrl(item.id)

  const view = async () => {
    setOpening(true)
    try {
      await openPdfInNewTab(item.kind, item.id)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setOpening(false)
    }
  }

  const download = (url, name) => downloadFile(url, name).catch((err) => toast.error(errorMessage(err)))

  const decide = async () => {
    setBusy(true)
    try {
      const api = isSet ? inspectionSetApi : reportApi
      const result =
        step === 'approve'
          ? await api.approve(item.id, { note: text.trim() || null })
          : await api.returnForCorrection(item.id, text.trim())
      toast.success(result.message || (step === 'approve' ? 'Approved.' : 'Returned to the inspector.'))
      onDone()
    } catch (err) {
      toast.error(errorMessage(err))
      setBusy(false)
    }
  }

  const footer =
    step === null ? (
      <>
        <button type="button" className="btn btn-danger" onClick={() => setStep('return')}>
          <i className="fas fa-rotate-left" /> Return
        </button>
        <button type="button" className="btn btn-cta" onClick={() => setStep('approve')}>
          <i className="fas fa-check" /> Approve
        </button>
      </>
    ) : (
      <>
        <button
          type="button"
          className="btn btn-outline"
          disabled={busy}
          onClick={() => {
            setStep(null)
            setText('')
          }}
        >
          Back
        </button>
        <button
          type="button"
          className={step === 'approve' ? 'btn btn-cta' : 'btn btn-danger'}
          disabled={busy || (step === 'return' && !text.trim())}
          onClick={decide}
        >
          {busy ? 'Working…' : step === 'approve' ? 'Confirm approval' : 'Return to inspector'}
        </button>
      </>
    )

  return (
    <Modal open title={item.number} onClose={busy ? undefined : onClose} footer={footer}>
      <dl className="review-facts">
        <dt>Inspection</dt>
        <dd>
          {item.module_name}
          {item.item ? ` · ${item.item}` : ''}
        </dd>
        <dt>Client / Job</dt>
        <dd>{[item.client_name, item.job_number].filter(Boolean).join(' · ') || '—'}</dd>
        <dt>Inspector</dt>
        <dd>{item.inspector_name || '—'}</dd>
        <dt>{isSet ? 'Units' : 'Equipment'}</dt>
        <dd>{isSet ? unitWord : item.equipment_tag || '—'}</dd>
        <dt>Submitted</dt>
        <dd>{formatDateTime(item.submitted_at)}</dd>
        <dt>Revision</dt>
        <dd>
          Rev {item.revision}
          {item.revision > 0 ? ' - resubmitted after a return' : ' - first submission'}
        </dd>
      </dl>

      <div className="review-file-actions">
        <button type="button" className="btn btn-primary" onClick={view} disabled={opening}>
          <i className="fas fa-up-right-from-square" /> {opening ? 'Opening…' : 'View'}
        </button>
        <button type="button" className="btn btn-outline" onClick={() => download(`${pdfUrl}?download=1`, `${item.number}.pdf`)}>
          <i className="fas fa-file-pdf" /> Download PDF
        </button>
        <button type="button" className="btn btn-outline" onClick={() => download(wordUrl, `${item.number}.docx`)}>
          <i className="fas fa-file-word" /> Download Word
        </button>
      </div>

      {item.revision > 0 && step === null && (
        <div className="review-step">
          <p className="revision-caption">What changed since Rev {item.revision - 1}</p>
          {changes === null ? (
            <p className="cell-sub">Loading the changes…</p>
          ) : (
            <RevisionChanges changes={changes} emptyText="The inspector resubmitted without changing any answers." />
          )}
        </div>
      )}

      {step === 'approve' && (
        <div className="review-step">
          <p>
            {isSet
              ? `All ${unitWord} on this visit will be approved and released to the client.`
              : 'The report will be approved and released to the client.'}{' '}
            The certificate expiry is set from the inspection date.
          </p>
          <TextArea
            label="Note (optional)"
            rows={3}
            autoFocus
            value={text}
            placeholder="Anything to record with the approval…"
            onChange={(e) => setText(e.target.value)}
          />
        </div>
      )}
      {step === 'return' && (
        <div className="review-step">
          <p>
            {isSet
              ? `The whole visit (${unitWord}) goes back to the inspector with your comments. It returns here once they resubmit.`
              : 'The report goes back to the inspector with your comments.'}
          </p>
          <TextArea
            label="Comments for the inspector"
            required
            rows={4}
            autoFocus
            value={text}
            placeholder="What needs correcting…"
            onChange={(e) => setText(e.target.value)}
          />
        </div>
      )}
    </Modal>
  )
}

function capitalise(word = 'unit') {
  return word.charAt(0).toUpperCase() + word.slice(1)
}
