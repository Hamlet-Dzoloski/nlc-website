const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { build, files } = require('./build-public');
const root = path.resolve(__dirname, '..');
const pages = ['index.html', 'about.html', 'business.html', 'products.html', 'partner.html', 'contact.html', 'careers.html', 'privacy.html', 'apply/'];
const mime = file => file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.mp4') ? 'video/mp4' : file.endsWith('.webp') ? 'image/webp' : file.endsWith('.png') ? 'image/png' : file.endsWith('.xml') ? 'application/xml' : 'text/plain';

(async () => {
  await build();
  assert.ok(files.every(file => !/^(server|output|docs|node_modules)\//.test(file)));
  const libraryResponse = await fetch('https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js', { signal: AbortSignal.timeout(10000) });
  assert.equal(libraryResponse.status, 200);
  const library = await libraryResponse.text();
  const axe = await fs.readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const issues = [], errors = [], requests = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url()); requests.push(url.href);
      if (req.method() !== 'GET') throw new Error('No form submissions are allowed in this check');
      if (url.href.includes('signature_pad@4.1.7')) return route.fulfill({ body: library, contentType: 'text/javascript' });
      if (url.hostname !== '127.0.0.1') return route.abort();
      const relative = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
      const file = path.join(root, 'dist', relative);
      try { return route.fulfill({ body: await fs.readFile(file), contentType: mime(file) }); }
      catch { return route.fulfill({ status: 404 }); }
    });
    async function audit(label) {
      await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
      await page.addScriptTag({ content: axe });
      const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
      if (violations.length) issues.push({ page: label, violations });
    }
    const canonicals = new Set();
    for (const name of pages) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('http://127.0.0.1:4173/' + name);
      const seo = await page.evaluate(() => ({
        description: document.querySelector('meta[name="description"]')?.content,
        canonical: document.querySelector('link[rel="canonical"]')?.href,
        og: document.querySelector('meta[property="og:url"]')?.content,
        shareImage: document.querySelector('meta[property="og:image"]')?.content,
        h1: document.querySelectorAll('h1').length,
        unlabeled: Array.from(document.querySelectorAll('input:not([type="hidden"]),select,textarea')).filter(input => !input.labels?.length && !input.getAttribute('aria-label')).map(input => input.name),
      }));
      assert.ok(seo.description?.length >= 80 && seo.description.length <= 180, name + ' has a useful description');
      assert.ok(seo.canonical.startsWith('https://www.nolimitcap.net/'));
      assert.equal(seo.canonical, seo.og); assert.ok(seo.shareImage.startsWith('https://'));
      assert.equal(seo.h1, 1); assert.deepEqual(seo.unlabeled, []); canonicals.add(seo.canonical);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'main-content');
      await audit(name);
      for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: 844 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ' fits ' + width);
      }
      if (name === 'apply/') {
        for (const step of [1, 2, 3, 4]) {
          await page.locator(`[data-step-jump="${step}"]`).click();
          await audit('apply step ' + step);
        }
      }
    }
    assert.equal(canonicals.size, 9);
    await page.locator('[data-step-jump="0"]').click();
    const trigger = page.locator('[data-open-modal]');
    await trigger.click();
    assert.equal(await page.locator('[role="dialog"]').evaluate(dialog => dialog === document.activeElement), true);
    assert.equal(await page.locator('main').evaluate(main => main.inert), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.closest('[role="dialog"]') !== null), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('[data-close-modal]').evaluate(button => button === document.activeElement), true);
    await audit('privacy dialog');
    await page.keyboard.press('Escape');
    assert.equal(await trigger.evaluate(link => link === document.activeElement), true);
    assert.equal(await page.locator('main').evaluate(main => main.inert), false);
    await fs.mkdir(path.join(root, 'output/playwright'), { recursive: true });
    await page.goto('http://127.0.0.1:4173/contact.html');
    await page.screenshot({ path: path.join(root, 'output/playwright/contact-accessible-mobile.png'), fullPage: true });
    for (const scenario of [{ width: 390, motion: 'no-preference' }, { width: 1440, motion: 'reduce' }]) {
      await page.setViewportSize({ width: scenario.width, height: 900 });
      await page.emulateMedia({ reducedMotion: scenario.motion });
      requests.length = 0;
      await page.goto('http://127.0.0.1:4173/'); await page.waitForTimeout(1000);
      assert.equal(requests.some(url => url.endsWith('.mp4')), false, 'no background video request on mobile or reduced motion');
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('http://127.0.0.1:4173/');
    await page.waitForFunction(() => document.querySelector('video').hasAttribute('src'));
    await page.locator('[data-video-toggle]').click();
    assert.equal(await page.locator('video').evaluate(video => video.paused), true);
    await page.goto('http://127.0.0.1:4173/sitemap.xml');
    const sitemap = await fs.readFile(path.join(root, 'dist/sitemap.xml'), 'utf8');
    for (const canonical of canonicals) assert.ok(sitemap.includes('<loc>' + canonical + '</loc>'));
    assert.deepEqual(errors, []);
    if (issues.length) { console.error(JSON.stringify(issues, null, 2)); throw Error('Accessibility issues need correction'); }
    console.log('PASS: all 9 pages have metadata, unique canonicals, labels, skip links, and no detected WCAG A/AA axe violations; all application steps and the privacy dialog checked.');
    console.log('PASS: 320/390/768px layouts, modal focus trap/restore, mobile and reduced-motion video suppression, desktop pause control, sitemap, and public-file allowlist.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
