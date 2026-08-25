import { Link } from 'react-router-dom'
import { Empty } from '../components/ui'

export default function NotFound() {
  return (
    <div className="section-card">
      <Empty
        icon="fa-compass"
        title="That page does not exist"
        action={
          <Link to="/" className="btn btn-cta">
            <i className="fas fa-house" /> Back to the dashboard
          </Link>
        }
      >
        The link may be out of date, or the record may have been removed.
      </Empty>
    </div>
  )
}
