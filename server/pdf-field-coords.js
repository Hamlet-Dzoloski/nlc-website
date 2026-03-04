'use strict';

/**
 * pdf-field-coords.js
 *
 * Shared coordinate math used by both:
 *  - create-empty-template.js (builds the blank AcroForm template)
 *  - pdf-template-fill.js     (overlays filled fields on pdfkit fallback output)
 *
 * MUST stay in sync with createLayoutConfig in pdf-layout.js
 */

// --------------------------------------------------------------------------
// Layout constants — mirror pdf-layout.js createLayoutConfig exactly
// --------------------------------------------------------------------------
function createLayoutConfig(scale = 1) {
  return {
    rowHeight:                       Math.max(20, Math.floor(34 * scale)),
    sectionHeaderHeight:             Math.max(11, Math.floor(15 * scale)),
    sectionGap:                      Math.max(3,  Math.floor(6  * scale)),
    labelFontSize:                   Math.max(5.5, 7.0 * scale),
    valueFontSize:                   Math.max(7.5, 10.0 * scale),
    sectionFontSize:                 Math.max(7.2, 8.7 * scale),
    valueOffsetY:                    Math.max(12, Math.floor(18 * scale)),
    legendFontSize:                  Math.max(5.4, 6.6 * scale),
    legendHeight:                    Math.max(7,  Math.floor(10 * scale)),
    authorizationLabelFontSize:      Math.max(5.8, 6.9 * scale),
    authorizationLabelGap:           Math.max(8,  Math.floor(10 * scale)),
    authorizationTextHeight:         Math.max(56, Math.floor(80 * scale)),
    authorizationFontSize:           Math.max(6.5, 7.4 * scale),
    authorizationMinFontSize:        Math.max(6.0, 6.5 * scale),
    authorizationAfterTermsGap:      Math.max(3,  Math.floor(5  * scale)),
    authorizationLineLabelFontSize:  Math.max(6.0, 7.0 * scale),
    authorizationLineValueFontSize:  Math.max(6.2, 7.1 * scale),
    authorizationLineGap:            Math.max(13, Math.floor(18 * scale)),
    authorizationSignatureExtraGap:  Math.max(14, Math.floor(20 * scale)),
    authorizationLineBaselineOffset: Math.max(8,  Math.floor(11 * scale)),
    authorizationOwnerGap:           Math.max(2,  Math.floor(4  * scale)),
    authorizationColumnGap:          Math.max(8,  Math.floor(12 * scale)),
  };
}

function estimateBodyHeight(sections, config) {
  let rowsHeight = 0;
  sections.forEach((s) => s.rows.forEach(() => { rowsHeight += config.rowHeight; }));
  const authorizationHeight =
    config.sectionHeaderHeight +
    config.authorizationLabelGap +
    config.authorizationTextHeight +
    config.authorizationAfterTermsGap +
    config.authorizationLineGap * 3 +
    config.authorizationSignatureExtraGap +
    config.authorizationOwnerGap * 2;
  return (
    sections.length * config.sectionHeaderHeight +
    rowsHeight +
    Math.max(0, sections.length - 1) * config.sectionGap +
    config.sectionGap +
    authorizationHeight +
    config.legendHeight +
    16
  );
}

/** Mirrors buildSections() in pdf-layout.js — same rows, same spans, same order */
function buildSectionsWithNames() {
  return [
    {
      title: 'BUSINESS INFORMATION',
      rows: [
        [ { fieldName: 'legal_business_name', span: 9 }, { fieldName: 'business_dba', span: 7 } ],
        [ { fieldName: 'legal_entity', span: 5 }, { fieldName: 'state_of_incorporation', span: 4 }, { fieldName: 'business_tax_id', span: 4 }, { fieldName: 'funding_company', span: 3 } ],
        [ { fieldName: 'business_address', span: 16 } ],
        [ { fieldName: 'business_city', span: 4 }, { fieldName: 'business_state', span: 3 }, { fieldName: 'business_zip', span: 3 }, { fieldName: 'business_phone', span: 6 } ],
        [ { fieldName: 'preferred_contact_name', span: 6 }, { fieldName: 'contact_number', span: 5 }, { fieldName: 'email', span: 5 } ],
        [ { fieldName: 'industry', span: 6 }, { fieldName: 'business_website', span: 5 }, { fieldName: 'business_start_date', span: 5 } ],
        [ { fieldName: 'loan_amount', span: 6 }, { fieldName: 'funding_timeline', span: 5 }, { fieldName: 'credit_score', span: 5 } ],
        [ { fieldName: 'gross_annual_sales', span: 5 }, { fieldName: 'avg_monthly_deposits', span: 5 }, { fieldName: 'avg_daily_balance', span: 6 } ],
        [ { fieldName: 'loan_use', span: 8 }, { fieldName: 'credit_card_processor', span: 8 } ],
        [ { fieldName: 'has_other_financing', span: 3 }, { fieldName: 'outstanding_balance', span: 3 }, { fieldName: 'seasonal_business', span: 2 }, { fieldName: 'peak_months', span: 3 }, { fieldName: 'has_open_bankruptcies', span: 2 }, { fieldName: 'has_judgements_liens', span: 3 } ],
      ],
    },
    {
      title: 'OWNERSHIP INFORMATION',
      rows: [
        [ { fieldName: 'owner_first_name', span: 3 }, { fieldName: 'owner_last_name', span: 3 }, { fieldName: 'owner_ssn', span: 4 }, { fieldName: 'owner_dob', span: 3 }, { fieldName: 'owner_ownership', span: 3 } ],
        [ { fieldName: 'owner_address', span: 5 }, { fieldName: 'owner_city', span: 2 }, { fieldName: 'owner_state', span: 2 }, { fieldName: 'owner_zip', span: 2 }, { fieldName: 'owner_contact', span: 2 }, { fieldName: 'owner_email', span: 3 } ],
        [ { fieldName: 'additional_owner_first_name', span: 3 }, { fieldName: 'additional_owner_last_name', span: 3 }, { fieldName: 'additional_owner_ssn', span: 4 }, { fieldName: 'additional_owner_dob', span: 3 }, { fieldName: 'additional_owner_ownership', span: 3 } ],
        [ { fieldName: 'additional_owner_address', span: 5 }, { fieldName: 'additional_owner_city', span: 2 }, { fieldName: 'additional_owner_state', span: 2 }, { fieldName: 'additional_owner_zip', span: 2 }, { fieldName: 'additional_owner_contact', span: 2 }, { fieldName: 'additional_owner_email', span: 3 } ],
      ],
    },
    {
      title: 'REFERENCES',
      rows: [
        [ { fieldName: 'landlord_name_mortgage_company', span: 8 }, { fieldName: 'landlord_contact_person', span: 4 }, { fieldName: 'landlord_phone', span: 4 } ],
        [ { fieldName: 'business_trade_reference_2', span: 8 }, { fieldName: 'business_trade_reference_2_contact_person', span: 4 }, { fieldName: 'business_trade_reference_2_phone', span: 4 } ],
        [ { fieldName: 'business_trade_reference_3', span: 8 }, { fieldName: 'business_trade_reference_3_contact_person', span: 4 }, { fieldName: 'business_trade_reference_3_phone', span: 4 } ],
      ],
    },
  ];
}

