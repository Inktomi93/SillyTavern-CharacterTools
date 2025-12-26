// src/pipeline.ts
//
// Pipeline state machine for managing the character analysis workflow.
// Handles stage progression, state transitions, result management, and iteration.

import type {
    StageName,
    StageStatus,
    StageResult,
    StageConfig,
    PipelineState,
    Character,
    PopulatedField,
    StructuredOutputSchema,
    IterationSnapshot,
    IterationVerdict,
    ParsedRewrite,
    ParsedRewriteField,
} from './types';
import { STAGES, CHARACTER_FIELDS, MAX_ITERATION_HISTORY } from './constants';
import { createStageConfigFromDefaults, resolvePrompt, resolveSchema, processPromptTemplate, promptHasPlaceholders } from './presets';
import { getSettings } from './settings';
import { debugLog, logError } from './debug';

// ============================================================================
// PIPELINE STATE FACTORY
// ============================================================================

/**
 * Create a fresh pipeline state
 */
export function createPipelineState(): PipelineState {
    return {
        character: null,
        characterIndex: null,

        results: {
            score: null,
            rewrite: null,
            analyze: null,
        },

        configs: {
            score: createStageConfigFromDefaults('score'),
            rewrite: createStageConfigFromDefaults('rewrite'),
            analyze: createStageConfigFromDefaults('analyze'),
        },

        selectedStages: ['score', 'rewrite'],  // Default pipeline
        currentStage: null,
        stageStatus: {
            score: 'pending',
            rewrite: 'pending',
            analyze: 'pending',
        },

        // Iteration system
        iterationCount: 0,
        iterationHistory: [],
        isRefining: false,

        exportData: null,
    };
}

/**
 * Reset pipeline state while optionally keeping character selection
 */
export function resetPipeline(state: PipelineState, keepCharacter: boolean = false): PipelineState {
    const fresh = createPipelineState();

    if (keepCharacter && state.character) {
        fresh.character = state.character;
        fresh.characterIndex = state.characterIndex;
    }

    debugLog('state', 'Pipeline reset', { keepCharacter, hasCharacter: !!fresh.character });
    return fresh;
}

// ============================================================================
// CHARACTER MANAGEMENT
// ============================================================================

/**
 * Set the selected character and reset results
 */
export function setCharacter(state: PipelineState, character: Character | null, index: number | null): PipelineState {
    // If same character, don't reset
    if (state.characterIndex === index && index !== null) {
        return state;
    }

    const newState: PipelineState = {
        ...state,
        character,
        characterIndex: index,
        // Reset results when character changes
        results: {
            score: null,
            rewrite: null,
            analyze: null,
        },
        stageStatus: {
            score: 'pending',
            rewrite: 'pending',
            analyze: 'pending',
        },
        currentStage: null,
        // Reset iteration state
        iterationCount: 0,
        iterationHistory: [],
        isRefining: false,
        exportData: null,
    };

    debugLog('state', 'Character set', {
        name: character?.name,
        index,
        fieldsPopulated: character ? getPopulatedFields(character).length : 0,
    });

    return newState;
}

/**
 * Get populated fields from a character
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
 * Build character summary for prompts
 */
export function buildCharacterSummary(char: Character): string {
    const fields = getPopulatedFields(char);

    const sections = fields.map(f => `### ${f.label}\n${f.value}`);

    return `# CHARACTER: ${char.name}\n\n${sections.join('\n\n')}`;
}

// ============================================================================
// STAGE SELECTION
// ============================================================================

/**
 * Toggle a stage in the selected stages list
 */
export function toggleStage(state: PipelineState, stage: StageName): PipelineState {
    const selected = new Set(state.selectedStages);

    if (selected.has(stage)) {
        selected.delete(stage);
    } else {
        selected.add(stage);
    }

    // Maintain order based on STAGES constant
    const orderedSelected = STAGES.filter(s => selected.has(s));

    debugLog('state', 'Stage toggled', { stage, selected: orderedSelected });

    return {
        ...state,
        selectedStages: orderedSelected,
    };
}

/**
 * Set all selected stages at once
 */
export function setSelectedStages(state: PipelineState, stages: StageName[]): PipelineState {
    // Maintain order based on STAGES constant
    const orderedSelected = STAGES.filter(s => stages.includes(s));

    return {
        ...state,
        selectedStages: orderedSelected,
    };
}

/**
 * Select all stages
 */
