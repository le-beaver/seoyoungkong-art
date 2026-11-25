// One-time importer: Squarespace offline mirror -> content/site.json + public/media/*
// Usage: node scripts/import-squarespace.mjs [path-to-backup-root]
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import sharp from 'sharp';

const ROOT = path.resolve(process.argv[2] || '../seoyoungkong-art-backup');
const SITE = path.join(ROOT, 'site');
const PAGES_DIR = path.join(SITE, 'www.seoyoungkong.art');
const OUT = path.resolve('content/site.json');
const MEDIA = path.resolve('public/media');
fs.mkdirSync(MEDIA, { recursive: true });

const PAGES = [
  { file: 'index.html', slug: '', title: 'Home' },
  { file: 'ad-work.html', slug: 'ad-work', title: 'AD Work', nav: 'AD Work' },
  { file: 'art.html', slug: 'art', title: 'Art', nav: 'Art' },
  { file: 'about-me.html', slug: 'about-me', title: 'About', nav: 'About' },
  { file: 'fun-things-and-hobbies.html', slug: 'fun-things-and-hobbies', title: 'Fun!', nav: 'Fun!' },
  { file: 'art-1.html', slug: 'art-1', title: 'Art (Copy)', hidden: true },
  { file: 'ads-1.html', slug: 'ads-1', title: 'Ads (Copy)', hidden: true },
];
const LINKMAP = Object.fromEntries(PAGES.map(p => [p.file, '/' + p.slug]));
LINKMAP['home.html'] = '/';

const media = new Map(); // squarespace url -> local media path
const jobs = [];

