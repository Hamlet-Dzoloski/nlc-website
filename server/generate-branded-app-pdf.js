/**
 * Generates a branded "No Limit Capital" version of the application PDF.
 * Outputs to: example-pdfs/APP-NLC.pdf  (same location/name format as APP.pdf)
 * and also regenerates the empty template in pdf-templates/
 */
const fs = require('fs/promises');
const path = require('path');
const { generateApplicationPdfBuffer } = require('./pdf-layout');

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'images', 'logo.png');
const COMPANY   = 'No Limit Capital';
const MARGIN    = 24;
const SCALE     = 0.75;

async function generate() {
  // 1. Empty blank application (matching APP.pdf structure) → example-pdfs/APP-NLC.pdf
  const blankBuffer = await generateApplicationPdfBuffer({}, {
    companyName:  COMPANY,
    margin:       MARGIN,
    logoPath:     LOGO_PATH,
    headerScale:  SCALE,
    emptyFields:  true,
  });

  const examplesDir = path.join(__dirname, 'example-pdfs');
  await fs.mkdir(examplesDir, { recursive: true });
  await fs.writeFile(path.join(examplesDir, 'APP-NLC.pdf'), blankBuffer);
  console.log('✓  example-pdfs/APP-NLC.pdf');

  // 2. Same blank → pdf-templates/ (the server uses this as the base for filling)
  const templatesDir = path.join(__dirname, 'pdf-templates');
  await fs.mkdir(templatesDir, { recursive: true });
  await fs.writeFile(path.join(templatesDir, 'nolimitcap-empty-application.pdf'), blankBuffer);
  console.log('✓  pdf-templates/nolimitcap-empty-application.pdf');

  console.log('\nDone — No Limit Capital PDFs generated.');
}

generate().catch(e => { console.error(e.message); process.exit(1); });
