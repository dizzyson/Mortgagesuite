// V6.norm — extracted verbatim from patch-v6.js
function norm(text){
  var t = String(text || '').replace(/\u00a0/g,' ').replace(/[\u2018\u2019]/g,"'");
  t = t.replace(/([A-Za-z$+])\1{2,}/g, '$1');
  t = t.replace(/([\d,.])[A-Za-z](?=[\d,.]\d)/g, '$1');
  t = t.replace(/(\d)\s+(?=[.,]\d)/g, '$1');
  t = t.replace(/([.,])\s+(?=\d)/g, '$1');
  t = t.replace(/\$\s+(?=\d)/g, '$');
  t = t.replace(/(\d)\s(?=\d{0,2},\d{3})/g, '$1');
  return t;
}
const cases = [
  ['$3,a914.29', '$3,914.29', 'stray glyph inside a number'],
  ['6 .75 %', '6.75 %', 'space before decimal'],
  ['$4 5,056.77', '$45,056.77', 'split thousands group'],
  ['SSSSeeeeccccttttiiiioooonnnn', 'Section', 'quadrupled letters'],
  ['M onthly Pr incipal', 'M onthly Pr incipal', 'spaced letters left alone (not a number)'],
  ['710,000', '710,000', 'legitimate repeated ZEROS must survive'],
  ['1,000,000', '1,000,000', 'repeated zeros in millions survive'],
];
let pass=0, fail=0;
for (const [inp, want, why] of cases){
  const got = norm(inp);
  const ok = got === want;
  ok?pass++:fail++;
  console.log(`${ok?'PASS':'FAIL'}  ${why}\n      in=${JSON.stringify(inp)} got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}
console.log(`\nnorm: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
