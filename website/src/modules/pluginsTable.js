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
import FormControlLabel from '@mui/material/FormControlLabel'
import Slider from '@mui/material/Slider'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Grid'
import { getTranslation } from '../translations.js'

export default function PluginsTable(props) {
    const { language } = props;
    const t = (key) => getTranslation(language, key);

    const userPlugins = props.userPlugins ?? {}
    const array_chunks = (array, chunk_size) => Array(Math.ceil(array.length / chunk_size)).fill().map((_, index) => index * chunk_size).map(begin => array.slice(begin, begin + chunk_size))

    const Plugin = (props2) => {
        userPlugins[props2.data.key] ??= {}
        const [open, setOpen] = React.useState(false)
        const [state, setState] = React.useState(userPlugins[props2.data.key]?.state)

        return (
            <>
                <TableRow sx={{ '&:nth-of-type(odd)': { backgroundColor: 'rgba(255, 255, 255, 0.03)' }, '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.05)' } }}>
                    <TableCell>
                        {
                            props2.data?.pluginOptions ? (
                                <IconButton
                                    aria-label="expand row"
                                    size="small"
                                    onClick={() => setOpen(!open)}
                                    sx={{ color: '#90caf9' }}
                                >
                                    {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                                </IconButton>
                            ) : undefined
                        }
                    </TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>{t(props2.data.name)}</TableCell>
                    <TableCell>{t(props2.data.description)}</TableCell>
                    <TableCell align='right'>
                        {!props2.data.force ?
                            <Button
                                variant={state ? "contained" : "outlined"}
                                color={state ? "error" : "success"}
                                size="small"
                                sx={{ minWidth: '70px', height: '28px', fontSize: '0.75rem' }}
                                onClick={() => {
                                    setState(!state)
                                    userPlugins[props2.data.key].state = !state
                                    props.onChange(userPlugins)
                                }}>
                                {state ? "Stop" : "Start"}
                            </Button> :
                            <span style={{ color: '#666', fontSize: '0.8rem', marginRight: '10px' }}>System</span>
                        }
                    </TableCell>
                </TableRow>
                <TableRow>
                    <TableCell style={{ paddingBottom: 0, paddingTop: 0, borderBottom: open ? '1px solid rgba(81, 81, 81, 1)' : 'unset' }} colSpan={4} >
                        <Collapse in={open} timeout="auto" unmountOnExit>
                            {/* Ayarlar Kutusu: Daha Kompakt ve Scroll edilebilir */}
                            <Box sx={{ p: 1, m: 0.5, ml: 2, bgcolor: 'rgba(0, 0, 0, 0.2)', borderRadius: 1, border: '1px solid rgba(255, 255, 255, 0.08)', maxHeight: '40vh', overflowY: 'auto', '&::-webkit-scrollbar': { width: '6px' }, '&::-webkit-scrollbar-thumb': { backgroundColor: '#555', borderRadius: '3px' } }}>
                                <Grid container columnSpacing={1} rowSpacing={0.5} alignItems="center">
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
                                                case "":
                                                    return <></>
                                                case "Label":
                                                    return <Typography variant="subtitle2" sx={{ width: '100%', borderBottom: '1px solid rgba(144, 202, 249, 0.3)', pb: 0.2, mb: 0.2, color: '#90caf9', mt: 0.5, fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.7rem' }}>{t(props4.pluginData.label)}</Typography>
                                                case "Text":
                                                    return <TextField
                                                        fullWidth
                                                        label={t(props4.pluginData.label)}
                                                        variant="outlined"
                                                        size="small"
                                                        key={props4.pluginData.label}
                                                        value={value}
                                                        onChange={(e) => onChange(e.target.value)}
                                                        sx={{ '& .MuiInputBase-root': { fontSize: '0.75rem' }, '& .MuiInputLabel-root': { fontSize: '0.75rem' }, my: 0.5 }}
                                                    />
                                                case "Checkbox":
                                                    return <FormControlLabel
                                                        control={<Checkbox size="small" sx={{ p: 0.5, color: '#90caf9', '&.Mui-checked': { color: '#90caf9' } }} />}
                                                        label={<Typography variant="body2" sx={{ fontSize: '0.75rem' }}>{t(props4.pluginData.label)}</Typography>}
                                                        key={props4.pluginData.label}
                                                        checked={value}
                                                        onChange={(_, newValue) => onChange(newValue)}
                                                        sx={{ mr: 1, ml: 0, '& .MuiFormControlLabel-label': { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }}
                                                    />
                                                case "Table":
                                                    return <TableContainer component={Paper} elevation={0} sx={{ bgcolor: 'rgba(0,0,0,0.1)', mt: 0.5, maxHeight: '200px', overflow: 'auto' }}>
                                                        <Table aria-label="simple table" size="small" stickyHeader>
                                                            <TableHead>
                                                                <TableRow>
                                                                    {props4.pluginData.row.map(cRow => <TableCell key={cRow} sx={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#ccc', bgcolor: '#333', py: 0.5 }}>{cRow}</TableCell>)}
                                                                </TableRow>
                                                            </TableHead>
                                                            <TableBody>
                                                                {
                                                                    array_chunks(props4.pluginData.data, props4.pluginData.row.length).map((e, idx) =>
                                                                        <TableRow key={idx}>
                                                                            {
                                                                                e.map(e =>
                                                                                    <TableCell key={e.key} sx={{ py: 0.5 }}>
                                                                                        <PluginOption pluginData={e} key={e.key} />
                                                                                    </TableCell>)
                                                                            }
                                                                        </TableRow>)
                                                                }
                                                            </TableBody>
                                                        </Table>
                                                    </TableContainer>
                                                case "Channel":
                                                    return <FormControl fullWidth size="small" sx={{ my: 0.5 }}>
                                                        <InputLabel sx={{ fontSize: '0.75rem' }}>{t(props4.pluginData.label)}</InputLabel>
                                                        <Select value={value} label={props4.pluginData.label} onChange={(newValue) => onChange(newValue.target.value)} sx={{ fontSize: '0.75rem' }}>
                                                            {props.channels?.map((channel, i) => <MenuItem value={channel.id} key={i} sx={{ fontSize: '0.75rem' }}>{channel.name}</MenuItem>)}
                                                        </Select>
                                                    </FormControl>
                                                case "Select":
                                                    return <FormControl fullWidth size="small" sx={{ my: 0.5 }}>
                                                        <InputLabel sx={{ fontSize: '0.75rem' }}>{t(props4.pluginData.label)}</InputLabel>
                                                        <Select value={value} label={props4.pluginData.label} onChange={(newValue) => onChange(newValue.target.value)} sx={{ fontSize: '0.75rem' }}>
                                                            {props4.pluginData.selection.map((e, i) => <MenuItem value={i} key={e} sx={{ fontSize: '0.75rem' }}>{e}</MenuItem>)}
                                                        </Select>
                                                    </FormControl>
                                                case "Slider":
                                                    return <Box sx={{ display: "flex", alignItems: "center", width: '100%', my: 0.5 }}>
                                                        <Typography variant="body2" sx={{ mr: 1, fontSize: '0.75rem' }}>{t(props4.pluginData.label)}</Typography>
                                                        <Slider size="small" sx={{ flexGrow: 1 }} value={value} onChange={(_, newValue) => onChange(newValue)} />
                                                        <Typography variant="body2" sx={{ ml: 1, minWidth: '25px', fontSize: '0.75rem' }}>{`${value}%`}</Typography>
                                                    </Box>
                                                default:
                                                    return null
                                            }
                                        }
                                        // Grid boyutlandırma (Daha kompakt)
                                        const getGridSize = obj =>
                                            Object.assign(obj.type === 'Checkbox' ? { xs: 6, sm: 4, md: 3, lg: 2 } : { xs: 12, sm: 6, md: 4 }, obj)

                                        const gridSize = getGridSize(obj2)
                                        return (
                                            <Grid item {...gridSize} key={obj2.key} sx={{ overflow: 'hidden' }}>
                                                <PluginOption pluginData={obj2} />
                                            </Grid>
                                        )
                                    })}
                                </Grid>
                            </Box>
                        </Collapse>
                    </TableCell>
                </TableRow></>
        )
    }
    return (
        <Paper elevation={3} style={{ height: '100%', width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', backgroundColor: '#1e1e1e' }}>
            <TableContainer sx={{ flexGrow: 1, height : "100%", width : "100%", overflowY: 'auto', overflowX: 'hidden' }}>
                <Table stickyHeader aria-label="plugins table">
                    <TableHead>
                        <TableRow>
                            <TableCell style={{ width: 50, backgroundColor: '#2d2d2d', color: '#90caf9' }}></TableCell>
                            <TableCell style={{ backgroundColor: '#2d2d2d', color: '#90caf9', fontWeight: 'bold' }}>Name</TableCell>
                            <TableCell style={{ backgroundColor: '#2d2d2d', color: '#90caf9', fontWeight: 'bold' }}>Description</TableCell>
                            <TableCell align='right' style={{ backgroundColor: '#2d2d2d', color: '#90caf9' }}>Status</TableCell>
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