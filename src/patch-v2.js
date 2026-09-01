/* =====================================================================
   MORTGAGE RATES, VA, TAX PRORATION, STIPS
   One module, no delegation. Everything here is additive: neither
   calculation engine is edited.
   ===================================================================== */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
function G(n){ try { return (0, eval)(n); } catch(e){ return undefined; } }
function N(v){ v = parseFloat(v); return isFinite(v) ? v : 0; }
function usd(v, dp){ dp = dp===undefined?2:dp;
  var n = N(v);
  /* the sign belongs outside the currency mark, not between it and the digits */
  return (n < 0 ? '\u2212' : '') + '$'
    + Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:dp,maximumFractionDigits:dp}); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){
  return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
function suite(){ try { return window.mortgageSuite.store; } catch(e){ return null; } }
function say(t,b,k){ if (window.LOS && LOS.say) LOS.say(t,b,k); }

/* =================================================================== 1
   MORTGAGE RATES — Mortgage News Daily
   A page served from file:// cannot read mortgagenewsdaily.com: the
   browser blocks the cross-origin response and there is no server here
   to proxy it. So there are three ways in, in order of preference:
     1. a direct fetch, which works if this file is ever hosted with a
        proxy on the same origin
     2. a proxy URL the user configures once
     3. pasting the survey table, which is parsed properly
   Whichever path succeeds, the figures and their date are stored.
   =================================================================== */
var RATES = window.RATES = {};
var RK = 'mndRates.v1';

RATES.FIELDS = [
  ['fixed30','30 Yr. Fixed',   true],
  ['fixed15','15 Yr. Fixed',   false],
  ['jumbo30','30 Yr. Jumbo',   false],
  ['arm76',  '7/6 SOFR ARM',   false],
  ['fha30',  '30 Yr. FHA',     false],
  ['va30',   '30 Yr. VA',      false]
];

/* Seeded from the survey of 08/31. Treated as last-known, not as live. */
RATES.DEFAULT = {
  asOf: '2026-08-31',
  source: 'seed',
  rows: {
    fixed30:{rate:6.87, change:+0.06},
    fixed15:{rate:6.38, change:+0.03},
    jumbo30:{rate:6.92, change:+0.02},
    arm76:  {rate:6.42, change:+0.09},
    fha30:  {rate:6.40, change:+0.03},
    va30:   {rate:6.42, change:+0.05}
  },
  /* Spreads to the 30-year fixed baseline. Seeded from the survey's own
     deltas rather than assumed. */
  spreads: { fha:-0.47, va:-0.45, jumbo:+0.05, useSpread:false },
  proxy: '',
  history: []
};
RATES.load = function(){
  try {
    var raw = localStorage.getItem(RK);
    if (!raw) return JSON.parse(JSON.stringify(RATES.DEFAULT));
    var d = JSON.parse(raw);
    d.rows = d.rows || RATES.DEFAULT.rows;
    d.spreads = d.spreads || RATES.DEFAULT.spreads;
    d.history = d.history || [];
    return d;
  } catch(e){ return JSON.parse(JSON.stringify(RATES.DEFAULT)); }
};
RATES.save = function(d){ try { localStorage.setItem(RK, JSON.stringify(d)); } catch(e){} };
RATES.state = RATES.load();

/* Parse a pasted MND survey. Tolerant of the row order and of the arrows,
   because what lands on the clipboard depends on how it was selected. */
RATES.parse = function(text){
  if (!text) return null;
  var LOOK = [
    ['fixed30', /30\s*yr\.?\s*fixed/i],
    ['fixed15', /15\s*yr\.?\s*fixed/i],
    ['jumbo30', /30\s*yr\.?\s*jumbo/i],
    ['arm76',   /7\s*\/\s*6\s*sofr\s*arm/i],
    ['fha30',   /30\s*yr\.?\s*fha/i],
    ['va30',    /30\s*yr\.?\s*va/i]
  ];
  var lines = String(text).split(/\r?\n/), out = {}, found = 0;
  lines.forEach(function(line){
    LOOK.forEach(function(L){
      if (out[L[0]] || !L[1].test(line)) return;
      var nums = line.match(/[+\-]?\d+\.\d+/g);
      if (!nums || !nums.length) return;
      var rate = parseFloat(nums[0]);
      var change = nums.length > 1 ? parseFloat(nums[1]) : 0;
      if (/[-–−]\s*0?\.\d|\-\d/.test(line.slice(line.lastIndexOf(nums[nums.length-1]) - 2))) { /* sign kept below */ }
      if (rate > 0 && rate < 25){ out[L[0]] = { rate:rate, change:change }; found++; }
    });
  });
  if (!found) return null;
  var d = null, m = String(text).match(/Last\s*Updated:?\s*(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/i);
  if (m){
    var yr = m[3] ? (m[3].length === 2 ? '20'+m[3] : m[3]) : String(new Date().getFullYear());
    d = yr + '-' + String(m[1]).padStart(2,'0') + '-' + String(m[2]).padStart(2,'0');
  }
  return { rows: out, asOf: d || new Date().toISOString().slice(0,10), count: found };
};

RATES.apply = function(parsed, source){
  var s = RATES.state;
  if (s.rows && s.asOf){
    s.history = (s.history || []).filter(function(h){ return h.asOf !== s.asOf; });
    s.history.unshift({ asOf:s.asOf, rows:JSON.parse(JSON.stringify(s.rows)) });
    s.history = s.history.slice(0,60);
  }
  Object.keys(parsed.rows).forEach(function(k){ s.rows[k] = parsed.rows[k]; });
  s.asOf = parsed.asOf; s.source = source || 'paste';
  /* Keep the spreads honest: if the survey carries FHA and VA, the spread
     is a measured fact rather than an assumption. */
  if (s.rows.fha30 && s.rows.fixed30)
    s.spreads.fha = +(s.rows.fha30.rate - s.rows.fixed30.rate).toFixed(3);
  if (s.rows.va30 && s.rows.fixed30)
    s.spreads.va = +(s.rows.va30.rate - s.rows.fixed30.rate).toFixed(3);
  RATES.save(s);
  RATES.render();
  return s;
};

RATES.fetchLive = function(){
  var s = RATES.state, btn = $('mndFetch');
  if (btn){ btn.disabled = true; btn.textContent = 'Fetching…'; }
  var url = s.proxy && s.proxy.trim()
    ? s.proxy.trim()
    : 'https://www.mortgagenewsdaily.com/mortgage-rates';
  fetch(url, { mode:'cors' })
    .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(function(html){
      var text = html.replace(/<[^>]+>/g,'\n').replace(/&nbsp;/g,' ');
      var parsed = RATES.parse(text);
      if (!parsed) throw new Error('The page came back but no survey table was found in it.');
      RATES.apply(parsed, s.proxy ? 'proxy' : 'direct');
      say('Rates updated', parsed.count + ' rows read for ' + parsed.asOf, 'good');
    })
    .catch(function(err){
      RATES.note('The browser refused that request: ' + err.message
        + '. A page opened from a file:// path cannot read another origin. '
        + 'Either set a proxy URL below, or paste the survey table.');
    })
    .then(function(){ if (btn){ btn.disabled = false; btn.textContent = 'Fetch from MND'; } });
};
RATES.note = function(msg){
  var el = $('mndNote');
  if (el){ el.innerHTML = msg; el.style.display = 'block'; }
};

/* The baseline the suite calculates from, and the two programme rates. */
RATES.baseline = function(){ return N(RATES.state.rows.fixed30 && RATES.state.rows.fixed30.rate); };
RATES.forProgram = function(prog){
  var s = RATES.state, base = RATES.baseline();
  if (prog === 'FHA') return s.spreads.useSpread || !s.rows.fha30 ? base + N(s.spreads.fha) : s.rows.fha30.rate;
  if (prog === 'VA')  return s.spreads.useSpread || !s.rows.va30  ? base + N(s.spreads.va)  : s.rows.va30.rate;
  if (prog === 'Jumbo') return s.rows.jumbo30 ? s.rows.jumbo30.rate : base + N(s.spreads.jumbo);
  return base;
};
RATES.pushToSuite = function(){
  var st = suite(); if (!st) return;
  var prog = st.activeInputs.loanProgram === 'FHA' ? 'FHA' : 'Conventional';
  var r = RATES.forProgram(prog);
  st.setField('interestRate', r/100, 'MND baseline ' + RATES.state.asOf);
  var S = G('S');
  if (S && S.loan){ S.loan.rate = r; if (window.RECALC) window.RECALC(); }
  say('Rate applied', prog + ' at ' + r.toFixed(3) + '% from the survey of ' + RATES.state.asOf, 'good');
  RATES.render();
};

function spark(){
  var h = (RATES.state.history || []).slice(0,40).reverse();
  var pts = h.map(function(x){ return x.rows.fixed30 ? x.rows.fixed30.rate : null; }).filter(function(v){ return v!=null; });
  pts.push(RATES.baseline());
  if (pts.length < 3) return '<div class="muted small" style="padding:24px 0;text-align:center">'
    + 'A trend line builds here as the survey is updated day to day.</div>';
  var min = Math.min.apply(null,pts), max = Math.max.apply(null,pts), rng = (max-min)||1;
  var w = 520, hgt = 140;
  var d = pts.map(function(v,i){
    return (i? 'L':'M') + (i/(pts.length-1)*w).toFixed(1) + ' ' + (hgt - (v-min)/rng*(hgt-16) - 8).toFixed(1);
  }).join(' ');
  return '<svg viewBox="0 0 '+w+' '+hgt+'" style="width:100%;height:150px">'
    + '<path d="'+d+' L '+w+' '+hgt+' L 0 '+hgt+' Z" fill="var(--accent)" opacity=".14"/>'
    + '<path d="'+d+'" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>'
    + '</svg>'
    + '<div class="mnd-axis"><span>'+min.toFixed(2)+'%</span><span>'+pts.length+' observations</span><span>'+max.toFixed(2)+'%</span></div>';
}

RATES.set = function(k,v){
  if (k === 'proxy') RATES.state.proxy = v;
  else if (k === 'useSpread') RATES.state.spreads.useSpread = !!v;
  else RATES.state.spreads[k] = N(v);
  RATES.save(RATES.state); RATES.render();
};
RATES.preset = function(v){ RATES.state.spreads.fha = N(v); RATES.state.spreads.va = N(v);
  RATES.state.spreads.useSpread = true; RATES.save(RATES.state); RATES.render(); };
RATES.readPaste = function(){
  var t = $('mndPaste') ? $('mndPaste').value : '';
  var parsed = RATES.parse(t);
  if (!parsed) return RATES.note('Nothing in that text looked like the survey table. '
    + 'Select the rate table on the MND page — the rows and the numbers — and paste it here.');
  RATES.apply(parsed, 'paste');
  say('Rates updated', parsed.count + ' rows read for ' + parsed.asOf, 'good');
};

RATES.render = function(){
  var host = $('mndBody'); if (!host) return;
  var s = RATES.state;
  var st = suite();
  var suiteRate = st ? N(st.activeInputs.interestRate)*100 : null;

  var rows = RATES.FIELDS.map(function(f){
    var r = s.rows[f[0]];
    if (!r) return '';
    var up = N(r.change) >= 0;
    return '<tr' + (f[2] ? ' class="lead"' : '') + '><td>' + f[1] + '</td>'
      + '<td class="num">' + N(r.rate).toFixed(2) + '%</td>'
      + '<td class="num ' + (up ? 'up' : 'down') + '">' + (up?'+':'') + N(r.change).toFixed(2) + '%'
      + ' <span aria-hidden="true">' + (up ? '&#9650;' : '&#9660;') + '</span></td></tr>';
  }).join('');

  host.innerHTML =
    '<div class="grid g2" style="align-items:start">'
    + '<div class="card"><div class="card-top"><span class="tag">Survey</span>'
      + '<span class="doc-name">MND daily rate survey</span><div class="spacer"></div>'
      + '<span class="muted small">As of ' + esc(s.asOf) + ' &middot; ' + esc(s.source) + '</span></div>'
      + '<div class="card-body">'
        + '<table class="mnd-t"><thead><tr><th></th><th class="num">Rate</th><th class="num">Change</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table>'
        + '<div class="mnd-acts">'
          + '<button class="btn btn-primary" id="mndFetch" onclick="PULL.pullRates()">Pull rates online</button>'
          + '<button class="btn btn-light" onclick="RATES.pushToSuite()">Use as the suite baseline</button>'
        + '</div>'
        + '<div class="note warn" id="mndNote" style="display:none;margin-top:12px"></div>'
        + '<details class="mnd-det"><summary>Paste the survey instead</summary>'
          + '<p class="muted small">A page opened from a file path cannot read another site — the browser blocks it. '
          + 'Select the rate table on mortgagenewsdaily.com, paste it here, and it will be read properly.</p>'
          + '<textarea id="mndPaste" rows="7" placeholder="30 Yr. Fixed  6.87%  +0.06&#10;15 Yr. Fixed  6.38%  +0.03&#10;..."></textarea>'
          + '<div class="mnd-acts"><button class="btn btn-primary btn-sm" onclick="RATES.readPaste()">Read this</button></div>'
          + '<label class="mnd-lbl">Or a proxy URL on your own origin, if you host this file</label>'
          + '<input class="cell-input" value="' + esc(s.proxy||'') + '" placeholder="https://your-host/mnd-proxy"'
          + ' onchange="RATES.set(\'proxy\',this.value)">'
        + '</details>'
      + '</div></div>'

    + '<div class="card"><div class="card-top"><span class="tag">Trend</span>'
      + '<span class="doc-name">30-year fixed</span></div>'
      + '<div class="card-body">' + spark() + '</div></div>'
    + '</div>'

    + '<div class="card" style="margin-top:14px"><div class="card-top"><span class="tag">Baseline</span>'
      + '<span class="doc-name">What the suite calculates from</span><div class="spacer"></div>'
      + (suiteRate!==null ? '<span class="muted small">Suite is on ' + suiteRate.toFixed(3) + '%</span>' : '')
      + '</div><div class="card-body">'
      + '<div class="note ok" style="margin-bottom:14px"><b>The 30-year fixed is the baseline.</b> '
      + 'Every other programme is that figure plus a spread, so one number moves the whole file.</div>'
      + '<div class="grid g3">'
        + '<div class="calcbox"><div class="muted small">Baseline &mdash; 30 yr fixed</div>'
          + '<div class="mnd-big">' + RATES.baseline().toFixed(3) + '%</div></div>'
        + '<div class="calcbox"><div class="muted small">FHA</div>'
          + '<div class="mnd-big">' + RATES.forProgram('FHA').toFixed(3) + '%</div>'
          + '<div class="muted small">' + (s.spreads.useSpread ? 'baseline ' + (s.spreads.fha>=0?'+':'') + s.spreads.fha : 'survey figure') + '</div></div>'
        + '<div class="calcbox"><div class="muted small">VA</div>'
          + '<div class="mnd-big">' + RATES.forProgram('VA').toFixed(3) + '%</div>'
          + '<div class="muted small">' + (s.spreads.useSpread ? 'baseline ' + (s.spreads.va>=0?'+':'') + s.spreads.va : 'survey figure') + '</div></div>'
      + '</div>'
      + '<div class="grid g3" style="margin-top:14px">'
        + '<div class="field"><label>FHA spread to baseline</label>'
          + '<input class="cell-input" type="number" step="0.01" value="' + s.spreads.fha + '" onchange="RATES.set(\'fha\',this.value)"></div>'
        + '<div class="field"><label>VA spread to baseline</label>'
          + '<input class="cell-input" type="number" step="0.01" value="' + s.spreads.va + '" onchange="RATES.set(\'va\',this.value)"></div>'
        + '<div class="field"><label>Which figure wins</label>'
          + '<select class="cell-input" onchange="RATES.set(\'useSpread\',this.value===\'spread\')">'
          + '<option value="survey"' + (!s.spreads.useSpread?' selected':'') + '>The survey\'s own FHA and VA rates</option>'
          + '<option value="spread"' + (s.spreads.useSpread?' selected':'') + '>Baseline plus my spread</option>'
          + '</select></div>'
      + '</div>'
      + '<div class="note warn" style="margin-top:14px">'
        + '<b>A word on the &minus;2.75 spread.</b> Today\'s survey puts the 30-year fixed at '
        + RATES.baseline().toFixed(2) + '% and FHA at ' + (s.rows.fha30? s.rows.fha30.rate.toFixed(2):'—')
        + '% &mdash; a spread of ' + s.spreads.fha.toFixed(2) + ', not &minus;2.75. Subtracting 2.75 would price FHA at '
        + (RATES.baseline()-2.75).toFixed(2) + '%, which would understate every FHA payment in the file. '
        + 'The field above is yours if you meant something specific by it: '
        + '<button class="btn btn-light btn-sm" onclick="RATES.preset(-2.75)">apply &minus;2.75 anyway</button> '
        + '<button class="btn btn-light btn-sm" onclick="RATES.set(\'useSpread\',false)">go back to the survey figures</button>'
      + '</div>'
    + '</div></div>';
};

/* =================================================================== 2
   VA — standard loans only
   The renovation engine validates loanProgram down to FHA or Conventional
   at two points, so a VA scenario there would compute as FHA without
   saying so. VA belongs on the calculator's loan setup, which already
   prices the funding fee and carries no monthly MI.
   =================================================================== */
var VAL = window.VALOAN = {};
VAL.isVA = function(){ var S = G('S'); return !!(S && S.loan && S.loan.program === 'VA'); };
VAL.enforce = function(){
  var S = G('S'); if (!S || !S.loan) return;
  if (S.loan.program !== 'VA') return;
  /* No monthly mortgage insurance on a VA loan, ever. If a figure is being
     held in the housing block from a previous programme, release it. */
  var changed = false;
  if (N(S.dti && S.dti.mi) !== 0){ S.dti.mi = 0; changed = true; }
  if (S.loan.miHold != null && S.loan.miHold !== ''){ S.loan.miHold = ''; changed = true; }
  if (N(S.loan.miOverride) !== 0){ S.loan.miOverride = 0; changed = true; }
  return changed;
};
VAL.notice = function(){
  if (!suite()) return;
  var host = $('vaSuiteNote');
  if (!host) return;
  host.style.display = VAL.isVA() ? 'flex' : 'none';
};

/* =================================================================== 3
   TAX PRORATION AND THE ESCROW AGGREGATE
   Two questions a closing raises that the file did not answer: what the
   seller owes the buyer for taxes already accrued, and how many months
   the aggregate analysis actually collects given where the closing date
   falls against the due dates.
   =================================================================== */
var TAX = window.TAXPRO = {};
var TK = 'taxProration.v1';
TAX.CYCLES = {
  'Suffolk County, NY — Dec 1 / May 10': [{due:'12-01',covers:'12-01',pct:0.5},{due:'05-10',covers:'06-01',pct:0.5}],
  'Nassau County, NY — Jan 10 / Jul 10':  [{due:'01-10',covers:'01-01',pct:0.5},{due:'07-10',covers:'07-01',pct:0.5}],
  'Semi-annual — Jan 1 / Jul 1':          [{due:'01-01',covers:'01-01',pct:0.5},{due:'07-01',covers:'07-01',pct:0.5}],
  'Quarterly — Feb / May / Aug / Nov':    [{due:'02-01',covers:'02-01',pct:0.25},{due:'05-01',covers:'05-01',pct:0.25},
                                           {due:'08-01',covers:'08-01',pct:0.25},{due:'11-01',covers:'11-01',pct:0.25}],
  'Annual — due Jan 1':                   [{due:'01-01',covers:'01-01',pct:1}]
};
TAX.load = function(){
  try { var d = JSON.parse(localStorage.getItem(TK)||'null'); if (d) return d; } catch(e){}
  return { annual:0, cycle:'Semi-annual — Jan 1 / Jul 1', closing:new Date().toISOString().slice(0,10),
           firstPayment:'', sellerPaidThrough:'', cushionMonths:2 };
};
TAX.state = TAX.load();
TAX.set = function(k,v){
  TAX.state[k] = (k==='annual'||k==='cushionMonths') ? N(v) : v;
  try { localStorage.setItem(TK, JSON.stringify(TAX.state)); } catch(e){}
  TAX.render();
};
TAX.calc = function(){
  var s = TAX.state, annual = N(s.annual);
  var close = new Date((s.closing||'') + 'T00:00:00');
  if (isNaN(close)) return null;
  var daily = annual/365;
  var year = close.getFullYear();

  /* The seller owes the buyer for the part of the tax year already used
     up at closing, unless they have paid beyond it — in which case the
     buyer reimburses them. */
  var paidThrough = s.sellerPaidThrough ? new Date(s.sellerPaidThrough + 'T00:00:00') : null;
  var accrualStart = new Date(year,0,1);
  var daysAccrued = Math.max(0, Math.round((close - accrualStart)/86400000));
  var sellerOwes, buyerReimburses = 0, basis;
  if (paidThrough && !isNaN(paidThrough) && paidThrough > close){
    var daysPrepaid = Math.round((paidThrough - close)/86400000);
    buyerReimburses = daysPrepaid * daily;
    sellerOwes = 0;
    basis = daysPrepaid + ' day(s) paid beyond closing';
  } else {
    sellerOwes = daysAccrued * daily;
    basis = daysAccrued + ' day(s) accrued from 1 January to closing';
  }

  /* The aggregate. First payment defaults to the first of the second
     month after closing, the ordinary convention. */
  var fp = s.firstPayment ? new Date(s.firstPayment+'T00:00:00') : null;
  if (!fp || isNaN(fp)){
    fp = new Date(close.getFullYear(), close.getMonth()+2, 1);
  }
  var cycle = TAX.CYCLES[s.cycle] || TAX.CYCLES['Semi-annual — Jan 1 / Jul 1'];
  var monthly = annual/12;

  /* Walk twelve months from the first payment, adding a deposit each month
     and taking each instalment out on its due date. The lowest point in the
     year, less the cushion, is what has to be funded at closing. */
  var bal = 0, low = Infinity, ledger = [];
  for (var m = 0; m < 12; m++){
    var d = new Date(fp.getFullYear(), fp.getMonth()+m, 1);
    bal += monthly;
    var out = 0;
    cycle.forEach(function(inst){
      var parts = inst.due.split('-');
      if (parseInt(parts[0],10) === d.getMonth()+1) out += annual * inst.pct;
    });
    bal -= out;
    ledger.push({ label: d.toLocaleDateString('en-US',{month:'short',year:'2-digit'}),
                  inflow: monthly, outflow: out, balance: bal });
    if (bal < low) low = bal;
  }
  var cushion = monthly * N(s.cushionMonths);
  var initial = Math.max(0, cushion - low);
  var monthsCollected = monthly > 0 ? initial/monthly : 0;

  return { annual:annual, daily:daily, monthly:monthly, sellerOwes:sellerOwes,
           buyerReimburses:buyerReimburses, basis:basis, ledger:ledger, low:low,
           cushion:cushion, initial:initial, monthsCollected:monthsCollected,
           firstPayment:fp, close:close };
};
TAX.render = function(){
  var host = $('taxBody'); if (!host) return;
  var s = TAX.state, R = TAX.calc();
  var bars = '';
  if (R){
    var peak = Math.max.apply(null, R.ledger.map(function(l){ return Math.max(l.balance, l.outflow); }).concat([1]));
    bars = R.ledger.map(function(l){
      var h = Math.max(2, (Math.max(0,l.balance)/peak)*94);
      var o = l.outflow>0 ? Math.max(2,(l.outflow/peak)*94) : 0;
      return '<div class="agg-col" title="'+l.label+' — balance '+usd(l.balance)+'">'
        + (o? '<i class="out" style="height:'+o+'%"></i>' : '')
        + '<i class="bal" style="height:'+h+'%"></i>'
        + '<span>'+l.label+'</span></div>';
    }).join('');
  }
  host.innerHTML =
    '<div class="card"><div class="card-top"><span class="tag">Taxes</span>'
    + '<span class="doc-name">Proration at closing and the escrow aggregate</span></div>'
    + '<div class="card-body">'
      + '<div class="grid g4">'
        + '<div class="field"><label>Annual property tax ($)</label><input class="cell-input" type="number" step="0.01" value="'+N(s.annual)+'" onchange="TAXPRO.set(\'annual\',this.value)"></div>'
        + '<div class="field"><label>Billing cycle</label><select class="cell-input" onchange="TAXPRO.set(\'cycle\',this.value)">'
          + Object.keys(TAX.CYCLES).map(function(k){ return '<option'+(k===s.cycle?' selected':'')+'>'+k+'</option>'; }).join('')
          + '</select></div>'
        + '<div class="field"><label>Closing date</label><input class="cell-input" type="date" value="'+esc(s.closing)+'" onchange="TAXPRO.set(\'closing\',this.value)"></div>'
        + '<div class="field"><label>Seller paid through</label><input class="cell-input" type="date" value="'+esc(s.sellerPaidThrough||'')+'" onchange="TAXPRO.set(\'sellerPaidThrough\',this.value)"><div class="fhint">Blank means nothing paid this year</div></div>'
      + '</div>'
      + (!R ? '<p class="muted">Enter a closing date.</p>' :
        '<div class="grid g4" style="margin-top:14px">'
        + '<div class="calcbox"><div class="muted small">Daily rate</div><div class="mnd-big">'+usd(R.daily)+'</div></div>'
        + '<div class="calcbox'+(R.sellerOwes>0?' final':'')+'"><div class="muted small">Seller credit to buyer</div><div class="mnd-big">'+usd(R.sellerOwes)+'</div><div class="muted small">'+R.basis+'</div></div>'
        + '<div class="calcbox'+(R.buyerReimburses>0?' warn':'')+'"><div class="muted small">Buyer reimburses seller</div><div class="mnd-big">'+usd(R.buyerReimburses)+'</div><div class="muted small">'+(R.buyerReimburses>0?'Seller prepaid past closing':'Nothing prepaid past closing')+'</div></div>'
        + '<div class="calcbox"><div class="muted small">Escrow funded at closing</div><div class="mnd-big">'+usd(R.initial)+'</div><div class="muted small">'+R.monthsCollected.toFixed(1)+' months at '+usd(R.monthly)+'</div></div>'
        + '</div>'
        + '<div class="subhead" style="margin-top:18px">The aggregate — twelve months from the first payment on '
          + R.firstPayment.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) + '</div>'
        + '<div class="agg">'+bars+'</div>'
        + '<div class="note '+(R.initial>0?'ok':'warn')+'" style="margin-top:12px">'
          + '<b>Lowest projected balance is '+usd(R.low)+'.</b> '
          + 'With a '+N(s.cushionMonths)+'-month cushion of '+usd(R.cushion)+', the account has to start with '
          + usd(R.initial)+' &mdash; '+R.monthsCollected.toFixed(1)+' months of deposits collected at the table. '
          + 'Move the closing date and watch this figure move: closing just before an instalment falls due is what '
          + 'drives it up.</div>'
        + '<div class="note warn" style="margin-top:10px">'
          + '<b>Net effect on cash to close: '
          + usd(R.initial + R.buyerReimburses - R.sellerOwes) + '.</b> '
          + 'Escrow funding plus any reimbursement to the seller, less the seller\'s credit for taxes already accrued.</div>')
    + '</div></div>';
};

/* =================================================================== 4
   STIP CREATOR
   Built from what is actually on the file — the worksheets that carry a
   figure, the loan setup, and anything the AUS parser read.
   =================================================================== */
var STIP = window.STIPS = {};
var SK = 'stips.v1';
STIP.load = function(){ try { return JSON.parse(localStorage.getItem(SK)||'null') || {removed:[],added:[]}; }
  catch(e){ return {removed:[],added:[]}; } };
STIP.state = STIP.load();
STIP.save = function(){ try { localStorage.setItem(SK, JSON.stringify(STIP.state)); } catch(e){} };

STIP.build = function(){
  var S = G('S'); var out = { Income:[], Asset:[], Credit:[] };
  if (!S) return out;
  var ON = function(r){ return r && r.on !== false; };
  var push = function(cat, id, text){ out[cat].push({ id:id, text:text }); };

  /* Income */
  if ((S.w2||[]).filter(ON).length){
    push('Income','w2-stubs','Your two most recent pay stubs, covering a full 30 days of earnings.');
    push('Income','w2-w2','W-2 forms for the last two years, for every job.');
    if ((S.w2||[]).filter(ON).some(function(j){ return N(j.ot)>0 || N(j.bonus)>0 || N(j.comm)>0; }))
      push('Income','w2-var','A written statement from your employer on whether the overtime, bonus or commission is expected to continue.');
  }
  if ((S.schc||[]).filter(ON).length){
    push('Income','sc-1040','Signed federal tax returns for the last two years, with every schedule attached.');
    push('Income','sc-pl','A year-to-date profit and loss statement for the business, signed and dated.');
    push('Income','sc-lic','Your current business licence, or a letter from your accountant confirming the business is active.');
  }
  if ((S.corp||[]).filter(ON).length){
    push('Income','co-rtn','Business tax returns for the last two years — the full return, all pages.');
    push('Income','co-k1','K-1 statements for the last two years.');
  }
  if ((S.sche||[]).filter(ON).length){
    push('Income','se-lease','A signed lease for each rental property.');
    push('Income','se-sche','Schedule E from the last two years of returns.');
  }
  var va = S.va && S.va.records ? S.va.records.filter(ON) : [];
  if (va.length){
    push('Income','va-les','Your most recent Leave & Earnings Statement.');
    push('Income','va-coe','Your Certificate of Eligibility.');
    if (va.some(function(r){ return N(r.disabilityMonthly)>0; }))
      push('Income','va-award','Your VA disability award letter, showing the monthly amount and the rating.');
    if (va.some(function(r){ return r.etsDate; }))
      push('Income','va-ets','A statement of re-enlistment, or evidence of continued employment after your separation date.');
  }
  if ((S.other||[]).filter(ON).length)
    push('Income','ot-award','Award letters or benefit statements for any pension, social security or support income.');

  /* Asset */
  push('Asset','as-bank','Two most recent statements for every account you are using — all pages, including the blank ones.');
  if (S.assets && N(S.assets.retire)>0)
    push('Asset','as-ret','Your most recent retirement account statement, and the plan\'s terms for withdrawal.');
  push('Asset','as-lg','A signed gift letter and proof of transfer for any funds coming from a family member.');
  push('Asset','as-emd','A copy of your earnest money cheque and the statement showing it clear your account.');
  if (S.loan && N(S.loan.price)>0)
    push('Asset','as-cash','Proof of funds for the balance of cash to close.');

  /* Credit */
  push('Credit','cr-id','A clear copy of your driver\'s licence or passport.');
  if (S.dti && (S.dti.debts||[]).length)
    push('Credit','cr-debt','A current statement for each debt showing the balance and the minimum payment.');
  push('Credit','cr-addr','A two-year residence history with addresses and dates.');
  if (S.loan && /VA/i.test(S.loan.program||''))
    push('Credit','cr-dd214','Your DD-214, if you have separated from service.');
  if (S.loan && S.loan.txn === 'Purchase')
    push('Credit','cr-contract','The fully executed purchase contract, with every addendum and every signature.');
  push('Credit','cr-hoi','A homeowner\'s insurance quote or binder for the subject property.');

  /* Anything the AUS parser found */
  try {
    if (S.aus && S.aus.findings && S.aus.findings.length){
      S.aus.findings.slice(0,12).forEach(function(f,i){
        var t = (f.text || f.message || '').trim();
        if (t) push('Credit','aus-'+i,'From the AUS findings: ' + t);
      });
    }
  } catch(e){}

  /* User edits */
  Object.keys(out).forEach(function(cat){
    out[cat] = out[cat].filter(function(x){ return STIP.state.removed.indexOf(x.id) < 0; });
  });
  (STIP.state.added||[]).forEach(function(a){
    if (out[a.cat]) out[a.cat].push({ id:a.id, text:a.text, custom:true });
  });
  return out;
};
STIP.remove = function(id){ STIP.state.removed.push(id);
  STIP.state.added = (STIP.state.added||[]).filter(function(a){ return a.id !== id; });
  STIP.save(); STIP.render(); };
STIP.add = function(cat){
  var t = prompt('What should the borrower send?');
  if (!t || !t.trim()) return;
  STIP.state.added = STIP.state.added || [];
  STIP.state.added.push({ id:'u'+Date.now(), cat:cat, text:t.trim() });
  STIP.save(); STIP.render();
};
STIP.reset = function(){ STIP.state = {removed:[],added:[]}; STIP.save(); STIP.render(); };
STIP.text = function(){
  var b = STIP.build(), S = G('S');
  var who = (S && S.b1) ? S.b1 : '';
  var out = [];
  out.push('Hi' + (who ? ' ' + who.split(/\s+/)[0] : '') + ',');
  out.push('');
  out.push('Here is what we need to keep your file moving. Send whatever you have — we can work with partial pieces while you gather the rest.');
  out.push('');
  ['Income','Asset','Credit'].forEach(function(cat){
    if (!b[cat].length) return;
    out.push(cat.toUpperCase());
    b[cat].forEach(function(s,i){ out.push('  ' + (i+1) + '. ' + s.text); });
    out.push('');
  });
  out.push('Reply to this email with the documents attached, and let me know if anything on the list does not apply to you.');
  return out.join('\n');
};
STIP.copy = function(){
  var t = STIP.text();
  var done = function(){ say('Copied','The list is on your clipboard, formatted for an email.','good'); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fallback);
  else fallback();
  function fallback(){
    var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta);
    ta.select(); try { document.execCommand('copy'); done(); } catch(e){ alert(t); }
    ta.remove();
  }
};
STIP.render = function(){
  var host = $('stipBody'); if (!host) return;
  var b = STIP.build();
  var total = b.Income.length + b.Asset.length + b.Credit.length;
  host.innerHTML =
    '<div class="card"><div class="card-top"><span class="tag">Stips</span>'
    + '<span class="doc-name">What the borrower still has to send</span><div class="spacer"></div>'
    + '<span class="muted small">' + total + ' item(s), built from this file</span>'
    + '<button class="btn btn-primary btn-sm" onclick="STIPS.copy()">Copy for an email</button>'
    + '<button class="btn btn-light btn-sm" onclick="STIPS.reset()">Reset</button></div>'
    + '<div class="card-body"><div class="stip-cols">'
    + ['Income','Asset','Credit'].map(function(cat){
        return '<div class="stip-col"><div class="subhead">' + cat + ' &middot; ' + b[cat].length + '</div>'
          + b[cat].map(function(s){
              return '<div class="stip' + (s.custom?' custom':'') + '">'
                + '<span>' + esc(s.text) + '</span>'
                + '<button title="Remove" onclick="STIPS.remove(\'' + s.id + '\')">&times;</button></div>';
            }).join('')
          + '<button class="btn btn-light btn-sm stip-add" onclick="STIPS.add(\'' + cat + '\')">+ Add a ' + cat.toLowerCase() + ' item</button>'
          + '</div>';
      }).join('')
    + '</div></div></div>';
};

