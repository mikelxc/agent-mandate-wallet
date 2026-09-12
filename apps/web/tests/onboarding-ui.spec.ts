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
  await page
    .getByRole('button', { name: 'Go to step 2: How it works', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'How your agent spends.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Name my agent wallet' }).click();
  await expect(
    page.getByRole('heading', { name: 'Name your agent’s wallet' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create agent wallet' }),
  ).toBeDisabled();
  await expect(page.getByLabel('Agent wallet name')).toHaveValue('');
  await page.getByLabel('Agent wallet name').fill('research');
  const explanation = page.getByRole('complementary', {
    name: 'Your agent wallet explained',
  });
  await expect(explanation).toContainText('research.');
  await expect(explanation).toContainText('Name preview');
  await expect(
    page.getByRole('button', { name: 'Create agent wallet', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Go to step 4: Link agent', exact: true })
    .click();
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
    'wayleave-mcp@0.1.2',
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
  await page
    .getByRole('button', { name: 'View setup checklist' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Finish setting up your agent.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Connect my wallet', exact: true }),
  ).toBeVisible();
  await expect(explanation.getByText('To do', { exact: true })).toHaveCount(3);
  await expect(explanation.getByText('Done', { exact: true })).toHaveCount(0);
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

test('payment walkthrough teaches approval without changing real setup state', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const writes: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      /\/gateway\/(agents|operations|auth\/verify)/.test(request.url())
    )
      writes.push(request.url());
  });
  await page.goto('/?setup=1');
  await page
    .getByRole('button', { name: 'See how it works', exact: true })
    .click();
  const explanation = page.getByRole('complementary', {
    name: 'Your agent wallet explained',
  });
  await expect(explanation).toContainText('Ownership NFT');
  await page.getByRole('button', { name: 'Next: access', exact: true }).click();
  await expect(explanation).toContainText('Your signature still required');
  await page
    .getByRole('button', { name: 'Next: payments', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Play payment walkthrough' }),
  ).toBeVisible();
  await expect(explanation).toContainText('Nothing has been paid.');
  const stages = page.getByRole('group', {
    name: 'Payment walkthrough stages',
  });
  await stages.getByRole('button', { name: 'Approval', exact: true }).click();
  await expect(explanation).toContainText(
    'Review the exact amount and recipient',
  );
  await stages.getByRole('button', { name: 'Payment', exact: true }).click();
  await expect(explanation).toContainText('through the agent wallet');
  await expect(explanation.locator('[data-payment-stage="2"]')).toBeVisible();
  expect(
    await explanation.evaluate(
      (element) => element.getAnimations({ subtree: true }).length,
    ),
  ).toBe(0);
  await stages.getByRole('button', { name: 'Receipt', exact: true }).click();
  await expect(explanation).toContainText(
    'Example receipt · No real transaction',
  );
  await page
    .getByRole('button', { name: 'Go to step 5: Next steps' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Finish setting up your agent.' }),
  ).toBeVisible();
  expect(writes).toEqual([]);
});

test('all setup steps fit a narrow screen with a long wallet name', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/?setup=1');
  for (const step of [
    'Connect',
    'How it works',
    'Agent wallet',
    'Link agent',
    'Next steps',
  ]) {
    await page
      .getByRole('navigation', { name: 'Onboarding steps' })
      .getByRole('button', { name: new RegExp(`: ${step}$`) })
      .click();
    if (step === 'Agent wallet')
      await page
        .getByLabel('Agent wallet name')
        .fill('a-very-long-research-wallet-name');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
