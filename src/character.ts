// src/character.ts
//
// Character utilities - field extraction, formatting, etc.

import { CHARACTER_FIELDS } from './constants';
import type { Character, CharacterField, PopulatedField, DepthPrompt, CharacterBook, FieldSelection } from './types';

// ============================================================================
// FIELD VALUE EXTRACTION
// ============================================================================

/**
 * Get a value from a character using a dot-notation path.
 * Supports paths like 'data.system_prompt' or 'data.extensions.depth_prompt'
 */
function getValueByPath(obj: Character, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
        if (current === null || current === undefined || typeof current !== 'object') {
            return undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }

    return current;
}

/**
 * Check if a value is non-empty and usable
 */
function isPopulatedValue(value: unknown, type: CharacterField['type']): boolean {
    if (value === null || value === undefined) {
        return false;
    }

    switch (type) {
        case 'array':
            return Array.isArray(value) && value.length > 0;

        case 'object':
            if (typeof value !== 'object') return false;
            // For depth_prompt, check if prompt has content
            if ('prompt' in value && typeof (value as DepthPrompt).prompt === 'string') {
                return (value as DepthPrompt).prompt.trim().length > 0;
            }
            // For character_book, check if entries exist
            if ('entries' in value && Array.isArray((value as CharacterBook).entries)) {
                return (value as CharacterBook).entries.length > 0;
            }
            // Generic object - has any keys
            return Object.keys(value).length > 0;

        case 'string':
        default:
            return typeof value === 'string' && value.trim().length > 0;
    }
}

/**
 * Format a field value as a string for display/prompts
 */
function formatFieldValue(value: unknown, field: CharacterField): string {
    const type = field.type || 'string';

    switch (type) {
        case 'array':
            if (!Array.isArray(value)) return '';
            // Format as numbered list
            return value
                .map((item, i) => `${i + 1}. ${String(item).trim()}`)
                .join('\n');

        case 'object':
            return formatObjectField(value, field.key);

        case 'string':
        default:
            return typeof value === 'string' ? value.trim() : String(value);
    }
}

/**
 * Format special object fields
 */
function formatObjectField(value: unknown, key: string): string {
    if (!value || typeof value !== 'object') return '';

    switch (key) {
        case 'depth_prompt': {
            const dp = value as DepthPrompt;
            if (!dp.prompt?.trim()) return '';
            return `[Depth: ${dp.depth}, Role: ${dp.role}]\n${dp.prompt.trim()}`;
        }

        case 'character_book': {
            const book = value as CharacterBook;
            if (!book.entries?.length) return '';

            const lines: string[] = [];
            if (book.name) {
                lines.push(`Lorebook: ${book.name}`);
            }
            lines.push(`Entries: ${book.entries.length}`);
            lines.push('');

            // List entries with keywords
            for (const entry of book.entries) {
                const status = entry.enabled ? '✓' : '✗';
                const keys = entry.keys.slice(0, 5).join(', ');
                const keysSuffix = entry.keys.length > 5 ? ` (+${entry.keys.length - 5} more)` : '';
                const comment = entry.comment || `Entry ${entry.id}`;
                lines.push(`${status} ${comment}: [${keys}${keysSuffix}]`);

                // Include content preview (first 100 chars)
                if (entry.content) {
                    const preview = entry.content.trim().substring(0, 100);
                    const suffix = entry.content.length > 100 ? '...' : '';
                    lines.push(`   ${preview}${suffix}`);
                }
            }

            return lines.join('\n');
        }

        default:
            // Generic object - JSON stringify
            try {
                return JSON.stringify(value, null, 2);
            } catch {
                return '[Complex Object]';
            }
    }
}

// ============================================================================
// FIELD EXTRACTION
// ============================================================================

/**
 * Get all populated fields from a character
 */
