// src/index.ts
//
// Extension entry point

import { getSettings } from './settings';
import { initPanel } from './ui/panel';
import { debugLog } from './debug';

function init(): void {
    debugLog('info', 'Extension initializing', { version: '2.0.0' });

    initPanel();
    registerEventListeners();

    debugLog('info', 'Extension loaded', getSettings());
}

function registerEventListeners(): void {
    const { eventSource, eventTypes } = SillyTavern.getContext();

    // Log API changes for debugging
    eventSource.on(eventTypes.CHATCOMPLETION_SOURCE_CHANGED, () => {
        debugLog('info', 'Chat completion source changed', null);
    });

    eventSource.on(eventTypes.CHATCOMPLETION_MODEL_CHANGED, () => {
        debugLog('info', 'Chat completion model changed', null);
    });

    debugLog('info', 'Event listeners registered', null);
}

// Wait for app ready
const { eventSource, eventTypes } = SillyTavern.getContext();
eventSource.on(eventTypes.APP_READY, init);
