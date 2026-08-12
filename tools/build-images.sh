#!/bin/bash
# 把 img/src/ 的原圖轉成網站用的 AVIF + JPEG，並重新產生輪播帶的 HTML。
# 只用 macOS 內建的 sips 與 python3，不需要安裝任何東西。
#
#   img/src/portrait.*     人像（About 區塊）
#   img/src/gallery/*      攝影作品，依檔名排序決定輪播順序
#
# 增刪照片就是增刪 gallery/ 裡的檔案，然後重跑這個腳本。
# index.html 的輪播帶會自動更新，不用手改。
#
#   用法：  bash tools/build-images.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=img/src
OUT=img
AVIF_Q=55
JPEG_Q=72

[ -d "$SRC" ] || { echo "找不到 $SRC/" >&2; exit 1; }
mkdir -p "$OUT"

# 先清掉上一次的輸出。不清的話，從 gallery 刪除的照片會留下孤兒檔案。
find "$OUT" -maxdepth 1 -type f \( -name '*.avif' -o -name '*.jpg' \) -delete

# emit <來源> <輸出前綴> <標籤> <resample 參數...> — 回傳輸出實際尺寸 "w h"
emit() {
  local src=$1 stem=$2 tag=$3; shift 3
  local tmp
  tmp=$(mktemp -t bi).png
  sips "$@" -s format png "$src" --out "$tmp" >/dev/null
  sips -s format avif -s formatOptions "$AVIF_Q" "$tmp" --out "$OUT/$stem-$tag.avif" >/dev/null
  sips -s format jpeg -s formatOptions "$JPEG_Q" "$tmp" --out "$OUT/$stem-$tag.jpg" >/dev/null
  sips -g pixelWidth -g pixelHeight "$tmp" | awk '/pixelWidth/{w=$2}/pixelHeight/{h=$2}END{print w, h}'
  rm -f "$tmp"
}

# sips 對較大的圖會輸出「grid」分塊 AVIF，Chrome 解得出尺寸卻畫不出像素，
# 而且 onload 照樣觸發，所以不會自動退回 JPEG。偵測到就把 AVIF 刪掉。
avif_is_broken() {
  head -c 4096 "$1" 2>/dev/null | grep -q grid
}

# 檢查某個 stem 的兩個 AVIF；任一有問題就全部移除，該圖改用 JPEG
drop_broken_avif() {
  local stem=$1
  if avif_is_broken "$OUT/$stem-1x.avif" || avif_is_broken "$OUT/$stem-2x.avif"; then
    rm -f "$OUT/$stem-1x.avif" "$OUT/$stem-2x.avif"
    return 1
  fi
  return 0
}

shopt -s nullglob nocaseglob

