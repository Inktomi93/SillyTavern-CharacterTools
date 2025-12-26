// globals.d.ts
export {};

// Development: absolute path to your ST install
import '/home/inktomi/SillyTavern/public/global';

// Production paths (uncomment when publishing, comment out dev path above)
import '../../../../public/global'; // user-scoped
import '../../../../global'; // server-scoped

// ============================================================================
// EXTENSIONS TO ST's TYPES
// These fill gaps in SillyTavern's global.d.ts
// ============================================================================

declare global {
  // toastr is loaded by ST but not declared in their global.d.ts
  const toastr: {
    success(message: string, title?: string): void;
    error(message: string, title?: string): void;
    warning(message: string, title?: string): void;
    info(message: string, title?: string): void;
  };

  // PresetManager - returned by getPresetManager() but not typed in ST
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

  // ChatCompletionService - available on context but not fully typed
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
    text?: string; // Present in streaming chunks
  }

  // Streaming returns a generator function
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
