// src/presets.ts
//
// This module provides higher-level preset operations and utilities.
// Basic CRUD is in settings.ts; this handles resolution, validation, and UI helpers.

import type {
    StageName,
    StageConfig,
    PromptPreset,
    SchemaPreset,
    StructuredOutputSchema,
} from './types';
import {
    getSettings,
    getPromptPreset,
    getSchemaPreset,
    getPromptPresets,
    getSchemaPresets,
} from './settings';
import { validateSchema, formatSchema } from './schema';
import { TEMPLATE_PLACEHOLDERS } from './constants';
import { debugLog } from './debug';

// ============================================================================
// STAGE CONFIG RESOLUTION
// ============================================================================

/**
 * Get the effective stage config, resolving presets to actual values.
 * Returns a StageConfig with resolved prompt and schema.
 */
export function getStageConfig(stage: StageName): StageConfig {
    const settings = getSettings();
    const defaults = settings.stageDefaults[stage];

    return {
        promptPresetId: defaults.promptPresetId,
        customPrompt: defaults.customPrompt,
        schemaPresetId: defaults.schemaPresetId,
        customSchema: defaults.customSchema,
        useStructuredOutput: defaults.useStructuredOutput,
    };
}

/**
 * Resolve a stage config to get the actual prompt text.
 * If a preset is selected, returns the preset's prompt.
 * Otherwise returns the custom prompt.
 */
export function resolvePrompt(config: StageConfig): string {
    if (config.promptPresetId) {
        const preset = getPromptPreset(config.promptPresetId);
        if (preset) {
            return preset.prompt;
        }
        debugLog('error', 'Prompt preset not found', { id: config.promptPresetId });
    }

    return config.customPrompt;
}

/**
 * Resolve a stage config to get the actual schema.
 * Returns null if structured output is disabled or no schema is configured.
 */
export function resolveSchema(config: StageConfig): StructuredOutputSchema | null {
    if (!config.useStructuredOutput) {
        return null;
    }

    if (config.schemaPresetId) {
        const preset = getSchemaPreset(config.schemaPresetId);
        if (preset) {
            return preset.schema;
        }
        debugLog('error', 'Schema preset not found', { id: config.schemaPresetId });
    }

    // Try to parse custom schema
    if (config.customSchema) {
        const result = validateSchema(config.customSchema);
        if (result.valid && result.schema) {
            return result.schema;
        }
        debugLog('error', 'Custom schema invalid', { error: result.error });
    }

    return null;
}

/**
 * Create a fresh StageConfig from defaults
 */
export function createStageConfigFromDefaults(stage: StageName): StageConfig {
    const settings = getSettings();
    const defaults = settings.stageDefaults[stage];

    return {
        promptPresetId: defaults.promptPresetId,
        customPrompt: defaults.customPrompt,
        schemaPresetId: defaults.schemaPresetId,
        customSchema: defaults.customSchema,
        useStructuredOutput: defaults.useStructuredOutput,
    };
}

// ============================================================================
// PROMPT TEMPLATE PROCESSING
// ============================================================================

export interface TemplateContext {
  originalCharacter?: string;
  scoreResults?: string;
  rewriteResults?: string;
  charName?: string;
  userName?: string;
}

/**
 * Process a prompt template, replacing placeholders with actual values.
 *
 * Order of operations:
 * 1. Run ST's substituteParams for standard macros ({{time}}, {{date}}, etc.)
 * 2. Replace our custom placeholders ({{original_character}}, {{score_results}}, etc.)
 * 3. Replace {{char}} and {{user}} with our specific character/user names
 *    (This overrides ST's substitution which uses the active chat character)
 */
