// src/persistence.ts
//
// Persistence layer for iteration history using localforage.
// Stores iteration history per-character so users can resume work across sessions.

import { MODULE_NAME } from './constants';
import { debugLog, logError } from './debug';
import type { Character, IterationSnapshot } from './types';

// ============================================================================
// KEY GENERATION
// ============================================================================

/**
 * Generate a unique key for a character.
 * Uses avatar + name since avatar alone isn't unique.
 */
export function getCharacterKey(character: Character): string {
    // Sanitize for storage key - remove special chars
    const sanitizedName = character.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const sanitizedAvatar = character.avatar.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${MODULE_NAME}_history_${sanitizedAvatar}_${sanitizedName}`;
}

// ============================================================================
// ITERATION HISTORY PERSISTENCE
// ============================================================================

/**
 * Save iteration history for a character
 */
export async function saveIterationHistory(
    character: Character,
    history: IterationSnapshot[],
): Promise<boolean> {
    const { localforage } = SillyTavern.libs;
    const key = getCharacterKey(character);

    try {
        await localforage.setItem(key, {
            characterName: character.name,
            characterAvatar: character.avatar,
            history,
            savedAt: Date.now(),
        });

        debugLog('info', 'Iteration history saved', {
            key,
            characterName: character.name,
            historyLength: history.length,
        });

        return true;
    } catch (e) {
        logError('Failed to save iteration history', { key, error: e });
        return false;
    }
}

/**
 * Load iteration history for a character
 */
export async function loadIterationHistory(
    character: Character,
): Promise<IterationSnapshot[] | null> {
    const { localforage } = SillyTavern.libs;
    const key = getCharacterKey(character);

    try {
        const data = await localforage.getItem(key) as {
            characterName: string;
            characterAvatar: string;
            history: IterationSnapshot[];
            savedAt: number;
        } | null;

        if (!data) {
            debugLog('info', 'No iteration history found', { key });
            return null;
        }

        // Verify it's for the same character (in case of key collision)
        if (data.characterName !== character.name || data.characterAvatar !== character.avatar) {
            debugLog('info', 'Iteration history key collision, ignoring', {
                key,
                storedName: data.characterName,
                currentName: character.name,
            });
            return null;
        }

        debugLog('info', 'Iteration history loaded', {
            key,
            characterName: character.name,
            historyLength: data.history.length,
            savedAt: new Date(data.savedAt).toISOString(),
        });

        return data.history;
    } catch (e) {
        logError('Failed to load iteration history', { key, error: e });
        return null;
    }
}

/**
 * Clear iteration history for a character
 */
export async function clearIterationHistory(character: Character): Promise<boolean> {
    const { localforage } = SillyTavern.libs;
    const key = getCharacterKey(character);

    try {
        await localforage.removeItem(key);

        debugLog('info', 'Iteration history cleared', {
            key,
            characterName: character.name,
        });

        return true;
    } catch (e) {
        logError('Failed to clear iteration history', { key, error: e });
        return false;
    }
}

/**
 * Get all stored iteration history keys (for debugging/cleanup)
 */
export async function getAllHistoryKeys(): Promise<string[]> {
    const { localforage } = SillyTavern.libs;

    try {
        const allKeys = await localforage.keys();
        return allKeys.filter((key: string) => key.startsWith(`${MODULE_NAME}_history_`));
    } catch (e) {
        logError('Failed to get history keys', { error: e });
        return [];
    }
}

/**
 * Clear all iteration history (for debugging/cleanup)
 */
export async function clearAllIterationHistory(): Promise<number> {
    const keys = await getAllHistoryKeys();
    const { localforage } = SillyTavern.libs;

    let cleared = 0;
    for (const key of keys) {
        try {
            await localforage.removeItem(key);
            cleared++;
        } catch (e) {
            logError('Failed to clear history key', { key, error: e });
        }
    }

    debugLog('info', 'All iteration history cleared', { cleared, total: keys.length });
    return cleared;
}
