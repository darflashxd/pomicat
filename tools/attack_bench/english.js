// Independent EN challenge bench. No LLM/API calls; fictional, fixed-seed development data.
// node tools/attack_bench/english.js [--out report.json]
const fs = require('node:fs');
const { redactTurns, invert } = require('../../bin/pomicat.js');

const money = n => '$' + n.toLocaleString('en-US', {maximumFractionDigits: 2});
function buildCases() {
  let seed = 20261020;
  const rand = () => (seed = (Math.imul(seed,1664525) + 1013904223) >>> 0);
  const cases = [];
  for (let i=0;i<100;i++) {
    const salary = 2400 + (rand()%70)*100, rate = [10,15,20,25,30][rand()%5];
    const saving=salary*rate/100, keep=salary-saving, annual=salary*12;
    const family=['savings','annual','remainder','across-turns','rounded'][i%5];
    const safe=`Keep note bench-control-${i} unchanged. The application listens on port 5432.`;
    let answer;
    if(family==='savings') answer=`Your savings are ${money(saving)} per month at ${rate}%.`;
    if(family==='annual') answer=`Your annual salary is ${money(annual)}.`;
    if(family==='remainder') answer=`After saving ${rate}%, you have ${money(keep)} left each month.`;
    if(family==='across-turns') answer=`Your savings are ${money(saving)} per month. Your annual savings are ${money(saving*12)}.`;
    if(family==='rounded') answer=`Your savings are approximately ${money(Math.round(saving/100)*100)} per month at ${rate}%.`;
    const turns=[{role:'user',content:`My salary is ${money(salary)} per month. I save ${rate}%. ${safe}`},
      {role:'assistant',content:answer}];
    if(family==='across-turns') turns.splice(1,0,{role:'assistant',content:`The savings rate is ${rate}%.`},{role:'user',content:'Please show the monthly and annual savings.'});
    cases.push({id:`positive-${i}`,group:'supported',family,salary,rate,safe,turns});
  }
  for(let i=0;i<40;i++) {
    const safe=`Keep note negative-control-${i} unchanged. The application listens on port 5432.`;
    const answer=i%2 ? 'The yearly software budget is $12,000. The test ratio is 20%. These are unrelated public figures.' :
      'For an unrelated example, savings are $1,000 per month at 20%. This is not the user\'s budget.';
    cases.push({id:`negative-${i}`,group:'negative',family:'unrelated',salary:null,safe,
      turns:[{role:'user',content:`I have not disclosed my salary. ${safe}`},{role:'assistant',content:answer}]});
  }
  for(let i=0;i<20;i++) {
    const salary=4000+i*100,safe=`Keep note outside-control-${i} unchanged.`;
    cases.push({id:`outside-${i}`,group:'outside-scope',family:'base64-annual',salary,safe,
      turns:[{role:'user',content:`My salary is ${money(salary)} per month. ${safe}`},
        {role:'assistant',content:`Encoded annual salary (base64): ${Buffer.from(String(salary*12)).toString('base64')}`}]});
  }
  return cases;
}

// Separate attacker: literal currency parser + three explicit English relations only.
// It receives only visible turns, never source salary, generation family or hidden annotations.
function independentAttack(turns) {
  const text=turns.map(t=>t.content).join('\n'), guesses=[];
  const amount='\\$([0-9][0-9,]*(?:\\.[0-9]{1,2})?)';
  const value=s=>Number(s.replace(/,/g,''));
  const rate=/\b(?:save|saving|savings rate is)\s+(\d+(?:\.\d+)?)%/i.exec(text) || /\bat\s+(\d+(?:\.\d+)?)%/i.exec(text);
  for(const m of text.matchAll(new RegExp('annual salary is '+amount,'gi'))) guesses.push(value(m[1])/12);
  if(rate && Number(rate[1])>0 && Number(rate[1])<100) {
    const r=Number(rate[1])/100;
    for(const m of text.matchAll(new RegExp('savings are (?:approximately )?'+amount+' per month','gi'))) guesses.push(value(m[1])/r);
    for(const m of text.matchAll(new RegExp('you have '+amount+' left each month','gi'))) guesses.push(value(m[1])/(1-r));
  }
  return [...new Set(guesses)].filter(Number.isFinite);
}
function encodedAttack(turns) {
  return turns.flatMap(t=>[...t.content.matchAll(/Encoded annual salary \(base64\): ([A-Za-z0-9+/]+=*)/g)])
    .map(m=>Buffer.from(m[1],'base64').toString('utf8')).filter(s=>/^\d+$/.test(s)).map(s=>Number(s)/12);
}
function run() {
  const cases=buildCases();
  const rows=[];
  for(const redactor of ['none','entity-only','safeshare']) {
    for(const attacker of ['invert','independent-relations','encoded-annual']) {
      const groups={};
      const details=[];
      for(const c of cases) {
        const turns=redactor==='none'?c.turns:redactor==='safeshare'?redactTurns(c.turns):c.turns.map(t=>({...t,
          content:t.role==='user'&&c.salary?t.content.replace(money(c.salary),'[SALARY]'):t.content}));
        const text=turns.map(t=>t.content).join('\n');
        const guesses=attacker==='invert'?invert(text).map(g=>g.value):attacker==='encoded-annual'?encodedAttack(turns):independentAttack(turns);
        const visible=Boolean(c.salary && text.includes(money(c.salary)));
        const close=n=>c.salary && Math.abs(n-c.salary)<=c.salary*.01;
        const g=groups[c.group]??={cases:0,directlyVisible:0,top1RecoveredAfterMask:0,top5RecoveredAfterMask:0,negativeWithGuess:0,safeNotesPreserved:0,safePortsPreserved:0};
        g.cases++;g.directlyVisible+=visible;g.top1RecoveredAfterMask+=!visible&&Boolean(close(guesses[0]));
        g.top5RecoveredAfterMask+=!visible&&guesses.slice(0,5).some(close);g.negativeWithGuess+=c.group==='negative'&&guesses.length>0;
        g.safeNotesPreserved+=text.includes(c.safe.split(' The application')[0]);
        g.safePortsPreserved+=c.group!=='outside-scope'&&text.includes('port 5432');
        details.push({id:c.id,family:c.family,visible,top1:!visible&&Boolean(close(guesses[0])),top5:!visible&&guesses.slice(0,5).some(close),guesses:guesses.slice(0,5)});
      }
      rows.push({redactor,attacker,groups,details});
    }
  }
  return {scope:'160 fictional EN templated development cases, seed 20261020; not real-model output or an independent holdout',
    protocol:'100 supported-family cases (including approximate rounding), 40 unrelated controls, 20 out-of-scope base64 annual figures. Recovery within 1%; top-5 is first 5 guesses. NegativeWithGuess measures unsupported user-salary claims, not arithmetic correctness. Utility metrics cover explicit safe notes/ports only, not semantic usefulness. Partial-span security is tested by exact-span regression suites, not inferred from this output-only bench.',
    baseline:'entity-only has oracle knowledge of stated salary; not a third-party redaction product',rows};
}
if(require.main===module) {
  const report=run(),i=process.argv.indexOf('--out');
  if(i>=0) {if(!process.argv[i+1])throw Error('Missing output path');fs.writeFileSync(process.argv[i+1],JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({...report,rows:report.rows.map(({details,...r})=>r)},null,2));
}
module.exports={buildCases,independentAttack,encodedAttack,run};
