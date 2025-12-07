const https = require('node:https')
const http = require('node:http')
const fs = require('fs/promises')
const express = require("express")
const bodyParser = require('body-parser');
const cookieParser = require("cookie-parser")
const sqlite3 = require("sqlite3")
const { WebSocketServer } = require("ws")
const crypto = require('crypto');
const { Worker } = require('node:worker_threads')
const undici = require('undici');
const { Client, Events, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const path = require('path')
let clientOptions = { intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildIntegrations, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences] }
let client = new Client(clientOptions)
const jsdom = require("jsdom");

const ActionType = require("./actions.json")
const ErrorType = require("./errors.json")

const ggeConfigExample = `{
    "webPort" : "3001",
    "webSocketPort" : "3002",
    
    "fontPath" : "",
    "privateKey" : "",
    "cert" : "",
    "signupToken" : "",
    
    "discordToken" : "",
    "discordClientId" : "",
    "discordClientSecret" : "",
    "discordPort": "3003"
}`
/*
  {
    //uuid : [ws: WebSocket()]
  }
*/
const loggedInUsers = {
}

const botMap = new Map()

let userDatabase = new sqlite3.Database("./user.db", sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE)
userDatabase.exec(
  `CREATE TABLE IF NOT EXISTS "Users" (
	"username"	TEXT NOT NULL UNIQUE,
	"passwordHash" BLOB NOT NULL,
  "passwordSalt" INTEGER NOT NULL,
  "uuid" TEXT UNIQUE,
	"privilege"	INTEGER,
  "discordUserId"	TEXT,
  "discordGuildId" TEXT
);
`)
userDatabase.exec(
  `CREATE TABLE IF NOT EXISTS "SubUsers" (
  "id"	INTEGER,
	"uuid"	TEXT NOT NULL,
	"name"	TEXT NOT NULL,
	"pass"	TEXT NOT NULL,
	"plugins"	TEXT,
	"state"	INTEGER,
  "externalEvent" INTEGER,
	"server"	INTEGER,
  PRIMARY KEY("id" AUTOINCREMENT)
);
`)

