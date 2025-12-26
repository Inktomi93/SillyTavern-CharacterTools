// src/constants.ts
import type {
    CharacterField,
    StructuredOutputSchema,
    PromptPreset,
    SchemaPreset,
    StageDefaults,
    StageName,
    GenerationConfig,
    Settings,
} from './types';

// ============================================================================
// MODULE INFO
// ============================================================================

export const MODULE_NAME = 'character_tools';
export const EXTENSION_PATH = 'third-party/SillyTavern-CharacterTools';
export const SETTINGS_VERSION = 4;
export const VERSION = '1.0.0';
export const CURRENT_PRESET_VERSION = 1;

// ============================================================================
// CHARACTER FIELDS
// ============================================================================

export const CHARACTER_FIELDS: readonly CharacterField[] = Object.freeze([
    { key: 'description', label: 'Description', path: 'description', type: 'string' },
    { key: 'personality', label: 'Personality', path: 'personality', type: 'string' },
    { key: 'first_mes', label: 'First Message', path: 'first_mes', type: 'string' },
    { key: 'scenario', label: 'Scenario', path: 'scenario', type: 'string' },
    { key: 'mes_example', label: 'Example Messages', path: 'mes_example', type: 'string' },
    { key: 'system_prompt', label: 'System Prompt', path: 'data.system_prompt', type: 'string' },
    { key: 'post_history_instructions', label: 'Post-History Instructions', path: 'data.post_history_instructions', type: 'string' },
    { key: 'creator_notes', label: 'Creator Notes', path: 'data.creator_notes', type: 'string' },
    { key: 'alternate_greetings', label: 'Alternate Greetings', path: 'data.alternate_greetings', type: 'array' },
    { key: 'depth_prompt', label: 'Depth Prompt', path: 'data.extensions.depth_prompt', type: 'object' },
    { key: 'character_book', label: 'Character Lorebook', path: 'data.character_book', type: 'object' },
]);

// ============================================================================
// STAGE DEFINITIONS
// ============================================================================

export const STAGES: readonly StageName[] = Object.freeze(['score', 'rewrite', 'analyze']);

export const STAGE_LABELS: Record<StageName, string> = {
    score: 'Score',
    rewrite: 'Rewrite',
    analyze: 'Analyze',
};

export const STAGE_ICONS: Record<StageName, string> = {
    score: 'fa-star-half-stroke',
    rewrite: 'fa-pen-fancy',
    analyze: 'fa-magnifying-glass-chart',
};

export const STAGE_DESCRIPTIONS: Record<StageName, string> = {
    score: 'Rate and critique the character card',
    rewrite: 'Generate an improved version',
    analyze: 'Compare original vs rewrite, check for soul loss',
};

// ============================================================================
// BASE SYSTEM PROMPT
// ============================================================================

export const BASE_SYSTEM_PROMPT = `You are a character card analyst and writer. You help improve roleplay character cards by providing specific, actionable feedback and high-quality rewrites.

Key principles:
- Preserve the character's core identity and unique traits
- Be specific - vague feedback is useless
- Quality over quantity - concise and impactful
- Maintain consistency across all fields`;

export const DEFAULT_USER_SYSTEM_PROMPT = '';

// ============================================================================
// BASE REFINEMENT PROMPT
// ============================================================================

export const BASE_REFINEMENT_PROMPT = `You are refining a character card based on analysis feedback. Your goal is to address identified issues while preserving what works.

Key principles:
- Fix specific problems from the analysis
- Keep improvements from previous iterations
- Maintain the character's essential identity
- Don't reintroduce previously fixed issues`;

export const DEFAULT_USER_REFINEMENT_PROMPT = '';

export const DEFAULT_STAGE_SYSTEM_PROMPTS = {
    score: '',
    rewrite: '',
    analyze: '',
};

// ============================================================================
// BUILTIN PROMPT PRESETS
// ============================================================================

