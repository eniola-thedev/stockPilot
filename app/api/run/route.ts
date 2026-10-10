import { flush } from "neatlogs";
import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";
import { setup } from "@/lib/ai";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await setup();
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.goal !== "string" || !body.goal.trim()) return NextResponse.json({ error: "goal must be a non-empty string." }, { status: 400 });
    if (typeof body.budget !== "number" || !Number.isFinite(body.budget) || body.budget <= 0) return NextResponse.json({ error: "budget must be a positive finite number in naira." }, { status: 400 });
    if (typeof body.maxDeliveryDays !== "number" || !Number.isInteger(body.maxDeliveryDays) || body.maxDeliveryDays < 0) return NextResponse.json({ error: "maxDeliveryDays must be a non-negative whole number." }, { status: 400 });
    const result = await runAgent({ goal: body.goal, budget: body.budget, maxDeliveryDays: body.maxDeliveryDays });
    return NextResponse.json(result, { status: result.status === "success" ? 200 : 422 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected run failure.";
    return NextResponse.json({ status: "failed", error: message }, { status: 500 });
  } finally {
    await flush();
  }
}