class User {
  constructor(obj) {
    if (obj == undefined)
      return
    this.id = Number(obj?.id)
    this.uuid = String(obj?.uuid)
    this.state = Number(obj?.state)
    this.name = String(obj?.name)
    this.pass = String(obj?.pass)
    this.server = Number(obj?.server)
    this.plugins = obj?.plugins ?? {}
    this.externalEvent = Boolean(obj?.externalEvent)
  }
}
const addUser = (uuid, user) => new Promise((resolve, reject) => {
  userDatabase.run("INSERT INTO SubUsers (uuid, name, pass, plugins, state, externalEvent, server) VALUES(?,?,?,?,?,?,?)", 
    [uuid, user.name, user.pass, JSON.stringify(user.plugins), 0, user.externalEvent, user.server], (err) => {
    if (err)
      return reject(err)

    resolve()
  })
})
const getSpecificUser = (uuid, user) => new Promise((resolve, reject) => {
  userDatabase.get("Select id, name, plugins, pass, state, externalEvent, server From SubUsers WHERE uuid=? AND id=?;", [uuid, user.id], (err, row) => {
    if (err)
      return reject(err)
    row.plugins = JSON.parse(row.plugins ?? "{}")
    let user = new User(row)
    resolve(user)
  })
})
const changeUser = (uuid, user) => new Promise((resolve, reject) => {
  if (user.pass == undefined || user.pass === "" || user.pass == "null") {
    userDatabase.serialize(function () {
      userDatabase.run(`UPDATE SubUsers SET name = ?, state = ?, plugins = ?, externalEvent = ?, server = ? WHERE uuid = ? AND id = ?`, [user.name, user.state, JSON.stringify(user.plugins), user.externalEvent, user.server, uuid, user.id], function (err) {
        if (err)
          return reject(err)
      })
      userDatabase.get("Select id, name, plugins, pass, state, externalEvent, server From SubUsers WHERE uuid=? AND id=?;", [uuid, user.id], (err, row) => {
        if (err)
          return reject(err)
        row.plugins = JSON.parse(row.plugins)
        let user = new User(row)
        resolve(user)
      })
    })
    return
  }
  userDatabase.serialize(function () {
    userDatabase.run(`UPDATE SubUsers SET name = ?, pass = ?, state = ?, plugins = ?, externalEvent = ?, server = ? WHERE uuid = ? AND id = ?`, [user.name, user.pass, user.state, JSON.stringify(user.plugins), user.externalEvent, user.server, uuid, user.id], function (err) {
      if (err)
        return reject(err)
    })
    userDatabase.get("Select id, name, plugins, pass, state, externalEvent, server From SubUsers WHERE uuid=? AND id=?;", [uuid, user.id], (err, row) => {
      if (err)
        return reject(err)
      row.plugins ??= {}
      row.plugins = JSON.parse(row.plugins)
      let user = new User(row)
      resolve(user)
    })
  })
})
const removeUser = (uuid, user) => new Promise((resolve, reject) => {
  if (uuid === undefined || user.id === undefined)
    return

  userDatabase.run(`DELETE FROM SubUsers WHERE uuid = ? AND id = ?`, [uuid, user.id], (err) => {
    if (err)
      return reject(ErrorType.DBError, err)

    try {
      removeBot(user.id)
    }
    catch {
      reject(ErrorType.Generic)
    }

    resolve()
  })
})
const getUser = (uuid) => new Promise((resolve, reject) => {
  let str = uuid === undefined ? "" : "Where uuid=?;"

  userDatabase.all(`Select id, uuid, name, plugins, pass, state, externalEvent, server From SubUsers ${str}`, [uuid], async (err, rows) => {
    if (err)
      return reject(err)
    return resolve(
      rows?.map(e => {
        e.plugins = JSON.parse(e.plugins)
        return new User(e)
      }))
  })
})

