// src/settings.ts
import {
    MODULE_NAME,
    DEFAULT_SETTINGS,
    DEFAULT_SYSTEM_PROMPT,
    DEFAULT_GENERATION_CONFIG,
    DEFAULT_STAGE_DEFAULTS,
    DEFAULT_REFINEMENT_PROMPT,
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
// MIGRATION REGISTRY
// ============================================================================

type MigrationFn = (settings: Partial<Settings>) => void;

const migrations: Record<number, MigrationFn> = {
    // v1 -> v2: Add preset system, stage defaults
    2: (settings) => {
        // Handle old useRawMode -> useCurrentSettings
        const oldSettings = settings as Record<string, unknown>;
        if (oldSettings.useRawMode !== undefined) {
            settings.useCurrentSettings = !oldSettings.useRawMode;
            delete oldSettings.useRawMode;
        }

        // Handle old jsonSchema -> discard (can't migrate custom schemas reliably)
        if (oldSettings.jsonSchema !== undefined) {
            delete oldSettings.jsonSchema;
        }

        // Handle old useStructuredOutput -> apply to score stage
        if (oldSettings.useStructuredOutput !== undefined) {
            if (!settings.stageDefaults) {
                settings.stageDefaults = structuredClone(DEFAULT_STAGE_DEFAULTS);
            }
            settings.stageDefaults!.score.useStructuredOutput = !!oldSettings.useStructuredOutput;
            delete oldSettings.useStructuredOutput;
        }
    },

    // v2 -> v3: Add refinement prompt
    3: (settings) => {
        if (!settings.refinementPrompt) {
            settings.refinementPrompt = DEFAULT_REFINEMENT_PROMPT;
        }
    },
};

/**
 * Run all migrations from oldVersion to current version
 */
function runMigrations(settings: Partial<Settings>, oldVersion: number): boolean {
    let migrated = false;

    for (let v = oldVersion + 1; v <= SETTINGS_VERSION; v++) {
        const migration = migrations[v];
        if (migration) {
            debugLog('info', `Running migration to v${v}`, null);
            migration(settings);
            migrated = true;
        }
    }

    return migrated;
}

// ============================================================================
// SETTINGS ACCESS
// ============================================================================

/**
 * Get current settings, initializing with defaults if needed.
 * Handles migrations from older versions.
 */
export function getSettings(): Settings {
    const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
    const { lodash } = SillyTavern.libs;

    if (!extensionSettings[MODULE_NAME]) {
        debugLog('info', 'Initializing settings with defaults', null);
        extensionSettings[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
        saveSettingsDebounced();
        return extensionSettings[MODULE_NAME] as Settings;
    }

    const existing = extensionSettings[MODULE_NAME] as Partial<Settings>;
    const oldVersion = existing.settingsVersion || 1;
    let needsSave = false;

    // Run migrations if version is old
    if (oldVersion < SETTINGS_VERSION) {
        needsSave = runMigrations(existing, oldVersion);
        existing.settingsVersion = SETTINGS_VERSION;
    }

    // Merge with defaults to ensure all fields exist
    // lodash.merge does deep merge, existing values override defaults
    const merged = lodash.merge(
        structuredClone(DEFAULT_SETTINGS),
        existing,
    ) as Settings;

    // Ensure builtin presets exist (they might be missing if user has old settings)
    const builtinsAdded = ensureBuiltinPresets(merged);
    needsSave = needsSave || builtinsAdded;

    // Write back merged settings
    extensionSettings[MODULE_NAME] = merged;

    if (needsSave) {
        saveSettingsDebounced();
    }

    return merged;
}

/**
 * Ensure all builtin presets exist in settings
 */
function ensureBuiltinPresets(settings: Settings): boolean {
    let modified = false;

    // Ensure prompt presets
    const existingPromptIds = new Set(settings.promptPresets.map(p => p.id));
    for (const builtin of BUILTIN_PROMPT_PRESETS) {
        if (!existingPromptIds.has(builtin.id)) {
            settings.promptPresets.push(structuredClone(builtin));
            modified = true;
        }
    }

    // Ensure schema presets
    const existingSchemaIds = new Set(settings.schemaPresets.map(p => p.id));
    for (const builtin of BUILTIN_SCHEMA_PRESETS) {
        if (!existingSchemaIds.has(builtin.id)) {
            settings.schemaPresets.push(structuredClone(builtin));
            modified = true;
        }
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
 * Update refinement prompt
 */
export function updateRefinementPrompt(prompt: string): void {
    updateSetting('refinementPrompt', prompt);
}

/**
 * Reset refinement prompt to default
 */
export function resetRefinementPrompt(): void {
    updateSetting('refinementPrompt', DEFAULT_REFINEMENT_PROMPT);
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
 * Returns the deleted preset ID if successful, null otherwise
 */
export function deletePromptPreset(id: string): string | null {
    const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
    const settings = extensionSettings[MODULE_NAME] as Settings;

    const index = settings.promptPresets.findIndex(p => p.id === id);
    if (index === -1) return null;

    const preset = settings.promptPresets[index];
    if (preset.isBuiltin) {
        debugLog('error', 'Cannot delete builtin preset', { id });
        return null;
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
    return id;
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
 * Returns the deleted preset ID if successful, null otherwise
 */
export function deleteSchemaPreset(id: string): string | null {
    const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
    const settings = extensionSettings[MODULE_NAME] as Settings;

    const index = settings.schemaPresets.findIndex(p => p.id === id);
    if (index === -1) return null;

    const preset = settings.schemaPresets[index];
    if (preset.isBuiltin) {
        debugLog('error', 'Cannot delete builtin preset', { id });
        return null;
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
    return id;
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
