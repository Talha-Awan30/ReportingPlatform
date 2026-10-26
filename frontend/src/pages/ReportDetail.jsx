import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { downloadFile, inspectionSetApi, moduleApi, reportApi } from '../api/endpoints'
import { errorDetails, errorMessage } from '../api/client'
import { useApi } from '../hooks/useApi'
import { DynamicFieldGrid } from '../components/DynamicFields'
import AuthedImage from '../components/AuthedImage'
import { openPdfInNewTab } from '../api/openPdf'
import { ROLES, useAuth } from '../auth/AuthContext'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import { useToast } from '../components/Toast'
import {
  Empty,
  Modal,
  Pill,
  StatusPill,
  TextArea,
  formatDate,
  formatDateTime,
  toDateInput,
} from '../components/ui'

/**
 * One report, end to end: the inspection form (rendered from the module
 * manifest), both photo sets, the workflow actions available to this user, and
 * the full approval trail.
 */
export default function ReportDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user, hasRole, isClient } = useAuth()

  const report = useApi(() => reportApi.get(id), [id])
  const slug = report.data?.report?.module_slug
  const schema = useApi(() => (slug ? moduleApi.formSchema(slug) : null), [slug])

  const [answers, setAnswers] = useState({})
  const [comments, setComments] = useState('')
  const [overallResult, setOverallResult] = useState('')
  const [inspectionDate, setInspectionDate] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [missing, setMissing] = useState([])
  const [dialog, setDialog] = useState(null) // 'return' | 'query' | 'approve'
  const [prefilledCount, setPrefilledCount] = useState(0)

  // Seed the form once the report arrives, and again after any reload.
  const loadedRevision = useRef(null)
  useEffect(() => {
    const data = report.data?.report
    if (!data) return
    const stamp = `${data.id}:${data.revision}:${data.updated_at}`
    if (loadedRevision.current === stamp) return
    loadedRevision.current = stamp

    // Merge in anything already typed on an earlier lift of the same visit,
    // without ever overwriting what this lift already has.
    const prefill = data.prefill || {}
    const merged = { ...data.data }
    let carried = 0
    Object.entries(prefill).forEach(([key, entry]) => {
      if (!merged[key]?.value) {
        merged[key] = entry
        carried += 1
      }
    })
    setAnswers(merged)
    setPrefilledCount(carried)
    setComments(data.comments || '')
    setOverallResult(data.overall_result || '')
    setInspectionDate(toDateInput(data.inspection_date))
    setDirty(carried > 0)
  }, [report.data])

  // Every section starts shut - 81 questions at once is unreadable. Keyed on
  // the report id too, so moving to the next unit shuts them all again instead
  // of inheriting whatever was open on the previous one.
  const [collapsed, setCollapsed] = useState(() => new Set())
  useEffect(() => {
    const sections = schema.data?.module?.sections
    if (!sections) return
    setCollapsed(new Set(sections.map((s) => s.key)))
  }, [schema.data, id])

  const setAnswer = useCallback((key, patch) => {
    setAnswers((current) => ({ ...current, [key]: { ...(current[key] || {}), ...patch } }))
    setDirty(true)
  }, [])

  const toggleSection = useCallback((key) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  /** Set every dropdown in one section to the same option in a single click. */
  const bulkFill = useCallback((section, value) => {
    setAnswers((current) => {
      const next = { ...current }
      section.checkpoints
        .filter((cp) => cp.kind === 'dropdown')
        .forEach((cp) => {
          next[cp.key] = { ...(next[cp.key] || {}), value }
        })
      return next
    })
    setDirty(true)
  }, [])

  const data = report.data?.report
  const module = schema.data?.module
  // Modules with a particulars table already capture the client, location,
  // inspection date and status there - the generic details card would repeat them.
  const hasParticulars = module?.unit_details?.length > 0
  const options = schema.data?.options || {}

  // Revision control: null shows the live report; a number shows that past
  // revision read-only, exactly as it was submitted.
  const [viewRev, setViewRev] = useState(null)
  useEffect(() => setViewRev(null), [id])
  const revisionList = useApi(
    () => (isClient ? null : reportApi.revisions(id)),
    [id, report.data?.report?.revision, report.data?.report?.status],
  )
  const snapshot = useApi(() => (viewRev == null ? null : reportApi.revision(id, viewRev)), [id, viewRev])

  const canEdit = useMemo(() => {
    if (!data) return false
    if (isClient) return false
    if (!data.is_editable) return false
    if (user?.role === ROLES.INSPECTOR && data.inspector_name !== user.full_name) return false
    return true
  }, [data, isClient, user])

  const save = async ({ silent = false } = {}) => {
    setSaving(true)
    try {
      const result = await reportApi.update(id, {
        data: answers,
        comments,
        // With a particulars table, the report's own date and result follow it.
        overall_result: (hasParticulars ? answers.status?.value : overallResult) || null,
        inspection_date: (hasParticulars ? answers.inspection_date?.value : inspectionDate) || null,
      })
      report.setData({ ...report.data, report: { ...report.data.report, ...result.report } })
      setDirty(false)
      if (!silent) toast.success('Draft saved.')
      return true
    } catch (err) {
      toast.error(errorMessage(err))
      return false
    } finally {
      setSaving(false)
    }
  }

  const submit = async () => {
    if (dirty && !(await save({ silent: true }))) return
    setMissing([])
    try {
      // A unit of a visit submits the whole visit - every lift in one go.
      const result = data.inspection_set_id
        ? await inspectionSetApi.submit(data.inspection_set_id)
        : await reportApi.submit(id)
      toast.success(result.message)
      report.reload()
    } catch (err) {
      const details = errorDetails(err)
      const mine = (details.units || []).find((u) => u.id === data.id)
      setMissing(mine ? mine.missing : details.missing || [])
      toast.error(errorMessage(err))
    }
  }

  const act = async (fn, successMessage) => {
    try {
      const result = await fn()
      toast.success(result.message || successMessage)
      setDialog(null)
      report.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const download = async () => {
    try {
      await downloadFile(reportApi.downloadUrl(id), data.docx_path)
    } catch (err) {
      toast.error(errorMessage(err, 'The document is not available yet.'))
    }
  }

  /** The whole visit: title page once, then every lift. */
  const downloadCombined = async () => {
    const setId = data.inspection_set_id
    try {
      // Build it first, so a lift edited since the last generate is included.
      const result = await inspectionSetApi.generate(setId, true)
      await downloadFile(
        inspectionSetApi.downloadUrl(setId),
        result.set?.docx_path || `${data.set_number}.docx`,
      )
    } catch (err) {
      toast.error(errorMessage(err, 'The combined report could not be built.'))
    }
  }

  const remove = async () => {
    if (!window.confirm('Delete this draft? This cannot be undone.')) return
    try {
      await reportApi.remove(id)
      toast.success('Draft deleted.')
      navigate('/reports')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  if (report.loading) return <Spinner full label="Loading report" />
  if (report.error) return <Empty icon="fa-triangle-exclamation" title="Could not load this report">{report.error}</Empty>

  const missingKeys = new Set(missing.map((m) => m.key))
  const enforceRequired = schema.data?.enforce_required ?? true
  const filledSlots = new Set(
    (data.photos || []).filter((p) => p.checkpoint_key).map((p) => p.checkpoint_key),
  )
  const slotsFilled = (module?.photo_slots || []).filter((s) => filledSlots.has(s.key)).length

  const units = data.set_units || []

  // A past revision is shown read-only, with the answers it was submitted with.
  const revisionRows = revisionList.data?.revisions || []
  const viewingPast = viewRev != null
  const past = viewingPast ? snapshot.data : null
  const shownAnswers = viewingPast ? past?.data || {} : answers
  const editable = canEdit && !viewingPast
  const shownPhotos = viewingPast
    ? (data.photos || []).filter((p) => (past?.photo_ids || []).includes(p.id))
    : data.photos || []
  // The live report is a revision of its own once submitted; while it is
  // being corrected after a return it becomes the next one.
  const liveLabel = !revisionRows.length
    ? `Rev ${data.revision} (draft)`
    : data.is_editable && data.status === 'returned'
      ? `Rev ${data.revision + 1} (being corrected)`
      : `Rev ${data.revision} (current)`
  const pastRows = revisionRows.filter(
    (r) => !(r.revision === data.revision && !(data.is_editable && data.status === 'returned')),
  )
  const fileRev = viewingPast ? viewRev : revisionRows.find((r) => r.revision === data.revision)?.revision
  const fileRow = revisionRows.find((r) => r.revision === fileRev)
  const viewRevisionPdf = () =>
    openPdfInNewTab('revision', data.id, { revision: fileRev }).catch((err) => toast.error(errorMessage(err)))
  const downloadRevision = (format) =>
    downloadFile(reportApi.revisionFileUrl(data.id, fileRev, format), `rev${fileRev}.${format}`).catch((err) =>
      toast.error(errorMessage(err)),
    )
  const unitNoun = module?.unit_noun || 'unit' 

  return (
    <>
      <PageHeader
        icon="fa-file-lines"
        title={data.report_number}
        subtitle={[
          data.set_number && `${data.set_number} · ${module?.unit_noun || 'unit'} #${data.sequence}`,
          data.equipment_tag,
          data.client_name,
        ]
          .filter(Boolean)
          .join(' · ')}
        crumbs={[{ label: 'Reports', to: '/reports' }, { label: data.report_number }]}
        actions={
          <>
            {/* Decisions act on the current report, so not while an old one is open. */}
            {hasRole(ROLES.REVIEWER) && data.status === 'submitted' && !viewingPast && (
              <>
                <button type="button" className="btn btn-outline" onClick={() => setDialog('return')}>
                  <i className="fas fa-rotate-left" /> Return
                </button>
                <button type="button" className="btn btn-cta" onClick={() => setDialog('approve')}>
                  <i className="fas fa-check" /> Approve &amp; release
                </button>
              </>
            )}

            {isClient && ['approved', 'client_query'].includes(data.status) && (
              <>
                <button type="button" className="btn btn-outline" onClick={() => setDialog('query')}>
                  <i className="fas fa-circle-question" /> Raise a query
                </button>
                <button
                  type="button"
                  className="btn btn-cta"
                  onClick={() => act(() => reportApi.clientApprove(id), 'Report approved.')}
                >
                  <i className="fas fa-check" /> Approve
                </button>
              </>
            )}

          </>
        }
      />

      {/* Every unit of the visit, so any lift is one click away. */}
      {units.length > 1 && (
        <nav className="unit-switcher" aria-label={`${module?.unit_noun_plural || 'Units'} on this visit`}>
          {units.map((u) => (
            <Link
              key={u.id}
              to={`/reports/${u.id}`}
              className={`unit-tab${u.id === data.id ? ' active' : ''}`}
              aria-current={u.id === data.id ? 'page' : undefined}
            >
              <strong>
                {unitNoun.charAt(0).toUpperCase() + unitNoun.slice(1)} #{u.sequence}
              </strong>
              <small>{u.identification || u.report_number}</small>
            </Link>
          ))}
        </nav>
      )}

      {/* Revision control: pick a revision to see it exactly as submitted. */}
      {!isClient && revisionRows.length > 0 && (
        <div className="revision-bar">
          <label className="revision-select">
            <span>Revision</span>
            <select
              value={viewRev == null ? '' : String(viewRev)}
              onChange={(e) => setViewRev(e.target.value === '' ? null : Number(e.target.value))}
            >
              <option value="">{liveLabel}</option>
              {pastRows.map((r) => (
                <option key={r.revision} value={r.revision}>
                  Rev {r.revision} · {r.outcome === 'returned' ? 'Returned' : r.outcome === 'approved' ? 'Approved' : 'Awaiting review'}
                  {r.submitted_at ? ` · ${formatDateTime(r.submitted_at)}` : ''}
                </option>
              ))}
            </select>
          </label>
          {fileRow && (
            <div className="revision-files">
              {fileRow.has_pdf && (
                <>
                  <button type="button" className="btn btn-outline btn-sm" onClick={viewRevisionPdf}>
                    <i className="fas fa-up-right-from-square" /> View
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadRevision('pdf')}>
                    <i className="fas fa-file-pdf" /> Download PDF
                  </button>
                </>
              )}
              {fileRow.has_docx && (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadRevision('docx')}>
                  <i className="fas fa-file-word" /> Download Word
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {viewingPast && (
        <div className={`alert ${past?.outcome === 'returned' ? 'alert-danger' : 'alert-info'}`} style={{ marginBottom: '1.5rem' }}>
          <i className="fas fa-clock-rotate-left" />
          <span style={{ flex: 1 }}>
            <strong>Viewing Rev {viewRev}</strong>
            {past?.submitted_at && `, submitted ${formatDateTime(past.submitted_at)}`}
            {past?.submitted_by && ` by ${past.submitted_by}`} - read only.
            {past?.review_comment && (
              <>
                {' '}
                <strong>{past.outcome === 'returned' ? 'Returned' : 'Reviewer'}:</strong> {past.review_comment}
              </>
            )}{' '}
            <button type="button" className="link-button" onClick={() => setViewRev(null)}>
              Back to the current report
            </button>
          </span>
        </div>
      )}

      {!viewingPast && data.status === 'returned' && data.return_reason && (
        <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
          <i className="fas fa-rotate-left" />
          <span>
            <strong>Returned for correction:</strong> {data.return_reason}
          </span>
        </div>
      )}

      {data.status === 'client_query' && data.client_query_text && (
        <div className="alert alert-warning" style={{ marginBottom: '1.5rem' }}>
          <i className="fas fa-circle-question" />
          <span>
            <strong>Client query:</strong> {data.client_query_text}
          </span>
        </div>
      )}

      {missing.length > 0 && (
        <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
          <i className="fas fa-triangle-exclamation" />
          <span>
            <strong>{missing.length} required checkpoint(s) are still blank.</strong> They are
            highlighted below.
          </span>
        </div>
      )}

      {/* ------------------------------------------------------------ header */}
      {!hasParticulars && (
      <div className="section-card">
        <div className="card-head">
          <div>
            <h2><i className="fas fa-circle-info" /> Report details</h2>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <StatusPill label={data.status_label} severity={data.status_severity} />
            <Pill tone="neutral">Revision {data.revision}</Pill>
          </div>
        </div>

        <div className="detail-grid">
          <Detail k="Client" v={data.client_name} />
          <Detail k="Job" v={<Link to={`/jobs/${data.job_id}`}>{data.job_number}</Link>} />
          <Detail k="Equipment" v={<Link to={`/equipment/${data.equipment_id}`}>{data.equipment_tag}</Link>} />
          <Detail k="Equipment type" v={data.equipment_type} />
          <Detail k="Serial number" v={data.equipment?.serial_number} />
          <Detail k="SWL / Capacity" v={[data.equipment?.swl, data.equipment?.capacity].filter(Boolean).join(' · ')} />
          <Detail k="Location" v={data.equipment?.location} />
          <Detail k="Inspector" v={data.inspector_name} />
          <Detail k="Reviewer" v={data.reviewer_name} />
          <Detail k="Submitted" v={formatDateTime(data.submitted_at)} />
          <Detail k="Reviewed" v={formatDateTime(data.reviewed_at)} />
          <Detail k="Certificate expires" v={formatDate(data.certificate_expiry_date)} />
        </div>

        {editable && (
          <div className="field-grid" style={{ marginTop: '1.5rem' }}>
            <div className="field">
              <label>Inspection date</label>
              <input
                type="date"
                value={inspectionDate}
                onChange={(e) => {
                  setInspectionDate(e.target.value)
                  setDirty(true)
                }}
              />
            </div>
            <div className="field">
              <label>Overall conclusion</label>
              <select
                value={overallResult}
                onChange={(e) => {
                  setOverallResult(e.target.value)
                  setDirty(true)
                }}
              >
                <option value="">Not set</option>
                {(options.overall_result?.options || [
                  { value: 'satisfactory', label: 'Satisfactory' },
                  { value: 'unsatisfactory', label: 'Unsatisfactory' },
                  { value: 'conditional', label: 'Conditional' },
                ]).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ------------------------------------------------- particulars table */}
      {hasParticulars && (
        <div className="section-card">
          <div className="card-head">
            <div>
              <h2><i className="fas fa-table-list" /> Particulars</h2>
              <p className="card-sub">
                The detail table printed at the head of this {module.unit_noun}&apos;s report.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusPill label={data.status_label} severity={data.status_severity} />
              <Pill tone="neutral">Revision {data.revision}</Pill>
              {data.set_number && (
                <Link to={`/inspection-sets/${data.inspection_set_id}`} className="btn btn-outline btn-sm">
                  <i className="fas fa-layer-group" /> {data.set_number} · {module.unit_noun} #{data.sequence}
                </Link>
              )}
            </div>
          </div>

          {prefilledCount > 0 && editable && (
            <div className="alert alert-info" style={{ marginBottom: '1.25rem' }}>
              <i className="fas fa-wand-magic-sparkles" />
              <span>
                <strong>{prefilledCount} field(s) carried over</strong> from the earlier{' '}
                {module.unit_noun_plural} on this visit. Check them, then fill in this{' '}
                {module.unit_noun}&apos;s own Identification and Serial Number.
              </span>
            </div>
          )}

          <DynamicFieldGrid
            fields={module.unit_details}
            values={shownAnswers}
            options={options}
            editable={editable}
            showRequired={enforceRequired}
            missingKeys={missingKeys}
            onChange={(key, patch) => setAnswer(key, patch)}
          />
        </div>
      )}

      {/* -------------------------------------------------------------- form */}
      {schema.loading ? (
        <Spinner label="Loading the inspection form" />
      ) : module && module.sections.length ? (
        module.sections.map((section, index) => (
          <ChecklistSection
            key={section.key}
            index={index + 1}
            section={section}
            answers={shownAnswers}
            options={options}
            editable={editable}
            missingKeys={missingKeys}
            collapsed={collapsed.has(section.key)}
            onToggle={() => toggleSection(section.key)}
            onChange={setAnswer}
            onBulkFill={bulkFill}
          />
        ))
      ) : (
        <div className="section-card">
          <Empty icon="fa-hammer" title="This module has no checkpoints yet">
            The <strong>{data.module_slug}</strong> module is scaffolded but its checkpoint list has
            not been built out. Add sections to its <code>module.py</code> and they appear here.
          </Empty>
        </div>
      )}

      {/* --------------------------------------------- findings & conclusion */}
      {module?.conclusion?.length > 0 && (
        <div className="section-card">
          <div className="card-head">
            <div>
              <h2><i className="fas fa-gavel" /> Findings &amp; conclusion</h2>
              <p className="card-sub">Closes this {module.unit_noun}&apos;s report.</p>
            </div>
          </div>
          <DynamicFieldGrid
            fields={module.conclusion}
            values={shownAnswers}
            options={options}
            editable={editable}
            showRequired={enforceRequired}
            missingKeys={missingKeys}
            onChange={(key, patch) => setAnswer(key, patch)}
          />
        </div>
      )}

      {/* ---------------------------------------------------------- comments */}
      {/* The SGS report (modules with a particulars table) has nowhere to print
          free text, so it is only asked for where the report carries it. */}
      {!hasParticulars && (
      <div className="section-card">
        <div className="card-head">
          <div>
            <h2><i className="fas fa-comment-dots" /> Observations &amp; recommendations</h2>
            <p className="card-sub">Free text that carries straight into the Word report.</p>
          </div>
        </div>
        {editable ? (
          <TextArea
            value={comments}
            onChange={(e) => {
              setComments(e.target.value)
              setDirty(true)
            }}
            placeholder="Defects found, recommendations, anything the client should act on…"
            rows={5}
          />
        ) : (
          <p style={{ whiteSpace: 'pre-wrap' }}>{comments || <span className="muted">No comments recorded.</span>}</p>
        )}
      </div>
      )}

      {/* ------------------------------------------------------------ photos */}
      {module?.photo_slots?.length > 0 ? (
        <div className="section-card">
          <div className="card-head">
            <div>
              <h2><i className="fas fa-images" /> Photographic presentation</h2>
              <p className="card-sub">
                One photograph per box, laid out exactly as the approved report format.
              </p>
            </div>
            <Pill tone={slotsFilled === module.photo_slots.length ? 'success' : 'warning'}>
              {slotsFilled} of {module.photo_slots.length} filled
            </Pill>
          </div>
          <div className="photo-grid">
            {module.photo_slots.map((slot) => (
              <ReportPhotoSlot
                key={slot.key}
                reportId={id}
                slot={slot}
                photos={shownPhotos.filter(
                  (p) => p.kind === 'inspection' && p.checkpoint_key === slot.key,
                )}
                editable={editable}
                onChanged={() => report.reload({ silent: true })}
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          <PhotoSection
            reportId={id}
            title="Front-page photographs"
            subtitle="Used only on the report cover — kept separate on purpose."
            icon="fa-image"
            kind="front_page"
            photos={shownPhotos.filter((p) => p.kind === 'front_page')}
            editable={editable}
            onChanged={() => report.reload({ silent: true })}
          />

          <PhotoSection
            reportId={id}
            title="Inspection photographs"
            subtitle="Evidence for the body of the report."
            icon="fa-images"
            kind="inspection"
            photos={shownPhotos.filter((p) => p.kind === 'inspection')}
            editable={editable}
            onChanged={() => report.reload({ silent: true })}
          />
        </>
      )}

      {/* ------------------------------------------------------ actions */}
      {editable && (
        <div className="form-footer">
          <span className="footer-note">
            {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
          </span>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => save()}
            disabled={saving || !dirty}
          >
            <i className="fas fa-floppy-disk" /> Save draft
          </button>
          <button
            type="button"
            className="btn btn-cta btn-lg"
            onClick={submit}
            disabled={saving}
          >
            {units.length > 1 ? (
              <>
                <i className="fas fa-paper-plane" /> Submit inspection ({units.length} {module?.unit_noun_plural || 'units'})
              </>
            ) : (
              <>
                <i className="fas fa-paper-plane" /> Submit for review
              </>
            )}
          </button>
        </div>
      )}

      {/* ----------------------------------------------------------- dialogs */}
      <ReasonDialog
        open={dialog === 'return'}
        title="Return for correction"
        label="What needs to be fixed?"
        confirmLabel="Return to inspector"
        onClose={() => setDialog(null)}
        onConfirm={(reason) => act(() => reportApi.returnForCorrection(id, reason), 'Returned.')}
      />

      <ReasonDialog
        open={dialog === 'query'}
        title="Raise a query"
        label="What would you like clarified?"
        confirmLabel="Send query"
        onClose={() => setDialog(null)}
        onConfirm={(query) => act(() => reportApi.clientQuery(id, query), 'Query raised.')}
      />

      <ApproveDialog
        open={dialog === 'approve'}
        report={data}
        onClose={() => setDialog(null)}
        onConfirm={(payload) => act(() => reportApi.approve(id, payload), 'Approved.')}
      />
    </>
  )
}

/* ------------------------------------------------------------------ pieces */

/** Has this checkpoint actually been answered? */
function hasValue(entry) {
  const value = entry?.value
  return value !== undefined && value !== null && value !== ''
}

/**
 * One collapsible check-list section, with its own progress and a bulk-fill
 * control - an inspector marking a whole section Satisfactory is the common
 * case, and doing it row by row is 17 clicks.
 */
/**
 * One check-list section. Shut by default; the whole header is the toggle.
 * "Set all" answers every question in the section in one go, which is the
 * common case on a satisfactory lift.
 */
function ChecklistSection({
  index,
  section,
  answers,
  options,
  editable,
  missingKeys,
  collapsed,
  onToggle,
  onChange,
  onBulkFill,
}) {
  // Every dropdown in a section shares one option list in practice, so the
  // labels become column headings and each row is just a line of radio dots.
  const firstDropdown = section.checkpoints.find((cp) => cp.kind === 'dropdown')
  const headerKey = firstDropdown?.options_key
  const columns = headerKey ? options[headerKey]?.options || [] : []

  return (
    <div className={`section-card${collapsed ? ' is-closed' : ''}`} id={`section-${section.key}`}>
      <div className="card-head" style={{ marginBottom: collapsed ? 0 : '1rem' }}>
        <button
          type="button"
          className="section-toggle"
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          <i className="fas fa-chevron-down chevron" />
          <h2>
            {index}. {section.title}
          </h2>
        </button>

        {editable && !collapsed && columns.length > 0 && (
          <label className="bulk-fill">
            Set all to
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) onBulkFill(section, e.target.value)
                e.target.value = ''
              }}
            >
              <option value="">Choose…</option>
              {columns.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!collapsed && (
        <div className="table-container">
          <table className="check-table">
            <thead>
              <tr>
                <th className="cp-col">Check point</th>
                {columns.map((option) => (
                  <th key={option.value} className="opt-col">
                    {option.label}
                  </th>
                ))}
                <th className="rem-col">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {section.checkpoints.map((cp, row) => (
                <CheckpointRow
                  key={cp.key}
                  number={`${index}.${row + 1}`}
                  checkpoint={cp}
                  value={answers[cp.key] || {}}
                  columns={cp.options_key === headerKey ? columns : null}
                  fallbackOptions={options[cp.options_key]?.options || []}
                  editable={editable}
                  flagged={missingKeys.has(cp.key)}
                  onChange={(patch) => onChange(cp.key, patch)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Detail({ k, v }) {
  return (
    <div className="field">
      <div className="k">{k}</div>
      <div className="v">{v || <span className="muted">—</span>}</div>
    </div>
  )
}

/**
 * One check point: the question, a row of radio chips for the answer, and a
 * remarks box beside them.
 */
function CheckpointRow({
  number,
  checkpoint,
  value,
  columns,
  fallbackOptions,
  editable,
  flagged,
  onChange,
}) {
  const answered = hasValue(value)
  const rowStyle = flagged ? { background: 'rgba(245, 38, 46, 0.05)' } : undefined

  const label = (
    <td className="cp-col">
      <span className="cp-number">{number}</span>
      <span>
        {checkpoint.label}
        {checkpoint.help_text && <span className="cell-sub">{checkpoint.help_text}</span>}
      </span>
    </td>
  )

  const remarks = (
    <td className="rem-col">
      {editable ? (
        <input
          type="text"
          placeholder="Remarks"
          value={value.remarks || ''}
          onChange={(e) => onChange({ remarks: e.target.value })}
        />
      ) : (
        <span className="cell-sub">{value.remarks || ''}</span>
      )}
    </td>
  )

  // A check point answered from the section's own option list: one dot per
  // column, under the heading that names it.
  if (columns) {
    return (
      <tr className={answered ? 'answered' : undefined} style={rowStyle}>
        {label}
        {columns.map((option) => (
          <td key={option.value} className="opt-col">
            <label className="dot" title={option.label}>
              <input
                type="radio"
                name={`cp-${checkpoint.key}`}
                checked={value.value === option.value}
                disabled={!editable}
                onChange={() => onChange({ value: option.value })}
              />
              <span className={option.severity || ''} />
              <span className="sr-only">{option.label}</span>
            </label>
          </td>
        ))}
        {remarks}
      </tr>
    )
  }

  // Anything else - a free-text or date field, or a dropdown on a different
  // list - spans the option columns and keeps its own control.
  const span = { colSpan: 99 }
  const common = {
    value: value.value ?? '',
    onChange: (e) => onChange({ value: e.target.value }),
    disabled: !editable,
  }

  let control
  if (checkpoint.kind === 'dropdown') {
    control = (
      <select {...common}>
        <option value="">Select…</option>
        {fallbackOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  } else if (checkpoint.kind === 'textarea') {
    control = <textarea rows={2} {...common} />
  } else if (checkpoint.kind === 'number') {
    control = <input type="number" {...common} />
  } else if (checkpoint.kind === 'date') {
    control = <input type="date" {...common} />
  } else {
    control = <input type="text" {...common} />
  }

  return (
    <tr className={answered ? 'answered' : undefined} style={rowStyle}>
      {label}
      <td className="free-col" {...span}>
        {control}
      </td>
      {remarks}
    </tr>
  )
}

function PhotoSection({ reportId, title, subtitle, icon, kind, photos, editable, onChanged }) {
  const toast = useToast()
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const upload = async (event) => {
    const files = event.target.files
    if (!files?.length) return
    setUploading(true)
    try {
      await reportApi.uploadPhotos(reportId, files, kind)
      toast.success(`${files.length} photo(s) uploaded.`)
      onChanged()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = async (photoId) => {
    try {
      await reportApi.deletePhoto(reportId, photoId)
      onChanged()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="section-card">
      <div className="card-head">
        <div>
          <h2><i className={`fas ${icon}`} /> {title}</h2>
          <p className="card-sub">{subtitle}</p>
        </div>
        {editable && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,.jfif,.jpe,.pjpeg,.pjp,.tif,.tiff,.bmp,.webp"
              multiple
              style={{ display: 'none' }}
              onChange={upload}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              <i className={`fas ${uploading ? 'fa-circle-notch fa-spin' : 'fa-upload'}`} />{' '}
              {uploading ? 'Uploading…' : 'Upload photos'}
            </button>
          </>
        )}
      </div>

      {photos.length ? (
        <div className="photo-grid">
          {photos.map((photo) => (
            <figure className="photo-tile" key={photo.id}>
              <AuthedImage src={photo.url} alt={photo.caption || photo.original_name} style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }} />
              <figcaption className="photo-meta">
                <span title={photo.caption || photo.original_name}>
                  {photo.caption || photo.original_name}
                </span>
                {editable && (
                  <button
                    type="button"
                    className="toast-close"
                    onClick={() => remove(photo.id)}
                    aria-label="Remove photo"
                  >
                    <i className="fas fa-trash" />
                  </button>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <Empty icon="fa-image" title="No photos in this set">
          {editable ? 'Upload the images that belong in this part of the report.' : 'Nothing was attached.'}
        </Empty>
      )}
    </div>
  )
}

/** One labelled box of the photographic presentation. */
function ReportPhotoSlot({ reportId, slot, photos, editable, onChanged }) {
  const toast = useToast()
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)

  const upload = async (event) => {
    const files = event.target.files
    if (!files?.length) return
    setBusy(true)
    try {
      await reportApi.uploadPhotos(reportId, files, 'inspection', { checkpoint_key: slot.key })
      toast.success(`${slot.label} uploaded.`)
      onChanged()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = async (photoId) => {
    try {
      await reportApi.deletePhoto(reportId, photoId)
      onChanged()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const first = photos[0]

  return (
    <figure className="photo-tile">
      {first ? (
        <AuthedImage src={first.url} alt={slot.label} style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }} />
      ) : (
        <div
          style={{
            height: 130,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontSize: '1.5rem',
            background: 'var(--bg-secondary)',
          }}
        >
          <i className="fas fa-camera" />
        </div>
      )}
      <figcaption className="photo-meta">
        <span title={slot.label}>
          {slot.label}
          {slot.required && !first && <span style={{ color: 'var(--danger-color)' }}> *</span>}
        </span>
        {editable && (
          <span style={{ display: 'flex', gap: '0.35rem' }}>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,.jfif,.jpe,.pjpeg,.pjp,.tif,.tiff,.bmp,.webp"
              style={{ display: 'none' }}
              onChange={upload}
            />
            <button
              type="button"
              className="toast-close"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              aria-label={`Upload ${slot.label}`}
            >
              <i className={`fas ${busy ? 'fa-circle-notch fa-spin' : 'fa-upload'}`} />
            </button>
            {first && (
              <button
                type="button"
                className="toast-close"
                onClick={() => remove(first.id)}
                aria-label={`Remove ${slot.label}`}
              >
                <i className="fas fa-trash" />
              </button>
            )}
          </span>
        )}
      </figcaption>
    </figure>
  )
}

function ReasonDialog({ open, title, label, confirmLabel, onClose, onConfirm }) {
  const [text, setText] = useState('')
  useEffect(() => {
    if (open) setText('')
  }, [open])

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-cta" disabled={!text.trim()} onClick={() => onConfirm(text.trim())}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <TextArea label={label} required value={text} onChange={(e) => setText(e.target.value)} rows={5} autoFocus />
    </Modal>
  )
}

function ApproveDialog({ open, report, onClose, onConfirm }) {
  const [expiry, setExpiry] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) {
      setExpiry(toDateInput(report?.certificate_expiry_date))
      setNote('')
    }
  }, [open, report])

  return (
    <Modal
      open={open}
      title="Approve and release to the client"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-cta"
            onClick={() => onConfirm({ certificate_expiry_date: expiry || null, note: note || null })}
          >
            <i className="fas fa-check" /> Approve
          </button>
        </>
      }
    >
      <div className="field-grid single">
        <div className="field">
          <label>Certificate expiry date</label>
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          <span className="hint">
            Leave blank to use the validity configured for this equipment type. The equipment record
            and the expiry alerts both follow this date.
          </span>
        </div>
        <TextArea label="Approval note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
      </div>
    </Modal>
  )
}

