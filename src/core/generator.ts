// src/core/generator.ts
//
// Handles LLM generation for pipeline stages and refinement.
// Two paths: generateRaw (current settings) or CMRS (connection profiles).

import { DEFAULT_MAX_TOKENS, DEFAULT_CONTEXT_SIZE } from '../constants';
import { getSettings, getFullSystemPrompt } from './settings';
import { debugLog, logError } from '../debug';
import { getTokenCount, getPromptTokenEstimate } from './tokens';
import type {
    StructuredOutputSchema,
    GenerationResult,
    PipelineState,
    StageName,
    ProfileInfo,
    ApiStatusInfo,
    GenerationSettings,
    ChatCompletionMessage,
} from '../types';
import type { TokenEstimate } from './tokens';
import { buildStagePrompt, getStageSchema } from './pipeline';

// ============================================================================
// TYPES
// ============================================================================

interface ConnectionProfile {
    id: string;
    mode: 'cc' | 'tc';
    api: string;
    preset: string;
    model: string;
    name: string;
    proxy: string;
    exclude: string[];
    'stop-strings': string;
    'start-reply-with': string;
    'reasoning-template': string;
    'prompt-post-processing': string;
    'secret-id': string;
}

interface ExtractedData {
    content: string;
    reasoning: string;
}

// ============================================================================
// PROFILE DISCOVERY
// ============================================================================

/**
 * Get all available connection profiles with validation info
 */
export function getAvailableProfiles(): ProfileInfo[] {
    const CMRS = SillyTavern.getContext().ConnectionManagerRequestService;

    if (!CMRS || typeof CMRS.getSupportedProfiles !== 'function') {
        debugLog('info', 'ConnectionManagerRequestService not available', null);
        return [];
    }

    try {
        const profiles = CMRS.getSupportedProfiles() as ConnectionProfile[];

        return profiles.map(profile => {
            const isSupported = CMRS.isProfileSupported(profile);

            return {
                id: profile.id,
                name: profile.name,
                model: profile.model ?? '',
                api: profile.api,
                mode: profile.mode,
                presetName: profile.preset,
                isSupported,
                validationError: isSupported ? null : 'Profile configuration is invalid',
            };
        });
    } catch (e) {
        logError('Failed to get profiles', e);
        return [];
    }
}

/**
 * Get a specific profile by ID
 */
export function getProfile(profileId: string): ConnectionProfile | null {
    const ctx = SillyTavern.getContext();
    const CMRS = ctx.ConnectionManagerRequestService;

    if (!CMRS || typeof CMRS.getProfile !== 'function') {
        return null;
    }

    try {
        return CMRS.getProfile(profileId) as ConnectionProfile | undefined ?? null;
    } catch {
        return null;
    }
}

/**
 * Check if a profile is valid and ready for use
 */
export function isProfileValid(profileId: string): boolean {
    const ctx = SillyTavern.getContext();
    const CMRS = ctx.ConnectionManagerRequestService;

    if (!CMRS) {
        debugLog('info', 'isProfileValid: no CMRS', null);
        return false;
    }

    if (typeof CMRS.getProfile !== 'function') {
        debugLog('info', 'isProfileValid: getProfile not a function', null);
        return false;
    }

    let profile;
    try {
        profile = CMRS.getProfile(profileId);
    } catch (e) {
        debugLog('error', 'isProfileValid: getProfile threw', e);
        return false;
    }

    if (!profile) {
        debugLog('info', 'isProfileValid: profile not found', { profileId });
        return false;
    }

    if (typeof CMRS.isProfileSupported !== 'function') {
        debugLog('info', 'isProfileValid: isProfileSupported not a function', null);
        return false;
    }

    try {
        const supported = CMRS.isProfileSupported(profile);
        debugLog('info', 'isProfileValid: isProfileSupported returned', { supported, profileId });
        return supported;
    } catch (e) {
        debugLog('error', 'isProfileValid: isProfileSupported threw', e);
        return false;
    }
}


// ============================================================================
// API STATUS
// ============================================================================

