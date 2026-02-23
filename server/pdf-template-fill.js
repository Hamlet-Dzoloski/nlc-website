const fs = require('fs/promises');
const path = require('path');
const { PDFDocument, StandardFonts } = require('pdf-lib');

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
  if (['yes', 'true', '1', 'on', 'checked'].includes(normalized)) return 'YES';
  if (['no', 'false', '0', 'off'].includes(normalized)) return 'NO';
  return normalizeValue(value);
}

function formatDate(value) {
  const normalized = normalizeValue(value);
  if (!normalized) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [year, month, day] = normalized.split('-');
    return `${month}/${day}/${year}`;
  }
  return normalized;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

function setTextFieldIfPresent(form, fieldName, value) {
  try {
    const field = form.getTextField(fieldName);
    field.setText(normalizeValue(value));
    return true;
  } catch (error) {
    return false;
  }
}

function buildFieldMappings(record) {
  const owner1Name = `${normalizeValue(record.owner_first_name)} ${normalizeValue(record.owner_last_name)}`.trim();
  const owner2Name = `${normalizeValue(record.additional_owner_first_name)} ${normalizeValue(record.additional_owner_last_name)}`.trim();
  const preferredContact = `${normalizeValue(record.first_name)} ${normalizeValue(record.last_name)}`.trim();

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
    preferred_contact_name: preferredContact,
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

    signature: record.signature,
    application_date: formatDate(record.application_date),
    signature_additional: record.signature_additional,
    application_date_additional: formatDate(record.application_date_additional),
  };
}

async function generateApplicationPdfFromTemplate(record, options = {}) {
  const templatePath = options.templatePath
    ? path.resolve(options.templatePath)
    : '';

  if (!templatePath) {
    throw new Error('No fillable PDF template path configured');
  }

  if (!await fileExists(templatePath)) {
    throw new Error(`Fillable PDF template not found at ${templatePath}`);
  }

  const normalizedPath = templatePath.toLowerCase();
  if (normalizedPath.includes('creative') || normalizedPath.includes('golden-age-assisted-living')) {
    throw new Error(`Rejected non-NoLimitCap template path: ${templatePath}`);
  }

  const pdfBytes = await fs.readFile(templatePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  const existingFields = form.getFields();
  if (!existingFields.length) {
    throw new Error(`Template has no fillable fields: ${templatePath}`);
  }
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const fields = buildFieldMappings(record);
  Object.entries(fields).forEach(([name, value]) => {
    setTextFieldIfPresent(form, name, value);
  });

  form.updateFieldAppearances(helvetica);
  if (options.flatten !== false) {
    form.flatten();
  }

  const output = await pdfDoc.save();
  return Buffer.from(output);
}

module.exports = {
  generateApplicationPdfFromTemplate,
};
