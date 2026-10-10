import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { verifyDraftOrder } from "../lib/verifier";

const base = { id: "test-draft", status: "draft" as const, lines: [{ sku: "RICE-5KG", supplier: "Lagos Value Distributors", qty: 2, unitPrice: 17200, deliveryDays: 2 }], total: 34400 };

describe("independent draft verifier", () => {
  it("accepts a valid order inside budget and delivery limit", () => {
    assert.equal(verifyDraftOrder(base, 50000, 3).passed, true);
  });
  it("rejects a recalculated total above the budget", () => {
    assert.match(verifyDraftOrder(base, 30000, 3).errors.join(" "), /budget/i);
  });
  it("rejects invalid quantity, supplier price and delivery", () => {
    const invalid = { ...base, lines: [{ ...base.lines[0], qty: 1.5, unitPrice: 1, deliveryDays: 20 }], total: 1 };
    const errors = verifyDraftOrder(invalid, 50000, 1).errors.join(" ");
    assert.match(errors, /whole number/i);
    assert.match(errors, /price/i);
    assert.match(errors, /delivery/i);
  });
  it("rejects unavailable stock and invalid suppliers", () => {
    const unavailable = { ...base, lines: [{ ...base.lines[0], qty: 31 }], total: 31 * 17200 };
    assert.match(verifyDraftOrder(unavailable, 600000, 5).errors.join(" "), /availability/i);
    const invalidSupplier = { ...base, lines: [{ ...base.lines[0], supplier: "Unknown supplier" }], total: 0 };
    assert.match(verifyDraftOrder(invalidSupplier, 50000, 5).errors.join(" "), /supplier offer/i);
  });
});
