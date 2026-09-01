/* =====================================================================
   v5 — correctness fixes, then the new brief
   Nothing here edits either engine. Everything is a wrap, a splice on a
   live array reference, or a DOM injection re-asserted on a poll, the
   same three techniques the rest of the layer already uses.

   What's in this file, and why:

   1. THEME        — one unlabelled button cycling light/dark/navy,
                      replacing the three labelled buttons.
   2. LIVE CALC     — text/number fields still bound to onchange only
                      (44 of them) now also fire on every keystroke.
   3. SELF-EMPLOY   — calcSchC/calcCorp: a year with nothing typed in it
                      was defaulting to $0 and getting averaged in
                      anyway, HALVING qualifying income whenever only
                      one year was on file. Fixed at the wrap; the
                      engine's own numbers are untouched when both
                      years actually have figures in them.
   4. BUSINESS AGE  — a start-date field by the entity name; under five
                      years, a manually-selected "most recent year
                      only" is overridden back to the two-year average.
   5. DRAW FEE SYNC — the engine already auto-calculates title/inspection
                      draw fees from the draw plan (`reno.syncDrawFees`)
                      — it just defaults off and lives in a collapsed
                      sub-panel. Surfaced with its own control; defaulted
                      on for scenarios created from here on, not for
                      anything already saved.
   6. VA INCOME     — the native "VA Benefits" Other Income record and
                      patch-va.js's dedicated tab were both being summed,
                      double-counting VA income if a file used both.
                      The dedicated tab is kept (it carries the residual
                      income test and the funding-fee waiver, which are
                      real requirements); the native record is removed
                      from the picker so a new file can't create the
                      collision, and an existing one is flagged with a
                      one-click fix.
   7. ZIP LOOKUP    — the engine already has applyZipLookup() and
                      lookupZipOnline(), correct on every NYC borough;
                      they just sat behind manual buttons. Wired to fire
                      once five digits are typed. NYC county is now also
                      written for display even though jurisdiction
                      pricing keys off isNYC and never reads it back.
   8. COMMUNITY PROP— a banner on Closing when the subject state is one
                      of the nine.
   9. LOCK EXTENSION— 2 bps (0.02%) per day, blank until touched.
   10. RAIL         — mortgage insurance line gets its rate; a scenario
                      line is added; the card header jumps to Summary.
   11. SCENARIO NAME— restored to "Lastname · Program · down% · rate ·
                      MM-DD" (patch-v2's version had drifted from that).
   ===================================================================== */
