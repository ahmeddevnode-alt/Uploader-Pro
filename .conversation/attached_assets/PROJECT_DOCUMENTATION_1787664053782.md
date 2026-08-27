# Uploader Pro — Complete Project Documentation & MERN Rewrite Specification

> **Purpose of this document:** It fully documents the existing "Uploader" project (architecture, encryption, data storage, every feature and user interaction) and specifies the **MERN rewrite** — clean, modular, with approved improvements — so that an AI agent can recreate the project from this document alone.
>
> **Rewrite decisions already made by the owner:**
> 1. MERN stack (MongoDB, Express, React, Node).
> 2. Remove **History / Sessions** and the entire **Google Photos backup** functionality.
> 3. Masonry layout for image cards.
> 4. Bulk decrypt must be reliable (job queue + progress), not a single giant request.
> 5. Duplicate detection surfaced in the UI.
> 6. Clean, modular codebase.
> 7. **New approved features:** duplicate-detection UI, bulk decrypt with progress/resume, server-side thumbnails, web drag-and-drop upload, **built-in folder watcher (auto-encrypt inbox, B10)**.
> 8. Drop the Python/Flet/Kivy uploader clients — replaced by web drag-and-drop upload **plus the built-in folder watcher** (B10).
> 9. Keep the single-password Fernet scheme (same password + salt in `.env`) so existing `.enc` files remain decryptable and importable.
> 10. Keep ngrok for remote access, **including emailing the public URL to the owner** (B9).

---

# PART A — THE EXISTING SYSTEM (as-built reference)

## A1. Overview

Uploader Pro is a private, encrypted photo/video gallery:

- A **Python HTTP server** (`http.server`) on port 8000 serves a single-page dashboard and a JSON API.
- Media files are stored **encrypted at rest** (Fernet) as `pics/<sha256-of-plaintext>.enc`.
- A map file `file_map.json` translates `<sha256>.enc` → original filename.
- "Sessions"/history folders `Uploaded_Sessions/<DD-MM-YYYY_N>/` held files that had been backed up to Google Photos (this whole subsystem is being removed).
- Uploader clients (console / Kivy / Flet / PC folder watcher) encrypted files client-side and POSTed them to the server. (Being removed; replaced by web upload.)
- ngrok tunnels port 8000; the public URL was emailed to the owner via Gmail SMTP.

### Original file inventory (what matters and what doesn't)

| Path | Role | In rewrite? |
|---|---|---|
| `DashboardApp.py` | Server entry point; port 8000; background thread that encrypts plaintext files in `pics/` every 5 s | Replaced by Express server |
| `ServerHandler.py` | All HTTP routes (GET/POST), auth check, image serving, decrypt endpoints | Replaced by Express routes |
| `Templates.py` | Login page + full app shell (HTML/CSS/JS, ~2,400 lines) | Replaced by React app |
| `CryptoUtils.py` | Fernet encrypt/decrypt, PBKDF2 key, `file_map.json`, SHA-256 hashing | Reimplemented in Node (`crypto` + a Fernet lib) |
| `DataManager.py` | All JSON "DB" logic: favourites, bookmarks, tags, collections, master collections, stats | Replaced by MongoDB + Mongoose models |
| `CloudUploader.py` | Google Photos backup (OAuth, plaintext upload, moves files to session folders) | **REMOVED** |
| `PrivateFolderWatcher.py`, `WatcherLauncher.py`, `Client/*` | Uploader clients + PC watcher | **REMOVED** (web upload instead) |
| `run_newfunc.js`, `script1.js`, `patch_ui.py`, `served_root*.html/txt` | Old/iterative UI versions — dead weight | Ignored |
| `pics/`, `file_map.json`, `favourites.json`, `bookmarks.json`, `tags/tags.json`, `collections/`, `collections/master_collections.json` | **LIVE DATA — must be importable** | Yes, via migration script |

## A2. Encryption scheme (exact, must be preserved for import compatibility)

- **Algorithm:** Fernet (AES-128-CBC + HMAC-SHA256, from Python `cryptography`).
- **Key derivation:** PBKDF2-HMAC-SHA256, 100,000 iterations, 32 bytes, then base64 URL-safe encoded to form the Fernet key.
- **Constants (move to `.env` in the rewrite, values unchanged):**
  - `PASSWORD = "Ahmed//08112003.."` (also the dashboard login password)
  - `SALT = "antigravity_salt_123"`
