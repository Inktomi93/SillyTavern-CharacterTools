// globals.d.ts
export {};

// Try ST's types first (when installed in ST), fall back to local copy
// @ts-ignore - One of these will resolve
import '../../../../public/global';
// @ts-ignore
import '../../../../global';
// @ts-ignore - Local fallback for standalone builds
import './st-types';

// ============================================================================
// EXTENSIONS TO ST's TYPES
// These fill gaps in SillyTavern's global.d.ts
// ============================================================================

declare global {
  const toastr: {
    success(message: string, title?: string): void;
    error(message: string, title?: string): void;
    warning(message: string, title?: string): void;
    info(message: string, title?: string): void;
  };

  interface PresetManager {
    apiId: string;
    getPresetList(api?: string): {
      presets: Record<string, unknown>[];
      preset_names: Record<string, number>;
      settings: Record<string, unknown>;
    };
    getSelectedPreset(): unknown;
    getSelectedPresetName(): string;
    selectPreset(value: string): boolean;
    getAllPresets(): unknown[];
    getCompletionPresetByName?(name: string): unknown;
    getPresetSettings?(name: string): unknown;
    readPresetExtensionField?(options: { path: string }): unknown;
    writePresetExtensionField?(options: { path: string; value: unknown }): Promise<void>;
  }

  interface ChatCompletionRequestOptions {
    stream: boolean;
    messages: Array<{ role: string; content: string }>;
    chat_completion_source?: string;
    model?: string;
    max_tokens?: number;
    temperature?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    top_p?: number;
    json_schema?: unknown;
  }

  interface ChatCompletionResult {
    content: string;
    reasoning?: string;
    error?: unknown;
    text?: string;
  }

  type ChatCompletionStreamGenerator = () => AsyncGenerator<ChatCompletionResult>;

  interface ChatCompletionService {
    sendRequest(options: ChatCompletionRequestOptions): Promise<ChatCompletionResult | ChatCompletionStreamGenerator>;
    processRequest(
      options: ChatCompletionRequestOptions,
      presetOptions: { presetName?: string },
      extractData: boolean,
      signal: AbortSignal | null
    ): Promise<ChatCompletionResult>;
  }
}
