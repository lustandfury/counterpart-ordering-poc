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

// Each sender has a jobsite on file (invented), so "same address as last week" resolves to a real-looking address.
const SENDERS: Sender[] = [
  { name: "Sam Whitford", company: "Northline Framing", address: "1180 Concession Rd 4, Unit B" },
  { name: "Ana Costa", company: "Costa Build Group", address: "27 Harbour View Cres" },
  { name: "Derek Olsen", company: "Olsen Carpentry", address: "415 Mill St" },
  { name: "Mei Lin", company: "Harbourview Renovations", address: "88 Lakeshore Rd W" },
  { name: "Ray Boucher", company: "Boucher Decks", address: "9 Quarry Lane" },
  { name: "Tanya Price", company: "Price Drywall & Paint", address: "2250 Dundas St, Suite 4" },
  { name: "Jordan Blake", company: "Blake & Co. Contracting", address: "61 Orchard Park Dr" },
  { name: "Omar Siddiqui", company: "Cedarline Homes", address: "Lot 14, Maple Ridge Dr" },
];

const OPENERS: ((s: Sender) => string)[] = [
  () => "",
  (s) => `Hey it's ${s.name.split(" ")[0]} from ${s.company}`,
  () => "Morning!",
  () => "Quick order pls",
  (s) => `Hi, ${s.name.split(" ")[0]} here. New job starting.`,
  () => "Need the following:",
];
const CLOSERS = ["", "thx", "Thanks!", "ty"];

/** When it's needed, in contractor shorthand. Pickups are marked so the generator knows not to add a site. */
const WHEN: { text: string; pickup?: boolean }[] = [
  { text: "deliver thurs before 7am" },
  { text: "need it on site by noon tmrw" },
  { text: "can u drop it monday first thing" },
  { text: "deliver tomorrow before 8" },
  { text: "by 10 sat morning pls" },
  { text: "friday after lunch works" },
  { text: "pickup fri 2pm", pickup: true },
  { text: "ill grab it tmrw around 7", pickup: true },
];
const SITES = ["42 birch st", "lot 14 maple ridge", "118 lakeshore rd unit 3", "7 quarry lane", "2250 dundas st w", "the cedar ave job, 31 cedar ave"];
const WHERE: ((site: string) => { text: string; onFile?: boolean })[] = [
  (site) => ({ text: `site is ${site}` }),
  (site) => ({ text: `deliver to ${site}` }),
  (site) => ({ text: `job site ${site}` }),
  () => ({ text: "same address as last week", onFile: true }),
  () => ({ text: "usual spot", onFile: true }),
];
const NOTES = ["drop at the back gate", "call when close", "forklift on site", "no truck access before 7", "leave it by the garage, call me"];

export type Details = { when?: string; where?: string; onFile?: boolean; notes?: string; pickup?: boolean };
export type Generated = { text: string; checks: CheckKind[]; from: Sender; details: Details };

// The live run's limits (app/api/run): the generator stays inside them with room to spare.
const MAX_CHARS = 580;
const MAX_LINES = 14;

/**
 * A new order each call. Pass a seeded rng for repeatable output (tests).
 * `checks` fixes how many lines need checking; left out, about a third of orders get two.
 * About a third of orders are long (7-10 clean lines), and most say when and where the order goes.
 */
export function generateOrder(rng: Rng = Math.random, { checks: wanted }: { checks?: 1 | 2 } = {}): Generated {
  const long = rng() < 0.35;
  let clean = shuffle(rng, CLEAN).slice(0, long ? int(rng, 7, 10) : int(rng, 3, 6)).map((f) => f(rng));
  const roll = rng();
  const nChecks = wanted ?? (roll < 0.35 ? 2 : 1);
  const kinds = shuffle(rng, [...new Set(CHECK.map((c) => c.kind))]).slice(0, nChecks);
  const checkLines = kinds.map((k) => pick(rng, CHECK.filter((c) => c.kind === k)).line(rng));
  const from = pick(rng, SENDERS);

  // delivery details: when (most orders), where (unless it's a pickup), and sometimes a note
  const details: Details = {};
  if (rng() < 0.8) {
    const w = pick(rng, WHEN);
    details.when = w.text;
    if (w.pickup) details.pickup = true;
  }
  if (!details.pickup && rng() < 0.75) {
    const w = pick(rng, WHERE)(pick(rng, SITES));
    details.where = w.text;
    if (w.onFile) details.onFile = true;
  }
  if (!details.pickup && rng() < 0.4) details.notes = pick(rng, NOTES);
  // the details sit together, before or after the list, sometimes on one line ("deliver thurs before 7am, site is 42 birch st")
  const detailParts = [details.when, details.where, details.notes].filter((x): x is string => !!x);
  const detailLines = detailParts.length > 1 && rng() < 0.5 ? [detailParts.join(", ")] : detailParts;
  const detailsFirst = rng() < 0.5;
  const opener = pick(rng, OPENERS)(from);
  const closer = pick(rng, CLOSERS);

  const compose = () => {
    const items = shuffle(rng, [...clean, ...checkLines]);
    return [opener, ...(detailsFirst ? detailLines : []), ...items, ...(detailsFirst ? [] : detailLines), closer].filter(Boolean).join("\n");
  };
  let text = compose();
  // keep inside the live-run limits by dropping clean lines (never the ones to check, never the details)
  while ((text.length > MAX_CHARS || text.split("\n").length > MAX_LINES) && clean.length > 3) {
    clean = clean.slice(0, -1);
    text = compose();
  }
  return { text, checks: kinds, from, details };
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
