// Recognize supported written actions without an AI service.
// Matching is intentionally conservative: unfamiliar or negated text asks for clarification.
const labels = {
  scene: 'Check scene safety', ppe: 'Use PPE', resources: 'Request resources',
  responsiveness: 'Assess responsiveness', airway: 'Assess airway',
  breathing: 'Assess breathing', circulation: 'Assess circulation',
  primary: 'Perform primary assessment', vitals: 'Obtain vital signs',
  history: 'Obtain SAMPLE/history', secondary: 'Perform focused/secondary assessment',
  pressure: 'Apply direct pressure', tourniquet: 'Apply a tourniquet',
  airwaySupport: 'Support/open airway', ventilation: 'Assist ventilation',
  oxygen: 'Provide oxygen per protocol', spine: 'Limit spinal movement',
  transport: 'Initiate transport', reassess: 'Reassess the patient',
  wait: 'Wait/delay', handoff: 'Give handoff/end case',
};
const rules = [
  ['scene', /^(?:(?:check|assess|ensure|confirm|evaluate) (?:the )?(?:scene(?: is safe)?|scene safety)|scene (?:is )?safe|bsi scene safety)$/],
  ['ppe', /^(?:(?:put on|use|wear|don) (?:my |the |appropriate )?(?:ppe|gloves|bsi)|ppe|bsi)$/],
  ['resources', /^(?:(?:request|call|ask for) (?:for )?(?:als|backup|additional resources|resources|an ambulance)|request additional help)$/],
  ['primary', /^(?:(?:do|perform|complete|start|assess|check) (?:a |the )?(?:primary assessment|primary survey|abcs|abc|xabc)|primary assessment|primary survey|abcs|abc|xabc)$/],
  ['responsiveness', /^(?:(?:check|assess|evaluate|determine) (?:the |patient'?s )?(?:responsiveness|mental status|level of consciousness|loc|avpu)|(?:responsiveness|mental status|loc|avpu))$/],
  ['airway', /^(?:(?:check|assess|inspect|evaluate) (?:the |patient'?s )?airway|airway)$/],
  ['breathing', /^(?:(?:check|assess|evaluate|look at|listen to) (?:the |patient'?s )?(?:breathing|respirations|respiratory effort|chest rise|breath sounds)|breathing|respirations)$/],
  ['circulation', /^(?:(?:check(?: for)?|assess|evaluate|feel for|take) (?:the |a |patient'?s )?(?:circulation|pulse|radial pulse|carotid pulse|skin|skin signs|major bleeding|bleeding)|circulation|pulse|skin signs)$/],
  ['vitals', /^(?:(?:check|take|obtain|get|measure) (?:the |a |patient'?s )?(?:vitals|vital signs|blood pressure|bp|heart rate|pulse rate|respiratory rate|spo2|oxygen saturation)|(?:what (?:is|are) (?:the |his |her |their )?(?:vitals|vital signs|blood pressure|bp|heart rate|respiratory rate|spo2))|vitals)$/],
  ['history', /^(?:(?:get|obtain|take|ask for) (?:a |the )?(?:sample|sample history|history|medical history)|sample|sample history)$/],
  ['secondary', /^(?:(?:do|perform|start|complete) (?:a |the )?(?:secondary assessment|secondary survey|focused assessment|head to toe|head-to-toe exam)|(?:check|assess|examine|inspect|palpate) (?:the |his |her |their )?(?:chest|abdomen|pelvis|head|neck|back|ankle|legs|arms|injury|wound)|secondary assessment|focused assessment)$/],
  ['pressure', /^(?:(?:apply|hold|use|maintain) (?:firm |direct |firm direct )?(?:pressure|pressure to (?:the )?(?:wound|bleeding))|(?:control|stop) (?:the )?(?:bleeding|external bleeding))$/],
  ['tourniquet', /^(?:(?:apply|place|use|put on) (?:a |the )?(?:tourniquet|tq)(?: (?:to|on) (?:the )?(?:arm|leg|limb))?|tourniquet)$/],
  ['airwaySupport', /^(?:(?:open|support|maintain|manage|clear|suction) (?:the |patient'?s )?airway|(?:perform|use) (?:a )?jaw thrust|jaw thrust)$/],
  ['ventilation', /^(?:(?:assist|support|provide) (?:with )?(?:ventilation|ventilations|breathing)|(?:use|start|provide) (?:a |the )?(?:bvm|bag valve mask|bag-mask ventilation)|ventilate(?: (?:the )?patient)?|bag (?:the )?patient|bvm)$/],
  ['oxygen', /^(?:(?:give|apply|provide|start|administer) (?:supplemental )?(?:oxygen|o2)(?: per (?:local )?protocol)?|oxygen)$/],
  ['spine', /^(?:(?:hold|stabilize|support) (?:the )?(?:c spine|c-spine|head|neck)|(?:maintain|apply|use|perform|consider) (?:manual )?(?:spinal precautions|spinal motion restriction|spinal stabilization|c-spine stabilization)|limit (?:unnecessary |spinal )?movement|spinal precautions)$/],
  ['transport', /^(?:(?:start|initiate|arrange|prioritize|prepare for|begin) (?:rapid |urgent |immediate )?transport|transport(?: (?:the )?patient)?|load and go|load(?: (?:the )?patient)?|go to (?:the )?hospital)$/],
  ['reassess', /^(?:reassess(?: (?:the )?patient)?|repeat (?:the )?(?:primary assessment|vitals|vital signs)|check (?:the )?patient again)$/],
  ['wait', /^(?:wait|delay|wait and see|observe only|do nothing)$/],
  ['handoff', /^(?:(?:give|provide) (?:a )?(?:handoff|hand off|report)|handoff|hand off|finish|end (?:the )?(?:case|scenario)|done)$/],
];

function parseActions(text) {
  const normalized = String(text).toLowerCase().replace(/[’‘]/g, "'")
    .replace(/[ \t\r]+/g, ' ')
    .replace(/\bthe patient's /g, 'the ')
    .replace(/\b(?:his|her|their) /g, 'the ').trim();
  // Conditional, hypothetical, negated, or retrospective statements are not executed.
  if (/\b(?:if|unless|maybe|might|wouldn't|won't|don't|doesn't|didn't|not|never|avoid|without|should i|already|earlier)\b/.test(normalized)) {
    return { actions: [], issue: 'Please state the actions you want to take now, without conditions or negations.' };
  }
  // Keep common phrases containing "and" intact before splitting action clauses.
  const clauses = normalized.replace(/load and go/g, 'initiate transport')
    .replace(/wait and see/g, 'wait')
    .split(/[,;.\n]+|\bthen\b|\band\b/).map(value => value.trim()).filter(Boolean);
  if (!clauses.length || clauses.length > 3) {
    return { actions: [], issue: 'Please enter one to three short actions per response.' };
  }
  const actions = [];
  for (let clause of clauses) {
    clause = clause.replace(/^(?:i|we) (?:will |would |want to |am going to |are going to )?/, '')
      .replace(/^(?:have|ask) (?:my|the) partner (?:to )?/, '')
      .replace(/^please /, '').replace(/[?!]+$/, '').trim();
    const match = rules.find(([, pattern]) => pattern.test(clause));
    if (!match) return {
      actions: [], issue: 'I could not match "' + clause + '". No actions in this response were applied. Try a shorter action or use Help.',
    };
    if (!actions.includes(match[0])) actions.push(match[0]);
  }
  return { actions, issue: null };
}
module.exports = { parseActions, labels };

