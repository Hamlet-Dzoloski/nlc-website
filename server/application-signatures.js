'use strict';

const { PDFDocument } = require('pdf-lib');

// Validate before any upload, PDF generation, storage, or email side effects.
async function validateApplicationSignatures(body) {
  for (const [field, label, required] of [
    ['signature', 'Owner #1', true],
    ['signature_additional', 'Owner #2', false],
  ]) {
    const value = body[field];
    if (!value && !required) continue;
    if (!value) return `${label}: please provide a signature.`;
    const match = typeof value === 'string' && value.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match || match[2].length > 3 * 1024 * 1024) return `${label}: please draw or upload a valid signature image.`;
    try {
      const bytes = Buffer.from(match[2], 'base64');
      if (bytes.toString('base64') !== match[2]) throw new Error('Invalid encoding');
      const doc = await PDFDocument.create();
      const image = match[1] === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      if (!image.width || !image.height) throw new Error('Empty image');
    } catch {
      return `${label}: the signature image could not be read. Please sign again.`;
    }
  }
  return null;
}

module.exports = { validateApplicationSignatures };
