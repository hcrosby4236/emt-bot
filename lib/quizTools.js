// lib/quizTools.js — single-question quizzes; scenarios have their own engine.
const fs = require('node:fs');
const path = require('node:path');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags,
} = require('discord.js');

// Stable topic IDs are separate from the labels shown to members.
const topics = {
  airway: 'Airway, Respiration & Ventilation',
  cardiology: 'Cardiology & Resuscitation',
  medical: 'Medical Emergencies',
  special: 'OB/GYN, Pediatrics & Special Populations',
  operations: 'Operations',
  primary: 'Primary Assessment',
  scene: 'Scene Size-up and Safety',
  secondary: 'Secondary Assessment',
  trauma: 'Trauma',
};

function isTrauma(question) {
  return question.topic === 'trauma' ||
    (Array.isArray(question.tags) && question.tags.includes('trauma'));
}

function loadQuestions() {
  // Read on each command so question edits don't require a restart.
  const filename = path.join(__dirname, '..', 'data', 'questions.json');
  const bank = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!Array.isArray(bank)) throw new Error('questions.json must contain an array.');

  // Catch broken question records before posting them.
  const ids = new Set();
  for (const q of bank) {
    if (!q.id || ids.has(q.id)) throw new Error('Missing or duplicate question ID.');
    ids.add(q.id);
    if (!topics[q.topic]) throw new Error('Unknown topic in question ' + q.id);
    let validSource = false;
    try { validSource = new URL(q.source).protocol === 'https:'; } catch {}
    if (!validSource) throw new Error('Question needs an HTTPS source link: ' + q.id);
    const letters = Object.keys(q.choices || {});
    if (letters.length !== 4 ||
        !['A', 'B', 'C', 'D'].every(letter => letters.includes(letter)) ||
        !letters.includes(q.correctAnswer) ||
        !q.question || !q.explanation ||
        !letters.every(letter => typeof q.choices[letter] === 'string')) {
      throw new Error('Invalid question format: ' + q.id);
    }
  }
  // All source-linked questions are available immediately.
  return bank;
}

function pick(pool, random) {
  return pool.length ? pool[Math.floor(random() * pool.length)] : null;
}

function selectQuestion(bank, { topic = 'all', focus = 'more-trauma' } = {},
  random = Math.random) {
  // Keep the topic restriction even when using trauma weighting.
  const pool = bank.filter(q =>
    topic === 'all' || (topic === 'trauma' ? isTrauma(q) : q.topic === topic)
  );
  const trauma = pool.filter(isTrauma);
  const other = pool.filter(q => !isTrauma(q));
  if (focus === 'trauma-only') return pick(trauma, random);
  if (focus === 'more-trauma' && trauma.length && other.length) {
    return pick(random() < 0.7 ? trauma : other, random);
  }
  return pick(pool, random);
}

async function unavailable(interaction) {
  await interaction.reply({
    content: 'No questions match that topic. Add a source-linked question to questions.json.',
    flags: MessageFlags.Ephemeral,
  });
}

async function askQuestion(interaction, question) {
  const choices = Object.entries(question.choices)
    .map(([letter, text]) => '**' + letter + '.** ' + text).join('\n');
  const heading = '**' + topics[question.topic] + '**';
  const content = heading + '\n\n**' + question.question +
    '**\n\n' + choices;
  const source = question.source ? '\n\n[Study source](' + question.source + ')' : '';
  // Discord text messages are limited to 2,000 characters.
  const resultLength = content.length + question.explanation.length +
    source.length + question.choices[question.correctAnswer].length + 200;
  if (resultLength > 2000) {
    throw new Error('Question is too long for a text response: ' + question.id);
  }

  const buttons = new ActionRowBuilder().addComponents(
    Object.keys(question.choices).map(letter => new ButtonBuilder()
      .setCustomId(letter).setLabel(letter).setStyle(ButtonStyle.Primary))
  );
  // Questions and feedback remain public.
  await interaction.reply({
    content, components: [buttons], allowedMentions: { parse: [] },
  });
  const message = await interaction.fetchReply();
  const answer = await message.awaitMessageComponent({
    componentType: ComponentType.Button,
    time: 60_000,
    filter: button => {
      if (button.user.id === interaction.user.id) return true;
      void button.reply({
        content: 'Run /quiz or /scenario to start your own question.',
        flags: MessageFlags.Ephemeral,
      }).catch(console.error);
      return false;
    },
  }).catch(error => {
    if (error.code === 'InteractionCollectorError') return null;
    throw error;
  });
  if (!answer) {
    await interaction.editReply({
      content: content + '\n\n**Time is up!** Start another question to try again.',
      components: [], allowedMentions: { parse: [] },
    });
    return;
  }
  const correct = answer.customId === question.correctAnswer;
  const feedback = correct ? '**Correct!**' :
    '**Incorrect.** You selected ' + answer.customId + '.';
  await answer.update({
    content: content + '\n\n' + feedback + '\nCorrect answer: **' +
      question.correctAnswer + '. ' +
      question.choices[question.correctAnswer] + '**\n\n' +
      question.explanation + source,
    components: [], allowedMentions: { parse: [] },
  });
}

module.exports = {
  loadQuestions, selectQuestion, askQuestion, unavailable,
};

