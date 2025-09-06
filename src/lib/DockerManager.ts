// This class monitors and manages one docker container via command line commands.
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

// Debug with
// sudo docker exec -it iobroker-defender-ids bash

// Promisify exec for use with async/await
const execPromise = promisify(exec);

/**
 * Interface for options when starting a new container.
 */
export interface StartContainerOptions {
    image: string; // Name of the image to use (e.g. 'ubuntu:latest')
    name?: string; // Optional name for the container
    ports?: string[]; // Port mappings (e.g. ['8080:80'])
    volumes?: string[]; // Volume mappings (e.g. ['/host/path:/container/path'])
    env?: Record<string, string>; // Environment variables (e.g. { 'DB_USER': 'admin' })
    detached?: boolean; // Run in detached mode (default: true)
    removeAfterStop?: boolean; // Remove the container after stopping (default: false)
    securityOptions?: string; // Security options for the container (e.g. 'apparmor=unconfined')
}

/**
 * A class for managing Docker containers via the command line.
 */
export class DockerManager {
    private readonly adapter: ioBroker.Adapter;
    private runningId: string | null = null; // ID of the currently running container, if any

    private readonly options: {
        dockerCommand: string; // Optional custom Docker command (default: 'docker')
        image: string; // Default image to use for operations
        name?: string; // Optional default name for the container
        ports?: string[]; // Optional default port mappings
        volumes?: string[]; // Optional default volume mappings
        env?: Record<string, string>; // Optional default environment variables
        detached?: boolean; // Run in detached mode by default (default: true)
        removeAfterStop?: boolean; // Remove the container after stopping by default (default: false)
        autoUpdate?: boolean; // Automatically update the image if an update is available (default: false)
        autoStart?: boolean; // Automatically start the container after creation (default: false)
        needSudo?: boolean; // If true, the Docker commands will be prefixed with 'sudo' (default: true)
    } = {
        dockerCommand: 'docker', // Default Docker command
        image: '', // Default image to use for operations
    };

    constructor(
        adapter: ioBroker.Adapter,
        options: {
            dockerCommand?: string; // Optional custom Docker command (default: 'docker')
            image: string; // Default image to use for operations
            name?: string; // Optional default name for the container
            ports?: string[]; // Optional default port mappings
            volumes?: string[]; // Optional default volume mappings
            env?: Record<string, string>; // Optional default environment variables
            detached?: boolean; // Run in detached mode by default (default: true)
            removeAfterStop?: boolean; // Remove the container after stopping by default (default: false)
            autoUpdate?: boolean; // Automatically update the image if an update is available (default: false)
            autoStart?: boolean; // Automatically start the container after creation (default: true)
            needSudo?: boolean; // If true, the Docker commands will be prefixed with 'sudo' (default: true)
            securityOptions?: string; // Security options for the container (e.g. 'apparmor=unconfined')
        },
    ) {
        this.adapter = adapter;
        this.options = {
            dockerCommand: options.dockerCommand || 'docker',
            image: options.image,
            name: options.name,
            ports: options.ports?.length ? options.ports : undefined,
            volumes: options.volumes?.length ? options.volumes : undefined,
            env: options.env && Object.keys(options.env).length ? options.env : undefined,
            detached: options.detached !== undefined ? options.detached : true,
            removeAfterStop: options.removeAfterStop !== undefined ? options.removeAfterStop : false,
            autoUpdate: options.autoUpdate !== undefined ? options.autoUpdate : false,
            autoStart: options.autoStart === undefined ? true : options.autoStart,
            needSudo: options.needSudo === undefined ? true : options.needSudo,
        };
    }

    public async init(): Promise<void> {
        if (!this.options.image) {
            throw new Error('Image name is required to initialize DockerManager.');
        }

        // Check if Docker command is available
        await this.isDockerInstalled();

        // Check if the image is available locally
        const pullRequired = await this.isImagePullRequired(this.options.image);
        if (pullRequired) {
            this.adapter.log.info(`Image ${this.options.image} not found locally. Pulling from registry...`);
            await this.pullImage(this.options.image);
        } else {
            this.adapter.log.debug(`Image ${this.options.image} is already available locally.`);

            if (this.options.autoUpdate) {
                const updateAvailable = await this.isImageUpdateAvailable(this.options.image);
                if (updateAvailable) {
                    this.adapter.log.debug(
                        `An update for image ${this.options.image} is available. Pulling latest version...`,
                    );
                    await this.updateContainer();
                } else {
                    this.adapter.log.debug(`Image ${this.options.image} is up to date.`);
                }
            }
        }

        if (this.options.autoStart) {
            await this.start();
        }
    }