export function selectAllStages(state: PipelineState): PipelineState {
    return {
        ...state,
        selectedStages: [...STAGES],
    };
}

/**
 * Check if a stage can be run (has required dependencies)
 */
export function canRunStage(state: PipelineState, stage: StageName): { canRun: boolean; reason?: string } {
    if (!state.character) {
        return { canRun: false, reason: 'No character selected' };
    }

    // Check stage-specific dependencies
    switch (stage) {
        case 'score':
            // Score can always run if we have a character
            return { canRun: true };

        case 'rewrite':
            // Rewrite can run standalone OR with score results
            // If score is in selected stages and not complete, warn but allow
            if (state.selectedStages.includes('score') && !state.results.score?.locked) {
                return {
                    canRun: true,
                    reason: 'Score stage not complete - rewrite will run without score feedback',
                };
            }
            return { canRun: true };

        case 'analyze':
            // Analyze needs rewrite results to compare
            if (!state.results.rewrite) {
                return { canRun: false, reason: 'Analyze requires rewrite results to compare' };
            }
            return { canRun: true };

        default:
            return { canRun: false, reason: 'Unknown stage' };
    }
}

/**
 * Check if refinement can be run
 */
export function canRefine(state: PipelineState): { canRun: boolean; reason?: string } {
    if (!state.character) {
        return { canRun: false, reason: 'No character selected' };
    }

    if (!state.results.rewrite) {
        return { canRun: false, reason: 'No rewrite to refine' };
    }

    if (!state.results.analyze) {
        return { canRun: false, reason: 'Run analyze first to identify issues' };
    }

    return { canRun: true };
}

// ============================================================================
// STAGE CONFIG MANAGEMENT
// ============================================================================

/**
 * Update a stage's config
 */
export function updateStageConfig(
    state: PipelineState,
    stage: StageName,
    updates: Partial<StageConfig>,
): PipelineState {
    return {
        ...state,
        configs: {
            ...state.configs,
            [stage]: {
                ...state.configs[stage],
                ...updates,
            },
        },
    };
}

/**
 * Reset a stage's config to defaults
 */
export function resetStageConfig(state: PipelineState, stage: StageName): PipelineState {
    return {
        ...state,
        configs: {
            ...state.configs,
            [stage]: createStageConfigFromDefaults(stage),
        },
    };
}

// ============================================================================
// STAGE EXECUTION
// ============================================================================

/**
 * Mark a stage as running
 */
export function startStage(state: PipelineState, stage: StageName): PipelineState {
    debugLog('state', 'Stage started', { stage });

    return {
        ...state,
        currentStage: stage,
        stageStatus: {
            ...state.stageStatus,
            [stage]: 'running' as StageStatus,
        },
    };
}

/**
 * Complete a stage with results
 */
export function completeStage(
    state: PipelineState,
    stage: StageName,
    result: Omit<StageResult, 'timestamp' | 'locked'>,
): PipelineState {
    const stageResult: StageResult = {
        ...result,
        timestamp: Date.now(),
        locked: false,
    };

    debugLog('state', 'Stage completed', {
        stage,
        responseLength: result.response.length,
        isStructured: result.isStructured,
    });

    // If this is analyze completing, we're now in refinement mode
    const isRefining = stage === 'analyze' && state.results.rewrite !== null;

    return {
        ...state,
        currentStage: null,
        stageStatus: {
            ...state.stageStatus,
            [stage]: 'complete' as StageStatus,
        },
        results: {
            ...state.results,
            [stage]: stageResult,
        },
        isRefining,
    };
}

/**
 * Mark a stage as failed (resets to pending)
 */
export function failStage(state: PipelineState, stage: StageName, _error: string): PipelineState {
    debugLog('state', 'Stage failed', { stage, error: _error });

    return {
        ...state,
        currentStage: null,
        stageStatus: {
            ...state.stageStatus,
            [stage]: 'pending' as StageStatus,
        },
    };
}

/**
 * Skip a stage
 */
export function skipStage(state: PipelineState, stage: StageName): PipelineState {
    debugLog('state', 'Stage skipped', { stage });

    return {
        ...state,
        stageStatus: {
            ...state.stageStatus,
            [stage]: 'skipped' as StageStatus,
        },
    };
}

/**
 * Lock a stage result (user accepted it)
 */
