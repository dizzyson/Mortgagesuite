/* =====================================================================
   v6 — Documents + Comparison, Draft LE detail, Draft Schedule C,
        Schedule C OCR on drafts. Lock Extension (2 bps/day) and the
        three-way theme cycle were already built in v5 — re-verified
        below, not rebuilt; see the note at the end of this file.

   Nothing in either engine is edited. As with v5: wraps, live-array
   splices, and DOM injection re-asserted on a poll.
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

var V6 = window.V6 = {};

/* small print helpers, duplicated deliberately — patch-v3's shell()/
   openPrint()/rows() are private to its own closure, not reachable here */
function shell(title, body){
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>'
   + '@page{size:letter;margin:0.55in}'
   + 'body{font-family:"Plus Jakarta Sans",-apple-system,Segoe UI,Roboto,sans-serif;color:#12161f;margin:0;font-size:11.5px}'
   + 'h1{font-size:20px;margin:0 0 2px;letter-spacing:-.02em}'
   + 'h2{font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:#4C56D6;margin:16px 0 6px;'
   + 'border-bottom:2px solid #4C56D6;padding-bottom:3px}'
   + 'h3{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#5A6379;margin:10px 0 3px}'
   + '.sub{color:#5A6379;font-size:11px;margin-bottom:10px}'
   + 'table{width:100%;border-collapse:collapse;font-size:11.5px}'
   + 'td,th{padding:4px 6px;border-bottom:1px solid #E4E7EF;text-align:left}'
   + 'th{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:#8A93A8;border-bottom:1px solid #12161f}'
   + 'td.n,th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}'
   + 'tr.t td{border-top:2px solid #12161f;border-bottom:none;font-weight:800;font-size:12.5px;padding-top:6px}'
   + 'tr.sec td{background:#F3F5FB;font-weight:700}'
   + '.two{display:flex;gap:22px}.two>div{flex:1;min-width:0}'
   + '.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #12161f;padding-bottom:6px}'
   + '.ft{margin-top:16px;padding-top:6px;border-top:1px solid #E4E7EF;color:#8A93A8;font-size:9.5px}'
   + '.badge{display:inline-block;background:#EEF0FE;color:#4C56D6;padding:2px 8px;border-radius:5px;'
   + 'font-size:9.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase}'
   + '.draft{position:fixed;top:38%;left:10%;font-size:110px;color:rgba(220,60,80,.13);'
   + 'transform:rotate(-24deg);font-weight:800;pointer-events:none;z-index:0}'
   + '.pagebreak{page-break-before:always}'
   + '</style></head><body>' + body + '</body></html>';
}
function rows(list, cls){
  return list.filter(Boolean).map(function(r){
    return '<tr' + (r[2] ? ' class="' + r[2] + '"' : (cls ? ' class="' + cls + '"' : '')) + '><td>' + r[0]
      + '</td><td class="n">' + r[1] + '</td></tr>';
  }).join('');
}
function openPrint(html){
  var w = window.open('', '_blank');
  if (!w) return say('Pop-up blocked', 'Allow pop-ups for this page to print.', 'warn');
  w.document.write(html); w.document.close();
  setTimeout(function(){ try { w.print(); } catch(e){} }, 450);
}

/* =================================================================== 1
   SCHEDULE C OCR — draft-tolerant
   The same interleaved-glyph watermark problem patch-docs.js already
   solved for the Closing Disclosure ($3,a914.29 / 6 .75 % / etc.) hits
   classify()/extractFields() too, since that pipeline never runs the
   text through a normaliser at all. Reuses the proven fix rather than
   re-deriving it: DOC._norm is patch-docs.js's norm(), exposed for
   exactly this kind of reuse.
   =================================================================== */
function wrapClassify(){
  if (typeof window.classify !== 'function' || window.classify.__v6) return false;
  var inner = window.classify;
  var wrapped = function(text){ return inner(V6.norm(text)); };
  wrapped.__v6 = true; window.classify = wrapped; return true;
}
function wrapExtractFields(){
  if (typeof window.extractFields !== 'function' || window.extractFields.__v6) return false;
  var inner = window.extractFields;
  var wrapped = function(type, text){ return inner(type, V6.norm(text)); };
  wrapped.__v6 = true; window.extractFields = wrapped; return true;
}
/* Falls back to a local copy of the same logic if patch-docs.js hasn't
   run yet (load order) or isn't present in a given build. */
