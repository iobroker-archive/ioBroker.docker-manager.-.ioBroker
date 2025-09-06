import React, { Component } from 'react';
import { type AdminConnection, I18n } from '@iobroker/adapter-react-v5';
import type { ContainerInfo, DockerContainerInspect, ImageInfo } from '../types';
import {
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Fab,
    IconButton,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    FormControl,
    Select,
    InputLabel,
    MenuItem,
    Tooltip,
    TextField,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Refresh as RefreshIcon, PlayArrow, Pause } from '@mui/icons-material';
import type { ContainerConfig } from '../../../src/types';

interface ContainersTabProps {
    socket: AdminConnection;
    alive: boolean;
    instance: number;
    images: ImageInfo[] | undefined;
    containers: ContainerInfo[] | undefined;
    container: { [id: string]: DockerContainerInspect };
}

interface ContainersTabState {
    showAddDialog: boolean;
    showDeleteDialog: string; // image name
    addImage: ContainerConfig | null;
    requesting: boolean;
    showRecreateDialog: string;
    showStopDialog: string;
    showRestartDialog: string;
}

export default class ContainersTab extends Component<ContainersTabProps, ContainersTabState> {
    constructor(props: ContainersTabProps) {
        super(props);
        this.state = {
            showAddDialog: false,
            showDeleteDialog: '',
            addImage: null,
            requesting: false,
            showRecreateDialog: '',
            showStopDialog: '',
            showRestartDialog: '',
        };
    }

