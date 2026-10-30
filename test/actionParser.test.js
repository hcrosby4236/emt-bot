const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseActions, labels } = require('../lib/actionParser');
const { loadScenarios, playScenario, handleScenarioInteraction } = require('../lib/scenarioPlayer');

const phrases = {
  scene: ['check scene safety', 'is the scene safe?', 'look for hazards', 'scene size up'],
  ppe: ['use PPE', 'glove up', 'put on my gloves and eye protection', 'body substance isolation'],
  resources: ['request ALS', 'call for paramedics', 'get backup', 'ask for more help'],
  primary: ['perform primary assessment', 'check ABCs', 'initial assessment', 'do an initial survey'],
  responsiveness: ['check responsiveness', 'is he awake?', 'does she respond to voice?', 'talk to the patient', 'check conciousness'],
  airway: ['check airway', 'is his airway clear?', 'look in the mouth', 'check for airway obstructions'],
  breathing: ['check breathing', 'is he breathing?', 'how are they breathing?', 'listen to her lungs', 'observe chest rise and fall'],
  circulation: ['check circulation', 'does she have a pulse?', 'feel for a radial pulse', 'is he bleeding?', 'check capillary refill'],
  vitals: ['get vitals', 'what are their vitals?', 'check blood pressure', 'pulse ox', 'what is his oxygen saturation?'],
  history: ['obtain SAMPLE history', 'what happened?', 'does he have any allergies?', 'ask about medications', 'ask the patient what happened', 'OPQRST'],
  secondary: ['perform focused assessment', 'head to toe assessment', 'palpate the abdomen', 'check pupils', 'rapid trauma assessment'],
  pressure: ['apply direct pressure', 'hold pressure on the wound', 'apply a pressure dressing', 'stop the bleeding'],
  tourniquet: ['apply a tourniquet', 'put on a tq', 'apply a turniquet', 'place a tourniquet above the wound'],
  airwaySupport: ['open the airway', 'suction the mouth', 'jaw thrust', 'insert an OPA'],
  ventilation: ['assist ventilation', 'bag him', 'use a bag-valve-mask', 'provide rescue breaths'],
  oxygen: ['give oxygen per protocol', 'give O2 via NRB', 'apply a nasal cannula', 'give oxgyen'],
  spine: ['maintain spinal precautions', 'hold c spine', 'apply a c-collar', 'SMR'],
  transport: ['initiate transport', 'take him to the hospital', 'load and go', 'load the patient into the ambulance'],
  reassess: ['reassess', 'repeat vitals', 'recheck the patient', 'check on her again'],
  wait: ['wait', 'wait and see', 'observe the patient', 'do nothing'],
  handoff: ['provide handoff', 'give report to the nurse', 'finish the case', 'handover'],
};

for (const [action, examples] of Object.entries(phrases)) {
  test('recognizes varied phrasing: ' + action, () => {
    for (const phrase of examples) {
      assert.deepEqual(parseActions(phrase), { actions: [action], issue: null }, phrase);
    }
  });
}

test('handles polite phrasing, partner instructions, lists, questions and typos', () => {
  for (const phrase of [
    'I would check his airway and breathing, then feel for a pulse',
    'Please check airway, breathing and circulation',
    'I am checking the airway. Is he breathing? Does she have a pulse?',
    'Can I check airway and can I check breathing and can I feel for a pulse?',
    'I would like to check airway then breathing then circulation',
    'I’ll check airway and ask my partner to check breathing and circulation',
    'chek airway; assess brething; check pluse',
  ]) assert.deepEqual(parseActions(phrase), { actions: ['airway', 'breathing', 'circulation'], issue: null }, phrase);
  assert.deepEqual(parseActions('examine chest and abdomen and pelvis').actions, ['secondary']);
  assert.deepEqual(parseActions('First check airway, next check breathing').actions, ['airway', 'breathing']);
});

test('rejects ambiguous, unsupported and negated responses without partial actions', () => {
  for (const phrase of [
    '', 'check airway and give aspirin', 'do not give oxygen', "don't apply a tourniquet",
    'if he stops breathing use a BVM', 'check airway before transport',
    'already gave oxygen', 'check airway without oxygen', 'instead of oxygen use BVM',
    'check airway and not breathing', 'tourniquet is in my bag',
    'what is a tourniquet?', 'check airway or breathing',
    'check airway, breathing, circulation, vitals', "he isn't breathing",
    'give oxygen at 500 liters per minute', 'check airway and delete everything',
  ]) {
    const parsed = parseActions(phrase);
    assert.deepEqual(parsed.actions, [], phrase);
    assert.ok(parsed.issue, phrase);
  }
});

test('all action IDs have phrase coverage', () => {
  assert.deepEqual(Object.keys(phrases).sort(), Object.keys(labels).sort());
});

test('Discord scenarios run without AI or network and allow retry after unclear input', async () => {
  const originalFetch = global.fetch;
  global.fetch = () => { throw new Error('Network must not be used'); };
  let latest;
  const replies = [];
  const initial = {
    id: 'local-test', guildId: 'guild', user: { id: 'owner' },
    reply: async payload => { latest = payload; }, editReply: async () => {},
  };
  const submission = (version, text) => ({
    customId: 'trauma:local-test:submit:' + version, user: initial.user,
    isButton: () => false, isModalSubmit: () => true,
    fields: { getTextInputValue: () => text },
    update: async payload => { latest = payload; },
    reply: async payload => { replies.push(payload.content); },
  });
  try {
    await playScenario(initial, loadScenarios()[0]);
    assert.match(latest.content, /Respond/);
    await handleScenarioInteraction(submission(0, 'check breathing and give aspirin'));
    assert.match(replies.at(-1), /No actions/);
    await handleScenarioInteraction(submission(0, 'is he breathing?'));
    assert.match(latest.content, /Assess breathing/);
    await handleScenarioInteraction(submission(0, 'give oxygen'));
    assert.match(replies.at(-1), /case changed/);
    await handleScenarioInteraction({ ...submission(1, 'get vitals'), user: { id: 'other' } });
    assert.match(replies.at(-1), /belongs to/);
    await handleScenarioInteraction(submission(1, 'does she have a pulse?'));
    assert.match(latest.content, /Assess circulation/);
  } finally {
    await handleScenarioInteraction({
      customId: 'trauma:local-test:finish', user: initial.user,
      isButton: () => true, isModalSubmit: () => false, update: async () => {},
    });
    global.fetch = originalFetch;
  }
});
