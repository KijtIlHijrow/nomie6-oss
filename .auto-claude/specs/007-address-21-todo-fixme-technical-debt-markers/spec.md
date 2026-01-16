# Address 21+ TODO/FIXME technical debt markers

## Overview

Found 21+ TODO, FIXME, and incomplete implementation comments scattered across the codebase indicating known technical debt. Examples include: 'TODO: Make this not sloppy' (score-note.ts), 'TODO: replace this with the util version' (import.ts), 'TODO: Make the pie chart work' (pie.svelte), 'TODO: This is incomplete' (uom-modal.svelte).

## Rationale

TODO comments that remain in production code represent acknowledged technical debt that never got prioritized. Some of these TODOs may reference outdated concerns or indicate incomplete features that users might encounter. Tracking these systematically helps prioritize technical debt payoff.

---
*This spec was created from ideation and is pending detailed specification.*
