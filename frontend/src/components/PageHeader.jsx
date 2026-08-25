import { Link } from 'react-router-dom'

export function Breadcrumbs({ items = [] }) {
  if (!items.length) return null
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <Link to="/">Home</Link>
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} style={{ display: 'contents' }}>
          <span className="sep">/</span>
          {item.to ? <Link to={item.to}>{item.label}</Link> : <span className="current">{item.label}</span>}
        </span>
      ))}
    </nav>
  )
}

export default function PageHeader({ icon, title, subtitle, crumbs, actions }) {
  return (
    <>
      <Breadcrumbs items={crumbs} />
      <header className="page-head">
        <div>
          <h1>
            {icon && <i className={`fas ${icon}`} />}
            {title}
          </h1>
          {subtitle && <p className="page-sub">{subtitle}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </header>
    </>
  )
}
