// src/debug.ts
//
// Debug logging and diagnostics for the extension.

import { MODULE_NAME, MAX_DEBUG_LOG_ENTRIES } from './constants';
import { getSettings } from './settings';
import type { DebugLogEntry, DebugLogType } from './types';

// ============================================================================
// LOG STORAGE
// ============================================================================

const logEntries: DebugLogEntry[] = [];

// ============================================================================
// LOGGING
// ============================================================================

/**
 * Check if debug mode is enabled
 */
export function isDebugMode(): boolean {
    try {
        return getSettings().debugMode;
    } catch {
        // Settings might not be initialized yet
        return false;
    }
}

/**
 * Log a debug entry
 */
export function debugLog(type: DebugLogType, label: string, data: unknown): void {
    const entry: DebugLogEntry = {
        timestamp: new Date(),
        type,
        label,
        data,
    };

    // Always store (for later viewing even if debug mode was off)
    logEntries.unshift(entry);
    if (logEntries.length > MAX_DEBUG_LOG_ENTRIES) {
        logEntries.pop();
    }

    // Errors always log to console regardless of debug mode
    if (type === 'error') {
        console.error(`[${MODULE_NAME}:ERROR]`, label, data);
        return;
    }

    // Other types only log if debug mode is on, and use console.debug
    // so users can filter them out in browser devtools
    if (isDebugMode()) {
        const prefix = `[${MODULE_NAME}:${type.toUpperCase()}]`;
        console.debug(prefix, label, data);
    }
}

/**
 * Log an error - always outputs to console and stores in debug log.
 * Use this for errors that should never be silently swallowed.
 */
export function logError(label: string, data: unknown): void {
    debugLog('error', label, data);
}

// ============================================================================
// LOG ACCESS
// ============================================================================

/**
 * Get all debug logs
 */
export function getDebugLogs(): DebugLogEntry[] {
    return [...logEntries];
}

/**
 * Get logs filtered by type
 */
export function getDebugLogsByType(type: DebugLogType): DebugLogEntry[] {
    return logEntries.filter(e => e.type === type);
}

/**
 * Clear all debug logs
 */
export function clearDebugLogs(): void {
    logEntries.length = 0;
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Format a log entry for display
 */
export function formatLogEntry(entry: DebugLogEntry): string {
    const time = entry.timestamp.toLocaleTimeString();
    const icon = {
        request: '📤',
        response: '📥',
        error: '❌',
        info: 'ℹ️',
        state: '🔄',
    }[entry.type];

    return `${icon} [${time}] ${entry.label}`;
}

/**
 * Format log data for display
 */
export function formatLogData(data: unknown): string {
    try {
        if (data === null) return 'null';
        if (data === undefined) return 'undefined';
        if (typeof data === 'string') return data;
        return JSON.stringify(data, null, 2);
    } catch {
        return String(data);
    }
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

/**
 * Collect debug info for current state
 */
export function collectDebugInfo(): Record<string, unknown> {
    const context = SillyTavern.getContext();

    let settings;
    try {
        settings = getSettings();
    } catch {
        settings = { error: 'Failed to load settings' };
    }

    return {
        extension: {
            settings: {
                useCurrentSettings: settings.useCurrentSettings,
                debugMode: settings.debugMode,
                generationConfig: settings.generationConfig,
                systemPromptLength: settings.systemPrompt?.length || 0,
                promptPresetCount: settings.promptPresets?.length || 0,
                schemaPresetCount: settings.schemaPresets?.length || 0,
            },
        },
        sillytavern: {
            mainApi: context.mainApi,
            onlineStatus: context.onlineStatus,
            chatCompletionSource: context.chatCompletionSettings?.chat_completion_source,
            currentModel: context.chatCompletionSettings?.openrouter_model ||
                    context.chatCompletionSettings?.model_openai_select,
            maxContext: context.maxContext,
            characterCount: context.characters?.length ?? 0,
            hasActiveChat: !!context.chat?.length,
        },
        logs: {
            total: logEntries.length,
            errors: logEntries.filter(e => e.type === 'error').length,
            recent: logEntries.slice(0, 10).map(e => ({
                type: e.type,
                label: e.label,
                time: e.timestamp.toISOString(),
            })),
        },
    };
}

/**
 * Export debug info as JSON string
 */
export function exportDebugInfo(): string {
    return JSON.stringify(collectDebugInfo(), null, 2);
}
