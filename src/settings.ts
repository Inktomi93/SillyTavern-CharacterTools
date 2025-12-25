// src/settings.ts
import {
    MODULE_NAME,
    DEFAULT_SETTINGS,
    DEFAULT_SYSTEM_PROMPT,
    DEFAULT_GENERATION_CONFIG,
    DEFAULT_STAGE_DEFAULTS,
    BUILTIN_PROMPT_PRESETS,
    BUILTIN_SCHEMA_PRESETS,
    SETTINGS_VERSION,
} from './constants';
import type {
    Settings,
    GenerationConfig,
    StageName,
    StageDefaults,
    PromptPreset,
    SchemaPreset,
    StructuredOutputSchema,
    JsonSchemaValue,
} from './types';
import { debugLog } from './debug';

// ============================================================================
// SETTINGS ACCESS
// ============================================================================

/**
 * Get current settings, initializing with defaults if needed.
 * Handles migrations from older versions.
 */
export function getSettings(): Settings {
    const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();

    if (!extensionSettings[MODULE_NAME]) {
        debugLog('info', 'Initializing settings with defaults', null);
        extensionSettings[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
        saveSettingsDebounced();
        return extensionSettings[MODULE_NAME] as Settings;
    }

    const settings = extensionSettings[MODULE_NAME] as Settings;
    let needsSave = false;

    // Run migrations if version is old or missing
    if (!settings.settingsVersion || settings.settingsVersion < SETTINGS_VERSION) {
        needsSave = migrateSettings(settings);
    }

    // Ensure all required fields exist (defensive)
    needsSave = ensureSettingsIntegrity(settings) || needsSave;

    if (needsSave) {
        saveSettingsDebounced();
    }

    return settings;
}

/**
 * Migrate settings from older versions
 */
function migrateSettings(settings: Settings): boolean {
    const oldVersion = settings.settingsVersion || 1;
    debugLog('info', 'Migrating settings', { from: oldVersion, to: SETTINGS_VERSION });

    let migrated = false;

    // v1 -> v2: Add preset system, stage defaults
    if (oldVersion < 2) {
    // Migrate from old flat structure to new preset-based structure

        // Handle old useRawMode -> useCurrentSettings
        if ((settings as unknown as { useRawMode?: boolean }).useRawMode !== undefined) {
            settings.useCurrentSettings = !(settings as unknown as { useRawMode?: boolean }).useRawMode;
            delete (settings as unknown as { useRawMode?: boolean }).useRawMode;
        }

        // Handle old jsonSchema -> convert to preset if custom
        const oldSchema = (settings as unknown as { jsonSchema?: unknown }).jsonSchema;
        if (oldSchema && typeof oldSchema === 'object') {
            // User had a custom schema, we'll lose it but that's okay for migration
            delete (settings as unknown as { jsonSchema?: unknown }).jsonSchema;
        }

        // Handle old useStructuredOutput
        const oldUseStructured = (settings as unknown as { useStructuredOutput?: boolean }).useStructuredOutput;
        if (oldUseStructured !== undefined) {
            // Apply to score stage default
            if (!settings.stageDefaults) {
                settings.stageDefaults = structuredClone(DEFAULT_STAGE_DEFAULTS);
            }
            settings.stageDefaults.score.useStructuredOutput = oldUseStructured;
            delete (settings as unknown as { useStructuredOutput?: boolean }).useStructuredOutput;
        }

        migrated = true;
    }

    settings.settingsVersion = SETTINGS_VERSION;
    return migrated;
}

/**
 * Ensure all required settings fields exist
 */
function ensureSettingsIntegrity(settings: Settings): boolean {
    let modified = false;

    // Generation config
    if (!settings.generationConfig) {
        settings.generationConfig = structuredClone(DEFAULT_GENERATION_CONFIG);
        modified = true;
    } else {
    // Ensure all generation config fields exist
        const gc = settings.generationConfig;
        if (gc.frequencyPenalty === undefined) { gc.frequencyPenalty = 0; modified = true; }
        if (gc.presencePenalty === undefined) { gc.presencePenalty = 0; modified = true; }
        if (gc.topP === undefined) { gc.topP = 1; modified = true; }
    }

    // System prompt
    if (settings.systemPrompt === undefined) {
        settings.systemPrompt = DEFAULT_SYSTEM_PROMPT;
        modified = true;
    }

    // Presets - ensure builtins exist
    if (!settings.promptPresets) {
        settings.promptPresets = [...BUILTIN_PROMPT_PRESETS];
        modified = true;
    } else {
    // Ensure all builtins are present (user might have old version)
        const existingIds = new Set(settings.promptPresets.map(p => p.id));
        for (const builtin of BUILTIN_PROMPT_PRESETS) {
            if (!existingIds.has(builtin.id)) {
                settings.promptPresets.push(structuredClone(builtin));
                modified = true;
            }
        }
    }

    if (!settings.schemaPresets) {
        settings.schemaPresets = [...BUILTIN_SCHEMA_PRESETS];
        modified = true;
    } else {
        const existingIds = new Set(settings.schemaPresets.map(p => p.id));
        for (const builtin of BUILTIN_SCHEMA_PRESETS) {
            if (!existingIds.has(builtin.id)) {
                settings.schemaPresets.push(structuredClone(builtin));
                modified = true;
            }
        }
    }

    // Stage defaults
    if (!settings.stageDefaults) {
        settings.stageDefaults = structuredClone(DEFAULT_STAGE_DEFAULTS);
        modified = true;
    } else {
    // Ensure all stages have defaults
        for (const stage of ['score', 'rewrite', 'analyze'] as const) {
            if (!settings.stageDefaults[stage]) {
                settings.stageDefaults[stage] = structuredClone(DEFAULT_STAGE_DEFAULTS[stage]);
                modified = true;
            }
        }
    }

    // Debug mode
    if (settings.debugMode === undefined) {
        settings.debugMode = false;
        modified = true;
    }

    // useCurrentSettings
    if (settings.useCurrentSettings === undefined) {
        settings.useCurrentSettings = true;
        modified = true;
    }

    return modified;
}

// ============================================================================
// SETTINGS UPDATES
// ============================================================================

/**
 * Update a single setting value
 */
export function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
    const settings = extensionSettings[MODULE_NAME] as Settings;
    settings[key] = value;
    saveSettingsDebounced();
    debugLog('info', 'Setting updated', { key, value: typeof value === 'object' ? '[object]' : value });
}

