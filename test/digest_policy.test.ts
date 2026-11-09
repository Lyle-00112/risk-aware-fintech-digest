import assert from "node:assert/strict";
import test from "node:test";
import { decideDigestAction, paymentEventSchema } from "../src/digest_policy.js";

test("a large payment is held even when its model risk score is low", () => {
  const event = paymentEventSchema.parse({
    eventId: "evt_1042",
    accountId: "acct_7",
    amountMinor: 1_250_000,
    currency: "USD",
    kind: "payment_succeeded",
    occurredAt: "2026-09-05T08:00:00.000Z",
    riskScore: 24,
  });

  assert.deepEqual(decideDigestAction(event), {
    action: "hold_for_review",
    auditReason: "high_risk_event",
    event,
  });
});
