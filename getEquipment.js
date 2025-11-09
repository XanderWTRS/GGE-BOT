const fs = require("fs")

let getCommanderStats = com => {
    let stats = {
        melee: Number(),
        wall: Number(),
        moat: Number(),
        range: Number(),
        gate: Number(),
        speed: Number(),
        plundering: Number(),
        combatStrength: Number(),
        flank: Number(),
        combatStrengthHero: Number(),
        flankHero: Number(),
        strengthCourtyard: Number(),
        shieldMadianSupport: Number(),
        front: Number(),
        rangeHero: Number(),
        gateHero: Number(),
        meleeHero: Number(),
        unknown: Number(),
        findPowerfulArtifact: Number(),
        honour: Number(),
        glory: Number(),
        plundered: Number(),
        combatStrengthFlank: Number(),
        combatStrengthFront: Number(),
        travelCost: Number(),
        destruction: Number()
    }

    com.EQ.forEach((eq, i) => {
        eq[5].forEach(stat => {
            if (stat[1].size > 1)
                return

            let attributeType = {
                61: "melee",
                57: "wall",
                59: "moat",
                62: "range",
                58: "gate",
                53: "travelSpeed",
                54: "plundering",
                334: "combatStrength",
                66: "flank",
                234: "combatStrengthHero",
                239: "unitflankLimitHero",
                1: "melee",
                110: "wall",
                5: "moat",
                109: "range",
                2: "range",
                4: "gate",
                111: "gate",
                108: "melee",
                101: "melee",
                3: "wall",
                6: "speed",
                116: "strengthCourtyard",
                112: "moat",
                7: "plundering",
                114: "plundering",
                121: "shieldMadianSupport",
                117: "Front",
                811: "flankHero",
                115: "flank",
                814: "rangeHero",
                809: "gateHero",
                813: "meleeHero",
                20014: "unknown",
                20018: "unknown",
                60: "findPowerfulArtifact",
                52: "honour",
                51: "glory",
                113: "strengthCourtyard",
                107: "plundered",
                120: "combatStrengthFlank",
                119: "combatStrengthFront",
                64: "travelCost",
                63: "destruction",
            }
            let type = attributeType[stat[0]]
            let ammount = stat[stat.length == 3 ? 2 : 1][stat[0] != 121 ? 0 : 1]
            stats[type] += ammount
        })
    })
    stats.flank = Math.min(stats.flank, 50)
    // stats.flankHero = Math.min(stats.flankHero, 40)
    stats.front = Math.min(stats.front, 50)
    //TODO:stats.frontHero = Math.min(stats.front, 40)
    return stats
}
module.exports = { getCommanderStats }