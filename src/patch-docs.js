/* =====================================================================
   DOCUMENT PARSERS — purchase contract, Loan Estimate, Closing Disclosure
   Built against two real files: a scanned NY Bar residential contract of
   sale (no text layer, so everything here runs on OCR output and has to
   survive its noise) and a Closing Disclosure with a clean text layer.
   ===================================================================== */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
function G(n){ try { return (0, eval)(n); } catch(e){ return undefined; } }
function N(v){ v = parseFloat(v); return isFinite(v) ? v : 0; }
function usd(v,dp){ dp = dp===undefined?2:dp; var n=N(v);
  return (n<0?'\u2212':'') + '$' + Math.abs(n).toLocaleString('en-US',
    {minimumFractionDigits:dp,maximumFractionDigits:dp}); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){
  return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
function say(t,b,k){ if (window.LOS && LOS.say) LOS.say(t,b,k); }

var DOC = window.DOCP = {};

/* ------------------------------------------------- normalising the text
   The Closing Disclosure that this was built against carries a "Draft"
   watermark whose glyphs are interleaved into the text layer. Real output
   from it looks like  $3,a914.29  and  6 .75 %  and  M onthly Pr incipal,
   with section names quadrupled — SSSSeeeeccccttttiiiioooonnnn. A scanned
   contract is noisy in its own ways. Everything is cleaned once, here,
   before any pattern is applied. */
function norm(text){
  var t = String(text || '').replace(/\u00a0/g,' ').replace(/[\u2018\u2019]/g,"'");
  /* A watermark repeats each glyph. Only letters are collapsed: 710,000 has
     three legitimate zeros, and collapsing those turns it into 710,0. */
  t = t.replace(/([A-Za-z$+])\1{2,}/g, '$1');
  /* a stray glyph dropped inside a number: $3,a914.29 */
  t = t.replace(/([\d,.])[A-Za-z](?=[\d,.]\d)/g, '$1');
  /* spaces opened up inside a number: 6 .75  |  $18, 597.77  |  $1,334 .99 */
  t = t.replace(/(\d)\s+(?=[.,]\d)/g, '$1');
  t = t.replace(/([.,])\s+(?=\d)/g, '$1');
  t = t.replace(/\$\s+(?=\d)/g, '$');
  /* a space opened between digits: $4 5,056.77. Only joined when what
     follows is plainly the rest of the same figure, so "$0 $0" and
     "(12 mo.)" are left alone. */
  t = t.replace(/(\d)\s(?=\d{0,2},\d{3})/g, '$1');
  return t;
}
DOC._norm = norm;

/* A label may have spaces opened inside its words, so every label is
   matched with an optional gap between each character. */
function L(s){
  return s.split('').map(function(ch){
    if (/\s/.test(ch)) return '\\s*';   /* the form writes "A.Origination" with no space */
    return ch.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\s*';
  }).join('');
}
DOC._L = L;

/* ---------------------------------------------------------------- money
   A scanner turns "$685,000.00" into "$685,.000.00" often enough that a
   strict pattern quietly drops the purchase price. Everything numeric
   goes through here. */
function money(raw){
  if (raw == null) return null;
  var s = String(raw).replace(/[Oo](?=\d)/g,'0').replace(/[lI](?=\d)/g,'1');
  var neg = /-/.test(s);
  s = s.replace(/[^\d.,]/g,'').replace(/,/g,'');
  if (!s) return null;
  var parts = s.split('.').filter(function(x){ return x !== ''; });
  if (!parts.length) return null;
  var cents = '';
  if (parts.length > 1 && parts[parts.length-1].length === 2) cents = parts.pop();
  var v = parseFloat(parts.join('') + (cents ? '.'+cents : ''));
  if (!isFinite(v)) return null;
  return neg ? -v : v;
}
DOC._money = money;

/* A money token never contains whitespace — allowing it is how one figure
   silently becomes the next one concatenated. */
var TOKEN = /-?\$?-?\d[\d,.]*\d|\$\d/g;
function tokensIn(s){
  var out = [], m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(s))){
    var v = money(m[0]);
    if (v !== null) out.push({ v:v, raw:m[0], neg:/^-|^\$?-/.test(m[0]) });
  }
  return out;
}

/* Read the money after a label. `pick` chooses which token when the line
   carries several — the recording-fee line is "Deed: $770 Mortgage: $810
   $1,580", where the total is the largest, not the first. */
function after(text, re, opts){
  opts = opts || {};
  /* A label can appear more than once — as a column heading with nothing
     beside it, and again over the figure. Keep walking until one of them
     actually has a number after it. */
  var flags = 'g' + (re.ignoreCase ? 'i' : '');
  var rx = new RegExp(re.source, flags), m, guard = 0;
  while ((m = rx.exec(text)) && guard++ < 20){
    var start = m.index + m[0].length;
    var tail = text.slice(start, start + (opts.span || 160));
    if (opts.stopAtNewline) tail = tail.split('\n')[0];
    var toks = tokensIn(tail);
    if (!toks.length){ if (m.index === rx.lastIndex) rx.lastIndex++; continue; }
    if (opts.pick === 'max')  return toks.reduce(function(a,b){ return Math.abs(b.v)>Math.abs(a.v)?b:a; }).v;
    if (opts.pick === 'last') return toks[toks.length-1].v;
    if (typeof opts.pick === 'number') return toks[opts.pick] ? toks[opts.pick].v : null;
    return toks[0].v;
  }
  return null;
}
function grab(text, re, group){
  var m = text.match(re);
  return m ? String(m[group === undefined ? 1 : group]).trim().replace(/\s+/g,' ') : null;
}
function dateOf(s){
  if (!s) return null;
  var m = String(s).match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/);
  if (m){ var y = m[3].length===2 ? '20'+m[3] : m[3];
    return y+'-'+String(m[1]).padStart(2,'0')+'-'+String(m[2]).padStart(2,'0'); }
  var MO = {january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,
            september:9,october:10,november:11,december:12};
  m = String(s).match(/([A-Za-z]+)\s+(\d{1,2})\s*,?\s*(\d{4})/);
  if (m && MO[m[1].toLowerCase()])
    return m[3]+'-'+String(MO[m[1].toLowerCase()]).padStart(2,'0')+'-'+String(m[2]).padStart(2,'0');
  return null;
}

