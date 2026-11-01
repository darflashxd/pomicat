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

// Prose after "password:", passwords with @ and $, backup codes, card codes, addresses vs clauses
{
  const s = text => scanner.scan(text).sanitizedText;
  assert(s('A strong randomly generated password:\n\nSuggested Wi-Fi password').includes('Suggested Wi-Fi password'), 'next line of prose is not a password');
  assert(!s('password:\n\nhunter2!x9').includes('hunter2!x9'), 'a secret-looking value on the next line is still a password');
  assert(s('Strong\n\nV9#qL2!mR8@xT5$wK4pZ').includes('mR8@xT5'), 'user@host rule must not split a password');
  assert(s('ssh deploy@web-01').includes('[user]@[host]'), 'standalone user@host still hidden');
  for (const text of ['My 2FA backup code is 8842-1197 and the CVV on the back is 123.', 'recovery codes: 4F7K-9QX2'])
    for (const v of ['8842-1197', '123', '4F7K-9QX2']) if (text.includes(v)) assert(!s(text).includes(v), `${v} left in ${s(text)}`);
  assert.equal(s('my backup code is ready'), 'my backup code is ready');
  assert(s('my name is pomicat i live in bandung and that video has 482913 views').includes('482913'), 'a clause is not a street address');
  assert(!s('I live at 221B Baker Street, London NW1 6XE').includes('Baker Street'), 'letter house numbers are addresses');
  const Maybe = require('../extension/engine/maybe.js');
  const turns = [{ role: 'assistant', content: 'Suggested Wi-Fi password\n\nStrong\n\nV9#qL2!mR8@xT5$wK4pZ\n\nUse $HOME and https://Example.com/A1?b=2X' }];
  const found = Maybe.scan(turns);
  assert(found.some(c => c.raw === 'V9#qL2!mR8@xT5$wK4pZ' && c.risky), 'symbol password found whole and pre-ticked');
  assert(!found.some(c => /\$HOME|https:/.test(c.raw)), 'shell variables and URLs are not passwords');
}
// Amounts in English words
{
  const out = redactTurns([
    { role: 'user', content: 'I earn fifteen thousand dollars a month. I save 20%.' },
    { role: 'assistant', content: 'Saving 20% of fifteen thousand dollars is $3,000 a month.' },
    { role: 'user', content: 'The book costs ten dollars and one of my friends said hi.' }
  ]).map(t => t.content).join('\n');
  for (const leak of ['fifteen thousand', '3,000']) assert(!out.includes(leak), `${leak} left in: ${out}`);
  assert(out.includes('ten dollars') && out.includes('one of my friends'), 'impersonal amounts and ordinary words stay');
}
console.log('credential boundaries: prose after password:, symbol passwords, backup/CVV codes, clause addresses, word amounts passed');

// IDs kept whole, sort codes, seed phrase, SWIFT optional, Bitcoin "is" not an address
{
  const s = text => scanner.scan(text).sanitizedText;
  for (const [text, value] of [['My Aadhaar number is 1234 5678 9012', '5678'], ['My German tax ID is 12 345 678 901', '12 345'],
    ['My National Insurance number is QQ 12 34 56 C', '34 56'], ['My Japanese My Number card ID is 9876 5432 1098', '5432'],
    ['My Dutch BSN is 111222333', '111222333'], ['My UK sort code is 12-34-56', '12-34-56']]) assert(!s(text).includes(value), `${value} left in ${s(text)}`);
  assert.equal(s('My number is 0812-3456-7890'), 'My number is [REDACTED_PHONE]');
  assert(s('Wire it to SWIFT DEUTDEFF').includes('DEUTDEFF'), 'SWIFT/BIC is optional');
  assert.equal(s('My seed phrase is abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'), 'My seed phrase is [REDACTED_MNEMONIC_SEED_PHRASE]');
  assert.equal(scanner.scan('My Bitcoin address is 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa').detections.length, 1, 'only the wallet, no address');
}
// Addresses: one per line, city included, countries and ordinary words kept
{
  const s = text => scanner.scan(text).sanitizedText;
  const block = 'I live at 10 Merdeka Street, Jakarta. Please make the fastest route\nI live at 221B Baker Street, London NW1 6XE. Please plan my commute\nMy friend lives at 42 Wallaby Way, Sydney NSW 2000\nShip it to 350 Fifth Avenue, Apt 4B, New York, NY 10118 (leave at the door)\nI\'m at 1600 Pennsylvania Avenue NW';
  const out = s(block);
  assert.equal(out.split('\n').length, 5, 'one address per line');
  for (const leak of ['Merdeka', 'Jakarta', 'Baker', 'Wallaby', 'Sydney', 'Fifth', 'Pennsylvania']) assert(!out.includes(leak), `${leak} left in ${out}`);
  assert(out.includes('Ship it to') && out.includes('(leave at the door)') && out.includes('Please plan my commute'));
  assert(s('Shipping address: Flat 12, Baker Street, London NW1 6XE, United Kingdom.').includes('United Kingdom'), 'country stays');
  for (const keep of ['I am at work 9 hours a day', "I'm at level 5", 'I live in Bandung and work as a nurse']) assert.equal(s(keep), keep);
}
// A line break ends a sentence, so another line's "my" does not make a follower count money
{
  const R = require('../extension/engine/symbolic_rewriter.js');
  const r = new (R.SymbolicRewriter || R)();
  const block = 'I have 500 followers and a target of 10,000 by 2026\nApple reported revenue of $383 billion last year\nHow do I protect my SSN online?';
  assert.deepEqual(r.analyze(block).detectedItems.map(d => d.raw), []);
  assert.deepEqual(r.analyze('My salary is\n$5,000 a month').detectedItems.map(d => d.raw), ['$5,000'], 'a wrapped sentence still counts');
}
// Figures derived from a before-sending symbol are hidden when its value is known
{
  const P = require('../extension/engine/pseudonymizer.js');
  const turns = [{ role: 'user', content: 'User: I earn <S16> a year.\nAssistant: <S16> / 12 is about $7,083.33 per month. You keep $5,312.50 after 25% tax.' }];
  const { anonymizedTurns } = new P().anonymizeConversation(turns, [], [], { extraSecrets: [85000] });
  for (const leak of ['7,083.33', '5,312.50']) assert(!anonymizedTurns[0].content.includes(leak), `${leak} left: ${anonymizedTurns[0].content}`);
}
console.log('credential boundaries: national IDs, addresses, line sentences, symbol-derived figures passed');

