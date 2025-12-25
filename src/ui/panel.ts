// src/ui/panel.ts
//
// Extension panel - minimal, just the launch button and settings access.

import { MODULE_NAME, EXTENSION_PATH } from '../constants';
import { getSettings, setDebugMode } from '../settings';
import { debugLog } from '../debug';
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
        console.error(`[${MODULE_NAME}] Extensions container not found`);
        return;
    }

    try {
        const html = await renderExtensionTemplateAsync(EXTENSION_PATH, 'templates/panel', {}, true);

        const wrapper = document.createElement('div');
        wrapper.id = `${MODULE_NAME}_wrapper`;
        wrapper.innerHTML = html;
        container.appendChild(wrapper);

        initEventListeners();

        debugLog('info', 'Panel initialized', null);
    } catch (error) {
        console.error(`[${MODULE_NAME}] Failed to load panel template:`, error);
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
