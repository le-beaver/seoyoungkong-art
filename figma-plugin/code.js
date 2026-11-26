// Seoyoung Site Sync — Figma plugin (main thread).
// Builds one Figma page per website page, laid out on the same 24-column grid as the site.
// Every layer that maps to the site carries shared plugin data (namespace "sqsite") so the
// GitHub sync job can read your edits back through the Figma REST API.
figma.showUI(__html__, { width: 380, height: 560, themeColors: true });

const NS = 'sqsite';
const set = (node, data) => { for (const [k, v] of Object.entries(data)) node.setSharedPluginData(NS, k, typeof v === 'string' ? v : JSON.stringify(v)); };
const hex = h => { const n = parseInt(h.slice(1), 16); return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }; };
const solid = h => [{ type: 'SOLID', color: hex(h) }];

let T = null; // theme.json from content.json
let SITE_URL = ''; // e.g. https://le-beaver.github.io/seoyoungkong-art
// Figma only accepts full URLs as links; site-internal links become SITE_URL + path.
const absUrl = h => !h ? h : /^[a-z]+:/i.test(h) ? h : SITE_URL + (h.startsWith('/') ? h : '/' + h);
const link = (node, s, e, h) => { try { node.setRangeHyperlink(s, e, { type: 'URL', value: absUrl(h) }); } catch (err) { console.warn('link skipped', h, err); } };
let G = null; // grid helpers

function grid(theme) {
  const g = theme.grid;
  const container = Math.min(g.maxWidth, g.frameWidth - 2 * g.gutter);
  const colW = (container - g.gap * (g.columns - 1)) / g.columns;
  const rowH = container * g.rowScale;
  const X = line => line <= 1 ? 0 : line >= g.columns + 3 ? g.frameWidth : g.gutter + (line - 2) * (colW + g.gap);
  const box = (area, padTop) => {
    const [r1, c1, r2, c2] = String(area).split('/').map(Number);
    const x = X(c1);
    const right = c2 >= g.columns + 3 ? g.frameWidth : X(c2) - g.gap;
    return { x, y: padTop + (r1 - 1) * (rowH + g.gap), w: Math.max(1, right - x), h: Math.max(1, (r2 - r1) * (rowH + g.gap) - g.gap) };
  };
  const rowsHeight = rows => rows * rowH + (rows - 1) * g.gap;
  return { ...g, colW, rowH, X, box, rowsHeight };
}

const vmaxPx = s => { const m = String(s || '').match(/([\d.]+)vmax\s*\/\s*10/); return m ? (+m[1] / 10) * 14.4 : 0; };

function cssVarColor(css, name, fallback) {
  const m = (css || '').match(new RegExp(name + ':\\s*hsla\\(var\\(--([A-Za-z]+)-hsl\\)'));
  return (m && T.palette[m[1]]) || fallback;
}
function cssRadius(css) {
  const m = (css || '').match(/border-top-left-radius:\s*([\d.]+)px/);
  return m ? +m[1] : 0;
}

// Resolve real style names (Figma may call it "SemiBold" or "Semi Bold"), with fallbacks.
const FONT = {};
async function loadFonts() {
  const all = await figma.listAvailableFontsAsync();
  const styles = fam => all.filter(f => f.fontName.family === fam).map(f => f.fontName.style);
  const pick = (fam, wants, fallbackFam) => {
    const have = styles(fam);
    for (const w of wants) { const hit = have.find(s => s.replace(/\s+/g, '').toLowerCase() === w); if (hit) return { family: fam, style: hit }; }
    if (have.length) return { family: fam, style: have.includes('Regular') ? 'Regular' : have[0] };
    return fallbackFam;
  };
  FONT.heading = pick('Archivo Black', ['regular'], { family: 'Inter', style: 'Black' });
  FONT.body = pick('Space Grotesk', ['semibold', 'medium', 'bold', 'regular'], { family: 'Inter', style: 'Semi Bold' });
  FONT.bold = pick('Space Grotesk', ['bold', 'semibold'], { family: 'Inter', style: 'Bold' });
  for (const f of [FONT.heading, FONT.body, FONT.bold, { family: 'Inter', style: 'Regular' }]) {
    try { await figma.loadFontAsync(f); } catch (e) { console.warn('font', f, e); }
  }
}

