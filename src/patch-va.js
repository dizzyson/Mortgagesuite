/* =====================================================================
   VA INCOME
   A tab of its own, because VA income is not the same shape as W-2
   income: allowances are untaxed, disability compensation is permanent
   and untaxed, and VA is the only agency that tests residual income
   rather than stopping at a ratio.

   Additive. S gains an `va` branch; calcTotals is wrapped so the result
   flows into the header, the ratios and everything downstream without
   the engine itself being edited.
   ===================================================================== */
(function(){
"use strict";
var $ = function(s){ return document.getElementById(s); };
function G(n){ try { return (0, eval)(n); } catch(e){ return undefined; } }
function N(v){ v = parseFloat(v); return isFinite(v) ? v : 0; }
function usd(v, dp){
  dp = dp === undefined ? 2 : dp;
  return '$' + Number(N(v)).toLocaleString('en-US',{minimumFractionDigits:dp, maximumFractionDigits:dp});
}
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
  return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }

var VA = window.VA = {};

/* -------------------------------------------------------------- rules
   Editable, dated and sourced, the same way the renovation suite holds
   its rule tables. The residual figures are the VA Lenders Handbook
   tables; confirm them each time the Handbook is republished. */
VA.RULES = {
  source: 'VA Lenders Handbook M26-7, Chapter 4 — Income and Residual Income',
  lastReviewed: '07/2026',
  dtiBenchmark: 0.41,
  residualCushionWhenOverBenchmark: 1.20,   // residual must beat the table by 20%
  maintenancePerSqFt: 0.14,                 // maintenance and utilities
  grossUpFha: 0.15,
  grossUpConventional: 0.25,
  grossUpVa: 0,                             // VA does not require a gross-up
  continuanceMonths: 12,
  // family size 1..5, then a per-head addition
  residual: {
    high: {  // loan amounts of $80,000 and above
      Northeast:[450,738,889,1003,1039], Midwest:[441,738,889,1003,1039],
      South:[441,738,889,1003,1039],     West:[491,823,990,1117,1158], add:80
    },
    low: {   // loan amounts below $80,000
      Northeast:[390,654,788,888,921], Midwest:[382,641,772,868,902],
      South:[382,641,772,868,902],     West:[425,713,859,967,1004], add:75
    }
  }
};
VA.REGION_STATES = {
  Northeast:'CT ME MA NH NJ NY PA RI VT',
  Midwest:'IL IN IA KS MI MN MO NE ND OH SD WI',
  South:'AL AR DE DC FL GA KY LA MD MS NC OK PR SC TN TX VA WV',
  West:'AK AZ CA CO HI ID MT NV NM OR UT WA WY'
};
VA.residualRequired = function(region, size, loanAmount){
  var band = N(loanAmount) >= 80000 ? VA.RULES.residual.high : VA.RULES.residual.low;
  var row = band[region] || band.Northeast;
  var n = Math.max(1, Math.round(N(size) || 1));
  if (n <= 5) return row[n-1];
  return row[4] + (n - 5) * band.add;
};

/* -------------------------------------------------------------- state */
function blankRecord(){
  return {
    id: 'va' + Math.random().toString(36).slice(2,8),
    on: true, b: 1,
    branch: '', grade: '', status: 'Active duty',
    basePay: 0, bah: 0, bas: 0, clothing: 0, special: 0, other: 0,
    disabilityMonthly: 0, disabilityPct: 0,
    etsDate: '', reenlisted: false,
    note: ''
  };
}
function ensureState(){
  var S = G('S'); if (!S) return null;
  if (!S.va) {
    S.va = {
      records: [ blankRecord() ],
      residual: { region:'Northeast', familySize:1, sqFt:0, federalTax:0, stateTax:0, fica:0 },
      grossUpMode: 'VA'   // VA | FHA | Conventional — drives the guideline panel too
    };
  }
  return S.va;
}

/* ---------------------------------------------------------- the maths
   Untaxed items are BAH, BAS, clothing allowance and VA disability
   compensation. Base pay and most special pays are taxable. */
VA.calcRecord = function(r){
  var taxable   = N(r.basePay) + N(r.special) + N(r.other);
  var untaxed   = N(r.bah) + N(r.bas) + N(r.clothing) + N(r.disabilityMonthly);
  var va = ensureState();
  var mode = (va && va.grossUpMode) || 'VA';
  var rate = mode === 'FHA' ? VA.RULES.grossUpFha
           : mode === 'Conventional' ? VA.RULES.grossUpConventional
           : VA.RULES.grossUpVa;
  var grossUp = untaxed * rate;

  /* Continuance. If separation falls inside the next twelve months the
     military pay cannot be counted without a re-enlistment statement;
     disability compensation is unaffected because it does not end with
     service. */
  var short = false, monthsLeft = null;
  if (r.etsDate){
    var d = new Date(r.etsDate + 'T00:00:00');
    if (!isNaN(d)){
      monthsLeft = (d - new Date()) / (1000*60*60*24*30.4375);
      short = monthsLeft < VA.RULES.continuanceMonths;
    }
  }
  var militaryCounted = (short && !r.reenlisted) ? 0
                      : taxable + N(r.bah) + N(r.bas) + N(r.clothing);
  var militaryGrossUp = (short && !r.reenlisted) ? 0
                      : (N(r.bah) + N(r.bas) + N(r.clothing)) * rate;
  var total = militaryCounted + militaryGrossUp + N(r.disabilityMonthly) + N(r.disabilityMonthly) * rate;

  return {
    taxable: taxable, untaxed: untaxed, grossUp: grossUp,
    monthsLeft: monthsLeft, short: short,
    excluded: (short && !r.reenlisted) ? taxable + N(r.bah) + N(r.bas) + N(r.clothing) : 0,
    total: total, mode: mode, rate: rate
  };
};
VA.total = function(){
  var va = ensureState(); if (!va) return 0;
  return va.records.filter(function(r){ return r.on !== false; })
    .reduce(function(s,r){ return s + VA.calcRecord(r).total; }, 0);
};
VA.totalFor = function(b){
  var va = ensureState(); if (!va) return 0;
  return va.records.filter(function(r){ return r.on !== false && (r.b||1) === b; })
    .reduce(function(s,r){ return s + VA.calcRecord(r).total; }, 0);
};
/* Funding fee is waived where the veteran receives compensation for a
   service-connected disability. */
VA.fundingFeeExempt = function(){
  var va = ensureState(); if (!va) return false;
  return va.records.some(function(r){ return r.on !== false && N(r.disabilityMonthly) > 0; });
};

VA.residual = function(){
  var S = G('S'), va = ensureState();
  if (!S || !va) return null;
  var T = (typeof window.calcTotals === 'function') ? window.calcTotals() : {income:0,pitia:0,debts:0};
  var res = va.residual;
  var maint = N(res.sqFt) * VA.RULES.maintenancePerSqFt;
  var deductions = N(res.federalTax) + N(res.stateTax) + N(res.fica)
                 + N(T.pitia) + N(T.debts) + maint;
  var actual = N(T.income) - deductions;
  var loanAmt = N(S.loan && (S.loan.base || S.loan.loan)) || 0;
  var required = VA.residualRequired(res.region, res.familySize, loanAmt);
  var overBenchmark = T.back > VA.RULES.dtiBenchmark;
  var effectiveRequired = overBenchmark
    ? required * VA.RULES.residualCushionWhenOverBenchmark : required;
  return {
    income:N(T.income), pitia:N(T.pitia), debts:N(T.debts), maint:maint,
    tax:N(res.federalTax)+N(res.stateTax)+N(res.fica),
    deductions:deductions, actual:actual, required:required,
    effectiveRequired:effectiveRequired, overBenchmark:overBenchmark,
    back:T.back, pass: actual >= effectiveRequired, loanAmt:loanAmt
  };
};

/* ------------------------------------------------------------- render */
function fld(label, path, ix, opts){
  opts = opts || {};
  var va = ensureState();
  var v = ix === null ? va.residual[path] : va.records[ix][path];
  if (opts.type === 'text' || opts.type === 'date'){
    return '<div class="field"><label>' + label + '</label>'
      + '<input class="cell-input" type="' + (opts.type) + '" value="' + esc(v || '') + '"'
      + ' oninput="VA.set(' + ix + ',\'' + path + '\',this.value)"></div>';
  }
  if (opts.options){
    return '<div class="field"><label>' + label + '</label><select class="cell-input"'
      + ' onchange="VA.set(' + ix + ',\'' + path + '\',this.value)">'
      + opts.options.map(function(o){
          return '<option' + (String(o) === String(v) ? ' selected' : '') + '>' + o + '</option>'; }).join('')
      + '</select></div>';
  }
  return '<div class="field"><label>' + label + '</label>'
    + '<input class="cell-input" type="number" step="' + (opts.step || '0.01') + '" value="' + N(v) + '"'
    + ' oninput="VA.set(' + ix + ',\'' + path + '\',this.value)">'
    + (opts.hint ? '<div class="fhint">' + opts.hint + '</div>' : '') + '</div>';
}

VA.set = function(ix, path, value){
  var va = ensureState(); if (!va) return;
  var target = ix === null ? va.residual : va.records[ix];
  var numeric = ['basePay','bah','bas','clothing','special','other','disabilityMonthly',
                 'disabilityPct','familySize','sqFt','federalTax','stateTax','fica'];
  target[path] = numeric.indexOf(path) >= 0 ? N(value) : value;
  if (typeof window.RECALC === 'function') window.RECALC();
  VA.render();
};
VA.toggle = function(ix){ var va = ensureState(); va.records[ix].on = !va.records[ix].on;
  if (window.RECALC) window.RECALC(); VA.render(); };
VA.add = function(){ ensureState().records.push(blankRecord()); if (window.RECALC) window.RECALC(); VA.render(); };
VA.remove = function(ix){
  var va = ensureState();
  if (va.records.length === 1) { va.records[0] = blankRecord(); }
  else va.records.splice(ix,1);
  if (window.RECALC) window.RECALC(); VA.render();
};
VA.setMode = function(m){ ensureState().grossUpMode = m; if (window.RECALC) window.RECALC(); VA.render(); };

function recordCard(r, ix){
  var c = VA.calcRecord(r);
  var warn = '';
  if (c.short && !r.reenlisted){
    warn = '<div class="note bad" style="margin:10px 0">'
      + '<b>Service ends within twelve months of closing.</b> '
      + 'Military pay and allowances are held out of qualifying income until a statement of '
      + 're-enlistment or of continued employment is in the file. '
      + Math.max(0, Math.round(c.monthsLeft)) + ' month(s) remain on the current term. '
      + 'Disability compensation is unaffected because it does not end with service.</div>';
  } else if (c.short && r.reenlisted){
    warn = '<div class="note ok" style="margin:10px 0">'
      + '<b>Re-enlistment documented.</b> Pay counts despite the separation date inside twelve months.</div>';
  }
  return '<div class="card" data-va-rec="' + ix + '">'
    + '<div class="card-top"><span class="tag">VA #' + (ix+1) + '</span>'
      + '<span class="doc-name">' + (esc(r.branch) || 'Service member') + (r.grade ? ' &mdash; ' + esc(r.grade) : '') + '</span>'
      + '<div class="spacer"></div>'
      + '<label class="sw" style="gap:7px"><input type="checkbox" ' + (r.on !== false ? 'checked' : '')
        + ' onchange="VA.toggle(' + ix + ')"><span class="muted small">Used</span></label>'
      + '<button class="btn btn-light btn-sm" onclick="VA.remove(' + ix + ')" title="Remove">&times;</button></div>'
    + '<div class="card-body">'
      + '<div class="grid g4">'
        + fld('Branch','branch',ix,{type:'text'})
        + fld('Pay grade','grade',ix,{type:'text'})
        + fld('Status','status',ix,{options:['Active duty','Reserve / National Guard','Veteran — separated','Retired']})
        + '<div class="field"><label>Borrower</label><select class="cell-input" onchange="VA.set(' + ix + ',\'b\',parseInt(this.value,10))">'
          + '<option value="1"' + ((r.b||1)===1?' selected':'') + '>B1 — Borrower 1</option>'
          + '<option value="2"' + ((r.b||1)===2?' selected':'') + '>B2 — Borrower 2</option></select></div>'
      + '</div>'
      + '<div class="subhead" style="margin-top:14px">Taxable pay</div>'
      + '<div class="grid g3">'
        + fld('Base pay ($/mo)','basePay',ix,{hint:'From the Leave &amp; Earnings Statement, entitlements section'})
        + fld('Special / hazard / flight pay ($/mo)','special',ix,{hint:'Counted where a two-year history and continuance are shown'})
        + fld('Other taxable pay ($/mo)','other',ix)
      + '</div>'
      + '<div class="subhead" style="margin-top:14px">Untaxed allowances</div>'
      + '<div class="grid g3">'
        + fld('BAH — housing ($/mo)','bah',ix,{hint:'Untaxed. Continues only while in service'})
        + fld('BAS — subsistence ($/mo)','bas',ix,{hint:'Untaxed'})
        + fld('Clothing allowance ($/mo)','clothing',ix,{hint:'Annual figure divided by twelve'})
      + '</div>'
      + '<div class="subhead" style="margin-top:14px">Service-connected disability</div>'
      + '<div class="grid g3">'
        + fld('Compensation ($/mo)','disabilityMonthly',ix,{hint:'Untaxed and permanent. Also waives the funding fee'})
        + fld('Rating (%)','disabilityPct',ix,{step:'1'})
        + fld('ETS / EAS / separation date','etsDate',ix,{type:'date'})
      + '</div>'
      + '<label class="sw" style="margin-top:10px;gap:8px"><input type="checkbox" ' + (r.reenlisted ? 'checked' : '')
        + ' onchange="VA.set(' + ix + ',\'reenlisted\',this.checked)">'
        + '<span>Re-enlistment or continued-employment statement is in the file</span></label>'
      + warn
      + '<div class="grid g4" style="margin-top:12px">'
        + kpi('Taxable', usd(c.taxable))
        + kpi('Untaxed allowances', usd(c.untaxed))
        + kpi('Gross-up applied', usd(c.grossUp) + '  <span class="muted small">' + (c.rate*100).toFixed(0) + '% · ' + c.mode + '</span>')
        + kpi('Counted for this record', usd(c.total), true)
      + '</div>'
    + '</div></div>';
}
function kpi(label, value, strong){
  return '<div class="calcbox' + (strong ? ' final' : '') + '">'
    + '<div class="muted small">' + label + '</div>'
    + '<div style="font-size:19px;font-weight:800;font-family:var(--font-num);letter-spacing:-.02em">' + value + '</div></div>';
}

function residualCard(){
  var va = ensureState(), R = VA.residual();
  if (!R) return '';
  var reg = va.residual.region;
  return '<div class="card" id="vaResidual"><div class="card-top"><span class="tag">Residual</span>'
    + '<span class="doc-name">Residual income &mdash; the test VA applies instead of stopping at a ratio</span>'
    + '<div class="spacer"></div>'
    + '<span class="' + (R.pass ? 'pill ok' : 'pill bad') + '">' + (R.pass ? 'Passes' : 'Short by ' + usd(R.effectiveRequired - R.actual)) + '</span></div>'
    + '<div class="card-body">'
      + '<div class="grid g4">'
        + '<div class="field"><label>Region</label><select class="cell-input" onchange="VA.set(null,\'region\',this.value)">'
          + ['Northeast','Midwest','South','West'].map(function(x){
              return '<option' + (x===reg?' selected':'') + '>' + x + '</option>'; }).join('')
          + '</select><div class="fhint">' + VA.REGION_STATES[reg] + '</div></div>'
        + fld('Family size','familySize',null,{step:'1',hint:'Borrowers plus dependants'})
        + fld('Living area (sq ft)','sqFt',null,{step:'1',hint:'Maintenance and utilities at $' + VA.RULES.maintenancePerSqFt.toFixed(2) + ' per sq ft'})
        + '<div class="calcbox"><div class="muted small">Table figure</div>'
          + '<div style="font-size:19px;font-weight:800;font-family:var(--font-num)">' + usd(R.required,0) + '</div>'
          + '<div class="muted small">' + reg + ' · ' + (va.residual.familySize||1) + ' in household · loan '
          + (R.loanAmt >= 80000 ? '$80,000 and above' : 'below $80,000') + '</div></div>'
      + '</div>'
      + '<div class="subhead" style="margin-top:14px">Monthly deductions from gross income</div>'
      + '<div class="grid g3">'
        + fld('Federal income tax','federalTax',null,{hint:'Withheld, from the LES or pay stub'})
        + fld('State income tax','stateTax',null)
        + fld('Social security and Medicare','fica',null)
      + '</div>'
      + '<table class="tbl" style="margin-top:14px"><tbody>'
        + row('Gross monthly income — every source on this file', usd(R.income))
        + row('Less income taxes and FICA', '−' + usd(R.tax))
        + row('Less proposed housing payment (PITIA)', '−' + usd(R.pitia))
        + row('Less other monthly obligations', '−' + usd(R.debts))
        + row('Less maintenance and utilities', '−' + usd(R.maint))
        + row('<b>Residual income available</b>', '<b>' + usd(R.actual) + '</b>', true)
        + row('Required for this region and household', usd(R.required,0))
        + (R.overBenchmark
            ? row('Back-end ratio is ' + (R.back*100).toFixed(2) + '%, above the '
                + (VA.RULES.dtiBenchmark*100) + '% benchmark, so the requirement rises 20%',
                usd(R.effectiveRequired,0))
            : '')
      + '</tbody></table>'
      + '<div class="note ' + (R.pass ? 'ok' : 'bad') + '" style="margin-top:12px">'
        + (R.pass
            ? '<b>Residual income is satisfied.</b> ' + usd(R.actual) + ' available against '
              + usd(R.effectiveRequired,0) + ' required'
              + (R.overBenchmark ? ', including the 20% uplift for exceeding the ratio benchmark.' : '.')
            : '<b>Residual income falls short by ' + usd(R.effectiveRequired - R.actual) + '.</b> '
              + 'VA will not treat the ratio alone as the answer — either the payment, the debts or the '
              + 'household figures have to move.')
      + '</div>'
    + '</div></div>';
}
function row(l, v, strong){
  return '<tr' + (strong ? ' class="total"' : '') + '><td>' + l + '</td><td class="num" style="text-align:right">' + v + '</td></tr>';
}

/* ------------------------------------------------- guideline comparison */
var GUIDES = [
  ['Military base pay',
   'Counted from the Leave &amp; Earnings Statement. Must be likely to continue twelve months past closing.',
   'Counted as effective income with a two-year history and continuance for three years.',
   'Counted as stable monthly income with a two-year history.'],
  ['BAH and BAS',
   'Counted in full and untaxed. VA does not require a gross-up, because the residual income test already works from net figures.',
   'Counted, and may be grossed up 15% where the borrower is not required to file.',
   'Counted, and may be grossed up 25%.'],
  ['Service-connected disability compensation',
   'Counted in full, untaxed and permanent. No continuance documentation is needed. Also waives the funding fee.',
   'Counted with evidence of the award and its continuance.',
   'Counted with the award letter; continuance of three years must be documented.'],
  ['Non-taxable gross-up',
   'Not applied by rule. The residual test measures what is actually left each month.',
   '15% of the untaxed amount.',
   '25% of the untaxed amount.'],
  ['Separation inside twelve months',
   'Pay is excluded unless a re-enlistment statement or evidence of continued civilian employment is in the file.',
   'Continuance of three years must be documented for the income to be effective.',
   'The lender must document a likelihood of continuance.'],
  ['Ratio benchmark',
   '41% back-end guideline, but it is a benchmark rather than a cap — exceeding it is allowed where residual income beats the table by 20%.',
   '31% / 43% manual, up to 40% / 56.9% with compensating factors and an AUS approval.',
   '50% back-end through DU and LPA.'],
  ['Residual income',
   'Required. Regional table by household size and loan band, less taxes, housing, debts and maintenance at $0.14 per square foot.',
   'Not required, though it appears among the compensating factors for a manual underwrite.',
   'Not required.']
];
function guidelineCard(){
  var mode = ensureState().grossUpMode;
  var col = mode === 'VA' ? 1 : mode === 'FHA' ? 2 : 3;
  return '<div class="card" id="vaGuides"><div class="card-top"><span class="tag">Guidelines</span>'
    + '<span class="doc-name">How each agency treats the same income</span>'
    + '<div class="spacer"></div>'
    + '<div class="vaseg">'
      + ['VA','FHA','Conventional'].map(function(m){
          return '<button class="' + (m === mode ? 'on' : '') + '" onclick="VA.setMode(\'' + m + '\')">' + m + '</button>';
        }).join('')
    + '</div></div>'
    + '<div class="card-body">'
      + '<p class="muted small" style="margin:0 0 12px">Switching this changes the gross-up actually applied above, '
        + 'not just the reading — so you can see what the same file is worth under each set of rules.</p>'
      + GUIDES.map(function(g){
          return '<div class="vaguide">'
            + '<div class="vaguide-t">' + g[0] + '</div>'
            + '<div class="vaguide-b">' + g[col] + '</div></div>';
        }).join('')
      + '<div class="muted small" style="margin-top:14px;padding-top:10px;border-top:1px dashed var(--line)">'
        + VA.RULES.source + ' · last reviewed ' + VA.RULES.lastReviewed
        + '. Residual figures and the maintenance rate are editable in <code>VA.RULES</code>; '
        + 'confirm them against the current Handbook each time it is republished.</div>'
    + '</div></div>';
}

VA.render = function(){
  var host = $('vaBody'); if (!host) return;
  var va = ensureState(); if (!va) return;
  var total = VA.total();
  host.innerHTML =
      '<div class="card"><div class="card-top"><span class="tag">Total</span>'
      + '<span class="doc-name">VA qualifying income carried into the file</span>'
      + '<div class="spacer"></div>'
      + '<span class="muted small">' + (VA.fundingFeeExempt()
          ? 'Funding fee waived — disability compensation is being received'
          : 'Funding fee applies') + '</span></div>'
      + '<div class="card-body"><div class="grid g4">'
        + kpi('Borrower 1', usd(VA.totalFor(1)))
        + kpi('Borrower 2', usd(VA.totalFor(2)))
        + kpi('Records used', String(va.records.filter(function(r){ return r.on !== false; }).length))
        + kpi('VA income total', usd(total), true)
      + '</div></div></div>'
    + '<div id="vaRecords">' + va.records.map(recordCard).join('') + '</div>'
    + '<div style="margin:14px 0"><button class="btn btn-primary" onclick="VA.add()">Add a service member</button></div>'
    + residualCard()
    + guidelineCard();
};

/* ---------------------------------------------------- wire into the file */
function buildTab(){
  if ($('panel-va')) return true;
  var bar = $('tabbar'); if (!bar) return false;
  var main = document.querySelector('#calc-root main .wrap'); if (!main) return false;

  var after = bar.querySelector('[data-tab="sche"]');
  var btn = document.createElement('button');
  btn.className = 'tab';
  btn.setAttribute('data-tab','va');
  btn.setAttribute('title','VA military income, allowances, disability compensation and the residual income test');
  btn.setAttribute('onclick', "switchTab('va')");
  btn.innerHTML = '<svg class="icon"><use href="#i-shield"/></svg><span>VA Income</span><span class="cnt" id="cnt-va">0</span>';
  if (after && after.nextSibling) bar.insertBefore(btn, after.nextSibling);
  else bar.appendChild(btn);

  var panel = document.createElement('section');
  panel.className = 'panel';
  panel.id = 'panel-va';
  panel.innerHTML =
      '<div class="section-head"><div>'
      + '<h2><svg class="icon icon-lg" style="color:var(--sky)"><use href="#i-shield"/></svg>VA Military &amp; Veteran Income</h2>'
      + '<p>Base pay, untaxed allowances and service-connected disability compensation, '
      + 'tested against continuance and against the residual income table VA applies in place of a ratio cap.</p>'
      + '</div></div><div id="vaBody"></div>';
  var summary = $('panel-summary');
  if (summary && summary.parentNode) summary.parentNode.insertBefore(panel, summary);
  else main.appendChild(panel);
  return true;
}

/* calcTotals is a function declaration, so it can be wrapped. VA income is
   folded into the total, into the borrower split and back through the two
   ratios, which is everything downstream of it. */
function wrapTotals(){
  if (typeof window.calcTotals !== 'function' || window.calcTotals.__va) return false;
  var inner = window.calcTotals;
  var wrapped = function(){
    var t = inner.apply(this, arguments);
    var add = 0;
    try { add = VA.total(); } catch(e){ add = 0; }
    if (!add) return t;
    t.va = add;
    t.income += add;
    try { t.b1 += VA.totalFor(1); t.b2 += VA.totalFor(2); } catch(e){}
    t.front = t.income ? t.pitia / t.income : 0;
    t.back  = t.income ? (t.pitia + t.debts) / t.income : 0;
    return t;
  };
  wrapped.__va = true;
  window.calcTotals = wrapped;
  return true;
}
function wrapRender(){
  if (typeof window.RECALC !== 'function' || window.RECALC.__vaRender) return false;
  var inner = window.RECALC;
  var wrapped = function(){
    var r = inner.apply(this, arguments);
    try {
      var va = ensureState();
      var c = $('cnt-va');
      if (c && va) c.textContent = String(va.records.filter(function(x){ return x.on !== false; })
        .filter(function(x){ return VA.calcRecord(x).total > 0; }).length);
      if ($('panel-va') && $('panel-va').classList.contains('active')) VA.render();
    } catch(e){}
    return r;
  };
  wrapped.__vaRender = true;
  window.RECALC = wrapped;
  return true;
}
/* switchTab only knows the panels that existed at load. */
function wrapSwitch(){
  if (typeof window.switchTab !== 'function' || window.switchTab.__va) return false;
  var inner = window.switchTab;
  var wrapped = function(t){
    if (t === 'va'){
      Array.prototype.forEach.call(document.querySelectorAll('#calc-root .panel'), function(p){
        p.classList.toggle('active', p.id === 'panel-va'); });
      Array.prototype.forEach.call(document.querySelectorAll('#tabbar .tab'), function(b){
        b.classList.toggle('active', b.dataset.tab === 'va'); });
      VA.render();
      if (window.LOS && window.LOS.refreshSubs) window.LOS.refreshSubs('c:va');
      return;
    }
    var r = inner.apply(this, arguments);
    var p = $('panel-va'); if (p) p.classList.remove('active');
    return r;
  };
  wrapped.__va = true;
  window.switchTab = wrapped;
  return true;
}

var tries = 0;
var poll = setInterval(function(){
  var ok = buildTab();
  wrapTotals(); wrapRender(); wrapSwitch();
  if (ok){
    ensureState();
    VA.render();
    if (typeof window.RECALC === 'function') window.RECALC();
    clearInterval(poll);
  } else if (++tries > 150) clearInterval(poll);
}, 60);
})();
