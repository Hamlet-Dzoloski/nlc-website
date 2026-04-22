# Switchbox AI — how the website connects and how to map fields

## How the data flows (important)

This is **outbound from your website → Switchbox**, not the other way around.

1. A visitor submits **Contact** (`POST /api/contact`) or **Apply** (`POST /api/apply`) on your site.
2. Your **Node server** builds an internal `record` object (all normalized fields + server metadata).
3. For **applications**, the server **generates the PDF and optional S3 URL first**, then calls Switchbox.
4. The server **POSTs JSON** to the URL you put in **`SWITCHBOX_API_URL`** (the **ingest / webhook receiver URL** that Switchbox gives you).

So in Switchbox you are configuring something like **“Inbound webhook”**, **“HTTP endpoint”**, or **“Receive submission”** — you copy **their URL** into your `.env`. You do **not** put your own site’s URL into Switchbox for this step (unless Switchbox’s product also needs a callback URL for OAuth, which is separate).

---

## Step 1 — Get the URL from Switchbox

In the Switchbox dashboard (wording varies by product version):

1. Create or open the **workflow / integration** that should receive new leads or applications.
2. Add an **HTTP/Webhook ingest** step (or “External POST”, “API receiver”, etc.).
3. Switchbox shows a **URL** — often `https://…switchbox…/…` — that accepts **POST** requests.
4. Copy that URL.

## Step 2 — Configure your website server

In `server/.env`:

```env
SWITCHBOX_API_URL=https://paste-the-url-switchbox-gave-you
```

If Switchbox requires a secret:

```env
SWITCHBOX_API_KEY=your-secret-or-token
```

Your server will send:

- `Authorization: Bearer <SWITCHBOX_API_KEY>` (if key is set)
- `X-API-Key: <SWITCHBOX_API_KEY>` (same value, for tools that expect this header)
- `Content-Type: application/json`

If there is **no** key, only `Content-Type` is sent.

Restart the API after changing `.env`. Check `GET /api/health` → `services.switchbox`:

- `configured` — URL + API key set  
- `configured_url_only` — URL set, no key (no auth headers)  
- `not_configured` — no URL  

---

## Step 3 — Map fields in Switchbox from the JSON body

The **HTTP body is one JSON object**: a **flat** key/value record (plus `files` as an array). There is **no** wrapper like `{ "data": { … } }` unless you change the server.

### Path syntax

In Switchbox’s field mapper, use the **top-level key names** exactly as below (case-sensitive). Examples:

| Meaning | Typical Switchbox / JSON path |
|--------|----------------------------------|
| Applicant email | `email` |
| Legal business name | `legal_business_name` |
| Loan amount | `loan_amount` |
| PDF link (after successful PDF + upload) | `generated_pdf_url` |
| First bank file’s original filename | `files[0].originalName` (if your UI supports array index syntax) |

If Switchbox only allows dot paths and not arrays, map `files` as a whole to a **text** field or use a **code/transform** step to stringify `files`.

### Discriminate Contact vs Apply

Use:

- `form` — e.g. `"apply"`, `"contact"`, `"partner"`, `"product-request"`, etc.  
- `page` — path when the form was submitted, e.g. `/apply/`

Route **Apply** workflows when `form === "apply"` (or when `legal_business_name` / `loan_amount` exist).

---

## Keys you will see on **Contact** (and similar) submissions

Built from `ALLOWED_FIELDS` in `server/server.js`:

`name`, `email`, `company`, `revenue`, `needs`, `role`, `note`, `details`, `product`, `form`, `page`, `phone`, `contact_time`, `partner_type`, `pipeline_size`

**Always present (server-added):**

| Key | Type | Description |
|-----|------|-------------|
| `id` | string (UUID) | Submission id |
| `createdAt` | string (ISO 8601) | Server timestamp |
| `form` | string | Form type |
| `page` | string | Page path |

**May be present after storage/CRM line:**

| Key | Description |
|-----|-------------|
| `crmStatus` | e.g. `sent`, `skipped`, `failed` |
| `crmProvider` | e.g. `switchbox-ai` |

---

## Keys on **Funding application** (`form: "apply"`)

All keys from `APPLICATION_FIELDS` in `server/server.js` are copied from the form when non-empty, plus:

