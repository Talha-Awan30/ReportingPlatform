import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { inspectionSetApi, jobApi, moduleApi } from '../api/endpoints'
import { errorMessage } from '../api/client'
import { useApi } from '../hooks/useApi'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import { useToast } from '../components/Toast'
import { DynamicFieldGrid, seedDefaults } from '../components/DynamicFields'
import ClientSelect from '../components/ClientSelect'
import { Empty, TextInput } from '../components/ui'

/**
 * Starting an inspection.
 *
 * For a module that covers several units per visit (elevators), this is a
 * three-step wizard: how many, then the shared title page, then straight into
 * the first unit. Everything is read from the module manifest, so a module that
 * declares a title page gets this flow with no change here.
 */
export default function NewInspection() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const schema = useApi(() => moduleApi.formSchema(slug), [slug])

  const [step, setStep] = useState(1)
  const [clientId, setClientId] = useState('')
  // The picked client itself, for prefilling the title page.
  const [client, setClient] = useState(null)
  // The job is typed. A number matching one of this client's jobs uses that
  // job; anything else becomes a new job for the client when the set is created.
  const [jobText, setJobText] = useState('')
  const [createdJob, setCreatedJob] = useState(null)
  const [unitCount, setUnitCount] = useState(1)
  const [titlePage, setTitlePage] = useState({})
  const [saving, setSaving] = useState(false)
  const [missing, setMissing] = useState(new Set())
  // slot key -> File. Held here because uploads need a set id, which only
  // exists once the set is created on the last step.
  const [files, setFiles] = useState({})

  const jobs = useApi(
    () => (clientId ? jobApi.list({ client_id: clientId, per_page: 200 }) : Promise.resolve({ items: [] })),
    [clientId],
  )
  if (schema.loading) return <Spinner full label="Loading the inspection form" />
  if (schema.error) {
    return <Empty icon="fa-triangle-exclamation" title="Could not load this module">{schema.error}</Empty>
  }

  const module = schema.data.module
  const options = schema.data.options || {}
  const enforceRequired = schema.data.enforce_required ?? true
  const multi = module.supports_multiple

  // A module with no title page keeps the old single-report flow.
  if (!module.has_title_page) {
    return <SingleReportStart module={module} />
  }

  const typedJob = jobText.trim()
  const matchedJob =
    [...(jobs.data?.items || []), ...(createdJob ? [createdJob] : [])].find(
      (j) => j.job_number.toLowerCase() === typedJob.toLowerCase(),
    ) || null

  const setField = (key, patch) =>
    setTitlePage((current) => ({ ...current, [key]: { ...(current[key] || {}), ...patch } }))

  const goToTitlePage = () => {
    if (!clientId || !typedJob) {
      toast.error('Enter the job this visit belongs to.')
      return
    }
    // Prefill from the client and job so nothing is typed twice.
    const job = matchedJob
    setTitlePage((current) =>
      seedDefaults(module.title_page, {
        client: { value: client?.name || '' },
        site: { value: job?.site_name || '' },
        survey_date: { value: (job?.inspection_date || '').slice(0, 10) },
        ...current,
      }),
    )
    setStep(2)
  }

  const create = async () => {
    const blanks = module.title_page
      .filter((f) => f.required && !titlePage[f.key]?.value)
      .map((f) => f.key)
    if (blanks.length && enforceRequired) {
      setMissing(new Set(blanks))
      toast.error(`${blanks.length} required field(s) on the title page are still blank.`)
      return
    }

    setSaving(true)
    try {
      let job = matchedJob
      if (!job) {
        // A new job number - register it under the client first.
        ;({ job } = await jobApi.create({ client_id: Number(clientId), job_number: typedJob }))
        setCreatedJob(job)
      }
      const { set } = await inspectionSetApi.create({
        module_slug: slug,
        job_id: job.id,
        unit_count: Number(unitCount),
        title_page: titlePage,
      })
      // Now the set exists, push the pictures chosen on this screen.
      const chosen = Object.entries(files).filter(([, file]) => file)
      for (const [slotKey, file] of chosen) {
        try {
          await inspectionSetApi.uploadPhotos(set.id, [file], slotKey)
        } catch (err) {
          toast.error(`${slotKey}: ${errorMessage(err)}`)
        }
      }

      toast.success(
        `${set.set_number} created — ${set.reports.length} ${
          set.reports.length === 1 ? module.unit_noun : module.unit_noun_plural
        } ready to fill in.`,
      )

      // Straight into the first unit; the set page is reachable from its
      // breadcrumb but is not a step in the flow.
      const first = [...set.reports].sort((a, b) => a.sequence - b.sequence)[0]
      navigate(first ? `/reports/${first.id}` : `/inspection-sets/${set.id}`)
    } catch (err) {
      toast.error(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        icon={module.icon}
        title={`New ${module.name}`}
        subtitle={
          step === 1
            ? `How many ${module.unit_noun_plural} does this visit cover?`
            : 'Title page — filled in once and shared by every ' + module.unit_noun + '.'
        }
        crumbs={[
          { label: 'Inspections', to: '/modules' },
          { label: module.name, to: `/modules/${slug}` },
          { label: 'New inspection' },
        ]}
      />

      <Steps
        current={step}
        steps={[
          { n: 1, label: `Job & number of ${module.unit_noun_plural}` },
          { n: 2, label: 'Title page' },
          { n: 3, label: `Fill each ${module.unit_noun}` },
        ]}
      />

      {step === 1 && (
        <div className="section-card">
          <div className="card-head">
            <div>
              <h2><i className="fas fa-list-ol" /> Job and quantity</h2>
              <p className="card-sub">
                One title page covers the whole visit. The check-list is then repeated for each{' '}
                {module.unit_noun}.
              </p>
            </div>
          </div>

          <div className="field-grid">
            <ClientSelect
              label="Client"
              required
              value={clientId}
              onChange={(id, picked) => {
                setClientId(id)
                setClient(picked)
                setJobText('')
                setCreatedJob(null)
              }}
            />
            <TextInput
              label="Job"
              required
              disabled={!clientId}
              placeholder={clientId ? 'Job number' : 'Pick a client first'}
              value={jobText}
              onChange={(e) => setJobText(e.target.value)}
              autoComplete="off"
            />
            {multi && (
              <TextInput
                label={`Number of ${module.unit_noun_plural}`}
                type="number"
                min={1}
                max={module.max_units}
                required
                value={unitCount}
                onChange={(e) => setUnitCount(e.target.value)}
              />
            )}
          </div>

          <div className="form-actions" style={{ marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-cta" onClick={goToTitlePage} disabled={!clientId || !typedJob}>
              Continue to the title page <i className="fas fa-arrow-right" />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <>
          <div className="section-card">
            <div className="card-head">
              <div>
                <h2><i className="fas fa-file-invoice" /> Title page</h2>
                <p className="card-sub">
                  Printed once on the cover. Shared by all {unitCount}{' '}
                  {Number(unitCount) === 1 ? module.unit_noun : module.unit_noun_plural}.
                </p>
              </div>
            </div>

            <DynamicFieldGrid
              fields={module.title_page}
              values={titlePage}
              options={options}
              showRequired={enforceRequired}
              missingKeys={missing}
              onChange={setField}
            />
          </div>

          {module.title_page_photos.length > 0 && (
            <div className="section-card">
              <div className="card-head">
                <div>
                  <h2><i className="fas fa-image" /> Cover photographs</h2>
                  <p className="card-sub">
                    Placed on the title page. Shared by every {module.unit_noun} on this visit.
                  </p>
                </div>
              </div>
              <div className="photo-grid">
                {module.title_page_photos.map((slot) => (
                  <PickPhoto
                    key={slot.key}
                    slot={slot}
                    file={files[slot.key]}
                    onPick={(file) => setFiles((f) => ({ ...f, [slot.key]: file }))}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn btn-outline" onClick={() => setStep(1)}>
              <i className="fas fa-arrow-left" /> Back
            </button>
            <button type="button" className="btn btn-cta" onClick={create} disabled={saving}>
              <i className={`fas ${saving ? 'fa-circle-notch fa-spin' : 'fa-play'}`} />{' '}
              {saving ? 'Creating…' : `Start inspection of ${module.unit_noun} 1`}
            </button>
          </div>
        </>
      )}
    </>
  )
}

/**
 * One cover-photo slot on the wizard. The file is only held in the browser
 * until the set is created, so a preview comes from an object URL.
 */
function PickPhoto({ slot, file, onPick }) {
  const inputRef = useRef(null)
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return undefined
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  return (
    <figure className="photo-tile">
      {preview ? (
        <img src={preview} alt={slot.label} style={{ width: '100%', height: 130, objectFit: 'cover' }} />
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{
            width: '100%',
            height: 130,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            background: 'var(--bg-secondary)',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontFamily: 'inherit',
            fontSize: '0.75rem',
          }}
        >
          <i className="fas fa-camera" style={{ fontSize: '1.4rem' }} />
          Choose image
        </button>
      )}
      <figcaption className="photo-meta">
        <span title={slot.help_text || slot.label}>{slot.label}</span>
        <span style={{ display: 'flex', gap: '0.35rem' }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.jfif,.jpe,.pjpeg,.pjp,.tif,.tiff,.bmp,.webp"
            style={{ display: 'none' }}
            onChange={(e) => onPick(e.target.files?.[0] || null)}
          />
          <button
            type="button"
            className="toast-close"
            onClick={() => inputRef.current?.click()}
            aria-label={`Choose ${slot.label}`}
          >
            <i className="fas fa-upload" />
          </button>
          {file && (
            <button
              type="button"
              className="toast-close"
              onClick={() => onPick(null)}
              aria-label={`Remove ${slot.label}`}
            >
              <i className="fas fa-trash" />
            </button>
          )}
        </span>
      </figcaption>
    </figure>
  )
}

/* --------------------------------------------------------------- step rail */
function Steps({ current, steps }) {
  return (
    <div className="section-card" style={{ padding: '1rem 1.5rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {steps.map((step, index) => (
          <div key={step.n} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                fontWeight: 700,
                background:
                  current === step.n
                    ? 'var(--primary-color)'
                    : current > step.n
                      ? 'var(--success-color)'
                      : 'var(--bg-secondary)',
                color: current >= step.n ? '#fff' : 'var(--text-muted)',
                border: current >= step.n ? 'none' : '1px solid var(--border-color)',
              }}
            >
              {current > step.n ? <i className="fas fa-check" /> : step.n}
            </span>
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: current === step.n ? 600 : 400,
                color: current === step.n ? 'var(--secondary-color)' : 'var(--text-muted)',
              }}
            >
              {step.label}
            </span>
            {index < steps.length - 1 && (
              <span style={{ color: 'var(--border-color)', margin: '0 0.25rem' }}>
                <i className="fas fa-chevron-right" />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------ modules without a title page (simple) */
function SingleReportStart({ module }) {
  return (
    <>
      <PageHeader
        icon={module.icon}
        title={`New ${module.name}`}
        crumbs={[
          { label: 'Inspections', to: '/modules' },
          { label: module.name, to: `/modules/${module.slug}` },
          { label: 'New inspection' },
        ]}
      />
      <div className="section-card">
        <Empty icon="fa-hammer" title="This module has no title page configured">
          Use <strong>Start Inspection</strong> on the module page to create a single report, or add
          a <code>title_page</code> to its <code>module.py</code> to get the guided flow.
        </Empty>
      </div>
    </>
  )
}