/**
 * Update generation config (partial update)
 */
export function updateGenerationConfig(updates: Partial<GenerationConfig>): void {
    const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
    const settings = extensionSettings[MODULE_NAME] as Settings;

    if (!settings.generationConfig) {
        settings.generationConfig = structuredClone(DEFAULT_GENERATION_CONFIG);
    }

    settings.generationConfig = { ...settings.generationConfig, ...updates };
    saveSettingsDebounced();
    debugLog('info', 'Generation config updated', updates);
}

/**
 * Update system prompt
 */
export function updateSystemPrompt(prompt: string): void {
    updateSetting('systemPrompt', prompt);
}

/**
 * Reset system prompt to default
 */
export function resetSystemPrompt(): void {
    updateSetting('systemPrompt', DEFAULT_SYSTEM_PROMPT);
}

/**
 * Update stage defaults
 */
export function updateStageDefaults(stage: StageName, updates: Partial<StageDefaults>): void {
    const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
    const settings = extensionSettings[MODULE_NAME] as Settings;

    if (!settings.stageDefaults) {
        settings.stageDefaults = structuredClone(DEFAULT_STAGE_DEFAULTS);
    }

    if (!settings.stageDefaults[stage]) {
        settings.stageDefaults[stage] = structuredClone(DEFAULT_STAGE_DEFAULTS[stage]);
    }

    settings.stageDefaults[stage] = { ...settings.stageDefaults[stage], ...updates };
    saveSettingsDebounced();
    debugLog('info', 'Stage defaults updated', { stage, updates });
}

/**
 * Reset stage defaults to builtin values
 */
export function resetStageDefaults(stage: StageName): void {
    const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
    const settings = extensionSettings[MODULE_NAME] as Settings;

    if (!settings.stageDefaults) {
        settings.stageDefaults = structuredClone(DEFAULT_STAGE_DEFAULTS);
    }

    settings.stageDefaults[stage] = structuredClone(DEFAULT_STAGE_DEFAULTS[stage]);
    saveSettingsDebounced();
    debugLog('info', 'Stage defaults reset', { stage });
}

/**
 * Set debug mode
 */
export function setDebugMode(enabled: boolean): void {
    updateSetting('debugMode', enabled);
}

// ============================================================================
// PRESET MANAGEMENT
// ============================================================================

/**
 * Get all prompt presets, optionally filtered by stage
 */
export function getPromptPresets(stage?: StageName): PromptPreset[] {
    const settings = getSettings();

    if (!stage) {
        return settings.promptPresets;
    }

    return settings.promptPresets.filter(p =>
        p.stages.length === 0 || p.stages.includes(stage),
    );
}

/**
 * Get a specific prompt preset by ID
 */
export function getPromptPreset(id: string): PromptPreset | null {
    const settings = getSettings();
    return settings.promptPresets.find(p => p.id === id) || null;
}

/**
 * Save a new prompt preset
 */
