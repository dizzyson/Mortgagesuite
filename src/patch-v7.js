/* =====================================================================
   v7 — live PMI, menu clipping, JSON save/load, lock-extension dates,
        hourly defaults, a real-looking draft Schedule C, and maximum
        loan / maximum payment on the rail.

   Nothing in either engine is edited. Same three techniques as v5/v6:
   function wraps, live-array work, and DOM injection re-asserted on a
   poll.
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

var V7 = window.V7 = {};

/* =================================================================== 1
   LIVE PMI

   setLoan() ends in renderDTI(), which tears down and rebuilds the whole
   tab. setLoanLive() ends in paintLoan(), which updates every derived
   figure in place — including #ln-mi and #ln-mirate — and deliberately
   skips the input holding the caret.

   The FICO, note rate, term, MI-override and upfront-fee-rate fields
   were all bound to the first one, so every keystroke rebuilt the card
   under the cursor. The values did land, but the caret jumped and the
   mortgage insurance figure only settled once you clicked away, which
   is what "PMI isn't live" looks like from the outside.

   Only the fields that change the card's STRUCTURE still need the full
   re-render: program swaps whole blocks of fields in and out, and
   releasing a held loan amount rewrites its hint text.
   =================================================================== */
var STRUCTURAL = { program:1, txn:1, occ:1, sync:1, financeUfmip:1,
                   vaExempt:1, vaFirstUse:1, baseOverride:1 };
function wrapSetLoan(){
  if (typeof window.setLoan !== 'function' || window.setLoan.__v7) return false;
  if (typeof window.setLoanLive !== 'function') return false;
  var inner = window.setLoan;
  var wrapped = function(k, v, num){
    if (!STRUCTURAL[k]){
      window.setLoanLive(k, v, num);
      V7.refreshRail();
      return;
    }
    var r = inner.call(this, k, v, num);
    V7.refreshRail();
    return r;
  };
  wrapped.__v7 = true;
  window.setLoan = wrapped;
  return true;
}
/* setLinked() (price / down payment / loan amount) already ends in
   paintLoan, so it is live — it just never told the right-hand rail. */
function wrapSetLinked(){
  if (typeof window.setLinked !== 'function' || window.setLinked.__v7) return false;
  var inner = window.setLinked;
  var wrapped = function(){ var r = inner.apply(this, arguments); V7.refreshRail(); return r; };
  wrapped.__v7 = true; window.setLinked = wrapped; return true;
}
/* The rail is driven by the suite store, not by the calculator's S.loan,
   so a PMI change on the calculator side has to be pushed across. */
V7.refreshRail = function(){
  try {
    var st = suite();
    if (st && typeof st.emit === 'function') st.emit();
  } catch(e){}
  try { if (window.V5 && window.V5.paintRail) window.V5.paintRail(); } catch(e){}
  try { V7.paintCapacity(); } catch(e){}
};

/* =================================================================== 2
   MENU CLIPPING

   patch.css raised the calculator's tab bar to z-index 60. The toolbar
   that carries Income Report / Load / Save is z-index 55, and a dropdown
   inside it cannot paint above its own parent's stacking context — so
   the top of the Load menu was hidden behind the tab strip. The first
   item, "Load income file (.json)", was underneath it the whole time,
   which is why saving and loading JSON looked missing rather than
   merely invisible.

   Fixed in patch-v7.css. This function only handles the case where the
   menu would run off the bottom of the viewport.
   =================================================================== */
function keepMenuOnScreen(){
  $$('.menu.on').forEach(function(m){
    var r = m.getBoundingClientRect();
    var over = r.bottom - (window.innerHeight - 12);
    if (over > 0){
      m.style.maxHeight = Math.max(180, r.height - over) + 'px';
      m.style.overflowY = 'auto';
    } else {
      m.style.maxHeight = ''; m.style.overflowY = '';
    }
  });
}

/* =================================================================== 3
   SAVE / LOAD JSON from the report window too

   saveJSON()/loadJSON() already exist and are correct; they were simply
   unreachable behind the clipped menu. Surfacing them where the report
   is actually being worked on, rather than duplicating the logic.
   =================================================================== */
