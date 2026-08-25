import { Link } from 'react-router-dom'

import { moduleApi } from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import { Empty, Pill } from '../components/ui'

/**
 * The inspection item picker. Every card here comes from the backend module
 * registry, so adding a folder under backend/modules/ adds a card - there is
 * nothing to change in this file when a new inspection item is introduced.
 */
export default function Modules() {
  const { data, loading, error } = useApi(() => moduleApi.list(), [])

  if (loading) return <Spinner full label="Loading inspection modules" />
  if (error) return <Empty icon="fa-triangle-exclamation" title="Could not load modules">{error}</Empty>

  const modules = data?.modules || []
  const ready = modules.filter((m) => m.is_configured)
  const scaffolded = modules.filter((m) => !m.is_configured)

  return (
    <>
      <PageHeader
        icon="fa-clipboard-check"
        title="Inspection Items"
        subtitle="Pick the item you are inspecting. Each one is its own module with its own checkpoints and report template."
        crumbs={[{ label: 'Inspections' }]}
      />

      {ready.length > 0 && (
        <div className="section-card">
          <div className="card-head">
            <div>
              <h2><i className="fas fa-circle-check" /> Ready to inspect</h2>
              <p className="card-sub">{ready.length} module(s) with a configured checkpoint list.</p>
            </div>
          </div>
          <div className="module-grid">
            {ready.map((module) => (
              <ModuleCard key={module.slug} module={module} />
            ))}
          </div>
        </div>
      )}

      {scaffolded.length > 0 && (
        <div className="section-card">
          <div className="card-head">
            <div>
              <h2><i className="fas fa-hammer" /> Scaffolded</h2>
              <p className="card-sub">
                The folder and report numbering exist; the checkpoint list is still to be built out.
              </p>
            </div>
          </div>
          <div className="module-grid">
            {scaffolded.map((module) => (
              <ModuleCard key={module.slug} module={module} />
            ))}
          </div>
        </div>
      )}

      {!modules.length && (
        <Empty icon="fa-folder-open" title="No inspection modules registered">
          Add a folder under <code>backend/modules/</code> and restart the backend.
        </Empty>
      )}
    </>
  )
}

function ModuleCard({ module }) {
  const body = (
    <>
      <span className="module-icon">
        <i className={`fas ${module.icon}`} />
      </span>
      <h3>{module.name}</h3>
      <p>{module.summary}</p>
      <div className="row-between">
        <Pill tone={module.is_configured ? 'success' : 'neutral'}>
          {module.is_configured ? `${module.checkpoint_count} checkpoints` : 'Not configured'}
        </Pill>
        <Pill tone="info">{module.report_prefix}</Pill>
      </div>
      <div className="module-meta">
        <div>
          <strong>{module.report_count}</strong>
          reports
        </div>
        <div>
          <strong>{module.pending_count}</strong>
          pending
        </div>
        <div>
          <strong>{module.default_validity_months}m</strong>
          validity
        </div>
      </div>
    </>
  )

  if (!module.is_configured) {
    return (
      <div className="module-card disabled" title="This module has no checkpoints yet">
        {body}
      </div>
    )
  }

  return (
    <Link to={`/modules/${module.slug}`} className="module-card">
      {body}
    </Link>
  )
}
