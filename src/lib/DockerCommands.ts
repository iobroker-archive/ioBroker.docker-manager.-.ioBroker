// This class implements docker commands using CLI and
// it monitors periodically the docker daemon status.
// It manages containers defined in adapter.config.containers and monitors other containers

import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import type {
    ContainerConfig,
    ContainerInfo,
    DiskUsage,
    DockerContainerInspect,
    DockerImageInspect,
    ImageInfo,
} from '../types';
import { type DockerManagerAdapter } from '../main';

const execPromise = promisify(exec);

export type ImageName = string;
export type ContainerName = string;

export default class DockerCommands {
    #installed: boolean = false;
    #dockerVersion: string = '';
    #needSudo: boolean = false;
    readonly #waitReady: Promise<void>;
    #adapter: DockerManagerAdapter;
    #ownContainers: ContainerConfig[] = [];
    #timers: {
        images?: ReturnType<typeof setInterval>;
        containers?: ReturnType<typeof setInterval>;
        info?: ReturnType<typeof setInterval>;
        container: { [key: string]: ReturnType<typeof setInterval> };
    } = {
        container: {},
    };

    constructor(adapter: DockerManagerAdapter) {
        this.#adapter = adapter;
        this.#ownContainers = adapter.config.containers;
        this.#waitReady = new Promise<void>(resolve => this.init().then(() => resolve()));
    }

    isReady(): Promise<void> {
        return this.#waitReady;
    }

    async init(): Promise<void> {
        const version = await this.#isDockerInstalled();
        this.#installed = !!version;
        if (version) {
            this.#dockerVersion = version;
        }
        if (this.#installed) {
            this.#needSudo = await this.#isNeedSudo();
            await this.#checkOwnContainers();
        }
    }

    async #checkOwnContainers(): Promise<void> {
        if (!this.#ownContainers.length) {
            return;
        }
        const status = await this.containerList(true);
        let images = await this.imageList();
        for (let c = 0; c < this.#ownContainers.length; c++) {
            const container = this.#ownContainers[c];
            if (container.enabled !== false) {
                // Check if container is running
                const containerInfo = status.find(it => it.names === container.name);
                if (containerInfo && containerInfo.status !== 'running' && containerInfo.status !== 'restarting') {
                    // Start the container
                    this.#adapter.log.info(`Starting own container ${container.name}`);
                    if (!images.find(it => `${it.repository}:${it.tag}` === container.image)) {
                        this.#adapter.log.info(`Pulling image ${container.image} for own container ${container.name}`);
                        try {
                            await this.imagePull(container.image);
                        } catch (e) {
                            this.#adapter.log.warn(`Cannot pull image ${container.image}: ${e.message}`);
                        }
                        // Check that image is available now
                        images = await this.imageList();
                        if (!images.find(it => `${it.repository}:${it.tag}` === container.image)) {
                            this.#adapter.log.warn(
                                `Image ${container.image} for own container ${container.name} not found after pull`,
                            );
                            continue;
                        }
                    }

                    try {
                        await this.imageRun(container.image, container);
                    } catch (e) {
                        this.#adapter.log.warn(`Cannot start own container ${container.name}: ${e.message}`);
                    }
                }
            }
        }
    }

    #exec(command: string): Promise<{ stdout: string; stderr: string }> {
        if (!this.#installed) {
            return Promise.reject(new Error('Docker is not installed'));
        }
        const finalCommand = this.#needSudo ? `sudo docker ${command}` : `docker ${command}`;
        return execPromise(finalCommand);
    }

    async #isDockerInstalled(): Promise<string | false> {
        try {
            const result = await execPromise('docker --version');
            if (!result.stdout && result.stdout) {
                return result.stdout;
            }
        } catch {
            // ignore
        }
        return false;
    }

    async #isNeedSudo(): Promise<boolean> {
        try {
            await execPromise('docker ps');
            return false;
        } catch {
            return true;
        }
    }

    async discUsage(): Promise<DiskUsage> {
        const { stdout } = await this.#exec(`system df`);
        const result: DiskUsage = { total: { size: 0, reclaimable: 0 } };
        // parse the output
        // TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
        // Images          2         1         2.715GB   2.715GB (99%)
        // Containers      1         1         26.22MB   0B (0%)
        // Local Volumes   0         0         0B        0B
        // Build Cache     0         0         0B        0B
        const lines = stdout.split('\n');
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length === 5 && parts[0] !== 'TYPE') {
                const sizeStr = parts[3];
                const reclaimableStr = parts[4].split(' ')[0];
                const size = this.#parseSize(sizeStr);
                const reclaimable = this.#parseSize(reclaimableStr);
                result.total.size += size;
                result.total.reclaimable += reclaimable;
                if (parts[0] === 'Images') {
                    result.images = {
                        total: parseInt(parts[1], 10),
                        active: parseInt(parts[2], 10),
                        size,
                        reclaimable: reclaimable,
                    };
                } else if (parts[0] === 'Containers') {
                    result.containers = {
                        total: parseInt(parts[1], 10),
                        active: parseInt(parts[2], 10),
                        size,
                        reclaimable: reclaimable,
                    };
                } else if (parts[0] === 'Local' && parts[1] === 'Volumes') {
                    result.volumes = {
                        total: parseInt(parts[2], 10),
                        active: parseInt(parts[3], 10),
                        size,
                        reclaimable: reclaimable,
                    };
                } else if (parts[0] === 'Build' && parts[1] === 'Cache') {
                    result.buildCache = {
                        total: parseInt(parts[2], 10),
                        active: parseInt(parts[3], 10),
                        size,
                        reclaimable: reclaimable,
                    };
                }
            }
        }
        return result;
    }

    async imagePull(image: ImageName): Promise<void> {
        await this.#exec(`pull ${image}`);
        const images = await this.imageList();
        if (!images.find(it => `${it.repository}:${it.tag}` === image)) {
            throw new Error(`Image ${image} not found after pull`);
        }
        await this.#adapter.sendToGui({
            command: 'images',
            data: images,
        });
    }

    async imageRun(image: ImageName, config: ContainerConfig): Promise<void> {
        await this.#exec(`run ${this.#toDockerRun({ ...config, image })}`);
    }

    async imageList(): Promise<ImageInfo[]> {
        const { stdout } = await this.#exec(
            'images --format "{{.Repository}}:{{.Tag}};{{.ID}};{{.CreatedAt}};{{.Size}}"',
        );
        return stdout
            .split('\n')
            .filter(line => line.trim() !== '')
            .map(line => {
                const [repositoryTag, id, createdSince, size] = line.split(';');
                const [repository, tag] = repositoryTag.split(':');
                return { repository, tag, id, createdSince, size: this.#parseSize(size) };
            });
    }

    async imageBuild(dockerfilePath: string, tag: string): Promise<void> {
        await this.#exec(`build -t ${tag} -f ${dockerfilePath} .`);
    }

    async imageTag(imageId: ImageName, newTag: string): Promise<void> {
        await this.#exec(`tag ${imageId} ${newTag}`);
    }

    async imageRemove(image: ImageName): Promise<void> {
        await this.#exec(`rmi ${image}`);
        const images = await this.imageList();
        if (images.find(it => `${it.repository}:${it.tag}` === image)) {
            throw new Error(`Image ${image} not found after pull`);
        }
        await this.#adapter.sendToGui({
            command: 'images',
            data: images,
        });
    }

    async imageInspect(imageId: ImageName): Promise<DockerImageInspect> {
        const { stdout } = await this.#exec(`inspect ${imageId}`);
        return JSON.parse(stdout)[0];
    }

    #parseSize(sizeStr: string): number {
        const units: { [key: string]: number } = {
            B: 1,
            KB: 1024,
            MB: 1024 * 1024,
            GB: 1024 * 1024 * 1024,
            TB: 1024 * 1024 * 1024 * 1024,
        };
        const match = sizeStr.match(/^([\d.]+)([KMGTP]?B)$/);
        if (match) {
            const value = parseFloat(match[1]);
            const unit = match[2];
            return value * (units[unit] || 1);
        }
        return 0;
    }

    async containerStop(container: ContainerName): Promise<void> {
        let containers = await this.containerList();
        // find ID of container
        const containerInfo = containers.find(it => it.names === container || it.id === container);
        if (!containerInfo) {
            throw new Error(`Container ${container} not found`);
        }

        await this.#exec(`stop ${containerInfo.id}`);
        containers = await this.containerList();
        if (containers.find(it => it.id === containerInfo.id && it.status === 'running')) {
            throw new Error(`Container ${container} still running after stop`);
        }
        await this.#adapter.sendToGui({
            command: 'containers',
            data: containers,
        });
    }

    async containerStart(container: ContainerName): Promise<void> {
        let containers = await this.containerList();
        // find ID of container
        const containerInfo = containers.find(it => it.names === container || it.id === container);
        if (!containerInfo) {
            throw new Error(`Container ${container} not found`);
        }

        await this.#exec(`start ${containerInfo.id}`);
        containers = await this.containerList();
        if (
            containers.find(it => it.id === containerInfo.id && it.status !== 'running' && it.status !== 'restarting')
        ) {
            throw new Error(`Container ${container} still running after stop`);
        }
        await this.#adapter.sendToGui({
            command: 'containers',
            data: containers,
        });
    }

    async containerRestart(container: ContainerName, timeoutSeconds?: number): Promise<void> {
        let containers = await this.containerList();
        // find ID of container
        const containerInfo = containers.find(it => it.names === container || it.id === container);
        if (!containerInfo) {
            throw new Error(`Container ${container} not found`);
        }

        await this.#exec(`restart -t ${timeoutSeconds || 5} ${containerInfo.id}`);
        containers = await this.containerList();
        await this.#adapter.sendToGui({
            command: 'containers',
            data: containers,
        });
    }

    async containerRemove(container: ContainerName): Promise<void> {
        let containers = await this.containerList();
        // find ID of container
        const containerInfo = containers.find(it => it.names === container || it.id === container);
        if (!containerInfo) {
            throw new Error(`Container ${container} not found`);
        }

        await this.#exec(`rm ${container}`);

        containers = await this.containerList();
        if (containers.find(it => it.id === containerInfo.id)) {
            throw new Error(`Container ${container} still found after stop`);
        }
        await this.#adapter.sendToGui({
            command: 'containers',
            data: containers,
        });
    }

    async containerList(all: boolean = true): Promise<ContainerInfo[]> {
        const { stdout } = await this.#exec(
            `ps ${all ? '-a' : ''} --format  "{{.Names}};{{.Status}};{{.ID}};{{.Image}};{{.Command}};{{.CreatedAt}};{{.Ports}}"`,
        );
        return stdout
            .split('\n')
            .filter(line => line.trim() !== '')
            .map(line => {
                const [names, statusInfo, id, image, command, createdAt, ports] = line.split(';');
                const [status, ...uptime] = statusInfo.split(' ');
                let statusKey: ContainerInfo['status'] = status.toLowerCase() as ContainerInfo['status'];
                if ((statusKey as string) === 'up') {
                    statusKey = 'running';
                }
                return { id, image, command, createdAt, status: statusKey, uptime: uptime.join(' '), ports, names };
            });
    }

    async containerLogs(
        containerNameOrId: ContainerName,
        options: { tail?: number; follow?: boolean } = {},
    ): Promise<string[]> {
        const args = [];
        if (options.tail !== undefined) {
            args.push(`--tail ${options.tail}`);
        }
        if (options.follow) {
            args.push(`--follow`);
        }
        const { stdout } = await this.#exec(`logs ${args.join(' ')} ${containerNameOrId}`);
        return stdout.split('\n').filter(line => line.trim() !== '');
    }

    containerExec(container: ContainerName, command: string): Promise<{ stdout: string; stderr: string }> {
        return this.#exec(`exec -it ${container} ${command}`);
    }

    async containerInspect(containerNameOrId: string): Promise<DockerContainerInspect> {
        const { stdout } = await this.#exec(`inspect ${containerNameOrId}`);
        return JSON.parse(stdout)[0] as DockerContainerInspect;
    }

    /**
     * Build a docker run command string from ContainerConfig
     */
    #toDockerRun(config: ContainerConfig): string {
        const args: string[] = [];

        // detach / interactive
        if (config.detach) {
            args.push('-d');
        }
        if (config.tty) {
            args.push('-t');
        }
        if (config.stdinOpen) {
            args.push('-i');
        }
        if (config.removeOnExit) {
            args.push('--rm');
        }

        // name
        if (config.name) {
            args.push('--name', config.name);
        }

        // hostname / domain
        if (config.hostname) {
            args.push('--hostname', config.hostname);
        }
        if (config.domainname) {
            args.push('--domainname', config.domainname);
        }

        // environment
        if (config.environment) {
            for (const [key, value] of Object.entries(config.environment)) {
                args.push('-e', `${key}=${value}`);
            }
        }
        if (config.envFile) {
            for (const file of config.envFile) {
                args.push('--env-file', file);
            }
        }

        // labels
        if (config.labels) {
            for (const [key, value] of Object.entries(config.labels)) {
                args.push('--label', `${key}=${value}`);
            }
        }

        // ports
        if (config.publishAllPorts) {
            args.push('-P');
        }
        if (config.ports) {
            for (const p of config.ports) {
                const mapping =
                    (p.hostIP ? `${p.hostIP}:` : '') +
                    (p.hostPort ? `${p.hostPort}:` : '') +
                    p.containerPort +
                    (p.protocol ? `/${p.protocol}` : '');
                args.push('-p', mapping);
            }
        }

        // volumes / mounts
        if (config.volumes) {
            for (const v of config.volumes) {
                args.push('-v', v);
            }
        }
        if (config.mounts) {
            for (const m of config.mounts) {
                let mount = `type=${m.type},target=${m.target}`;
                if (m.source) {
                    mount += `,source=${m.source}`;
                }
                if (m.readOnly) {
                    mount += `,readonly`;
                }
                args.push('--mount', mount);
            }
        }

        // restart policy
        if (config.restart?.policy) {
            const val =
                config.restart.policy === 'on-failure' && config.restart.maxRetries
                    ? `on-failure:${config.restart.maxRetries}`
                    : config.restart.policy;
            args.push('--restart', val);
        }

        // user & workdir
        if (config.user) {
            args.push('--user', String(config.user));
        }
        if (config.workdir) {
            args.push('--workdir', config.workdir);
        }

        // logging
        if (config.logging?.driver) {
            args.push('--log-driver', config.logging.driver);
            if (config.logging.options) {
                for (const [k, v] of Object.entries(config.logging.options)) {
                    args.push('--log-opt', `${k}=${v}`);
                }
            }
        }

        // security
        if (config.security?.privileged) {
            args.push('--privileged');
        }
        if (config.security?.capAdd) {
            for (const cap of config.security.capAdd) {
                args.push('--cap-add', cap);
            }
        }
        if (config.security?.capDrop) {
            for (const cap of config.security.capDrop) {
                args.push('--cap-drop', cap);
            }
        }
        if (config.security?.noNewPrivileges) {
            args.push('--security-opt', 'no-new-privileges');
        }

        // network
        if (config.networkMode) {
            args.push('--network', config.networkMode);
        }

        // extra hosts
        if (config.extraHosts) {
            for (const host of config.extraHosts as any[]) {
                if (typeof host === 'string') {
                    args.push('--add-host', host);
                } else {
                    args.push('--add-host', `${host.host}:${host.ip}`);
                }
            }
        }

        // sysctls
        if (config.sysctls) {
            for (const [k, v] of Object.entries(config.sysctls)) {
                args.push('--sysctl', `${k}=${v}`);
            }
        }

        // stop signal / timeout
        if (config.stop?.signal) {
            args.push('--stop-signal', config.stop.signal);
        }
        if (config.stop?.gracePeriodSec !== undefined) {
            args.push('--stop-timeout', String(config.stop.gracePeriodSec));
        }

        // resources
        if (config.resources?.cpus) {
            args.push('--cpus', String(config.resources.cpus));
        }
        if (config.resources?.memory) {
            args.push('--memory', String(config.resources.memory));
        }

        // image
        if (!config.image) {
            throw new Error('ContainerConfig.image is required for docker run');
        }
        args.push(config.image);

        // command override
        if (config.command) {
            if (Array.isArray(config.command)) {
                args.push(...config.command);
            } else {
                args.push(config.command);
            }
        }

        return args.join(' ');
    }

    updatePolling(scan: { images: number; containers: number; info: number; container: string[] }): void {
        if (scan.info && !this.#timers.info) {
            this.#timers.info = setInterval(async () => {
                await this.isReady();
                if (!(await this.#isDockerInstalled())) {
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
                    version: this.#dockerVersion,
                });
            }, 10_000);
        } else if (this.#timers.info) {
            clearInterval(this.#timers.info);
        }

        if (scan.images && !this.#timers.images) {
            this.#timers.images = setInterval(async () => {
                await this.isReady();
                if (!(await this.#isDockerInstalled())) {
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
            }, 10_000);
        } else if (this.#timers.images) {
            clearInterval(this.#timers.images);
        }

        if (scan.containers && !this.#timers.containers) {
            this.#timers.containers = setInterval(async () => {
                await this.isReady();
                const data = await this.containerList();
                await this.#adapter.sendToGui({
                    command: 'containers',
                    data,
                });
            }, 10_000);
        } else if (this.#timers.containers) {
            clearInterval(this.#timers.containers);
        }

        scan.container.forEach(container => {
            if (container && !this.#timers.container[container]) {
                this.#timers.container[container] = setInterval(async () => {
                    await this.isReady();
                    if (!(await this.#isDockerInstalled())) {
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
                }, 10_000);
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

    destroy(): void {
        Object.keys(this.#timers.container).forEach((id: string) => {
            clearTimeout(this.#timers.container[id]);
        });
        if (this.#timers.images) {
            clearInterval(this.#timers.images);
            delete this.#timers.images;
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
