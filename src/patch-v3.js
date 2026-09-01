/* =====================================================================
   LOAN SUITE — restructure
   Moves Mortgage Rates, Taxes & Escrow and Contract & LE onto the suite
   side, folds Escrow under Closing and Scenarios into Summary, merges the
   self-employment worksheets, adds a Property tab that feeds the rest of
   the file, and prints a draft Loan Estimate and a renovation summary.
   ===================================================================== */
(function(){
"use strict";
var $  = function(id){ return document.getElementById(id); };
var $$ = function(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };
function G(n){ try { return (0, eval)(n); } catch(e){ return undefined; } }
function N(v){ v = parseFloat(v); return isFinite(v) ? v : 0; }
function usd(v,dp){ dp = dp===undefined?2:dp; var n=N(v);
  return (n<0?'\u2212':'')+'$'+Math.abs(n).toLocaleString('en-US',
    {minimumFractionDigits:dp,maximumFractionDigits:dp}); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){
  return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
function suite(){ try { return window.mortgageSuite.store; } catch(e){ return null; } }
function say(t,b,k,ms){ if (window.LOS && LOS.say) LOS.say(t,b,k,ms); }

var V3 = window.LOANSUITE = {};

/* =================================================================== 1
   PROPERTY
   One address for the whole file. Everything else reads from here.
   =================================================================== */
var PK = 'property.v1';
var PROP = V3.PROP = {
  load: function(){
    try { var d = JSON.parse(localStorage.getItem(PK)||'null'); if (d) return d; } catch(e){}
    return { mode:'address', address:'', zip:'', county:'', state:'', beds:3, units:1,
             yearBuilt:'', propType:'SFR', currentValue:0, sqFt:0,
             areaRent:0, fmr:null, hudToken:'', annualTax:0, lastSold:'', lastSoldPrice:0,
             listingStatus:'', apprecPct:3.5, renoCost:0 };
  },
  save: function(){ try { localStorage.setItem(PK, JSON.stringify(PROP.state)); } catch(e){} }
};
PROP.state = PROP.load();

PROP.set = function(k,v){
  var numeric = ['beds','units','currentValue','sqFt','areaRent','annualTax',
                 'lastSoldPrice','apprecPct','renoCost'];
  PROP.state[k] = numeric.indexOf(k) >= 0 ? N(v) : v;
  PROP.save(); PROP.sync(); PROP.render();
};

/* The after-repair value the renovation is aiming at: today's value, plus
   the work, plus the area's appreciation over the months it takes. */
PROP.arv = function(){
  var s = PROP.state;
  var base = N(s.currentValue) + N(s.renoCost);
  var months = 6;
  var appreciation = base * (N(s.apprecPct)/100) * (months/12);
  return { base:base, appreciation:appreciation, arv: base + appreciation,
           value:N(s.currentValue), reno:N(s.renoCost), months:months };
};

/* Push the property into both engines. This is the one place the address
   and the tax figure are entered. */
PROP.sync = function(){
  var s = PROP.state, S = G('S'), st = suite();
  var label = s.mode === 'tbd' ? ('TBD — ' + (s.zip || 'zip not set')) : s.address;
  if (S && S.loan){
    if (label) S.loan.address = label;
    if (N(s.units)) S.loan.units = N(s.units);
    if (N(s.annualTax)) S.loan.taxAnnual = N(s.annualTax);
    if (N(s.currentValue)) S.loan.value = N(s.currentValue);
  }
  if (st){
    try {
      if (N(s.currentValue)) st.setField('asIsValue', N(s.currentValue), 'Property tab');
      var a = PROP.arv();
      if (a.arv) st.setField('afterRepairValue', Math.round(a.arv), 'Property tab');
    } catch(e){}
  }
  if (window.TAXPRO && N(s.annualTax)) TAXPRO.state.annual = N(s.annualTax);
  if (window.RECALC) window.RECALC();
};

/* ------------------------------------------------------- HUD fair market rent
   HUD is the one source on the list with a real public API. It needs a
   free token from huduser.gov, which is stored here and never leaves the
   browser. Everything else on the list blocks cross-origin reads, so the
   links open in a tab instead of pretending to scrape. */
PROP.hudLookup = function(){
  var s = PROP.state;
  if (!s.zip || !/^\d{5}$/.test(s.zip))
    return say('Need a zip code', 'HUD keys its Fair Market Rent data by area, so the five-digit zip has to be filled in.', 'warn');
  if (!s.hudToken)
    return say('Need a HUD token', 'Register free at huduser.gov for an API token and paste it into the field below. It stays in this browser.', 'warn', 8000);
  var btn = $('hudBtn'); if (btn){ btn.disabled = true; btn.textContent = 'Looking up…'; }
  fetch('https://www.huduser.gov/hudapi/public/fmr/data/' + encodeURIComponent(s.zip),
        { headers: { 'Authorization': 'Bearer ' + s.hudToken } })
    .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(j){
      var d = (j && j.data) || {};
      var rents = d.basicdata || d;
      var pick = function(o){
        if (!o) return null;
        var beds = N(s.beds);
        var key = beds <= 0 ? 'Efficiency' : ('One-Bedroom,Two-Bedroom,Three-Bedroom,Four-Bedroom'.split(',')[Math.min(beds,4)-1]);
        return N(o[key]) || null;
      };
      var val = Array.isArray(rents) ? pick(rents[0]) : pick(rents);
      PROP.state.fmr = { value: val, area: d.town_name || d.county_name || d.metro_name || s.zip,
                         year: d.year || '', at: new Date().toISOString() };
      if (val && !N(PROP.state.areaRent)) PROP.state.areaRent = val;
      PROP.save(); PROP.render();
      say('HUD fair market rent', usd(val,0) + ' for ' + N(s.beds) + ' bedroom(s) in ' + PROP.state.fmr.area, 'good');
    })
    .catch(function(e){
      say('HUD lookup failed', e.message + '. If this is a CORS refusal, the token is fine but the '
        + 'browser will not read huduser.gov from a file:// page — host the file, or use the link below.', 'warn', 9000);
    })
    .then(function(){ if (btn){ btn.disabled = false; btn.textContent = 'Look up HUD fair market rent'; } });
};

/* Aggregate lookup: opens each source pre-filled. None of them permit a
   cross-origin read, so the honest version hands you the tabs. */
PROP.lookupLinks = function(){
  var s = PROP.state;
  var q = encodeURIComponent(s.mode === 'tbd' ? s.zip : s.address);
  return [
    ['Zillow', 'https://www.zillow.com/homes/' + q + '_rb/'],
    ['Zillow Home Loans', 'https://www.zillow.com/homeloans/'],
    ['Rentometer', 'https://www.rentometer.com/?address=' + q],
    ['RentHub', 'https://www.renthub.com/search?q=' + q],
    ['AptFinder', 'https://www.aptfinder.org/'],
    ['HUD fair market rents', 'https://www.huduser.gov/portal/datasets/fmr.html'],
    ['Google', 'https://www.google.com/search?q=' + q + '+property+record+assessed+value']
  ];
};
PROP.openAll = function(){
  PROP.lookupLinks().slice(0,4).forEach(function(l, i){
    setTimeout(function(){ window.open(l[1], '_blank', 'noopener'); }, i*220);
  });
  say('Opened four sources', 'Zillow, Rentometer, RentHub and Zillow Home Loans, each pre-filled. '
    + 'None of them allow a page to read them directly, so bring the figures back into the fields.', null, 7000);
};

PROP.render = function(){
  var host = $('propBody'); if (!host) return;
  var s = PROP.state, a = PROP.arv();
  var isTBD = s.mode === 'tbd';
  host.innerHTML =
    '<div class="card"><div class="card-top"><span class="tag">Subject</span>'
    + '<span class="doc-name">The property this whole file is about</span><div class="spacer"></div>'
    + '<button class="btn btn-primary btn-sm" onclick="LOANSUITE.PROP.openAll()">Look up address</button>'
    + '</div><div class="card-body">'
      + '<div class="grid g4">'
        + '<div class="field"><label>Do we have an address?</label>'
          + '<select class="cell-input" onchange="LOANSUITE.PROP.set(\'mode\',this.value)">'
          + '<option value="address"' + (!isTBD?' selected':'') + '>Yes — subject property known</option>'
          + '<option value="tbd"' + (isTBD?' selected':'') + '>No — to be determined, price by zip</option>'
          + '</select></div>'
        + (isTBD
            ? '<div class="field"><label>Zip code</label><input class="cell-input" value="' + esc(s.zip) + '" maxlength="5" onchange="LOANSUITE.PROP.set(\'zip\',this.value)"><div class="fhint">Everything downstream prices off the zip until an address arrives</div></div>'
            : '<div class="field" style="grid-column:span 2"><label>Property address</label><input class="cell-input" value="' + esc(s.address) + '" onchange="LOANSUITE.PROP.set(\'address\',this.value)" placeholder="49 Colonial Dr, Farmingdale, NY 11735"></div>')
        + '<div class="field"><label>Zip</label><input class="cell-input" value="' + esc(s.zip) + '" maxlength="5" onchange="LOANSUITE.PROP.set(\'zip\',this.value)"></div>'
        + '<div class="field"><label>Property type</label><select class="cell-input" onchange="LOANSUITE.PROP.set(\'propType\',this.value)">'
          + ['SFR','Condo','Townhouse','2-4 unit','Manufactured'].map(function(x){
              return '<option'+(x===s.propType?' selected':'')+'>'+x+'</option>'; }).join('') + '</select></div>'
      + '</div>'
      + '<div class="grid g4" style="margin-top:12px">'
        + fnum('Current value ($)','currentValue',s.currentValue)
        + fnum('Year built','yearBuilt',s.yearBuilt,'text')
        + fnum('Units','units',s.units)
        + fnum('Living area (sq ft)','sqFt',s.sqFt)
      + '</div>'
      + '<div class="grid g4" style="margin-top:12px">'
        + fnum('Annual property tax ($)','annualTax',s.annualTax)
        + fnum('Last sold','lastSold',s.lastSold,'date')
        + fnum('Last sold price ($)','lastSoldPrice',s.lastSoldPrice)
        + '<div class="field"><label>Listing status</label><select class="cell-input" onchange="LOANSUITE.PROP.set(\'listingStatus\',this.value)">'
          + ['','Active','Pending','Off market','Sold','For rent'].map(function(x){
              return '<option'+(x===s.listingStatus?' selected':'')+'>'+(x||'—')+'</option>'; }).join('') + '</select></div>'
      + '</div>'
      + '<div class="pullrow">'
        + '<button class="btn btn-primary" id="propPullBtn" onclick="PULL.pullProperty()">Look up online</button>'
        + '<span class="pullnote">Reads what is publicly posted for this address and fills the empty fields. '
        + 'Anything already typed is left alone.</span>'
      + '</div>'
      + provBlock()
    + '</div></div>'

    + '<div class="card"><div class="card-top"><span class="tag">Rent</span>'
      + '<span class="doc-name">Area rent and HUD fair market rent</span></div><div class="card-body">'
      + '<div class="grid g4">'
        + fnum('Bedrooms','beds',s.beds)
        + fnum('Area rent, monthly ($)','areaRent',s.areaRent)
        + '<div class="field"><label>HUD API token</label><input class="cell-input" type="password" value="' + esc(s.hudToken) + '" placeholder="free from huduser.gov" onchange="LOANSUITE.PROP.set(\'hudToken\',this.value)"><div class="fhint">Stored in this browser only</div></div>'
        + '<div class="field"><label>&nbsp;</label><button class="btn btn-primary" id="hudBtn" style="width:100%" onclick="LOANSUITE.PROP.hudLookup()">Look up HUD fair market rent</button></div>'
      + '</div>'
      + (s.fmr ? '<div class="note ok" style="margin-top:12px"><div><b>HUD fair market rent ' + usd(s.fmr.value,0)
          + '</b> for ' + esc(s.fmr.area) + ' ' + esc(s.fmr.year) + '. This is the ceiling HUD publishes for the area, '
          + 'not a market quote — treat it as a floor to sanity-check a lease against.</div></div>' : '')
    + '</div></div>'

    + '<div class="card"><div class="card-top"><span class="tag">Projection</span>'
      + '<span class="doc-name">Possible after-repair value</span><div class="spacer"></div>'
      + '<span class="res">' + usd(a.arv,0) + '</span></div><div class="card-body">'
      + '<div class="grid g3">'
        + fnum('Renovation cost ($)','renoCost',s.renoCost)
        + fnum('Area appreciation (% a year)','apprecPct',s.apprecPct)
        + '<div class="calcbox final"><div class="muted small">Projected after-repair value</div>'
          + '<div class="mnd-big">' + usd(a.arv,0) + '</div>'
          + '<div class="muted small">feeds the suite automatically</div></div>'
      + '</div>'
      + '<table class="tbl" style="margin-top:14px"><tbody>'
        + '<tr><td>Current value</td><td class="num">' + usd(a.value,0) + '</td></tr>'
        + '<tr><td>Plus the work</td><td class="num">' + usd(a.reno,0) + '</td></tr>'
        + '<tr><td>Plus ' + N(s.apprecPct).toFixed(1) + '% a year over ' + a.months + ' months</td><td class="num">' + usd(a.appreciation,0) + '</td></tr>'
        + '<tr class="total"><td><b>Possible after-repair value</b></td><td class="num"><b>' + usd(a.arv,0) + '</b></td></tr>'
      + '</tbody></table>'
      + '<div class="note warn" style="margin-top:12px"><div>This is a projection from an appreciation rate you '
        + 'typed, not an appraisal. The suite will hold the loan to 110% of it on a 203(k) and to 95% on HomeStyle, '
        + 'so an optimistic figure here shows up as a cushion that is not really there.</div></div>'
    + '</div></div>'
    + '<div id="propEscrow"></div>';

  var esc2 = $('propEscrow');
  if (esc2 && window.TAXPRO){
    esc2.innerHTML = '<div id="taxBody"></div>';
    try { TAXPRO.render(); } catch(e){}
  }
};
function provBlock(){
  var p = PROP.state.pull;
  if (!p) return '';
  if (p.empty) return '<div class="note warn" style="margin-top:12px"><div>'
    + 'The last lookup came back with nothing for this address. The fields are yours to fill in.</div></div>';
  var keys = Object.keys(p.found || {});
  if (!keys.length) return '';
  return '<div class="note ok" style="margin-top:12px"><div>'
    + '<b>Pulled ' + keys.length + ' field(s) on ' + new Date(p.at).toLocaleString() + '.</b>'
    + '<div class="provlist">' + keys.map(function(k){
        var v = p.found[k];
        var shown = (typeof v === 'number' && v > 1000) ? usd(v,0) : esc(v);
        return '<span>' + esc(k) + '</span><b>' + shown + '</b><span>' + esc((p.prov||{})[k]||'') + '</span>';
      }).join('') + '</div>'
    + 'Every one of these is editable, and none of it is an appraisal.</div></div>';
}
function fnum(label, key, val, type){
  return '<div class="field"><label>' + label + '</label>'
    + '<input class="cell-input" type="' + (type||'number') + '" value="' + esc(val) + '" '
    + 'onchange="LOANSUITE.PROP.set(\'' + key + '\',this.value)"></div>';
}

/* =================================================================== 2
   PRINTING — a draft Loan Estimate, and a renovation summary
   =================================================================== */
function payload(){
  var st = suite(), S = G('S'), p = PROP.state;
  var o = st ? st.outputs : null, i = st ? st.activeInputs : {};
  var pick = function(paths, d){
    for (var k=0;k<paths.length;k++){
      var parts = paths[k].split('.'), cur = o, ok = true;
      for (var j=0;j<parts.length;j++){ if (!cur || !(parts[j] in cur)){ ok=false; break; } cur = cur[parts[j]]; }
      if (ok && cur != null) return cur;
    }
    return d || 0;
  };
  var T = (typeof window.calcTotals === 'function') ? window.calcTotals() : {income:0,pitia:0,debts:0};
  return {
    borrower: (S && S.b1) || i.borrowerName || '',
    coBorrower: (S && S.b2) || '',
    address: p.mode==='tbd' ? ('TBD — zip ' + (p.zip||'')) : (p.address || (S && S.loan && S.loan.address) || ''),
    program: i.loanProgram || (S && S.loan && S.loan.program) || '',
    reno: !!i.renovation,
    price: N(i.basePurchasePrice) || N(S && S.loan && S.loan.price),
    arv: N(i.afterRepairValue) || PROP.arv().arv,
    asIs: N(i.asIsValue) || N(p.currentValue),
    rate: N(i.interestRate)*100 || N(S && S.loan && S.loan.rate),
    term: N(i.termYears) || N(S && S.loan && S.loan.term) || 30,
    baseLoan: pick(['loan.maximumBaseLoan']),
    ufmip: pick(['loan.ufmip']),
    totalLoan: pick(['loan.totalLoan']),
    renovation: pick(['renovationOut.finalRenovationAmount']),
    hardCosts: N(i.reno && i.reno.baseCost),
    contingency: pick(['renovationOut.contingencyReserve','renovationOut.contingency']),
    softCosts: pick(['renovationOut.supplementalOrigination']),
    pi: pick(['payment.principalAndInterest']),
    mi: N(pick(['payment.monthlyFhaMip'])) + N(pick(['payment.monthlyPmi'])),
    escrow: pick(['escrowOut.escrowMonthlyDeposit']),
    total: pick(['payment.totalMonthlyPayment']),
    closing: pick(['closing.buyerClosingCosts']),
    cash: pick(['cash.cashToClose']),
    income: N(T.income), front: N(T.front), back: N(T.back),
    dateStr: new Date().toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'})
  };
}
function shell(title, sub, body){
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>'
   + '@page{size:letter;margin:0.6in}'
   + 'body{font-family:"Plus Jakarta Sans",-apple-system,Segoe UI,Roboto,sans-serif;color:#12161f;margin:0;font-size:12px}'
   + 'h1{font-size:22px;margin:0 0 2px;letter-spacing:-.02em}h2{font-size:12px;letter-spacing:.12em;text-transform:uppercase;'
   + 'color:#4C56D6;margin:20px 0 7px;border-bottom:2px solid #4C56D6;padding-bottom:4px}'
   + '.sub{color:#5A6379;font-size:11.5px;margin-bottom:14px}'
   + 'table{width:100%;border-collapse:collapse;font-size:12px}'
   + 'td{padding:5px 7px;border-bottom:1px solid #E4E7EF}'
   + 'td.n{text-align:right;font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}'
   + 'tr.t td{border-top:2px solid #12161f;border-bottom:none;font-weight:800;font-size:13.5px;padding-top:8px}'
   + 'tr.s td{background:#F3F5FB}'
   + '.two{display:flex;gap:26px}.two>div{flex:1}'
   + '.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #12161f;padding-bottom:8px}'
   + '.ft{margin-top:22px;padding-top:8px;border-top:1px solid #E4E7EF;color:#8A93A8;font-size:10px}'
   + '.badge{display:inline-block;background:#EEF0FE;color:#4C56D6;padding:3px 9px;border-radius:5px;'
   + 'font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}'
   + '.draft{position:fixed;top:38%;left:12%;font-size:120px;color:rgba(220,60,80,.13);'
   + 'transform:rotate(-24deg);font-weight:800;pointer-events:none}'
   + '</style></head><body>' + body + '</body></html>';
}
function rows(list){
  return list.filter(Boolean).map(function(r){
    return '<tr' + (r[2]==='t'?' class="t"':r[2]==='s'?' class="s"':'') + '><td>' + r[0]
      + '</td><td class="n">' + r[1] + '</td></tr>';
  }).join('');
}
function openPrint(html){
  var w = window.open('', '_blank');
  if (!w) return say('Pop-up blocked','Allow pop-ups for this page to print.','warn');
  w.document.write(html); w.document.close();
  setTimeout(function(){ try { w.print(); } catch(e){} }, 450);
}

V3.printLE = function(){
  var d = payload();
  var body = '<div class="draft">DRAFT</div>'
   + '<div class="hd"><div><h1>Loan Estimate</h1>'
   + '<div class="sub">Draft — not a commitment to lend, and not the official Loan Estimate</div></div>'
   + '<div style="text-align:right"><span class="badge">' + esc(d.program) + (d.reno?' RENOVATION':'') + '</span>'
   + '<div class="sub" style="margin:6px 0 0">Issued ' + d.dateStr + '</div></div></div>'
   + '<div class="two"><div><h2>Applicant</h2><table><tbody>'
   + rows([['Borrower', esc(d.borrower)||'—'], d.coBorrower?['Co-borrower', esc(d.coBorrower)]:null,
           ['Property', esc(d.address)||'—'], ['Purpose','Purchase']])
   + '</tbody></table></div><div><h2>Loan terms</h2><table><tbody>'
   + rows([['Loan amount', usd(d.totalLoan,0)], ['Interest rate', d.rate.toFixed(3)+'%'],
           ['Term', d.term+' years'], ['Product','Fixed rate'],
           ['Monthly principal &amp; interest', usd(d.pi)]])
   + '</tbody></table></div></div>'
   + '<h2>Projected payments</h2><table><tbody>'
   + rows([['Principal &amp; interest', usd(d.pi)], ['Mortgage insurance', usd(d.mi)],
           ['Estimated escrow', usd(d.escrow)], ['Estimated total monthly payment', usd(d.total), 't']])
   + '</tbody></table>'
   + '<h2>Costs at closing</h2><table><tbody>'
   + rows([['Estimated closing costs', usd(d.closing,0)],
           ['Estimated cash to close', usd(d.cash,0), 't']])
   + '</tbody></table>'
   + (d.reno ? '<h2>Renovation</h2><table><tbody>'
       + rows([['Hard costs', usd(d.hardCosts,0)], ['Contingency reserve', usd(d.contingency,0)],
               ['Soft costs and fees', usd(d.softCosts,0)],
               ['Total renovation escrow', usd(d.renovation,0), 't']])
       + '</tbody></table>' : '')
   + '<div class="ft">Generated ' + d.dateStr + '. Figures are estimates from the loan setup on this file and are '
   + 'subject to underwriting, appraisal and final contractor agreements. Compare this with the official Loan '
   + 'Estimate issued by the lender.</div>';
  openPrint(shell('Draft Loan Estimate', '', body));
};

V3.printSummary = function(){
  var d = payload(), p = PROP.state, a = PROP.arv();
  var body = '<div class="hd"><div><h1>Renovation Data Overview</h1>'
   + '<div class="sub">Loan summary and renovation breakdown</div></div>'
   + '<div style="text-align:right"><span class="badge">' + esc(d.program) + (d.reno?' RENOVATION':'') + '</span>'
   + '<div class="sub" style="margin:6px 0 0">' + d.dateStr + '</div></div></div>'
   + '<div class="two"><div><h2>Property</h2><table><tbody>'
   + rows([['Address', esc(d.address)||'—'], ['Property type', esc(p.propType)],
           ['Year built', esc(p.yearBuilt)||'—'], ['Units', String(N(p.units)||1)],
           ['Current value', usd(d.asIs,0)], ['Annual taxes', usd(p.annualTax,0)]])
   + '</tbody></table></div><div><h2>Borrower</h2><table><tbody>'
   + rows([['Primary borrower', esc(d.borrower)||'—'], d.coBorrower?['Co-borrower', esc(d.coBorrower)]:null,
           ['Qualifying income', usd(d.income)], ['Front ratio', (d.front*100).toFixed(2)+'%'],
           ['Back ratio', (d.back*100).toFixed(2)+'%']])
   + '</tbody></table></div></div>'
   + '<h2>Renovation escrow</h2><table><tbody>'
   + rows([['Hard costs', usd(d.hardCosts,0)], ['Contingency reserve', usd(d.contingency,0)],
           ['Soft costs, fees and permits', usd(d.softCosts,0)],
           ['Total renovation escrow', usd(d.renovation,0), 't']])
   + '</tbody></table>'
   + '<h2>Value</h2><table><tbody>'
   + rows([['As-is value', usd(d.asIs,0)], ['Plus the work', usd(a.reno,0)],
           ['Plus ' + N(p.apprecPct).toFixed(1) + '% appreciation over ' + a.months + ' months', usd(a.appreciation,0)],
           ['After-repair value', usd(d.arv,0), 't']])
   + '</tbody></table>'
   + '<h2>Loan</h2><table><tbody>'
   + rows([['Purchase price', usd(d.price,0)], ['Base loan amount', usd(d.baseLoan,0)],
           ['Upfront mortgage insurance', usd(d.ufmip,0)], ['Total loan', usd(d.totalLoan,0), 's'],
           ['Interest rate', d.rate.toFixed(3)+'%'], ['Term', d.term + ' years']])
   + '</tbody></table>'
   + '<h2>Monthly payment</h2><table><tbody>'
   + rows([['Principal &amp; interest', usd(d.pi)], ['Mortgage insurance', usd(d.mi)],
           ['Taxes, insurance and escrow', usd(d.escrow)],
           ['Total monthly payment', usd(d.total), 't']])
   + '</tbody></table>'
   + '<h2>Cash to close</h2><table><tbody>'
   + rows([['Estimated closing costs', usd(d.closing,0)], ['Cash to close', usd(d.cash,0), 't']])
   + '</tbody></table>'
   + '<div class="ft">Generated ' + d.dateStr + '. All figures are estimates and subject to final loan approval, '
   + 'appraisal and contractor agreements.</div>';
  openPrint(shell('Renovation Data Overview', '', body));
};

/* =================================================================== 3
   RESTRUCTURE
   =================================================================== */
/* Panels of mine that belong on the suite side now. */
var MOVED = [
  ['rates',    'Mortgage Rates'],
  ['taxes',    'Taxes &amp; Escrow'],
  ['docparse', 'Contract &amp; LE'],
  ['property', 'Property']
];
/* Suite screens, with the two consolidations asked for. */
var SUITE_SCREENS = [
  ['quote','Quote'], ['setup','Setup'], ['renovation','Renovation'],
  ['maxmortgage','Max Mortgage'], ['closing','Closing'], ['qualify','Qualify'],
  ['rental','Rental'], ['advanced','Rule Tables'], ['summary','Summary']
];
/* Folded away and reached from the tab they now live under. */
var FOLDED = { escrow:'closing', scenarios:'summary' };

/* Calculator tabs that merge. */
var MERGES = {
  selfemp: { label:'Self-Employment', hides:['schc','corp'], before:'sche',
             subs:[['schc','Schedule C'],['corp','1065 / 1120-S / 1120']] },
  other:   { label:'Other Income', hides:['assets'],
             subs:[['other','Other income'],['assets','Assets']] }
};

function buildPropertyPanel(){
  if ($('panel-property')) return true;
  var anchor = $('panel-summary'); if (!anchor || !anchor.parentNode) return false;
  var panel = document.createElement('section');
  panel.className = 'panel'; panel.id = 'panel-property';
  panel.innerHTML = '<div class="section-head"><div>'
    + '<h2><svg class="icon icon-lg" style="color:var(--sky)"><use href="#i-home"/></svg>Property</h2>'
    + '<p>One address for the whole file. The value, the taxes and the projected after-repair value entered '
    + 'here feed the loan setup, the renovation suite and the escrow analysis.</p></div></div>'
    + '<div id="propBody"></div>';
  anchor.parentNode.insertBefore(panel, anchor);
  return true;
}

/* The suite tab strip. Built in the suite's own chrome so the design
   language matches the calculator's tab bar rather than inventing a
   third one. */
function buildSuiteTabs(){
  var sr = $('suite-root'); if (!sr) return false;
  if ($('suiteTabs')) return true;
  var cm = sr.querySelector('.cols-main'); if (!cm) return false;
  var bar = document.createElement('nav');
  bar.id = 'suiteTabs'; bar.className = 'tabbar no-print';
  bar.innerHTML = '<div class="wrap tabbar-inner">'
    + SUITE_SCREENS.map(function(s){
        return '<button class="tab" data-suite="'+s[0]+'"><span>'+s[1]+'</span></button>';
      }).join('')
    + MOVED.map(function(m){
        return '<button class="tab" data-moved="'+m[0]+'"><span>'+m[1]+'</span></button>';
      }).join('')
    + '</div>';
  cm.parentNode.insertBefore(bar, cm);

  /* somewhere to host the moved panels inside the suite */
  var host = document.createElement('div');
  host.id = 'suiteMoved'; host.style.display = 'none';
  cm.parentNode.insertBefore(host, cm.nextSibling);

  bar.addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.suite) V3.goSuite(b.dataset.suite);
    if (b.dataset.moved) V3.goMoved(b.dataset.moved);
  });
  return true;
}

