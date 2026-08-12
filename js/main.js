const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 年份 ---------- */
document.getElementById('year').textContent = new Date().getFullYear();

/* ---------- 微互動 3：主題切換 ---------- */
const toggle = document.getElementById('theme-toggle');

/* 按鈕的可及名稱是靜態的「Dark mode」，狀態由 aria-pressed 表達；
   顯示哪個圖示純由 CSS 依 data-theme 決定。 */
function applyTheme(dark) {
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  toggle.setAttribute('aria-pressed', String(dark));
}

const storedTheme = localStorage.getItem('theme');
applyTheme(
  storedTheme ? storedTheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
);

toggle.addEventListener('click', () => {
  const next = toggle.getAttribute('aria-pressed') !== 'true';
  const commit = () => {
    applyTheme(next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };
  if (document.startViewTransition && !reduceMotion) document.startViewTransition(commit);
  else commit();
});

/* ---------- 微互動 6：複製 email ---------- */
const copyBtn = document.getElementById('copy-email');
const copyLabel = copyBtn.querySelector('.copy-label');
let copyTimer;

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(copyBtn.dataset.email);
    copyLabel.textContent = 'Copied';
  } catch {
    copyLabel.textContent = 'Select and copy';
  }
  copyBtn.dataset.copied = 'true';
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copyLabel.textContent = 'Copy';
    delete copyBtn.dataset.copied;
  }, 2000);
});

/* ---------- 攝影輪播帶 ---------- */
const strip = document.getElementById('strip');
if (strip) {
  const track = document.getElementById('strip-track');
  const SPEED = 20; /* px/秒，慢速 */

  /* 滿版需要精確扣掉捲軸寬度，否則 50vw 會比可視寬度多出捲軸，
     產生一條水平捲軸。用 overflow:hidden 遮蓋會破壞 sticky 導覽。 */
  const setScrollbarWidth = () =>
    document.documentElement.style.setProperty(
      '--sbw', `${window.innerWidth - document.documentElement.clientWidth}px`);
  setScrollbarWidth();
  addEventListener('resize', setScrollbarWidth);

  /* 內容複製了一份，捲過一半就繞回起點，看起來是無限的 */
  let half = 0;
  const measure = () => { half = track.scrollWidth / 2; };
  measure();
  addEventListener('resize', measure);
  /* 圖片是 lazy 的，載入完寬度才確定 */
  track.querySelectorAll('img').forEach((img) => {
    if (!img.complete) img.addEventListener('load', measure, { once: true });
  });

  let running = false;
  let raf = 0;
  let last = 0;
  let paused = false;
  /* 位置必須用浮點數自己累加。直接對 scrollLeft 做 += 會失敗：
     每幀只前進約 0.33px，而 scrollLeft 會吸附到裝置像素後讀回相同值，
     於是永遠停在原地。 */
  let pos = 0;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    if (paused || !half) return;
    pos += SPEED * dt;
    if (pos >= half) pos -= half;
    strip.scrollLeft = pos;
  }

  /* 使用者用觸控板、鍵盤或拖曳改變位置後，累加器要跟上 */
  const resync = () => { pos = strip.scrollLeft; };
  strip.addEventListener('scroll', () => { if (paused) resync(); }, { passive: true });

  function setRunning(on) {
    if (on === running) return;
    running = on;
    if (on) { last = 0; raf = requestAnimationFrame(tick); }
    else cancelAnimationFrame(raf);
  }

  /* 滑入或聚焦時停下，讓人看得清楚 */
  strip.addEventListener('pointerenter', () => { paused = true; });
  strip.addEventListener('pointerleave', () => { resync(); paused = false; });
  strip.addEventListener('focusin', () => { paused = true; });
  strip.addEventListener('focusout', () => { resync(); paused = false; });

  /* 滑鼠拖曳。觸控不攔截，交給瀏覽器原生的慣性捲動。 */
  let dragging = false;
  let startX = 0;
  let startScroll = 0;

  strip.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    dragging = true;
    paused = true;
    startX = e.clientX;
    startScroll = strip.scrollLeft;
    strip.setPointerCapture(e.pointerId);
    strip.classList.add('is-dragging');
  });

  strip.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    e.preventDefault();
    strip.scrollLeft = startScroll - (e.clientX - startX);
    pos = strip.scrollLeft;
    /* 拖到兩端時把座標繞回去，維持無限感 */
    if (half && strip.scrollLeft >= half) { strip.scrollLeft -= half; startScroll -= half; }
    if (half && strip.scrollLeft <= 0) { strip.scrollLeft += half; startScroll += half; }
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    strip.classList.remove('is-dragging');
    try { strip.releasePointerCapture(e.pointerId); } catch { /* 已釋放 */ }
    resync();
    paused = false;
  }
  strip.addEventListener('pointerup', endDrag);
  strip.addEventListener('pointercancel', endDrag);

  /* 能耗閘門，與 WebGL hero 同一套：
     reduced-motion 不自動捲（但仍可拖曳與鍵盤捲動），
     離開視窗或分頁隱藏就完全停止 rAF。 */
  if (!reduceMotion) {
    const onScreen = () => {
      const r = strip.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight;
    };
    const stripObserver = new IntersectionObserver(([e]) =>
      setRunning(e.isIntersecting && !document.hidden)
    );
    stripObserver.observe(strip);
    document.addEventListener('visibilitychange', () =>
      setRunning(!document.hidden && onScreen())
    );
  }
}

