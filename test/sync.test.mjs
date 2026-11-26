// Offline test for scripts/figma-sync.mjs: fakes a Figma REST document shaped like the plugin's output,
// applies edits, runs the sync in a temp copy of the repo and checks site.json.
import fs from 'fs'; import os from 'os'; import path from 'path'; import { execFileSync } from 'child_process';
import { createRequire } from 'module'; import sharp from 'sharp';
const require = createRequire(import.meta.url);
const RichText = require('../src/richtext.cjs');
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-test-'));
for (const d of ['content', 'src', 'scripts']) fs.cpSync(path.join(repo, d), path.join(tmp, d), { recursive: true });
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(tmp, 'node_modules'));
fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');
const site = JSON.parse(fs.readFileSync(path.join(tmp, 'content/site.json'), 'utf8'));
const theme = JSON.parse(fs.readFileSync(path.join(tmp, 'src/theme.json'), 'utf8'));
const g = theme.grid, container = Math.min(g.maxWidth, g.frameWidth - 2 * g.gutter), colW = (container - g.gap * 23) / 24, rowH = container * g.rowScale;
const X = l => l <= 1 ? 0 : g.gutter + (l - 2) * (colW + g.gap);
const box = (area, pt) => { const [r1, c1, r2, c2] = area.split('/').map(Number); const x = X(c1); const right = c2 >= 27 ? 1440 : X(c2) - g.gap; return { x, y: pt + (r1 - 1) * (rowH + g.gap), width: right - x, height: (r2 - r1) * (rowH + g.gap) - g.gap }; };
const hexToRgb = h => { const n = parseInt(h.slice(1), 16); return { r: (n >> 16 & 255) / 255, g: (n >> 8 & 255) / 255, b: (n & 255) / 255, a: 1 }; };

// Build a REST-like text node from html the way the plugin would.
function textNode(b, themeName) {
  const paras = RichText.htmlToParas(b.html);
  const th = theme.themes[themeName];
  let chars = '', over = [], table = {}, nextId = 1; const ids = {};
  paras.forEach((p, pi) => {
    const ty = theme.type[p.type];
    for (const r of p.runs) {
      const color = r.color ? (r.color[0] === '#' ? r.color : theme.palette[r.color]) : th[/^h/.test(p.type) ? 'h' : p.type];
      const st = { fontFamily: ty.font, fontSize: ty.size, fontWeight: r.bold ? 700 : 600, fills: [{ type: 'SOLID', color: hexToRgb(color) }], ...(r.href ? { hyperlink: { type: 'URL', url: r.href.startsWith('/') ? 'https://le-beaver.github.io/seoyoungkong-art' + r.href : r.href } } : {}) };
      const k = JSON.stringify(st); if (!ids[k]) { ids[k] = nextId++; table[ids[k]] = st; }
      chars += r.text; over.push(...Array(r.text.length).fill(ids[k]));
    }
    if (pi < paras.length - 1) { chars += '\n'; over.push(0); }
  });
  return { type: 'TEXT', characters: chars, characterStyleOverrides: over, styleOverrideTable: table, style: { fontFamily: 'Space Grotesk', fontSize: 18, fontWeight: 600, textAlignHorizontal: (paras.find(p => p.align) || {}).align === 'center' ? 'CENTER' : 'LEFT' }, fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }], lineTypes: paras.map(() => 'NONE') };
}

