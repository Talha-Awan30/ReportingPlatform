import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { downloadFile, inspectionSetApi, moduleApi } from '../api/endpoints'
import { errorMessage } from '../api/client'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../auth/AuthContext'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import { useToast } from '../components/Toast'
import { DynamicFieldGrid } from '../components/DynamicFields'
import AuthedImage from '../components/AuthedImage'
import { Empty, formatDate } from '../components/ui'

/**
 * One visit: the shared title page and its cover photographs, then the list of
 * units. Each unit opens its own report - particulars, check-list, photographs.
 */
export default function InspectionSetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { isClient } = useAuth()

  const record = useApi(() => inspectionSetApi.get(id), [id])
  const slug = record.data?.set?.module_slug
  const schema = useApi(() => (slug ? moduleApi.formSchema(slug) : null), [slug])

  const [titlePage, setTitlePage] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const loaded = useRef(null)

  useEffect(() => {
    const data = record.data?.set
    if (!data) return
    const stamp = `${data.id}:${data.updated_at}`
    if (loaded.current === stamp) return
    loaded.current = stamp
    setTitlePage(data.title_page || {})
    setDirty(false)
  }, [record.data])

  // The title page saves itself a moment after typing stops, so there is no
  // button to forget. The record is not reloaded, which would fight the cursor.
  useEffect(() => {
    if (!dirty) return undefined
    const timer = setTimeout(async () => {
      setSaving(true)
      try {
        await inspectionSetApi.update(id, { title_page: titlePage })
        setDirty(false)
      } catch (err) {
        toast.error(errorMessage(err))
      } finally {
        setSaving(false)
      }
    }, 1200)
    return () => clearTimeout(timer)
  }, [dirty, titlePage, id, toast])

  if (record.loading) return <Spinner full label="Loading inspection set" />
  if (record.error) {
    return <Empty icon="fa-triangle-exclamation" title="Could not load this set">{record.error}</Empty>
  }

  const data = record.data.set
  const module = schema.data?.module
  const options = schema.data?.options || {}
  const editable = !isClient && data.reports.some((r) => r.is_editable)

  const setField = (key, patch) => {
    setTitlePage((current) => ({ ...current, [key]: { ...(current[key] || {}), ...patch } }))
    setDirty(true)
  }


  /**
   * Rebuild the combined document from the current answers, then download it.
   * Always regenerates so a lift edited since the last build is included.
   */
  const buildAndDownload = async () => {
    setBusy(true)
    try {
      const result = await inspectionSetApi.generate(id, true)
      await downloadFile(
        inspectionSetApi.downloadUrl(id),
        result.set?.docx_path || `${data.set_number}.docx`,
      )
      record.reload({ silent: true })
    } catch (err) {
      toast.error(errorMessage(err, 'The combined report could not be built.'))
    } finally {
      setBusy(false)
    }
  }

  const download = async () => {
    try {
      await downloadFile(inspectionSetApi.downloadUrl(id), data.docx_path)
    } catch (err) {
      toast.error(errorMessage(err, 'The combined report is not available yet.'))
    }
  }

  const remove = async () => {
    if (!window.confirm('Delete this inspection set and every draft in it?')) return
    try {
      await inspectionSetApi.remove(id)
      toast.success('Inspection set deleted.')
      navigate('/modules')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const noun = module?.unit_noun || 'unit'
  const nounPlural = module?.unit_noun_plural || 'units'
  // The next unit still needing work - a draft, or one returned for correction.
  const nextDraft = data.reports.find((r) => r.is_editable)

  return (
    <>
      <PageHeader
        icon={module?.icon || 'fa-layer-group'}
        title={data.set_number}
        subtitle={`${data.client_name} · ${data.job_number} · ${data.reports.length} ${nounPlural}`}
        crumbs={[
          { label: 'Inspections', to: '/modules' },
          ...(module ? [{ label: module.name, to: `/modules/${slug}` }] : []),
          { label: data.set_number },
        ]}
      />

      {/* ------------------------------------------------------- progress */}
      <div className="kpi-grid">
        <div className="kpi accent">
          <span className="kpi-icon"><i className="fas fa-layer-group" /></span>
          <span>
            <span className="kpi-value">
              {data.progress.completed}/{data.progress.total}
            </span>
            <span className="kpi-label">{nounPlural} submitted</span>
          </span>
        </div>
        <div className={`kpi ${data.is_complete ? 'success' : 'warning'}`}>
          <span className="kpi-icon">
            <i className={`fas ${data.is_complete ? 'fa-circle-check' : 'fa-hourglass-half'}`} />
          </span>
          <span>
            <span className="kpi-value" style={{ fontSize: '1.05rem' }}>
              {data.is_complete ? 'Complete' : 'In progress'}
            </span>
            <span className="kpi-label">Set status</span>
          </span>
        </div>
        <div className="kpi info">
          <span className="kpi-icon"><i className="fas fa-file-word" /></span>
          <span>
            <span className="kpi-value" style={{ fontSize: '1.05rem' }}>
              {data.generated_at ? formatDate(data.generated_at) : 'Not yet'}
            </span>
            <span className="kpi-label">Report generated</span>
          </span>
        </div>
      </div>

      {/* ----------------------------------------------------- title page */}
      <div className="section-card">
        <div className="card-head">
          <div>
            <h2><i className="fas fa-file-invoice" /> Title page</h2>
            <p className="card-sub">
              Filled in once. Printed on the cover of the combined report and shared by every {noun}.
            </p>
          </div>
          {editable && (
            <span className="card-sub" aria-live="polite">
              {saving ? 'Saving…' : dirty ? 'Unsaved changes…' : 'All changes saved'}
            </span>
          )}
        </div>

        {schema.loading ? (
          <Spinner label="Loading the title page" />
        ) : (
          <DynamicFieldGrid
            fields={module?.title_page || []}
            values={titlePage}
            options={options}
            editable={editable}
            onChange={setField}
          />
        )}
      </div>

      {/* -------------------------------------------------- cover photos */}
      {(module?.title_page_photos || []).length > 0 && (
        <div className="section-card">
          <div className="card-head">
            <div>
              <h2><i className="fas fa-image" /> Cover photographs</h2>
              <p className="card-sub">Uploaded once and shared by every {noun} in this set.</p>
            </div>
          </div>
          <div className="photo-grid">
            {module.title_page_photos.map((slot) => (
              <SetPhotoSlot
                key={slot.key}
                setId={id}
                slot={slot}
                photos={(data.photos || []).filter((p) => p.slot_key === slot.key)}
                editable={editable}
                onChanged={() => record.reload({ silent: true })}
              />
            ))}
          </div>
        </div>
      )}

      <div className="form-footer">
        <span className="footer-note">
          {data.progress.completed} of {data.progress.total} {nounPlural} submitted.
        </span>
        {nextDraft ? (
          <Link to={`/reports/${nextDraft.id}`} className="btn btn-cta btn-lg">
            <i className="fas fa-play" /> Start inspection of {noun} #{nextDraft.sequence}
          </Link>
        ) : (
          // Staff rebuild it from the latest answers; a client downloads the
          // released file, since generating is a staff action.
          (!isClient || data.docx_path) && (
            <button
              type="button"
              className="btn btn-cta btn-lg"
              onClick={isClient ? download : buildAndDownload}
              disabled={busy}
            >
              <i className={`fas ${busy ? 'fa-circle-notch fa-spin' : 'fa-file-word'}`} />{' '}
              {busy ? 'Building…' : 'Download report'}
            </button>
          )
        )}
      </div>

      {!isClient && data.reports.every((r) => r.status === 'draft') && (
        <div className="section-card">
          <div className="card-head">
            <div>
              <h2><i className="fas fa-triangle-exclamation" /> Danger zone</h2>
              <p className="card-sub">Nothing in this set has been submitted yet.</p>
            </div>
            <button type="button" className="btn btn-danger btn-sm" onClick={remove}>
              <i className="fas fa-trash" /> Delete this set
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/* -------------------------------------------------------- one cover slot */
function SetPhotoSlot({ setId, slot, photos, editable, onChanged }) {
  const toast = useToast()
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)

  const upload = async (event) => {
    const files = event.target.files
    if (!files?.length) return
    setBusy(true)
    try {
      await inspectionSetApi.uploadPhotos(setId, files, slot.key)
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
      await inspectionSetApi.deletePhoto(setId, photoId)
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
          }}
        >
          <i className="fas fa-image" />
        </div>
      )}
      <figcaption className="photo-meta">
        <span title={slot.label}>
          {slot.label}
          {slot.required && <span style={{ color: 'var(--danger-color)' }}> *</span>}
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
