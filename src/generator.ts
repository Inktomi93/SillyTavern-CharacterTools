// src/generator.ts
//
// Handles LLM generation for pipeline stages.
// Supports both ST's current settings and custom API configuration.

import { getSettings } from './settings';
import { debugLog } from './debug';
import type {
    StructuredOutputSchema,
    GenerationResult,
    PipelineState,
    StageName,
} from './types';
import { buildStagePrompt, getStageSchema } from './pipeline';

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
 * Run generation for a pipeline stage
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
        debugLog('error', 'API not ready', { onlineStatus: context.onlineStatus });
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

    debugLog('info', 'Starting stage generation', {
        stage,
        character: state.character.name,
        useCurrentSettings: settings.useCurrentSettings,
        useStructured: !!jsonSchema,
        schemaName: jsonSchema?.name,
        promptLength: processedPrompt.length,
    });

    try {
        let response: string;

        if (settings.useCurrentSettings) {
            response = await generateWithCurrentSettings(
                settings.systemPrompt,
                processedPrompt,
                jsonSchema,
                signal,
            );
        } else {
            response = await generateWithCustomSettings(
                settings.systemPrompt,
                processedPrompt,
                jsonSchema,
                signal,
            );
        }

        // Check abort after generation
        if (signal?.aborted) {
            return { success: false, error: 'Generation cancelled' };
        }

        if (!response || response.trim() === '') {
            debugLog('error', 'Empty response', null);
            return { success: false, error: 'Empty response from API' };
        }

        debugLog('info', 'Stage generation complete', {
            stage,
            responseLength: response.length,
            isStructured: !!jsonSchema,
        });

        return {
            success: true,
            response,
            isStructured: !!jsonSchema,
        };
    } catch (err) {
    // Handle abort errors gracefully
        if ((err as Error).name === 'AbortError' || signal?.aborted) {
            debugLog('info', 'Generation aborted', null);
            return { success: false, error: 'Generation cancelled' };
        }

        debugLog('error', 'Generation exception', {
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

    // Run ST's macro substitution on system prompt
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

    // Run ST's macro substitution on system prompt
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

    // When stream: true, result is a generator function - consume it
    if (typeof result === 'function') {
        response = await consumeStreamGenerator(result, signal);
    } else if (result && typeof result === 'object') {
        const resultObj = result as Record<string, unknown>;

        if (resultObj.error) {
            debugLog('error', 'API returned error', result);
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

    try {
        const generator = generatorFn();

        for await (const chunk of generator) {
            // Check abort during streaming
            if (signal?.aborted) {
                debugLog('info', 'Stream aborted', { textSoFar: finalText.length });
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

        debugLog('error', 'Stream consumption error', {
            error: err,
            textSoFar: finalText.length,
        });

        // Return partial response if we have one
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
    const settings = getSettings();

    if (!state.character) return null;

    try {
        const prompt = buildStagePrompt(state, stage);
        if (!prompt) return null;

        const fullPrompt = settings.systemPrompt + '\n\n' + prompt;
        const promptTokens = await getTokenCountAsync(fullPrompt);
        const percentage = Math.round((promptTokens / maxContext) * 100);

        return {
            promptTokens,
            contextSize: maxContext,
            percentage,
        };
    } catch (e) {
        debugLog('error', 'Token count failed', e);
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
 * Replace {{char}} and {{user}} placeholders with actual names
 * This is needed because we're not in a chat context where ST auto-substitutes
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