(function(){
"use strict";
var $  = function(id){ return document.getElementById(id); };
var $$ = function(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };
function G(n){ try { return (0, eval)(n); } catch(e){ return undefined; } }
function N(v){ v = parseFloat(v); return isFinite(v) ? v : 0; }
function usd(v,dp){ dp = dp===undefined?0:dp; var n=N(v);
  return (n<0?'\u2212':'')+'$'+Math.abs(n).toLocaleString('en-US',
    {minimumFractionDigits:dp,maximumFractionDigits:dp}); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){
  return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
function suite(){ try { return window.mortgageSuite.store; } catch(e){ return null; } }
function say(t,b,k,ms){ if (window.LOS && LOS.say) LOS.say(t,b,k,ms); }

var V5 = window.V5 = {};

/* =================================================================== 1
   THEME — one unlabelled button
   =================================================================== */
var THEME_ICONS = {
  light: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark:  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/></svg>',
  navy:  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z"/></svg>'
};
var THEME_NEXT = { light:'dark', dark:'navy', navy:'light' };
var THEME_LABEL = { light:'Light theme', dark:'Dark theme', navy:'Navy theme' };
function buildThemeButton(){
  var bar = $('losBar'); if (!bar) return false;
  var seg = bar.querySelector('.seg'); if (!seg) return $('v5ThemeBtn') ? true : false;
  var btn = document.createElement('button');
  btn.id = 'v5ThemeBtn'; btn.type = 'button'; btn.className = 'v5-theme-btn';
  seg.parentNode.replaceChild(btn, seg);
  btn.addEventListener('click', function(){
    var cur = (window.LOS && LOS.skin) ? LOS.skin() : 'light';
    LOS.setSkin(THEME_NEXT[cur] || 'light');
    paintThemeButton();
  });
  paintThemeButton();
  return true;
}
function paintThemeButton(){
  var btn = $('v5ThemeBtn'); if (!btn) return;
  var cur = (window.LOS && LOS.skin) ? LOS.skin() : 'light';
  btn.innerHTML = THEME_ICONS[cur] || THEME_ICONS.light;
  btn.title = THEME_LABEL[cur] + ' — click to cycle';
}

/* =================================================================== 2
   LIVE CALC — upgrade onchange-only text/number fields to fire live
   Selects and checkboxes already commit on change; nothing to do there.
   This only touches fields whose own inline onchange calls setField(),
   which itself only writes S and calls RECALC() — no full list rebuild
   runs on every keystroke, so this cannot cost focus/caret position.
   =================================================================== */
function liveUpgrade(e){
  var el = e.target;
  if (!el || el.tagName !== 'INPUT') return;
  var t = (el.type || 'text').toLowerCase();
  if (t !== 'text' && t !== 'number') return;
  var oc = el.getAttribute('onchange');
  if (!oc || oc.indexOf('setField(') === -1) return;
  if (el.__v5live === oc) { try { (new Function(oc)).call(el); } catch(err){} return; }
  el.__v5live = oc;
  try { (new Function(oc)).call(el); } catch(err){}
}
function installLiveCalc(){
  if (document.__v5liveInstalled) return true;
  document.addEventListener('input', liveUpgrade, true);
  document.__v5liveInstalled = true;
  return true;
}

/* =================================================================== 3
   SELF-EMPLOYMENT INCOME — single-populated-year fix
   =================================================================== */
function yearEmpty(obj){
  if (!obj) return true;
  return Object.keys(obj).every(function(k){ return k === 'yr' || !N(obj[k]); });
}
function wrapSchC(){
  if (typeof window.calcSchC !== 'function' || window.calcSchC.__v5) return false;
  var inner = window.calcSchC;
  var wrapped = function(b){
    var r = inner(b);
    applyYearFix(r, b, 'schc');
    return r;
  };
  wrapped.__v5 = true;
  window.calcSchC = wrapped;
  return true;
}
function wrapCorp(){
  if (typeof window.calcCorp !== 'function' || window.calcCorp.__v5) return false;
  var inner = window.calcCorp;
  var wrapped = function(e){
    var r = inner(e);
    applyYearFix(r, e, 'corp');
    return r;
  };
  wrapped.__v5 = true;
  window.calcCorp = wrapped;
  return true;
}
/* Shared between Sch C and the 1065/1120-S/1120 worksheet: both wrap a
   function with the identical {a1,a2,m1,m2,avg,declining,monthly,
   methodUsed} shape, so one fixer serves both. */
function applyYearFix(r, rec, kind){
  var y1Empty = yearEmpty(rec.y1), y2Empty = yearEmpty(rec.y2);
  r.oneYearOnly = y1Empty !== y2Empty;
  r.singleYearNote = ''; r.ageRestrictionNote = '';
  var autoMode = (rec.mode === 'auto') || !rec.method || rec.method === 'auto';
  if (r.oneYearOnly && autoMode){
    var onlyYear = y2Empty ? rec.y1 : rec.y2;
    var onlyMonthly = y2Empty ? r.m1 : r.m2;
    r.monthly = onlyMonthly;
    r.methodUsed = 'recent';
    r.singleYearNote = 'Only ' + (onlyYear.yr || 'one year') + ' has figures on file — using it directly '
      + 'rather than averaging against a blank year, which would have understated income by roughly half.';
  } else if (!r.oneYearOnly && !y1Empty && !y2Empty){
    var age = V5.BIZAGE.ageYears(kind, rec.id);
    if (age != null && age < 5 && rec.method === 'recent' && rec.mode !== 'auto'){
      r.monthly = r.avg;
      r.methodUsed = 'avg2';
      r.ageRestrictionNote = 'Business is under five years old, so a single year is not enough history on its '
        + 'own — using the two-year average instead. Switch to Auto or Custom to override.';
    }
  }
}

/* =================================================================== 4
   BUSINESS START DATE — field + localStorage-backed age, per record
   =================================================================== */
var BIZ_KEY = 'v5BizAge.v1';
var BIZAGE = V5.BIZAGE = {
  data: {},
  load: function(){ try { BIZAGE.data = JSON.parse(localStorage.getItem(BIZ_KEY) || '{}'); } catch(e){ BIZAGE.data = {}; } },
  save: function(){ try { localStorage.setItem(BIZ_KEY, JSON.stringify(BIZAGE.data)); } catch(e){} },
  get: function(kind,id){ return BIZAGE.data[kind + ':' + id] || ''; },
  set: function(kind,id,val){
    BIZAGE.data[kind + ':' + id] = val; BIZAGE.save();
    if (window.RECALC) window.RECALC();
  },
  ageYears: function(kind,id){
    var v = BIZAGE.get(kind,id); if (!v) return null;
    var d = new Date(v + 'T00:00:00'); if (isNaN(d.getTime())) return null;
    return (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  }
};
BIZAGE.load();

function injectBizFields(listId, kind, beforeSelector){
  var S = G('S'); if (!S || !S[kind]) return;
  var cards = $$('#' + listId + ' > .card');
  S[kind].forEach(function(rec, i){
    var card = cards[i]; if (!card) return;
    var top = card.querySelector('.card-top'); if (!top) return;
    if (!top.querySelector('.v5-startdate')){
      var wrap = document.createElement('div');
      wrap.className = 'v5-startdate';
      wrap.innerHTML = '<label>Business start</label>'
        + '<input class="cell-input" type="date" value="' + esc(BIZAGE.get(kind, rec.id)) + '" '
        + 'onchange="V5.BIZAGE.set(\'' + kind + '\',\'' + rec.id + '\',this.value)">';
      var before = beforeSelector ? top.querySelector(beforeSelector) : null;
      if (before) top.insertBefore(wrap, before);
      else {
        var nameInput = top.querySelector('.name-input');
        if (nameInput && nameInput.nextSibling) top.insertBefore(wrap, nameInput.nextSibling);
        else top.appendChild(wrap);
      }
    }
    var body = card.querySelector('.card-body');
    if (body && !body.querySelector('.v5-agenote')){
      var note = document.createElement('div');
      note.className = 'v5-agenote notice info'; note.style.display = 'none'; note.style.marginTop = '10px';
      body.appendChild(note);
    }
  });
}
function paintBizNotes(listId, kind, calcFn){
  var S = G('S'); if (!S || !S[kind]) return;
  var cards = $$('#' + listId + ' > .card');
  S[kind].forEach(function(rec, i){
    var card = cards[i]; if (!card) return;
    var note = card.querySelector('.v5-agenote'); if (!note) return;
    var r; try { r = calcFn(rec); } catch(e){ r = null; }
    var msg = r ? (r.singleYearNote || r.ageRestrictionNote || '') : '';
    note.textContent = msg;
    note.style.display = msg ? '' : 'none';
    note.className = 'v5-agenote notice ' + (r && r.singleYearNote ? 'warn' : 'info');
  });
}
function wrapRenderSchC(){
  if (typeof window.renderSchC !== 'function' || window.renderSchC.__v5) return false;
  var inner = window.renderSchC;
  var wrapped = function(){ var r = inner.apply(this, arguments); injectBizFields('schcList','schc',null); return r; };
  wrapped.__v5 = true; window.renderSchC = wrapped; return true;
}
function wrapPaintSchC(){
  if (typeof window.paintSchC !== 'function' || window.paintSchC.__v5) return false;
  var inner = window.paintSchC;
  var wrapped = function(){ var r = inner.apply(this, arguments); paintBizNotes('schcList','schc',window.calcSchC); return r; };
  wrapped.__v5 = true; window.paintSchC = wrapped; return true;
}
function wrapRenderCorp(){
  if (typeof window.renderCorp !== 'function' || window.renderCorp.__v5) return false;
  var inner = window.renderCorp;
  var wrapped = function(){ var r = inner.apply(this, arguments); injectBizFields('corpList','corp','select'); return r; };
  wrapped.__v5 = true; window.renderCorp = wrapped; return true;
}
function wrapPaintCorp(){
  if (typeof window.paintCorp !== 'function' || window.paintCorp.__v5) return false;
  var inner = window.paintCorp;
  var wrapped = function(){ var r = inner.apply(this, arguments); paintBizNotes('corpList','corp',window.calcCorp); return r; };
  wrapped.__v5 = true; window.paintCorp = wrapped; return true;
}

/* =================================================================== 5
   DRAW FEE SYNC — surface the existing toggle, default it on for new
   scenarios only. Nothing already saved is touched.
   =================================================================== */
function buildSyncBadge(){
  var st = suite(); if (!st) return false;
  var host = document.querySelector('#suite-root .cols-main'); if (!host) return false;
  var existing = $('v5SyncBadge');
  if (existing && existing.isConnected && existing.nextSibling === host) { paintSyncBadge(); return true; }
  if (existing) existing.remove();
  var bar = document.createElement('div');
  bar.id = 'v5SyncBadge'; bar.className = 'v5-syncbadge no-print';
  host.parentNode.insertBefore(bar, host);
  bar.addEventListener('click', function(){
    var i = st.activeInputs; if (!i || !i.reno) return;
    i.reno.syncDrawFees = !i.reno.syncDrawFees;
    st.active.updatedAt = new Date().toISOString();
    if (window.RECALC) window.RECALC();
    try { st.emit && st.emit(); } catch(e){}
    paintSyncBadge();
  });
  paintSyncBadge();
  return true;
}
function paintSyncBadge(){
  var bar = $('v5SyncBadge'); if (!bar) return;
  var st = suite(); if (!st){ bar.style.display = 'none'; return; }
  var i = st.activeInputs;
  var onReno = st.snapshot && (st.snapshot.mode === 'renovation' || st.snapshot.mode === 'quote');
  if (!i || !i.reno || !onReno){ bar.style.display = 'none'; return; }
  bar.style.display = '';
  var on = !!i.reno.syncDrawFees;
  bar.className = 'v5-syncbadge no-print' + (on ? ' on' : '');
  bar.innerHTML = '<span class="dot"></span>Title &amp; inspection draw fees: '
    + (on ? 'auto-calculated from the draw plan' : 'entered manually — click to auto-calculate from the draw plan');
}
function hookNewScenarioDefault(){
  var st = suite(); if (!st || typeof st.newScenario !== 'function' || st.newScenario.__v5) return false;
  var inner = st.newScenario.bind(st);
  st.newScenario = function(){
    var id = inner.apply(st, arguments);
    try {
      var s = st.state.scenarios[id];
      if (s && s.inputs && s.inputs.reno) s.inputs.reno.syncDrawFees = true;
    } catch(e){}
    return id;
  };
  st.newScenario.__v5 = true;
  return true;
}

/* =================================================================== 6
   VA INCOME — stop the double count
   =================================================================== */
function stripNativeVA(){
  var OT = G('OTHER_TYPES'); if (!OT || !OT.length) return false;
  var idx = OT.findIndex(function(x){ return x.v === 'va'; });
  if (idx >= 0) OT.splice(idx, 1);
  return true;
}
function checkVADuplicate(){
  var S = G('S'); if (!S || !S.other) return;
  var dup = S.other.filter(function(o){ return o.type === 'va' && o.use !== false && N(o.amt) > 0; });
  var host = $('v5VaDupNote');
  if (!dup.length){ if (host) host.style.display = 'none'; return; }
  var anchor = $('otherList');
  if (host && (!host.isConnected || !anchor || host.nextSibling !== anchor)){ host.remove(); host = null; }
  if (!host){
    host = document.createElement('div');
    host.id = 'v5VaDupNote'; host.className = 'notice warn v5-vadup no-print';
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(host, anchor);
  }
  host.style.display = '';
  host.innerHTML = '<svg class="icon"><use href="#i-alert"/></svg><div>'
    + '<b>' + dup.length + ' Other Income record(s) are also counted on the VA Income tab.</b> '
    + 'Leaving both in adds the same VA benefit to qualifying income twice. '
    + '<button type="button" class="btn btn-light btn-sm" onclick="V5.excludeVADup()">Exclude the duplicate(s) here</button>'
    + '</div>';
}
V5.excludeVADup = function(){
  var S = G('S'); if (!S || !S.other) return;
  S.other.forEach(function(o){ if (o.type === 'va' && o.use !== false) o.use = false; });
  if (window.RECALC) window.RECALC();
  if (typeof window.renderOther === 'function') window.renderOther();
  checkVADuplicate();
  say('Duplicate excluded', 'The Other Income VA record(s) are now excluded. The VA Income tab is the one place VA benefits count from here on.', 'good');
};

/* =================================================================== 7
   ZIP LOOKUP — fire the engine's own lookups; NYC county for display
   =================================================================== */
function wrapApplyZip(){
  var st = suite(); if (!st || typeof st.applyZipLookup !== 'function' || st.applyZipLookup.__v5) return false;
  var inner = st.applyZipLookup.bind(st);
  st.applyZipLookup = function(){
    var r = inner();
    try {
      var i = st.activeInputs;
      if (i && i.state === 'New York' && i.isNYC && !i.nyCounty){
        var MD = G('marketData_3') || G('marketData');
        var lu = MD && MD.lookupZip ? MD.lookupZip(i.zipCode) : null;
        if (lu && lu.county) i.nyCounty = lu.county;
      }
    } catch(e){}
    return r;
  };
  st.applyZipLookup.__v5 = true;
  return true;
}
function wireZipAuto(){
  var el = document.querySelector('[data-field="zipCode"] input, [data-path="zipCode"]');
  if (!el || el.__v5zip) return !!el;
  el.__v5zip = true;
  el.addEventListener('input', function(){
    var v = (el.value || '').replace(/\D/g,'').slice(0,5);
    if (v.length !== 5) return;
    var st = suite(); if (!st) return;
    /* Write the confirmed 5 digits straight into activeInputs before
       looking up — applyZipLookup() reads activeInputs.zipCode, not the
       DOM, and this field's own commit may not have landed yet if it
       only writes on blur rather than on every keystroke. */
    try { st.activeInputs.zipCode = v; } catch(e){}
    try { st.applyZipLookup(); } catch(e){}
    if (typeof st.lookupZipOnline === 'function'){
      st.lookupZipOnline().catch(function(){});
    }
    try { st.emit && st.emit(); } catch(e){}
    if (window.RECALC) window.RECALC();
  });
  return true;
}

/* =================================================================== 8
   COMMUNITY PROPERTY — banner on Closing
   =================================================================== */
var COMMUNITY_STATES = ['Arizona','California','Idaho','Louisiana','Nevada','New Mexico','Texas','Washington','Wisconsin'];
function paintCommunityBanner(){
  var st = suite(); var body = $('screen-body');
  var onClosing = st && st.snapshot && st.snapshot.mode === 'closing';
  var isCommunity = st && COMMUNITY_STATES.indexOf(st.activeInputs && st.activeInputs.state) >= 0;
  var host = $('v5CommunityNote');
  if (!onClosing || !isCommunity){ if (host) host.style.display = 'none'; return; }
  if (!body) return;
  if (!host){
    host = document.createElement('div');
    host.id = 'v5CommunityNote'; host.className = 'notice warn v5-community no-print';
    body.insertBefore(host, body.firstChild);
  } else if (host.parentNode !== body) {
    body.insertBefore(host, body.firstChild);
  }
  host.style.display = '';
  host.innerHTML = '<svg class="icon"><use href="#i-alert"/></svg><div>'
    + '<b>' + esc(st.activeInputs.state) + ' is a community property state.</b> '
    + 'A non-borrowing spouse\u2019s debts can factor into qualifying ratios and both spouses may need to sign the '
    + 'security instrument even if only one is on the note \u2014 confirm current state and investor requirements '
    + 'before disclosure.</div>';
}

/* =================================================================== 9
   LOCK EXTENSION — 2 bps (0.02%) per day, blank/collapsed until touched
   The brief originally said "0.20 bps per day"; confirmed as 2 bps/day,
   i.e. 0.02% of the loan per day. Worth being explicit about the units
   because the two readings differ by a factor of ten: on a $615,580
   loan a 15-day extension is ~$1,847 at 2 bps/day and ~$18,467 at
   20 bps/day, and only the first is anywhere near market.
   =================================================================== */
var LX_KEY = 'v5LockExt.v1';
var LX = V5.LOCKEXT = {
  BPS_PER_DAY: 2, /* 2 bps = 0.02% of the loan per day, confirmed */
  load: function(){ try { return JSON.parse(localStorage.getItem(LX_KEY) || 'null') || {open:false, expire:'', extend:''}; } catch(e){ return {open:false, expire:'', extend:''}; } },
  save: function(){ try { localStorage.setItem(LX_KEY, JSON.stringify(LX.state)); } catch(e){} }
};
LX.state = LX.load();
LX.set = function(k,v){ LX.state[k] = v; LX.save(); LX.render(); };
LX.toggle = function(){ LX.state.open = !LX.state.open; LX.save(); LX.render(); };
LX.calc = function(){
  var s = LX.state;
  if (!s.expire || !s.extend) return null;
  var d1 = new Date(s.expire + 'T00:00:00'), d2 = new Date(s.extend + 'T00:00:00');
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
  var days = Math.round((d2 - d1) / 86400000);
  if (days <= 0) return { days: days, bps: 0, pct: 0, dollars: 0, invalid: days < 0 };
  var bps = days * LX.BPS_PER_DAY;
  var pct = bps / 10000;
  var st = suite();
  var loanAmt = st ? N((st.outputs && st.outputs.loan && (st.outputs.loan.totalLoan || st.outputs.loan.maximumBaseLoan)) || 0) : 0;
  var dollars = loanAmt * pct;
  return { days: days, bps: bps, pct: pct, dollars: dollars, loanAmt: loanAmt };
};
LX.render = function(){
  var body = $('screen-body'); var st = suite();
  var onClosing = st && st.snapshot && st.snapshot.mode === 'closing';
  var host = $('v5LockExt');
  if (!onClosing){ if (host) host.style.display = 'none'; return; }
  if (!body) return;
  if (!host){
    host = document.createElement('div');
    host.id = 'v5LockExt'; host.className = 'card v5-lockext no-print';
    var afterNote = $('v5CommunityNote');
    if (afterNote && afterNote.nextSibling) body.insertBefore(host, afterNote.nextSibling);
    else body.insertBefore(host, body.firstChild);
  } else if (host.parentNode !== body) {
    body.insertBefore(host, body.firstChild);
  }
  host.style.display = '';
  var s = LX.state, r = LX.calc();
  host.innerHTML = '<div class="card-top" style="cursor:pointer" onclick="V5.LOCKEXT.toggle()">'
    + '<span class="tag">Rate lock</span><span class="doc-name">Lock extension</span><div class="spacer"></div>'
    + (r && !r.invalid ? '<span class="res">' + (r.bps/100).toFixed(2) + '% \u00b7 ' + usd(r.dollars,0) + '</span>' : '')
    + '<button type="button" class="btn-icon">' + (s.open ? '\u2212' : '+') + '</button></div>'
    + (s.open ? ('<div class="card-body"><div class="grid g4">'
        + '<div class="field"><label>Lock expiration date</label><input class="cell-input" type="date" value="' + esc(s.expire) + '" onchange="V5.LOCKEXT.set(\'expire\',this.value)"></div>'
        + '<div class="field"><label>New expiration / extend-to date</label><input class="cell-input" type="date" value="' + esc(s.extend) + '" onchange="V5.LOCKEXT.set(\'extend\',this.value)"></div>'
        + '<div class="calcbox"><div class="muted small">Days extended</div><div class="mnd-big">' + (r ? r.days : '\u2014') + '</div></div>'
        + '<div class="calcbox final"><div class="muted small">Cost</div><div class="mnd-big">' + (r && !r.invalid ? usd(r.dollars,0) : '\u2014') + '</div>'
          + '<div class="muted small">' + (r && !r.invalid ? (r.bps/100).toFixed(2) + '% (' + r.bps + ' bps)' : 'enter both dates') + '</div></div>'
        + '</div>'
        + (r && r.invalid ? '<div class="note warn" style="margin-top:12px"><div>The extend-to date is before the expiration date.</div></div>' : '')
        + '<div class="note" style="margin-top:12px"><div>Priced at 2 bps (0.02%) per day extended, applied to the current total loan amount' + (r && r.loanAmt ? ' of ' + usd(r.loanAmt,0) : '') + '. Confirm against the lender\u2019s actual extension fee schedule before quoting it.</div></div>'
      + '</div>') : '');
};

/* =================================================================== 10
   LIVE SUMMARY RAIL — MI rate, scenario name, clickable header
   =================================================================== */
function augmentRail(){
  var rails = $$('.rail');
  rails.forEach(function(rail){
    var st = suite(); if (!st) return;
    var out = st.outputs; if (!out) return;
    var card = rail.querySelector('.card') || rail;
    var h3 = card.querySelector('h3');

    /* header -> Summary */
    if (h3 && !h3.__v5click){
      h3.__v5click = true;
      h3.style.cursor = 'pointer';
      h3.title = 'Open the full Summary';
      h3.addEventListener('click', function(){
        try { st.setMode('summary'); } catch(e){}
        if (window.LOANSUITE && LOANSUITE.goSuite) { try { LOANSUITE.goSuite('summary'); } catch(e){} }
      });
    }

    /* scenario name line, right under the title */
    var scenLine = card.querySelector('.v5-scenline');
    if (!scenLine && h3){
      scenLine = document.createElement('div');
      scenLine.className = 'v5-scenline';
      if (h3.nextSibling) card.insertBefore(scenLine, h3.nextSibling);
      else card.insertBefore(scenLine, card.firstChild ? card.firstChild.nextSibling : null);
    }
    if (scenLine){
      var name = (st.active && st.active.inputs && st.active.inputs.name)
        || (typeof scenarioName === 'function' ? scenarioName() : '');
      scenLine.textContent = name || '';
    }

    /* MI rate, next to the MI dollar line */
    var lines = $$('.out', rail);
    var miLine = lines.filter(function(l){ var lab = l.querySelector('.l'); return lab && /mortgage insurance/i.test(lab.textContent); })[0];
    if (miLine && !miLine.querySelector('.v5-mirate')){
      var isFha = !!out.isFha;
      var rate = isFha ? N(st.activeInputs && st.activeInputs.fhaAnnualMipRate) : null;
      var pmiRate = null;
      if (!isFha && out.payment && N(out.payment.monthlyPmi) > 0){
        var loanAmt = N(out.loan && (out.loan.maximumBaseLoan || out.loan.totalLoan));
        if (loanAmt > 0) pmiRate = (N(out.payment.monthlyPmi) * 12 / loanAmt) * 100;
      }
      var shown = isFha ? (isFinite(rate) ? (rate*100).toFixed(2) + '% MIP' : '')
                         : (pmiRate != null ? pmiRate.toFixed(2) + '% PMI' : '');
      if (shown){
        var tag = document.createElement('span');
        tag.className = 'v5-mirate'; tag.textContent = shown;
        var v = miLine.querySelector('.v'); if (v) v.parentNode.insertBefore(tag, v);
      }
    }
  });
}

/* =================================================================== 11
   SCENARIO NAMING — restore "Lastname · Program · down% · rate · MM-DD"
   =================================================================== */
function lastName(full){
  full = String(full || '').trim(); if (!full) return 'Borrower';
  var parts = full.split(/\s+/);
  return parts[parts.length - 1];
}
function scenarioName(){
  var st = suite(); if (!st) return 'Scenario';
  var i = st.activeInputs || {}, S = G('S');
  var who = (S && S.b1) || i.borrowerName || '';
  var prog = (i.loanProgram || 'FHA') + (i.renovation ? (i.loanProgram === 'FHA' ? ' 203(k)' : ' HomeStyle') : '');
  var down = (1 - N(i.finalDownPaymentPct)) === 1 ? N(i.finalDownPaymentPct) : N(i.finalDownPaymentPct);
  var downPct = (N(i.finalDownPaymentPct) * 100).toFixed(1);
  var rate = (N(i.interestRate) * 100).toFixed(3);
  var d = new Date();
  var mmdd = String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  return lastName(who) + ' \u00b7 ' + prog + ' \u00b7 ' + downPct + '% \u00b7 ' + rate + '% \u00b7 ' + mmdd;
}
function hookNaming(){
  if (!window.LOS || !LOS.SCEN) return false;
  var fn = function(){ return scenarioName(); };
  fn.__v5 = true;
  LOS.SCEN.autoName = fn;
  return true;
}

/* =================================================================== 12
   WIRING
   One recurring loop, not a bounded startup poll. Every function above
   is idempotent (a __v5 marker, or an existence check before touching
   the DOM), so re-running all of them on every tick costs nothing once
   they've succeeded, and — unlike a poll that gives up after N tries —
   the correctness fixes (3 and 6) can't end up silently unarmed just
   because the suite happened to mount slowly on a given machine.
   =================================================================== */
installLiveCalc();
setInterval(function(){
  try { buildThemeButton(); paintThemeButton(); } catch(e){}
  try { wrapSchC(); wrapCorp(); wrapRenderSchC(); wrapPaintSchC(); wrapRenderCorp(); wrapPaintCorp(); } catch(e){}
  try { buildSyncBadge(); hookNewScenarioDefault(); } catch(e){}
  try { stripNativeVA(); checkVADuplicate(); } catch(e){}
  try { wrapApplyZip(); wireZipAuto(); } catch(e){}
  try { paintCommunityBanner(); } catch(e){}
  try { LX.render(); } catch(e){}
  try { augmentRail(); } catch(e){}
  try { hookNaming(); } catch(e){}
}, 500);
})();
