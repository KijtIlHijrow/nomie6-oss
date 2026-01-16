# Lazy load Plotly.js to reduce initial bundle size by ~3MB

## Overview

The analytics view imports plotly.js-dist-min (~3MB minified) at the top level via `import Plotly from 'plotly.js-dist-min'`. This massive library is loaded for all users even if they never use the analytics/pivot table feature. Plotly should be dynamically imported only when the analytics view is accessed.

## Rationale

Plotly.js is one of the largest charting libraries available. Loading it synchronously on app start dramatically increases Time to Interactive and First Contentful Paint. The analytics feature is an advanced feature that many users may never access, making this an excellent candidate for code splitting.

---
*This spec was created from ideation and is pending detailed specification.*
