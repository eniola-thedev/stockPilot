import shop from "../data/shop.json";

export type DraftLine = { sku: string; supplier: string; qty: number; unitPrice: number; deliveryDays: number };
export type DraftOrder = { id: string; status: "draft"; lines: DraftLine[]; total: number };

export function verifyDraftOrder(order: DraftOrder | null, budget: number, maxDeliveryDays: number) {
  const errors: string[] = [];
  const checks: string[] = [];
  let recalculated = 0;
  if (!order || order.status !== "draft") errors.push("A draft order was not created.");
  if (order && order.lines.length === 0) errors.push("Draft order must contain at least one line.");
  for (const line of order?.lines ?? []) {
    if (!Number.isInteger(line.qty) || line.qty <= 0) errors.push(`${line.sku}: quantity must be a positive whole number.`);
    const offer = shop.suppliers.find((s) => s.name === line.supplier)?.offers.find((o) => o.sku === line.sku);
    if (!offer) errors.push(`${line.sku}: supplier offer is invalid.`);
    else {
      if (line.qty > offer.availability) errors.push(`${line.sku}: quantity exceeds supplier availability.`);
      if (line.unitPrice !== offer.price) errors.push(`${line.sku}: unit price does not match raw supplier data.`);
      if (offer.deliveryDays > maxDeliveryDays) errors.push(`${line.sku}: supplier exceeds the delivery limit.`);
      recalculated += offer.price * line.qty;
    }
    if (!shop.products.some((product) => product.sku === line.sku)) errors.push(`${line.sku}: product does not exist.`);
  }
  if (order) {
    if (order.total !== recalculated) errors.push("Draft total does not match the independently recalculated total.");
    if (recalculated > budget) errors.push("Recalculated total exceeds the user's budget.");
    checks.push(`Recalculated total: ₦${recalculated.toLocaleString("en-NG")}.`);
  }
  checks.push("Quantities, supplier offers and prices, delivery limit, and budget checked against the seeded data.");
  return { passed: errors.length === 0, checks, errors };
}
