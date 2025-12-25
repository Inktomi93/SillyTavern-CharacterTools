// src/pipeline.ts
//
// Pipeline state machine for managing the character analysis workflow.
// Handles stage progression, state transitions, and result management.

import type {
    StageName,
    StageStatus,
    StageResult,
    StageConfig,
    PipelineState,
    Character,
    PopulatedField,
    StructuredOutputSchema,
} from './types';
import { STAGES, CHARACTER_FIELDS } from './constants';
import { createStageConfigFromDefaults, resolvePrompt, resolveSchema, processPromptTemplate } from './presets';
import { debugLog } from './debug';

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
 *
 * Data flow:
 * - Score: Gets character data only
 * - Rewrite: Gets character + score results (if available)
 * - Analyze: Gets original character + rewrite results + score results (if available)
 *
 * If the prompt uses {{placeholders}}, they get substituted.
 * If not, data is automatically prepended in a structured format.
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
        charName: state.character.name,
        userName: name1 || 'User',
    };

    // Check which placeholders are used in the prompt
    const promptLower = basePrompt.toLowerCase();
    const usesCharacterPlaceholder = promptLower.includes('{{original_character}}');
    const usesScorePlaceholder = promptLower.includes('{{score_results}}');
    const usesRewritePlaceholder = promptLower.includes('{{rewrite_results}}');

    // Process template placeholders in the prompt
    const processedPrompt = processPromptTemplate(basePrompt, context);

    // If ALL relevant placeholders are used, just return the processed prompt
    const allPlaceholdersUsed = checkAllPlaceholdersUsed(stage, usesCharacterPlaceholder, usesScorePlaceholder, usesRewritePlaceholder, state);

    if (allPlaceholdersUsed) {
        return processedPrompt;
    }

    // Otherwise, build a structured prompt with all relevant data
    return buildStructuredPrompt(stage, state, characterSummary, processedPrompt, {
        usesCharacterPlaceholder,
        usesScorePlaceholder,
        usesRewritePlaceholder,
    });
}

/**
 * Check if all relevant placeholders for a stage are used
 */
function checkAllPlaceholdersUsed(
    stage: StageName,
    usesCharacter: boolean,
    usesScore: boolean,
    usesRewrite: boolean,
    state: PipelineState,
): boolean {
    switch (stage) {
        case 'score':
            // Score only needs character
            return usesCharacter;

        case 'rewrite':
            // Rewrite needs character, and score if available
            if (!usesCharacter) return false;
            if (state.results.score && !usesScore) return false;
            return true;

        case 'analyze':
            // Analyze needs character, rewrite, and score if available
            if (!usesCharacter) return false;
            if (state.results.rewrite && !usesRewrite) return false;
            if (state.results.score && !usesScore) return false;
            return true;

        default:
            return false;
    }
}

/**
 * Build a structured prompt with all relevant data prepended
 */
function buildStructuredPrompt(
    stage: StageName,
    state: PipelineState,
    characterSummary: string,
    instructions: string,
    usedPlaceholders: { usesCharacterPlaceholder: boolean; usesScorePlaceholder: boolean; usesRewritePlaceholder: boolean },
): string {
    const parts: string[] = [];

    // Always include character if not already in prompt via placeholder
    if (!usedPlaceholders.usesCharacterPlaceholder) {
        const stageAction = stage === 'score' ? 'Analyze' : stage === 'rewrite' ? 'Rewrite' : 'Compare';
        parts.push(`# Character to ${stageAction}`, '', characterSummary);
    }

    // Stage-specific data
    switch (stage) {
        case 'score':
            // Score only needs character - already added above
            break;

        case 'rewrite':
            // Include score results if available and not already in prompt
            if (state.results.score?.response && !usedPlaceholders.usesScorePlaceholder) {
                parts.push('', '---', '', '# Score Feedback', '', 'Use this feedback to guide your rewrite:', '', state.results.score.response);
            }
            break;

        case 'analyze':
            // Include rewrite results if available and not already in prompt
            if (state.results.rewrite?.response && !usedPlaceholders.usesRewritePlaceholder) {
                parts.push('', '---', '', '# Rewritten Version', '', 'Compare this against the original:', '', state.results.rewrite.response);
            }

            // Include score results if available and not already in prompt
            if (state.results.score?.response && !usedPlaceholders.usesScorePlaceholder) {
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

    // Try to extract character card format from response
    // The rewrite prompt asks for complete character card output
    // We'll wrap it nicely for copying

    const exportLines = [
        `# ${state.character.name} (Rewritten)`,
        '',
        `Generated: ${new Date().toLocaleString()}`,
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
            '## Analysis Notes',
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
} {
    const completedStages = STAGES.filter(s => state.stageStatus[s] === 'complete');
    const lockedStages = STAGES.filter(s => state.results[s]?.locked);

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
            exportData: data.exportData as string | null,
        };
    } catch (e) {
        debugLog('error', 'Failed to deserialize pipeline state', e);
        return null;
    }
}
