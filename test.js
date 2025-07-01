const fs  = require("fs/promises")

async function start() {
    const eventAutoScalingCamps = JSON.parse((await fs.readFile("./items/buildings.json")).toString())
    console.log(eventAutoScalingCamps)
}
start()