# Document the TrackableStore and Trackable class APIs

## Overview

TrackableStore.ts and Trackable.class.ts are core modules that manage all trackable entities (trackers, people, context, pointers). They export 14+ functions but only have 5 JSDoc comments. Key functions like saveTrackable, deleteTrackableFromNomie, and InitTrackableStore lack documentation.

## Rationale

The Trackable system is fundamental to Nomie - it's the abstraction layer for all things users can track. Developers building plugins or extending functionality need to understand how to work with trackables. The LedgerStore has better documentation (30 JSDoc comments) and should serve as the model.

---
*This spec was created from ideation and is pending detailed specification.*
