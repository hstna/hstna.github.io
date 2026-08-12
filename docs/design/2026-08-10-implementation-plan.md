# Portfolio 極簡重構 Implementation Plan

**Goal:** 把現行 683 行單檔 portfolio 重構為極簡、有 scroll storytelling、含受控 WebGL、達 WCAG AA、且碳足跡低於現況的靜態單頁網站。

**Architecture:** 靜態網站，無建置步驟，GitHub Pages 託管。從單檔拆成 `index.html` + `css/main.css` + `js/main.js` + `js/hero-gl.js`。拆檔的關鍵目的是讓 WebGL 程式碼能在不該執行的裝置上**完全不下載**。所有 JS 為原生，無框架、無函式庫。

**Tech Stack:** HTML5、CSS（原生巢狀不使用，維持扁平以求相容）、原生 JavaScript（ES2020）、原生 WebGL 1.0、IntersectionObserver、View Transitions API（漸進增強）。

**Spec:** [2026-08-10-design.md](2026-08-10-design.md)

## Global Constraints

- **無第三方執行期請求。** 頁面載入後不得向任何非同源網域發出請求。字體必須自托管。
- **無建置步驟。** 不新增 `package.json`、不新增打包器。檔案直接由 GitHub Pages 提供。
- **無 JS 函式庫。** 不使用 three.js、GSAP、Lenis 或任何動畫／WebGL 函式庫。
- **色彩值（精確，逐字使用）：**
  - Light：背景 `#fbfbfa`、文字 `#16161a`、次要文字 `#5c5c66`、分隔線 `#e4e4e0`、強調色 `#15803d`
  - Dark：背景 `#0d0d0e`、文字 `#ececea`、次要文字 `#9a9aa4`、分隔線 `#26262b`、強調色 `#4ade80`
- **禁用元素：** 任何 `box-shadow`、任何 `linear-gradient`／`radial-gradient` 作為裝飾、任何 emoji 字元、任何 `filter: blur()` 動畫、任何 `-webkit-text-fill-color: transparent`。
- **動作偏好：** 每一個動畫都必須在 `prefers-reduced-motion: reduce` 下降級為無位移的等效行為，功能保留。
- **驗收門檻：** 首次載入 < 60KB、Lighthouse Performance ≥ 98、Accessibility = 100、第三方請求 = 0。全部實測。
- **內容真實性：** 所有文案數字必須來自現行 `index.html`，不得杜撰新的成就或指標。

---

## File Structure

| 檔案 | 職責 |
| --- | --- |
| `index.html` | 結構與內容。含內嵌的靜態 SVG 網格（WebGL 替代圖／佔位） |
| `css/main.css` | 全部樣式。色彩 token、排版、五幕版面、微互動的 CSS 部分 |
| `js/main.js` | 主題切換、count-up、當前 section 標示、複製 email、WebGL 閘門判斷與惰性載入 |
| `js/hero-gl.js` | WebGL 粒子對齊動畫。只由 `main.js` 在通過閘門後動態 import |
| `fonts/mono.woff2` | subset 等寬體，僅數字與少量符號 |
| `index.html`（舊） | 由 Task 1 起逐步替換；原始版本已在 git 歷史 `b08f32c` |

---

## Task 1: 字體資產與檔案骨架

**Files:**
- Create: `fonts/mono.woff2`
- Create: `css/main.css`
- Create: `js/main.js`
- Create: `.nojekyll`

**Interfaces:**
- Produces: `fonts/mono.woff2`（供 `css/main.css` 的 `@font-face` 使用，family name `Mono`）；`css/main.css` 的色彩 custom properties（供後續所有樣式使用）

- [ ] **Step 1: 下載 subset 等寬體**

JetBrains Mono 為 OFL 授權，允許自托管。用 Google Fonts 的 `text=` 參數取得只含所需字符的 subset。

```bash
cd /Users/nahla/Documents/Portfolio
mkdir -p fonts css js
curl -sS -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36" \
  "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500&text=0123456789.%25\$+-/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz%E2%86%92%C2%B7" \
  -o /tmp/gf.css
cat /tmp/gf.css
```

Expected: CSS 內含一個 `src: url(https://fonts.gstatic.com/...woff2)`。

- [ ] **Step 2: 取出 woff2 並存到 fonts/**

```bash
cd /Users/nahla/Documents/Portfolio
URL=$(grep -o 'https://fonts.gstatic.com[^)]*' /tmp/gf.css | head -1)
echo "downloading: $URL"
curl -sS "$URL" -o fonts/mono.woff2
ls -l fonts/mono.woff2
```

Expected: 檔案存在且 < 15000 bytes。

**若 Step 1 或 2 失敗（無網路／被擋）：** 刪除 `fonts/`，跳過 Step 3 的 `@font-face`，並在 Step 3 把 `--font-mono` 定義為 `ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace`。其餘任務不受影響。

- [ ] **Step 3: 建立 css/main.css 的 token 層**

```css
/* ============ Font ============ */
@font-face {
  font-family: "Mono";
  src: url("../fonts/mono.woff2") format("woff2");
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}

/* ============ Tokens ============ */
:root {
  color-scheme: light dark;

  --bg: #fbfbfa;
  --text: #16161a;
  --muted: #5c5c66;
  --rule: #e4e4e0;
  --accent: #15803d;
  --on-accent: #ffffff;

  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: "Mono", ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;

  --measure: 68ch;
  --gutter: clamp(20px, 5vw, 48px);
  --step: clamp(64px, 10vw, 128px);
}

[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0d0d0e;
  --text: #ececea;
  --muted: #9a9aa4;
  --rule: #26262b;
  --accent: #4ade80;
  --on-accent: #08120c;
}

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 17px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}

/* 全站唯一的焦點樣式 */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
  border-radius: 2px;
}

