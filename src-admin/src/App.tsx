import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles';
import React from 'react';

import { AppBar } from '@mui/material';

import {
    AdminConnection,
    GenericApp,
    Loader,
    type GenericAppProps,
    type GenericAppState,
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
import type { GUIMessage } from './types';

const styles: { [styleName: string]: React.CSSProperties } = {
    tabContent: {
        padding: 10,
        overflow: 'auto',
        height: 'calc(100% - 64px - 48px - 20px)',
    },
};

interface AppState extends GenericAppState {
    ready: boolean;
    alive: boolean;
    backendRunning: boolean;
}

export default class App extends GenericApp<GenericAppProps, AppState> {
    private alert: null | ((_message?: string) => void);
    private readonly isTab: boolean =
        window.location.pathname.includes('tab_m.html') || window.location.search.includes('tab=');
    private refreshTimer: ReturnType<typeof setTimeout> | null = null;
    private connectToBackEndInterval: ReturnType<typeof setInterval> | null = null;
    private connectToBackEndCounter = 0;

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
        // extendedProps.socket = {
        //     protocol: 'http:',
        //     host: '192.168.178.45',
        //     port: 8081,
        // };

        super(props, extendedProps);

        this.state = {
            ...this.state,
            alive: false,
            backendRunning: false,
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
            .subscribeOnInstance(`matter.${this.instance}`, 'gui', null, this.onBackendUpdates)
            .then(this.onSubscribeToBackEndSubmitted)
            .catch(this.onSubscribeToBackEndFailed);
    }

    async onConnectionReady(): Promise<void> {
        this.socket
            .subscribeState(`system.adapter.matter.${this.instance}.alive`, this.onAlive)
            .catch(e => this.showError(`Cannot subscribe on system.adapter.matter.${this.instance}.alive: ${e}`));

        const alive = await this.socket.getState(`system.adapter.matter.${this.instance}.alive`);

        if (alive?.val) {
            this.refreshBackendSubscription(true);
        }

        this.setState({
            ready: true,
            alive: !!alive?.val,
        });
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

    onBackendUpdates = (update: GUIMessage | null): void => {
        if (!update) {
            return;
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
            await this.socket.unsubscribeFromInstance(`docker-manager.${this.instance}`, 'gui', this.onBackendUpdates);
        } catch {
            // ignore
        }

        super.componentWillUnmount();
    }

    render(): React.JSX.Element {
        if (!this.state.ready) {
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
                        <AppBar position="static"></AppBar>

                        <div
                            style={this.state.selectedTab === 'options' ? styles.tabContent : styles.tabContentNoSave}
                        ></div>
                        {this.renderError()}
                        {this.state.selectedTab === 'options' ? this.renderSaveCloseButtons() : null}
                    </div>
                </ThemeProvider>
            </StyledEngineProvider>
        );
    }
}
