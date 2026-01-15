import './App.css'
import GGEUserTable from './modules/GGEUsersTable'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import * as React from 'react'
import { ErrorType, GetErrorTypeName, ActionType, User } from "./types.js"
import ReconnectingWebSocket from "reconnecting-websocket"

const darkTheme = createTheme({
  palette: {
    mode: 'dark'
  }
})

function App() {
  let [users, setUsers] = React.useState([])
  let [usersStatus, setUsersStatus] = React.useState({})
  let [plugins, setPlugins] = React.useState([])
  let [channelInfo, setChannelInfo] = React.useState([])
  let ws = React.useMemo(() => {
    const usersStatus = {}
    const ws = new ReconnectingWebSocket(`${window.location.protocol === 'https:' ? "wss" : "ws"}://${window.location.hostname}:${window.location.port}`,[], {WebSocket: WebSocket, minReconnectionDelay: 3000 })
    
    ws.addEventListener("message", (msg) => {
      let [err, action, obj] = JSON.parse(msg.data.toString())
      if(err)
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
          if(err !== ErrorType.Success)
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
          <GGEUserTable ws={ws} plugins={plugins} rows={users} usersStatus={usersStatus} channelInfo={channelInfo} />
      </ThemeProvider>
    </div>
  )
}

export default App