@media (forced-colors: active) {
  :focus-visible { outline: 2px solid CanvasText; }
}
```

- [ ] **Step 4: 建立 .nojekyll**

GitHub Pages 預設走 Jekyll，會忽略底線開頭的目錄。加這個檔案關掉它，避免未來新增資產時踩雷。

```bash
cd /Users/nahla/Documents/Portfolio && touch .nojekyll
```

- [ ] **Step 5: 驗證字體實際可解析**

```bash
cd /Users/nahla/Documents/Portfolio
python3 -c "
d=open('fonts/mono.woff2','rb').read()
assert d[:4]==b'wOF2', 'not a woff2 file'
print('woff2 ok,', len(d), 'bytes')
"
```

Expected: `woff2 ok, <15000 bytes`。若上一步走了 fallback 路徑則跳過。

- [ ] **Step 6: Commit**

```bash
cd /Users/nahla/Documents/Portfolio
git add fonts css .nojekyll
git commit -m "Add self-hosted subset mono font and CSS token layer"
```

---

## Task 2: 重寫 index.html 結構為五幕

**Files:**
- Modify: `index.html`（完全重寫 body；head 保留現有 meta 內容並修正）

**Interfaces:**
- Consumes: `css/main.css` 的 token（Task 1）
- Produces: DOM 契約，供 Task 3/4 使用：
  - `#hero-canvas`（`<canvas>`，WebGL 目標）
  - `#hero-fallback`（`<svg>`，靜態網格）
  - `[data-count]`（count-up 目標，屬性值為最終顯示字串）
  - `#theme-toggle`（`<button>`）
  - `#copy-email`（`<button>`，`data-email` 屬性帶信箱）
  - `section[id]`（供當前 section 標示）
  - `.js-nav a[href^="#"]`（導覽連結）

- [ ] **Step 1: 寫入新的 index.html**

