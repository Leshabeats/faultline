# Faultline API

Local-first Chi service for immutable Shareable Runs.

## Run

```bash
go run ./cmd/faultline
```

Or from the repo root:

```bash
npm run dev:api
```

The process listens on `127.0.0.1:8787` by default, applies SQLite migrations on boot, and stores data in `backend/data/faultline.db`.

## Environment

See [`.env.example`](.env.example). Copy it to `backend/.env` or a process-local `.env`; `config.Load` reads that file before applying environment variables. Existing exported variables still win. `FAULTLINE_MAX_STORED_REPLAYS` and `FAULTLINE_MAX_STORED_BYTES` cap unauthenticated storage. In production, `FAULTLINE_CORS_ORIGINS` cannot include `*`.

## Docker

```bash
docker build -t faultline-api .
docker run --rm -p 8787:8787 \
  -e FAULTLINE_ENV=production \
  -e FAULTLINE_CORS_ORIGINS=http://127.0.0.1:4173 \
  -e FAULTLINE_PUBLIC_SHARE_BASE=http://127.0.0.1:4173 \
  -v faultline-data:/var/lib/faultline \
  faultline-api
```

This image is ready for local or self-hosted use. A public production host and credentials are out of scope until they exist in the repository.

## API

- `GET /healthz`
- `POST /api/public-replays` — versioned public envelope only
- `GET /api/public-replays/{id}` — never returns the delete token
- `DELETE /api/public-replays/{id}` with `X-Faultline-Delete-Token`

The service stores the published payload as an immutable record. Score verification stays in the TypeScript judge.

## Layers

- `internal/httpapi`: Chi transport, CORS, body/rate limits, status mapping.
- `internal/service`: publish/get/delete workflow, IDs, delete tokens, storage quota policy.
- `internal/replay`: public envelope and event invariants, independent of HTTP and SQLite.
- `internal/replaystore`: persistence port and shared store errors.
- `internal/repository`: SQLite adapter that executes guarded inserts without choosing quota limits.
