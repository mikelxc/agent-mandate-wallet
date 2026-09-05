'use client';
import { useEffect, useRef } from 'react';
import {
  evaluatePayment,
  type Policy,
  type PaymentRequest,
} from '@mandate/sdk';
type ToolContext = {
  registerTool(
    tool: {
      name: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean };
      execute(input: unknown): unknown;
    },
    options: { signal: AbortSignal },
  ): void | Promise<void>;
};
export function usePolicyTools(policy: Policy, completed: Set<string>) {
  const current = useRef({ policy, completed });
  current.current = { policy, completed };
  useEffect(() => {
    const context = (document as Document & { modelContext?: ToolContext })
      .modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: 'preview_payment_policy',
            description:
              'Check a request against the visible simulation policy. Read-only; does not submit a payment or change wallet authority.',
            annotations: { readOnlyHint: true },
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                recipient: { type: 'string' },
                amount: { type: 'string' },
              },
              required: ['id', 'recipient', 'amount'],
              additionalProperties: false,
            },
            execute(input) {
              if (
                !input ||
                typeof input !== 'object' ||
                !['id', 'recipient', 'amount'].every(
                  (key) =>
                    typeof (input as Record<string, unknown>)[key] === 'string',
                )
              )
                throw new Error('id, recipient and amount must be strings');
              const denial = evaluatePayment(
                current.current.policy,
                input as PaymentRequest,
                current.current.completed,
              );
              return {
                simulation: true,
                allowed: denial === null,
                reason: denial,
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Optional browser API: the normal controls remain available. */
    }
    return () => lifecycle.abort();
  }, []);
}
