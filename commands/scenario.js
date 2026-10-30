// /scenario is a written-response activity, separate from /quiz.
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { loadScenarios, playScenario } = require('../lib/scenarioPlayer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('scenario')
    .setDescription('Work through a trauma case with written actions')
    .addStringOption(option => option
      .setName('case')
      .setDescription('Choose a case or leave blank for a random situation')
      .setAutocomplete(true)),

  // Read names from the case bank so adding a case needs no code changes.
  async autocomplete(interaction) {
    const query = interaction.options.getFocused().toLowerCase();
    const matches = loadScenarios().filter(scenario =>
      (scenario.title + ' ' + scenario.id).toLowerCase().includes(query)
    ).slice(0, 25).map(scenario => ({ name: scenario.title, value: scenario.id }));
    await interaction.respond(matches);
  },

  async execute(interaction) {
    const selected = interaction.options.getString('case');
    const cases = loadScenarios().filter(scenario => !selected || scenario.id === selected);
    if (!cases.length) {
      await interaction.reply({
        content: 'No matching scenario was found. Choose a case from the list or add one to scenarios.json.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await playScenario(interaction, cases[Math.floor(Math.random() * cases.length)]);
  },
};

