import { reportApi } from './endpoints'

/**
 * Open a report's PDF in a new browser tab, in the browser's own viewer.
 *
 * The tab is opened synchronously inside the click - otherwise browsers treat
 * it as an unwanted pop-up - and pointed at a short-lived signed link once the
 * server has issued it (a new tab cannot carry the app's sign-in token).
 *
 *   openPdfInNewTab('set', 12)
 *   openPdfInNewTab('revision', reportId, { revision: 1 })
 */
export async function openPdfInNewTab(kind, id, extra) {
  const tab = window.open('', '_blank')
  try {
    const { url } = await reportApi.viewLink(kind, id, extra)
    if (tab) tab.location.href = url
    else window.open(url, '_blank')
  } catch (err) {
    tab?.close()
    throw err
  }
}
