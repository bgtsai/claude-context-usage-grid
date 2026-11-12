# 用法：python3 tests/test_grid.py [腳本路徑]   — chromium／firefox／webkit 各跑一次
import sys, pathlib
from playwright.sync_api import sync_playwright
HERE = pathlib.Path(__file__).parent
SRC = open(sys.argv[1] if len(sys.argv) > 1 else HERE.parent / 'Context_Usage_Grid.user.js', encoding='utf-8').read()
fails = 0
def check(n, c, d=''):
    global fails; print(('PASS ' if c else 'FAIL ') + n, d); fails += (not c)
vis = "s=>{const e=document.querySelector(s);return !!(e&&e.offsetParent!==null)}"
with sync_playwright() as p:
    for bn in ['chromium', 'firefox', 'webkit']:
        b = getattr(p, bn).launch(); pg = b.new_page()
        pg.goto((HERE / 'mock.html').as_uri()); pg.add_script_tag(content=SRC); pg.wait_for_timeout(800)
        st = lambda: [pg.evaluate(vis, s) for s in ('.cug-expand', '.cug-grid', '.cug-toggle', '#rawtail')]
        check(f'{bn} 預設只剩一顆按鈕', st() == [True, False, False, False], str(st()))
        check(f'{bn} 按鈕文字', pg.inner_text('.cug-expand') == '顯示用量詳細資料', pg.inner_text('.cug-expand'))
        box = pg.evaluate("(()=>{const c=getComputedStyle(document.querySelector('.cug-card'));return [c.backgroundColor,c.paddingTop,c.borderTopColor]})()")
        check(f'{bn} 收起時不畫卡片', box[0] in ('rgba(0, 0, 0, 0)', 'transparent') and box[1] == '0px', str(box))
        pg.screenshot(path=f'/tmp/cug_{bn}_0.png', clip={'x': 0, 'y': 0, 'width': 700, 'height': 80})
        pg.click('.cug-expand'); pg.wait_for_timeout(100)
        check(f'{bn} 第一層：方格圖', st() == [True, True, True, False], str(st()))
        pg.click('.cug-toggle'); pg.wait_for_timeout(100)
        check(f'{bn} 第二層：原始資料', st() == [True, True, True, True] and pg.inner_text('.cug-toggle') == '隱藏原始資料', str(st()))
        pg.screenshot(path=f'/tmp/cug_{bn}_2.png', full_page=True)
        pg.click('.cug-expand'); pg.wait_for_timeout(100)
        check(f'{bn} 收起第一層時第二層一起收', st() == [True, False, False, False], str(st()))
        pg.click('.cug-expand'); pg.wait_for_timeout(100)
        check(f'{bn} 再展開時原始資料仍收著', st() == [True, True, True, False] and pg.inner_text('.cug-toggle') == '顯示原始資料', str(st()))
        b.close()
print('全部通過' if not fails else f'{fails} 項失敗')