內容全部沿用現行版本的事實，僅重新組織。五幕：Hero、幕1 混亂、幕2 收斂、幕3 路徑、幕4 現在。

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <title>Shih-Ting Huang | Software Engineer</title>
  <meta name="description" content="Shih-Ting Huang — M.S. Computer Science student at Northeastern University with 6 years turning manual supply-chain operations into reliable software." />
  <meta name="author" content="Shih-Ting Huang" />

  <meta property="og:title" content="Shih-Ting Huang | Software Engineer" />
  <meta property="og:description" content="I turn messy, manual operations into reliable software. Backend & automation · M.S. CS @ Northeastern" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://hstna.github.io/" />

  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%2315803d'/%3E%3Cpath d='M9 21V11h2.6l2.4 6 2.4-6H19v10h-2v-6.6L15.2 21h-2.4L11 14.4V21z' fill='%23fff'/%3E%3C/svg%3E" />

  <link rel="preload" href="fonts/mono.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="css/main.css" />
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>

  <nav class="nav js-nav" aria-label="Primary">
    <a class="nav-brand" href="#top">ST Huang</a>
    <ul class="nav-list">
      <li><a href="#chaos">Problem</a></li>
      <li><a href="#work">Work</a></li>
      <li><a href="#path">Path</a></li>
      <li><a href="#now">Now</a></li>
    </ul>
    <button id="theme-toggle" type="button" aria-pressed="false">
      <span class="tt-label">Dark</span>
    </button>
  </nav>

  <!-- ============ 幕 0 — Hero ============ -->
  <header class="hero" id="top">
    <div class="hero-visual" aria-hidden="true">
      <svg id="hero-fallback" viewBox="0 0 600 300" preserveAspectRatio="xMidYMid slice"></svg>
      <canvas id="hero-canvas" hidden></canvas>
    </div>

    <div class="hero-copy">
      <p class="eyebrow"><span class="mono">Seeking SWE Internship</span> · Summer 2027</p>
      <h1>I turn messy, manual<br />operations into<br /><em>reliable software.</em></h1>
      <p class="lede">
        Shih-Ting Huang — six years building automation, data integration, and
        planning tools for semiconductor supply chains. Now an M.S. Computer
        Science student at Northeastern University.
      </p>
      <p class="hero-actions">
        <a class="btn" href="#work">See the work</a>
        <a class="btn btn-quiet" href="#now">Get in touch</a>
      </p>
    </div>
  </header>

  <main id="main">

    <!-- ============ 幕 1 — 混亂 ============ -->
    <section class="act" id="chaos">
      <p class="act-num mono">01 — The problem</p>
      <h2 class="statement">
        Fifteen vendor formats.<br />
        Three days a month.<br />
        <em>All of it by hand.</em>
      </h2>
      <p class="act-body">
        Procurement data arrived as spreadsheets that no two vendors formatted
        the same way. Header rows moved. Column names drifted. Someone
        reconciled it manually, every month, while $6M of pandemic-era import
        volume depended on getting it right.
      </p>
    </section>

    <!-- ============ 幕 2 — 收斂 ============ -->
    <section class="act" id="work">
      <p class="act-num mono">02 — The work</p>
      <h2 class="act-title">Three times I closed that gap.</h2>

      <article class="proj">
        <header class="proj-head">
          <h3>ERP Data Integration Tool</h3>
          <p class="proj-meta mono">Mar 2023 – Dec 2023 · deployed internally</p>
        </header>
        <p class="shift">
          <span class="shift-from">3 days</span>
          <span class="shift-arrow mono" aria-hidden="true">→</span>
          <span class="shift-to mono" data-count="&lt; 1 hour">&lt; 1 hour</span>
          <span class="shift-what">monthly consolidation</span>
        </p>
        <p class="proj-body">
          A Python app that auto-detects header rows across inconsistent Excel
          layouts and maps raw columns to 15 canonical fields by regex. Ingestion,
          transformation, and validation are layered so a new ERP format onboards
          by adding a regex — not by touching the pipeline.
        </p>
        <p class="tags mono"><span>Python</span><span>pandas</span><span>Tkinter</span></p>
      </article>

      <article class="proj">
        <header class="proj-head">
          <h3>RFID Inventory Service</h3>
          <p class="proj-meta mono">Aug 2017 – Jan 2018 · Brantabee Italia</p>
        </header>
        <p class="shift">
          <span class="shift-from">~2%</span>
          <span class="shift-arrow mono" aria-hidden="true">→</span>
          <span class="shift-to mono" data-count="near-zero">near-zero</span>
          <span class="shift-what">duplicate order rate</span>
        </p>
        <p class="proj-body">
          A Spring Boot REST service mapping RFID scan events to inventory state
          transitions in PostgreSQL, across 200+ smart wine dispensers. The fix
          was making the reorder APIs idempotent, so a repeated scan stopped
          becoming a repeated order.
        </p>
        <p class="tags mono"><span>Java</span><span>Spring Boot</span><span>PostgreSQL</span></p>
      </article>

      <article class="proj">
        <header class="proj-head">
          <h3>FlexLab Event Board</h3>
          <p class="proj-meta mono">Feb 2026 – Jun 2026 · Northeastern FlexLab</p>
        </header>
        <p class="shift">
          <span class="shift-from">paper sign-ups</span>
          <span class="shift-arrow mono" aria-hidden="true">→</span>
          <span class="shift-to mono" data-count="self-serve kiosk">self-serve kiosk</span>
          <span class="shift-what">workshop registration</span>
        </p>
        <p class="proj-body">
          A touchscreen kiosk rendering workshop cards from Supabase over REST,
          with in-app registration and a keyword-matched FAQ chatbot. Staff
          records stay current through a SharePoint sync via Azure Logic Apps.
        </p>
        <p class="tags mono"><span>Supabase</span><span>REST API</span><span>Azure Logic Apps</span></p>
      </article>

      <article class="proj">
        <header class="proj-head">
          <h3>Topic Voting Platform</h3>
          <p class="proj-meta mono">Jan 2026 – Apr 2026 · team project</p>
        </header>
        <p class="shift">
          <span class="shift-from">6 views, tangled</span>
          <span class="shift-arrow mono" aria-hidden="true">→</span>
          <span class="shift-to mono" data-count="1 controller">1 controller</span>
          <span class="shift-what">business logic</span>
        </p>
        <p class="proj-body">
          All business logic routes through a single AppController, keeping six
          views free of it. The data layer is configurable, so the same code runs
          offline against CSV or live against a Spring Boot REST API.
        </p>
        <p class="tags mono"><span>Java</span><span>Spring Boot</span><span>MVC</span></p>
      </article>
    </section>

    <!-- ============ 幕 3 — 路徑 ============ -->
    <section class="act" id="path">
      <p class="act-num mono">03 — The path</p>
      <h2 class="act-title">Industrial design to computer science.</h2>

      <ol class="path-list">
        <li class="path-item">
          <p class="path-date mono">Sep 2025 – Apr 2028</p>
          <h3>Northeastern University</h3>
          <p class="path-sub">M.S. Computer Science <span class="muted">· Seattle, WA</span></p>
        </li>
        <li class="path-item">
          <p class="path-date mono">Mar 2019 – Mar 2025</p>
          <h3>Supertung Industrial Co., Ltd.</h3>
          <p class="path-sub">Procurement Analytics &amp; Automation Specialist <span class="muted">· Taichung, Taiwan</span></p>
          <p class="path-body">
            Built the ERP integration tool and a Python capacity-planning model
            forecasting warehouse utilization. Ensured material availability for
            fab customers including TSMC, UMC, PSMC, and Micron.
          </p>
        </li>
        <li class="path-item">
          <p class="path-date mono">Aug 2017 – Jan 2018</p>
          <h3>Brantabee Italia</h3>
          <p class="path-sub">Software Engineering Intern <span class="muted">· Corciano, Italy</span></p>
        </li>
        <li class="path-item">
          <p class="path-date mono">Sep 2013 – Jun 2017</p>
          <h3>Tunghai University</h3>
          <p class="path-sub">B.A. Industrial Design <span class="muted">· Taichung, Taiwan</span></p>
        </li>
      </ol>
    </section>

    <!-- ============ 幕 4 — 現在 ============ -->
    <section class="act" id="now">
      <p class="act-num mono">04 — Now</p>
      <h2 class="act-title">What I work with, and where to find me.</h2>

      <div class="skills">
        <div class="skill-row">
          <h3 class="mono">Languages</h3>
          <p>Python · SQL · Java</p>
        </div>
        <div class="skill-row">
          <h3 class="mono">Data</h3>
          <p>pandas · PostgreSQL · ETL pipelines · Data modeling · Process automation · REST APIs</p>
        </div>
        <div class="skill-row">
          <h3 class="mono">Cloud &amp; tools</h3>
          <p>AWS Certified AI Practitioner · Azure · Git · Google Apps Script · Tkinter</p>
        </div>
        <div class="skill-row">
          <h3 class="mono">Domain</h3>
          <p>Fab utility systems (CDS, UPW, wastewater) · Demand forecasting · Supply chain analytics</p>
        </div>
      </div>

      <div class="contact">
        <p class="contact-line">
          <span class="contact-label mono">Email</span>
          <a href="mailto:sthuangna@gmail.com">sthuangna@gmail.com</a>
          <button id="copy-email" type="button" data-email="sthuangna@gmail.com">
            <span class="copy-label">Copy</span>
          </button>
        </p>
        <p class="contact-line">
          <span class="contact-label mono">LinkedIn</span>
          <a href="https://www.linkedin.com/in/hstna/" rel="noopener noreferrer">linkedin.com/in/hstna</a>
        </p>
        <p class="contact-line">
          <span class="contact-label mono">GitHub</span>
          <a href="https://github.com/hstna" rel="noopener noreferrer">github.com/hstna</a>
        </p>
        <address class="contact-line">
          <span class="contact-label mono">Based in</span>
          <span>Seattle, WA</span>
        </address>
      </div>
    </section>
  </main>

  <footer class="foot">
    <p class="mono">© <span id="year">2026</span> Shih-Ting Huang</p>
    <p class="foot-note">
      Built as one static page. No trackers, no third-party requests, no
      framework. The hero animation does not run if your device is low on
      battery, low on power, or you have asked for reduced motion.
    </p>
  </footer>

  <script src="js/main.js" type="module"></script>
</body>
</html>
```

- [ ] **Step 2: 驗證 HTML 結構完整性**

```bash
cd /Users/nahla/Documents/Portfolio
python3 - <<'PY'
import re, html.parser
src = open('index.html', encoding='utf-8').read()

# 禁用元素檢查
assert 'box-shadow' not in src, 'box-shadow found in html'
assert '-webkit-text-fill-color' not in src, 'gradient text hack found'
emoji = [c for c in src if ord(c) > 0x1F000]
assert not emoji, f'emoji found: {emoji}'

# DOM 契約檢查
for need in ['id="hero-canvas"', 'id="hero-fallback"', 'id="theme-toggle"',
             'id="copy-email"', 'id="year"', 'class="skip"', 'data-count']:
    assert need in src, f'missing: {need}'

# 每個導覽 href 都要有對應 id
ids = set(re.findall(r'id="([^"]+)"', src))
for href in re.findall(r'href="#([^"]+)"', src):
    assert href in ids, f'dangling anchor: #{href}'

