'use strict';

const crypto = require('crypto');
const { createPresignedPost } = require('@aws-sdk/s3-presigned-post');
const { HeadObjectCommand, GetObjectCommand, CopyObjectCommand } = require('@aws-sdk/client-s3');

const MAX_FILES = 10;
const MAX_FILE_BYTES = 80 * 1024 * 1024;
const validId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const uploadError = message => Object.assign(new Error(message), { status: 400 });

function createApplicationUploads({ s3, bucket, prefix, secret, presign = createPresignedPost }) {
  const mac = text => crypto.createHmac('sha256', secret).update('application-upload-v1:' + text).digest();
  const available = () => {
    if (!s3 || !bucket || !secret) throw Object.assign(new Error('Statement uploads are temporarily unavailable. Please try again shortly.'), { status: 503 });
  };
  function encode(data) {
    const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
    return payload + '.' + mac(payload).toString('base64url');
  }
  function decode(receipt, applicationId) {
    available();
    if (typeof receipt !== 'string' || receipt.length > 4096) throw uploadError('Invalid statement upload receipt. Please select your PDFs again.');
    const [payload, signature, extra] = receipt.split('.');
    const supplied = Buffer.from(signature || '', 'base64url'), expected = mac(payload || '');
    if (extra || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) throw uploadError('Invalid statement upload receipt.');
    let data;
    try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw uploadError('Invalid statement upload receipt.'); }
    if (data.applicationId !== applicationId || data.expires < Date.now() || !data.key.startsWith(`${prefix}staging/${applicationId}/`)) throw uploadError('Statement upload expired or belongs to another application. Please select your PDFs again.');
    return data;
  }
  async function prepare(applicationId, files) {
    available();
    if (!validId(applicationId) || !Array.isArray(files) || !files.length || files.length > MAX_FILES) throw uploadError('Select between 1 and 10 PDF statements.');
    const uploads = [];
    for (const file of files) {
      if (typeof file.name !== 'string' || file.name.length > 240 || !/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf') || !Number.isSafeInteger(file.size) || file.size < 5 || file.size > MAX_FILE_BYTES) throw uploadError('Each statement must be a PDF of 80MB or smaller.');
      const key = `${prefix}staging/${applicationId}/${crypto.randomUUID()}.pdf`;
      const name = file.name.replace(/[\r\n\\/"<>]/g, '_');
      const data = { applicationId, key, name, size: file.size, expires: Date.now() + 24 * 60 * 60 * 1000 };
      const fields = { 'Content-Type': 'application/pdf', 'x-amz-meta-application-id': applicationId, success_action_status: '204' };
      const signed = await presign(s3, {
        Bucket: bucket, Key: key, Expires: 900, Fields: fields,
        Conditions: [['content-length-range', file.size, file.size], ...Object.entries(fields).map(([field, value]) => ['eq', '$' + field, value])],
      });
      uploads.push({ ...signed, receipt: encode(data) });
    }
    return uploads;
  }
  async function resolve(applicationId, receipts = []) {
    if (!Array.isArray(receipts) || receipts.length > MAX_FILES) throw uploadError('Up to 10 statements are allowed.');
    if (receipts.length === 0) return [];
    const seen = new Set(), files = [];
    for (const receipt of receipts) {
      const data = decode(receipt, applicationId);
      if (seen.has(data.key)) throw uploadError('The same statement was included twice.');
      seen.add(data.key);
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: data.key }));
      if (head.ContentLength !== data.size || head.ContentType !== 'application/pdf' || head.Metadata?.['application-id'] !== applicationId || !head.ETag) throw uploadError('A statement upload is incomplete. Please select your PDFs again.');
      const sample = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: data.key, Range: 'bytes=0-1023', IfMatch: head.ETag }));
      const bytes = Buffer.from(await sample.Body.transformToByteArray());
      if (!bytes.includes(Buffer.from('%PDF-'))) throw uploadError(`${data.name} is not a readable PDF file.`);
      // Copy to a private final key which the browser's upload permission cannot
      // overwrite. If the staging object changes during verification, fail closed.
      // Each finalization gets a new key: even two racing requests can never
      // replace the object referenced by the already accepted application.
      const finalKey = `${prefix}${applicationId}/${crypto.randomUUID()}.pdf`;
      await s3.send(new CopyObjectCommand({
        Bucket: bucket, Key: finalKey,
        CopySource: `${bucket}/${data.key.split('/').map(encodeURIComponent).join('/')}`,
        CopySourceIfMatch: head.ETag,
      }));
      files.push({ originalname: data.name, size: data.size, mimetype: 'application/pdf', s3Key: finalKey });
    }
    return files;
  }
  return { prepare, resolve };
}

module.exports = { createApplicationUploads, validId, MAX_FILES, MAX_FILE_BYTES };
