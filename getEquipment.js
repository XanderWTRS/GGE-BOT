const effects = require("./items/effects.json")
const effectCaps = require("./items/effectCaps.json")
const relicEffects = require("./items/relicEffects.json")

let getCommanderStats = (com, isPvP) => {
    let commanderEffects = {}
    com.EQ.forEach(equipment => {
        equipment[5].forEach(([id, _, effectValues]) => {
            if(!Array.isArray(effectValues))
                return

            //isRelic
            
            
            let effectID = relicEffects.find(e => e.id == id)?.effectID
            if (effectID == undefined)
                return
            let effect = effects.find(e => e.effectID == effectID)
            let maxCap = Number(effectCaps.find(e => e.capID == effect.capID).maxTotalBonus ?? Infinity)
            
            commanderEffects[effect.name] = Math.min(maxCap, (commanderEffects[effect.name] ?? 0) + Number(effectValues[0]))
        })
    })
    return commanderEffects
}

module.exports = { getCommanderStats }