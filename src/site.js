// Mobile menu
const body = document.body;
const burger = document.querySelector('.hdr-burger');
burger?.addEventListener('click', () => {
  const open = body.classList.toggle('menu-open');
  burger.setAttribute('aria-expanded', String(open));
  burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') body.classList.remove('menu-open'); });

// "Scaled" text blocks: grow the text to fill its block, like Squarespace's auto-fit text
function fit() {
  document.querySelectorAll('.scaled').forEach(block => {
    const box = block.querySelector('.sqs-text-block-container');
    const content = block.querySelector('.sqs-html-content');
    const W = block.clientWidth, H = block.clientHeight;
    if (!W || !H) return;
    let lo = 8, hi = 600;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      content.style.fontSize = mid + 'px';
      (content.scrollWidth <= W && (innerWidth < 768 || content.offsetHeight <= H)) ? (lo = mid) : (hi = mid);
    }
    content.style.fontSize = lo + 'px';
    void box;
  });
}
document.fonts?.ready.then(fit);
addEventListener('resize', fit);
fit();

// Lightbox for images that had "View fullsize" on Squarespace
const triggers = [...document.querySelectorAll('.lb-trigger')];
if (triggers.length) {
  const lb = document.createElement('div');
  lb.className = 'lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Image viewer');
  lb.innerHTML = '<img alt=""><button class="lb-prev" aria-label="Previous image">‹</button><button class="lb-next" aria-label="Next image">›</button><button class="lb-close" aria-label="Close">×</button>';
  document.body.appendChild(lb);
  const img = lb.querySelector('img');
  let at = 0, opener = null;
  const show = i => {
    at = (i + triggers.length) % triggers.length;
    const t = triggers[at];
    img.src = t.dataset.full; img.alt = t.querySelector('img')?.alt || '';
    lb.classList.toggle('light', t.dataset.themeLb === 'light');
  };
  const open = i => { opener = document.activeElement; show(i); lb.classList.add('on'); document.body.classList.add('lb-open'); lb.querySelector('.lb-close').focus(); };
  const close = () => { lb.classList.remove('on'); document.body.classList.remove('lb-open'); opener?.focus(); };
  triggers.forEach((t, i) => t.addEventListener('click', () => open(i)));
  lb.querySelector('.lb-close').onclick = close;
  lb.querySelector('.lb-prev').onclick = e => { e.stopPropagation(); show(at - 1); };
  lb.querySelector('.lb-next').onclick = e => { e.stopPropagation(); show(at + 1); };
  lb.addEventListener('click', e => { if (e.target === lb) close(); });
  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('on')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(at - 1);
    if (e.key === 'ArrowRight') show(at + 1);
  });
}

// Header hides on scroll down and comes back after scrolling up ~250px (or at the very top), like Squarespace
const hdr = document.querySelector('.hdr');
if (hdr) {
  let last = scrollY, upFrom = null, ticking = false;
  const update = () => {
    ticking = false;
    const y = Math.max(0, scrollY);
    if (y <= 0) { hdr.classList.remove('hdr-hidden'); upFrom = null; }
    else if (y > last) { hdr.classList.add('hdr-hidden'); upFrom = null; }
    else if (y < last) {
      if (upFrom === null) upFrom = last;
      if (upFrom - y >= 250) hdr.classList.remove('hdr-hidden');
    }
    last = y;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  hdr.addEventListener('focusin', () => hdr.classList.remove('hdr-hidden'));
}