/**
 * Check if the current ST API is ready (for 'current' mode)
 */
function isCurrentApiReady(): boolean {
    const ctx = SillyTavern.getContext();
    const ccs = ctx.chatCompletionSettings;

    // If bypass is enabled, trust it
    if (ccs?.bypass_status_check) {
        return true;
    }

    const status = String(ctx.onlineStatus || '').toLowerCase();

    // Standard success states
    if (['valid', 'connected', 'ok', 'ready'].includes(status)) {
        return true;
    }

    // Partial success states
    if (status.includes('key') || status.includes('saved')) {
        return true;
    }

    // No status at all is not ready
    if (!status) {
        return false;
    }

    // Check for error patterns
    const errorPatterns = ['error', 'fail', 'invalid', 'unauthorized', 'missing', 'no connection'];
    if (errorPatterns.some(p => status.includes(p))) {
        return false;
    }

    // Any other non-empty status - assume it's okay
    return true;
}

/**
 * Check if generation is possible given current settings
 */
export function isApiReady(): boolean {
    const settings = getSettings();
    const mode = settings.generationSettings.mode;
    const profileId = settings.generationSettings.profileId;

    debugLog('info', 'isApiReady check', { mode, profileId });

    if (mode === 'current') {
        const result = isCurrentApiReady();
        debugLog('info', 'isCurrentApiReady result', { result });
        return result;
    }

    if (!profileId) {
        debugLog('info', 'isApiReady: no profileId', null);
        return false;
    }

    const result = isProfileValid(profileId);
    debugLog('info', 'isProfileValid result', { profileId, result });
    return result;
}

/**
 * Get comprehensive API status for display
 */
export function getApiStatus(generationSettings?: GenerationSettings): ApiStatusInfo {
    const settings = generationSettings || getSettings().generationSettings;

    if (settings.mode === 'current') {
        return getCurrentApiStatus();
    }

    return getProfileApiStatus(settings.profileId);
}

/**
 * Legacy helper for existing code that just needs basic info
 */
export function getApiInfo(): { source: string; model: string; maxOutput: number; contextSize: number; isReady: boolean } {
    const status = getApiStatus();
    return {
        source: status.source,
        model: status.model,
        maxOutput: status.maxOutput,
        contextSize: status.contextSize,
        isReady: status.isReady,
    };
}

function getCurrentApiStatus(): ApiStatusInfo {
    const ctx = SillyTavern.getContext();
    const ccs = ctx.chatCompletionSettings || {};
    const tcs = ctx.textCompletionSettings || {};

    // Check which API mode ST is actually using
    const isTextCompletion = ctx.mainApi === 'textgenerationwebui';

    let model = 'unknown';
    let source = 'unknown';
    let apiType: 'cc' | 'tc' = 'cc';
    let contextSize = DEFAULT_CONTEXT_SIZE;
    let maxOutput = DEFAULT_MAX_TOKENS;

    if (isTextCompletion) {
        // Text completion mode - model is in onlineStatus for OpenRouter text
        source = 'text-completion';
        model = ctx.onlineStatus || 'unknown';
        apiType = 'tc';
        contextSize = ctx.maxContext || DEFAULT_CONTEXT_SIZE;
        // Text completion max tokens from settings
        maxOutput = (tcs as Record<string, unknown>).max_tokens as number || DEFAULT_MAX_TOKENS;
    } else {
        // Chat completion mode
        source = ccs.chat_completion_source || 'unknown';
        apiType = 'cc';

        try {
            model = ctx.getChatCompletionModel?.() || 'unknown';
        } catch {
            // Fallback
        }

        contextSize = ccs.openai_max_context || ctx.maxContext || DEFAULT_CONTEXT_SIZE;
        maxOutput = ccs.openai_max_tokens || DEFAULT_MAX_TOKENS;
    }

    const isReady = isCurrentApiReady();

    // Check for max tokens override in our settings
    const extSettings = getSettings();
    if (extSettings.generationSettings.maxTokensOverride !== null) {
        maxOutput = extSettings.generationSettings.maxTokensOverride;
    }

    return {
        mode: 'current',
        displayName: 'Current Settings',
        source,
        model,
        modelDisplay: truncateModel(model),
        apiType,
        contextSize,
        maxOutput,
        isReady,
        statusText: ctx.onlineStatus || 'Unknown',
        error: isReady ? null : `API not connected (status: ${ctx.onlineStatus || 'unknown'})`,
    };
}

