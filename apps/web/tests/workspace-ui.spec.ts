import { expect, test } from '@playwright/test';

test.setTimeout(30_000);

test('job starts with the brief and reviews the edited authority', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('main')).toHaveCount(1);
  if (process.env.MANDATE_CAPTURE_UI === 'true') {
    await expect(page.locator('[data-ready=true]')).toBeVisible();
    await page.screenshot({
      path: '/private/tmp/wayleave-workspace-desktop.png',
      fullPage: true,
    });
  }
  await page
    .getByLabel('Job brief')
    .fill(
      'Compare local suppliers for recycled packaging, with pricing and delivery dates.',
    );
  await page.getByRole('button', { name: 'Review authority' }).click();
  await expect(
    page.getByText(
      'Compare local suppliers for recycled packaging, with pricing and delivery dates.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Run example journey' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Edit job' }).click();
  await expect(page.getByLabel('Job brief')).toHaveValue(/recycled packaging/);
});

test('invalid budget explains why the job cannot proceed', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Budget', { exact: false }).fill('0');
  await page.getByRole('button', { name: 'Review authority' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Job brief')).toBeVisible();
});

test('account setup checks service availability before requesting a passkey', async ({
  page,
}) => {
  await page.route('**/gateway/passkey/availability', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Passkey onboarding is not configured' }),
    }),
  );
  await page.goto('/accounts');
  await page
    .getByLabel('Account name', { exact: true })
    .first()
    .fill('test-account');
  await page.getByRole('button', { name: 'Create with passkey' }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Passkey onboarding is not configured' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create with passkey' }),
  ).toBeEnabled();
});

test('small screens keep navigation and job controls within the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(
    page.getByRole('link', { name: 'Accounts', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Job brief')).toBeVisible();
  if (process.env.MANDATE_CAPTURE_UI === 'true') {
    await expect(page.locator('[data-ready=true]')).toBeVisible();
    await page.screenshot({
      path: '/private/tmp/wayleave-workspace-mobile.png',
      fullPage: true,
    });
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Review authority' }).click();
  await expect(
    page.getByRole('button', { name: 'Run example journey' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('example run freezes authority and reveals receipts only after delivery', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Review authority' }).click();
  await page.getByRole('button', { name: 'Run example journey' }).click();
  await expect(page.getByLabel('Budget', { exact: false })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'View result' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Run next step' }).click();
  await page.getByRole('button', { name: 'Run next step' }).click();
  await page.getByRole('button', { name: 'View result' }).click();
  await expect(
    page.getByRole('heading', { name: 'Example supplier comparison' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Example receipts & evidence' })
    .click();
  await expect(
    page.getByText('Local example evidence · no onchain receipt', {
      exact: true,
    }),
  ).toHaveCount(3);
  await page.getByRole('button', { name: 'Start again', exact: true }).click();
  await expect(page.getByLabel('Job brief')).toBeVisible();
  await expect(page.getByLabel('Budget', { exact: false })).toBeEnabled();
});

test('revocation stops new steps and lets the user start again', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Review authority' }).click();
  await page.getByRole('button', { name: 'Run example journey' }).click();
  await page.getByRole('button', { name: 'Revoke mandate' }).click();
  await page.getByRole('button', { name: 'Run next step' }).click();
  await expect(page.getByRole('alert')).toContainText('no new step can run');
  await expect(page.getByRole('button', { name: 'View result' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Start again', exact: true }).click();
  await expect(page.getByLabel('Job brief')).toBeVisible();
});

test('authority edits are validated again before execution', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Review authority' }).click();
  await page.getByLabel('Budget', { exact: false }).fill('0');
  await page.getByRole('button', { name: 'Run example journey' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Review the mandate values',
  );
  await expect(page.getByRole('button', { name: 'Run next step' })).toHaveCount(
    0,
  );
});

test('expired example authority cannot execute another step', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Expiry', { exact: false }).fill('1');
  await page.getByRole('button', { name: 'Review authority' }).click();
  await page.getByRole('button', { name: 'Run example journey' }).click();
  await page.evaluate(() => { const current = Date.now(); Date.now = () => current + 3_600_001; });
  await page.getByRole('button', { name: 'Run next step' }).click();
  await expect(page.getByRole('alert')).toContainText('mandate expired');
});


test('disconnected gateway displays a readable error', async ({ page }) => {
  await page.route('**/gateway/passkey/availability', route => route.fulfill({ status: 502, contentType: 'text/plain', body: 'Bad Gateway' }));
  await page.goto('/accounts');
  await page.getByLabel('Account name', { exact: true }).first().fill('test-account');
  await page.getByRole('button', { name: 'Create with passkey' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Account setup is unavailable right now' })).toBeVisible();
});
