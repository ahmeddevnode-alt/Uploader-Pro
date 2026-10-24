# Uploader Pro

A private photo and video archive with encrypted media storage, collections, tags, favorites, bookmarks, duplicate review, folder watching, and legacy import.

## Start the app in Replit

1. Open this project in Replit and click **Run**.
2. The configured web and API workflows start together:
   - `artifacts/uploader-pro: web`
   - `artifacts/api-server: API Server`
3. Open the project preview at `/` and sign in with the owner password.

The owner password is `APP_PASSWORD` when that secret is configured; otherwise it is `FERNET_PASSWORD`. Replit Secrets are injected into the workflows automatically. The app needs:

- `MONGO_URI` — MongoDB connection string for persistent metadata.
- `FERNET_PASSWORD` — encryption passphrase; keep it the same as the legacy app if importing old media.
- `SESSION_SECRET` — session/JWT signing secret. This is already configured for this Replit project.

Private media storage is provisioned for the Replit app. Do not paste secret values into this file or commit them to source control.

## Run it on your own computer

You need Node.js 24 or newer and `pnpm`. After downloading and extracting the project, create a local environment file:

```sh
cp .env.example .env
pnpm install
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead. Edit `.env` and set `FERNET_PASSWORD` (use the same value as the old app to read legacy media). `APP_PASSWORD` can optionally set a separate sign-in password. `MONGO_URI` is needed to connect to the persistent vault; if left blank, the app uses local development state. Set a unique `SESSION_SECRET` before exposing the app beyond your computer. Replit Secrets are not included in the project ZIP.

Start the entire project from the workspace root with one command:

```sh
pnpm start
```

`start.mjs` builds the API, then starts the API and web app together. Press **Ctrl+C** to stop both. The default local URLs are:

- Web app: `http://localhost:5173`
- API: `http://localhost:8080`

Change `WEB_PORT` or `API_PORT` in `.env` if those ports are already in use. The web app forwards `/api` requests to the local API. When Replit App Storage is unavailable, encrypted media is stored on local disk; `MEDIA_DIR` and `WATCH_DIR` can change the media and watched-folder locations.

## Download the project or its media

### Download the source project

In Replit, open the file tree’s **⋯** menu and choose **Download as zip**. This downloads the project source. Replit Secrets are kept separately and are not included in the ZIP. Re-add the required secrets before running the project elsewhere.

See Replit’s [Projects and files guide](https://docs.replit.com/help/projects-and-files) for current file download options.

### Download media from Uploader Pro

- **One item:** open the media card’s **⋯** menu and choose **Download**.
- **A gallery as a ZIP:** choose **Download all** on a gallery page, wait for the export job to finish, then choose **Download ZIP**.

## Import an existing Uploader archive

With the required secrets available, run:

```sh
node artifacts/api-server/scripts/migrate-legacy.mjs --legacy-dir /path/to/old/Uploader
```

The importer reads the old folder and writes an import report. It does not modify the source archive.
