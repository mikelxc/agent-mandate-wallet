import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('mobile onboarding starts with the agent and generates host-specific MCP setup', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await expect(
    page.getByRole('heading', { name: 'Where does your agent work?' }),
  ).toBeVisible();
  const cursorHost = page.getByRole('button', {
    name: 'CR Cursor Editor · Agent',
  });
  await cursorHost.click();
  await expect(cursorHost).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Continue with Cursor' }).click();
  await expect(
    page.getByRole('heading', { name: 'Prove it’s yours.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: /connect & verify owner|verify ownership/i,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Go to step 3' }).click();
  await expect(
    page.getByRole('heading', { name: 'Give the account a name.' }),
  ).toBeVisible();
  await expect(page.getByLabel('Account name')).toHaveValue('my-agent');
  await expect(page.locator('.nfat-card')).toContainText(
    'my-agent.wayleave.eth',
  );
  await expect(page.locator('.ens-preview-note')).toContainText('ENSv2');
  await page.getByRole('button', { name: 'Go to step 4' }).click();
  await expect(
    page.getByRole('heading', { name: 'Select the NFAT.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Go to step 5' }).click();
  await expect(
    page.getByRole('heading', { name: 'Bring the lane into Cursor.' }),
  ).toBeVisible();
  await expect(page.locator('.mobile-config-preview')).toContainText(
    '"mcpServers"',
  );
  await expect(page.locator('.mobile-config-preview')).toContainText(
    'MANDATE_AGENT_TOKEN',
  );

  await page.getByRole('button', { name: 'PRO MODE' }).click();
  await expect(
    page.getByRole('heading', { name: 'An agent can ask. It cannot spend.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Minimal setup' }).click();
  await expect(
    page.getByRole('heading', { name: 'Bring the lane into Cursor.' }),
  ).toBeVisible();
});
