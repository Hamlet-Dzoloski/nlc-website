const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const serverRequire = createRequire(path.join(__dirname, '../server.js'));
const sdk = require('@aws-sdk/client-s3');
const { createApplicationUploads } = require('../application-uploads');
const { validateApplication } = require('../application-validation');
const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';

function fixture() {
  const body = { submission_id: crypto.randomUUID(), uploaded_statements: [], signature: SIGNATURE, contact_agreement: 'on', application_agreement: 'on' };
  // Mirror real required fields from the form so the test also catches a
  // frontend/backend required-field mismatch when either is changed.
  const html = fs.readFileSync(path.join(__dirname, '../../apply/index.html'), 'utf8');
  for (const tag of html.matchAll(/<(?:input|select)[^>]*\brequired[^>]*>/g)) {
    const name = tag[0].match(/name="([^"]+)"/)?.[1];
    if (name && body[name] === undefined) body[name] = name.includes('email') ? 'review@example.invalid' : 'Test';
  }
  body.email = 'review@example.invalid'; body.owner_email = body.email;
  body.first_name = 'Same'; body.last_name = 'Name';
  return body;
}

function harness(options = {}) {
  const objects = new Map(), events = [], emails = [], pdfRecords = [];
  let nowStored = false;
  const s3 = { async send(command) {
    const data = command.input;
    if (command instanceof sdk.GetObjectCommand) {
      if (!objects.has(data.Key)) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
      return { Body: { transformToString: async () => objects.get(data.Key), transformToByteArray: async () => Buffer.from(objects.get(data.Key)) } };
    }
    if (command instanceof sdk.PutObjectCommand) {
      if (data.Key.includes('by-id/')) {
        if (options.failInitial && !nowStored) throw new Error('simulated storage failure');
        if (options.failFinal && nowStored) throw new Error('simulated final update failure');
        if (data.IfNoneMatch === '*' && objects.has(data.Key)) throw Object.assign(new Error('exists'), { name: 'PreconditionFailed' });
        nowStored = true; events.push('record');
      }
      if (data.ContentType === 'application/pdf') events.push('pdf-upload');
      objects.set(data.Key, String(data.Body)); return {};
    }
    throw new Error('Unexpected S3 operation ' + command.constructor.name);
  } };
  class FakeS3 { constructor() { return s3; } }
  class FakeSes { async send(command) { events.push('email'); emails.push(command.input); if (options.failEmail) throw new Error('mail unavailable'); return { MessageId: 'local-only' }; } }
  const module = { exports: {} };
  const context = {
    module, exports: module.exports, __dirname: path.join(__dirname, '..'), Buffer, URL, AbortSignal,
    process: { env: { VERCEL: '1', AWS_REGION: 'us-east-2', AWS_SES_REGION: 'us-east-2', AWS_ACCESS_KEY_ID: 'dummy', AWS_SECRET_ACCESS_KEY: 'dummy-only', S3_BUCKET_NAME: 'local-test' }, cwd: () => path.resolve(__dirname, '../..') },
    console: { log() {}, warn() {}, error() {} }, setInterval: () => ({ unref() {} }), setTimeout, clearTimeout,
    fetch: () => { throw new Error('Network forbidden'); },
  };
  context.require = name => {
    if (name === 'dotenv') return { config() {} };
    if (name === '@aws-sdk/client-s3') return { ...sdk, S3Client: FakeS3 };
    if (name === '@aws-sdk/client-sesv2') return { ...serverRequire(name), SESv2Client: FakeSes };
    if (name === 'fs/promises') return { mkdir: async () => {}, writeFile: async () => {}, access: async () => { throw Error('missing'); } };
    if (name === './pdf-template-fill') return {
      generateApplicationPdfFromTemplate: async record => { pdfRecords.push({ ...record }); events.push('pdf'); if (options.failPdf) throw Error('PDF failed'); return Buffer.from('%PDF-local'); },
      generateFillablePdfFromLayout: async () => { throw Error('Fallback failed'); },
    };
    return serverRequire(name);
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8'), context);
  const app = module.exports;
  async function apply(body) {
    const handler = app._router.stack.find(layer => layer.route?.path === '/api/apply').route.stack.at(-1).handle;
    const result = { status: 200 };
    await handler({ body, files: [] }, { status(code) { result.status = code; return this; }, json(data) { result.body = data; return this; } });
    return result;
  }
  return { apply, objects, events, emails, pdfRecords };
}

test('server rejects incomplete fields, unsigned applications and conflicting consent before writing', async () => {
  const h = harness();
  assert.equal((await h.apply({})).status, 400);
  assert.equal((await h.apply({ ...fixture(), signature: '' })).status, 400);
  assert.equal((await h.apply({ ...fixture(), application_agreement: ['No', 'on'] })).status, 400);
  assert.equal(h.objects.size, 0); assert.equal(h.emails.length, 0);
  assert.equal(validateApplication(fixture()), null);
});

test('initial S3 failure never generates a PDF, sends mail or returns success', async () => {
  const h = harness({ failInitial: true });
  const result = await h.apply(fixture());
  assert.equal(result.status, 503); assert.equal(result.body.ok, false);
  assert.equal(h.pdfRecords.length, 0); assert.equal(h.emails.length, 0);
});

test('application is durable before processing; duplicates are idempotent and filenames are unique', async () => {
  const h = harness(), body = fixture();
  const result = await h.apply(body);
  assert.equal(result.status, 200); assert.equal(result.body.durable, true);
  assert.equal(result.body.processingStatus, 'complete');
  assert.ok(h.events.indexOf('record') < h.events.indexOf('pdf'));
  assert.ok(h.events.indexOf('record') < h.events.indexOf('email'));
  assert.equal(h.emails.length, 2, 'admin and applicant mail are both awaited');
  assert.ok(h.emails[0].Content.Raw.Data, 'SES v2 raw MIME shape');
  assert.ok(h.emails[1].Content.Simple, 'SES v2 simple message shape');
  const priorEvents = h.events.length;
  assert.equal((await h.apply(body)).body.id, result.body.id);
  assert.equal(h.events.length, priorEvents, 'retry performs no side effects');
  assert.equal((await h.apply({ ...body, loan_amount: 'Changed' })).status, 409);
  const second = await h.apply({ ...body, submission_id: crypto.randomUUID() });
  assert.equal(second.status, 200);
  const pdfKeys = [...h.objects.keys()].filter(key => key.endsWith('.pdf'));
  assert.equal(new Set(pdfKeys).size, 2, 'same name/date applications use different PDF keys');
  assert.ok(pdfKeys.some(key => key.includes(body.submission_id)));
});

test('concurrent retries accept one record and send only one pair of emails', async () => {
  const h = harness(), body = fixture();
  const results = await Promise.all([h.apply(body), h.apply(body)]);
  assert.ok(results.every(result => result.status === 200));
  assert.equal(h.pdfRecords.length, 1); assert.equal(h.emails.length, 2);
});

test('PDF/email/final-status failures retain a durable record and accurately flag follow-up', async () => {
  for (const options of [{ failPdf: true }, { failEmail: true }, { failFinal: true }]) {
    const h = harness(options), body = fixture(), result = await h.apply(body);
    assert.equal(result.status, 200); assert.equal(result.body.durable, true);
    assert.equal(result.body.processingStatus, 'attention_required');
    const record = JSON.parse(h.objects.get(`applications/records/by-id/${body.submission_id}.json`));
    assert.equal(record.signature, body.signature);
    assert.ok(record.pdfRetryRequired || record.emailRetryRequired || record.processingStatus === 'attention_required');
  }
});

test('private direct uploads enforce file size/type, bind receipts and reject changed or non-PDF objects', async () => {
  const applicationId = crypto.randomUUID(), operations = [], policies = [];
  let wrongSize = false, nonPdf = false, changed = false;
  const s3 = { async send(command) {
    operations.push(command);
    if (command instanceof sdk.HeadObjectCommand) return { ContentLength: wrongSize ? 99 : 100, ContentType: 'application/pdf', ETag: 'verified-etag', Metadata: { 'application-id': applicationId } };
    if (command instanceof sdk.GetObjectCommand) return { Body: { transformToByteArray: async () => Buffer.from(nonPdf ? 'not a PDF' : '%PDF-1.7') } };
    if (command instanceof sdk.CopyObjectCommand) { assert.equal(command.input.CopySourceIfMatch, 'verified-etag'); if (changed) throw Error('Precondition failed'); return {}; }
    throw Error('Unexpected command');
  } };
  const uploads = createApplicationUploads({ s3, bucket: 'private-test', prefix: 'applications/uploads/', secret: 'local-secret', presign: async (_, params) => { policies.push(params); return { url: 'https://private-test.s3.test', fields: { key: params.Key } }; } });
  const [signed] = await uploads.prepare(applicationId, [{ name: 'statement.pdf', size: 100, type: 'application/pdf' }]);
  assert.ok(policies[0].Conditions.some(condition => JSON.stringify(condition) === JSON.stringify(['content-length-range', 100, 100])));
  assert.equal(policies[0].Expires, 900);
  assert.equal(policies[0].Fields.acl, undefined, 'does not grant public access');
  const firstFinal = (await uploads.resolve(applicationId, [signed.receipt]))[0].s3Key;
  const secondFinal = (await uploads.resolve(applicationId, [signed.receipt]))[0].s3Key;
  assert.equal(firstFinal.includes('/staging/'), false);
  assert.notEqual(firstFinal, secondFinal, 'racing finalizations cannot overwrite an accepted statement');
  await assert.rejects(() => uploads.resolve(crypto.randomUUID(), [signed.receipt]), /another application/);
  await assert.rejects(() => uploads.resolve(applicationId, [signed.receipt + 'x']), /Invalid/);
  await assert.rejects(() => uploads.resolve(applicationId, [signed.receipt, signed.receipt]), /twice/);
  wrongSize = true; await assert.rejects(() => uploads.resolve(applicationId, [signed.receipt]), /incomplete/); wrongSize = false;
  nonPdf = true; await assert.rejects(() => uploads.resolve(applicationId, [signed.receipt]), /not a readable PDF/); nonPdf = false;
  changed = true; await assert.rejects(() => uploads.resolve(applicationId, [signed.receipt]), /Precondition/);
  await assert.rejects(() => uploads.prepare(applicationId, [{ name: 'file.exe', size: 100 }]), /PDF/);
  await assert.rejects(() => uploads.prepare(applicationId, [{ name: 'file.pdf', size: 81 * 1024 * 1024 }]), /80MB/);
});

test('installed AWS SDK creates the expected signed POST policy without network access', async () => {
  const s3 = new sdk.S3Client({ region: 'us-east-2', credentials: { accessKeyId: 'TESTONLY', secretAccessKey: 'local-test-only' } });
  try {
    const uploads = createApplicationUploads({ s3, bucket: 'nolimitcap-local-test', prefix: 'applications/uploads/', secret: 'test-only' });
    const [signed] = await uploads.prepare(crypto.randomUUID(), [{ name: 'statement.pdf', size: 6 * 1024 * 1024, type: 'application/pdf' }]);
    const policy = JSON.parse(Buffer.from(signed.fields.Policy, 'base64').toString());
    assert.ok(signed.url.startsWith('https://nolimitcap-local-test.s3.us-east-2.amazonaws.com'));
    assert.ok(policy.conditions.some(condition => condition[0] === 'content-length-range' && condition[1] === 6 * 1024 * 1024 && condition[2] === 6 * 1024 * 1024));
    assert.ok(signed.fields['X-Amz-Signature']);
  } finally { s3.destroy(); }
});
