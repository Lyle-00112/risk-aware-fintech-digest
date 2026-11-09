import { z } from "zod";

export const paymentEventSchema = z.object({
  eventId: z.string().min(1),
  accountId: z.string().min(1),
  amountMinor: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  kind: z.enum(["payment_succeeded", "payment_failed", "refund_issued"]),
  occurredAt: z.string().datetime(),
  riskScore: z.number().min(0).max(100),
});

export type PaymentEvent = z.infer<typeof paymentEventSchema>;

export type DigestDecision = {
  action: "include" | "hold_for_review";
  auditReason: "routine_event" | "high_risk_event";
  event: PaymentEvent;
};

export function decideDigestAction(event: PaymentEvent): DigestDecision {
  const highRisk = event.riskScore >= 70 || event.amountMinor >= 1_000_000;
  return {
    action: highRisk ? "hold_for_review" : "include",
    auditReason: highRisk ? "high_risk_event" : "routine_event",
    event,
  };
}