export function processPromptTemplate(prompt: string, context: TemplateContext): string {
    // First, run ST's macro substitution for standard macros
    // This handles things like {{time}}, {{date}}, {{random}}, etc.
    const { substituteParams } = SillyTavern.getContext();
    let processed = substituteParams(prompt);

    // Now replace our custom placeholders
    if (context.originalCharacter !== undefined) {
        processed = processed.replace(
            new RegExp(escapeRegex(TEMPLATE_PLACEHOLDERS.ORIGINAL_CHARACTER), 'gi'),
            context.originalCharacter,
        );
    }

    if (context.scoreResults !== undefined) {
        processed = processed.replace(
            new RegExp(escapeRegex(TEMPLATE_PLACEHOLDERS.SCORE_RESULTS), 'gi'),
            context.scoreResults,
        );
    }

    if (context.rewriteResults !== undefined) {
        processed = processed.replace(
            new RegExp(escapeRegex(TEMPLATE_PLACEHOLDERS.REWRITE_RESULTS), 'gi'),
            context.rewriteResults,
        );
    }

    // Replace {{char_name}} with our specific character
    if (context.charName !== undefined) {
        processed = processed.replace(
            new RegExp(escapeRegex(TEMPLATE_PLACEHOLDERS.CHARACTER_NAME), 'gi'),
            context.charName,
        );
    }

    // Replace {{user_name}} with our specific user
    if (context.userName !== undefined) {
        processed = processed.replace(
            new RegExp(escapeRegex(TEMPLATE_PLACEHOLDERS.USER_NAME), 'gi'),
            context.userName,
        );
    }

    // IMPORTANT: Also replace {{char}} and {{user}} with our specific names
    // This overrides whatever ST's substituteParams did, because we're working
    // with a specific character from the character list, not the active chat
    if (context.charName !== undefined) {
        processed = processed.replace(/\{\{char\}\}/gi, context.charName);
    }

    if (context.userName !== undefined) {
        processed = processed.replace(/\{\{user\}\}/gi, context.userName);
    }

    return processed;
}

/**
 * Check if a prompt contains any template placeholders
 */
export function promptHasPlaceholders(prompt: string): string[] {
    const found: string[] = [];

    for (const [key, placeholder] of Object.entries(TEMPLATE_PLACEHOLDERS)) {
        if (prompt.toLowerCase().includes(placeholder.toLowerCase())) {
            found.push(key);
        }
    }

    return found;
}

/**
 * Get placeholders that are used but won't have values for a given stage
 */
export function getUnfilledPlaceholders(prompt: string, stage: StageName, hasScore: boolean, hasRewrite: boolean): string[] {
    const used = promptHasPlaceholders(prompt);
    const unfilled: string[] = [];

    for (const placeholder of used) {
        switch (placeholder) {
            case 'SCORE_RESULTS':
                if (!hasScore && stage !== 'score') {
                    unfilled.push('{{score_results}} - no score results available');
                }
                break;
            case 'REWRITE_RESULTS':
                if (!hasRewrite && stage !== 'rewrite') {
                    unfilled.push('{{rewrite_results}} - no rewrite results available');
                }
                break;
            // ORIGINAL_CHARACTER is always available if we have a character
            // CHAR_NAME and USER_NAME are always available
        }
    }

    return unfilled;
}

// ============================================================================
// PRESET UI HELPERS
// ============================================================================

export interface PresetOption {
  id: string;
  name: string;
  isBuiltin: boolean;
  isSelected: boolean;
}

/**
 * Get prompt presets formatted for a dropdown, with selection state
 */
export function getPromptPresetOptions(stage: StageName, selectedId: string | null): PresetOption[] {
    const presets = getPromptPresets(stage);

    return presets.map(p => ({
        id: p.id,
        name: p.isBuiltin ? `${p.name} (builtin)` : p.name,
        isBuiltin: p.isBuiltin,
        isSelected: p.id === selectedId,
    }));
}

/**
 * Get schema presets formatted for a dropdown, with selection state
 */
export function getSchemaPresetOptions(stage: StageName, selectedId: string | null): PresetOption[] {
    const presets = getSchemaPresets(stage);

    return presets.map(p => ({
        id: p.id,
        name: p.isBuiltin ? `${p.name} (builtin)` : p.name,
        isBuiltin: p.isBuiltin,
        isSelected: p.id === selectedId,
    }));
}