portrait=("$SRC"/portrait.*)
if [ ${#portrait[@]} -gt 0 ]; then
  echo "人像："
  emit "${portrait[0]}" portrait 1x --resampleWidth 440 >/dev/null
  emit "${portrait[0]}" portrait 2x --resampleWidth 880 >/dev/null
  if drop_broken_avif portrait; then
    echo "  portrait — AVIF + JPEG"
    PORTRAIT_AVIF=1
  else
    echo "  portrait — 僅 JPEG（AVIF 為分塊格式，已移除）"
    PORTRAIT_AVIF=0
  fi
fi

echo "攝影作品："
: > /tmp/strip-items.txt
n=0
# macOS 的 bash 是 3.2，沒有 ${var,,}；用 find -iname 處理大小寫並確保排序穩定
while IFS= read -r f; do
  n=$((n + 1))
  # 用來源檔名當輸出名，不用流水號。用流水號的話，刪掉中間一張會讓
  # 後面所有照片的內容換到別人的網址上，瀏覽器快取就會給出錯的圖。
  base=$(basename "$f"); base=${base%.*}
  stem=$(printf '%s' "$base" | tr -c 'A-Za-z0-9_-' '-')
  # 輪播帶是依「高度」排版的，所以要依高度縮放。
  # 依寬度縮放會讓 9:16 的直式照片被送出 2.5 倍過大的圖。
  dims=$(emit "$f" "$stem" 1x --resampleHeight 300)
  emit "$f" "$stem" 2x --resampleHeight 600 >/dev/null
  if drop_broken_avif "$stem"; then avif=1; note=""; else avif=0; note="  僅 JPEG"; fi
  echo "$stem $dims $avif" >> /tmp/strip-items.txt
  printf '  %-22s %s%s\n' "$stem" "$dims" "$note"
done < <(find "$SRC/gallery" -maxdepth 1 -type f \
  \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.heic' -o -iname '*.tif' -o -iname '*.tiff' \) \
  | sort)

echo
echo "重新產生 index.html 的輪播帶（$n 張）"
python3 - "$n" "${PORTRAIT_AVIF:-0}" <<'PY'
import pathlib, re, sys

items = []
for line in open('/tmp/strip-items.txt'):
    stem, w, h, avif = line.split()
    items.append((stem, w, h, avif == '1'))

def li(stem, w, h, avif, dup):
    hid = ' aria-hidden="true"' if dup else ''
    src = (f'              <source type="image/avif" srcset="img/{stem}-1x.avif 1x, img/{stem}-2x.avif 2x"/>\n'
           if avif else '')
    return (f'          <li{hid}>\n'
            f'            <picture>\n{src}'
            f'              <img src="img/{stem}-1x.jpg" srcset="img/{stem}-2x.jpg 2x"\n'
            f'                   width="{w}" height="{h}" loading="lazy" decoding="async" alt=""/>\n'
            f'            </picture>\n'
            f'          </li>\n')

# 內容複製一份，供無縫繞回使用；副本對輔助技術隱藏
body = ''.join(li(*it, dup=False) for it in items) + ''.join(li(*it, dup=True) for it in items)

# 人像的 <picture> 也要跟著 AVIF 是否可用而改寫
portrait_avif = sys.argv[2] == '1'
psrc = ('      <source type="image/avif" srcset="img/portrait-1x.avif 1x, img/portrait-2x.avif 2x" />\n'
        if portrait_avif else '')

p = pathlib.Path('index.html')
s = p.read_text(encoding='utf-8')
new = f'<ul class="strip-track" id="strip-track">\n{body}        </ul>'
s2, cnt = re.subn(r'<ul class="strip-track" id="strip-track">.*?</ul>', new, s, flags=re.S)
assert cnt == 1, f'strip-track 區塊找到 {cnt} 個，預期 1 個'

pnew = ('<picture class="portrait">\n' + psrc +
        '      <img src="img/portrait-1x.jpg" srcset="img/portrait-2x.jpg 2x"\n'
        '           width="440" height="550" loading="lazy" decoding="async"\n'
        '           alt="Shih-Ting Huang" />\n    </picture>')
s2, pc = re.subn(r'<picture class="portrait">.*?</picture>', pnew, s2, flags=re.S)
assert pc == 1, f'portrait 區塊找到 {pc} 個，預期 1 個'
print(f'  人像 AVIF：{"可用" if portrait_avif else "已停用（分塊格式）"}')
p.write_text(s2, encoding='utf-8')
print(f'  已寫入 {len(items)} 張（含副本共 {len(items) * 2} 個 <li>）')
PY

echo
# 只算建置輸出，不含 img/src/（那是輸入，且已 gitignore）
echo "建置輸出：$(find "$OUT" -maxdepth 1 -type f \( -name '*.avif' -o -name '*.jpg' \) -exec stat -f%z {} + | awk '{s+=$1}END{printf "%.1f MB", s/1048576}')"
echo "（圖片皆為 lazy，捲到輪播帶才會下載；支援 AVIF 的瀏覽器不會取 JPEG）"
