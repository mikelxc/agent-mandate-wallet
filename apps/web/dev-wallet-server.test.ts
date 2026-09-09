import { afterEach, expect, test } from 'bun:test';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createDevWalletHandler } from './dev-wallet-server';

const originalNodeEnv = process.env.NODE_ENV;
const originalVercel = process.env.VERCEL;
afterEach(() => {
  if (originalNodeEnv === undefined)
    Reflect.deleteProperty(process.env, 'NODE_ENV');
  else Object.assign(process.env, { NODE_ENV: originalNodeEnv });
  if (originalVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = originalVercel;
});

test('test signer requires explicit opt-in and refuses production and Vercel', () => {
  Object.assign(process.env, { NODE_ENV: 'development' });
  delete process.env.VERCEL;
  expect(createDevWalletHandler(false)).toBeUndefined();
  expect(createDevWalletHandler(true)).toBeFunction();
  Object.assign(process.env, { NODE_ENV: 'production' });
  expect(createDevWalletHandler(true)).toBeUndefined();
  Object.assign(process.env, { NODE_ENV: 'development', VERCEL: '1' });
  expect(createDevWalletHandler(true)).toBeUndefined();
});

test('test signer validates method, header, host, and exact origin before loading a key', async () => {
  Object.assign(process.env, { NODE_ENV: 'development' });
  delete process.env.VERCEL;
  const handle = createDevWalletHandler(true)!;
  const valid = {
    host: 'localhost:3000',
    origin: 'http://localhost:3000',
    'x-mandate-dev-wallet': '1',
  };
  for (const [method, headers] of [
    ['GET', valid],
    ['POST', { ...valid, 'x-mandate-dev-wallet': undefined }],
    ['POST', { ...valid, origin: undefined }],
    ['POST', { ...valid, origin: 'https://evil.example' }],
    ['POST', { ...valid, origin: 'http://localhost:3002' }],
    ['POST', { ...valid, host: 'evil.example', origin: 'http://evil.example' }],
  ] as const) {
    const request = Object.assign(Readable.from(['{}']), {
      method,
      headers,
    }) as unknown as IncomingMessage;
    let body = '';
    const response = {
      statusCode: 200,
      setHeader() {},
      end(value: string) {
        body = value;
      },
    };
    await handle(request, response as unknown as ServerResponse);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(body).error.message).toBe('Local app origin required.');
  }
});

test('test signer rejects oversized input before parsing or loading a key', async () => {
  Object.assign(process.env, { NODE_ENV: 'development' });
  delete process.env.VERCEL;
  const handle = createDevWalletHandler(true)!;
  const request = Object.assign(Readable.from(['x'.repeat(1_000_001)]), {
    method: 'POST',
    headers: {
      host: '127.0.0.1:3000',
      origin: 'http://127.0.0.1:3000',
      'x-mandate-dev-wallet': '1',
    },
  }) as unknown as IncomingMessage;
  let body = '';
  const response = {
    statusCode: 200,
    setHeader() {},
    end(value: string) {
      body = value;
    },
  };
  await handle(request, response as unknown as ServerResponse);
  expect(response.statusCode).toBe(400);
  expect(JSON.parse(body).error.message).toBe('Request is too large.');
});
