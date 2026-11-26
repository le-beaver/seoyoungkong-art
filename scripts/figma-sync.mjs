// Pull edits from the Figma file back into content/site.json (+ new images into public/media).
// Env: FIGMA_TOKEN (personal access token, file_content:read), FIGMA_FILE_KEY. Optional FORCE=true, DRY_RUN=true.
// Offline testing: FIGMA_FIXTURE=path/to/file.json (and FIGMA_IMAGES_FIXTURE=dir with <imageRef>.png).
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const RichText = require('../src/richtext.cjs');

const SITE_PATH = 'content/site.json';
const STATE_PATH = 'content/figma-state.json';
const MEDIA = 'public/media';
const NS = 'sqsite';
const { FIGMA_TOKEN, FIGMA_FILE_KEY, FIGMA_FIXTURE, FIGMA_IMAGES_FIXTURE } = process.env;
const FORCE = process.env.FORCE === 'true';
const DRY = process.env.DRY_RUN === 'true';

const site = JSON.parse(fs.readFileSync(SITE_PATH, 'utf8'));
const theme = JSON.parse(fs.readFileSync('src/theme.json', 'utf8'));
const state = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) : { version: null, nodes: {} };
const changes = [];
const out = msg => { changes.push(msg); console.log('•', msg); };

