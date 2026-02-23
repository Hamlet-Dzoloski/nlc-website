/**
 * NoLimitCap Solutions - Backend Server
 * 
 * Features:
 * - Supabase database integration
 * - AWS S3 for PDF storage
 * - AWS SES / SendGrid for email delivery
 * - PDF generation with pdfkit
 */

const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const sgMail = require('@sendgrid/mail');
const { generateApplicationPdfBuffer } = require('./pdf-layout');
const { generateApplicationPdfFromTemplate } = require('./pdf-template-fill');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();

// ===========================================
// Configuration
// ===========================================

const PORT = process.env.PORT || 5050;
const IS_SERVERLESS = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION;

// In serverless environments, only /tmp is writable.
// For persistence, you MUST use Supabase (Database) and S3 (File Storage).
const WRITABLE_ROOT = IS_SERVERLESS ? os.tmpdir() : __dirname;

const DATA_DIR = path.join(WRITABLE_ROOT, 'data');
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json');
const APPLICATIONS_FILE = path.join(DATA_DIR, 'applications.json');
const CLIENTS_FILE = path.join(DATA_DIR, 'clients.json');
const UPLOADS_DIR = path.join(WRITABLE_ROOT, 'uploads');
const GENERATED_PDF_DIR = path.join(WRITABLE_ROOT, 'generated-pdfs');

// Static assets (read-only) stay in project root
// Use process.cwd() to locate assets reliably in Vercel bundle
const PROJECT_ROOT = IS_SERVERLESS ? process.cwd() : path.join(__dirname, '..');
const LOGO_PATH = path.join(PROJECT_ROOT, 'assets', 'images', 'logo.png');
const PDF_TEMPLATE_DIR = path.join(__dirname, 'pdf-templates');
const PDF_FORM_TEMPLATE_PATH = path.join(PDF_TEMPLATE_DIR, 'nolimitcap-empty-application.pdf');

const HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
const CLIENT_AUTH_SECRET = process.env.CLIENT_AUTH_SECRET || process.env.JWT_SECRET || 'change-this-secret';
const CLIENT_TOKEN_TTL_SECONDS = Math.max(60, Number(process.env.CLIENT_TOKEN_TTL_SECONDS || 60 * 60 * 12));
const DEFAULT_ADMIN_EMAIL = 'admin@nolimitcap.com';
const DEFAULT_ADMIN_PASSWORD = 'ChangeMeNow123!';
const RATE_LIMIT_WINDOW_MS = Math.max(10 * 1000, Number(process.env.RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000));
const RATE_LIMIT_MAX_REQUESTS = Math.max(10, Number(process.env.RATE_LIMIT_MAX_REQUESTS || 120));
const LOGIN_RATE_LIMIT_MAX_REQUESTS = Math.max(3, Number(process.env.LOGIN_RATE_LIMIT_MAX_REQUESTS || 20));

// ===========================================
// Supabase Setup
// ===========================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  console.log('Supabase connected successfully');
} else {
  console.warn('Supabase not configured. Falling back to local JSON storage.');
}

// ===========================================
// AWS S3 Setup
// ===========================================

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
const S3_PDF_PREFIX = process.env.S3_PDF_PREFIX || 'applications/pdfs/';