    public async start(): Promise<string> {
        if (this.runningId) {
            this.adapter.log.debug(`Container with ID ${this.runningId} is already running.`);
            return this.runningId;
        }

        // Check if a container with the specified name is already running
        if (!this.options.name) {
            this.runningId = await this.getContainerIdByImage(this.options.image);
        }
        const nameOrId = this.options.name || this.runningId;

        const running = nameOrId ? await this._isContainerRunning(nameOrId) : false;
        if (!running) {
            this.adapter.log.debug(`Starting container with image ${this.options.image}...`);
            this.runningId = await this.runContainer();
            this.adapter.log.debug(`Container started with ID: ${this.runningId}`);
        } else {
            this.adapter.log.debug(`Container with name ${this.options.name} is already running.`);
        }
        return this.runningId!;
    }

    async destroy(): Promise<void> {
        await this.stop();
    }

    async stop(): Promise<boolean> {
        if (!this.runningId) {
            this.adapter.log.debug('No container is currently running.');
            return false;
        }

        try {
            this.adapter.log.debug(`Stopping container with ID ${this.runningId}...`);
            await this.stopContainer(this.runningId);
            this.adapter.log.debug(`Container with ID ${this.runningId} stopped.`);
            this.runningId = null; // Reset running ID
            return true;
        } catch (error) {
            this.runningId = null; // Reset running ID on error
            this.adapter.log.error(`Error stopping container: ${error as Error}`);
            return false;
        }
    }

    /**
     * Executes a shell command and returns its output.
     *
     * @param command The command to execute.
     * @returns A promise that resolves with stdout and stderr of the command.
     */
    private async _executeCommand(command: string): Promise<{ stdout: string; stderr: string }> {
        try {
            const { stdout, stderr } = await execPromise((this.options.needSudo ? 'sudo ' : '') + command);
            return { stdout, stderr };
        } catch (error) {
            console.error(`Error executing command: ${command}`, error);
            throw error;
        }
    }

    /**
     * Checks if Docker is installed and executable on the system.
     *
     * @returns A promise that resolves to `true` if Docker is installed, otherwise `false`.
     */
    async isDockerInstalled(): Promise<boolean> {
        try {
            await this._executeCommand(`${this.options.dockerCommand} --version`);
            return true;
        } catch (error) {
            this.adapter.log.error(`Docker is not installed or not executable: ${error as Error}`);
            return false;
        }
    }

    /**
     * Checks if pulling is required for a specific image.
     *
     * @param imageName The name of the image (e.g. 'nginx:alpine').
     * @returns A promise that resolves to `true` if the image needs to be pulled, otherwise `false`.
     */
    private async isImagePullRequired(imageName: string): Promise<boolean> {
        try {
            // Check if the image exists locally
            const { stdout } = await this._executeCommand(`${this.options.dockerCommand} images -q ${imageName}`);
            return stdout.trim().length === 0; // If no output, the image is not present
        } catch (error) {
            this.adapter.log.error(`Error checking if image pull is required: ${error as Error}`);
            return true; // Assume pull is required on error
        }
    }

    public isContainerRunning(): string | false {
        return this.runningId || false;
    }