V3.goSuite = function(id){
  var st = suite(); if (!st) return;
  $('suiteMoved').style.display = 'none';
  var cm = $('suite-root').querySelector('.cols-main');
  if (cm) cm.style.display = '';
  try { st.setMode(id); } catch(e){}
  paintSuiteTabs(id, null);
};
V3.goMoved = function(id){
  var host = $('suiteMoved'); if (!host) return;
  var panel = $('panel-' + id);
  if (panel && panel.parentNode !== host) host.appendChild(panel);
  $$('#suiteMoved .panel').forEach(function(p){ p.classList.toggle('active', p.id === 'panel-'+id); });
  host.style.display = '';
  var cm = $('suite-root').querySelector('.cols-main');
  if (cm) cm.style.display = 'none';
  if (id === 'property') PROP.render();
  if (id === 'rates' && window.RATES) RATES.render();
  if (id === 'taxes' && window.TAXPRO) TAXPRO.render();
  if (id === 'docparse' && window.DOCP) DOCP.render();
  paintSuiteTabs(null, id);
};
function paintSuiteTabs(suiteId, movedId){
  $$('#suiteTabs .tab').forEach(function(b){
    b.classList.toggle('active',
      (suiteId && b.dataset.suite === suiteId) || (movedId && b.dataset.moved === movedId));
  });
}