/* =================================================================== 5
   SCENARIO NAMING — [Loan Amount] - [LTV]% - [Rate]% - [Program]
   =================================================================== */
function scenarioName(){
  var st = suite();
  if (!st) return 'Scenario';
  var i = st.activeInputs, o = st.outputs;
  var loan = N((o && o.loan && (o.loan.totalLoan || o.loan.maximumBaseLoan)) || 0);
  var baseLoan = N((o && o.loan && o.loan.maximumBaseLoan) || loan);
  /* LTV is the base loan against value, not the loan inflated by a
     financed upfront fee — otherwise a 96.5% FHA file reads over 100%. */
  var value = N(i.afterRepairValue) || N(i.basePurchasePrice) || 0;
  var ltv = value > 0 ? (baseLoan/value*100) : (1 - N(i.finalDownPaymentPct))*100;
  var prog = i.loanProgram + (i.renovation ? (i.loanProgram === 'FHA' ? ' 203(k)' : ' HomeStyle') : '');
  return usd(loan,0) + ' - ' + ltv.toFixed(1) + '% - ' + (N(i.interestRate)*100).toFixed(3) + '% - ' + prog;
}
function hookNaming(){
  if (!window.LOS || !LOS.SCEN || LOS.SCEN.autoName.__v2) return false;
  var fn = function(){ return scenarioName(); };
  fn.__v2 = true;
  LOS.SCEN.autoName = fn;
  return true;
}

