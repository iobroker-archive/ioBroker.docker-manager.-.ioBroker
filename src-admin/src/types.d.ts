export interface GUIMessage {
    command:
        | 'bridgeStates'
        | 'deviceStates'
        | 'stopped'
        | 'updateStates'
        | 'discoveredDevice'
        | 'reconnect'
        | 'progress'
        | 'processing'
        | 'identifyPopup'
        | 'updateController';
    states?: { [uuid: string]: NodeStateResponse };
    device?: CommissionableDevice;
    processing?: { id: string; inProgress: boolean }[] | null;

    /** Used for identify popup */
    identifyUuid?: string;
    /** Used for identify popup. How long to blink */
    identifySeconds?: number;

    progress?: {
        close?: boolean;
        title?: string;
        text?: string;
        indeterminate?: boolean;
        value?: number;
    };
}