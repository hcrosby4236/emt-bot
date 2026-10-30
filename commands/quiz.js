// commands/quiz.js — single questions only; scenarios are a separate command.
const { SlashCommandBuilder } = require('discord.js');
const { loadQuestions, selectQuestion, askQuestion, unavailable } =
  require('../lib/quizTools');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quiz')
    .setDescription('Practice primary assessment and trauma questions')
    .addStringOption(option => option
      .setName('topic')
      .setDescription('Leave blank to mix primary assessment and trauma')
      .addChoices(
        { name: 'Primary Assessment', value: 'primary' },
        { name: 'Trauma', value: 'trauma' }
      )),

  async execute(interaction) {
    // This command never loads scenarios.json.
    const bank = loadQuestions().filter(question =>
      ['primary', 'trauma'].includes(question.topic)
    );
    const topic = interaction.options.getString('topic') || 'all';
    const question = selectQuestion(bank, { topic, focus: 'balanced' });
    if (!question) return unavailable(interaction);
    await askQuestion(interaction, question);
  },
};