function colorFor(run, para, theme) {
  if (run.color) return run.color[0] === '#' ? run.color : (T.palette[run.color] || '#000000');
  const key = /^h/.test(para.type) ? 'h' : para.type;
  return theme[key] || theme.p;
}

// Write paragraphs into a text node with per-range styles.
function fillText(node, paras, theme, sizeScale = 1) {
  const text = paras.map(p => p.runs.map(r => r.text).join('')).join('\n') || ' ';
  node.fontName = FONT.body;
  node.characters = text;
  let i = 0;
  paras.forEach((p, pi) => {
    const ty = T.type[p.type] || T.type.p;
    const pStart = i;
    for (const r of p.runs) {
      const len = r.text.length; if (!len) continue;
      const s = i, e = i + len;
      node.setRangeFontName(s, e, ty.font === 'Archivo Black' ? FONT.heading : r.bold ? FONT.bold : FONT.body);
      node.setRangeFontSize(s, e, ty.size * sizeScale);
      node.setRangeLineHeight(s, e, { unit: 'PIXELS', value: ty.line * sizeScale });
      node.setRangeLetterSpacing(s, e, { unit: 'PERCENT', value: ty.tracking * 100 });
      if (ty.upper) node.setRangeTextCase(s, e, 'UPPER');
      node.setRangeFills(s, e, solid(colorFor(r, p, theme)));
      if (r.href) link(node, s, e, r.href);
      if (r.italic) { /* Space Grotesk has no italic; leave upright */ }
      i = e;
    }
    if (i === pStart && i < text.length) { // empty paragraph: style the newline so it keeps its size
      node.setRangeFontName(i, i + 1, ty.font === 'Archivo Black' ? FONT.heading : FONT.body);
      node.setRangeFontSize(i, i + 1, ty.size * sizeScale);
    }
    if (p.list && i > pStart) node.setRangeListOptions(pStart, i, { type: p.list });
    if (pi < paras.length - 1) i += 1; // newline
  });
  const align = (paras.find(p => p.align) || {}).align;
  node.textAlignHorizontal = align === 'center' ? 'CENTER' : align === 'right' ? 'RIGHT' : align === 'justify' ? 'JUSTIFIED' : 'LEFT';
  node.paragraphSpacing = 12;
}

async function imageFill(bytes) {
  if (!bytes) return null;
  const img = figma.createImage(bytes);
  return img.hash;
}

