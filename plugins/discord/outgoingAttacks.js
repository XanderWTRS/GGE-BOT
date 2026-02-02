
if (require('node:worker_threads').isMainThread)
    return module.exports = {
        pluginOptions: [
            {
                type: "Channel",
                label: "Channel ID",
                key: "channelID",
            }
        ]
    }

const { xtHandler, botConfig, playerInfo } = require("../../ggeBot.js")
const { clientReady } = require('./discord')
const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ?? {}

let movements = []
clientReady.then(async client => {
    let channel = await client.channels.fetch(pluginOptions.channelID)

    xtHandler.addListener("gam", (obj) => {
        obj.M.forEach(async (movement) => {
            var movementType = {
                attack: 0,
                defence: 1
            }
    
            if (movements.find(e => e == movement.M.MID))
                return
    
            if (movement.M.T != movementType.attack)
                return
    
            if (!([0, 1, 2, 3].includes(movement.M.KID)))
                return
    
            let attacker = obj.O.find((e) => e.OID == movement.M.SA[4])
            let victim = obj.O.find((e) => e.OID == movement.M.TA[4])
    
            if (attacker.AID != playerInfo.alliance.id) //if victim is outside of our alliance then ignore it for alerts
                return
    
            let attackerName = attacker.N
            let attackerArea = movement.M.SA[10]
    
            let victimName = victim.N
            let victimArea = movement.M.TA[10]
            let victimAlliance = victim.AN
    
            var timetaken = movement.M.TT
            var timespent = movement.M.PT
    
            let x1 = movement.M.TA[1]
            let y1 = movement.M.TA[2]
            let x2 = movement.M.SA[1]
            let y2 = movement.M.SA[2]
    
            let kidName = [
                "\u001b[2;32mThe Great Empire\u001b[0m",
                "\u001b[2;33mBurning Sands\u001b[0m",
                "\u001b[2;34mEverwinter Glacier\u001b[0m",
                "\u001b[2;31mFire peaks\u001b[0m",
                "\u001b[2;36mThe Storm Islands\u001b[0m"
            ]
            let clicks = Math.round(Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)) * 10) / 10
    
            let time = timetaken - timespent
    
            movements.push(movement.M.MID)
    
            channel.send( //<-- asyncronous bastard causing my fucking hack
                "```ansi\n" +
                `${attackerName} (${attackerArea}) is attacking ${victimName} (${victimArea}) from ${victimAlliance} in ${kidName[movement.M.KID]} ${clicks} clicks` +
                "```" +
                `<t:${Math.round(Date.now() / 1000 + time)}:R>`)
    
            setTimeout(() => {
                movements = movements.filter(item => item !== movement.M.MID)
            }, time * 1000).unref()
        })
    })
})
