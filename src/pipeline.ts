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
    StructuredOutputSchema,
    IterationSnapshot,
    IterationVerdict,
    FieldSelection,
} from './types';
import { STAGES, CHARACTER_FIELDS, MAX_ITERATION_HISTORY } from './constants';
import { createStageConfigFromDefaults, resolvePrompt, resolveSchema, processPromptTemplate, promptHasPlaceholders } from './presets';
import { getFullRefinementInstructions } from './settings';
import { debugLog, logError } from './debug';
import { getPopulatedFields, buildCharacterSummaryFromSelection } from './character';

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

        selectedStages: ['score', 'rewrite'],
        currentStage: null,
        stageStatus: {
            score: 'pending',
            rewrite: 'pending',
            analyze: 'pending',
        },

        iterationCount: 0,
        iterationHistory: [],
        isRefining: false,

        selectedFields: {},

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
        fresh.selectedFields = state.selectedFields;
    }

    debugLog('state', 'Pipeline reset', { keepCharacter, hasCharacter: !!fresh.character });
    return fresh;
}

// ============================================================================
// FIELD SELECTION
// ============================================================================

/**
 * Initialize field selection when character is set.
 * Defaults: all populated fields selected, all alt_greetings indices selected.
 */
export function initializeFieldSelection(char: Character): FieldSelection {
    const populated = getPopulatedFields(char);
    const selection: FieldSelection = {};

    for (const field of populated) {
        if (field.key === 'alternate_greetings' && Array.isArray(field.rawValue)) {
            // Select all greetings by default
            selection[field.key] = (field.rawValue as string[]).map((_, i) => i);
        } else {
            selection[field.key] = true;
        }
    }

    return selection;
}

/**
 * Update selection for a single field.
 */
export function updateFieldSelection(
    state: PipelineState,
    fieldKey: string,
    value: boolean | number[],
): PipelineState {
    return {
        ...state,
        selectedFields: {
            ...state.selectedFields,
            [fieldKey]: value,
        },
    };
}

/**
 * Select all fields for current character.
 */
export function selectAllFields(state: PipelineState): PipelineState {
    if (!state.character) return state;

    return {
        ...state,
        selectedFields: initializeFieldSelection(state.character),
    };
}

/**
 * Deselect all fields.
 */
