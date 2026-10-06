# Photo orders: what each list says

Handwritten material lists, photographed on a phone. p01 is a real photo found online (no names or contact
details on it; the sender is fictional). A second found photo, a metric timber list, was dropped as unrealistic for
this yard. p03 is still a script for a generated image: a crossed-out line, a
changed quantity, jargon, a line that is hard to read, and a superseded Fernhill item code.

A photo order is transcribed by Claude (`lib/pipeline/transcribe.ts`), and the transcription is the order text for
both pipelines. Crossed-out text is written as `~~text~~`. Run `npx tsx scripts/transcribe-photo.ts p01` to see the
raw transcription, or `npm run pipeline -- p01` to run the whole order and save it to `results/`.

**The labels come from the image, not this page.** Image models drift from the prompt: they misspell, drop
lines, or invent them. After picking an image, write `labels.json` entries from what the photo actually shows,
and note any line that came out differently below.

All names are fictional. No brand names on the paper, no logos, no faces, no phone numbers.

## Prompt template (for p03, which is still to be generated)

> A realistic smartphone photo, taken from slightly above at an angle, of a handwritten material list for a
> building-supply order. Natural indoor light with a soft shadow from the phone across one corner. The paper is
> slightly creased and not perfectly flat; part of a worn wooden workbench or a truck dashboard is visible at the
> edges. Real handwriting, not a font: uneven baseline, some letters joined, a contractor's quick block capitals
> mixed with lowercase. Every line of text below must appear exactly as written, in this order. Struck-through
> text is crossed out with a single hand-drawn line and still readable. No logos, no brand names, no printed
> letterhead, no people. Photorealistic, not an illustration.

Generate 3–4 options and pick the one whose text is closest to the script and looks least staged.
Save as `public/orders/p03.jpg`, about 1600 px on the long side, and point `data/orders/p03.json` at it.

## p01: deck estimate (real photo, found online)

**Image:** `public/orders/p01.jpg`, a 480x640 copy of a photo found online, with its metadata stripped. No names or
contact details appear on it. **Sender (fictional):** Wes Lindqvist, Lindqvist Decks.

A contractor's working page for a deck: a sketch (20' x 12' with a 3' x 14' bump-out), materials and labour totals
(several crossed out and redone), then the lumber list with a price beside each line:

```
3 - 2x12x20'                    ← a "3" crossed out and rewritten; no price
17 - 2"x8"x12'  $16.72 ea       ← the 17 is hard to read (the line total, $284.24, confirms it)
3 - 2"x12"x16'  $39.41 ea
2 - 2"x8"x20'   $34.59 ea
6 - 4"x4"x8'    $11.18 ea       ← an "8" written over the "6"; the line total ($67.08) confirms 6
6 - 2"x6"x10'   $10.68 each
71' of handrail  13 @ $54.48 ea
27 deck boards   $9.11 ea
3 - 6"x6"x12'   $54.06 ea
fasteners = $175.00             ← a lump sum, not a line
```

What it tests: material lines mixed in with prices, totals, tax and labour; crossed-out sums; an overwritten
quantity; 20' lengths the catalog doesn't stock; handrail, which the catalog doesn't carry; and "deck boards" with no
size, species or length. It never says SPF or pressure-treated, which matters for a deck.

What the first transcription got wrong or left open: the 17 came out as "1?" once and as "17" on the run saved in
`results/p01.json`; the circled totals are read slightly differently on each run. Check the saved transcription
against the photo before labelling.

## p03: Fernhill Building Supply (deck)

**Paper:** a sheet of graph paper with a small pencil sketch of a 12x16 deck in the top corner (joists drawn
as lines, "12'" and "16'" marked), list written in ballpoint pen below the sketch.
**Sender:** Nico Rossi, Rossi Outdoor Living.

```
DECK 12x16 - backyard
6 sono 8" + 12 bags concrete
6x6 PT 8' 10' x 4            ← "8'" crossed out, "10'" written beside it
2x8 PT 12' - 14              ← "14" written so it could be read as "16"
2x6-20 PT x 4
5/4x6 16 rad - 45
3" deck screws tan 25#
joist hangers 2x8 - 28
post base 6x6 x 4
stain - 1 pail
```

What each line tests: "sono" and "rad" jargon; a changed length; a 20 ft board only Fernhill stocks; deck boards
priced per lineal foot but sold by the piece; a 25 lb box, which is a pail at this yard; a 6x6 post base, when
both yards only stock the 4x4 one; and a hard-to-read quantity.
