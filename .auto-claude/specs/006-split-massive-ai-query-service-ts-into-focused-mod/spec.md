# Split massive ai-query-service.ts into focused modules

## Overview

The file src/domains/ai-query/ai-query-service.ts has grown to 2,129 lines and handles at least 8 distinct responsibilities: Ollama API communication, intent detection, question parsing, tracker creation, log entry creation, data retrieval, period detection, and fuzzy matching. This severely violates the Single Responsibility Principle.

## Rationale

Files over 500 lines become hard to navigate, test, and maintain. At 2,129 lines, this file requires developers to hold too much context in their heads. Breaking it into focused modules will improve testability, make code reviews easier, and reduce the risk of introducing bugs when making changes.

---
*This spec was created from ideation and is pending detailed specification.*
