import * as React from 'react'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'
import Backdrop from '@mui/material/Backdrop'
import Checkbox from '@mui/material/Checkbox'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'

import { ErrorType, ActionType, LogLevel } from "../types.js"
import UserSettings from './userSettings'
import { getTranslation } from '../translations.js'
import settings from '../settings.json'

function Log(props) {
    const [currentLogs, setCurrentLogs] = React.useState([])
// ... (Log component code remains mostly same, skipping for brevity in replace block targeting GGEUserTable)

    React.useEffect(() => {
        const logGrabber = msg => {
            let [err, action, obj] = JSON.parse(msg.data.toString())

            if (Number(action) !== ActionType.GetLogs)
                return

            if (Number(err) !== ErrorType.Success)
                return

            setCurrentLogs(obj[0].splice(obj[1], obj[0].length - 1).concat(obj[0]).map((obj, index) =>
                <div key={index} style={{
                    color: obj[0] === LogLevel.Error ? "red" :
                        obj[0] === LogLevel.Warn ? "yellow" : "blue"
                }}>{obj[1]}</div>
            ).reverse())
        }
        props.ws.addEventListener("message", logGrabber)
        return () =>
            props.ws.removeEventListener("message", logGrabber)

    }, [props.ws])

    return (
        <Paper sx={{ maxHeight: '90%', overflow: 'auto', height: '80%', width: '40%' }}>
            <div onClick={e => e.stopPropagation()}
                style={{ width: "100%", height: "100%" }}>
                <Typography variant="subtitle1" component="div" align='left' padding={"10px"}>
                    {currentLogs}
                </Typography>
            </div>
        </Paper>)
}
function Language(props) {
    const [anchorEl, setAnchorEl] = React.useState(null) 
    const { cookies, setCookie } = props
    const open = Boolean(anchorEl)
    const handleClick = event => {
        setAnchorEl(event.currentTarget);
    };
    const handleClose = () => {
        setAnchorEl(null);
    };

    return (
        <>
            <Button
                id="basic-button"
                aria-controls={open ? 'basic-menu' : undefined}
                aria-haspopup="true"
                aria-expanded={open ? 'true' : undefined}
                onClick={handleClick}
            >
                {cookies.lang}
            </Button>
            <Menu
                id="basic-menu"
                anchorEl={anchorEl}
                open={open}
                onClose={handleClose}
                slotProps={{
                    list: {
                        'aria-labelledby': 'basic-button',
                    },
                }}
            >
                <MenuItem onClick={() => {setCookie("lang", 'en', { maxAge: 31536000}); handleClose() }}>EN</MenuItem>
                <MenuItem onClick={() => {setCookie("lang", 'pl', { maxAge: 31536000}); handleClose() }}>PL</MenuItem>
                <MenuItem onClick={() => {setCookie("lang", 'de', { maxAge: 31536000}); handleClose() }}>DE</MenuItem>
                <MenuItem onClick={() => {setCookie("lang", 'tr', { maxAge: 31536000}); handleClose() }}>TR</MenuItem>
                <MenuItem onClick={() => {setCookie("lang", 'ar', { maxAge: 31536000}); handleClose() }}>AR</MenuItem>
            </Menu>
        </>
    )
}
export default function GGEUserTable(props) {
    const { cookies, setCookie } = props
    const t = key => getTranslation(cookies.lang, key)
    const user = {}

    const [openSettings, setOpenSettings] = React.useState(false)
    const [selectedUser, setSelectedUser] = React.useState(user)
    const [openLogs, setOpenLogs] = React.useState(false)

    const handleSettingsClose = () => {
        setOpenSettings(false)
        setSelectedUser(user)
    }
    const handleSettingsOpen = () =>
        setOpenSettings(true)

    const handleLogClose = () =>
        setOpenLogs(false)

    const handleLogOpen = () =>
        setOpenLogs(true)

    function PlayerTable() {
        const [selected, setSelected] = React.useState([])

        const handleSelectAllClick = event => {
            if (event.target.checked) {
                const newSelected = props.rows.map(n => n.id)
                setSelected(newSelected)
                return
            }
            setSelected([])
        }

        return <TableContainer component={Paper}>
            <Table sx={{ minWidth: 650 }} aria-label="simple table">
                <TableHead>
                    <TableRow>
                        <TableCell padding="checkbox">
                            <Checkbox
                                color="primary"
                                checked={props.rows.length === selected.length}
                                onClick={handleSelectAllClick}
                                inputProps={{
                                    'aria-label': 'select all entries',
                                }}
                            />
                        </TableCell>
                        <TableCell align="left">{t("Name")}</TableCell>
                        <TableCell align="left" padding='none'>{t("Plugins")}</TableCell>
                        <TableCell>{t("Status")}</TableCell>
                        <TableCell align='right' padding='none'>
                            <Language cookies={cookies} setCookie={setCookie}/>
                            <Button
                                style={{ margin: "10px", maxHeight: '32px', minHeight: '32px' }}
                                onClick={async () =>
                                    window.open(`https://discord.com/oauth2/authorize?client_id=${props.channelInfo[0]}&permissions=8&response_type=code&redirect_uri=${window.location.protocol === 'https:' ? "https" : "http"}%3A%2F%2F${window.location.hostname}%3A${(settings.port ?? window.location.port) !== '' ? (settings.port ?? window.location.port) : window.location.protocol === 'https:' ? "443" : "80"}%2FdiscordAuth&integration_type=0&scope=identify+guilds.join+bot`, "_blank")}
                            >{t("Link Discord")}</Button>
                            <Button style={{ maxWidth: '64px', maxHeight: '32px', minWidth: '32px', minHeight: '32px', marginRight: "10px" }} onClick={handleSettingsOpen}>+</Button>
                        </TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {props.rows.map((row, index) => {
                        function PlayerRow() {
                            let getEnabledPlugins = () => {
                                let enabledPlugins = []
                                Object.entries(row.plugins).forEach(([key, value]) => {
                                    if (Boolean(value.state) === true && Boolean(value.forced) !== true)
                                        enabledPlugins.push(key)
                                    return
                                })
                                return enabledPlugins
                            }

                            const isItemSelected = selected.includes(row.id)
                            const labelId = `enhanced-table-checkbox-${index}`
                            const [state, setState] = React.useState(row.state)
                            row.state = state

                            let status = props.usersStatus[row.id]
                            status ??= {}
                            return (<TableRow style={status?.hasError ? { border: "red solid 2px" } : {}}
                                sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                            >
                                <TableCell padding="checkbox">
                                    <Checkbox
                                        color="primary"
                                        checked={isItemSelected}
                                        onClick={() => {
                                            let index = selected.indexOf(row.id)
                                            if (index < 0) {
                                                selected.push(row.id)
                                                setSelected(Array.from(selected))
                                                return
                                            }
                                            setSelected(selected.toSpliced(index, 1))
                                        }}
                                        inputProps={{
                                            'aria-labelledby': labelId,
                                        }}
                                    />
                                </TableCell>
                                <TableCell component="th" scope="row">{row.name}</TableCell>

                                <TableCell align="left" padding='none'>{getEnabledPlugins().join(" ")}</TableCell>
                                <TableCell>
                                    <Box sx={{ display: 'flex' }}>
                                        <Box sx={{ display: 'flex', flexDirection: "column" }} paddingRight={"10px"}>
                                            <Typography>{status.aquamarine ? "Aqua" : ""}</Typography>
                                            <Typography>{status.aquamarine ?? ""}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', flexDirection: "column" }} paddingRight={"10px"}>
                                            <Typography>{status.level ? "Level" : ""}</Typography>
                                            <Typography>{status.level ?? ""}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', flexDirection: "column" }} paddingRight={"10px"}>
                                            <Typography>{status.mead ? "Mead" : ""}</Typography>
                                            <Typography>{status.mead ?? ""}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', flexDirection: "column" }} paddingRight={"10px"}>
                                            <Typography>{status.food ? "Food" : ""}</Typography>
                                            <Typography>{status.food ?? ""}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', flexDirection: "column" }} paddingRight={"10px"}>
                                            <Typography>{status.coin ? "Coin" : ""}</Typography>
                                            <Typography>{status.coin ?? ""}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', flexDirection: "column" }} paddingRight={"10px"}>
                                            <Typography>{status.rubies ? "Rubies" : ""}</Typography>
                                            <Typography>{status.rubies ?? ""}</Typography>
                                        </Box>
                                    </Box>
                                </TableCell>
                                <TableCell align="right" padding='none' style={{ padding: "10px" }}>
                                    <Button variant="text" onClick={() => {
                                        props.ws.send(JSON.stringify([ErrorType.Success, ActionType.GetLogs, row]))
                                        handleLogOpen()
                                    }}>{t("Logs")}</Button>
                                    <Button variant="text" onClick={() => {
                                        setSelectedUser(row)
                                        setOpenSettings(true)
                                    }}>{t("Settings")}</Button>
                                    <Button variant="contained"
                                        onClick={() => {
                                            row.state = !state
                                            props.ws.send(JSON.stringify([ErrorType.Success, ActionType.SetUser, row]))
                                            setState(!state)
                                        }}
                                        style={{ maxWidth: '64px', maxHeight: '32px', minWidth: '32px', minHeight: '32px', marginLeft: "10px" }}>{state ? t("Stop") : t("Start")}</Button>
                                </TableCell>
                            </TableRow>)
                        }
                        return <PlayerRow key={row.id} />
                    })}
                    <TableRow
                        sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                    >
                        <TableCell align='right' padding='none' />
                        <TableCell align='right' padding='none' />
                        <TableCell align='right' padding='none' />
                        <TableCell align='right' padding='none' />
                        <TableCell align='right' padding='none'>
                            <Button variant="contained" style={{ maxWidth: '64px', maxHeight: '32px', minWidth: '32px', minHeight: '32px', paddingLeft: "38px", paddingRight: "38px", margin: "10px" }} onClick={() => {
                                props.ws.send(JSON.stringify([ErrorType.Success, ActionType.RemoveUser, props.rows.filter((e) => selected.includes(e.id))]))
                            }}>{t("Remove")}</Button>
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table></TableContainer>
    }

    return (
        <>
            <Backdrop
                sx={theme => ({ color: '#fff', zIndex: theme.zIndex.drawer + 1 })}
                open={openSettings}
                onClick={handleSettingsClose}
                style={{ maxHeight: '100%', overflow: 'auto' }}
                key={selectedUser.id} >
                <UserSettings ws={props.ws}
                    selectedUser={selectedUser}
                    key={selectedUser.id}
                    closeBackdrop={handleSettingsClose}
                    plugins={props.plugins}
                    channels={props.channelInfo[1]}
                    cookies={cookies} />
            </Backdrop>
            <Backdrop
            sx={theme => ({ color: '#fff', zIndex: theme.zIndex.drawer + 1 })}
            open={openLogs}
            onClick={() => {
                props.ws.send(JSON.stringify([ErrorType.Success, ActionType.GetLogs, undefined]))
                
                handleLogClose()
            }}
            style={{ maxHeight: '100%', overflow: 'auto' }} >
                <Log ws={props.ws}/>
                </Backdrop>
            <PlayerTable/>
        </>
    )
}