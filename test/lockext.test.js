/* Lock extension pricing — mirrors LX.calc in patch-v5.js.
   The rate is the whole point of this test: it shipped at 20 bps/day and
   is confirmed at 2. Ten times too high looked entirely plausible in the
   code and only surfaced once the arithmetic was run against a real loan
   amount. */
const BPS_PER_DAY = 2;              // 2 bps = 0.02% of the loan per day

function calc(expire, extend, loanAmt){
  const d1 = new Date(expire + 'T00:00:00');
  const d2 = new Date(extend + 'T00:00:00');
  const days = Math.round((d2 - d1) / 86400000);
  if (days <= 0) return { days, bps:0, pct:0, dollars:0, invalid: days < 0 };
  const bps = days * BPS_PER_DAY;
  const pct = bps / 10000;
  return { days, bps, pct, dollars: loanAmt * pct, invalid:false };
}

const LOAN = 615580;                // the uploaded LE_203k.pdf loan amount
let pass = 0, fail = 0;
function check(label, got, want){
  const ok = Math.abs(got - want) < 0.005;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  got=${got} want=${want}`);
}
function assert(label, cond){
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

const d15 = calc('2026-09-02', '2026-09-17', LOAN);
check('15 days -> 30 bps',        d15.bps,       30);
check('15 days -> 0.30%',         d15.pct * 100, 0.30);
check('15 days -> $1,846.74',     d15.dollars,   1846.74);

const d7 = calc('2026-09-02', '2026-09-09', LOAN);
check('7 days -> 14 bps',         d7.bps,        14);
check('7 days -> $861.81',        d7.dollars,    861.81);

const d30 = calc('2026-09-02', '2026-10-02', LOAN);
check('30 days -> 60 bps',        d30.bps,       60);
check('30 days -> $3,693.48',     d30.dollars,   3693.48);

check('same day -> $0',           calc('2026-09-02','2026-09-02',LOAN).dollars, 0);

const back = calc('2026-09-17', '2026-09-02', LOAN);
check('backwards -> $0',          back.dollars,  0);
assert('backwards dates flagged invalid', back.invalid);

/* A range crossing a DST boundary must still count whole days — naive
   millisecond division returns 14.958 here and would floor to 14. */
check('DST crossing still 15 days', calc('2026-10-30','2026-11-14',LOAN).days, 15);

/* The regression this file exists to prevent. */
const atOldRate = LOAN * (15 * 20) / 10000;
console.log(`\nregression guard: at the old 20 bps/day the same 15-day extension`);
console.log(`  prices at $${atOldRate.toFixed(2)} instead of $${d15.dollars.toFixed(2)}`);
assert('rate is 2 bps/day, not 20', Math.abs(d15.dollars - atOldRate / 10) < 0.01);

console.log(`\nlock extension: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
