# v6 — the four deferred items from v5, plus a Sch C OCR gap found along the way

Added `src/patch-v6.js`, wired into `build/inject.py` after v5. Nothing in
either engine edited.

## What's new

- **Schedule C OCR on drafts.** `classify()`/`extractFields()` never ran
  OCR text through any normaliser, so the same interleaved-glyph draft
  watermark problem `patch-docs.js` already solved for a Closing
  Disclosure ($3,a914.29 / 6 .75 % style corruption) would have broken
  Schedule C recognition too. Wrapped both functions to reuse
  patch-docs.js's proven `norm()` (exposed as `DOC._norm`) rather than
  re-deriving it — one fix, and since it sits in front of the shared
  `classify`/`extractFields` pipeline, every other document type on
  that same OCR path (W-2, paystub, K-1, 1120, Schedule E) gets the
  same tolerance as a side effect.
- **Draft Schedule C.** A print button on each Schedule C card generates
  a watermarked draft. Important scope note: the worksheet only ever
  collects the FNMA Form 1084 add-back analysis (net profit, depletion,
  depreciation, meals, home-office, mileage) — it never asked for the
  full Part I/II income-and-expense detail a real IRS Schedule C carries,
  so there's no data to fill those boxes with. Rather than fabricate
  numbers for fields the worksheet doesn't have, this prints the actual
  analysis — the same figures on the worksheet, with their real Schedule
  C line citations — titled "Schedule C Income Analysis," framed
  explicitly as underwriting work product, not a completed tax form or
  a substitute for the signed return.
- **Draft LE, full detail.** `LOANSUITE.printLE` now produces a two-page
  draft: page 1 is what was already there; page 2 is a real A–J
  breakdown. Sourced from `out.closing.lines` — the engine's own already-
  computed, already-categorised (lender/title/government/prepaid/other)
  itemised fee sheet — bucketed into the LE's A/B/C/E/F/G sections by
  category, plus an H section (and A-section supplemental-origination
  line) built from the renovation output fields for 203(k)/HomeStyle
  loans, since the base closing calculation doesn't know about those.
  Ends with a "Calculating cash to close" reconciliation and, on a
  renovation file, a renovation-budget table. Modeled on the structure
  of the uploaded `LE_203k.pdf` but adapted to what this engine actually
  computes — it doesn't carry a few of the PDF's more granular title
  sub-lines (courier, endorsements) since there's no underlying field
  for them, only the combined title insurance / title search figures
  the engine tracks.
- **Documents + Comparison.** Two changes to the existing "Contract &
  LE" panel:
  - Real drag-and-drop. It only had click-to-browse before, despite the
    README's claim — there was no `dragover`/`drop` handling at all.
    Worth flagging why this took care: the *engine's own* global
    `dragenter`/`dragover`/`drop` listeners live on `document` and
    unconditionally jump to the calculator's Documents tab on any file
    drop anywhere on the page. Without `stopPropagation()` in the new
    per-zone handlers, every drop on the new zones would have been
    hijacked to the wrong tab.
  - A genuinely collapsed "Comparison" section, closed by default,
    taking exactly two files — AUS, LE, or CD, in any combination. AUS
    parsing reuses the engine's own `parseAUS()` rather than duplicating
    it. AUS and LE/CD parsers return differently-shaped data (`parsed.f`
    with pre-formatted strings for AUS vs. `parsed.fields` with bare
    numbers for LE/CD), so each comparison row knows how to read either
    shape and shows "—" for a concept that doesn't apply to that
    document type, rather than guessing. Comparing two same-family
    documents (LE vs. LE, AUS vs. AUS) gets a difference column;
    comparing across types (AUS vs. LE) shows both side by side without
    one, since a numeric diff across two different concepts isn't
    meaningful.

## Lock Extension — the rate was wrong, and re-reading the code did not catch it

An earlier draft of this changelog recorded the lock extension as
"0.20% / 20 bps per day — re-read the v5 code path end to end against the
brief. Unchanged." That re-read was worthless: the code was internally
consistent, so reading it proved nothing.

Running the arithmetic against a real loan amount found it immediately.
The confirmed rate is **2 bps/day (0.02% of the loan per day)**. v5 had
coded 20 bps/day, ten times too high — on the uploaded LE's $615,580
loan, a 15-day extension priced at **$18,467** instead of **$1,847**.

Corrected in `patch-v5.js` and re-verified across normal, zero-day,
negative-day and DST-crossing ranges. 15 days now = 30 bps = 0.30% =
$1,846.74.

The general lesson, worth keeping: a "re-verified" claim that consists of
re-reading code is not verification. Anything numeric needs the numbers
actually run.

