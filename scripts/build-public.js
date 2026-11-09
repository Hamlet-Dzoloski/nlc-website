'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const files = [
  'index.html', 'about.html', 'business.html', 'products.html', 'partner.html',
  'contact.html', 'careers.html', 'privacy.html', 'apply/index.html',
  'robots.txt', 'sitemap.xml', 'assets/css/style.css', 'assets/js/config.js',
  'assets/js/main.js', 'assets/images/logonlc.png', 'assets/images/favicon.png',
  'assets/video/skyline-optimized.mp4', 'assets/video/skyline-poster.webp',
];

async function build() {
  // Only this generated build directory may be replaced. Refuse symlinks so a
  // build can never erase an unrelated directory or copy private files through one.
  if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Invalid build directory');
  const existing = await fs.lstat(output).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (existing?.isSymbolicLink()) throw new Error('Build directory must not be a symlink');
  if (existing) await fs.rm(output, { recursive: true });
  for (const relative of files) {
    const parts = relative.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const stat = await fs.lstat(path.join(root, ...parts.slice(0, i)));
      if (stat.isSymbolicLink()) throw new Error(`Public source must not be a symlink: ${relative}`);
    }
    const destination = path.join(output, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(path.join(root, relative), destination);
  }
  console.log(`Built ${files.length} allowlisted public files in dist. No server records, templates, internal docs, tests, or original videos are public.`);
}

if (require.main === module) build().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { build, files };