export function lockStageResult(state: PipelineState, stage: StageName): PipelineState {
    const result = state.results[stage];
    if (!result) return state;

    debugLog('state', 'Stage locked', { stage });

    return {
        ...state,
        results: {
            ...state.results,
            [stage]: {
                ...result,
                locked: true,
            },
        },
    };
}

/**
 * Unlock a stage result (user wants to regenerate)
 */
export function unlockStageResult(state: PipelineState, stage: StageName): PipelineState {
    const result = state.results[stage];
    if (!result) return state;

    debugLog('state', 'Stage unlocked', { stage });

    return {
        ...state,
        results: {
            ...state.results,
            [stage]: {
                ...result,
                locked: false,
            },
        },
    };
}

/**
 * Clear a stage result (for regeneration)
 */
export function clearStageResult(state: PipelineState, stage: StageName): PipelineState {
    debugLog('state', 'Stage result cleared', { stage });

    return {
        ...state,
        results: {
            ...state.results,
            [stage]: null,
        },
        stageStatus: {
            ...state.stageStatus,
            [stage]: 'pending' as StageStatus,
        },
    };
}

// ============================================================================
// ITERATION SYSTEM
// ============================================================================

/**
 * Extract verdict from analysis response
 */
export function extractVerdict(analysisResponse: string): IterationVerdict {
    const upper = analysisResponse.toUpperCase();

    // Check for explicit verdict markers
    if (upper.includes('VERDICT') || upper.includes('"VERDICT"')) {
        if (upper.includes('ACCEPT') && !upper.includes('NEEDS')) {
            return 'accept';
        }
        if (upper.includes('REGRESSION')) {
            return 'regression';
        }
        if (upper.includes('NEEDS_REFINEMENT') || upper.includes('NEEDS REFINEMENT')) {
            return 'needs_refinement';
        }
    }

    // Fallback heuristics
    if (upper.includes('READY TO USE') || upper.includes('NO MORE ITERATIONS')) {
        return 'accept';
    }
    if (upper.includes('WORSE THAN') || upper.includes('STEP BACKWARD') || upper.includes('LOST MORE')) {
        return 'regression';
    }

    // Default to needs refinement if we have any issues mentioned
    if (upper.includes('ISSUE') || upper.includes('PROBLEM') || upper.includes('SHOULD FIX')) {
        return 'needs_refinement';
    }

    return 'needs_refinement';
}

/**
 * Create a snapshot of the current iteration before refining
 */
export function createIterationSnapshot(state: PipelineState): IterationSnapshot | null {
    if (!state.results.rewrite || !state.results.analyze) {
        return null;
    }

    const verdict = extractVerdict(state.results.analyze.response);

    return {
        iteration: state.iterationCount,
        rewriteResponse: state.results.rewrite.response,
        rewritePreview: state.results.rewrite.response.substring(0, 200),
        analysisResponse: state.results.analyze.response,
        analysisPreview: state.results.analyze.response.substring(0, 200),
        verdict,
        timestamp: Date.now(),
    };
}

/**
 * Start a refinement iteration
 * - Snapshots current state
 * - Clears analyze result
 * - Increments iteration count
 */
export function startRefinement(state: PipelineState): PipelineState {
    const snapshot = createIterationSnapshot(state);

    if (!snapshot) {
        logError('Cannot start refinement - missing rewrite or analyze', null);
        return state;
    }

    // Add snapshot to history, trim if needed
    const newHistory = [...state.iterationHistory, snapshot];
    if (newHistory.length > MAX_ITERATION_HISTORY) {
        newHistory.shift();
    }

    debugLog('state', 'Starting refinement iteration', {
        iteration: state.iterationCount + 1,
        previousVerdict: snapshot.verdict,
    });

    return {
        ...state,
        iterationHistory: newHistory,
        iterationCount: state.iterationCount + 1,
        // Clear analyze so user must re-analyze after refinement
        results: {
            ...state.results,
            analyze: null,
        },
        stageStatus: {
            ...state.stageStatus,
            analyze: 'pending',
        },
        isRefining: true,
    };
}

/**
 * Complete a refinement (new rewrite generated)
 * The refinement result replaces the current rewrite
 */
