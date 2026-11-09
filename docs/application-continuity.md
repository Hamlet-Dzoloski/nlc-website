# Application reliability changes

These changes are local until explicitly deployed. They do not change an AWS
bucket, IAM policy, DNS record, or production deployment on their own.

## Required setup before deployment

1. Use Node 20 or newer and install dependencies from the updated manifests.
2. On the existing private S3 bucket, merge the rule in `server/s3-cors.json`
   into Permissions → CORS. Keep any unrelated existing rules. Its origins are
   `https://nolimitcap.net` and `https://www.nolimitcap.net`; add the exact origin
   of an authorized preview/local site only if it will be used. Do not use `*`
   for production origins. Keep Block Public Access enabled.
3. Verify the configured application IAM identity has `s3:PutObject` and
   `s3:GetObject` for the configured upload, PDF, record, and index prefixes.
   HeadObject uses GetObject permission; finalization copies within the bucket
   using GetObject on the source and PutObject on the destination. The browser
   never receives the application's secret AWS key.
4. Verify SES `ses:SendEmail` permission and the existing verified sending identity
   in `us-east-2`. Email now uses SES v2 rather than v1 SendRawEmail. No new
   domain verification is required solely because of that API change.
5. Keep `MAX_EMAIL_ATTACHMENT_MB=25` or lower. This is a raw attachment budget,
   including the application PDF. The SES v2 path checks the encoded message
   against a conservative 38MiB ceiling. SendGrid and SMTP fallbacks separately
   refuse messages above their conservative encoded-size ceilings. SMTP hosts
   can impose lower limits; verify the configured provider if that fallback is used.
6. Deploy frontend and backend together. The new form uses
   `POST /api/application/uploads` and a JSON `POST /api/apply`; an old backend
   cannot process the new upload receipts. Vercel's function duration is now
   explicitly 60 seconds. The PDF bodies bypass the Vercel application function.
7. Optionally add a bucket lifecycle rule expiring **only**
   `applications/uploads/staging/` objects after at least two days. Upload receipts
   last 24 hours. Final accepted PDFs are copied outside that staging prefix.
   Never apply this cleanup to accepted statements, records, or generated PDFs.

## Workflow and limits

- Up to 10 statements; each is at most 80MiB. The API signs a 15-minute POST policy
  restricted to one random staging key, exact content length, PDF content type,
  and application metadata. The browser can add PDFs in separate picker selections.
- Receipts are signed and bound to the application ID, key, filename, size, and
  expiry. Finalization verifies S3 metadata, actual size, and a PDF header, then
  copies the object to a private final key with an ETag precondition. A staging
  upload cannot overwrite the accepted final object.
- Only receipts, application fields, and signature images reach `/api/apply`.
  Larger statements are retained even when they cannot fit in the email budget.
  Admin emails include S3-console links for all statements; those links require
  authorized AWS sign-in and do not make the objects public.
- The application record is conditionally created in
  `applications/records/by-id/<submission-id>.json` before PDF/email work begins.
  A second request with the same ID and payload returns that saved record.
  A changed payload with an already accepted ID returns 409. Concurrent initial
  requests cannot both claim the record.
- Generated PDFs include the application ID, avoiding same-name/same-date
  overwrites. Existing application records and PDFs are left untouched.
- There is no successful application response based on temporary serverless
  disk. An unavailable initial S3 save returns 503 and leaves the form editable.
- The browser clearly distinguishes a completed submission, processing still
  pending, and a saved application requiring follow-up. Network ambiguity invites
  retry with the same ID instead of incorrectly claiming the application was lost.

## Recovery and remaining operational work

The initial durable record includes the full application, original signatures,
final statement keys, `processingStatus: processing`, and retry flags. It is
added to the application index before document/email work starts. A completed
run updates the record with PDF storage and delivery statuses. This is not a
background job queue or automatic retry service.

If a request is interrupted or final processing fails, staff should locate the
record by the applicant's reference ID under the by-id prefix. Check records
with `processingStatus: attention_required`, or `processing` older than a few
minutes. Use the saved original signatures/statements for a controlled PDF or
notification retry; do not ask the applicant to submit another application.
Check whether an email was already delivered before retrying a notification.
An interrupted function can leave a pending status after delivery but before the
final status save, so delivery cannot be inferred solely from that pending flag.

Monitoring/automatic retry scheduling is not configured by this local change.
The existing operational owner should include pending/attention records in their
review process before relying on this workflow in production.

## Verification

`npm test` uses an empty, dummy environment, in-memory S3 and filesystem stubs,
and intercepted email calls. It covers failed initial storage, required fields,
signatures and consent, durable-before-processing ordering, duplicate/concurrent
requests, unique PDFs, failed PDF/email/status updates, signed receipt tampering,
cross-application receipts, size/type checks, and conditional statement copies.

The local browser regression in `output/playwright/check-priority-fixes.cjs`
checks all nine pages at 320/390/768/1440px, mobile menu state, hidden-step
validation, multiple direct uploads (including a 6MiB PDF), safe retries, and
accurate result states. The separate signature check covers drawing, scrolling,
resizing, tab switching, clearing, uploads, and both PDF renderers.

Before a production launch, perform one approved end-to-end submission after
applying the bucket CORS rule. Confirm private statements, one unique PDF,
durable record, and receipt by the intended admin mailbox. Mocked local checks
cannot confirm the live account's CORS, IAM, SES sandbox state, or delivery.

## API references

- [AWS SDK presigned POST](https://github.com/aws/aws-sdk-js-v3/tree/main/packages/s3-presigned-post)
- [S3 POST policy conditions](https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-HTTPPOSTConstructPolicy.html)
- [SES v2 SendEmail](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html)
- [SES message quotas](https://docs.aws.amazon.com/ses/latest/dg/quotas.html)
