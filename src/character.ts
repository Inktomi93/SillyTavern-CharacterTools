// src/character.ts
//
// Character utilities - field extraction, formatting, etc.

import { CHARACTER_FIELDS } from './constants';
import type { Character, PopulatedField } from './types';

// ============================================================================
// FIELD EXTRACTION
// ============================================================================

/**
 * Get all populated fields from a character
 */
export function getPopulatedFields(char: Character): PopulatedField[] {
    return CHARACTER_FIELDS
        .filter(field => {
            const val = char[field.key];
            return val && typeof val === 'string' && val.trim().length > 0;
        })
        .map(field => {
            const value = (char[field.key] as string).trim();
            return {
                key: field.key,
                label: field.label,
                value,
                charCount: value.length,
                scoreable: field.scoreable,
            };
        });
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
 * Build a formatted character summary for prompts
 */
export function buildCharacterSummary(char: Character): string {
    const fields = getPopulatedFields(char);
    const sections = fields.map(f => `### ${f.label}\n${f.value}`);
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

    // Check for very short fields
    for (const field of fields) {
        if (field.charCount < 20 && field.scoreable) {
            issues.push(`${field.label} is very short (${field.charCount} chars)`);
        }
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