function fixHref(h) {
  if (!h) return h;
  if (LINKMAP[h]) return LINKMAP[h];
  const m = h.match(/^([a-z0-9-]+)\.html(#.*)?$/);
  if (m) return '/' + m[1] + (m[2] || '');
  return h;
}

function mirrorPathFor(url) {
  // https://images.squarespace-cdn.com/content/v1/... -> SITE/images.squarespace-cdn.com/content/v1/...
  const u = new URL(url);
  const candidates = [
    path.join(SITE, u.host, decodeURIComponent(u.pathname)),
    path.join(SITE, u.host, u.pathname),
    path.join(SITE, u.host, decodeURIComponent(u.pathname).replace(/ /g, ' ')),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  // fall back to largest ?format variant present in the mirror
  const dir = path.dirname(candidates[0]);
  if (fs.existsSync(dir)) {
    const base = path.basename(candidates[0]).replace(/ /g, ' ');
    const files = fs.readdirSync(dir).filter(f => f.normalize() .startsWith(base.normalize()) || f.replace(/ /g, ' ').startsWith(base));
    files.sort((a, b) => fs.statSync(path.join(dir, b)).size - fs.statSync(path.join(dir, a)).size);
    if (files[0]) return path.join(dir, files[0]);
  }
  return null;
}

function slugify(s) {
  return s.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'img';
}

function addMedia(url) {
  if (!url) return null;
  if (media.has(url)) return media.get(url);
  const src = mirrorPathFor(url);
  if (!src) { console.warn('  missing image:', url); media.set(url, null); return null; }
  const id = new URL(url).pathname.split('/')[4]?.slice(0, 8) || Math.random().toString(36).slice(2, 10);
  const name = `${slugify(decodeURIComponent(path.basename(new URL(url).pathname)))}-${id}`;
  const isGif = /\.gif$/i.test(src);
  const rel = `/media/${name}.${isGif ? 'gif' : 'webp'}`;
  media.set(url, rel);
  jobs.push({ src, name, isGif });
  return rel;
}

// Parse a fluid-engine <style> into section grid + per-block positions
function parseGrid(css) {
  const grid = {};
  const rowsM = css.match(/grid-template-rows:\s*repeat\((\d+),minmax\(24px/);
  const rowsD = css.match(/grid-template-rows:\s*repeat\((\d+),minmax\(calc\(var\(--container-width\)/);
  const scale = css.match(/--row-height-scaling-factor:\s*([\d.]+)/);
  const gap = css.match(/row-gap:\s*([\d.]+)px/);
  grid.rowsMobile = rowsM ? +rowsM[1] : 1;
  grid.rowsDesktop = rowsD ? +rowsD[1] : 1;
  grid.rowScale = scale ? +scale[1] : 0.0215;
  grid.gap = gap ? +gap[1] : 11;
  const blocks = {};
  // Split on the desktop media query occurrences per block
  const re = /\.fe-block-([A-Za-z0-9_]+)\s*\{\s*grid-area:\s*([^;]+);\s*z-index:\s*(\d+);/g;
  let m;
  while ((m = re.exec(css))) {
    const id = m[1];
    const before = css.slice(0, m.index);
    const lastOpen = before.lastIndexOf('@media (min-width: 768px)');
    const lastClose = before.lastIndexOf('.fe-block-' + id + ' .sqs-block-alignment-wrapper');
    // desktop if this rule sits inside a min-width media block opened after this block's mobile rules
    const isDesktop = lastOpen > -1 && /@media \(min-width: 768px\)\s*\{\s*$/.test(before.slice(lastOpen).replace(/\s+/g, ' ').replace(/ $/, ' '));
    blocks[id] ??= {};
    const key = blocks[id].m ? 'd' : 'm';
    const tail = css.slice(m.index, m.index + 900);
    const jc = tail.match(/\.sqs-block\s*\{\s*justify-content:\s*([a-z-]+)/);
    const ai = tail.match(/\.sqs-block-alignment-wrapper\s*\{\s*align-items:\s*([a-z-]+)/);
    blocks[id][key] = { area: m[2].trim(), z: +m[3], justify: jc?.[1] || 'flex-start', align: ai?.[1] || 'flex-start' };
    void isDesktop; void lastClose;
  }
  return { grid, blocks };
}

function cleanBlockCss($, B) {
  const parts = [];
  B.find('style').each((_, s) => {
    let t = $(s).html() || '';
    if (/\.fe-[0-9a-f]{24}\s*\{/.test(t)) return; // section grid
    t = t.replace(/https?:\/\/[^)'"\s]*squarespace[^)'"\s]*/g, '');
    parts.push(t.replace(/\n\s*\n/g, '\n').trim());
  });
  return parts.filter(Boolean).join('\n');
}

function cleanHtml($, el) {
  const E = $(el).clone();
  E.find('script, style').remove();
  E.find('*').each((_, n) => {
    const N = $(n);
    for (const a of Object.keys(n.attribs || {})) {
      if (a === 'class') {
        const keep = (N.attr('class') || '').split(/\s+/).filter(c => /^sqsrte-|^preFade$/.test(c) && c !== 'preFade');
        keep.length ? N.attr('class', keep.join(' ')) : N.removeAttr('class');
      } else if (a === 'style') {
        const st = (N.attr('style') || '').replace(/white-space:pre-wrap;?/g, '').replace(/;\s*;/g, ';').replace(/^\s*;|;\s*$/g, '').trim();
        st ? N.attr('style', st) : N.removeAttr('style');
      } else if (a === 'href') N.attr('href', fixHref(N.attr('href')));
      else if (!['target', 'rel', 'data-rte-preserve-empty'].includes(a)) N.removeAttr(a);
    }
  });
  return E.html().replace(/\s*\n\s*/g, '').trim();
}

function unwrapEmbed(src) {
  try {
    const u = new URL(src, 'https://x');
    if (u.host === 'cdn.embedly.com') {
      const orig = u.searchParams.get('src') || u.searchParams.get('url');
      if (orig) return orig;
    }
  } catch {}
  return src;
}

function parseBlock($, B, pos) {
  const id = (B.attr('class').match(/fe-block-([A-Za-z0-9_]+)/) || [])[1];
  const inner = B.find('[data-definition-name]').first();
  const def = (inner.attr('data-definition-name') || '').split('.').pop();
  const block = { id, type: def, m: pos?.m, d: pos?.d || pos?.m };
  const css = cleanBlockCss($, B);
  if (css) block.css = css;

  if (def === 'html') {
    const c = B.find('.sqs-html-content').first();
    block.type = 'text';
    block.scaled = B.find('.sqsrte-scaled-text-container').length > 0;
    if (block.scaled) {
      const sc = B.find('.sqsrte-scaled-text').first();
      block.html = B.find('.sqsrte-scaled-text').map((_, x) => cleanHtml($, x)).get().join('') || cleanHtml($, c);
    } else block.html = cleanHtml($, c);
  } else if (def === 'imageFluid') {
    block.type = 'image';
    const img = B.find('img').first();
    const url = img.attr('data-src') || img.attr('data-image');
    block.src = addMedia(url);
    block.alt = img.attr('alt') || '';
    block.dims = img.attr('data-image-dimensions') || '';
    const a = B.find('a.sqs-block-image-link').first();
    if (a.length) { block.href = fixHref(a.attr('href')); if (a.attr('target')) block.target = a.attr('target'); }
    const cap = B.find('.image-caption, figcaption').first();
    if (cap.length && cap.text().trim()) block.caption = cleanHtml($, cap);
  } else if (def === 'shape') {
    const sv = B.find('svg').first();
    block.shape = B.find('[data-shape-name]').first().attr('data-shape-name') || '';
    block.viewBox = sv.attr('viewBox') || '0 0 100 100';
    block.svg = sv.html().replace(/\s*\n\s*/g, '');
    block.preserve = sv.attr('preserveAspectRatio') || 'none';
    const sc = B.find('[data-shape-name]').first();
    if (!sv.find('path').attr('d')) {
      block.svg = '';
      block.radius = ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map(k => +(sc.attr('data-border-' + k + '-radius') || 0));
    }
    delete block.preserve;
  } else if (def === 'button') {
    const a = B.find('a').first();
    const ct = B.find('.sqs-block-button-container').first();
    block.text = a.text().trim();
    block.href = fixHref(a.attr('href'));
    if (a.attr('target')) block.target = a.attr('target');
    block.size = ct.attr('data-button-size') || 'medium';
    block.style = ct.attr('data-button-type') || 'primary';
    block.alignClass = (ct.attr('class') || '').split(/\s+/).filter(c => /--(left|center|right)$|sqs-stretched/.test(c)).join(' ');
  } else if (def === 'video') {
    const nv = B.find('.sqs-native-video').first();
    if (nv.length) {
      const cfg = JSON.parse(nv.attr('data-config-video'));
      block.video = { kind: 'native', id: cfg.systemDataId, aspect: cfg.aspectRatio, duration: cfg.durationSeconds };
      const thumb = B.find('img').first().attr('data-src');
      if (thumb) block.poster = addMedia(thumb);
    } else {
      const ifr = B.find('iframe').first();
      const raw = ifr.attr('src') || ifr.attr('data-src') || '';
      const json = B.find('[data-block-json]').attr('data-block-json');
      let url = unwrapEmbed(raw);
      if (!url && json) try { url = JSON.parse(json).url; } catch {}
      if (!url) {
        const h = B.find('[data-html]').attr('data-html') || B.find('.sqs-video-wrapper').attr('data-html') || '';
        const m2 = h.match(/src="([^"]+)"/); if (m2) url = unwrapEmbed(m2[1].replace(/&amp;/g, '&'));
      }
      block.video = { kind: 'embed', url, aspect: 16 / 9 };
    }
  } else if (def === 'embed') {
    const ifr = B.find('iframe').first();
    const wrap = B.find('.embed-block-wrapper').first();
    const pb = (wrap.attr('style') || '').match(/padding-bottom:\s*([\d.]+)%/);
    if (ifr.length) {
      block.url = unwrapEmbed(ifr.attr('src') || ifr.attr('data-src'));
      block.ratio = pb ? +pb[1] : null;
    } else if (!B.find('.sqs-blockStatus').length) {
      const h = B.find('.sqs-embed-container, .embed-block-wrapper').first().html() || '';
      block.html = h.replace(/\s*\n\s*/g, '');
    } else block.skipped = true;
  } else if (def === 'accordion') {
    block.items = B.find('.accordion-item').map((_, li) => ({
      title: $(li).find('.accordion-item__title').text().trim(),
      html: cleanHtml($, $(li).find('.accordion-item__description')),
    })).get();
  } else {
    block.skipped = true; // product / form: Squarespace commerce, not portable
  }
  return block;
}

function parseSection($, S) {
  const sec = { theme: S.attr('data-section-theme') || 'white' };
  const cw = S.find('.content-wrapper').first();
  const st = (cw.attr('style') || '').replace(/\s+/g, ' ');
  const pt = st.match(/padding-top:\s*([^;]+);/), pb = st.match(/padding-bottom:\s*([^;]+);/);
  if (pt) sec.padTop = pt[1].trim();
  if (pb) sec.padBottom = pb[1].trim();
  const cls = S.attr('class') || '';
  const h = cls.match(/section-height--([a-z-]+)/); if (h) sec.height = h[1];
  const bw = cls.match(/background-width--([a-z-]+)/); if (bw) sec.width = bw[1];
  const bgimg = S.find('.section-background img').first();
  if (bgimg.length) sec.bgImage = addMedia(bgimg.attr('data-src') || bgimg.attr('data-image'));
  const ov = S.find('.section-background-overlay').first().attr('style');
  if (ov) sec.overlay = ov.replace(/\s+/g, ' ').trim();
  const fe = S.find('[data-fluid-engine]').first();
  const gridCss = fe.children('style').first().html() || '';
  const { grid, blocks } = parseGrid(gridCss);
  Object.assign(sec, grid);
  sec.blocks = S.find('.fe-block').map((_, b) => {
    const id = ($(b).attr('class').match(/fe-block-([A-Za-z0-9_]+)/) || [])[1];
    return parseBlock($, $(b), blocks[id]);
  }).get().filter(b => !b.skipped);
  return sec;
}

const site = {
  title: 'SEOYOUNG (ELLY) KONG',
  description: 'Art Director Seoyoung (Elly) Kong — portfolio of advertising, art, and fun things.',
  palette: { accent: '#E42278', darkAccent: '#ED7BAB', lightAccent: '#F5D3DD', black: '#000000', white: '#FFFFFF' },
  nav: PAGES.filter(p => p.nav).map(p => ({ label: p.nav, href: '/' + p.slug })),
  footer: null,
  pages: [],
};

for (const p of PAGES) {
  const $ = cheerio.load(fs.readFileSync(path.join(PAGES_DIR, p.file), 'utf8'));
  const sections = $('#sections > section.page-section, main section.page-section').filter((_, s) => !$(s).closest('footer').length);
  const page = { slug: p.slug, title: p.title, hidden: !!p.hidden, sections: [] };
  const metaDesc = $('meta[name="description"]').attr('content');
  if (metaDesc) page.description = metaDesc;
  sections.each((_, s) => page.sections.push(parseSection($, $(s))));
  site.pages.push(page);
  if (!site.footer) {
    const fs_ = $('footer section.page-section');
    if (fs_.length) site.footer = { sections: fs_.map((_, s) => parseSection($, $(s))).get() };
  }
  console.log(p.file, '→', page.sections.length, 'sections,', page.sections.reduce((n, s) => n + s.blocks.length, 0), 'blocks');
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(site, null, 2));

// Optimise media: 2000px max (webp), plus an 800px variant for srcset
let done = 0;
for (const j of jobs) {
  const out = path.join(MEDIA, `${j.name}.${j.isGif ? 'gif' : 'webp'}`);
  if (!fs.existsSync(out)) {
    if (j.isGif) fs.copyFileSync(j.src, out);
    else {
      await sharp(j.src).rotate().resize({ width: 2000, withoutEnlargement: true }).webp({ quality: 82 }).toFile(out);
      await sharp(j.src).rotate().resize({ width: 800, withoutEnlargement: true }).webp({ quality: 78 }).toFile(out.replace(/\.webp$/, '-800.webp'));
    }
  }
  done++;
}
console.log('media:', done, 'files; missing:', [...media.values()].filter(v => v === null).length);
