'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_LOGO_PATH = path.join(__dirname, '..', 'assets', 'images', 'logonlc.png');

/** Read PNG width/height from buffer (bytes 16–23). */
function getPngDimensions(buffer) {
  if (!buffer || buffer.length < 24) return { width: 1, height: 1 };
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function loadLogoAspectRatio(logoPath = DEFAULT_LOGO_PATH) {
  try {
    const { width, height } = getPngDimensions(fs.readFileSync(logoPath));
    if (!width || !height) return 1;
    return width / height;
  } catch {
    return 1;
  }
}

/**
 * Single source of truth for raster logo header sizing (pdfkit + field coords).
 */
function getRasterLogoHeaderLayout(pageWidth, margin, logoScale, logoAspect) {
  const availableWidth = pageWidth - margin * 2;
  // ~52px at default scale — full logonlc.png visible without crowding the form
  const maxHeight = Math.max(42, Math.round(70 * logoScale));
  const maxWidth = Math.min(availableWidth - 10, Math.round(90 * logoScale));

  let logoW;
  let logoH;

  if (logoAspect >= 1) {
    logoH = maxHeight;
    logoW = Math.round(logoH * logoAspect);
    if (logoW > maxWidth) {
      logoW = maxWidth;
      logoH = Math.round(logoW / logoAspect);
    }
  } else {
    logoW = maxWidth;
    logoH = Math.round(logoW / logoAspect);
    if (logoH > maxHeight) {
      logoH = maxHeight;
      logoW = Math.round(logoH * logoAspect);
    }
  }

  const logoX = Math.round((pageWidth - logoW) / 2);
  const logoY = margin - 3;
  const dividerY = logoY + logoH + 6;
  const headerBottom = dividerY + 7;

  return { logoW, logoH, logoX, logoY, dividerY, headerBottom };
}

module.exports = {
  DEFAULT_LOGO_PATH,
  getPngDimensions,
  loadLogoAspectRatio,
  getRasterLogoHeaderLayout,
};