print('html structure ok;', len(ids), 'ids')
PY
```

Expected: `html structure ok; N ids`，無 assertion 錯誤。

- [ ] **Step 3: Commit**

```bash
cd /Users/nahla/Documents/Portfolio
git add index.html
git commit -m "Restructure page into five-act narrative, remove emoji and gradient text"
```

---

## Task 3: 極簡樣式

**Files:**
- Modify: `css/main.css`（在 Task 1 的 token 層之後追加）

**Interfaces:**
- Consumes: Task 1 的 custom properties、Task 2 的 class 名稱
- Produces: `.is-current`（導覽當前項，Task 4 的 JS 會加上）、`.reveal` / `.reveal.in`（捲入，Task 4 使用）

- [ ] **Step 1: 追加版面與元件樣式到 css/main.css**

```css
/* ============ Skip link ============ */
.skip {
  position: absolute;
  left: -9999px;
  top: 0;
  background: var(--accent);
  color: var(--on-accent);
  padding: 10px 16px;
  z-index: 100;
}
.skip:focus { left: 8px; top: 8px; }

/* ============ 排版基礎 ============ */
h1, h2, h3 { font-weight: 600; letter-spacing: -0.02em; line-height: 1.15; margin: 0; }
h1 { font-size: clamp(2.1rem, 6vw, 3.6rem); }
h2 { font-size: clamp(1.6rem, 4vw, 2.4rem); }
h3 { font-size: 1.05rem; letter-spacing: -0.01em; }
p { margin: 0; }
em { font-style: normal; color: var(--accent); }

.mono { font-family: var(--font-mono); font-weight: 500; font-size: 0.8em; letter-spacing: 0.02em; }
.muted { color: var(--muted); }

a { color: inherit; text-decoration: none; }

/* 微互動 2：底線由左畫出 */
main a[href], .foot a[href] {
  background-image: linear-gradient(var(--accent), var(--accent));
  background-repeat: no-repeat;
  background-position: 0 100%;
  background-size: 100% 1px;
  padding-bottom: 1px;
}
@media (prefers-reduced-motion: no-preference) {
  main a[href], .foot a[href] {
    background-size: 0% 1px;
    transition: background-size 0.28s ease;
  }
  main a[href]:hover, main a[href]:focus-visible,
  .foot a[href]:hover, .foot a[href]:focus-visible { background-size: 100% 1px; }
}

/* ============ 導覽 ============ */
.nav {
  position: sticky; top: 0; z-index: 50;
  display: flex; align-items: center; gap: 24px;
  padding: 14px var(--gutter);
  background: var(--bg);
  border-bottom: 1px solid var(--rule);
}
.nav-brand { font-weight: 600; letter-spacing: -0.01em; margin-right: auto; }
.nav-list { display: flex; gap: 20px; list-style: none; margin: 0; padding: 0; }
.nav-list a {
  font-size: 0.9rem; color: var(--muted);
  padding-bottom: 2px; border-bottom: 1px solid transparent;
}
.nav-list a:hover { color: var(--text); }
.nav-list a.is-current { color: var(--text); border-bottom-color: var(--accent); }

#theme-toggle {
  font: inherit; font-size: 0.85rem;
  background: none; border: 1px solid var(--rule); color: var(--muted);
  padding: 5px 12px; border-radius: 999px; cursor: pointer;
}
#theme-toggle:hover { color: var(--text); border-color: var(--muted); }

/* 手機：導覽移到底部，不隱藏 */
@media (max-width: 640px) {
  .nav {
    position: fixed; bottom: 0; top: auto; width: 100%;
    border-bottom: none; border-top: 1px solid var(--rule);
    padding: 10px 16px; gap: 12px;
  }
  .nav-brand { display: none; }
  .nav-list { flex: 1; justify-content: space-around; gap: 0; }
  .nav-list a { font-size: 0.82rem; }
  body { padding-bottom: 60px; }
}

/* ============ 幕 0 — Hero ============ */
.hero {
  position: relative;
  min-height: 88vh;
  display: flex; align-items: center;
  padding: var(--step) var(--gutter);
  overflow: hidden;
}
.hero-visual {
  position: absolute; inset: 0;
  pointer-events: none;
  opacity: 0.5;
}
.hero-visual svg, .hero-visual canvas {
  width: 100%; height: 100%; display: block;
}
[data-theme="dark"] .hero-visual { opacity: 0.62; }

.hero-copy { position: relative; max-width: var(--measure); }
.eyebrow { color: var(--muted); font-size: 0.85rem; margin-bottom: 24px; }
.lede { color: var(--muted); max-width: 46ch; margin: 24px 0 34px; }

.hero-actions { display: flex; gap: 12px; flex-wrap: wrap; }
.btn {
  display: inline-block;
  padding: 11px 22px;
  background: var(--accent); color: var(--on-accent);
  font-size: 0.92rem; font-weight: 500;
  background-image: none !important; /* 覆蓋底線微互動 */
}
.btn-quiet {
  background: none; color: var(--text);
  border: 1px solid var(--rule);
}
.btn-quiet:hover { border-color: var(--accent); color: var(--accent); }

/* ============ 幕 ============ */
main { padding: 0 var(--gutter); }
.act {
  max-width: var(--measure);
  margin: 0 auto;
  padding: var(--step) 0;
  border-top: 1px solid var(--rule);
  scroll-margin-top: 80px;
}
.act-num { color: var(--muted); display: block; margin-bottom: 28px; }
.act-title { margin-bottom: 40px; }
.act-body { color: var(--muted); max-width: 56ch; margin-top: 28px; }

.statement { font-size: clamp(1.9rem, 5.5vw, 3rem); line-height: 1.2; }

/* ============ 專案 ============ */
.proj { padding: 36px 0; border-top: 1px solid var(--rule); }
.proj:first-of-type { border-top: none; padding-top: 0; }
.proj-head { margin-bottom: 20px; }
.proj-meta { color: var(--muted); margin-top: 4px; }
.proj-body { color: var(--muted); max-width: 56ch; margin: 18px 0; }

/* before → after 轉場 */
.shift {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px;
  font-size: 1.15rem;
}
.shift-from { color: var(--muted); text-decoration: line-through; text-decoration-thickness: 1px; }
.shift-arrow { color: var(--muted); }
.shift-to { color: var(--accent); font-size: 1.15rem; font-weight: 500; }
.shift-what { color: var(--muted); font-size: 0.9rem; width: 100%; }

