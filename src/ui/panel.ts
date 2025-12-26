// src/ui/panel.ts
//
// Extension panel - minimal, just the launch button and settings access.

import { MODULE_NAME, EXTENSION_PATH, VERSION } from '../constants';
import { getSettings, setDebugMode } from '../settings';
import { debugLog, logError } from '../debug';
import { openMainPopup } from './popup';

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the extension panel in ST's extensions settings
 */
export async function initPanel(): Promise<void> {
    const { renderExtensionTemplateAsync } = SillyTavern.getContext();

    const container = document.getElementById('extensions_settings');
    if (!container) {
        logError('Extensions container not found', null);
        return;
    }

    try {
        const html = await renderExtensionTemplateAsync(EXTENSION_PATH, 'templates/panel', { version: VERSION }, true);

        const wrapper = document.createElement('div');
        wrapper.id = `${MODULE_NAME}_wrapper`;
        wrapper.className = 'extension_container';  // ADD THIS LINE
        wrapper.innerHTML = html;
        container.appendChild(wrapper);

        initEventListeners();

        debugLog('info', 'Panel initialized', null);
    } catch (error) {
        logError('Failed to load panel template', error);
    }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function initEventListeners(): void {
    // Open button
    const openBtn = document.getElementById(`${MODULE_NAME}_open_btn`);
    openBtn?.addEventListener('click', () => {
        openMainPopup();
    });

    // Debug toggle
    const debugToggle = document.getElementById(`${MODULE_NAME}_debug_toggle`) as HTMLInputElement;
    if (debugToggle) {
        debugToggle.checked = getSettings().debugMode;
        debugToggle.addEventListener('change', () => {
            setDebugMode(debugToggle.checked);
            toastr.info(`Debug mode ${debugToggle.checked ? 'enabled' : 'disabled'}`);
        });
    }
}

// ============================================================================
// REFRESH
// ============================================================================

/**
 * Refresh panel state (called when settings change externally)
 */
export function refreshPanel(): void {
    const debugToggle = document.getElementById(`${MODULE_NAME}_debug_toggle`) as HTMLInputElement;
    if (debugToggle) {
        debugToggle.checked = getSettings().debugMode;
    }
}