    /**
     * Checks if an update for a Docker image is available.
     *
     * @param imageName The name of the image (e.g. 'nginx:alpine').
     * @returns Promise that resolves to true if an update is available, otherwise false.
     */
    private async isImageUpdateAvailable(imageName: string): Promise<boolean> {
        // Get local image ID
        const { stdout: localId } = await this._executeCommand(
            `${this.options.dockerCommand} images --no-trunc --quiet ${imageName}`,
        );
        try {
            // Pull latest image
            this.adapter.log.debug(`Downloading latest image: ${imageName}... please wait.`);
            const { stdout: log } = await this._executeCommand(`${this.options.dockerCommand} pull -q ${imageName}`);
            console.log('Pull log:', log);
            this.adapter.log.debug(`Image ${imageName} pulled successfully.`);
        } catch (error) {
            this.adapter.log.error(`Error pulling image ${imageName}: ${error as Error}`);
            return false; // If pulling fails, assume no update is available
        }
        // iob@kisshome:~ $ sudo docker pull kisshome/ids:stable-backports
        // OUTPUT:
        //      stable-backports: Pulling from kisshome/ids
        //      Digest: sha256:42ed5bfd32fecfba638b683774c711ac74f5d10baaab09b4e2581c0b0105c291
        //      Status: Image is up to date for kisshome/ids:stable-backports
        //      docker.io/kisshome/ids:stable-backports
        // We can analyse the output to determine if the image was updated, but is it the same in all languages?

        // Get new image ID
        const { stdout: remoteId } = await this._executeCommand(
            `${this.options.dockerCommand} images --no-trunc --quiet ${imageName}`,
        );
        // Compare IDs
        return localId.trim() !== remoteId.trim();
    }

    /**
     * Pulls a Docker image from a registry.
     *
     * @param imageName The name of the image (e.g. 'nginx:alpine').
     * @returns A promise that resolves with the standard output of the pull command.
     */
    private async pullImage(imageName: string): Promise<string> {
        this.adapter.log.debug(`Pulling image: ${imageName}...`);
        const { stdout } = await this._executeCommand(`${this.options.dockerCommand} pull -q ${imageName}`);
        return stdout;
    }

    private async runContainer(): Promise<string> {
        // Check if the container with the specified name is already existing
        const exist = await this.isContainerExist();
        if (exist) {
            this.adapter.log.debug(`Container with name ${this.options.name} already exists.`);
            return await this.startContainer();
        }

        // Start a new container
        this.runningId = await this.initContainer({
            image: this.options.image,
            name: this.options.name,
            ports: this.options.ports,
            volumes: this.options.volumes,
            env: this.options.env,
            detached: this.options.detached,
            removeAfterStop: this.options.removeAfterStop,
        });

        return this.runningId;
    }

    private async isContainerExist(name?: string): Promise<boolean> {
        name ||= this.options.name || ''; // Use the provided name or the default one
        if (!name) {
            throw new Error('Image name is required to check if a container exists.');
        }
        const command = `${this.options.dockerCommand} ps -a --filter "name=${name}" --format "{{.ID}}"`;
        try {
            const { stdout } = await this._executeCommand(command);
            return !!stdout.trim().length;
        } catch (error) {
            this.adapter.log.error(`Error checking if container exists: ${error as Error}`);
            return false; // If the command fails, assume the container does not exist
        }
    }

    private async startContainer(name?: string): Promise<string> {
        name ||= this.options.name || ''; // Use the provided name or the default one
        let command = `${this.options.dockerCommand} start`;
        if (!name) {
            throw new Error('Image name is required to start a container.');
        }

        command += ` ${name}`;
        this.adapter.log.debug(`Re-starting container with command: ${command}`);
        const { stdout } = await this._executeCommand(command);
        return stdout.trim(); // The container ID is returned
    }

    /**
     * Starts a new Docker container.
     *
     * @param options The configuration for the new container.
     * @returns A promise that resolves with the ID of the new container.
     */
    private async initContainer(options: StartContainerOptions): Promise<string> {
        const { image, name, ports, volumes, env, detached = true, removeAfterStop, securityOptions } = options;

        let command = `${this.options.dockerCommand} run`;

        if (detached) {
            command += ' -d';
        }
        if (securityOptions) {
            // Add security options if provided
            command += ` --security-opt ${securityOptions}`;
        }

        if (name) {
            command += ` --name ${name}`;
        }
        if (ports) {
            ports.forEach(p => {
                if (p.includes(':')) {
                    // If the port mapping is in the format 'hostPort:containerPort'
                    command += ` -p ${p}`;
                } else {
                    // If only the container port is specified, map it to the same port on the host
                    command += ` -p ${p}:${p}`;
                }
            });
        }
        if (volumes) {
            volumes.forEach(v => {
                command += ` -v ${v}:Z`; // Use ':Z' for SELinux compatibility
            });
        }
        if (env) {
            Object.entries(env).forEach(([key, value]) => {
                command += ` -e "${key}=${value}"`;
            });
        }
        if (removeAfterStop) {
            command += ' --rm';
        }

        if (!image) {
            throw new Error('Image name is required to start a container.');
        }

        command += ` ${image}`;

        this.adapter.log.debug(`Starting container with command: ${command}`);
        const { stdout } = await this._executeCommand(command);
        return stdout.trim(); // The container ID is returned
    }