export function deselectAllFields(state: PipelineState): PipelineState {
    return {
        ...state,
        selectedFields: {},
    };
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
        iterationCount: 0,
        iterationHistory: [],
        isRefining: false,
        selectedFields: character ? initializeFieldSelection(character) : {},
        exportData: null,
    };

    debugLog('state', 'Character set', {
        name: character?.name,
        index,
        fieldsPopulated: character ? getPopulatedFields(character).length : 0,
    });

    return newState;
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

    // Check if any fields are selected
    const hasSelectedFields = Object.values(state.selectedFields).some(v =>
        v === true || (Array.isArray(v) && v.length > 0),
    );

    if (!hasSelectedFields) {
        return { canRun: false, reason: 'No fields selected' };
    }

    switch (stage) {
        case 'score':
            return { canRun: true };

        case 'rewrite':
            if (state.selectedStages.includes('score') && !state.results.score) {
                return {
                    canRun: true,
                    reason: 'Score stage not complete - rewrite will run without score feedback',
                };
            }
            return { canRun: true };

        case 'analyze':
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

    if (state.results.rewrite.locked) {
        return { canRun: false, reason: 'Rewrite is accepted as final' };
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
export function failStage(state: PipelineState, stage: StageName, error: string): PipelineState {
    debugLog('error', 'Stage failed', { stage, error });

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

    if (upper.includes('READY TO USE') || upper.includes('NO MORE ITERATIONS')) {
        return 'accept';
    }
    if (upper.includes('WORSE THAN') || upper.includes('STEP BACKWARD') || upper.includes('LOST MORE')) {
        return 'regression';
    }

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
 */
export function startRefinement(state: PipelineState): PipelineState {
    const snapshot = createIterationSnapshot(state);

    if (!snapshot) {
        logError('Cannot start refinement - missing rewrite or analyze', null);
        return state;
    }

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

    const restoredRewrite: StageResult = {
        response: snapshot.rewriteResponse,
        isStructured: false,
        promptUsed: '[Restored from iteration history]',
        schemaUsed: null,
        timestamp: Date.now(),
        locked: false,
    };

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
// PROMPT BUILDING
// ============================================================================

/**
 * Build the complete prompt for a stage.
 * Always includes required data, with deduplication if user used placeholders.
 */
export function buildStagePrompt(state: PipelineState, stage: StageName): string | null {
    if (!state.character) return null;

    const config = state.configs[stage];
    const userPrompt = resolvePrompt(config);
    if (!userPrompt.trim()) return null;

    // Check which placeholders user included
    const usedPlaceholders = promptHasPlaceholders(userPrompt);

    // Build character summary from selected fields
    const characterSummary = buildCharacterSummaryFromSelection(
        state.character,
        state.selectedFields,
    );

    // Build context for placeholder substitution
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

    // Substitute any placeholders in user's prompt
    const processedUserPrompt = processPromptTemplate(userPrompt, context);

    // Build data sections, SKIPPING what user already included via placeholders
    const dataSections: string[] = [];

    // Character data (always needed for all stages)
    if (!usedPlaceholders.includes('ORIGINAL_CHARACTER')) {
        dataSections.push(`## Character\n\n${characterSummary}`);
    }

    // Score results (for rewrite and analyze stages)
    if (stage !== 'score' && state.results.score?.response) {
        if (!usedPlaceholders.includes('SCORE_RESULTS')) {
            dataSections.push(`## Score Feedback\n\n${state.results.score.response}`);
        }
    }

    // Rewrite results (for analyze stage)
    if (stage === 'analyze' && state.results.rewrite?.response) {
        const hasRewritePlaceholder =
            usedPlaceholders.includes('REWRITE_RESULTS') ||
            usedPlaceholders.includes('CURRENT_REWRITE');

        if (!hasRewritePlaceholder) {
            dataSections.push(`## Rewritten Version\n\n${state.results.rewrite.response}`);
        }
    }

    // Assemble final prompt
    const parts: string[] = [];

    if (dataSections.length > 0) {
        parts.push('# Input Data\n');
        parts.push(dataSections.join('\n\n---\n\n'));
        parts.push('\n\n---\n');
    }

    parts.push('# Instructions\n\n');
    parts.push(processedUserPrompt);

    return parts.join('');
}

/**
 * Build the refinement prompt with deduplication.
 */
export function buildRefinementPrompt(state: PipelineState): string | null {
    if (!state.character || !state.results.rewrite || !state.results.analyze) {
        return null;
    }

    // Get refinement instructions (base + user)
    const userPrompt = getFullRefinementInstructions();

    // Check which placeholders user included
    const usedPlaceholders = promptHasPlaceholders(userPrompt);

    // Build character summary from selected fields
    const characterSummary = buildCharacterSummaryFromSelection(
        state.character,
        state.selectedFields,
    );

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

    // Substitute placeholders
    const processedUserPrompt = processPromptTemplate(userPrompt, context);

    // Build data sections with deduplication
    const dataSections: string[] = [];

    if (!usedPlaceholders.includes('ORIGINAL_CHARACTER')) {
        dataSections.push(`## Original Character (Ground Truth)\n\n${characterSummary}`);
    }

    const hasRewritePlaceholder =
        usedPlaceholders.includes('CURRENT_REWRITE') ||
        usedPlaceholders.includes('REWRITE_RESULTS');

    if (!hasRewritePlaceholder) {
        dataSections.push(`## Current Rewrite (Iteration ${state.iterationCount + 1})\n\n${state.results.rewrite.response}`);
    }

    if (!usedPlaceholders.includes('CURRENT_ANALYSIS')) {
        dataSections.push(`## Analysis of Current Rewrite\n\n${state.results.analyze.response}`);
    }

    if (state.results.score?.response && !usedPlaceholders.includes('SCORE_RESULTS')) {
        dataSections.push(`## Original Score Feedback\n\n${state.results.score.response}`);
    }

    // Assemble
    const parts: string[] = [];

    if (dataSections.length > 0) {
        parts.push('# Input Data\n');
        parts.push(dataSections.join('\n\n---\n\n'));
        parts.push('\n\n---\n');
    }

    parts.push('# Refinement Instructions\n\n');
    parts.push(processedUserPrompt);

    return parts.join('');
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
 * Generate export data from pipeline results
 */
export function generateExportData(state: PipelineState): string | null {
    if (!state.results.rewrite || !state.character) {
        return null;
    }

    const { moment } = SillyTavern.libs;

    const exportLines = [
        '<!-- CharacterTools Export v1 -->',
        '',
        `# ${state.character.name} - Character Tools Session`,
        '',
        `**Exported:** ${moment().format('YYYY-MM-DD HH:mm:ss')}`,
        `**Iterations:** ${state.iterationCount}`,
        '',
    ];

    // Selected fields
    exportLines.push('## Fields Included');
    exportLines.push('');
    for (const [key, value] of Object.entries(state.selectedFields)) {
        if (value === true) {
            const field = CHARACTER_FIELDS.find(f => f.key === key);
            exportLines.push(`- ${field?.label || key}`);
        } else if (Array.isArray(value) && value.length > 0) {
            const field = CHARACTER_FIELDS.find(f => f.key === key);
            exportLines.push(`- ${field?.label || key} (items: ${value.map(i => i + 1).join(', ')})`);
        }
    }
    exportLines.push('');

    // Results
    if (state.results.score) {
        exportLines.push('---');
        exportLines.push('');
        exportLines.push('## Score Results');
        exportLines.push('');
        exportLines.push(state.results.score.response);
        exportLines.push('');
    }

    if (state.results.rewrite) {
        exportLines.push('---');
        exportLines.push('');
        exportLines.push('## Rewrite Results');
        exportLines.push('');
        exportLines.push(state.results.rewrite.response);
        exportLines.push('');
    }

    if (state.results.analyze) {
        exportLines.push('---');
        exportLines.push('');
        exportLines.push('## Analysis Results');
        exportLines.push('');
        exportLines.push(state.results.analyze.response);
        exportLines.push('');
    }

    // Iteration history
    if (state.iterationHistory.length > 0) {
        exportLines.push('---');
        exportLines.push('');
        exportLines.push('## Iteration History');
        exportLines.push('');

        for (const snap of state.iterationHistory) {
            exportLines.push(`### Iteration ${snap.iteration + 1} - ${snap.verdict.toUpperCase()}`);
            exportLines.push(`*${moment(snap.timestamp).format('YYYY-MM-DD HH:mm:ss')}*`);
            exportLines.push('');
            exportLines.push('#### Rewrite');
            exportLines.push('');
            exportLines.push(snap.rewriteResponse);
            exportLines.push('');
            exportLines.push('#### Analysis');
            exportLines.push('');
            exportLines.push(snap.analysisResponse);
            exportLines.push('');
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
    return !!state.results.rewrite;
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

    if (!state.character) {
        errors.push('No character selected');
    }

    if (state.selectedStages.length === 0) {
        errors.push('No stages selected');
    }

    // Check if any fields are selected
    const hasSelectedFields = Object.values(state.selectedFields).some(v =>
        v === true || (Array.isArray(v) && v.length > 0),
    );

    if (!hasSelectedFields) {
        errors.push('No fields selected');
    }

    for (const stage of state.selectedStages) {
        const config = state.configs[stage];
        const prompt = resolvePrompt(config);

        if (!prompt.trim()) {
            errors.push(`${stage}: No prompt configured`);
        }

        if (stage === 'rewrite' && !state.results.score && state.selectedStages.includes('score')) {
            warnings.push('Rewrite will run without score feedback (score not complete)');
        }

        if (stage === 'analyze' && !state.results.rewrite) {
            errors.push('Analyze requires rewrite results');
        }
    }

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

    const { onlineStatus } = SillyTavern.getContext();
    if (onlineStatus !== 'Valid' && onlineStatus !== 'Connected') {
        errors.push('API is not connected');
    }

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
// SERIALIZATION
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
        selectedFields: state.selectedFields,
        exportData: state.exportData,
    };
}

/**
 * Deserialize pipeline state
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
            currentStage: null,
            stageStatus: data.stageStatus as Record<StageName, StageStatus>,
            iterationCount: (data.iterationCount as number) || 0,
            iterationHistory: (data.iterationHistory as IterationSnapshot[]) || [],
            isRefining: (data.isRefining as boolean) || false,
            selectedFields: (data.selectedFields as FieldSelection) || {},
            exportData: data.exportData as string | null,
        };
    } catch (e) {
        logError('Failed to deserialize pipeline state', e);
        return null;
    }
}
