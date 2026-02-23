const fs = require('fs/promises');
const path = require('path');
const { generateApplicationPdfBuffer } = require('./pdf-layout');

const OUTPUT_PATH = path.join(__dirname, 'pdf-templates', 'nolimitcap-empty-application.pdf');

async function createEmptyTemplateFromRenderer() {
  const emptyRecord = {};
  const buffer = await generateApplicationPdfBuffer(emptyRecord, {
    companyName: 'No Limit Capital',
    margin: 24,
    logoPath: path.join(__dirname, '..', 'assets', 'images', 'logo.png'),
    headerScale: 0.75,
    emptyFields: true,
  });

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, buffer);
}

createEmptyTemplateFromRenderer()
  .then(() => {
    console.log(`No Limit Capital empty template created: ${OUTPUT_PATH}`);
  })
  .catch((error) => {
    console.error('Failed to create template:', error.message);
    process.exit(1);
  });
