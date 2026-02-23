# NoLimitCap Website

## Frontend

- Static HTML/CSS/JS in the project root.
- Main pages: `index.html`, `apply/index.html`, and `client-login.html`.
- API base is configured in `assets/js/config.js` (`window.NCAP_API_BASE`).

## Backend

Location: `server/` (Node.js 18+)

### Setup

```powershell
cd C:\Users\siaic\Desktop\website\server
copy .env.example .env
npm install
npm run dev
```

### API Endpoints

- `POST /api/contact`
  - Required: `name`, `email`
  - Stores in `server/data/contacts.json`

- `POST /api/apply`
  - Required: `first_name`, `last_name`, `email`
  - Accepts bank statement uploads (`bank_statements`)
  - Generates a PDF in `server/generated-pdfs/`
  - Sends email with the generated PDF attachment (if SMTP is configured)
  - Stores full application in `server/data/applications.json`

- `GET /api/client/me`
  - Returns the authenticated portal user profile (Bearer token)

- `GET /api/client/applications`
  - Returns funding applications visible to logged-in user (Bearer token)

## PDF Email Configuration

Set these in `server/.env`:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`
- `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `FUNDING_REQUEST_RECIPIENTS` (comma-separated)

If SMTP details are missing, submission still works and PDF is still generated and saved locally.

## Domain Notes (`nolimitcap.com`)

- Point DNS A record to your server IP.
- Run backend and serve static frontend from the same host (set `SERVE_STATIC=true`) or reverse proxy with Nginx/Caddy.
- If frontend and backend use different origins, update:
  - `assets/js/config.js` with your API URL
  - `CORS_ORIGIN` in `server/.env`
