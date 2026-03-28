if (require('node:worker_threads').isMainThread)
    return module.exports = {
        pluginOptions: [
            {
                type: "Checkbox",
                key: "bypassSkipTypeFilter",
                default: false
            }
        ],
        force: true
    }

const { botConfig } = require("../ggeBot")
const { resources } = require('../protocols')

const MinuteSkipType = Object.freeze({
    MS1: 1,
    MS2: 5,
    MS3: 10,
    MS4: 30,
    MS5: 60,
    MS6: 60 * 5,
    MS7: 60 * 24
})

const pluginOptions = botConfig.plugins[require('path').basename(__filename).slice(0, -3)] ?? {}

function haveEnoughSkips(time) {
    const skips = {
        MS1: resources['1MinSkip'],
        MS2: resources['5MinSkip'],
        MS3: resources['10MinSkip'],
        MS4: resources['30MinSkip'],
        MS5: resources['60MinSkip'],
        MS6: resources['5HourSkip'],
        MS7: resources['24HourSkip']
    }
    time = Math.ceil(time / 60)
    
    while (time > 0) {
        const skip = Object.entries(skips)
            .filter(e => e[1] > 0)
            .filter(e => pluginOptions.bypassSkipTypeFilter || MinuteSkipType[e[0]] <= time * 2)
            .sort((a, b) => (time > MinuteSkipType[a[0]]) - (time > MinuteSkipType[b[0]]))
            .sort((a, b) => Math.max(b[1], 950) - Math.max(a[1], 950))

        if (skip[0] == undefined)
            return false
        
        skip[0][1]--
        time -= MinuteSkipType[skip[0][0]]
    }
    return true 
}

function spendSkip(time) {
    const skips = {
        MS1: resources['1MinSkip'],
        MS2: resources['5MinSkip'],
        MS3: resources['10MinSkip'],
        MS4: resources['30MinSkip'],
        MS5: resources['60MinSkip'],
        MS6: resources['5HourSkip'],
        MS7: resources['24HourSkip']
    }
    time = Math.ceil(time / 60)
    const skip = Object.entries(skips)
        .filter(e => e[1] > 0)
        .filter(e => pluginOptions.bypassSkipTypeFilter || MinuteSkipType[e[0]] <= time * 2)
        .sort((a, b) => (time > MinuteSkipType[a[0]]) - (time > MinuteSkipType[b[0]]))
        .sort((a, b) => Math.max(b[1], 950) - Math.max(a[1], 950))

    if (skip[0] == undefined)
        return console.warn("noMoreSkips")

    console.debug("usingSkip", skip[0][0])

    return skip[0][0]
}

module.exports = { spendSkip, haveEnoughSkips, MinuteSkipType }