- **Storage:** file content SHA-256 hexdigest becomes the stored filename: `<sha256>.enc`. Content-addressed — two identical uploads produce the same file (silent dedup).
- **Name mapping:** `file_map.json` — `{ "<sha256>.enc": "original_filename.ext", ... }`. One hash maps to one name; a second upload of the same content with a *different* name overwrites the mapping (data-loss edge case the rewrite must fix via DB records).
- **Originals are deleted** after encryption, everywhere (server and old clients).
- **Decrypt-on-demand:** every time an image is viewed, the server decrypts the full file in memory and streams it. No thumbnails exist — this is why the gallery is slow and why "decrypt all" times out.

Node equivalents for the rewrite: `node:crypto` has PBKDF2 built in; use the `fernet-node` or implement Fernet on `crypto.createCipheriv('aes-128-cbc')` + HMAC-SHA256 with the standard Fernet token format (version 0x80 | timestamp | IV | ciphertext | HMAC, base64url).

## A3. Existing data model (the JSON "database")

- **favourites.json**: `["filename.ext", ...]`
- **bookmarks.json**: `["https://...", ...]` (ordered list of plain link strings)
- **tags/tags.json**: `{ "tags": { "<tag>": ["filename", ...] }, "file_tags": { "<filename>": ["tag", ...] } }`
  - Tags and collections are **fused**: creating a tag auto-creates a same-named collection and vice versa; adding a tag adds the file to that collection and back. This is intentional in the old app ("assign tags to organize media into collections automatically").