/**
 * Get the display name for a preset (handles null/missing)
 */
export function getPresetDisplayName(type: 'prompt' | 'schema', id: string | null): string {
    if (!id) {
        return 'Custom';
    }

    const preset = type === 'prompt' ? getPromptPreset(id) : getSchemaPreset(id);
    if (!preset) {
        return 'Unknown';
    }

    return preset.name;
}

// ============================================================================
// SCHEMA HELPERS
// ============================================================================

/**
 * Get the schema JSON string for editing, either from preset or custom
 */
export function getSchemaForEditing(config: StageConfig): string {
    if (config.schemaPresetId) {
        const preset = getSchemaPreset(config.schemaPresetId);
        if (preset) {
            return formatSchema(preset.schema);
        }
    }

    return config.customSchema;
}

/**
 * Validate a schema string and return user-friendly result
 */
export interface SchemaValidationUIResult {
  isValid: boolean;
  isEmpty: boolean;
  errorMessage: string | null;
  warnings: string[];
  info: string[];
}

export function validateSchemaForUI(schemaJson: string): SchemaValidationUIResult {
    if (!schemaJson.trim()) {
        return {
            isValid: true,
            isEmpty: true,
            errorMessage: null,
            warnings: [],
            info: ['Empty schema = structured output disabled'],
        };
    }

    const result = validateSchema(schemaJson);

    return {
        isValid: result.valid,
        isEmpty: false,
        errorMessage: result.error || null,
        warnings: result.warnings || [],
        info: result.info || [],
    };
}

// ============================================================================
// PRESET VALIDATION
// ============================================================================

/**
 * Validate a prompt preset before saving
 */
export interface PresetValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validatePromptPreset(preset: Partial<PromptPreset>): PresetValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!preset.name?.trim()) {
        errors.push('Name is required');
    } else if (preset.name.length > 100) {
        errors.push('Name must be 100 characters or less');
    }

    if (!preset.prompt?.trim()) {
        errors.push('Prompt is required');
    } else if (preset.prompt.length > 50000) {
        errors.push('Prompt is too long (max 50,000 characters)');
    }

    // Check for common issues
    if (preset.prompt) {
        if (preset.prompt.includes('{{') && !promptHasPlaceholders(preset.prompt).length) {
            warnings.push('Prompt contains {{ but no recognized placeholders');
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Validate a schema preset before saving
 */
export function validateSchemaPreset(preset: Partial<SchemaPreset>): PresetValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!preset.name?.trim()) {
        errors.push('Name is required');
    } else if (preset.name.length > 100) {
        errors.push('Name must be 100 characters or less');
    }

    if (!preset.schema) {
        errors.push('Schema is required');
    } else {
        const schemaJson = typeof preset.schema === 'string'
            ? preset.schema
            : JSON.stringify(preset.schema);

        const result = validateSchema(schemaJson);
        if (!result.valid) {
            errors.push(result.error || 'Invalid schema');
        }
        if (result.warnings) {
            warnings.push(...result.warnings);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

// ============================================================================
// UTILITIES
// ============================================================================

function escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if a preset name is unique (for validation)
 */
export function isPresetNameUnique(type: 'prompt' | 'schema', name: string, excludeId?: string): boolean {
    const presets = type === 'prompt' ? getPromptPresets() : getSchemaPresets();

    return !presets.some(p =>
        p.name.toLowerCase() === name.toLowerCase() && p.id !== excludeId,
    );
}

/**
 * Generate a unique preset name by appending a number if needed
 */
export function generateUniquePresetName(type: 'prompt' | 'schema', baseName: string): string {
    let name = baseName;
    let counter = 1;

    while (!isPresetNameUnique(type, name)) {
        name = `${baseName} (${counter})`;
        counter++;
    }

    return name;
}
