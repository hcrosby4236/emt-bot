// Local phrase matching interprets actions; the authored engine controls outcomes.
// This module owns scenario sessions; quiz questions remain independent.
const fs = require('node:fs');
const path = require('node:path');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder,
  TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');
const { parseActions, labels } = require('./actionParser');
const { createSession, applyActions, summarize } = require('./scenarioEngine');

const sessions = new Map();
const owners = new Map();
const SESSION_MS = 12 * 60 * 1000;
const allowedMentions = { parse: [] };
const findingKeys = ['responsiveness', 'airway', 'breathing', 'circulation',
  'vitals', 'history', 'secondary'];

function validSource(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && value.length <= 250;
  } catch { return false; }
}
function validateScenarios(bank) {
  if (!Array.isArray(bank)) throw new Error('scenarios.json must contain an array.');
  const ids = new Set();
  const validateGoals = goals => {
    if (!Array.isArray(goals)) throw new Error('Scenario goals must be an array.');
    for (const goal of goals) {
      if (typeof goal.label !== 'string' || !goal.label ||
          !Array.isArray(goal.anyOf) || !goal.anyOf.length ||
          !goal.anyOf.every(action => Object.hasOwn(labels, action))) {
        throw new Error('Invalid scenario learning goal.');
      }
      if (goal.afterAny && (!Array.isArray(goal.afterAny) ||
          !goal.afterAny.every(action => Object.hasOwn(labels, action)))) {
        throw new Error('Invalid reassessment ordering rule.');
      }
    }
  };
  const validateFindings = findings => {
    if (!findings || typeof findings !== 'object' || Array.isArray(findings)) {
      throw new Error('Invalid scenario findings.');
    }
    for (const [key, value] of Object.entries(findings)) {
      if (!findingKeys.includes(key) || typeof value !== 'string' ||
          !value.trim() || value.length > 220) throw new Error('Invalid finding: ' + key);
    }
  };
  for (const scenario of bank) {
    if (typeof scenario.id !== 'string' || !scenario.id || ids.has(scenario.id)) {
      throw new Error('Missing or duplicate scenario ID.');
    }
    ids.add(scenario.id);
    for (const key of ['title', 'dispatch', 'presentation', 'review']) {
      if (typeof scenario[key] !== 'string' || !scenario[key].trim() ||
          scenario[key].length > 300) throw new Error('Invalid ' + key + ' in ' + scenario.id);
    }
    if (!Array.isArray(scenario.sources) || !scenario.sources.length ||
        scenario.sources.length > 3 || !scenario.sources.every(validSource)) {
      throw new Error('Each scenario needs one to three HTTPS source links.');
    }
    validateFindings(scenario.findings);
    if (!findingKeys.every(key => scenario.findings[key])) {
      throw new Error('Missing findings in ' + scenario.id);
    }
    validateGoals(scenario.goals);
    if (!scenario.effects || typeof scenario.effects !== 'object') {
      throw new Error('Missing treatment branches in ' + scenario.id);
    }
    for (const [action, effect] of Object.entries(scenario.effects)) {
      if (!Object.hasOwn(labels, action) || typeof effect.text !== 'string' ||
          effect.text.length > 300) throw new Error('Invalid treatment branch.');
      if (effect.setFindings) validateFindings(effect.setFindings);
    }
    if (!scenario.delay || typeof scenario.delay.text !== 'string') {
      throw new Error('Missing delay branch in ' + scenario.id);
    }
    if (scenario.delay.setFindings) validateFindings(scenario.delay.setFindings);
    if (scenario.delay.additionalGoals) validateGoals(scenario.delay.additionalGoals);
  }
  return bank;
}
function loadScenarios() {
  // Source-linked cases become available immediately; there is no approval flag.
  const file = path.join(__dirname, '..', 'data', 'scenarios.json');
  return validateScenarios(JSON.parse(fs.readFileSync(file, 'utf8')));
}
function sourceLinks(scenario) {
  return scenario.sources.map((url, i) => '[Source ' + (i + 1) + '](' + url + ')').join(' · ');
}
function safeText(value) {
  return String(value).replace(/[\\`*_\[\]<>]/g, '');
}
function publicPayload(content, components = []) {
  if (content.length > 2000) throw new Error('Scenario response exceeds 2,000 characters.');
  return { content, components, allowedMentions };
}
function controls(id) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('trauma:' + id + ':respond')
      .setLabel('Respond').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('trauma:' + id + ':help')
      .setLabel('Help').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('trauma:' + id + ':finish')
      .setLabel('Finish case').setStyle(ButtonStyle.Secondary)
  )];
}
function renderScreen(session, results = [], typed = '') {
  const scenario = session.model.scenario;
  let content = '**' + scenario.title + '**\n**Dispatch:** ' + scenario.dispatch +
    '\n**Patient:** ' + scenario.presentation;
  if (!results.length) {
    content += '\n\nThe scene is secured and a partner is available. What do you do next?' +
      '\nClick **Respond** and enter one to three actions. Help shows examples.';
  } else {
    content += '\n\n**Your response:** ' + safeText(typed).slice(0, 120);
    for (const result of results) {
      content += '\n\n**' + labels[result.action] + '**' +
        (result.performed ? '' : ' — not applied') + '\n' + result.text;
    }
    content += '\n\n**What do you do next?**' +
      (session.model.transportStarted ? ' You are in the transport phase.' : '');
  }
  content += '\n\n' + sourceLinks(scenario);
  return publicPayload(content, controls(session.id));
}
function renderSummary(session, reason = '') {
  const model = session.model;
  const review = summarize(model);
  const completed = review.completed.length ? review.completed.join('; ') : 'None recorded.';
  const missed = review.missed.length ? review.missed.join('; ') : 'All authored goals were recorded.';
  return publicPayload('**Case summary: ' + model.scenario.title + '**\n' +
    (reason ? reason + '\n' : '') +
    '**Goals recorded: ' + review.completed.length + '/' + review.total + '**\n' +
    'This measures recognized actions, not hands-on technique.\n\n' +
    '**Completed:** ' + completed + '\n\n**To revisit:** ' + missed +
    '\n\n**Case takeaway:** ' + model.scenario.review +
    '\n\n' + sourceLinks(model.scenario));
}
function closeSession(session) {
  clearTimeout(session.timer);
  sessions.delete(session.id);
  if (owners.get(session.ownerKey) === session.id) owners.delete(session.ownerKey);
}

async function playScenario(interaction, scenario) {
  validateScenarios([scenario]);
  const ownerKey = (interaction.guildId || 'dm') + ':' + interaction.user.id;
  if (owners.has(ownerKey)) {
    await interaction.reply({
      content: 'You already have a scenario running. Use Finish case on that scenario first.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const session = {
    id: interaction.id, ownerId: interaction.user.id, ownerKey, interaction,
    model: createSession(scenario), version: 0, turns: 0, timer: null,
  };
  // Preflight the initial screen and debrief before posting.
  renderScreen(session);
  renderSummary(session);
  sessions.set(session.id, session);
  owners.set(ownerKey, session.id);
  try {
    await interaction.reply(renderScreen(session));
    session.timer = setTimeout(() => {
      closeSession(session);
      void interaction.editReply(renderSummary(session, 'Session expired.'))
        .catch(console.error);
    }, SESSION_MS);
    session.timer.unref?.();
  } catch (error) {
    closeSession(session);
    throw error;
  }
}

const help = '**Example actions**\n' +
  'check responsiveness; check airway; check breathing; check circulation\n' +
  'perform primary assessment; get vitals; obtain SAMPLE history\n' +
  'apply direct pressure; apply a tourniquet; assist ventilation\n' +
  'support airway; give oxygen per protocol; maintain spinal precautions\n' +
  'request ALS; initiate transport; reassess; provide handoff\n\n' +
  'Use up to three actions per response, in the order you intend to take them. ' +
  'Example: "check airway, check breathing, check circulation".\n' +
  'You can also ask "is he breathing?", "does she have a pulse?", or "what are their vitals?" ' +
  'Phrases like "I would check his airway and breathing" and common typos work too.\n' +
  'No AI or API key is needed. If any phrase is unclear, nothing in that response is applied. ' +
  'State actions to take now; split conditional plans into separate responses.';

// Called by index.js for button and form-submission interactions.
async function handleScenarioInteraction(interaction) {
  if (!(interaction.isButton() || interaction.isModalSubmit()) ||
      !interaction.customId?.startsWith('trauma:')) return false;
  const [, id, action, version] = interaction.customId.split(':');
  const session = sessions.get(id);
  if (!session) {
    await interaction.reply({
      content: 'This scenario has ended or the bot restarted. Run /scenario to begin again.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  if (interaction.user.id !== session.ownerId) {
    await interaction.reply({
      content: 'This case belongs to the person who started it. Run /scenario for your own case.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  if (interaction.isButton()) {
    if (action === 'help') {
      await interaction.reply({ content: help, flags: MessageFlags.Ephemeral });
    } else if (action === 'finish') {
      const payload = renderSummary(session, 'You ended the case.');
      closeSession(session);
      await interaction.update(payload);
    } else if (action === 'respond') {
      const input = new TextInputBuilder().setCustomId('action')
        .setLabel('What do you do next?')
        .setPlaceholder('Example: check airway, check breathing, check circulation')
        .setStyle(TextInputStyle.Paragraph).setMaxLength(400).setRequired(true);
      const modal = new ModalBuilder()
        .setCustomId('trauma:' + id + ':submit:' + session.version)
        .setTitle('Your next actions')
        .addComponents(new ActionRowBuilder().addComponents(input));
      // No message-content intent is required; canceled forms don't lock the case.
      await interaction.showModal(modal);
    } else {
      await interaction.reply({ content: 'Use the current scenario buttons.', flags: MessageFlags.Ephemeral });
    }
    return true;
  }
  if (action !== 'submit' || version !== String(session.version)) {
    await interaction.reply({
      content: 'The case changed after this form opened. Click Respond again for the current state.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  const typed = interaction.fields.getTextInputValue('action');
  const parsed = parseActions(typed);
  if (parsed.issue) {
    await interaction.reply({ content: safeText(parsed.issue) + '\n\n' + help,
      flags: MessageFlags.Ephemeral, allowedMentions });
    return true;
  }
  // Apply synchronously so a duplicate form cannot reuse the current version.
  const results = applyActions(session.model, parsed.actions);
  session.version++;
  session.turns++;
  if (session.model.ended || session.turns >= 20) {
    const payload = renderSummary(session,
      session.model.ended ? 'Handoff/end of case recorded.' : 'Practice turn limit reached.');
    closeSession(session);
    await interaction.update(payload);
  } else {
    await interaction.update(renderScreen(session, results, typed));
  }
  return true;
}
module.exports = {
  loadScenarios, validateScenarios, playScenario, handleScenarioInteraction,
  renderScreen, renderSummary, help,
};

