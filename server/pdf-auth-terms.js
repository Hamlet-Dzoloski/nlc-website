'use strict';

const PDFDocument = require('pdfkit');

const AUTHORIZATION_TEXT =
  'By signing below, the Business and Owner(s) identified above (individually, an "Applicant") each represents, acknowledges, and agrees that: ' +
  "(1) all information and documents provided in connection with this application are true, accurate, and complete; " +
  '(2) Applicant will immediately notify Biz Bulker Inc dba No Limit Capital ("No Limit Capital") of any change in the Business financial condition; ' +
  '(3) Applicant understands that No Limit Capital may share this information with its representatives, successors, assigns, affiliates and partners as well as third-party lenders/funders and their servicers and financial institutions ("Recipients"); ' +
  "(4) Applicant authorizes No Limit Capital and Recipients to request and receive any investigative reports, consumer credit reports, trade references, statements from creditors or financial institutions, verifications of information, or any other information that No Limit Capital and/or Recipients deem necessary; " +
  "(5) Applicant waives and releases any claims against No Limit Capital, Recipients and any information-providers arising from any act or omission relating to the requesting, receiving, or release of information; " +
  "(6) each Owner of the Business represents that he or she is authorized to sign and submit this application on behalf of Business.";

/** Matches drawAuthorizationTerms() return delta from section content start. */
function measureAuthorizationTermsAdvance(config, contentWidth) {
  const doc = new PDFDocument({ size: 'LETTER', margin: 24 });
  const inset = 5;
  const textWidth = Math.max(20, contentWidth - inset * 2);
  const maxHeight = config.authorizationTextHeight;
  let paragraphFontSize = config.authorizationFontSize;
  const textOptions = {
    width: textWidth,
    align: 'left',
    lineGap: 0.55,
  };

  doc.font('Helvetica');
  while (paragraphFontSize > config.authorizationMinFontSize) {
    doc.fontSize(paragraphFontSize);
    if (doc.heightOfString(AUTHORIZATION_TEXT, textOptions) <= maxHeight) {
      break;
    }
    paragraphFontSize -= 0.2;
  }

  doc.fontSize(paragraphFontSize);
  const requiredHeight = doc.heightOfString(AUTHORIZATION_TEXT, textOptions);

  return (
    config.authorizationLabelGap +
    Math.min(requiredHeight, maxHeight) +
    config.authorizationAfterTermsGap
  );
}

module.exports = { AUTHORIZATION_TEXT, measureAuthorizationTermsAdvance };