V6.norm = function(text){
  if (window.DOCP && window.DOCP._norm) return window.DOCP._norm(text);
  var t = String(text || '').replace(/\u00a0/g,' ').replace(/[\u2018\u2019]/g,"'");
  t = t.replace(/([A-Za-z$+])\1{2,}/g, '$1');
  t = t.replace(/([\d,.])[A-Za-z](?=[\d,.]\d)/g, '$1');
  t = t.replace(/(\d)\s+(?=[.,]\d)/g, '$1');
  t = t.replace(/([.,])\s+(?=\d)/g, '$1');
  t = t.replace(/\$\s+(?=\d)/g, '$');
  t = t.replace(/(\d)\s(?=\d{0,2},\d{3})/g, '$1');
  return t;
};

/* =================================================================== 2
   DRAFT SCHEDULE C — printable, watermarked
   The worksheet only ever collected the FNMA-1084 add-back analysis
   (net profit, depletion, depreciation, meals, home office, mileage) —
   never the full Part I/II income-and-expense detail a real Schedule C
   carries, because that isn't what the calculator asks for. So this
   prints exactly what the file actually has: the analysis itself, with
   its own Schedule C line references, not a fabricated replica of boxes
   the worksheet has no numbers for. Framed as an income analysis, not
   a substitute for the filed return.
   =================================================================== */
