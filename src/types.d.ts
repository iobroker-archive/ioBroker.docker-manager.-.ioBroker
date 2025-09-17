import type { DockerContainerInspect } from './lib/dockerManager.types.ts';

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

export type GUIRequest =
    | GUIRequestInfo
    | GUIRequestImages
    | GUIRequestContainers
    | GUIRequestContainer
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
export type GUIResponseNetwork = {
    command: 'networks';
    data?: NetworkInfo[];
    error?: string;
};

export type GUIResponse =
    | GUIResponseInfo
    | GUIResponseContainers
    | GUIResponseImages
    | GUIResponseContainer
    | GUIResponseExec
    | GUIResponseNetwork
    | { command: 'stopped' };
