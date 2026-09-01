/* =====================================================================
   v4 — one tab row on the suite, and lookups that actually pull data in
   ===================================================================== */
(function(){
"use strict";
var $  = function(id){ return document.getElementById(id); };
var $$ = function(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };
function N(v){ v = parseFloat(v); return isFinite(v) ? v : 0; }
function usd(v,dp){ dp = dp===undefined?0:dp; var n=N(v);
  return (n<0?'\u2212':'')+'$'+Math.abs(n).toLocaleString('en-US',
    {minimumFractionDigits:dp,maximumFractionDigits:dp}); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){
  return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
function suite(){ try { return window.mortgageSuite.store; } catch(e){ return null; } }
function say(t,b,k,ms){ if (window.LOS && LOS.say) LOS.say(t,b,k,ms); }

var V4 = window.PULL = {};

/* =================================================================== 1
   PULLING A PAGE IN
   A page served from a file path cannot read another origin directly, so
   the request goes through a public read-only relay. Three are tried in
   turn; the first that answers wins. Nothing is sent but the URL being
   read, and no key is involved.
   =================================================================== */
V4.RELAYS = [
  { name:'r.jina.ai',  url:function(u){ return 'https://r.jina.ai/' + u; } },
  { name:'allorigins', url:function(u){ return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); } },
  { name:'corsproxy',  url:function(u){ return 'https://corsproxy.io/?' + encodeURIComponent(u); } }
];
V4.timeout = 12000;

function fetchText(url){
  var relays = V4.RELAYS.slice();
  function attempt(i){
    if (i >= relays.length) return Promise.reject(new Error('every relay refused or timed out'));
    var ctl = ('AbortController' in window) ? new AbortController() : null;
    var t = setTimeout(function(){ if (ctl) ctl.abort(); }, V4.timeout);
    return fetch(relays[i].url(url), ctl ? { signal: ctl.signal } : {})
      .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function(txt){
        clearTimeout(t);
        if (!txt || txt.length < 200) throw new Error('empty response');
        return { text: strip(txt), via: relays[i].name };
      })
      .catch(function(){ clearTimeout(t); return attempt(i+1); });
  }
  return attempt(0);
}
/* Markdown from a relay is already close to plain text; raw HTML is not. */
function strip(s){
  if (!/<[a-z!]/i.test(s.slice(0, 4000))) return s;
  return s.replace(/<script[^]*?<\/script>/gi,' ')
          .replace(/<style[^]*?<\/style>/gi,' ')
          .replace(/<[^>]+>/g,'\n')
          .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')
          .replace(/&#(\d+);/g, function(m,d){ return String.fromCharCode(+d); })
          .replace(/\n{3,}/g,'\n\n');
}
V4.fetchText = fetchText;

/* =================================================================== 2
   MORTGAGE RATES — read from wherever answers first
   =================================================================== */
V4.RATE_SOURCES = [
  { name:'Mortgage News Daily', url:'https://www.mortgagenewsdaily.com/mortgage-rates' },
  { name:'Bankrate',            url:'https://www.bankrate.com/mortgages/mortgage-rates/' },
  { name:'Money',               url:'https://money.com/current-mortgage-rates/' },
  { name:'Zillow Home Loans',   url:'https://www.zillow.com/mortgage-rates/' }
];
/* Each row is a label and the first sane percentage that follows it. The
   specific products are matched before the plain 30-year, because
   "30-year fixed-rate FHA mortgage" contains the conventional label. */
var RATE_KEYS = [
  ['fha30',   /\bfha\b/i,                          /(?:fha)/i],
  ['va30',    /\bva\b(?!lue)/i,                    /(?:\bva\b)/i],
  ['jumbo30', /\bjumbo\b/i,                        /(?:jumbo)/i],
  ['arm76',   /(7\s*\/\s*6[\s\w]{0,10}arm|7\s*\/\s*1\s*arm|\barm\b)/i, /(?:arm)/i],
  ['fixed15', /15[\s-]*(?:yr|year)/i,              null],
  ['fixed30', /30[\s-]*(?:yr|year)/i,              null]
];
/* A window that names a more specific product does not describe the
   plain 30-year fixed. */
var OTHERS = /\b(fha|va|jumbo|arm|15[\s-]*(?:yr|year)|equity|heloc|refinanc)/i;
V4.extractRates = function(text){
  var out = {}, t = String(text);
  RATE_KEYS.forEach(function(k){
    var rx = new RegExp(k[1].source, 'gi'), m, guard = 0;
    while ((m = rx.exec(t)) && guard++ < 60){
      var end = m.index + m[0].length;
      var win = t.slice(end, end + 160);
      var pm = win.match(/(\d{1,2}\.\d{2,3})\s*%/);
      if (!pm) continue;
      var v = parseFloat(pm[1]);
      if (!(v >= 2 && v <= 15)) continue;
      /* Only the words between this label and its own figure can
         disqualify it. Looking further reaches into the next row. */
      var span = win.slice(0, pm.index);
      if (k[0] === 'fixed30' && OTHERS.test(span)) continue;
      if (k[0] === 'fixed15' && /\b(fha|va|jumbo|arm)\b/i.test(span)) continue;
      /* A product row still has to be a thirty-year one. */
      if (k[2]){
        var around = t.slice(Math.max(0, m.index - 60), end + 40);
        if (!/30\s*[-\s]*(?:yr|year)?/i.test(around)) continue;
      }
      out[k[0]] = { rate:v, change:0 };
      break;
    }
  });
  return Object.keys(out).length ? out : null;
};

V4.pullRates = function(){
  var btn = $('mndFetch');
  if (btn){ btn.disabled = true; btn.textContent = 'Reading…'; }
  var srcs = V4.RATE_SOURCES.slice(), found = null, usedName = '', usedVia = '';
  function step(i){
    if (i >= srcs.length) return Promise.resolve();
    return fetchText(srcs[i].url).then(function(res){
      var got = V4.extractRates(res.text);
      if (got && Object.keys(got).length >= (found ? Object.keys(found).length + 1 : 2)){
        found = got; usedName = srcs[i].name; usedVia = res.via;
      }
      /* the daily survey is the one we want; stop as soon as it is complete */
      if (found && Object.keys(found).length >= 5) return;
      return step(i+1);
    }).catch(function(){ return step(i+1); });
  }
  return step(0).then(function(){
    if (btn){ btn.disabled = false; btn.textContent = 'Pull rates online'; }
    if (!found){
      if (window.RATES) RATES.note('No source answered. The relays may be blocked on this network — '
        + 'the paste box below always works.');
      return say('Nothing came back', 'No rate source answered through any relay.', 'warn');
    }
    if (window.RATES){
      RATES.apply({ rows: found, asOf: new Date().toISOString().slice(0,10) }, usedName + ' via ' + usedVia);
    }
    say('Rates updated', Object.keys(found).length + ' rate(s) read from ' + usedName
      + '. Baseline is now ' + (found.fixed30 ? found.fixed30.rate.toFixed(3) + '%' : 'unchanged') + '.', 'good', 7000);
  });
};

/* =================================================================== 3
   PROPERTY — pull what is publicly posted about an address
   =================================================================== */
function firstMoney(text, res, lo, hi){
  for (var i=0;i<res.length;i++){
    var rx = new RegExp(res[i], 'i'), m = text.match(rx);
    if (!m) continue;
    var win = text.slice(m.index, m.index + 200);
    var nums = win.match(/\$\s?[\d,]{4,12}/g) || [];
    for (var j=0;j<nums.length;j++){
      var v = parseFloat(nums[j].replace(/[^\d]/g,''));
      if (isFinite(v) && v >= (lo||1000) && v <= (hi||9e7)) return v;
    }
  }
  return null;
}
function firstNum(text, res, lo, hi, before){
  for (var i=0;i<res.length;i++){
    var rx = new RegExp(res[i], 'i'), m = text.match(rx);
    if (!m) continue;
    /* "1,584 sqft" puts the figure in front of the unit; "built in 1952"
       puts it after. A dollar amount is never either of them. */
    var win = before
      ? text.slice(Math.max(0, m.index - 30), m.index)
      : text.slice(m.index, m.index + 90);
    var nums = win.match(/(?:\$\s?)?\b\d{1,7}(?:,\d{3})?\b/g) || [];
    if (before) nums = nums.reverse();
    for (var j=0;j<nums.length;j++){
      if (/^\$/.test(nums[j])) continue;
      var v = parseFloat(nums[j].replace(/,/g,''));
      if (isFinite(v) && v >= lo && v <= hi) return v;
    }
  }
  return null;
}
V4.extractProperty = function(text){
  var t = String(text), f = {};
  f.currentValue = firstMoney(t, ['zestimate','estimated market value','home value','avm','assessed value'], 20000, 5e7);
  f.lastSoldPrice = firstMoney(t, ['last sold for','sold on','sold price','last sale price'], 10000, 5e7);
  f.annualTax = firstMoney(t, ['annual tax','property taxes','tax assessment','taxes:'], 200, 200000);
  f.areaRent = firstMoney(t, ['rent zestimate','estimated rent','median rent','average rent','rent:'], 300, 30000);
  f.sqFt = firstNum(t, ['sq\\s?\\.?\\s?ft','square feet','living area'], 250, 20000, true);
  f.yearBuilt = firstNum(t, ['built in','year built'], 1700, 2030);
  f.beds = firstNum(t, ['\\bbeds?\\b','bedrooms?'], 1, 12, true);
  var st = t.match(/\b(for sale|off market|pending|sold|for rent|active)\b/i);
  if (st) f.listingStatus = st[1].replace(/\b\w/g, function(c){ return c.toUpperCase(); });
  var ls = t.match(/sold\s*(?:on)?\s*[:\s]\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (ls) f.lastSold = ls[1];
  Object.keys(f).forEach(function(k){ if (f[k] == null) delete f[k]; });
  return Object.keys(f).length ? f : null;
};
V4.pullProperty = function(){
  var P = window.LOANSUITE && LOANSUITE.PROP; if (!P) return;
  var s = P.state;
  var q = s.mode === 'tbd' ? s.zip : s.address;
  if (!q) return say('Nothing to look up', 'Enter an address, or a zip if the property is still to be determined.', 'warn');
  var btn = $('propPullBtn');
  if (btn){ btn.disabled = true; btn.textContent = 'Reading…'; }

  var enc = encodeURIComponent(q);
  var sources = [
    { name:'Zillow',     url:'https://www.zillow.com/homes/' + enc + '_rb/' },
    { name:'Redfin',     url:'https://www.redfin.com/stingray/do/location-autocomplete?location=' + enc },
    { name:'Realtor',    url:'https://www.realtor.com/realestateandhomes-search/' + enc.replace(/%20/g,'-') },
    { name:'Rentometer', url:'https://www.rentometer.com/analysis/' + enc }
  ];
  var merged = {}, provenance = {};
  function step(i){
    if (i >= sources.length) return Promise.resolve();
    return fetchText(sources[i].url).then(function(res){
      var got = V4.extractProperty(res.text);
      if (got) Object.keys(got).forEach(function(k){
        if (merged[k] == null){ merged[k] = got[k]; provenance[k] = sources[i].name + ' via ' + res.via; }
      });
      return step(i+1);
    }).catch(function(){ return step(i+1); });
  }
  return step(0).then(function(){
    if (btn){ btn.disabled = false; btn.textContent = 'Look up online'; }
    if (!Object.keys(merged).length){
      P.state.pull = { at:new Date().toISOString(), found:{}, prov:{}, empty:true };
      P.save(); P.render();
      return say('Nothing came back', 'No source answered for that address through any relay. '
        + 'The fields stay yours to fill in.', 'warn', 7000);
    }
    Object.keys(merged).forEach(function(k){
      if (k in P.state && !N(P.state[k])) P.state[k] = merged[k];
      else if (!(k in P.state)) P.state[k] = merged[k];
    });
    P.state.pull = { at:new Date().toISOString(), found:merged, prov:provenance };
    P.save(); P.sync(); P.render();
    say('Pulled ' + Object.keys(merged).length + ' field(s)',
      Object.keys(merged).map(function(k){ return k; }).join(', ')
      + '. Every one is editable — check them before they price a loan.', 'good', 8000);
  });
};

/* =================================================================== 4
   ONE TAB ROW ON THE SUITE
   The suite's own pill tabs come back, with Advanced carrying everything
   that was in the second row. Nothing else shows a row of subitems.
   =================================================================== */
var ADV_SUBS = [
  ['rules',    'Rule Tables'],
  ['rates',    'Mortgage Rates'],
  ['taxes',    'Taxes &amp; Escrow'],
  ['docparse', 'Contract &amp; LE'],
  ['property', 'Property']
];
V4.advSub = 'rules';

function killSecondRow(){
  var t = $('suiteTabs'); if (t) t.remove();
}
function advBar(){
  var sr = $('suite-root'); if (!sr) return null;
  var bar = $('advBar');
  if (bar) return bar;
  var tabs = sr.querySelector('.tabs'); if (!tabs) return null;
  bar = document.createElement('div');
  bar.id = 'advBar'; bar.className = 'advbar no-print';
  tabs.parentNode.insertBefore(bar, tabs.nextSibling);
  bar.addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    V4.goAdv(b.dataset.adv);
  });
  return bar;
}
V4.goAdv = function(sub){
  V4.advSub = sub;
  var sr = $('suite-root'); if (!sr) return;
  var cm = sr.querySelector('.cols-main');
  var host = $('suiteMoved');
  if (!host){
    host = document.createElement('div');
    host.id = 'suiteMoved';
    if (cm && cm.parentNode) cm.parentNode.insertBefore(host, cm.nextSibling);
  }
  if (sub === 'rules'){
    host.style.display = 'none';
    if (cm) cm.style.display = '';
  } else {
    var panel = $('panel-' + sub);
    if (panel && panel.parentNode !== host) host.appendChild(panel);
    $$('#suiteMoved .panel').forEach(function(p){ p.classList.toggle('active', p.id === 'panel-'+sub); });
    host.style.display = '';
    if (cm) cm.style.display = 'none';
    if (sub === 'property' && window.LOANSUITE) LOANSUITE.PROP.render();
    if (sub === 'rates' && window.RATES) RATES.render();
    if (sub === 'taxes' && window.TAXPRO) TAXPRO.render();
    if (sub === 'docparse' && window.DOCP) DOCP.render();
  }
  paintAdv();
};
function paintAdv(){
  var bar = $('advBar'); if (!bar) return;
  var st = suite();
  var onAdvanced = st && st.snapshot.mode === 'advanced';
  bar.style.display = onAdvanced ? '' : 'none';
  if (!onAdvanced) return;
  bar.innerHTML = ADV_SUBS.map(function(a){
    return '<button type="button" class="advtab' + (V4.advSub === a[0] ? ' on' : '') + '" data-adv="'+a[0]+'">'+a[1]+'</button>';
  }).join('');
}
/* Leaving Advanced has to put the suite's own columns back. */
function syncMode(){
  var st = suite(); if (!st) return;
  var sr = $('suite-root'); if (!sr) return;
  var onAdvanced = st.snapshot.mode === 'advanced';
  var cm = sr.querySelector('.cols-main'), host = $('suiteMoved');
  if (!onAdvanced){
    if (host) host.style.display = 'none';
    if (cm) cm.style.display = '';
    V4.advSub = 'rules';
  } else if (V4.advSub !== 'rules'){
    V4.goAdv(V4.advSub); return;
  }
  paintAdv();
}

/* No other tab shows a row of subitems. */
function killStrips(){
  $$('.los-strip').forEach(function(el){
    var inCalc = el.closest('#calc-root');
    var isMerged = el.id && /^v3strip-/.test(el.id);
    if (!inCalc || !isMerged) el.remove();
  });
}

var tries = 0;
var poll = setInterval(function(){
  killSecondRow();
  var bar = advBar();
  var sr = $('suite-root');
  if (sr){
    var tabs = sr.querySelector('.tabs');
    if (tabs) tabs.style.display = '';   /* the original pill row comes back */
  }
  if (bar){ syncMode(); clearInterval(poll); }
  else if (++tries > 250) clearInterval(poll);
}, 60);

setInterval(function(){ killSecondRow(); killStrips(); syncMode(); }, 700);
})();