// Network: technical "X address" is not a street, IPv6 whole, internal hosts, Telegram tokens
{
  const s = text => scanner.scan(text).sanitizedText;
  assert.equal(s("What's the broadcast address of 203.0.113.0/26?"), "What's the broadcast address of 203.0.113.0/26?");
  assert.equal(s('My IPv6 address is 2001:db8:85a3::8a2e:370:7334, why?'), 'My IPv6 address is [REDACTED_IPV6], why?');
  assert.equal(s("My laptop's MAC address is 00:1A:2B:3C:4D:5E"), "My laptop's MAC address is [REDACTED_MAC_ADDRESS]");
  assert.equal(s('Telegram bot token 123456789:AAH-abcdefghijklmnopqrstuvwxyz012345678'), 'Telegram bot token [REDACTED_TELEGRAM_TOKEN]');
  assert.equal(s('db-prod-01.corp.internal is unreachable from jenkins.corp.local'), '[REDACTED_HOST] is unreachable from [REDACTED_HOST]');
  assert.equal(s('Our wiki is https://wiki.acmecorp.internal/pages/prod-runbook, please summarize it'), 'Our wiki is [REDACTED_INTERNAL_URL], please summarize it');
  assert.equal(s('My home address is 12 High Street, Leeds'), 'My home address is [REDACTED_ADDRESS]');
}
// Model spans across a line break are not suggestions; ages hidden next to [DOB_n]
{
  const Maybe = require('../extension/engine/maybe.js');
  const text = 'all host bits are set to 1.\n\n00111111 in binary = 63.';
  assert.deepEqual(Maybe.scan([{ role: 'assistant', content: text }], [{ turnIndex: 0, start: text.indexOf('1.'), end: text.indexOf('00111111') + 8, label: 'PASSWORD', score: 0.8 }]), []);
  const P = require('../extension/engine/pseudonymizer.js');
  const out = new P().anonymizeConversation([{ role: 'user', content: "I'm 28 years old, born in [DOB_4]" }, { role: 'assistant', content: 'You are 28 years old.' }], [], [], {}).anonymizedTurns;
  assert(out.every(t => !/\b28\b/.test(t.content)), out.map(t => t.content).join(' | '));
}
console.log('credential boundaries: network, internal hosts, Telegram, multi-line model spans, ages passed');

{
  // The writer's own loan: the approved amount, fees and premium all become symbols, and
  // "loan is Rp480,000,000" is an amount, not a record ID cut at the first comma
  const Rewriter = require("../extension/engine/symbolic_rewriter.js");
  const Vault = require("../extension/engine/symbolic_vault.js");
  const loan = "Please review my loan disbursement. The approved loan is Rp480,000,000. The lender will deduct an administration fee of Rp4,800,000 and an insurance premium of Rp7,200,000. My outstanding debt with another lender is Rp95,000,000.";
  const out = new Rewriter(new Vault()).rewrite(loan).sanitizedPrompt;
  assert(!/480|4,800|7,200|95,000|RECORD_ID/.test(out), out);
  // Without the writer's own loan, a fee sentence stays as written
  const pub = new Rewriter(new Vault()).rewrite("Banks usually charge an administration fee of Rp4,800,000 on a typical loan.");
  assert(!pub.sanitizedPrompt || pub.sanitizedPrompt.includes("Rp4,800,000"), pub.sanitizedPrompt);
}
