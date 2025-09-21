import type {
    DockerContainerInspect,
    NetworkInfo,
    DiskUsage,
    ContainerInfo,
    ImageInfo,
    VolumeInfo,
} from './dockerManager.types.ts';

export type GUIRequestInfo = {
    type: 'info';
};

export type GUIRequestImages = {
    type: 'images';
};
export type GUIRequestContainers = {
    type: 'containers';
};
export type GUIRequestNetworks = {
    type: 'networks';
};
export type GUIRequestContainer = {
    type: 'containers';
    container: string;
};
export type GUIRequestVolumes = {
    type: 'volumes';
};

export type GUIRequest =
    | GUIRequestInfo
    | GUIRequestImages
    | GUIRequestContainers
    | GUIRequestContainer
    | GUIRequestVolumes
    | GUIRequestNetworks;

export type GUIResponseInfo = {
    command: 'info';
    data?: DiskUsage;
    version?: string;
    error?: string;
};
export type GUIResponseContainers = {
    command: 'containers';
    data?: ContainerInfo[];
    error?: string;
};
export type GUIResponseImages = {
    command: 'images';
    data?: ImageInfo[];
    error?: string;
};
export type GUIResponseContainer = {
    command: 'container';
    data?: DockerContainerInspect | null;
    container: string;
    error?: string;
};
export type GUIResponseExec = {
    command: 'exec';
    data: { containerId: string; code?: number | null; stderr: string; stdout: string };
    error?: string;
};
export type GUIResponseNetworks = {
    command: 'networks';
    data?: NetworkInfo[];
    error?: string;
};
export type GUIResponseVolumes = {
    command: 'volumes';
    data?: VolumeInfo[];
    error?: string;
};

export type GUIResponse =
    | GUIResponseInfo
    | GUIResponseContainers
    | GUIResponseImages
    | GUIResponseContainer
    | GUIResponseExec
    | GUIResponseNetworks
    | GUIResponseVolumes
    | { command: 'stopped' };

export interface DockerManagerAdapterConfig extends ioBroker.AdapterConfig {
    dockerApi: boolean;
    dockerApiProtocol: 'http' | 'https';
    dockerApiHost: string;
    dockerApiPort: number | string;
}
