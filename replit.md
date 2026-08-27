# Uploader Pro

Uploader Pro is a private encrypted photo and video vault with fast galleries, upload workflows, and organization tools.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/uploader-pro run dev` — run the web vault
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Optional env: `APP_PASSWORD`, `FERNET_PASSWORD`, `FERNET_SALT`, `MEDIA_DIR`, `WATCH_DIR`, `WATCHER_ENABLED`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB/storage contract: designed for MongoDB plus encrypted disk media storage; the development API currently uses a small in-memory store so the UI is immediately runnable
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/uploader-pro/src/` — React shell, pages, media grid, and theme
- `artifacts/api-server/src/routes/uploader.ts` — gallery API surface
- `artifacts/api-server/src/lib/store.ts` — development media and organization state
- `lib/api-spec/openapi.yaml` — source of truth for generated client/server contracts

## Architecture decisions

- The client uses session-scoped vault access and attaches the token through the shared generated fetch client.
- Media browsing uses generated React Query hooks so mutations invalidate the relevant views.
- The API keeps the legacy password default only as an environment fallback; deployments should set `APP_PASSWORD`.

## Product

Users can unlock a private vault, browse recent/all/favourite/untagged media, upload media, edit tags, create collections, manage bookmarks, review duplicates, and start resumable-style decrypt jobs. A watcher status indicator is included for the inbox workflow.

## User preferences

No additional preferences recorded.

## Gotchas

- The Vite production build requires `PORT` and `BASE_PATH`; managed workflows provide them automatically.
- Run API codegen after changing `lib/api-spec/openapi.yaml`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