/* Take the moved tabs off the calculator bar, and merge the worksheets. */
function reshapeCalcTabs(){
  var bar = $('tabbar'); if (!bar) return false;
  MOVED.forEach(function(m){
    var b = bar.querySelector('[data-tab="' + m[0] + '"]');
    if (b) b.remove();
  });
  Object.keys(MERGES).forEach(function(key){
    var cfg = MERGES[key];
    cfg.hides.forEach(function(h){
      var b = bar.querySelector('[data-tab="' + h + '"]');
      if (b) b.remove();
    });
  });
  if (!bar.querySelector('[data-tab="selfemp"]')){
    var btn = document.createElement('button');
    btn.className = 'tab'; btn.setAttribute('data-tab','selfemp');
    btn.setAttribute('onclick', "switchTab('selfemp')");
    btn.innerHTML = '<svg class="icon"><use href="#i-briefcase"/></svg><span>Self-Employment</span>';
    var before = bar.querySelector('[data-tab="sche"]');
    if (before) bar.insertBefore(btn, before); else bar.appendChild(btn);
  }
  return true;
}

/* switchTab has to understand the merged tabs. */
function wrapSwitch(){
  if (typeof window.switchTab !== 'function' || window.switchTab.__v3) return false;
  var inner = window.switchTab;
  var w = function(t){
    if (t === 'selfemp'){
      showPanels(['schc','corp'], 'selfemp');
      renderStrip('selfemp', MERGES.selfemp.subs);
      return;
    }
    if (t === 'other'){
      var r = inner.call(this, 'other');
      showPanels(['other','assets'], 'other');
      renderStrip('other', MERGES.other.subs);
      return r;
    }
    return inner.apply(this, arguments);
  };
  w.__v3 = true; window.switchTab = w;
  return true;
}
function showPanels(ids, tabId){
  $$('#calc-root .panel').forEach(function(p){
    p.classList.toggle('active', ids.indexOf(p.id.replace('panel-','')) >= 0);
  });
  $$('#tabbar .tab').forEach(function(b){ b.classList.toggle('active', b.dataset.tab === tabId); });
}
/* The subsection buttons use the same strip the rest of the file uses, so
   every tab in both halves has one control language. */