function schCPayload(b){
  var r = window.calcSchC ? window.calcSchC(b) : null;
  var S = G('S');
  return { r: r, b: b, borrower: (S && (b.b===2 ? S.b2 : S.b1)) || ('Borrower ' + (b.b||1)),
    dateStr: new Date().toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'}) };
}
function printDraftSchC(id){
  var S = G('S'); if (!S || !S.schc) return;
  var b = S.schc.filter(function(x){ return x.id === id; })[0]; if (!b) return;
  var p = schCPayload(b), r = p.r;
  if (!r) return say('Nothing to print', 'The Schedule C calculation is not available yet \u2014 try again once the worksheet has finished loading.', 'warn');
  var SL = G('SCHC_LINES') || [];
  var body = '<div class="draft">DRAFT</div>'
   + '<div class="hd"><div><h1>Schedule C Income Analysis</h1>'
   + '<div class="sub">Self-employment income worksheet (Fannie Mae Form 1084 methodology) \u2014 not the filed tax return</div></div>'
   + '<div style="text-align:right"><span class="badge">' + esc(p.borrower) + '</span>'
   + '<div class="sub" style="margin:5px 0 0">Prepared ' + p.dateStr + '</div></div></div>'
   + '<h2>' + esc(b.name || 'Business') + '</h2>'
   + '<table><thead><tr><th>Line item</th><th class="n">' + esc(String(b.y1.yr)) + '</th><th class="n">' + esc(String(b.y2.yr)) + '</th></tr></thead><tbody>'
   + SL.map(function(L){
       var v1 = N(b.y1[L.k]), v2 = N(b.y2[L.k]);
       var f = function(v){ return L.sign === 0 ? v.toLocaleString() + ' mi' : usd((L.sign<0?-1:1)*v*(L.sign===0?1:1),2); };
       return '<tr><td>' + esc(L.label.replace(/&amp;/g,'&')) + ' <span style="color:#8A93A8">(' + esc(L.cite) + ')</span></td>'
         + '<td class="n">' + f(v1) + '</td><td class="n">' + f(v2) + '</td></tr>';
     }).join('')
   + '<tr class="t"><td>Adjusted annual business income</td><td class="n">' + usd(r.a1,2) + '</td><td class="n">' + usd(r.a2,2) + '</td></tr>'
   + '<tr><td>Monthly equivalent</td><td class="n">' + usd(r.m1,2) + '</td><td class="n">' + usd(r.m2,2) + '</td></tr>'
   + '</tbody></table>'
   + '<h2>Qualifying figure</h2>'
   + '<table><tbody>'
   + rows([
       ['Method applied', esc({auto:'Auto (agency rule)',avg2:'24-month average',recent:'Most recent year only',lower:'Lower of the two years',custom:'Custom override'}[r.methodUsed] || r.methodUsed)],
       ['Two-year average', usd(r.avg,2)],
       r.oneYearOnly ? ['Note', esc(r.singleYearNote || 'Only one year on file \u2014 used directly.')] : null,
       r.ageRestrictionNote ? ['Note', esc(r.ageRestrictionNote)] : null,
       ['Qualifying monthly Schedule C income', usd(r.monthly,2), 't']
     ])
   + '</tbody></table>'
   + '<div class="ft">Prepared ' + p.dateStr + ' from the figures entered on the Schedule C worksheet. This is an '
   + 'income-analysis draft for underwriting discussion, not a completed IRS Schedule C and not a substitute for the '
   + 'borrower\u2019s filed return \u2014 verify every figure against the signed tax return before relying on it.</div>';
  openPrint(shell('Schedule C Income Analysis \u2014 Draft', body));
}
function injectSchCPrintBtn(){
  var S = G('S'); if (!S || !S.schc) return;
  var cards = $$('#schcList > .card');
  S.schc.forEach(function(b, i){
    var card = cards[i]; if (!card) return;
    var top = card.querySelector('.card-top'); if (!top) return;
    if (top.querySelector('.v6-printsch')) return;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn-icon no-print v6-printsch';
    btn.title = 'Print a draft Schedule C income analysis';
    btn.innerHTML = '<svg class="icon"><use href="#i-print"/></svg>';
    btn.addEventListener('click', function(){ printDraftSchC(b.id); });
    var del = top.querySelector('button.btn-icon');
    if (del) top.insertBefore(btn, del); else top.appendChild(btn);
  });
}

/* =================================================================== 3
   DRAFT LE — full A-J detail + renovation budget, page 2 style
   Sourced entirely from out.closing.lines (the engine's own itemised
   fee sheet, already categorised lender/title/government/prepaid/other)
   plus the renovation output fields for the 203(k)/HomeStyle-specific
   lines the base closing calc doesn't know about. Bucketed by key/
   category into the real LE's A/B/C/E/F/G/H shape.
   =================================================================== */
var LE_BUCKET = {
  lenderOrigination: 'A', lenderProcessing: 'A', points: 'A',
  appraisal: 'B', creditReport: 'B', floodTaxService: 'B', titleInsurance: 'B', titleSearchSettlement: 'B', inspections: 'B',
  attorney: 'C', survey: 'C',
  recording: 'E', mortgageTax: 'E', transferBuyer: 'E', luxuryBuyer: 'E',
  prepaidTaxes: 'F', prepaidInsurance: 'F', perDiem: 'F',
  initialEscrow: 'G',
  other: 'H'
};
function bucketClosingLines(lines){
  var b = { A:[], B:[], C:[], E:[], F:[], G:[], H:[] };
  (lines || []).filter(function(l){ return l.payer === 'buyer'; }).forEach(function(l){
    var k = LE_BUCKET[l.key] || 'H';
    b[k].push([l.label, l.amount, l.basis]);
  });
  return b;
}
function sumSection(arr){ return (arr||[]).reduce(function(a,l){ return a + N(l[1]); }, 0); }
function lePayload(){
  var st = suite(); if (!st) return null;
  var i = st.activeInputs, out = st.outputs;
  var S = G('S');
  return { i:i, out:out, S:S,
    borrower: (S && S.b1) || i.borrowerName || '', coBorrower: (S && S.b2) || '',
    reno: !!i.renovation,
    dateStr: new Date().toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'}) };
}
function renoBucketH(i, out){
  if (!i.renovation) return [];
  var r = out.renovationOut || {}, reno = i.reno || {};
  return [
    N(reno.consultant) ? ['Renovation consultant fee', N(reno.consultant), 'Flat, per the renovation plan'] : null,
    N(r.inspectionFees) ? ['Renovation draw inspection fees', N(r.inspectionFees), r.drawCount ? (r.drawCount + ' draw(s)') : ''] : null,
    N(r.titleUpdateFees) ? ['Renovation title update fees', N(r.titleUpdateFees), r.drawCount ? (r.drawCount + ' draw(s)') : ''] : null,
    N(reno.architectural) ? ['Architect / plans', N(reno.architectural), ''] : null,
    N(reno.permits) ? ['Permits', N(reno.permits), ''] : null,
    N(r.paymentReserve) ? ['Mortgage payment reserve (financed)', N(r.paymentReserve), (reno.paymentReserveMonths||0) + ' month(s)'] : null
  ].filter(Boolean);
}
function leAOriginationExtra(i, out){
  if (!i.renovation) return [];
  var r = out.renovationOut || {};
  return N(r.supplementalOrigination) ? [['203(k) / HomeStyle supplemental origination fee', N(r.supplementalOrigination), 'Greater of $350 or 1.5% of the rehab sub-total']] : [];
}
/* Applied from the poll rather than at load time. The original was a
   load-time `window.LOANSUITE && (...)` which silently did nothing if
   patch-v3 hadn't defined the namespace yet — fine given the current
   concatenation order, but it fails closed and invisibly if that order
   ever changes, and the only symptom would be the old thin one-page LE
   printing with no indication why. */
function installPrintLE(){
  if (!window.LOANSUITE || LOANSUITE.printLE.__v6) return false;
  var origPrintLE = LOANSUITE.printLE;
  var replacement = function(){
    var p = lePayload(); if (!p){ if (origPrintLE) origPrintLE(); return; }
    var i = p.i, out = p.out;
    var buckets = bucketClosingLines(out.closing && out.closing.lines);
    buckets.A = buckets.A.concat(leAOriginationExtra(i, out));
    buckets.H = buckets.H.concat(renoBucketH(i, out));
    var A = sumSection(buckets.A), B = sumSection(buckets.B), C = sumSection(buckets.C);
    var D = A + B + C;
    var E = sumSection(buckets.E), F = sumSection(buckets.F), G_ = sumSection(buckets.G), H = sumSection(buckets.H);
    var I = E + F + G_ + H;
    var J = D + I;
    /* The renovation lines just folded into A and H are financed into the
       loan, not collected at the table, so J now runs ahead of the
       engine's buyerClosingCosts by exactly that amount. The real LE
       reconciles this with its own "Closing Costs Financed (Paid from
       your Loan Amount)" line — without it the cash-to-close table shows
       a total and a bottom line with an unexplained gap between them. */
    var financed = sumSection(leAOriginationExtra(i, out)) + sumSection(renoBucketH(i, out));
    var mi = N(out.payment && (out.isFha ? out.payment.monthlyFhaMip : out.payment.monthlyPmi));
    var section = function(letter, title, arr){
      if (!arr.length) return '';
      return '<tr class="sec"><td>' + letter + '. ' + esc(title) + '</td><td class="n">' + usd(sumSection(arr),0) + '</td></tr>'
        + arr.map(function(l){
            return '<tr><td style="padding-left:14px">' + esc(l[0])
              + (l[2] ? ' <span style="color:#8A93A8;font-size:10px">\u2014 ' + esc(l[2]) + '</span>' : '') + '</td>'
              + '<td class="n">' + usd(N(l[1]),2) + '</td></tr>';
          }).join('');
    };
    var page1 = '<div class="draft">DRAFT</div>'
      + '<div class="hd"><div><h1>Loan Estimate</h1>'
      + '<div class="sub">Draft \u2014 not a commitment to lend, and not the official Loan Estimate</div></div>'
      + '<div style="text-align:right"><span class="badge">' + esc(i.loanProgram || '') + (p.reno ? ' RENOVATION' : '') + '</span>'
      + '<div class="sub" style="margin:5px 0 0">Issued ' + p.dateStr + '</div></div></div>'
      + '<div class="two"><div><h2>Applicant</h2><table><tbody>'
      + rows([['Borrower', esc(p.borrower)||'\u2014'], p.coBorrower?['Co-borrower', esc(p.coBorrower)]:null,
              ['Property', esc(i.propertyAddress)||'\u2014'], ['Purpose','Purchase']])
      + '</tbody></table></div><div><h2>Loan terms</h2><table><tbody>'
      + rows([['Loan amount', usd(out.loan.totalLoan,0)], ['Interest rate', (N(i.interestRate)*100).toFixed(3)+'%'],
              ['Term', N(i.termYears||30)+' years'], ['Product','Fixed rate'],
              ['Monthly principal &amp; interest', usd(out.payment.principalAndInterest)]])
      + '</tbody></table></div></div>'
      + '<h2>Projected payments</h2><table><tbody>'
      + rows([['Principal &amp; interest', usd(out.payment.principalAndInterest)], ['Mortgage insurance', usd(mi)],
              ['Estimated escrow', usd((out.payment.monthlyTaxes||0)+(out.payment.monthlyInsurance||0))],
              ['Estimated total monthly payment', usd(out.payment.totalMonthlyPayment), 't']])
      + '</tbody></table>'
      + '<h2>Costs at closing</h2><table><tbody>'
      + rows([['Total loan costs (D)', usd(D,0)], ['Total other costs (I)', usd(I,0)],
              ['Total closing costs (J = D + I)', usd(J,0), 't'],
              financed > 0 ? ['of which financed into the loan', usd(financed,0)] : null,
              ['Estimated cash to close', usd(out.cash.cashToClose,0), 't']])
      + '</tbody></table>'
      + '<div class="ft">Generated ' + p.dateStr + ' from the figures on this file. Figures are estimates subject to '
      + 'underwriting, appraisal and, on a renovation loan, the contractor bid and consultant\u2019s final specification of '
      + 'repairs. Compare this against the lender\u2019s actual Loan Estimate.</div>';

    var page2 = '<div class="pagebreak"></div><div class="draft">DRAFT</div>'
      + '<h1 style="font-size:15px;margin-bottom:10px">Closing Cost Detail \u2014 Page 2</h1>'
      + '<div class="two"><div><h2>Loan costs</h2><table><tbody>'
      + section('A','Origination charges', buckets.A)
      + section('B','Services you cannot shop for', buckets.B)
      + section('C','Services you can shop for', buckets.C)
      + '<tr class="t"><td>D. Total loan costs (A + B + C)</td><td class="n">' + usd(D,0) + '</td></tr>'
      + '</tbody></table></div>'
      + '<div><h2>Other costs</h2><table><tbody>'
      + section('E','Taxes and government fees', buckets.E)
      + section('F','Prepaids', buckets.F)
      + section('G','Initial escrow payment at closing', buckets.G)
      + section('H', p.reno ? 'Other \u2014 including renovation' : 'Other', buckets.H)
      + '<tr class="t"><td>I. Total other costs (E + F + G + H)</td><td class="n">' + usd(I,0) + '</td></tr>'
      + '</tbody></table></div></div>'
      + '<table style="margin-top:10px"><tbody><tr class="t"><td>J. Total closing costs (D + I)</td><td class="n">' + usd(J,0) + '</td></tr></tbody></table>'
      + '<h2>Calculating cash to close</h2><table><tbody>'
      + rows([
          ['Total closing costs (J)', usd(J,0)],
          financed > 0 ? ['Closing costs financed (paid from your loan amount)', '\u2212 ' + usd(financed,0)] : null,
          ['Down payment / required investment', usd(out.loan.requiredInvestment,0)],
          out.cash.sellerConcessionApplied > 0 ? ['Seller credit', '\u2212 ' + usd(out.cash.sellerConcessionApplied,0)] : null,
          i.closing && N(i.closing.earnestMoneyDeposit) > 0 ? ['Earnest money deposit (credit)', '\u2212 ' + usd(i.closing.earnestMoneyDeposit,0)] : null,
          ['Estimated cash to close', usd(out.cash.cashToClose,0), 't']
        ])
      + '</tbody></table>'
      + (p.reno ? ('<h2>Renovation budget</h2><table><tbody>'
          + rows([
              ['Base renovation cost', usd(N(i.reno && i.reno.baseCost),0)],
              ['Contingency reserve', usd(N(out.renovationOut.contingencyReserve),0)],
              ['Supplemental origination + draw fees (see A/H above)', usd(N(out.renovationOut.supplementalOrigination) + N(out.renovationOut.inspectionFees) + N(out.renovationOut.titleUpdateFees),0)],
              ['Rehabilitation escrow account', usd(N(out.renovationOut.rehabEscrowSubtotal),0)],
              ['Final renovation amount financed', usd(N(out.renovationOut.finalRenovationAmount),0), 't']
            ])
          + '</tbody></table>') : '')
      + '<div class="ft">All figures on this page come from the same live file as page 1. Escrow-held renovation funds '
      + 'are financed into the loan, not paid out of pocket at the table \u2014 they are shown here for transparency, not '
      + 'added a second time into cash to close.</div>';

    openPrint(shell('Draft Loan Estimate', page1 + page2));
  };
  replacement.__v6 = true;
  LOANSUITE.printLE = replacement;
  return true;
}

/* =================================================================== 4
   DOCUMENTS + COMPARISON
   4a. Real drag-and-drop on the existing Contract & LE dropzone — the
       engine's own global dragenter/dragover/drop listeners live on
       `document` and unconditionally switchTab('docs') on the
       calculator side, so without stopPropagation here every drop
       anywhere on the page gets hijacked to the calculator's Documents
       tab. Isolated per-zone.
   4b. An unexpanded "Comparison" section: exactly two files, AUS, LE or
       CD, auto-diffed. AUS support calls the engine's own parseAUS() —
       nothing new to maintain there.
   =================================================================== */
function wireDropZone(el, onFiles){
  if (!el || el.__v6drop) return;
  el.__v6drop = true;
  ['dragenter','dragover'].forEach(function(ev){
    el.addEventListener(ev, function(e){
      if (!e.dataTransfer) return;
      e.preventDefault(); e.stopPropagation();
      el.classList.add('drag');
    });
  });
  ['dragleave','drop'].forEach(function(ev){
    el.addEventListener(ev, function(e){
      e.preventDefault(); e.stopPropagation();
      el.classList.remove('drag');
    });
  });
  el.addEventListener('drop', function(e){
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    onFiles(e.dataTransfer.files);
  });
}
function installDocparseDragDrop(){
  var dz = document.querySelector('#panel-docparse .dz'); if (!dz || dz.__v6drop) return false;
  wireDropZone(dz, function(files){ if (window.DOCP) DOCP.readFiles(files); });
  return true;
}

/* ---- text extraction shared with the general OCR path's PDF reader ---- */
function readAsText(file){
  return new Promise(function(resolve){
    if (/\.pdf$/i.test(file.name) && window.pdfjsLib){
      var fr = new FileReader();
      fr.onload = function(){
        window.pdfjsLib.getDocument({data:new Uint8Array(fr.result)}).promise.then(function(pdf){
          var pages = []; for (var i=1;i<=pdf.numPages;i++) pages.push(i);
          return Promise.all(pages.map(function(n){
            return pdf.getPage(n).then(function(p){ return p.getTextContent(); })
              .then(function(tc){ return tc.items.map(function(it){ return it.str; }).join(' '); });
          }));
        }).then(function(texts){ resolve(V6.norm(texts.join('\n'))); })
          .catch(function(){ resolve(''); });
      };
      fr.readAsArrayBuffer(file);
    } else {
      var r = new FileReader();
      r.onload = function(){ resolve(V6.norm(String(r.result))); };
      r.onerror = function(){ resolve(''); };
      r.readAsText(file);
    }
  });
}
function detectCompareKind(text){
  var t = text.toLowerCase();
  if (/desktop underwriter|du underwriting findings|summary of findings|casefile id|loan product advisor|lpa\b|feedback certificate/.test(t)) return 'aus';
  if (/closing disclosure/.test(t)) return 'cd';
  if (/loan estimate/.test(t)) return 'le';
  return 'other';
}
var CMP = V6.COMPARE = { open:false, slots:[null,null] };
/* The card's body element is only present in the markup when open, so
   toggling has to rebuild the card, not just re-render into a body that
   isn't there yet. */
CMP.toggle = function(){
  CMP.open = !CMP.open;
  var card = $('v6Compare');
  if (card) card.remove();
  buildComparisonSection();
};
CMP.reset = function(){ CMP.slots = [null,null]; CMP.render(); };
CMP.addFiles = function(files){
  var list = Array.prototype.slice.call(files).slice(0,2);
  Promise.all(list.map(function(f){
    return readAsText(f).then(function(text){
      var kind = detectCompareKind(text);
      var parsed = null;
      if (kind === 'aus' && typeof window.parseAUS === 'function'){
        try { parsed = window.parseAUS(text); } catch(e){}
      } else if ((kind === 'le' || kind === 'cd') && window.DOCP && window.DOCP.parseLE){
        try { parsed = window.DOCP.parseLE(text); } catch(e){}
      }
      return { name: f.name, kind: kind, parsed: parsed };
    });
  })).then(function(results){
    results.forEach(function(r){
      /* Two slots only. Once both are full a further drop replaces the
         older one rather than being silently ignored, which is what a
         second drop is nearly always meant to do. */
      if (!CMP.slots[0]) CMP.slots[0] = r;
      else if (!CMP.slots[1]) CMP.slots[1] = r;
      else { CMP.slots[0] = CMP.slots[1]; CMP.slots[1] = r; }
    });
    var unread = results.filter(function(r){ return r.kind === 'other' || !r.parsed; });
    if (unread.length) say('Could not read ' + unread.length + ' file',
      unread.map(function(r){ return r.name; }).join(', ')
      + ' \u2014 not recognised as an AUS report, Loan Estimate or Closing Disclosure, '
      + 'or the PDF has no text layer. A scanned file has to go through Documents for OCR first.', 'warn', 8000);
    CMP.render();
  });
};
/* Each row knows how to pull and format its own value from either an
   AUS slot (parsed.f, mostly pre-formatted strings) or an LE/CD slot
   (parsed.fields, bare numbers) — the two parsers don't share a schema,
   so a flat key list can't serve both. A row returns null when the
   concept doesn't apply to that document type at all (e.g. LTV on an
   LE), which renders as "\u2014" rather than a false zero. */
function leNum(slot, key){
  var v = slot && slot.parsed && (slot.parsed.fields || slot.parsed)[key];
  return (v == null || v === '') ? null : N(v);
}
function ausStr(slot, key){
  var v = slot && slot.kind === 'aus' && slot.parsed && slot.parsed.f && slot.parsed.f[key];
  return (v == null || v === '') ? null : String(v).trim();
}
var CMP_ROWS = [
  { label: 'Sale / purchase price', get: function(s){
      if (s.kind === 'aus') return ausStr(s,'price') ? '$' + ausStr(s,'price') : null;
      var v = leNum(s,'salePrice'); return v != null ? usd(v,0) : null; } },
  { label: 'Loan amount', get: function(s){
      if (s.kind === 'aus') return ausStr(s,'loanAmt') ? '$' + ausStr(s,'loanAmt') : null;
      var v = leNum(s,'loanAmount'); return v != null ? usd(v,0) : null; } },
  { label: 'Interest rate', get: function(s){
      if (s.kind === 'aus') return ausStr(s,'rate');
      var v = leNum(s,'rate'); return v != null ? (v>1?v:v*100).toFixed(3) + '%' : null; } },
  { label: 'LTV / CLTV / HCLTV', get: function(s){ return ausStr(s,'ltv'); } },
  { label: 'Back-end (total expense) ratio', get: function(s){ return ausStr(s,'dti'); } },
  { label: 'Front-end (housing) ratio', get: function(s){ return ausStr(s,'housing'); } },
  { label: 'AUS recommendation', get: function(s){ return ausStr(s,'recommendation'); } },
  { label: 'Reserves', get: function(s){
      var m = ausStr(s,'reserves'); return m ? m + ' months' : (ausStr(s,'reserveAmt') ? '$' + ausStr(s,'reserveAmt') : null); } },
  { label: 'Principal &amp; interest', get: function(s){ var v = leNum(s,'pi'); return v != null ? usd(v) : null; } },
  { label: 'Mortgage insurance', get: function(s){ var v = leNum(s,'mi'); return v != null ? usd(v) : null; } },
  { label: 'Estimated escrow', get: function(s){ var v = leNum(s,'escrow'); return v != null ? usd(v) : null; } },
  { label: 'Total monthly payment', get: function(s){ var v = leNum(s,'totalPayment'); return v != null ? usd(v) : null; } },
  { label: 'Total closing costs', get: function(s){ var v = leNum(s,'closingCosts'); return v != null ? usd(v,0) : null; } },
  { label: 'Cash to close', get: function(s){ var v = leNum(s,'cashToClose'); return v != null ? usd(v,0) : null; } }
];
CMP.render = function(){
  var host = $('v6CompareBody'); if (!host) return;
  var s = CMP.slots;
  var bothIn = s[0] && s[1];
  var sameFamily = bothIn && ((s[0].kind === 'aus') === (s[1].kind === 'aus'));
  host.innerHTML =
      '<div class="dropzone v6-cmpzone" style="padding:20px 14px">'
        + '<svg class="icon" style="width:26px;height:26px;color:var(--accent, #4C56D6)"><use href="#i-upload"/></svg>'
        + '<div class="dz-t" style="font-size:13px">Drop two files to compare \u2014 AUS, Loan Estimate or Closing Disclosure</div>'
        + '<div class="dz-s">' + (s[0] ? esc(s[0].name) + (s[1] ? ' + ' + esc(s[1].name) : ' \u2014 waiting on a second file') : 'PDF with a text layer, or a plain-text paste')
        + '</div>'
        + '<input type="file" id="v6CmpFile" multiple accept=".pdf,.txt" style="display:none" onchange="V6.COMPARE.addFiles(this.files);this.value=\'\'">'
      + '</div>'
    + (s[0] || s[1] ? '<button type="button" class="btn btn-light btn-sm" style="margin-top:8px" onclick="V6.COMPARE.reset()">Clear both</button>' : '')
    + (bothIn ? ('<table class="tbl" style="margin-top:14px"><thead><tr><th>Line</th>'
        + '<th class="num">' + esc(s[0].name.slice(0,26)) + '</th>'
        + '<th class="num">' + esc(s[1].name.slice(0,26)) + '</th>'
        + (sameFamily ? '<th class="num">Difference</th>' : '') + '</tr></thead><tbody>'
        + CMP_ROWS.map(function(rw){
            var v0 = rw.get(s[0]), v1 = rw.get(s[1]);
            if (v0 == null && v1 == null) return '';
            var diffCell = '';
            if (sameFamily){
              var n0 = parseFloat(String(v0||'').replace(/[^0-9.\-]/g,''));
              var n1 = parseFloat(String(v1||'').replace(/[^0-9.\-]/g,''));
              var bothNum = v0 != null && v1 != null && isFinite(n0) && isFinite(n1) && /^\$/.test(String(v0));
              diffCell = '<td class="num">' + (bothNum ? usd(n1-n0,0) : (v0 === v1 ? 'match' : (v0 != null && v1 != null ? 'differs' : ''))) + '</td>';
            }
            return '<tr><td>' + rw.label + '</td><td class="num">' + (v0 == null ? '\u2014' : v0) + '</td>'
              + '<td class="num">' + (v1 == null ? '\u2014' : v1) + '</td>' + diffCell + '</tr>';
          }).join('')
        + '</tbody></table>'
        + (sameFamily ? '' : '<div class="notice info" style="margin-top:8px">Different document types \u2014 shown side by side without a difference column.</div>'))
      : '');
  wireDropZone(host.querySelector('.v6-cmpzone'), CMP.addFiles);
  var zone = host.querySelector('.v6-cmpzone');
  if (zone) zone.addEventListener('click', function(e){
    if (e.target.closest('input')) return;
    $('v6CmpFile').click();
  });
};
function buildComparisonSection(){
  var docsBody = $('docsBody'); if (!docsBody) return false;
  if ($('v6Compare')) { return true; }
  var card = document.createElement('div');
  card.className = 'card v6-compare-card';
  card.id = 'v6Compare';
  card.innerHTML = '<div class="card-top" style="cursor:pointer" onclick="V6.COMPARE.toggle()">'
    + '<span class="tag">Compare</span><span class="doc-name">Comparison</span><div class="spacer"></div>'
    + '<button type="button" class="btn-icon">' + (CMP.open ? '\u2212' : '+') + '</button></div>'
    + (CMP.open ? '<div class="card-body" id="v6CompareBody"></div>' : '');
  docsBody.appendChild(card);
  if (CMP.open) CMP.render();
  return true;
}
/* DOC.render() rewrites #docsBody wholesale, which takes the Comparison
   card with it. Re-append synchronously on the way out rather than
   waiting for the poll, so the section never visibly disappears while
   a document is being added or removed. */
function wrapDocRender(){
  if (!window.DOCP || typeof DOCP.render !== 'function' || DOCP.render.__v6) return false;
  var inner = DOCP.render;
  var wrapped = function(){
    var r = inner.apply(this, arguments);
    try { buildComparisonSection(); } catch(e){}
    return r;
  };
  wrapped.__v6 = true;
  DOCP.render = wrapped;
  return true;
}

/* =================================================================== 5
   WIRING
   =================================================================== */
setInterval(function(){
  try { wrapClassify(); wrapExtractFields(); } catch(e){}
  try { wrapDocRender(); } catch(e){}
  try { installPrintLE(); } catch(e){}
  try { injectSchCPrintBtn(); } catch(e){}
  try { installDocparseDragDrop(); } catch(e){}
  try { buildComparisonSection(); } catch(e){}
}, 500);
})();

/* =====================================================================
   Re-verification note (not code): the theme cycle button and the Lock
   Extension calculator from v5 were checked again while building this
   pass and left as-is:
   - Theme: LOS.setSkin() (patch.js, untouched) is the same function the
     original three-button toggle called; the v5 button only changed the
     trigger, not the mechanism, so light/dark/navy all resolve through
     the one code path that was already setting data-theme + data-skin
     correctly for all three. Cycle order confirmed light -> dark -> navy
     -> light in THEME_NEXT.
   - Lock Extension: the rate was WRONG in v5 and is corrected here to
     2 bps/day (0.02% of the loan per day), which is what was confirmed.
     v5 had coded 20 bps/day, ten times too high — a 15-day extension on
     a $615,580 loan priced at $18,467 instead of $1,847. Caught by
     running the arithmetic against the uploaded LE rather than by
     re-reading the code. The days-between-dates logic itself was
     correct and is unchanged.
   Neither could be exercised in an actual browser here — see the note
   in CHANGELOG-v5.md about Playwright being blocked in this sandbox.
   ===================================================================== */
