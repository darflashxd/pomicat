// Run with MCP Playwright browser_run_code_unsafe filename on the shared HR page.
async (page) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => { if (dialog.type() === 'confirm') await dialog.accept(); });
  const started = Date.now();
  const alreadyOpen = await page.locator('#diff-box-sanitized').count();
  if (!alreadyOpen) await page.locator('#safeshare-action-pill').click();
  const selector = '#diff-box-sanitized .ss-badge';
  await page.locator(selector).filter({ hasText: '[HR_DISCIPLINARY_RECORD_2]' }).waitFor({ state: 'attached', timeout: 90000 });
  const readyMs = Date.now() - started;
  const key = await page.locator(selector).filter({ hasText: '[HR_DISCIPLINARY_RECORD_2]' }).getAttribute('data-cand-id');
  const badge = page.locator(selector + '[data-cand-id="' + key + '"]');
  const iterations = [];
  for (let index = 0; index < 10; index++) {
    const visible = index % 2 === 0;
    const start = Date.now();
    await badge.click();
    const state = await page.evaluate(({ key, visible }) => {
      const host = document.getElementById('diff-box-sanitized');
      const clicked = host.querySelector('[data-cand-id="' + key + '"]');
      const aliases = Array.from(host.querySelectorAll('.ss-badge')).filter(item =>
        /^\[HR_DISCIPLINARY_RECORD_[123]\]$/.test(item.dataset.tag || ''));
      return {
        count: aliases.length,
        synced: aliases.every(item => item.classList.contains(visible ? 'ss-badge-unmasked' : 'ss-badge-redacted')),
        phraseIntact: !visible || clicked.textContent.includes('performance improvement plan (PIP)'),
        badgeCount: host.querySelectorAll('.ss-badge').length
      };
    }, { key, visible });
    if (!state.synced || !state.phraseIntact || state.count !== 7) throw new Error(JSON.stringify(state));
    iterations.push({ milliseconds: Date.now() - start, visible, ...state });
  }
  if (errors.length) throw new Error(JSON.stringify(errors));
  const times = iterations.map(item => item.milliseconds).sort((a, b) => a - b);
  const result = { reviewReadyMs: alreadyOpen ? null : readyMs, cycles: iterations.length, medianMs: (times[4] + times[5]) / 2,
    maxMs: times.at(-1), minMs: times[0], iterations, pageErrors: errors,
    note: 'Wall time includes Playwright auto-scroll/actionability; capture completeness warning accepted. No publication.' };
  await page.evaluate(result => { window.__safeShareBenchmark = result; }, result);
  return result;
}
