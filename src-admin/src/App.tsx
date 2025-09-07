import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles';
import React from 'react';

import { AppBar, Tooltip, Tabs, Tab } from '@mui/material';
import { SignalCellularOff as IconNotAlive } from '@mui/icons-material';
import { IconButton as IconButton76 } from '@foxriver76/iob-component-lib';

import {
    AdminConnection,
    GenericApp,
    I18n,
    Loader,
    type GenericAppProps,
    type GenericAppState,
    type IobTheme,
} from '@iobroker/adapter-react-v5';

import enLang from './i18n/en.json';
import deLang from './i18n/de.json';
import ruLang from './i18n/ru.json';
import ptLang from './i18n/pt.json';
import nlLang from './i18n/nl.json';
import frLang from './i18n/fr.json';
import itLang from './i18n/it.json';
import esLang from './i18n/es.json';
import plLang from './i18n/pl.json';
import ukLang from './i18n/uk.json';
import zhCnLang from './i18n/zh-cn.json';
import type { ContainerInfo, DiskUsage, DockerContainerInspect, GUIResponse, ImageInfo } from './types';

const styles: { [styleName: string]: any } = {
    tabContent: {
        padding: 10,
        overflow: 'auto',
        height: 'calc(100% - 64px - 48px - 20px)',
    },
    tabContentNoSave: {
        padding: 10,
        height: 'calc(100% - 48px - 20px)',
        overflow: 'auto',
    },
    selected: (theme: IobTheme): React.CSSProperties => ({
        color: theme.palette.mode === 'dark' ? undefined : '#FFF !important',
    }),
    indicator: (theme: IobTheme): React.CSSProperties => ({
        backgroundColor: theme.palette.mode === 'dark' ? theme.palette.secondary.main : '#FFF',
    }),
};

import InfoTab from './Tabs/Info';
import ImagesTab from './Tabs/Images';
import ContainersTab from './Tabs/Containers';

interface AppState extends GenericAppState {
    selectedTab: 'info' | 'images' | 'containers';
    ready: boolean;
    alive: boolean;
    backendRunning: boolean;
    info?: DiskUsage;
    version?: string;
    error?: string;
    containers?: ContainerInfo[];
    images?: ImageInfo[];
    container: { [id: string]: DockerContainerInspect };
}

export default class App extends GenericApp<GenericAppProps, AppState> {
    private alert: null | ((_message?: string) => void);
    private readonly isTab: boolean =
        window.location.pathname.includes('tab_m.html') || window.location.search.includes('tab=');
    private refreshTimer: ReturnType<typeof setTimeout> | null = null;
    private connectToBackEndInterval: ReturnType<typeof setInterval> | null = null;
    private connectToBackEndCounter = 0;
    private lastRefresh = 0;
    private commandCallbacks: {
        [containerId: string]: (data: { stderr: string; stdout: string; code?: number | null }) => void;
    } = {};

    constructor(props: GenericAppProps) {
        const extendedProps: GenericAppProps = { ...props };
        // @ts-expect-error no idea how to fix it
        extendedProps.Connection = AdminConnection;
        extendedProps.translations = {
            en: enLang,
            de: deLang,
            ru: ruLang,
            pt: ptLang,
            nl: nlLang,
            fr: frLang,
            it: itLang,
            es: esLang,
            pl: plLang,
            uk: ukLang,
            'zh-cn': zhCnLang,
        };

        extendedProps.sentryDSN = window.sentryDSN;
        extendedProps.socket = {
            protocol: 'http:',
            host: '192.168.1.71',
            port: 8081,
        };

        super(props, extendedProps);

        this.state = {
            ...this.state,
            alive: false,
            backendRunning: false,
            container: {},
            selectedTab:
                (window.localStorage.getItem(`${this.adapterName}.${this.instance}.selectedTab`) as
                    | 'info'
                    | 'images'
                    | 'containers') || 'info',
            ready: false,
        };

        this.alert = window.alert;
        window.alert = text => this.showToast(text);
    }

    onSubscribeToBackEndSubmitted = (
        result: {
            error?: string;
            accepted?: boolean;
            heartbeat?: number;
        } | null,
    ): void => {
        // backend is alive, so stop a connection interval
        if (this.connectToBackEndInterval) {
            console.log(`Connected after ${this.connectToBackEndCounter} attempts`);
            this.connectToBackEndCounter = 0;
            clearInterval(this.connectToBackEndInterval);
            this.connectToBackEndInterval = null;
        }

        if (result && typeof result === 'object' && result.accepted === false) {
            console.error('Subscribe is not accepted');
            this.setState({ backendRunning: false });
        } else if (!this.state.backendRunning) {
            this.setState({ backendRunning: true });
        }
    };

