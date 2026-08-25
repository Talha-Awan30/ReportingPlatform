/* ============================================================================
   SGS CHART / PIE-CHART COLOR PALETTE
   ============================================================================
   The exact palette used by the SGS portal's analytics dashboard (Chart.js).
   Sampled from the official SGS brand guide. Use these for pie/doughnut/bar/
   line charts so every chart stays on-brand.

   Brand rule for charts:
   - "Won" / primary series in a chart = SGS Orange (SGS.primary).
   - SGS.success (green) is for Completed/Paid status series only.
   - For multi-slice pies, use PIE_COLORS (or SERVICE_COLORS) in order.
   ============================================================================ */

// Core named tokens (match the app's `SGS` object exactly)
const SGS = {
    primary:     '#ff6600',                    // SGS Orange
    primarySoft: 'rgba(255, 102, 0, 0.12)',    // orange fill under line charts
    accent:      '#3c515b',                    // SGS Charcoal Blue
    accentSoft:  'rgba(60, 81, 91, 0.12)',
    secondary:   '#5a6b73',
    gray1:       '#5a6b73',
    gray2:       '#8a979d',
    gray3:       '#c3cbd0',
    success:     '#57c785',                    // SGS Green
    danger:      '#f5262e',                    // SGS Red
    warning:     '#faa61a',                    // SGS Yellow
    info:        '#49738b',                    // SGS Blue
    plum:        '#900c3f',                    // SGS Plum (extra chart series)
};

// Ordered palette for PIE / DOUGHNUT / multi-series charts.
// 10 distinct, on-brand colors. Slices/series are assigned in this order.
const PIE_COLORS = [
    '#3c515b',  // Charcoal Blue
    '#ff6600',  // Orange
    '#49738b',  // Blue
    '#57c785',  // Green
    '#faa61a',  // Yellow
    '#900c3f',  // Plum
    '#8a979d',  // Grey mid
    '#5a6b73',  // Grey dark
    '#c3cbd0',  // Grey light
    '#f5262e',  // Red
];

// Alias — same 10 colors the dashboard uses for per-service charts.
const SERVICE_COLORS = PIE_COLORS;

// Optional: semantic status colors for status pies (Won/Lost/Pending etc.)
const STATUS_COLORS = {
    won:        SGS.primary,   // Orange (Won renders orange in chart contexts)
    lost:       SGS.danger,
    pending:    SGS.warning,
    inProgress: SGS.info,
    completed:  SGS.primary,
    invoiced:   SGS.info,
    paid:       SGS.primary,
    active:     SGS.success,
};

/* ----------------------------------------------------------------------------
   EXAMPLE — Chart.js pie chart using the SGS palette
   ----------------------------------------------------------------------------
   Requires Chart.js on the page, e.g.:
     <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
     <canvas id="myPie"></canvas>

   new Chart(document.getElementById('myPie'), {
       type: 'pie',                       // or 'doughnut'
       data: {
           labels: ['Oil & Gas', 'Power', 'Manufacturing', 'Infrastructure'],
           datasets: [{
               data: [42, 27, 18, 13],
               backgroundColor: PIE_COLORS,   // <-- SGS palette, in order
               borderColor: '#ffffff',
               borderWidth: 2,
           }]
       },
       options: {
           plugins: {
               legend: { position: 'right', labels: { color: '#3c515b' } }
           }
       }
   });
   -------------------------------------------------------------------------- */

// Export for module setups (ignored by plain <script> usage)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SGS, PIE_COLORS, SERVICE_COLORS, STATUS_COLORS };
}
