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
      (content.scrollWidth <= W && (innerWidth < 768 || content.scrollHeight <= H)) ? (lo = mid) : (hi = mid);
    }
    content.style.fontSize = lo + 'px';
    void box;
  });
}
document.fonts?.ready.then(fit);
addEventListener('resize', fit);
fit();
