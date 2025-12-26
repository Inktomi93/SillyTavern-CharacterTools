/* eslint-disable @typescript-eslint/no-explicit-any, no-var */
// globals.d.ts
export {};

// ST types - paths resolve at runtime in SillyTavern environment
import '../../../../public/global';
import '../../../../global';

declare global {
  const toastr: {
    success(message: string, title?: string): void;
    error(message: string, title?: string): void;
    warning(message: string, title?: string): void;
    info(message: string, title?: string): void;
  };

  interface SillyTavernContext {
    // Core state
    chat: any[];
    characters: any[];
    groups: any[];
    characterId: number | undefined;
    groupId: string | null;
    chatId: string | undefined;
    name1: string;
    name2: string;
    onlineStatus: string;
    maxContext: number;
    mainApi: string;
    chatMetadata: Record<string, any>;
    extensionSettings: Record<string, any>;

    // Settings objects
    chatCompletionSettings: Record<string, any>;
    textCompletionSettings: Record<string, any>;
    powerUserSettings: Record<string, any>;

    // Events
    eventSource: {
      on(event: string, callback: (...args: any[]) => void): void;
      once(event: string, callback: (...args: any[]) => void): void;
      emit(event: string, ...args: any[]): Promise<void>;
      removeListener(event: string, callback: (...args: any[]) => void): void;
    };
    eventTypes: Record<string, string>;

    // Functions
    saveSettingsDebounced(): void;
    saveMetadataDebounced(): void;
    getTokenCountAsync(text: string, padding?: number): Promise<number>;
    getThumbnailUrl(type: string, file: string): string;
    substituteParams(text: string): string;
    getRequestHeaders(): Record<string, string>;
    uuidv4(): string;

    // Generation
    generateRaw(options: {
      prompt: string | Array<{ role: string; content: string }>;
      systemPrompt?: string;
      jsonSchema?: any;
    }): Promise<string>;
    generateQuietPrompt(options: {
      quietPrompt: string;
      quietToLoud?: boolean;
      skipWIAN?: boolean;
    }): Promise<string>;

    // Character operations
    unshallowCharacter(characterId: number): Promise<void>;
    writeExtensionField(characterId: number, key: string, value: any): Promise<void>;

    // UI
    Popup: any;
    POPUP_TYPE: Record<string, number>;
    POPUP_RESULT: Record<string, any>;
    renderExtensionTemplateAsync(
      extensionPath: string,
      templatePath: string,
      data?: Record<string, any>,
      sanitize?: boolean
    ): Promise<string>;

    // Services
    ChatCompletionService: {
      sendRequest(options: Record<string, any>): Promise<any>;
    };

    // Preset management
    getPresetManager(apiId?: string): PresetManager | null;
  }

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
  }

  interface SillyTavernLibs {
    lodash: any;
    Fuse: any;
    DOMPurify: {
      sanitize(html: string, options?: { ALLOWED_TAGS?: string[] }): string;
    };
    moment: any;
    localforage: {
      getItem(key: string): Promise<any>;
      setItem(key: string, value: any): Promise<any>;
      removeItem(key: string): Promise<void>;
      keys(): Promise<string[]>;
    };
    showdown: {
      Converter: new (options?: any) => {
        makeHtml(text: string): string;
      };
    };
    hljs: {
      highlight(code: string, options: { language: string }): { value: string };
    };
  }

  var SillyTavern: {
    getContext(): SillyTavernContext;
    libs: SillyTavernLibs;
  };
}