let s3Client = null;
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && S3_BUCKET_NAME) {
  s3Client = new S3Client({
    region: AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  console.log('AWS S3 client initialized');
} else {
  console.warn('AWS S3 not configured. PDFs will be stored locally.');
}

// ===========================================
// AWS SES Setup
// ===========================================

let sesClient = null;
if (process.env.AWS_SES_REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  sesClient = new SESClient({
    region: process.env.AWS_SES_REGION || AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  console.log('AWS SES client initialized');
}

// ===========================================
// SendGrid Setup
// ===========================================

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('SendGrid client initialized');
}

// ===========================================
// Allowed Fields
// ===========================================

const ALLOWED_FIELDS = [
  'name', 'email', 'company', 'revenue', 'needs', 'role', 'note', 'details', 'product', 'form', 'page',
  'phone', 'contact_time', 'partner_type', 'pipeline_size',
];

const APPLICATION_FIELDS = [
  'loan_amount', 'funding_timeline', 'loan_use',
  'first_name', 'last_name', 'contact_number', 'email', 'contact_agreement',
  'legal_business_name', 'business_start_date', 'business_dba', 'industry', 'business_website',
  'business_address', 'business_city', 'business_state', 'business_zip', 'business_phone',
  'legal_entity', 'business_tax_id', 'credit_score', 'gross_annual_sales', 'avg_monthly_deposits',
  'avg_daily_balance', 'state_of_incorporation', 'funding_company', 'credit_card_processor',
  'seasonal_business', 'peak_months', 'has_other_financing', 'outstanding_balance',
  'has_judgements_liens', 'has_open_bankruptcies',
  'owner_first_name', 'owner_last_name', 'owner_email', 'owner_address', 'owner_city',
  'owner_state', 'owner_zip', 'owner_contact', 'owner_dob', 'owner_ssn', 'owner_ownership',
  'additional_owner_first_name', 'additional_owner_last_name', 'additional_owner_email',
  'additional_owner_address', 'additional_owner_city', 'additional_owner_state',
  'additional_owner_zip', 'additional_owner_contact', 'additional_owner_dob',
  'additional_owner_ssn', 'additional_owner_ownership',
  'signature', 'signature_additional', 'application_date', 'application_date_additional',
  'landlord_name_mortgage_company', 'landlord_contact_person', 'landlord_phone',
  'business_trade_reference_2', 'business_trade_reference_2_contact_person', 'business_trade_reference_2_phone',
  'business_trade_reference_3', 'business_trade_reference_3_contact_person', 'business_trade_reference_3_phone',
  'application_agreement', 'form', 'page',
];

// ===========================================
// Express Middleware
// ===========================================

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);

if (process.env.SERVE_STATIC === 'true') {
  const publicDir = path.join(__dirname, '..');
  app.use(express.static(publicDir));
}

// ===========================================
// Multer Configuration
// ===========================================

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(UPLOADS_DIR, { recursive: true });
      cb(null, UPLOADS_DIR);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname || '');
    cb(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 80 * 1024 * 1024 },
});

// ===========================================
// Rate Limiting
// ===========================================

const requestBuckets = new Map();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function createRateLimiter({ keyPrefix, windowMs, maxRequests }) {
  return (req, res, next) => {
    const now = Date.now();
    const ip = getClientIp(req);
    const key = `${keyPrefix}:${ip}`;
    const current = requestBuckets.get(key);

    if (!current || now >= current.resetAt) {
      requestBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (current.count >= maxRequests) {
      const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retryAfterSeconds)));
      return res.status(429).json({ ok: false, error: 'Too many requests. Please try again shortly.' });
    }

    current.count += 1;
    requestBuckets.set(key, current);
    return next();
  };
}

setInterval(() => {
  const now = Date.now();
  requestBuckets.forEach((bucket, key) => {
    if (now >= bucket.resetAt) {
      requestBuckets.delete(key);
    }
  });
}, 30 * 1000).unref();

const contactRateLimiter = createRateLimiter({
  keyPrefix: 'contact',
  windowMs: RATE_LIMIT_WINDOW_MS,
  maxRequests: RATE_LIMIT_MAX_REQUESTS,
});

const applyRateLimiter = createRateLimiter({
  keyPrefix: 'apply',
  windowMs: RATE_LIMIT_WINDOW_MS,
  maxRequests: RATE_LIMIT_MAX_REQUESTS,
});

const loginRateLimiter = createRateLimiter({
  keyPrefix: 'client-login',
  windowMs: RATE_LIMIT_WINDOW_MS,
  maxRequests: LOGIN_RATE_LIMIT_MAX_REQUESTS,
});

// ===========================================
// Local Storage Fallback Functions
// ===========================================

async function ensureDataStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(GENERATED_PDF_DIR, { recursive: true });
  await fs.mkdir(PDF_TEMPLATE_DIR, { recursive: true });

  const defaults = [
    [CONTACTS_FILE, '[]'],
    [APPLICATIONS_FILE, '[]'],
    [CLIENTS_FILE, '[]'],
  ];

  for (const [filePath, defaultContent] of defaults) {
    try {
      await fs.access(filePath);
    } catch (error) {
      await fs.writeFile(filePath, defaultContent, 'utf8');
    }
  }
}

async function pdfTemplateExists() {
  try {
    await fs.access(PDF_FORM_TEMPLATE_PATH);
    return true;
  } catch (error) {
    return false;
  }
}

async function readJsonArray(filePath) {
  await ensureDataStorage();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

async function writeJsonArray(filePath, records) {
  await ensureDataStorage();
  await fs.writeFile(filePath, JSON.stringify(records, null, 2), 'utf8');
}

// ===========================================
// Utility Functions
// ===========================================

function splitName(fullName) {
  if (!fullName) return { first: '', last: '' };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { first: parts[0], last: '' };
  }
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function normalizeValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).join(', ');
  }
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

function toYesNo(value) {
  const normalized = normalizeValue(value).toLowerCase();
  if (!normalized) return '';
  if (['yes', 'true', '1', 'on'].includes(normalized)) return 'YES';
  if (['no', 'false', '0', 'off'].includes(normalized)) return 'NO';
  return normalizeValue(value);
}

