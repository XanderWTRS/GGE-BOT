import * as React from 'react'
import Checkbox from '@mui/material/Checkbox'
import TextField from '@mui/material/TextField'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'
import FormGroup from '@mui/material/FormGroup'
import FormControlLabel from '@mui/material/FormControlLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'

import { ErrorType, ActionType } from "../types.js"
import PluginsTable from './pluginsTable'

let lang = JSON.parse(await (await fetch(`${window.location.protocol === 'https:' ? "https" : "http"}://${window.location.hostname}:${window.location.port}/lang.json`)).text())

let servers = new DOMParser()
    .parseFromString(await (await fetch(`${window.location.protocol === 'https:' ? "https" : "http"}://${window.location.hostname}:${window.location.port}/1.xml`)).text(),"text/xml")
let instances = []
let _instances = servers.getElementsByTagName("instance")

for (var key in _instances) {
    let obj = _instances[key]

    let server, zone, instanceLocaId, instanceName
    
    for (var key2 in obj.childNodes) {
        let obj2 = obj.childNodes[key2]
        
        switch(obj2.nodeName) 
        {
            case "server":
                server = obj2.childNodes[0].nodeValue
                break
            case "zone":
                zone = obj2.childNodes[0].nodeValue
                break
            case "instanceLocaId":
                instanceLocaId = obj2.childNodes[0].nodeValue
                break
            case "instanceName":
                instanceName = obj2.childNodes[0].nodeValue
                break
            default:
        }
    }
    if(instanceLocaId)
    instances.push({id: obj.getAttribute("value"),server,zone,instanceLocaId,instanceName})
}

export default function UserSettings(props) {
    props.selectedUser.name ??= ""
    const isNewUser = props.selectedUser.name === ""
    const [name, setName] = React.useState(props.selectedUser.name)
    const [pass, setPass] = React.useState("")
    const [plugins, setPlugins] = React.useState(props.selectedUser.plugins)
    const [server, setServer] = React.useState(props.selectedUser.server ?? instances[0].id)
    const [externalEvent, setExternalEvent] = React.useState(props.selectedUser.externalEvent)

    const pluginTable = React.useMemo(() => {
        return <PluginsTable plugins={props.plugins} userPlugins={plugins} channels={props.channels} 
                    onChange={ e => setPlugins(e)}/>
    }, [props.channels, props.plugins, plugins])

    return (
        <div onClick={event => event.stopPropagation()}>
            <Paper>
                <div style={{color:"red", border:"red 2px solid"}}>
                    <b>Warning</b>
                    <br></br>
                    <div style={{color:"white"}}>
                    Using this software may violate the terms of service of the game or platform you are using. <br></br>Using this software could result in a permanent account ban, loss of in-game progress, and/or other penalties. <br></br> Proceed at your own risk
                    </div>
                </div>
                
                <FormGroup row={true} style={{ padding: "12px" }}>
                    <TextField required label="Username" value={name} onChange={e => setName(e.target.value)} disabled={!isNewUser} />
                    <TextField required label="Password" type='password' value={pass} onChange={e => setPass(e.target.value)} />
                    
                    <FormControl style={{width: "100px"}}>
                        <InputLabel id="simple-select-label">Server</InputLabel>
                        <Select
                            labelId="simple-select-label"
                            id="simple-select"
                            value={server}
                            onChange={(newValue) => setServer(newValue.target.value)}
                        >
                            {
                                instances.map((server, i) => <MenuItem value={server.id} key={`Server${i}`}>{lang[server.instanceLocaId] + ' ' + server.instanceName}</MenuItem>)
                            }
                        </Select>
                    </FormControl>
                    <FormControlLabel style={{ margin: "auto", marginRight:"2px" }} control={<Checkbox/>} checked={externalEvent} onChange={e => setExternalEvent(e.target.checked)} label="OR/BTH" />
                    {
                        pluginTable
                    }
                    <Button variant="contained" style={{ margin: "10px", maxWidth: '64px', maxHeight: '32px', minWidth: '32px', minHeight: '32px' }}
                        onClick={async () => {
                            try {
                                props.selectedUser.name = name
                                props.selectedUser.plugins = plugins
                                props.selectedUser.externalEvent = externalEvent
                                props.selectedUser.server = server
                                
                                if(pass)
                                props.selectedUser.pass = pass
                                else if(isNewUser)
                                    return

                                props.ws.send(JSON.stringify([ErrorType.Success, isNewUser ? ActionType.AddUser : ActionType.SetUser, props.selectedUser]))
                                props.closeBackdrop()
                            }
                            catch (e) {
                                console.warn(e)
                            }
                        }}
                    >
                        Save
                    </Button>
                </FormGroup>
            </Paper>
        </div>
    )
}