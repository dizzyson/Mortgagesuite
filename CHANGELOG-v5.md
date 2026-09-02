# v5 — correctness fixes + first pass at the new brief

Added `src/patch-v5.js` + `src/patch-v5.css`, wired into `build/inject.py`.
Nothing in either engine (`mortgage-suite-allinone.html`) was edited.

Also fixed a pre-existing bug in `build/inject.py`: it read the patch files
relative to its own directory (`build/`) instead of `src/`, so it only ever
worked if you manually copied the patch files into `build/` first. It now
resolves them relative to the source HTML's directory.

## Correctness fixes (not just features — these were producing wrong numbers)

- **Self-employment income, single populated year.** `calcSchC` / `calcCorp`
  divided by 24 months even when one year was entirely blank (default $0),
  halving qualifying income. Wrapped both; a year is now only "populated"
  if at least one of its own fields is non-zero, and a single populated
  year uses that year directly. Applies to Sch C and 1065/1120-S/1120
  uniformly — flag if you wanted it scoped to Sch C only.
- **VA double-count.** `patch-va.js`'s dedicated VA tab was adding its own
  total on top of whatever the native "VA Benefits" Other Income record
  already contributed. Kept the dedicated tab (residual income test and
  funding-fee waiver are real requirements, not worth losing); removed
  "VA Benefits" from the Other Income picker so a new file can't recreate
  the collision; flags and offers a one-click fix for any file that
  already has both.
- **Draw fee sync.** The engine already auto-calculates title/inspection
  draw fees from the draw plan via `reno.syncDrawFees` — it just defaults
  `false` and lives in a collapsed sub-panel, so it was effectively never
  on. Surfaced a visible toggle; defaults `true` for scenarios created
  from here on. Existing saved scenarios are left exactly as they were —
  didn't want to silently flip a persisted value that might have been a
  deliberate "off."

## New from the brief

- Theme: one unlabelled icon button cycling light → dark → navy, in place
  of the three labelled buttons.
- Live calc: the ~44 fields still bound to `onchange` only now also fire
  on every keystroke (intercepts the existing inline handler rather than
  duplicating its logic, so there's one source of truth per field).
- Business start date next to the entity name (Sch C and 1065/1120-S/1120);
  under five years old overrides a manually-selected "recent year only"
  back to the two-year average. Doesn't touch the auto/declining logic,
  which already picks the conservative figure on its own.
- ZIP lookup: the engine already had `applyZipLookup()` (offline, correct
  on every NYC borough) and `lookupZipOnline()` behind manual buttons.
  Wired both to fire once five digits are typed. Also writes the NYC
  county for display even for the boroughs — the engine only reads it
  back for the *non*-NYC counties (jurisdiction pricing keys off `isNYC`
  directly for the boroughs), so this is purely cosmetic/documentary and
  doesn't touch anything that prices a loan.
- Community property banner on Closing (nine states).
- Lock extension calculator on Closing: blank until opened, 0.20% (20 bps)
  per day between the two dates, against the current total loan amount.
  Confirm against the actual lender fee schedule before quoting.
- Live summary rail: mortgage insurance line now shows its rate next to
  the dollar amount; a scenario-name line sits under the title; the title
  itself jumps to Summary.
- Scenario naming reverted to `Lastname · Program · down% · rate · MM-DD`
  — patch-v2's version had drifted to `[Loan] - [LTV]% - [Rate]% -
  [Program]` with no name or date. If the drift was actually intentional,
  say so and I'll put it back.

## Not in this pass

Still open from the brief, each large enough to want its own pass rather
than being rushed:

- Draft LE page-2 detail (A–J closing-cost breakdown + renovation budget,
  modeled on the uploaded `LE_203k.pdf`).
- Documents/Comparison: real drag-and-drop (the current dropzone is
  click-to-browse only despite the README's claim), a genuinely
  unexpanded Comparison subtab, and AUS added to the parser (currently
  contract/LE/CD only).
- Stipulations sourced from AUS findings and triggered guideline cards,
  on top of the existing Income/Asset/Credit worksheet-driven set.
- An itemized title-fee section on Closing (courier, endorsements,
  lender's/owner's title insurance, search, settlement, update fee as
  separate lines) — the engine currently has one lump "Title search +
  settlement" override only.

## Verification

`node --check` passes on `patch-v5.js` and on the full concatenated patch
bundle in the rebuilt output. Every engine function, field path and DOM
selector `patch-v5.js` touches was cross-checked against
`mortgage-suite-allinone.html` by hand.

Could **not** run `build/verify_los.py` here — Playwright's Chromium
download is blocked by this environment's network allowlist
(`x-deny-reason: host_not_allowed` against `playwright.download.prss.microsoft.com`
and `cdn.playwright.dev`). Please run it locally before treating this as
final:

```bash
pip install playwright && playwright install chromium
python3 build/verify_los.py
```

`verify_los.py` itself hasn't been extended with v5-specific checks yet —
didn't want to add test code I have no way to actually execute and
confirm passes. That's the natural next step once you've run the
existing 33 against this build.