/* ---------- 微互動 5：當前 section ---------- */
const navLinks = [...document.querySelectorAll('.js-nav .nav-list a')];
const sectionFor = new Map();
navLinks.forEach((a) => {
  const section = document.querySelector(a.getAttribute('href'));
  if (section) sectionFor.set(section, a);
});

const navObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      const link = sectionFor.get(e.target);
      if (link) link.classList.toggle('is-current', e.isIntersecting);
    });
  },
  { rootMargin: '-45% 0px -45% 0px' }
);
sectionFor.forEach((_, section) => navObserver.observe(section));

/* ---------- 微互動 1：捲入 ---------- */
if (!reduceMotion) {
  document
    .querySelectorAll('.proj, .path-item, .skill-row, .statement, .act-title, .contact-line, .about')
    .forEach((el) => el.classList.add('reveal'));

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        revealObserver.unobserve(e.target);
      });
    },
    { threshold: 0.15 }
  );
  document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));
}

/* ---------- count-up ---------- */
const countObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      countObserver.unobserve(e.target);
      const final = e.target.dataset.count;
      const m = final.match(/^(\D*)(\d+)(.*)$/s);
      if (reduceMotion || !m) {
        e.target.textContent = final;
        return;
      }
      const [, pre, digits, post] = m;
      const target = Number(digits);
      const start = performance.now();
      const dur = 800;
      const tick = (now) => {
        const t = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        e.target.textContent = pre + Math.round(target * eased) + post;
        if (t < 1) requestAnimationFrame(tick);
      };
      e.target.textContent = pre + '0' + post;
      requestAnimationFrame(tick);
    });
  },
  { threshold: 0.6 }
);
document.querySelectorAll('[data-count]').forEach((el) => countObserver.observe(el));

/* ---------- Hero：靜態 SVG 網格（WebGL 的替代圖與佔位） ---------- */
/* COLS/ROWS 刻意與 hero-gl.js 重複定義，讓 main.js 在 hero-gl.js
   不被載入時仍能獨立運作。兩處必須維持相同數值。 */
const COLS = 24;
const ROWS = 12;
const heroSvg = document.getElementById('hero-fallback');
{
  const dots = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      dots.push(`<circle cx="${25 + c * 22}" cy="${25 + r * 22}" r="1.6"/>`);
    }
  }
  heroSvg.innerHTML = `<g fill="currentColor" opacity="0.55">${dots.join('')}</g>`;
}

/* ---------- WebGL 能耗閘門 ---------- */
async function webglBlockedBy() {
  if (reduceMotion) return 'reduced-motion';
  if (navigator.connection?.saveData) return 'save-data';
  if (navigator.deviceMemory && navigator.deviceMemory <= 4) return 'low-memory';
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) return 'low-cpu';

  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl') && !probe.getContext('experimental-webgl')) return 'no-webgl';

  if (navigator.getBattery) {
    try {
      const b = await navigator.getBattery();
      if (!b.charging && b.level < 0.2) return 'low-battery';
    } catch {
      /* Battery API 不可用視為未觸發 */
    }
  }
  return null;
}

webglBlockedBy().then(async (blocked) => {
  if (blocked) {
    console.info(`[hero] WebGL skipped: ${blocked}`);
    return;
  }
  const canvas = document.getElementById('hero-canvas');
  try {
    const { default: initHero } = await import('./hero-gl.js');
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent')
      .trim();
    const handle = initHero(canvas, { accent });
    if (!handle) return;

    canvas.hidden = false;
    heroSvg.style.display = 'none';

    /* 執行期節流：離開視窗或分頁隱藏即停止 */
    const onScreen = () => canvas.getBoundingClientRect().bottom > 0;
    const heroObserver = new IntersectionObserver(([e]) =>
      handle.setRunning(e.isIntersecting && !document.hidden)
    );
    heroObserver.observe(canvas);
    document.addEventListener('visibilitychange', () =>
      handle.setRunning(!document.hidden && onScreen())
    );
  } catch (err) {
    console.info('[hero] WebGL init failed, keeping static grid', err);
  }
});
