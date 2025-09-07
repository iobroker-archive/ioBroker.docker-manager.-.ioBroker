import type React from 'react';

const styles: Record<'tab' | 'helpText', React.CSSProperties> = {
    tab: {
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        height: 'calc(100% - 16px)',
        overflowY: 'auto',
        padding: 8,
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
    },
    helpText: { fontStyle: 'italic', color: '#888' },
};

export default styles;
