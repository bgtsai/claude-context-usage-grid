**English** [繁體中文](README-TC.md#claude-context-用量方格圖) 

# Claude /context Usage Grid

A Tampermonkey userscript. When you run `/context` in a Claude Code conversation on [claude.ai](https://claude.ai), the usage table is automatically turned into a 10×10 grid (each cell is 1% of the total context window), so you can see at a glance how much each category takes up and how much room is left before auto-compaction.

## Before and after

**Before**: the text table printed by `/context`

<img src="docs/before.png" width="560" alt="Before: the /context text table">

**After**: the grid. The original table is collapsed by default; click 「顯示原始資料」 (Show raw data) to expand it.

<img src="docs/after_light.png" width="560" alt="After: light theme">

The colors switch automatically in dark mode:

<img src="docs/after_dark.png" width="560" alt="After: dark theme">

## Features

- **Fully automatic**: no button to press. The output is converted as soon as `/context` prints it.
- **One grid per query**: if you run `/context` several times in one conversation, each output gets its own grid. Grids are redrawn after a page reload or when you reopen the conversation later.
- **Comparison with the previous query**: from the second query on, each category shows the change since the previous one (e.g. Messages +18.2k).
- **Compaction hint**: if Messages dropped by more than 30% since the previous query, a note says compaction may have happened in between.
- **Autocompact buffer** is drawn as hatched cells. It is the part of free space reserved for auto-compaction.
- **Deferred categories listed separately**: `MCP tools (deferred)` and `System tools (deferred)` are not counted in the total, so they are not drawn in the grid and are listed below the legend instead.
- The original output is kept intact, only collapsed. Nothing on the page is modified or removed.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. Click here to install the script: [Context_Usage_Grid.user.js](https://raw.githubusercontent.com/bgtsai/claude-context-usage-grid/main/Context_Usage_Grid.user.js)
3. Open a Claude Code conversation on claude.ai and type `/context`.

The script has auto-update configured, so Tampermonkey will install new versions automatically.

## Notes

- Cells are allocated by percentage using the largest remainder method, so the total is exactly 100 cells. Categories smaller than half a cell (e.g. 0.1%) do not appear in the grid and are only listed in the legend.
- The script only reads text already shown on the page. It does not intercept network requests and does not send any data anywhere.
- Detection is based on the text format of the `/context` output, not on the site's class names, so site redesigns usually do not break it. If Claude Code changes the `/context` output format, the parsing rules will need an update.
- The UI labels in the grid (such as 「顯示原始資料」) are currently in Traditional Chinese.
