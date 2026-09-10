import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(30_000);

test('walkthrough explains real authority and identity without simulating completion', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Prove it’s yours.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Go to step 2', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'You approve every payment.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Use approval-only policy' }).click();
  await expect(
    page.getByRole('heading', { name: 'Give the account a name.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create named account' }),
  ).toBeDisabled();
  await expect(page.getByLabel('Account name')).toHaveValue('my-agent');
  await page.getByRole('button', { name: 'Go to step 4', exact: true }).click();
  const cursor = page.getByRole('button', { name: 'CR Cursor Editor · Agent' });
  await cursor.click();
  await expect(cursor).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Continue with Cursor' }).click();
  await expect(
    page.getByRole('heading', { name: 'Select the NFAT.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Go to step 6', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Bring the lane into Cursor.' }),
  ).toBeVisible();
  await expect(page.locator('.mobile-config-preview')).toContainText(
    '"wayleave"',
  );
  await expect(page.locator('.mobile-config-preview')).toContainText('--cwd');
  const codex = page.getByRole('button', {
    name: 'CX Codex Desktop · CLI · IDE',
  });
  await codex.click();
  await expect(codex).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('heading', { name: 'Bring the lane into Codex.' }),
  ).toBeVisible();
  await expect(page.locator('.mobile-config-preview')).toContainText(
    'mcp_servers.wayleave',
  );
  await expect(
    page.getByRole('button', { name: 'Copy Codex setup' }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Explore your account identity' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'One account. Any client.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Verify NFT → account' }),
  ).toBeDisabled();
  await expect(
    page.getByText('Verified on Sepolia:', { exact: false }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Open my dashboard' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your accounts & requests.' }),
  ).toBeVisible();
});
