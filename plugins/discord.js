const { workerData, isMainThread } = require('node:worker_threads')
const name = "Discord"

if (isMainThread)
    return module.exports = {
        name: name,
        description: "Discord",
        hidden: true
    };

const { Client, Events, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const ggeConfig = require("../ggeConfig.json")

let clientOptions = { intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildIntegrations, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences] }
let client = new Client(clientOptions)

client.on(Events.ClientReady, () => client.user.setActivity('github.com/darrenthebozz/GGE-BOT'))

let commands = new Collection()

if (workerData.internalWorker)
    client.on(Events.InteractionCreate, async interaction => {
        if (!interaction.isChatInputCommand()) return;

        const command = commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
    });

client.login(ggeConfig.discordToken);

function refreshCommands() {
    const rest = new REST().setToken(ggeConfig.discordToken)
    if (commands.size == 0)
        console.warn("No commands")

    if (commands.size != 0)
        client.guilds.cache.forEach(async guild => {
            let commands = commands.map(command => command.data.toJSON())
            
            await rest.put(
                Routes.applicationGuildCommands(ggeConfig.discordClientId, guild.id),
                { body: commands },
            );
        });
}

/** @type {Promise<Client>} */
let clientPromise =  new Promise((resolve, reject) => {
    client.once("error", reject)
    client.once("ready", () => {
        client.off("error", reject)
        resolve(client)
    })
})
module.exports = { refreshCommands, client: clientPromise,commands }