function toBooleanField(value) {
  const normalized = normalizeValue(value).toLowerCase();
  if (!normalized) return false;
  return ['yes', 'true', '1', 'on', 'checked'].includes(normalized);
}

function mapApplicationRecordForSupabase(record) {
  return {
    id: normalizeValue(record.id),
    first_name: normalizeValue(record.first_name),
    last_name: normalizeValue(record.last_name),
    email: normalizeValue(record.email),
    contact_number: normalizeValue(record.contact_number),
    contact_agreement: toBooleanField(record.contact_agreement),

    loan_amount: normalizeValue(record.loan_amount),
    funding_timeline: normalizeValue(record.funding_timeline),
    loan_use: normalizeValue(record.loan_use),

    legal_business_name: normalizeValue(record.legal_business_name),
    business_start_date: normalizeValue(record.business_start_date),
    business_dba: normalizeValue(record.business_dba),
    industry: normalizeValue(record.industry),
    business_website: normalizeValue(record.business_website),
    business_address: normalizeValue(record.business_address),
    business_city: normalizeValue(record.business_city),
    business_state: normalizeValue(record.business_state),
    business_zip: normalizeValue(record.business_zip),
    business_phone: normalizeValue(record.business_phone),
    legal_entity: normalizeValue(record.legal_entity),
    business_tax_id: normalizeValue(record.business_tax_id),
    credit_score: normalizeValue(record.credit_score),
    gross_annual_sales: normalizeValue(record.gross_annual_sales),
    avg_monthly_deposits: normalizeValue(record.avg_monthly_deposits),
    avg_daily_balance: normalizeValue(record.avg_daily_balance),
    state_of_incorporation: normalizeValue(record.state_of_incorporation),
    funding_company: normalizeValue(record.funding_company),
    credit_card_processor: normalizeValue(record.credit_card_processor),
    seasonal_business: normalizeValue(record.seasonal_business),
    peak_months: normalizeValue(record.peak_months),
    has_other_financing: normalizeValue(record.has_other_financing),
    outstanding_balance: normalizeValue(record.outstanding_balance),
    has_judgements_liens: normalizeValue(record.has_judgements_liens),
    has_open_bankruptcies: normalizeValue(record.has_open_bankruptcies),

    owner_first_name: normalizeValue(record.owner_first_name),
    owner_last_name: normalizeValue(record.owner_last_name),
    owner_email: normalizeValue(record.owner_email),
    owner_address: normalizeValue(record.owner_address),
    owner_city: normalizeValue(record.owner_city),
    owner_state: normalizeValue(record.owner_state),
    owner_zip: normalizeValue(record.owner_zip),
    owner_contact: normalizeValue(record.owner_contact),
    owner_dob: normalizeValue(record.owner_dob),
    owner_ssn: normalizeValue(record.owner_ssn),
    owner_ownership: normalizeValue(record.owner_ownership),

    additional_owner_first_name: normalizeValue(record.additional_owner_first_name),
    additional_owner_last_name: normalizeValue(record.additional_owner_last_name),
    additional_owner_email: normalizeValue(record.additional_owner_email),
    additional_owner_address: normalizeValue(record.additional_owner_address),
    additional_owner_city: normalizeValue(record.additional_owner_city),
    additional_owner_state: normalizeValue(record.additional_owner_state),
    additional_owner_zip: normalizeValue(record.additional_owner_zip),
    additional_owner_contact: normalizeValue(record.additional_owner_contact),
    additional_owner_dob: normalizeValue(record.additional_owner_dob),
    additional_owner_ssn: normalizeValue(record.additional_owner_ssn),
    additional_owner_ownership: normalizeValue(record.additional_owner_ownership),

    landlord_name_mortgage_company: normalizeValue(record.landlord_name_mortgage_company),
    landlord_contact_person: normalizeValue(record.landlord_contact_person),
    landlord_phone: normalizeValue(record.landlord_phone),
    business_trade_reference_2: normalizeValue(record.business_trade_reference_2),
    business_trade_reference_2_contact_person: normalizeValue(record.business_trade_reference_2_contact_person),
    business_trade_reference_2_phone: normalizeValue(record.business_trade_reference_2_phone),
    business_trade_reference_3: normalizeValue(record.business_trade_reference_3),
    business_trade_reference_3_contact_person: normalizeValue(record.business_trade_reference_3_contact_person),
    business_trade_reference_3_phone: normalizeValue(record.business_trade_reference_3_phone),

    signature: normalizeValue(record.signature),
    signature_additional: normalizeValue(record.signature_additional),
    application_date: normalizeValue(record.application_date),
    application_date_additional: normalizeValue(record.application_date_additional),
    application_agreement: toBooleanField(record.application_agreement),

    form: normalizeValue(record.form),
    page: normalizeValue(record.page),

    files: Array.isArray(record.files) ? record.files : [],

    generated_pdf_url: normalizeValue(record.generated_pdf_url),
    generated_pdf_filename: normalizeValue(record.generated_pdf?.fileName || record.generated_pdf_filename),
    pdf_status: normalizeValue(record.pdfStatus || record.pdf_status || 'pending'),
    pdf_error: normalizeValue(record.pdfError || record.pdf_error),
    email_status: normalizeValue(record.emailStatus || record.email_status || 'pending'),
    email_message_id: normalizeValue(record.emailMessageId || record.email_message_id),

    crm_status: normalizeValue(record.crmStatus || record.crm_status || 'pending'),
    crm_code: Number.isFinite(Number(record.crmCode)) ? Number(record.crmCode) : null,
    crm_provider: normalizeValue(record.crmProvider || record.crm_provider),

    created_at: normalizeValue(record.createdAt),
  };
}

