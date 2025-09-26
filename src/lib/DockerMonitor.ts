// This class implements docker commands using CLI and
// it monitors periodically the docker daemon status.
// It manages containers defined in adapter.config.containers and monitors other containers

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { lookup } from 'node:dns/promises';
import http from 'node:http';

import {
    type ContainerConfig,
    type ContainerInfo,
    type ImageInfo,
    type NetworkDriver,
    type NetworkInfo,
    type VolumeDriver,
    type VolumeInfo,
    DockerManager,
} from '@iobroker/plugin-docker';
import { inRange, isIP, isV6 } from 'range_check';
import type { DockerManagerAdapter } from '../main';

export type ImageName = string;
export type ContainerName = string;

function isHttpResponse(url: string, timeout: number = 1000): Promise<boolean | 'timeout'> {
    return new Promise(resolve => {
        try {
            const req = http.request(url, { method: 'HEAD', timeout }, res => {
                resolve(typeof res.statusCode === 'number');
                req.destroy();
            });
            req.on('error', error => {
                if (
                    error.toString().toUpperCase().includes('TIMEDOUT') ||
                    error.toString().toUpperCase().includes('TIMEOUT')
                ) {
                    resolve('timeout');
                } else {
                    resolve(false);
                }
            });
            req.end();
        } catch {
            resolve(false);
        }
    });
}

function findOwnIpFor(ipToAccess: string): string | null {
    if (!isIP(ipToAccess)) {
        return null;
    }
    const interfaces = networkInterfaces();
    for (const iface of Object.values(interfaces)) {
        if (iface) {
            for (const alias of iface) {
                if (alias.family === 'IPv4' && !alias.internal && alias.cidr) {
                    if (inRange(ipToAccess, alias.cidr)) {
                        return alias.address;
                    }
                }
            }
        }
    }
    return null;
}

async function getIpForDomain(domain: string): Promise<string | false> {
    try {
        const result = await lookup(domain);
        return result.address;
    } catch {
        return false;
    }
}

