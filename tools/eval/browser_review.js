// Shared real-extension DOM check, loaded only by the two isolated browser smoke harnesses.
async function checkBrowserReview() {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const modal = new SafeShareModal();
  modal.profile = "public";
  modal.numbersMode = "range";
  modal.activeCategories = new Set(Object.keys(SS_CATEGORIES));
  modal.open([
    { role: "user", content: "My checking account is WF-990218374, savings WF-771122883, loan SOFI-99821174. My card ending 4417, exp 08/27. A person mentioned is Amelia Hartwell." },
    { role: "assistant", content: "Your card expiration means August 2027.\n\nMy loan SOFI-99821174 is paid from WF-990218374. Billing address: [have address ready]" }
  ]);
  for (const raw of ["WF-990218374", "WF-771122883", "SOFI-99821174"]) {
    document.getElementById("btn-reset-default").click();
    const candidate = modal.candidates.find(c => c.raw === raw);
    assert(candidate, "missing entity " + raw);
    const badge = document.querySelector(`#diff-box-sanitized [data-cand-id="${candidate.id}"]`);
    assert(badge, "missing badge " + raw);
    badge.click();
    const contents = modal.sanitizedTurns.map(t => t.content).join("\n");
    assert(contents.includes(raw), "selected entity not revealed");
    for (const other of ["WF-990218374", "WF-771122883", "SOFI-99821174"].filter(x => x !== raw)) {
      assert(!contents.includes(other), "wrong entity revealed: " + other);
    }
  }
  document.getElementById("btn-reset-default").click();
  const before = modal.sanitizedTurns.map(t => t.content).join("\n");
  assert(!/4417|2k–5k/.test(before), "card digits treated as money");
  assert(before.includes("[have address ready]"), "address placeholder broken");
  const scanButton = document.getElementById("safeshare-model-check");
  if (scanButton) scanButton.click();
  else modal.checkLocalModel(false);
  for (let i = 0; i < 300 && modal.modelBusy; i++) await new Promise(resolve => setTimeout(resolve, 50));
  assert(!modal.modelBusy && modal.modelState.includes("Local AI model checked"), modal.modelState);
  const modelCandidates = modal.maybeCandidates.filter(c => c.reason.startsWith("Local model:"));
  assert(modelCandidates.length > 0, "no model suggestions in actual share dialog");
  assert(modelCandidates.every(c => !c.risky), "uncalibrated model candidates must not auto-hide");
  const selected = modelCandidates[0];
  document.getElementById(selected.id).click();
  assert(!modal.sanitizedTurns.some(t => t.content.includes(selected.raw)), "model suggestion choice not applied");
  // Inspector and suggestion checkbox must persist the same choice through a rebuild.
  const inspector = document.querySelector(`.cand-toggle-input[data-cand-id="${selected.id}"]`);
  assert(inspector, "missing model inspector toggle");
  inspector.checked = false;
  inspector.dispatchEvent(new Event("change", {bubbles:true}));
  assert(modal.sanitizedTurns.some(t => t.content.includes(selected.raw)), "inspector choice lost during rebuild");
  assert(modal.maybeChoices.get(selected.raw) === false, "inspector did not store explicit keep choice");
  // Development diagnostic, NOT a holdout benchmark or calibrated accuracy claim.
  const samples = [
    {language:'EN',text:'My name is Amelia Hartwell.',entities:['Amelia','Hartwell']},
    {language:'ID',text:'Nama saya Budi Santoso.',entities:['Budi','Santoso']},
    {language:'ID',text:'Simpan kredensial asli di password manager. Ini contoh dalam bahasa Inggris.',entities:[]},
    {language:'ID',text:'Gaji saya cukup untuk bulan ini, nggak perlu contoh tambahan.',entities:[]},
    {language:'EN',text:'Use fail2ban and restart the database service.',entities:[]},
    {language:'EN',text:'My colleague is Clara Whitmore.',entities:['Clara','Whitmore']},
    {language:'EN',text:'Please explain how password hashing works.',entities:[]},
    {language:'EN',text:'The connection uses port 5432 and HTTP status 503.',entities:[]},
    {language:'EN',text:'Please suggest a stronger password without changing the application code.',entities:[]}
  ];
  const diagnostics = [];
  for (const sample of samples) {
    const response = await SafeShareNer.analyze(sample.text, 60000, true);
    assert(response.success && Array.isArray(response.spans), 'model diagnostic unavailable');
    const accepted = SafeShareMaybe.scan([{role:'user',content:sample.text}], response.spans.map(s=>({...s,turnIndex:0})));
    const modelAccepted = accepted.filter(c=>c.reason.startsWith('Local model:'));
    const exactHits = sample.entities.filter(value=>modelAccepted.some(c=>c.raw === value)).length;
    const coveredEntities = sample.entities.filter(value=>{
      const start = sample.text.indexOf(value), end = start + value.length;
      return modelAccepted.some(c=>c.occurrences.some(o=>o.start <= start && o.end >= end));
    }).length;
    diagnostics.push({language:sample.language,expectedEntities:sample.entities.length,exactHits,
      coveredEntities,suggestions:modelAccepted.length,benignSuggestions:sample.entities.length ? null : modelAccepted.length});
  }
  const longText = 'My name is Amelia Hartwell. ' + 'Ordinary text about software testing and documentation. '.repeat(65) + 'My colleague is Clara Whitmore.';
  for (const text of ['My wife is Amelia Hartwell. saya saya', 'My wife is Di Yang.']) {
    const value = text.includes('Amelia') ? 'Amelia Hartwell' : 'Di Yang';
    const response = await SafeShareNer.analyze(text, 60000, true);
    const start = text.indexOf(value);
    assert(response.success && response.state === 'checked', 'mixed-message check unavailable');
    assert(response.spans.some(s => s.label === 'PERSON' && s.start <= start && s.end >= start + value.length), 'English name lost in mixed message');
  }
  const empty = await SafeShareNer.analyze('Please explain how password hashing works.', 60000, true);
  assert(empty.success && empty.state === 'checked' && empty.spans.length === 0, 'empty check is not a checked empty result');
  const longStart = performance.now();
  const longResponse = await SafeShareNer.analyze(longText, 60000, false);
  assert(longResponse.success && Array.isArray(longResponse.spans), 'long-message inference failed');
  for (const value of ['Amelia','Hartwell','Clara','Whitmore']) {
    const start=longText.indexOf(value), end=start+value.length;
    assert(longResponse.spans.some(s=>s.start<=start && s.end>=end), 'long-message entity omitted: '+value);
  }
  const result = { checked: true, modelSuggestions: modelCandidates.length, badgeTargets: 3, noRealUpload: true, developmentDiagnostics:diagnostics,
    longMessage:{characters:longText.length,entitiesCovered:4,elapsedMs:Math.round(performance.now()-longStart)} };
  modal.removeExisting();
  return result;
}
