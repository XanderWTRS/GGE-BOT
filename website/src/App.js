import ReconnectingWebSocket from "reconnecting-websocket"
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { CircularProgress } from '@mui/material'
import { useCookies } from 'react-cookie'
import * as React from 'react'
import './App.css'
import { ErrorType, GetErrorTypeName, ActionType, User } from "./types.js"
import GGEUserTable from './modules/GGEUsersTable'
import settings from './settings.json'

function GrabAssets() {
  const [cookies, setCookie] = useCookies([])
  const [lang, setLang] = React.useState(false)
  const setLanguage = async lang => {
    setCookie("lang", cookies.lang = lang, { maxAge: 31536000 })

    try {
      const response = await fetch(
        `${window.location.protocol === 'https:' ? "https" : "http"}://${window.location.hostname}:${window.location.port}/locales/${lang}.json`)

      setLang(await response.json())
    }
    catch (e) {
      throw new Error("Failed to load language.\n\n" + e)
    }
  }

  if (lang === false) {
    setLanguage(cookies.lang ?? "en")

    return <CircularProgress style={{
      margin: "0",
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)"
    }} />
  }
  const __ = key => {
    if(lang[key] == undefined)
      console.warn(`[Language] ${key} key not found`)
    return lang[key] || key
  }
  return <App setLanguage={setLanguage} languageCode={cookies.lang} __={__} />
}

const darkTheme = createTheme({
  palette: {
    mode: 'dark'
  }
})

function App({setLanguage, languageCode, __}) {
  const [users, setUsers] = React.useState([])
  const [usersStatus, setUsersStatus] = React.useState({})
  const [plugins, setPlugins] = React.useState([])
  const [channelInfo, setChannelInfo] = React.useState([])
  let ws = React.useMemo(() => {
    const usersStatus = {}
    const ws = new ReconnectingWebSocket(`${window.location.protocol === 'https:' ? "wss" : "ws"}://${window.location.hostname}:${settings.port ?? window.location.port}`, [], { WebSocket: WebSocket, minReconnectionDelay: 3000 })

    ws.addEventListener("message", (msg) => {
      let [err, action, obj] = JSON.parse(msg.data.toString())
      if (err)
        console.error(GetErrorTypeName(err))

      switch (Number(action)) {
        case ActionType.GetUUID:
          if(err === ErrorType.Unauthenticated)
          return window.location.href = "signin.html"
          break
        case ActionType.GetChannels:
          setChannelInfo(obj ?? [])
          break
        case ActionType.GetUsers:
          if (err !== ErrorType.Success)
            return

          setUsers(obj[0].map(e => new User(e)))
          setPlugins(obj[1])
          break
        case ActionType.StatusUser:
          usersStatus[obj.id] = obj
          setUsersStatus(structuredClone(usersStatus))
          break
        default:
          return
      }
    })
    return ws
  }, [])

  return (
    <div className="App">
      <ThemeProvider theme={darkTheme}>
        <GGEUserTable ws={ws} plugins={plugins} rows={users} usersStatus={usersStatus} channelInfo={channelInfo} setLanguage={setLanguage} languageCode={languageCode} __={__} />
      </ThemeProvider>
    </div>
  )
}

export default GrabAssets