## Three-way theme toggle — re-verified

`LOS.setSkin()` (patch.js, untouched) is the same function the original
three-button toggle called; the v5 button changed the trigger only, not
the mechanism. Cycle order confirmed light → dark → navy → light in
`THEME_NEXT`, navy rules confirmed present in `patch.css` keyed on
`html[data-skin="navy"]`, and `applyTheme()` confirmed a real global.

Not exercised in an actual browser — same Playwright/Chromium sandbox
restriction as v5 (see `CHANGELOG-v5.md`). If it misbehaves in your
browser it'll be a real bug worth a screenshot, not "works on my machine."

## Defects found while verifying this pass, and fixed

The v6 draft assumed a lot about engine internals. Most assumptions held;
these did not:

- **The Comparison card could never expand.** `toggle()` re-rendered into
  a body element that only exists in the markup when already open, so
  clicking it did nothing at all. It rebuilds the card now.
- **The card was destroyed on every docs re-render.** `DOC.render()`
  rewrites `#docsBody` wholesale. `DOCP.render` is now wrapped to
  re-append synchronously, instead of the section vanishing and popping
  back half a second later on the poll.
- **Page 2 didn't reconcile.** The renovation lines folded into A and H
  are financed into the loan, so J ran ahead of cash-to-close with an
  unexplained gap between them. Added the real LE's "Closing Costs
  Financed (Paid from your Loan Amount)" bridging line — page 2 of the
  uploaded `LE_203k.pdf` does exactly this.
- **No CSS existed for v6 at all** — and `patch-docs.js`'s dropzone
  (`class="dz"`) has never had *any* rule anywhere in the file. It
  survived as an unstyled bare div while it was click-only; adding
  drag-and-drop to a target with no border and no `.drag` state reads as
  broken. Added `patch-v6.css`, styled to match the engine's own
  `.dropzone`.
- **`printLE` was overridden at load time** behind a bare
  `window.LOANSUITE && (…)`. Correct under the current concatenation
  order, but it fails closed and silently if that order ever changes, and
  the only symptom would be the old thin one-page LE printing with no
  indication why. Now installed from the poll with an idempotency marker.
- Guarded `printDraftSchC` against a null calc result, and a dropped file
  that can't be parsed now says so rather than rendering a table of
  dashes.

## Also fixed: `build/inject.py` idempotency

The README documents that inject.py can be re-run against its own output.
It could not. Three separate problems, all now fixed and verified
byte-identical across three consecutive passes:

1. Patch files were read from the wrong directory. The v5 fix for that
   then broke the rebuild-from-output case; it now checks `src/` next to
   the source, `build/` next to the script, and `../src`, in order.
2. `FONT_NEW` still matches `FONT_OLD`, so the font swap re-fired on
   already-patched input and appended another pair of preconnect tags on
   every rebuild.
3. The strip regex left the newlines wrapping each block, so the output
   grew four bytes per rebuild.

## Verification

`node --check` passes on `patch-v6.js` alone and on the full concatenated
bundle in the rebuilt output (six patch files plus v6, ~258K chars).
Every engine function, field path (`closing.lines[].category`,
`renovationOut.*`, `parseAUS()`'s field shape, `DOC.parseLE()`'s field
shape) and DOM selector (`.dz`, `#docsBody`, `#i-print`) this patch
touches was checked against the actual source rather than assumed —
two of my first-draft assumptions turned out to be wrong (the AUS
field object is `.f` with formatted strings, not `.fields` with bare
numbers like the LE parser; `i-printer` isn't a real icon, `i-print`
is) and were caught this way before shipping rather than after.

Two pieces of pure logic now have Node unit tests, run and passing:

- **The normaliser**, against all seven documented corruption patterns,
  including the important negative case — `710,000` keeps its three
  legitimate zeros while quadrupled *letters* still collapse to one.
- **The lock extension math**, across normal, zero-day, negative-day and
  DST-crossing date ranges.

**The A-J bucketing was arithmetic-tested**, which is what surfaced the
missing financed line: every buyer-side closing key is explicitly
bucketed, there are no dead entries, seller lines are correctly excluded,
and J reconciles exactly to the engine's own buyer closing-cost total
with nothing lost or double counted.

`verify_los.py` still hasn't been extended with v5/v6-specific checks —
same reasoning as before: no way to run it here, so no test code added
that I can't confirm passes. Writing checks that have never once been run
risks shipping tests that pass for the wrong reason, or that fail on a
selector typo and get written off as flaky. Please run the existing 33
checks against this build locally, then extend once the baseline is
confirmed green:

```bash
pip install playwright && playwright install chromium
python3 build/verify_los.py
```