async function buildBlock(b, sec, theme, padTop, images, seed, parent) {
  const bx = G.box(b.d.area, padTop);
  const meta = { kind: 'block', id: b.id, type: b.type, seed, area: b.d.area };
  let node;
  if (b.type === 'text') {
    node = figma.createText();
    let scale = 1;
    fillText(node, b.paras, theme);
    if (b.scaled) {
      node.textAutoResize = 'WIDTH_AND_HEIGHT';
      const s = Math.min(bx.w / Math.max(1, node.width), bx.h / Math.max(1, node.height));
      scale = s; fillText(node, b.paras, theme, scale);
    }
    node.textAutoResize = 'HEIGHT';
    node.resize(bx.w, Math.max(1, node.height));
    // vertical alignment inside the block, like the site's flex column
    const free = bx.h - node.height;
    if (free > 0 && b.d.justify === 'center') bx.y += free / 2;
    else if (free > 0 && b.d.justify === 'flex-end') bx.y += free;
    node.name = (b.scaled ? 'Big text: ' : 'Text: ') + (node.characters.split('\n')[0] || '').slice(0, 40);
    meta.chars = node.characters;
    if (b.scaled) meta.scaled = '1';
  } else if (b.type === 'image') {
    node = figma.createRectangle();
    node.resize(bx.w, bx.h);
    const hash = await imageFill(images[b.src]);
    node.fills = hash ? [{ type: 'IMAGE', imageHash: hash, scaleMode: 'FILL' }] : solid('#DDDDDD');
    node.cornerRadius = cssRadius(b.css);
    node.name = 'Image: ' + decodeURIComponent((b.src || '').split('/').pop()).replace(/-[0-9a-f]{8}\.webp$/, '');
    meta.img = hash || '';
    if (b.href) meta.href = b.href;
  } else if (b.type === 'shape') {
    const color = cssVarColor(b.css, '--shape-block-background-color', T.palette.accent);
    if (b.radius || !b.svg) {
      node = figma.createRectangle();
      node.resize(bx.w, bx.h);
      node.cornerRadius = (b.radius || [0])[0];
    } else {
      node = figma.createNodeFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.viewBox}">${b.svg}</svg>`);
      const s = Math.min(bx.w / node.width, bx.h / node.height);
      node.resize(node.width * s, node.height * s);
      for (const c of node.findAll(n => 'fills' in n)) c.fills = solid(color);
      node.x = 0; // positioned below
      bx.x += (bx.w - node.width) / 2; bx.y += (bx.h - node.height) / 2;
    }
    if ('fills' in node && node.type === 'RECTANGLE') node.fills = solid(color);
    node.name = 'Shape: ' + (b.shape || 'shape');
  } else if (b.type === 'button') {
    node = figma.createFrame();
    node.resize(bx.w, Math.min(bx.h, 59));
    node.cornerRadius = 300;
    const outline = b.style === 'primary';
    const c = sec.theme === 'dark' ? T.palette.lightAccent : T.palette.accent;
    node.fills = outline ? [] : solid(c);
    if (outline) { node.strokes = solid(c); node.strokeWeight = 2; }
    node.layoutMode = 'HORIZONTAL'; node.primaryAxisAlignItems = 'CENTER'; node.counterAxisAlignItems = 'CENTER';
    node.primaryAxisSizingMode = 'FIXED'; node.counterAxisSizingMode = 'FIXED';
    const t = figma.createText();
    t.fontName = FONT.body;
    t.characters = b.text || 'Button';
    t.fontSize = 16; t.textCase = 'UPPER';
    t.fills = solid(outline ? c : '#FFFFFF');
    if (b.href) link(t, 0, t.characters.length, b.href);
    t.name = 'Button label';
    node.appendChild(t);
    node.name = 'Button: ' + (b.text || '');
    meta.label = t.characters; meta.href = b.href || '';
  } else if (b.type === 'video' || b.type === 'embed') {
    node = figma.createFrame();
    node.resize(bx.w, bx.h);
    const native = b.video && b.video.kind === 'native';
    const posterHash = native ? await imageFill(images[`/video/${b.video.id}/poster.webp`]) : null;
    node.fills = posterHash ? [{ type: 'IMAGE', imageHash: posterHash, scaleMode: 'FILL' }] : solid('#1E1E1E');
    const t = figma.createText();
    t.fontName = FONT.body;
    const url = native ? `video:${b.video.id}` : (b.video ? b.video.url : b.url) || '';
    t.characters = url || '(embed)';
    t.fontSize = 14;
    t.fills = solid('#FFFFFF');
    t.x = 12; t.y = 12; t.resize(Math.max(40, bx.w - 24), t.height); t.textAutoResize = 'HEIGHT';
    t.name = 'Link';
    node.appendChild(t);
    node.name = (b.type === 'video' ? 'Video' : 'Embed') + (native ? ' (uploaded file)' : '');
    meta.url = url;
  } else if (b.type === 'gallery') {
    // Read-only picture of the gallery: locked, images laid out like the site at 1440px. Edit in content/site.json.
    const { rows, gap, h } = galleryRows(b);
    node = figma.createFrame();
    node.resize(G.frameWidth, h); node.fills = []; node.clipsContent = false;
    let y = G.gutter;
    for (const r of rows) {
      let x = G.gutter;
      for (const it of r.row) {
        const rect = figma.createRectangle();
        const w = r.h * arOf(it);
        rect.resize(Math.max(1, w), Math.max(1, r.h)); rect.x = x; rect.y = y;
        const hash = await imageFill(images[it.src]);
        rect.fills = hash ? [{ type: 'IMAGE', imageHash: hash, scaleMode: 'FILL' }] : solid('#DDDDDD');
        rect.name = 'Image: ' + (it.alt || '');
        set(rect, { kind: 'chrome' });
        node.appendChild(rect); x += w + gap;
      }
      y += r.h + gap;
    }
    node.name = 'Gallery (edit in code — not synced)';
    node.locked = true;
    bx.x = 0; bx.y = 0;
  } else {
    node = figma.createFrame();
    node.resize(bx.w, bx.h);
    node.fills = solid('#EEEEEE');
    node.name = `${b.type} (edit in code)`;
  }
  node.x = bx.x; node.y = bx.y;
  meta.box = [node.x, node.y, node.width, node.height].map(v => Math.round(v * 10) / 10);
  set(node, meta);
  return node;
}

