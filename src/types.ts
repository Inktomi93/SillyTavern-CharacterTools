// src/types.ts

// ============================================================================
// CORE TYPES
// ============================================================================

export type StageName = 'score' | 'rewrite' | 'analyze';

export type StageStatus = 'pending' | 'running' | 'complete' | 'skipped';

// ============================================================================
// FIELD SELECTION
// ============================================================================

export interface FieldSelection {
    [fieldKey: string]: boolean | number[];
    // boolean for simple fields (true = included)
    // number[] for alternate_greetings (array of selected indices)
}

// ============================================================================
// CHARACTER
// ============================================================================

export interface DepthPrompt {
    prompt: string;
    depth: number;
    role: string;
}

export interface CharacterBookEntry {
    id: number;
    keys: string[];
    secondary_keys: string[];
    comment: string;
    content: string;
    constant: boolean;
    selective: boolean;
    enabled: boolean;
    position: string;
}

export interface CharacterBook {
    name?: string;
    entries: CharacterBookEntry[];
}

export interface Character {
    // Core fields (top-level)
    name: string;
    avatar: string;
    description: string;
    personality: string;
    first_mes: string;
    mes_example: string;
    scenario: string;

    // These may be top-level OR in data.*
    system_prompt?: string;
    post_history_instructions?: string;
    creator_notes?: string;
    creatorcomment?: string;  // Legacy key for creator_notes

    // Tags (top-level)
    tags?: string[];

    // V2/V3 spec data object
    data?: {
        name?: string;
        description?: string;
        personality?: string;
        first_mes?: string;
        mes_example?: string;
        scenario?: string;
        system_prompt?: string;
        post_history_instructions?: string;
        creator_notes?: string;
        alternate_greetings?: string[];
        tags?: string[];
        creator?: string;
        character_version?: string;
        extensions?: {
            talkativeness?: string;
            fav?: boolean;
            world?: string;
            depth_prompt?: DepthPrompt;
            [key: string]: unknown;
        };
        character_book?: CharacterBook;
        group_only_greetings?: string[];
    };
}

export interface CharacterField {
    key: string;
    label: string;
    path: string;
    type: 'string' | 'array' | 'object';
}

export interface PopulatedField {
    key: string;
    label: string;
    value: string;
    rawValue: unknown;
    charCount: number;
    type: 'string' | 'array' | 'object';
}

// ============================================================================
// GENERATION
// ============================================================================

export interface GenerationConfig {
    source: string;
    model: string;
    temperature: number;
    maxTokens: number;
    frequencyPenalty: number;
    presencePenalty: number;
    topP: number;
}

export type GenerationResult =
    | { success: true; response: string; isStructured: boolean }
    | { success: false; error: string };

// ============================================================================
// SCHEMA
// ============================================================================

export interface StructuredOutputSchema {
    name: string;
    strict?: boolean;
    value: JsonSchemaValue;
}

export interface JsonSchemaValue {
    $schema?: string;
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
    items?: unknown;
    $defs?: Record<string, JsonSchemaValue>;
    definitions?: Record<string, JsonSchemaValue>;
    anyOf?: unknown[];
    allOf?: unknown[];
    enum?: unknown[];
    const?: unknown;
    format?: string;
    pattern?: string;
    description?: string;
    title?: string;
    default?: unknown;
    $ref?: string;
    minItems?: number;
    [key: string]: unknown;
}

export interface SchemaValidationResult {
    valid: boolean;
    error?: string;
    warnings?: string[];
    info?: string[];
    schema?: StructuredOutputSchema;
}

// ============================================================================
// PRESETS
// ============================================================================

export interface PromptPreset {
    id: string;
    name: string;
    prompt: string;
    stages: StageName[];  // Empty array = available for all stages
    isBuiltin: boolean;
    presetVersion: number;
    createdAt: number;
    updatedAt: number;
}

export interface SchemaPreset {
    id: string;
    name: string;
    schema: StructuredOutputSchema;
    stages: StageName[];  // Empty array = available for all stages
    isBuiltin: boolean;
    presetVersion: number;
    createdAt: number;
    updatedAt: number;
}

// ============================================================================
// STAGE CONFIGURATION
// ============================================================================

export interface StageDefaults {
    promptPresetId: string | null;  // null = use customPrompt
    customPrompt: string;
    schemaPresetId: string | null;  // null = use customSchema or none
    customSchema: string;           // JSON string, empty = no schema
    useStructuredOutput: boolean;
}