    renderAddDialog(): React.JSX.Element | null {
        if (!this.state.showAddDialog) {
            return null;
        }
        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showAddDialog: false })}
            >
                <DialogTitle>{I18n.t('Create new container')}</DialogTitle>
                <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 400 }}>
                    <FormControl
                        fullWidth
                        variant="standard"
                    >
                        <InputLabel>{I18n.t('Image')}</InputLabel>
                        <Select
                            variant="standard"
                            value={this.state.addImage?.image || ''}
                            onChange={e =>
                                this.setState({
                                    addImage: { ...(this.state.addImage as ContainerConfig), image: e.target.value },
                                })
                            }
                        >
                            {this.props.images!.map(image => (
                                <MenuItem
                                    key={`${image.repository}:${image.tag || 'latest'}`}
                                    value={`${image.repository}:${image.tag || 'latest'}`}
                                >{`${image.repository}:${image.tag || 'latest'}`}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <TextField
                        label={I18n.t('Container name')}
                        variant="standard"
                        fullWidth
                        value={this.state.addImage?.name || ''}
                        onChange={e =>
                            this.setState({
                                addImage: { ...(this.state.addImage as ContainerConfig), name: e.target.value },
                            })
                        }
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={() => {
                            this.setState({ requesting: true }, async () => {
                                try {
                                    await this.props.socket.sendTo(
                                        `docker-manager.${this.props.instance}`,
                                        'image:run',
                                        this.state.addImage,
                                    );
                                    this.setState({ showAddDialog: false, requesting: false });
                                } catch (e) {
                                    console.error(`Cannot create container image ${this.state.addImage!.name}: ${e}`);
                                    alert(`Cannot pull image ${this.state.addImage!.name}: ${e}`);
                                    this.setState({ requesting: false });
                                }
                            });
                        }}
                    >
                        {this.state.requesting ? <CircularProgress size={24} /> : <AddIcon />}
                        {I18n.t('Create')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ showAddDialog: false })}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderConfirmDeleteDialog(): React.JSX.Element | null {
        if (!this.state.showDeleteDialog) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showDeleteDialog: '' })}
            >
                <DialogTitle>{I18n.t('Delete container')}</DialogTitle>
                <DialogContent>
                    {I18n.t('Are you sure you want to delete container "%s"?', this.state.showDeleteDialog)}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={this.state.requesting}
                        onClick={() => {
                            this.setState({ requesting: true }, async () => {
                                try {
                                    await this.props.socket.sendTo(
                                        `docker-manager.${this.props.instance}`,
                                        'container:remove',
                                        {
                                            id: this.state.showDeleteDialog,
                                        },
                                    );
                                    this.setState({ showDeleteDialog: '', requesting: false });
                                } catch (e) {
                                    console.error(`Cannot delete container ${this.state.showDeleteDialog}: ${e}`);
                                    alert(`Cannot delete image ${this.state.showDeleteDialog}: ${e}`);
                                    this.setState({ requesting: false });
                                }
                            });
                        }}
                    >
                        {this.state.requesting ? <CircularProgress size={24} /> : <DeleteIcon />}
                        {I18n.t('Delete')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ showDeleteDialog: '' })}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderConfirmRecreateDialog(): React.JSX.Element | null {
        if (!this.state.showRecreateDialog) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showRecreateDialog: '' })}
            >
                <DialogTitle>{I18n.t('Re-create container')}</DialogTitle>
                <DialogContent>
                    {I18n.t('Are you sure you want to re-create container "%s"?', this.state.showRecreateDialog)}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={this.state.requesting}
                        onClick={() => {
                            this.setState({ requesting: true }, async () => {
                                try {
                                    await this.props.socket.sendTo(
                                        `docker-manager.${this.props.instance}`,
                                        'container:remove',
                                        {
                                            id: this.state.showRecreateDialog,
                                        },
                                    );
                                    this.setState({ showRecreateDialog: '', requesting: false });
                                } catch (e) {
                                    console.error(`Cannot delete container ${this.state.showRecreateDialog}: ${e}`);
                                    alert(`Cannot delete image ${this.state.showRecreateDialog}: ${e}`);
                                    this.setState({ requesting: false });
                                }
                            });
                        }}
                    >
                        {this.state.requesting ? <CircularProgress size={24} /> : <DeleteIcon />}
                        {I18n.t('Delete')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ showRecreateDialog: '' })}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderConfirmStopDialog(): React.JSX.Element | null {
        if (!this.state.showStopDialog) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showStopDialog: '' })}
            >
                <DialogTitle>{I18n.t('Stop container')}</DialogTitle>
                <DialogContent>
                    {I18n.t('Are you sure you want to stop container "%s"?', this.state.showStopDialog)}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={this.state.requesting}
                        onClick={() =>
                            this.stopStartContainer(this.state.showStopDialog, false, () =>
                                this.setState({ showStopDialog: '' }),
                            )
                        }
                    >
                        {this.state.requesting ? <CircularProgress size={24} /> : <Pause />}
                        {I18n.t('Stop')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ showStopDialog: '' })}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderConfirmRestartDialog(): React.JSX.Element | null {
        if (!this.state.showRestartDialog) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showRestartDialog: '' })}
            >
                <DialogTitle>{I18n.t('Restart container')}</DialogTitle>
                <DialogContent>
                    {I18n.t('Are you sure you want to restart container "%s"?', this.state.showRestartDialog)}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={this.state.requesting}
                        onClick={() => {
                            this.setState({ requesting: true }, async () => {
                                try {
                                    await this.props.socket.sendTo(
                                        `docker-manager.${this.props.instance}`,
                                        'container:restart',
                                        {
                                            id: this.state.showRestartDialog,
                                        },
                                    );
                                    this.setState({ showRestartDialog: '', requesting: false });
                                } catch (e) {
                                    console.error(`Cannot restart container ${this.state.showRestartDialog}: ${e}`);
                                    alert(`Cannot restart image ${this.state.showRestartDialog}: ${e}`);
                                    this.setState({ requesting: false });
                                }
                            });
                        }}
                    >
                        {this.state.requesting ? <CircularProgress size={24} /> : <RefreshIcon />}
                        {I18n.t('Restart')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ showRestartDialog: '' })}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    stopStartContainer(id: string, isStart: boolean, cb?: () => void): void {
        this.setState({ requesting: true }, async () => {
            try {
                await this.props.socket.sendTo(
                    `docker-manager.${this.props.instance}`,
                    `container:${isStart ? 'start' : 'stop'}`,
                    {
                        id,
                    },
                );
                this.setState({ requesting: false }, () => cb?.());
            } catch (e) {
                console.error(`Cannot ${isStart ? 'start' : 'stop'} container ${id}: ${e}`);
                alert(`Cannot ${isStart ? 'start' : 'stop'} container ${id}: ${e}`);
                this.setState({ requesting: false }, () => cb?.());
            }
        });
    }

    render(): React.JSX.Element {
        return (
            <Paper style={{ width: '100%', height: '100%' }}>
                {this.renderAddDialog()}
                {this.renderConfirmDeleteDialog()}
                {this.renderConfirmRecreateDialog()}
                {this.renderConfirmRestartDialog()}
                {this.renderConfirmStopDialog()}
                <div>Explanation about images</div>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>
                                {I18n.t('ID')}
                                <Tooltip
                                    title={I18n.t('Add new container')}
                                    slotProps={{ popper: { sx: { pointerEvents: 'none' } } }}
                                >
                                    <Fab
                                        size="small"
                                        color="primary"
                                        aria-label="add"
                                        style={{ marginLeft: 10 }}
                                        disabled={!this.props.alive}
                                        onClick={() =>
                                            this.setState({
                                                showAddDialog: true,
                                                addImage: {
                                                    image:
                                                        this.props.images && this.props.images.length
                                                            ? `${this.props.images[0].repository}:${this.props.images[0].tag || 'latest'}`
                                                            : '',
                                                    name: '',
                                                },
                                            })
                                        }
                                    >
                                        <AddIcon />
                                    </Fab>
                                </Tooltip>
                            </TableCell>
                            <TableCell>{I18n.t('Name')}</TableCell>
                            <TableCell>{I18n.t('Image')}</TableCell>
                            <TableCell>{I18n.t('Command')}</TableCell>
                            <TableCell>{I18n.t('Created')}</TableCell>
                            <TableCell>{I18n.t('Status')}</TableCell>
                            <TableCell>{I18n.t('Uptime')}</TableCell>
                            <TableCell>{I18n.t('Ports')}</TableCell>
                            <TableCell></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {this.props.containers?.map(container => (
                            <TableRow key={container.id}>
                                <TableCell>{container.image || '--'}</TableCell>
                                <TableCell>{container.names || '--'}</TableCell>
                                <TableCell>{container.image || '--'}</TableCell>
                                <TableCell>{container.command || '--'}</TableCell>
                                <TableCell>
                                    {container.createdAt ? new Date(container.createdAt).toLocaleString() : '--'}
                                </TableCell>
                                <TableCell>{container.status || '--'}</TableCell>
                                <TableCell>{container.uptime || '--'}</TableCell>
                                <TableCell>{container.ports}</TableCell>
                                <TableCell>
                                    <IconButton
                                        size="small"
                                        title={
                                            container.status === 'running' || container.status === 'restarting'
                                                ? I18n.t('Stop container')
                                                : I18n.t('Start container')
                                        }
                                        disabled={!this.props.alive}
                                        onClick={() => {
                                            if (container.status !== 'running' && container.status !== 'restarting') {
                                                this.stopStartContainer(container.id, true);
                                            } else {
                                                this.setState({
                                                    showStopDialog: container.id,
                                                });
                                            }
                                        }}
                                    >
                                        {container.status === 'running' || container.status === 'restarting' ? (
                                            <Pause style={{ color: 'green' }} />
                                        ) : (
                                            <PlayArrow style={{ color: 'orange' }} />
                                        )}
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        title={I18n.t('Restart container')}
                                        disabled={!this.props.alive}
                                        onClick={() =>
                                            this.setState({
                                                showRestartDialog: container.id,
                                            })
                                        }
                                    >
                                        <RefreshIcon />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        title={I18n.t('Recreate container with new image')}
                                        disabled={!this.props.alive}
                                        onClick={() =>
                                            this.setState({
                                                showRecreateDialog: container.id,
                                            })
                                        }
                                    >
                                        <RefreshIcon />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        title={I18n.t('Delete image')}
                                        disabled={!this.props.alive}
                                        onClick={() =>
                                            this.setState({
                                                showDeleteDialog: container.id,
                                            })
                                        }
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Paper>
        );
    }
}
