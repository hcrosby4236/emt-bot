// Node's built-in tools for reading folders and building file paths.
const fs = require('node:fs');
const path = require('node:path');

// Import the discord.js features used by the main file.
const {
  Client,             // Connects the bot to Discord.
  Collection,         // Stores commands by name.
  Events,             // Provides Discord event names.
  GatewayIntentBits,  // Controls which gateway events the bot receives.
  MessageFlags,       // Includes the flag for private responses.
} = require('discord.js');

// Read your bot token and test server ID from config.json.
const { token, guildId } = require('./config.json');

// Route scenario buttons and written-response forms to their own player.
const { handleScenarioInteraction } = require('./lib/scenarioPlayer');

// Create the bot.
// Guilds is enough for this slash-command-and-button setup.
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// Create a collection where loaded commands will be stored.
// Example: client.commands.get('quiz') retrieves the quiz command.
client.commands = new Collection();

// Build the commands folder path relative to this file.
// __dirname is the folder containing index.js.
const commandsPath = path.join(__dirname, 'commands');

// Read the folder and keep only JavaScript files.
const commandFiles = fs.readdirSync(commandsPath)
  .filter((file) => file.endsWith('.js'));

// Load each command file and store its exported command object.
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));

  // Each command exports "data" containing its slash command name.
  client.commands.set(command.data.name, command);
}

// Register commands globally so other servers can use them.
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);

  try {
    for (const command of client.commands.values()) {
      await readyClient.application.commands.create(
        command.data.toJSON()
      );
    }

    const registered = await readyClient.application.commands.fetch();

  console.log('Loaded commands:', client.commands.size);
  console.log(
    'Commands registered with Discord:',
    registered.map(command => command.name)
  );

    console.log('Global commands registered successfully.');
  } catch (error) {
    console.error('Command registration failed:', error);
  }
});


// Slash commands, scenario forms, and case-name autocomplete use one router.
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Quiz buttons are still handled by the quiz command's own collector.
    if (await handleScenarioInteraction(interaction)) return;

    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command?.autocomplete) await command.autocomplete(interaction);
      else await interaction.respond([]);
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    await command.execute(interaction);
  } catch (error) {
    // Print the full error in the terminal for troubleshooting.
    console.error(error);

    // Autocomplete interactions accept choices rather than message replies.
    if (interaction.isAutocomplete()) {
      if (!interaction.responded) await interaction.respond([]).catch(console.error);
      return;
    }

    const content = 'Something went wrong running that command.';

    // An interaction can receive only one initial reply.
    // If it was already answered or deferred, edit that response.
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({
        content,
        components: [], // Remove any remaining buttons.
      }).catch(console.error);
    } else {
      // Otherwise, send a private initial error response.
      await interaction.reply({
        content,
        flags: MessageFlags.Ephemeral,
      }).catch(console.error);
    }
  }
});

// Connect to Discord using the token from config.json.
// Log any login failure in the terminal.
client.login(token).catch(console.error);