.tags { display: flex; flex-wrap: wrap; gap: 8px; }
.tags span { color: var(--muted); border: 1px solid var(--rule); padding: 3px 10px; }

/* ============ 路徑 ============ */
.path-list { list-style: none; margin: 0; padding: 0 0 0 24px; position: relative; }
.path-list::before {
  content: ""; position: absolute; left: 0; top: 6px; bottom: 6px;
  width: 1px; background: var(--rule);
}
.path-item { position: relative; padding-bottom: 40px; }
.path-item:last-child { padding-bottom: 0; }
.path-item::before {
  content: ""; position: absolute; left: -28px; top: 9px;
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--bg); border: 1px solid var(--muted);
}
.path-date { color: var(--muted); margin-bottom: 6px; }
.path-sub { color: var(--muted); font-size: 0.95rem; margin-top: 3px; }
.path-body { color: var(--muted); font-size: 0.95rem; max-width: 54ch; margin-top: 12px; }

/* 微互動 4：時間線隨捲動繪出，零 JS */
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .path-list::before {
      background: var(--accent);
      transform-origin: top;
      animation: draw-line linear both;
      animation-timeline: view();
      animation-range: cover 8% cover 62%;
    }
    @keyframes draw-line { from { scale: 1 0; } to { scale: 1 1; } }
  }
}

/* ============ Skills + Contact ============ */
.skills { margin-bottom: 56px; }
.skill-row {
  display: grid; grid-template-columns: 150px 1fr; gap: 20px;
  padding: 16px 0; border-top: 1px solid var(--rule);
}
.skill-row h3 { color: var(--muted); font-weight: 500; }
@media (max-width: 560px) {
  .skill-row { grid-template-columns: 1fr; gap: 6px; }
}

.contact { border-top: 1px solid var(--rule); padding-top: 28px; }
.contact-line {
  display: flex; align-items: baseline; gap: 16px;
  padding: 10px 0; font-style: normal;
}
.contact-label { color: var(--muted); width: 90px; flex: none; }

#copy-email {
  font: inherit; font-size: 0.78rem;
  background: none; border: 1px solid var(--rule); color: var(--muted);
  padding: 2px 10px; cursor: pointer;
}
#copy-email:hover { color: var(--accent); border-color: var(--accent); }
#copy-email[data-copied="true"] { color: var(--accent); border-color: var(--accent); }

/* ============ 頁尾 ============ */
.foot {
  max-width: var(--measure); margin: 0 auto;
  padding: var(--step) var(--gutter) calc(var(--step) / 2);
  border-top: 1px solid var(--rule);
  color: var(--muted);
}
.foot-note { font-size: 0.85rem; max-width: 52ch; margin-top: 12px; }

/* ============ 捲入 ============ */
@media (prefers-reduced-motion: no-preference) {
  .reveal { opacity: 0; transform: translateY(14px); }
  .reveal.in {
    opacity: 1; transform: none;
    transition: opacity 0.5s ease, transform 0.5s ease;
  }
}

/* ============ 錨點捲動 ============ */
@media (prefers-reduced-motion: no-preference) {
  html { scroll-behavior: smooth; }
}

/* ============ 高對比模式 ============ */
@media (forced-colors: active) {
  .hero-visual { display: none; }
  .btn { border: 1px solid ButtonText; }
}
```

- [ ] **Step 2: 驗證禁用元素未出現在 CSS**

```bash
cd /Users/nahla/Documents/Portfolio
python3 - <<'PY'
css = open('css/main.css', encoding='utf-8').read()
banned = ['box-shadow', '-webkit-text-fill-color', 'backdrop-filter', 'filter: blur']
for b in banned:
    assert b not in css, f'banned: {b}'
# 漸層只允許用於連結底線那一處（純色 linear-gradient 當底線用）
grads = css.count('linear-gradient')
assert grads == 1, f'expected exactly 1 linear-gradient (underline), got {grads}'
print('css ok, no banned properties')
PY
```

Expected: `css ok, no banned properties`

- [ ] **Step 3: 在瀏覽器開啟並目視確認版面成形**

啟動本機伺服器（module script 需要 http，`file://` 會被 CORS 擋）：

```bash
cd /Users/nahla/Documents/Portfolio && python3 -m http.server 8765
```

在瀏覽器開 `http://localhost:8765`，確認：頁面有內容、無卡片陰影、五個區塊都在、Hero 區有留白（此時 SVG 還是空的，Task 4 才填）。

- [ ] **Step 4: Commit**

```bash
cd /Users/nahla/Documents/Portfolio
git add css/main.css
git commit -m "Add minimal layout: hairline rules, no shadows, single accent"
```

---

## Task 4: 微互動與主題（js/main.js）

**Files:**
- Create: `js/main.js`（Task 1 已建空檔，此處寫入內容）

**Interfaces:**
- Consumes: Task 2 的 DOM 契約
- Produces: `initHero(canvas)` 的呼叫契約 — `js/hero-gl.js` 必須 `export default function initHero(canvas: HTMLCanvasElement, opts: {accent: string}): () => void`，回傳一個停止函式。Task 5 實作它。

- [ ] **Step 1: 寫入 js/main.js**

