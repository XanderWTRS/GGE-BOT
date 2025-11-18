const NodeCache = require( "node-cache" );
const myCache = new NodeCache({useClones : false});

const {ClientCommands} = require("./protocols.js");
const { xtHandler } = require("./ggebot.js");

async function getAreaCached(kid, fromX, fromY, toX, toY) {
    const key = `${kid}_${fromX}_${fromY}_${fromX}_${fromY}`
    let response = myCache.get(key)
    
    if(!response) {
        // console.log("miss")
        response = await ClientCommands.getAreaInfo(kid,fromX,fromY,toX,toY)()
        if(myCache.set(key, response, 60)) {
            // console.log("cached")
        }
    } 
    else {
        // console.log("hit")
    }
    return response
}

module.exports = getAreaCached