    // eslint-disable-next-line class-methods-use-this
    onSubscribeToBackEndFailed = (e: unknown): void => {
        console.warn(`Cannot connect to backend: ${e as Error}`);
    };

    refreshBackendSubscription(afterAlive?: boolean): void {
        if (this.lastRefresh && Date.now() - this.lastRefresh < 1000) {
            return;
        }
        this.lastRefresh = Date.now();

        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = null;
            void this.refreshBackendSubscription();
        }, 60_000);

        if (afterAlive && !this.connectToBackEndInterval) {
            this.connectToBackEndCounter = 0;
            console.log('Start faster connection attempts');
            // try to connect in smaller intervals 20 seconds long
            this.connectToBackEndInterval = setInterval(() => {
                this.connectToBackEndCounter++;
                if (this.connectToBackEndCounter > 6) {
                    console.log('Stopped faster connection attempts. Seems the backend is dead');
                    // back-end is still dead, so reduce attempts
                    if (this.connectToBackEndInterval) {
                        clearInterval(this.connectToBackEndInterval);
                        this.connectToBackEndInterval = null;
                    }
                } else {
                    this.refreshBackendSubscription();
                }
            }, 3_000);
        }

        void this.socket
            .subscribeOnInstance(
                `docker-manager.${this.instance}`,
                this.state.selectedTab || 'info',
                null,
                this.onBackendUpdates,
            )
            .then(this.onSubscribeToBackEndSubmitted)
            .catch(this.onSubscribeToBackEndFailed);
    }

    onExecuteCommand = (
        containerId: string,
        command: string,
        cb: ((data: { stderr: string; stdout: string; code?: number }) => void) | null,
    ): void => {
        if (!cb) {
            if (this.commandCallbacks[containerId]) {
                void this.socket
                    .subscribeOnInstance(
                        `docker-manager.${this.instance}`,
                        'containers',
                        { containerId: containerId, command: '', terminate: true },
                        this.onBackendUpdates,
                    )
                    .then(this.onSubscribeToBackEndSubmitted)
                    .catch(this.onSubscribeToBackEndFailed);
                delete this.commandCallbacks[containerId];
            }
            return;
        }
        this.commandCallbacks[containerId] = cb;
        void this.socket
            .subscribeOnInstance(
                `docker-manager.${this.instance}`,
                'containers',
                { containerId: containerId, command },
                this.onBackendUpdates,
            )
            .then(this.onSubscribeToBackEndSubmitted)
            .catch(this.onSubscribeToBackEndFailed);
    };

    async onConnectionReady(): Promise<void> {
        const alive = await this.socket.getState(`system.adapter.docker-manager.${this.instance}.alive`);

        if (alive?.val) {
            this.refreshBackendSubscription(true);
        }

        this.setState({
            ready: true,
            alive: !!alive?.val,
        });

        this.socket
            .subscribeState(`system.adapter.docker-manager.${this.instance}.alive`, this.onAlive)
            .catch(e =>
                this.showError(`Cannot subscribe on system.adapter.docker-manager.${this.instance}.alive: ${e}`),
            );
    }

    onAlive = (_id: string, state: ioBroker.State | null | undefined): void => {
        if (state?.val && !this.state.alive) {
            this.setState({ alive: true });
            this.refreshBackendSubscription(true);
        } else if (!state?.val && this.state.alive) {
            if (this.refreshTimer) {
                clearTimeout(this.refreshTimer);
                this.refreshTimer = null;
            }
            this.setState({ alive: false });
        }
    };

    onBackendUpdates = (update: GUIResponse | null): void => {
        if (!update) {
            return;
        }
        if (update.command === 'exec') {
            if (update.data?.containerId && this.commandCallbacks[update.data.containerId]) {
                this.commandCallbacks[update.data.containerId](update.data);
                if (update.data.code !== undefined) {
                    delete this.commandCallbacks[update.data.containerId];
                }
            }
            return;
        }
        if (update.command === 'info') {
            this.setState({ info: update.data, version: update.version || 'unknown', error: update.error });
        } else if (update.command === 'images') {
            update.data?.sort((a, b) => {
                const aText = a.repository + (a.tag || 'latest');
                const bText = b.repository + (b.tag || 'latest');
                return aText.localeCompare(bText);
            });
            this.setState({ images: update.data || [], error: update.error });
        } else if (update.command === 'containers') {
            update.data?.sort((a, b) => {
                const aText = a.names || a.id;
                const bText = b.names || b.id;
                return aText.localeCompare(bText);
            });
            this.setState({ containers: update.data || [], error: update.error });
        } else if (update.command === 'container' && update.container) {
            const newContainers = { ...this.state.container };
            newContainers[update.container] = update.data as DockerContainerInspect;
            this.setState({ container: newContainers, error: update.error });
        }
    };

    async componentWillUnmount(): Promise<void> {
        window.alert = this.alert as (_message?: any) => void;
        this.alert = null;
        if (this.connectToBackEndInterval) {
            clearInterval(this.connectToBackEndInterval);
            this.connectToBackEndInterval = null;
        }

        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }

        try {
            this.socket.unsubscribeState(`system.adapter.docker-manager.${this.instance}.alive`, this.onAlive);
            await this.socket.unsubscribeFromInstance(`docker-manager.${this.instance}`, 'all', this.onBackendUpdates);
        } catch {
            // ignore
        }

        super.componentWillUnmount();
    }

    renderInfoTab(): React.ReactNode {
        return (
            <InfoTab
                alive={this.state.alive}
                socket={this.socket}
                instance={this.instance}
                info={this.state.info}
                version={this.state.version}
            />
        );
    }

    renderImagesTab(): React.ReactNode {
        return (
            <ImagesTab
                alive={this.state.alive}
                socket={this.socket}
                instance={this.instance}
                images={this.state.images}
                containers={this.state.containers}
            />
        );
    }

    renderContainersTab(): React.ReactNode {
        return (
            <ContainersTab
                theme={this.state.theme}
                alive={this.state.alive}
                socket={this.socket}
                instance={this.instance}
                images={this.state.images}
                containers={this.state.containers}
                container={this.state.container}
                themeType={this.state.themeType}
                onExecuteCommand={this.onExecuteCommand}
            />
        );
    }

    render(): React.JSX.Element {
        if (!this.state.ready || !this.state.alive) {
            return (
                <StyledEngineProvider injectFirst>
                    <ThemeProvider theme={this.state.theme}>
                        <Loader themeType={this.state.themeType} />
                    </ThemeProvider>
                </StyledEngineProvider>
            );
        }

        return (
            <StyledEngineProvider injectFirst>
                <ThemeProvider theme={this.state.theme}>
                    {this.renderToast()}
                    <div
                        className="App"
                        style={{
                            background: this.state.theme.palette.background.default,
                            color: this.state.theme.palette.text.primary,
                        }}
                    >
                        <AppBar position="static">
                            <Tabs
                                value={this.state.selectedTab || 'info'}
                                onChange={(_e, value) => {
                                    this.setState({ selectedTab: value }, () => this.refreshBackendSubscription());

                                    window.localStorage.setItem(
                                        `${this.adapterName}.${this.instance}.selectedTab`,
                                        value,
                                    );
                                }}
                                scrollButtons="auto"
                                sx={{ '& .MuiTabs-indicator': styles.indicator }}
                            >
                                <Tab
                                    sx={{ '&.Mui-selected': styles.selected }}
                                    label={I18n.t('General')}
                                    value="info"
                                />
                                <Tab
                                    sx={{ '&.Mui-selected': styles.selected }}
                                    label={I18n.t('Images')}
                                    value="images"
                                />
                                <Tab
                                    sx={{ '&.Mui-selected': styles.selected }}
                                    label={I18n.t('Containers')}
                                    value="containers"
                                />
                                <div style={{ flexGrow: 1 }} />
                                {this.state.alive ? null : (
                                    <Tooltip
                                        title={I18n.t('Instance is not alive')}
                                        slotProps={{ popper: { sx: { pointerEvents: 'none' } } }}
                                    >
                                        <IconNotAlive style={{ color: 'orange', padding: 12 }} />
                                    </Tooltip>
                                )}
                                {this.state.backendRunning ? null : (
                                    <Tooltip
                                        title={I18n.t('Reconnect to backend')}
                                        slotProps={{ popper: { sx: { pointerEvents: 'none' } } }}
                                    >
                                        <div
                                            style={{
                                                width: 48,
                                                height: 48,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            <IconButton76
                                                iconColor="warning"
                                                noBackground
                                                icon="noConnection"
                                                onClick={() => this.refreshBackendSubscription()}
                                            />
                                        </div>
                                    </Tooltip>
                                )}
                            </Tabs>
                        </AppBar>

                        <div style={styles.tabContentNoSave}>
                            {(!this.state.selectedTab || this.state.selectedTab === 'info') && this.renderInfoTab()}
                            {this.state.selectedTab === 'images' && this.renderImagesTab()}
                            {this.state.selectedTab === 'containers' && this.renderContainersTab()}
                        </div>
                        {this.renderError()}
                        {this.state.selectedTab === 'containers' ? this.renderSaveCloseButtons() : null}
                    </div>
                </ThemeProvider>
            </StyledEngineProvider>
        );
    }
}