export function savePromptPreset(preset: Omit<PromptPreset, 'id' | 'isBuiltin' | 'createdAt' | 'updatedAt'>): PromptPreset {
    const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
    const settings = extensionSettings[MODULE_NAME] as Settings;
    const { uuidv4 } = SillyTavern.getContext();

    const now = Date.now();
    const newPreset: PromptPreset = {
        ...preset,
        id: `custom_prompt_${uuidv4()}`,
        isBuiltin: false,
        createdAt: now,
        updatedAt: now,
    };

    settings.promptPresets.push(newPreset);
    saveSettingsDebounced();
    debugLog('info', 'Prompt preset saved', { id: newPreset.id, name: newPreset.name });

    return newPreset;
}

/**
 * Update an existing prompt preset (only custom presets)
 */
export function updatePromptPreset(id: string, updates: Partial<Omit<PromptPreset, 'id' | 'isBuiltin' | 'createdAt'>>): boolean {
    const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
    const settings = extensionSettings[MODULE_NAME] as Settings;

    const index = settings.promptPresets.findIndex(p => p.id === id);
    if (index === -1) return false;

    const preset = settings.promptPresets[index];
    if (preset.isBuiltin) {
        debugLog('error', 'Cannot update builtin preset', { id });
        return false;
    }

    settings.promptPresets[index] = {
        ...preset,
        ...updates,
        updatedAt: Date.now(),
    };

    saveSettingsDebounced();
    debugLog('info', 'Prompt preset updated', { id });
    return true;
}

/**
 * Delete a prompt preset (only custom presets)
 */
export function deletePromptPreset(id: string): boolean {
    const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
    const settings = extensionSettings[MODULE_NAME] as Settings;

    const index = settings.promptPresets.findIndex(p => p.id === id);
    if (index === -1) return false;

    const preset = settings.promptPresets[index];
    if (preset.isBuiltin) {
        debugLog('error', 'Cannot delete builtin preset', { id });
        return false;
    }

    settings.promptPresets.splice(index, 1);

    // Clear any stage defaults that reference this preset
    for (const stage of ['score', 'rewrite', 'analyze'] as const) {
        if (settings.stageDefaults[stage]?.promptPresetId === id) {
            settings.stageDefaults[stage].promptPresetId = null;
        }
    }

    saveSettingsDebounced();
    debugLog('info', 'Prompt preset deleted', { id });
    return true;
}

/**
 * Get all schema presets, optionally filtered by stage
 */
export function getSchemaPresets(stage?: StageName): SchemaPreset[] {
    const settings = getSettings();

    if (!stage) {
        return settings.schemaPresets;
    }

    return settings.schemaPresets.filter(p =>
        p.stages.length === 0 || p.stages.includes(stage),
    );
}

/**
 * Get a specific schema preset by ID
 */
export function getSchemaPreset(id: string): SchemaPreset | null {
    const settings = getSettings();
    return settings.schemaPresets.find(p => p.id === id) || null;
}

/**
 * Save a new schema preset
 */
export function saveSchemaPreset(preset: Omit<SchemaPreset, 'id' | 'isBuiltin' | 'createdAt' | 'updatedAt'>): SchemaPreset {
    const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
    const settings = extensionSettings[MODULE_NAME] as Settings;
    const { uuidv4 } = SillyTavern.getContext();

    // Auto-fix schema before saving
    const fixedSchema = ensureSchemaHasAdditionalProperties(preset.schema);

    const now = Date.now();
    const newPreset: SchemaPreset = {
        ...preset,
        schema: fixedSchema,
        id: `custom_schema_${uuidv4()}`,
        isBuiltin: false,
        createdAt: now,
        updatedAt: now,
    };

    settings.schemaPresets.push(newPreset);
    saveSettingsDebounced();
    debugLog('info', 'Schema preset saved', { id: newPreset.id, name: newPreset.name });

    return newPreset;
}

/**
 * Update an existing schema preset (only custom presets)
 */
export function updateSchemaPreset(id: string, updates: Partial<Omit<SchemaPreset, 'id' | 'isBuiltin' | 'createdAt'>>): boolean {
    const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
    const settings = extensionSettings[MODULE_NAME] as Settings;

    const index = settings.schemaPresets.findIndex(p => p.id === id);
    if (index === -1) return false;

    const preset = settings.schemaPresets[index];
    if (preset.isBuiltin) {
        debugLog('error', 'Cannot update builtin preset', { id });
        return false;
    }

    // Auto-fix schema if provided
    if (updates.schema) {
        updates.schema = ensureSchemaHasAdditionalProperties(updates.schema);
    }

    settings.schemaPresets[index] = {
        ...preset,
        ...updates,
        updatedAt: Date.now(),
    };

    saveSettingsDebounced();
    debugLog('info', 'Schema preset updated', { id });
    return true;
}

/**
 * Delete a schema preset (only custom presets)
 */
