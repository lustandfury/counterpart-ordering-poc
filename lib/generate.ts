/**
 * Builds a random contractor text-message order for the live composer. Free and instant (no API calls).
 * Every order mixes clean lines with at least one line from the house rules' "always review" list
 * (data/house-defaults.md), so there is always something for the rep to check.
 */

import type { Sender } from "./types";

type Rng = () => number;

const pick = <T,>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const shuffle = <T,>(rng: Rng, xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Clean lines: product, size, type and unit are all stated, and quantities stay under the large-order limits. */
const CLEAN: ((rng: Rng) => string)[] = [
  (r) => `${int(r, 6, 40)} - 2x4x${pick(r, [8, 10, 12])} SPF`,
  (r) => `${int(r, 4, 24)} - 2x6x${pick(r, [8, 10, 12, 16])} ${pick(r, ["SPF", "PT"])}`,
  (r) => `2x8x${pick(r, [12, 16])} PT x ${int(r, 4, 20)}`,
  (r) => `${int(r, 2, 12)} 4x4x${pick(r, [8, 10])} PT posts`,
  (r) => `${int(r, 5, 40)} sheets 7/16 OSB`,
  (r) => `${int(r, 3, 20)} sheets 3/4 cdx ply`,
  (r) => `${int(r, 10, 60)} sheets 1/2 regular drywall 4x8`,
  (r) => `${int(r, 4, 20)} sheets 5/8 type X 4x8`,
  (r) => `${int(r, 2, 6)} buckets joint compound`,
  (r) => `${int(r, 2, 6)} rolls paper drywall tape`,
  (r) => `${int(r, 1, 4)} boxes 5lb 3in tan deck screws`,
  (r) => `${int(r, 10, 40)} bags 30 kg concrete mix`,
  (r) => `${int(r, 4, 20)} pcs 15M rebar 3m`,
  (r) => `${int(r, 8, 30)} bundles architectural shingles onyx black`,
  (r) => `${int(r, 1, 4)} rolls synthetic underlayment`,
  (r) => `${int(r, 4, 12)} tubes construction adhesive`,
  (r) => `${int(r, 20, 60)} precut studs`,
];

export type CheckKind = "missing length" | "ambiguous product" | "not in catalog" | "unsold unit" | "large quantity" | "missing quantity";

/** Lines a counter person cannot fill without asking; each maps to a "no default: always review" house rule. */
const CHECK: { kind: CheckKind; line: (rng: Rng) => string }[] = [
  { kind: "missing length", line: (r) => `${int(r, 8, 30)} of the 2x4` },
  { kind: "missing length", line: (r) => `${int(r, 4, 12)} 2x10 for the header` },
  { kind: "missing length", line: (r) => `${int(r, 2, 6)} of the 4x4 posts` },
  { kind: "ambiguous product", line: (r) => `${int(r, 2, 8)} tubes of caulk` },
  { kind: "ambiguous product", line: (r) => `${int(r, 1, 4)} rolls felt` },
  { kind: "ambiguous product", line: () => "a bundle of shingles" },
  { kind: "ambiguous product", line: (r) => `${int(r, 2, 6)} bags cement` },
  { kind: "not in catalog", line: (r) => `${int(r, 1, 3)} sq cedar shakes` },
  { kind: "not in catalog", line: () => "1 tile saw rental" },
  { kind: "not in catalog", line: (r) => `${int(r, 2, 10)} sheets 3/4 marine plywood` },
  { kind: "not in catalog", line: (r) => `${int(r, 2, 5)} gallons exterior paint` },
  { kind: "unsold unit", line: (r) => `${int(r, 5, 20) * 10} feet of drywall tape` },
  { kind: "unsold unit", line: (r) => `${int(r, 2, 6) * 5} lbs of 16d nails` },
  { kind: "unsold unit", line: () => "half a pallet of block" },
  { kind: "large quantity", line: (r) => `${int(r, 20, 90) * 100} sheets 1/2 drywall` },
  { kind: "large quantity", line: (r) => `${int(r, 3, 9) * 100} bags 30 kg concrete` },
  { kind: "missing quantity", line: () => "some 3in deck screws" },
  { kind: "missing quantity", line: () => "OSB for the garage roof" },
];

const SENDERS: Sender[] = [
  { name: "Sam Whitford", company: "Northline Framing" },
  { name: "Ana Costa", company: "Costa Build Group" },
  { name: "Derek Olsen", company: "Olsen Carpentry" },
  { name: "Mei Lin", company: "Harbourview Renovations" },
  { name: "Ray Boucher", company: "Boucher Decks" },
  { name: "Tanya Price", company: "Price Drywall & Paint" },
  { name: "Jordan Blake", company: "Blake & Co. Contracting" },
  { name: "Omar Siddiqui", company: "Cedarline Homes" },
];

const OPENERS: ((s: Sender) => string)[] = [
  () => "",
  (s) => `Hey it's ${s.name.split(" ")[0]} from ${s.company}, need this for Thursday AM:`,
  () => "Morning! Order for the Birch St job:",
  () => "Can you deliver tomorrow before 8?",
  () => "Quick order pls",
  (s) => `Hi, ${s.name.split(" ")[0]} here. New job starting Monday. Need:`,
];
const CLOSERS = ["", "thx", "Thanks!", "Drop at the back gate, call when close", "Same address as last week"];

export type Generated = { text: string; checks: CheckKind[]; from: Sender };

/** A new order each call. Pass a seeded rng for repeatable output (tests). */
export function generateOrder(rng: Rng = Math.random): Generated {
  const clean = shuffle(rng, CLEAN).slice(0, int(rng, 3, 6)).map((f) => f(rng));
  const nChecks = rng() < 0.35 ? 2 : 1;
  const kinds = shuffle(rng, [...new Set(CHECK.map((c) => c.kind))]).slice(0, nChecks);
  const checks = kinds.map((k) => pick(rng, CHECK.filter((c) => c.kind === k)));
  const lines = shuffle(rng, [...clean, ...checks.map((c) => c.line(rng))]);
  const from = pick(rng, SENDERS);
  const text = [pick(rng, OPENERS)(from), ...lines, pick(rng, CLOSERS)].filter(Boolean).join("\n");
  return { text, checks: kinds, from };
}

/** Small seeded generator (mulberry32) for repeatable tests and scripts. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
