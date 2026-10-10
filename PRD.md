Read PRD.md. We are building "Stockpilot" (called OpsPilot in the PRD) for the neatHack hackathon. Work in small steps and commit after each step with a clear message. Phase 1 only: the agent core plus a minimal page; a polished dashboard comes later.

Stack: Next.js (App Router) + TypeScript with npm. Run npm install neatlogs openai.

Requirements:
1. lib/ai.ts: initialise neatlogs once (not on every request) and export a wrapped OpenAI client. Use this setup:
   import OpenAI from "openai";
   import { init, wrapOpenAI } from "neatlogs";
   init({ apiKey: process.env.NEATLOGS_API_KEY, endpoint: "https://ingest.neatlogs.com", workflowName: "stockpilot" });
   const openai = wrapOpenAI(new OpenAI());
   Read the model name from process.env.MODEL. Check the types in node_modules/neatlogs to see whether init must be awaited or flushed before the process exits.
2. A seeded JSON dataset for a Nigerian retail shop (prices in naira): products with stock and 14-day sales, plus suppliers with price, availability and delivery days.
3. A tool-calling agent where the MODEL makes the decisions. Tools take real arguments: get_inventory, get_sales(sku), get_supplier_offers(sku), propose_line(sku, supplier, qty), create_draft_order.