- **collections/**: one JSON file per collection `{ "id": "col_<ms>", "name", "created_at", "items": [{ "filename", "session", "hide_from_main" }] }` + `index.json` (id, name, created_at, item_count) + `master_collections.json`: `[{ "id": "mcol_<ms>", "name", "created_at", "collection_ids": ["col_...", ...] }]`
  - `hide_from_main: true` hides an item from the main galleries (shows only inside the collection).
- **uploaded_history.pkl**: pickle map filename → session folder (legacy; being removed).
- **Media on disk:** `pics/<sha256>.enc` (and session folders — legacy).

## A4. Existing API surface (for reference; rewrite API is defined in Part B)

Auth: `POST /api/login {password}` → `{token}`; token sent as raw `Authorization` header, or `?auth=` query param for `<img>` tags. Single hardcoded token `secure_ahmed_session_2026`.

**GET:** `/api/shell` (app HTML) · `/api/stats` · `/api/data` (sessions) · `/api/new_pics` · `/api/favourites` · `/api/bookmarks` · `/api/collections` (+hidden list) · `/api/master_collections` · `/api/tags` (tags + per-file tags + cover info) · `/api/tags/items?tag=` · `/api/untagged` · `/api/image_new/<orig name>` (decrypt & stream) · `/api/image_history/<session>/<name>`.

**POST:** `/api/login` · `/api/save_bookmark {index?, link}` · `/api/toggle_favourite {filename}` · `/api/collections/create|delete|add_item|remove_item` · `/api/master_collections/create|delete|add_collection|remove_collection` · `/api/tags/add|remove` · `/api/encrypt_all` · `/api/backup_all` · `/api/backup_single` · `/api/delete_single {filename, session}` · `/api/decrypt_save` (decrypted copies into a folder) · `/api/decrypt_all_zip {section, all, items|session}` (streams a ZIP) · `/api/client/upload` (binary, `X-Original-Filename` header).

## A5. Existing UI / UX (behavior the rewrite must reproduce unless stated removed)

- **Login gate:** password every visit (token in `sessionStorage`), themed card, error shake/message on wrong password.
- **App shell:** fixed dark glassmorphism sidebar (280 px) + main content; mobile hamburger + off-canvas sidebar under 900 px. Dark theme, Inter font, Font Awesome icons, gradient buttons, blur panels.
- **Views (sidebar):** Dashboard (stats cards + per-session breakdown) · Bookmarks (editable link rows + add + copy-to-clipboard) · New Pics (auto-refresh 5 s, Images/Videos tabs with counts) · Favourites · All Photos (new + history merged) · History (session dropdown + grid) · Collections (overview grid + detail view) · Master Collections (grid of groups → child collection cards) · Untagged (everything without tags; empty state "All media tagged!").
- **Media card:** Secured/Pending badge, Hidden badge, Lost state (missing on disk, dimmed), lazy `<img>` or hover-playing muted `<video>`; 3-dot hover menu → Favourite, Manage Tags, Decrypt (download), Remove from Collection, Backup (removed), Delete (confirm dialog).
- **Lightbox:** fullscreen; zoom 0.5–8× (buttons, wheel, pinch), drag-to-pan, context menu disabled; custom video player (play/pause, scrub timeline, volume, mute, fullscreen, auto-hiding controls).
- **Modals:** Add to Collection (select/create + "hide from main gallery" checkbox) · Add Collection to Master · Manage Tags (assigned chips with remove; searchable grid of tag chips with cover thumbnails; create tag from search text on Enter).
- **Decrypt flows:** single-file download via blob / File System Access `showSaveFilePicker`; "Decrypt All" per section as one streaming ZIP request (this is what fails on large sets — replaced in rewrite).
- **Known pain points confirmed in code:** no duplicate reporting; bulk decrypt is one monolithic request with no progress; every thumbnail decrypts the full image; dead duplicated UI files make the codebase messy.

---

# PART B — TARGET SYSTEM (MERN rewrite specification)

## B0. Guiding rules for the rewrite

1. **Modular, clean codebase.** Strict separation: `client/` (React) and `server/` (Express). No giant files; no embedded HTML strings; no dead files. Every module small and single-purpose.
2. **MongoDB replaces all JSON files.** GridFS (or a documented disk store + DB records — see B4) for encrypted binaries.
3. **Removed permanently:** History/Sessions views, `Uploaded_Sessions`, Google Photos backup (`CloudUploader`), all Python clients, bookmark-of-session logic, `?auth=` token in URLs (use short-lived signed media URLs instead).
4. **Kept:** the single-password login model, the Fernet-at-rest scheme (same password/salt from `.env` so old files decrypt), ngrok support, the full tagging/collection/master-collection feature set, favourites, bookmarks.
5. React with functional components + hooks only; a small amount of UI state via Context (`AuthContext`); server state via a tiny `api` fetch wrapper or React Query.

## B1. Repository layout

```
uploader/
├─ client/                      # React (Vite)
│  └─ src/
│     ├─ api/                   # apiClient.js (auth, json, uploads, media URL helpers)
│     ├─ auth/                  # AuthContext, LoginPage, RequireAuth
│     ├─ components/
│     │  ├─ layout/             # Sidebar, MobileHeader, AppShell, Toast
│     │  ├─ media/              # MasonryGrid, MediaCard, MediaTabs, Lightbox, VideoPlayer
│     │  ├─ tags/               # ManageTagsModal, TagChip, TagCoverGrid
│     │  ├─ collections/        # CollectionCard, CollectionDetail, MasterCollectionCard, AddToCollectionModal
│     │  ├─ duplicates/         # DuplicateReviewPanel
│     │  └─ common/             # Modal, ConfirmDialog, ProgressBar, EmptyState, Badge
│     ├─ views/                 # DashboardView, GalleryView (New/Favourites/All), CollectionsView,
│     │                          # MasterCollectionsView, UntaggedView, DuplicatesView, BookmarksView
│     └─ utils/                 # formatters, download helpers
├─ server/
│  ├─ src/
│  │  ├─ config/                # env.js (loads .env: MONGO_URI, APP_PASSWORD, FERNET_PASSWORD, FERNET_SALT, MEDIA_DIR, PORT)
│  │  ├─ lib/                   # crypto.js (Fernet+PBKDF2, identical params), hash.js, thumbnail.js, errors.js
│  │  ├─ models/                # Media.js, Tag.js (or embedded), Collection.js, MasterCollection.js,
│  │  │                          # Favourite.js (or array on User), Bookmark.js, DecryptJob.js
│  │  ├─ middleware/            # auth.js, error.js, upload.js (multer, temp plaintext never hits disk — memory storage)
│  │  ├─ routes/                # auth, media, tags, collections, masterCollections, favourites,
│  │  │                          # bookmarks, duplicates, decryptJobs, import
│  │  ├─ controllers/           # one controller per route module
│  │  ├─ jobs/                  # encryptWorker, thumbnailWorker, decryptJobProcessor (BullMQ)
│  │  ├─ watcher/               # folderWatcher.js — chokidar auto-encrypt inbox (B10)
│  └─ server.js              # Express bootstrap
│  └─ scripts/
│     ├─ migrate-legacy.js      # Part C importer
│     └─ start-ngrok.js         # starts ngrok + emails the public URL (B9)
├─ .env                         # secrets (never committed)
├─ docker-compose.yml           # mongo + redis (for BullMQ) — optional but recommended
└─ README.md
```

## B2. Authentication

- `POST /api/auth/login { password }` → on match with `APP_PASSWORD` returns `{ token }` = short-lived JWT (e.g. 12 h, HS256, secret in `.env`).
- Client stores token in `sessionStorage` (password-per-visit behavior preserved) and sends `Authorization: Bearer <token>`.
- **Media URLs:** the browser can't attach headers to `<img src>`; instead of leaking the token in the query string, issue **signed media URLs**: `GET /api/media/:id/thumb?expires=<ts>&sig=<hmac(:id+expires)>`. Short expiry (e.g. 1 h), HMAC computed with a server secret. The React app fetches lists containing these ready-made URLs.
- All other routes: `auth` middleware verifying the JWT. 401 → client clears token and shows login.

## B3. Encryption & storage (server)

- Same scheme as Part A2: PBKDF2-HMAC-SHA256 (100k iters, 32 bytes) over `FERNET_PASSWORD` + `FERNET_SALT` from `.env` → Fernet key. **Values identical to the legacy constants** so imported `.enc` files decrypt without re-encryption.
- **Upload pipeline (web drag-and-drop):**
  1. Browser uploads the raw file (`multipart/form-data` or raw body) over HTTPS/ngrok TLS.
  2. Server holds bytes in memory (multer memory storage — plaintext never written to disk), computes SHA-256.
  3. Duplicate check against `Media.sha256` (see B7) — returns explicit `duplicate: true` + which record(s) match instead of silently overwriting.
  4. Fernet-encrypt, write to `MEDIA_DIR/<sha256>.enc`, create `Media` DB record with original name, size, mime, type (image/video), dimensions.
  5. Enqueue thumbnail job.
- **Thumbnails (new):** after storing, a worker decrypts in memory and uses `sharp` to generate a WebP thumbnail (e.g. max 400 px, quality ~72) stored at `MEDIA_DIR/thumbs/<sha256>.webp` (encrypted with the same Fernet key to keep everything encrypted at rest; decrypt-on-serve is cheap because thumbs are small). Videos: extract a poster frame with `ffmpeg` if available, else a generic icon. Gallery grids load thumbnails only; full decrypt happens solely in the lightbox, single-file download, and bulk-decrypt jobs. This fixes the gallery performance problem.
- **Serving full media:** `GET /api/media/:id/file` (signed URL) decrypts in memory and streams with correct MIME.

## B4. Data models (Mongoose)

**Media**
```
{ _id, sha256 (unique), originalName, encPath, thumbEncPath, mime, type: 'image'|'video',
  size, width?, height?, tags: [ObjectId -> Tag], favourite: Boolean,
  isDuplicateOf: ObjectId?, duplicateNameConflicts: [names], hideFromMain: Boolean,
  lost: Boolean,               // set when the .enc file is missing on disk → card shows "Lost", dimmed, non-clickable
  createdAt, updatedAt }
```
Content-addressed storage on disk (`MEDIA_DIR/<sha256>.enc`) with all metadata in Mongo. GridFS is *not* needed; plain files + DB records are simpler and match the legacy layout (also makes import trivial).

**Tag** `{ _id, name (unique, lowercase), fileCount, createdAt }` — tags remain fused with collections (see B6).

**Collection** `{ _id, name (unique), createdAt, items: [{ media: ObjectId, hideFromMain: Boolean }] }`

**MasterCollection** `{ _id, name, createdAt, collectionIds: [ObjectId] }`

**Bookmark** `{ _id, url, order, createdAt }`

**DecryptJob** `{ _id, type: 'zip', mediaIds: [ObjectId], status: 'queued'|'processing'|'done'|'error', progress: {done,total}, resultPath, error?, createdAt }`

**DuplicateGroup** (materialized by a scan): `{ _id, kind: 'content'|'name', mediaIds: [ObjectId], resolvedAt? }`

## B5. API specification (Express)

All JSON unless noted; all require Bearer JWT except `/auth/login` and signed media URLs.

**Auth**
- `POST /auth/login {password} → {token, expiresIn}`

**Media**
- `GET /media?view=new|all|favourites|untagged&type=image|video&search=&page=&limit=` → paginated list with `{ id, originalName, type, thumbUrl (signed), fileUrl (signed), secured: true, favourite, tags: [names], hideFromMain, createdAt }`
- `POST /media/upload` (multipart, multiple files) → per-file `{ ok | duplicate: {existingId, existingName} }`
- `DELETE /media/:id` (confirm on client) → removes `.enc`, thumb, tags refs, collection refs
- `POST /media/encrypt-all` → sweeps `MEDIA_DIR` and `WATCH_DIR` for any plaintext media files, encrypts and imports them; returns `{ encrypted: n }`. Backs the sidebar **Encrypt All Media** button (define this route before `/media/:id` in Express).
- `GET /media/:id/file?expires&sig` — decrypted full file stream (signed)
- `GET /media/:id/thumb?expires&sig` — decrypted thumbnail stream (signed)
- `POST /media/:id/favourite` (toggle)
- `POST /media/:id/tags { tags: [names] }` / `DELETE /media/:id/tags/:tag`
- `GET /stats` → `{ totalImages, totalVideos, favouritesCount, untaggedCount, collectionCount, masterCount, storageUsed }`
- `GET /system/watcher` → `{ watching: Boolean, dir, pending: Number, failed: Number, lastImportAt }` — folder-watcher status for the UI chip (B10)
- `GET /system/health` → simple liveness check (uptime pings / watcher tooling)

**Tags**
- `GET /tags` → `[{ name, count, coverThumbUrl }]`
- `GET /tags/:name/media` → paginated media list
- (tag create/delete happens implicitly via media tagging; `DELETE /tags/:name` removes tag everywhere)

**Collections & Master Collections**
- `GET/POST /collections`, `DELETE /collections/:id`
- `POST /collections/:id/items { mediaId, hideFromMain }`, `DELETE /collections/:id/items/:mediaId`
- `GET/POST /master-collections`, `DELETE /master-collections/:id`
- `POST /master-collections/:id/collections/:colId`, `DELETE /master-collections/:id/collections/:colId`
- Tag↔collection fusion rule (same as legacy): tagging a file with `X` ensures a collection named `X` exists and contains the file; removing tag `X` removes it from that collection; creating collection `X` creates tag `X`. Document this in code comments — it is core product behavior.

**Bookmarks**
- `GET/POST /bookmarks {url}`, `PUT /bookmarks/:id {url}`, `DELETE /bookmarks/:id`

**Duplicates (new)**
- `POST /duplicates/scan` → recompute groups (content: same `sha256` across records or same file claimed under multiple names; name: same `originalName`, different hash) and store DuplicateGroup docs
- `GET /duplicates` → groups with thumbnails for review
- `POST /duplicates/:groupId/resolve { keepMediaId, action: 'delete_others' | 'ignore' }`

**Decrypt jobs (bulk, new — replaces the monolithic ZIP request)**
- `POST /decrypt/jobs { mediaIds | filter: {view, type, search}, format: 'zip' }` → `{ jobId }` (creates DecryptJob; BullMQ worker decrypts each file, appends to a ZIP on disk, updates `progress.done`)
- `GET /decrypt/jobs/:id` → `{ status, progress: {done, total} }` (polled by client every 1–2 s)
- `GET /decrypt/jobs/:id/download` → the finished ZIP (streamed; also works after browser refresh since the job is server-side)
- Single-file download stays a direct signed-URL fetch (blob download / File System Access picker, as before).

**Import**
- See Part C.

## B6. Frontend specification (React)

**Design language:** keep the dark glassmorphism identity — near-black background (`#030712`), translucent blurred surfaces, 16 px radii, blue gradient primary, Inter font, Font Awesome or `lucide-react` icons, toast notifications, gradient stat numbers. Responsive: sidebar collapses to off-canvas with hamburger below 900 px.

**Views (sidebar):** Dashboard · New Pics · All Photos · Favourites · Untagged · Collections · Master Collections · Duplicates (new) · Bookmarks. No History view. Every gallery has **Images/Videos pill tabs with counts** (as legacy). New Pics auto-refreshes (poll every 10 s or on window focus) so folder-watcher imports appear automatically. **Sidebar footer actions:** `Encrypt All Media` (calls `POST /media/encrypt-all`; button shows a spinner, then a toast with the count — replaces the legacy sidebar button; the legacy `Backup All Now` button is removed) and `Logout` (clears token, returns to login). A small watcher status chip from `GET /system/watcher` shows watching ✔ / pending / failed counts.

**Masonry layout (owner requirement):** media grids use CSS columns masonry (`columns: 4 260px; column-gap: 20px` with `break-inside: avoid` cards) or `react-masonry-css`. Cards keep their natural aspect ratio via the thumbnail's dimensions — no more fixed 260 px squares. All media grids (gallery, collections, tags, untagged, favourites) use masonry.

**MediaCard:** thumbnail (lazy `loading="lazy"`). **Badges** (top-left, legacy behavior): `Secured` (green — encrypted at rest), `Pending` (red — watcher picked the file up, encryption in progress), `Hidden` (blue with eye-slash — `hideFromMain`), duplicate-warning badge, and `Lost` (red — `.enc` missing on disk: card dimmed to ~50% opacity, no click handler). **Video cards** render a muted, looping `<video>` that plays on hover and pauses on mouse-out (legacy behavior). **Hover effect:** card lifts (`translateY(-5px)`), border glow, inner thumbnail scales ~1.06. Hover 3-dot menu (closes on any outside click) → Favourite, Manage Tags, Download, Remove from Collection, Delete (ConfirmDialog — no native `confirm()`). Click opens Lightbox.

**Lightbox:** same capability as legacy — zoom/pan/pinch, custom video player (scrub, volume, fullscreen, auto-hide), context menu disabled, download button.

**Modals:** Add to Collection (pick/create + "hide from main gallery") · Add Collection to Master · Manage Tags (assigned chips, searchable tag grid with cover thumbs, create from Enter) — all reusable `Modal` components.

**Upload (new):** drag-and-drop zone + file picker on the New Pics view (and global drop overlay). Client-side allowed extensions: images `.jpg .jpeg .png .webp .bmp .gif .jfif .heic`, videos `.mp4 .mov .webm`. Per-file progress via `XMLHttpRequest`/axios; duplicate responses surface an inline "duplicate of X — keep anyway?" choice.

**Duplicates view (new):** groups of visually identical files (same content) and same-name-different-content files, side by side with thumbnails, "Keep this / delete others / ignore" actions, empty state "No duplicates found".

**Bulk decrypt (new UX):** "Download All (ZIP)" button on each gallery → creates a job → ProgressBar in a fixed corner widget showing `done/total`, then a Download button when complete. Jobs survive page refresh.

**Bookmarks:** editable rows, add/update/delete/copy-to-clipboard (as legacy).

**Dashboard:** stat cards from `/stats` + a simple recent-uploads strip.

## B7. Duplicate detection (new, explicit)

- **Content duplicates:** same SHA-256 ⇒ same underlying file record is reused, but each *claimed name* is stored (`duplicateNameConflicts`); if a user uploads content that already exists under a different name, the API returns `duplicate` and the UI asks: keep existing / add this name too / cancel. The Duplicates view lists all such collisions.
- **Name duplicates:** two different `sha256` records with the same `originalName` are grouped for review.
- A manual "Scan" button plus automatic detection at upload time. Resolution actions never hard-delete without confirmation.

## B8. Jobs & workers

- BullMQ + Redis. Queues: `thumbnails`, `decrypt`. Workers: thumbnail generation (sharp), decrypt/zip builder. All idempotent; job progress persisted in Mongo so it survives restarts/resume.
- Background sweeper (always on): any plaintext media file found in `MEDIA_DIR` is encrypted and imported immediately — mirrors the legacy 5-second auto-encrypt thread in `DashboardApp.py`, and makes the **Encrypt All Media** button effectively instant.

## B9. Deployment & remote access

- `npm run dev` / `build` standard. Server binds `PORT` (default 8000).
- **ngrok kept:** document `ngrok http 8000`; the app works fully behind it (JWT + signed URLs need no absolute URLs — all paths relative). Optional convenience script `start-ngrok.bat` that prints the URL (emailing credentials is intentionally **not** carried over).
- `.env` example:
  ```
  MONGO_URI=mongodb://localhost:27017/uploader
  PORT=8000
  APP_PASSWORD=Ahmed//08112003..
  FERNET_PASSWORD=Ahmed//08112003..
  FERNET_SALT=antigravity_salt_123
  JWT_SECRET=<random>
  MEDIA_DIR=./media
  REDIS_URL=redis://localhost:6379
  WATCH_DIR=./watch_inbox
  WATCHER_ENABLED=true
  GMAIL_USER=you@gmail.com
  GMAIL_APP_PASSWORD=<16-char Gmail app password>
  NOTIFY_EMAIL=you@gmail.com
  INCLUDE_PASSWORD_IN_EMAIL=false
  ```

---

# PART C — LEGACY DATA IMPORT (mandatory feature)

The rewritten system **must ship with `server/scripts/migrate-legacy.js`** that imports everything from the old project so nothing is re-added manually. Inputs (paths passed via CLI flags or a small config):

```
--legacy-dir <path to old Uploader folder>
```

It reads:

1. **Encrypted media:** every `*.enc` in `pics/` and (if present, for tagged/collection items that only exist there) `Uploaded_Sessions/*/**.enc`. For each: decrypt with the Fernet key (same password/salt), compute SHA-256 of plaintext, write/copy to `MEDIA_DIR/<sha256>.enc` (no re-encryption needed — token is already valid Fernet; simply copy the file), resolve original name via `file_map.json` (`<hash>.enc` → name; if missing, use the hash as name). Create `Media` records. Session-folder files whose names appear in collections/tags but not in `pics/` must still be imported (that's why sessions are read) — imported with `importedFrom: '<session>'` metadata.
2. **Tags:** `tags/tags.json` → `Tag` docs + `Media.tags` refs (match by original filename; unmatched names logged to an import report, not silently dropped).
3. **Collections:** every `collections/col_*.json` → `Collection` docs, items matched to Media by filename; `hide_from_main` preserved. Keep original IDs as `legacyId` for traceability.
4. **Master collections:** `collections/master_collections.json` → link by legacy collection ID map.
5. **Favourites:** `favourites.json` → set `favourite: true` on matching Media.
6. **Bookmarks:** `bookmarks.json` → Bookmark docs, order preserved.
7. **Report:** the script prints/writes `import-report.json`: counts imported per entity, files that failed to decrypt, tags/items referencing missing files, duplicate collisions found. **Idempotent:** re-running skips already-imported hashes (check by `sha256` + `legacyId`).
8. **No deletion:** the legacy folder is only read, never modified.

Because the Fernet password/salt are unchanged, `.enc` files are directly decryptable — the migration is lossless for all media, tags, collections, master collections, favourites, and bookmarks.

---

# PART D — Definition of done (acceptance checklist)

1. Login gate with per-visit password; JWT auth; signed media URLs (no token in query strings).
2. Masonry galleries everywhere; thumbnails load fast; lightbox with zoom/pan/pinch + custom video player.
3. Drag-and-drop web upload with per-file progress and explicit duplicate feedback.
4. Duplicate scan + review UI with keep/delete/ignore.
5. Bulk decrypt as a background job with progress, resumable ZIP download; no request timeouts on large libraries.
6. Tags (fused with collections), collections (+hide-from-main), master collections, favourites, bookmarks — all functioning as in Part A5 minus removed features.
7. History/Sessions, Google Photos backup, and all Python clients are absent.
8. `migrate-legacy.js` imports 100% of legacy media/tags/collections/master collections/favourites/bookmarks and prints a report.
9. All secrets in `.env`; clean modular tree matching B1; no file over ~300 lines; consistent error handling and toasts.
10. Runs locally (`docker-compose up` for Mongo/Redis, `npm run dev`) and behind ngrok.
