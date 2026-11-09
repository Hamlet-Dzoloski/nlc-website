'use strict';

const agreed = value => Array.isArray(value)
  ? value.length > 0 && value.every(agreed)
  : ['yes', 'true', '1', 'on', 'checked'].includes(String(value || '').trim().toLowerCase());

function validateApplication(body) {
  const required = ['loan_amount', 'funding_timeline', 'first_name', 'last_name', 'contact_number', 'email',
    'legal_business_name', 'business_dba', 'industry', 'business_start_date', 'business_address', 'business_city', 'business_state', 'business_zip',
    'business_phone', 'legal_entity', 'business_tax_id', 'state_of_incorporation', 'credit_score', 'gross_annual_sales',
    'avg_monthly_deposits', 'avg_daily_balance', 'has_other_financing', 'has_open_bankruptcies', 'has_judgements_liens',
    'seasonal_business', 'owner_first_name', 'owner_last_name', 'owner_ssn', 'owner_dob', 'owner_ownership',
    'owner_email', 'owner_address', 'owner_city', 'owner_state', 'owner_zip', 'owner_contact', 'application_date'];
  const missing = required.filter(field => typeof body[field] !== 'string' || !body[field].trim());
  if (missing.length) return { error: 'Please complete all required application fields.', fields: missing };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return { error: 'Please enter a valid email address.', fields: ['email'] };
  if (!agreed(body.contact_agreement) || !agreed(body.application_agreement)) return { error: 'Please accept the contact and application agreements before submitting.', fields: ['contact_agreement', 'application_agreement'] };
  return null;
}

module.exports = { validateApplication, agreed };
