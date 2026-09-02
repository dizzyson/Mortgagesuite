# v7 — live PMI, the clipped menu, lock dates, hourly, draft Sch C form, capacity

Adds `src/patch-v7.js` + `patch-v7.css`. Neither engine edited.

## The "save/load JSON is missing" report was actually the menu bug

`saveJSON()` and `loadJSON()` already existed and worked, and the Load menu
already had "Load income file (.json)" as its **first** item. It was
invisible: `patch.css` had raised the calculator tab bar to `z-index:60`,
the toolbar carrying Income Report / Load / Save sits at `55`, and a
dropdown cannot paint above its own parent's stacking context — so the
top of the menu rendered *behind* the tab strip. That is exactly the band
missing from the screenshot.

Fixed by restoring the stacking order (toolbar 80, tab bar 55, menus 400)
rather than by adding duplicate save/load code. Save/Load .json buttons
were also added inside the report window, where the work is happening.
Menus that would run off the bottom of the viewport now scroll.

## PMI was live in the maths and dead in the UI

`paintLoan()` already refreshed `#ln-mi` and `#ln-mirate` in place and
deliberately skipped the field holding the caret. But the FICO, note
rate, term, MI-override and upfront-fee inputs were bound to `setLoan()`,
which ends in `renderDTI()` — a full teardown and rebuild of the tab on
**every keystroke**. The value landed, the caret jumped, and the MI
figure only appeared to settle once you clicked away.

`setLoan` is now wrapped to route non-structural keys to the existing
`setLoanLive` (which repaints instead of rebuilding). Only the fields
that genuinely change the card's shape — program, transaction, occupancy,
financing toggles, releasing a held loan amount — still take the full
re-render.

The right-hand rail is driven by the suite store rather than the
calculator's `S.loan`, so it never heard about a PMI change at all; it
now gets an explicit push on every loan edit.

**Also corrected in the v5 rail**: the MI rate line read
`activeInputs.fhaAnnualMipRate`, the *pre-override* input, so a file with
an MI override displayed a rate it wasn't being charged. It also
back-computed the conventional rate from the rounded monthly figure, and
wrote the tag once so it froze at its first value. All three now read the
engine's own effective `fhaMipRateUsed` / `pmiRateUsed` and repaint every
pass.

## Lock extension — free-form dates

Both inputs were `type="date"`, i.e. a segmented picker you cannot type a
plain date into. They are now text fields with a parser that accepts
`9/17/26`, `09-17-2026`, `2026-09-17`, `sep 17 2026`, `September 17, 2026`
and bare `9/17` (current year), with a small calendar button still there.
Opening the card seeds the expiration to today and the extend-to date 15
days out; both stay editable and nothing is written until it is opened.

The parser rejects impossible dates rather than letting `Date` roll them
over — `2/30/2026` and `2/29/2026` return empty instead of silently
becoming March 2nd and March 1st. `2/29/2024` is accepted.

## Hourly records default to a 40-hour week

`newW2()` starts at `freq:'Hourly', hours:0`, so typing an hourly rate
produced $0/month until you separately found the hours field. Entering a
rate on an hourly record with no hours now fills in 40 and says so.

Deliberately narrow: it only fires when hours is still zero, so a
document import (which pushes its own `hours` through the same path) and
anything typed both win, and a 37.5- or 20-hour week is never overwritten
on a later keystroke.

## Draft Schedule C now looks like the form

Rebuilt to the real 1040 Schedule C layout — the header block, Part I and
Part II bars, numbered lines down the left, the boxed right-hand amount
column, both years side by side. The Form 1084 add-back analysis that
actually drives qualifying income follows on page two.

Lines the worksheet holds no figure for print **empty**, exactly as a
blank form would. The worksheet collects the 1084 analysis, not a full
return, and filling those boxes with invented numbers would produce a
document that looks like a tax return and isn't one.

The form CSS lives in `patch-v6.js`'s `shell()`, not in `patch-v7.css`:
the print helper opens a blank window and writes a fresh document, which
does not inherit the page stylesheet. Rules placed in the stylesheet
would have silently done nothing.

## Maximum loan and maximum payment on the rail

The engine already computed `maxSupportedHousingPayment` (lower of the
front-end cap and what's left under the back-end cap after liabilities)
and `paymentCushion`. What it never did was turn that payment back into a
loan amount.

The card shows both ceilings, an OVER/UNDER verdict against the current
figures, and a range from an adjustable cushion percentage (default 5%),
because nobody should underwrite to the last dollar of a DTI cap.

The back-solve holds taxes, insurance, HOA and mortgage insurance at this
property's monthly figures, subtracts them from the maximum payment to
leave supportable P&I, then inverts the amortisation formula. **Escrows
are held rather than scaled with price on purpose** — a more expensive
house carries higher taxes, so this is the honest ceiling for *these*
carrying costs, not a forecast for a different property. The card says
so rather than leaving it implied.

## Assumptions that were wrong, caught before shipping

Checked against the engine rather than assumed; three of my first-draft
assumptions did not survive:

- `setField(list, …)` takes the **name** of the list (`'w2'`), not the
  array — `findRec` does `S[list].find()`. The hourly hook would have
  silently never fired.
- The payment output has **`hoaMonthly`**, not `monthlyHoa`, and carries
  **no flood line at all**. The capacity back-solve would have quietly
  ignored HOA and overstated the maximum loan.
- `renderJobs` does not exist; the W-2 render/paint pair is
  `renderW`/`paintW`. Using the render half would also have rebuilt the
  card and taken the caret — the exact bug being fixed elsewhere in this
  pass.

## Verification

`test/v7.test.js` — 20 assertions, run and passing: the date parser
(including the calendar-validity cases above) and the max-loan back-solve.
The back-solve round-trips, and independently reproduces the uploaded
LE's P&I of **$4,043.92** on $615,580 at 6.875% over 30 years, which is a
useful check that the amortisation inversion is right rather than merely
self-consistent.

Full suite (`sh test/run.sh`) passes; `node --check` clean on all nine
patch files and the concatenated bundle; `inject.py` still byte-identical
on rebuild.

**Not verified in a browser** — Playwright's Chromium download is still
blocked in this sandbox. The stacking fix, the rewritten date inputs, the
capacity card and the Schedule C print layout are all DOM/CSS work that
static analysis cannot confirm. These are the highest-value things to
look at first when you run it.