function emailForCompare(value) {
  return normalizeValue(value).toLowerCase();
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signToken(payload) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(
    JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + CLIENT_TOKEN_TTL_SECONDS,
    }),
  );
  const signature = crypto.createHmac('sha256', CLIENT_AUTH_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token');
  }

  const [header, body, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', CLIENT_AUTH_SECRET).update(`${header}.${body}`).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('Invalid token signature');
  }

  const payload = JSON.parse(base64UrlDecode(body));
  if (!payload.exp || Number(payload.exp) < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }
  return payload;
}

function verifyClientPassword(storedPassword, enteredPassword) {
  if (!storedPassword || !enteredPassword) return false;
  if (storedPassword.startsWith('plain:')) {
    return storedPassword.slice(6) === enteredPassword;
  }
  if (storedPassword.startsWith('scrypt$')) {
    const parts = storedPassword.split('$');
    if (parts.length !== 3) return false;
    const [, salt, hashHex] = parts;
    const derived = crypto.scryptSync(enteredPassword, salt, 64).toString('hex');
    const a = Buffer.from(derived, 'hex');
    const b = Buffer.from(hashHex, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  return storedPassword === enteredPassword;
}

function requireClientAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    req.clientAuth = verifyToken(token);
    return next();
  } catch (error) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
}

// ===========================================
// PDF Generation
// ===========================================

async function generateApplicationPdf(record) {
  await fs.mkdir(GENERATED_PDF_DIR, { recursive: true });

  const safeDate = (record.createdAt || new Date().toISOString()).replace(/[:.]/g, '-');
  const fileName = `funding-request-${safeDate}-${record.id}.pdf`;
  const filePath = path.join(GENERATED_PDF_DIR, fileName);

  let buffer = null;
  try {
    buffer = await generateApplicationPdfFromTemplate(record, {
      templatePath: PDF_FORM_TEMPLATE_PATH,
      flatten: true,
    });
  } catch (error) {
    // Fall back to programmatic layout when template is unavailable or invalid.
    buffer = await generateApplicationPdfBuffer(record, {
      companyName: 'No Limit Capital',
      margin: 24,
      logoPath: LOGO_PATH,
      headerScale: 0.75,
    });
  }

  await fs.writeFile(filePath, buffer);
  return { fileName, filePath, buffer };
}

// ===========================================
// AWS S3 Upload
// ===========================================

