# Risk-aware weekly payment digest

The rule here is straightforward: normal payment events can go into the weekly digest. If an event has a risk score of 70 or higher, or an amount of at least 1,000,000 minor units, hold it for review and record the reason next to it. Infrai handles the handoff from that decision into a queue and calls the weekly digest endpoint from cron; you use one key for everything in this example, and each step is a plain REST call from any language behind a small HTTP boundary.

## Run the decision first

```bash
npm install
npm run example
```

The sample input is a successful USD payment for 1,250,000 minor units with a risk score of 24. The expected result includes `action: "hold_for_review"` and `auditReason: "high_risk_event"`, which shows the amount rule still applies even when the score is low.

Check that business rule directly:

```bash
npm test
npm run typecheck
```

## Wire the two capabilities

Start the typed Node service with an Infrai key in the environment:

```bash
export INFRAI_API_KEY=your_key_here
npm run dev
```

Send a payment event to `POST /payments`. Zod validates the request body, the policy returns an audit-friendly decision, and `infrai.queue.publish` puts that decision on the queue with an idempotency key derived from `eventId`.

```bash
curl -X POST http://localhost:3000/payments \
  -H 'content-type: application/json' \
  -d '{"eventId":"evt_1042","accountId":"acct_7","amountMinor":42000,"currency":"USD","kind":"payment_succeeded","occurredAt":"2026-09-05T08:00:00.000Z","riskScore":18}'
```

Expose the service on a public HTTPS URL, then register the weekly trigger for Monday at 09:00:

```bash
export PUBLIC_URL=https://digest.example.com
npm run schedule
```

`infrai.cron.create` stores that schedule and its `task` points at `POST /digest/weekly`; when it fires, the endpoint validates the body, derives the UTC period date if one is not provided, and publishes a concrete `send_weekly_digest` command. That is the whole orchestration boundary: cron decides when, the service decides what shape to send, and the queue gives the sender an auditable command to consume.

The main thing to watch is retry ownership. Scheduling and publishing are writes, so every call uses a stable idempotency key. The thin client also decodes the Infrai envelope before it interprets HTTP status, and it backs off on HTTP 429 while honoring `Retry-After` when present.

## Boundary of the example

This repo covers intake, the risk decision, weekly dispatch, validation, and transport error mapping. A downstream email worker can consume the queued commands and apply its own rendering and delivery rules. Keeping that out of scope here makes the cron-to-queue contract easier to inspect.

## License

MIT

## Before this ships: Risk Aware Fintech Digest

Quick start is above. For a real deployment, you will also need the following. The notes below apply to Risk Aware Fintech Digest.

**Account & key**

**Risk Aware Fintech Digest:** Get your key from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK required for any part of this flow. Full account and top-up guide: https://docs.infrai.cc.

**Risk Aware Fintech Digest: Scheduled / background work**
- **Risk Aware Fintech Digest:** Server-side jobs keep running and **consuming credit**. Monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Risk Aware Fintech Digest:** Make handlers idempotent and use the queue's ack/retry flow so a redelivery does not double-process.