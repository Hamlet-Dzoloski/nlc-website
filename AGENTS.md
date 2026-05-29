## Learned User Preferences
- For application PDFs, the user expects a one-page, readable, properly aligned form with boxed fields, generous spacing, and no overflow pages.
- Application PDF headers should use the actual site/company logo with the company name centered or beside it, and must not reuse Creative Capital or other example branding.
- The user prefers the visible brand name to be `No Limit Capital` rather than `NoLimitCap Solutions` when discussing website/PDF branding.
- Application submission UX should clearly confirm success or failure: after success the submit button should read `Application Submitted`, stay disabled, and avoid overpromising internal email delivery unless the backend confirms it.
- When asked to compare or replicate a PDF, match the cited ideal output closely instead of treating example documents as final branding.

## Learned Workspace Facts
- The official empty fillable application template path is `server/pdf-templates/nolimitcap-empty-application.pdf`; generated PDFs are stored under `server/generated-pdfs`.
- The backend application flow is S3-primary and Supabase-free (`USE_SUPABASE=false`); AWS S3/SES use `us-east-2`, with application PDFs intended for `info@nolimitcap.net`.
- Switchbox integration is optional for later; Salesforce and HubSpot are not the current CRM target.
- Application PDF footer branding should include `@Biz Bulker Inc, 2026` and should not include a `No Limit Capital` bottom footnote.
- The website application supports drawn and uploaded signatures; signatures must persist during scrolling, fit the PDF signature fields, and remain visible in generated PDFs (remove the fillable template AcroForm signature field white overlay after embedding).
- Uploaded bank statement PDFs should be attached to the admin application email to `info@nolimitcap.net` along with the generated application PDF, within the configured email attachment size cap (`MAX_EMAIL_ATTACHMENT_MB`, default 25MB).