export function completeRefinement(
    state: PipelineState,
    refinedRewrite: Omit<StageResult, 'timestamp' | 'locked'>,
): PipelineState {
    const stageResult: StageResult = {
        ...refinedRewrite,
        timestamp: Date.now(),
        locked: false,
    };

    debugLog('state', 'Refinement completed', {
        iteration: state.iterationCount,
        responseLength: refinedRewrite.response.length,
    });

    return {
        ...state,
        currentStage: null,
        results: {
            ...state.results,
            rewrite: stageResult,
            // analyze stays null - user must run it
        },
        stageStatus: {
            ...state.stageStatus,
            rewrite: 'complete',
            analyze: 'pending',
        },
    };
}

/**
 * Revert to a previous iteration
 */
export function revertToIteration(state: PipelineState, iterationIndex: number): PipelineState {
    if (iterationIndex < 0 || iterationIndex >= state.iterationHistory.length) {
        logError('Invalid iteration index', { iterationIndex, historyLength: state.iterationHistory.length });
        return state;
    }

    const snapshot = state.iterationHistory[iterationIndex];

    debugLog('state', 'Reverting to iteration', { iteration: snapshot.iteration });

    // Restore the rewrite from that iteration
    const restoredRewrite: StageResult = {
        response: snapshot.rewriteResponse,
        isStructured: false,
        promptUsed: '[Restored from iteration history]',
        schemaUsed: null,
        timestamp: Date.now(),
        locked: false,
    };

    // Trim history to that point
    const trimmedHistory = state.iterationHistory.slice(0, iterationIndex);

    return {
        ...state,
        results: {
            ...state.results,
            rewrite: restoredRewrite,
            analyze: null,
        },
        stageStatus: {
            ...state.stageStatus,
            rewrite: 'complete',
            analyze: 'pending',
        },
        iterationCount: snapshot.iteration,
        iterationHistory: trimmedHistory,
        isRefining: true,
    };
}

/**
 * Accept current rewrite as final (exit refinement loop)
 */
export function acceptRewrite(state: PipelineState): PipelineState {
    if (!state.results.rewrite) {
        return state;
    }

    debugLog('state', 'Rewrite accepted as final', { iteration: state.iterationCount });

    return {
        ...state,
        results: {
            ...state.results,
            rewrite: {
                ...state.results.rewrite,
                locked: true,
            },
        },
        isRefining: false,
    };
}

// ============================================================================
// REWRITE PARSING
// ============================================================================

/**
 * Parse a rewrite response into field key/value pairs.
 * Supports multiple formats with fallback chain:
 * 1. JSON object with field keys
 * 2. Markdown headers (### Field Name)
 * 3. Heuristic field detection
 * 4. Raw content as single field
 */
export function parseRewriteResponse(response: string): ParsedRewrite {
    // Try JSON first
    const jsonResult = tryParseAsJson(response);
    if (jsonResult) {
        return jsonResult;
    }

    // Try markdown headers
    const markdownResult = tryParseAsMarkdown(response);
    if (markdownResult) {
        return markdownResult;
    }

    // Try heuristic detection
    const heuristicResult = tryParseWithHeuristics(response);
    if (heuristicResult) {
        return heuristicResult;
    }

    // Fallback: return raw content
    return {
        fields: [{
            key: 'content',
            label: 'Content',
            value: response.trim(),
        }],
        raw: response,
        parseMethod: 'raw',
    };
}

function tryParseAsJson(response: string): ParsedRewrite | null {
    try {
        // Try direct parse
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(response);
        } catch {
            // Try extracting from code block
            const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (!codeBlockMatch) return null;
            parsed = JSON.parse(codeBlockMatch[1].trim());
        }

        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return null;
        }

        const fields: ParsedRewriteField[] = [];

        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string' && value.trim()) {
                const fieldDef = CHARACTER_FIELDS.find(f =>
                    f.key === key || f.label.toLowerCase() === key.toLowerCase(),
                );

                fields.push({
                    key: fieldDef?.key || key,
                    label: fieldDef?.label || formatFieldLabel(key),
                    value: value.trim(),
                });
            }
        }

        if (fields.length === 0) return null;

        return {
            fields,
            raw: response,
            parseMethod: 'json',
        };
    } catch {
        return null;
    }
}

