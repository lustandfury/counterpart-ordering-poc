import { CATEGORIES, productBySku } from "../catalog";
import { withHouseDefaults } from "../house-defaults";
import { callJev, type ChoiceAnswer, type NoulAnswer } from "../jev";
import { jevCost } from "../pricing";
import type { JevLine, ParsedLine } from "../types";
import { shortlist } from "./shortlist";

const NONE = "NONE";

/** One Jev call for one line: category, sku (over the shortlist) and unit_ok. */
export async function decideLine(line: ParsedLine, orderText: string): Promise<JevLine> {
  const candidates = shortlist(line, 20);
  const skuCriteria: Record<string, string> = {};
  for (const p of candidates) skuCriteria[p.sku] = `${p.name} (sold per ${p.unit}); also called: ${p.aliases.join(", ")}`;
  skuCriteria[NONE] = "None of the listed products is what the customer asked for";

  const t0 = performance.now();
  const res = await callJev({
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
      unit_ok: {
        type: "noul",
        instructions:
          "Does the quantity and unit make sense for the product the customer is ordering, given how that product is sold?",
        criteria: { true: "Quantity and unit are plausible for the product", false: "Quantity or unit is wrong, missing or does not fit the product" },
      },
    },
  });
  const ms = performance.now() - t0;

  const cat = res.answers.category as ChoiceAnswer;
  const sku = res.answers.sku as ChoiceAnswer;
  const unitOk = res.answers.unit_ok as NoulAnswer;
  const top = Object.entries(sku.probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([s, probability]) => ({ sku: s, probability }));
  const usage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  return {
    lineId: line.id,
    shortlist: candidates.map((p) => p.sku),
    category: { choice: cat.choice, confidence: cat.confidence },
    sku: { choice: sku.choice, confidence: sku.confidence, top },
    unitOk: unitOk.noul,
    ms,
    usage,
    costUsd: jevCost(usage),
  };
}

export const catalogUnit = (sku: string) => productBySku().get(sku)?.unit ?? null;
