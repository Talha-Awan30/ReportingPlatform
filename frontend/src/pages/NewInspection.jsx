import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { clientApi, inspectionSetApi, jobApi, moduleApi } from '../api/endpoints'
import { errorMessage } from '../api/client'
import { useApi } from '../hooks/useApi'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import { useToast } from '../components/Toast'
import { DynamicFieldGrid, seedDefaults } from '../components/DynamicFields'
import { Empty, Select, TextInput } from '../components/ui'

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
  const clients = useApi(() => clientApi.list({ per_page: 200, active_only: 'true' }), [])

  const [step, setStep] = useState(1)
  const [clientId, setClientId] = useState('')
  const [jobId, setJobId] = useState('')
  const [unitCount, setUnitCount] = useState(1)
  const [titlePage, setTitlePage] = useState({})
  const [saving, setSaving] = useState(false)
  const [missing, setMissing] = useState(new Set())

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
  const multi = module.supports_multiple

  // A module with no title page keeps the old single-report flow.
  if (!module.has_title_page) {
    return <SingleReportStart module={module} clients={clients.data?.items || []} />
  }

  const setField = (key, patch) =>
    setTitlePage((current) => ({ ...current, [key]: { ...(current[key] || {}), ...patch } }))

  const goToTitlePage = () => {
    if (!jobId) {
      toast.error('Pick the job this visit belongs to.')
      return
    }
    // Prefill from the client and job so nothing is typed twice.
    const client = clients.data?.items?.find((c) => String(c.id) === String(clientId))
    const job = jobs.data?.items?.find((j) => String(j.id) === String(jobId))
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
    if (blanks.length) {
      setMissing(new Set(blanks))
      toast.error(`${blanks.length} required field(s) on the title page are still blank.`)
      return
    }

    setSaving(true)
    try {
      const { set } = await inspectionSetApi.create({
        module_slug: slug,
        job_id: Number(jobId),
        unit_count: Number(unitCount),
        title_page: titlePage,
      })
      toast.success(
        `${set.set_number} created — ${set.reports.length} ${
          set.reports.length === 1 ? module.unit_noun : module.unit_noun_plural
        } ready to fill in.`,
      )
      navigate(`/inspection-sets/${set.id}`)
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
            <Select
              label="Client"
              required
              placeholder="Select a client…"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value)
                setJobId('')
              }}
              options={(clients.data?.items || []).map((c) => ({
                value: c.id,
                label: `${c.code} — ${c.name}`,
              }))}
            />
            <Select
              label="Job"
              required
              disabled={!clientId}
              placeholder={clientId ? 'Select a job…' : 'Pick a client first'}
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              options={(jobs.data?.items || []).map((j) => ({
                value: j.id,
                label: `${j.job_number} — ${j.site_name || 'No site'}`,
              }))}
              hint={
                clientId && !jobs.loading && !jobs.data?.items?.length
                  ? 'This client has no jobs yet — create one under Registers → Jobs.'
                  : undefined
              }
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
                hint={`Between 1 and ${module.max_units}. One report is created for each.`}
              />
            )}
          </div>

          <div className="form-actions" style={{ marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-cta" onClick={goToTitlePage} disabled={!jobId}>
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
              missingKeys={missing}
              onChange={setField}
            />
          </div>

          <div className="section-card">
            <div className="card-head">
              <div>
                <h2><i className="fas fa-image" /> Cover photographs</h2>
                <p className="card-sub">
                  Uploaded after the set is created — you will land straight on the upload panel.
                </p>
              </div>
            </div>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              {module.title_page_photos.map((p) => p.label).join(' · ')}
            </p>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-outline" onClick={() => setStep(1)}>
              <i className="fas fa-arrow-left" /> Back
            </button>
            <button type="button" className="btn btn-cta" onClick={create} disabled={saving}>
              <i className={`fas ${saving ? 'fa-circle-notch fa-spin' : 'fa-check'}`} />{' '}
              {saving
                ? 'Creating…'
                : `Create ${unitCount} ${
                    Number(unitCount) === 1 ? module.unit_noun : module.unit_noun_plural
                  }`}
            </button>
          </div>
        </>
      )}
    </>
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