function renderStrip(tabId, subs){
  var first = $('panel-' + subs[0][0]); if (!first) return;
  var strip = $('v3strip-' + tabId);
  if (!strip){
    strip = document.createElement('div');
    strip.id = 'v3strip-' + tabId; strip.className = 'los-strip no-print';
    first.parentNode.insertBefore(strip, first);
    strip.addEventListener('click', function(e){
      var b = e.target.closest('button'); if (!b) return;
      V3.sub(tabId, b.dataset.sub, subs);
    });
  }
  $$('.los-strip').forEach(function(el){ if (el !== strip) el.remove(); });
  var cur = V3._sub && V3._sub[tabId] ? V3._sub[tabId] : 'all';
  strip.innerHTML = '<button type="button" class="st' + (cur==='all'?' on':'') + '" data-sub="all">All sections</button>'
    + subs.map(function(s){
        return '<button type="button" class="st' + (cur===s[0]?' on':'') + '" data-sub="'+s[0]+'">'+s[1]+'</button>';
      }).join('');
  strip.style.display = '';
  V3.sub(tabId, cur, subs, true);
}
V3._sub = {};
V3.sub = function(tabId, sub, subs, quiet){
  V3._sub[tabId] = sub;
  subs.forEach(function(s){
    var p = $('panel-' + s[0]);
    if (p) p.classList.toggle('los-hidden', sub !== 'all' && sub !== s[0]);
  });
  if (!quiet) renderStrip(tabId, subs);
};

