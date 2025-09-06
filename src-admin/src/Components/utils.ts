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
