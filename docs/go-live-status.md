# Release preparation — November 9, 2026

## Prepared locally

- Labels, keyboard focus, a skip link, and a modal focus trap/restore.
- Unique descriptions/canonicals/social previews for all nine pages, homepage
  organization/site structured data, robots rules, and a sitemap.
- A 1,147,173-byte desktop background video (original first clip: 10,171,434
  bytes) and a 78,904-byte WebP poster (original PNG: 853,102 bytes).
- Mobile, reduced-motion, data-saving, and slow connections use the still poster
  without automatically requesting the background video. Desktop users can pause it.
- A public build containing only 18 allowlisted website files. Server records,
  internal documents, PDF templates, tests, and original videos are not public.
- Vercel build/output configuration plus CLI source exclusions. Optional local
  static serving also uses `dist`, not the repository root.
- Earlier private S3 uploads, durable submission handling, signature fixes,
  unique PDFs, safe retries, and follow-up states remain part of this release.

## Confirmed release blockers

1. The Vercel integration is connected, but project listing returns 403 for
   team `team_QA1pZ4Rt9o3chH6jQ27DmwFz`. Vercel requires the user to approve
   team access through its single-use consent link. Retry the same project
   lookup after approval. The saved CLI token is also invalid; do not create a
   replacement project or change hosting as an authentication workaround.
2. The configured AWS identity can reach the bucket (HeadBucket succeeds), but
   GetBucketCors returns AccessDenied. Existing rules therefore cannot be read
   or safely merged. An authorized bucket owner must review and merge
   `server/s3-cors.json`; do not overwrite unknown existing rules.
3. The same identity is denied SES GetAccount. Production access and sending
   status remain unverified; that denial alone does not establish that sending
   permission is absent. An authorized SES owner should confirm sending status,
   identity verification, and `ses:SendEmail` permission in `us-east-2`.
4. A real submission would send email. Obtain explicit approval for the exact
   test identity/recipient before running that final end-to-end check.

No credentials were printed, no IAM policy was broadened, no CORS settings were
overwritten, no application records were queried, and no real email was sent.

## Verification completed

- `npm test`: all seven backend workflow tests pass, including durable saves,
  duplicate/concurrent retries, failure states, signatures, and signed uploads.
- `npm run check:frontend`: all nine pages, every application step, and the
  privacy dialog pass the automated WCAG A/AA checks. This is an automated
  assessment, not a claim of complete accessibility conformance.
- Browser checks pass at 320, 390, 768, and 1440 pixels: navigation, upload lists,
  a 6 MB direct upload with a second PDF, retained form data after failure, and
  accurate success/follow-up states. External services are simulated.
- Both owners' drawn/uploaded signatures survive scrolling, navigation, and
  resizing. Template and fallback PDF samples each contain one editable page
  with visible signatures; missing/invalid signatures are rejected.
- Keyboard skip links, dialog focus isolation/trapping/restoration, mobile and
  reduced-motion video suppression, desktop pause, sitemap/canonicals, and the
  18-file public build pass. The mobile contact page was visually inspected.
- No production deployment or live application submission has been attempted.

## Release sequence after access is restored

1. Run `npm ci`, `npm test`, `npm run check:frontend`, and `npm run build`.
2. Confirm the existing Vercel project/domain and production environment names
   without exposing values. Use Node 20 or newer and deploy the frontend and API
   together with the committed lockfile and Vercel configuration.
3. Verify production HTTPS, primary-domain routing, sitemap/canonicals, asset
   loading, private-path 404s, API no-store/noindex headers, and API health.
4. Run the approved application test with multiple PDFs, a signature, and a
   clearly marked test business. Confirm durable S3 records, private statements,
   one uniquely named application PDF, and the expected email receipts.
5. Record the verified deployment URL and commit. Keep the previous deployment
   available for rollback until the live application check passes.

The unverified company claims and substantive privacy-policy text are unchanged.
See `content-approval-review.md` for the separate pending content decisions.
