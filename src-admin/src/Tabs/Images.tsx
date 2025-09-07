import React, { Component } from 'react';
import {
    Fab,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Tooltip,
    Dialog,
    DialogContent,
    DialogActions,
    DialogTitle,
    Button,
    TextField,
    IconButton,
    CircularProgress,
    Snackbar,
} from '@mui/material';

import { type AdminConnection, I18n } from '@iobroker/adapter-react-v5';
import {
    Add as AddIcon,
    Delete as DeleteIcon,
    Refresh as RefreshIcon,
    Warning as AlertIcon,
    Close as CloseIcon,
    Info as InfoIcon,
} from '@mui/icons-material';

import type { ContainerInfo, ImageInfo, DockerImageInspect } from '../types';
import { size2string } from '../Components/utils';

interface ImagesTabProps {
    socket: AdminConnection;
    alive: boolean;
    instance: number;
    images: ImageInfo[] | undefined;
    containers: ContainerInfo[] | undefined;
}

interface ImagesTabState {
    showAddDialog: boolean;
    showDeleteDialog: string;
    addImageName: string;
    addImageTag: string;
    requesting: boolean;
    showHint: string;
    showError: string;
    dockerInspect: DockerImageInspect | null;
}

export default class ImagesTab extends Component<ImagesTabProps, ImagesTabState> {
    constructor(props: ImagesTabProps) {
        super(props);
        this.state = {
            showAddDialog: false,
            showDeleteDialog: '',
            addImageName: '',
            addImageTag: '',
            requesting: false,
            showHint: '',
            showError: '',
            dockerInspect: null,
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
                <DialogTitle>{I18n.t('Pull new image')}</DialogTitle>
                <DialogContent>
                    <TextField
                        variant="standard"
                        value={this.state.addImageName}
                        onChange={e => this.setState({ addImageName: e.target.value })}
                        label={I18n.t('Image name')}
                        fullWidth
                    />
                    <TextField
                        variant="standard"
                        placeholder="latest"
                        value={this.state.addImageTag}
                        onChange={e => this.setState({ addImageTag: e.target.value })}
                        label={I18n.t('Image tag')}
                        fullWidth
                    />
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
                                        'image:pull',
                                        {
                                            image: `${this.state.addImageName}:${this.state.addImageTag}`,
                                        },
                                    );
                                    this.setState({ showAddDialog: false, requesting: false });
                                } catch (e) {
                                    console.error(`Cannot pull image ${this.state.addImageName}: ${e}`);
                                    alert(`Cannot pull image ${this.state.addImageName}: ${e}`);
                                    this.setState({ requesting: false });
                                }
                            });
                        }}
                        startIcon={this.state.requesting ? <CircularProgress size={24} /> : <AddIcon />}
                    >
                        {I18n.t('Pull')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ showAddDialog: false })}
                        startIcon={<CloseIcon />}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderConfirmDialog(): React.JSX.Element | null {
        if (!this.state.showDeleteDialog) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showDeleteDialog: '' })}
            >
                <DialogTitle>{I18n.t('Remove image')}</DialogTitle>
                <DialogContent>
                    {I18n.t('Are you sure you want to delete image "%s"?', this.state.showDeleteDialog)}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={this.state.requesting}
                        onClick={() => {
                            this.setState({ requesting: true }, async () => {
                                try {
                                    const result: { result: { stdout: string; stderr: string } } =
                                        await this.props.socket.sendTo(
                                            `docker-manager.${this.props.instance}`,
                                            'image:remove',
                                            {
                                                image: this.state.showDeleteDialog,
                                            },
                                        );
                                    this.setState({
                                        showDeleteDialog: '',
                                        showHint: result?.result.stdout || '',
                                        showError: result?.result.stderr || '',
                                    });
                                } catch (e) {
                                    console.error(`Cannot delete image ${this.state.showDeleteDialog}: ${e}`);
                                    alert(`Cannot delete image ${this.state.showDeleteDialog}: ${e}`);
                                    this.setState({
                                        requesting: false,
                                        showError: `Cannot delete image ${this.state.showDeleteDialog}: ${e}`,
                                    });
                                }
                            });
                        }}
                        startIcon={this.state.requesting ? <CircularProgress size={24} /> : <DeleteIcon />}
                    >
                        {I18n.t('Delete')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ showDeleteDialog: '' })}
                        startIcon={<CloseIcon />}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderSnackbar(): React.ReactNode {
        let text: React.JSX.Element[] = [];
        if (this.state.showHint) {
            text = this.state.showHint
                .split('\n')
                .filter(line => line.trim())
                .map((line, i) => (
                    <div
                        key={i}
                        style={{ color: line.includes('up to date') ? 'green' : undefined }}
                    >
                        {line}
                    </div>
                ));
        }

        return (
            <Snackbar
                open={!!this.state.showHint}
                autoHideDuration={5000}
                onClose={() => this.setState({ showHint: '' })}
                message={text}
                action={
                    <IconButton
                        size="small"
                        aria-label="close"
                        color="inherit"
                        onClick={() => this.setState({ showHint: '' })}
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                }
            />
        );
    }

    renderErrorDialog(): React.JSX.Element | null {
        if (!this.state.showError) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showError: '' })}
            >
                <DialogTitle>{I18n.t('Error')}</DialogTitle>
                <DialogContent style={{ display: 'flex', gap: 20, flexDirection: 'column' }}>
                    <AlertIcon style={{ color: 'yellow' }} />
                    {this.state.showError}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ showError: '' })}
                        startIcon={<CloseIcon />}
                    >
                        {I18n.t('Close')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderInspect(): React.JSX.Element | null {
        if (!this.state.dockerInspect) {
            return null;
        }

        const info = this.state.dockerInspect;

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ dockerInspect: null })}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>{I18n.t('Image information')}</DialogTitle>
                <DialogContent style={{ display: 'flex', gap: 20, flexDirection: 'column' }}>
                    <pre>{JSON.stringify(info, null, 2)}</pre>
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ dockerInspect: null })}
                        startIcon={<CloseIcon />}
                    >
                        {I18n.t('Close')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    render(): React.JSX.Element {
        return (
            <Paper style={{ width: '100%', height: '100%' }}>
                {this.renderAddDialog()}
                {this.renderConfirmDialog()}
                {this.renderErrorDialog()}
                {this.renderSnackbar()}
                {this.renderInspect()}
                <div>Explanation about images</div>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell style={{ fontWeight: 'bold' }}>
                                <Tooltip
                                    title={I18n.t('Add new image')}
                                    slotProps={{ popper: { sx: { pointerEvents: 'none' } } }}
                                >
                                    <Fab
                                        size="small"
                                        color="primary"
                                        aria-label="add"
                                        style={{ marginRight: 10 }}
                                        disabled={!this.props.alive}
                                        onClick={() =>
                                            this.setState({ showAddDialog: true, addImageName: '', addImageTag: '' })
                                        }
                                    >
                                        <AddIcon />
                                    </Fab>
                                </Tooltip>
                                {I18n.t('Repository')}
                            </TableCell>
                            <TableCell style={{ fontWeight: 'bold' }}>{I18n.t('Tag')}</TableCell>
                            <TableCell style={{ fontWeight: 'bold' }}>{I18n.t('Image ID')}</TableCell>
                            <TableCell style={{ fontWeight: 'bold' }}>{I18n.t('Created')}</TableCell>
                            <TableCell style={{ fontWeight: 'bold' }}>{I18n.t('Size')}</TableCell>
                            <TableCell />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {this.props.images?.map(image => (
                            <TableRow key={image.id}>
                                <TableCell style={{ fontWeight: 'bold', fontSize: '1rem' }}>
                                    {image.repository || '--'}
                                </TableCell>
                                <TableCell style={{ fontStyle: 'italic' }}>{image.tag || '--'}</TableCell>
                                <TableCell>{image.id || '--'}</TableCell>
                                <TableCell>
                                    {image.createdSince
                                        ? new Date(image.createdSince.replace(/ [A-Z]+$/, '')).toLocaleString()
                                        : '--'}
                                </TableCell>
                                <TableCell>{size2string(image.size)}</TableCell>
                                <TableCell>
                                    <IconButton
                                        size="small"
                                        title={I18n.t('Information about image')}
                                        disabled={!this.props.alive}
                                        onClick={async () => {
                                            try {
                                                const result: { result: DockerImageInspect | null } =
                                                    await this.props.socket.sendTo(
                                                        `docker-manager.${this.props.instance}`,
                                                        'image:inspect',
                                                        {
                                                            image: image.id,
                                                        },
                                                    );
                                                this.setState({
                                                    showAddDialog: false,
                                                    dockerInspect: result?.result,
                                                    showError: !result?.result
                                                        ? 'Cannot get information for image'
                                                        : '',
                                                });
                                            } catch (e) {
                                                console.error(`Cannot get information for image ${image.id}: ${e}`);
                                                alert(`Cannot get information for image ${image.id}: ${e}`);
                                            }
                                        }}
                                    >
                                        <InfoIcon />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        title={I18n.t('Pull latest version of image')}
                                        disabled={!this.props.alive || !image.tag || image.tag === '<none>'}
                                        onClick={async () => {
                                            try {
                                                const result: { result: { stdout: string; stderr: string } } =
                                                    await this.props.socket.sendTo(
                                                        `docker-manager.${this.props.instance}`,
                                                        'image:pull',
                                                        {
                                                            image: image.id,
                                                        },
                                                    );
                                                this.setState({
                                                    showAddDialog: false,
                                                    showHint: result?.result.stdout || '',
                                                    showError: result?.result.stderr || '',
                                                });
                                            } catch (e) {
                                                console.error(`Cannot pull image ${this.state.addImageName}: ${e}`);
                                                alert(`Cannot pull image ${this.state.addImageName}: ${e}`);
                                            }
                                        }}
                                    >
                                        <RefreshIcon />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        title={I18n.t('Delete image')}
                                        disabled={
                                            !this.props.alive ||
                                            this.props.containers?.some(
                                                c => c.image === `${image.repository}:${image.tag}`,
                                            )
                                        }
                                        onClick={() =>
                                            this.setState({
                                                showDeleteDialog: image.id,
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
