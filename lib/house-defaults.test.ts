import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { houseDefaults, houseDefaultsPrompt, withHouseDefaults } from "./house-defaults";

describe("house defaults", () => {
  it("loads the rules and puts them in the prompt and Jev state", () => {
    expect(houseDefaults()).toContain("No default");
    expect(houseDefaultsPrompt()).toContain(houseDefaults());
    expect(withHouseDefaults({ raw: "2x4x8" }).house_rules).toBe(houseDefaults());
  });
  it("never lets application code read the answer key", () => {
    for (const dir of ["lib", "app", "components"]) {
      let files: string[] = [];
      try {
        files = (readdirSync(dir, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"));
      } catch {
        continue;
      }
      for (const f of files) expect(readFileSync(`${dir}/${f}`, "utf8"), `${dir}/${f}`).not.toMatch(/labels(\.draft)?\.json|blind-labels/);
    }
  });
});
