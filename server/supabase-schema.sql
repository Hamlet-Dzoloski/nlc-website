-- NoLimitCap Solutions - Supabase Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================================
-- CONTACT FORM SUBMISSIONS
-- ===========================================

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  contact_time TEXT,
  details TEXT,
  crm_status TEXT DEFAULT 'pending',
  crm_code INTEGER,
  crm_provider TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- PARTNER FORM SUBMISSIONS
-- ===========================================

CREATE TABLE IF NOT EXISTS partners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL,
  partner_type TEXT,
  pipeline_size TEXT,
  crm_status TEXT DEFAULT 'pending',
  crm_code INTEGER,
  crm_provider TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- PRODUCT REQUEST FORM SUBMISSIONS
-- ===========================================

CREATE TABLE IF NOT EXISTS product_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  product TEXT,
  crm_status TEXT DEFAULT 'pending',
  crm_code INTEGER,
  crm_provider TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- FUNDING APPLICATIONS
-- ===========================================

CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Basic Info
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  contact_number TEXT,
  contact_agreement BOOLEAN DEFAULT FALSE,
  
  -- Loan Details
  loan_amount TEXT,
  funding_timeline TEXT,
  loan_use TEXT,
  
  -- Business Information
  legal_business_name TEXT,
  business_start_date TEXT,
  business_dba TEXT,
  industry TEXT,
  business_website TEXT,
  business_address TEXT,
  business_city TEXT,
  business_state TEXT,
  business_zip TEXT,
  business_phone TEXT,
  legal_entity TEXT,
  business_tax_id TEXT,
  credit_score TEXT,
  gross_annual_sales TEXT,
  avg_monthly_deposits TEXT,
  avg_daily_balance TEXT,
  state_of_incorporation TEXT,
  funding_company TEXT,
  credit_card_processor TEXT,
  seasonal_business TEXT,
  peak_months TEXT,
  has_other_financing TEXT,
  outstanding_balance TEXT,
  has_judgements_liens TEXT,
  has_open_bankruptcies TEXT,
  
  -- Primary Owner Information
  owner_first_name TEXT,
  owner_last_name TEXT,
  owner_email TEXT,
  owner_address TEXT,
  owner_city TEXT,
  owner_state TEXT,
  owner_zip TEXT,
  owner_contact TEXT,
  owner_dob TEXT,
  owner_ssn TEXT,
  owner_ownership TEXT,
  
  -- Additional Owner Information
  additional_owner_first_name TEXT,
  additional_owner_last_name TEXT,
  additional_owner_email TEXT,
  additional_owner_address TEXT,
  additional_owner_city TEXT,
  additional_owner_state TEXT,
  additional_owner_zip TEXT,
  additional_owner_contact TEXT,
  additional_owner_dob TEXT,
  additional_owner_ssn TEXT,
  additional_owner_ownership TEXT,
  
  -- References
  landlord_name_mortgage_company TEXT,
  landlord_contact_person TEXT,
  landlord_phone TEXT,
  business_trade_reference_2 TEXT,
  business_trade_reference_2_contact_person TEXT,
  business_trade_reference_2_phone TEXT,
  business_trade_reference_3 TEXT,
  business_trade_reference_3_contact_person TEXT,
  business_trade_reference_3_phone TEXT,
  
  -- Authorization
  signature TEXT,
  signature_additional TEXT,
  application_date TEXT,
  application_date_additional TEXT,
  application_agreement BOOLEAN DEFAULT FALSE,
  
  -- Request metadata
  form TEXT,
  page TEXT,
  
  -- File attachments (stored as JSON array)
  files JSONB DEFAULT '[]'::jsonb,
  
  -- PDF & Email Status
  generated_pdf_url TEXT,
  generated_pdf_filename TEXT,
  pdf_status TEXT DEFAULT 'pending',
  pdf_error TEXT,
  email_status TEXT DEFAULT 'pending',
  email_message_id TEXT,
  
  -- CRM Status
  crm_status TEXT DEFAULT 'pending',
  crm_code INTEGER,
  crm_provider TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- APPLICATION FILES (Bank Statements)
-- ===========================================

CREATE TABLE IF NOT EXISTS application_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  s3_key TEXT,
  s3_bucket TEXT,
  s3_url TEXT,
  size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- INDEXES
-- ===========================================

CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partners_email ON partners(email);
CREATE INDEX IF NOT EXISTS idx_partners_created_at ON partners(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_requests_email ON product_requests(email);
CREATE INDEX IF NOT EXISTS idx_product_requests_created_at ON product_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_email ON applications(email);
CREATE INDEX IF NOT EXISTS idx_applications_owner_email ON applications(owner_email);
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_files_application_id ON application_files(application_id);

-- ===========================================
-- ROW LEVEL SECURITY (RLS)
-- ===========================================

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_files ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role full access (for backend)
CREATE POLICY "Service role has full access on contacts" ON contacts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access on partners" ON partners
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access on product_requests" ON product_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access on applications" ON applications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access on application_files" ON application_files
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ===========================================
-- TRIGGERS
-- ===========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