export function getPopulatedFields(char: Character): PopulatedField[] {
    const populated: PopulatedField[] = [];

    for (const field of CHARACTER_FIELDS) {
        const type = field.type || 'string';
        let value = getValueByPath(char, field.path);

        // For top-level fields, also check direct access
        if (!isPopulatedValue(value, type) && !field.path.includes('.')) {
            value = (char as unknown as Record<string, unknown>)[field.key];
        }

        // Special case: creator_notes can also be 'creatorcomment' at top level
        if (field.key === 'creator_notes' && !isPopulatedValue(value, type)) {
            const legacy = char.creatorcomment;
            if (legacy && typeof legacy === 'string' && legacy.trim()) {
                value = legacy;
            }
        }

        if (!isPopulatedValue(value, type)) {
            continue;
        }

        const formatted = formatFieldValue(value, field);
        if (!formatted) continue;

        populated.push({
            key: field.key,
            label: field.label,
            value: formatted,
            rawValue: value,
            charCount: formatted.length,
            type: field.type,
        });
    }

    return populated;
}

/**
 * Get total character count across all fields
 */
export function getTotalCharCount(char: Character): number {
    return getPopulatedFields(char).reduce((sum, f) => sum + f.charCount, 0);
}

/**
 * Get count of populated fields
 */
export function getPopulatedFieldCount(char: Character): number {
    return getPopulatedFields(char).length;
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Build a formatted character summary for prompts (all fields)
 */
export function buildCharacterSummary(char: Character): string {
    const fields = getPopulatedFields(char);
    const sections = fields.map(f => `### ${f.label}\n${f.value}`);
    return `# CHARACTER: ${char.name}\n\n${sections.join('\n\n')}`;
}

/**
 * Build character summary using only selected fields.
 * For alternate_greetings, only include greetings at selected indices.
 */
export function buildCharacterSummaryFromSelection(
    char: Character,
    selection: FieldSelection,
): string {
    const sections: string[] = [];
    const allFields = getPopulatedFields(char);

    for (const field of allFields) {
        const selected = selection[field.key];

        // Not selected at all
        if (!selected) continue;

        // Array field with no indices selected
        if (Array.isArray(selected) && selected.length === 0) continue;

        if (field.key === 'alternate_greetings' && Array.isArray(selected)) {
            // Only include selected greeting indices
            const greetings = field.rawValue as string[];
            const selectedGreetings = (selected as number[])
                .filter(i => i >= 0 && i < greetings.length)
                .map(i => `**Greeting ${i + 1}:**\n${greetings[i].trim()}`)
                .join('\n\n');

            if (selectedGreetings) {
                sections.push(`### ${field.label}\n\n${selectedGreetings}`);
            }
        } else {
            sections.push(`### ${field.label}\n\n${field.value}`);
        }
    }

    if (sections.length === 0) {
        return `# CHARACTER: ${char.name}\n\n(No fields selected)`;
    }

    return `# CHARACTER: ${char.name}\n\n${sections.join('\n\n')}`;
}

/**
 * Build a compact character summary (for display)
 */
export function buildCompactSummary(char: Character): string {
    const fields = getPopulatedFields(char);
    return `${char.name} - ${fields.length} fields, ${getTotalCharCount(char).toLocaleString()} chars`;
}

/**
 * Get a preview of a field value (truncated)
 */
export function getFieldPreview(value: string, maxLength: number = 100): string {
    if (value.length <= maxLength) {
        return value;
    }
    return value.substring(0, maxLength - 3) + '...';
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check if a character has enough content to analyze
 */
export function hasAnalyzableContent(char: Character): boolean {
    const fields = getPopulatedFields(char);
    return fields.length > 0;
}

/**
 * Get validation issues with a character
 */
export function validateCharacter(char: Character): string[] {
    const issues: string[] = [];

    if (!char.name?.trim()) {
        issues.push('Character has no name');
    }

    const fields = getPopulatedFields(char);
    if (fields.length === 0) {
        issues.push('Character has no populated fields');
    }

    return issues;
}

// ============================================================================
// SEARCH
// ============================================================================

/**
 * Prepare character data for fuzzy search
 */
export function prepareForSearch(chars: Character[]): Array<{ char: Character; index: number; searchText: string }> {
    return chars
        .map((char, index) => ({
            char,
            index,
            searchText: [
                char.name,
                char.description?.substring(0, 200),
                char.personality?.substring(0, 100),
            ].filter(Boolean).join(' ').toLowerCase(),
        }))
        .filter(item => item.char?.name);
}