function getProfileApiStatus(profileId: string | null): ApiStatusInfo {
    if (!profileId) {
        return {
            mode: 'profile',
            displayName: 'No Profile Selected',
            source: 'none',
            model: 'none',
            modelDisplay: 'None',
            apiType: 'cc',
            contextSize: DEFAULT_CONTEXT_SIZE,
            maxOutput: DEFAULT_MAX_TOKENS,
            isReady: false,
            statusText: 'Not configured',
            error: 'Select a connection profile in settings',
        };
    }

    const profile = getProfile(profileId);

    if (!profile) {
        return {
            mode: 'profile',
            displayName: 'Profile Not Found',
            source: 'unknown',
            model: 'unknown',
            modelDisplay: 'Unknown',
            apiType: 'cc',
            contextSize: DEFAULT_CONTEXT_SIZE,
            maxOutput: DEFAULT_MAX_TOKENS,
            isReady: false,
            statusText: 'Error',
            error: 'Selected profile no longer exists. It may have been deleted.',
        };
    }

    const isSupported = isProfileValid(profileId);
    const { contextSize, maxOutput } = getProfileLimits(profile);

    return {
        mode: 'profile',
        displayName: profile.name,
        source: profile.api,
        model: profile.model ?? '',
        modelDisplay: truncateModel(profile.model ?? ''),
        apiType: profile.mode,
        contextSize,
        maxOutput,
        isReady: isSupported,
        statusText: isSupported ? 'Ready' : 'Invalid',
        error: isSupported ? null : 'Profile configuration is invalid. Check Connection Manager.',
    };
}