/* Rename the mode toggle. */
function rename(){
  $$('#modeseg button, .modeseg button, #shellbar button').forEach(function(b){
    if (/Renovation Suite/i.test(b.textContent) && !/→/.test(b.textContent))
      b.innerHTML = b.innerHTML.replace(/Renovation Suite/i, 'Loan Suite');
  });
  $$('#losBar .lbtn').forEach(function(b){
    if (/Renovation Suite/i.test(b.textContent))
      b.innerHTML = b.innerHTML.replace(/Renovation Suite/i, 'Loan Suite');
  });
  var h1 = document.querySelector('#suite-root .topbar h1');
  if (h1 && /Renovation Suite/i.test(h1.textContent))
    h1.textContent = h1.textContent.replace(/Mortgage Renovation Suite/i, 'Loan Suite');
}

/* Print buttons, in the suite toolbar so they sit with its own controls. */
function buildPrint(){
  if ($('v3print')) return;
  var tb = document.querySelector('#suite-root .toolbar');
  if (!tb) return;
  var wrap = document.createElement('span');
  wrap.id = 'v3print'; wrap.style.display = 'inline-flex'; wrap.style.gap = '6px';
  wrap.innerHTML = '<button class="btn ghost" onclick="LOANSUITE.printLE()">Draft LE</button>'
    + '<button class="btn ghost" onclick="LOANSUITE.printSummary()">Print summary</button>';
  tb.appendChild(wrap);
}

var tries = 0;
var poll = setInterval(function(){
  var a = buildPropertyPanel();
  var b = buildSuiteTabs();
  reshapeCalcTabs(); wrapSwitch(); rename(); buildPrint();
  if (a && b){
    PROP.render();
    var st = suite();
    if (st) paintSuiteTabs(st.snapshot.mode, null);
    clearInterval(poll);
  } else if (++tries > 250) clearInterval(poll);
}, 60);

/* Keep the strip and the tab state honest through re-renders. */
setInterval(function(){
  try {
    rename(); buildPrint();
    var st = suite();
    if (st && $('suiteMoved') && $('suiteMoved').style.display === 'none')
      paintSuiteTabs(st.snapshot.mode, null);
  } catch(e){}
}, 1200);
})();
