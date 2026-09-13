import { expect, test } from '@playwright/test';

test.setTimeout(45000);
for (const width of [390, 1280, 1600]) {
  test(`landing preserves its centered shell and page gutters at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const hero = page.locator('.wallet-entry');
    await expect(hero).toBeVisible();
    const box = await hero.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(24);
    expect(width - box!.x - box!.width).toBeGreaterThanOrEqual(24);
    expect(box!.width).toBeLessThanOrEqual(1120);
    if (width > 900) expect(Math.abs(box!.x - (width - box!.width) / 2)).toBeLessThan(2);
    const copy = await page.locator('.entry-copy').boundingBox();
    const scene = await page.locator('.wallet-scene').boundingBox();
    if (width > 900) expect(scene!.x).toBeGreaterThan(copy!.x + copy!.width);
    else expect(scene!.y).toBeGreaterThan(copy!.y + copy!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/wayleave-landing-restored-${width}.png`, fullPage: true });
  });
}
