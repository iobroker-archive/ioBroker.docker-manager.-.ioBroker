import type { DockerContainerInspect, ContainerConfig } from '@iobroker/plugin-docker';

export function size2string(size: number | undefined): string {
    if (size === undefined || size === null || isNaN(size)) {
        return '--';
    }
    if (size > 1024 * 1024 * 1024) {
        return `${(Math.round((size / (1024 * 1024 * 1024)) * 100) / 100).toString()} GB`;
    }
    if (size > 1024 * 1024) {
        return `${(Math.round((size / (1024 * 1024)) * 100) / 100).toString()} MB`;
    }
    if (size > 1024) {
        return `${(Math.round((size / 1024) * 100) / 100).toString()} kB`;
    }
    return `${size.toString()} B`;
}

// remove undefined entries recursively
function removeUndefined(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map(v => (v && typeof v === 'object' ? removeUndefined(v) : v)).filter(v => v !== undefined);
    } else if (obj && typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj)
                .map(([k, v]) => [k, v && typeof v === 'object' ? removeUndefined(v) : v])
                .filter(([_, v]) => v !== undefined),
        );
    }
    return obj;
}

const dockerDefaults = {
    Tty: false,
    OpenStdin: false,
    AttachStdin: false,
    AttachStdout: true,
    AttachStderr: true,
    PublishAllPorts: false,
    RestartPolicy: { Name: 'no', MaximumRetryCount: 0 },
    LogConfig: { Type: 'json-file', Config: {} },
    Privileged: false,
    ReadonlyRootfs: false,
    Init: false,
    StopSignal: 'SIGTERM',
    StopTimeout: undefined,
    NetworkMode: 'default',
};

function isDefault(value: any, def: any): boolean {
    return JSON.stringify(value) === JSON.stringify(def);
}

export function mapInspectToConfig(inspect: DockerContainerInspect): ContainerConfig {
    let obj: ContainerConfig = {
        image: inspect.Config.Image,
        name: inspect.Name.replace(/^\//, ''),
        command: inspect.Config.Cmd ?? undefined,
        entrypoint: inspect.Config.Entrypoint ?? undefined,
        user: inspect.Config.User ?? undefined,
        workdir: inspect.Config.WorkingDir ?? undefined,
        hostname: inspect.Config.Hostname ?? undefined,
        domainname: inspect.Config.Domainname ?? undefined,
        macAddress: inspect.NetworkSettings.MacAddress ?? undefined,
        environment: inspect.Config.Env
            ? Object.fromEntries(
                  inspect.Config.Env.map(e => {
                      const [key, ...rest] = e.split('=');
                      return [key, rest.join('=')];
                  }),
              )
            : undefined,
        labels: inspect.Config.Labels ?? undefined,
        tty: inspect.Config.Tty,
        stdinOpen: inspect.Config.OpenStdin,
        attachStdin: inspect.Config.AttachStdin,
        attachStdout: inspect.Config.AttachStdout,
        attachStderr: inspect.Config.AttachStderr,
        openStdin: inspect.Config.OpenStdin,
        publishAllPorts: inspect.HostConfig.PublishAllPorts,
        ports: inspect.HostConfig.PortBindings
            ? Object.entries(inspect.HostConfig.PortBindings).flatMap(([containerPort, bindings]) =>
                  bindings.map(binding => ({
                      containerPort: containerPort.split('/')[0],
                      protocol: (containerPort.split('/')[1] as 'tcp' | 'udp') || 'tcp',
                      hostPort: binding.HostPort,
                      hostIP: binding.HostIp,
                  })),
              )
            : undefined,
        mounts: inspect.Mounts?.map(mount => ({
            type: mount.Type,
            source: mount.Source,
            target: mount.Destination,
            readOnly: mount.RW,
        })),
        volumes: inspect.Config.Volumes ? Object.keys(inspect.Config.Volumes) : undefined,
        extraHosts: inspect.HostConfig.ExtraHosts ?? undefined,
        dns: {
            servers: inspect.HostConfig.Dns,
            search: inspect.HostConfig.DnsSearch,
            options: inspect.HostConfig.DnsOptions,
        },
        networkMode: inspect.HostConfig.NetworkMode,
        networks: inspect.NetworkSettings.Networks
            ? Object.entries(inspect.NetworkSettings.Networks).map(([name, net]) => ({
                  name,
                  aliases: net.Aliases ?? undefined,
                  ipv4Address: net.IPAddress,
                  ipv6Address: net.GlobalIPv6Address,
                  driverOpts: net.DriverOpts ?? undefined,
              }))
            : undefined,
        restart: {
            policy: inspect.HostConfig.RestartPolicy.Name as any,
            maxRetries: inspect.HostConfig.RestartPolicy.MaximumRetryCount,
        },
        resources: {
            cpuShares: inspect.HostConfig.CpuShares,
            cpuQuota: inspect.HostConfig.CpuQuota,
            cpuPeriod: inspect.HostConfig.CpuPeriod,
            cpusetCpus: inspect.HostConfig.CpusetCpus,
            memory: inspect.HostConfig.Memory,
            memorySwap: inspect.HostConfig.MemorySwap,
            memoryReservation: inspect.HostConfig.MemoryReservation,
            pidsLimit: inspect.HostConfig.PidsLimit ?? undefined,
            shmSize: inspect.HostConfig.ShmSize,
            readOnlyRootFilesystem: inspect.HostConfig.ReadonlyRootfs,
        },
        logging: {
            driver: inspect.HostConfig.LogConfig.Type,
            options: inspect.HostConfig.LogConfig.Config,
        },
        security: {
            privileged: inspect.HostConfig.Privileged,
            capAdd: inspect.HostConfig.CapAdd ?? undefined,
            capDrop: inspect.HostConfig.CapDrop ?? undefined,
            usernsMode: inspect.HostConfig.UsernsMode ?? undefined,
            ipc: inspect.HostConfig.IpcMode,
            pid: inspect.HostConfig.PidMode,
            seccomp:
                inspect.HostConfig.SecurityOpt?.find(opt => opt.startsWith('seccomp='))?.split('=')[1] ?? undefined,
            apparmor: inspect.AppArmorProfile,
            groupAdd: inspect.HostConfig.GroupAdd ?? undefined,
            noNewPrivileges: undefined, // Nicht direkt verfügbar
        },
        sysctls: inspect.HostConfig.Sysctls ?? undefined,
        init: inspect.HostConfig.Init ?? undefined,
        stop: {
            signal: inspect.Config.StopSignal ?? undefined,
            gracePeriodSec: inspect.Config.StopTimeout ?? undefined,
        },
        readOnly: inspect.HostConfig.ReadonlyRootfs,
        timezone: undefined, // Nicht direkt verfügbar
        __meta: undefined, // Eigene Metadaten
    };

    obj = removeUndefined(obj);
    Object.keys(dockerDefaults).forEach(name => {
        if (isDefault((obj as any)[name], (dockerDefaults as any)[name])) {
            delete (obj as any)[name];
        }
    });

    return obj;
}
