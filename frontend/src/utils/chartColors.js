/* ============================================================================
   SGS CHART / PIE-CHART COLOR PALETTE
   ----------------------------------------------------------------------------
   The exact palette from sgs-theme-kit/chart-colors.js, re-exported as ES
   modules so it can be imported by the React app. Values are unchanged.

   Brand rules for charts:
   - The "Won" / primary series in a chart is SGS Orange (SGS.primary).
   - SGS.success (green) is for Completed / Paid status series only.
   - For multi-slice pies, use PIE_COLORS in order.
   ========================================================================== */

export const SGS = {
  primary: '#ff6600', // SGS Orange
  primarySoft: 'rgba(255, 102, 0, 0.12)',
  accent: '#3c515b', // SGS Charcoal Blue
  accentSoft: 'rgba(60, 81, 91, 0.12)',
  secondary: '#5a6b73',
  gray1: '#5a6b73',
  gray2: '#8a979d',
  gray3: '#c3cbd0',
  success: '#57c785', // SGS Green
  danger: '#f5262e', // SGS Red
  warning: '#faa61a', // SGS Yellow
  info: '#49738b', // SGS Blue
  plum: '#900c3f', // SGS Plum
}

/** Ordered palette for pie / doughnut / multi-series charts. */
export const PIE_COLORS = [
  '#3c515b', // Charcoal Blue
  '#ff6600', // Orange
  '#49738b', // Blue
  '#57c785', // Green
  '#faa61a', // Yellow
  '#900c3f', // Plum
  '#8a979d', // Grey mid
  '#5a6b73', // Grey dark
  '#c3cbd0', // Grey light
  '#f5262e', // Red
]

export const SERVICE_COLORS = PIE_COLORS

export const STATUS_COLORS = {
  won: SGS.primary,
  lost: SGS.danger,
  pending: SGS.warning,
  inProgress: SGS.info,
  completed: SGS.primary,
  invoiced: SGS.info,
  paid: SGS.primary,
  active: SGS.success,
}
