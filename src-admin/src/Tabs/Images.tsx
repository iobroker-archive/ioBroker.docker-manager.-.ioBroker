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
} from '@mui/material';

import { type AdminConnection, I18n } from '@iobroker/adapter-react-v5';
import { Add as AddIcon, Delete as DeleteIcon, Refresh as RefreshIcon } from '@mui/icons-material';

import type { ContainerInfo, ImageInfo } from '../types';
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
                                            image: `${this.state.addImageName}:${this.state.addImageTag || 'latest'}`,
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
                    >
                        {this.state.requesting ? <CircularProgress size={24} /> : <AddIcon />}
                        {I18n.t('Pull')}
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

    renderConfirmDialog(): React.JSX.Element | null {
        if (!this.state.showDeleteDialog) {
            return null;
        }

        const image = this.props.images?.find(
            img => `${img.repository}:${img.tag || 'latest'}` === this.state.showDeleteDialog,
        );
        if (!image) {
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
                                    await this.props.socket.sendTo(
                                        `docker-manager.${this.props.instance}`,
                                        'image:remove',
                                        {
                                            image: `${image.repository}:${image.tag || 'latest'}`,
                                        },
                                    );
                                    this.setState({ showDeleteDialog: '', requesting: false });
                                } catch (e) {
                                    console.error(`Cannot pull image ${this.state.addImageName}: ${e}`);
                                    alert(`Cannot pull image ${this.state.addImageName}: ${e}`);
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

    render(): React.JSX.Element {
        return (
            <Paper style={{ width: '100%', height: '100%' }}>
                {this.renderAddDialog()}
                {this.renderConfirmDialog()}
                <div>Explanation about images</div>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>
                                {I18n.t('Repository')}
                                <Tooltip
                                    title={I18n.t('Add new image')}
                                    slotProps={{ popper: { sx: { pointerEvents: 'none' } } }}
                                >
                                    <Fab
                                        size="small"
                                        color="primary"
                                        aria-label="add"
                                        style={{ marginLeft: 10 }}
                                        disabled={!this.props.alive}
                                        onClick={() =>
                                            this.setState({ showAddDialog: true, addImageName: '', addImageTag: '' })
                                        }
                                    >
                                        <AddIcon />
                                    </Fab>
                                </Tooltip>
                            </TableCell>
                            <TableCell>{I18n.t('Tag')}</TableCell>
                            <TableCell>{I18n.t('Image ID')}</TableCell>
                            <TableCell>{I18n.t('Created')}</TableCell>
                            <TableCell>{I18n.t('Size')}</TableCell>
                            <TableCell></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {this.props.images?.map(image => (
                            <TableRow key={image.id}>
                                <TableCell>{image.repository || '--'}</TableCell>
                                <TableCell>{image.tag || '--'}</TableCell>
                                <TableCell>{image.id || '--'}</TableCell>
                                <TableCell>
                                    {image.createdSince ? new Date(image.createdSince).toLocaleString() : '--'}
                                </TableCell>
                                <TableCell>{size2string(image.size)}</TableCell>
                                <TableCell>
                                    <IconButton
                                        size="small"
                                        title={I18n.t('Pull latest version of image')}
                                        disabled={!this.props.alive}
                                        onClick={async () => {
                                            try {
                                                await this.props.socket.sendTo(
                                                    `docker-manager.${this.props.instance}`,
                                                    'image:pull',
                                                    {
                                                        image: `${image.repository}:${image.tag || 'latest'}`,
                                                    },
                                                );
                                                this.setState({ showAddDialog: false });
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
                                                c => c.image === `${image.repository}:${image.tag || 'latest'}`,
                                            )
                                        }
                                        onClick={() =>
                                            this.setState({
                                                showDeleteDialog: `${image.repository}:${image.tag || 'latest'}`,
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
