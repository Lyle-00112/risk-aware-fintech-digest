import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { decideDigestAction, paymentEventSchema } from "./digest_policy.js";
import { InfraiError, infrai } from "./infrai.js";

const digestTriggerSchema = z.object({
  periodEnd: z.string().datetime().optional(),
});

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    if (request.method === "POST" && request.url === "/payments") {
      const event = paymentEventSchema.parse(await readJson(request));
      const decision = decideDigestAction(event);
      await infrai.queue.publish({ queue: "fintech-digest", payload: decision }, `payment:${event.eventId}`);
      json(response, 202, decision);
      return;
    }

    if (request.method === "POST" && request.url === "/digest/weekly") {
      const trigger = digestTriggerSchema.parse(await readJson(request));
      const periodEnd = trigger.periodEnd ?? new Date().toISOString().slice(0, 10);
      const dispatch = {
        action: "send_weekly_digest",
        audience: "fintech_operations",
        periodEnd,
      } as const;
      await infrai.queue.publish({ queue: "fintech-digest", payload: dispatch }, `digest:${periodEnd}`);
      json(response, 202, dispatch);
      return;
    }

    json(response, 404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      json(response, 400, { error: "invalid_request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      json(response, status, { error: error.code, message: error.message });
      return;
    }
    json(response, 500, { error: "service_error" });
  }
}

export function startServer(port = Number(process.env.PORT ?? 3000)): void {
  createServer((request, response) => void route(request, response)).listen(port, () => {
    console.log(`Digest service listening on http://localhost:${port}`);
  });
}

export async function scheduleWeeklyDigest(): Promise<string> {
  const publicUrl = z.string().url().parse(process.env.PUBLIC_URL);
  const result = await infrai.cron.create(
    { cron_expr: "0 9 * * 1", task: `${publicUrl}/digest/weekly` },
    "weekly-fintech-digest-v1",
  );
  return result.job_id;
}

async function showDecision(): Promise<void> {
  const input = paymentEventSchema.parse({
    eventId: "evt_demo_1042",
    accountId: "acct_treasury_7",
    amountMinor: 1_250_000,
    currency: "USD",
    kind: "payment_succeeded",
    occurredAt: "2026-09-05T08:00:00.000Z",
    riskScore: 24,
  });
  console.log(JSON.stringify(decideDigestAction(input), null, 2));
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "example";
  if (command === "serve") return startServer();
  if (command === "schedule") {
    console.log(`Scheduled job: ${await scheduleWeeklyDigest()}`);
    return;
  }
  if (command === "example") return showDecision();
  throw new Error("Use serve, schedule, or example");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