function truncateModel(model: string): string {
    const stripped = model
        .replace(/^anthropic\//, '')
        .replace(/^openai\//, '')
        .replace(/^google\//, '')
        .replace(/^meta-llama\//, 'llama-')
        .replace(/^mistralai\//, 'mistral-');

    if (stripped.length > 28) {
        return stripped.substring(0, 25) + '...';
    }
    return stripped;
}

function getProfileLimits(profile: ConnectionProfile): { contextSize: number; maxOutput: number } {
    const ctx = SillyTavern.getContext();
    const extSettings = getSettings();

    let contextSize = DEFAULT_CONTEXT_SIZE;
    let maxOutput = DEFAULT_MAX_TOKENS;

    // Try to get from profile's linked preset
    try {
        const apiId = profile.mode === 'tc' ? 'textgenerationwebui' : 'openai';
        const pm = ctx.getPresetManager?.(apiId);

        if (pm && profile.preset) {
            const preset = pm.getCompletionPresetByName?.(profile.preset) as Record<string, unknown> | undefined;
            if (preset) {
                if (typeof preset.openai_max_context === 'number') {
                    contextSize = preset.openai_max_context;
                } else if (typeof preset.max_context === 'number') {
                    contextSize = preset.max_context;
                }

                if (typeof preset.openai_max_tokens === 'number') {
                    maxOutput = preset.openai_max_tokens;
                } else if (typeof preset.max_tokens === 'number') {
                    maxOutput = preset.max_tokens;
                }
            }
        }
    } catch {
        // Fall through to fallback
    }

    // Fallback to current settings if preset lookup failed
    if (contextSize === DEFAULT_CONTEXT_SIZE) {
        const ccs = ctx.chatCompletionSettings;
        contextSize = ccs?.openai_max_context || ctx.maxContext || DEFAULT_CONTEXT_SIZE;
    }

    if (maxOutput === DEFAULT_MAX_TOKENS) {
        const ccs = ctx.chatCompletionSettings;
        maxOutput = ccs?.openai_max_tokens || DEFAULT_MAX_TOKENS;
    }

    // Check for override in our settings
    if (extSettings.generationSettings.maxTokensOverride !== null) {
        maxOutput = extSettings.generationSettings.maxTokensOverride;
    }

    return { contextSize, maxOutput };
}

/**
 * Get current sampler settings for display
 */
export function getSamplerSettings(): Record<string, number | string | boolean> {
    const ctx = SillyTavern.getContext();
    const isTextCompletion = ctx.mainApi === 'textgenerationwebui';

    if (isTextCompletion) {
        const tcs = ctx.textCompletionSettings || {};
        return {
            temperature: (tcs as Record<string, unknown>).temp as number ?? 1,
            top_p: (tcs as Record<string, unknown>).top_p as number ?? 1,
            top_k: (tcs as Record<string, unknown>).top_k as number ?? 0,
            min_p: (tcs as Record<string, unknown>).min_p as number ?? 0,
            rep_pen: (tcs as Record<string, unknown>).rep_pen as number ?? 1,
        };
    }

    const ccs = ctx.chatCompletionSettings || {};
    return {
        temperature: ccs.temp_openai ?? 1,
        top_p: ccs.top_p_openai ?? 1,
        top_k: ccs.top_k_openai ?? 0,
        min_p: ccs.min_p_openai ?? 0,
        freq_pen: ccs.freq_pen_openai ?? 0,
        pres_pen: ccs.pres_pen_openai ?? 0,
    };
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

/**
 * Run generation for a pipeline stage.
 * Handles both normal stage runs and refinement iterations.
 * When stage is 'rewrite' and state.isRefining is true, builds refinement prompt.
 */
export async function runStageGeneration(
    state: PipelineState,
    stage: StageName,
    signal?: AbortSignal,
): Promise<GenerationResult> {
    if (signal?.aborted) {
        return { success: false, error: 'Generation cancelled' };
    }

    if (!state.character) {
        return { success: false, error: 'No character selected' };
    }

    const settings = getSettings();

    if (!isApiReady()) {
        const status = getApiStatus();
        return {
            success: false,
            error: status.error || 'API is not ready. Check your connection settings.',
        };
    }

    // buildStagePrompt handles refinement mode internally when stage === 'rewrite' && state.isRefining
    const userPrompt = buildStagePrompt(state, stage);
    if (!userPrompt) {
        return { success: false, error: 'No prompt configured for this stage' };
    }

    const config = state.configs[stage];

    // No structured output during refinement - we want freeform rewrite
    const useStructured = config.useStructuredOutput && !state.isRefining;
    const jsonSchema = useStructured ? getStageSchema(state, stage) : null;

    const systemPrompt = getFullSystemPrompt(stage);

    const apiStatus = getApiStatus();
    const isRefinement = stage === 'rewrite' && state.isRefining;

    debugLog('info', 'Starting stage generation', {
        stage,
        isRefinement,
        iteration: isRefinement ? state.iterationCount + 1 : 0,
        character: state.character.name,
        mode: settings.generationSettings.mode,
        useStructured: !!jsonSchema,
        schemaName: jsonSchema?.name,
        promptLength: userPrompt.length,
        systemPromptLength: systemPrompt.length,
        apiSource: apiStatus.source,
        apiModel: apiStatus.model,
    });

    const maxTokens = settings.generationSettings.maxTokensOverride ?? apiStatus.maxOutput;

    let result: GenerationResult;

    if (settings.generationSettings.mode === 'current') {
        result = await generateWithCurrent(
            userPrompt,
            systemPrompt,
            { maxTokens, jsonSchema, signal },
        );
    } else {
        const profileId = settings.generationSettings.profileId;
        if (!profileId) {
            return { success: false, error: 'No connection profile selected. Configure one in settings.' };
        }

        result = await generateWithProfile(
            profileId,
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            { maxTokens, jsonSchema, signal },
        );
    }

    // Validate structured response if needed
    if (result.success && jsonSchema) {
        return validateStructuredResponse(result.response, jsonSchema);
    }

    return result;
}

// ============================================================================
// GENERATION PATHS
// ============================================================================

interface GenerationOptions {
    maxTokens?: number;
    jsonSchema?: StructuredOutputSchema | null;
    signal?: AbortSignal;
}

/**
 * Generate using ST's current settings via generateRaw
 */
async function generateWithCurrent(
    prompt: string,
    systemPrompt: string,
    options: GenerationOptions,
): Promise<GenerationResult> {
    const ctx = SillyTavern.getContext();

    if (typeof ctx.generateRaw !== 'function') {
        return {
            success: false,
            error: 'generateRaw not available. SillyTavern version may be incompatible.',
        };
    }

    // If using structured output, temporarily disable reasoning/thinking
    // Claude API doesn't allow thinking + tool_choice (structured output uses tool_choice)
    const ccs = ctx.chatCompletionSettings as Record<string, unknown>;
    let originalReasoningEffort: string | undefined;

    if (options.jsonSchema && ccs?.reasoning_effort &&
        typeof ccs.reasoning_effort === 'string' &&
        ccs.reasoning_effort !== 'auto') {
        originalReasoningEffort = ccs.reasoning_effort;
        ccs.reasoning_effort = 'auto';
        debugLog('info', 'Disabled reasoning_effort for structured output', {
            original: originalReasoningEffort,
        });
    }

    try {
        if (options.signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }

        debugLog('request', 'generateRaw request', {
            hasSchema: !!options.jsonSchema,
            schemaName: options.jsonSchema?.name,
            systemPromptLength: systemPrompt.length,
            userPromptLength: prompt.length,
            maxTokens: options.maxTokens,
            reasoningDisabled: !!originalReasoningEffort,
        });

        const response = await ctx.generateRaw({
            prompt,
            systemPrompt,
            responseLength: options.maxTokens ?? null,
            jsonSchema: options.jsonSchema ?? null,
        });

        if (options.signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }

        const responseStr = ensureString(response);

        if (!responseStr || responseStr.trim() === '') {
            return { success: false, error: 'Empty response from API' };
        }

        debugLog('response', 'generateRaw response', {
            length: responseStr.length,
            preview: responseStr.substring(0, 200),
        });

        return {
            success: true,
            response: responseStr,
            isStructured: !!options.jsonSchema,
        };
    } catch (err) {
        return handleGenerationError(err);
    } finally {
        // Restore reasoning_effort if we disabled it
        if (originalReasoningEffort !== undefined) {
            const ccsRestore = ctx.chatCompletionSettings as Record<string, unknown>;
            ccsRestore.reasoning_effort = originalReasoningEffort;
            debugLog('info', 'Restored reasoning_effort', { value: originalReasoningEffort });
        }
    }
}



/**
 * Generate using a connection profile via CMRS
 */
async function generateWithProfile(
    profileId: string,
    messages: ChatCompletionMessage[],
    options: GenerationOptions,
): Promise<GenerationResult> {
    const ctx = SillyTavern.getContext();
    const CMRS = ctx.ConnectionManagerRequestService;

    if (!CMRS || typeof CMRS.sendRequest !== 'function') {
        return {
            success: false,
            error: 'Connection Manager service not available. Update SillyTavern.',
        };
    }

    // Validate profile exists
    const profile = getProfile(profileId);
    if (!profile) {
        return {
            success: false,
            error: 'Selected connection profile not found. It may have been deleted.',
        };
    }

    // Validate profile is supported
    if (!CMRS.isProfileSupported(profile)) {
        return {
            success: false,
            error: `Connection profile "${profile.name}" is not properly configured. Check Connection Manager.`,
        };
    }

    try {
        if (options.signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }

        debugLog('request', 'CMRS request', {
            profileId,
            profileName: profile.name,
            mode: profile.mode,
            api: profile.api,
            model: profile.model,
            maxTokens: options.maxTokens,
            hasSchema: !!options.jsonSchema,
        });

        // Build payload overrides
        const overridePayload: Record<string, unknown> = {};

        if (options.jsonSchema) {
            overridePayload.json_schema = options.jsonSchema;
            // Disable reasoning when using structured output - Claude doesn't allow both
            overridePayload.reasoning_effort = 'auto';
            debugLog('info', 'Disabled reasoning_effort in payload for structured output', null);
        }

        const result = await CMRS.sendRequest(
            profileId,
            messages,
            options.maxTokens ?? DEFAULT_MAX_TOKENS,
            {
                stream: false,
                extractData: true,
                includePreset: true,
                includeInstruct: profile.mode === 'tc',
                signal: options.signal ?? null,
            },
            Object.keys(overridePayload).length > 0 ? overridePayload : undefined,
        );

        if (options.signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }

        const extracted = result as ExtractedData;

        if (!extracted.content && !extracted.reasoning) {
            return { success: false, error: 'Empty response from API' };
        }

        debugLog('response', 'CMRS response', {
            contentLength: extracted.content?.length || 0,
            hasReasoning: !!extracted.reasoning,
            preview: (extracted.content || '').substring(0, 200),
        });

        return {
            success: true,
            response: extracted.content,
            reasoning: extracted.reasoning || undefined,
            isStructured: !!options.jsonSchema,
        };
    } catch (err) {
        return handleGenerationError(err);
    }
}


// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Unified error handler with categorized messages
 */
function handleGenerationError(err: unknown): GenerationResult {
    if ((err as Error).name === 'AbortError') {
        debugLog('info', 'Generation aborted', null);
        return { success: false, error: 'Generation cancelled' };
    }

    const message = err instanceof Error ? err.message : String(err);

    // Categorize common API errors
    if (message.includes('401') || message.includes('unauthorized')) {
        return {
            success: false,
            error: 'API authentication failed. Check your API key in the connection profile.',
        };
    }
    if (message.includes('429') || message.includes('rate limit')) {
        return {
            success: false,
            error: 'Rate limited. Please wait and try again.',
        };
    }
    if (message.includes('500') || message.includes('502') || message.includes('503')) {
        return {
            success: false,
            error: 'API server error. The service may be temporarily unavailable.',
        };
    }
    if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
        return {
            success: false,
            error: 'Request timed out. Check your connection or try a different model.',
        };
    }
    if (message.includes('network') || message.includes('ECONNREFUSED')) {
        return {
            success: false,
            error: 'Network error. Check your internet connection.',
        };
    }
    if (message.includes('context') || message.includes('too long') || message.includes('maximum context')) {
        return {
            success: false,
            error: 'Prompt too long for model context. Try selecting fewer character fields.',
        };
    }
    if (message.includes('invalid_api_key') || message.includes('API key')) {
        return {
            success: false,
            error: 'Invalid API key. Check your credentials in SillyTavern settings.',
        };
    }
    if (message.includes('model') && (message.includes('not found') || message.includes('does not exist'))) {
        return {
            success: false,
            error: 'Model not found. It may have been deprecated or renamed.',
        };
    }

    logError('Generation failed', { error: err, message });
    return { success: false, error: message };
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate structured response and fall back gracefully if parsing fails
 */
function validateStructuredResponse(
    response: string,
    schema: StructuredOutputSchema,
): GenerationResult {
    try {
        const parsed = JSON.parse(response);

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

// ============================================================================
// TOKEN ESTIMATION (delegates to tokens.ts)
// ============================================================================

/**
 * Get token count for a stage prompt (handles refinement automatically)
 */
export async function getStageTokenCount(
    state: PipelineState,
    stage: StageName,
): Promise<TokenEstimate | null> {
    if (!state.character) return null;

    const prompt = buildStagePrompt(state, stage);
    if (!prompt) return null;

    const systemPrompt = getFullSystemPrompt(stage);
    return getPromptTokenEstimate(prompt, systemPrompt);
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Safely convert any value to a string
 */
function ensureString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        if (typeof obj.text === 'string') return obj.text;
        if (typeof obj.content === 'string') return obj.content;
        if (typeof obj.message === 'string') return obj.message;

        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}

// Re-export getTokenCount for backward compatibility
export { getTokenCount };
