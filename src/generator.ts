// src/generator.ts
//
// Handles LLM generation for pipeline stages and refinement.
// Supports both ST's current settings and custom API configuration.

import { getSettings, getFullSystemPrompt } from './settings';
import { debugLog, logError } from './debug';
import type {
    StructuredOutputSchema,
    GenerationResult,
    PipelineState,
    StageName,
} from './types';
import { buildStagePrompt, buildRefinementPrompt, getStageSchema } from './pipeline';

// ============================================================================
// API STATUS
// ============================================================================

/**
 * Check if the API is ready for generation
 */
export function isApiReady(): boolean {
    const { onlineStatus } = SillyTavern.getContext();
    return onlineStatus === 'Valid' || onlineStatus === 'Connected';
}

/**
 * Get current API info for display
 */
export function getApiInfo(): { source: string; model: string; isReady: boolean } {
    const context = SillyTavern.getContext();
    const settings = getSettings();

    if (settings.useCurrentSettings) {
        return {
            source: context.chatCompletionSettings?.chat_completion_source || context.mainApi || 'unknown',
            model: context.chatCompletionSettings?.openrouter_model ||
             context.chatCompletionSettings?.model_openai_select ||
             'unknown',
            isReady: isApiReady(),
        };
    }

    return {
        source: settings.generationConfig.source,
        model: settings.generationConfig.model,
        isReady: isApiReady(),
    };
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

/**
 * Run generation for a pipeline stage.
 */
export async function runStageGeneration(
    state: PipelineState,
    stage: StageName,
    signal?: AbortSignal,
): Promise<GenerationResult> {
    const context = SillyTavern.getContext();
    const settings = getSettings();

    // Pre-flight checks
    if (signal?.aborted) {
        return { success: false, error: 'Generation cancelled' };
    }

    if (!state.character) {
        return { success: false, error: 'No character selected' };
    }

    if (!isApiReady()) {
        logError('API not ready', { onlineStatus: context.onlineStatus });
        return { success: false, error: 'API is not connected. Check your connection settings.' };
    }

    // Build prompt
    const userPrompt = buildStagePrompt(state, stage);
    if (!userPrompt) {
        return { success: false, error: 'No prompt configured for this stage' };
    }

    // Get schema if structured output is enabled
    const config = state.configs[stage];
    const jsonSchema = config.useStructuredOutput ? getStageSchema(state, stage) : null;

    // Substitute character placeholders in the prompt
    const processedPrompt = substituteCharacterPlaceholders(
        userPrompt,
        state.character.name,
        context.name1 || 'User',
    );

    // Get full system prompt for this stage
    const systemPrompt = getFullSystemPrompt(stage);

    debugLog('info', 'Starting stage generation', {
        stage,
        character: state.character.name,
        useCurrentSettings: settings.useCurrentSettings,
        useStructured: !!jsonSchema,
        schemaName: jsonSchema?.name,
        promptLength: processedPrompt.length,
        systemPromptLength: systemPrompt.length,
    });

    const result = await executeGeneration(
        systemPrompt,
        processedPrompt,
        jsonSchema,
        signal,
        settings.useCurrentSettings,
    );

    // If structured output was requested, validate the response
    if (result.success && jsonSchema) {
        return validateStructuredResponse(result.response, jsonSchema);
    }

    return result;
}

/**
 * Run refinement generation.
 */
export async function runRefinementGeneration(
    state: PipelineState,
    signal?: AbortSignal,
): Promise<GenerationResult> {
    const context = SillyTavern.getContext();
    const settings = getSettings();

    // Pre-flight checks
    if (signal?.aborted) {
        return { success: false, error: 'Generation cancelled' };
    }

    if (!state.character) {
        return { success: false, error: 'No character selected' };
    }

    if (!state.results.rewrite || !state.results.analyze) {
        return { success: false, error: 'Refinement requires both rewrite and analyze results' };
    }

    if (!isApiReady()) {
        logError('API not ready', { onlineStatus: context.onlineStatus });
        return { success: false, error: 'API is not connected. Check your connection settings.' };
    }

    // Build refinement prompt
    const userPrompt = buildRefinementPrompt(state);
    if (!userPrompt) {
        return { success: false, error: 'Failed to build refinement prompt' };
    }

    // Substitute character placeholders
    const processedPrompt = substituteCharacterPlaceholders(
        userPrompt,
        state.character.name,
        context.name1 || 'User',
    );

    // Get system prompt (use 'rewrite' stage additions for refinement)
    const systemPrompt = getFullSystemPrompt('rewrite');

    debugLog('info', 'Starting refinement generation', {
        iteration: state.iterationCount + 1,
        character: state.character.name,
        promptLength: processedPrompt.length,
    });

    // Refinement doesn't use structured output
    return await executeGeneration(
        systemPrompt,
        processedPrompt,
        null,
        signal,
        settings.useCurrentSettings,
    );
}

/**
 * Validate structured response and fall back gracefully if parsing fails
 */
function validateStructuredResponse(
    response: string,
    schema: StructuredOutputSchema,
): GenerationResult {
    try {
        const parsed = JSON.parse(response);

        // Basic structure validation - check required fields exist
        if (schema.value.required && Array.isArray(schema.value.required)) {
            const missing = schema.value.required.filter(
                field => !(field in parsed),
            );

            if (missing.length > 0) {
                debugLog('info', 'Structured response missing required fields, returning as unstructured', {
                    missing,
                    schemaName: schema.name,
                });
                return {
                    success: true,
                    response,
                    isStructured: false,
                };
            }
        }

        return {
            success: true,
            response,
            isStructured: true,
        };
    } catch (e) {
        debugLog('info', 'Failed to parse structured response, returning as unstructured', {
            error: (e as Error).message,
            schemaName: schema.name,
            responsePreview: response.substring(0, 200),
        });

        return {
            success: true,
            response,
            isStructured: false,
        };
    }
}

/**
 * Core generation execution
 */
async function executeGeneration(
    systemPrompt: string,
    userPrompt: string,
    jsonSchema: StructuredOutputSchema | null,
    signal: AbortSignal | undefined,
    useCurrentSettings: boolean,
): Promise<GenerationResult> {
    try {
        let response: string;

        if (useCurrentSettings) {
            response = await generateWithCurrentSettings(
                systemPrompt,
                userPrompt,
                jsonSchema,
                signal,
            );
        } else {
            response = await generateWithCustomSettings(
                systemPrompt,
                userPrompt,
                jsonSchema,
                signal,
            );
        }

        if (signal?.aborted) {
            return { success: false, error: 'Generation cancelled' };
        }

        if (!response || response.trim() === '') {
            logError('Empty response', null);
            return { success: false, error: 'Empty response from API' };
        }

        debugLog('info', 'Generation complete', {
            responseLength: response.length,
            isStructured: !!jsonSchema,
        });

        return {
            success: true,
            response,
            isStructured: !!jsonSchema,
        };
    } catch (err) {
        if ((err as Error).name === 'AbortError' || signal?.aborted) {
            debugLog('info', 'Generation aborted', null);
            return { success: false, error: 'Generation cancelled' };
        }

        logError('Generation exception', {
            message: err instanceof Error ? err.message : String(err),
        });

        const errorMessage = err instanceof Error ? err.message : String(err);
        return { success: false, error: errorMessage };
    }
}

// ============================================================================
// GENERATION METHODS
// ============================================================================

/**
 * Generate using ST's current API settings
 */
async function generateWithCurrentSettings(
    systemPrompt: string,
    userPrompt: string,
    jsonSchema: StructuredOutputSchema | null,
    signal?: AbortSignal,
): Promise<string> {
    const { generateRaw, substituteParams } = SillyTavern.getContext();

    const processedSystemPrompt = substituteParams(systemPrompt);

    debugLog('request', 'generateRaw request', {
        hasSchema: !!jsonSchema,
        schemaName: jsonSchema?.name,
        systemPromptLength: processedSystemPrompt.length,
        userPromptLength: userPrompt.length,
    });

    if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }

    const rawResponse = await generateRaw({
        prompt: [
            { role: 'system', content: processedSystemPrompt },
            { role: 'user', content: userPrompt },
        ],
        jsonSchema: jsonSchema as StructuredOutputSchema | null,
    });

    if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }

    const response = ensureString(rawResponse);

    debugLog('response', 'generateRaw response', {
        type: typeof rawResponse,
        length: response.length,
        preview: response.substring(0, 200),
    });

    return response;
}

