import * as React from 'react'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import IconButton from '@mui/material/IconButton'
import Collapse from '@mui/material/Collapse'
import Checkbox from '@mui/material/Checkbox'
import Select from '@mui/material/Select'
import Box from '@mui/material/Box'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import TextField from '@mui/material/TextField'
import FormGroup from '@mui/material/FormGroup'
import FormControlLabel from '@mui/material/FormControlLabel'
import Slider from '@mui/material/Slider'
import Typography from '@mui/material/Typography'

export default function PluginsTable(props) {
    const userPlugins = props.userPlugins ?? {}
    const array_chunks = (array, chunk_size) => Array(Math.ceil(array.length / chunk_size)).fill().map((_, index) => index * chunk_size).map(begin => array.slice(begin, begin + chunk_size))
    const Plugin = (props2) => {
        userPlugins[props2.data.key] ??= {}
        const [open, setOpen] = React.useState(false)
        const [state, setState] = React.useState(userPlugins[props2.data.key]?.state)
        return (
            <>
                <TableRow>
                    <TableCell>
                        {
                            props2.data?.pluginOptions ? (
                                <IconButton
                                    aria-label="expand row"
                                    size="small"
                                    onClick={() => setOpen(!open)}>
                                    {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                                </IconButton>
                            ) : undefined
                        }
                    </TableCell>
                    <TableCell>{props2.data.name}</TableCell>
                    <TableCell>{props2.data.description}</TableCell>
                    <TableCell align='right'>
                        {!props2.data.force ?
                            <Button variant="contained" style={{ maxWidth: '64px', maxHeight: '32px', minWidth: '32px', minHeight: '32px', marginLeft: "10px" }} onClick={() => {
                                setState(!state)
                                userPlugins[props2.data.key].state = !state
                                props.onChange(userPlugins)
                            }}>{state ? "Stop" : "Start"}</Button> : ""
                        }
                    </TableCell>
                </TableRow>
                <TableRow>
                    <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={4} >
                        <Collapse in={open} timeout="auto" unmountOnExit>
                            <FormGroup>
                                {props2.data?.pluginOptions?.map((obj2) => {
                                    let PluginOption = (props4) => {
                                        userPlugins[props2.data.key][props4.pluginData.key] ??= props4.pluginData.default
                                        const [value, setValue] = React.useState(userPlugins[props2.data.key][props4.pluginData.key])

                                        let onChange = (newValue) => {
                                            userPlugins[props2.data.key][props4.pluginData.key] = newValue
                                            setValue(newValue)
                                            props.onChange(userPlugins)
                                        }
                                        switch (props4.pluginData.type) {
                                            case "Label":
                                                return <>{props4.pluginData.label}</>
                                            case "Text":
                                                return <TextField label={props4.pluginData.label} key={props4.pluginData.label} value={value} onChange={(e) => onChange(e.target.value)} />
                                            case "Checkbox":
                                                return <FormControlLabel control={<Checkbox />} label={props4.pluginData.label} key={props4.pluginData.label} checked={value} onChange={(_, newValue) => onChange(newValue)} />
                                            case "Table":
                                                return <TableContainer>
                                                    <Table aria-label="simple table">
                                                        <TableHead>
                                                            <TableRow>
                                                                {props4.pluginData.row.map(cRow => <TableCell>{cRow}</TableCell>)}
                                                            </TableRow>
                                                        </TableHead>
                                                        <TableBody>
                                                            {
                                                                array_chunks(props4.pluginData.data, props4.pluginData.row.length).map(e =>
                                                                        <TableRow>
                                                                            {
                                                                                e.map(e =>
                                                                                    <TableCell>
                                                                                        <PluginOption pluginData={e} key={e.key} />
                                                                                    </TableCell>)
                                                                                }
                                                                        </TableRow>)
                                                            }
                                                        </TableBody>
                                                    </Table>
                                                </TableContainer>
                                            case "Channel":
                                                return <FormControl>
                                                    <InputLabel id="simple-select-label">{props4.pluginData.label}</InputLabel>
                                                    <Select
                                                        labelId="simple-select-label"
                                                        id="simple-select"
                                                        value={value}
                                                        label={props4.pluginData.label}
                                                        onChange={(newValue) => onChange(newValue.target.value)}
                                                    >
                                                        {
                                                            props.channels?.map((channel,i) => <MenuItem value={channel.id} key={`${props4.pluginData.label}${i}`}>{channel.name}</MenuItem>)
                                                        }
                                                    </Select>
                                                </FormControl>
                                            case "Select":
                                                return <FormControl>
                                                    <InputLabel id="simple-select-label">{props4.pluginData.label}</InputLabel>
                                                    <Select
                                                        labelId="simple-select-label"
                                                        id="simple-select"
                                                        value={value}
                                                        label={props4.pluginData.label}
                                                        onChange={(newValue) => onChange(newValue.target.value)}
                                                    >
                                                        {
                                                            props4.pluginData.selection.map((e, i) => <MenuItem value={i}>{e}</MenuItem>)
                                                        }
                                                    </Select>
                                                </FormControl>
                                            case "Slider":
                                                return <Box sx={{ display: "flex", whiteSpace: "nowrap", justifyContent: "center", padding: "1px", textAlign: "center" }}>
                                                    <Typography alignSelf={"center"} id="input-slider">
                                                        {props4.pluginData.label}
                                                    </Typography>
                                                    <Slider style={{ marginLeft: "20px", marginRight: "10px" }} aria-label="Default" key={props4.pluginData.label} value={value} onChange={(_, newValue) => onChange(newValue)} />
                                                    <Typography alignSelf={"center"} id="input-slider">
                                                        {`${value}%`}
                                                    </Typography>
                                                </Box>
                                            default:
                                                return <Typography>{"Failed to load option"}</Typography>
                                        }
                                    }
                                    return <PluginOption pluginData={obj2} key={obj2.key} />
                                })}
                            </FormGroup>
                        </Collapse>
                    </TableCell>
                </TableRow></>
        )
    }
    return (
        <Paper style={{ minHeight: 400, maxHeight: 350, width: '100%', overflow: 'hidden' }}>
            <TableContainer sx={{ maxHeight: 400 }}>
                <Table aria-label="simple table">
                    <TableHead>
                        <TableRow>
                            <TableCell></TableCell>
                            <TableCell>Name</TableCell>
                            <TableCell>Description</TableCell>
                            <TableCell align='right' />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {props.plugins.map(plugin => <Plugin data={plugin} key={plugin.key} />)}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    )
}