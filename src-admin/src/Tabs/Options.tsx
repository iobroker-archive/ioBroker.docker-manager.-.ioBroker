import React, { Component } from 'react';
import { Paper, TextField, InputLabel, Select, MenuItem, FormControl, Checkbox, FormControlLabel } from '@mui/material';

import { type AdminConnection, I18n, InfoBox } from '@iobroker/adapter-react-v5';

import type { DockerManagerAdapterConfig } from '../types';

interface OptionsTabProps {
    socket: AdminConnection;
    native: DockerManagerAdapterConfig;
    onChange: (attr: string, value: boolean | string) => Promise<void>;
}

export default class OptionsTab extends Component<OptionsTabProps, object> {
    render(): React.JSX.Element {
        return (
            <Paper style={{ width: 'calc(100% - 8px)', height: 'calc(100% - 8px)', padding: 4 }}>
                <InfoBox
                    type="info"
                    closeable
                    storeId="docker-manager.dockerUrl"
                    iconPosition="top"
                >
                    {I18n.t('dockerUrl_explanation')
                        .split('\n')
                        .map((line, i) => (
                            <div key={i.toString()}>{line}</div>
                        ))}
                </InfoBox>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={!!this.props.native.dockerApi}
                                onClick={() => this.props.onChange('dockerApi', !this.props.native.dockerApi)}
                            />
                        }
                        label={I18n.t('Manage docker via API')}
                    />
                    {this.props.native.dockerApi ? (
                        <TextField
                            label={I18n.t('Docker API Host')}
                            fullWidth
                            variant="standard"
                            value={this.props.native.dockerApiHost}
                            onChange={e => this.props.onChange('dockerApiHost', e.target.value)}
                            helperText={I18n.t('Like 192.168.1.10')}
                        />
                    ) : null}
                    {this.props.native.dockerApi ? (
                        <TextField
                            label={I18n.t('Docker API Port')}
                            fullWidth
                            type="number"
                            slotProps={{
                                htmlInput: {
                                    min: 1,
                                    max: 0xffff,
                                },
                            }}
                            variant="standard"
                            value={this.props.native.dockerApiPort}
                            onChange={e => this.props.onChange('dockerApiPort', e.target.value)}
                        />
                    ) : null}
                    {this.props.native.dockerApi ? (
                        <FormControl
                            fullWidth
                            variant="standard"
                        >
                            <InputLabel>{I18n.t('Docker API Protocol')}</InputLabel>
                            <Select
                                variant="standard"
                                value={this.props.native.dockerApiProtocol || 'http'}
                                onChange={e => this.props.onChange('dockerApiProtocol', e.target.value)}
                            >
                                <MenuItem value="http">http</MenuItem>
                                <MenuItem value="https">https</MenuItem>
                            </Select>
                        </FormControl>
                    ) : null}
                </div>
            </Paper>
        );
    }
}