function tryParseAsMarkdown(response: string): ParsedRewrite | null {
    // Match ### Header or ## Header patterns
    const headerPattern = /^#{2,3}\s+(.+?)$/gm;
    const matches = [...response.matchAll(headerPattern)];

    if (matches.length === 0) return null;

    const fields: ParsedRewriteField[] = [];

    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const headerText = match[1].trim();
        const startIndex = match.index! + match[0].length;
        const endIndex = matches[i + 1]?.index ?? response.length;
        const content = response.slice(startIndex, endIndex).trim();

        if (!content) continue;

        // Try to match header to known field
        const fieldDef = CHARACTER_FIELDS.find(f =>
            f.label.toLowerCase() === headerText.toLowerCase() ||
            f.key === headerText.toLowerCase().replace(/\s+/g, '_'),
        );

        // Skip non-character fields like "Summary" or "Notes"
        const skipHeaders = ['summary', 'notes', 'changes', 'revised', 'original'];
        if (!fieldDef && skipHeaders.some(s => headerText.toLowerCase().includes(s))) {
            continue;
        }

        fields.push({
            key: fieldDef?.key || headerText.toLowerCase().replace(/\s+/g, '_'),
            label: fieldDef?.label || headerText,
            value: content,
        });
    }

    if (fields.length === 0) return null;

    return {
        fields,
        raw: response,
        parseMethod: 'markdown',
    };
}

function tryParseWithHeuristics(response: string): ParsedRewrite | null {
    const fields: ParsedRewriteField[] = [];

    // Look for patterns like "Description:" or "**Description:**"
    for (const fieldDef of CHARACTER_FIELDS) {
        const patterns = [
            new RegExp(`\\*\\*${fieldDef.label}:\\*\\*\\s*([\\s\\S]*?)(?=\\*\\*[A-Z]|$)`, 'i'),
            new RegExp(`${fieldDef.label}:\\s*([\\s\\S]*?)(?=\\n[A-Z][a-z]+:|$)`, 'i'),
            new RegExp(`\\[${fieldDef.label}\\]\\s*([\\s\\S]*?)(?=\\[[A-Z]|$)`, 'i'),
        ];

        for (const pattern of patterns) {
            const match = response.match(pattern);
            if (match && match[1].trim()) {
                fields.push({
                    key: fieldDef.key,
                    label: fieldDef.label,
                    value: match[1].trim(),
                });
                break;
            }
        }
    }

    if (fields.length === 0) return null;

    return {
        fields,
        raw: response,
        parseMethod: 'heuristic',
    };
}

function formatFieldLabel(key: string): string {
    return key
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, c => c.toUpperCase());
}

// ============================================================================
// APPLY REWRITE TO CHARACTER
// ============================================================================

/**
 * Apply parsed rewrite fields to a character.
 * Returns the updated character data or null on failure.
 */
export async function applyRewriteToCharacter(
    state: PipelineState,
    parsedFields: ParsedRewriteField[],
): Promise<{ success: boolean; error?: string; updatedFields: string[] }> {
    if (!state.character || state.characterIndex === null) {
        return { success: false, error: 'No character selected', updatedFields: [] };
    }

    const { characters, unshallowCharacter, getRequestHeaders } = SillyTavern.getContext();

    try {
        // Ensure character data is fully loaded
        await unshallowCharacter(state.characterIndex);

        // Get fresh character reference after unshallow
        const charList = characters as Character[];
        const character = charList[state.characterIndex];

        if (!character) {
            return { success: false, error: 'Character not found after unshallow', updatedFields: [] };
        }

        // Build update object
        const updates: Partial<Character> = {};
        const updatedFields: string[] = [];

        for (const field of parsedFields) {
            // Only update known character fields
            const fieldDef = CHARACTER_FIELDS.find(f => f.key === field.key);
            if (fieldDef && field.value.trim()) {
                (updates as Record<string, string>)[field.key] = field.value.trim();
                updatedFields.push(field.label);
            }
        }

        if (updatedFields.length === 0) {
            return { success: false, error: 'No valid fields to update', updatedFields: [] };
        }

        // Apply updates to character object
        Object.assign(character, updates);

        // Save to server
        const saveResponse = await fetch('/api/characters/edit', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                avatar_url: character.avatar,
                ...character,
            }),
        });

        if (!saveResponse.ok) {
            const errorText = await saveResponse.text();
            logError('Failed to save character', { status: saveResponse.status, error: errorText });
            return { success: false, error: `Save failed: ${saveResponse.status}`, updatedFields: [] };
        }

        debugLog('info', 'Character updated successfully', {
            name: character.name,
            updatedFields,
        });

        return { success: true, updatedFields };
    } catch (e) {
        logError('Error applying rewrite to character', e);
        return { success: false, error: (e as Error).message, updatedFields: [] };
    }
}

