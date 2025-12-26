// src/types.ts

// ============================================================================
// CORE TYPES
// ============================================================================

export type StageName = 'score' | 'rewrite' | 'analyze';

export type StageStatus = 'pending' | 'running' | 'complete' | 'skipped';

// ============================================================================
// CHARACTER
// ============================================================================

export interface Character {
  name: string;
  avatar: string;
  description: string;
  personality: string;
  first_mes: string;
  mes_example: string;
  scenario: string;
  system_prompt?: string;
  post_history_instructions?: string;
  creator_notes?: string;
  tags?: string[];
}

export interface CharacterField {
  key: keyof Character;
  label: string;
  scoreable: boolean;
}

export interface PopulatedField {
  key: string;
  label: string;
  value: string;
  charCount: number;
  scoreable: boolean;
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
  createdAt: number;
  updatedAt: number;
}

export interface SchemaPreset {
  id: string;
  name: string;
  schema: StructuredOutputSchema;
  stages: StageName[];  // Empty array = available for all stages
  isBuiltin: boolean;
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
  systemPrompt: string;

  // Presets
  promptPresets: PromptPreset[];
  schemaPresets: SchemaPreset[];

  // Per-stage defaults
  stageDefaults: Record<StageName, StageDefaults>;

  // Refinement settings
  refinementPrompt: string;

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