/* =================================================================== 1
   PURCHASE CONTRACT — New York Bar Association residential form
   =================================================================== */
DOC.parseContract = function(text){
  if (!text) return null;
  var t = norm(text);
  var flat = t.replace(/\s*\n\s*/g,' ');
  var o = { kind:'contract', form:'NY Bar residential contract of sale', fields:{}, flags:[] };
  var F = o.fields;

  F.contractDate    = dateOf(grab(flat, /Contract of Sale made as of\s+([A-Za-z]+\s*_*\s*,?\s*\d{4})/i))
                   || grab(flat, /made as of\s+([A-Za-z]+[^.]{0,18}\d{4})/i);
  F.seller          = grab(flat, /BETWEEN\s+([A-Z][A-Za-z.'\- ]+?),?\s+residing at/i)
                   || grab(flat, /^\s*([A-Z][A-Z\s.'\-]{4,40}?),\s*residing at/mi);
  F.sellerEstate    = grab(flat, /(ESTATE OF [A-Z][A-Z\s.,'\-]+?)(?:\s+Address|\s+Social)/i);
  F.purchaser       = grab(flat, /([A-Z][A-Z\s.'\-]{3,40}?\s+and\s+[A-Z][A-Z\s.'\-]{3,40}?)\s*Address:/i)
                   || grab(flat, /hereinafter called .?Seller.?\s+and\s+([A-Z][A-Z\s.'\-]{4,60}?)\s*Address/i);
  F.propertyAddress = grab(flat, /Street Address:\s*([^]{5,80}?)\s*Tax Map/i);
  F.taxMap          = grab(flat, /Tax Map Designation:\s*((?:Section|Sec\.?)[^]{2,60}?Lot\s*[\w\-]+)/i);
  F.county          = grab(flat, /County or Town\s+([A-Za-z ]{3,24}?)\s+Street Number/i);

  F.purchasePrice   = after(t, /purchase price is/i, {span:60});
  F.downPayment     = after(t, /Downpayment.?\s*\)?:?/i, {span:120});
  F.balanceAtClosing= after(t, /Balance at Closing[^]{0,60}?paragraph\s*7\s*:?/i, {span:90});

  /* Mortgage contingency: the amount, the number of days to commitment,
     and the minimum term. */
  var cont = flat.match(/Mortgage Commitment Contingency[^]{0,900}/i);
  if (cont){
    var c = cont[0];
    F.contingencyDays  = N(grab(c, /on or before\s*(\d{1,3})\s*days/i));
    F.mortgageAmount   = after(c, /at Purchaser.?s sole cost and expense,?\s*of/i, {span:60})
                      || after(c, /expense,\s*of/i, {span:60});
    F.mortgageTermYrs  = N(grab(c, /for a term of at least\s*\|?\s*(\d{1,2})\s*\|?\s*years/i));
  }
  F.closingDate     = dateOf(grab(flat, /Closing Date and Place[^]{0,220}?on or about\s+([A-Za-z]+\s*\d{0,2},?\s*\d{0,2},?\s*\d{4})/i))
                   || dateOf(grab(flat, /on or about\s+([A-Za-z]+\s+\d{1,2},?\s*\d{4})/i));
  F.escrowBank      = grab(flat, /segregated bank account at:\s*([^]{3,60}?)\s*address/i);
  F.sellerAttorney  = grab(flat, /Attorney for Seller:\s*([^]{3,70}?)(?:\s*Address|\s*Tel)/i);
  F.buyerAttorney   = grab(flat, /Attorney for Purchaser:\s*([^]{3,70}?)(?:\s*Address|\s*Tel)/i);

  /* Rider terms that change the deal. */
  if (/\bAS\s*IS\b/i.test(flat)) o.flags.push('Sold as-is — the seller has no obligation to make repairs.');
  if (/Seller to pay NYS Transfer Tax/i.test(flat)) o.flags.push('Seller pays the New York State transfer tax.');
  if (/no open permits/i.test(flat)) o.flags.push('No open permits are to remain at closing.');
  if (/lead-?based paint/i.test(flat)) o.flags.push('Lead-based paint disclosure is a condition.');
  if (F.purchasePrice && F.downPayment)
    F.downPct = F.purchasePrice ? (F.downPayment / F.purchasePrice) : null;

  /* Arithmetic the contract states three ways — a mismatch means the OCR
     misread a figure, and it is better to say so than to load it. */
  if (F.purchasePrice && F.downPayment && F.balanceAtClosing){
    var diff = F.purchasePrice - F.downPayment - F.balanceAtClosing;
    if (Math.abs(diff) > 1)
      o.flags.push('Price less downpayment does not equal the balance at closing — off by '
        + usd(diff) + '. Check the scan before loading these figures.');
  }
  o.confidence = Object.keys(F).filter(function(k){ return F[k] != null && F[k] !== ''; }).length;
  return o;
};

/* =================================================================== 2
   LOAN ESTIMATE / CLOSING DISCLOSURE
   The two forms share most of their structure. The CD adds the final
   figures and the comparison back to the LE, so the parser reads both
   and records which one it found.
   =================================================================== */
DOC.parseLE = function(text){
  if (!text) return null;
  var t = norm(text);
  var flat = t.replace(/\s*\n\s*/g,' ');
  var isCD = /Closing Disclosure/i.test(flat);
  var o = { kind: isCD ? 'cd' : 'le',
            form: isCD ? 'Closing Disclosure' : 'Loan Estimate',
            fields:{}, costs:{}, flags:[] };
  var F = o.fields, C = o.costs;

  F.lender        = grab(flat, /Lender\s+([A-Z][A-Za-z.,&' ]{3,44}?(?:LLC|Inc\.?|Bank|Corp\.?|Funding|Mortgage))/);
  /* the header is a three-column table, so a name runs straight into the
     label of the next column — the stop list is what ends it */
  F.borrower      = grab(flat, /Borrower\s+([A-Z][A-Za-z.'\- ]{3,40}?)\s+(?:Loan Term|\d{2,})/);
  F.seller        = grab(flat, /Settlement Agent[^]{0,60}?Seller\s+([A-Z][A-Za-z.'\- ]{3,60}?)\s+(?:File|\d{2,})/);
  F.property      = grab(flat, /Property\s+([\d][^]{4,60}?)\s*(?:Massapequa|,\s*[A-Z]{2}\s*\d{5}|Lender)/i)
                 || grab(flat, /security interest in\s+([^]{6,70}?\d{5})/i);
  F.settlement    = grab(flat, /Settlement Agent\s+([A-Za-z][A-Za-z.,&' ]{3,44}?)\s+(?:File|Seller)/i);
  F.fileNo        = grab(flat, /File\s*#\s*([A-Za-z0-9\-]{4,24})/i);
  F.loanId        = grab(flat, /Loan ID\s*#\s*(\d{6,16})/i);
  F.dateIssued    = dateOf(grab(flat, /Date Issued\s*([\d\/]{6,10})/i));
  F.closingDate   = dateOf(grab(flat, /Closing Date\s*([\d\/]{6,10})/i));
  F.disbursement  = dateOf(grab(flat, /D\s*isbursement Date\s*([\d\/]{6,10})/i))
                 || dateOf(grab(flat, /Disbursement Date\s*([\d\/]{6,10})/i));
  F.termYears     = N(grab(flat, /Loan Term\s*(\d{1,2})\s*years/i));
  F.purpose       = grab(flat, /Purpose\s*(Purchase|Refinance|Construction)/i);
  F.product       = grab(flat, /Product\s+(Fixed Rate|Adjustable Rate|Step Rate|[A-Za-z ]{3,20}?)\s+(?:Settlement|Loan Type|Seller)/i);

  /* Loan type is a set of checkboxes; the x sits before the one that applies. */
  var lt = flat.match(/Loan Type[^]{0,80}/i);
  if (lt){
    if (/x\s*Conventional/i.test(lt[0])) F.loanType = 'Conventional';
    else if (/x\s*FHA/i.test(lt[0]))     F.loanType = 'FHA';
    else if (/x\s*VA/i.test(lt[0]))      F.loanType = 'VA';
  }
  if (!F.loanType && /\bMIC\s*#/i.test(flat)) F.loanType = 'Conventional';

  F.salePrice     = after(t, new RegExp(L('Sale Price'), 'i'), {span:40, stopAtNewline:true});
  F.loanAmount    = after(t, new RegExp(L('Loan Amount'), 'i'), {span:40, stopAtNewline:true});
  F.rate          = N(grab(flat, new RegExp(L('Interest Rate') + '\\$?([\\d.]+)\\s*%', 'i')));
  F.pi            = after(t, new RegExp(L('Principal & Interest'), 'i'), {span:40, stopAtNewline:true});
  F.mi            = after(t, new RegExp(L('Mortgage Insurance') + '\\s*\\+?', 'i'), {span:30, stopAtNewline:true});
  F.escrow        = after(t, new RegExp(L('Estimated Escrow') + '\\s*\\+?', 'i'), {span:40, stopAtNewline:true});
  /* the label and its figure are split across lines on the form */
  F.totalPayment  = after(t, new RegExp(L('Estimated Total'), 'i'), {span:60})
                 || after(t, new RegExp(L('Monthly Payment'), 'i'), {span:40});
  F.taxesInsAssess= after(t, /Estimated Taxes, Insurance/i, {span:200});
  F.closingCosts  = after(t, new RegExp(L('Closing Costs') + '\\$', 'i'), {span:30, stopAtNewline:true});
  F.cashToClose   = after(t, new RegExp(L('Cash to Close') + '\\$', 'i'), {span:30, stopAtNewline:true});
  /* page 5 lists the five loan calculations as labels then values, so the
     two percentages arrive together at the end of the block */
  /* On page five each figure sits inside its own paragraph of explanation,
     so the label is found first and the percentage taken from the prose. */
  F.apr = N(grab(flat, new RegExp(L('Percentage Rate (APR)') + '[^]{0,220}?(\\d{1,2}\\.\\d{2,3})\\s*%', 'i')));
  F.tip = N(grab(flat, new RegExp(L('Total Interest Percentage') + '[^]{0,320}?(\\d{1,3}\\.\\d{2})\\s*%', 'i')));
  F.amountFinanced = after(t, new RegExp(L('Amount Financed'), 'i'), {span:220, pick:'max'});
  F.financeCharge  = after(t, new RegExp(L('Finance Charge'), 'i'), {span:220, pick:'max'});
  F.totalOfPayments= after(t, new RegExp(L('Total of Payments'), 'i'), {span:260, pick:'max'});
  F.escrowYear1   = after(t, new RegExp(L('Escrowed'), 'i'), {span:120});

  /* Closing cost sections */
  C.origination = after(t, new RegExp(L('A. Origination Charges'), 'i'), {span:60, stopAtNewline:true, pick:'max'});
  C.points = after(t, new RegExp(L('% of Loan Amount (Points)'), 'i'), {span:120, stopAtNewline:true});
  C.originationFee = after(t, new RegExp(L('Origination Fee'), 'i'), {span:120, stopAtNewline:true});
  C.pointsPct     = N(grab(flat, /([\d.]+)\s*%\s*of Loan Amount \(Points\)/i));
  C.didNotShop = after(t, new RegExp(L('B. Services Borrower Did Not Shop For'), 'i'), {span:60, stopAtNewline:true, pick:'max'});
  C.didShop = after(t, new RegExp(L('C. Services Borrower Did Shop For'), 'i'), {span:60, stopAtNewline:true, pick:'max'});
  C.totalLoanCosts= after(t, new RegExp(L('TOTAL LOAN COSTS'), 'i'), {span:60, stopAtNewline:true, pick:'max'});
  C.govFees = after(t, new RegExp(L('E. Taxes and Other Government Fees'), 'i'), {span:60, stopAtNewline:true, pick:'max'});
  C.prepaids = after(t, new RegExp(L('F. Prepaids'), 'i'), {span:60, stopAtNewline:true, pick:'max'});
  C.initialEscrow = after(t, new RegExp(L('G. Initial Escrow Payment at Closing'), 'i'), {span:60, stopAtNewline:true, pick:'max'});
  C.other = after(t, new RegExp(L('H. Other'), 'i'), {span:60, stopAtNewline:true, pick:'max'});
  C.totalOther    = after(t, new RegExp(L('TOTAL OTHER COSTS'), 'i'), {span:60, stopAtNewline:true, pick:'max'});
  C.totalClosing  = after(t, new RegExp(L('TOTAL CLOSING COSTS'), 'i'), {span:60, stopAtNewline:true, pick:'max'});
  C.appraisal = after(t, new RegExp(L('Appraisal Fee'), 'i'), {span:120, stopAtNewline:true});
  C.creditReport = after(t, new RegExp(L('Credit Report'), 'i'), {span:120, stopAtNewline:true});
  C.lendersTitle = after(t, new RegExp(L("Title - Lender's Title Insurance"), 'i'), {span:120, stopAtNewline:true});
  C.ownersTitle = after(t, new RegExp(L("Owner's Title Insurance"), 'i'), {span:120, stopAtNewline:true});
  C.settlementFee = after(t, new RegExp(L('Title - Settlement Fee'), 'i'), {span:120, stopAtNewline:true});
  C.recordingFees = after(t, new RegExp(L('Recording Fees'), 'i'), {span:120, stopAtNewline:true, pick:'max'});
  C.stateTaxStamps = after(t, new RegExp(L('State Tax/Stamps'), 'i'), {span:120, stopAtNewline:true});
  C.hoiPremium = after(t, new RegExp(L("Homeowner's Insurance Premium"), 'i'), {span:120, stopAtNewline:true, pick:'max'});
  C.prepaidInt    = after(t, new RegExp(L('Prepaid Interest') + '[^]{0,80}?\\)', 'i'), {span:60, stopAtNewline:true});
  C.perDiem       = N(grab(flat, /Prepaid Interest\s*\(\s*\$?([\d.]+)\s*per day/i));
  C.aggregateAdj  = after(t, new RegExp(L('Aggregate Adjustment'), 'i'), {span:40, stopAtNewline:true});
  C.realtorComm = after(t, new RegExp(L('Real Estate Commission'), 'i'), {span:120, stopAtNewline:true});
  if (C.aggregateAdj && C.aggregateAdj > 0 && /Aggregate Adjustment\s*-/.test(flat)) C.aggregateAdj = -C.aggregateAdj;

  /* Cash-to-close comparison — CD only */
  if (isCD){
    /* The section header is set in a black bar and often comes back damaged,
       so the three rows that matter are found on their own. */
    var cc = flat.match(new RegExp(L('Calculating Cash to Close') + '[^]{0,1400}', 'i'));
    {
      var seg = cc ? cc[0] : flat;
      /* the row is "Total Closing Costs (J)  $36,343.00  $45,056.77  YES" */
      var tcc = seg.match(new RegExp(L('Total Closing Costs (J)') + '[^A-Za-z]{0,40}', 'i'));
      if (tcc){ var tk = tokensIn(tcc[0]); if (tk.length) F.leClosingCosts = tk[0].v; }
      var dp = seg.match(new RegExp(L('Down Payment/Funds from Borrower') + '[^\\n]{0,60}', 'i'));
      if (dp){
        var nums = tokensIn(dp[0]);
        if (nums.length >= 2){ F.leDownPayment = nums[0].v; F.downPayment = nums[1].v; }
        else if (nums.length === 1) F.downPayment = nums[0].v;
      }
      /* the row reads "Seller Credits  $0  -$25,000.00  YES" — the final
         figure is the one that happened, the first is what the estimate said */
      var sc = flat.match(new RegExp(L('Seller Credits') + '[^A-Za-z]{0,40}', 'i'));
      if (sc){
        var sn = tokensIn(sc[0]);
        if (sn.length) F.sellerCredit = Math.abs(sn[sn.length-1].v);
        if (sn.length > 1) F.leSellerCredit = Math.abs(sn[0].v);
      }
    }
    if (!F.sellerCredit) F.sellerCredit = after(t, new RegExp(L('Seller Credit'), 'i'), {span:40, stopAtNewline:true});
  }
  if (F.downPayment == null && F.salePrice && F.loanAmount)
    F.downPayment = F.salePrice - F.loanAmount;

  if (F.loanAmount && F.salePrice) F.ltv = F.loanAmount / F.salePrice;
  if (F.sellerCredit && F.salePrice) F.concessionPct = F.sellerCredit / F.salePrice;

  /* The concession ceiling this file has to live inside. */
  if (F.concessionPct != null){
    var ltv = F.ltv || 0, type = F.loanType || 'Conventional', ceiling;
    if (type === 'FHA') ceiling = 0.06;
    else if (ltv > 0.90) ceiling = 0.03;
    else if (ltv > 0.75) ceiling = 0.06;
    else ceiling = 0.09;
    F.concessionCeiling = ceiling;
    F.concessionOk = F.concessionPct <= ceiling + 1e-9;
    o.flags.push('Seller credit of ' + usd(F.sellerCredit,0) + ' is '
      + (F.concessionPct*100).toFixed(2) + '% of the price. The ceiling for '
      + type + ' at ' + (ltv*100).toFixed(1) + '% loan-to-value is '
      + (ceiling*100).toFixed(0) + '% — ' + (F.concessionOk ? 'inside it.' : 'over it.'));
  }
  o.confidence = Object.keys(F).filter(function(k){ return F[k]!=null && F[k]!==''; }).length
               + Object.keys(C).filter(function(k){ return C[k]!=null; }).length;
  return o;
};

/* =================================================================== 3
   CROSS-CHECK — the contract against the disclosure
   =================================================================== */
DOC.crossCheck = function(contract, le){
  if (!contract || !le) return [];
  var out = [], cf = contract.fields, lf = le.fields;
  function cmp(label, a, b, tol, fmt){
    if (a == null || b == null) return;
    var d = a - b;
    out.push({ label:label, contract:a, le:b, diff:d,
               ok: Math.abs(d) <= (tol||1), fmt: fmt||'usd' });
  }
  cmp('Purchase price', cf.purchasePrice, lf.salePrice, 1);
  cmp('Down payment',   cf.downPayment,   lf.downPayment, 1);
  cmp('Loan amount',    cf.mortgageAmount, lf.loanAmount, 1);
  if (cf.closingDate && lf.closingDate)
    out.push({ label:'Closing date', contract:cf.closingDate, le:lf.closingDate,
               ok: cf.closingDate === lf.closingDate, fmt:'text' });
  if (cf.mortgageTermYrs && lf.termYears)
    out.push({ label:'Term (years)', contract:cf.mortgageTermYrs, le:lf.termYears,
               ok: cf.mortgageTermYrs === lf.termYears, fmt:'num' });
  return out;
};

/* =================================================================== 4
   LOADING INTO THE FILE
   =================================================================== */
DOC.loadLE = function(ix){
  var d = DOC.store()[ix]; if (!d || d.kind === 'contract') return;
  var S = G('S'); var f = d.parsed.fields, c = d.parsed.costs;
  if (S && S.loan){
    if (f.property)   S.loan.address = f.property;
    if (f.loanType)   S.loan.program = f.loanType;
    if (f.purpose)    S.loan.txn = f.purpose;
    if (f.salePrice)  S.loan.price = f.salePrice;
    if (f.loanAmount) S.loan.base = f.loanAmount;
    if (f.rate)       S.loan.rate = f.rate;
    if (f.termYears)  S.loan.term = f.termYears;
    if (f.pi != null) S.loan.piHold = f.pi;
    if (f.mi != null) S.loan.miHold = f.mi;
    if (S.dti){
      if (f.pi != null)     S.dti.pi = f.pi;
      if (f.mi != null)     S.dti.mi = f.mi;
      if (f.escrow != null) S.dti.taxes = f.escrow;
    }
    if (window.RECALC) window.RECALC();
  }
  var st = (function(){ try { return window.mortgageSuite.store; } catch(e){ return null; } })();
  if (st){
    if (f.salePrice)  st.setField('basePurchasePrice', f.salePrice, 'from the ' + d.parsed.form);
    if (f.rate)       st.setField('interestRate', f.rate/100, 'from the ' + d.parsed.form);
    if (f.sellerCredit) st.setField('sellerConcession', f.sellerCredit, 'from the ' + d.parsed.form);
  }
  say('Loaded', d.parsed.form + ' figures written into the loan setup.', 'good');
  DOC.render();
};
DOC.loadContract = function(ix){
  var d = DOC.store()[ix]; if (!d || d.kind !== 'contract') return;
  var S = G('S'), f = d.parsed.fields;
  if (S){
    if (S.loan){
      if (f.propertyAddress) S.loan.address = f.propertyAddress;
      if (f.purchasePrice)   S.loan.price = f.purchasePrice;
      if (f.mortgageAmount)  S.loan.base = f.mortgageAmount;
      if (f.mortgageTermYrs) S.loan.term = f.mortgageTermYrs;
      S.loan.txn = 'Purchase';
    }
    if (f.purchaser && !S.b1){
      var names = f.purchaser.split(/\s+and\s+/i);
      S.b1 = (names[0]||'').trim();
      if (names[1] && !S.b2) S.b2 = names[1].trim();
    }
    if (window.RECALC) window.RECALC();
  }
  if (f.closingDate && window.TAXPRO) TAXPRO.set('closing', f.closingDate);
  say('Loaded', 'Contract figures written into the loan setup.', 'good');
  DOC.render();
};

/* =================================================================== 5
   STORE AND UI
   =================================================================== */
var DK = 'parsedDocs.v1';
DOC.store = function(){ try { return JSON.parse(localStorage.getItem(DK)||'[]'); } catch(e){ return []; } };
DOC.put = function(list){ try { localStorage.setItem(DK, JSON.stringify(list.slice(0,12))); } catch(e){} };
DOC.add = function(name, text){
  var isContract = /Contract of Sale|Residential Contract|Purchaser shall/i.test(text)
                && !/Closing Disclosure|Loan Estimate/i.test(text);
  var parsed = isContract ? DOC.parseContract(text) : DOC.parseLE(text);
  if (!parsed) return null;
  var list = DOC.store();
  list.unshift({ name:name, kind:parsed.kind, at:new Date().toISOString(), parsed:parsed });
  DOC.put(list); DOC.render();
  say('Read ' + parsed.form, parsed.confidence + ' field(s) recovered from ' + name, 'good');
  return parsed;
};
DOC.remove = function(ix){ var l = DOC.store(); l.splice(ix,1); DOC.put(l); DOC.render(); };
DOC.clear = function(){ DOC.put([]); DOC.render(); };

DOC.readFiles = function(files){
  if (!files || !files.length) return;
  Array.prototype.forEach.call(files, function(file){
    var name = file.name;
    if (/\.pdf$/i.test(name) && window.pdfjsLib){
      var fr = new FileReader();
      fr.onload = function(){
        window.pdfjsLib.getDocument({data:new Uint8Array(fr.result)}).promise.then(function(pdf){
          var pages = [];
          for (var i=1;i<=pdf.numPages;i++) pages.push(i);
          return Promise.all(pages.map(function(n){
            return pdf.getPage(n).then(function(p){ return p.getTextContent(); })
              .then(function(tc){ return tc.items.map(function(it){ return it.str; }).join(' '); });
          }));
        }).then(function(texts){
          var text = texts.join('\n');
          if (text.replace(/\s/g,'').length < 200){
            say('No text layer', name + ' looks like a scan. Send it through the Documents tab, '
              + 'which renders the pages and runs OCR, then bring the text back here.', 'warn', 7000);
            return;
          }
          DOC.add(name, text);
        }).catch(function(e){ say('Could not read', name + ' — ' + e.message, 'warn'); });
      };
      fr.readAsArrayBuffer(file);
    } else {
      var r = new FileReader();
      r.onload = function(){ DOC.add(name, String(r.result)); };
      r.readAsText(file);
    }
  });
};
DOC.readPaste = function(){
  var el = $('docPaste'); if (!el || !el.value.trim()) return;
  DOC.add('Pasted text', el.value);
  el.value = '';
};

function fieldRows(obj, labels){
  return Object.keys(labels).map(function(k){
    var v = obj[k];
    if (v == null || v === '') return '';
    var d = labels[k];
    var shown = d[1] === 'usd' ? usd(v, d[2]===undefined?2:d[2])
              : d[1] === 'pct' ? (N(v)*100).toFixed(2)+'%'
              : d[1] === 'rate' ? N(v).toFixed(3)+'%'
              : esc(v);
    return '<tr><td>'+d[0]+'</td><td class="num">'+shown+'</td></tr>';
  }).join('');
}
var LE_LABELS = {
  lender:['Lender','text'], borrower:['Borrower','text'], seller:['Seller','text'],
  property:['Property','text'], settlement:['Settlement agent','text'], fileNo:['File number','text'],
  loanId:['Loan ID','text'], dateIssued:['Date issued','text'], closingDate:['Closing date','text'],
  disbursement:['Disbursement','text'], loanType:['Loan type','text'], purpose:['Purpose','text'],
  product:['Product','text'], termYears:['Term (years)','text'],
  salePrice:['Sale price','usd',0], loanAmount:['Loan amount','usd',0], ltv:['Loan-to-value','pct'],
  rate:['Interest rate','rate'], pi:['Principal & interest','usd'], mi:['Mortgage insurance','usd'],
  escrow:['Escrow','usd'], totalPayment:['Total monthly payment','usd'],
  downPayment:['Down payment','usd',0], sellerCredit:['Seller credit','usd',0],
  concessionPct:['Seller credit as % of price','pct'],
  closingCosts:['Closing costs','usd'], cashToClose:['Cash to close','usd'],
  apr:['APR','rate'], tip:['Total interest percentage','rate'],
  amountFinanced:['Amount financed','usd'], escrowYear1:['Escrowed costs, year 1','usd']
};
var COST_LABELS = {
  origination:['A. Origination charges','usd'], pointsPct:['Points (% of loan)','text'],
  points:['Points','usd'], originationFee:['Origination fee','usd'],
  didNotShop:['B. Services not shopped for','usd'], didShop:['C. Services shopped for','usd'],
  totalLoanCosts:['D. Total loan costs','usd'], govFees:['E. Government fees','usd'],
  prepaids:['F. Prepaids','usd'], initialEscrow:['G. Initial escrow','usd'],
  other:['H. Other','usd'], totalOther:['I. Total other costs','usd'],
  totalClosing:['J. Total closing costs','usd'],
  appraisal:['Appraisal','usd'], creditReport:['Credit report','usd'],
  lendersTitle:["Lender's title insurance",'usd'], ownersTitle:["Owner's title insurance",'usd'],
  settlementFee:['Settlement fee','usd'], recordingFees:['Recording fees','usd'],
  stateTaxStamps:['State tax / stamps','usd'], hoiPremium:['Hazard premium','usd'],
  prepaidInt:['Prepaid interest','usd'], perDiem:['Per diem interest','usd'],
  aggregateAdj:['Aggregate adjustment','usd'], realtorComm:['Real estate commission','usd']
};
var CONTRACT_LABELS = {
  form:['Form','text'], contractDate:['Contract date','text'],
  seller:['Seller','text'], sellerEstate:['Selling estate','text'], purchaser:['Purchaser','text'],
  propertyAddress:['Property','text'], taxMap:['Tax map','text'], county:['County','text'],
  purchasePrice:['Purchase price','usd',0], downPayment:['Downpayment','usd',0],
  downPct:['Downpayment %','pct'], balanceAtClosing:['Balance at closing','usd',0],
  mortgageAmount:['Mortgage contingency amount','usd',0],
  contingencyDays:['Commitment days','text'], mortgageTermYrs:['Minimum term (years)','text'],
  closingDate:['Closing on or about','text'], escrowBank:['Escrow held at','text'],
  sellerAttorney:["Seller's attorney",'text'], buyerAttorney:["Purchaser's attorney",'text']
};

DOC.render = function(){
  var host = $('docsBody'); if (!host) return;
  var list = DOC.store();
  var contract = null, les = [];
  list.forEach(function(d,ix){ d._ix = ix; if (d.kind==='contract') { if(!contract) contract = d; } else les.push(d); });

  var cards = list.map(function(d, ix){
    var p = d.parsed, isC = d.kind === 'contract';
    var labels = isC ? CONTRACT_LABELS : LE_LABELS;
    var src = isC ? p.fields : p.fields;
    return '<div class="card"><div class="card-top">'
      + '<span class="tag">' + (isC ? 'Contract' : p.kind.toUpperCase()) + '</span>'
      + '<span class="doc-name">' + esc(d.name) + '</span><div class="spacer"></div>'
      + '<span class="muted small">' + p.confidence + ' fields</span>'
      + '<button class="btn btn-primary btn-sm" onclick="DOCP.' + (isC?'loadContract':'loadLE') + '(' + ix + ')">Load into the file</button>'
      + '<button class="btn btn-light btn-sm" onclick="DOCP.remove(' + ix + ')">&times;</button></div>'
      + '<div class="card-body">'
      + (p.flags.length ? '<div class="note warn" style="margin-bottom:12px"><ul style="margin:0;padding-left:18px">'
          + p.flags.map(function(f){ return '<li>'+esc(f)+'</li>'; }).join('') + '</ul></div>' : '')
      + '<div class="doc-grid">'
      + '<table class="tbl"><tbody>' + fieldRows(isC ? Object.assign({form:p.form}, p.fields) : p.fields, labels) + '</tbody></table>'
      + (!isC ? '<table class="tbl"><tbody>' + fieldRows(p.costs, COST_LABELS) + '</tbody></table>' : '')
      + '</div></div></div>';
  }).join('');

  /* cross-check */
  var xc = '';
  if (contract && les.length){
    var rows = DOC.crossCheck(contract.parsed, les[0].parsed);
    if (rows.length){
      xc = '<div class="card"><div class="card-top"><span class="tag">Check</span>'
        + '<span class="doc-name">The contract against the ' + esc(les[0].parsed.form) + '</span></div>'
        + '<div class="card-body"><table class="tbl"><thead><tr><th>Line</th><th class="num">Contract</th>'
        + '<th class="num">' + esc(les[0].parsed.form) + '</th><th class="num">Difference</th></tr></thead><tbody>'
        + rows.map(function(r){
            var f = function(v){ return r.fmt==='usd' ? usd(v,0) : esc(v); };
            return '<tr class="' + (r.ok?'':'bad') + '"><td>' + r.label + '</td>'
              + '<td class="num">' + f(r.contract) + '</td><td class="num">' + f(r.le) + '</td>'
              + '<td class="num">' + (r.ok ? 'match' : (r.fmt==='usd' ? usd(r.diff,0) : 'differs')) + '</td></tr>';
          }).join('')
        + '</tbody></table></div></div>';
    }
  }

  /* side by side */
  var cmp = '';
  if (les.length >= 2){
    var keys = ['salePrice','loanAmount','ltv','rate','pi','mi','escrow','totalPayment',
                'downPayment','sellerCredit','closingCosts','cashToClose','apr'];
    cmp = '<div class="card"><div class="card-top"><span class="tag">Compare</span>'
      + '<span class="doc-name">Estimates side by side</span></div><div class="card-body">'
      + '<table class="tbl"><thead><tr><th>Line</th>'
      + les.slice(0,4).map(function(d){ return '<th class="num">' + esc(d.name.slice(0,22)) + '</th>'; }).join('')
      + '</tr></thead><tbody>'
      + keys.map(function(k){
          var lab = LE_LABELS[k]; if (!lab) return '';
          var vals = les.slice(0,4).map(function(d){ return d.parsed.fields[k]; });
          if (!vals.some(function(v){ return v != null; })) return '';
          var nums = vals.map(function(v){ return v==null?Infinity:N(v); });
          var best = (k==='cashToClose'||k==='closingCosts'||k==='rate'||k==='totalPayment'||k==='apr')
            ? nums.indexOf(Math.min.apply(null,nums)) : -1;
          return '<tr><td>' + lab[0] + '</td>' + vals.map(function(v,i){
            var s = v==null ? '—' : lab[1]==='usd' ? usd(v, lab[2]===undefined?2:lab[2])
                  : lab[1]==='pct' ? (N(v)*100).toFixed(2)+'%'
                  : lab[1]==='rate' ? N(v).toFixed(3)+'%' : esc(v);
            return '<td class="num"' + (i===best && v!=null ? ' style="color:var(--emerald);font-weight:800"' : '') + '>' + s + '</td>';
          }).join('') + '</tr>';
        }).join('')
      + '</tbody></table></div></div>';
  }

  host.innerHTML =
      '<div class="card"><div class="card-top"><span class="tag">Read</span>'
      + '<span class="doc-name">Purchase contract, Loan Estimate or Closing Disclosure</span>'
      + '<div class="spacer"></div>'
      + (list.length ? '<button class="btn btn-light btn-sm" onclick="DOCP.clear()">Clear all</button>' : '')
      + '</div><div class="card-body">'
      + '<div class="dz" onclick="document.getElementById(\'docFile\').click()">'
        + '<span class="cap">Drop a file, or click</span>'
        + '<div style="font-size:15px;margin-top:6px;font-weight:700">PDF with a text layer, or plain text</div>'
        + '<div class="muted small" style="margin-top:4px">A scanned contract has no text layer — send it through '
        + 'Documents for OCR first, then paste the text below.</div></div>'
      + '<input type="file" id="docFile" accept=".pdf,.txt" multiple style="display:none" '
        + 'onchange="DOCP.readFiles(this.files)">'
      + '<textarea id="docPaste" rows="4" placeholder="…or paste the text of a contract, LE or CD here"></textarea>'
      + '<div class="mnd-acts"><button class="btn btn-primary btn-sm" onclick="DOCP.readPaste()">Read this</button></div>'
      + '</div></div>'
    + xc + cmp + cards;
};

/* ---------------------------------------------------- tab and drag-drop */
function build(){
  if ($('panel-docparse')) return true;
  var bar = $('tabbar'); if (!bar) return false;
  var btn = document.createElement('button');
  btn.className = 'tab'; btn.setAttribute('data-tab','docparse');
  btn.setAttribute('title','Read a purchase contract, Loan Estimate or Closing Disclosure');
  btn.setAttribute('onclick', "switchTab('docparse')");
  btn.innerHTML = '<svg class="icon"><use href="#i-scan"/></svg><span>Contract &amp; LE</span>';
  var before = bar.querySelector('[data-tab="docs"]');
  if (before) bar.insertBefore(btn, before); else bar.appendChild(btn);

  var panel = document.createElement('section');
  panel.className = 'panel'; panel.id = 'panel-docparse';
  panel.innerHTML = '<div class="section-head"><div>'
    + '<h2><svg class="icon icon-lg" style="color:var(--sky)"><use href="#i-scan"/></svg>Contract, LE &amp; Closing Disclosure</h2>'
    + '<p>Read the deal off the paperwork: parties, price, downpayment, the mortgage contingency and its deadline '
    + 'from the contract; loan terms, every closing cost section and the seller credit from an estimate or disclosure. '
    + 'Then check the two against each other.</p></div></div><div id="docsBody"></div>';
  var anchor = $('panel-summary');
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(panel, anchor);
  return true;
}
function wrapSwitch(){
  if (typeof window.switchTab !== 'function' || window.switchTab.__doc) return false;
  var inner = window.switchTab;
  var w = function(t){
    if (t === 'docparse'){
      Array.prototype.forEach.call(document.querySelectorAll('#calc-root .panel'), function(p){
        p.classList.toggle('active', p.id === 'panel-docparse'); });
      Array.prototype.forEach.call(document.querySelectorAll('#tabbar .tab'), function(b){
        b.classList.toggle('active', b.dataset.tab === 'docparse'); });
      DOC.render();
      if (window.LOS && LOS.refreshSubs) LOS.refreshSubs('c:docparse');
      return;
    }
    var r = inner.apply(this, arguments);
    var p = $('panel-docparse'); if (p) p.classList.remove('active');
    return r;
  };
  w.__doc = true; window.switchTab = w;
  return true;
}
var tries = 0;
var poll = setInterval(function(){
  var ok = build(); wrapSwitch();
  if (ok){ DOC.render(); clearInterval(poll); }
  else if (++tries > 200) clearInterval(poll);
}, 60);
})();
