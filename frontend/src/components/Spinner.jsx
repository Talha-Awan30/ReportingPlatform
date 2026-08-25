export default function Spinner({ full = false, label = 'Loading' }) {
  return (
    <div className={`spinner-wrap${full ? ' full' : ''}`}>
      <div className="spinner" role="status" aria-label={label} />
      <span>{label}…</span>
    </div>
  )
}
