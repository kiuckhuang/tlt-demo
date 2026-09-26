# TLT 互動解說 · 100K 投資 20 年模擬器

Interactive explainer (in Traditional Hong Kong Cantonese) for **iShares 20+ Year Treasury Bond ETF (TLT)** — how it works, and what happens if you invest 100K for 20 years.

**Live demo → https://kiuckhuang.github.io/tlt-demo/**

## 內容

1. **TLT 係乜** — 資產規模、息率、年費、Duration 等核心數據（count-up 動畫）
2. **運作三步** — 一籃子長債 · 月月派息 · 永遠換馬（SVG 動畫）
3. **利率蹺蹺板** — 拖動利率，即場睇 TLT 估價同舊債市值點郁
4. **Duration 比較器** — SHY vs IEF vs TLT 對利率嘅敏感度
5. **🎬 20 年模擬器** — 四個利率劇本 + 自訂劇本，播放動畫、tooltip、通脹調整、波幅帶
6. **💡 直債鎖息對照計算機** — 直接鎖 20 年美債 vs TLT 四個劇本邊個贏
7. **歷史過山車** — 2002–2026 年價格動畫 + 大事件
8. **香港人實務筆記** — 買法、稅務、匯率

## 數據與假設

- 數據日：2026-09-25 收市（來源：Yahoo Finance・Trading Economics）
- 現價 US$79.32 · 市場 20 年債息 5.54% · 年費 0.15% · 有效存續期約 16.5 年
- 模擬模型：`每年回報 ≈（年初債息 − 0.15%）− 16.5 × 債息升幅`
- 純前端（vanilla JS + SVG），無任何外部依賴，離線可用

## 免責聲明

教育用途模擬，唔構成投資建議。過去表現唔代表將來回報，投資涉及風險。
