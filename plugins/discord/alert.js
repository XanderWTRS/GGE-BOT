const { isMainThread } = require('node:worker_threads')
const name = "Alert"
if (isMainThread)
    return module.exports = {
        name: name,
        description: "Intergrates Discord & GGE Chat",
        pluginOptions: [
            {
                type: "Channel",
                label: "Channel ID",
                key: "channelID",
            },            {
                type: "Channel",
                label: "Channel ID Aqua",
                key: "channelIDAqua",
            }
        ]
    }

const { PresenceUpdateStatus, AttachmentBuilder } = require("discord.js")

const { xtHandler, botConfig, playerInfo } = require("../../ggebot")
const { clientReady } = require('./discord')
const { createLayout } = require("../../imageGen.js")

const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ??= {}

let movements = []
clientReady.then(async client => {
    //TODO: reload proof this
    let channelAlert
    try {
     channelAlert = await client.channels.fetch(pluginOptions.channelID)
    }
    catch (e) {
        console.warn(`[${name}] ${e}`)
    }
    let channelAquaAlert
    try {
        if (pluginOptions.channelAquaAlert)
            channelAquaAlert = await client.channels.fetch(pluginOptions.channelIDAqua)
    }
    catch (e) {
        console.warn(`[${name}] ${e}`)
    }

    let bannedOIDS = [
        3077107,
        3884741,
        3712455,
	    3712579,
	    3712405
    ]

    xtHandler.on("gam", func = obj => {
        obj.M.forEach(async (movement) => {
            let movementType = {
                attack: 0,
                defence: 1
            }
    
            if (![0,25,31,24,29].includes(movement.M.T))
                return
    
            let e = movements.find((e) => e.M.MID == movement.M.MID)
    
            let attacker = obj.O.find((e) => e.OID == movement.M.SA[4])
            let victim = obj.O.find((e) => e.OID == movement.M.TA[4])
    
            if (attacker.AID == playerInfo.alliance.id)
                return

            if (e) {
                if (movement.GA && movement.M.KID != 4 && (await e.message)?.attachments.size == 0) {
                    let stream = await createLayout(movement.GA)
                    stream.on("error", console.warn)
                    const file = new AttachmentBuilder(stream)
                    await (await e.message).edit({ content: (await e.message).content, files: [file] })
                }
                return
            }
    
    
            let timetaken = movement.M.TT
            let timespent = movement.M.PT
            let time = timetaken - timespent
    
            let attackerName = attacker.N
            let attackerAlliance = attacker.AN
            let attackerArea = movement.M.SA[10]
            if(bannedOIDS.includes(movement.M.SA[4]) && !botConfig.externalEvent) 
                return

            let victimName = victim.N
            let victimArea = movement.M.TA[10]

            if(botConfig.externalEvent)
            {
                victimName = victimName.replace(/_[^_]+$/,'')
            }

            let member = channelAlert.members.find((e) => e.displayName == victimName)
            let mention = member?.displayName ? `<@${member.id}> ` : ``
    
            let kidName = [
                "\u001b[2;32mThe Great Empire\u001b[0m",
                "\u001b[2;33mBurning Sands\u001b[0m",
                "\u001b[2;34mEverwinter Glacier\u001b[0m",
                "\u001b[2;31mFire peaks\u001b[0m",
                "\u001b[2;36mThe Storm Islands\u001b[0m"
            ]
    
            if (kidName[movement.M.KID] == undefined)
                return
    
            if (victimArea == undefined && movement.M.KID == 4)
                victimArea = "Storm island"
    
            let x1 = movement.M.TA[1]
            let y1 = movement.M.TA[2]
            let x2 = movement.M.SA[1]
            let y2 = movement.M.SA[2]
    
            let clicks = Math.round(Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)) * 10) / 10
    
            let channel = ((movement.M.KID != 4) ? channelAlert : channelAquaAlert)
            if(channel == undefined)
                return
            let content = `${mention}` +
                "```ansi\n" +
                `${attackerName} (${attackerArea}) from ${attackerAlliance} is attacking ${victimName} (${victimArea}) in ${kidName[movement.M.KID]} ${clicks} clicks` +
                "```" +
                `<t:${Math.round(Date.now() / 1000 + time)}:R>`
            let data = {}
            data.content = content
            movements.push(movement)
    
            if (movement.GA != undefined) {
                const file = new AttachmentBuilder(await createLayout(movement.GA))
                data.files = [file]
            }
            let message = channel.send(data)
    
            if (member != undefined) {
                let shouldAlertMember = () => member?.presence?.status == undefined || (member?.presence?.status !== PresenceUpdateStatus.Online && member?.presence?.status !== PresenceUpdateStatus.DoNotDisturb)
                if (movement.M.KID != 4 && shouldAlertMember()) {
                    let spreadAlert = async () => shouldAlertMember() ? await channelAlert.send(mention) : void 0
                    setTimeout(spreadAlert, time * 1000 / 4).unref()
                    setTimeout(spreadAlert, time * 1000 / 3).unref()
                    setTimeout(spreadAlert, time * 1000 / 2).unref()
                    setTimeout(spreadAlert, time * 1000 / 1.5).unref()
                }
            }
            if (movement?.GA == undefined)
                movement.message = message
    
            setTimeout(() => {
                movements = movements.filter(item => item.M.MID !== movement.M.MID)
            }, time * 1000)
            await message
        })
    })
})