function injectReportJsonButtons(){
  var modal = $('rptModal'); if (!modal) return false;
  if (!modal.classList.contains('on')) return false;
  var bar = modal.querySelector('.rpt-actions, .rpt-foot, .modal-foot');
  if (!bar || bar.querySelector('.v7-json')) return false;
  var save = document.createElement('button');
  save.type = 'button'; save.className = 'btn btn-light v7-json';
  save.innerHTML = '<svg class="icon"><use href="#i-down"/></svg>Save .json';
  save.addEventListener('click', function(){ try { window.saveJSON(); } catch(e){} });
  var load = document.createElement('button');
  load.type = 'button'; load.className = 'btn btn-light v7-json';
  load.innerHTML = '<svg class="icon"><use href="#i-up"/></svg>Load .json';
  load.addEventListener('click', function(){ var f = $('loadFile'); if (f) f.click(); });
  bar.insertBefore(load, bar.firstChild);
  bar.insertBefore(save, bar.firstChild);
  return true;
}

/* =================================================================== 4
   LOCK EXTENSION — free-form dates, sensible defaults

   The two inputs were type="date", which on most browsers means a
   segmented picker you cannot type a plain date into. Switched to text
   with a parser that accepts what people actually type — 9/17/26,
   09-17-2026, 2026-09-17, "sep 17" — and a picker still available.

   Defaults: the expiration seeds to today when blank, and typing an
   expiration seeds the extend-to date 15 days out, which is the common
   first ask. Both remain fully editable and nothing is written until
   the section is opened.
   =================================================================== */
var MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
V7.parseDate = function(raw){
  var s = String(raw || '').trim();
  if (!s) return '';
  var m;
  /* ISO first — it is what the field stores */
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)))
    return iso(+m[1], +m[2], +m[3]);
  /* M/D/Y and M-D-Y, two- or four-digit year */
  if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/))){
    var y = m[3] ? +m[3] : new Date().getFullYear();
    if (y < 100) y += 2000;
    return iso(y, +m[1], +m[2]);
  }
  /* "sep 17", "17 sep 2026", "September 17, 2026" */
  var low = s.toLowerCase();
  var mi = -1;
  for (var i = 0; i < 12; i++) if (low.indexOf(MONTHS[i]) >= 0) { mi = i + 1; break; }
  if (mi > 0){
    var nums = low.match(/\d{1,4}/g) || [];
    var day = 0, yr = 0;
    nums.forEach(function(n){
      var v = +n;
      if (v >= 1000) yr = v; else if (!day && v <= 31) day = v; else if (!yr && v < 100) yr = 2000 + v;
    });
    if (day) return iso(yr || new Date().getFullYear(), mi, day);
  }
  return '';
};
function iso(y, m, d){
  var dt = new Date(y, m - 1, d);
  if (isNaN(dt.getTime()) || dt.getMonth() !== m - 1) return '';
  return dt.getFullYear() + '-' + String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0');
}
function addDays(isoStr, n){
  if (!isoStr) return '';
  var d = new Date(isoStr + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + n);
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
V7.pretty = function(isoStr){
  if (!isoStr) return '';
  var d = new Date(isoStr + 'T00:00:00');
  if (isNaN(d.getTime())) return isoStr;
  return String(d.getMonth()+1).padStart(2,'0') + '/' + String(d.getDate()).padStart(2,'0')
       + '/' + d.getFullYear();
};
/* Called from the rewritten inputs. Commits through v5's LOCKEXT so the
   existing pricing, persistence and rendering all still apply. */
V7.lockDate = function(which, raw){
  var LX = window.V5 && V5.LOCKEXT; if (!LX) return;
  var parsed = V7.parseDate(raw);
  if (!parsed && String(raw||'').trim()) return;      /* let them keep typing */
  LX.state[which] = parsed;
  if (which === 'expire' && parsed && !LX.state.extend)
    LX.state.extend = addDays(parsed, 15);
  LX.save(); LX.render();
};
/* Rewrites v5's two date inputs into free-form text fields after each
   render, and seeds the expiration the first time the card is opened. */
function upgradeLockFields(){
  var host = $('v5LockExt'); if (!host) return;
  var LX = window.V5 && V5.LOCKEXT; if (!LX || !LX.state.open) return;
  if (!LX.state.expire && !host.__v7seeded){
    host.__v7seeded = true;
    var t = new Date();
    LX.state.expire = iso(t.getFullYear(), t.getMonth()+1, t.getDate());
    if (!LX.state.extend) LX.state.extend = addDays(LX.state.expire, 15);
    LX.save(); LX.render();
    return;
  }
  $$('#v5LockExt input[type="date"]').forEach(function(el){
    var which = /expire/.test(el.getAttribute('onchange') || '') ? 'expire' : 'extend';
    var box = document.createElement('div');
    box.className = 'v7-datewrap';
    box.innerHTML = '<input class="cell-input v7-dateinput" type="text" placeholder="mm/dd/yyyy" '
      + 'value="' + esc(V7.pretty(LX.state[which])) + '" '
      + 'onchange="V7.lockDate(\'' + which + '\',this.value)">'
      + '<input class="v7-datepick" type="date" value="' + esc(LX.state[which] || '') + '" '
      + 'onchange="V7.lockDate(\'' + which + '\',this.value)" tabindex="-1" aria-label="pick a date">';
    el.parentNode.replaceChild(box, el);
  });
}

/* =================================================================== 5
   HOURLY — default to a 40-hour week

   A new employment record starts at freq 'Hourly' with hours 0, so
   typing an hourly rate produced $0/month until you also found the
   hours field. 40 is filled in as soon as a rate is entered on an
   hourly record with no hours yet.

   Deliberately narrow: only when hours is still 0, so a document import
   (which pushes its own `hours` through the same record) and anything
   the user typed both win. Standard hours are also left alone once set,
   so a 37.5- or 20-hour week is not quietly overwritten on the next
   keystroke.
   =================================================================== */
var HOURLY_DEFAULT = 40;
function wrapSetField(){
  if (typeof window.setField !== 'function' || window.setField.__v7) return false;
  var inner = window.setField;
  /* setField's first argument is the NAME of the list ('w2', 'schc', …),
     not the array — findRec does S[list].find(). */
  var wrapped = function(list, id, field, value, numeric){
    var r = inner.apply(this, arguments);
    try {
      if (list === 'w2' && field === 'rate' && N(value) > 0){
        var S = G('S');
        var rec = S && S.w2 && S.w2.filter(function(x){ return x && x.id === id; })[0];
        if (rec && rec.freq === 'Hourly' && !N(rec.hours)){
          rec.hours = HOURLY_DEFAULT;
          if (window.RECALC) window.RECALC();
          /* paintW refreshes the derived figures in place; renderW would
             rebuild the card and take the caret with it. */
          if (typeof window.paintW === 'function') window.paintW();
          var box = document.querySelector('#w2List input[value="0"]');
          say('Hours defaulted to 40',
              'An hourly record needs hours before it can produce a monthly figure, so a '
              + 'standard 40-hour week was filled in. Change it if the borrower works a '
              + 'different schedule \u2014 it will not be overwritten again.', 'info', 6000);
        }
      }
    } catch(e){}
    return r;
  };
  wrapped.__v7 = true; window.setField = wrapped; return true;
}

/* =================================================================== 6
   DRAFT SCHEDULE C — laid out like the real 1040 form

   v6 printed the add-back analysis as a plain two-column table. This
   renders the actual Part I / Part II shape: numbered lines, the boxed
   right-hand amount column, the header block with name and business
   details, and Part II's two-column expense layout.

   The worksheet still only holds what it holds — it collects the Form
   1084 analysis, not a full return — so lines it has no figure for are
   printed empty exactly as a blank form would show them, rather than
   being filled with invented numbers. Everything the worksheet does
   know lands on its correct numbered line, and the analysis that
   actually drives qualifying income follows underneath.
   =================================================================== */
var SCHC_MAP = {
  gross:       { line:'1',  label:'Gross receipts or sales' },
  returns:     { line:'2',  label:'Returns and allowances' },
  cogs:        { line:'4',  label:'Cost of goods sold (from line 42)' },
  otherInc:    { line:'6',  label:'Other income, including federal and state gasoline or fuel tax credit or refund' },
  advertising: { line:'8',  label:'Advertising' },
  carTruck:    { line:'9',  label:'Car and truck expenses' },
  commissions: { line:'10', label:'Commissions and fees' },
  contract:    { line:'11', label:'Contract labor' },
  depl12:      { line:'12', label:'Depletion' },
  depr13:      { line:'13', label:'Depreciation and section 179 expense deduction' },
  benefits:    { line:'14', label:'Employee benefit programs' },
  insurance:   { line:'15', label:'Insurance (other than health)' },
  interestMtg: { line:'16a',label:'Interest \u2014 mortgage (paid to banks, etc.)' },
  interestOth: { line:'16b',label:'Interest \u2014 other' },
  legal:       { line:'17', label:'Legal and professional services' },
  office:      { line:'18', label:'Office expense' },
  pension:     { line:'19', label:'Pension and profit-sharing plans' },
  rentVeh:     { line:'20a',label:'Rent or lease \u2014 vehicles, machinery, and equipment' },
  rentOther:   { line:'20b',label:'Rent or lease \u2014 other business property' },
  repairs:     { line:'21', label:'Repairs and maintenance' },
  supplies:    { line:'22', label:'Supplies' },
  taxes:       { line:'23', label:'Taxes and licenses' },
  travel:      { line:'24a',label:'Travel' },
  meals:       { line:'24b',label:'Deductible meals' },
  utilities:   { line:'25', label:'Utilities' },
  wages:       { line:'26', label:'Wages (less employment credits)' },
  otherExp:    { line:'27a',label:'Other expenses (from line 48)' },
  totalExp:    { line:'28', label:'Total expenses' },
  homeOffice:  { line:'30', label:'Expenses for business use of your home' },
  net31:       { line:'31', label:'Net profit or (loss)' }
};
function schcVal(y, keys){
  for (var i=0;i<keys.length;i++){ if (y && y[keys[i]] != null && N(y[keys[i]])) return N(y[keys[i]]); }
  return null;
}
/* The worksheet's own key for each concept, tried in order — different
   builds of the sheet have used different names for the same line. */
var SCHC_KEYS = {
  gross:['gross','grossReceipts','receipts'], returns:['returns'], cogs:['cogs'],
  otherInc:['otherInc','otherIncome'], advertising:['advertising','ads'],
  carTruck:['carTruck','car'], commissions:['commissions'], contract:['contract','contractLabor'],
  depl12:['depl12','depletion'], depr13:['depr13','depreciation'], benefits:['benefits'],
  insurance:['insurance'], interestMtg:['interestMtg','mtgInterest'], interestOth:['interestOth'],
  legal:['legal'], office:['office'], pension:['pension'], rentVeh:['rentVeh'],
  rentOther:['rentOther','rent'], repairs:['repairs'], supplies:['supplies'],
  taxes:['taxes'], travel:['travel'], meals:['meals','meals24b'], utilities:['utilities'],
  wages:['wages'], otherExp:['otherExp'], totalExp:['totalExp','totalExpenses'],
  homeOffice:['homeOffice','home8829'], net31:['net31','net']
};
V7.schCFormHTML = function(b, r, borrower, dateStr){
  var y1 = b.y1 || {}, y2 = b.y2 || {};
  var mo = function(v){ return v == null ? '' : Number(v).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}); };
  var row = function(k, cls){
    var m = SCHC_MAP[k], keys = SCHC_KEYS[k] || [k];
    var v1 = schcVal(y1, keys), v2 = schcVal(y2, keys);
    return '<tr class="' + (cls||'') + '"><td class="ln">' + m.line + '</td>'
      + '<td class="lbl">' + esc(m.label) + '</td>'
      + '<td class="amt">' + mo(v1) + '</td><td class="amt">' + mo(v2) + '</td></tr>';
  };
  var partII = ['advertising','carTruck','commissions','contract','depl12','depr13','benefits',
                'insurance','interestMtg','interestOth','legal','office','pension','rentVeh',
                'rentOther','repairs','supplies','taxes','travel','meals','utilities','wages','otherExp'];
  return ''
  + '<div class="schc">'
  + '  <div class="schc-hd">'
  + '    <div class="schc-hd-l"><div class="schc-form">SCHEDULE C<br><span>(Form 1040)</span></div></div>'
  + '    <div class="schc-hd-c"><div class="schc-t">Profit or Loss From Business</div>'
  + '      <div class="schc-s">(Sole Proprietorship)</div>'
  + '      <div class="schc-s2">Underwriting analysis \u2014 not the filed return</div></div>'
  + '    <div class="schc-hd-r"><div class="schc-yr">DRAFT</div>'
  + '      <div class="schc-s">Prepared<br>' + esc(dateStr) + '</div></div>'
  + '  </div>'
  + '  <table class="schc-name"><tr>'
  + '    <td><span class="cap">Name of proprietor</span><br><b>' + esc(borrower) + '</b></td>'
  + '    <td><span class="cap">Business name</span><br><b>' + esc(b.name || '\u2014') + '</b></td>'
  + '  </tr></table>'
  + '  <div class="schc-part">Part I &nbsp; Income</div>'
  + '  <table class="schc-tbl"><thead><tr><th class="ln"></th><th></th>'
  + '    <th class="amt">' + esc(String(y1.yr || '')) + '</th>'
  + '    <th class="amt">' + esc(String(y2.yr || '')) + '</th></tr></thead><tbody>'
  + row('gross') + row('returns') + row('cogs') + row('otherInc')
  + '  </tbody></table>'
  + '  <div class="schc-part">Part II &nbsp; Expenses</div>'
  + '  <table class="schc-tbl"><tbody>'
  + partII.map(function(k){ return row(k); }).join('')
  + row('totalExp','tot') + row('homeOffice') + row('net31','tot')
  + '  </tbody></table>'
  + '</div>';
};

