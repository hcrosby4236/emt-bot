// Pure rule-based patient state; this module never connects to Discord.
const { labels } = require('./actionParser');

function createSession(scenario) {
  return {
    scenario, findings: { ...scenario.findings }, performed: new Set(),
    log: [], delayed: false, transportStarted: false, ended: false,
  };
}
function goalsFor(session) {
  return [
    ...session.scenario.goals,
    ...(session.delayed ? session.scenario.delay.additionalGoals || [] : []),
  ];
}
function goalMet(session, goal) {
  if (!goal.anyOf.some(action => session.performed.has(action))) return false;
  if (goal.afterAny) {
    const lastCare = session.log.findLastIndex(entry =>
      entry.performed && goal.afterAny.includes(entry.action));
    const lastAssessment = session.log.findLastIndex(entry =>
      entry.performed && goal.anyOf.includes(entry.action));
    return lastCare >= 0 && lastAssessment > lastCare;
  }
  return true;
}
function applyActions(session, actions) {
  if (session.ended) throw new Error('This scenario has ended.');
  if (!Array.isArray(actions) || !actions.length || actions.length > 3 ||
      actions.some(action => !Object.hasOwn(labels, action))) {
    throw new Error('Unsupported scenario action.');
  }
  const results = [];
  for (const action of actions) {
    if (session.ended) break;
    let text;
    let performed = true;

    // Case-specific treatment branches override generic action responses.
    const effect = session.scenario.effects[action];
    if (effect && (!effect.requiresDelay || session.delayed)) {
      text = effect.text;
      Object.assign(session.findings, effect.setFindings || {});
    } else if (effect?.requiresDelay) {
      text = 'The current authored findings do not call for this action. Reassess breathing before choosing care.';
      performed = false;
    } else {
      switch (action) {
        case 'scene':
          text = 'The scene is secured; no additional hazards are identified in this case.'; break;
        case 'ppe':
          text = 'You state appropriate PPE is in use.'; break;
        case 'resources':
          text = 'Additional resources are requested. Continue care while your partner coordinates the response.'; break;
        case 'primary':
          text = ['responsiveness', 'airway', 'breathing', 'circulation']
            .map(key => key + ': ' + session.findings[key]).join(' ');
          break;
        case 'responsiveness': case 'airway': case 'breathing':
        case 'circulation': case 'vitals': case 'history': case 'secondary':
          text = session.findings[action]; break;
        case 'reassess':
          text = 'Current responsiveness: ' + session.findings.responsiveness +
            ' Breathing: ' + session.findings.breathing +
            ' Circulation: ' + session.findings.circulation;
          break;
        case 'pressure': case 'tourniquet':
          text = 'This case has no authored external-bleeding treatment target. Assess the patient and identify the problem first.';
          performed = false; break;
        case 'airwaySupport':
          text = 'The current airway findings are: ' + session.findings.airway +
            ' This case defines no further outcome for that maneuver.';
          performed = false; break;
        case 'ventilation':
          text = 'This case defines no ventilation-treatment branch for the current findings. Assess breathing and use the case references.';
          performed = false; break;
        case 'oxygen':
          text = 'You state oxygen is being provided per local protocol. This does not automatically correct inadequate ventilation.';
          break;
        case 'spine':
          text = 'You state unnecessary spinal movement is limited using your training and local protocol. The case does not score device technique.';
          break;
        case 'transport':
          session.transportStarted = true;
          text = 'Transport is initiated. Continue assessment and indicated care en route; provide a handoff when ready.';
          break;
        case 'wait':
          if (!session.delayed) {
            session.delayed = true;
            Object.assign(session.findings, session.scenario.delay.setFindings || {});
            text = session.scenario.delay.text;
          } else {
            text = 'No additional change is scripted. Current needs still require reassessment.';
          }
          break;
        case 'handoff':
          session.ended = true;
          text = session.transportStarted
            ? 'The receiving-team handoff ends this practice case.'
            : 'The case is ending before transport was recorded. Review the omitted goals below.';
          break;
      }
    }
    if (performed) session.performed.add(action);
    session.log.push({ action, performed, text });
    results.push({ action, performed, text });
  }
  return results;
}
function summarize(session) {
  const goals = goalsFor(session);
  return {
    completed: goals.filter(goal => goalMet(session, goal)).map(goal => goal.label),
    missed: goals.filter(goal => !goalMet(session, goal)).map(goal => goal.label),
    total: goals.length,
    transportStarted: session.transportStarted,
  };
}
module.exports = { createSession, applyActions, summarize };

