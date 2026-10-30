// Recognize supported written actions without an AI service.
// Whole phrases are matched, so mentioning a treatment alone never executes it.
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

// Extra conversational forms supplement the original command phrases.
// These describe the same authored actions; they do not introduce new treatments.
const extraRules = [
  ['scene', /^(?:is (?:the )?scene safe|(?:look|check) for hazards|(?:ensure|make sure|confirm) (?:the )?scene is safe|scene safety|scene size up)$/],
  ['ppe', /^(?:(?:put on|use|wear|don) (?:(?:my|the|appropriate) )?(?:gloves and eye protection|gloves and goggles|gloves|eye protection)|glove up|body substance isolation)$/],
  ['resources', /^(?:(?:request|call|activate|ask for) (?:for )?(?:als assistance|als intercept|advanced life support|additional help|more help|a medic|paramedics|ems|backup)|get (?:als|backup|help))$/],
  ['primary', /^(?:(?:(?:do|perform|start|complete|check|assess) )?(?:(?:an?|the) )?(?:initial assessment|initial survey|primary|abc assessment|xabc assessment|abcde|cab|mabc)|check (?:the )?abcs)$/],
  ['responsiveness', /^(?:(?:is|are) (?:he|she|they|the patient|patient) (?:awake|alert|conscious|responsive)|(?:does|do) (?:he|she|they|the patient|patient) (?:respond|respond to voice|respond to pain)|(?:check|assess) (?:for )?(?:consciousness|response to voice|response to pain)|(?:talk|speak) to (?:him|her|them|the patient|patient)|(?:ask|check) (?:if )?(?:he|she|they|the patient|patient) (?:is|are) (?:okay|ok|responsive)|tap (?:the )?(?:patient|shoulder)|avpu assessment)$/],
  ['airway', /^(?:(?:is|are) (?:(?:his|her|their|the patient's|the|patient) )?airway (?:open|clear|patent|blocked)|(?:check|assess|inspect|look in) (?:(?:the|patient) )?(?:mouth|airway patency|airway for obstructions)|(?:look|check) for (?:airway )?obstructions|airway patency)$/],
  ['breathing', /^(?:(?:is|are) (?:he|she|they|the patient|patient) (?:breathing|breathing normally)|(?:how (?:is|are)) (?:he|she|they|the patient|patient) breathing|(?:check|assess|watch|look for|observe|listen for) (?:(?:the|patient) )?(?:breathing|respirations|chest rise|chest rise and fall|work of breathing|respiratory effort|lung sounds|breath sounds)|(?:listen to|auscultate) (?:(?:the|patient) )?(?:lungs|chest|breath sounds)|(?:respiratory assessment|lung sounds|breath sounds|chest rise))$/],
  ['circulation', /^(?:(?:does|do) (?:he|she|they|the patient|patient) have (?:a )?(?:pulse|radial pulse|carotid pulse|bleeding)|(?:is|are) (?:he|she|they|the patient|patient) bleeding|(?:check|assess|feel|palpate|look for|look at) (?:for )?(?:(?:a|the|patient) )?(?:pulse|radial pulse|carotid pulse|peripheral pulse|major bleeding|external bleeding|severe bleeding|circulation|skin color|skin colour|skin temperature|capillary refill)|(?:radial pulse|carotid pulse|capillary refill|skin color))$/],
  ['vitals', /^(?:(?:what (?:is|are)|get|take|check|obtain|measure|tell me|show me) (?:(?:the|patient) )?(?:vitals|vital signs|bp|blood pressure|heart rate|pulse rate|respiratory rate|spo2|oxygen saturation|temperature|pulse ox|pulse oximetry)|(?:bp|blood pressure|heart rate|respiratory rate|spo2|oxygen saturation|pulse ox|vital signs))$/],
  ['history', /^(?:(?:(?:get|take|obtain|ask|ask about|ask for|check) )?(?:(?:a|the|patient) )?(?:sample|sample history|opqrst|history|medical history|allergies|medications|past medical history|last oral intake|events leading up to this)|(?:what|which) (?:happened|medications (?:is|are) (?:he|she|they|the patient|patient) taking)|(?:does|do) (?:he|she|they|the patient|patient) have (?:any )?(?:allergies|medical conditions)|ask (?:him|her|them|the patient|patient) (?:what happened|about allergies|about medications|about medical history))$/],
  ['secondary', /^(?:(?:(?:do|perform|start|complete) )?(?:(?:a|the) )?(?:head to toe|head-to-toe|head to toe assessment|head-to-toe assessment|secondary survey|secondary exam|focused exam|rapid trauma assessment|physical exam|dcap btls|dcap-btls)|(?:check|assess|examine|inspect|palpate|look at) (?:(?:the|patient) )?(?:chest|abdomen|pelvis|head|neck|back|ankle|leg|legs|arm|arms|injury|wound|pupils))$/],
  ['pressure', /^(?:(?:apply|hold|maintain|put) (?:(?:firm|direct|firm direct) )?pressure (?:on|to|over) (?:the )?(?:wound|bleeding|injury|arm|leg)|(?:apply|use) (?:a )?pressure dressing|direct pressure)$/],
  ['tourniquet', /^(?:(?:apply|place|use|put on|tighten) (?:(?:a|the) )?(?:tourniquet|tq)(?: (?:to|on|above) (?:the )?(?:arm|leg|limb|wound|injury))?|tq)$/],
  ['airwaySupport', /^(?:(?:open|clear|suction|maintain|support) (?:(?:the|patient) )?(?:airway|mouth)|(?:(?:perform|use|do) (?:a )?)?(?:jaw thrust|jaw-thrust|head tilt chin lift|head-tilt chin-lift)|(?:insert|place|use) (?:an? )?(?:opa|npa|airway adjunct))$/],
  ['ventilation', /^(?:(?:assist|support) (?:(?:the|patient) )?(?:breathing|ventilations)|(?:bag|ventilate) (?:him|her|them|the patient|patient)|(?:use|start|provide|assist with) (?:a )?(?:bvm|bag valve mask|bag-valve-mask|bag mask|bag-mask)|(?:assist|provide) (?:rescue breaths|positive pressure ventilation)|bag valve mask|assisted ventilations)$/],
  ['oxygen', /^(?:(?:give|apply|provide|start|administer|put on) (?:supplemental )?(?:oxygen|o2)(?: (?:via|with|using|by) (?:a )?(?:nrb|nonrebreather|non-rebreather|nasal cannula))?(?: per (?:local )?protocol)?|(?:apply|use) (?:a )?(?:nrb|nonrebreather|non-rebreather|nasal cannula)|o2)$/],
  ['spine', /^(?:(?:hold|maintain|stabilize|support) (?:(?:manual|the|patient) )?(?:c spine|c-spine|cspine|cervical spine|spinal stabilization|inline stabilization)|(?:apply|place|use) (?:a )?(?:c collar|c-collar|cervical collar)|(?:manual )?(?:c spine|c-spine|cspine|spinal motion restriction|smr))$/],
  ['transport', /^(?:(?:take|move|bring|transport) (?:him|her|them|the patient|patient) to (?:the )?(?:hospital|trauma center|ambulance)|(?:start|begin|initiate|prepare for|arrange) (?:rapid |urgent |immediate )?transport(?: to (?:the )?(?:hospital|trauma center))?|load (?:him|her|them|the patient|patient)(?: into (?:the )?ambulance)?|rapid transport|load and go)$/],
  ['reassess', /^(?:(?:reassess|recheck|reevaluate|re-evaluate)(?: (?:(?:the|patient) )?(?:patient|abcs|vitals|vital signs|breathing|circulation|airway))?|(?:repeat|recheck) (?:(?:the|patient) )?(?:assessment|primary survey|primary assessment|vitals|vital signs)|check (?:on )?(?:him|her|them|the patient|patient) again)$/],
  ['wait', /^(?:wait(?: (?:a moment|for a minute))?|observe(?: (?:the )?patient)?|monitor only|do nothing|wait and see)$/],
  ['handoff', /^(?:(?:give|provide|deliver) (?:a )?(?:handoff|hand off|handover|report)(?: to (?:the )?(?:hospital|receiving team|nurse|staff))?|(?:end|finish|complete) (?:the )?(?:case|scenario)|handover|handoff report|done)$/],
];

const typos = {
  asses: 'assess', acess: 'assess', chek: 'check', chekc: 'check',
  brething: 'breathing', breating: 'breathing', responsivness: 'responsiveness',
  concious: 'conscious', conciousness: 'consciousness', pluse: 'pulse',
  oxgyen: 'oxygen', oxegen: 'oxygen', tourniqet: 'tourniquet',
  tournquet: 'tourniquet', turniquet: 'tourniquet', tournicate: 'tourniquet',
  respitory: 'respiratory', stabalize: 'stabilize', reassesss: 'reassess',
};

function cleanClause(clause) {
  return clause.trim().replace(/^(?:first|next|finally|after that)[,:]?\s+/, '')
    .replace(/^please /, '')
    .replace(/^(?:can|could|may) (?:i|we) /, '')
    .replace(/^(?:i|we)(?:'ll|'d| am| are|'m)? (?:would like to |will |would |want to |am going to |are going to |going to |gonna )?/, '')
    .replace(/^(?:have|ask|tell) (?:my|the|our) partner (?:to )?/, '')
    .replace(/^please /, '')
    .replace(/\b(?:his|her|their|the patient's|patient's) (?=airway|breathing|circulation|pulse|vitals|vital signs|blood pressure|heart rate|respiratory|spo2|oxygen|temperature|mouth|lungs|chest|abdomen|pelvis|head|neck|back|ankle|leg|arm|injury|wound|pupils|skin|medical|history|allergies|medications|responsiveness|mental status|level of consciousness|consciousness|abcs)/g, 'the ')
    .replace(/\b(?:checking|assessing|evaluating|obtaining|applying|providing|giving|taking|requesting|starting|performing|reassessing)\b/g,
      word => ({ checking: 'check', assessing: 'assess', evaluating: 'evaluate', obtaining: 'obtain', applying: 'apply', providing: 'provide', giving: 'give', taking: 'take', requesting: 'request', starting: 'start', performing: 'perform', reassessing: 'reassess' })[word])
    .replace(/[?!]+$/, '').trim();
}

function parseActions(text) {
  const normalized = String(text).toLowerCase().replace(/[’‘]/g, "'")
    .replace(/\b[a-z]+\b/g, word => typos[word] || word)
    .replace(/[ \t\r]+/g, ' ').trim();
  // Conditional, hypothetical, negated, or retrospective statements are not executed.
  if (/\b(?:if|unless|maybe|might|wouldn't|won't|don't|doesn't|didn't|isn't|aren't|can't|cannot|not|never|avoid|without|should i|already|earlier|instead of|before|after)\b/.test(normalized)) {
    return { actions: [], issue: 'Please state the actions you want to take now, without conditions or negations.' };
  }
  // Keep common phrases containing "and" intact before splitting action clauses.
  const clauses = normalized.replace(/load and go/g, 'initiate transport')
    .replace(/wait and see/g, 'wait')
    .replace(/chest rise and fall/g, 'chest rise')
    .replace(/gloves and (?:eye protection|goggles)/g, 'ppe')
    .replace(/\band then\b/g, 'then')
    .split(/[,;.?!\n]+|\bthen\b|\band\b|\bplus\b|\bfollowed by\b/)
    .map(cleanClause).filter(Boolean);
  if (!clauses.length || clauses.length > 3) {
    return { actions: [], issue: 'Please enter one to three short actions per response.' };
  }
  const actions = [];
  const matchPhrase = phrase => [...rules, ...extraRules].find(([, pattern]) => pattern.test(phrase));
  let assessmentVerb = '';
  for (const clause of clauses) {
    // Carry an assessment verb across lists such as "check airway and breathing".
    const verb = clause.match(/^(check|assess|evaluate|inspect|examine|palpate|obtain|get|take|measure)\b/);
    const directMatch = matchPhrase(clause);
    const match = directMatch || (assessmentVerb && matchPhrase(assessmentVerb + ' ' + clause));
    if (!match) return {
      actions: [], issue: 'I could not match "' + clause.slice(0, 180) + '". No actions in this response were applied. Try one action at a time or use Help.',
    };
    assessmentVerb = verb ? verb[1] : (directMatch ? '' : assessmentVerb);
    if (!actions.includes(match[0])) actions.push(match[0]);
  }
  return { actions, issue: null };
}
module.exports = { parseActions, labels };