/* =================================================================== 7
   MAXIMUM LOAN AND MAXIMUM PAYMENT on the rail

   The engine already computes maxSupportedHousingPayment (the lower of
   the front-end cap and what is left under the back-end cap after
   liabilities) and paymentCushion. What it does not do is turn that
   payment back into a loan amount, which is the figure people actually
   want when they ask "how much can they buy".

   The back-solve holds taxes, insurance, HOA/flood and mortgage
   insurance constant at their current monthly figures, subtracts them
   from the maximum payment to leave the P&I the borrower can carry,
   then inverts the amortisation formula for the principal that P&I
   supports at the current note rate and term.

   Escrows are held rather than scaled with price on purpose: taxes on
   a more expensive house would be higher, so the figure is the honest
   ceiling for THIS property's carrying costs, not a forecast for a
   different one. That is stated on the card rather than left implied.

   The range comes from the cushion percentage — a band either side of
   the ceiling, because nobody should underwrite to the last dollar of
   a DTI cap.
   =================================================================== */
var CUSH_KEY = 'v7Cushion.v1';
var CAP = V7.CAP = {
  cushion: 5,                     /* percent, user-adjustable */
  load: function(){ try { var v = JSON.parse(localStorage.getItem(CUSH_KEY)||'null'); if (v && isFinite(v.cushion)) CAP.cushion = v.cushion; } catch(e){} },
  save: function(){ try { localStorage.setItem(CUSH_KEY, JSON.stringify({cushion:CAP.cushion})); } catch(e){} }
};
CAP.load();
V7.setCushion = function(v){
  CAP.cushion = Math.max(0, Math.min(50, N(v)));
  CAP.save(); V7.paintCapacity();
};
/* principal that a given P&I supports — the amortisation formula solved
   for principal rather than for payment */
