'use strict';

const fs   = require('fs/promises');
const path = require('path');
const { PDFDocument, StandardFonts, PDFName, PDFNumber } = require('pdf-lib');
const { computeFieldCoords } = require('./pdf-field-coords');

// ---------------------------------------------------------------------------
// Shared helper: white background on all AcroForm field widgets
// ---------------------------------------------------------------------------
function clearFieldHighlights(pdfDoc, form) {
  // MK/BG = [1] = DeviceGray white — overrides the blue viewer highlight.
  const white = pdfDoc.context.obj([PDFNumber.of(1)]);
  form.getFields().forEach((f) => {
    f.acroField.getWidgets().forEach((w) => {
      try {
        const mk = w.getOrCreateMK();
        mk.set(PDFName.of('BG'), white);
        mk.delete(PDFName.of('BC'));
      } catch (_) {}
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeValue(value) {
  if (Array.isArray(value)) return value.map(i => String(i).trim()).filter(Boolean).join(', ');
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function toYesNo(value) {
  const n = normalizeValue(value).toLowerCase();
  if (!n) return '';
  if (['yes', 'true', '1', 'on', 'checked'].includes(n)) return 'YES';
  if (['no', 'false', '0', 'off'].includes(n)) return 'NO';
  return normalizeValue(value);
}

function formatDate(value) {
  const n = normalizeValue(value);
  if (!n) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(n)) {
    const [y, m, d] = n.split('-');
    return `${m}/${d}/${y}`;
  }
  return n;
}

function isBase64Image(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

function setTextField(form, name, value) {
  try { form.getTextField(name).setText(normalizeValue(value)); return true; }
  catch { return false; }
}

// ---------------------------------------------------------------------------
// Field map — does NOT include signature fields (handled separately below)
// ---------------------------------------------------------------------------

function buildFieldMappings(record) {
  const preferred = `${normalizeValue(record.first_name)} ${normalizeValue(record.last_name)}`.trim();
  const owner1    = `${normalizeValue(record.owner_first_name)} ${normalizeValue(record.owner_last_name)}`.trim();
  const owner2    = `${normalizeValue(record.additional_owner_first_name)} ${normalizeValue(record.additional_owner_last_name)}`.trim();

  return {
    legal_business_name: record.legal_business_name,
    business_dba: record.business_dba,
    business_address: record.business_address,
    business_city: record.business_city,
    business_state: record.business_state,
    business_zip: record.business_zip,
    business_phone: record.business_phone,
    business_website: record.business_website,
    industry: record.industry,
    preferred_contact_name: preferred,
    contact_number: record.contact_number,
    email: record.email,
    legal_entity: record.legal_entity,
    business_tax_id: record.business_tax_id,
    state_of_incorporation: record.state_of_incorporation || record.business_state,
    business_start_date: formatDate(record.business_start_date),
    credit_score: record.credit_score,
    loan_amount: record.loan_amount,
    funding_timeline: record.funding_timeline,
    loan_use: record.loan_use,
    gross_annual_sales: record.gross_annual_sales,
    avg_monthly_deposits: record.avg_monthly_deposits,
    avg_daily_balance: record.avg_daily_balance,
    credit_card_processor: record.credit_card_processor,
    has_other_financing: toYesNo(record.has_other_financing),
    outstanding_balance: record.outstanding_balance,
    funding_company: record.funding_company,
    has_open_bankruptcies: toYesNo(record.has_open_bankruptcies),
    has_judgements_liens: toYesNo(record.has_judgements_liens),
    seasonal_business: toYesNo(record.seasonal_business),
    peak_months: record.peak_months,
    application_agreement: toYesNo(record.application_agreement),
    contact_agreement: toYesNo(record.contact_agreement),

    owner_first_name: record.owner_first_name,
    owner_last_name: record.owner_last_name,
    owner_email: record.owner_email,
    owner_ownership: record.owner_ownership,
    owner_ssn: record.owner_ssn,
    owner_dob: formatDate(record.owner_dob),
    owner_address: record.owner_address,
    owner_city: record.owner_city,
    owner_state: record.owner_state,
    owner_zip: record.owner_zip,
    owner_contact: record.owner_contact,

    additional_owner_first_name: record.additional_owner_first_name,
    additional_owner_last_name: record.additional_owner_last_name,
    additional_owner_email: record.additional_owner_email,
    additional_owner_address: record.additional_owner_address,
    additional_owner_city: record.additional_owner_city,
    additional_owner_state: record.additional_owner_state,
    additional_owner_zip: record.additional_owner_zip,
    additional_owner_contact: record.additional_owner_contact,
    additional_owner_ssn: record.additional_owner_ssn,
    additional_owner_dob: formatDate(record.additional_owner_dob),
    additional_owner_ownership: record.additional_owner_ownership,

    landlord_name_mortgage_company: record.landlord_name_mortgage_company,
    landlord_contact_person: record.landlord_contact_person,
    landlord_phone: record.landlord_phone,
    business_trade_reference_2: record.business_trade_reference_2,
    business_trade_reference_2_contact_person: record.business_trade_reference_2_contact_person,
    business_trade_reference_2_phone: record.business_trade_reference_2_phone,
    business_trade_reference_3: record.business_trade_reference_3,
    business_trade_reference_3_contact_person: record.business_trade_reference_3_contact_person,
    business_trade_reference_3_phone: record.business_trade_reference_3_phone,

    // Auth print-name rows (always text)
    sig_owner1_name: owner1,
    sig_owner2_name: owner2,

    application_date: formatDate(record.application_date),
    application_date_additional: formatDate(record.application_date_additional),
  };
}

// ---------------------------------------------------------------------------
// Signature image embedding
// ---------------------------------------------------------------------------

/**
 * Draw a base64 PNG/JPG image onto the page at the position of the named
 * text field widget. Returns true on success, false on any failure.
 */
async function embedSignatureImage(pdfDoc, page, form, fieldName, dataUri) {
  try {
    const [header, b64] = dataUri.split(',');
    if (!b64) return false;
    const bytes = Buffer.from(b64, 'base64');

    // Get widget rectangle via the text field API (reliable)
    const tf      = form.getTextField(fieldName);
    const widgets = tf.acroField.getWidgets();
    if (!widgets.length) return false;
    const { x, y, width, height } = widgets[0].getRectangle();

    const image = header.includes('png')
      ? await pdfDoc.embedPng(bytes)
      : await pdfDoc.embedJpg(bytes);

    const pad  = 2;
    const dims = image.scaleToFit(width - pad * 2, height - pad * 2);
    page.drawImage(image, {
      x:      x + pad + (width  - pad * 2 - dims.width)  / 2,
      y:      y + pad + (height - pad * 2 - dims.height) / 2,
      width:  dims.width,
      height: dims.height,
    });
    return true;
  } catch (err) {
    console.warn(`[pdf-fill] Could not embed signature for "${fieldName}":`, err.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

async function generateApplicationPdfFromTemplate(record, options = {}) {
  const templatePath = options.templatePath ? path.resolve(options.templatePath) : '';
  if (!templatePath)             throw new Error('No fillable PDF template path configured');
  if (!await fileExists(templatePath)) throw new Error(`Template not found: ${templatePath}`);

  const lc = templatePath.toLowerCase();
  if (lc.includes('creative') || lc.includes('golden-age-assisted-living'))
    throw new Error(`Rejected non-NoLimitCap template: ${templatePath}`);

  const pdfDoc = await PDFDocument.load(await fs.readFile(templatePath));
  const form   = pdfDoc.getForm();
  if (!form.getFields().length) throw new Error(`Template has no fillable fields: ${templatePath}`);

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page      = pdfDoc.getPages()[0];

  // 1. Fill all regular text fields
  const fieldMap = buildFieldMappings(record);
  Object.entries(fieldMap).forEach(([name, value]) => setTextField(form, name, value));

  // Set white background before generating appearances so it's baked into AP streams
  clearFieldHighlights(pdfDoc, form);
  form.updateFieldAppearances(helvetica);

  // 2. Handle signature fields — image OR typed text, never the raw data URI
  const owner1Name = `${normalizeValue(record.owner_first_name)} ${normalizeValue(record.owner_last_name)}`.trim();
  const owner2Name = `${normalizeValue(record.additional_owner_first_name)} ${normalizeValue(record.additional_owner_last_name)}`.trim();

  const sigPairs = [
    { field: 'signature',            raw: record.signature,            fallback: owner1Name },
    { field: 'signature_additional', raw: record.signature_additional, fallback: owner2Name },
  ];

  for (const { field, raw, fallback } of sigPairs) {
    if (isBase64Image(raw)) {
      // Try to embed the drawn/uploaded image; use owner name on failure
      const ok = await embedSignatureImage(pdfDoc, page, form, field, raw);
      if (!ok) setTextField(form, field, fallback);
      // On success: image is drawn on page, text field stays blank (transparent overlay)
    } else if (raw && raw.trim()) {
      // Plain typed text signature
      setTextField(form, field, raw.trim());
    } else {
      // Nothing provided — prefill with owner name
      setTextField(form, field, fallback);
    }
  }

  return Buffer.from(await pdfDoc.save());
}

// ---------------------------------------------------------------------------
// Fillable fallback: render pdfkit visual PDF + overlay filled AcroForm fields
// ---------------------------------------------------------------------------

/**
 * Generates a branded pdfkit PDF and overlays filled AcroForm text fields on top.
 * Produces a fillable PDF identical in appearance to the template path, used when
 * the pre-built template is unavailable.
 */
async function generateFillablePdfFromLayout(record, options = {}) {
  const { generateApplicationPdfBuffer } = require('./pdf-layout');

  // Step 1: Generate a BLANK visual pdfkit PDF (labels + underlines, no values).
  // Values are filled in step 3 via AcroForm fields only — avoids double rendering.
  const visualBuf = await generateApplicationPdfBuffer({}, {
    companyName: options.companyName || 'No Limit Capital',
    margin:      options.margin      || 24,
    logoPath:    options.logoPath,
    headerScale: options.headerScale || 0.75,
  });

  // Step 2: Load with pdf-lib and overlay AcroForm fields
  const pdfDoc    = await PDFDocument.load(visualBuf);
  const form      = pdfDoc.getForm();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page      = pdfDoc.getPages()[0];
  const PAGE_H    = 792;

  const { coords } = computeFieldCoords(612, options.margin || 24, options.headerScale || 0.75);

  for (const c of coords) {
    if (!c.fieldName) continue;
    const pdfLibY = PAGE_H - c.y - c.height;
    try {
      const field = form.createTextField(c.fieldName);
      field.addToPage(page, {
        x: c.x, y: pdfLibY,
        width:  Math.max(8, c.width),
        height: Math.max(8, c.height),
        borderWidth: 0,
      });
    } catch (_) {}
  }

  clearFieldHighlights(pdfDoc, form);
  form.updateFieldAppearances(helvetica);

  // Step 3: Fill all text fields with record values
  const fieldMap = buildFieldMappings(record);
  Object.entries(fieldMap).forEach(([name, value]) => setTextField(form, name, value));

  // Step 4: Handle signature fields
  const owner1Name = `${normalizeValue(record.owner_first_name)} ${normalizeValue(record.owner_last_name)}`.trim();
  const owner2Name = `${normalizeValue(record.additional_owner_first_name)} ${normalizeValue(record.additional_owner_last_name)}`.trim();
  const sigPairs = [
    { field: 'signature',            raw: record.signature,            fallback: owner1Name },
    { field: 'signature_additional', raw: record.signature_additional, fallback: owner2Name },
  ];
  for (const { field, raw, fallback } of sigPairs) {
    if (isBase64Image(raw)) {
      const ok = await embedSignatureImage(pdfDoc, page, form, field, raw);
      if (!ok) setTextField(form, field, fallback);
    } else if (raw && raw.trim()) {
      setTextField(form, field, raw.trim());
    } else {
      setTextField(form, field, fallback);
    }
  }

  return Buffer.from(await pdfDoc.save());
}

module.exports = { generateApplicationPdfFromTemplate, generateFillablePdfFromLayout };