async function uploadPdfToS3(buffer, fileName) {
  if (!s3Client || !S3_BUCKET_NAME) {
    return { status: 'skipped', reason: 'S3 not configured' };
  }

  const key = `${S3_PDF_PREFIX}${fileName}`;

  try {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: 'application/pdf',
      Metadata: {
        'uploaded-at': new Date().toISOString(),
      },
    });

    await s3Client.send(command);

    const url = `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;

    return {
      status: 'uploaded',
      s3Key: key,
      s3Bucket: S3_BUCKET_NAME,
      s3Url: url,
    };
  } catch (error) {
    console.error('S3 upload error:', error);
    return { status: 'failed', error: error.message };
  }
}

// ===========================================
// Email Functions
// ===========================================

function createSmtpMailer() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });
}

const smtpMailer = createSmtpMailer();

/**
 * Send email using AWS SES
 */
async function sendEmailViaSes(to, subject, textBody, htmlBody, attachments) {
  if (!sesClient) {
    return { status: 'skipped', reason: 'SES not configured' };
  }

  try {
    // Note: SES doesn't support attachments directly in the same way
    // For attachments, we need to use raw email or SendGrid
    // This is a simplified version for text emails
    const command = new SendEmailCommand({
      Source: process.env.SES_FROM_EMAIL || 'noreply@nolimitcap.com',
      Destination: {
        ToAddresses: Array.isArray(to) ? to : [to],
      },
      Message: {
        Subject: { Data: subject },
        Body: {
          Text: { Data: textBody },
          Html: { Data: htmlBody || textBody },
        },
      },
    });

    const response = await sesClient.send(command);
    return { status: 'sent', messageId: response.MessageId };
  } catch (error) {
    console.error('SES send error:', error);
    return { status: 'failed', error: error.message };
  }
}

/**
 * Send email using SendGrid
 */
async function sendEmailViaSendGrid(to, subject, textBody, htmlBody, attachments) {
  if (!process.env.SENDGRID_API_KEY) {
    return { status: 'skipped', reason: 'SendGrid not configured' };
  }

  try {
    const msg = {
      to: Array.isArray(to) ? to : [to],
      from: process.env.SENDGRID_FROM_EMAIL || 'noreply@nolimitcap.com',
      subject,
      text: textBody,
      html: htmlBody || `<p>${textBody}</p>`,
    };

    if (attachments && attachments.length > 0) {
      msg.attachments = attachments.map((att) => ({
        content: att.content.toString('base64'),
        filename: att.filename,
        type: att.contentType || 'application/pdf',
        disposition: 'attachment',
      }));
    }

    const response = await sgMail.send(msg);
    return { status: 'sent', messageId: response[0]?.headers?.['x-message-id'] };
  } catch (error) {
    console.error('SendGrid send error:', error);
    return { status: 'failed', error: error.message };
  }
}

/**
 * Send email using SMTP (fallback)
 */
async function sendEmailViaSmtp(to, subject, textBody, htmlBody, attachments) {
  if (!smtpMailer) {
    return { status: 'skipped', reason: 'SMTP not configured' };
  }

  try {
    const info = await smtpMailer.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      text: textBody,
      html: htmlBody,
      attachments: attachments?.map((att) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
      })),
    });

    return { status: 'sent', messageId: info.messageId };
  } catch (error) {
    console.error('SMTP send error:', error);
    return { status: 'failed', error: error.message };
  }
}

/**
 * Send email with PDF attachment - tries SendGrid first, then SMTP
 */
async function emailApplicationPdf(record, pdfData) {
  const recipients = (process.env.FUNDING_REQUEST_RECIPIENTS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    return { status: 'skipped', reason: 'No recipients configured' };
  }

  const applicantName = `${record.first_name || ''} ${record.last_name || ''}`.trim();
  const subject = `New Funding Application - ${applicantName} - No Limit Capital`;

  const textBody = [
    'New funding application received.',
    '',
    'APPLICANT DETAILS:',
    `Name: ${applicantName}`,
    `Email: ${record.email || ''}`,
    `Phone: ${record.contact_number || ''}`,
    '',
    'BUSINESS DETAILS:',
    `Business Name: ${record.legal_business_name || ''}`,
    `Industry: ${record.industry || ''}`,
    `Requested Amount: ${record.loan_amount || ''}`,
    `Funding Timeline: ${record.funding_timeline || ''}`,
    '',
    `Application ID: ${record.id}`,
    `Submitted: ${record.createdAt ? new Date(record.createdAt).toLocaleString() : new Date().toLocaleString()}`,
    '',
    'Please see the attached PDF for complete application details.',
    '',
    '---',
    'No Limit Capital',
    'www.nolimitcap.com',
  ].join('\n');

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1a56db; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">No Limit Capital</h1>
        <p style="color: #fbbf24; margin: 5px 0 0 0;">New Funding Application</p>
      </div>
      <div style="padding: 20px; background: #f8fafc;">
        <h2 style="color: #1e293b; border-bottom: 2px solid #1a56db; padding-bottom: 10px;">Applicant Details</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Name:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${applicantName}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Email:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${record.email || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Phone:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${record.contact_number || ''}</td></tr>
        </table>
        <h2 style="color: #1e293b; border-bottom: 2px solid #1a56db; padding-bottom: 10px; margin-top: 20px;">Business Details</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Business Name:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${record.legal_business_name || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Industry:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${record.industry || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Requested Amount:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${record.loan_amount || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Funding Timeline:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${record.funding_timeline || ''}</td></tr>
        </table>
        <div style="margin-top: 20px; padding: 15px; background: #1a56db; color: white; border-radius: 8px;">
          <p style="margin: 0;"><strong>Application ID:</strong> ${record.id}</p>
          <p style="margin: 5px 0 0 0;"><strong>Submitted:</strong> ${record.createdAt ? new Date(record.createdAt).toLocaleString() : new Date().toLocaleString()}</p>
        </div>
        <p style="margin-top: 20px; color: #64748b;">Please see the attached PDF for complete application details.</p>
      </div>
      <div style="background: #1e293b; padding: 15px; text-align: center; color: #94a3b8;">
        <p style="margin: 0;">No Limit Capital | www.nolimitcap.com</p>
      </div>
    </div>
  `;

  const attachments = [
    {
      filename: pdfData.fileName,
      content: pdfData.buffer,
      contentType: 'application/pdf',
    },
  ];

  // Try SendGrid first (best for attachments)
  let result = await sendEmailViaSendGrid(recipients, subject, textBody, htmlBody, attachments);
  if (result.status === 'sent') {
    return { ...result, provider: 'sendgrid' };
  }

  // Fall back to SMTP
  result = await sendEmailViaSmtp(recipients, subject, textBody, htmlBody, attachments);
  if (result.status === 'sent') {
    return { ...result, provider: 'smtp' };
  }

  // Last resort: SES (without attachment - just notification)
  result = await sendEmailViaSes(recipients, subject, textBody, htmlBody, []);
  if (result.status === 'sent') {
    return { ...result, provider: 'ses', note: 'Sent without attachment' };
  }

  return { status: 'failed', reason: 'All email providers failed' };
}