// ============================================================================
// PIPELINE NAVIGATION
// ============================================================================

/**
 * Get the next stage in the selected pipeline
 */
export function getNextStage(state: PipelineState, currentStage: StageName): StageName | null {
    const currentIndex = state.selectedStages.indexOf(currentStage);
    if (currentIndex === -1 || currentIndex >= state.selectedStages.length - 1) {
        return null;
    }
    return state.selectedStages[currentIndex + 1];
}

/**
 * Get the previous stage in the selected pipeline
 */
export function getPreviousStage(state: PipelineState, currentStage: StageName): StageName | null {
    const currentIndex = state.selectedStages.indexOf(currentStage);
    if (currentIndex <= 0) {
        return null;
    }
    return state.selectedStages[currentIndex - 1];
}

/**
 * Get the first incomplete stage in the pipeline
 */
export function getFirstIncompleteStage(state: PipelineState): StageName | null {
    for (const stage of state.selectedStages) {
        const status = state.stageStatus[stage];
        if (status === 'pending' || status === 'running') {
            return stage;
        }
    }
    return null;
}

/**
 * Check if all selected stages are complete
 */
export function isPipelineComplete(state: PipelineState): boolean {
    return state.selectedStages.every(stage => {
        const status = state.stageStatus[stage];
        return status === 'complete' || status === 'skipped';
    });
}

/**
 * Check if pipeline is ready for export
 */
