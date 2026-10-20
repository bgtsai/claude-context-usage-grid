// ==UserScript==
// @name         Claude /context 用量方格圖
// @namespace    https://github.com/bgtsai
// @version      1.0.1
// @description  把 Claude Code /context 的文字輸出轉成 10×10 方格圖，原始資料折疊，並顯示與上一次查詢的差值
// @author       bgtsai
// @match        https://claude.ai/*
// @run-at       document-idle
// @grant        none
// @homepageURL  https://github.com/bgtsai/claude-context-usage-grid
// @downloadURL  https://raw.githubusercontent.com/bgtsai/claude-context-usage-grid/main/Context_Usage_Grid.user.js
// @updateURL    https://raw.githubusercontent.com/bgtsai/claude-context-usage-grid/main/Context_Usage_Grid.user.js
// ==/UserScript==

(function () {
  'use strict';

  const CARD_CLASS = 'cug-card';
  const ROOT_ATTR = 'data-cug-root';
  const OPEN_ATTR = 'data-cug-open';
  const CELLS = 100;
  const COMPACT_DROP_RATIO = 0.3; // Messages 比上一次少 30% 以上，視為可能已壓縮

  // 方格內的分類（依示意圖順序），deferred 不計入總量，另列
  const CATS = [
    { key: 'System prompt',            color: '#9a9690' },
    { key: 'System tools',             color: '#6e8fb8' },
    { key: 'MCP tools',                color: '#3bb3c3' },
    { key: 'MCP server instructions',  color: '#2a8f9c' },
    { key: 'Memory files',             color: '#e07a5f' },
    { key: 'Skills',                   color: '#e5a823' },
    { key: 'Messages',                 color: '#a98be0' },
    { key: 'Free space',               color: null, kind: 'free' },
    { key: 'Autocompact buffer',       color: null, kind: 'buffer' },
  ];

  // ---------- 解析 ----------

  function parseTokens(s) {
    const m = String(s).trim().match(/^~?([\d.,]+)\s*([km]?)$/i);
    if (!m) return NaN;
    const n = parseFloat(m[1].replace(/,/g, ''));
    const u = m[2].toLowerCase();
    return u === 'k' ? n * 1e3 : u === 'm' ? n * 1e6 : n;
  }

  function fmtTokens(n) {
    const a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'm';
    if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(Math.round(n));
  }

  // 文字解析：同時相容「渲染後的表格」（innerText 以 Tab 分隔）與「原始 Markdown」（以 | 分隔）
  function parseContextText(text) {
    const head = text.match(/Tokens:\**\s*([\d.,]+\s*[km]?)\s*\/\s*([\d.,]+\s*[km]?)\s*\(([\d.]+)%\)/i);
    if (!head) return null;
    const model = (text.match(/Model:\**\s*([^\s|]+)/i) || [])[1] || '';
    const start = text.search(/Estimated usage by category/i);
    if (start < 0) return null;
    const rest = text.slice(start);
    const end = rest.slice(1).search(/\n\s*#{0,3}\s*(MCP Tools|Skills|Memory files)\s*\n/i);
    const block = end >= 0 ? rest.slice(0, end + 1) : rest;

    const rows = {};
    for (const line of block.split('\n')) {
      const m = line.match(/^\s*\|?\s*([A-Za-z][A-Za-z ()]*?)\s*[|\t]\s*(~?[\d.,]+\s*[km]?)\s*[|\t]\s*([\d.]+)%/i);
      if (!m) continue;
      rows[m[1].trim()] = { tokens: parseTokens(m[2]), pct: parseFloat(m[3]), pctText: m[3] };
    }
    if (!rows['Free space']) return null;
    return {
      model,
      used: parseTokens(head[1]),
      total: parseTokens(head[2]),
      usedPct: parseFloat(head[3]),
      rows,
    };
  }

  // 最大餘數法分配 100 格；不到半格的分類不畫，只留在圖例
  function allocateCells(data) {
    const items = CATS.filter(c => data.rows[c.key]).map(c => {
      const exact = data.rows[c.key].pct;
      return { cat: c, exact, n: Math.floor(exact), rem: exact - Math.floor(exact) };
    });
    let left = CELLS - items.reduce((s, i) => s + i.n, 0);
    const order = items.slice().sort((a, b) => b.rem - a.rem);
    for (let i = 0; left > 0 && i < order.length; i++, left--) order[i].n++;
    for (let i = order.length - 1; left < 0 && i >= 0; i--) {
      if (order[i].n > 0) { order[i].n--; left++; }
    }
    return items;
  }

  // ---------- DOM 建構（不用 innerHTML，相容 Trusted Types） ----------

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function deltaSpan(cur, prev) {
    if (prev == null) return null;
    const d = cur - prev;
    if (Math.abs(d) < 50) return el('span', 'cug-delta cug-zero', '±0');
    return el('span', 'cug-delta ' + (d > 0 ? 'cug-up' : 'cug-down'), (d > 0 ? '+' : '−') + fmtTokens(Math.abs(d)));
  }

  function buildCard(data, prev, root) {
    const card = el('div', CARD_CLASS);

    const header = el('div', 'cug-header');
    const title = el('div', 'cug-title');
    title.appendChild(el('span', 'cug-total', fmtTokens(data.used) + ' / ' + fmtTokens(data.total)));
    title.appendChild(el('span', 'cug-pct', data.usedPct + '%'));
    const dUsed = prev ? deltaSpan(data.used, prev.used) : null;
    if (dUsed) title.appendChild(dUsed);
    header.appendChild(title);
    if (data.model) header.appendChild(el('div', 'cug-model', data.model));
    card.appendChild(header);

    if (prev && prev.rows['Messages'] && data.rows['Messages'] &&
        data.rows['Messages'].tokens < prev.rows['Messages'].tokens * (1 - COMPACT_DROP_RATIO)) {
      card.appendChild(el('div', 'cug-note', '與上一次相比 Messages 大幅減少，中間可能發生過壓縮'));
    }

    const body = el('div', 'cug-body');
    const grid = el('div', 'cug-grid');
    for (const it of allocateCells(data)) {
      for (let i = 0; i < it.n; i++) {
        const cell = el('div', 'cug-cell' + (it.cat.kind ? ' cug-' + it.cat.kind : ''));
        if (it.cat.color) cell.style.background = it.cat.color;
        cell.title = it.cat.key;
        grid.appendChild(cell);
      }
    }
    body.appendChild(grid);

    const legend = el('div', 'cug-legend');
    for (const c of CATS) {
      const r = data.rows[c.key];
      if (!r) continue;
      const row = el('div', 'cug-row');
      const sw = el('span', 'cug-swatch' + (c.kind ? ' cug-' + c.kind : ''));
      if (c.color) sw.style.background = c.color;
      row.appendChild(sw);
      row.appendChild(el('span', 'cug-name', c.key));
      row.appendChild(el('span', 'cug-num', fmtTokens(r.tokens)));
      row.appendChild(el('span', 'cug-num cug-dim', r.pctText + '%'));
      const pr = prev && prev.rows[c.key];
      const d = pr ? deltaSpan(r.tokens, pr.tokens) : null;
      row.appendChild(d || el('span', 'cug-delta'));
      legend.appendChild(row);
    }
    const deferred = Object.keys(data.rows).filter(k => /deferred/i.test(k));
    if (deferred.length) {
      legend.appendChild(el('div', 'cug-foot',
        '未計入總量：' + deferred.map(k => k + ' ' + fmtTokens(data.rows[k].tokens)).join('、')));
    }
    body.appendChild(legend);
    card.appendChild(body);

    const toggle = el('button', 'cug-toggle', '顯示原始資料');
    toggle.type = 'button';
    toggle.addEventListener('click', () => {
      const open = root.getAttribute(OPEN_ATTR) === '1';
      root.setAttribute(OPEN_ATTR, open ? '0' : '1');
      toggle.textContent = open ? '顯示原始資料' : '隱藏原始資料';
    });
    card.appendChild(toggle);
    return card;
  }

  // ---------- 找出 /context 回覆 ----------

  // 從「Context Usage」標題往上找，直到同一容器也含有分類表
  function findRoots() {
    const roots = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        return /^(#+\s*)?Context Usage$/.test(n.nodeValue.trim()) && !(n.parentElement && n.parentElement.closest('.' + CARD_CLASS))
          ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    let n;
    while ((n = walker.nextNode())) {
      let e = n.parentElement;
      for (let depth = 0; e && e !== document.body && depth < 8; depth++, e = e.parentElement) {
        const t = e.textContent;
        if (/Estimated usage by category/i.test(t) && /Free space/i.test(t)) {
          if (!roots.includes(e)) roots.push(e);
          break;
        }
      }
    }
    // 只留最內層的容器
    return roots.filter(r => !roots.some(o => o !== r && r.contains(o)));
  }

  const cache = new WeakMap(); // root → { text, data }

  function process() {
    const roots = findRoots();
    let prev = null;
    for (const root of roots) {
      const text = root.innerText || root.textContent;
      let entry = cache.get(root);
      if (!entry || entry.text !== text) {
        entry = { text, data: parseContextText(text) };
        cache.set(root, entry);
      }
      const data = entry.data;
      if (!data) continue;

      const prevKey = prev ? JSON.stringify(prev.rows) : '';
      const existing = root.querySelector(':scope > .' + CARD_CLASS);
      if (!existing || existing.dataset.prev !== prevKey) {
        if (existing) existing.remove();
        const card = buildCard(data, prev, root);
        card.dataset.prev = prevKey;
        root.insertBefore(card, root.firstChild);
      }
      root.setAttribute(ROOT_ATTR, '1');
      if (!root.hasAttribute(OPEN_ATTR)) root.setAttribute(OPEN_ATTR, '0');
      prev = data;
    }
  }

  // ---------- 樣式 ----------

  function injectStyle() {
    const css = `
[${ROOT_ATTR}][${OPEN_ATTR}="0"] > :not(.${CARD_CLASS}) { display: none !important; }
.${CARD_CLASS} {
  --cug-bg: #faf9f6; --cug-border: rgba(0,0,0,.10); --cug-fg: #2b2a28; --cug-dim: #85827c;
  --cug-empty: rgba(0,0,0,.14); --cug-up: #c2410c; --cug-down: #15803d;
  box-sizing: border-box; margin: 4px 0 12px; padding: 14px 16px 12px;
  background: var(--cug-bg); color: var(--cug-fg);
  border: 1px solid var(--cug-border); border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,.06);
  font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.${CARD_CLASS} * { box-sizing: border-box; }
html.dark .${CARD_CLASS}, html[data-mode="dark"] .${CARD_CLASS}, html[data-theme="dark"] .${CARD_CLASS} {
  --cug-bg: #2a2a2e; --cug-border: rgba(255,255,255,.16); --cug-fg: #ecebe8; --cug-dim: #9b9893;
  --cug-empty: rgba(255,255,255,.16); --cug-up: #fb923c; --cug-down: #4ade80;
  box-shadow: 0 2px 8px rgba(0,0,0,.35);
}
@media (prefers-color-scheme: dark) {
  html:not(.light):not([data-mode="light"]):not([data-theme="light"]) .${CARD_CLASS} {
    --cug-bg: #2a2a2e; --cug-border: rgba(255,255,255,.16); --cug-fg: #ecebe8; --cug-dim: #9b9893;
    --cug-empty: rgba(255,255,255,.16); --cug-up: #fb923c; --cug-down: #4ade80;
  }
}
.cug-header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
.cug-title { display: flex; align-items: baseline; gap: 10px; }
.cug-total { font-size: 15px; font-weight: 600; }
.cug-pct, .cug-model, .cug-dim { color: var(--cug-dim); }
.cug-note { margin: -4px 0 10px; font-size: 12px; color: var(--cug-up); }
.cug-body { display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; }
.cug-grid { display: grid; grid-template-columns: repeat(10, 18px); grid-auto-rows: 18px; gap: 4px; flex: none; }
.cug-cell { border-radius: 4px; }
.cug-free { border: 1px solid var(--cug-empty); background: transparent; }
.cug-buffer { border: 1px dashed var(--cug-dim);
  background: repeating-linear-gradient(45deg, transparent 0 3px, var(--cug-empty) 3px 5px) !important; }
.cug-legend { display: grid; grid-template-columns: 14px auto auto auto auto; column-gap: 10px; row-gap: 5px; align-items: center; min-width: 0; }
.cug-row { display: contents; }
.cug-swatch { width: 14px; height: 14px; border-radius: 3px; }
.cug-num { text-align: right; }
.cug-delta { text-align: right; font-size: 12px; min-width: 3em; }
.cug-up { color: var(--cug-up); }
.cug-down { color: var(--cug-down); }
.cug-zero { color: var(--cug-dim); }
.cug-foot { grid-column: 1 / -1; margin-top: 6px; font-size: 12px; color: var(--cug-dim); }
.cug-toggle {
  margin-top: 12px; padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer;
  color: var(--cug-dim); background: transparent; border: 1px solid var(--cug-border); border-radius: 6px;
}
.cug-toggle:hover { color: var(--cug-fg); border-color: var(--cug-dim); }
`;
    const s = document.createElement('style');
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  // ---------- 啟動與監看 ----------

  injectStyle();
  // 節流：頁面持續變動時，最多每 500ms 仍保證處理一次（純 debounce 會被無限延後）
  let timer = 0;
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => { timer = 0; process(); }, 500);
  };
  new MutationObserver(muts => {
    // 忽略自己插入卡片造成的變動
    for (const m of muts) {
      const t = m.target;
      if (t.nodeType === 1 && t.closest && t.closest('.' + CARD_CLASS)) continue;
      schedule();
      return;
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  process();
})();