async function safeBlock(b, sec, theme, padTop, images, seed, parent) {
  const before = new Set(figma.currentPage.children.map(n => n.id));
  try { parent.appendChild(await buildBlock(b, sec, theme, padTop, images, seed)); }
  catch (e) {
    // never leave half-built layers lying around on the current page
    for (const n of figma.currentPage.children) if (!before.has(n.id)) n.remove();
    console.error('block', b.id, e); figma.notify(`Skipped a ${b.type} block (${e.message})`);
  }
}

// Gallery-strips sections have no grid rows: their height comes from the justified image rows
// (rowSizes is worked out by scripts/build.mjs for the 1440px frame and shipped in content.json).
const galleryOf = sec => sec.blocks.length === 1 && sec.blocks[0].type === 'gallery' ? sec.blocks[0] : null;
const arOf = it => { const [w, h] = String(it.dims || '').split('x').map(Number); return w && h ? w / h : 1; };
function galleryRows(b) {
  const W = G.frameWidth - 2 * G.gutter, gap = b.gutter == null ? 20 : b.gutter, out = [];
  let i = 0;
  for (const n of b.rowSizes || [b.items.length]) {
    const row = b.items.slice(i, i + n); i += n;
    const sum = row.reduce((a, it) => a + arOf(it), 0);
    out.push({ row, h: (W - gap * (row.length - 1)) / sum });
  }
  return { rows: out, gap, h: out.reduce((a, r) => a + r.h, 0) + gap * (out.length - 1) + 2 * G.gutter };
}

function sectionHeight(sec) {
  const gal = galleryOf(sec);
  if (gal) return { h: galleryRows(gal).h, padTop: G.gutter };
  const content = G.rowsHeight(sec.rowsDesktop);
  if (sec.height === 'medium') {
    const h = Math.max(G.mediumMinHeight, content + 2 * G.mediumPad);
    return { h, padTop: (h - content) / 2 };
  }
  const pt = vmaxPx(sec.padTop), pb = vmaxPx(sec.padBottom);
  return { h: content + pt + pb, padTop: pt };
}