```js
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 年份 ---------- */
document.getElementById('year').textContent = new Date().getFullYear();

/* ---------- 微互動 3：主題切換 ---------- */
const toggle = document.getElementById('theme-toggle');
const label = toggle.querySelector('.tt-label');

function applyTheme(dark) {
  document.documentElement.toggleAttribute('data-theme', dark);
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  toggle.setAttribute('aria-pressed', String(dark));
  label.textContent = dark ? 'Light' : 'Dark';
}

const stored = localStorage.getItem('theme');
applyTheme(stored ? stored === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);

toggle.addEventListener('click', () => {
  const next = toggle.getAttribute('aria-pressed') !== 'true';
  const commit = () => {
    applyTheme(next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };
  if (document.startViewTransition && !reduceMotion) {
    document.startViewTransition(commit);
  } else {
    commit();
  }
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
    copyLabel.textContent = 'Press ⌘C';
  }
  copyBtn.dataset.copied = 'true';
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copyLabel.textContent = 'Copy';
    delete copyBtn.dataset.copied;
  }, 2000);
});

/* ---------- 微互動 5：當前 section ---------- */
const navLinks = [...document.querySelectorAll('.js-nav .nav-list a')];
const sectionFor = new Map(
  navLinks.map((a) => [document.querySelector(a.getAttribute('href')), a])
);

const navObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      const link = sectionFor.get(e.target);
      if (link) link.classList.toggle('is-current', e.isIntersecting);
    });
  },
  { rootMargin: '-45% 0px -45% 0px' }
);
sectionFor.forEach((_, section) => section && navObserver.observe(section));

/* ---------- 微互動 1：捲入 + count-up ---------- */
if (!reduceMotion) {
  document.querySelectorAll('.proj, .path-item, .skill-row, .statement, .act-title')
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

/* count-up：只對純數字開頭的目標做逐格遞增，其餘直接顯示 */
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
      const dur = 700;
      const tick = (now) => {
        const t = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        e.target.textContent = pre + Math.round(target * eased) + post;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  },
  { threshold: 0.6 }
);
document.querySelectorAll('[data-count]').forEach((el) => countObserver.observe(el));

/* ---------- Hero：靜態 SVG 網格 ---------- */
const COLS = 24;
const ROWS = 12;
const svg = document.getElementById('hero-fallback');
{
  const dots = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = 25 + c * 22;
      const y = 25 + r * 22;
      dots.push(`<circle cx="${x}" cy="${y}" r="1.6" />`);
    }
  }
  svg.innerHTML = `<g fill="currentColor" opacity="0.55">${dots.join('')}</g>`;
  svg.style.color = 'var(--accent)';
}

/* ---------- WebGL 能耗閘門 ---------- */
async function webglAllowed() {
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
    } catch { /* Battery API 不可用視為未觸發 */ }
  }
  return null;
}

webglAllowed().then(async (blockedBy) => {
  if (blockedBy) {
    console.info(`[hero] WebGL skipped: ${blockedBy}`);
    return;
  }
  const canvas = document.getElementById('hero-canvas');
  try {
    const { default: initHero } = await import('./hero-gl.js');
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim();
    const stop = initHero(canvas, { accent });
    if (!stop) return;
    canvas.hidden = false;
    svg.style.display = 'none';

    /* 節流 7 的一半：離開視窗即停 */
    const heroIO = new IntersectionObserver(
      ([e]) => stop.setRunning(e.isIntersecting && !document.hidden)
    );
    heroIO.observe(canvas);
    document.addEventListener('visibilitychange', () =>
      stop.setRunning(!document.hidden && canvas.getBoundingClientRect().bottom > 0)
    );
  } catch (err) {
    console.info('[hero] WebGL init failed, keeping static grid', err);
  }
});
```

- [ ] **Step 2: 修正介面契約不一致**

上一步的 `stop.setRunning(...)` 與註解裡寫的「回傳停止函式」不一致。統一為：`initHero` 回傳一個物件 `{ setRunning(bool): void, destroy(): void }`。修改 `js/main.js` 中該段為：

```js
    const handle = initHero(canvas, { accent });
    if (!handle) return;
    canvas.hidden = false;
    svg.style.display = 'none';

    const heroIO = new IntersectionObserver(
      ([e]) => handle.setRunning(e.isIntersecting && !document.hidden)
    );
    heroIO.observe(canvas);
    document.addEventListener('visibilitychange', () =>
      handle.setRunning(!document.hidden && canvas.getBoundingClientRect().bottom > 0)
    );
```

同時把檔案上方 Interfaces 的敘述改為：`export default function initHero(canvas, opts) -> { setRunning(boolean), destroy() } | null`。

- [ ] **Step 3: 在瀏覽器驗證微互動**

伺服器已在 8765 執行。開 `http://localhost:8765`，逐項確認：

1. Console 出現 `[hero] WebGL skipped: ...` 或載入失敗訊息（`hero-gl.js` 尚未存在，預期 fail 並保留靜態網格）
2. Hero 有點陣網格（綠色）
3. 點主題鈕：顏色切換、按鈕文字在 Dark/Light 間切換
4. 用 DevTools 檢查 `#theme-toggle` 的 `aria-pressed` 隨之改變
5. 點 Copy：文字變 `Copied`，2 秒後復原
6. 捲動：導覽列當前項有綠色下標
7. 鍵盤 Tab：第一個 Tab 出現 Skip to content，所有互動元素都有綠色焦點環

- [ ] **Step 4: Commit**

```bash
cd /Users/nahla/Documents/Portfolio
git add js/main.js
git commit -m "Add micro-interactions, theme toggle with aria-pressed, WebGL energy gates"
```

---

## Task 5: WebGL Hero（js/hero-gl.js）

**Files:**
- Create: `js/hero-gl.js`

**Interfaces:**
- Consumes: 由 `js/main.js` 動態 import
- Produces: `export default function initHero(canvas, { accent }) -> { setRunning(boolean), destroy() } | null`。回傳 `null` 代表初始化失敗，呼叫端保留靜態 SVG。

**行為：** 粒子起始位置為亂數（混亂），隨頁面捲動進度逐漸內插到規則網格位置（秩序）。捲動進度 = Hero 被捲離視窗的比例，0 到 1。

- [ ] **Step 1: 寫入 js/hero-gl.js**

```js
const COLS = 24;
const ROWS = 12;
const MAX_PARTICLES = 2000;
const FPS_CAP = 30;

const VERT = `
attribute vec2 a_chaos;
attribute vec2 a_order;
attribute float a_seed;
uniform float u_progress;
uniform float u_time;
uniform vec2 u_res;
varying float v_alpha;
void main() {
  float t = clamp(u_progress * 1.35 - a_seed * 0.35, 0.0, 1.0);
  float e = t * t * (3.0 - 2.0 * t);
  vec2 drift = vec2(sin(u_time * 0.4 + a_seed * 30.0),
                    cos(u_time * 0.33 + a_seed * 21.0)) * 0.012 * (1.0 - e);
  vec2 p = mix(a_chaos + drift, a_order, e);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = mix(1.5, 3.0, e) * min(u_res.x / 600.0, 2.0);
  v_alpha = mix(0.35, 0.85, e);
}`;

const FRAG = `
precision mediump float;
uniform vec3 u_color;
varying float v_alpha;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  if (dot(d, d) > 0.25) discard;
  gl_FragColor = vec4(u_color, v_alpha);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.info('[hero] shader error', gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '').trim();
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(n.slice(0, 2), 16) / 255,
    parseInt(n.slice(2, 4), 16) / 255,
    parseInt(n.slice(4, 6), 16) / 255,
  ];
}

