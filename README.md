# TLT 互動解說 · 100K 投資情境模擬器

**Live demo: https://kiuckhuang.github.io/tlt-demo/**

香港繁體廣東話嘅 TLT 教育 demo，純前端、無 CDN／第三方 runtime 依賴，亦可用瀏覽器離線開啟。

## 功能

- 系統／淺／深色主題；預設跟系統並即時更新所有讀數。
- 每月分派、票息、YTM、SEC yield、Duration 同 Beta 嘅概念解說。
- 國債 → 基金 → 投資者現金流示意、利率蹺蹺板、Duration bar 比較。
- 20 年假設情境：粗實線為選中劇本、虛點線為對比；急升劇本預設隱藏。
- 自動畫線；鍵盤、滑鼠、手機點選年份；可選減少動畫，預設尊重系統偏好。
- 再投資／收現金兩種模式、通脹後購買力、明確參數敏感度範圍（非信賴區間）。
- 直債半年現金流模型：票息／買入 YTM／票息再投資息率分開，同年期及同模式比較。
- 事件時間線取代先前未逐年核實嘅歷史價格數列。
- 手機表格及大圖獨立橫向捲動，唔推闊全頁；所有輸入有標籤。

## 快照與假設必須分開

用戶提供快照標示 **2026-09-25**：TLT US$79.32、Yahoo Yield 4.73%、資產 US$47.05B、年費 0.15%、Beta 2.39；另一張截圖顯示 20 年美債息 5.54%。**精確日期、欄位口徑及數值未逐項獨立核實；唔係即時報價。**

5.5% 只係起始模型假設（費用前收益代理值），唔係 TLT 已核實 SEC yield、承諾派息率或由 benchmark 推算嘅保證。Duration 16.5 年亦係簡化假設。

### TLT 教育模型

```text
假設淨年化收入 = 年初假設收益代理值 − 年費
價格回報近似 = −Duration × 年內債息變化
總回報近似 = 假設淨年化收入 + 價格回報近似
```

年末派息及再投資；收現金模式將現金留起，利息 0%。累計模型派息係年度付款總額，唔係將所有複利效果混作派息。所有對比線、敏感度範圍、年度派息、表格同直債比較跟同一模式。

敏感度範圍係四組明確參數：Duration ±20%、年度收益代理值 ±0.5 個百分點（極低息時，收入代理值下限為 0）。**唔係機率／信賴區間，唔涵蓋所有市場結果。** 固定 Duration、一階估價唔包括凸性、真實換馬、實際票息分派、曲線形狀、交易費、稅、FX；唔可用作價格／派息預測。

### 直債模型

假設啱啱派息後購入，名義年化 YTM、半年票息。先以 YTM 折現固定票息及面值，估算價格，再按本金推算面值。年度票息按 **面值 × 票息率** 計；再投資息率另設，唔等同買入 YTM。

期末總財富為面值加累積票息（及假設再投資收益）。**複利總財富唔係政府保證**。國債按合約償還面值，亦唔一定等於原購入成本。

比較期由 5 至 30 年，兩邊用相同本金、年期及現金模式。超過 20 年嘅 TLT 情境延伸同一假設，債息到位後保持不變。假設可買小數面值，忽略券商最低量、應計利息、稅、成本、匯率同違約。

## 官方概念來源（唔係快照日報價證明）

- [iShares TLT](https://www.ishares.com/us/products/239454/ishares-20-year-treasury-bond-etf)
- [TreasuryDirect pricing / YTM / par](https://www.treasurydirect.gov/marketable-securities/understanding-pricing/)
- [TreasuryDirect Treasury bonds](https://www.treasurydirect.gov/marketable-securities/treasury-bonds/)
- [IRS Publication 519](https://www.irs.gov/publications/p519)
- [IRS Form 706-NA instructions](https://www.irs.gov/instructions/i706na)
- [IRS Publication 901](https://www.irs.gov/publications/p901)

## 開發與測試

需要 Node 18+；**毋須 `npm install`**。

```bash
npm run check
npm test
# 或直接：
node --test tests/*.test.cjs
```

- `model.js`：可在瀏覽器及 Node 執行嘅純數學模組。
- `app.js`：UI／圖表／偏好設定。
- `tests/model.test.cjs`：現金 vs 再投資、收益分解、Duration 百分比、同年期比較、半年票息、溢折價、零息及再投資假設。
- `tests/interface.test.cjs`：唯一 IDs、標籤、手機容器、主題重繪、減少動畫、WCAG 對比、資料聲明及資源版本。

真實 browser QA 要另外檢查：390px／desktop、主題來回切換、兩個現金模式、5／20／30 年、滑鼠／點選／鍵盤年份，以及 reduced-motion。靜態測試唔會聲稱代替真 browser QA。

GitHub Pages 從 `main` 根目錄發布；每次改 CSS／JS 時同步更新 HTML 資源 query 版本，避免混用 cache。

## 免責聲明

教育用途，唔構成投資、法律或稅務建議。用戶快照未逐項獨立核實；模型簡化，結果唔係保證，投資可損失本金。投資前核實最新官方資料、交易條款及個人稅務情況。
