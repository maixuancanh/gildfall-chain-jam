const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:4188/');
      await page.waitForFunction(() => document.querySelector('#balance')?.textContent.includes('USDC'));
      await page.locator('#entry-play').click();
      await page.locator('#result').waitFor({ state: 'visible' });
      const logo = await page.locator('.panel-title img').evaluate(image => {
        const bounds = image.getBoundingClientRect();
        const panel = document.querySelector('.panel').getBoundingClientRect();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let minX = canvas.width, maxX = -1;
        for (let y = 0; y < canvas.height; y += 2) {
          for (let x = 0; x < canvas.width; x += 2) {
            if (pixels[(y * canvas.width + x) * 4 + 3] > 48) {
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
            }
          }
        }
        const paintedLeft = bounds.left - panel.left + minX / canvas.width * bounds.width;
        const paintedRight = bounds.left - panel.left + maxX / canvas.width * bounds.width;
        return { loaded: image.complete && image.naturalWidth > 0, left: bounds.left - panel.left, right: bounds.right - panel.left, top: bounds.top - panel.top, bottom: bounds.bottom - panel.top, paintedLeft, paintedRight, panelWidth: panel.width, panelHeight: panel.height };
      });
      assert(logo.loaded, 'Gildfall logo loads');
      assert(logo.left > logo.panelWidth * .08 && logo.right < logo.panelWidth * .92, 'Logo stays within the nameplate width');
      assert(logo.right - logo.left >= logo.panelWidth * .8 && logo.bottom - logo.top >= logo.panelHeight * .11, 'Logo fills more of the nameplate');
      assert(logo.top > logo.panelHeight * .14 && logo.bottom < logo.panelHeight * .28, 'Logo stays within the nameplate height');
      assert(logo.paintedLeft > logo.panelWidth * .2 && logo.paintedRight < logo.panelWidth * .8, 'Visible logo letters clear both plaque ornaments');
      assert.equal((await page.locator('#result').textContent()).trim(), 'READY TO CAST', 'Plaque starts with a ready state');
      assert.equal((await page.locator('#balance-label').textContent()).trim(), 'BALANCE');
      assert.match(await page.locator('#sound').evaluate(button => getComputedStyle(button, '::before').backgroundImage), /sound-buttons\.png/);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#sound').evaluate(button => button.matches(':focus-visible')), true);
      assert.equal(await page.locator('#sound').evaluate(button => getComputedStyle(button).outlineStyle), 'none', 'Keyboard focus does not draw a cyan rectangle');
      assert.equal(await page.locator('#sound').evaluate(button => getComputedStyle(button, '::before').filter), 'brightness(1.25)', 'Keyboard focus remains visible on the button art');
      await page.locator('#sound').click();
      assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'false');
      assert.match(await page.locator('#sound').evaluate(button => getComputedStyle(button, '::before').backgroundImage), /sound-buttons\.png/);
      await page.locator('#sound').click();
      assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'true');
      assert.equal((await page.locator('#unit').textContent()).trim(), 'USDC');
      assert.equal((await page.locator('#cast').textContent()).trim(), 'CAST');
      assert.equal(await page.locator('#wager-help').count(), 0);
      assert.equal(await page.locator('.route').first().evaluate(button => getComputedStyle(button).backgroundImage.includes('choice-frame.png')), true);
      assert.equal(await page.locator('[data-depth]').first().evaluate(button => getComputedStyle(button).backgroundImage.includes('choice-frame.png')), true);
      assert.equal(await page.locator('.wager-control').evaluate(control => getComputedStyle(control).backgroundImage.includes('wager-frame.png')), true);
      assert.equal(await page.locator('#cast').evaluate(button => getComputedStyle(button).backgroundSize), 'contain');
      await page.locator('#wager-minus').click();
      assert.equal(await page.locator('#wager').inputValue(), '9');
      await page.locator('#wager-plus').click();
      assert.equal(await page.locator('#wager').inputValue(), '10');
      await page.locator('#wager').fill('100');
      await page.locator('#wager-plus').click();
      assert.equal(await page.locator('#wager').inputValue(), '100', 'Plus respects the demo wager cap');
      assert.match(await page.locator('#status').textContent(), /Maximum wager.*100 USDC/, 'Plus explains the cap instead of silently doing nothing');
      await page.locator('#wager').click();
      assert.equal(await page.locator('#wager').evaluate(input => document.activeElement === input && getComputedStyle(input).borderTopWidth === '0px' && getComputedStyle(input).outlineStyle === 'none' && getComputedStyle(input).backgroundColor === 'rgba(0, 0, 0, 0)'), true, 'Editable value shows only a caret, not a CSS frame');
      await page.locator('#wager').fill('10');
      assert.equal(await page.locator('.haul-info').count(), 1);
      assert.equal(await page.locator('.haul-info details').count(), 0);
      assert.equal(await page.locator('.haul-info h2').count(), 2);
      assert.equal(await page.locator('#paytable tr').count(), 6);
      assert.equal(await page.locator('#reset, #outcome-details').count(), 0);
      const layout = await page.locator('.haul-info').evaluate(panel => {
        const frame = panel.getBoundingClientRect();
        const note = panel.querySelector('p').getBoundingClientRect();
        const head = panel.querySelector('.haul-info-head').getBoundingClientRect();
        const controls = document.querySelector('.panel').getBoundingClientRect();
        return { frameBottom: frame.bottom, noteBottom: note.bottom, headTop: head.top, frameTop: frame.top, headerCenterRatio: (head.top + head.height / 2 - frame.top) / frame.height, controlsBottom: controls.bottom, scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, image: getComputedStyle(panel).backgroundImage };
      });
      assert(layout.noteBottom < layout.frameBottom - 20, `Text crosses lower frame at ${width}px`);
      assert(layout.headTop > layout.frameTop, `Title crosses upper frame at ${width}px`);
      assert(layout.frameTop <= layout.controlsBottom - 25, `Info frame is too far from controls at ${width}px`);
      assert(Math.abs(layout.headerCenterRatio - 0.19) < 0.015, `Headings are not vertically centered in the blue band at ${width}px`);
      assert(layout.scrollWidth <= layout.viewportWidth, `Horizontal overflow at ${width}px`);
      assert(layout.image.includes('haul-info-frame.png'));
      assert.deepEqual(errors, []);
      if (width === 1280) {
        const initialPlaque = await page.locator('#result').boundingBox();
        await page.screenshot({ path: 'artifacts/result-plaque-idle.png', fullPage: true });
        await page.locator('#cast').click();
        await page.locator('#result').getByText('PROCESSING', { exact: true }).waitFor({ state: 'visible' });
        assert.deepEqual(await page.locator('#result').boundingBox(), initialPlaque, 'Plaque stays fixed while processing');
        await page.screenshot({ path: 'artifacts/result-plaque-processing.png', fullPage: true });
        await page.waitForFunction(() => document.querySelector('#result strong')?.textContent !== 'PROCESSING', null, { timeout: 15000 });
        assert.deepEqual(await page.locator('#result').boundingBox(), initialPlaque, 'Plaque stays fixed for the result');
        assert.equal(await page.locator('#history span').count(), 1);
        await page.locator('#wager').fill('37');
        await page.locator('#wager-minus').click();
        assert.equal(await page.locator('#wager').inputValue(), '36', 'Minus uses the freshly typed wager');
        await page.locator('#wager').fill('94');
        await page.locator('#wager-plus').click();
        assert.equal(await page.locator('#wager').inputValue(), '95', 'Plus uses the freshly typed wager');
        await page.locator('#wager').fill('10');
        await page.locator('#cast').click();
        await page.locator('#result').getByText('PROCESSING', { exact: true }).waitFor({ state: 'visible' });
        await page.waitForFunction(() => document.querySelectorAll('#history span').length === 2, null, { timeout: 15000 });
        const chipSizes = await page.locator('#history span').evaluateAll(items => items.map(item => ({ width: item.getBoundingClientRect().width, height: item.getBoundingClientRect().height })));
        assert.equal(chipSizes[0].width, chipSizes[1].width, 'History cells should share a width');
        assert.equal(chipSizes[0].height, chipSizes[1].height, 'History cells should share a height');
        await page.screenshot({ path: 'artifacts/haul-info-with-results.png', fullPage: true });
        assert.notEqual(await page.locator('#balance').textContent(), '1000 USDC', 'Two hauls change the demo balance');
        await page.evaluate(() => localStorage.setItem('jinxwell-chain-jam.demo.v1', JSON.stringify({ version: 1, balance: '82500', current: null, history: [] })));
        await page.reload();
        await page.waitForFunction(() => document.querySelector('#balance')?.textContent.includes('USDC'));
        await page.locator('#entry-play').click();
        await page.locator('#wager').fill('37');
        await page.locator('#wager-minus').click();
        assert.equal(await page.locator('#wager').inputValue(), '36', 'Minus uses typed value after reload');
        await page.locator('#wager').fill('94');
        await page.locator('#wager-plus').click();
        assert.equal(await page.locator('#wager').inputValue(), '95', 'Plus uses typed value after reload');
        assert.equal(await page.locator('#balance').textContent(), '1000 USDC', 'Reload starts a fresh demo balance');
        await page.locator('#result').waitFor({ state: 'visible' });
        assert.equal((await page.locator('#result').textContent()).trim(), 'READY TO CAST', 'New visit starts ready');
        assert.equal(await page.locator('#history span').count(), 0, 'New visit starts with no recent hauls');
        assert.match(await page.locator('#history').textContent(), /No hauls yet/);
      } else {
        const twelveCells = await page.locator('.haul-info').evaluate(panel => {
          const history = panel.querySelector('#history');
          history.replaceChildren(...Array.from({ length: 12 }, (_, index) => {
            const cell = document.createElement('span');
            cell.textContent = `${index % 3 ? '0.5' : '12'}× · 100 returned`;
            return cell;
          }));
          const frame = panel.getBoundingClientRect();
          const cells = [...history.querySelectorAll('span')].map(cell => cell.getBoundingClientRect());
          return { lastBottom: cells.at(-1).bottom, frameBottom: frame.bottom, widths: [...new Set(cells.map(cell => cell.width))], heights: [...new Set(cells.map(cell => cell.height))] };
        });
        assert(twelveCells.lastBottom < twelveCells.frameBottom - 20, 'Twelve mobile hauls must fit inside the lower rail');
        assert(Math.max(...twelveCells.widths) - Math.min(...twelveCells.widths) < 1, 'All mobile history cells share a visual width');
        assert.equal(twelveCells.heights.length, 1, 'All mobile history cells share a height');
      }
      await page.close();
    }
    console.log('PASS: desktop/mobile frame, always-visible content, no overflow, live haul');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
