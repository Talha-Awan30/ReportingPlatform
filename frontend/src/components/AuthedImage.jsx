import { useEffect, useState } from 'react'
import api from '../api/client'

/**
 * An <img> for an endpoint that requires the bearer token.
 *
 * A plain `<img src="/api/...">` cannot carry an Authorization header, so
 * protected photographs come back 401 and render as a broken image. This
 * fetches the bytes through the authenticated axios client and shows them from
 * an object URL instead, revoking it on unmount.
 */
export default function AuthedImage({ src, alt, className, style, ...rest }) {
  const [objectUrl, setObjectUrl] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!src) return undefined

    let url = null
    let cancelled = false
    setFailed(false)

    api
      .get(src.replace(/^\/api/, ''), { responseType: 'blob' })
      .then((response) => {
        if (cancelled) return
        url = URL.createObjectURL(response.data)
        setObjectUrl(url)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
      setObjectUrl(null)
    }
  }, [src])

  if (failed) {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          background: 'var(--bg-secondary)',
          fontSize: '1.25rem',
          ...style,
        }}
        title={`${alt} — could not be loaded`}
      >
        <i className="fas fa-triangle-exclamation" />
      </div>
    )
  }

  if (!objectUrl) {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          background: 'var(--bg-secondary)',
          ...style,
        }}
      >
        <i className="fas fa-circle-notch fa-spin" />
      </div>
    )
  }

  return <img src={objectUrl} alt={alt} className={className} style={style} {...rest} />
}
