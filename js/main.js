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

/* ---------- count-up（捲動位置驅動） ---------- */
/* 用計時器的話，數字一進入視窗底部就開始跑固定秒數，等使用者真的捲到
   這一段時動畫早就結束了。改成由捲動位置決定數值：元素從視窗底部往上
   移動到約半屏高度的過程，數字從 0 走到終值——捲到定位時剛好到達。 */
const counters = [...document.querySelectorAll('[data-count]')].map((el) => {
  const final = el.dataset.count;
  const m = final.match(/^(\D*)(\d+)(.*)$/s);
  return m
    ? { el, pre: m[1], target: Number(m[2]), post: m[3], final }
    : { el, final };
});

if (counters.length) {
  if (reduceMotion) {
    counters.forEach((c) => { c.el.textContent = c.final; });
    document.querySelectorAll('[data-reveal-at]').forEach((el) => el.classList.add('in'));
  } else {
    /* 曲線要夠平緩。cubic ease-out 在行程 68% 時就已經四捨五入到終值，
       數字會在使用者抵達之前就停住。1.5 次方大約在 90% 才收斂。 */
    const easeOut = (t) => 1 - Math.pow(1 - t, 1.5);

        /* 跟著同一條捲動進度浮現的補充句 */
    const asides = [...document.querySelectorAll('[data-reveal-at]')].map((el) => ({
      el, at: parseFloat(el.dataset.revealAt) || 0.9,
    }));

    function paint() {
      for (const a of asides) {
        const top = a.el.getBoundingClientRect().top;
        const p = Math.min(Math.max((innerHeight - top) / (innerHeight * 0.78), 0), 1);
        a.el.classList.toggle('in', p >= a.at);
      }
      for (const c of counters) {
        if (c.target === undefined) { c.el.textContent = c.final; continue; }
        const top = c.el.getBoundingClientRect().top;
        /* 進場：元素頂端位於視窗底部 → 結束：升到視窗上方約五分之一處，
           也就是使用者確實「抵達」這一段、標題已經讀得到的位置。 */
        const from = innerHeight;
        const to = innerHeight * 0.22;
        const p = Math.min(Math.max((from - top) / (from - to), 0), 1);
        c.el.textContent = c.pre + Math.round(c.target * easeOut(p)) + c.post;
      }
    }

    /* 只在數字接近視窗時才掛捲動監聽，離開就卸掉 */
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { paint(); ticking = false; });
    };

    let listening = false;
    const setListening = (on) => {
      if (on === listening) return;
      listening = on;
      if (on) addEventListener('scroll', onScroll, { passive: true });
      else removeEventListener('scroll', onScroll);
    };

    const countObserver = new IntersectionObserver(
      (entries) => setListening(entries.some((e) => e.isIntersecting)),
      { rootMargin: '100% 0px 100% 0px' }
    );
    counters.forEach((c) => countObserver.observe(c.el));
    paint(); /* 若載入時已捲在該位置（例如帶 #chaos），先算一次 */
  }
}

/* ---------- Hero：靜態 SVG 網格（WebGL 的替代圖與佔位） ---------- */
/* 依容器的實際像素產生，viewBox 與容器 1:1，所以點的大小和間距在任何
   螢幕比例下都一致。用固定 viewBox + preserveAspectRatio="slice" 的話，
   窄長的手機畫面會把整張圖放大兩倍多，點變得又大又疏。 */
const heroSvg = document.getElementById('hero-fallback');
const GRID_SPACING = 26; /* CSS px */
const GRID_RADIUS = 1.5;

function drawFallbackGrid() {
  const box = heroSvg.getBoundingClientRect();
  const w = Math.max(1, Math.round(box.width));
  const h = Math.max(1, Math.round(box.height));
  const cols = Math.max(2, Math.round(w / GRID_SPACING));
  const rows = Math.max(2, Math.round(h / GRID_SPACING));
  const gapX = w / cols;
  const gapY = h / rows;

  const dots = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * gapX;
      const y = (r + 0.5) * gapY;
      dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${GRID_RADIUS}"/>`);
    }
  }
  heroSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  heroSvg.setAttribute('preserveAspectRatio', 'none');
  heroSvg.innerHTML = `<g fill="currentColor" opacity="0.55">${dots.join('')}</g>`;
}

drawFallbackGrid();
addEventListener('resize', drawFallbackGrid);

/* ---------- WebGL 能耗閘門 ---------- */
async function webglBlockedBy() {
  if (reduceMotion) return 'reduced-motion';
  if (navigator.connection?.saveData) return 'save-data';
  /* deviceMemory 出於隱私考量會量化並以 8 為上限，大量手機回報 4，
     那是分桶的結果而非能力指標，不能拿來當弱裝置門檻。
     hardwareConcurrency 只擋真正的低階裝置——這個場景是 288 個點、
     單一 draw call、鎖 30fps，負擔比一個 CSS 過場還低。 */
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) return 'low-cpu';

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
