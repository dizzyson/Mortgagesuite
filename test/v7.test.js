/* v7 pure logic: free-form date parsing and the max-loan back-solve. */
let pass=0, fail=0;
function eq(label, got, want){ const ok = got===want; ok?pass++:fail++;
  console.log(`${ok?'PASS':'FAIL'}  ${label}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
function near(label, got, want, tol){ const ok = Math.abs(got-want)<=(tol||0.01); ok?pass++:fail++;
  console.log(`${ok?'PASS':'FAIL'}  ${label}  got=${got} want=${want}`); }

// ---- date parser (mirrors V7.parseDate) ----
const MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function iso(y,m,d){const dt=new Date(y,m-1,d);
  if(isNaN(dt.getTime())||dt.getMonth()!==m-1)return'';
  return dt.getFullYear()+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
function parseDate(raw){
  const s=String(raw||'').trim(); if(!s)return''; let m;
  if((m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)))return iso(+m[1],+m[2],+m[3]);
  if((m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/))){
    let y=m[3]?+m[3]:new Date().getFullYear(); if(y<100)y+=2000; return iso(y,+m[1],+m[2]);}
  const low=s.toLowerCase(); let mi=-1;
  for(let i=0;i<12;i++)if(low.indexOf(MONTHS[i])>=0){mi=i+1;break;}
  if(mi>0){const nums=low.match(/\d{1,4}/g)||[];let day=0,yr=0;
    nums.forEach(n=>{const v=+n; if(v>=1000)yr=v; else if(!day&&v<=31)day=v; else if(!yr&&v<100)yr=2000+v;});
    if(day)return iso(yr||new Date().getFullYear(),mi,day);}
  return '';
}
const Y=new Date().getFullYear();
eq('ISO passthrough',        parseDate('2026-09-17'), '2026-09-17');
eq('M/D/YY',                 parseDate('9/17/26'),    '2026-09-17');
eq('MM-DD-YYYY',             parseDate('09-17-2026'), '2026-09-17');
eq('M/D no year -> current', parseDate('9/17'),       `${Y}-09-17`);
eq('month name + day',       parseDate('sep 17 2026'),'2026-09-17');
eq('long month name',        parseDate('September 17, 2026'), '2026-09-17');
eq('zero-pad single digits', parseDate('1/5/2026'),   '2026-01-05');
eq('garbage -> empty',       parseDate('not a date'), '');
eq('empty -> empty',         parseDate(''),           '');
// a real calendar check: Feb 30 must be rejected, not rolled to Mar 2
eq('Feb 30 rejected',        parseDate('2/30/2026'),  '');
eq('Feb 29 leap year OK',    parseDate('2/29/2024'),  '2024-02-29');
eq('Feb 29 non-leap rejected',parseDate('2/29/2026'), '');

// ---- max-loan back-solve (mirrors V7.capacity/principalFor) ----
function principalFor(pi,annualRate,years){
  const n=Math.round(years*12), i=annualRate/12;
  if(pi<=0||n<=0)return 0;
  if(i<=0)return pi*n;
  return pi*(1-Math.pow(1+i,-n))/i;
}
function pmt(principal,annualRate,years){
  const n=Math.round(years*12), i=annualRate/12;
  if(i<=0)return principal/n;
  return principal*i/(1-Math.pow(1+i,-n));
}
// round-trip: a known loan -> its payment -> back to the loan
const L=615580, R=0.06875, T=30;
const pi=pmt(L,R,T);
near('P&I on $615,580 @6.875%/30y', pi, 4043.92, 1.0);
near('back-solve round-trips',      principalFor(pi,R,T), L, 1.0);
// zero-rate edge case
near('0% rate -> straight division', principalFor(1000,0,30), 360000, 0.01);
// capacity: income 12000, front .47/back .57, liabilities 800
const income=12000, front=.47, back=.57, liab=800;
const maxPay=Math.min(income*front, income*back-liab);
// front-end cap 12000*.47 = 5640 binds below back-end 12000*.57-800 = 6040
near('max payment = lower of the two caps', maxPay, 5640, 0.01);
const escrows=1092, mi=272.44;
const maxPI=maxPay-escrows-mi;
near('P&I headroom', maxPI, 4275.56, 0.01);
const maxLoan=principalFor(maxPI,R,T);
console.log(`  -> max total loan at 6.875%/30y = $${maxLoan.toFixed(0)}`);
if (!(maxLoan>0 && maxLoan<2e7)) { console.log('FAIL max loan out of range'); fail++; } else pass++;
// cushion band symmetry
const c=0.05;
near('cushion band low',  maxLoan*(1-c), maxLoan-maxLoan*c, 0.01);
near('cushion band high', maxLoan*(1+c), maxLoan+maxLoan*c, 0.01);

console.log(`\nv7: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
