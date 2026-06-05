'use strict';

const { PDFName, PDFNumber } = require('pdf-lib');

const SIGNATURE_FIELD_NAMES = new Set(['signature', 'signature_additional']);

function isSignatureField(name) {
  return SIGNATURE_FIELD_NAMES.has(name);
}

function clearFieldHighlights(pdfDoc, form) {
  const white = pdfDoc.context.obj([PDFNumber.of(1)]);
  form.getFields().forEach((f) => {
    if (isSignatureField(f.getName())) return;
    f.acroField.getWidgets().forEach((w) => {
      try {
        const mk = w.getOrCreateMK();
        mk.set(PDFName.of('BG'), white);
        mk.delete(PDFName.of('BC'));
      } catch (_) {}
    });
  });
}

function stripWidgetAppearance(widget) {
  try {
    widget.dict.delete(PDFName.of('AP'));
  } catch (_) {}
}

function updateNonSignatureAppearances(form, font) {
  form.getFields().forEach((field) => {
    if (isSignatureField(field.getName())) return;
    try {
      if (typeof field.defaultUpdateAppearances === 'function') {
        field.defaultUpdateAppearances(font);
      }
    } catch (_) {}
  });
}

/**
 * Signature widgets must stay in the form tree (Acrobat save) but without opaque AP/BG.
 * Do not call setText() here — that marks the field dirty and pdf-lib save rebuilds
 * white appearance streams that cover the embedded signature image.
 */
function clearSignatureFieldOverlay(tf, { readOnly = true } = {}) {
  try {
    tf.acroField.dict.delete(PDFName.of('AP'));
  } catch (_) {}
  tf.acroField.getWidgets().forEach((w) => {
    stripWidgetAppearance(w);
    try {
      const mk = w.getOrCreateMK();
      mk.delete(PDFName.of('BG'));
      mk.delete(PDFName.of('BC'));
    } catch (_) {}
  });
  if (readOnly && typeof tf.enableReadOnly === 'function') {
    tf.enableReadOnly();
  }
  if (typeof tf.markAsClean === 'function') {
    tf.markAsClean();
  }
}

function finalizeSignatureFields(form) {
  SIGNATURE_FIELD_NAMES.forEach((name) => {
    try {
      clearSignatureFieldOverlay(form.getTextField(name));
    } catch (_) {}
  });
}

/** pdf-lib save defaults rebuild all field AP streams (covers signature images + breaks Acrobat). */
const ACROBAT_SAFE_SAVE_OPTIONS = {
  useObjectStreams: false,
  updateFieldAppearances: false,
};

module.exports = {
  SIGNATURE_FIELD_NAMES,
  isSignatureField,
  clearFieldHighlights,
  updateNonSignatureAppearances,
  clearSignatureFieldOverlay,
  finalizeSignatureFields,
  ACROBAT_SAFE_SAVE_OPTIONS,
};
