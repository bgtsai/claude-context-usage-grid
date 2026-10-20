# Claude /context 用量方格圖

Tampermonkey 腳本。在 claude.ai 的 Claude Code 對話裡執行 `/context` 後，自動把輸出的用量表轉成 10×10 方格圖（每格 1%），原始資料預設折疊，並標示與上一次查詢的差值。

- 每一則 `/context` 回覆各自一張圖，重新開啟對話也會自動補畫
- `(deferred)` 分類不計入總量，另列在圖例下方
- Autocompact buffer 以斜線格表示
- Messages 比上一次大幅減少時，提示可能發生過壓縮

## 安裝

[安裝腳本](https://raw.githubusercontent.com/bgtsai/claude-context-usage-grid/main/Context_Usage_Grid.user.js)
