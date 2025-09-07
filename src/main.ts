import { type AdapterOptions, Adapter } from '@iobroker/adapter-core';
import type { DockerManagerAdapterConfig, GUIResponse } from './types';

import DockerCommands from './lib/DockerCommands';

export class DockerManagerAdapter extends Adapter {
    declare config: DockerManagerAdapterConfig;

    #dockerCommands: DockerCommands | undefined;

    #_guiSubscribes:
        | { clientId: string; ts: number; type: 'info' | 'images' | 'containers' | 'container'; container?: string }[]
        | null = null;

    public constructor(options: Partial<AdapterOptions> = {}) {
        super({
            ...options,
            name: 'docker-manager',
            uiClientSubscribe: data => this.onClientSubscribe(data.clientId, data.message),
            uiClientUnsubscribe: data => {
                const { clientId, reason } = data;
                if (reason === 'client') {
                    this.log.debug(`GUI Client "${clientId} disconnected`);
                } else {
                    this.log.debug(`Client "${clientId}: ${reason}`);
                }
                this.onClientUnsubscribe(clientId);
            },
        });
        this.on('ready', () => this.#onReady());
        this.on('unload', callback => this.#onUnload(callback));
        this.on('message', this.#onMessage.bind(this));
    }

    scanRequests(): void {
        const scans: {
            images: number;
            containers: number;
            info: number;
            container: string[];
        } = {
            images: 0,
            containers: 0,
            info: 0,
            container: [],
        };

        this.#_guiSubscribes?.forEach(it => {
            if (it.type === 'images') {
                scans.images++;
            } else if (it.type === 'containers') {
                scans.containers++;
            } else if (it.type === 'container') {
                scans.container.push(it.container!);
            } else if (it.type === 'info') {
                scans.info++;
            }
        });

        this.#dockerCommands?.pollingUpdate(scans);
    }

    onClientSubscribe(
        clientId: string,
        message: ioBroker.Message,
    ): { error?: string; accepted: boolean; heartbeat?: number } {
        this.log.debug(`Subscribe from ${clientId}: ${JSON.stringify(message)}`);
        if (!this.#_guiSubscribes) {
            return { error: `Adapter is still initializing`, accepted: false };
        }

        // inform GUI that subscription is started
        const sub = this.#_guiSubscribes.find(s => s.clientId === clientId);
        if (!sub) {
            this.#_guiSubscribes.push({
                clientId,
                ts: Date.now(),
                type: message.message.type as 'info' | 'images' | 'containers' | 'container',
                container: message.message.container,
            });
            this.scanRequests();
        } else {
            sub.ts = Date.now();
            if (
                sub.type !== (message.message.type as 'info' | 'images' | 'containers' | 'container') ||
                sub.container !== message.message.container
            ) {
                sub.type = message.message.type as 'info' | 'images' | 'containers' | 'container';
                this.scanRequests();
            }
        }

        if (message.message.type === 'containers' && message.message.data?.containerId) {
            if (message.message.data.terminate) {
                // terminate execution
                void this.#dockerCommands?.containerExecTerminate(
                    message.message.data.containerId,
                    message.message.data.command,
                );
            } else {
                // start execution
                void this.#dockerCommands?.containerExec(
                    message.message.data.containerId,
                    message.message.data.command,
                    clientId,
                );
            }
        }

        return { accepted: true };
    }

    onClientUnsubscribe(clientId: string): void {
        this.log.debug(`Unsubscribe from ${clientId}`);
        if (!this.#_guiSubscribes) {
            return;
        }
        let deleted;
        do {
            deleted = false;
            const pos = this.#_guiSubscribes.findIndex(s => s.clientId === clientId);
            void this.#dockerCommands?.containerExecTerminate(clientId, false, true);
            if (pos !== -1) {
                deleted = true;
                this.#_guiSubscribes.splice(pos, 1);
            }
        } while (deleted);
        this.scanRequests();
    }

    sendToGui = async (data: GUIResponse, sid?: string): Promise<void> => {
        if (!this.#_guiSubscribes) {
            return;
        }
        if (this.sendToUI) {
            this.log.debug(`Send to GUI: ${JSON.stringify(data)}`);
            if (sid) {
                await this.sendToUI({ clientId: sid, data });
                return;
            }

            // send to all subscribers of this type
            for (let i = 0; i < this.#_guiSubscribes.length; i++) {
                if (
                    data.command === 'container' &&
                    data.command === this.#_guiSubscribes[i].type &&
                    data.container === this.#_guiSubscribes[i].container
                ) {
                    await this.sendToUI({ clientId: this.#_guiSubscribes[i].clientId, data });
                } else if (data.command === this.#_guiSubscribes[i].type && data.command !== 'container') {
                    await this.sendToUI({ clientId: this.#_guiSubscribes[i].clientId, data });
                }
            }
        }
    };

    async #onReady(): Promise<void> {
        this.log.info(`Adapter matter-controller started`);
        this.#dockerCommands = new DockerCommands(this);
        await this.#dockerCommands.init();
        this.#_guiSubscribes = [];
        this.scanRequests();
    }

    async #onUnload(callback: () => void): Promise<void> {
        try {
            this.#dockerCommands?.destroy();
            this.#dockerCommands = undefined;
            // inform GUI about stop
            await this.sendToGui({ command: 'stopped' });
        } catch {
            // ignore
        }

        callback();
    }

    async #onMessage(obj: ioBroker.Message): Promise<void> {
        if (obj.command?.startsWith('dm:')) {
            // Handled by Device Manager class itself, so ignored here
            return;
        }
        this.log.debug(`Handle message ${obj.command} ${JSON.stringify(obj)}`);

        switch (obj.command) {
            case 'image:pull': {
                const result = await this.#dockerCommands?.imagePull(obj.message.image);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'image:inspect': {
                const result = await this.#dockerCommands?.imageInspect(obj.message.image);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'image:remove': {
                const result = await this.#dockerCommands?.imageRemove(obj.message.image);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'image:list': {
                const result = await this.#dockerCommands?.imageList();
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'container:run': {
                const result = await this.#dockerCommands?.containerRun(obj.message.image, obj.message);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'container:create': {
                const result = await this.#dockerCommands?.containerCreate(obj.message.image, obj.message);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }

            case 'container:stop': {
                const result = await this.#dockerCommands?.containerStop(obj.message.id);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'container:inspect': {
                const result = await this.#dockerCommands?.containerInspect(obj.message.id);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'container:start': {
                const result = await this.#dockerCommands?.containerStart(obj.message.id);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'container:restart': {
                const result = await this.#dockerCommands?.containerRestart(obj.message.id);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'container:remove': {
                const result = await this.#dockerCommands?.containerRemove(obj.message.id);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'container:logs': {
                const result = await this.#dockerCommands?.containerLogs(obj.message.id);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            default:
                this.log.warn(`Unknown command: ${obj.command}`);
                break;
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<AdapterOptions> | undefined) => new DockerManagerAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new DockerManagerAdapter())();
}
