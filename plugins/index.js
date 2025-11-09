const path = require('node:path');
const fs = require("fs")
const ggeConfig = require("../ggeConfig.json")

const dir = fs.readdirSync(__dirname, {recursive : true})

const plugins = new Array(dir.length - 1)

dir.forEach(file => {
    if(file == path.basename(__filename))
        return
    let pathSeperator = '/'
    if(process.platform == "win32")
         pathSeperator = '\\'

    if(fs.lstatSync(__dirname + pathSeperator + file).isDirectory())
        return 
    //Ew hacky...
    if((!ggeConfig.discordToken || !ggeConfig.discordClientId) && file.includes("discord"))
        return    

    if(path.extname(file) != ".js")
        throw Error(`None javascript file within path ${file}`)

    plugins.push([file.slice(0, -3), require(path.join(__dirname, file))])
})

module.exports = plugins