export function canExport(state: PipelineState): boolean {
    // Need at least rewrite results to export
    return !!state.results.rewrite;
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

/**
 * Build the complete prompt for a stage, including template substitution.
 * If no placeholders are detected, prepends character data automatically.
 */
export function buildStagePrompt(state: PipelineState, stage: StageName): string | null {
    if (!state.character) {
        return null;
    }

    const config = state.configs[stage];
    const basePrompt = resolvePrompt(config);

    if (!basePrompt.trim()) {
        return null;
    }

    // Build character summary
    const characterSummary = buildCharacterSummary(state.character);

    // Build template context with all available data
    const { name1 } = SillyTavern.getContext();

    const context = {
        originalCharacter: characterSummary,
        scoreResults: state.results.score?.response || '',
        rewriteResults: state.results.rewrite?.response || '',
        currentRewrite: state.results.rewrite?.response || '',
        currentAnalysis: state.results.analyze?.response || '',
        iterationNumber: String(state.iterationCount + 1),
        charName: state.character.name,
        userName: name1 || 'User',
    };

    // Check which placeholders are used in the prompt
    const foundPlaceholders = promptHasPlaceholders(basePrompt);
    const hasAnyPlaceholder = foundPlaceholders.length > 0;

    // Process template placeholders in the prompt
    const processedPrompt = processPromptTemplate(basePrompt, context);

    // If prompt has placeholders, trust that user knows what they're doing
    if (hasAnyPlaceholder) {
        // But still check if critical data is missing
        const usesCharacterPlaceholder = foundPlaceholders.includes('ORIGINAL_CHARACTER');

        // If they use character placeholder, just return processed prompt
        if (usesCharacterPlaceholder) {
            return processedPrompt;
        }

        // If they use other placeholders but not character, prepend character data
        return buildStructuredPrompt(stage, state, characterSummary, processedPrompt);
    }

    // No placeholders detected - prepend all relevant data automatically
    debugLog('info', 'No placeholders in prompt, auto-prepending character data', { stage });
    return buildStructuredPrompt(stage, state, characterSummary, processedPrompt);
}

/**
 * Build the refinement prompt
 */
export function buildRefinementPrompt(state: PipelineState): string | null {
    if (!state.character || !state.results.rewrite || !state.results.analyze) {
        return null;
    }

    const settings = getSettings();
    const basePrompt = settings.refinementPrompt;

    const characterSummary = buildCharacterSummary(state.character);
    const { name1 } = SillyTavern.getContext();

    const context = {
        originalCharacter: characterSummary,
        scoreResults: state.results.score?.response || '',
        rewriteResults: state.results.rewrite.response,
        currentRewrite: state.results.rewrite.response,
        currentAnalysis: state.results.analyze.response,
        iterationNumber: String(state.iterationCount + 1),
        charName: state.character.name,
        userName: name1 || 'User',
    };

    return processPromptTemplate(basePrompt, context);
}

/**
 * Build a structured prompt with all relevant data prepended
 */
function buildStructuredPrompt(
    stage: StageName,
    state: PipelineState,
    characterSummary: string,
    instructions: string,
): string {
    const parts: string[] = [];

    // Always include character
    const stageAction = stage === 'score' ? 'Analyze' : stage === 'rewrite' ? 'Rewrite' : 'Compare';
    parts.push(`# Character to ${stageAction}`, '', characterSummary);

    // Stage-specific data
    switch (stage) {
        case 'score':
            // Score only needs character - already added above
            break;

        case 'rewrite':
            // Include score results if available
            if (state.results.score?.response) {
                parts.push('', '---', '', '# Score Feedback', '', 'Use this feedback to guide your rewrite:', '', state.results.score.response);
            }
            break;

        case 'analyze':
            // Include rewrite results
            if (state.results.rewrite?.response) {
                parts.push('', '---', '', '# Rewritten Version', '', 'Compare this against the original:', '', state.results.rewrite.response);
            }

            // Include score results if available
            if (state.results.score?.response) {
                parts.push('', '---', '', '# Original Score Feedback', '', 'Reference for what was identified as needing improvement:', '', state.results.score.response);
            }
            break;
    }

    // Add the instructions/prompt
    parts.push('', '---', '', '# Instructions', '', instructions);

    return parts.join('\n');
}

/**
 * Get the schema for a stage (if structured output is enabled)
 */
export function getStageSchema(state: PipelineState, stage: StageName): StructuredOutputSchema | null {
    const config = state.configs[stage];
    return resolveSchema(config);
}

// ============================================================================
// EXPORT
// ============================================================================

/**
 * Generate export data from rewrite results
 */
export function generateExportData(state: PipelineState): string | null {
    if (!state.results.rewrite || !state.character) {
        return null;
    }

    const rewriteResponse = state.results.rewrite.response;

    const exportLines = [
        `# ${state.character.name} (Rewritten)`,
        '',
        `Generated: ${new Date().toLocaleString()}`,
        `Iterations: ${state.iterationCount}`,
        '',
        '---',
        '',
        rewriteResponse,
    ];

    // If we have analyze results, include them as notes
    if (state.results.analyze) {
        exportLines.push(
            '',
            '---',
            '',
            '## Final Analysis',
            '',
            state.results.analyze.response,
        );
    }

    // If we have score results, include summary
    if (state.results.score) {
        exportLines.push(
            '',
            '---',
            '',
            '## Original Score',
            '',
            state.results.score.response,
        );
    }

    // Include iteration history summary if we have any
    if (state.iterationHistory.length > 0) {
        exportLines.push(
            '',
            '---',
            '',
            '## Iteration History',
            '',
        );

        for (const snap of state.iterationHistory) {
            exportLines.push(
                `### Iteration ${snap.iteration + 1} - ${snap.verdict.toUpperCase()}`,
                `${new Date(snap.timestamp).toLocaleString()}`,
                '',
            );
        }
    }

    return exportLines.join('\n');
}

/**
 * Set export data in state
 */
export function setExportData(state: PipelineState): PipelineState {
    const exportData = generateExportData(state);

    return {
        ...state,
        exportData,
    };
}

// ============================================================================
// STATE QUERIES
// ============================================================================

/**
 * Get a summary of pipeline state for debugging/display
 */
export function getPipelineSummary(state: PipelineState): {
    hasCharacter: boolean;
    characterName: string | null;
    selectedStages: StageName[];
    stageStatuses: Record<StageName, StageStatus>;
    completedStages: StageName[];
    lockedStages: StageName[];
    currentStage: StageName | null;
    canExport: boolean;
    isComplete: boolean;
    iterationCount: number;
    isRefining: boolean;
    lastVerdict: IterationVerdict | null;
} {
    const completedStages = STAGES.filter(s => state.stageStatus[s] === 'complete');
    const lockedStages = STAGES.filter(s => state.results[s]?.locked);

    const lastSnapshot = state.iterationHistory.length > 0
        ? state.iterationHistory[state.iterationHistory.length - 1]
        : null;

    return {
        hasCharacter: !!state.character,
        characterName: state.character?.name || null,
        selectedStages: state.selectedStages,
        stageStatuses: { ...state.stageStatus },
        completedStages,
        lockedStages,
        currentStage: state.currentStage,
        canExport: canExport(state),
        isComplete: isPipelineComplete(state),
        iterationCount: state.iterationCount,
        isRefining: state.isRefining,
        lastVerdict: lastSnapshot?.verdict || null,
    };
}

/**
 * Check if a specific stage has results (complete or not)
 */
export function hasStageResult(state: PipelineState, stage: StageName): boolean {
    return !!state.results[stage];
}

/**
 * Check if a specific stage result is locked
 */
export function isStageResultLocked(state: PipelineState, stage: StageName): boolean {
    return !!state.results[stage]?.locked;
}

/**
 * Get stage result if available
 */
export function getStageResult(state: PipelineState, stage: StageName): StageResult | null {
    return state.results[stage];
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate pipeline state before running
 */
export interface PipelineValidation {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export function validatePipeline(state: PipelineState): PipelineValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Must have character
    if (!state.character) {
        errors.push('No character selected');
    }

    // Must have at least one stage selected
    if (state.selectedStages.length === 0) {
        errors.push('No stages selected');
    }

    // Check each selected stage
    for (const stage of state.selectedStages) {
        const config = state.configs[stage];
        const prompt = resolvePrompt(config);

        if (!prompt.trim()) {
            errors.push(`${stage}: No prompt configured`);
        }

        // Warn about missing dependencies (but don't error - we auto-include now)
        if (stage === 'rewrite' && !state.results.score && state.selectedStages.includes('score')) {
            warnings.push('Rewrite will run without score feedback (score not complete)');
        }

        if (stage === 'analyze' && !state.results.rewrite) {
            errors.push('Analyze requires rewrite results');
        }
    }

    // Check API readiness
    const { onlineStatus } = SillyTavern.getContext();
    if (onlineStatus !== 'Valid' && onlineStatus !== 'Connected') {
        errors.push('API is not connected');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Validate refinement before running
 */
export function validateRefinement(state: PipelineState): PipelineValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!state.character) {
        errors.push('No character selected');
    }

    if (!state.results.rewrite) {
        errors.push('No rewrite to refine');
    }

    if (!state.results.analyze) {
        errors.push('Run analyze first to identify issues');
    }

    // Check API readiness
    const { onlineStatus } = SillyTavern.getContext();
    if (onlineStatus !== 'Valid' && onlineStatus !== 'Connected') {
        errors.push('API is not connected');
    }

    // Warn if last verdict was accept
    const lastSnapshot = state.iterationHistory.length > 0
        ? state.iterationHistory[state.iterationHistory.length - 1]
        : null;

    if (lastSnapshot?.verdict === 'accept') {
        warnings.push('Last analysis suggested accepting the rewrite');
    }

    if (state.iterationCount >= 5) {
        warnings.push(`Already at iteration ${state.iterationCount + 1} - consider accepting or starting fresh`);
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

// ============================================================================
// SERIALIZATION (for potential future persistence)
// ============================================================================

/**
 * Serialize pipeline state to JSON-safe object
 */
export function serializePipelineState(state: PipelineState): Record<string, unknown> {
    return {
        characterIndex: state.characterIndex,
        results: state.results,
        configs: state.configs,
        selectedStages: state.selectedStages,
        stageStatus: state.stageStatus,
        iterationCount: state.iterationCount,
        iterationHistory: state.iterationHistory,
        isRefining: state.isRefining,
        exportData: state.exportData,
        // Don't serialize character - will be re-fetched by index
    };
}

/**
 * Deserialize pipeline state (would need character list to restore character)
 */
export function deserializePipelineState(
    data: Record<string, unknown>,
    characters: Character[],
): PipelineState | null {
    try {
        const characterIndex = data.characterIndex as number | null;
        const character = characterIndex !== null ? characters[characterIndex] : null;

        return {
            character,
            characterIndex,
            results: data.results as PipelineState['results'],
            configs: data.configs as PipelineState['configs'],
            selectedStages: data.selectedStages as StageName[],
            currentStage: null,  // Always reset to null on restore
            stageStatus: data.stageStatus as Record<StageName, StageStatus>,
            iterationCount: (data.iterationCount as number) || 0,
            iterationHistory: (data.iterationHistory as IterationSnapshot[]) || [],
            isRefining: (data.isRefining as boolean) || false,
            exportData: data.exportData as string | null,
        };
    } catch (e) {
        logError('Failed to deserialize pipeline state', e);
        return null;
    }
}