// ===========================================
// Supabase Database Functions
// ===========================================

async function saveContactToSupabase(record) {
  if (!supabase) {
    return { status: 'skipped', reason: 'Supabase not configured' };
  }

  try {
    // Map record fields to database column names (camelCase -> snake_case)
    const dbRecord = {
      name: record.name,
      email: record.email,
      phone: record.phone,
      company: record.company,
      contact_time: record.contact_time,
      details: record.details,
      crm_status: record.crmStatus || 'pending',
      crm_code: record.crmCode,
      crm_provider: record.crmProvider,
    };

    const { data, error } = await supabase
      .from('contacts')
      .insert([dbRecord])
      .select()
      .single();

    if (error) throw error;
    return { status: 'saved', data };
  } catch (error) {
    console.error('Supabase contact save error:', error);
    return { status: 'failed', error: error.message };
  }
}

async function savePartnerToSupabase(record) {
  if (!supabase) {
    return { status: 'skipped', reason: 'Supabase not configured' };
  }

  try {
    // Map record fields to database column names
    const dbRecord = {
      name: record.name,
      email: record.email,
      company: record.company,
      partner_type: record.partner_type,
      pipeline_size: record.pipeline_size,
      crm_status: record.crmStatus || 'pending',
      crm_code: record.crmCode,
      crm_provider: record.crmProvider,
    };

    const { data, error } = await supabase
      .from('partners')
      .insert([dbRecord])
      .select()
      .single();

    if (error) throw error;
    return { status: 'saved', data };
  } catch (error) {
    console.error('Supabase partner save error:', error);
    return { status: 'failed', error: error.message };
  }
}

async function saveProductRequestToSupabase(record) {
  if (!supabase) {
    return { status: 'skipped', reason: 'Supabase not configured' };
  }

  try {
    // Map record fields to database column names
    const dbRecord = {
      name: record.name,
      email: record.email,
      product: record.product,
      crm_status: record.crmStatus || 'pending',
      crm_code: record.crmCode,
      crm_provider: record.crmProvider,
    };

    const { data, error } = await supabase
      .from('product_requests')
      .insert([dbRecord])
      .select()
      .single();

    if (error) throw error;
    return { status: 'saved', data };
  } catch (error) {
    console.error('Supabase product request save error:', error);
    return { status: 'failed', error: error.message };
  }
}

async function saveApplicationToSupabase(record) {
  if (!supabase) {
    return { status: 'skipped', reason: 'Supabase not configured' };
  }

  try {
    const dbRecord = mapApplicationRecordForSupabase(record);

    const { data, error } = await supabase
      .from('applications')
      .insert([dbRecord])
      .select()
      .single();

    if (error) throw error;
    return { status: 'saved', data };
  } catch (error) {
    console.error('Supabase application save error:', error);
    return { status: 'failed', error: error.message };
  }
}