export default class DockerMonitor extends DockerManager {
    readonly #timers: {
        images?: ReturnType<typeof setInterval>;
        containers?: ReturnType<typeof setInterval>;
        info?: ReturnType<typeof setInterval>;
        networks?: ReturnType<typeof setInterval>;
        volumes?: ReturnType<typeof setInterval>;
        container: { [key: string]: ReturnType<typeof setInterval> };
    } = {
        container: {},
    };
    readonly #runningCommands: {
        [sid: string]: {
            p: ChildProcessWithoutNullStreams;
            killTimeout: NodeJS.Timeout | null;
            onUnsubscribe?: boolean;
        };
    } = {};
    readonly checkedURLs: { [url: string]: boolean | 'timeout' } = {};
    // Browser IPs or domain names
    #ownIps: string[] = [];
    #domain2ip: { [domain: string]: string | false } = { localhost: '127.0.0.1' };
    #adapter: DockerManagerAdapter;

    constructor(
        adapter: DockerManagerAdapter,
        options?: {
            host?: string;
            port?: number | string;
            protocol?: 'http' | 'https';
            ca?: string;
            cert?: string;
            key?: string;
        },
    ) {
        if (options?.host === 'localhost') {
            options.host = '127.0.0.1';
        }
        super({
            dockerApi: options,
            logger: {
                silly: (text: string) => adapter.log.silly(text),
                debug: (text: string) => adapter.log.debug(text),
                info: (text: string) => adapter.log.info(text),
                warn: (text: string) => adapter.log.warn(text),
                error: (text: string) => adapter.log.error(text),
                level: adapter.log.level,
            },
            namespace: adapter.namespace,
        });
        this.#adapter = adapter;
    }

    async imagePull(image: ImageName): Promise<{ stdout: string; stderr: string; images?: ImageInfo[] }> {
        const result = await super.imagePull(image);
        if (result.images) {
            await this.#adapter.sendToGui({
                command: 'images',
                data: result.images,
            });
        }
        return result;
    }

    async containerRun(config: ContainerConfig): Promise<{ stdout: string; stderr: string }> {
        try {
            const result = await super.containerRun(config);
            const containers = await this.containerList();
            await this.#adapter.sendToGui({
                command: 'containers',
                data: containers,
            });
            return result;
        } catch (e) {
            return { stdout: '', stderr: e.message.toString() };
        }
    }

    async containerCreate(config: ContainerConfig): Promise<{ stdout: string; stderr: string }> {
        try {
            const result = await super.containerCreate(config);
            const containers = await this.containerList();
            await this.#adapter.sendToGui({
                command: 'containers',
                data: containers,
            });
            return result;
        } catch (e) {
            return { stdout: '', stderr: e.message.toString() };
        }
    }

    async imageBuild(dockerfilePath: string, tag: string): Promise<{ stdout: string; stderr: string }> {
        try {
            const result = await super.imageBuild(dockerfilePath, tag);
            const images = await this.imageList();
            await this.#adapter.sendToGui({
                command: 'images',
                data: images,
            });
            return result;
        } catch (e) {
            return { stdout: '', stderr: e.message.toString() };
        }
    }

    async imageTag(imageId: ImageName, newTag: string): Promise<{ stdout: string; stderr: string }> {
        try {
            const result = await super.imageTag(imageId, newTag);
            const images = await this.imageList();
            await this.#adapter.sendToGui({
                command: 'images',
                data: images,
            });
            return result;
        } catch (e) {
            return { stdout: '', stderr: e.message.toString() };
        }
    }

    async imageRemove(imageId: ImageName): Promise<{ stdout: string; stderr: string; images?: ImageInfo[] }> {
        try {
            const result = await super.imageRemove(imageId);
            if (result.images) {
                await this.#adapter.sendToGui({
                    command: 'images',
                    data: result.images,
                });
            }
            return result;
        } catch (e) {
            return { stdout: '', stderr: e.message.toString(), images: [] };
        }
    }

    async imagePrune(): Promise<{ stdout: string; stderr: string; images?: ImageInfo[] }> {
        try {
            const result = await super.imagePrune();
            const images = await this.imageList();
            if (images) {
                await this.#adapter.sendToGui({
                    command: 'images',
                    data: images,
                });
            }
            return { ...result, images };
        } catch (e) {
            return { stdout: '', stderr: e.message.toString() };
        }
    }

    async containerStop(
        container: ContainerName,
    ): Promise<{ stdout: string; stderr: string; containers?: ContainerInfo[] }> {
        try {
            const result = await super.containerStop(container);
            await this.#adapter.sendToGui({
                command: 'containers',
                data: result.containers,
            });
            return result;
        } catch (e) {
            return { stdout: '', stderr: e.message.toString() };
        }
    }

    async containerStart(
        container: ContainerName,
    ): Promise<{ stdout: string; stderr: string; containers?: ContainerInfo[] }> {
        try {
            const result = await super.containerStart(container);
            if (result.containers) {
                await this.#adapter.sendToGui({
                    command: 'containers',
                    data: result.containers,
                });
            }
            return result;
        } catch (e) {
            return { stdout: '', stderr: e.message.toString(), containers: [] };
        }
    }

    async containerRestart(
        container: ContainerName,
        timeoutSeconds?: number,
    ): Promise<{ stdout: string; stderr: string }> {
        try {
            const result = super.containerRestart(container, timeoutSeconds);
            const containers = await this.containerList();
            await this.#adapter.sendToGui({
                command: 'containers',
                data: containers,
            });
            return result;
        } catch (e) {
            return { stdout: '', stderr: e.message.toString() };
        }
    }

    async containerRemove(
        container: ContainerName,
    ): Promise<{ stdout: string; stderr: string; containers?: ContainerInfo[] }> {
        try {
            const result = await super.containerRemove(container);
            if (result.containers) {
                await this.#adapter.sendToGui({
                    command: 'containers',
                    data: result.containers,
                });
            }
            return result;
        } catch (e) {
            return { stdout: '', stderr: e.message.toString() };
        }
    }

    async containerPrune(): Promise<{ stdout: string; stderr: string; containers?: ContainerInfo[] }> {
        try {
            const result = await super.containerPrune();
            const containers = await this.containerList();
            if (containers) {
                await this.#adapter.sendToGui({
                    command: 'containers',
                    data: containers,
                });
            }
            return { ...result, containers };
        } catch (e) {
            return { stdout: '', stderr: e.message.toString() };
        }
    }

    async containerList(all: boolean = true, browserIPs?: string[]): Promise<ContainerInfo[]> {
        try {
            const containers = await super.containerList(all);
            if (browserIPs) {
                // Try to define if the provided ports are HTTP server
                for (const container of containers) {
                    if (!container.ports || container.status !== 'running') {
                        continue;
                    }
                    const ports: string[] = container.ports?.split(',').map(p => p.trim()) || [];
                    // We have something like '127.0.0.1:8086->8086/tcp'
                    for (const port of ports) {
                        const parts = port.split('->');
                        if (parts.length === 2) {
                            const [hostIp, hostPort] = parts[0].split(':');
                            const [, protocol] = parts[1].split('/');
                            if (protocol === 'tcp') {
                                let url = `http://${isV6(hostIp) ? `[${hostIp}]` : hostIp}:${hostPort}`;
                                if (
                                    this.dockerApi &&
                                    (hostIp === 'localhost' || hostIp === '127.0.0.1') &&
                                    hostIp !== this.dockerApi.host
                                ) {
                                    this.checkedURLs[url] = false;
                                    continue; // skip checking localhost ports if docker API is used
                                }
                                if (this.dockerApi?.host && !isIP(this.dockerApi.host)) {
                                    this.#domain2ip[this.dockerApi.host] ||= await getIpForDomain(this.dockerApi.host);
                                }

                                if (hostIp === '::' || hostIp === '0.0.0.0') {
                                    // find the network interface IP that suits to hostIp
                                    for (const ownIp of browserIPs) {
                                        if (this.dockerApi?.host) {
                                            const realIp = this.#domain2ip[this.dockerApi.host] || this.dockerApi.host;
                                            url = url
                                                .replace('0.0.0.0', isV6(realIp) ? `[${realIp}]` : realIp)
                                                .replace('[::]', isV6(realIp) ? `[${realIp}]` : realIp);
                                        } else {
                                            const realIp = this.#domain2ip[ownIp] || ownIp;
                                            if (isIP(realIp)) {
                                                const hostIp = findOwnIpFor(this.#domain2ip[ownIp] || ownIp);
                                                if (hostIp) {
                                                    url = url
                                                        .replace('0.0.0.0', isV6(ownIp) ? `[${ownIp}]` : ownIp)
                                                        .replace('[::]', isV6(ownIp) ? `[${ownIp}]` : ownIp);
                                                }
                                            }
                                        }
                                        // request to the port and check if we get HTTP response
                                        // create url
                                        if (
                                            !url.includes('0.0.0.0') &&
                                            !url.includes('[::]') &&
                                            (this.checkedURLs[url] === undefined || this.checkedURLs[url] === 'timeout')
                                        ) {
                                            this.checkedURLs[url] = await isHttpResponse(url);
                                        }
                                        if (this.checkedURLs[url] === true) {
                                            container.httpLinks ||= {};
                                            container.httpLinks[ownIp] ||= [];
                                            if (!container.httpLinks[ownIp].includes(url)) {
                                                container.httpLinks[ownIp].push(url);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            return containers;
        } catch (e) {
            this.log.debug(`Cannot list containers: ${e.message}`);
            return [];
        }
    }

    containerExecTerminate(sid: string, force?: boolean, onUnsubscribe?: boolean): boolean {
        if (this.#runningCommands[sid]) {
            this.#runningCommands[sid].onUnsubscribe = onUnsubscribe;
            if (force) {
                this.#runningCommands[sid].p.kill('SIGKILL');
            } else {
                this.#runningCommands[sid].p.kill('SIGTERM');
                this.#runningCommands[sid].killTimeout ||= setTimeout(() => {
                    if (this.#runningCommands[sid]) {
                        this.#runningCommands[sid].killTimeout = null;
                        this.#runningCommands[sid].p.kill('SIGKILL');
                    }
                }, 2000);
            }
            return true;
        }
        return false;
    }

    containerExec(container: ContainerName, command: string, sid: string): void {
        const hasTTY = process.stdin.isTTY && process.stdout.isTTY;
        const args: string[] = ['exec'];
        if (!command) {
            this.log.error('No command specified for exec');
            return;
        }

        if (hasTTY) {
            args.push('-t');
        } // add TTY only when available

        args.push(container);
        command.split(' ').forEach(part => args.push(part));
        let p: ChildProcessWithoutNullStreams;
        try {
            if (this.needSudo) {
                this.log.debug(`Executing: sudo docker ${args.join(' ')}`);
                p = spawn('sudo', ['docker', ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
            } else {
                this.log.debug(`Executing: docker ${args.join(' ')}`);
                p = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
            }
        } catch (e) {
            void this.#adapter.sendToGui(
                {
                    command: 'exec',
                    data: { stdout: '', stderr: e.message.toString(), containerId: container, code: 1 },
                },
                sid,
            );
            return;
        }

        this.#runningCommands[sid] = { p, killTimeout: null };

        let stdout = '';
        let stderr = '';
        p.stdout.on('data', d => {
            if (this.#runningCommands[sid] && !this.#runningCommands[sid].onUnsubscribe) {
                stdout += d;
                void this.#adapter.sendToGui(
                    { command: 'exec', data: { stdout, stderr, containerId: container } },
                    sid,
                );
            }
        });
        p.stderr.on('data', d => {
            if (this.#runningCommands[sid] && !this.#runningCommands[sid].onUnsubscribe) {
                stderr += d;
                void this.#adapter.sendToGui(
                    { command: 'exec', data: { stdout, stderr, containerId: container } },
                    sid,
                );
            }
        });

        p.on('close', code => {
            this.log.debug(`Command finished with code ${code}`);
            const killTimeout = this.#runningCommands[sid]?.killTimeout;
            if (killTimeout) {
                clearTimeout(killTimeout);
            }
            if (this.#runningCommands[sid] && !this.#runningCommands[sid].onUnsubscribe) {
                void this.#adapter.sendToGui(
                    { command: 'exec', data: { stdout, stderr, containerId: container, code } },
                    sid,
                );
            }
            delete this.#runningCommands[sid];
        });
    }

    async networkCreate(
        networkName: string,
        driver?: NetworkDriver,
    ): Promise<{ stdout: string; stderr: string; networks?: NetworkInfo[] }> {
        try {
            const result = await super.networkCreate(networkName, driver);
            if (result.networks) {
                await this.#adapter.sendToGui({
                    command: 'networks',
                    data: result.networks,
                });
            }
            return result;
        } catch (e) {
            return { stdout: '', stderr: e.message.toString() };
        }
    }

    async networkRemove(networkId: string): Promise<{ stdout: string; stderr: string; networks?: NetworkInfo[] }> {
        try {
            const result = await super.networkRemove(networkId);
            if (result.networks) {
                await this.#adapter.sendToGui({
                    command: 'networks',
                    data: result.networks,
                });
            }
            return result;
        } catch (e) {
            return { stdout: '', stderr: e.message.toString() };
        }
    }

    async networkPrune(): Promise<{ stdout: string; stderr: string; networks?: NetworkInfo[] }> {
        try {
            const result = await super.networkPrune();
            const networks = await this.networkList();
            if (networks) {
                await this.#adapter.sendToGui({
                    command: 'networks',
                    data: networks,
                });
            }
            return { ...result, networks };
        } catch (e) {
            return { stdout: '', stderr: e.message.toString() };
        }
    }

    async volumeCreate(
        volumeName: string,
        driver?: VolumeDriver,
        volume?: string,
    ): Promise<{ stdout: string; stderr: string; volumes?: VolumeInfo[] }> {
        try {
            const result = await super.volumeCreate(volumeName, driver, volume);
            if (result.volumes) {
                await this.#adapter.sendToGui({
                    command: 'volumes',
                    data: result.volumes,
                });
            }
            return result;
        } catch (e) {
            return { stdout: '', stderr: e.message.toString() };
        }
    }

    async volumeRemove(volumeName: string): Promise<{ stdout: string; stderr: string; volumes?: VolumeInfo[] }> {
        try {
            const result = await super.volumeRemove(volumeName);
            if (result.volumes) {
                await this.#adapter.sendToGui({
                    command: 'volumes',
                    data: result.volumes,
                });
            }
            return result;
        } catch (e) {
            return { stdout: '', stderr: e.message.toString() };
        }
    }

    async volumePrune(): Promise<{ stdout: string; stderr: string; volumes?: VolumeInfo[] }> {
        try {
            const result = await super.volumePrune();
            const volumes = await this.volumeList();
            if (volumes) {
                await this.#adapter.sendToGui({
                    command: 'volumes',
                    data: volumes,
                });
            }
            return { ...result, volumes };
        } catch (e) {
            return { stdout: '', stderr: e.message.toString() };
        }
    }

    async #pollingInfo(): Promise<void> {
        await this.isReady();
        if (!this.installed) {
            await this.#adapter.sendToGui({
                command: 'info',
                error: 'not installed',
            });
            return;
        }
        const data = await this.discUsage();
        await this.#adapter.sendToGui({
            command: 'info',
            data,
            version: this.dockerVersion,
        });
    }

    async #pollingImages(): Promise<void> {
        await this.isReady();
        if (!this.installed) {
            await this.#adapter.sendToGui({
                command: 'info',
                error: 'not installed',
            });
            return;
        }
        const data = await this.imageList();
        await this.#adapter.sendToGui({
            command: 'images',
            data,
        });
    }

    async #pollingNetworks(): Promise<void> {
        await this.isReady();
        if (!this.installed) {
            await this.#adapter.sendToGui({
                command: 'networks',
                error: 'not installed',
            });
            return;
        }
        const data = await this.networkList();
        await this.#adapter.sendToGui({
            command: 'networks',
            data,
        });
    }

    async #pollingVolumes(): Promise<void> {
        await this.isReady();
        if (!this.installed) {
            await this.#adapter.sendToGui({
                command: 'volumes',
                error: 'not installed',
            });
            return;
        }
        const data = await this.volumeList();
        await this.#adapter.sendToGui({
            command: 'volumes',
            data,
        });
    }

    async #pollingContainers(): Promise<void> {
        await this.isReady();
        if (!this.installed) {
            await this.#adapter.sendToGui({
                command: 'info',
                error: 'not installed',
            });
            return;
        }
        const data = await this.containerList(true, this.#ownIps?.length ? this.#ownIps : undefined);
        await this.#adapter.sendToGui({
            command: 'containers',
            data,
        });
    }

    async #pollingContainer(container: string): Promise<void> {
        await this.isReady();
        if (!this.installed) {
            await this.#adapter.sendToGui({
                command: 'info',
                error: 'not installed',
            });
            return;
        }
        const data = await this.containerInspect(container);
        await this.#adapter.sendToGui({
            command: 'container',
            container,
            data,
        });
    }

    async pollingUpdate(scan: {
        images: number;
        containers: string[];
        info: number;
        networks: number;
        volumes: number;
        container: string[];
    }): Promise<void> {
        if (scan.info) {
            this.#timers.info ||= setInterval(async () => this.#pollingInfo(), 10_000);
            setTimeout(() => void this.#pollingInfo(), 50); // do it immediately, too
        } else if (this.#timers.info) {
            clearInterval(this.#timers.info);
            this.#timers.info = undefined;
        }

        if (scan.images) {
            this.#timers.images ||= setInterval(async () => {
                await this.#pollingImages();
            }, 10_000);
            setTimeout(() => void this.#pollingImages(), 50); // do it immediately, too
        } else if (this.#timers.images) {
            clearInterval(this.#timers.images);
            this.#timers.images = undefined;
        }

        if (scan.networks) {
            this.#timers.networks ||= setInterval(async () => {
                await this.#pollingNetworks();
            }, 10_000);
            setTimeout(() => void this.#pollingNetworks(), 50); // do it immediately, too
        } else if (this.#timers.networks) {
            clearInterval(this.#timers.networks);
            this.#timers.networks = undefined;
        }

        if (scan.volumes) {
            this.#timers.volumes ||= setInterval(async () => {
                await this.#pollingVolumes();
            }, 10_000);
            setTimeout(() => void this.#pollingVolumes(), 50); // do it immediately, too
        } else if (this.#timers.volumes) {
            clearInterval(this.#timers.volumes);
            this.#timers.volumes = undefined;
        }

        if (scan.containers?.length) {
            this.#ownIps = scan.containers;
            // try to find for all domain names the own IP
            for (const ipOrDomain of scan.containers) {
                if (this.#domain2ip[ipOrDomain] === undefined && !isIP(ipOrDomain)) {
                    const ip = await getIpForDomain(ipOrDomain);
                    if (ip) {
                        this.#domain2ip[ipOrDomain] = ip;
                    } else {
                        this.#domain2ip[ipOrDomain] = false;
                    }
                }
            }

            this.#timers.containers ||= setInterval(async () => this.#pollingContainers(), 10_000);
            setTimeout(() => void this.#pollingContainers(), 50); // do it immediately, too
        } else if (this.#timers.containers) {
            clearInterval(this.#timers.containers);
            this.#timers.containers = undefined;
        }

        scan.container.forEach(container => {
            if (container) {
                this.#timers.container[container] ||= setInterval(
                    async _container => this.#pollingContainer(_container),
                    10_000,
                    container,
                );
                setTimeout(_container => void this.#pollingContainer(_container), 50, container); // do it immediately, too
            }
        });

        // Check deleted containers
        Object.keys(this.#timers.container).forEach(container => {
            if (container && !scan.container.includes(container)) {
                clearInterval(this.#timers.container[container]);
                delete this.#timers.container[container];
            }
        });
    }

    async destroy(): Promise<void> {
        await super.destroy();

        // Destroy all running commands
        Object.keys(this.#runningCommands).forEach(sid => {
            this.containerExecTerminate(sid, true);
        });

        // destroy all timers
        Object.keys(this.#timers.container).forEach((id: string) => {
            clearTimeout(this.#timers.container[id]);
        });
        if (this.#timers.images) {
            clearInterval(this.#timers.images);
            delete this.#timers.images;
        }
        if (this.#timers.volumes) {
            clearInterval(this.#timers.volumes);
            delete this.#timers.volumes;
        }
        if (this.#timers.networks) {
            clearInterval(this.#timers.networks);
            delete this.#timers.networks;
        }
        if (this.#timers.containers) {
            clearInterval(this.#timers.containers);
            delete this.#timers.containers;
        }
        if (this.#timers.info) {
            clearInterval(this.#timers.info);
            delete this.#timers.info;
        }
    }
}
