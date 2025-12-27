// src/index.ts
//
// Extension entry point

import { getSettings } from './settings';
import { initPanel } from './ui/panel';
import { debugLog, logError } from './debug';
import { VERSION } from './constants';
import { testPipelineFlow } from './tests/pipeline-flow-test';

function init(): void {
    try {
        debugLog('info', 'Extension initializing', { version: VERSION });

        initPanel();
        registerEventListeners();

        // Load test utilities in debug mode
        if (getSettings().debugMode) {
            (window as unknown as { testPipelineFlow: typeof testPipelineFlow }).testPipelineFlow = testPipelineFlow;
            debugLog('info', 'Test utilities loaded: window.testPipelineFlow()', null);
        }

        debugLog('info', 'Extension loaded', getSettings());
    } catch (error) {
        logError('Extension initialization failed', error);
        toastr.error('Character Tools failed to initialize. Check console for details.');
    }
}

function registerEventListeners(): void {
    const { eventSource, eventTypes } = SillyTavern.getContext();

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
