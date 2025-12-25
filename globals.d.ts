// globals.d.ts
export {};

// Development: absolute path to your ST install
import '/home/inktomi/SillyTavern/public/global';

// Production paths (uncomment when publishing, comment out dev path above)
// import '../../../../public/global'; // user-scoped
// import '../../../../global'; // server-scoped

// Extend ST's types with what we need
declare global {
  // toastr is a global loaded by ST
  const toastr: {
    success: (message: string, title?: string) => void;
    error: (message: string, title?: string) => void;
    warning: (message: string, title?: string) => void;
    info: (message: string, title?: string) => void;
  };

  interface PresetManager {
    apiId: string;
    getPresetList: (api?: string) => {
      presets: Record<string, unknown>[];
      preset_names: Record<string, number>;
      settings: Record<string, unknown>;
    };
    getSelectedPreset: () => unknown;
    getSelectedPresetName: () => string;
    selectPreset: (value: string) => boolean;
    getAllPresets: () => unknown[];
  }

  interface ChatCompletionResult {
    content: string;
    reasoning?: string;
  }

  interface ChatCompletionRequestOptions {
    stream: boolean;
    messages: Array<{ role: string; content: string }>;
    max_tokens?: number;
    temperature?: number;
  }

  interface ChatCompletionService {
    sendRequest: (options: ChatCompletionRequestOptions) => Promise<ChatCompletionResult>;
    processRequest: (
      options: ChatCompletionRequestOptions,
      presetOptions: { presetName?: string },
      extractData: boolean,
      signal: AbortSignal | null
    ) => Promise<ChatCompletionResult>;
  }
}