async function start() {
  try {
    await fs.access("./ggeConfig.json")
  }
  catch (e) {
    fs.writeFile("./ggeConfig.json", ggeConfigExample)
    console.info("ggeConfig.json has been generated")
  }
  const ggeConfig = JSON.parse((await fs.readFile("./ggeConfig.json")).toString())

  ggeConfig.webPort ??= "3001"
  ggeConfig.webSocketPort ??= "3002"
  ggeConfig.discordPort ??= "3003"

  if (ggeConfig.cert) {
    await fs.access(ggeConfig.cert)
  }

  if (ggeConfig.privateKey) {
    await fs.access(ggeConfig.privateKey)
  }

  let certFound = true
  if (!(ggeConfig.privateKey || ggeConfig.cert)) {
    certFound = false
    if (!ggeConfig.privateKey)
      console.warn("Could not find privateKey! Falling back to http mode")
    if (!ggeConfig.cert)
      console.warn("Could not find cert! Falling back to http mode")
  }
  let hasDiscord = true

  if (!ggeConfig.fontPath) {
    try {
      await fs.access("C:\\Windows\\Fonts\\segoeui.ttf")
      ggeConfig.fontPath = "C:\\Windows\\Fonts\\segoeui.ttf"
    }
    catch (e) {
      console.warn(e)
      console.warn("Could not setup discord")
      hasDiscord = false
    }
  }

  if (!ggeConfig.discordToken || !ggeConfig.discordClientId) {
    console.warn("Could not setup discord")
    console.warn("Following configurations are missing: ")
    if (!ggeConfig.discordToken)
      console.warn("discordToken")
    if (!ggeConfig.discordClientId)
      console.warn("discordClientId")

    hasDiscord = false
  }

  let needLang = false
  async function getItemsJSON() {
    const response = await fetch("https://empire-html5.goodgamestudios.com/default/items/ItemsVersion.properties");
    const str = await response.text()

    let str2 = undefined
    try {
      str2 = (await fs.readFile("./ItemsVersion.properties")).toString()
    }
    catch (e) {
      // console.warn(e)
    }
    let needItems = needLang = str != str2
    try {
      await fs.access("./items")
    }
    catch (e) {
      needItems = true
      // console.warn(e)
      await fs.mkdir("./items")
    }
    if (needItems) {
      await fs.writeFile("./ItemsVersion.properties", str)

      const response = await fetch(`https://empire-html5.goodgamestudios.com/default/items/items_v${str.match(new RegExp(/(?!.*=).*/))[0]}.json`);
      for (const [key, value] of Object.entries(await response.json())) {
        if (!/^[A-Za-z\_]+$/.test(key)) {
          // console.warn(`${key}: is not suitable for a filename`)
          continue
        }

        await fs.writeFile(`./items/${key}.json`, JSON.stringify(value))
      }

    }
  }

  async function getLangJSON() {
    try {
      await fs.access("./lang.json")
    }
    catch (e) {
      needLang = true
    }
    if (needLang) {
      const response = await fetch(`https://empire-html5.goodgamestudios.com/config/languages/4018/en.json`);
      const str = await response.text()

      await fs.writeFile("./lang.json", str)
    }
  }
  async function getServerXML() {
    try {
      await fs.access("./1.xml")
    }
    catch (e) {
      needLang = true
    }
    if (needLang) {
      const response = await fetch(`https://empire-html5.goodgamestudios.com/config/network/1.xml`);
      const str = await response.text()

      await fs.writeFile("./1.xml", str)
    }
  }

  await getItemsJSON()
  await getLangJSON()
  await getServerXML()

  let instances = []
  let servers = new jsdom.JSDOM((await fs.readFile("./1.xml")).toString())
  let _instances = servers.window.document.getElementsByTagName("instance")
  for (var key in _instances) {
    let obj = _instances[key]

    let server, zone

    for (var key2 in obj.childNodes) {
      let obj2 = obj.childNodes[key2]

      switch (obj2.nodeName) {
        case "SERVER":
          server = String(obj2.childNodes[0].nodeValue)
          break;
        case "ZONE":
          zone = String(obj2.childNodes[0].nodeValue)
          break;
      }
      if (server && zone)
        break
    }
    if (server)
      instances.push({ id: Number(obj.getAttribute("value")), gameURL: server, gameServer: zone })
  }
  servers = undefined
  _instances = undefined

  const plugins = require("./plugins")
    .filter(e => !e[1].hidden)
    .map(e => new Object({ key: path.basename(e[0]), filename: e[0], name: e[1].name, description: e[1].description, force: e[1].force, pluginOptions: e[1]?.pluginOptions }))
    .sort((a, b) => {
      a.force ??= 0
      b.force ??= 0
      return a.force - b.force
    })

  let loginCheck = (uuid) => new Promise(resolve => {
    userDatabase.get('SELECT * FROM Users WHERE uuid = ?;', uuid, (err, row) => {
      if (err || !row)
        return resolve(false);

      return resolve(true);
    })
  })

  const app = express()
  app.use(bodyParser.urlencoded({ extended: true }))
  app.use(cookieParser())
  app.get("/", (_, res) => res.redirect('/index.html'))
  app.get("/lang.json", (_, res) => { res.setHeader("Access-Control-Allow-Origin", "*"); res.sendFile("lang.json", { root: ".", }) })
  app.get("/1.xml", (_, res) => { res.setHeader("Access-Control-Allow-Origin", "*"); res.sendFile("1.xml", { root: ".", }) })
  app.post("/api", bodyParser.json(), async (req, res) => {
    let json = req.body

    res.setHeader('Content-Type', 'application/json');
    if (json.id == 0) {
      userDatabase.get("Select * FROM Users WHERE username = ?", [json.email_name], (err, row) => {
        if (err)
          throw err
        if (row == undefined) {
          res.send(JSON.stringify({ id: 0, r: 1, error: "Invalid login details." }))
          return
        }

        if (row.passwordHash.compare(crypto.pbkdf2Sync(json.password, row.passwordSalt, 600000, 64, "sha256")) == 0) {
          res.send(JSON.stringify({ id: 0, r: 0, uuid: row.uuid }))
        }
        else
          res.send(JSON.stringify({ id: 0, r: 1, error: "Invalid login details." }))

      })
    }
    else if (json.id == 1) {
      if (json.token != ggeConfig.signupToken)
        return res.send(JSON.stringify({ id: 0, r: 1, error: "Invalid Sign up details." }))

      var salt = crypto.randomBytes(256)
      var passwordHash = crypto.pbkdf2Sync(json.password, salt, 600000, 64, "sha256")
      var uuid = crypto.randomUUID()

      userDatabase.run("INSERT INTO Users (username, passwordHash, passwordSalt, uuid) VALUES(?,?,?,?)", [json.username, passwordHash, salt, uuid], (err) => {
        if (err) {
          res.send(JSON.stringify({ r: 1 }))
          console.error(err)
        }
        else
          res.send(JSON.stringify({ r: 0, uuid: uuid }))
      })
    }
  });
  app.get("/serverInfo.json", (_, res) => { 
    res.setHeader("Access-Control-Allow-Origin", "*"); 

    res.send(JSON.stringify({
        discordPort: ggeConfig.discordPort,
        webSocketPort: ggeConfig.webSocketPort,
      }))
  })
  
  app.use(express.static('website'))
  let options = {}
  if (certFound) {
    options.key = await fs.readFile(ggeConfig.privateKey, 'utf8'),
      options.cert = await fs.readFile(ggeConfig.cert, 'utf8')

    https.createServer(options, app).listen(ggeConfig.webPort)
  }
  else {
    http.createServer(options, app).listen(ggeConfig.webPort)
  }

  async function createBot(uuid, user, messageBuffer, messageBufferCount) {
    messageBuffer ??= []
    messageBufferCount ??= 0
    if (user.id && botMap.get(user.id) != undefined)
      throw Error("User already in use")

    let data = structuredClone(user)

    let discordCreds = (uuid) => new Promise(resolve => {
      userDatabase.get('SELECT * FROM Users WHERE uuid = ?;', uuid, (err, row) => {
        if (err || !row)
          return resolve(undefined);

        return resolve({ discordGuildId: row.discordGuildId, discordUserId: row.discordUserId });
      })
    })
    let discordData = await discordCreds(uuid)
    plugins.forEach(plugin =>
      plugin.force ? (data.plugins[plugin.key] ??= {}).state = true : void 0
    )
    plugins.forEach(plugin => data.plugins[plugin.key]?.state ? data.plugins[plugin.key].filename = plugin.filename : void 0)

    if (user.externalEvent == true) {
      let users = await getUser(uuid)
      let bot = users.find(e => user.name == e.id && user.id != e.id && e.state)
      let getExternalEvent = (worker, alreadyStarted) => new Promise((resolve) => { //TODO add timed reject method
        let func = (obj) => {
          if (obj[0] != ActionType.GetExternalEvent)
            return
          resolve(obj[1])
          worker.off("message", func)
        }

        worker.on("message", func)
        if (alreadyStarted) {
          worker.postMessage([ActionType.GetExternalEvent])
        }
        else {
          let a = obj => {
            if (obj[0] != ActionType.Started)
              return

            worker.postMessage([ActionType.GetExternalEvent])
            worker.off("message", a)
          }
          worker.on("message", a)
        }
      })

      if (bot) {
        let worker = botMap.get(bot[0].id)

        let data3 = await getExternalEvent(worker, true)

        if (data3.ths.tsid == 24)
          user.gameURL = "EmpireEx_42"
        user.gameServer = "ep-live-temp1-game.goodgamestudios.com"
        user.tempServerData = data3
      }
      else {

        let data2 = structuredClone(user)
        plugins.forEach(plugin => plugin.force ? (data2.plugins[plugin.key] ??= {}).state = true : void 0)
        plugins.forEach(plugin => data2.plugins[plugin.key]?.state ? data2.plugins[plugin.key].filename = plugin.filename : void 0)
        data2.plugins = []
        data2.externalEvent = false

        const worker = new Worker("./ggebot.js", { workerData: { ...data2, discordData } });
        worker.messageBuffer = messageBuffer
        worker.messageBufferCount = messageBufferCount
        worker.on("message", async obj => {
          switch (obj[0]) {
            case ActionType.GetLogs:
              if (!uuid)
                break
              worker.messageBuffer[worker.messageBufferCount] = obj[1]
              worker.messageBufferCount = (worker.messageBufferCount + 1) % 25
              loggedInUsers[uuid]?.forEach(o => {
                if (o.viewedUser == user.id)
                  o.ws.send(JSON.stringify([ErrorType.Success, ActionType.GetLogs, [worker.messageBuffer, worker.messageBufferCount]]))
              });
              break;
          }
        })
        let data3 = await getExternalEvent(worker)

        //if (data.tsh.tsid == 24)
        let tempServerEvent = data3.sei.E.find(e => e.EID == 106)
        if (data3.glt.TSIP && data3.glt.TSZ) {
          data.gameURL = `${data3.glt.TSIP}`
          data.gameServer = data3.glt.TSZ
        }
        else if (tempServerEvent?.TSID == 24) {
          data.gameServer = "EmpireEx_42"
          data.gameURL = "ep-live-temp1-game.goodgamestudios.com"
        }
        else if (tempServerEvent?.TSID == 21) {
          data.gameServer = "EmpireEx_42"
          data.gameURL = "ep-live-temp1-game.goodgamestudios.com"
        }
        else if (data3.sei.E.find(e => e.EID == 113)) { //PLEASECHECKLATER:
          data.gameServer = "EmpireEx_45"
          data.gameURL = "ep-live-battle1-game.goodgamestudios.com"
        }
        else {
          console.error("Couldn't find compatible event")
          await worker.terminate()
          return
        }
        data.tempServerData = data3
        await worker.terminate()
      }
    }
    else {
      let instance = instances.find(e => Number(e.id) == data.server)
      data = { ...data, ...instance }
    }

    const worker = new Worker("./ggebot.js", { workerData: { ...data, discordData } });

    worker.messageBuffer = messageBuffer
    worker.messageBufferCount = messageBufferCount
    if (user.id)
      botMap.set(user.id, worker)

    const onTerminate = async () => {
      user = await getSpecificUser(uuid, user)
      if (botMap.get(user.id) == worker) {
        botMap.set(user.id, undefined)
        if (user.state == true)
          return createBot(uuid, user, worker.messageBuffer, worker.messageBufferCount) //Eat my recursive ass ;)
      }
    }

    worker.on("message", async (obj) => {
      switch (obj[0]) {
        case ActionType.GetLogs:
          if (uuid) {
            worker.messageBuffer[worker.messageBufferCount] = obj[1]
            worker.messageBufferCount = (worker.messageBufferCount + 1) % 25
            loggedInUsers[uuid]?.forEach(o => {
              if (o.viewedUser == user.id)
                o.ws.send(JSON.stringify([ErrorType.Success, ActionType.GetLogs, [worker.messageBuffer, worker.messageBufferCount]]))
            });
          }
          break;
        case ActionType.StatusUser:
          obj[1].id = user.id
          loggedInUsers[uuid]?.forEach(o => {
            o.ws.send(JSON.stringify([ErrorType.Success, ActionType.StatusUser, obj[1]]))
          })
          break
        case ActionType.RemoveUser:
          worker.off("exit", onTerminate)
          removeUser(uuid, user)
          break
        case ActionType.SetUser:
          userDatabase.run(`UPDATE SubUsers SET pass = ? WHERE uuid = ? AND id = ?`, [obj[1], uuid, user.id], _ => { })
          break
      }
    })

    worker.on("exit", onTerminate)

    await new Promise((resolve) => {
      let func = async (obj) => {
        if (obj[0] != ActionType.Started)
          return
        resolve()
        worker.once("exit", resolve)
        worker.off("message", func)
      }

      worker.on("message", func)
    })

    return worker
  }

  const removeBot = (id) => {
    const worker = botMap.get(id)

    if (worker == undefined)
      throw "No worker found"
    botMap.delete(id)

    worker.terminate()
  }

  getUser().then(async users => {
    for (let i = 0; i < users.length; i++) {
      const user = users[i];

      if (user.state == 0)
        continue
      await createBot(user.uuid, user)
    }
  })

  let server = (certFound ? https : http).createServer(options)

  let wss = new WebSocketServer({ server })

  wss.addListener("connection", (ws) => {
    let uuid = ""
    ws.addListener("message", async (event) => {
      let [err, action, obj] = JSON.parse(event.toString())
      err = Number(err)
      action = Number(action)

      let refreshUsers = async () => {
        try {
          let users = await getUser(uuid)

          ws.send(JSON.stringify([ErrorType.Success, ActionType.GetUsers, [users, plugins]]))
        }
        catch (e) {
          console.error(e)
          ws.send(JSON.stringify([ErrorType.Generic, ActionType.GetUsers, {}]))
        }
      }

      if (uuid === "") {
        if (action == ActionType.GetUUID) {
          if (await loginCheck(String(obj))) {
            uuid = String(obj)

            ws.send(JSON.stringify([ErrorType.Success, ActionType.GetUUID, {}]))

            loggedInUsers[uuid] ??= []
            loggedInUsers[uuid].push({ ws })

            await refreshUsers()

            let users = await getUser(uuid)
            users.forEach(user => {
              if (user.state != 1)
                return

              let worker = botMap.get(user.id)
              if (worker == undefined)
                return

              worker.postMessage([ActionType.StatusUser])
            })
            if (hasDiscord) {
              userDatabase.get('SELECT * FROM Users WHERE uuid = ?;', uuid, (err, row) => {
                if (err || !row)
                  return console.error(err)

                try {
                  if (!row.discordGuildId)
                    throw "no discordGuildId"
                  if (!row.discordUserId)
                    throw "no discordUserId"
                  let userIsAdmin = false
                  try {
                    userIsAdmin = client.guilds.cache.get(row.discordGuildId).members.cache.get(row.discordUserId)
                      .permissions.has("Administrator");
                  } catch (e) {
                    console.error(e)
                  }

                  if (userIsAdmin) {
                    let guild = client.guilds.cache.get(row.discordGuildId)
                    let channelData = guild.channels.cache.map(channel => {
                      if (guild.members.me.permissionsIn(channel)
                        .has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]))
                        return { id: channel.id, name: channel.name }

                      return undefined
                    }).filter((e) => e !== undefined)
                    ws.send(JSON.stringify([ErrorType.Success, ActionType.GetChannels, [ggeConfig.discordClientId, channelData]]))
                  }
                  else {
                    userDatabase.run(`UPDATE Users SET discordUserId = ?, discordGuildId = ? WHERE uuid = ?`, [undefined, undefined, uuid], function (err) {
                      if (err)
                        return console.error(err)
                    })

                    loggedInUsers[uuid].forEach(o =>
                      o.ws.send(JSON.stringify([ErrorType.Success, ActionType.GetChannels, [ggeConfig.discordClientId, undefined]]))
                    )
                  }
                }
                catch (e) {
                  ws.send(JSON.stringify([ErrorType.Success, ActionType.GetChannels, [ggeConfig.discordClientId, ggeConfig.discordPort, undefined]]))
                  console.error(e)}
              })
            }
          }
          else
            ws.send(JSON.stringify([ErrorType.Authentication, ActionType.GetUUID, {}]))
        }
        else
          ws.send(JSON.stringify([ErrorType.Unauthenticated, ActionType.GetUUID, {}]))

        return
      }

      getUser(uuid)

      switch (action) {
        case ActionType.GetUsers: {
          refreshUsers()
          break;
        }
        case ActionType.StatusUser:
          break
        case ActionType.AddUser: {
          let user = new User(obj)
          try {
            await addUser(uuid, user)
          }
          catch (e) {
            console.error(e)
            ws.send(JSON.stringify([ErrorType.Generic, ActionType.AddUser, {}]))
          }
          finally {
            refreshUsers()
          }
          break;
        }
        case ActionType.RemoveUser: {
          let lastError = undefined
          for (let i = 0; i < obj.length; i++) {
            const user = obj[i];
            try {
              await removeUser(uuid, user)
            }
            catch (e) {
              lastError = e
            }
          }
          if (lastError) {
            console.warn(lastError)
            ws.send(JSON.stringify([ErrorType.Generic, ActionType.RemoveUser, {}]))
          }
          refreshUsers()

          break;
        }
        case ActionType.SetUser: {
          let user = new User(obj)

          try {
            let oldUser = await getSpecificUser(uuid, user)
            user = await changeUser(uuid, user)
            if (user.state == 0) {
              try {
                removeBot(user.id)
              } catch (e) {
                console.warn(e)
              }
            }
            else {
              let worker = botMap.get(user.id)
              if (worker == undefined) {
                worker = await createBot(uuid, user)
              }
              else {
                let restartedUser = false
                for (const [key, value] of Object.entries(oldUser.plugins)) {
                  if (user.plugins[key].state == value.state)
                    continue
                  restartedUser = true
                  removeBot(user.id)
                  worker = await createBot(uuid, user, worker.messageBuffer, worker.messageBufferCount)
                  break
                }
                if (!restartedUser) {
                  let data = structuredClone(user)

                  plugins.forEach(plugin => plugin.force ? (data.plugins[plugin.key] ??= {}).state = true : void 0)
                  plugins.forEach(plugin => data.plugins[plugin.key]?.state ? data.plugins[plugin.key].filename = plugin.filename : void 0)
                  worker.postMessage([ActionType.SetPluginOptions, data])
                }
              }
            }
          }
          catch (e) {
            console.error(e)
            ws.send(JSON.stringify([ErrorType.Generic, ActionType.SetUser, {}]))
          }
          finally {
            loggedInUsers[uuid]?.forEach(async obj => {
              let ws = obj.ws
              try {
                let users = await getUser(uuid)
                ws.send(JSON.stringify([ErrorType.Success, ActionType.GetUsers, [users, plugins]]))
              }
              catch (e) {
                console.error(e)
                ws.send(JSON.stringify([ErrorType.Generic, ActionType.GetUsers, {}]))
              }
            })
          }
          break;
        }
        case ActionType.GetLogs: {
          let user = new User(obj)
          userDatabase.get(`Select id, name, pass, plugins, state, externalEvent, server From SubUsers Where uuid=? AND id = ?;`, [uuid, user.id], (err, _) => {
            if (err) {
              console.warn(err)
              ws.send(JSON.stringify([ErrorType.Generic, ActionType.GetLogs, {}]))
              return
            }
            let worker = botMap.get(user.id)

            if (worker == undefined) {
              console.warn("Invalid bot")
              ws.send(JSON.stringify([ErrorType.Generic, ActionType.GetLogs, {}]))
              return
            }
            let index = loggedInUsers[uuid].findIndex((obj) => obj.ws == ws)
            loggedInUsers[uuid][index].viewedUser = user.id
            loggedInUsers[uuid][index].ws.send(JSON.stringify([ErrorType.Success, ActionType.GetLogs, [worker.messageBuffer, worker.messageBufferCount]]))
          })
          break;
        }
        default: {
          ws.send(JSON.stringify([ErrorType.UnknownAction, ActionType.Unknown, {}]))
        }
      }
    })
    ws.addListener("close", () => {
      if (!uuid)
        return
      let index = loggedInUsers[uuid].findIndex((obj) => obj.ws == ws)
      if (index == -1)
        throw Error("Couldn't find index of logged in user")

      loggedInUsers[uuid].splice(index, 1)

      if (loggedInUsers[uuid].length == 0)
        if (!delete loggedInUsers[uuid])
          throw "Could not remove a user that logged off"
    })
  })

  if (hasDiscord) {
    const app = express()

    client.once(Events.ClientReady, async () => {
      server.listen(ggeConfig.webSocketPort)
      app.use(cookieParser())
      app.get('/', async (request, response) => {
        const tokenResponseData = await undici.request('https://discord.com/api/oauth2/token', {
          method: 'POST',
          body: new URLSearchParams({
            client_id: ggeConfig.discordClientId,
            client_secret: ggeConfig.discordClientSecret,
            code: request.query.code,
            grant_type: 'authorization_code',
            redirect_uri: `${request.protocol}://${request.hostname}:${ggeConfig.discordPort}`,
            scope: 'identify',
          }).toString(),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });

        const oauthData = await tokenResponseData.body.json();
        const userResult = await undici.request('https://discord.com/api/users/@me', {
          headers: {
            authorization: `${oauthData.token_type} ${oauthData.access_token}`,
          },
        });
        let discordIdentifier = await userResult.body.json()
        let guildId = request.query.guild_id
        if (!discordIdentifier.id)
          return response.send("Could not get discord id!")
        if (!guildId)
          return response.send("Could not get guild id!")
        let userIsAdmin = client.guilds.cache.get(guildId)
          .members.cache.get(discordIdentifier.id)?.permissions?.has("Administrator");
        if (userIsAdmin == undefined)
          return response.send("User isn't in guild")
        if (!userIsAdmin)
          return response.send("User is not admin!")

        let guild = client.guilds.cache.get(guildId)
        let channelData = guild.channels.cache.map(channel => {
          if (guild.members.me.permissionsIn(channel)
            .has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]))
            return { id: channel.id, name: channel.name }

          return undefined
        }).filter((e) => e !== undefined)
        let uuid = request.cookies?.uuid
        let valid = await loginCheck(uuid)
        if (!valid)
          return response.send("uuid is not valid!")

        userDatabase.run(`UPDATE Users SET discordUserId = ?, discordGuildId = ? WHERE uuid = ?`, [discordIdentifier.id, guildId, uuid], function (err) {
          if (err)
            console.error(err)
        })
        loggedInUsers[uuid].forEach(o =>
          o.ws.send(JSON.stringify([ErrorType.Success, ActionType.GetChannels, [ggeConfig.discordClientId, channelData]]))
        )
        return response.send("Successful!")
      })
      
      let options = {}
      if (certFound) {
        options.key = await fs.readFile(ggeConfig.privateKey, 'utf8')
        options.cert = await fs.readFile(ggeConfig.cert, 'utf8')

        https.createServer(options, app).listen(ggeConfig.discordPort)
      }
      else {
        http.createServer(options, app).listen(ggeConfig.discordPort)
      }
    })
    
    client.login(ggeConfig.discordToken);
  }
  else
    server.listen(ggeConfig.webSocketPort)

  console.info("Started")
}

start()

module.exports = {
  loggedInUsers,
  botMap,
  userDatabase,
  changeUser,
  getUser,
  removeUser
}