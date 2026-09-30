import { CATEGORIES, productBySku } from "../catalog";
import { withHouseDefaults } from "../house-defaults";
import { callJev, type ChoiceAnswer, type NoulAnswer } from "../jev";
import { jevCost } from "../pricing";
import type { JevLine, ParsedLine } from "../types";
import { shortlist } from "./shortlist";

const NONE = "NONE";

/**
 * Two Jev calls per line. Call 1 asks category and sku over the shortlist. Call 2 asks unit_ok with the chosen
 * product named, because "does the quantity make sense" cannot be judged before the product and its selling
 * unit are known (asked blind, Jev marked down every line whose unit was unstated or worded differently).
 */
export async function decideLine(line: ParsedLine, orderText: string): Promise<JevLine> {
  const candidates = shortlist(line, 20);
  const skuCriteria: Record<string, string> = {};
  for (const p of candidates) skuCriteria[p.sku] = `${p.name} (sold per ${p.unit}); also called: ${p.aliases.join(", ")}`;
  skuCriteria[NONE] = "None of the listed products is what the customer asked for";

  const t0 = performance.now();
  const first = await callJev({
    state: withHouseDefaults({
      order_line: line.raw,
      product_words: line.item,
      quantity: line.qty,
      unit_as_spoken: line.unit,
      full_order_message: orderText,
    }),
    questions: {
      category: {
        type: "choice",
        instructions: "Which product category does this order line belong to?",
        criteria: CATEGORIES,
      },
      sku: {
        type: "choice",
        instructions:
          "Which catalog product did the customer ask for on this order line? Apply the house_rules in the state. Choose the most likely product; if nothing listed fits, choose NONE.",
        criteria: skuCriteria,
      },
    },
  });
  const cat = first.answers.category as ChoiceAnswer;
  const sku = first.answers.sku as ChoiceAnswer;
  const top = Object.entries(sku.probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([s, probability]) => ({ sku: s, probability }));

  // Call 2: only when a product was chosen. With NONE there is nothing to check the quantity against.
  const product = sku.choice === NONE ? undefined : productBySku().get(sku.choice);
  let unitOk = 0;
  let usedIn = first.usage.input_tokens;
  let usedOut = first.usage.output_tokens;
  if (product) {
    const second = await callJev({
      state: withHouseDefaults({
        order_line: line.raw,
        quantity: line.qty,
        unit_as_spoken: line.unit,
        product: product.name,
        product_sold_per: product.unit,
      }),
      questions: {
        unit_ok: {
          type: "noul",
          instructions: `Is the ordered quantity a sensible number of "${product.unit}" for this product? A bare number with no unit means the product's selling unit (${product.unit}), which is fine. Only answer no if the number or unit is impossible or contradicts how the product is sold.`,
          criteria: {
            true: `The quantity is a sensible number of ${product.unit}`,
            false: "The quantity or unit is impossible or contradicts how the product is sold",
          },
        },
      },
    });
    unitOk = (second.answers.unit_ok as NoulAnswer).noul;
    usedIn += second.usage.input_tokens;
    usedOut += second.usage.output_tokens;
  }
  const ms = performance.now() - t0;
  const usage = { inputTokens: usedIn, outputTokens: usedOut };
  return {
    lineId: line.id,
    shortlist: candidates.map((p) => p.sku),
    category: { choice: cat.choice, confidence: cat.confidence },
    sku: { choice: sku.choice, confidence: sku.confidence, top },
    unitOk,
    ms,
    usage,
    costUsd: jevCost(usage),
  };
}

export const catalogUnit = (sku: string) => productBySku().get(sku)?.unit ?? null;