/**
 * Generate using custom API settings
 */
async function generateWithCustomSettings(
    systemPrompt: string,
    userPrompt: string,
    jsonSchema: StructuredOutputSchema | null,
    signal?: AbortSignal,
): Promise<string> {
    const { ChatCompletionService, substituteParams } = SillyTavern.getContext();
    const settings = getSettings();
    const config = settings.generationConfig;

    const processedSystemPrompt = substituteParams(systemPrompt);

    const requestOptions: Record<string, unknown> = {
        stream: true,
        messages: [
            { role: 'system', content: processedSystemPrompt },
            { role: 'user', content: userPrompt },
        ],
        chat_completion_source: config.source,
        model: config.model,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        frequency_penalty: config.frequencyPenalty,
        presence_penalty: config.presencePenalty,
        top_p: config.topP,
    };

    if (jsonSchema) {
        requestOptions.json_schema = jsonSchema;
    }

    debugLog('request', 'ChatCompletionService request', {
        source: config.source,
        model: config.model,
        stream: true,
        hasSchema: !!jsonSchema,
    });

    if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }

    const result = await ChatCompletionService.sendRequest(requestOptions);

    debugLog('response', 'ChatCompletionService result type', {
        type: typeof result,
        isFunction: typeof result === 'function',
        isGenerator: result && typeof result === 'object' && Symbol.asyncIterator in result,
    });

    let response: string;

    if (typeof result === 'function') {
        response = await consumeStreamGenerator(result, signal);
    } else if (result && typeof result === 'object') {
        const resultObj = result as Record<string, unknown>;

        if (resultObj.error) {
            logError('API returned error', result);
            throw new Error(`API error: ${JSON.stringify(result)}`);
        }

        response = ensureString(resultObj.content || result);
    } else {
        response = ensureString(result);
    }

    debugLog('response', 'Final response', {
        length: response.length,
        preview: response.substring(0, 200),
    });

    return response;
}

