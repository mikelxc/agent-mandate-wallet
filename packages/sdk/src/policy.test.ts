import { describe, expect, test } from 'bun:test';
import { evaluatePayment, usdc, validLabel, type Policy } from './index';
const policy: Policy = { recipient: 'vendor', perPayment: '5', budget: '20', spent: '18', revoked: false };
describe('payment preview', () => {
  test('uses exact six-decimal amounts', () => { expect(usdc('0.000001')).toBe(1n); expect(() => usdc('0.0000001')).toThrow(); });
  test('checks remaining budget', () => expect(evaluatePayment(policy, {id:'1',recipient:'vendor',amount:'3'},new Set())).toBe('Remaining budget exceeded'));
  test('rejects duplicate payment', () => expect(evaluatePayment(policy, {id:'1',recipient:'vendor',amount:'1'},new Set(['1']))).toBe('Request already paid'));
  test('rejects malicious recipient', () => expect(evaluatePayment(policy, {id:'1',recipient:'attacker',amount:'1'},new Set())).toBe('Recipient is outside the mandate'));
  test('accepts permitted payment', () => expect(evaluatePayment(policy, {id:'1',recipient:'vendor',amount:'1'},new Set())).toBeNull());
  test('validates the contract label grammar', () => { expect(validLabel('research-01')).toBe(true); for (const s of ['ab','-abc','ABC','a.b','abc-']) expect(validLabel(s)).toBe(false); });
});