export default function initHero(canvas, { accent }) {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    powerPreference: 'low-power',
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  /* 粒子資料：規則網格 + 對應的亂數起點 */
  const count = Math.min(COLS * ROWS, MAX_PARTICLES);
  const chaos = new Float32Array(count * 2);
  const order = new Float32Array(count * 2);
  const seed = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    order[i * 2] = (c + 0.5) / COLS;
    order[i * 2 + 1] = 1.0 - (r + 0.5) / ROWS;
    chaos[i * 2] = Math.random();
    chaos[i * 2 + 1] = Math.random();
    seed[i] = Math.random();
  }

  function bindAttr(name, data, size) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return buf;
  }

  const buffers = [
    bindAttr('a_chaos', chaos, 2),
    bindAttr('a_order', order, 2),
    bindAttr('a_seed', seed, 1),
  ];

  const uProgress = gl.getUniformLocation(prog, 'u_progress');
  const uTime = gl.getUniformLocation(prog, 'u_time');
  const uRes = gl.getUniformLocation(prog, 'u_res');
  const uColor = gl.getUniformLocation(prog, 'u_color');

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  gl.uniform3fv(uColor, hexToRgb(accent));

  /* 主題切換時同步顏色 */
  const themeWatcher = new MutationObserver(() => {
    const next = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim();
    gl.useProgram(prog);
    gl.uniform3fv(uColor, hexToRgb(next));
  });
  themeWatcher.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5); /* 上限 1.5x：省 GPU */
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    }
  }

  let running = false;
  let raf = 0;
  let last = 0;
  const interval = 1000 / FPS_CAP;
  const t0 = performance.now();

  function progress() {
    const rect = canvas.getBoundingClientRect();
    const total = rect.height || 1;
    return Math.min(Math.max(-rect.top / total, 0), 1);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - last < interval) return; /* 節流到 30fps */
    last = now;
    resize();
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uProgress, progress());
    gl.uniform1f(uTime, (now - t0) / 1000);
    gl.drawArrays(gl.POINTS, 0, count);
  }

  const handle = {
    setRunning(on) {
      if (on === running) return;
      running = on;
      if (on) raf = requestAnimationFrame(frame);
      else cancelAnimationFrame(raf);
    },
    destroy() {
      handle.setRunning(false);
      themeWatcher.disconnect();
      buffers.forEach((b) => gl.deleteBuffer(b));
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };

  handle.setRunning(true);
  return handle;
}
```

- [ ] **Step 2: 驗證檔案大小在預算內**

```bash
cd /Users/nahla/Documents/Portfolio
gzip -c js/hero-gl.js | wc -c
```

Expected: < 2500 bytes（gzip 後）。

- [ ] **Step 3: 在瀏覽器驗證 WebGL 行為**

開 `http://localhost:8765`：

1. Hero 顯示分散的綠點（混亂狀態）
2. 慢慢往下捲：點逐漸對齊成規則網格
3. DevTools Console 無錯誤
4. 完全捲過 Hero 後，用 Performance 面板確認沒有持續的 rAF 活動
5. 切到別的分頁再切回來，確認動畫暫停與恢復
6. 切換主題，粒子顏色跟著變

- [ ] **Step 4: 驗證閘門確實生效**

在 DevTools 開啟 Rendering 面板 → Emulate CSS media feature `prefers-reduced-motion: reduce` → 重新整理。

Expected: Console 出現 `[hero] WebGL skipped: reduced-motion`，Network 面板**不應出現 `hero-gl.js` 的請求**，Hero 顯示靜態 SVG 網格。

這一項是整個設計的核心承諾，必須實際看到 Network 面板沒有那個請求才算通過。

- [ ] **Step 5: Commit**

```bash
cd /Users/nahla/Documents/Portfolio
git add js/hero-gl.js
git commit -m "Add gated WebGL hero: particles converge from chaos to grid on scroll"
```

---

## Task 6: 驗收實測

**Files:**
- Create: `docs/design/2026-08-10-verification.md`

不撰寫新功能。逐項實測 spec 的驗收清單並記錄真實數字。

- [ ] **Step 1: 量測傳輸量與請求數**

```bash
cd /Users/nahla/Documents/Portfolio
echo "=== raw sizes ==="
ls -l index.html css/main.css js/main.js js/hero-gl.js fonts/mono.woff2 2>/dev/null
echo "=== gzipped total (index + css + main.js + font) ==="
python3 - <<'PY'
import gzip, os
files = ['index.html', 'css/main.css', 'js/main.js']
total = sum(len(gzip.compress(open(f, 'rb').read())) for f in files)
if os.path.exists('fonts/mono.woff2'):
    total += os.path.getsize('fonts/mono.woff2')  # woff2 已壓縮
print('first-load transfer:', total, 'bytes =', round(total/1024, 1), 'KB')
print('budget 60KB:', 'PASS' if total < 61440 else 'FAIL')
PY
```

記錄實際數字。注意 `hero-gl.js` 不計入首次載入，它是條件式的。

- [ ] **Step 2: 確認零第三方請求**

```bash
cd /Users/nahla/Documents/Portfolio
grep -nE 'https?://' index.html css/main.css js/main.js js/hero-gl.js | grep -vE 'og:url|xmlns|linkedin\.com/in|github\.com/hstna|hstna\.github\.io'
```

Expected: 無輸出。任何輸出都代表有殘留的外部資源引用（`linkedin.com`／`github.com` 是使用者點擊才會走的連結，非自動請求，故排除）。

- [ ] **Step 3: 量測所有文字對比度**

```bash
cd /Users/nahla/Documents/Portfolio
python3 - <<'PY'
def lum(hex_):
    h = hex_.lstrip('#')
    ch = []
    for i in (0, 2, 4):
        c = int(h[i:i+2], 16) / 255
        ch.append(c/12.92 if c <= 0.04045 else ((c+0.055)/1.055) ** 2.4)
    return 0.2126*ch[0] + 0.7152*ch[1] + 0.0722*ch[2]

def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

pairs = [
    ('light text',   '#16161a', '#fbfbfa', 4.5),
    ('light muted',  '#5c5c66', '#fbfbfa', 4.5),
    ('light accent', '#15803d', '#fbfbfa', 4.5),
    ('light on-acc', '#ffffff', '#15803d', 4.5),
    ('dark text',    '#ececea', '#0d0d0e', 4.5),
    ('dark muted',   '#9a9aa4', '#0d0d0e', 4.5),
    ('dark accent',  '#4ade80', '#0d0d0e', 4.5),
    ('dark on-acc',  '#08120c', '#4ade80', 4.5),
]
fails = 0
for name, fg, bg, need in pairs:
    r = ratio(fg, bg)
    ok = r >= need
    fails += not ok
    print(f'{name:14s} {r:5.2f}:1  need {need}  {"PASS" if ok else "FAIL"}')
print('\nALL PASS' if not fails else f'\n{fails} FAILURES — adjust color tokens')
PY
```

