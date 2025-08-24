const https = require('node:https')
const http = require('node:http')
const fs = require('fs/promises')
const express = require("express")
const bodyParser = require('body-parser');
const cookieParser = require("cookie-parser")
const sqlite3 = require("sqlite3")
const { WebSocketServer } = require("ws")
const crypto = require('crypto');
const process = require("process")
const { Worker } = require('node:worker_threads')
const ActionType = require("./actions.json")
const ErrorType = require("./errors.json")
const { firefox } = require("playwright-core")

const ggeConfigExample = `{
    "gameURL" : "wss://ep-live-mz-int1-sk1-gb1-game.goodgamestudios.com/",
    "gameServer" : "EmpireEx_19",

    "fontPath" : "",
    "privateKey" : "",
    "cert" : "",
    "firefoxProfile" : "",
    "signupToken" : "",
    
    "noInternalWorker" : true,
    "discordToken" : "",
    "discordClientId" : "",
    "internalWorkerName" : "",
    "internalWorkerPass" : "",
    "defaultAllianceName" : ""
}`

const plugins = require("./plugins")
  .filter(e => !e[1].hidden)
  .map(e => new Object({ key: e[0], name: e[1].name, description: e[1].description, force: e[1].force, pluginOptions: e[1]?.pluginOptions }))
  .sort((a, b) => {
    a.force ??= 0
    b.force ??= 0
    return a.force - b.force
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

  if (!ggeConfig.fontPath) {
    try {
      await fs.access("C:\\Windows\\Fonts\\segoeui.ttf")
      ggeConfig.fontPath = "C:\\Windows\\Fonts\\segoeui.ttf"
    }
    catch (e) {
      console.warn(e)
      console.warn("Could not setup internalWorker")
      ggeConfig.noInternalWorker = true
    }
  }

  if (!ggeConfig.noInternalWorker && !(ggeConfig.discordToken && ggeConfig.discordClientId && ggeConfig.internalWorkerPass && ggeConfig.internalWorkerName)) {
    console.warn("Could not setup internalWorker")
    console.warn("Following configurations are missing: ")
    if (!ggeConfig.discordToken)
      console.warn("discordToken")
    if (!ggeConfig.discordClientId)
      console.warn("discordClientId")
    if (!ggeConfig.internalWorkerName)
      console.warn("internalWorkerName")
    if (!ggeConfig.internalWorkerPass)
      console.warn("internalWorkerPass")
    ggeConfig.noInternalWorker = false
  }

  async function getItemsJSON() {
    const response = await fetch("https://empire-html5.goodgamestudios.com/default/items/ItemsVersion.properties");
    const str = await response.text()

    let str2 = undefined
    try {
      str2 = (await fs.readFile("./ItemsVersion.properties")).toString()
    }
    catch (e) {
      console.warn(e)
    }

    let needItems = str != str2
    try {
      await fs.access("./items")
    }
    catch (e) {
      needItems = true
      console.warn(e)
      await fs.mkdir("./items")
    }
    if (needItems) {
      await fs.writeFile("./ItemsVersion.properties", str)

      const response = await fetch(`https://empire-html5.goodgamestudios.com/default/items/items_v${str.match(new RegExp(/(?!.*=).*/))[0]}.json`);
      for (const [key, value] of Object.entries(await response.json())) {
        if (!/^[A-Za-z\_]+$/.test(key)) {
          console.warn(`${key}: is not suitable for a filename`)
          continue
        }

        fs.writeFile(`./items/${key}.json`, JSON.stringify(value))
      }

    }
  }

  let frame = undefined
  const startPage = async () => {
    const browser = await firefox.launch({
      headless: true, firefoxUserPrefs:
        {"general.useragent.override": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"}
    })
    /*
    { "security.ssl.enable_ocsp_stapling": false, "security.enterprise_roots.enabled": false, "general.useragent.override": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" }, args: [
          "-no-remote", "-wait-for-browser", "-foreground", "-juggler-pipe", "-silent", "-headless", ggeConfig.recaptchaTrick ? ("-profile", ggeConfig.firefoxProfile) : "",
          "disable-infobars", "--disable-extensions", "--no-sandbox", "--disable-application-cache", "--disable-gpu", "--disable-dev-shm-usage"]
    */
    const page = await browser.newPage();
    await page.goto(!ggeConfig.recaptchaTrick ? "https://empire.goodgamestudios.com" : "https://empire.goodgamestudios.com/RECAPCHA.html");
 
    frame = !ggeConfig.recaptchaTrick ? page.frame("game") : page
    
    await frame.waitForFunction(() => globalThis.window.grecaptcha != undefined)

    await frame.evaluate(() => new Promise(resolve =>
      globalThis.window.grecaptcha.ready(resolve)))
  }

  await Promise.all([getItemsJSON(), startPage()])
  let captchaToken = () => {
    return frame.evaluate(() => new Promise(resolve => {
      let e = "6Lc7w34oAAAAAFKhfmln41m96VQm4MNqEdpCYm-k";
      globalThis.window.grecaptcha.execute(e, {
        action: "submit"
      }).then(function (givingToken) {
        resolve(givingToken)
      })
    }))
  }

  let userDatabase = new sqlite3.Database("./user.db", sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE)
  userDatabase.exec(
    `CREATE TABLE IF NOT EXISTS "Users" (
	"username"	TEXT NOT NULL UNIQUE,
	"passwordHash" BLOB NOT NULL,
  "passwordSalt" INTEGER NOT NULL,
  "uuid" TEXT UNIQUE,
	"privilege"	INTEGER
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
	PRIMARY KEY("id" AUTOINCREMENT)
);
`)

  const app = express()
  app.use(bodyParser.urlencoded({ extended: true }))
  app.use(cookieParser())
  app.get("/", (_, res) => res.redirect('/index.html'))
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
  app.use(express.static('website'))
  let options = {}
  if (certFound) {
    options.key = fs.readFileSync(ggeConfig.privateKey, 'utf8'),
      options.cert = fs.readFileSync(ggeConfig.cert, 'utf8')

    https.createServer(options, app).listen(443)
  }
  else {
    http.createServer(options, app).listen(80)
  }

  if (!ggeConfig.noInternalWorker) {
    const internalWorkerData = {
      name: ggeConfig.internalWorkerName,
      pass: ggeConfig.internalWorkerPass,
      plugins: {
        fortress: {
          state: true
        },
        aquaisland: {
          state: true
        },
        aquatower: {
          state: true
        },
        score: {
          state: true
        }
      },
      internalWorker: true
    }
    let internalWorker = new Worker("./ggebot.js", { workerData: internalWorkerData })
    internalWorker.on("message", async (obj) => {
      if (obj[0] == ActionType.CAPTCHA)
        internalWorker.postMessage([ActionType.CAPTCHA, await captchaToken()])
    })
    let onExit = _ => {
      internalWorker = new Worker("./ggebot.js", { workerData: internalWorkerData })
      internalWorker.on("exit", onExit)
      internalWorker.on("message", async (obj) => {
        if (obj[0] == ActionType.CAPTCHA)
          internalWorker.postMessage([ActionType.CAPTCHA, await captchaToken()])
      })
    }

    internalWorker.on("exit", onExit)

    await new Promise((resolve) => {
      let func = async (obj) => {
        if (obj[0] != ActionType.Started)
          return
        resolve()
        internalWorker.once("exit", resolve)
        internalWorker.off("message", func)
      }

      internalWorker.on("message", func)
    })
  }

  const loggedInUsers = {}
  const botMap = new Map()

  async function createBot(uuid, user) {
    if (user.id && botMap.get(user.id) != undefined)
      throw Error("User already in use")
    
    let data = structuredClone(user)
    plugins.forEach(plugin => plugin.force ? (data.plugins[plugin.key] ??= {}).state = true : void 0)
    const worker = new Worker("./ggebot.js", { workerData: data });
    if (user.id)
      botMap.set(user.id, worker)

    const onTerminate = async () => {
      user = await getSpecificUser(uuid, user)
      if (botMap.get(user.id) == worker) {
        botMap.set(user.id, undefined)
        if (user.state == true)
          return createBot(uuid, user) //Eat my recursive ass ;)
      }
    }

    worker.on("message", async (obj) => {
      switch (obj[0]) {
        case ActionType.GetLogs:
          if (uuid)
            loggedInUsers[uuid]?.forEach(o => {
              if (o.viewedUser == user.id)
                o.ws.send(JSON.stringify([ErrorType.Success, ActionType.GetLogs, obj[1]]))
            });
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
        case ActionType.CAPTCHA:
          worker.postMessage([ActionType.CAPTCHA, await captchaToken()])
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

  class User {
    constructor(obj) {
      if (obj == undefined)
        return
      this.id = Number(obj?.id)
      this.uuid = String(obj?.uuid)
      this.state = Number(obj?.state)
      this.name = String(obj?.name)
      this.pass = String(obj?.pass)
      this.plugins = obj?.plugins
      this.plugins ??= {}
    }
  }
  const addUser = (uuid, user) => new Promise((resolve, reject) => {
    userDatabase.run("INSERT INTO SubUsers (uuid, name, pass, plugins, state) VALUES(?,?,?,?,?)", [uuid, user.name, user.pass, JSON.stringify(user.plugins), 0], (err) => {
      if (err)
        return reject(err)

      resolve()
    })
  })
  const getSpecificUser = (uuid, user) => new Promise((resolve, reject) => {
    userDatabase.get("Select id, name, plugins, pass, state From SubUsers WHERE uuid=? AND id=?;", [uuid, user.id], (err, row) => {
      if (err)
        return reject(err)
      row.plugins = JSON.parse(row.plugins)
      let user = new User(row)
      resolve(user)
    })
  })
  const changeUser = (uuid, user) => new Promise((resolve, reject) => {
    if (user.pass == undefined || user.pass === "" || user.pass == "null") {
      userDatabase.serialize(function () {
        userDatabase.run(`UPDATE SubUsers SET name = ?, state = ?, plugins = ? WHERE uuid = ? AND id = ?`, [user.name, user.state, JSON.stringify(user.plugins), uuid, user.id], function (err) {
          if (err)
            return reject(err)
        })
        userDatabase.get("Select id, name, plugins, pass, state From SubUsers WHERE uuid=? AND id=?;", [uuid, user.id], (err, row) => {
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
      userDatabase.run(`UPDATE SubUsers SET name = ?, pass = ?, state = ?, plugins = ? WHERE uuid = ? AND id = ?`, [user.name, user.pass, user.state, JSON.stringify(user.plugins), uuid, user.id], function (err) {
        if (err)
          return reject(err)
      })
      userDatabase.get("Select id, name, plugins, pass, state From SubUsers WHERE uuid=? AND id=?;", [uuid, user.id], (err, row) => {
        if (err)
          return reject(err)
        row.plugins ??= {}
        row.plugins = JSON.parse(row.plugins)
        let user = new User(row)
        resolve(user)
      })
    })
  })

  let removeUser = (uuid, user) => new Promise((resolve, reject) => {
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
  let getUser = (uuid) => new Promise((resolve, reject) => {
    let str = uuid === undefined ? "" : "Where uuid=?;"

    userDatabase.all(`Select id, uuid, name, plugins, pass, state From SubUsers ${str}`, [uuid], async (err, rows) => {
      if (err)
        return reject(err)
      return resolve(
        rows?.map(e => {
          e.plugins = JSON.parse(e.plugins)
          return new User(e)
        }))
    })
  })
  getUser().then(async users => {
    for (let i = 0; i < users.length; i++) {
      const user = users[i];

      if (user.state == 0)
        continue
      await createBot(user.uuid, user)
    }
  })

  let server = (certFound ? https : http).createServer(options)

  server.listen(8882)

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
          let loginCheck = (uuid) => new Promise(resolve => {
            userDatabase.get('SELECT * FROM Users WHERE uuid = ?;', uuid, (err, row) => {
              if (err || !row)
                return resolve(false);

              return resolve(true);
            })
          })
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
            user = await changeUser(uuid, user)
            try {
              removeBot(user.id)
            } catch (e) {
              console.warn(e)
            }

            if (user.state == 1) {
              await createBot(uuid, user)
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
          userDatabase.get(`Select id, name, pass, plugins, state From SubUsers Where uuid=? AND id = ?;`, [uuid, user.id], (err, _) => {
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
            worker.postMessage([ActionType.GetLogs])
          })
          break;
        }
        case ActionType.Reset: {
          process.exit(0)
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
  console.info("Started")
}

start()
