# Counterpart: a case study

An outside-in sketch of AI-assisted lumber ordering, built with Claude Code. All data is synthetic; the project is not affiliated with any company.

This is a running narrative. It is meant to be read top to bottom, or used as a talk track (see "Walking someone through it" at the end). New entries are added as features land and as we learn things. `docs/how-this-was-built.md` is the terse technical log; this file is the story.

## The idea in one paragraph

Contractors send orders as messy text messages. The obvious AI problem is reading them. The harder, more valuable problem is deciding **what the sales rep does not need to check**. We built a working prototype that reads a message, matches each line to a product catalog, and flags only the lines a rep should look at. Claude does the one step that needs reading. Jev (TypeSafe's model, which answers typed questions with calibrated confidence) makes the per-line decision. One adjustable threshold controls how much the rep reviews, and we measured the result against a Claude-only version on 20 labeled orders.

## How the pieces fit

```
order text -> Claude parses lines -> Fuse.js shortlists 20 products per line
           -> Jev: which product? (confidence)  -> Jev: is the quantity sane for that product?
           -> route: approve if confident, else flag for the rep
Comparison: Claude alone matches every line against the whole catalog and rates itself high / medium / low.
```

## Timeline

Each entry: what we did, what happened, what it changed.

### 1. Guardrails before code
**Did:** public repo from day one; three read-only review agents (security, evaluation, UX); hooks that run lint and tests whenever Claude finishes a turn and scan every commit for secrets.
**Happened:** two surprises in the first live calls: the configured model ID returned a 404, and the model rejected a forced tool call.
**Changed:** the structured-output step asks for the tool call in the prompt instead of forcing it. Lesson: verify the boring plumbing with a real call before building on it.

### 2. Data, and the answer key nobody should trust yet
**Did:** generated a 203-product synthetic catalog with deliberate look-alikes (lengths, SPF vs pressure-treated, drywall types, the same screw in three box sizes) and 20 text-message orders (88 lines) in five difficulty types, including two "impossible" orders. Drafted an answer key.
**Happened:** we had a second Claude, with no access to the key, label every line independently (the "blind labeler"). It agreed on 78 of 88 lines. Where we disagreed, my key had quietly guessed at the product ("15 of the 2x4" was labeled as 8-foot SPF, but the message never says the length).
**Changed:** lines that cannot be resolved from the text now have no product in the key and are always for review. A key encodes assumptions; the blind labeler is how we found them.

### 3. Making the assumptions explicit: house defaults
**Did:** wrote the rules a counter person assumes (framing lumber is SPF #2 kiln-dried, "stud" means the precut stud, a bare number means pieces, "Type X" means fire-rated) and a "no default, always review" list. Ran a collision check of every phrase against the catalog.
**Happened:** the check found catalog gaps and traps: no precut stud existed, "Type X" also matched a moisture-resistant board, concrete had no metric bags. Mike's calls: Canadian units (30 kg bags, metric rebar and liquids), add the missing products, and always review large quantities (100+ pieces or 50+ of anything else).
**Changed:** the same rules go into both pipelines' prompts so the comparison stays fair, and they are business rules, never answers. A test fails if application code ever reads the answer key.

### 4. First pipeline, and the first honest result
**Did:** built parse, shortlist, Jev decision, routing and the Claude-only comparison; ran all 20 orders for about $1.40.
**Happened:** Claude alone matched 88 of 88 lines and auto-approved 65. Jev matched 84 and auto-approved only 38. Neither approved a wrong line. Jev did not win.
**Changed:** nothing yet, and that mattered. We kept the result and asked why.

### 5. The evaluation found our bugs, and an auditor found our shortcuts
**Did:** wrote the evaluation (accuracy, auto-approve rate, error rate among approved lines, calibration bands, threshold sweeps), then had a separate agent recompute every number from raw files.
**Happened:** the first run exposed two bugs of ours, not Jev's. Words like "not treated" made the fuzzy search return only pressure-treated lumber, so the right product never reached Jev; and Jev only saw product names, not nicknames like "mud". The auditor found no arithmetic errors, but caught that we had re-run only Jev's step, so its timing came from a different run than Claude's.
**Changed:** a size-token second search, nicknames in the option text, and a clean full re-run. Jev's product accuracy went from 95.5% to 98.9%. Lesson: an independent recomputation is worth more than a second look at your own code.

### 6. The review screen, designed against one goal
**Did:** built the screen around "the rep only looks at what's uncertain": approved lines collapse to one quiet row, flagged lines expand, the original message is highlighted in place, and two sliders re-route lines in the browser with no API calls (the raw scores are saved).
**Happened:** a UX-review agent took screenshots on desktop and phone, in light and dark, and drove the keyboard. It found that a line flagged only for an unclear quantity showed a three-option product list, which asked the rep the wrong question; that Enter and x silently overwrote decided lines; and that borders and bar tracks failed contrast.
**Changed:** a one-click "Confirm 3 pails" card for quantity-only flags, a cursor that advances after each decision, undo that returns to the line, quieter approved rows, an "all checked" end state, and stronger control borders.

### 7. "Why does Jev fail on quantity?"
**Did:** looked at which lines the quantity check flagged. It scored 0.95+ when the message used the catalog's own unit ("20 sheets OSB") and low when the unit was missing ("hurricane ties 50") or worded differently ("buckets" vs a "17 L pail").
**Happened:** the cause was our question design: we asked "does the quantity make sense for the product?" in the same call as choosing the product, so Jev did not yet know the product or how it is sold. We tested the fix on the 67 lines the key says need no review: naming the product lifted the lines clearing the cutoff from 43 to 58, and telling it a bare number means the selling unit lifted it to 66. We then checked the gate still catches genuine errors ("100 feet of tape" 0.18, "half a pallet of block" 0.14).
**Changed:** two Jev calls per line, product first, then the quantity check with the product named. Jev's auto-approve share went from about 49% to about 73%, level with Claude-only, still with zero wrong approvals.

### 8. Auditing our own fix
**Did:** re-audited the numbers and prompts after the change.
**Happened:** numbers reproduced and the key never reached a prompt, but the auditor made us disclose that the fix was designed on the same 20 orders (so it is in-sample), that lines with no catalog match skip the second call and flatter Jev's cost, and that our house-rules file contained notes about the test set that should not be in a production prompt. Two clean runs gave 72.7% and 73.9% approved, so single-digit differences are noise.
**Changed:** the caveats are in the evaluation summary, the meta notes are out of the prompt, and the interaction test no longer depends on any one run's scores.

### 9. From a form to a workspace
**Did:** rebuilt the screen as a three-pane workspace, modeled on code editors like Cursor (Mike's direction). The orders list and a chat-style composer for pasted orders live in a left sidebar, hidden by default (⌘B). The center reads like a conversation: the contractor's message as a bubble, the draft order as the reply. A right panel gives a cost assessment for both pipelines side by side.
**Happened:** putting the costs next to the work made the trade-off visible per order: on the default order, Jev's matching step cost about 60x less and ran about 5x faster, while both approved the same 3 of 4 lines. Across the 20 saved orders it is about $15 vs $68 per 1,000 orders. The screenshots also exposed misleading reasons on unmatched lines ("quantity unclear 0.00", "large quantity") for checks that are never run without a product.
**Changed:** those reasons are gone (approvals unchanged, evaluation output byte-identical), each sidebar order shows how many lines need a check, and the interaction test now drives the sidebar.

### 10. Designing for legibility
**Did:** restyled the workspace toward a lighter, calmer look, using a public product website's light sections as a reference (Mike's direction): a warm paper background with white surfaces, DM Sans at 15px with 1.6 line height, soft cards (a faint outline and shadow instead of hard borders), larger row heights and more space between sections. We took the qualities, not the branding: no logo, no brand colors, and green and amber stay as the only signals.
**Happened:** the extra space made the page taller, and the auto-scroll to the flagged line then hid the order summary behind the pinned toolbar on first load. Text contrast stayed above AA (muted text 6.2:1, control outlines 3.7:1).
**Changed:** the view follows the cursor only after the rep moves it, and cost figures no longer wrap mid-number.

### 11. Going live, and what the security review caught
**Did:** connected the project to Vercel (pushes to main now deploy), added the keys as sensitive environment variables, and deployed a login-protected preview first. A security-review agent checked the whole repo, its history and the live route before anything went public.
**Happened:** no secrets anywhere in the history. But the review caught a real company name in one of our own agent instructions, a few lines hinting at private context, and a cost gap: we capped the pasted text at 600 characters and 15 lines, yet a single line can parse into dozens of items, each of which makes paid matching calls. It also pointed out that in-memory rate limits reset per server instance, so they are a brake, not a wall.
**Changed:** the parsed items are capped at 15 before any paid call, the route only accepts JSON, live runs are limited to 5 per visitor per hour and 40 a day per instance, and the spend limit on the Anthropic key and the prepaid Jev credits are the hard stops. The flagged wording is gone from the repo.

### 12. Fewer bars, the list always at hand
**Did:** removed the top bar and opened the orders sidebar by default on wide screens (Mike's call), with the same sidebar icon to hide and show it, in the sidebar's header and in the toolbar when it is closed. The "synthetic data, not affiliated" notice moved to the sidebar and the cost panel's footnote. Phones still get the sidebar as an overlay, closed by default.
**Happened:** the browser test caught a keyboard regression the change introduced: with the sidebar staying open, clicking an order left focus on that order's button, so the next Enter re-opened the order instead of confirming a line.
**Changed:** picking an order now hands keyboard focus to the review, so Enter, j and k act on lines straight away.

### 13. Settings behind a button
**Did:** moved the two threshold sliders out of the toolbar into a Settings panel (Mike's call), with a reset to defaults and a small marker on the button when the thresholds differ from the defaults. The toolbar is now one row: the pipeline toggle and Settings. The paste box got a darker fill so it reads as an input against the white sidebar (text contrast 5.6:1 and above).
**Happened:** the sliders are the demo's most interesting control, but they are a tuning tool, not something a rep touches on every order. Hiding them made the default view calmer without losing the "move the threshold and watch lines re-route" moment.
**Changed:** the walkthrough opens Settings to show the trade-off; the browser test now opens it before driving the sliders.

### 14. One control, one place
**Did:** removed the Claude + Jev / Claude only switch and the whole toolbar above the order (Mike's call). The cost cards on the right already switched the view, so the switch was a second control for the same thing. Settings moved into the cost panel's header and opens inline there.
**Happened:** the center is now only the order: the message and the draft. Everything about the comparison (which pipeline, what it cost, how strict it is) lives in one panel. Settings opens inline rather than as a floating menu, because the scrolling panel would clip a popover.
**Changed:** the panel's subtitle says "Pick a card to see its draft", and the browser test now switches pipelines by clicking the cost card.

### 15. A quieter cost panel
**Did:** reworked the right panel to be lighter and easier to scan (Mike's direction): costs scaled to 10,000 orders, prices and times set in a mono font so the numbers stand apart from their labels, a one-line headline ("60× cheaper · 4.8× faster"), and three rows per pipeline (reading, matching, auto-approved). The token counts, the call counts, the panel's explanatory subtitle and the "not affiliated" line in the sidebar were removed; a short "Synthetic data" note stays in the panel's footnote.
**Happened:** at 10,000 orders the comparison reads as a budget line rather than fractions of a cent: about $147 with Jev versus $683 with Claude alone across the 20 samples.
**Changed:** the panel is narrower (20rem), and the README's cost row uses the same scale.

### 16. Telling the rep what to do
**Did:** replaced the keyboard-shortcut line (j/k, 1–3, Enter, x) with plain instructions that appear only when something needs review: how many lines need a look, then three steps (read why it was flagged, pick the product or confirm the quantity, or mark it "Not in catalog"), and a reminder that green lines need nothing. Mike asked what the shortcut line meant, which was the signal it did not explain itself.
**Happened:** the instructions pointed at the flag reasons, which were still in engineering terms ("product confidence 0.82 below 0.85"). Rewriting them in plain language ("We're not sure which product this is (82% on the best guess)") exposed a contradiction: on a line with no catalog match, that percentage was the confidence in "no match", not in a product.
**Changed:** reasons are plain sentences kept as shared constants (so tests and the screen stay in sync), and a no-match line shows only "Needs review. Select an option below." The shortcuts still work; the card footer mentions Enter and "Not in catalog".

### 17. "Not in catalog" is always a choice
**Did:** every flagged line now lists "Not in catalog" as one of its numbered choices (Mike's call). Before, it only appeared as a choice when it was among the likely answers; otherwise it was a small text link. Quantity-only lines get it as a button beside "Confirm". The choice list is one shared function, so the numbers on screen and the 1–4 keys always match.
**Happened:** that shared function also fixed a quiet mismatch: the screen hid options under 5%, but the number keys indexed the unfiltered list, so pressing 2 could pick something not shown.
**Changed:** the escape hatch is as visible as the products, which matters most on the lines that most need it.

### 18. A generator that always leaves something to check
**Did:** added a Generate button to the paste box (Mike's idea). It writes a realistic text-message order in the browser, free and instantly, from templates tied to the catalog: 3 to 6 clean lines plus one or two lines drawn from the house rules' "always review" list (a missing length, an ambiguous product, something we don't carry, a unit we don't sell in, an absurd quantity, or no quantity). Only Run makes paid calls.
**Happened:** unit tests over 300 seeded orders confirm every order has a planted problem and fits the live limits. Running four through the real pipeline: every planted problem was flagged, and so was one "clean" template, "27 2x6 joist hangers", fairly, since hangers are sold singly and in boxes of 25.
**Changed:** that template was dropped rather than arguing with the pipeline; generated orders give a live demo with a guaranteed review moment.

### 19. Quieter focus, guidance where it's needed
**Did:** reviewed every focus and selection style after Mike flagged them as overdone. There were four stacked treatments: a 2px ring on the paste box's container plus an outline on the text box inside it, a 2px blue ring on the current flagged card on top of its amber edge, a ring around the current line in the message, and a 2px outline on the selected cost card. Now there is one rule: a thin outline for keyboard users only. The paste box darkens its border on focus, the current flagged line gets a stronger amber background, the message has no ring, and the selected cost card has a 1px outline. The instructions box above the order was also replaced (Mike's call) by one short hint beside each line to check, which changes with the situation: "Pick the product the customer meant", "Pick the product if we carry it, or Not in catalog", or "Confirm if the quantity is right, or check with the customer".
**Happened:** the "current line" marker had been styled like keyboard focus, so it showed for mouse users too, where it read as a stuck highlight. The dev-mode badge from the framework was also covering the Generate button, so it is switched off.
**Changed:** focus means keyboard focus; selection and "you are here" use quieter backgrounds.

### 20. Orders from people
**Did:** gave every sample order a fictional sender, a contractor's name and company (Mike's call), shown above the message with their initials and as the title of each order in the sidebar. Where an order already names someone, the sender matches ("Dave from Ridgeline Homes"). Generated orders pick a sender too, and their greeting uses the same name, so the text and the header agree.
**Happened:** the senders live in `data/contractors.json` as display metadata, not in the order text, so the saved pipeline results, the answer key and the evaluation did not have to be re-run. The sender is never sent to either pipeline.
**Changed:** the sidebar reads like an inbox (company, then order id and preview) instead of a list of order numbers.

### 21. One card per order
**Did:** merged the contractor's message and the draft order into a single card (Mike's call). The sender sits at the top with anything in the message that isn't an order line (greetings, delivery notes), and each row pairs the contractor's own words, in mono, with the product they were matched to. Lines to check expand in place as before.
**Happened:** cutting the order lines out of a chatty message left broken sentences ("We need and , all regular spf not treated. also . thx"). When order lines sit inside sentences, the card now shows the whole message instead; list-style messages keep just the extra notes.
**Changed:** the rep reads each line once, request and match side by side, instead of matching highlights between two panels.

### 22. A dashboard for the evaluation
**Did:** moved the 20-sample results out of the cost panel onto their own page, Sample results (Mike's call), reached from Review | Sample results tabs in the sidebar. It shows five headline comparisons, a by-order table (company, lines, what the answer key says needs checking, approvals and right products for each pipeline, cost) with an Open link back into the review screen, the calibration tables, the lines either pipeline got wrong, and the caveats.
**Happened:** the dashboard needs scores against the answer key, but the app is not allowed to read the key. The evaluation script now also writes `results/eval.json`, and the page reads that. Making the review screen open a chosen order (`/?order=o07`) turned it from a prebuilt page into one rendered per request, so its sample files had to be bundled explicitly for the server.
**Changed:** the review screen stays about one order; the numbers for the whole set live in one place.

### 23. The price we assumed was wrong
**Did:** Mike asked how to get a more accurate Claude cost, and whether the API could report it. The Messages API returns token counts on every response (input, output, cache writes, cache reads), not dollars; billed dollars exist only in the Admin API's cost report, organization-wide and by day. So the accurate per-order cost is the recorded token counts at the published price, and checking that price turned up a mistake: `lib/pricing.ts` had assumed $3 / $15 per million tokens, last generation's Sonnet price, but the model in use costs $2 / $10.
**Happened:** every saved result keeps its token counts, so a small script repriced all 20 orders with no new calls. Claude's cost fell by a third: Claude-only matching from $0.055 to $0.036 per order, the whole pipeline from about $683 to $455 per 10,000 orders (Jev: $147 to $102). Jev's matching step is about 35× cheaper, not the roughly 50× we had been quoting.
**Changed:** the pricing file names its source and date, costs now include cache-write and cache-read tokens when present, `npm run reprice` recomputes saved results after any price change, and "assumed" is gone from every caveat. The header also got a wordmark, a chart icon for Sample results and a slider icon for Settings.

### 24. Light by default
**Did:** made the light theme the default for everyone (Mike's call). The app had followed the viewer's system setting, so anyone in dark mode saw the dark version. The dark palette is kept as an opt-in (`data-theme="dark"` on the page) for a future theme switch.
**Happened:** nothing else changed; the browser test and screenshots in dark-preference browsers now show the light theme.
**Changed:** everyone sees the same, designed-for version of the screen.

### 25. Brand color, and keeping signals distinct
**Did:** made yellow (#ffca05) the brand color (Mike's call) for the logo, the Run button, the "showing" badge, the active-order marker and the sliders; brightened the approval green to #15803d on a lighter mint, with the cost savings highlighted in it; and gave both pages one shared brand row so the logo, name and results button sit in exactly the same place when switching between them (the browser test now measures this).
**Happened:** the "needs checking" color was amber, which would have read as brand yellow. It moved to orange, so yellow means brand, orange means attention and green means approved or saved. Contrast checks set the rules: yellow works as a fill behind dark text (11:1) but is too faint as a thin line on white (1.5:1), so the selected cost card keeps a dark outline; the new green passes on white, the paper background and its own tint.
**Changed:** each color has one meaning.

### 26. Theme is the viewer's choice
**Did:** added Light / Dark / System to Settings (Mike's call). Light stays the default; the choice is saved in the viewer's browser and applied by a one-line script before the page paints, so there is no flash of the wrong theme. System follows the computer's setting. The dark palette was refreshed with the new green.
**Happened:** the browser test now switches to Dark, reloads, and checks the choice held; a separate check confirmed System renders dark on a dark-mode machine while a first-time visitor on the same machine still gets light.
**Changed:** the designed-for light version is what everyone sees first; dark is one click away.

### 27. Phone-shaped orders, and colors that carry the verdict
**Did:** on phones the orders panel now rises from the bottom as a sheet (with a grab bar, dimmed backdrop and safe-area padding) instead of sliding in from the left; wide screens keep the sidebar. In the cost panel the Claude + Jev bar is solid green, and the Claude-only bar is light red up to the Claude + Jev cost and full red for the overage beyond it. Confidence bars in a flagged line's options use three fixed steps: green from 85% (the default threshold), orange from 50%, red below. The keyboard-shortcut hint under the options was hidden; the shortcuts still work. All of these were Mike's calls.
**Happened:** a first version blended the confidence colors continuously, and mid-range scores came out a muddy olive; fixed steps read at a glance. A new red token (with a soft variant) keeps red meaning "cost overage or low confidence", distinct from orange "check this".
**Changed:** on the cost panel the difference between the two pipelines is visible as color, not just numbers. The confidence bars were then removed altogether (Mike's call): they added little and pulled the eye from the product names, so each option now shows just a slightly larger percentage in its own cell, under a single "Confidence" column header.

### 28. Finishing the job: a mock send
**Did:** once every flagged line is decided (or none needed checking), the "ready to send" banner offers a Send order button (Mike's call, to mirror the real flow). Sending marks the order as sent to the contractor, with the time, says plainly that nothing was actually sent, locks the lines, and shows "Sent" beside the order in the list; Reopen undoes it. The rep's decisions now live per order, so switching orders and coming back no longer loses them.
**Happened:** a browser run checked that Send only appears after the last decision, that the sent state and the decision survive switching orders, and that Reopen brings Send back.
**Changed:** a walkthrough now ends with a finished order rather than a green banner.

### 29. One picture for the link and the front door
**Did:** made a social preview image (Mike's call): the lumber-and-blueprint photo with the logo and wordmark on the left and the tagline "Process orders at the speed of AI" beneath, in the app's own typeface. The same photo (without the baked-in wordmark) now sits behind the access-code lock screen, so the first thing a visitor sees matches the link they clicked. A small script regenerates the preview image, so copy or type changes are a re-run, not a redesign. The browser-tab icon, which was still the framework's default, is now the logo too, generated from the same mark (SVG for modern browsers, an ICO for old ones, plus home-screen and manifest sizes).
**Happened:** a first plain logo-on-paper version was dropped for the photo, which says "lumber" before any words do. Getting the type right took several rounds of small calls (size, tracking, tagline fitted to the wordmark's width by measuring it in the page, the text group centred on the logo by its visible ink, the photo nudged down so the wood clears the tagline). On wide screens the form sat straight on the wood and was hard to read, so it became a card, as the phone layout's sheet already was. The photo went from 2.3 MB to a 181 KB copy for the lock screen, since it is the first thing loaded; dark mode dims it.
**Changed:** the link preview, the lock screen and the app share one look, and the preview is reproducible from a script.

### 30. The analytics were going to the wrong place
**Did:** set up a dedicated PostHog project for Counterpart, then checked that the live site actually sends to it. The check compares the token compiled into the deployed site (public by design) with the project's own token, comparing only the last few characters.
**Happened:** the site was sending, but to a different PostHog project, because the token had been copied from the wrong one. The new project showed "no events yet", which is what gave it away. A first version of the check was itself wrong: a shell quirk meant it fetched nothing and reported "no analytics at all", and only a sanity check (looking for a known piece of app text in the same files) exposed that. Local development had the same wrong token.
**Changed:** production now uses the Counterpart project's token (Production and Preview only, so pulling environment variables locally cannot send development events to it), and local development leaves the token blank, as the README advises. Lesson: verify a negative result with a known positive before believing it.

### 31. Closing the gaps the review found (security)
**Did:** ran the three reviews the plan calls for (security, evaluation correctness, screen usability) now that the app has live runs, sign-up and a lock screen that did not exist at the first review. The security pass found that the free-run allowance can be reset by clearing a cookie, and that the hourly and daily limits lived in each server instance's memory, so a determined visitor could spend far more than intended (a run costs about $0.07). The per-IP-per-hour and per-day limits now live in the database, taken with one atomic statement, and apply to everyone, signed up or not, so worst-case spend is capped at roughly $3 a day. The visitor cookie must now be a well-formed ID, sign-ups are rate-limited and length-capped, the sign-up form says what the email is used for, and the site sends security headers (a Content Security Policy in report-only mode first, so it cannot break the site or the analytics).
**Happened:** the reviewer's first suggested fix, signing the cookie, would not have helped: a visitor who clears the cookie simply gets a new one, so the shared limits are the real control. The reviewer also worried the client IP could be spoofed; Vercel's documentation says it overwrites that header, so it cannot. The new database statement was checked against the real database, including six simultaneous requests against a limit of three, which granted exactly three. The access code on the lock screen is checked in the browser and protects nothing; it is a welcome screen, not access control, and is described that way.
**Changed:** the cookie is treated as an identity, not a security control; the limits that matter live where clearing a cookie cannot reset them. Signed-up visitors are still unlimited per person (a product choice), bounded by the daily limit.

### 32. Closing the gaps the review found (screen)
**Did:** worked through the usability review's findings. Where a line needed checking, the sentence said "73% on the best guess" while the first option said 75%: Jev reports two slightly different numbers for the same pick, so the pick now shows the number the routing rule actually uses, and the reason names the live threshold ("below your 85% threshold") and follows the slider. The first option is now marked as the suggestion (bold, with a small "Suggested · Enter" cue on the active line) instead of bringing back the full shortcut legend, which Mike had chosen to hide. Also: a thicker keyboard outline, a wider edge on the active line so j/k has a visible cursor, full-strength option text in dark mode, 44 px touch targets on phones, the sidebar count dropping once the rep resolves a line, and a tooltip saying why Send is off.
**Happened:** two of the review's ten findings were not real: the guided tour already remembers that it was finished (the reviewer used fresh browser profiles each time) and already closes on Esc. And the browser smoke test turned out to have been failing on two stale checks (a button label changed on the lock screen, and the tour's last button reads "Done" on phones by design), so it had not been protecting anything for a while; it passes at desktop and phone width again, including the check that the brand row does not move between pages.
**Changed:** one number per decision, and the screen says why a line was flagged in the rep's own terms. Left for later: moving keyboard focus to Send after the last decision, and labelling the cost bars.

### 33. Re-running everything after one reworded line
**Did:** the review noted that one heading in the shared house rules reused the answer key's field name (`shouldReview`), which was vocabulary only but too close to the key. Mike chose to reword it and run all 20 orders again rather than leave the saved results tied to old prompt text (about $0.93 for both pipelines and the whole set), then regenerate the evaluation and have the eval-checker recompute every number.
**Happened:** the numbers moved even though the change was one heading. Claude-only went from 100% to 98.9% right (it changed its answer on "half a pallet of block", from right to "not in catalog", still flagged for the rep) and Jev went from 97.7% to 98.9% (it stopped guessing a shingle product for "a bundle of shingles"). Both now miss exactly one line, different lines, and both misses are flagged rather than approved. Auto-approval rose to 75.0% for both (66 of 88 lines), still with no wrong approvals, and every line either pipeline was confident about was still right. Cost is unchanged (Jev's matching still about 36x cheaper); the wall-clock speed-up is about 4.7x, and about 1.3x if every call is summed. The recompute matched exactly, and the eval script's hard-coded note about run-to-run variation was out of date and now lists all three runs.
**Changed:** the story got more honest, not worse. On an earlier run Claude looked perfect and Jev slightly behind; on this run they are level. That is the finding the docs already claimed ("does not show Jev is more accurate"), now with evidence that a single run of 88 lines can swing a line either way. The published table now reads "level on accuracy", and the open question worth a few dollars is to run each pipeline several times and report the spread.

### 34. An accessibility auditor, and what it found
**Did:** added a read-only `accessibility-auditor` subagent that scans every route against WCAG 2.2 AA: axe-core in Playwright (light and dark, 1280, 375 and 320 px, every dialog and loading/error state) plus manual keyboard, focus and contrast probes. Ran it, then fixed what it found.
**Happened:** axe alone flagged only one thing: light text on the yellow buttons in dark mode (1.29:1). The manual probes found the larger problems: dialogs with no Escape, focus trap or focus return; single-key shortcuts that fired from anywhere (pressing `x` on the Settings button resolved a line); focus dropping to the page after every decision; order status hidden from screen readers by an `aria-label`; the lock screen leaving the whole app reachable behind it. After the fixes axe reports no violations in any state, Esc closes the dialogs, and focus moves to the next line to check.
**Changed:** a shared `useDialog` hook (focus in, page inert, Esc, focus back), an `--on-brand` token for text on yellow, shortcuts scoped to the review and switchable in Settings, and focus moved after each decision. The lesson: automated scanners catch about a third of accessibility problems, so the agent is told to test by hand too.

### 35. A usability test: "I thought I was the customer"
**Did:** Mike watched a friend use the app cold. Then we redesigned the screen so it says who you are without relying on the tour.
**Happened:** the tester closed the tour, saw a filled-in order and assumed he was partway through ordering as a customer. He looked for a "new order" button. Only later did he work out that the screen was for a rep triaging an incoming text. Three smaller points: "Not in catalog" was unclear, there were no prices, and the text box made more sense on a phone than on a desktop. Walking his path in screenshots showed why. Only the tour said you were the rep, and the screen around it said the opposite:
- "Order o13" with a yellow "Send order" button, which looks like a checkout.
- Tour step 1 was "Make an order".
- A paste box sat in the sidebar.
- The contractor's actual text never appeared. The app showed only leftover chatter, and for the default order there was none.

"Not in catalog" was the top option at 82%, so it read as a fact, not a choice.
**Changed:** Mike decided to drop the text box and treat the app as an order queue.
- The sidebar is "Incoming orders". The default order arrives as the page opens. "Generate order" simulates another contractor text and runs it live.
- Each order opens with the contractor's message as a text bubble, under their name.
- "Send order" became "Send to Owen for approval". The status says it goes to the ERP once the contractor approves.
- Every line shows its unit price and line total, and the order ends with a CAD subtotal. A line whose quantity isn't in the selling unit (100 feet of tape, sold by the roll) shows "—" instead of a made-up total.
- The no-match option reads "No match: leave off order". The right-hand panel is now "AI cost", so $0.0095 isn't mistaken for the order total.
- The required "outside-in sketch · synthetic data" banner, which had gone missing, is back.

The lesson: if the screen doesn't say who you are, the tour can't fix that.

### 36. A quantity editor, and the critic's top four
**Did:** ran the ux-critic on the redesign. Then, on Mike's call, we added a quantity editor and fixed the critic's top four findings in order.
**Happened:** the critic found one serious bug that was already in the code. Pressing Enter on the "Skip to the first line to check" link accepted the top pick. On the default order that pick is "no match", so the tape line was left off without the rep seeing it, and a second Enter sent the order. It also found:
- Picking "Paper tape 250 ft roll" for "100 feet of tape" moved the line to Validated as "100 feet" with no price, ready to send.
- The flagged line only said "Needs review", while "leave off" sat at the top of the list at 82%.
- On desktop the AI cost panel, with its yellow "4.7× lower cost" banner, was louder than the one line to check.
- Send came before that line.

While checking prices across all 20 samples, a unit helper read "bundles" as "bundl", which would have shown 24 bundles of shingles with no price.
**Changed:**
- **Enter** accepts only from the review or a line, and never a "leave off" suggestion.
- **Picking a product works the same way by click, number key or Enter.** If the product is sold in a different unit than the contractor wrote, a quantity editor opens. It is prefilled only when the product's size gives the conversion ("100 ft ÷ 250 ft per roll = 1 roll"); otherwise the rep types the quantity. The line is decided only when the rep confirms.
- **Flagged lines say why in plain words:** "Best guess: nothing in the catalog fits (82%). Closest product: … (14%)". **Leave off order** is a separate action, not a numbered option.
- **The AI cost panel starts closed on desktop.** A quiet summary at the top right shows the cost and which draft is showing, and the walkthrough now ends on Send instead of the cost comparison.
- **The subtotal and Send sit at the foot of the order.** Line prices are muted. The subtotal reads "so far" while lines are pending. On phones, a bar at the bottom says how many lines are left.
- **Testing:** the unit helper moved into `lib/view.ts` with tests, and the smoke tests now cover the editor, the skip link and the new last step. The 320px walkthrough check, which had been failing, passes again.

The lesson: a keyboard shortcut can decide something the person never saw, so put it under the same rules as a click.

### 37. One card, one order, tools out of the way
**Did:** Mike asked for a simpler screen. He wanted three changes:
- Put the cost saving in the order card, leading with "4.7× lower cost per order".
- Move the technical buttons to the sidebar.
- Start the queue with a single order that arrives as the page opens.

**Happened:** next to a contractor's name, "4.7× lower cost per order" could read as a discount on the contractor's order, the same confusion the usability test found. So the line has a small "AI cost · Claude + Jev" label above it and "vs Claude only · 50% less time · Compare" below it. The first version included both dollar amounts and wrapped to five lines on a 320 px phone; those amounts moved to a tooltip and to the comparison panel. The cost panel's own savings callout duplicated the header, so it was removed. Both places now use one shared calculation.
**Changed:**
- The top-right toolbar is gone. Sample results, Settings and About are quiet rows at the foot of the sidebar.
- "Compare" in the order card opens the cost rail on desktop or the sheet on phones.
- The queue holds one order until Generate order adds more. Other samples are reached through Sample results.
- The smoke tests now find tools in the sidebar and cost details through "Compare". They wait for a closing sheet to finish before reopening it, which was a timing flake the change exposed.

### 38. A floating orders button that says when something arrives
**Did:** Mike asked for three things on phones:
- Turn the orders button into a floating action button with a count of new orders.
- Remove the "1 line to check before sending" bar, which competed with the new button.
- Give sample orders the same numbering as generated ones.

**Happened:** both sessions edited the same files at the same time, so this change waited for the other session to finish before anything was rechecked or committed. The new count needed a rule for "new". The rule: an order is new if it arrived while the queue was out of sight. The order that arrives on load counts, and so does each generated order. Opening the queue clears the count. Sample ids (o01–o20) had looked nothing like generated orders (1001, 1002, …).
**Changed:**
- **Floating button:** a round orders button sits at the bottom right on phones. Its count pops in when an order arrives, and it moves up only while the floating Send is showing. Desktop's "Show orders" button gets the same count when the sidebar is hidden.
- **Floating Send:** it appears only once every line is checked.
- **Order numbers:** samples show as 1001–1020, and generated orders continue from 1021. The stored ids, URLs and eval files keep o01–o20, and one tested helper maps between them.

### 39. The rep opens the order
**Did:** Mike made a series of small changes:
- Wait for the order to land in the queue before showing anything in the centre, with an empty state in the meantime.
- Then stop opening orders automatically: the rep picks one.
- Make "Leave off order" an option button like the products.
- Give Generate order a tooltip that explains the simulated order and the two pipelines, placed beside the button so it doesn't cover the queue, with a yellow hover.

**Happened:**
- **Empty state and opening orders:** the centre shows "Waiting for orders" with a typing indicator, then "A new order is in your queue" with the same count as the orders button. Opening the order is the rep's first action, so walkthrough step 1 now points at the queue (on phones it opens the queue sheet), and opening the order moves the tour on.
- **Two layout bugs from this round:**
  - The order's fade-in kept a transform after it finished, which made the floating Send position itself relative to the order instead of the screen. The e2e check that Send is on screen caught it.
  - The tooltip was clipped by the sidebar. It now renders outside the sidebar, at the button's position.

**Changed:**
- Nothing opens on its own, generated orders included. A link to a specific order, or "Open" in Sample results, still opens that order.
- Leave off order sits with the products and shows its own confidence (82%), with x as its key.
- The smoke tests now open the order from the queue and follow the new step 1.
- Before-and-after screenshots of each stage are in `public/case-study/evolution/` (kept local), with a comparison strip for desktop and one for phones.

### 40. A pinned header, a real total
**Did:** Mike asked for five more changes:
- On wide screens, show the order header and the lines in two columns, with the header pinned so it stays in view as the lines scroll.
- Take the contractor's name off the Send button.
- Show the after-tax total.
- Remove the header's "Ready to send…" line, which repeated the footer.
- Move each queue row's status to its bottom-right corner.

**Happened:**
- **Two columns:** they start at 1280 px, so they fit even with the queue sidebar open. The left column is about 370 px wide, so the header's own narrow layout takes over.
- **Pinning:** none of the 20 sample orders is long enough to scroll on a 1440 × 900 screen. The test stretches the list artificially to prove the header stays put.
- **Tax:** the demo has no province, so the total assumes Ontario's 13% HST, kept in one constant. For the default order that is $400.50 + $52.07 = $452.57.

**Changed:**
- The header is pinned on wide screens.
- The button reads "Send for approval".
- The footer reads Subtotal, HST (13%), then the total in CAD. While lines are still to check, it says which lines aren't included yet.
- The header shows a status only after sending.
- The e2e test checks the pinned header, the tax maths and the new button label.

### 41. Removing the walkthrough
**Did:** Mike removed the three-step walkthrough. The screen now explains itself: the order waits in the queue, the flagged line says why, and Send says what's left.
**Happened:** the tour had spread well beyond its own component:
- state and stored "completed" flag
- a Replay button in Settings
- hooks that moved it on when an order opened, a line was decided or Send was pressed
- highlight and glow CSS
- a dedicated smoke test
- steps inside two other smoke tests

One e2e step had relied, without saying so, on the replay reopening the desktop sidebar. That showed up as soon as the tour was gone.
**Changed:** the walkthrough, its CSS, the Replay setting and the onboarding smoke test are gone. The tests now open the sidebar themselves. The first-load sequence is unchanged: waiting for orders, then the order arriving in the queue.

### 42. Splitting the review screen into parts
**Did:** split the 1,355-line `ReviewApp.tsx` by feature, without changing how anything looks:
- `access/`, `queue/`, `order/`, `cost/`, `settings/` and `help/` folders
- shared primitives in `components/ui/`: Button, Pill, SheetHeader, Switch, SegmentedControl
- state moved into hooks: live orders, the rep's decisions and the panel layout
- pricing, tax and formatting moved to `lib/` with unit tests
- pixel text sizes replaced by a named type scale

**Happened:**
- Before and after screenshots of 42 screens were pixel-identical: light, dark and system-dark themes, desktop and phone, plus dialogs and the Generate flow. The comparison first caught a false alarm: Generate order picks a random contractor, so the capture now seeds the randomness.
- `ReviewApp.tsx` went from 1,355 lines to 205, and no file is now over 222 lines.
- Naming the primitives made the inconsistencies visible:
  - four sizes of the primary button, with two corner radii
  - two disabled opacities
  - five near-identical pill styles
- An existing smoke test (`results-smoke`) had been failing since the walkthrough removal. It still expects a cost panel that's open on load.
- Separately, Mike doubled the lock screen card's maximum width.

**Changed:**
- A visual change is now usually an edit to one token or one primitive, rather than to dozens of class names.
- The inconsistencies above are queued for the visual-identity pass, so they get decided rather than carried over by accident.
- The dark palette is still written out three times in `globals.css`. Folding it into one source changes shadow geometry too, so it waits for that pass.

### 43. A pick ticket, not a storefront
**Did:** gave Counterpart its own look, taken from the lumber-yard counter rather than from a template:
- **Colours:** a concrete-grey page, one white order sheet, graphite text, tape-measure yellow kept for the logo and Send, lumber-crayon orange for lines to check, and grade-stamp green for approved lines.
- **Type:** Archivo, with condensed figures from its own width axis for quantities, prices and order numbers.
- **Corners:** square, 4–6px. Only the contractor's text bubble stays round.
- **Layout:** the lines and the total sit on one sheet, with the quantity first on every line, like a pick ticket.
- **The one bold element:** a crayon edge down each line to check, like the paint on lumber ends. Queue rows with lines to check carry the same edge.
- **Phones:** the contractor's text folds behind "Show text".
- **Copy:** the saving reads "N× lower AI cost".
- **Dark mode:** the palette is now written once, as light-dark() pairs, instead of three copies.

**Happened:**
- The first screenshots showed that opening the AI cost rail squeezed the lines to one word per row. The two-column layout followed the window width, not the space the review actually had. It's now a container query, so the review drops to one column when the rail opens.
- On phones, the first line to check moved from below the fold onto the first screen.
- The ux-critic agent ranked 13 issues. The worst was older than this pass: j/k moved an invisible cursor while the 1/2/3/x hints showed on every line to check, so a key could confirm a line the rep wasn't looking at.
- The faded-yellow Send that sits there until the order is ready measured 2.53:1 contrast, below the WCAG AA minimum.

**Changed:**
- Fixed in this pass:
  - The active line now has a wider crayon edge and a tint, j/k move focus with it, and the key hints show only on that line.
  - A line's quantity turns orange only when the quantity itself is in question.
  - An unready Send uses a quiet outlined style instead.
  - On phones, the choices span the full width.
- Left for Mike, because they change earlier product decisions:
  - listing the suggestion first
  - trimming the reason text and the five repeated "to check" counts
  - single-line approved rows
  - skip-link and Escape fixes

### 44. Turning point: from a demo screen to a counter tool
This is the point where Counterpart stopped looking like a template and started behaving like a rep's work tool. Three changes landed on the same day, each made cheaper by the one before it.

**Did:**
- **Structure (entry 42):** split the 1,355-line screen into feature folders and shared primitives, with zero visual change.
- **Identity (entry 43):** the pick-ticket look, built mostly as token edits on top of that structure.
- **Mike's follow-ups:**
  - Corners down to 2px.
  - A bare sidebar toggle.
  - A brand-yellow orders button on phones.
- **An order lifecycle in the inbox:** a three-step filter, Open, Sent, Approved.
  - **Mike's choices:** "Approved" rather than closed, completed or processed, because it names what happened and pairs with "Send for approval". The contractor's reply is simulated: five seconds after Send, the order is approved, goes to the ERP and moves tabs.
  - **Reopen:** works only until the contractor replies. After that, the footer reads "Approved by Owen Park at 3:55 PM. Sent to the ERP."

**Happened:**
- Before and after, side by side: `public/case-study/evolution/pick-ticket/compare-desktop-order.png` and `compare-mobile-order.png`. The same order (1013) goes from cream paper, four rounded cards and monospace data to one ruled sheet on concrete, with the quantity first and the uncertain line marked by a crayon edge.
- On a phone, the first line to check moved from below the fold onto the first screen.
- The lifecycle was tested in a real browser: Open → Send → the Sent tab → about five seconds → the Approved tab, with Reopen gone. The screenshots are in the same folder (`after-desktop-inbox-open`, `-sent`, `-approved`).
- The pixel-identical refactor is what made this a one-day change: the identity pass touched tokens and a handful of primitives, not hundreds of class names.

**Changed:**
- The demo now tells the whole story a rep lives through: a text arrives, the rep checks only what's uncertain, sends it for approval, and watches it go to the ERP.
- The inbox is now organized by where each order is, not just by arrival.
- **Talk track:** open on the before/after composite, then walk one order through Open → Sent → Approved.

## Where it stands

| | Claude only | Claude + Jev |
| --- | --- | --- |
| Right product | 98.9% | 98.9% |
| Auto-approved | 75.0% | 75.0% |
| Wrong product among auto-approved | 0% | 0% |
| Matching time per order | about 2.5 s | about 0.5 s |
| Matching cost per order | about $0.037 | about $0.001 |

Read as signals, not benchmarks: 20 orders, tuned in-sample, costs from token counts at list prices. What the data supports is that Jev's confidence is well calibrated (every line it was at least 70% sure of was right) and the matching step is roughly 36x cheaper and about 4.7x faster on the clock (about 1.3x if you add up every call, because Jev's lines run in parallel), with the same number of lines safely skipping review. It does not show Jev is more accurate.

## What the process taught us

- **Keep the honest result.** Jev lost the first comparison. Asking why, instead of tuning until it won, produced the most useful finding in the project.
- **A second, independent pair of eyes at each layer.** A blind labeler for the answer key, an auditor for the metrics, a critic for the screen. Each found something we would not have.
- **Test the cause before fixing it.** The quantity-check fix was a cheap experiment on 67 lines with a check that it had not simply turned the gate off.
- **Save raw scores, apply thresholds later.** It made the sliders instant and every re-tune free.
- **Disclose what was tuned on what.** In-sample results are fine if labeled.
- **The story maintains itself.** This file is kept current by a commit hook (product-changing commits are blocked until an entry is added) and a scribe agent that drafts entries from what actually happened, so the lessons are captured while they are fresh.
- **Guardrails are part of the product.** Secret scans, a leak test on the answer key, rate limits on the live route.

## Open questions

- A held-out set of messier orders (the current set was used to tune).
- Test the Claude-only pipeline with prompt caching on its catalog prompt, which production would use; it would narrow the cost gap.
- How the quantity check behaves on real, noisier unit language.
- A hard, shared cap on live runs (the current limits are per server instance).

## Walking someone through it (about 5 minutes)

1. **The problem (30s).** Show a messy text order. "Reading it is the easy part."
2. **The screen (90s).** Open the workspace on the default order. Approved lines are quiet; the flagged line says why. Open Settings in the cost panel, move a slider and watch lines re-route with no API call. Point at the cost panel: same approvals, about 60x cheaper matching; click the Claude-only card to switch the draft. Point at the sidebar: every order with its count of lines to check.
3. **The measurement (90s).** Switch to Sample results. Read one number from each side; point at the calibration table.
4. **The turning points (90s).** Timeline 4 (Jev lost), 5 (our bugs), 7 (the quantity question). "The interesting work was the honest debugging."
5. **The close (30s).** "The hard part isn't reading the order. It's deciding what the rep doesn't need to check."

---

## Entry template (for new entries)

```
### N. Short title
**Did:** what we built or changed.
**Happened:** what we observed, with numbers.
**Changed:** what it altered in the product or the process.
```


## Results display and threshold exploration — September 30, 2026

The live panel now compares the whole-order costs directly and draws shared reading and matching as grey and accent segments on one scale. The results dashboard leads with the finding: same accuracy and decisions on all 88 lines, at 4.5× lower whole-order cost. At defaults, each pipeline gets 87 products right, auto-approves 66 with zero wrong products, and flags one line unnecessarily. Excluding 15 Jev no-match lines gives an allocated whole-pipeline saving of 4.4× on 73 lines; shared batch costs are divided equally across each order's lines.

Quality cards show counts first. The time card is removed. Both approval columns remain for transparency, with a badge when any line's decision differs. Thresholds persist in a shared browser store and re-route the saved per-line confidences throughout the dashboard without API calls. Table totals, cost means, confidence bands, misses, and headline use the same scoring function. Method notes identify Mike's answer-key review on September 29 and explicitly mark the original run date and resolved Jev version as unrecorded. The older step-only comparisons above describe historical iterations; the current claim is whole-order cost.

## Lock screen explains the product before asking for a code — October 2, 2026

**Did:** The lock screen now reveals its copy in reading order: wordmark, headline, a one-line pitch, then three numbered steps (a contractor texts an order, with a sample message; AI drafts it from the catalog with a confidence score; the rep checks only what's uncertain). The access-code field arrives last, about 4 seconds in.
**Happened:** The old screen showed a tagline and the code field together, so new visitors went straight to the field and skipped the explanation. Any key press, tap, or typing in the field shows everything immediately, so returning reps don't have to wait. Reduced-motion users see the full screen with no animation. The browser smoke tests still pass at 1440, 768 and 390 px.
**Changed:** The first screen now explains the product. The access code is the last thing on the screen, not the first.

## Demo label, an iOS zoom fix, and a cue toward the cost results — October 2, 2026

**Did:** Added a "Demo" pill to the wordmark wherever it appears, so visitors know the orders and prices are synthetic. Gave the order card's Results button a faint outline in the cost bars' blue, which glows twice about a second after an order opens, so the eye moves from the order to the cost comparison. Made text fields 16px on touch screens.
**Happened:** On iPhone the page loaded slightly zoomed in and off-centre. The cause was the lock screen: its code field was 15px, and iOS Safari zooms any focused field under 16px and keeps the zoom after the field goes away. A mobile-emulated check now shows 16px fields and no horizontal overflow at 390px. The large wordmark also wrapped onto two lines at 320px once the pill was added, so it now scales with the screen width.
**Changed:** The demo status is visible at all times instead of only being stated in About. The fix also covers the quantity editor and the sign-up email field, which had the same zoom problem.

## The cost result arrives last, in blue — October 2, 2026

**Did:** The Results button in the order card now animates in after the rest of the order (fades and rises in at 0.7s, once the card has settled), then glows twice. Its text is the cost bars' blue (#2563eb; a lighter #93c5fd in dark themes) instead of grey and black.
**Happened:** With only an outline and a glow, the button still didn't stand out on the phone. The new blue text meets WCAG AA contrast: 4.8:1 on its light background and 10:1 in dark. Opening and closing the comparison doesn't replay the entrance.
**Changed:** On every order the eye goes order first, then the cost result. Flagged lines keep their warning colour, so the blue doesn't compete with what the rep has to check.
