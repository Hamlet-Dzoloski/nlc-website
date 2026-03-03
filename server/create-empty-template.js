/**
 * create-empty-template.js
 *
 * Strategy:
 *  1. Generate the original pdfkit-based visual layout (empty fields, no dashes)
 *     via generateApplicationPdfBuffer — preserves the exact branded look.
 *  2. Replicate the same layout coordinate math to figure out where every
 *     field value area sits on the page (pdfkit top-left coordinates).
 *  3. Load the pdfkit output with pdf-lib and overlay transparent AcroForm
 *     text fields at those exact positions, converting to pdf-lib bottom-left.
 *
 * Usage: node create-empty-template.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { PDFDocument: PdfLib, StandardFonts, PDFName, PDFNumber } = require('pdf-lib');

const OUTPUT_PATH = path.join(__dirname, 'pdf-templates', 'nolimitcap-empty-application.pdf');

const { computeFieldCoords } = require('./pdf-field-coords');

// --------------------------------------------------------------------------
// Step 1: Generate pdfkit visual PDF (original branded layout, blank values)
// --------------------------------------------------------------------------
async function generateVisualPdf(margin, logoScale) {
  const { generateApplicationPdfBuffer } = require('./pdf-layout');
  return generateApplicationPdfBuffer({}, {
    companyName:  'No Limit Capital',
    margin,
    logoPath:     path.join(__dirname, '..', 'assets', 'images', 'logo.png'),
    headerScale:  logoScale,
    emptyFields:  true,
  });
}

// --------------------------------------------------------------------------
// Step 2: Overlay AcroForm fields with pdf-lib
// --------------------------------------------------------------------------
async function overlayAcroFormFields(pdfBuffer, coords, pageHeight) {
  const pdfDoc    = await PdfLib.load(pdfBuffer);
  const form      = pdfDoc.getForm();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page      = pdfDoc.getPages()[0];

  for (const c of coords) {
    if (!c.fieldName) continue;
    const pdfLibY = pageHeight - c.y - c.height;

    try {
      const field = form.createTextField(c.fieldName);
      field.addToPage(page, {
        x:           c.x,
        y:           pdfLibY,
        width:       Math.max(8, c.width),
        height:      Math.max(8, c.height),
        borderWidth: 0,
      });
    } catch (err) {
      console.warn(`  [warn] Skipping "${c.fieldName}": ${err.message}`);
    }
  }

  form.updateFieldAppearances(helvetica);

  // MK/BG = [1] (DeviceGray white) — overrides PDF viewer blue highlight
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

  return Buffer.from(await pdfDoc.save());
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------
async function main() {
  const MARGIN      = 24;
  const LOGO_SCALE  = 0.75;
  const PAGE_HEIGHT = 792;

  console.log('1/3  Generating visual PDF with pdfkit...');
  const visualBuffer = await generateVisualPdf(MARGIN, LOGO_SCALE);

  console.log('2/3  Computing field coordinates...');
  const { coords, scale } = computeFieldCoords(612, MARGIN, LOGO_SCALE);
  console.log(`     Layout scale: ${scale.toFixed(3)}  |  Fields: ${coords.length}`);

  console.log('3/3  Overlaying AcroForm fields with pdf-lib...');
  const finalBuffer = await overlayAcroFormFields(visualBuffer, coords, PAGE_HEIGHT);

  if (!fs.existsSync(path.dirname(OUTPUT_PATH))) {
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  }
  fs.writeFileSync(OUTPUT_PATH, finalBuffer);

  console.log(`\n✓  Template saved: ${OUTPUT_PATH}`);
  console.log(`   Size: ${(finalBuffer.length / 1024).toFixed(1)} KB  |  Fields: ${coords.length}`);
}

main().catch((err) => {
  console.error('✗ Failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
