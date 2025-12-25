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
export const EXTENSION_PATH = 'third-party/my-extension';
export const SETTINGS_VERSION = 2;  // Bump when settings structure changes

// ============================================================================
// CHARACTER FIELDS
// ============================================================================

export const CHARACTER_FIELDS: readonly CharacterField[] = Object.freeze([
    { key: 'description', label: 'Description', scoreable: true },
    { key: 'personality', label: 'Personality', scoreable: true },
    { key: 'first_mes', label: 'First Message', scoreable: true },
    { key: 'scenario', label: 'Scenario', scoreable: true },
    { key: 'mes_example', label: 'Example Messages', scoreable: true },
    { key: 'system_prompt', label: 'System Prompt', scoreable: true },
    { key: 'post_history_instructions', label: 'Post-History Instructions', scoreable: false },
    { key: 'creator_notes', label: 'Creator Notes', scoreable: false },
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
// DEFAULT SYSTEM PROMPT
// ============================================================================

export const DEFAULT_SYSTEM_PROMPT = `You are a creative writing assistant specializing in character development for roleplay and fiction. Analyze character cards and provide thoughtful, actionable feedback.

Adapt your response style to the task:
- For scoring: Be critical but fair, rate 1-10 with specific justifications
- For rewrites: Preserve the character's core identity while improving weak areas
- For analysis: Compare versions objectively, identify what was lost or gained

Focus on: writing quality, character depth, consistency, roleplay usability, and potential issues (contradictions, clichés, underdeveloped areas).

Always maintain the character's essential personality and unique traits. Improvements should enhance, not replace, what makes the character interesting.`;

// ============================================================================
// BUILTIN PROMPT PRESETS
// ============================================================================

export const BUILTIN_PROMPT_PRESETS: readonly PromptPreset[] = Object.freeze([
    {
        id: 'builtin_score_default',
        name: 'Default Score',
        stages: ['score'],
        isBuiltin: true,
        createdAt: 0,
        updatedAt: 0,
        prompt: `Rate this character card on a scale of 1-10 for each populated field. For each field, provide:

1. **Score** (1-10)
2. **Strengths** - What works well
3. **Weaknesses** - What needs improvement
4. **Specific Suggestions** - Concrete changes to improve it

After scoring all fields, provide:
- **Overall Score** (weighted average, with First Message and Description weighted higher)
- **Top 3 Priority Improvements** - The changes that would have the biggest impact
- **Summary** - A brief overall assessment

Be critical but constructive. Vague praise is useless. Specific, actionable feedback is gold.`,
    },
    {
        id: 'builtin_score_quick',
        name: 'Quick Score',
        stages: ['score'],
        isBuiltin: true,
        createdAt: 0,
        updatedAt: 0,
        prompt: `Give a quick assessment of this character card:

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
        createdAt: 0,
        updatedAt: 0,
        prompt: `Based on the scoring feedback, rewrite this character card to address the identified weaknesses while preserving its strengths.

Guidelines:
- Maintain the character's core personality and unique traits
- Improve weak areas identified in the score
- Keep the same general length unless brevity/expansion was specifically noted
- Preserve any distinctive voice or style that works
- Fix contradictions and fill gaps
- Make the character more engaging for roleplay

Output the complete rewritten character card with all fields, using the same field structure as the original. Mark significantly changed sections with [REVISED] at the start.

{{score_results}}`,
    },
    {
        id: 'builtin_rewrite_conservative',
        name: 'Conservative Rewrite',
        stages: ['rewrite'],
        isBuiltin: true,
        createdAt: 0,
        updatedAt: 0,
        prompt: `Make minimal, surgical improvements to this character card. Only change what's clearly broken or weak.

Rules:
- Change as little as possible
- Preserve the author's voice completely
- Only fix obvious issues (contradictions, grammar, clarity)
- Do NOT add new content unless filling a critical gap
- Do NOT change style or tone

Output only the fields you changed, with [ORIGINAL] and [REVISED] versions for comparison.

{{score_results}}`,
    },
    {
        id: 'builtin_rewrite_expansive',
        name: 'Expansive Rewrite',
        stages: ['rewrite'],
        isBuiltin: true,
        createdAt: 0,
        updatedAt: 0,
        prompt: `Significantly expand and enhance this character card. Add depth, detail, and richness.

Goals:
- Flesh out underdeveloped areas
- Add sensory details and specific examples
- Deepen personality with quirks, contradictions, history
- Improve example messages with more variety
- Make the character feel more three-dimensional

Don't change the core concept, but make it shine. Output the complete expanded character card.

{{score_results}}`,
    },
    {
        id: 'builtin_analyze_default',
        name: 'Default Analyze',
        stages: ['analyze'],
        isBuiltin: true,
        createdAt: 0,
        updatedAt: 0,
        prompt: `Compare the original character card with the rewritten version. Analyze:

## What Was Preserved
- Core personality traits that remained intact
- Distinctive elements that were kept
- Voice and style consistency

## What Was Lost
- Any personality aspects that were diminished or removed
- Unique quirks that disappeared
- Tone shifts that changed the character's feel

## What Was Gained
- New depth or detail added
- Improvements that enhance the character
- Better clarity or consistency

## Soul Check
Does the rewritten version still feel like the same character? Rate the "soul preservation" from 1-10 and explain.

## Recommendations
If anything important was lost, suggest how to restore it while keeping the improvements.

---

### Original Character:
{{original_character}}

### Rewritten Version:
{{rewrite_results}}

### Score Feedback:
{{score_results}}`,
    },
    {
        id: 'builtin_analyze_quick',
        name: 'Quick Analyze',
        stages: ['analyze'],
        isBuiltin: true,
        createdAt: 0,
        updatedAt: 0,
        prompt: `Quick comparison of original vs rewrite:

1. Soul preserved? (Yes/Partially/No)
2. Best improvement made
3. Biggest thing lost (if any)
4. Keep this version? (Yes/No/Needs tweaks)

{{original_character}}

{{rewrite_results}}`,
    },
    {
        id: 'builtin_freeform',
        name: 'Freeform',
        stages: [],  // Available for all stages
        isBuiltin: true,
        createdAt: 0,
        updatedAt: 0,
        prompt: '[Enter your custom instructions here]',
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
            recommendations: {
                type: 'array',
                items: { type: 'string' },
            },
            keepVersion: {
                type: 'string',
                enum: ['yes', 'no', 'needs_tweaks'],
            },
        },
        required: ['preserved', 'lost', 'gained', 'soulPreservationScore', 'soulAssessment', 'recommendations', 'keepVersion'],
    },
};

export const BUILTIN_SCHEMA_PRESETS: readonly SchemaPreset[] = Object.freeze([
    {
        id: 'builtin_schema_score',
        name: 'Default Score',
        stages: ['score'],
        isBuiltin: true,
        createdAt: 0,
        updatedAt: 0,
        schema: SCORE_SCHEMA,
    },
    {
        id: 'builtin_schema_quick_score',
        name: 'Quick Score',
        stages: ['score'],
        isBuiltin: true,
        createdAt: 0,
        updatedAt: 0,
        schema: QUICK_SCORE_SCHEMA,
    },
    {
        id: 'builtin_schema_analyze',
        name: 'Default Analyze',
        stages: ['analyze'],
        isBuiltin: true,
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
        useStructuredOutput: false,  // Off by default, user can enable
    },
    rewrite: {
        promptPresetId: 'builtin_rewrite_default',
        customPrompt: '',
        schemaPresetId: null,  // Rewrite typically doesn't use structured output
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
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    promptPresets: [...BUILTIN_PROMPT_PRESETS],
    schemaPresets: [...BUILTIN_SCHEMA_PRESETS],
    stageDefaults: DEFAULT_STAGE_DEFAULTS,
    debugMode: false,
    settingsVersion: SETTINGS_VERSION,
});

// ============================================================================
// TEMPLATE PLACEHOLDERS
// ============================================================================

// These placeholders can be used in prompts and will be replaced at runtime
export const TEMPLATE_PLACEHOLDERS = {
    ORIGINAL_CHARACTER: '{{original_character}}',
    SCORE_RESULTS: '{{score_results}}',
    REWRITE_RESULTS: '{{rewrite_results}}',
    CHARACTER_NAME: '{{char_name}}',
    USER_NAME: '{{user_name}}',
} as const;

// ============================================================================
// UI CONSTANTS
// ============================================================================

export const TOKEN_WARNING_THRESHOLD = 0.5;   // 50% of context
export const TOKEN_DANGER_THRESHOLD = 0.8;    // 80% of context

export const DEBOUNCE_DELAY = {
    SEARCH: 150,
    TOKEN_ESTIMATE: 300,
    SAVE: 500,
    VALIDATE: 500,
} as const;

export const MAX_DROPDOWN_RESULTS = 10;
export const MAX_DEBUG_LOG_ENTRIES = 100;

// ============================================================================
// CSS CLASS PREFIX
// ============================================================================

// All CSS classes should use this prefix
export const CSS_PREFIX = 'character_tools';

// Helper to generate prefixed class names
export function css(...names: string[]): string {
    return names.map(n => `${CSS_PREFIX}_${n}`).join(' ');
}

// Helper for BEM-style classes
export function bem(block: string, element?: string, modifier?: string): string {
    let className = `${CSS_PREFIX}_${block}`;
    if (element) className += `__${element}`;
    if (modifier) className += `--${modifier}`;
    return className;
}
