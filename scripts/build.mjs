// Static site generator: content/site.json -> dist/
import fs from 'fs';
import path from 'path';

const site = JSON.parse(fs.readFileSync('content/site.json', 'utf8'));
const DIST = path.resolve(process.env.OUT_DIR || 'dist');
const BASE_URL = process.env.SITE_URL || site.url || '';
// Where videos are served from (folder holding <id>/video.mp4). Overridable for external hosting.
const VIDEO_BASE = process.env.VIDEO_BASE || site.videoBase || '/video';
// Sub-path the site is served from (e.g. /seoyoungkong-art on github.io). Empty for a custom domain.
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/$/, '');
const withBase = html => !BASE_PATH ? html : html
  .replace(/((?:href|src|poster|action|data-full)=")\/(?!\/)/g, `$1${BASE_PATH}/`)
  .replace(/((?:srcset="|, ))\/(?!\/)/g, `$1${BASE_PATH}/`);

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const span = area => { // "r1/c1/r2/c2" -> column span (of 24) for sizes attr
  const [, c1, , c2] = String(area).split('/').map(Number);
  return Math.max(1, (c2 || 26) - (c1 || 2));
};

function youtubeId(u) {
  const m = String(u).match(/(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([\w-]{11})/);
  return m && m[1];
}

function renderBlock(b) {
  const vars = [
    `--am:${b.m.area}`, `--ad:${b.d.area}`, `--zm:${b.m.z}`, `--zd:${b.d.z}`,
    `--jm:${b.m.justify || "flex-start"}`, `--jd:${b.d.justify || "flex-start"}`,
  ].join(';');
  let cls = 'sqs-block', inner = '';
  switch (b.type) {
    case 'text':
      cls += ' html-block' + (b.scaled ? ' scaled' : '');
      inner = `<div class="sqs-text-block-container"><div class="sqs-html-content" data-edit="${b.id}">${b.html}</div></div>`;
      break;
    case 'image': {
      cls += ' image-block';
      if (!b.src) { // image missing on Squarespace too (404): it shows the browser's empty broken-image frame
        inner = `<div class="img-missing" data-edit="${b.id}"></div>`;
        break;
      }
      const isGif = b.src.endsWith('.gif');
      const small = b.src.replace(/\.webp$/, '-800.webp');
      const [w, h] = (b.dims || '').split('x').map(Number);
      const cols = span(b.d.area);
      const sizes = `(max-width: 767px) 100vw, ${Math.round((cols / 24) * 100)}vw`;
      const img = `<img src="${b.src}"${isGif ? '' : ` srcset="${small} 800w, ${b.src} 2000w" sizes="${sizes}"`}${w ? ` width="${w}" height="${h}"` : ''} alt="${esc(b.alt)}" loading="lazy" decoding="async" data-edit="${b.id}">`;
      const wrapped = b.href
        ? `<a class="content-fill" href="${esc(b.href)}"${b.target ? ` target="${b.target}" rel="noopener"` : ''}>${img}</a>`
        : b.lightbox
          ? `<button type="button" class="content-fill lb-trigger" data-full="${b.src}" data-theme-lb="${b.lightbox}" aria-label="View fullsize${b.alt ? ': ' + esc(b.alt) : ''}">${img}</button>`
          : `<div class="content-fill">${img}</div>`;
      inner = `<div class="fluid-image-component-root"><div class="fluid-image-animation-wrapper sqs-image sqs-block-alignment-wrapper"><div class="fluid-image-container sqs-image-content visitor-mode"><div class="js-content-mode-element-wrapper js-content-mode-element-system_desktop">${wrapped}<div class="fluidImageOverlay"></div></div></div></div></div>${b.caption ? `<div class="image-caption sqs-html-content">${b.caption}</div>` : ''}`;
      break;
    }
    case 'shape':
      cls += ' shape-block';
      if (b.radius) { inner = `<div class="sqs-shape-rect" style="border-radius:${b.radius.map(r => r + 'px').join(' ')}"></div>`; break; }
      inner = `<div class="sqs-shape-block-outer-container"><div class="sqs-shape-block-container sqs-block-alignment-wrapper sqs-shape-block-container-system_desktop"><svg class="sqs-shape" viewBox="${b.viewBox}" aria-hidden="true">${b.svg}</svg></div></div>`;
      break;
    case 'button':
      cls += ' button-block';
      inner = `<div class="sqs-block-button-container ${b.alignClass || ''}"><a class="btn btn--${b.style} btn--${b.size}" href="${esc(b.href)}"${b.target ? ` target="${b.target}" rel="noopener"` : ''} data-edit="${b.id}">${esc(b.text)}</a></div>`;
      break;
    case 'video': {
      cls += ' video-block';
      const v = b.video;
      // Squarespace sizes video blocks by width (intrinsic aspect box), top-aligned in the cell
      const ratio = v.kind === 'native' ? 16 / 9 : (v.aspect || 16 / 9);
      if (v.kind === 'native') {
        // site.js swaps the browser controls for a Squarespace-style player (centre play button, time, mute, fullscreen)
        inner = `<div class="media-frame vp" style="aspect-ratio:${+ratio.toFixed(5)}"><video controls playsinline preload="none" src="${VIDEO_BASE}/${v.id}/video.mp4" poster="${b.poster || `${VIDEO_BASE}/${v.id}/poster.webp`}"${v.duration ? ` data-duration="${v.duration}"` : ''}></video></div>`;
      } else {
        const yt = youtubeId(v.url);
        const src = yt ? `https://www.youtube-nocookie.com/embed/${yt}` : v.url;
        inner = `<div class="media-frame" style="aspect-ratio:${+ratio.toFixed(5)}"><iframe src="${esc(src)}" title="Video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
      }
      break;
    }
    case 'embed':
      cls += ' embed-block';
      inner = b.url
        ? `<div class="embed-frame"${b.ratio ? ` style="aspect-ratio:${+(100 / b.ratio).toFixed(5)}"` : ''}><iframe src="${esc(b.url)}" title="Embedded content" loading="lazy" allowfullscreen allow="fullscreen"></iframe></div>`
        : `<div class="embed-frame">${b.html || ''}</div>`;
      break;
    case 'accordion':
      cls += ' accordion-block';
      inner = `<div class="acc sqs-html-content">${b.items.map(i => `<details><summary>${esc(i.title)}</summary><div>${i.html}</div></details>`).join('')}</div>`;
      break;
    default:
      return '';
  }
  return `<div class="fe-block fe-block-${b.id}" style="${vars}"><div class="${cls}" id="block-${b.id}"><div class="sqs-block-content">${inner}</div></div></div>`;
}

function renderSection(s, i) {
  const vars = [`--rows-m:${s.rowsMobile}`, `--rows-d:${s.rowsDesktop}`, `--row-scale:${s.rowScale}`];
  const pad = [s.padTop && `--pt:${s.padTop}`, s.padBottom && `--pb:${s.padBottom}`].filter(Boolean);
  const bg = s.bgImage ? `<div class="sec-bg"><img src="${s.bgImage}" alt="" loading="lazy"></div>` : '';
  return `<section class="sec h-${s.height || 'custom'}" data-theme="${s.theme || 'white'}" data-section="${i}">${bg}<div class="sec-in" style="${pad.join(';')}"><div class="fe" style="${vars.join(';')}">${s.blocks.map(renderBlock).join('')}</div></div></section>`;
}

const blockCss = sections => sections.flatMap(s => s.blocks.map(b => b.css || '')).join('\n')
  .replace(/\n\s*\n/g, '\n');

function renderPage(page) {
  const first = page.sections[0]?.theme || 'white';
  const url = '/' + page.slug;
  const title = page.slug ? `${page.title} — ${site.title}` : site.title;
  const desc = page.description || site.description;
  const navLinks = site.nav.map(n => `<a href="${n.href}"${n.href === url ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`).join('');
  const footer = site.footer ? site.footer.sections.map((s, i) => renderSection(s, 'f' + i)).join('') : '';
  const hasVideo = page.sections.some(s => s.blocks.some(b => b.video?.kind === 'native'));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
${BASE_URL ? `<link rel="canonical" href="${BASE_URL}${url}">` : ''}
${page.hidden ? '<meta name="robots" content="noindex">' : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/archivo-black-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/space-grotesk-600.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css?v=${BUILD_ID}">
<style>${blockCss([...page.sections, ...(site.footer?.sections || [])])}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="hdr" data-theme="${first}">
  <div class="hdr-in">
    <a class="hdr-title" href="/">${esc(site.title)}</a>
    <nav class="hdr-nav" aria-label="Main">${navLinks}</nav>
    <button class="hdr-burger" aria-label="Open menu" aria-expanded="false"><span></span><span></span></button>
  </div>
</header>
<nav class="menu" data-theme="${first}" aria-label="Mobile">${navLinks}</nav>
<main id="main">
${page.sections.map(renderSection).join('\n')}
</main>
<footer>${footer}</footer>
<script src="/site.js?v=${BUILD_ID}" defer></script>
</body>
</html>`;
}

const BUILD_ID = Date.now().toString(36);
// content.json: lets the Figma plugin read the current site


for (const page of site.pages) {
  const dir = path.join(DIST, page.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), withBase(renderPage(page)));
}
// /home was the same as the homepage on Squarespace
fs.mkdirSync(path.join(DIST, 'home'), { recursive: true });
fs.writeFileSync(path.join(DIST, 'home', 'index.html'), withBase(renderPage({ ...site.pages[0], slug: 'home' })));
// 404
fs.writeFileSync(path.join(DIST, '404.html'), withBase(renderPage({
  slug: '404', title: 'Page not found', hidden: true,
  sections: [{ theme: 'bright-inverse', rowsMobile: 8, rowsDesktop: 10, rowScale: 0.0215, padTop: '4vw', padBottom: '4vw', blocks: [{
    id: 'nf', type: 'text', m: { area: '2/2/8/10', z: 1, align: 'flex-start' }, d: { area: '2/2/10/20', z: 1, align: 'flex-start' },
    html: '<h1>Oops!</h1><p>That page does not exist. <a href="/">Back to the homepage</a>.</p>' }] }],
})));

// static assets
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.cpSync(from, to, { recursive: true }); };
copy('src/styles.css', path.join(DIST, 'styles.css'));
copy('src/site.js', path.join(DIST, 'site.js'));
copy('src/favicon.svg', path.join(DIST, 'favicon.svg'));
copy('public/media', path.join(DIST, 'media'));
if (fs.existsSync('public/video')) copy('public/video', path.join(DIST, 'video'));
const fsrc = 'node_modules/@fontsource';
copy(`${fsrc}/archivo-black/files/archivo-black-latin-400-normal.woff2`, path.join(DIST, 'fonts/archivo-black-400.woff2'));
for (const w of [400, 500, 600, 700]) copy(`${fsrc}/space-grotesk/files/space-grotesk-latin-${w}-normal.woff2`, path.join(DIST, `fonts/space-grotesk-${w}.woff2`));
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
fs.writeFileSync(path.join(DIST, 'content.json'), JSON.stringify({ ...site, basePath: BASE_PATH, theme: JSON.parse(fs.readFileSync('src/theme.json', 'utf8')) }));
if (site.domain) fs.writeFileSync(path.join(DIST, 'CNAME'), site.domain + '\n');

// sitemap + robots
if (BASE_URL) {
  const urls = site.pages.filter(p => !p.hidden).map(p => `<url><loc>${BASE_URL}/${p.slug}</loc></url>`).join('');
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
  fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${BASE_URL}/sitemap.xml\n`);
}
console.log('built', site.pages.length + 2, 'pages →', DIST);
