import { createHash } from "node:crypto";
import { span } from "neatlogs";
import { model, openai, setup } from "./ai";
import shop from "../data/shop.json";
import { verifyDraftOrder, type DraftOrder, type DraftLine } from "./verifier";

type Input = { goal: string; budget: number; maxDeliveryDays: number; injectInventoryFailure?: boolean };
type Event = { at: string; tool: string; attempt: number; status: "ok" | "error"; detail: unknown };
type Result = { status: "success" | "failed"; runLog: Event[]; draftOrder: DraftOrder | null; verification: { passed: boolean; checks: string[]; errors: string[] }; message: string };

const products = shop.products;
const suppliers = shop.suppliers;
const MAX_TURNS = 12;
const MAX_RETRIES_PER_TOOL = 2;
const drafts = new Map<string, DraftOrder>();

const toolDefinitions = [
  { type: "function" as const, function: { name: "get_inventory", description: "Get all seeded products, current stock, and reorder context.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function" as const, function: { name: "get_sales", description: "Get 14-day sales history and daily sales rate for a SKU.", parameters: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"], additionalProperties: false } } },
  { type: "function" as const, function: { name: "get_supplier_offers", description: "Compare supplier price, availability and delivery days for a SKU.", parameters: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"], additionalProperties: false } } },
  { type: "function" as const, function: { name: "propose_line", description: "Validate and add a proposed order line. Rejected proposals include the exact reason; revise them.", parameters: { type: "object", properties: { sku: { type: "string" }, supplier: { type: "string" }, qty: { type: "number" } }, required: ["sku", "supplier", "qty"], additionalProperties: false } } },
  { type: "function" as const, function: { name: "create_draft_order", description: "Save the validated lines as an idempotent draft purchase order. This does not place or purchase an order.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
];

export async function runAgent(input: Input): Promise<Result> {
  if (!model) throw new Error("MODEL is not set; add it to .env.local before starting a run.");
  await setup();
  const runKey = createHash("sha256").update(JSON.stringify([input.goal, input.budget, input.maxDeliveryDays])).digest("hex");
  const runLog: Event[] = [];
  const lines: DraftLine[] = [];
  let draftOrder: DraftOrder | null = null;
  let inventoryFailedOnce = false;
  const failInventory = input.injectInventoryFailure ?? process.env.INJECT_INVENTORY_FAILURE !== "false";
  const append = (tool: string, attempt: number, status: Event["status"], detail: unknown) => runLog.push({ at: new Date().toISOString(), tool, attempt, status, detail });

  const executeTool = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    switch (name) {
      case "get_inventory": {
        if (failInventory && !inventoryFailedOnce) { inventoryFailedOnce = true; throw new Error("Temporary inventory service failure (injected). Retry the inventory lookup."); }
        return products.map(({ sku, name, stock, salesLast14Days, reorderDays }) => ({ sku, name, stock, salesLast14Days, dailySalesRate: Number((salesLast14Days / 14).toFixed(2)), reorderDays }));
      }
      case "get_sales": {
        const p = products.find((item) => item.sku === args.sku);
        if (!p) throw new Error(`Unknown SKU: ${String(args.sku)}`);
        return { sku: p.sku, salesLast14Days: p.salesLast14Days, dailySalesRate: Number((p.salesLast14Days / 14).toFixed(2)) };
      }
      case "get_supplier_offers": {
        if (!products.some((p) => p.sku === args.sku)) throw new Error(`Unknown SKU: ${String(args.sku)}`);
        return suppliers.flatMap((s) => s.offers.filter((o) => o.sku === args.sku).map((o) => ({ supplier: s.name, city: s.city, ...o })));
      }
      case "propose_line": {
        const { sku, supplier, qty } = args as { sku: string; supplier: string; qty: number };
        const product = products.find((p) => p.sku === sku);
        if (!product) return { accepted: false, reason: `Unknown SKU ${sku}.` };
        if (!Number.isInteger(qty) || qty <= 0) return { accepted: false, reason: "Quantity must be a positive whole number." };
        const offer = suppliers.find((s) => s.name === supplier)?.offers.find((o) => o.sku === sku);
        if (!offer) return { accepted: false, reason: `${supplier} has no valid offer for ${sku}.` };
        if (qty > offer.availability) return { accepted: false, reason: `Requested ${qty}; supplier has only ${offer.availability} available.` };
        if (offer.deliveryDays > input.maxDeliveryDays) return { accepted: false, reason: `Delivery takes ${offer.deliveryDays} days; user limit is ${input.maxDeliveryDays} days.` };
        const spent = lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
        const lineCost = qty * offer.price;
        if (spent + lineCost > input.budget) return { accepted: false, reason: `Line costs ₦${lineCost.toLocaleString("en-NG")}; remaining budget is ₦${Math.max(0, input.budget - spent).toLocaleString("en-NG")}.` };
        const prior = lines.find((line) => line.sku === sku);
        if (prior) return { accepted: false, reason: `${sku} is already proposed; revise by starting a new run instead of duplicating it.` };
        const line = { sku, supplier, qty, unitPrice: offer.price, deliveryDays: offer.deliveryDays };
        lines.push(line);
        return { accepted: true, line, remainingBudget: input.budget - spent - lineCost };
      }
      case "create_draft_order": {
        if (!lines.length) throw new Error("Cannot create a draft order without validated lines.");
        draftOrder = drafts.get(runKey) ?? { id: `draft-${runKey.slice(0, 16)}`, status: "draft", lines: [...lines], total: lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0) };
        drafts.set(runKey, draftOrder);
        return draftOrder;
      }
      default: throw new Error(`Unknown tool: ${name}`);
    }
  };

  const tracedAttempt = (name: string) => span({ kind: "TOOL", toolName: name }, async (args: Record<string, unknown>) => executeTool(name, args));
  const agentLoop = span({ kind: "AGENT", name: "stockpilot_agent" }, async () => {
    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: `You are Stockpilot, a cautious Nigerian retail replenishment agent. Use tools to inspect inventory, sales, suppliers and propose lines. The application enforces a budget of ₦${input.budget} and delivery limit of ${input.maxDeliveryDays} days. Never claim a purchase. Only create a draft. Rejections require revising your plan. Prioritize products with stock below approximately 7 days of sales. Call create_draft_order after feasible validated lines; then provide a concise explanation.` },
      { role: "user", content: input.goal },
    ];
    let completed = false;
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await openai.chat.completions.create({ model: model || "", messages: messages as never, tools: toolDefinitions, tool_choice: "auto" });
      const message = response.choices[0]?.message;
      if (!message) throw new Error("Model returned an empty response.");
      messages.push(message as unknown as Record<string, unknown>);
      if (!message.tool_calls?.length) { completed = true; break; }
      for (const call of message.tool_calls) {
        if (call.type !== "function") continue;
        let args: Record<string, unknown>;
        try { args = JSON.parse(call.function.arguments) as Record<string, unknown>; }
        catch { args = {}; }
        let result: unknown;
        let attempt = 0;
        for (; attempt < MAX_RETRIES_PER_TOOL; attempt++) {
          try {
            result = await tracedAttempt(call.function.name)(args);
            append(call.function.name, attempt + 1, "ok", result);
            break;
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            append(call.function.name, attempt + 1, "error", reason);
            result = { error: reason, retryable: attempt + 1 < MAX_RETRIES_PER_TOOL };
            if (attempt + 1 === MAX_RETRIES_PER_TOOL) break;
          }
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
      if (draftOrder) { completed = true; break; }
    }
    return { completed, turnsUsed: Math.min(messages.length, MAX_TURNS), assistantMessage: messages[messages.length - 1] };
  });

  const workflow = span({ kind: "WORKFLOW", name: "stockpilot_run" }, async () => {
    try {
      const agentResult = await agentLoop();
      const verifier = span({ kind: "GUARDRAIL", name: "verify_draft_order" }, async () => verifyDraftOrder(draftOrder, input.budget, input.maxDeliveryDays));
      const verification = await verifier();
      const success = agentResult.completed && verification.passed;
      return { status: success ? "success" : "failed", runLog, draftOrder, verification, message: success ? "A draft order was created and independently verified. No purchase was made." : verification.errors.join(" ") || "The agent did not complete a draft order within the turn limit." } satisfies Result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const verification = await span({ kind: "GUARDRAIL", name: "verify_draft_order" }, async () => verifyDraftOrder(draftOrder, input.budget, input.maxDeliveryDays))();
      return { status: "failed", runLog, draftOrder, verification, message: `Run failed: ${reason}` } satisfies Result;
    }
  });
  return workflow();
}
