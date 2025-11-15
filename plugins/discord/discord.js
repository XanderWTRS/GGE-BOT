const { isMainThread } = require('node:worker_threads')
const name = "Discord"

if (isMainThread)
    return module.exports = {
        name: name,
        description: "Discord",
        hidden: true
    };

const { Client, Events, GatewayIntentBits } = require('discord.js');
const ggeConfig = require("../../ggeConfig.json")

let clientOptions = { intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildIntegrations, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences] }
let client = new Client(clientOptions)

client.on(Events.ClientReady, () => client.user.setActivity(`https://github.com/darrenthebozz/GGE-BOT`))
client.login(ggeConfig.discordToken);

/** @type {Promise<Client>} */
let clientPromise =  new Promise((resolve, reject) => {
    client.once(Events.Error, reject)
    client.once(Events.ClientReady, () => {
        client.off(Events.Error, reject)
        resolve(client)
    })
})


module.exports = { client, clientReady: clientPromise }
