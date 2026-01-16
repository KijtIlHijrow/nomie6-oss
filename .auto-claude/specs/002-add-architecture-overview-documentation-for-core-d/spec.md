# Add architecture overview documentation for core domains

## Overview

The src/domains/ directory contains 45+ domain modules (ledger, trackable, storage, usage, etc.) with no documentation explaining the architecture, module responsibilities, or data flow between them. Developers must read source code to understand system design.

## Rationale

Understanding how Nomie's domain-driven architecture works is essential for making changes. The relationship between core modules (Ledger stores logs, TrackableStore manages trackables, Storage abstracts persistence) is not documented. This creates a steep learning curve for new developers.

---
*This spec was created from ideation and is pending detailed specification.*
