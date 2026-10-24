---
name: Media hash index
description: Why Uploader Pro's media SHA-256 index must remain non-unique.
---

Keep the media SHA-256 field indexed but non-unique. Detect and handle duplicate content in application logic; do not automatically merge or delete existing media records.

**Why:** The connected legacy vault contained distinct media records with the same SHA-256. A unique index caused metadata writes to fail and would have required destructive cleanup.

**How to apply:** Preserve existing records when changing Mongo indexes or duplicate handling. Keep uploader deduplication at the application layer and verify writes against legacy data.