export const BUILTIN_PROMPT_PRESETS: readonly PromptPreset[] = Object.freeze([
    {
        id: 'builtin_score_default',
        name: 'Default Score',
        stages: ['score'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        prompt: `Rate this character card on a scale of 1-10 for each field provided. For each field:

1. **Score** (1-10)
2. **Strengths** - What works well
3. **Weaknesses** - What needs improvement
4. **Specific Suggestions** - Concrete changes

After scoring all fields, provide:
- **Overall Score** (weighted average)
- **Top 3 Priority Improvements**
- **Summary**

Be critical but constructive. Specific, actionable feedback.`,
    },
    {
        id: 'builtin_score_quick',
        name: 'Quick Score',
        stages: ['score'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        prompt: `Give a quick assessment:

1. Overall score (1-10)
2. Three biggest strengths
3. Three areas needing work
4. One-sentence summary

Keep it concise but useful.`,
    },
    {
        id: 'builtin_rewrite_default',
        name: 'Default Rewrite',
        stages: ['rewrite'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        prompt: `Rewrite this character card to address the weaknesses identified while preserving its strengths.

Guidelines:
- Maintain the character's core personality and unique traits
- Improve weak areas identified in the feedback
- Keep similar length unless brevity/expansion was noted
- Preserve distinctive voice or style that works
- Fix contradictions and fill gaps

Output the complete rewritten character with all fields.`,
    },
    {
        id: 'builtin_rewrite_conservative',
        name: 'Conservative Rewrite',
        stages: ['rewrite'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        prompt: `Make minimal, surgical improvements. Only change what's clearly broken or weak.

Rules:
- Change as little as possible
- Preserve the author's voice completely
- Only fix obvious issues (contradictions, grammar, clarity)
- Do NOT add new content unless filling a critical gap
- Do NOT change style or tone

Output only the fields you changed, with [ORIGINAL] and [REVISED] versions for comparison.`,
    },
    {
        id: 'builtin_rewrite_expansive',
        name: 'Expansive Rewrite',
        stages: ['rewrite'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        prompt: `Significantly expand and enhance this character card. Add depth, detail, and richness.

Goals:
- Flesh out underdeveloped areas
- Add sensory details and specific examples
- Deepen personality with quirks, contradictions, history
- Improve example messages with more variety
- Make the character feel more three-dimensional

Don't change the core concept, but make it shine. Output the complete expanded character card.`,
    },
    {
        id: 'builtin_analyze_default',
        name: 'Default Analyze',
        stages: ['analyze'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        prompt: `Compare the original character card with the rewritten version.

## What Was Preserved
Core traits, distinctive elements, voice consistency

## What Was Lost
Diminished personality aspects, missing quirks, tone shifts

## What Was Gained
New depth, improvements, better clarity

## Soul Check
Does the rewrite still feel like the same character? Rate 1-10.

## Verdict
State clearly: **ACCEPT** (ready to use), **NEEDS_REFINEMENT** (has issues), or **REGRESSION** (worse than before)

## Issues to Address
If NEEDS_REFINEMENT, list specific problems for next iteration.`,
    },
    {
        id: 'builtin_analyze_iteration',
        name: 'Iteration Analyze',
        stages: ['analyze'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        prompt: `Compare the current rewrite against the original.

## Progress Check
- What issues from previous analysis were addressed?
- What new issues (if any) were introduced?
- Is this version better, worse, or lateral move?

## Current State
- Preserved from Original
- Still Missing or Lost
- Successfully Improved
- New Problems

## Soul Preservation Score (1-10)

## Verdict
**ACCEPT** - Ready, no more iterations needed
**NEEDS_REFINEMENT** - Progress, but issues remain
**REGRESSION** - Made things worse

## Next Steps
If NEEDS_REFINEMENT: What to fix next.
If REGRESSION: What went wrong.`,
    },
    {
        id: 'builtin_analyze_quick',
        name: 'Quick Analyze',
        stages: ['analyze'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        prompt: `Quick comparison:

1. Soul preserved? (Yes/Partially/No)
2. Best improvement made
3. Biggest thing lost (if any)
4. Verdict: ACCEPT / NEEDS_REFINEMENT / REGRESSION`,
    },
    {
        id: 'builtin_freeform',
        name: 'Freeform',
        stages: [],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        prompt: '',
    },
]);

// ============================================================================
// BUILTIN SCHEMA PRESETS
// ============================================================================

const SCORE_SCHEMA: StructuredOutputSchema = {
    name: 'CharacterScore',
    strict: true,
    value: {
        $schema: 'http://json-schema.org/draft-04/schema#',
        type: 'object',
        additionalProperties: false,
        properties: {
            fieldScores: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        field: { type: 'string' },
                        score: { type: 'number' },
                        strengths: { type: 'string' },
                        weaknesses: { type: 'string' },
                        suggestions: { type: 'string' },
                    },
                    required: ['field', 'score', 'strengths', 'weaknesses', 'suggestions'],
                },
            },
            overallScore: { type: 'number' },
            priorityImprovements: {
                type: 'array',
                items: { type: 'string' },
            },
            summary: { type: 'string' },
        },
        required: ['fieldScores', 'overallScore', 'priorityImprovements', 'summary'],
    },
};

const QUICK_SCORE_SCHEMA: StructuredOutputSchema = {
    name: 'QuickScore',
    strict: true,
    value: {
        $schema: 'http://json-schema.org/draft-04/schema#',
        type: 'object',
        additionalProperties: false,
        properties: {
            overallScore: { type: 'number' },
            strengths: {
                type: 'array',
                items: { type: 'string' },
            },
            weaknesses: {
                type: 'array',
                items: { type: 'string' },
            },
            summary: { type: 'string' },
        },
        required: ['overallScore', 'strengths', 'weaknesses', 'summary'],
    },
};

const ANALYZE_SCHEMA: StructuredOutputSchema = {
    name: 'CharacterAnalysis',
    strict: true,
    value: {
        $schema: 'http://json-schema.org/draft-04/schema#',
        type: 'object',
        additionalProperties: false,
        properties: {
            preserved: {
                type: 'array',
                items: { type: 'string' },
            },
            lost: {
                type: 'array',
                items: { type: 'string' },
            },
            gained: {
                type: 'array',
                items: { type: 'string' },
            },
            soulPreservationScore: { type: 'number' },
            soulAssessment: { type: 'string' },
            verdict: {
                type: 'string',
                enum: ['ACCEPT', 'NEEDS_REFINEMENT', 'REGRESSION'],
            },
            issuesToAddress: {
                type: 'array',
                items: { type: 'string' },
            },
            recommendations: {
                type: 'array',
                items: { type: 'string' },
            },
        },
        required: ['preserved', 'lost', 'gained', 'soulPreservationScore', 'soulAssessment', 'verdict', 'issuesToAddress', 'recommendations'],
    },
};

export const BUILTIN_SCHEMA_PRESETS: readonly SchemaPreset[] = Object.freeze([
    {
        id: 'builtin_schema_score',
        name: 'Default Score',
        stages: ['score'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        schema: SCORE_SCHEMA,
    },
    {
        id: 'builtin_schema_quick_score',
        name: 'Quick Score',
        stages: ['score'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        schema: QUICK_SCORE_SCHEMA,
    },
    {
        id: 'builtin_schema_analyze',
        name: 'Default Analyze',
        stages: ['analyze'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        schema: ANALYZE_SCHEMA,
    },
]);

// ============================================================================
// DEFAULT STAGE CONFIGS
// ============================================================================

export const DEFAULT_STAGE_DEFAULTS: Record<StageName, StageDefaults> = {
    score: {
        promptPresetId: 'builtin_score_default',
        customPrompt: '',
        schemaPresetId: 'builtin_schema_score',
        customSchema: '',
        useStructuredOutput: false,
    },
    rewrite: {
        promptPresetId: 'builtin_rewrite_default',
        customPrompt: '',
        schemaPresetId: null,
        customSchema: '',
        useStructuredOutput: false,
    },
    analyze: {
        promptPresetId: 'builtin_analyze_default',
        customPrompt: '',
        schemaPresetId: 'builtin_schema_analyze',
        customSchema: '',
        useStructuredOutput: false,
    },
};

// ============================================================================
// DEFAULT GENERATION CONFIG
// ============================================================================

export const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
    source: 'openrouter',
    model: 'anthropic/claude-sonnet-4',
    temperature: 1,
    maxTokens: 4096,
    frequencyPenalty: 0,
    presencePenalty: 0,
    topP: 1,
};

// ============================================================================
// COMPLETE DEFAULT SETTINGS
// ============================================================================

export const DEFAULT_SETTINGS: Settings = Object.freeze({
    useCurrentSettings: true,
    generationConfig: DEFAULT_GENERATION_CONFIG,

    // Split prompts
    baseSystemPrompt: BASE_SYSTEM_PROMPT,
    userSystemPrompt: DEFAULT_USER_SYSTEM_PROMPT,
    baseRefinementPrompt: BASE_REFINEMENT_PROMPT,
    userRefinementPrompt: DEFAULT_USER_REFINEMENT_PROMPT,
    stageSystemPrompts: DEFAULT_STAGE_SYSTEM_PROMPTS,

    promptPresets: [...BUILTIN_PROMPT_PRESETS],
    schemaPresets: [...BUILTIN_SCHEMA_PRESETS],
    stageDefaults: DEFAULT_STAGE_DEFAULTS,
    debugMode: false,
    settingsVersion: SETTINGS_VERSION,
});

// ============================================================================
// TEMPLATE PLACEHOLDERS
// ============================================================================

/**
 * Template placeholders that can be used in prompts.
 * These are replaced at runtime with actual values.
 */
export const TEMPLATE_PLACEHOLDERS = {
    ORIGINAL_CHARACTER: '{{original_character}}',
    SCORE_RESULTS: '{{score_results}}',
    REWRITE_RESULTS: '{{rewrite_results}}',
    CURRENT_REWRITE: '{{current_rewrite}}',
    CURRENT_ANALYSIS: '{{current_analysis}}',
    ITERATION_NUMBER: '{{iteration_number}}',
    CHARACTER_NAME: '{{char_name}}',
    USER_NAME: '{{user_name}}',
} as const;

// ============================================================================
// UI CONSTANTS
// ============================================================================

export const TOKEN_WARNING_THRESHOLD = 0.5;
export const TOKEN_DANGER_THRESHOLD = 0.8;

export const DEBOUNCE_DELAY = {
    SEARCH: 150,
    TOKEN_ESTIMATE: 300,
    SAVE: 500,
    VALIDATE: 500,
} as const;

export const MAX_DROPDOWN_RESULTS = 10;
export const MAX_DEBUG_LOG_ENTRIES = 100;
export const MAX_ITERATION_HISTORY = 20;