    /**
     * Updates a Docker image and restarts the associated container.
     *
     * @returns A promise that resolves with the ID of the new container or an empty string if the container was not running.
     */
    private async updateContainer(): Promise<string> {
        // Pull the latest image
        await this.pullImage(this.options.image);
        // Check if a container with the specified name is already running
        if (!this.options.name) {
            this.runningId = await this.getContainerIdByImage(this.options.image);
        }
        const nameOrId = this.options.name || this.runningId;
        // Stop the container if it is running
        const running = nameOrId ? await this._isContainerRunning(nameOrId) : false;
        if (running) {
            try {
                await this.stopContainer(nameOrId!);
            } catch (error) {
                this.adapter.log.warn(
                    `Error stopping container ${nameOrId}: ${error as Error}. But we still try to start a new one.`,
                );
            }
        }

        // Remove the container if it exists
        try {
            await this.remove();
        } catch (error) {
            this.adapter.log.warn(
                `Error removing container ${nameOrId}: ${error as Error}. But we still try to start a new one.`,
            );
        }

        if (running) {
            this.adapter.log.info(`Container ${nameOrId} stopped and removed. Starting a new container...`);
            return await this.start();
        }
        return '';
    }

    /**
     * Restarts the currently running container.
     */
    public async restart(): Promise<string> {
        await this.stop();
        return await this.start();
    }

    public async remove(): Promise<void> {
        // Remove the container if it exists
        try {
            await this._executeCommand(`${this.options.dockerCommand} rm ${this.options.image}`);
        } catch {
            // Ignore if the container does not exist
        }
    }
    /**
     * Stops a running container.
     *
     * @param containerIdOrName The ID or name of the container to stop.
     * @returns A promise that resolves with the ID of the stopped container.
     */
    private async stopContainer(containerIdOrName: string): Promise<string> {
        this.adapter.log.debug(`Stopping container: ${containerIdOrName}...`);
        const { stdout } = await this._executeCommand(`${this.options.dockerCommand} stop ${containerIdOrName}`);
        return stdout.trim();
    }

    /**
     * Checks if a container with a specific ID or name is currently running.
     *
     * @param containerIdOrName The ID or name of the container.
     * @returns A promise that resolves to `true` if the container is running, otherwise `false`.
     */
    private async _isContainerRunning(containerIdOrName: string): Promise<boolean> {
        // This command lists running containers with the exact name or ID.
        // If the output contains text, the container is running.
        const command = `${this.options.dockerCommand} ps --filter "name=^/${containerIdOrName}$" --filter "status=running" --format "{{.ID}}"`;
        try {
            const { stdout } = await this._executeCommand(command);
            return stdout.trim().length > 0;
        } catch (error) {
            this.adapter.log.error(`Error checking if container is running:${error as Error}`);
            // If the command fails, it is unlikely that the container is running.
            return false;
        }
    }

    async getIpOfContainer(): Promise<string> {
        const command = `${this.options.dockerCommand} inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${this.options.name || this.runningId}`;
        const { stdout } = await this._executeCommand(command);
        const ip = stdout.trim();
        if (!ip) {
            throw new Error(`No IP address found for container ${this.options.name || this.runningId}`);
        }
        return ip;
    }

    /**
     * Gibt die Container-ID eines laufenden Containers für ein bestimmtes Image zurück.
     *
     * @param image Name des Images (z.B. 'nginx:alpine')
     * @returns Promise mit der Container-ID oder leerem String, falls nicht gefunden.
     */
    async getContainerIdByImage(image: string): Promise<string> {
        const command = `${this.options.dockerCommand} ps --filter ancestor=${image} --format "{{.ID}}"`;
        const { stdout } = await this._executeCommand(command);
        return stdout.trim();
    }
}
