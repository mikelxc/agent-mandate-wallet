import { z } from "zod";

export const paymentIntentSchema = z
  .object({
    chainId: z.literal(11155111),
    account: z.string(),
    fundingOwner: z.string(),
    token: z.string(),
    recipient: z.string(),
    amount: z.string(),
    businessReference: z.string(),
    idempotencyKey: z.string(),
    expiresAt: z.number().int(),
  })
  .strict();

export type PaymentIntentInput = z.infer<typeof paymentIntentSchema>;