export function deleteSchemaPreset(id: string): boolean {
    const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
    const settings = extensionSettings[MODULE_NAME] as Settings;

    const index = settings.schemaPresets.findIndex(p => p.id === id);
    if (index === -1) return false;

    const preset = settings.schemaPresets[index];
    if (preset.isBuiltin) {
        debugLog('error', 'Cannot delete builtin preset', { id });
        return false;
    }

    settings.schemaPresets.splice(index, 1);

    // Clear any stage defaults that reference this preset
    for (const stage of ['score', 'rewrite', 'analyze'] as const) {
        if (settings.stageDefaults[stage]?.schemaPresetId === id) {
            settings.stageDefaults[stage].schemaPresetId = null;
        }
    }

    saveSettingsDebounced();
    debugLog('info', 'Schema preset deleted', { id });
    return true;
}

// ============================================================================
// SCHEMA HELPERS
// ============================================================================

/**
 * Recursively add additionalProperties: false to all object types in a schema
 */
function ensureSchemaHasAdditionalProperties(schema: StructuredOutputSchema): StructuredOutputSchema {
    const fixed = structuredClone(schema);
    addAdditionalPropertiesToNode(fixed.value);
    return fixed;
}

function addAdditionalPropertiesToNode(node: JsonSchemaValue): void {
    if (node.type === 'object') {
        node.additionalProperties = false;

        if (node.properties && typeof node.properties === 'object') {
            for (const prop of Object.values(node.properties)) {
                if (prop && typeof prop === 'object') {
                    addAdditionalPropertiesToNode(prop as JsonSchemaValue);
                }
            }
        }
    }

    if (node.type === 'array' && node.items && typeof node.items === 'object') {
        if (!Array.isArray(node.items)) {
            addAdditionalPropertiesToNode(node.items as JsonSchemaValue);
        } else {
            node.items.forEach(item => {
                if (item && typeof item === 'object') {
                    addAdditionalPropertiesToNode(item as JsonSchemaValue);
                }
            });
        }
    }

    if (node.anyOf && Array.isArray(node.anyOf)) {
        node.anyOf.forEach(variant => {
            if (variant && typeof variant === 'object') {
                addAdditionalPropertiesToNode(variant as JsonSchemaValue);
            }
        });
    }

    if (node.allOf && Array.isArray(node.allOf)) {
        node.allOf.forEach(variant => {
            if (variant && typeof variant === 'object') {
                addAdditionalPropertiesToNode(variant as JsonSchemaValue);
            }
        });
    }

    // Handle $defs
    if (node.$defs && typeof node.$defs === 'object') {
        for (const def of Object.values(node.$defs)) {
            if (def && typeof def === 'object') {
                addAdditionalPropertiesToNode(def);
            }
        }
    }

    if (node.definitions && typeof node.definitions === 'object') {
        for (const def of Object.values(node.definitions)) {
            if (def && typeof def === 'object') {
                addAdditionalPropertiesToNode(def as JsonSchemaValue);
            }
        }
    }
}

// ============================================================================
// EXPORT HELPERS
// ============================================================================

/**
 * Export all custom presets as JSON (for backup/sharing)
 */
export function exportCustomPresets(): string {
    const settings = getSettings();

    const customPrompts = settings.promptPresets.filter(p => !p.isBuiltin);
    const customSchemas = settings.schemaPresets.filter(p => !p.isBuiltin);

    return JSON.stringify({
        version: SETTINGS_VERSION,
        exportedAt: new Date().toISOString(),
        promptPresets: customPrompts,
        schemaPresets: customSchemas,
    }, null, 2);
}

/**
 * Import presets from JSON
 */
export function importPresets(json: string): { prompts: number; schemas: number; errors: string[] } {
    const errors: string[] = [];
    let promptsImported = 0;
    let schemasImported = 0;

    try {
        const data = JSON.parse(json);

        if (data.promptPresets && Array.isArray(data.promptPresets)) {
            for (const preset of data.promptPresets) {
                try {
                    if (preset.name && preset.prompt) {
                        savePromptPreset({
                            name: preset.name,
                            prompt: preset.prompt,
                            stages: preset.stages || [],
                        });
                        promptsImported++;
                    }
                } catch (e) {
                    errors.push(`Failed to import prompt "${preset.name}": ${e}`);
                }
            }
        }

        if (data.schemaPresets && Array.isArray(data.schemaPresets)) {
            for (const preset of data.schemaPresets) {
                try {
                    if (preset.name && preset.schema) {
                        saveSchemaPreset({
                            name: preset.name,
                            schema: preset.schema,
                            stages: preset.stages || [],
                        });
                        schemasImported++;
                    }
                } catch (e) {
                    errors.push(`Failed to import schema "${preset.name}": ${e}`);
                }
            }
        }
    } catch (e) {
        errors.push(`Failed to parse JSON: ${e}`);
    }

    debugLog('info', 'Presets imported', { promptsImported, schemasImported, errors });
    return { prompts: promptsImported, schemas: schemasImported, errors };
}