async function figma(pathname) {
  const r = await fetch('https://api.figma.com/v1/' + pathname, { headers: { 'X-Figma-Token': FIGMA_TOKEN } });
  if (!r.ok) throw new Error(`Figma API ${r.status} for ${pathname}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// ---------- grid math (desktop, 1440 frame) ----------
const g = theme.grid;
const container = Math.min(g.maxWidth, g.frameWidth - 2 * g.gutter);
const colW = (container - g.gap * (g.columns - 1)) / g.columns;
const rowH = container * g.rowScale;
const X = line => line <= 1 ? 0 : g.gutter + (line - 2) * (colW + g.gap);
function areaFromBox(b, padTop, keepRowSpan) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  let c1 = b.x <= 2 ? 1 : clamp(Math.round((b.x - g.gutter) / (colW + g.gap)) + 2, 2, 25);
  let c2 = b.x + b.width >= g.frameWidth - 2 ? 27 : clamp(Math.round((b.x + b.width + g.gap - g.gutter) / (colW + g.gap)) + 2, c1 + 1, 26);
  const r1 = Math.max(1, Math.round((b.y - padTop) / (rowH + g.gap)) + 1);
  const span = keepRowSpan || Math.max(1, Math.round((b.height + g.gap) / (rowH + g.gap)));
  return `${r1}/${c1}/${r1 + span}/${c2}`;
}
const parseArea = a => String(a).split('/').map(Number);

// ---------- helpers ----------
const pd = n => (n.sharedPluginData && n.sharedPluginData[NS]) || {};
const toHex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const sig = o => crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 16);
const relBox = (n, frame) => {
  const a = n.absoluteBoundingBox, f = frame.absoluteBoundingBox;
  return { x: a.x - f.x, y: a.y - f.y, width: a.width, height: a.height };
};
const moved = (box, orig, isText) => {
  if (!orig) return false;
  const [x, y, w, h] = orig;
  const d = Math.max(Math.abs(box.x - x), Math.abs(box.y - y), Math.abs(box.width - w), isText ? 0 : Math.abs(box.height - h));
  return d > 3;
};
const imageFillOf = n => (n.fills || []).find(f => f.type === 'IMAGE' && f.visible !== false && f.imageRef);
// Links pointing at the site itself (Figma needs full URLs) go back to site paths.
const SITE_BASES = ['https://le-beaver.github.io/seoyoungkong-art', 'https://www.seoyoungkong.art', 'https://seoyoungkong.art', 'http://localhost:5302'];
const relHref = h => { if (!h) return h; for (const b of SITE_BASES) if (h === b || h.startsWith(b + '/')) return h.slice(b.length) || '/'; return h; };
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'img';

// ---------- text: REST node -> paragraphs ----------
function typeFromStyle(st) {
  const sizes = st.fontFamily === 'Archivo Black' ? ['h1', 'h2', 'h3', 'h4'] : ['large', 'p', 'small'];
  return sizes.reduce((best, k) => Math.abs(theme.type[k].size - st.fontSize) < Math.abs(theme.type[best].size - st.fontSize) ? k : best, sizes[0]);
}
function textToParas(node, themeName, origParas, scaled) {
  const th = theme.themes[themeName] || theme.themes.white;
  const chars = node.characters || '';
  const over = node.characterStyleOverrides || [];
  const table = node.styleOverrideTable || {};
  const base = { ...node.style, fills: node.fills };
  const styleAt = i => { const o = over[i]; return o && table[o] ? { ...base, ...table[o], fills: table[o].fills || base.fills } : base; };
  const lines = chars.split('\n');
  const align = { CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' }[node.style?.textAlignHorizontal] || null;
  const paras = []; let i = 0;
  lines.forEach((line, li) => {
    const first = styleAt(i + Math.max(0, line.search(/\S/)));
    const orig = origParas[li] || origParas[origParas.length - 1] || { tag: 'p', type: 'p' };
    let type = scaled ? orig.type : typeFromStyle(first);
    let tag = /^h/.test(type) ? type : (orig.tag === 'pre' ? 'pre' : 'p');
    const lt = (node.lineTypes || [])[li];
    const p = { tag, type, align, list: lt && lt !== 'NONE' ? lt : null, runs: [] };
    for (let k = 0; k < line.length; k++) {
      const st = styleAt(i + k);
      const fill = (st.fills || []).find(f => f.type === 'SOLID' && f.visible !== false);
      let color = fill ? toHex(fill.color) : null;
      const def = th[/^h/.test(type) ? 'h' : type] || th.p;
      if (color === def) color = null;
      else if (color) { const name = Object.entries(theme.palette).find(([, v]) => v === color); if (name) color = name[0]; }
      const href = st.hyperlink && st.hyperlink.type === 'URL' ? relHref(st.hyperlink.url) : null;
      const bold = st.fontFamily !== 'Archivo Black' && (st.fontWeight || 600) >= 700;
      const italic = !!st.italic;
      const last = p.runs[p.runs.length - 1];
      if (last && last.color === color && last.href === href && last.bold === bold && last.italic === italic) last.text += line[k];
      else p.runs.push({ text: line[k], color, href, bold, italic });
    }
    paras.push(p);
    i += line.length + 1;
  });
  return paras;
}

// ---------- images ----------
let imageUrls = null;
async function imageUrl(ref) {
  if (FIGMA_IMAGES_FIXTURE) return 'file://' + path.resolve(FIGMA_IMAGES_FIXTURE, ref + '.png');
  if (!imageUrls) imageUrls = (await figma(`files/${FIGMA_FILE_KEY}/images`)).meta.images;
  return imageUrls[ref];
}
async function saveImage(ref, label) {
  const url = await imageUrl(ref);
  if (!url) throw new Error('No download URL for image ' + ref);
  const buf = url.startsWith('file://') ? fs.readFileSync(url.slice(7)) : Buffer.from(await (await fetch(url)).arrayBuffer());
  const name = `${slugify(label)}-${ref.slice(0, 8)}`;
  const meta = await sharp(buf).metadata();
  if (!DRY) {
    fs.mkdirSync(MEDIA, { recursive: true });
    await sharp(buf).rotate().resize({ width: 2000, withoutEnlargement: true }).webp({ quality: 82 }).toFile(`${MEDIA}/${name}.webp`);
    await sharp(buf).rotate().resize({ width: 800, withoutEnlargement: true }).webp({ quality: 78 }).toFile(`${MEDIA}/${name}-800.webp`);
  }
  return { src: `/media/${name}.webp`, dims: `${meta.width}x${meta.height}` };
}

// ---------- main ----------
let file;
if (FIGMA_FIXTURE) file = JSON.parse(fs.readFileSync(FIGMA_FIXTURE, 'utf8'));
else {
  if (!FIGMA_TOKEN || !FIGMA_FILE_KEY) { console.log('FIGMA_TOKEN / FIGMA_FILE_KEY not set — nothing to sync.'); process.exit(0); }
  const head = await figma(`files/${FIGMA_FILE_KEY}?depth=1`);
  if (!FORCE && head.version === state.version) { console.log('Figma file unchanged (version ' + head.version + ').'); process.exit(0); }
  file = await figma(`files/${FIGMA_FILE_KEY}?plugin_data=shared`);
}

const pageFrames = [];
(function walk(n) {
  if (pd(n).kind === 'page') { pageFrames.push(n); return; }
  for (const c of n.children || []) walk(c);
})(file.document);
if (!pageFrames.length) { console.log('No "Site · …" pages in this Figma file yet. Run the plugin once.'); process.exit(0); }

const newState = { version: file.version, nodes: { ...state.nodes } };

for (const pf of pageFrames) {
  const slug = (pd(pf).slug || '').replace(/^\//, '');
  const page = slug === '__footer' ? { title: 'Footer', sections: site.footer.sections } : site.pages.find(p => p.slug === slug);
  if (!page) { console.log('Skipping unknown page', slug); continue; }
  const sectionFrames = (pf.children || []).filter(c => pd(c).kind === 'section');
  let seen = 0, total = page.sections.reduce((n, s) => n + s.blocks.length, 0);
  const pending = [];

  for (const sf of sectionFrames) {
    const si = +pd(sf).index;
    const sec = page.sections[si];
    if (!sec) continue;
    const padTop = +pd(sf).padTop || 0;
    const present = new Set();

    for (const n of sf.children || []) {
      const d = pd(n);
      const box = relBox(n, sf);
      if (d.kind !== 'block') {
        // New layer drawn in Figma
        if (n.visible === false) continue;
        const img = imageFillOf(n);
        const id = 'fig' + n.id.replace(/[^0-9a-z]/gi, '');
        if (sec.blocks.some(b => b.id === id)) { present.add(id); continue; }
        const maxRow = Math.max(1, ...sec.blocks.map(b => parseArea(b.m.area)[2]));
        const area = areaFromBox(box, padTop);
        const [r1, , r2, ] = parseArea(area);
        const mSpan = Math.max(2, Math.round((r2 - r1) * 1.4));
        const m = { area: `${maxRow}/2/${maxRow + mSpan}/10`, z: 20, justify: 'flex-start', align: 'flex-start' };
        if (n.type === 'TEXT') {
          const paras = textToParas(n, sec.theme, [], false);
          const block = { id, type: 'text', m, d: { area, z: 20, justify: 'flex-start', align: 'flex-start' }, scaled: false, html: RichText.parasToHtml(paras) };
          pending.push(async () => { sec.blocks.push(block); sec.rowsMobile = Math.max(sec.rowsMobile, maxRow + mSpan); sec.rowsDesktop = Math.max(sec.rowsDesktop, parseArea(area)[2] - 1); out(`${page.title}: new text “${(n.characters || '').slice(0, 40)}”`); });
        } else if (img) {
          pending.push(async () => {
            const saved = await saveImage(img.imageRef, n.name || 'image');
            sec.blocks.push({ id, type: 'image', m, d: { area, z: 20, justify: 'center', align: 'center' }, css: `#block-${id} { --image-component-object-fit: cover; }`, src: saved.src, alt: '', dims: saved.dims, lightbox: 'dark' });
            sec.rowsMobile = Math.max(sec.rowsMobile, maxRow + mSpan); sec.rowsDesktop = Math.max(sec.rowsDesktop, parseArea(area)[2] - 1);
            out(`${page.title}: new image “${n.name}”`);
          });
        }
        present.add(id);
        continue;
      }

      const block = sec.blocks.find(b => b.id === d.id);
      present.add(d.id); seen++;
      if (!block) continue;
      const key = `${slug}/${d.id}`;
      const prev = newState.nodes[key];
      const fresh = !prev || prev.seed !== d.seed;
      const isText = n.type === 'TEXT';

      // position / size: work out the grid area from where the layer is now, relative to where the
      // plugin put it (orig box + orig area). Applies on any move since the last sync, including moving back.
      let orig; try { orig = JSON.parse(d.box || 'null'); } catch { orig = null; }
      const lastBox = prev && prev.box;
      const changedSinceLast = lastBox ? moved(box, lastBox, isText) : moved(box, orig, isText);
      if (orig && changedSinceLast) {
        const base = d.area || block.d.area;
        const [or1, oc1, or2, oc2] = parseArea(base);
        const dRows = Math.round((box.y - orig[1]) / (rowH + g.gap));
        const sameCols = Math.abs(box.x - orig[0]) <= 3 && Math.abs(box.width - orig[2]) <= 3;
        const sameH = isText || Math.abs(box.height - orig[3]) <= 3;
        const span = sameH ? (or2 - or1) : Math.max(1, Math.round((box.height + g.gap) / (rowH + g.gap)));
        const cols = sameCols ? [oc1, oc2] : areaFromBox(box, padTop).split('/').filter((_, i) => i % 2 === 1).map(Number);
        const r1 = Math.max(1, or1 + dRows);
        const area = `${r1}/${cols[0]}/${r1 + span}/${cols[1]}`;
        if (area !== block.d.area) {
          pending.push(async () => { block.d.area = area; sec.rowsDesktop = Math.max(sec.rowsDesktop, r1 + span - 1); out(`${page.title}: moved/resized ${block.type} ${d.id}`); });
        }
      }

      const entry = { seed: d.seed, box: [box.x, box.y, box.width, box.height] };
      if (isText && block.type === 'text') {
        const origParas = RichText.htmlToParas(block.html || '');
        const s = sig([n.characters, n.characterStyleOverrides, n.styleOverrideTable, n.style, n.fills, n.lineTypes]);
        entry.sig = s;
        const charsChanged = n.characters !== d.chars;
        const styleChanged = !fresh && prev.sig && prev.sig !== s;
        if ((fresh && charsChanged) || (!fresh && prev.sig !== s && (charsChanged || styleChanged))) {
          const html = RichText.parasToHtml(textToParas(n, sec.theme, origParas, block.scaled));
          if (RichText.plain(RichText.htmlToParas(html)) !== RichText.plain(origParas) || html !== RichText.parasToHtml(origParas)) {
            pending.push(async () => { block.html = html; out(`${page.title}: text → “${n.characters.slice(0, 50).replace(/\n/g, ' / ')}”`); });
          }
        }
      } else if (block.type === 'image') {
        const img = imageFillOf(n);
        entry.img = img && img.imageRef;
        if (img && img.imageRef !== d.img && (!prev || prev.img !== img.imageRef || fresh)) {
          pending.push(async () => {
            const saved = await saveImage(img.imageRef, n.name.replace(/^Image:\s*/, '') || 'image');
            block.src = saved.src; block.dims = saved.dims;
            block.css = (block.css || '').replace(/--image-component-native-aspect-ratio:[^;]*;/, `--image-component-native-aspect-ratio: ${saved.dims.replace('x', '/')};`);
            out(`${page.title}: image replaced (${n.name})`);
          });
        }
      } else if (block.type === 'button') {
        const t = (n.children || []).find(c => c.type === 'TEXT');
        if (t) {
          const href = relHref((t.style && t.style.hyperlink && t.style.hyperlink.url) || Object.values(t.styleOverrideTable || {}).map(s => s.hyperlink && s.hyperlink.url).find(Boolean)) || block.href;
          const label = t.characters.trim();
          if (label !== d.label || href !== block.href) {
            pending.push(async () => { block.text = label; block.href = href; out(`${page.title}: button → “${label}” ${href}`); });
          }
        }
      } else if (block.type === 'video' || block.type === 'embed') {
        const t = (n.children || []).find(c => c.type === 'TEXT' && c.name === 'Link') || (n.children || []).find(c => c.type === 'TEXT');
        const url = t && t.characters.trim();
        if (url && url !== d.url && /^https?:\/\//.test(url)) {
          pending.push(async () => {
            if (block.type === 'video') block.video = { kind: 'embed', url, aspect: 16 / 9 };
            else block.url = url;
            out(`${page.title}: ${block.type} link → ${url}`);
          });
        }
      }
      newState.nodes[key] = entry;
    }

    // deletions
    for (const b of sec.blocks) {
      if (!present.has(b.id)) pending.push(async () => { sec.blocks = sec.blocks.filter(x => x.id !== b.id); out(`${page.title}: removed ${b.type} ${b.id}`); });
    }
  }

  // Safety: if most of a page's layers are missing, the Figma page was probably damaged — don't wipe the site.
  const deletions = total - seen;
  if (total > 4 && deletions / total > 0.4) {
    console.log(`⚠ ${page.title}: ${deletions} of ${total} layers missing in Figma — skipping this page to be safe.`);
    continue;
  }
  for (const fn of pending) await fn();
}

if (!DRY) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(newState, null, 2) + '\n');
  if (changes.length) fs.writeFileSync(SITE_PATH, JSON.stringify(site, null, 2));
}
const summary = changes.length ? `Figma edits: ${changes.length} change(s)\n\n- ${changes.join('\n- ')}` : 'No content changes.';
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changes.length ? 'true' : 'false'}\n`);
fs.writeFileSync(process.env.SYNC_SUMMARY || '/dev/null', summary);
console.log(summary);
