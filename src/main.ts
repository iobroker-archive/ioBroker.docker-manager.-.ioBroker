import { type AdapterOptions, Adapter } from '@iobroker/adapter-core';

export class DockerManagerAdapter extends Adapter {
    #_guiSubscribes: { clientId: string; ts: number }[] | null = null;

    public constructor(options: Partial<AdapterOptions> = {}) {
        super({
            ...options,
            name: 'docker-manager',
            uiClientSubscribe: data => this.onClientSubscribe(data.clientId),
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

    onClientSubscribe(clientId: string): { error?: string; accepted: boolean; heartbeat?: number } {
        this.log.debug(`Subscribe from ${clientId}`);
        if (!this.#_guiSubscribes) {
            return { error: `Adapter is still initializing`, accepted: false };
        }
        // start camera with obj.message.data
        if (!this.#_guiSubscribes.find(s => s.clientId === clientId)) {
            this.log.debug(`Start GUI`);
            // send state of devices
        }

        // inform GUI that subscription is started
        const sub = this.#_guiSubscribes.find(s => s.clientId === clientId);
        if (!sub) {
            this.#_guiSubscribes.push({ clientId, ts: Date.now() });
        } else {
            sub.ts = Date.now();
        }

        return { accepted: true, heartbeat: 120000 };
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
            if (pos !== -1) {
                deleted = true;
                this.#_guiSubscribes.splice(pos, 1);
            }
        } while (deleted);
    }

    sendToGui = async (data: any): Promise<void> => {
        if (!this.#_guiSubscribes) {
            return;
        }
        if (this.sendToUI) {
            this.log.debug(`Send to GUI: ${JSON.stringify(data)}`);

            for (let i = 0; i < this.#_guiSubscribes.length; i++) {
                await this.sendToUI({ clientId: this.#_guiSubscribes[i].clientId, data });
            }
        }
    };

    #onReady(): void {
        this.log.info(`Adapter matter-controller started`);
    }

    async #onUnload(callback: () => void): Promise<void> {
        try {
            // inform GUI about stop
            await this.sendToGui({ command: 'stopped' });
        } catch {
            // ignore
        }

        callback();
    }

    #onMessage(obj: ioBroker.Message): void {
        if (obj.command?.startsWith('dm:')) {
            // Handled by Device Manager class itself, so ignored here
            return;
        }

        this.log.debug(`Handle message ${obj.command} ${obj.command !== 'getLicense' ? JSON.stringify(obj) : ''}`);
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<AdapterOptions> | undefined) => new DockerManagerAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new DockerManagerAdapter())();
}
