const NodeCache = require( "node-cache" );
const myCache = new NodeCache({useClones : false});

const {ClientCommands} = require("./protocols.js");

async function getAreaCached(kid, fromX, fromY, toX, toY) {
    const key = `${kid}_${fromX}_${fromY}_${fromX}_${fromY}`
    let response = myCache.get(key)
    
    if(!response) {
        response = await ClientCommands.getAreaInfo(kid,fromX,fromY,toX,toY)()
        if(response == 0)
            myCache.set(key, response, 60)
    }
    return response
}

module.exports = getAreaCached