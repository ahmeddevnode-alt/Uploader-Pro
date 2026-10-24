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

You need Node.js 24 or newer and `pnpm`. After downloading and extracting the project:

```sh
pnpm install
```

Set `MONGO_URI` and `FERNET_PASSWORD` in your local environment or secret manager before starting. Set a fresh `SESSION_SECRET` for any environment accessible outside your computer. Replit Secrets are not included in the project ZIP.

Start the API in one terminal:

```sh
PORT=8080 pnpm --filter @workspace/api-server run dev
```

Start the web app in a second terminal:

```sh
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/uploader-pro run dev
```

Then open `http://localhost:5173`. The local web server forwards `/api` requests to the API on port `8080`. In Replit, the artifact router sends `/api` requests to the API workflow.

When App Storage is unavailable outside Replit, encrypted media is stored on local disk. `MEDIA_DIR` changes the media folder, and `WATCH_DIR` changes the folder monitored for new files. Both default to folders in the project directory.

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
