# NoLimitCap Solutions - Deployment Guide

This guide covers the complete setup and deployment process for the NoLimitCap Solutions website on Vercel with Supabase, AWS S3, and email services.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Supabase Setup](#supabase-setup)
3. [AWS Setup](#aws-setup)
4. [SendGrid Setup (Recommended for Email)](#sendgrid-setup)
5. [Vercel Deployment](#vercel-deployment)
6. [GoDaddy DNS Configuration](#godaddy-dns-configuration)
7. [Environment Variables](#environment-variables)
8. [Testing](#testing)

---

## Prerequisites

Before starting, ensure you have:

- A [GoDaddy](https://godaddy.com) account with the domain `nolimitcap.com`
- A [Vercel](https://vercel.com) account
- A [Supabase](https://supabase.com) account
- An [AWS](https://aws.amazon.com) account
- A [SendGrid](https://sendgrid.com) account (recommended for email with attachments)

---

## Supabase Setup

### Step 1: Create a New Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Name it `nolimitcap-production`
4. Set a strong database password (save this!)
5. Choose a region close to your users (e.g., US East)
6. Click "Create new project"

### Step 2: Get API Keys

1. Go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ Keep this secret!)

### Step 3: Create Database Tables

1. Go to **SQL Editor** in your Supabase dashboard
2. Click "New Query"
3. Copy and paste the contents of [`server/supabase-schema.sql`](server/supabase-schema.sql)
4. Click "Run" to execute

This creates:
- `contacts` table
- `applications` table
- `application_files` table
- `clients` table
- Proper indexes and RLS policies

---

## AWS Setup

### Step 1: Create S3 Bucket for PDFs

1. Go to [AWS S3 Console](https://s3.console.aws.amazon.com)
2. Click "Create bucket"
3. Configure:
   - **Bucket name**: `nolimitcap-documents` (must be globally unique)
   - **Region**: US East (N. Virginia) - `us-east-1`
   - **Block Public Access**: Block all public access (recommended)
   - **Bucket Versioning**: Enable (optional, for backup)
4. Click "Create bucket"

### Step 2: Create IAM User for S3 Access

1. Go to [AWS IAM Console](https://console.aws.amazon.com/iam)
2. Go to **Users** → **Create user**
3. Name: `nolimitcap-s3-user`
4. Click "Next"
5. Select "Attach policies directly"
6. Click "Create policy" → JSON editor:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::nolimitcap-documents/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::nolimitcap-documents"
    }
  ]
}
```

7. Name the policy: `NolimitCapS3Policy`
8. Attach this policy to the user
9. Create access keys for the user:
   - Go to user → Security credentials → Create access key
   - Select "Application running outside AWS"
   - Copy **Access Key ID** and **Secret Access Key**

### Step 3: (Optional) AWS SES for Email

If you want to use AWS SES instead of SendGrid:

1. Go to [AWS SES Console](https://console.aws.amazon.com/ses)
2. Verify your sending domain (`nolimitcap.com`)
3. Request production access (to send to any email)
4. Create SMTP credentials in SES settings

---

## SendGrid Setup (Recommended)

SendGrid is recommended because it handles attachments better than SES.

### Step 1: Create Account & Verify Domain

1. Sign up at [SendGrid](https://sendgrid.com)
2. Go to **Settings** → **Sender Authentication**
3. Verify your domain (`nolimitcap.com`):
   - Add the provided DNS records to GoDaddy
   - Wait for verification (can take up to 48 hours)

### Step 2: Create API Key

1. Go to **Settings** → **API Keys**
2. Click "Create API Key"
3. Name: `nolimitcap-production`
4. Permissions: "Full Access" or "Restricted" with Mail Send
5. Copy the API key (shown only once!)

### Step 3: Configure Single Sender

1. Go to **Settings** → **Sender Authentication**
2. Verify a single sender email: `noreply@nolimitcap.com`

---

## Vercel Deployment

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

### Step 2: Login to Vercel

```bash
vercel login
```

### Step 3: Deploy

From the project root:

```bash
vercel
```

Follow the prompts:
- Link to existing project? No
- Project name: `nolimitcap-website`
- Directory: `./`

### Step 4: Configure Environment Variables

In Vercel Dashboard:

1. Go to your project → **Settings** → **Environment Variables**
2. Add all variables from the [Environment Variables](#environment-variables) section below

### Step 5: Add Domain

1. Go to **Settings** → **Domains**
2. Add `nolimitcap.com` and `www.nolimitcap.com`
3. Vercel will provide DNS records to add to GoDaddy

---

## GoDaddy DNS Configuration

### Step 1: Access DNS Management

1. Log in to [GoDaddy](https://godaddy.com)
2. Go to **My Products** → **Domains**
3. Click "DNS" next to `nolimitcap.com`

### Step 2: Configure DNS Records

Remove any existing A and CNAME records for `@` and `www`, then add:

#### For Root Domain (`nolimitcap.com`)

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | `76.76.21.21` | 600 seconds |
| A | @ | `76.76.21.164` | 600 seconds |

*Note: Vercel provides specific A records in your project settings. Use those values.*

#### For WWW Subdomain

| Type | Name | Value | TTL |
|------|------|-------|-----|
| CNAME | www | `cname.vercel-dns.com` | 600 seconds |

#### For SendGrid (if using SendGrid)

Add these records for domain authentication (get exact values from SendGrid):

| Type | Name | Value | TTL |
|------|------|-------|-----|
| CNAME | s1._domainkey | `s1.domainkey.uXXXXX.wlXXX.sendgrid.net` | 3600 |
| CNAME | s2._domainkey | `s2.domainkey.uXXXXX.wlXXX.sendgrid.net` | 3600 |
| CNAME | emXXXX | `uXXXXX.wlXXX.sendgrid.net` | 3600 |

#### For Email (MX Records - if hosting email elsewhere)

| Type | Name | Value | Priority | TTL |
|------|------|-------|----------|-----|
| MX | @ | `mailstore1.secureserver.net` | 10 | 3600 |
| MX | @ | `smtp.secureserver.net` | 0 | 3600 |

*Or use your email provider's MX records (Google Workspace, Outlook, etc.)*

### Step 3: Verify DNS Propagation

DNS changes can take up to 48 hours to propagate. Check with:

```bash
# Check A record
nslookup nolimitcap.com

# Check CNAME
nslookup www.nolimitcap.com

# Or use online tools
# https://dnschecker.org
```

---

## Environment Variables

Create a `.env` file in the `server/` directory (never commit this file!) or add these in Vercel:

### Required Variables

```env
# Supabase
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AWS S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
S3_BUCKET_NAME=nolimitcap-documents
S3_PDF_PREFIX=applications/pdfs/

# Email (SendGrid - Recommended)
SENDGRID_API_KEY=SG.your-sendgrid-api-key
SENDGRID_FROM_EMAIL=noreply@nolimitcap.com
FUNDING_REQUEST_RECIPIENTS=owner@nolimitcap.com

# Authentication
CLIENT_AUTH_SECRET=your-very-long-random-secret-at-least-32-characters
CLIENT_ADMIN_EMAIL=admin@nolimitcap.com
CLIENT_ADMIN_PASSWORD=YourSecurePassword123!

# Application
APP_NAME=NoLimitCap Solutions
APP_URL=https://nolimitcap.com
```

### Optional Variables

```env
# AWS SES (alternative email)
AWS_SES_REGION=us-east-1
SES_FROM_EMAIL=noreply@nolimitcap.com

# SMTP (fallback email)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM=alerts@nolimitcap.com

# HubSpot CRM Integration
HUBSPOT_ACCESS_TOKEN=your-hubspot-token

# Server Configuration
PORT=5050
CORS_ORIGIN=https://nolimitcap.com
TRUST_PROXY=true
```

---

## Testing

### Test Health Endpoint

```bash
curl https://nolimitcap.com/api/health
```

Expected response:
```json
{
  "ok": true,
  "uptime": 123.456,
  "services": {
    "supabase": "connected",
    "s3": "connected",
    "ses": "not_configured",
    "sendgrid": "connected",
    "smtp": "not_configured"
  }
}
```

### Test Application Submission

1. Go to `https://nolimitcap.com/apply/`
2. Fill out the form
3. Submit and verify:
   - Application saved to Supabase
   - PDF generated and uploaded to S3
   - Email sent with PDF attachment

### Test Client Login

1. Go to `https://nolimitcap.com/client-login.html`
2. Login with admin credentials
3. Verify you can see applications

---

## Troubleshooting

### Common Issues

1. **DNS not resolving**: Wait for propagation (up to 48 hours)
2. **CORS errors**: Check `CORS_ORIGIN` matches your domain exactly
3. **Email not sending**: Verify SendGrid domain authentication
4. **S3 upload failing**: Check IAM permissions and bucket name
5. **Supabase connection failing**: Verify service role key

### Useful Commands

```bash
# Check Vercel logs
vercel logs

# Redeploy
vercel --prod

# Check environment variables
vercel env ls
```

---

## Security Checklist

- [ ] Change default admin password
- [ ] Use strong `CLIENT_AUTH_SECRET` (32+ characters)
- [ ] Never commit `.env` files
- [ ] Restrict S3 bucket access with IAM policies
- [ ] Enable Supabase RLS (already in schema)
- [ ] Use HTTPS only (Vercel handles this)
- [ ] Set up rate limiting (already configured)

---

## Support

For issues with:
- **Vercel**: [vercel.com/support](https://vercel.com/support)
- **Supabase**: [supabase.com/support](https://supabase.com/support)
- **AWS**: [aws.amazon.com/support](https://aws.amazon.com/support)
- **SendGrid**: [sendgrid.com/support](https://sendgrid.com/support)
- **GoDaddy**: [godaddy.com/help](https://godaddy.com/help)