| Key | Description |
|-----|-------------|
| `id`, `createdAt`, `form`, `page` | As above |
| `name` | `first_name` + `last_name` (space-separated) |
| `company` | `legal_business_name` or `business_dba` |
| `email` | Applicant email |

**After PDF + optional S3 (same POST payload):**

| Key | Description |
|-----|-------------|
| `generated_pdf_url` | Public or signed URL to the PDF (if S3 upload succeeded) |
| `generated_pdf_filename` | Filename used for the PDF |
| `generated_pdf_s3_key` | S3 object key (if applicable) |
| `pdfStatus` | e.g. `generated` or `failed` |
| `emailStatus` | Internal email send status |
| `files` | Array of `{ originalName, storedName, size, type }` for uploads |

**Application field keys** (snake_case, same names as HTML `name` attributes / API):

`loan_amount`, `funding_timeline`, `loan_use`, `first_name`, `last_name`, `contact_number`, `email`, `contact_agreement`, `legal_business_name`, `business_start_date`, `business_dba`, `industry`, `business_website`, `business_address`, `business_city`, `business_state`, `business_zip`, `business_phone`, `legal_entity`, `business_tax_id`, `credit_score`, `gross_annual_sales`, `avg_monthly_deposits`, `avg_daily_balance`, `state_of_incorporation`, `funding_company`, `credit_card_processor`, `seasonal_business`, `peak_months`, `has_other_financing`, `outstanding_balance`, `has_judgements_liens`, `has_open_bankruptcies`, `owner_first_name`, `owner_last_name`, `owner_email`, `owner_address`, `owner_city`, `owner_state`, `owner_zip`, `owner_contact`, `owner_dob`, `owner_ssn`, `owner_ownership`, `additional_owner_first_name`, `additional_owner_last_name`, `additional_owner_email`, `additional_owner_address`, `additional_owner_city`, `additional_owner_state`, `additional_owner_zip`, `additional_owner_contact`, `additional_owner_dob`, `additional_owner_ssn`, `additional_owner_ownership`, `signature`, `signature_additional`, `application_date`, `application_date_additional`, `landlord_name_mortgage_company`, `landlord_contact_person`, `landlord_phone`, `business_trade_reference_2`, `business_trade_reference_2_contact_person`, `business_trade_reference_2_phone`, `business_trade_reference_3`, `business_trade_reference_3_contact_person`, `business_trade_reference_3_phone`, `application_agreement`

**Signatures:** values can be long **data URLs** (base64). The server may truncate and set `signature_truncated` / `signature_additional_truncated` to `true`. Prefer **`generated_pdf_url`** for a full signed document in CRM.

---

## Example JSON (apply — abbreviated)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "createdAt": "2026-03-22T12:00:00.000Z",
  "form": "apply",
  "page": "/apply/",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "company": "Acme LLC",
  "first_name": "Jane",
  "last_name": "Doe",
  "legal_business_name": "Acme LLC",
  "loan_amount": "50000",
  "generated_pdf_url": "https://your-bucket.s3.amazonaws.com/...",
  "generated_pdf_filename": "funding-request-....pdf",
  "pdfStatus": "generated",
  "files": [
    { "originalName": "statement.pdf", "storedName": "1732-uuid.pdf", "size": 120000, "type": "application/pdf" }
  ]
}
```

---

## Response from Switchbox

Your server only requires **HTTP 2xx** to treat the push as successful. A JSON body from Switchbox is optional and stored only for logging/diagnostics.

---

## Environment reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SWITCHBOX_API_URL` | Yes (to enable) | **Switchbox ingest URL** your server POSTs to. |
| `SWITCHBOX_API_KEY` | No | Sent as Bearer + `X-API-Key` if set. |
| `SWITCHBOX_MAX_SIGNATURE_CHARS` | No | Default `150000`; longer `signature` / `signature_additional` strings are truncated. |

---

## Testing without Switchbox

Leave `SWITCHBOX_API_URL` empty: submissions still save (Supabase/local) and PDF/email still run; CRM line returns **skipped** for Switchbox.

To test the payload shape, use a temporary URL from a request inspector (e.g. webhook.site), set `SWITCHBOX_API_URL` to that URL, submit a form, and inspect the raw JSON body.
