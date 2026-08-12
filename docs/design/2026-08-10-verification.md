# 驗收實測結果

日期：2026-08-10
量測對象：`redesign-minimal` 分支，本機 `python3 -m http.server 8765`
Lighthouse：`npx lighthouse --preset=desktop --chrome-flags=--headless=new`
瀏覽器驗證：Chrome 經 CDP 驅動，headless

## 1. 傳輸量

| 檔案 | 大小 |
| --- | --- |
| `index.html`（gzip） | 3,670 B |
| `css/main.css`（gzip） | 3,177 B |
| `js/main.js`（gzip） | 2,559 B |
| `fonts/mono.woff2` | 6,220 B |
| **首次載入合計** | **15,626 B = 15.3 KB** |
| `js/hero-gl.js`（gzip，條件式載入，不計入首次載入） | 2,537 B |

目標 < 60 KB — **通過**，用掉 25%。

對照：原版單檔 28,940 B 未壓縮，另加三個 Google Fonts 家族八個字重的第三方請求。

## 2. 第三方請求

原始碼掃描：`index.html`、`css/main.css`、`js/main.js`、`js/hero-gl.js` 中無任何指向外部網域的資源引用。

執行期實測（CDP `Network.requestWillBeSent`，三種情境）：

| 情境 | 非同源請求 |
| --- | --- |
| 一般 | 0 |
| `prefers-reduced-motion: reduce` | 0 |
| 375px 行動裝置 | 0 |

目標 0 — **通過**。

## 3. Lighthouse

| 類別 | 分數 | 目標 |
| --- | --- | --- |
| Performance | 100 | ≥ 98 ✅ |
| Accessibility | 100 | 100 ✅ |
| Best Practices | 100 | ≥ 95 ✅ |
| SEO | 100 | ≥ 95 ✅ |

| 指標 | 值 |
| --- | --- |
| First Contentful Paint | 0.3 s |
| Largest Contentful Paint | 0.3 s |
| Speed Index | 0.3 s |
| Total Blocking Time | 0 ms |
| Cumulative Layout Shift | 0 |

Performance 曾出現一次 98（TBT 140 ms），連續重跑兩次皆為 100 / TBT 0 ms，判定為量測雜訊。

### 修正紀錄：寬螢幕右半邊空白

使用者回報「網頁打開有一半是空白沒有資料」。1728px 實測：內容欄僅 728px，右側 952px（**55%**）全空，且 `.act` 的 `border-top` 分隔線只畫到 45% 就中斷，看起來像壞掉。

成因：為了讓內文與 Hero 文字起點對齊，先前把 `.act` 的 `margin: 0 auto` 拿掉改成純靠左，卻沒有限制頁面容器寬度，於是整份內容擠在左側。

修法：

1. 新增置中容器 `--page: 1180px`，`.nav` / `.hero` / `main` / `.foot` 統一用 `--edge: max(gutter, (100% - page) / 2)` 當左右內距
2. `.act` 改為填滿容器寬度，分隔線橫跨整個版面
3. 寬度 ≥ 960px 時，段落編號與 Hero 的 eyebrow 移入 190px 左側欄，正文置於右欄——讓寬螢幕的空間有實際用途

修正後各寬度實測：

| 視窗寬 | 內容欄寬 | 左邊距 | 右邊距 |
| --- | --- | --- | --- |
| 1728 px | 1180 | 267 | 282 |
| 1280 px | 1169 | 48 | 63 |
| 820 px | 723 | 41 | 56 |
| 375 px | 320 | 20 | 35 |

左右差值 15 px 為捲軸寬度。

### 修正紀錄：CLS

第一次量測 Performance 只有 **78**，CLS = **0.546**，全部歸因於 `#hero-canvas`。

成因：`.hero-visual` 內的 `<svg>` 與 `<canvas>` 都在正常流中。`canvas.hidden = false` 讓 canvas 進入配置並排到 SVG 下方，隨後 `svg.style.display = 'none'` 又把它拉回頂端，產生大幅位移。

修法：兩者都改為 `position: absolute; inset: 0` 疊放，切換顯示不再影響任何流程配置。