async function updateApplicationInSupabase(id, updates) {
  if (!supabase) {
    return { status: 'skipped', reason: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('applications')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { status: 'updated', data };
  } catch (error) {
    console.error('Supabase application update error:', error);
    return { status: 'failed', error: error.message };
  }
}

async function getApplicationsFromSupabase(filters = {}) {
  if (!supabase) {
    return { status: 'skipped', reason: 'Supabase not configured', data: [] };
  }

  try {
    let query = supabase
      .from('applications')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters.email) {
      query = query.eq('email', filters.email);
    }

    const { data, error } = await query;

    if (error) throw error;
    return { status: 'success', data };
  } catch (error) {
    console.error('Supabase applications fetch error:', error);
    return { status: 'failed', error: error.message, data: [] };
  }
}

async function getClientFromSupabase(email) {
  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error) return null;
    return data;
  } catch (error) {
    return null;
  }
}

// ===========================================
// HubSpot CRM Integration
// ===========================================

async function sendToHubSpotCrm(record) {
  if (!HUBSPOT_ACCESS_TOKEN) {
    return { status: 'skipped' };
  }

  const { first, last } = splitName(record.name || '');
  const properties = {
    email: record.email || '',
  };
  if (first) properties.firstname = first;
  if (last) properties.lastname = last;
  if (record.company) properties.company = record.company;

  try {
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ properties }),
    });

    if (!response.ok) {
      return { status: 'failed', code: response.status, provider: 'hubspot-crm' };
    }

    return { status: 'sent', code: response.status, provider: 'hubspot-crm' };
  } catch (error) {
    return { status: 'error', error: error.message, provider: 'hubspot-crm' };
  }
}

// ===========================================
// Switchbox AI CRM Integration
// ===========================================

const SWITCHBOX_API_URL = process.env.SWITCHBOX_API_URL;
const SWITCHBOX_API_KEY = process.env.SWITCHBOX_API_KEY;

