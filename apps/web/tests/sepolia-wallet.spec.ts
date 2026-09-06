import { expect, test } from '@playwright/test';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import {
  kernelAccountFactoryAbi,
  mockUSDCAbi,
  sepoliaDeployment as deployment,
} from '@mandate/sdk';

const recipient = '0x000000000000000000000000000000000000bEEF';
const client = createPublicClient({
  chain: sepolia,
  transport: http(
    process.env.SEPOLIA_RPC_URL ??
      'https://ethereum-sepolia-rpc.publicnode.com',
  ),
});

test('creates, recovers, funds, pays, verifies, and revokes through the UI', async ({
  page,
}) => {
  test.skip(
    process.env.MANDATE_RUN_SEPOLIA_E2E !== 'true',
    'Run explicitly with bun run e2e:sepolia; this test spends Sepolia gas.',
  );

  const recipientBefore = await client.readContract({
    address: deployment.token,
    abi: mockUSDCAbi,
    functionName: 'balanceOf',
    args: [recipient],
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await expect(page.getByRole('button', { name: /LOCAL TEST/ })).toBeVisible();

  await page.getByLabel('Account label').fill(`e2e-${Date.now().toString(36)}`);
  await page
    .getByRole('button', { name: 'Create account + approve allowance' })
    .click();
  await expect(page.getByRole('status')).toContainText(/Account #\d+ created/);

  const accountText = await page.getByText(/^Account #\d+:/).innerText();
  const accountId = accountText.match(/^Account #(\d+):/)?.[1];
  const accountHref = await page
    .getByText(/^0x[0-9a-fA-F]{40}$/)
    .getAttribute('href');
  const account = accountHref?.split('/').at(-1);
  expect(accountId).toBeTruthy();
  expect(account).toMatch(/^0x[0-9a-fA-F]{40}$/);

  try {
    await page.reload();
    await expect(
      page.getByRole('button', { name: /LOCAL TEST/ }),
    ).toBeVisible();
    await page.getByLabel('Existing account ID').fill(accountId!);
    await page.getByRole('button', { name: 'Load account' }).click();
    await expect(page.getByRole('status')).toContainText(
      `Account #${accountId} loaded`,
    );

    await page.getByRole('button', { name: 'Get 100 demo USDC' }).click();
    await expect(page.getByRole('status')).toContainText(
      '100 demo USDC minted',
    );
    await page.getByRole('button', { name: 'Add 0.005 ETH for gas' }).click();
    await expect(page.getByRole('status')).toContainText(
      'Added 0.005 test ETH',
    );

    await page.getByLabel('Recipient').fill(recipient);
    await page.getByRole('button', { name: 'Sign + send payment' }).click();
    await expect(page.getByRole('status')).toContainText(
      'Payment executed: 3 demo USDC. Recipient balance changed by 3',
    );

    const recipientAfter = await client.readContract({
      address: deployment.token,
      abi: mockUSDCAbi,
      functionName: 'balanceOf',
      args: [recipient],
    });
    expect(recipientAfter - recipientBefore).toBe(3_000_000n);
  } finally {
    const revoke = page.getByRole('button', { name: 'Revoke allowance' });
    if (!(await revoke.isEnabled().catch(() => false))) {
      await page.reload();
      await page.getByLabel('Existing account ID').fill(accountId!);
      await page.getByRole('button', { name: 'Load account' }).click();
      await expect(revoke).toBeEnabled();
    }
    await revoke.click();
    await expect(page.getByRole('status')).toContainText('Allowance revoked');
  }
  const accountOwner = await client.readContract({
    address: deployment.registry,
    abi: kernelAccountFactoryAbi,
    functionName: 'ownerOf',
    args: [BigInt(accountId!)],
  });
  await expect
    .poll(async () =>
      client.readContract({
        address: deployment.token,
        abi: mockUSDCAbi,
        functionName: 'allowance',
        args: [accountOwner, account as `0x${string}`],
      }),
    )
    .toBe(0n);
});
