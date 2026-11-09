# NoLimitCap Website

## Frontend

- Static HTML/CSS/JS in the project root.
- Main pages: `index.html`, `apply/index.html`, and `client-login.html`.
- API base is configured in `assets/js/config.js` (`window.NCAP_API_BASE`).

## Backend

Location: `server/` (Node.js 18+)

### Setup

```powershell
cd C:\Users\siaic\Desktop\NLCC website\server
copy .env.example .env
npm install
npm run dev
```

### API Endpoints

- `POST /api/contact`
  - Required: `name`, `email`
  - Stores the full submission JSON in AWS S3, with `server/data/contacts.json` as emergency fallback
  - Sends the submission to **Switchbox AI** when `SWITCHBOX_API_URL` is configured

- `POST /api/apply`
  - Validates required form fields, agreements, a signature image, and a stable UUID `submission_id`
  - Accepts JSON with signed statement-upload receipts (`uploaded_statements`), not PDF file bodies
  - Generates an editable filled PDF in `server/generated-pdfs/`
  - Uploads the PDF, bank statement files, and full application JSON record to AWS S3
  - Sends email with the generated PDF attachment to `info@nolimitcap.net` via SES first
  - Requires a durable S3 save before PDF/email processing; returns 503 rather than claiming success from temporary disk
  - Repeated requests with the same ID and payload return the existing result without duplicate PDFs or emails
  - Sends the full application payload JSON to configured CRMs (notably **Switchbox AI** when `SWITCHBOX_API_URL` is set)

- `GET /api/client/me`
  - Returns the authenticated portal user profile (Bearer token)

- `GET /api/client/applications`
  - Returns funding applications visible to logged-in user (Bearer token)

## AWS S3 + PDF Email Configuration

Build the public website with `npm run build`. Only the allowlisted `dist/`
directory is served; internal files and submission records are excluded.
Run `npm run check:frontend` for browser-based accessibility, SEO, responsive,
keyboard, and background-video checks (Chrome required). See
[release readiness](docs/go-live-status.md) for verified access limitations.

Set these in `server/.env`:

- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`
- `S3_PDF_PREFIX`, `S3_APPLICATION_RECORD_PREFIX`, `S3_CONTACT_RECORD_PREFIX`, `S3_INDEX_PREFIX`
- `AWS_SES_REGION`, `SES_FROM_EMAIL`
- `FUNDING_REQUEST_RECIPIENTS` (comma-separated)

AWS S3 is the primary storage for application PDFs and JSON submission records. Supabase is not required for normal submissions; set `USE_SUPABASE=true` only for legacy reads/testing.

SES is the primary email provider for PDF attachments. SendGrid/SMTP remain fallback providers if configured.

The application uses SES v2 and private direct-to-S3 statement uploads (10 PDFs,
80MB each). See [the application continuity deployment notes](docs/application-continuity.md)
for the required bucket CORS setting, IAM permissions, limits, and recovery details.
Run the isolated backend regression suite with `npm test` (Node 20 or newer).

## Switchbox AI CRM

Set in `server/.env`:

- `SWITCHBOX_API_URL` — **ingest URL Switchbox gives you** (your server POSTs submission JSON here)
- `SWITCHBOX_API_KEY` — optional; sent as Bearer + `X-API-Key` if Switchbox requires auth

Payload details: **`docs/switchbox-webhook.md`**.

## Domain Notes (`nolimitcap.net`)

- Point DNS A record to your server IP.
- Run backend and serve static frontend from the same host (set `SERVE_STATIC=true`) or reverse proxy with Nginx/Caddy.
- If frontend and backend use different origins, update:
  - `assets/js/config.js` with your API URL
  - `CORS_ORIGIN` in `server/.env`