/* =================================================================== 6
   GLOBAL SYNC TOGGLE
   =================================================================== */
function buildSync(){
  if ($('losSyncBtn')) return;
  var bar = $('losBar'); if (!bar) return;
  var b = document.createElement('button');
  b.id = 'losSyncBtn'; b.type = 'button'; b.className = 'lbtn sync';
  bar.insertBefore(b, bar.firstChild.nextSibling);
  function paint(){
    var on = window.LOS ? LOS.syncOn() : true;
    b.className = 'lbtn sync' + (on ? ' on' : '');
    b.innerHTML = '<span class="syncdot"></span>Sync ' + (on ? 'on' : 'off');
    b.title = on
      ? 'The income worksheets are feeding the renovation suite on every recalculation. Click to stop.'
      : 'The two sides are not talking. Click to start syncing, and to push what is on the file now.';
  }
  b.addEventListener('click', function(){
    if (!window.LOS) return;
    LOS.setSync(!LOS.syncOn());
    paint();
  });
  paint();
  LOS._paintSync = paint;
}

/* =================================================================== 7
   TABS
   =================================================================== */
function addTab(id, label, icon, title, beforeId, panelHTML){
  if ($('panel-' + id)) return true;
  var bar = $('tabbar'); if (!bar) return false;
  var btn = document.createElement('button');
  btn.className = 'tab'; btn.setAttribute('data-tab', id);
  btn.setAttribute('title', title);
  btn.setAttribute('onclick', "switchTab('" + id + "')");
  btn.innerHTML = '<svg class="icon"><use href="#' + icon + '"/></svg><span>' + label + '</span>';
  var before = beforeId ? bar.querySelector('[data-tab="' + beforeId + '"]') : null;
  if (before) bar.insertBefore(btn, before); else bar.appendChild(btn);

  var panel = document.createElement('section');
  panel.className = 'panel'; panel.id = 'panel-' + id;
  panel.innerHTML = panelHTML;
  var anchor = $('panel-summary');
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(panel, anchor);
  return true;
}

