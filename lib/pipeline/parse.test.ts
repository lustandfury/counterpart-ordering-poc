import { describe, expect, it } from "vitest";
import { cleanDelivery } from "./parse";

describe("cleanDelivery", () => {
  it("keeps what was said and the tidy version", () => {
    expect(cleanDelivery({ method: "delivery", when: { said: "thurs before 7am", tidy: "Thu, Oct 8 · before 7:00 AM" }, where: { said: "site is 42 birch st", tidy: "42 Birch St", on_file: false }, notes: "Call when close." }))
      .toEqual({ method: "delivery", when: { said: "thurs before 7am", tidy: "Thu, Oct 8 · before 7:00 AM" }, where: { said: "site is 42 birch st", tidy: "42 Birch St", onFile: false }, notes: "Call when close." });
  });
  it("leaves the address of an earlier delivery to the app (on file)", () => {
    expect(cleanDelivery({ method: "delivery", when: null, where: { said: "same address as last week", tidy: "whatever", on_file: true }, notes: null })?.where)
      .toEqual({ said: "same address as last week", tidy: "", onFile: true });
  });
  it("drops empty parts, and the whole thing when nothing was said", () => {
    expect(cleanDelivery({ method: null, when: { said: " ", tidy: "" }, where: null, notes: "" })).toBeUndefined();
    expect(cleanDelivery(null)).toBeUndefined();
    expect(cleanDelivery({ method: "pickup", when: { said: "fri 2pm", tidy: "" }, where: null, notes: null })?.when).toEqual({ said: "fri 2pm", tidy: "fri 2pm" });
  });
});
