import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { houseDefaults, houseDefaultsPrompt, withHouseDefaults } from "./house-defaults";

describe("house defaults", () => {
  it("loads the rules and puts them in the prompt and Jev state", () => {
    expect(houseDefaults()).toContain("No default");
    expect(houseDefaultsPrompt()).toContain(houseDefaults());
    expect(withHouseDefaults({ raw: "2x4x8" }).house_rules).toBe(houseDefaults());
  });
  it("never lets application code, prompts or their data files read the answer key", () => {
    // The answer key and anything derived from it. Application code and prompt sources must not mention them.
    const forbidden = /labels(\.draft)?\.json|blind-labels|review-sheet|shouldReview\s*:\s*(true|false)/;
    for (const dir of ["lib", "app", "components"]) {
      // no try/catch: a missing folder should fail the test, not silently skip the check
      const files = (readdirSync(dir, { recursive: true }) as string[]).filter((f) => /\.(tsx?|json|md|csv|txt)$/.test(f) && !/\.test\.tsx?$/.test(f));
      for (const f of files) expect(readFileSync(`${dir}/${f}`, "utf8"), `${dir}/${f}`).not.toMatch(forbidden);
    }
    // The business rules both pipelines receive as a prompt must not carry answers either
    expect(readFileSync("data/house-defaults.md", "utf8")).not.toMatch(/labels(\.draft)?\.json|blind-labels|review-sheet|shouldReview/);
  });
});
