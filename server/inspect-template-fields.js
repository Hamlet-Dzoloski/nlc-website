const fs = require('fs/promises');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const DEFAULT_TEMPLATE_PATH = path.join(__dirname, 'pdf-templates', 'nolimitcap-empty-application.pdf');

async function main() {
  const inputPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : DEFAULT_TEMPLATE_PATH;

  try {
    await fs.access(inputPath);
  } catch (error) {
    console.error(`Template not found: ${inputPath}`);
    process.exit(1);
  }

  const bytes = await fs.readFile(inputPath);
  const pdfDoc = await PDFDocument.load(bytes);

  let fields = [];
  try {
    fields = pdfDoc.getForm().getFields();
  } catch (error) {
    console.error(`Template is not fillable (AcroForm missing): ${inputPath}`);
    process.exit(1);
  }

  console.log(`Template: ${inputPath}`);
  console.log(`Field count: ${fields.length}`);

  fields.forEach((field) => {
    const fieldName = field.getName();
    const fieldType = field.constructor.name.replace(/^PDF/, '');
    console.log(`${fieldName} | ${fieldType}`);
  });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
