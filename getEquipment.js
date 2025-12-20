const fs = require("fs")

const effects = require("./items/effects.json")
const effectCaps = require("./items/effectCaps.json")
const relicEffects = require("./items/relicEffects.json")

let getCommanderStats = com => {
    let commanderEffects = {}

    com.EQ.forEach(equipment => {
        equipment[5].forEach(([id, _, effectValues]) => {
            if(!Array.isArray(effectValues))
                return
            let effectID = relicEffects.find(e => e.id == id)?.effectID
            if (effectID == undefined)
                return
            let effect = effects.find(e => e.effectID == effectID)
            let maxCap = effectCaps.find(e => e.capID == effect.capID).maxTotalBonus
            commanderEffects[effect.name] ??= 0
            commanderEffects[effect.name] = Math.min(Number(maxCap ?? 9999), commanderEffects[effect.name] + Number(effectValues[0]))
        })
    })
    return commanderEffects
}

module.exports = { getCommanderStats }