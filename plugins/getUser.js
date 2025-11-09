const name = "Get User"
if (require('node:worker_threads').isMainThread)
  return module.exports = { name, hidden: true }

const sqlite3 = require("sqlite3")

let userDatabase = new sqlite3.Database("./user.db", sqlite3.OPEN_READWRITE) //Bad handle errors! 

class User {
  constructor(obj) {
    if(obj == undefined)
      return
    this.id = Number(obj?.id)
    this.uuid = String(obj?.uuid)
    this.state = Number(obj?.state)
    this.name = String(obj?.name)
    this.pass = String(obj?.pass)
    this.plugins = obj?.plugins
    this.plugins ??= {}
    this.externalEvent = Boolean(obj?.externalEvent)
  }
}

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

module.exports = getUser