function buildAll(){
  var ok = addTab('rates','Mortgage Rates','i-pie',
    'Mortgage News Daily survey, the baseline rate and the programme spreads','dti',
    '<div class="section-head"><div><h2><svg class="icon icon-lg" style="color:var(--sky)"><use href="#i-pie"/></svg>Mortgage Rates</h2>'
    + '<p>The daily survey from Mortgage News Daily, the 30-year fixed as the baseline every programme is priced from, '
    + 'and what that does to the file.</p></div></div><div id="mndBody"></div>');

  addTab('taxes','Taxes &amp; Escrow','i-home',
    'Tax proration at closing and the escrow aggregate analysis','docs',
    '<div class="section-head"><div><h2><svg class="icon icon-lg" style="color:var(--sky)"><use href="#i-home"/></svg>Taxes &amp; Escrow</h2>'
    + '<p>What the seller owes for taxes already accrued at closing, what the buyer reimburses if the seller paid ahead, '
    + 'and how many months the aggregate analysis collects.</p></div></div><div id="taxBody"></div>');

  /* Stips live under Summary, between the two halves of the file. */
  if (!$('stipBody')){
    var sb = $('summaryBody');
    if (sb && sb.parentNode){
      var wrap = document.createElement('div');
      wrap.id = 'stipWrap'; wrap.style.marginTop = '18px';
      wrap.innerHTML = '<div class="section-head" style="margin-top:26px"><div>'
        + '<h2><svg class="icon icon-lg" style="color:var(--sky)"><use href="#i-doc"/></svg>Stipulations</h2>'
        + '<p>The document list this file implies, grouped the way a borrower reads it.</p></div></div>'
        + '<div id="stipBody"></div>';
      sb.parentNode.insertBefore(wrap, sb.nextSibling);
    }
  }

  /* The suite says plainly that VA is not a renovation programme. */
  if (!$('vaSuiteNote')){
    var sr = document.getElementById('suite-root');
    var cm = sr && sr.querySelector('.cols-main');
    var col = cm && cm.firstElementChild;
    if (col){
      var n = document.createElement('div');
      n.id = 'vaSuiteNote'; n.className = 'note warn vasuite'; n.style.display = 'none';
      n.innerHTML = '<div><b>This file is set to VA, and VA has no renovation programme.</b> '
        + 'The renovation engine only prices FHA 203(k) and HomeStyle, so a VA scenario here would be computed as FHA. '
        + 'VA standard loans are priced on the calculator\'s loan setup, where the funding fee is applied and no monthly '
        + 'mortgage insurance is charged.</div>'
        + '<button class="btn btn-light btn-sm" onclick="switchTab(\'dti\')">Open the VA loan setup</button>';
      col.insertBefore(n, col.firstChild);
    }
  }
  return ok;
}

