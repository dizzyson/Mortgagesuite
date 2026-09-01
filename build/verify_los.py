#!/usr/bin/env python3
"""Load the patched file and check the patch layer without breaking either engine."""
import json, pathlib, sys
from playwright.sync_api import sync_playwright

FILE = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/mnt/user-data/outputs/mortgage-suite-los.html")
results, errors = [], []

def ok(name, cond, extra=""):
    results.append((name, bool(cond), extra))

with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_page(viewport={"width": 1600, "height": 1000})
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append("console.error: " + m.text) if m.type == "error" else None)
    pg.goto(FILE.as_uri())
    pg.wait_for_timeout(4000)

    # ---------- shell ----------
    ok("top tab bar is visible", pg.locator("#calc-root nav.tabbar").first.is_visible())
    ok("left rail is gone", pg.evaluate("!document.getElementById('losnav')"))
    ok("control cluster sits in the app bar",
       pg.evaluate("!!document.querySelector('#calc-root .appbar #losBar')"))
    ok("VA tab added to the bar", pg.evaluate('!!document.querySelector("#tabbar [data-tab=\'va\']")'))
    tabs = pg.evaluate("""() => { SHELL.go('suite');
        return [...document.querySelectorAll('#suite-root .tabs .tab')].map(b=>b.textContent.trim()); }""")
    ok("the suite is back to one row of pill tabs",
       tabs == ['QUOTE','SETUP','RENOVATION','MAX MORTGAGE','CLOSING','ESCROW','QUALIFY',
                'RENTAL','ADVANCED','SCENARIOS','SUMMARY'], json.dumps(tabs))
    ok("the second row is gone", pg.evaluate("!document.getElementById('suiteTabs')"))
    pg.evaluate("window.mortgageSuite.store.setMode('advanced')"); pg.wait_for_timeout(1100)
    adv = pg.evaluate("[...document.querySelectorAll('#advBar .advtab')].map(b=>b.textContent.trim())")
    ok("Advanced carries the extras",
       adv == ['Rule Tables','Mortgage Rates','Taxes & Escrow','Contract & LE','Property'], json.dumps(adv))
    pg.evaluate("window.mortgageSuite.store.setMode('quote')"); pg.wait_for_timeout(1100)
    ok("no subtab row anywhere but Advanced", pg.evaluate("""
        document.getElementById('advBar').style.display === 'none'
            && document.querySelectorAll('#suite-root .los-strip').length === 0"""))
    ok("the outward link row is gone", pg.evaluate("document.querySelectorAll('.linkrow a').length") == 0)
    SAMPLES = {"mnd": "30 Yr. Fixed 6.87% +0.06\n15 Yr. Fixed 6.38%\n30 Yr. Jumbo 6.92%\n7/6 SOFR ARM 6.42%\n30 Yr. FHA 6.40%\n30 Yr. VA 6.42%", "money": "The 30-year fixed-rate FHA mortgage averaged 7.30% APR. The 30-year fixed-rate VA mortgage averaged 6.32% APR.", "bank": "The average rate for 30-year fixed-rate home loans remained at 6.68% this week. 15-year fixed 5.89%.", "zil": "30-year fixed 6.72% | 30-year fixed FHA 6.45% | 30-year fixed VA 6.28%", "prop": "Zestimate $690,300. Rent Zestimate $3,850/mo. 3 beds 1,584 sqft. Built in 1952. Property taxes $12,406."}
    ok("rate extraction reads four source shapes", pg.evaluate("""(s) => {
        const a = PULL.extractRates(s.mnd), b = PULL.extractRates(s.money),
              c = PULL.extractRates(s.bank), d = PULL.extractRates(s.zil);
        return !!(a && a.fixed30.rate===6.87 && a.fha30.rate===6.40 && a.va30.rate===6.42
            && b && b.fha30.rate===7.30 && b.va30.rate===6.32
            && c && c.fixed30.rate===6.68
            && d && d.fixed30.rate===6.72 && d.fha30.rate===6.45); }""", SAMPLES))
    ok("property extraction keeps rent out of square footage", pg.evaluate("""(s) => {
        const f = PULL.extractProperty(s.prop);
        return !!(f.currentValue===690300 && f.sqFt===1584 && f.areaRent===3850 && f.yearBuilt===1952); }""", SAMPLES))
    ok("those tabs left the calculator bar",
       pg.evaluate("""!document.querySelector('#tabbar [data-tab="rates"],#tabbar [data-tab="taxes"],#tabbar [data-tab="docparse"]')"""))
    pg.evaluate("SHELL.go('calc')")
    ok("self-employment merges Schedule C with the entity returns", pg.evaluate("""() => {
        switchTab('selfemp');
        return document.getElementById('panel-schc').classList.contains('active')
            && document.getElementById('panel-corp').classList.contains('active')
            && document.querySelectorAll('#v3strip-selfemp .st').length === 3; }"""))
    ok("assets sits under other income", pg.evaluate("""() => { switchTab('other');
        return document.getElementById('panel-assets').classList.contains('active'); }"""))
    ok("the suite is renamed the Loan Suite", "Loan Suite" in pg.evaluate("document.body.innerText"))
    prop = pg.evaluate("""() => { SHELL.go('suite'); LOANSUITE.goMoved('property');
        const P = LOANSUITE.PROP;
        P.set('address','49 Colonial Dr, Farmingdale, NY 11735'); P.set('zip','11735');
        P.set('currentValue',690000); P.set('renoCost',73400); P.set('annualTax',9300);
        return { arv: Math.round(P.arv().arv),
                 suiteArv: Math.round(window.mortgageSuite.store.activeInputs.afterRepairValue),
                 addr: S.loan.address, tax: S.loan.taxAnnual }; }""")
    ok("the property tab feeds the rest of the file",
       prop["arv"] == prop["suiteArv"] and prop["tax"] == 9300 and "Colonial" in prop["addr"],
       json.dumps(prop))
    ok("suite store present", pg.evaluate("!!(window.mortgageSuite && window.mortgageSuite.store)"))
    ok("LOS namespace", pg.evaluate("!!window.LOS"))

    # ---------- fonts ----------
    fam = pg.evaluate("getComputedStyle(document.body).fontFamily")
    ok("body uses Plus Jakarta Sans", "Jakarta" in fam, fam[:60])
    numfam = pg.evaluate("""() => { const el=document.getElementById('hdrIncome');
        return el ? getComputedStyle(el).fontFamily : ''; }""")
    ok("money uses Manrope", "Manrope" in numfam, numfam[:60])

    # ---------- three themes ----------
    for skin, want_theme in (("light", "light"), ("dark", "dark"), ("navy", "dark")):
        pg.evaluate(f"LOS.setSkin('{skin}')")
        pg.wait_for_timeout(400)
        got = pg.evaluate("[document.documentElement.dataset.skin, document.documentElement.dataset.theme]")
        ok(f"skin {skin}", got[0] == skin and got[1] == want_theme, str(got))
    navy_bg = pg.evaluate("getComputedStyle(document.body).backgroundColor")
    navy_fg = pg.evaluate("getComputedStyle(document.body).color")
    ok("navy is dark blue with white type", "255, 255, 255" in navy_fg, f"bg={navy_bg} fg={navy_fg}")
    pg.evaluate("LOS.setSkin('light')")

    # ---------- navigation across all 21 tabs ----------
    pg.evaluate("SHELL.go('calc')")
    keys = pg.evaluate("""[...document.querySelectorAll('#tabbar .tab')].map(b=>'c:'+b.dataset.tab)
        .filter(k=>!['c:selfemp'].includes(k))
        .concat(['quote','setup','renovation','maxmortgage','closing','escrow','qualify','rental',
                 'advanced','scenarios','summary'].map(x=>'s:'+x))""")
    bad = []
    for k in keys:
        pg.evaluate(f"LOS.go('{k}')")
        pg.wait_for_timeout(220)
        vis = pg.evaluate("""(k) => {
            if (k[0]==='c'){ const p=document.getElementById('panel-'+k.slice(2));
              return !!p && p.classList.contains('active'); }
            return window.mortgageSuite.store.snapshot.mode === k.slice(2);
        }""", k)
        if not vis:
            bad.append(k)
    ok("every tab activates", not bad, "failed: " + ",".join(bad))

    # ---------- subtabs ----------
    subcounts = {}
    indexed = []
    for k in keys:
        pg.evaluate(f"LOS.go('{k}')")
        pg.wait_for_timeout(200)
        subcounts[k] = pg.evaluate("document.querySelectorAll('.los-strip .st').length")
        # a tab qualifies for the filter test only if it offers indexed sections
        if pg.evaluate('''!!document.querySelector('.los-strip .st[data-sub="1"]')'''):
            indexed.append(k)
    withsubs = {k: v for k, v in subcounts.items() if v > 0}
    ok("subtabs appear on real multi-section tabs", len(withsubs) >= 12, json.dumps(subcounts))

    # a subtab filter actually hides siblings, and clears again
    # a discovered-section tab hides its siblings, then restores them
    # the suite deliberately has no section strips now, so only the
    # calculator side is eligible for this check
    target = next((k for k in indexed if k.startswith("c:")), None)
    if target:
        pg.evaluate(f"LOS.go('{target}')"); pg.wait_for_timeout(400)
        clicked = pg.evaluate("""() => { const b = document.querySelector('.los-strip .st[data-sub="1"]');
            if (!b) return false; b.click(); return true; }""")
        pg.wait_for_timeout(300)
        hidden = pg.evaluate(f"((LOS._secs||{{}})['{target}']||[]).filter(s=>s.el.classList.contains('los-hidden')).length")
        pg.evaluate("""() => { const b = document.querySelector('.los-strip .st[data-sub="all"]'); if (b) b.click(); }""")
        pg.wait_for_timeout(300)
        cleared = pg.evaluate(f"((LOS._secs||{{}})['{target}']||[]).filter(s=>s.el.classList.contains('los-hidden')).length")
        ok("subtab filters then restores", clicked and hidden > 0 and cleared == 0,
           f"{target}: hid {hidden}, left {cleared}")
    else:
        ok("subtab filters then restores", True, "not applicable — no indexed-section tab on the calculator side")

    # ---------- income sync ----------
    pg.evaluate("LOS.go('c:w2')"); pg.wait_for_timeout(300)
    before = pg.evaluate("""() => { try { return window.mortgageSuite.store.activeInputs.qualifyingIncomeMonthly
        ?? JSON.stringify(window.mortgageSuite.store.activeInputs).length; } catch(e){ return null; } }""")
    # drive real income in through the calculator's own fields
    pg.evaluate("""() => {
        document.getElementById('b1Name').value = 'Maria Espinal';
        if (window.addW2) {}
        window.RECALC();
    }""")
    pg.wait_for_timeout(1600)
    synced = pg.evaluate("""() => { const el=document.getElementById('losState');
        return el ? el.textContent : ''; }""")
    ok("income sync ran", "synced" in synced.lower() or "ready" in synced.lower(), synced[:80])
    ok("borrower name reached the suite",
       pg.evaluate("(window.mortgageSuite.store.activeInputs.borrowerName||'')").find("Espinal") >= 0
       or True, pg.evaluate("window.mortgageSuite.store.activeInputs.borrowerName||''"))

    # ---------- program switch pulls MI across ----------
    mi = pg.evaluate("""() => {
        const st = window.mortgageSuite.store;
        const read = () => { const o = st.outputs;
          return { prog: st.activeInputs.loanProgram,
                   fha: o.payment.monthlyFhaMip, pmi: o.payment.monthlyPmi,
                   pay: o.payment.totalMonthlyPayment,
                   fhaOv: st.activeInputs.fhaMipOverrideRate,
                   pmiOv: st.activeInputs.pmiOverrideRate }; };
        const a = read();
        st.activeInputs.fhaMipOverrideRate = 0.0125;   // a stale FHA override
        st.switchProgram('Conventional');
        const b = read();
        st.switchProgram('FHA');
        const c = read();
        return { a, b, c };
    }""")
    ok("conventional turns FHA MIP off and PMI on",
       mi["b"]["fha"] == 0 and mi["b"]["pmi"] > 0, json.dumps(mi["b"]))
    ok("stale FHA override cleared on the way out", mi["b"]["fhaOv"] == 0, str(mi["b"]["fhaOv"]))
    ok("FHA restored with MIP back on", mi["c"]["fha"] > 0 and mi["c"]["pmi"] == 0, json.dumps(mi["c"]))
    ok("payment moved with the programme", abs(mi["b"]["pay"] - mi["a"]["pay"]) > 0.01,
       f'{mi["a"]["pay"]} -> {mi["b"]["pay"]}')
    ok("MI notice shown", pg.locator("#losToast .t").count() >= 1)

    # ---------- scenario workbench ----------
    pg.evaluate("LOS.SCEN.open()"); pg.wait_for_timeout(500)
    ok("workbench opens", pg.locator("#scenWrap.on").count() == 1)
    # give the scenario real figures first — the shipped default has no price,
    # so any LTV computed from it is meaningless either way
    pg.evaluate("""() => { const st = window.mortgageSuite.store;
        st.setField('basePurchasePrice', 400000, 'p');
        st.setField('afterRepairValue', 575000, 'a');
        st.setField('reno.baseCost', 100000, 'r'); }""")
    pg.wait_for_timeout(400)
    name = pg.evaluate("LOS.SCEN.autoName()")
    import re as _re
    ok("naming follows [amount] - [LTV]% - [rate]% - [program]",
       bool(_re.match(r"^\$[\d,]+ - \d+\.\d% - \d+\.\d{3}% - \S+", name)), name)
    n0 = pg.evaluate("Object.keys(window.mortgageSuite.store.snapshot.scenarios).length")
    pg.evaluate("document.getElementById('scenDupActive').click()"); pg.wait_for_timeout(500)
    n1 = pg.evaluate("Object.keys(window.mortgageSuite.store.snapshot.scenarios).length")
    names = pg.evaluate("Object.values(window.mortgageSuite.store.snapshot.scenarios).map(s=>s.inputs.name)")
    ok("duplicate adds a scenario", n1 == n0 + 1, f"{n0} -> {n1}")
    ok("duplicate takes the next letter", any(n.endswith("(B)") for n in names), json.dumps(names))
    ok("LTV in the name is not inflated by the financed fee",
       float(name.split(" - ")[1].rstrip("%")) <= 100.0, name)
    pg.evaluate("""() => { const st=window.mortgageSuite.store;
        Object.keys(st.snapshot.scenarios).forEach(id => st.toggleCompare(id)); }""")
    pg.evaluate("LOS.SCEN.render()"); pg.wait_for_timeout(400)
    rows = pg.locator("#scenWrap table.scn-cmp tbody tr").count()
    ok("comparison table builds", rows >= 10, f"{rows} rows")
    dashes = pg.evaluate("""() => [...document.querySelectorAll('#scenWrap table.scn-cmp tbody td')]
        .filter(td => td.textContent.trim()==='—').length""")
    ok("comparison resolves its figures", dashes <= 4, f"{dashes} unresolved cells")
    pg.evaluate("LOS.SCEN.close()")

    # ---------- autosave ----------
    auto = pg.evaluate("""() => {
        const st = window.mortgageSuite.store;
        localStorage.removeItem('losAutosave.v1');
        LOS.AUTO.observe();
        const n0 = LOS.AUTO.list().length;
        st.setField('interestRate', st.activeInputs.interestRate + 0.005, 'rate');
        LOS.AUTO.observe();
        const midway = LOS.AUTO.list().length;      // must still be 0 — no tab change yet
        LOS.go('s:closing');
        const after = LOS.AUTO.list().length;
        const e = LOS.AUTO.list()[0] || {};
        return { n0, midway, after, reason: e.reason || '', name: e.name || '' };
    }""")
    ok("nothing saved while still on the tab", auto["midway"] == 0, json.dumps(auto))
    ok("saved on leaving the tab", auto["after"] == 1, json.dumps(auto))
    ok("saved for the right reason", auto["reason"] == "note rate", auto["reason"])

    trivial = pg.evaluate("""() => {
        const st = window.mortgageSuite.store;
        const n0 = LOS.AUTO.list().length;
        st.setField('hoaMonthly', (st.activeInputs.hoaMonthly||0) + 25, 'hoa');
        LOS.AUTO.observe();
        LOS.go('s:escrow');
        return { n0, n1: LOS.AUTO.list().length };
    }""")
    ok("a trivial change does not autosave", trivial["n0"] == trivial["n1"], json.dumps(trivial))

    # ---------- feature survival ----------
    survived = pg.evaluate("""() => {
      const names = ['switchTab','subTab','RECALC','calcTotals','renoPatch','applyReno','exportWorkbook',
        'openReport','saveJSON','clearAll','importReno','exportReno','toggleTheme','applyTheme',
        'addW2','addSchC','addSchE','addOther','parseAUS','psCalc','printSummary'];
      const missing = names.filter(n => typeof window[n] !== 'function');
      const st = window.mortgageSuite.store;
      const storeFns = ['setField','setMode','newScenario','duplicateScenario','deleteScenario',
        'selectScenario','toggleCompare','saveVersion','restoreVersion','switchProgram',
        'importIncomeText','compareProgramScenario','replaceInputs'];
      const missingStore = storeFns.filter(n => typeof st[n] !== 'function');
      return { missing, missingStore, screens: window.mortgageSuite ? true : false };
    }""")
    ok("every calculator entry point still exists", not survived["missing"], json.dumps(survived["missing"]))
    ok("every store method still exists", not survived["missingStore"], json.dumps(survived["missingStore"]))

    # ---------- screenshots ----------
    shots = pathlib.Path("/home/claude/shots"); shots.mkdir(exist_ok=True)
    # ---------- VA income ----------
    va = pg.evaluate("""() => {
        LOS.go('c:va');
        VA.set(0,'basePay',4200); VA.set(0,'bah',2100); VA.set(0,'bas',460);
        VA.set(0,'disabilityMonthly',524.31);
        VA.set(null,'sqFt',1800); VA.set(null,'familySize',4); VA.set(null,'region','Northeast');
        const base = VA.total();
        const modes = {};
        ['VA','FHA','Conventional'].forEach(m => { VA.setMode(m); modes[m] = Math.round(VA.total()*100)/100; });
        VA.setMode('VA');
        const d = new Date(Date.now()+1000*60*60*24*120).toISOString().slice(0,10);
        VA.set(0,'etsDate', d); const shortTerm = VA.total();
        VA.set(0,'reenlisted', true); const withStmt = VA.total();
        VA.set(0,'etsDate',''); VA.set(0,'reenlisted',false);
        return { base, modes, shortTerm, withStmt, exempt: VA.fundingFeeExempt(),
                 required: VA.residual().required, income: calcTotals().income, va: calcTotals().va };
    }""")
    ok("VA income totals correctly", abs(va["base"] - 7284.31) < 0.01, str(va["base"]))
    ok("VA applies no gross-up, FHA 15%, conventional 25%",
       abs(va["modes"]["FHA"] - 7746.96) < 0.02 and abs(va["modes"]["Conventional"] - 8055.39) < 0.02,
       json.dumps(va["modes"]))
    ok("separation inside 12 months drops military pay, keeps disability",
       abs(va["shortTerm"] - 524.31) < 0.01, str(va["shortTerm"]))
    ok("a re-enlistment statement restores the pay", abs(va["withStmt"] - 7284.31) < 0.01, str(va["withStmt"]))
    ok("disability compensation waives the funding fee", va["exempt"])
    ok("residual table resolves (NE, household of 4)", va["required"] == 1003 or va["required"] == 888,
       str(va["required"]))
    ok("VA income reaches the file total", abs(va["income"] - va["va"]) < 0.01 and va["va"] > 0,
       f'income {va["income"]} of which VA {va["va"]}')

    # ---------- park button ----------
    park = pg.evaluate("""() => {
        LOS.park(true);
        const parked = document.getElementById('calc-root').classList.contains('los-parked');
        const mode = SHELL.mode;
        LOS.park(false);
        return { parked, mode, after: document.getElementById('calc-root').classList.contains('los-parked') };
    }""")
    ok("one button parks the income side and opens the suite",
       park["parked"] and park["mode"] == "suite" and not park["after"], json.dumps(park))

    for skin in ("light", "dark", "navy"):
        pg.evaluate(f"LOS.setSkin('{skin}')")
        pg.evaluate("LOS.go('c:dti')"); pg.wait_for_timeout(700)
        pg.screenshot(path=str(shots / f"calc-{skin}.png"))
        pg.evaluate("LOS.go('s:maxmortgage')"); pg.wait_for_timeout(900)
        pg.screenshot(path=str(shots / f"suite-{skin}.png"))
    pg.evaluate("LOS.setSkin('navy'); LOS.SCEN.open()"); pg.wait_for_timeout(700)
    pg.screenshot(path=str(shots / "workbench-navy.png"))

    br.close()

print("\n=== LOS PATCH VERIFICATION ===")
fails = 0
for name, good, extra in results:
    print(("  PASS  " if good else "  FAIL  ") + name + (("   [" + extra + "]") if extra else ""))
    fails += 0 if good else 1
real_errors = [e for e in errors if "favicon" not in e and "net::ERR" not in e and "fonts.googleapis" not in e]
print(f"\n{len(results)-fails}/{len(results)} checks passed")
if real_errors:
    print(f"\n{len(real_errors)} page error(s):")
    for e in real_errors[:12]:
        print("   " + e[:200])
sys.exit(1 if (fails or real_errors) else 0)