修正後 CLS = **0**，Performance = **100**。

## 4. 色彩對比度

以 WCAG 相對亮度公式計算：

| 組合 | 比值 | 需求 | 結果 |
| --- | --- | --- | --- |
| 淺色 正文 `#16161a` / `#fbfbfa` | 17.43:1 | 4.5 | PASS |
| 淺色 次要 `#5c5c66` / `#fbfbfa` | 6.38:1 | 4.5 | PASS |
| 淺色 強調 `#15803d` / `#fbfbfa` | 4.84:1 | 4.5 | PASS |
| 淺色 按鈕字 `#ffffff` / `#15803d` | 5.02:1 | 4.5 | PASS |
| 深色 正文 `#ececea` / `#0d0d0e` | 16.42:1 | 4.5 | PASS |
| 深色 次要 `#9a9aa4` / `#0d0d0e` | 6.97:1 | 4.5 | PASS |
| 深色 強調 `#4ade80` / `#0d0d0e` | 11.15:1 | 4.5 | PASS |
| 深色 按鈕字 `#08120c` / `#4ade80` | 10.93:1 | 4.5 | PASS |

全數通過 AA。淺色強調色 4.84:1 餘裕最小，若日後縮小該色文字級距需重新複驗。

## 5. WebGL 能耗閘門

CDP 實測，監聽所有網路請求：

| 情境 | `hero-gl.js` 被請求 | canvas 狀態 | 靜態網格 |
| --- | --- | --- | --- |
| 一般 | 是 | 顯示 | 隱藏 |
| `prefers-reduced-motion: reduce` | **否** | 隱藏 | 顯示（288 點 = 24 × 12） |

reduced-motion 下 WebGL 程式碼**完全未傳輸**，不只是未執行。這是本設計的核心承諾，已實證。

同情境下 `.reveal` 元素數為 0（捲入動畫未掛載），`[data-count]` 直接顯示終值 `15` 與 `3`，功能未降級。

執行期節流另有實證：開發過程中瀏覽器分頁隱藏時，`requestAnimationFrame` 完全停止，畫面凍結在最後一格——`visibilitychange` 與 IntersectionObserver 的停止邏輯生效。

## 6. 鍵盤走查

13 個 tab 停駐點，順序符合閱讀順序：

```
 1. Skip to content        8. See the work
 2. ST Huang               9. Get in touch
 3. Problem               10. sthuangna@gmail.com
 4. Work                  11. Copy
 5. Path                  12. linkedin.com/in/hstna
 6. Now                   13. github.com/hstna
 7. Light（主題切換）
```

skip link 為第一停駐點。全站統一 `:focus-visible` 焦點環（2px 強調色 + 3px offset），`forced-colors` 下改用 `CanvasText`。

## 7. 行動裝置（375 × 812）

| 項目 | 結果 |
| --- | --- |
| `.nav` 定位 | `fixed`，`bottom: 812` = `innerHeight`，貼齊底部 |
| 導覽連結 | 四個全部可見可點（原版是 `display: none`，行動裝置完全沒有導覽） |
| 主題切換 | 存在且可用，數量為 1 |
| 內容溢出 | 無 |

## 8. 停用 JavaScript

| 項目 | 結果 |
| --- | --- |
| 可讀文字量 | 3,504 字元 |
| 幕 1 數據 | 可讀（`15 vendor formats` 直接寫在 HTML） |
| Email | 可讀 |
| 四幕標題 | 全部存在 |

Hero 的裝飾網格在無 JS 時為空（SVG 由 JS 產生），這是可接受的降級——它標有 `aria-hidden="true"`，不承載資訊。

## 未執行項目

**macOS VoiceOver 走查未執行。** 需要真人操作螢幕閱讀器，無法在此環境自動化。已完成的替代驗證：Lighthouse Accessibility 100、語意標記（`<nav>` / `<main>` / `<address>` / `<ol>`）、`aria-pressed` 隨主題切換更新、裝飾元素標 `aria-hidden`、全站無 emoji 字元。建議實機補做。