Expected: `ALL PASS`。任何 FAIL 就回到 `css/main.css` 調整該 token 直到通過，然後重跑。

- [ ] **Step 4: 跑 Lighthouse**

伺服器需在執行中。

```bash
cd /Users/nahla/Documents/Portfolio
npx --yes lighthouse http://localhost:8765 \
  --only-categories=performance,accessibility,best-practices,seo \
  --preset=desktop --quiet --chrome-flags="--headless" \
  --output=json --output-path=/tmp/lh.json \
  && python3 -c "
import json
d = json.load(open('/tmp/lh.json'))
for k, v in d['categories'].items():
    print(f\"{k:16s} {round(v['score']*100)}\")
"
```

Expected: performance ≥ 98、accessibility = 100、best-practices ≥ 95、seo ≥ 95。

未達標時，讀 `/tmp/lh.json` 的 audits 找出具體失分項並修正，不要調降目標。

- [ ] **Step 5: 手動走查**

逐項確認並記錄結果：

1. 鍵盤 Tab 走完全站：可達所有互動元素、焦點皆可見、順序符合閱讀順序
2. 375px 寬度：底部導覽可用，四個連結都可點，內容不溢出
3. `prefers-reduced-motion: reduce`：`hero-gl.js` 未被請求、靜態網格顯示、Copy 按鈕仍可用、主題仍可切
4. 停用 JavaScript：所有文字內容仍可讀（Hero 的 SVG 會是空的，這可接受——它是裝飾）
5. macOS VoiceOver（Cmd+F5）走過 Hero 與 Contact：無逐字唸符號、`aria-pressed` 狀態有播報

- [ ] **Step 6: 寫下實測結果**

把 Step 1、3、4、5 的**實際輸出**寫入 `docs/design/2026-08-10-verification.md`。記錄真實數字，未達標的項目據實寫下未達標，不得填寫預期值。

- [ ] **Step 7: Commit**

```bash
cd /Users/nahla/Documents/Portfolio
git add docs/design/2026-08-10-verification.md
git commit -m "Record verification measurements for portfolio redesign"
```

---

## Task 7: 移除死碼與收尾

**Files:**
- Modify: `index.html`（若有殘留）

- [ ] **Step 1: 確認舊樣式無殘留**

```bash
cd /Users/nahla/Documents/Portfolio
python3 - <<'PY'
src = open('index.html', encoding='utf-8').read()
dead = ['<style>', 'blob', 'grad-text', 'stat-num', 'card-tags',
        'fonts.googleapis.com', 'Space Grotesk', 'Inter']
for d in dead:
    assert d not in src, f'dead code remains: {d}'
print('no dead code in index.html')
PY
```

Expected: `no dead code in index.html`

- [ ] **Step 2: 確認檔案清單乾淨**

```bash
cd /Users/nahla/Documents/Portfolio
git status --short && echo "--- tracked ---" && git ls-files
```

Expected: 工作區乾淨；追蹤檔案為 `index.html`、`css/main.css`、`js/main.js`、`js/hero-gl.js`、`fonts/mono.woff2`、`.nojekyll`、`docs/` 下的文件。無其他殘留。

- [ ] **Step 3: 停掉本機伺服器**

```bash
pkill -f "http.server 8765" || true
```

---

## Self-Review

**Spec 覆蓋檢查：**

| Spec 要求 | 對應任務 |
| --- | --- |
| 檔案架構拆分 | Task 1、2、4、5 |
| 色彩 token（含深色） | Task 1 Step 3 |
| 移除陰影／漸層／emoji | Task 2 Step 2、Task 3 Step 2 驗證 |
| system-ui + subset 等寬 | Task 1 |
| 五幕敘事 | Task 2 Step 1 |
| 微互動 1 count-up | Task 4 |
| 微互動 2 底線 | Task 3 |
| 微互動 3 View Transitions | Task 4 |
| 微互動 4 時間線 `animation-timeline` | Task 3 |
| 微互動 5 當前 section | Task 4 |
| 微互動 6 複製 email | Task 4 |
| 微互動 7 `:focus-visible` | Task 1 Step 3 |
| WebGL 五道載入閘門 | Task 4 `webglAllowed()` |
| WebGL 兩項執行期節流 | Task 4（IntersectionObserver／visibilitychange）+ Task 5（FPS_CAP） |
| 靜態 SVG 替代圖 | Task 4 Step 1 |
| skip link | Task 2 + Task 3 |
| 手機導覽 | Task 3（底部 fixed） |
| `aria-pressed` | Task 4 |
| `<address>` | Task 2 |
| `forced-colors` | Task 1、Task 3 |
| `color-scheme` meta | Task 2 |
| `scroll-behavior` 收窄 | Task 3 |
| favicon 改非 emoji | Task 2（SVG data URI，綠底 M 字） |
| 驗收 8 項 | Task 6 |

無遺漏。

**已修正的問題：**

1. Task 4 原本寫 `initHero` 回傳「停止函式」，卻呼叫 `stop.setRunning()`。已在 Task 4 Step 2 明確修正為回傳 `{ setRunning, destroy }` 物件，Task 5 的實作與此一致。
2. `COLS` / `ROWS` 同時出現在 `js/main.js`（畫 SVG）與 `js/hero-gl.js`（粒子網格），值必須相同（24 × 12），否則靜態圖與 WebGL 版的網格密度會不一致。兩處皆已明確寫出 24 與 12。這是刻意的重複——為了讓 `hero-gl.js` 不被載入時 `main.js` 仍能獨立運作，不共用常數。
3. Task 3 的 `.btn` 需要 `background-image: none !important` 覆蓋 `main a[href]` 的底線微互動，否則按鈕會多一條線。已加。
4. Task 6 Step 2 的 grep 會誤報 `og:url` 與 SVG `xmlns`，已在指令中排除。
