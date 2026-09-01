const LE_BUCKET = {
  lenderOrigination:'A', lenderProcessing:'A', points:'A',
  appraisal:'B', creditReport:'B', floodTaxService:'B', titleInsurance:'B', titleSearchSettlement:'B', inspections:'B',
  attorney:'C', survey:'C',
  recording:'E', mortgageTax:'E', transferBuyer:'E', luxuryBuyer:'E',
  prepaidTaxes:'F', prepaidInsurance:'F', perDiem:'F',
  initialEscrow:'G', other:'H'
};
function bucket(lines){
  const b={A:[],B:[],C:[],E:[],F:[],G:[],H:[]};
  (lines||[]).filter(l=>l.payer==='buyer').forEach(l=>{ b[LE_BUCKET[l.key]||'H'].push([l.label,l.amount,l.basis]); });
  return b;
}
const sum=a=>(a||[]).reduce((x,l)=>x+(+l[1]||0),0);
// realistic line set incl. seller lines that must be excluded
const lines=[
  {key:'lenderOrigination',label:'Origination fee',amount:2290,payer:'buyer'},
  {key:'points',label:'Points',amount:12829,payer:'buyer'},
  {key:'appraisal',label:'Appraisal',amount:910,payer:'buyer'},
  {key:'creditReport',label:'Credit report',amount:117,payer:'buyer'},
  {key:'floodTaxService',label:'Flood + tax service',amount:96,payer:'buyer'},
  {key:'titleInsurance',label:'Title insurance',amount:3218,payer:'buyer'},
  {key:'titleSearchSettlement',label:'Title search + settlement',amount:2491,payer:'buyer'},
  {key:'inspections',label:'Inspections',amount:1125,payer:'buyer'},
  {key:'attorney',label:'Attorney',amount:1500,payer:'buyer'},
  {key:'recording',label:'Recording',amount:444,payer:'buyer'},
  {key:'mortgageTax',label:'Mortgage tax',amount:11946,payer:'buyer'},
  {key:'prepaidTaxes',label:'Prepaid taxes',amount:345,payer:'buyer'},
  {key:'prepaidInsurance',label:'Prepaid insurance',amount:3894,payer:'buyer'},
  {key:'perDiem',label:'Prepaid interest',amount:3131,payer:'buyer'},
  {key:'initialEscrow',label:'Initial escrow',amount:1318,payer:'buyer'},
  {key:'other',label:'Other',amount:2200,payer:'buyer'},
  {key:'transferSeller',label:'Seller transfer tax',amount:9999,payer:'seller'},
  {key:'luxurySeller',label:'Seller luxury tax',amount:5555,payer:'seller'},
];
const b=bucket(lines);
const A=sum(b.A),B=sum(b.B),C=sum(b.C),D=A+B+C;
const E=sum(b.E),F=sum(b.F),G=sum(b.G),H=sum(b.H),I=E+F+G+H,J=D+I;
for (const [k,v] of Object.entries(b)) console.log(`  ${k}: ${v.length} line(s)  $${sum(v).toLocaleString()}`);
console.log(`\n  D (A+B+C) = $${D.toLocaleString()}`);
console.log(`  I (E+F+G+H) = $${I.toLocaleString()}`);
console.log(`  J (D+I) = $${J.toLocaleString()}`);
const buyerTotal=lines.filter(l=>l.payer==='buyer').reduce((a,l)=>a+l.amount,0);
console.log(`\n  engine buyerClosingCosts equivalent = $${buyerTotal.toLocaleString()}`);
console.log(`  J matches buyer total: ${J===buyerTotal ? 'YES — no line lost or double counted' : 'NO — MISMATCH of $'+(J-buyerTotal)}`);
console.log(`  seller lines excluded: ${lines.filter(l=>l.payer==='seller').length} (correct — LE shows buyer costs)`);
if (J !== buyerTotal) { console.log('FAIL — bucketing lost or double-counted a line'); process.exit(1); }
console.log('\nle buckets: OK');