async function buildPage({ page, images, site, seed, isFooter }) {
  await loadFonts();
  const name = `Site · ${page.title}`;
  await figma.loadAllPagesAsync();
  // slugs are stored as "/path" because Figma drops empty plugin-data values (the homepage slug is "")
  const key = '/' + page.slug;
  let fp = figma.root.children.find(p => p.getSharedPluginData(NS, 'kind') === 'canvas' && p.getSharedPluginData(NS, 'slug') === key)
    || figma.root.children.find(p => p.getSharedPluginData(NS, 'kind') === 'canvas' && [page.slug, ''].includes(p.getSharedPluginData(NS, 'slug')) && p.name === name);
  if (!fp) { fp = figma.createPage(); set(fp, { kind: 'canvas', slug: key }); }
  fp.name = name;
  for (const c of [...fp.children]) c.remove();

  const root = figma.createFrame();
  root.name = `${page.title} — ${page.slug ? '/' + page.slug : '/'}`;
  root.layoutMode = 'VERTICAL'; root.primaryAxisSizingMode = 'AUTO'; root.counterAxisSizingMode = 'FIXED';
  root.resize(G.frameWidth, 100); root.itemSpacing = 0; root.fills = []; root.clipsContent = false;
  set(root, { kind: 'page', slug: key, seed });
  fp.appendChild(root);

  if (!isFooter) {
    const first = T.themes[page.sections[0]?.theme] || T.themes.white;
    const hdr = figma.createFrame();
    hdr.name = 'Header (automatic — not editable here)';
    hdr.resize(G.frameWidth, 61); hdr.fills = solid(first.bg);
    hdr.effects = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.28 }, offset: { x: 0, y: 3 }, radius: 12, visible: true, blendMode: 'NORMAL' }];
    const title = figma.createText();
    title.fontName = FONT.heading; title.characters = site.title; title.fontSize = 26.6;
    title.textCase = 'UPPER'; title.letterSpacing = { unit: 'PERCENT', value: -2 }; title.fills = solid(first.nav);
    title.x = G.gutter; title.y = (61 - title.height) / 2; hdr.appendChild(title);
    const nav = figma.createText();
    nav.fontName = FONT.body; nav.characters = site.nav.map(n => n.label).join('     ');
    nav.fontSize = 18; nav.fills = solid(first.nav); nav.x = 595; nav.y = (61 - nav.height) / 2; hdr.appendChild(nav);
    hdr.locked = true; set(hdr, { kind: 'chrome' });
    root.appendChild(hdr);
  }

  for (let i = 0; i < page.sections.length; i++) {
    const sec = page.sections[i];
    const theme = T.themes[sec.theme] || T.themes.white;
    const { h, padTop } = sectionHeight(sec);
    const f = figma.createFrame();
    f.name = `Section ${i + 1}`;
    f.resize(G.frameWidth, h); f.fills = solid(theme.bg); f.clipsContent = true;
    set(f, { kind: 'section', slug: key, index: String(i), padTop: String(padTop), seed });
    root.appendChild(f);
    const blocks = [...sec.blocks].sort((a, b) => a.d.z - b.d.z);
    for (const b of blocks) {
      await safeBlock(b, sec, theme, padTop, images, seed, f);
    }
  }
  return fp;
}


