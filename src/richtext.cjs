// Rich text <-> paragraph/run model shared by the Figma plugin (browser) and figma-sync (node).
// Model: [{ tag: 'h1'|'h2'|'h3'|'h4'|'p'|'pre', type: 'h1'..'h4'|'large'|'p'|'small', align, list, runs: [{ text, color, href, bold, italic }] }]
// color is a palette name ('accent', 'white', ...) or a #hex, or null for the theme default.
(function (root) {
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: '\u00a0' };
  const decode = s => s.replace(/&(#x?[0-9a-f]+|[a-z]+|#39);/gi, (m, e) => {
    if (ENT[e.toLowerCase()] !== undefined) return ENT[e.toLowerCase()];
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1));
    return m;
  });
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escAttr = s => esc(s).replace(/"/g, '&quot;');
  const BLOCK = /^(h[1-6]|p|pre|li)$/;

  function htmlToParas(html) {
    const paras = [];
    const stack = []; // inline formatting stack
    let cur = null, listType = null;
    const start = (tag, attrs) => {
      const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || '';
      const style = (attrs.match(/style="([^"]*)"/) || [])[1] || '';
      const align = (style.match(/text-align:\s*(left|center|right|justify)/) || [])[1] || null;
      let t = tag === 'li' ? 'p' : tag;
      if (/^h[5-6]$/.test(t)) t = 'h4';
      const type = /^h[1-4]$/.test(t) ? t : /sqsrte-large/.test(cls) ? 'large' : /sqsrte-small/.test(cls) ? 'small' : 'p';
      cur = { tag: t, type, align, list: tag === 'li' ? listType : null, runs: [] };
      paras.push(cur);
    };
    const fmt = () => {
      const f = { color: null, href: null, bold: false, italic: false };
      for (const s of stack) Object.assign(f, Object.fromEntries(Object.entries(s).filter(([, v]) => v)));
      return f;
    };
    const re = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi;
    let m;
    while ((m = re.exec(html))) {
      if (m[4] !== undefined) {
        const text = decode(m[4]);
        if (!text) continue;
        if (!cur) { if (!text.trim()) continue; start('p', ''); }
        cur.runs.push({ text, ...fmt() });
        continue;
      }
      const [, close, tagRaw, attrs] = m; const tag = tagRaw.toLowerCase();
      if (tag === 'ul' || tag === 'ol') { listType = close ? null : (tag === 'ul' ? 'UNORDERED' : 'ORDERED'); continue; }
      if (BLOCK.test(tag)) { if (close) { cur = null; } else start(tag, attrs); continue; }
      if (tag === 'br') { if (!cur) start('p', ''); cur.runs.push({ text: '\u2028', ...fmt() }); continue; }
      if (close) { stack.pop(); continue; }
      if (/\/$/.test(attrs)) continue;
      const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || '';
      const st = (attrs.match(/style="([^"]*)"/) || [])[1] || '';
      const f = {};
      const cm = cls.match(/sqsrte-text-color--([A-Za-z]+)/); if (cm) f.color = cm[1];
      const sc = st.match(/(?:^|;)\s*color:\s*(#[0-9a-f]{3,8})/i); if (sc) f.color = sc[1].toUpperCase();
      if (tag === 'a') f.href = decode((attrs.match(/href="([^"]*)"/) || [])[1] || '');
      if (tag === 'strong' || tag === 'b') f.bold = true;
      if (tag === 'em' || tag === 'i') f.italic = true;
      stack.push(f);
    }
    for (const p of paras) {
      const merged = [];
      for (const r of p.runs) {
        const last = merged[merged.length - 1];
        if (last && last.color === r.color && last.href === r.href && last.bold === r.bold && last.italic === r.italic) last.text += r.text;
        else merged.push({ ...r });
      }
      p.runs = merged;
    }
    return paras;
  }

  function parasToHtml(paras) {
    let out = '', inList = null;
    for (const p of paras) {
      if (p.list !== inList) {
        if (inList) out += inList === 'ORDERED' ? '</ol>' : '</ul>';
        if (p.list) out += p.list === 'ORDERED' ? '<ol>' : '<ul>';
        inList = p.list;
      }
      const tag = p.list ? 'li' : p.tag;
      const cls = !/^h/.test(p.tag) && p.type === 'large' ? ' class="sqsrte-large"' : !/^h/.test(p.tag) && p.type === 'small' ? ' class="sqsrte-small"' : '';
      const style = p.align && p.align !== 'left' ? ` style="text-align: ${p.align}"` : '';
      let inner = '';
      for (const r of p.runs) {
        let t = esc(r.text).replace(/\u2028/g, '<br>');
        if (p.tag === 'pre') t = `<code>${t}</code>`;
        if (r.bold) t = `<strong>${t}</strong>`;
        if (r.italic) t = `<em>${t}</em>`;
        if (r.color) t = r.color[0] === '#' ? `<span style="color:${r.color}">${t}</span>` : `<span class="sqsrte-text-color--${r.color}">${t}</span>`;
        if (r.href) t = `<a href="${escAttr(r.href)}"${/^https?:/.test(r.href) ? ' target="_blank"' : ''}>${t}</a>`;
        inner += t;
      }
      out += `<${tag}${cls}${style}>${inner}</${tag}>`;
    }
    if (inList) out += inList === 'ORDERED' ? '</ol>' : '</ul>';
    return out;
  }

  const plain = paras => paras.map(p => p.runs.map(r => r.text).join('')).join('\n');
  const api = { htmlToParas, parasToHtml, plain, decode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RichText = api;
})(typeof self !== 'undefined' ? self : this);
