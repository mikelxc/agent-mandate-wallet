import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(30_000);

test('walkthrough explains real authority and identity without simulating completion', async ({
  page,
}) => {
  await page.goto('/?setup=1');
  await expect(
    page.getByRole('heading', { name: 'Connect your wallet.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Go to step 2', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'How your agent spends.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Use these permissions' }).click();
  await expect(
    page.getByRole('heading', { name: 'Name your agent’s wallet' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create agent wallet' }),
  ).toBeDisabled();
  await expect(page.getByLabel('Agent wallet name')).toHaveValue('');
  await page.getByRole('button', { name: 'Go to step 4', exact: true }).click();
  const cursor = page.getByRole('button', { name: 'Cursor Editor · Agent' });
  await cursor.click();
  await expect(cursor).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('heading', { name: 'Connect Cursor.' }),
  ).toBeVisible();
  await page.getByText('Connection settings', { exact: true }).click();
  await expect(page.locator('.mobile-config-preview')).toContainText(
    '"wayleave"',
  );
  await expect(page.locator('.mobile-config-preview')).toContainText('bunx');
  await expect(page.locator('.mobile-config-preview')).toContainText(
    'wayleave-mcp@0.1.1',
  );
  await expect(page.getByLabel('Wayleave checkout path')).toHaveCount(0);
  const codex = page.getByRole('button', {
    name: 'Codex Desktop · CLI · IDE',
  });
  await codex.click();
  await expect(codex).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('heading', { name: 'Connect Codex.' }),
  ).toBeVisible();
  await expect(page.locator('.mobile-config-preview')).toContainText(
    'mcp_servers.wayleave',
  );
  await expect(
    page.getByRole('button', { name: 'Copy Codex setup' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Continue to account' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your agent wallet is ready.' }),
  ).toBeVisible();
  await page
    .getByText('Wallet details & verification', { exact: true })
    .click();
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
    page.getByRole('heading', { name: 'Let your agents do their thing.' }),
  ).toBeVisible();
});