function principalFor(pi, annualRate, years){
  var n = Math.round(N(years) * 12);
  var i = N(annualRate) / 12;
  if (pi <= 0 || n <= 0) return 0;
  if (i <= 0) return pi * n;
  return pi * (1 - Math.pow(1 + i, -n)) / i;
}
V7.capacity = function(){
  var st = suite(); if (!st) return null;
  var out = st.outputs, i = st.activeInputs;
  if (!out || !out.aus || !out.payment) return null;
  var maxPay = N(out.aus.maxSupportedHousingPayment);
  if (maxPay <= 0) return null;
  var pay = out.payment;
  var mi = N(out.isFha ? pay.monthlyFhaMip : pay.monthlyPmi);
  /* hoaMonthly, not monthlyHoa — and the payment output carries no flood
     line at all, so there is nothing to add for it here. */
  var esc_ = N(pay.monthlyTaxes) + N(pay.monthlyInsurance) + N(pay.hoaMonthly);
  var maxPI = maxPay - esc_ - mi;
  var rate = N(i.interestRate), term = N(i.termYears || 30);
  var maxLoan = maxPI > 0 ? principalFor(maxPI, rate, term) : 0;
  var curPay = N(pay.totalMonthlyPayment);
  var curLoan = N(out.loan && (out.loan.totalLoan || out.loan.maximumBaseLoan));
  var c = CAP.cushion / 100;
  return {
    maxPay: maxPay, curPay: curPay,
    payCushion: N(out.aus.paymentCushion),
    payLow: maxPay * (1 - c), payHigh: maxPay * (1 + c),
    maxLoan: maxLoan, curLoan: curLoan,
    loanLow: maxLoan * (1 - c), loanHigh: maxLoan * (1 + c),
    maxPI: maxPI, escrows: esc_, mi: mi, rate: rate, term: term,
    frontLimit: N(out.aus.frontEndLimit), backLimit: N(out.aus.backEndLimit),
    payOver: curPay > maxPay, loanOver: curLoan > maxLoan,
    cushion: CAP.cushion
  };
};
function capacityCardHTML(c){
  var band = function(lo, hi){ return usd(lo,0) + ' \u2013 ' + usd(hi,0); };
  var verdict = function(over, cur, max, what){
    var diff = Math.abs(cur - max);
    return '<div class="v7-verdict ' + (over ? 'over' : 'under') + '">'
      + (over ? 'OVER by ' + usd(diff,0) : 'UNDER by ' + usd(diff,0))
      + '<span> \u00b7 ' + what + '</span></div>';
  };
  return ''
  + '<div class="v7-cap-head">Capacity</div>'
  + '<div class="v7-cap-row"><span class="l">Maximum payment</span>'
      + '<span class="v">' + usd(c.maxPay,0) + '</span></div>'
  + '<div class="v7-cap-sub">Range at \u00b1' + c.cushion + '%: ' + band(c.payLow, c.payHigh) + '</div>'
  + verdict(c.payOver, c.curPay, c.maxPay, 'current ' + usd(c.curPay,0))
  + '<div class="v7-cap-row"><span class="l">Maximum total loan</span>'
      + '<span class="v">' + usd(c.maxLoan,0) + '</span></div>'
  + '<div class="v7-cap-sub">Range at \u00b1' + c.cushion + '%: ' + band(c.loanLow, c.loanHigh) + '</div>'
  + verdict(c.loanOver, c.curLoan, c.maxLoan, 'current ' + usd(c.curLoan,0))
  + '<div class="v7-cap-note">P&amp;I headroom ' + usd(c.maxPI,0)
      + ' after taxes, insurance and HOA of ' + usd(c.escrows,0)
      + ' and mortgage insurance of ' + usd(c.mi,0)
      + ', at ' + (c.rate*100).toFixed(3) + '% over ' + c.term + ' years. '
      + 'Escrows are held at this property\u2019s figures, so the loan ceiling is the limit for '
      + 'these carrying costs \u2014 a pricier house carries higher taxes and would come in lower.</div>'
  + '<div class="v7-cap-cush"><label>Cushion %</label>'
      + '<input class="cell-input" type="number" step="0.5" min="0" max="50" value="' + c.cushion + '" '
      + 'oninput="V7.setCushion(this.value)"></div>';
}
V7.paintCapacity = function(){
  var rail = document.querySelector('.rail .card') || document.querySelector('.rail');
  if (!rail) return;
  var c = V7.capacity();
  var host = $('v7Capacity');
  if (!c){ if (host) host.style.display = 'none'; return; }
  if (!host || !host.isConnected){
    host = document.createElement('div');
    host.id = 'v7Capacity'; host.className = 'v7-cap';
    rail.appendChild(host);
  }
  host.style.display = '';
  /* Don't rebuild while the cushion box has the caret, or typing in it
     would lose focus on every keystroke. */
  var live = document.activeElement;
  if (host.contains(live) && live.tagName === 'INPUT'){
    var upd = host.querySelectorAll('.v7-cap-row .v, .v7-cap-sub, .v7-verdict');
    if (upd.length) { host.__v7pending = c; return; }
  }
  host.innerHTML = capacityCardHTML(c);
};

/* =================================================================== 8
   WIRING
   =================================================================== */
setInterval(function(){
  try { wrapSetLoan(); wrapSetLinked(); wrapSetField(); } catch(e){}
  try { keepMenuOnScreen(); } catch(e){}
  try { injectReportJsonButtons(); } catch(e){}
  try { upgradeLockFields(); } catch(e){}
  try { V7.paintCapacity(); } catch(e){}
}, 500);
})();