function wrapSwitch(){
  if (typeof window.switchTab !== 'function' || window.switchTab.__v2) return false;
  var inner = window.switchTab;
  var MINE = { rates: RATES.render, taxes: TAX.render };
  var wrapped = function(t){
    if (MINE[t]){
      Array.prototype.forEach.call(document.querySelectorAll('#calc-root .panel'), function(p){
        p.classList.toggle('active', p.id === 'panel-' + t); });
      Array.prototype.forEach.call(document.querySelectorAll('#tabbar .tab'), function(b){
        b.classList.toggle('active', b.dataset.tab === t); });
      MINE[t]();
      if (window.LOS && LOS.refreshSubs) LOS.refreshSubs('c:' + t);
      return;
    }
    var r = inner.apply(this, arguments);
    Object.keys(MINE).forEach(function(k){ var p = $('panel-'+k); if (p) p.classList.remove('active'); });
    if (t === 'summary') STIP.render();
    return r;
  };
  wrapped.__v2 = true;
  window.switchTab = wrapped;
  return true;
}
function wrapRecalc(){
  if (typeof window.RECALC !== 'function' || window.RECALC.__v2) return false;
  var inner = window.RECALC;
  var wrapped = function(){
    VAL.enforce();
    var r = inner.apply(this, arguments);
    try {
      VAL.notice();
      if ($('panel-summary') && $('panel-summary').classList.contains('active')) STIP.render();
      if ($('panel-taxes') && $('panel-taxes').classList.contains('active')) TAX.render();
      if (LOS && LOS._paintSync) LOS._paintSync();
    } catch(e){}
    return r;
  };
  wrapped.__v2 = true;
  window.RECALC = wrapped;
  return true;
}

var tries = 0;
var poll = setInterval(function(){
  var built = buildAll();
  wrapSwitch(); wrapRecalc(); buildSync(); hookNaming();
  if (built){
    RATES.render(); TAX.render(); STIP.render(); VAL.notice();
    if (window.LOS){
      LOS.FIXED_SUBS_EXTRA = true;
      if (window.LOS.SCEN) hookNaming();
    }
    clearInterval(poll);
  } else if (++tries > 200) clearInterval(poll);
}, 60);
})();