/**
 * Consume a streaming generator and return the final accumulated text
 */
async function consumeStreamGenerator(
    generatorFn: () => AsyncGenerator<unknown>,
    signal?: AbortSignal,
): Promise<string> {
    let finalText = '';
    let generator: AsyncGenerator<unknown> | null = null;

    try {
        generator = generatorFn();

        for await (const chunk of generator) {
            if (signal?.aborted) {
                debugLog('info', 'Stream aborted', { textSoFar: finalText.length });
                try {
                    await generator.return(undefined);
                } catch {
                    // Ignore errors during cleanup
                }
                throw new DOMException('Aborted', 'AbortError');
            }

            const chunkObj = chunk as Record<string, unknown>;

            if (typeof chunkObj.text === 'string') {
                finalText = chunkObj.text;
            }

            if (chunkObj.error) {
                throw new Error(ensureString(chunkObj.error));
            }
        }
    } catch (err) {
        if ((err as Error).name === 'AbortError') {
            throw err;
        }

        logError('Stream consumption error', {
            error: err,
            textSoFar: finalText.length,
        });

        if (generator) {
            try {
                await generator.return(undefined);
            } catch {
                // Ignore errors during cleanup
            }
        }

        if (finalText) {
            debugLog('info', 'Returning partial response after stream error', {
                length: finalText.length,
            });
            return finalText;
        }

        throw err;
    }

    debugLog('info', 'Stream consumed', { finalLength: finalText.length });
    return finalText;
}

// ============================================================================
// TOKEN ESTIMATION
// ============================================================================

/**
 * Get accurate token count for a stage
 */
export async function getStageTokenCount(
    state: PipelineState,
    stage: StageName,
): Promise<{ promptTokens: number; contextSize: number; percentage: number } | null> {
    const { getTokenCountAsync, maxContext } = SillyTavern.getContext();

    if (!state.character) return null;

    try {
        const prompt = buildStagePrompt(state, stage);
        if (!prompt) return null;

        const systemPrompt = getFullSystemPrompt(stage);
        const fullPrompt = systemPrompt + '\n\n' + prompt;
        const promptTokens = await getTokenCountAsync(fullPrompt);
        const percentage = Math.round((promptTokens / maxContext) * 100);

        return {
            promptTokens,
            contextSize: maxContext,
            percentage,
        };
    } catch (e) {
        logError('Token count failed', e);
        return null;
    }
}

/**
 * Get token count for refinement prompt
 */
export async function getRefinementTokenCount(
    state: PipelineState,
): Promise<{ promptTokens: number; contextSize: number; percentage: number } | null> {
    const { getTokenCountAsync, maxContext } = SillyTavern.getContext();

    if (!state.character || !state.results.rewrite || !state.results.analyze) return null;

    try {
        const prompt = buildRefinementPrompt(state);
        if (!prompt) return null;

        const systemPrompt = getFullSystemPrompt('rewrite');
        const fullPrompt = systemPrompt + '\n\n' + prompt;
        const promptTokens = await getTokenCountAsync(fullPrompt);
        const percentage = Math.round((promptTokens / maxContext) * 100);

        return {
            promptTokens,
            contextSize: maxContext,
            percentage,
        };
    } catch (e) {
        logError('Refinement token count failed', e);
        return null;
    }
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Safely convert response to string
 */
function ensureString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}

/**
 * Replace {{char}} and {{user}} placeholders with actual names.
 */
function substituteCharacterPlaceholders(
    text: string,
    charName: string,
    userName: string,
): string {
    return text
        .replace(/\{\{char\}\}/gi, charName)
        .replace(/\{\{user\}\}/gi, userName);
}
