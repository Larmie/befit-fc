// Exports the PNG icons from the SVG masters (icons/icon-master.svg and icons/favicon.svg) with headless Chrome.
//   node tests/tools/icons.js
// Writes into icons/:
//   apple-touch-icon.png 180 · icon-192.png · icon-512.png     the master as it is (full-bleed square; the phone rounds the corners)
//   maskable-512.png      same background, mark at 80% around the centre (stays inside Android's safe circle)
//   mono-512.png          white mark on transparent (Android 13+ themed icons), mark at 80%, ball panels cut out
//   favicon-32.png        the favicon cut (icons/favicon.svg)
// Chrome: the usual place, or CHROME_PATH=<exe> (same as the browser tests). Nothing here touches the network or the database.
'use strict';
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const P = require('../paths.js');

const ICONS = path.join(P.REPO, 'icons');
const master = fs.readFileSync(path.join(ICONS, 'icon-master.svg'), 'utf8');
const favicon = fs.readFileSync(path.join(ICONS, 'favicon.svg'), 'utf8');
const SCALE80 = 'translate(50 50) scale(.8) translate(-50 -50)';

// Put the svg on a page at size x size and screenshot it (transparent outside the artwork).
async function shoot(browser, svg, size, tweak, background) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    const sized = svg.replace(/<svg([^>]*?)>/, (m, a) => '<svg' + a.replace(/\s(width|height)="[^"]*"/g, '') + ` width="${size}" height="${size}">`);
    await page.setContent(`<!doctype html><html><body style="margin:0;background:${background || 'transparent'}">${sized}</body></html>`);
    if (tweak) await page.evaluate(tweak);
    return await page.screenshot({ type: 'png', omitBackground: !background, clip: { x: 0, y: 0, width: size, height: size } });
  } finally { await page.close(); }
}

// White mark on transparent: draw the mark white with black panels on black, then use the brightness as the alpha.
async function mono(browser, size) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    const markOnly = master.replace(/<g id="bg">[\s\S]*?<\/g>\s*(?=<g id="mark")/, '')
      .replace(/<g id="mark"[^>]*>/, `<g id="mark" color="#fff" style="--knock:#000" transform="${SCALE80}">`)
      .replace(/\s(width|height)="1024"/g, '').replace('<svg ', `<svg width="${size}" height="${size}" `);
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#000">${markOnly}</body></html>`);
    const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size } });
    const b64 = await page.evaluate(async (data, n) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
      const c = document.createElement('canvas'); c.width = c.height = n;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, n, n);
      for (let i = 0; i < d.data.length; i += 4) { const a = d.data[i]; d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = a; }
      x.putImageData(d, 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    }, Buffer.from(shot).toString('base64'), size);
    return Buffer.from(b64, 'base64');
  } finally { await page.close(); }
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: P.chrome(), headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });
  try {
    const jobs = [
      ['apple-touch-icon.png', () => shoot(browser, master, 180)],
      ['icon-192.png', () => shoot(browser, master, 192)],
      ['icon-512.png', () => shoot(browser, master, 512)],
      ['maskable-512.png', () => shoot(browser, master, 512, `document.getElementById('mark').setAttribute('transform', ${JSON.stringify(SCALE80)})`)],
      ['mono-512.png', () => mono(browser, 512)],
      ['favicon-32.png', () => shoot(browser, favicon, 32)],
    ];
    for (const [name, make] of jobs) {
      const buf = await make();
      fs.writeFileSync(path.join(ICONS, name), buf);
      console.log('wrote icons/' + name, buf.length + ' bytes');
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
