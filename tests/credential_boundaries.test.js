// Production scanner: exact value coverage and untouched surrounding text.
const assert = require('node:assert/strict');
const Scanner = require('../extension/engine/heuristics.js');
const scanner = new Scanner();
const { redactTurns } = require('../bin/pomicat.js');
const cases = [
  ['Password for my online banking is ', 'Tr0ub4dor&3'],
  ['Kode OTP BCA: ', '739204'],
  ['PIN ATM saya ', '482916'],
  ['Token 2FA saya ', '482913'],
  ['Use ', '482913', ' as your login code'],
  ['My IBAN is ', 'DE89 3704 0044 0532 0130 00'],
  ['My bank IBAN is ', 'GB82 WEST 1234 5698 7654 32'],
  ['My IBAN is ', 'FR14 2004 1010 0505 0001 3M02 606'],
  ['My IBAN is ', 'NL91 ABNA 0417 1643 00'],
  ['My IBAN is ', 'ES91 2100 0418 4502 0005 1332'],
  ['My IBAN is ', 'IT60 X054 2811 1010 0000 0123 456'],
  ['Rekening Mandiri saya ', '123-00-1234567-8'],
  ['X-API-Key: ', '9f8e7d6c5b4a3210fedcba9876543210'],
  ["aws_secret_access_key='", 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', "'"],
  ['redis-cli -h 10.0.0.5 -a ', 'S3cretPass', ' ping'],
  ['docker login registry.example -u admin -p ', 'S3cretPass'],
  ['smbclient //server/share -U user%', 'S3cretPass'],
  ['hydra -l admin -p ', 'password123', ' 10.0.0.5 ssh'],
  ['My birth year is ', '1995'],
  ['My address is ', 'Flat 12B, MG Road, Bengaluru 560001'],
  ['Address: ', '123 Main Street, Springfield, IL 62704', '. Please recommend a coffee shop nearby.'],
  ['Koordinat rumah saya ', '-6.2088, 106.8456'],
  ['My coordinates are ', '37.7749, -122.4194'],
  ['https://www.google.com/maps/@', '-6.2088,106.8456', ',17z'],
  ['My OTP code is ', 'four eight two nine one six'],
  ['Kode OTP saya ', 'empat delapan dua sembilan satu enam'],
  ['Send it to ', 'b u d i @ g m a i l . c o m'],
  ['Kirim ke ', 'b u d i @ g m a i l . c o m'],
  ['Kirim ke ', 'b u d i @ g m a i l . c o m', ' please send this today.'],
  ['My Aussie mobile is ', '0491 570 156'],
  ['NIK saya ', '317401 230495 0001'],
  ["JWT_SECRET='", 'JWT_SECRET', "'"],
];
let count = 0;
for (const [prefix, value, suffix = ''] of cases) {
  for (const lead of ['', 'Hello.\n', 'Привет 👨‍👩‍👧\n']) {
    const input = lead + prefix + value + suffix;
    const result = scanner.scan(input);
    const start = (lead + prefix).length;
    const detection = result.detections.find(d => d.valueStart === start && d.valueEnd === start + value.length);
    assert(detection, `Missing complete value span: ${input}`);
    assert(!result.sanitizedText.slice((lead + prefix).length).includes(value), input);
    assert(result.sanitizedText.startsWith(lead + prefix), input);
    assert(result.sanitizedText.endsWith(suffix), input);
    const shared = redactTurns([{ role: 'user', content: input }])[0].content;
    assert(!shared.slice((lead + prefix).length).includes(value), `Production CLI leaked: ${input}`);
    count++;
  }
}
for (const input of ['docker run -p 8080:80 image', 'The software was released in 1995.', 'Use 123 as your login code']) {
  assert.equal(scanner.scan(input).sanitizedText, input);
}
for (const input of ['Asthma, depression and epilepsy are medical conditions.', 'Gaji rata-rata lima belas juta rupiah per bulan.']) {
  assert.equal(redactTurns([{role:'user',content:input}])[0].content, input, input);
}
assert.equal(scanner.scan('Password for my online banking is [SECRET_1]').sanitizedText,
  'Password for my online banking is [SECRET_1]');
const mixed = redactTurns([{role:'user',content:'My salary is 5000 and port 8080 is open; hash abc5000def.'}])[0].content;
assert(mixed.includes('8080') && mixed.includes('abc5000def'), mixed);
for (const token of ['abc-5000-def', 'build_5000_alpha', 'abc/5000/def', 'abc.5000.def', 'α5000β', '37.500012']) {
  const result = redactTurns([{role:'user',content:`My salary is 5000; identifier ${token}.`}])[0].content;
  assert(result.includes(token), `financial replacement corrupted ${token}: ${result}`);
  assert(!result.includes('salary is 5000'), 'salary still needs protection');
}
for (const amount of ['Rp5000', '$5,000', '5000 per month']) {
  const result = redactTurns([{role:'user',content:`My salary is 5000.`},{role:'assistant',content:`Your salary is ${amount}.`}]);
  assert(!result[1].content.includes(amount), `legitimate money echo missed: ${amount}`);
}
for (const input of ['I have asthma, depression and epilepsy.', 'Saya didiagnosis diabetes tipe 2, hipertensi, dan asma sejak 2020.']) {
  const shared = redactTurns([{role:'user',content:input}])[0].content;
  for (const value of ['asthma','depression','epilepsy','diabetes tipe 2','hipertensi','asma']) {
    if (input.includes(value)) assert(!shared.includes(value), shared);
  }
}
const Pseudonymizer = require('../extension/engine/pseudonymizer.js');
const parser = new Pseudonymizer();
assert.equal(parser.parseFinancialValue('lima belas juta rupiah'), 15000000);
assert.equal(parser.parseFinancialValue('dua puluh lima juta'), 25000000);
assert.equal(parser.parseFinancialValue('seratus dua puluh lima juta'), 125000000);
assert.equal(parser.parseFinancialValue('satu dua juta'), 0, 'ambiguous digit words must not become invented amounts');
const spoken = redactTurns([{role:'user',content:'Gaji saya lima belas juta rupiah per bulan.'}])[0].content;
assert(!spoken.includes('lima belas juta'), spoken);
const Arbiter = require('../extension/engine/span_arbiter.js');
const arbiter = new Arbiter();
const arbitration = arbiter.arbitrate({text:'Rina123456', tier1Det:[{index:4,length:6,type:'CREDENTIALS'}],tier2Ner:[{start:0,end:5,label:'GIVEN_NAME',score:1}]});
assert(arbitration.resolvedSpans.some(s=>s.start===4 && s.end===10), 'heuristic index/length must beat overlapping NER');
for (const input of ["JWT_SECRET='[SECRET_2]'",'Address: [ADDRESS_1]. Please continue.']) {
  assert.equal(scanner.scan(input).sanitizedText, input, 'own placeholders must remain intact');
}
const unicodeInput = "Привет 👨‍👩‍👧\nJWT_SECRET='ＡＢＣＤＥＦ１２３'";
const unicodeHit = scanner.scan(unicodeInput).detections.find(d=>d.type==='CREDENTIAL_VALUE');
assert(unicodeHit);
assert.equal(unicodeInput.slice(unicodeHit.valueStart,unicodeHit.valueEnd),'ＡＢＣＤＥＦ１２３');
assert.equal(unicodeHit.secretToken,'ＡＢＣＤＥＦ１２３');
const overlapScanner = new Scanner();
overlapScanner.patterns = [
  {id:'LONG', name:'First value',category:'CREDENTIALS',regex:/(prefix )(ABCDE)/g,valueGroup:2,replacement:'$1[REDACTED_SECRET]'},
  {id:'CROSS',name:'Crossing value',category:'CREDENTIALS',regex:/(CDEFGHI)/g,valueGroup:1,replacement:'[REDACTED_SECRET]'}
];
const overlapping = overlapScanner.scan('prefix ABCDEFGHI safe');
assert.equal(overlapping.sanitizedText,'prefix [REDACTED_SECRET][REDACTED_SECRET] safe');
for (let i=7;i<16;i++) assert(overlapping.detections.some(d=>d.index<=i && d.index+d.length>i), 'sensitive overlap tail left visible');
// Reproducible variation, including lengths beyond the old 40/120-character caps.
let seed = 20261019;
for (let i = 0; i < 100; i++) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const value = 'Key&' + seed.toString(16) + 'Z'.repeat([6, 39, 40, 41, 119, 120, 121, 512][i % 8]);
  const prefix = ['X-API-Key: ', 'JWT_SECRET=', 'Password for my online banking is '][i % 3];
  const input = prefix + value + '\nKeep this sentence.';
  const result = scanner.scan(input);
  const det = result.detections.find(d=>d.valueStart===prefix.length && d.valueEnd===prefix.length+value.length);
  assert(det, `generated span case ${i}`);
  assert.equal(result.sanitizedText, prefix + '[REDACTED_SECRET]\nKeep this sentence.', `generated replacement case ${i}`);
}
console.log(`${count} credential/identifier boundary cases passed`);
console.log('100 seeded long-value cases passed');
for (const prefix of ['API_TOKEN=', 'api_key: ']) {
  const secret = 'OddSecret42'.repeat(30);
  assert.equal(scanner.scan(prefix + secret).sanitizedText, prefix + '[REDACTED_SECRET]', 'legacy assignment cap left a secret tail');
}
for (const prefix of ['password is ', 'My email password is ', 'PWD=']) {
  const secret = 'Long&Password42'.repeat(30);
  const result = scanner.scan(prefix + secret);
  assert(!result.sanitizedText.includes('Password42'), 'legacy conversational cap left a tail');
  assert(result.detections.some(d=>d.valueStart===prefix.length && d.valueEnd===prefix.length+secret.length));
}
