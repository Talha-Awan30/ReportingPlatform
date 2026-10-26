import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * A "⋮" button that opens a small menu of extra actions.
 *
 * The menu is portalled to <body> with fixed positioning, so it is never
 * clipped by a scrolling table it sits in.
 *
 *   <MoreMenu items={[{ icon: 'fa-clock', label: 'Approval trail', onClick }]} />
 */
export default function MoreMenu({ items, label = 'More actions' }) {
  const [position, setPosition] = useState(null) // null = closed
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!position) return undefined
    const close = (e) => {
      if (menuRef.current?.contains(e.target) || buttonRef.current?.contains(e.target)) return
      setPosition(null)
    }
    const dismiss = () => setPosition(null)
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [position])

  const toggle = (e) => {
    e.stopPropagation()
    if (position) {
      setPosition(null)
      return
    }
    const box = buttonRef.current.getBoundingClientRect()
    setPosition({ top: box.bottom + 6, right: window.innerWidth - box.right })
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="more-menu-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
        onClick={toggle}
      >
        <i className="fas fa-ellipsis-vertical" />
      </button>
      {position &&
        createPortal(
          <div
            ref={menuRef}
            className="more-menu-list"
            role="menu"
            style={{ position: 'fixed', top: position.top, right: position.right }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setPosition(null)
                  item.onClick()
                }}
              >
                <i className={`fas ${item.icon}`} /> {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