// ---------- Publish: export the Site pages in the same shape as the Figma REST API ----------
function pluginDataOf(node) {
  const keys = node.getSharedPluginDataKeys(NS);
  if (!keys.length) return undefined;
  const d = {}; for (const k of keys) d[k] = node.getSharedPluginData(NS, k);
  return { [NS]: d };
}
function paints(fills) {
  if (!fills || fills === figma.mixed) return [];
  return fills.map(f => f.type === 'IMAGE' ? { type: 'IMAGE', imageRef: f.imageHash, visible: f.visible !== false }
    : f.type === 'SOLID' ? { type: 'SOLID', color: { ...f.color, a: f.opacity == null ? 1 : f.opacity }, visible: f.visible !== false }
    : { type: f.type, visible: f.visible !== false });
}
function textFields(node) {
  const segs = node.getStyledTextSegments(['fontName', 'fontSize', 'fontWeight', 'fills', 'hyperlink', 'listOptions']);
  const table = {}; const over = new Array(node.characters.length).fill(0); const keyToId = {};
  for (const sg of segs) {
    const st = { fontFamily: sg.fontName.family, fontSize: sg.fontSize, fontWeight: sg.fontWeight, italic: /italic/i.test(sg.fontName.style), fills: paints(sg.fills) };
    if (sg.hyperlink && sg.hyperlink.type === 'URL') st.hyperlink = { type: 'URL', url: sg.hyperlink.value };
    const k = JSON.stringify(st); if (!keyToId[k]) { keyToId[k] = Object.keys(keyToId).length + 1; table[keyToId[k]] = st; }
    for (let i = sg.start; i < sg.end; i++) over[i] = keyToId[k];
  }
  const first = segs[0] || { fontName: { family: '' }, fontSize: 16, fontWeight: 400 };
  const lineTypes = []; let pos = 0;
  for (const line of node.characters.split('\n')) {
    const sg = segs.find(s => s.start <= pos && pos < s.end) || segs[segs.length - 1];
    lineTypes.push(sg && sg.listOptions && sg.listOptions.type !== 'NONE' ? sg.listOptions.type : 'NONE');
    pos += line.length + 1;
  }
  return { characters: node.characters, characterStyleOverrides: over, styleOverrideTable: table, lineTypes,
    style: { fontFamily: first.fontName.family, fontSize: first.fontSize, fontWeight: first.fontWeight, textAlignHorizontal: node.textAlignHorizontal },
    fills: paints(first.fills) };
}
function serialize(node, imagesWanted) {
  const out = { id: node.id, type: node.type, name: node.name, visible: node.visible, absoluteBoundingBox: node.absoluteBoundingBox };
  const data = pluginDataOf(node); if (data) out.sharedPluginData = data;
  if (node.type === 'TEXT') Object.assign(out, textFields(node));
  else if ('fills' in node) out.fills = paints(node.fills);
  // images we need to upload: new layers, or a fill that differs from what the plugin put there
  // upload only what the site needs: changed photos on image blocks, or images on brand-new layers
  const isImageBlock = data && data[NS].type === 'image';
  for (const f of out.fills || []) if (f.type === 'IMAGE' && f.imageRef && (!data ? true : isImageBlock && data[NS].img !== f.imageRef)) imagesWanted.add(f.imageRef);
  if ('children' in node && node.type !== 'BOOLEAN_OPERATION') out.children = node.children.map(c => serialize(c, imagesWanted));
  return out;
}
async function exportSite() {
  await figma.loadAllPagesAsync();
  const frames = [];
  const wanted = new Set();
  for (const pg of figma.root.children) {
    if (pg.getSharedPluginData(NS, 'kind') !== 'canvas') continue;
    for (const f of pg.children) if (f.getSharedPluginData(NS, 'kind') === 'page') frames.push(serialize(f, wanted));
  }
  const images = {};
  for (const hash of wanted) {
    const img = figma.getImageByHash(hash);
    if (img) images[hash] = await img.getBytesAsync();
  }
  return { file: { version: String(Date.now()), document: { id: '0:0', type: 'DOCUMENT', children: [{ id: '0:1', type: 'CANVAS', children: frames }] } }, images };
}

// Auto-publish: after edits on the Site pages settle for a while, ask the UI to publish.
let editTimer = null;
figma.loadAllPagesAsync().then(() => figma.on('documentchange', e => {
  // only edits on the Site · pages count
  const onSite = e.documentChanges.some(c => { let n = c.node; while (n && n.type !== 'PAGE') n = n.parent; return !n || n.getSharedPluginData(NS, 'kind') === 'canvas'; });
  if (!onSite) return;
  clearTimeout(editTimer);
  editTimer = setTimeout(() => figma.ui.postMessage({ type: 'edits-settled' }), 20000);
}));

figma.ui.onmessage = async msg => {
  try {
    if (msg.type === 'load-settings') {
      figma.ui.postMessage({ type: 'settings', settings: (await figma.clientStorage.getAsync('settings')) || {} });
    } else if (msg.type === 'save-settings') {
      await figma.clientStorage.setAsync('settings', msg.settings);
    } else if (msg.type === 'begin') {
      T = msg.theme; G = grid(T); SITE_URL = (msg.siteUrl || '').replace(/\/$/, '');
    } else if (msg.type === 'page') {
      const fp = await buildPage(msg);
      figma.ui.postMessage({ type: 'page-done', slug: msg.page.slug });
      if (msg.last) { await figma.setCurrentPageAsync(figma.root.children.find(p => p.getSharedPluginData(NS, 'slug') === '/') || fp); figma.notify('Website pages are ready to edit.'); }
    } else if (msg.type === 'export') {
      const { file, images } = await exportSite();
      figma.ui.postMessage({ type: 'exported', file, images });
    } else if (msg.type === 'notify') {
      figma.notify(msg.text, { error: !!msg.error });
    }
  } catch (e) {
    console.error(e);
    figma.ui.postMessage({ type: 'error', message: String(e.message || e), slug: msg.page && msg.page.slug });
  }
};
