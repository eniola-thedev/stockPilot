# Stockpilot

Phase 1 of Stockpilot is a small inventory-replenishment agent for a seeded Nigerian retail shop. It inspects stock, sales and supplier offers, validates proposed order lines in application code, saves a draft order, and independently verifies that draft. It never places an order or spends money.

## Run locally

1. Install dependencies with `npm install`.
2. Put `OPENAI_API_KEY`, `NEATLOGS_API_KEY`, and `MODEL` in `.env.local`. Copy the variable names from `.env.example`; keep secrets out of source control.
3. Start the app with `npm run dev` and open `http://localhost:3000`.
4. Submit a goal, budget in naira, and maximum delivery time.

The first inventory lookup fails once by default, then retries. Set `INJECT_INVENTORY_FAILURE=false` in `.env.local` to disable the injected failure. The agent is limited to 12 model turns and two attempts per tool call. The API flushes Neatlogs traces before each response.

## Checks

- `npm test` runs verifier and budget-rule tests.
- `npm exec --offline --no -- neatlogs doctor --local --json` checks local SDK capture.

Each run returns its execution log, draft order, independent verification, and final status. A failed verification cannot produce a successful run.
