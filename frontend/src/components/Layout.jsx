import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

export default function Layout() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-main">
        <div className="container">
          <Outlet />
        </div>
      </main>
      <footer className="app-footer">
        <div className="footer-inner">
          <img src="/img/sgs-logo.png" alt="SGS" />
          <span>&copy; {new Date().getFullYear()} SGS. Lifting Equipment Reporting Platform.</span>
          <span className="footer-tagline">
            When you need to be <span className="accent">sure</span>
          </span>
        </div>
      </footer>
    </div>
  )
}
