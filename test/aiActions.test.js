const { test } = require('node:test');
const assert = require('node:assert/strict');
const { interpretActions } = require('../lib/aiActions');
const { createSession } = require('../lib/scenarioEngine');
const { loadScenarios, playScenario, handleScenarioInteraction } = require('../lib/scenarioPlayer');

process.env.OPENAI_API_KEY = 'test-key-never-sent';
const model = () => createSession(loadScenarios()[0]);
const result = parsed => ({
  ok: true, json: async () => ({ status: 'completed', output: [{
    type: 'message', content: [{ type: 'output_text', text: JSON.stringify(parsed) }],
  }] }),
});

test('uses structured AI output and sends no credentials in case context', async () => {
  const parsed = await interpretActions('is he breathing and can I feel a pulse?', model(), {
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(options.headers.Authorization, 'Bearer test-key-never-sent');
      const body = JSON.parse(options.body);
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
      assert.ok(!options.body.includes('test-key-never-sent'));
      assert.equal(JSON.parse(body.input).learnerResponse, 'is he breathing and can I feel a pulse?');
      return result({ actions: ['breathing', 'circulation'], issue: null });
    },
  });
  assert.deepEqual(parsed.actions, ['breathing', 'circulation']);
});

test('clarification never applies partial actions', async () => {
  const parsed = await interpretActions('check breathing and give medication', model(), {
    fetchImpl: async () => result({ actions: ['breathing'], issue: 'That medication is unsupported.' }),
  });
  assert.deepEqual(parsed.actions, []);
});

test('invalid, empty, excessive and incomplete AI outputs fail closed', async () => {
  for (const actions of [[], ['invented'], ['airway', 'breathing', 'circulation', 'vitals']]) {
    await assert.rejects(interpretActions('test', model(), {
      fetchImpl: async () => result({ actions, issue: null }),
    }), /No actions were applied/);
  }
  await assert.rejects(interpretActions('test', model(), {
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'incomplete' }) }),
  }), /No actions were applied/);
});

test('authentication, billing and network errors have usable messages', async () => {
  for (const [status, pattern] of [[401, /key was rejected/], [429, /API credit/], [500, /unavailable/]]) {
    await assert.rejects(interpretActions('test', model(), {
      fetchImpl: async () => ({ ok: false, status }),
    }), pattern);
  }
  await assert.rejects(interpretActions('test', model(), {
    fetchImpl: async () => { throw new Error('private API information'); },
  }), /could not connect/);
});

test('Discord defers AI calls, blocks duplicate submissions and preserves retry on failure', async () => {
  const originalFetch = global.fetch;
  let release;
  global.fetch = () => new Promise(resolve => { release = resolve; });
  let latest;
  const initial = {
    id: 'ai-test', guildId: 'guild', user: { id: 'owner' },
    reply: async payload => { latest = payload; }, editReply: async () => {},
  };
  const events = [];
  const submission = version => ({
    customId: 'trauma:ai-test:submit:' + version, user: initial.user,
    isButton: () => false, isModalSubmit: () => true,
    fields: { getTextInputValue: () => 'Can I feel a pulse?' },
    deferUpdate: async () => { events.push('deferred'); },
    editReply: async payload => { latest = payload; events.push('edited'); },
    reply: async payload => { events.push(payload.content); },
    followUp: async payload => { events.push(payload.content); },
  });
  try {
    await playScenario(initial, loadScenarios()[0]);
    const pending = handleScenarioInteraction(submission(0));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(events[0], 'deferred');
    await handleScenarioInteraction(submission(0));
    assert.match(events.at(-1), /Please wait/);
    release(result({ actions: ['circulation'], issue: null }));
    await pending;
    assert.match(latest.content, /Assess circulation/);
    await handleScenarioInteraction(submission(0));
    assert.match(events.at(-1), /case changed/);

    global.fetch = async () => ({ ok: false, status: 429 });
    await handleScenarioInteraction(submission(1));
    assert.match(events.at(-1), /API credit/);
    global.fetch = async () => result({ actions: ['vitals'], issue: null });
    await handleScenarioInteraction(submission(1));
    assert.match(latest.content, /Obtain vital signs/);
  } finally {
    await handleScenarioInteraction({
      customId: 'trauma:ai-test:finish', user: initial.user,
      isButton: () => true, isModalSubmit: () => false, update: async () => {},
    });
    global.fetch = originalFetch;
  }
});