async function sendToSwitchboxCrm(record) {
  if (!SWITCHBOX_API_URL) {
    return { status: 'skipped', reason: 'Switchbox URL not configured' };
  }

  try {
    const response = await fetch(SWITCHBOX_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SWITCHBOX_API_KEY}`,
        'X-API-Key': SWITCHBOX_API_KEY, // Try both standard headers
      },
      body: JSON.stringify(record),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Switchbox CRM error:', errorText);
      return { status: 'failed', code: response.status, provider: 'switchbox-ai', error: errorText };
    }

    const data = await response.json();
    return { status: 'sent', code: response.status, provider: 'switchbox-ai', data };
  } catch (error) {
    console.error('Switchbox CRM exception:', error);
    return { status: 'error', error: error.message, provider: 'switchbox-ai' };
  }
}

async function sendToCrm(record) {
  const results = {};
  
  // Send to HubSpot (if configured)
  results.hubspot = await sendToHubSpotCrm(record);

  // Send to Switchbox AI (if configured)
  results.switchbox = await sendToSwitchboxCrm(record);

  // Return success if at least one succeeded, or the result of the primary one (Switchbox preference?)
  // For now, return a combined status
  return {
    status: (results.hubspot.status === 'sent' || results.switchbox.status === 'sent') ? 'sent' : 'failed',
    providers: results
  };
}

// ===========================================
// API Routes
// ===========================================

app.get('/api/health', async (req, res) => {
  const templateReady = await pdfTemplateExists();

  res.json({
    ok: true,
    uptime: process.uptime(),
    services: {
      supabase: supabase ? 'connected' : 'not_configured',
      s3: s3Client ? 'connected' : 'not_configured',
      ses: sesClient ? 'connected' : 'not_configured',
      sendgrid: process.env.SENDGRID_API_KEY ? 'connected' : 'not_configured',
      smtp: smtpMailer ? 'connected' : 'not_configured',
      pdf_template: templateReady ? 'ready' : 'missing_fallback_renderer',
    },
    pdfTemplate: {
      mode: templateReady ? 'fillable_template' : 'renderer_fallback',
      path: PDF_FORM_TEMPLATE_PATH,
      exists: templateReady,
    },
  });
});

app.post('/api/contact', contactRateLimiter, async (req, res) => {
  const body = req.body || {};
  const name = normalizeValue(body.name);
  const email = normalizeValue(body.email);
  const formType = normalizeValue(body.form) || 'contact';

  if (!name || !email) {
    return res.status(400).json({ ok: false, error: 'name and email are required' });
  }

  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  ALLOWED_FIELDS.forEach((field) => {
    const value = normalizeValue(body[field]);
    if (value) {
      record[field] = value;
    }
  });

  const crmResult = await sendToCrm(record);
  record.crmStatus = crmResult.status;
  if (crmResult.code) record.crmCode = crmResult.code;
  if (crmResult.provider) record.crmProvider = crmResult.provider;

  // Route to different Supabase tables based on form type
  let supabaseResult;
  if (formType === 'partner') {
    supabaseResult = await savePartnerToSupabase(record);
  } else if (formType === 'product-request') {
    supabaseResult = await saveProductRequestToSupabase(record);
  } else {
    supabaseResult = await saveContactToSupabase(record);
  }

  if (supabaseResult.status === 'saved') {
    return res.json({ ok: true, id: record.id, crmStatus: record.crmStatus, storage: 'supabase', table: formType });
  }

  // Fall back to local storage
  try {
    const contacts = await readJsonArray(CONTACTS_FILE);
    contacts.push(record);
    await writeJsonArray(CONTACTS_FILE, contacts);
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Failed to store submission' });
  }

  return res.json({ ok: true, id: record.id, crmStatus: record.crmStatus, storage: 'local' });
});

app.post('/api/apply', applyRateLimiter, upload.array('bank_statements', 10), async (req, res) => {
  const body = req.body || {};
  const firstName = normalizeValue(body.first_name);
  const lastName = normalizeValue(body.last_name);
  const email = normalizeValue(body.email);

  if (!firstName || !lastName || !email) {
    return res.status(400).json({ ok: false, error: 'first_name, last_name, and email are required' });
  }

  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  APPLICATION_FIELDS.forEach((field) => {
    const value = normalizeValue(body[field]);
    if (value) {
      record[field] = value;
    }
  });

  record.name = `${firstName} ${lastName}`.trim();
  record.email = email;
  record.company = record.legal_business_name || record.business_dba || '';

  const files = Array.isArray(req.files) ? req.files : [];
  record.files = files.map((file) => ({
    originalName: file.originalname,
    storedName: file.filename,
    size: file.size,
    type: file.mimetype,
  }));

  const crmResult = await sendToCrm({
    name: record.name,
    email: record.email,
    company: record.company,
  });
  record.crmStatus = crmResult.status;
  if (crmResult.code) record.crmCode = crmResult.code;
  if (crmResult.provider) record.crmProvider = crmResult.provider;

  // Generate PDF
  try {
    const pdfData = await generateApplicationPdf(record);
    record.generated_pdf = {
      fileName: pdfData.fileName,
      filePath: pdfData.filePath,
    };
    record.generated_pdf_filename = pdfData.fileName;

    // Upload to S3
    const s3Result = await uploadPdfToS3(pdfData.buffer, pdfData.fileName);
    if (s3Result.status === 'uploaded') {
      record.generated_pdf_url = s3Result.s3Url;
      record.generated_pdf_s3_key = s3Result.s3Key;
    }

    // Send email with PDF
    const mailResult = await emailApplicationPdf(record, pdfData);
    record.pdfStatus = 'generated';
    record.emailStatus = mailResult.status;
    if (mailResult.messageId) {
      record.emailMessageId = mailResult.messageId;
    }
    if (mailResult.provider) {
      record.emailProvider = mailResult.provider;
    }
  } catch (error) {
    record.pdfStatus = 'failed';
    record.emailStatus = 'failed';
    record.pdfError = error.message;
  }

  // Try Supabase first
  const supabaseResult = await saveApplicationToSupabase(record);
  if (supabaseResult.status === 'saved') {
    return res.json({
      ok: true,
      id: record.id,
      crmStatus: record.crmStatus,
      pdfStatus: record.pdfStatus,
      emailStatus: record.emailStatus,
      storage: 'supabase',
    });
  }

  // Fall back to local storage
  try {
    const applications = await readJsonArray(APPLICATIONS_FILE);
    applications.push(record);
    await writeJsonArray(APPLICATIONS_FILE, applications);
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Failed to store application' });
  }

  return res.json({
    ok: true,
    id: record.id,
    crmStatus: record.crmStatus,
    pdfStatus: record.pdfStatus,
    emailStatus: record.emailStatus,
    storage: 'local',
  });
});

// ===========================================
// Server Initialization
// ===========================================

// ===========================================
// Server Initialization
// ===========================================

// Only verify paths and start server if running directly (not imported as a module)
if (require.main === module) {
  (async function initialize() {
    await ensureDataStorage();

    try {
      await fs.access(PDF_FORM_TEMPLATE_PATH);
      console.log(`Fillable NoLimitCap PDF template found: ${PDF_FORM_TEMPLATE_PATH}`);
    } catch (error) {
      console.warn(
        `Fillable NoLimitCap PDF template not found at ${PDF_FORM_TEMPLATE_PATH}. ` +
        'Using renderer fallback until template is added.',
      );
    }

    app.listen(PORT, () => {
      console.log(`NoLimitCap backend listening on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  })().catch((error) => {
    console.error('Failed to initialize server:', error.message);
    process.exit(1);
  });
}

// Export for Vercel Serverless Function
module.exports = app;
