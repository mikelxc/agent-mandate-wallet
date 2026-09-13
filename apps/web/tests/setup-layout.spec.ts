import { expect, test } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });

for (const width of [390, 768, 1280]) {
  test(`setup reading order and balance at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const step of [1, 2, 3, 4, 5, 6]) {
      await page.goto(`/?setup=${step}`);
      const intro = page.locator('.arc-step-intro');
      const actions = page.locator('.arc-step-actions');
      const context = page.locator('.mobile-stage > aside');
      await expect(intro).toBeVisible();
      await expect(intro.locator('svg')).toBeVisible();
      await expect(actions).toBeVisible();
      await expect(context).toBeVisible();
      if (step === 1) {
        for (const icon of await context.locator('svg').all())
          await expect(icon).toBeVisible();
      }
      const a = (await intro.boundingBox())!;
      const b = (await context.boundingBox())!;
      const c = (await actions.boundingBox())!;
      if (width <= 700) {
        expect(a.y + a.height).toBeLessThanOrEqual(Math.min(b.y, c.y) + 1);
        expect(b.y + b.height).toBeLessThanOrEqual(c.y + 1);
      } else {
        expect(b.x).toBeGreaterThan(a.x + a.width);
        expect(Math.abs(a.x - c.x)).toBeLessThan(2);
        expect(Math.abs(a.y - b.y)).toBeLessThan(2);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (step === 2 || step === 4)
        await page.screenshot({
          path: `/private/tmp/wayleave-balanced-${width}-step${step}.png`,
          fullPage: true,
        });
    }
  });
}
