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
  document.getElementById("safeshare-model-check").click();
  assert(modal.modelBusy && document.getElementById("btn-encrypt-publish").disabled, "model review not awaited");
  for (let i = 0; i < 300 && modal.modelBusy; i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert(!modal.modelBusy && modal.modelState.startsWith("Local model checked"), modal.modelState);
  const modelCandidates = modal.maybeCandidates.filter(c => c.reason.startsWith("Local model:"));
  assert(modelCandidates.length > 0, "no model suggestions in actual share dialog");
  assert(modelCandidates.every(c => !c.risky), "uncalibrated model candidates must not auto-hide");
  const selected = modelCandidates[0];
  document.getElementById(selected.id).click();
  assert(!modal.sanitizedTurns.some(t => t.content.includes(selected.raw)), "model suggestion choice not applied");
  const result = { checked: true, modelSuggestions: modelCandidates.length, badgeTargets: 3, noRealUpload: true };
  modal.removeExisting();
  return result;
}
