// Minimal live call; prints the raw response. Usage: npm run jev:test
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error("Set TYPESAFE_API_KEY in .env.local");
  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "jev-latest",
      state: { raw: "20 of the 2x6", qty: 20, unit: null, product: "2x6x8 SPF stud, sold per piece" },
      questions: {
        category: {
          type: "choice",
          instructions: "Which category does the ordered item belong to?",
          criteria: {
            dimensional_lumber: "Framing lumber such as 2x4 and 2x6",
            sheet_goods: "Plywood, OSB",
            fasteners: "Nails, screws, bolts",
          },
        },
        sku: {
          type: "choice",
          instructions: "Which catalog product did the customer order?",
          criteria: {
            "SPF-2X6-8": "2x6x8 SPF stud, each",
            "SPF-2X6-10": "2x6x10 SPF, each",
            "PT-2X6-8": "2x6x8 pressure-treated, each",
          },
        },
        unit_ok: {
          type: "noul",
          instructions: "Does the quantity and unit make sense for this product?",
          criteria: { true: "Quantity and unit are plausible", false: "Quantity or unit is wrong" },
        },
      },
    }),
  });
  console.log(res.status);
  console.log(JSON.stringify(await res.json(), null, 2));
}
main();