/** Estimates height of drawLogoHeader (raster logo, margin=24, logoScale=0.75) */
function estimateHeaderHeight(margin, logoScale) {
  const iconSize     = Math.max(30, Math.round(50 * logoScale));
  const textFontSize = Math.max(14, Math.round(19 * logoScale));
  const logoY        = margin - 3;
  const textY        = logoY + iconSize + 6;
  const dividerY     = textY + textFontSize + 6;
  return dividerY + 7;
}

/**
 * Compute AcroForm field bounding boxes in pdfkit top-left coordinates.
 * Returns { coords, config, scale }
 */
function computeFieldCoords(pageWidth = 612, margin = 24, logoScale = 0.75) {
  const contentWidth = pageWidth - margin * 2;
  const sections     = buildSectionsWithNames();
  const pageHeight   = 792;
  const headerHeight = estimateHeaderHeight(margin, logoScale);
  let   config       = createLayoutConfig(1);
  const availableH   = pageHeight - 36 - headerHeight;
  const estimatedH   = estimateBodyHeight(sections, config);
  let   scale        = 1;
  if (estimatedH > availableH) {
    scale  = availableH / estimatedH;
    config = createLayoutConfig(scale);
  }

  const coords = [];
  let y = headerHeight + config.legendHeight;

  sections.forEach((section, sIdx) => {
    y += config.sectionHeaderHeight;

    section.rows.forEach((row) => {
      const totalSpan = row.reduce((s, c) => s + (c.span || 1), 0);
      let curX = margin;

      row.forEach((cell, i) => {
        const span   = cell.span || 1;
        const isLast = i === row.length - 1;
        const cellW  = isLast
          ? (margin + contentWidth - curX)
          : Math.round((contentWidth * span) / totalSpan);

        const labelH = Math.ceil(config.labelFontSize) + 4;
        const fieldY = y + labelH;
        const fieldH = Math.max(10, config.rowHeight - labelH - 2);

        coords.push({
          fieldName: cell.fieldName,
          x:         curX + 2,
          y:         fieldY,
          width:     Math.max(8, cellW - 4),
          height:    fieldH,
        });

        curX += cellW;
      });

      y += config.rowHeight;
    });

    if (sIdx < sections.length - 1) y += config.sectionGap;
  });

  // Authorization section
  y += config.sectionGap + config.sectionHeaderHeight;
  y += config.authorizationLabelGap + config.authorizationTextHeight + config.authorizationAfterTermsGap;

  const colGap = config.authorizationColumnGap;
  const colW   = Math.floor((contentWidth - colGap) / 2);
  const inset  = 5;
  const rowW   = Math.max(24, colW - inset * 2);
  const lineH  = config.authorizationLineGap;
  const fHeight = Math.max(10, lineH - 2);

  const authRows = [
    { left: 'sig_owner1_name',  right: 'sig_owner2_name',            lf: 0.28, shift: 0 },
    { left: 'signature',        right: 'signature_additional',        lf: 0.24, shift: 0, extraGapBefore: config.authorizationSignatureExtraGap },
    { left: 'application_date', right: 'application_date_additional', lf: 0.08, shift: 0 },
  ];

  authRows.forEach(({ left: leftName, right: rightName, lf, shift, extraGapBefore }) => {
    if (extraGapBefore) y += extraGapBefore;

    const fieldOffset = Math.round(rowW * lf);
    // For signature row, make the field taller to span the extra gap above
    const rowFHeight = extraGapBefore ? fHeight + extraGapBefore : fHeight;
    const fieldY = y + config.authorizationLineBaselineOffset - rowFHeight - 2 - shift;

    const leftX  = margin + inset + fieldOffset;
    const leftW  = (margin + colW)         - leftX  - 4;
    const rightX = margin + colW + colGap + inset + fieldOffset;
    const rightW = (margin + contentWidth) - rightX - 4;

    coords.push({ fieldName: leftName,  x: leftX,  y: fieldY, width: Math.max(20, leftW),  height: rowFHeight });
    coords.push({ fieldName: rightName, x: rightX, y: fieldY, width: Math.max(20, rightW), height: rowFHeight });
    y += lineH;
  });

  return { coords, config, scale };
}

module.exports = { computeFieldCoords };