export interface StageConfig {
    promptPresetId: string | null;
    customPrompt: string;
    schemaPresetId: string | null;
    customSchema: string;
    useStructuredOutput: boolean;
}

// ============================================================================
// ITERATION SYSTEM
// ============================================================================

export type IterationVerdict = 'accept' | 'needs_refinement' | 'regression';

export interface IterationSnapshot {
    iteration: number;
    rewriteResponse: string;
    rewritePreview: string;  // First 200 chars for UI display
    analysisResponse: string;
    analysisPreview: string;
    verdict: IterationVerdict;
    timestamp: number;
}

// ============================================================================
// PIPELINE
// ============================================================================

export interface StageResult {
    response: string;
    isStructured: boolean;
    promptUsed: string;
    schemaUsed: StructuredOutputSchema | null;
    timestamp: number;
    locked: boolean;
}

export interface PipelineState {
    // Selected character
    character: Character | null;
    characterIndex: number | null;

    // Stage results
    results: {
        score: StageResult | null;
        rewrite: StageResult | null;
        analyze: StageResult | null;
    };

    // Stage configs (runtime, may differ from defaults)
    configs: {
        score: StageConfig;
        rewrite: StageConfig;
        analyze: StageConfig;
    };

    // Pipeline flow
    selectedStages: StageName[];
    currentStage: StageName | null;
    stageStatus: Record<StageName, StageStatus>;

    // Iteration system
    iterationCount: number;
    iterationHistory: IterationSnapshot[];
    isRefining: boolean;  // True when in refinement mode (after first analyze)

    // Field selection
    selectedFields: FieldSelection;

    // Export
    exportData: string | null;
}

// ============================================================================
// SETTINGS
// ============================================================================

export interface Settings {
    // Generation settings
    useCurrentSettings: boolean;
    generationConfig: GenerationConfig;

    // Split system prompt (base + user additions)
    baseSystemPrompt: string;
    userSystemPrompt: string;

    // Split refinement prompt (base + user additions)
    baseRefinementPrompt: string;
    userRefinementPrompt: string;

    // Optional per-stage system prompt additions
    stageSystemPrompts: {
        score: string;
        rewrite: string;
        analyze: string;
    };

    // Presets
    promptPresets: PromptPreset[];
    schemaPresets: SchemaPreset[];

    // Per-stage defaults
    stageDefaults: Record<StageName, StageDefaults>;

    // Debug
    debugMode: boolean;

    // Version for migrations
    settingsVersion: number;
}

// ============================================================================
// DEBUG
// ============================================================================

export type DebugLogType = 'request' | 'response' | 'error' | 'info' | 'state';

export interface DebugLogEntry {
    timestamp: Date;
    type: DebugLogType;
    label: string;
    data: unknown;
}

// ============================================================================
// UI STATE
// ============================================================================

export interface PopupState {
    isOpen: boolean;
    isGenerating: boolean;
    abortController: AbortController | null;
    activePanel: 'main' | 'settings';
    expandedFields: Set<string>;  // Character field keys that are expanded
    historyLoaded: boolean;  // Track if we've loaded persisted iteration history
}

// ============================================================================
// COMPONENT PROPS (for future component isolation)
// ============================================================================

export interface CharacterSelectProps {
    characters: Character[];
    selectedIndex: number | null;
    onSelect: (char: Character, index: number) => void;
    onClear: () => void;
}

export interface PipelineNavProps {
    selectedStages: StageName[];
    stageStatus: Record<StageName, StageStatus>;
    currentStage: StageName | null;
    onToggleStage: (stage: StageName) => void;
    onSelectStage: (stage: StageName) => void;
    onRunSelected: () => void;
    onRunAll: () => void;
    onReset: () => void;
    hasCharacter: boolean;
}

export interface StageConfigProps {
    stage: StageName;
    config: StageConfig;
    promptPresets: PromptPreset[];
    schemaPresets: SchemaPreset[];
    onConfigChange: (config: Partial<StageConfig>) => void;
    onSavePromptPreset: (name: string) => void;
    onSaveSchemaPreset: (name: string) => void;
    tokenEstimate: number | null;
    contextSize: number;
}

export interface ResultsPanelProps {
    stage: StageName;
    result: StageResult | null;
    status: StageStatus;
    onRegenerate: () => void;
    onLock: () => void;
    onUnlock: () => void;
    onContinue: () => void;
    onCopy: () => void;
    nextStage: StageName | null;
    canContinue: boolean;
}
