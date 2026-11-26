// Mobile menu
const body = document.body;
const burger = document.querySelector('.hdr-burger');
burger?.addEventListener('click', () => {
  const open = body.classList.toggle('menu-open');
  burger.setAttribute('aria-expanded', String(open));
  burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') body.classList.remove('menu-open'); });

// "Scaled" text blocks: like Squarespace's auto-fit text, every paragraph is grown on its own to the
// block width (no gaps between them); on desktop the stack is then shrunk if it is taller than the block.
function fit() {
  document.querySelectorAll('.scaled').forEach(block => {
    const content = block.querySelector('.sqs-html-content');
    const kids = [...content.children];
    const W = block.clientWidth, H = block.clientHeight;
    if (!W || !H || !kids.length) return;
    const sizes = kids.map(el => {
      el.style.setProperty('--fit', '100px');
      el.style.display = 'inline-block';
      const w = el.getBoundingClientRect().width;
      el.style.display = '';
      return w ? Math.floor(100 * W / w * 10) / 10 : 100;
    });
    const total = sizes.reduce((a, b) => a + b, 0);
    const shrink = innerWidth >= 768 && total > H ? H / total : 1;
    kids.forEach((el, i) => el.style.setProperty('--fit', Math.floor(sizes[i] * shrink * 10) / 10 + 'px'));
  });
}
document.fonts?.ready.then(fit);
addEventListener('resize', fit);
fit();

// Lightbox for images that had "View fullsize" on Squarespace: one image, 95% backdrop, image as large as
// fits inside a 2% inset, thin boxed close button (Squarespace's image-block lightbox has no arrows)
const triggers = [...document.querySelectorAll('.lb-trigger')];
if (triggers.length) {
  const lb = document.createElement('div');
  lb.className = 'lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Image');
  lb.innerHTML = '<div class="lb-pad"><img alt=""></div><button type="button" class="lb-close" aria-label="Close"></button>';
  document.body.appendChild(lb);
  const pad = lb.querySelector('.lb-pad'), img = lb.querySelector('img'), btn = lb.querySelector('.lb-close');
  let opener = null;
  const size = () => {
    if (!img.naturalWidth) return;
    const wide = img.naturalWidth / img.naturalHeight > pad.clientWidth / pad.clientHeight;
    img.className = wide ? 'fill-width' : 'fill-height';
  };
  img.addEventListener('load', size);
  addEventListener('resize', () => lb.classList.contains('on') && size());
  const open = t => {
    opener = t;
    img.className = ''; img.alt = t.querySelector('img')?.alt || '';
    const [w, h] = [t.querySelector('img')?.getAttribute('width'), t.querySelector('img')?.getAttribute('height')];
    if (w && h) img.className = w / h > innerWidth / innerHeight ? 'fill-width' : 'fill-height';
    img.src = t.dataset.full;
    lb.classList.toggle('light', t.dataset.themeLb === 'light');
    lb.classList.add('on'); document.body.classList.add('lb-open'); btn.focus(); size();
  };
  const close = () => { lb.classList.remove('on'); document.body.classList.remove('lb-open'); opener?.focus(); };
  triggers.forEach(t => t.addEventListener('click', () => open(t)));
  btn.onclick = close;
  lb.addEventListener('click', e => { if (e.target !== img) close(); });
  document.addEventListener('keydown', e => { if (lb.classList.contains('on') && e.key === 'Escape') close(); });
}

// Header: a straight port of Squarespace's "scroll back" header (site-bundle HeaderController).
// Scroll events are batched per animation frame, then run at most once per 100ms (the first event of a burst
// starts a 100ms timer; the handler reads scrollY when it fires). Up-scroll distance between runs adds up,
// but is reset when the previous up-scroll run was more than 500ms ago; the header comes back once it passes
// 200px. Any down-scroll run hides it; within 10px of the top (or with focus inside) it always shows.
const hdr = document.querySelector('.hdr');
if (hdr) {
  let scrollTop = scrollY, distance = 0, then = 0, timer = null, raf = false;
  const shrunk = () => scrollY > 10;
  const show = () => hdr.classList.remove('hdr-hidden');
  const hide = () => hdr.classList.add('hdr-hidden');
  const shrink = () => {
    // past 10px Squarespace adds .shrink: on mobile the header padding drops from 6vw to min(6vw, 2vmax)
    // and the page spacer under it shrinks too, so content moves up with it (removed 300ms after reaching the top)
    if (shrunk()) document.documentElement.classList.add('hdr-shrink');
    else setTimeout(() => document.documentElement.classList.remove('hdr-shrink'), 300);
  };
  const onScroll = () => {
    if (!shrunk() || hdr.matches(':focus-within')) show();
    else if (scrollY > scrollTop) hide();
    else { // "up" (also when unchanged, as on Squarespace)
      const now = Date.now();
      distance += Math.abs(scrollY - scrollTop);
      if (now - then > 500) distance = 0;
      if (distance > 200) show();
      then = now;
    }
    shrink();
    scrollTop = scrollY;
  };
  const throttled = () => { if (!timer) timer = setTimeout(() => { timer = null; onScroll(); }, 100); };
  addEventListener('scroll', () => { if (!raf) { raf = true; requestAnimationFrame(() => { raf = false; throttled(); }); } });
  hdr.addEventListener('focusin', show);
  // Squarespace's header sets scroll-behavior: smooth inline on <html> at start and again whenever the
  // header resizes (ResizeObserver; on phones the scroll shrink resizes it)
  const smooth = () => document.documentElement.style.setProperty('scroll-behavior', 'smooth');
  smooth();
  if (window.ResizeObserver) new ResizeObserver(smooth).observe(hdr);
  if (shrunk()) document.documentElement.classList.add('hdr-shrink'); // a reload part-way down starts shrunk
}

// Accordion (Squarespace website.components.accordion): clicks are ignored while an item animates; unless the
// block allows several open items, opening one closes the others; height animates over 250ms
document.querySelectorAll('.acc').forEach(acc => {
  const multiple = acc.hasAttribute('data-multiple');
  let busy = 0;
  const animate = (d, open) => {
    busy++;
    const from = d.getBoundingClientRect().height;
    if (open) d.open = true; else d.classList.add('acc-closing');
    const to = open ? d.getBoundingClientRect().height : from - d.lastElementChild.getBoundingClientRect().height;
    d.style.height = from + 'px';
    d.classList.add('acc-anim');
    // Squarespace's runOnNextFrame: two animation frames later the target height is set
    requestAnimationFrame(() => requestAnimationFrame(() => { d.style.height = to + 'px'; }));
    setTimeout(() => {
      if (!open) d.open = false;
      d.classList.remove('acc-anim', 'acc-closing');
      d.style.removeProperty('height');
      busy--;
    }, 250);
  };
  acc.querySelectorAll('details').forEach(d => {
    d.querySelector('summary').addEventListener('click', e => {
      e.preventDefault();
      if (busy) return;
      if (d.open) return animate(d, false);
      if (!multiple) acc.querySelectorAll('details[open]').forEach(o => animate(o, false));
      animate(d, true);
    });
  });
});

// Video player that looks like Squarespace's (plyr): round centre play button, bottom bar with
// "00:00 / 00:35", mute and fullscreen, seek bar. Duration comes from data-duration until metadata loads.
const ICON = {
  play: '<svg viewBox="0 0 72 72" aria-hidden="true"><path d="M24.28 54.74V17.26L55.52 36z"/></svg>',
  pause: '<svg viewBox="0 0 72 72" aria-hidden="true"><path d="M42.05 16.04H54v41.9H42.05zM18 57.95v-41.9h11.95v41.9z"/></svg>',
  vol: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="m15 21V3h-1L6 8H1v8h5l8 5h1zm-8-6.55v-4.9l6-3.75v12.4l-6-3.75zM3 10v4h2v-4H3z"/><path d="M17 8a4 4 0 0 1 0 8v2a6 6 0 0 0 0-12v2z"/><path d="M19 12a2 2 0 0 0-2-2v4a2 2 0 0 0 2-2z"/></svg>',
  muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M15 21l1 2h2.24L7.25 1H5l2.9 5.81L6 8H1v8h5l8 5h1zM8.73 8.47 13 17v1.2l-6-3.75v-4.9l1.73-1.08zM3 10v4h2v-4H3z"/><path d="M11.34 4.66l.83 1.66.83-.52v2.19l2 4V3h-1l-2.66 1.66zM17.96 17.92 17 16a4 4 0 0 0 0-8V6a6 6 0 0 1 .96 11.92zM19 12a2 2 0 0 0-2-2v4a2 2 0 0 0 2-2z"/></svg>',
  full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v2H6v4H4zM20 4h-6v2h4v4h2zM10 20H4v-6h2v4h4zM20 20h-6v-2h4v-4h2z"/></svg>',
  exit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 10H4V8h4V4h2zM14 10h6V8h-4V4h-2zM4 14h6v6H8v-4H4zM14 14h6v2h-4v4h-2z"/></svg>',
};
const mmss = t => { t = Math.max(0, Math.floor(t || 0)); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); };
// Squarespace shows the last whole second a clip reaches (a 15.00s clip reads 00:14, 35.08s reads 00:35)
const wholeDur = d => d > 0 ? Math.ceil(d) - 1 : 0;
const durText = d => mmss(wholeDur(d));
document.querySelectorAll('.vp').forEach(frame => {
  const v = frame.querySelector('video');
  if (!v) return;
  v.controls = false;
  frame.classList.add('vp-paused', 'vp-fresh');
  frame.insertAdjacentHTML('beforeend', `<button type="button" class="vp-big" aria-label="Play">${ICON.play}</button>
<div class="vp-bar"><span class="vp-time"><span class="vp-cur">00:00</span> / <span class="vp-dur">${durText(+v.dataset.duration)}</span></span>
<span class="vp-vol"><button type="button" class="vp-btn vp-mute" aria-label="Mute">${ICON.vol}</button><input class="vp-volume" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume" style="--value:100%"></span><button type="button" class="vp-btn vp-fs" aria-label="Enter fullscreen">${ICON.full}</button>
<span class="vp-prog"><input class="vp-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Seek"><span class="vp-tip" aria-hidden="true">00:00</span></span></div>`);
  if ('ontouchstart' in document.documentElement) frame.classList.add('vp-touch'); // plyr--is-touch: no volume slider
  const big = frame.querySelector('.vp-big'), cur = frame.querySelector('.vp-cur'), dur = frame.querySelector('.vp-dur');
  const mute = frame.querySelector('.vp-mute'), fs = frame.querySelector('.vp-fs'), seek = frame.querySelector('.vp-seek');
  const total = () => (isFinite(v.duration) && v.duration) || +v.dataset.duration || 0;
  // the seek bubble is scaled to the duration Squarespace displays (its plyr gets a whole-second duration)
  const shownDur = () => wholeDur(+v.dataset.duration || total());
  const toggle = () => { v.paused || v.ended ? v.play() : v.pause(); };
  let idle;
  const wake = () => { frame.classList.remove('vp-idle'); clearTimeout(idle); if (!v.paused) idle = setTimeout(() => frame.classList.add('vp-idle'), 2000); };
  big.addEventListener('click', toggle);
  v.addEventListener('click', toggle);
  // plyr hides the controls the moment playback starts; they come back on the next pointer move / focus
  v.addEventListener('play', () => {
    frame.classList.remove('vp-paused', 'vp-fresh'); big.setAttribute('aria-label', 'Pause'); big.innerHTML = ICON.pause;
    clearTimeout(idle); frame.classList.add('vp-idle');
  });
  v.addEventListener('pause', () => { frame.classList.add('vp-paused'); big.setAttribute('aria-label', 'Play'); big.innerHTML = ICON.play; wake(); });
  v.addEventListener('loadedmetadata', () => { dur.textContent = durText(+v.dataset.duration || total()); });
  v.addEventListener('timeupdate', () => {
    cur.textContent = mmss(v.currentTime);
    const p = total() ? v.currentTime / total() : 0;
    seek.value = Math.round(p * 1000); seek.style.setProperty('--p', p * 100 + '%');
  });
  // plyr's buffer bar: the loaded stretch around the playhead shows as a lighter band under the white fill
  const buffered = () => {
    const r = v.buffered, d = total();
    let end = 0;
    for (let i = 0; i < r.length; i++) if (r.start(i) <= v.currentTime + .5) end = Math.max(end, r.end(i));
    seek.style.setProperty('--b', (d ? Math.min(1, end / d) : 0) * 100 + '%');
  };
  ['progress', 'loadeddata', 'seeked', 'timeupdate', 'emptied'].forEach(e => v.addEventListener(e, buffered));
  seek.addEventListener('input', () => {
    const t = seek.value / 1000 * total();
    seek.style.setProperty('--p', seek.value / 10 + '%');
    if (v.readyState) v.currentTime = t; else v.addEventListener('loadedmetadata', () => { v.currentTime = t; }, { once: true }), v.preload = 'metadata', v.load();
  });
  // plyr seek tooltip: a time bubble follows the pointer over the seek bar
  const prog = frame.querySelector('.vp-prog'), tip = frame.querySelector('.vp-tip');
  prog.addEventListener('mousemove', e => { // mouse events give whole-pixel clientX, as plyr reads it
    const r = seek.getBoundingClientRect(), pc = Math.min(100, Math.max(0, 100 / r.width * (e.clientX - r.left)));
    tip.textContent = mmss(shownDur() * pc / 100); tip.style.left = pc + '%'; tip.classList.add('on');
  });
  prog.addEventListener('pointerleave', () => tip.classList.remove('on'));
  // plyr volume: slider shows 0 while muted; raising it unmutes, 0 shows the muted icon
  const vol = frame.querySelector('.vp-volume');
  vol.addEventListener('input', () => { v.volume = +vol.value; if (v.muted && v.volume > 0) v.muted = false; else if (v.volume === 0) v.muted = true; });
  mute.addEventListener('click', () => { if (!v.muted && v.volume === 0) v.volume = 1; v.muted = !v.muted; });
  v.addEventListener('volumechange', () => {
    const off = v.muted || v.volume === 0, val = v.muted ? 0 : v.volume;
    vol.value = val; vol.style.setProperty('--value', val * 100 + '%');
    mute.innerHTML = off ? ICON.muted : ICON.vol; mute.setAttribute('aria-label', off ? 'Unmute' : 'Mute');
  });
  fs.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (frame.requestFullscreen) frame.requestFullscreen();
    else v.webkitEnterFullscreen?.();
  });
  document.addEventListener('fullscreenchange', () => {
    const on = document.fullscreenElement === frame;
    fs.innerHTML = on ? ICON.exit : ICON.full; fs.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Enter fullscreen');
  });
  frame.addEventListener('pointermove', wake);
  frame.addEventListener('focusin', wake);
  frame.addEventListener('pointerleave', () => { if (!v.paused) { clearTimeout(idle); frame.classList.add('vp-idle'); } });
});