let nid = 1; const seed = '111';
const pages = [];
for (const page of site.pages) {
  const sections = []; let y = 0;
  page.sections.forEach((sec, si) => {
    const pt = 0; const h = sec.rowsDesktop * (rowH + g.gap);
    const children = sec.blocks.map(b => {
      const bx = box(b.d.area, pt); const abs = { x: bx.x, y: y + bx.y, width: bx.width, height: bx.height };
      const base = { id: `${nid++}:1`, name: b.type, absoluteBoundingBox: abs };
      const data = { kind: 'block', id: b.id, type: b.type, seed, box: JSON.stringify([bx.x, bx.y, bx.width, bx.height]) };
      if (b.type === 'text') { const t = textNode(b, sec.theme); data.chars = t.characters; return { ...base, ...t, sharedPluginData: { sqsite: data } }; }
      if (b.type === 'image') { data.img = 'hash-' + b.id; return { ...base, type: 'RECTANGLE', fills: [{ type: 'IMAGE', imageRef: 'hash-' + b.id }], sharedPluginData: { sqsite: data } }; }
      return { ...base, type: 'FRAME', children: [], sharedPluginData: { sqsite: data } };
    });
    sections.push({ id: `s${nid++}`, type: 'FRAME', absoluteBoundingBox: { x: 0, y, width: 1440, height: h }, sharedPluginData: { sqsite: { kind: 'section', index: String(si), padTop: '0', slug: page.slug } }, children });
    y += h;
  });
  pages.push({ id: `p${nid++}`, type: 'FRAME', sharedPluginData: { sqsite: { kind: 'page', slug: page.slug } }, children: sections });
}
const doc = { version: 'v1', document: { id: '0:0', type: 'DOCUMENT', children: [{ id: '0:1', type: 'CANVAS', children: pages }] } };
const write = (name, d) => { fs.writeFileSync(path.join(tmp, name), JSON.stringify(d)); return path.join(tmp, name); };
const run = (fixture, extra = {}) => execFileSync('node', ['scripts/figma-sync.mjs'], { cwd: tmp, env: { ...process.env, FIGMA_FIXTURE: fixture, FIGMA_IMAGES_FIXTURE: path.join(tmp, 'imgs'), ...extra }, encoding: 'utf8' });
const load = () => JSON.parse(fs.readFileSync(path.join(tmp, 'content/site.json'), 'utf8'));
const results = []; const check = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? ' — ' + info : ''}`); };

// 1) Untouched file -> no changes
const before = fs.readFileSync(path.join(tmp, 'content/site.json'), 'utf8');
let o = run(write('f1.json', doc));
check('untouched Figma file makes no content changes', fs.readFileSync(path.join(tmp, 'content/site.json'), 'utf8') === before, o.trim().split('\n').pop());

// 2) Edits
const about = pages.find(p => pd(p).slug === 'about-me');
function pd(n) { return n.sharedPluginData.sqsite; }
const aboutSec = about.children[0];
const bio = aboutSec.children.find(c => c.type === 'TEXT' && c.characters.startsWith('My name is'));
bio.characters = bio.characters.replace('I love anything art.', 'I love anything art and design.');
bio.characterStyleOverrides = Array(bio.characters.length).fill(bio.characterStyleOverrides[0]);
const photo = aboutSec.children.find(c => c.type === 'RECTANGLE');
photo.fills = [{ type: 'IMAGE', imageRef: 'newphoto123' }];
fs.mkdirSync(path.join(tmp, 'imgs'), { recursive: true });
await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#3366ff' } }).png().toFile(path.join(tmp, 'imgs/newphoto123.png'));
await sharp({ create: { width: 600, height: 600, channels: 3, background: '#ff6633' } }).png().toFile(path.join(tmp, 'imgs/brandnew456.png'));
const home = pages.find(p => pd(p).slug === '').children[0];
const shape = home.children.find(c => pd(c).type === 'shape');
shape.absoluteBoundingBox = { ...shape.absoluteBoundingBox, x: shape.absoluteBoundingBox.x + 150 };
const art = pages.find(p => pd(p).slug === 'art').children[1];
const removed = art.children.splice(art.children.findIndex(c => c.type === 'RECTANGLE'), 1)[0];
art.children.push({ id: '999:9', name: 'my new painting', type: 'RECTANGLE', fills: [{ type: 'IMAGE', imageRef: 'brandnew456' }], absoluteBoundingBox: { x: 100, y: art.absoluteBoundingBox.y + 400, width: 500, height: 500 } });
art.children.push({ id: '999:10', name: 'caption', ...textNode({ html: '<p>Hello from Figma</p>' }, 'white'), absoluteBoundingBox: { x: 700, y: art.absoluteBoundingBox.y + 400, width: 400, height: 30 } });
doc.version = 'v2';
o = run(write('f2.json', doc));
console.log(o.split('\n').filter(l => l.startsWith('•')).join('\n'));
const s2 = load();
const p2 = s2.pages.find(p => p.slug === 'about-me').sections[0];
check('text edit lands in html', p2.blocks.some(b => b.type === 'text' && /anything art and design\./.test(b.html)));
const img2 = p2.blocks.find(b => b.id === pd(photo).id);
check('image swap writes new media file', img2.src.includes('newphoto') && fs.existsSync(path.join(tmp, 'public', img2.src)), img2.src);
const sh2 = s2.pages[0].sections[0].blocks.find(b => b.id === pd(shape).id);
const shOld = site.pages[0].sections[0].blocks.find(b => b.id === pd(shape).id);
check('moving a layer changes desktop grid area only', sh2.d.area !== shOld.d.area && sh2.m.area === shOld.m.area, `${shOld.d.area} -> ${sh2.d.area}`);
const art2 = s2.pages.find(p => p.slug === 'art').sections[1];
check('deleting a layer removes the block', !art2.blocks.some(b => b.id === pd(removed).id));
check('new image layer becomes an image block', art2.blocks.some(b => b.id === 'fig9999' && b.type === 'image'));
check('new text layer becomes a text block', art2.blocks.some(b => b.id === 'fig99910' && /Hello from Figma/.test(b.html)));
const untouched = s2.pages.find(p => p.slug === 'ad-work');
check('other pages untouched', JSON.stringify(untouched) === JSON.stringify(site.pages.find(p => p.slug === 'ad-work')));

// 3) Re-running with no further edits is a no-op
const after2 = fs.readFileSync(path.join(tmp, 'content/site.json'), 'utf8');
doc.version = 'v3'; run(write('f3.json', doc));
check('second sync with same Figma content is a no-op', fs.readFileSync(path.join(tmp, 'content/site.json'), 'utf8') === after2);

// 4) Safety: wiping a page in Figma does not wipe the site
const adw = pages.find(p => pd(p).slug === 'ad-work'); adw.children.forEach(s => (s.children = [])); doc.version = 'v4';
o = run(write('f4.json', doc));
check('mass deletion is refused', load().pages.find(p => p.slug === 'ad-work').sections.reduce((n, s) => n + s.blocks.length, 0) > 50, o.match(/⚠.*/)?.[0] || '');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(results.every(Boolean) ? '\nALL PASS' : '\nSOME FAILED'); process.exit(results.every(Boolean) ? 0 : 1);
