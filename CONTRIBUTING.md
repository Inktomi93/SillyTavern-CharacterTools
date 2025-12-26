# SillyTavern Extension Development Reference

## Overview

This document is a comprehensive reference for developing SillyTavern extensions. It contains everything you need: API references, patterns, code examples, and the complete source for context objects, event types, and shared libraries.

**Philosophy**: Write clean, minimal code. Use what SillyTavern gives you. Don't reinvent wheels. Ship.

**Key Insight**: `SillyTavern.getContext()` is your primary API. It returns a fresh reference to ST's internal state every time you call it. Don't cache the context object - always call `getContext()` when you need current state.

---

## Table of Contents

1. [Manifest Configuration](#manifest-configuration)
2. [Core APIs](#core-apis)
3. [State Management](#state-management)
4. [Events System](#events-system)
5. [Slash Commands](#slash-commands)
6. [Text Generation](#text-generation)
7. [Preset Management](#preset-management)
8. [Service Classes](#service-classes)
9. [Prompt Interceptors](#prompt-interceptors)
10. [Custom Macros](#custom-macros)
11. [Bundling](#bundling)
12. [Error Handling](#error-handling)
13. [Best Practices](#best-practices)
14. [Complete API Reference](#complete-api-reference)

---

### TypeScript Declaration File

Place `globals.d.ts` in your extension root for autocomplete support:

```typescript
// globals.d.ts
export {};

// Production paths
// import '../../../../public/global'; // user-scoped
// import '../../../../global'; // server-scoped

// Extend ST's types with what we need
declare global {
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
```

---

## Manifest Configuration

### Complete manifest.json Reference

```json
{
  "display_name": "Character Tools",
  "loading_order": 1,
  "requires": [],
  "optional": [],
  "dependencies": [],
  "js": "dist/index.js",
  "css": "style.css",
  "author": "Inktomi",
  "version": "1.0.0",
  "homePage": "https://github.com/Inktomi93/SillyTavern-CharacterTools",
  "auto_update": true,
  "minimum_client_version": "",
  "i18n": {}
}
```

### Field Reference

| Field | Required | Description |
| ----- | -------- | ----------- |
| `display_name` | Yes | Name shown in "Manage Extensions" menu |
| `js` | Yes | Main JavaScript file path |
| `author` | Yes | Author name or contact info |
| `loading_order` | No | Higher numbers load later |
| `css` | No | Optional stylesheet path |
| `auto_update` | No | Auto-update on ST version change |
| `dependencies` | No | Required extension folder names |
| `generate_interceptor` | No | Global function name for prompt interception |
| `minimum_client_version` | No | Minimum SillyTavern version required |

### Dependencies Examples

```json
{
  "dependencies": [
    "vectors",
    "caption",
    "third-party/Extension-WebLLM"
  ]
}
```

---

## Core APIs

### Accessing the Context

**IMPORTANT**: Always call `SillyTavern.getContext()` fresh when you need current state. Don't cache the returned object.

```javascript
// GOOD - Always fresh
function doSomething() {
  const { chat, characters } = SillyTavern.getContext();
  // use chat and characters
}

// BAD - Stale reference
const context = SillyTavern.getContext(); // cached at module load
function doSomething() {
  // context.chat may be stale!
}
```

### Defensive Context Access

```javascript
function safeGetContext() {
  const ctx = SillyTavern.getContext();
  if (!ctx.chat || ctx.characterId === undefined) {
    console.warn('[MyExt] No active chat/character');
    return null;
  }
  return ctx;
}

// Usage
function doSomethingWithChat() {
  const ctx = safeGetContext();
  if (!ctx) return;

  // Safe to use ctx.chat, ctx.characterId, etc.
}
```

### Context Properties (Primitives)

```javascript
const {
  characterId,        // number | undefined - Current character index
  chatId,             // string | undefined - Current chat ID
  groupId,            // string | null - Current group ID (null if not in group)
  mainApi,            // string - Current API type ("openai", "kobold", etc.)
  maxContext,         // number - Current context size (e.g., 8192)
  menuType,           // string - Current menu state
  name1,              // string - User's name
  name2,              // string - Character's name
  onlineStatus,       // string - API connection status ("Valid", "no_connection", etc.)
  streamingProcessor, // object | null - Current streaming state
} = SillyTavern.getContext();
```

### Context Properties (Arrays)

```javascript
const {
  chat,       // Array - Current chat messages (mutable)
  characters, // Array - All loaded characters
  groups,     // Array - All groups
  tags,       // Array - All tags
} = SillyTavern.getContext();
```

### Context Properties (Objects)

```javascript
const {
  chatMetadata,              // Object - Current chat metadata
  chatCompletionSettings,    // Object - OpenAI/chat completion settings
  textCompletionSettings,    // Object - Text generation settings
  powerUserSettings,         // Object - Power user preferences
  extensionSettings,         // Object - All extension settings
  extensionPrompts,          // Object - Active extension prompts
  eventSource,               // EventEmitter - Event system
  eventTypes,                // Object - Event type constants
  event_types,               // Object - Legacy alias for eventTypes
  createCharacterData,       // Object - Template for new characters
  tagMap,                    // Object - Character avatar to tags mapping
  tokenizers,                // Object - Available tokenizer types
  variables,                 // Object - Local/global variable accessors
  swipe,                     // Object - Swipe control functions
  symbols,                   // Object - Special symbols (e.g., ignore)
  ARGUMENT_TYPE,             // Object - Slash command argument types
  CONNECT_API_MAP,           // Object - API connection configurations
  POPUP_RESULT,              // Object - Popup result constants
  POPUP_TYPE,                // Object - Popup type constants
} = SillyTavern.getContext();
```

### Context Functions

```javascript
const {
  // Settings & Persistence
  saveSettingsDebounced,     // () => void - Save settings (debounced)
  saveMetadata,              // () => Promise<void> - Save chat metadata
  saveMetadataDebounced,     // () => void - Save chat metadata (debounced)
  saveChat,                  // () => Promise<void> - Save current chat
  saveReply,                 // (options) => Promise<void> - Save AI reply
  saveWorldInfo,             // (name, data, immediately?) => Promise<void>

  // Chat Operations
  reloadCurrentChat,         // () => Promise<void> - Reload chat from server
  clearChat,                 // () => Promise<void> - Clear current chat
  printMessages,             // () => Promise<void> - Re-render messages
  addOneMessage,             // (mes, options?) => void - Add message to chat
  deleteLastMessage,         // () => Promise<void> - Remove last message
  deleteMessage,             // (id, swipeIndex?, confirm?) => Promise<void>
  updateMessageBlock,        // (messageId, message, options?) => void
  sendSystemMessage,         // (type, text, extra?) => void

  // Generation
  generate,                  // (type, options?, dryRun?) => Promise<string>
  generateQuietPrompt,       // (options) => Promise<string> - Background generation
  generateRaw,               // (options) => Promise<string> - Raw generation
  sendGenerationRequest,     // (type, data, options?) => Promise<object>
  sendStreamingRequest,      // (type, data, options?) => Promise<object>
  stopGeneration,            // () => void - Stop current generation

  // Characters & Groups
  getCharacters,             // () => Promise<void> - Refresh character list
  selectCharacterById,       // (id, options?) => Promise<void>
  getCharacterCardFields,    // (options?) => object
  unshallowCharacter,        // (characterId) => Promise<void>
  unshallowGroupMembers,     // (groupId) => Promise<void>
  openCharacterChat,         // (file_name) => Promise<void>
  openGroupChat,             // (groupId, chatId) => Promise<void>

  // Tokens
  getTokenCount,             // (str, padding?) => number - DEPRECATED
  getTokenCountAsync,        // (str, padding?) => Promise<number>
  getTextTokens,             // (tokenizerType, str) => number[]
  getTokenizerModel,         // () => string

  // Text Processing
  substituteParams,          // (content, ...args) => string - Replace macros
  substituteParamsExtended,  // (content, additionalMacro?, postProcessFn?) => string
  messageFormatting,         // (mes, ch_name, isSystem, isUser, messageId, ...) => string
  extractMessageFromData,    // (data, activeApi?) => string
  parseReasoningFromString,  // (str, options?) => object

  // Slash Commands
  executeSlashCommands,      // DEPRECATED - Use executeSlashCommandsWithOptions
  executeSlashCommandsWithOptions, // (text, options?) => Promise<object>
  registerSlashCommand,      // DEPRECATED - Use SlashCommandParser.addCommandObject

  // Macros & Tools
  registerMacro,             // (name, valueOrFn) => void
  unregisterMacro,           // (name) => void
  registerFunctionTool,      // (name, description, parameters, fn) => void
  unregisterFunctionTool,    // (name) => void
  isToolCallingSupported,    // () => boolean
  canPerformToolCalls,       // () => boolean

  // UI
  callPopup,                 // DEPRECATED - Use callGenericPopup or Popup
  callGenericPopup,          // (content, type, inputValue?, options?) => Promise
  showLoader,                // () => void
  hideLoader,                // () => Promise<void>
  activateSendButtons,       // () => void
  deactivateSendButtons,     // () => void
  updateReasoningUI,         // (messageIdOrElement, options?) => void

  // World Info
  loadWorldInfo,             // (name) => Promise<void>
  getWorldInfoPrompt,        // (chat, maxContext, isDryRun, globalScanData) => Promise<string>
  reloadWorldInfoEditor,     // (file, loadIfNotSelected?) => void
  updateWorldInfoList,       // () => Promise<void>
  convertCharacterBook,      // (characterBook) => object

  // Presets & Settings
  getPresetManager,          // (apiId?) => PresetManager | null
  getChatCompletionModel,    // (source?) => string
  getTextGenServer,          // (type?) => string

  // Extensions
  setExtensionPrompt,        // (key, value, position, depth, scan?, role?, filter?) => void
  writeExtensionField,       // (characterId, key, value) => Promise<void>
  renderExtensionTemplateAsync, // (extensionName, templateId, data?, sanitize?, locale?) => Promise<string>
  openThirdPartyExtensionMenu, // (suggestUrl?) => Promise<void>
  registerDebugFunction,     // (functionId, name, description, func) => void
  registerDataBankScraper,   // (scraper) => void

  // Utilities
  getRequestHeaders,         // (options?) => object
  getThumbnailUrl,           // (type, file, t?) => string
  getCurrentChatId,          // () => string | undefined
  humanizedDateTime,         // () => string
  timestampToMoment,         // (timestamp) => moment
  uuidv4,                    // () => string
  isMobile,                  // () => boolean
  shouldSendOnEnter,         // () => boolean

  // Media
  appendMediaToMessage,      // (mes, messageElement, scrollBehavior?) => void
  ensureMessageMediaIsArray, // (mes) => void
  getMediaDisplay,           // (mes) => string
  getMediaIndex,             // (mes) => number

  // Rename
  renameChat,                // (oldFileName, newName) => Promise<void>
} = SillyTavern.getContext();
```

### Service Classes Overview

```javascript
const {
  ChatCompletionService,           // Direct chat completion API
  TextCompletionService,           // Direct text completion API
  ConnectionManagerRequestService, // Connection profile-based requests
  Popup,                           // Popup UI class
  SlashCommand,                    // Slash command definition
  SlashCommandArgument,            // Command argument definition
  SlashCommandNamedArgument,       // Named argument definition
  SlashCommandParser,              // Command parser/registry
  ToolManager,                     // Function tool management
  ModuleWorkerWrapper,             // Worker wrapper utility
} = SillyTavern.getContext();
```

### Using Shared Libraries

```javascript
const {
  lodash,              // Utility functions (_.debounce, _.merge, etc.)
  Fuse,                // Fuzzy search
  DOMPurify,           // HTML sanitization - ALWAYS USE THIS
  hljs,                // Syntax highlighting
  localforage,         // Browser storage (IndexedDB/localStorage)
  Handlebars,          // Templating
  css,                 // CSS parsing (@adobe/css-tools)
  Bowser,              // Browser detection
  DiffMatchPatch,      // Text diffing
  Readability,         // Content extraction
  isProbablyReaderable,// Readability check
  SVGInject,           // SVG injection
  showdown,            // Markdown conversion
  moment,              // Date/time manipulation
  seedrandom,          // Seeded random numbers
  Popper,              // Tooltip positioning
  droll,               // Dice rolling
  morphdom,            // DOM diffing
  slideToggle,         // Slide animations
  chalk,               // Terminal colors
  yaml,                // YAML parsing
} = SillyTavern.libs;
```

### Library Usage Examples

```javascript
const { lodash, Fuse, DOMPurify, moment, localforage } = SillyTavern.libs;

// Lodash utilities
const unique = lodash.uniq([1, 2, 2, 3]);
const grouped = lodash.groupBy(items, 'category');
const debounced = lodash.debounce(fn, 300);
const merged = lodash.merge({}, defaults, userSettings);

// Fuzzy search
const fuse = new Fuse(characters, {
  keys: ['name', 'description'],
  threshold: 0.3,
});
const results = fuse.search('query');

// HTML sanitization - ALWAYS sanitize user input
const clean = DOMPurify.sanitize(dirtyHtml);
const textOnly = DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });

// Date/time
const now = moment();
const formatted = moment().format('YYYY-MM-DD HH:mm:ss');
const relative = moment(timestamp).fromNow();

// Persistent storage for large data
await localforage.setItem('my_extension_cache', largeObject);
const data = await localforage.getItem('my_extension_cache');
await localforage.removeItem('my_extension_cache');
```

---

## State Management

### Extension Settings

```javascript
const MODULE_NAME = 'my_unique_extension_name';

const defaultSettings = Object.freeze({
  enabled: false,
  option1: 'default',
  option2: 5,
});

function getSettings() {
  const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
  const { lodash } = SillyTavern.libs;

  if (!extensionSettings[MODULE_NAME]) {
    extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    saveSettingsDebounced();
  }

  return extensionSettings[MODULE_NAME];
}

function updateSetting(key, value) {
  const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
  extensionSettings[MODULE_NAME][key] = value;
  saveSettingsDebounced();
}

// Reset to defaults
function resetSettings() {
  const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
  extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
  saveSettingsDebounced();
}
```

### Chat Metadata

```javascript
// IMPORTANT: Always get fresh reference
function getChatData() {
  const { chatMetadata } = SillyTavern.getContext();
  return chatMetadata['my_extension_key'] || {};
}

function setChatData(data) {
  const { chatMetadata, saveMetadataDebounced } = SillyTavern.getContext();
  chatMetadata['my_extension_key'] = data;
  saveMetadataDebounced();
}

function updateChatData(updates) {
  const { chatMetadata, saveMetadataDebounced } = SillyTavern.getContext();
  const current = chatMetadata['my_extension_key'] || {};
  chatMetadata['my_extension_key'] = { ...current, ...updates };
  saveMetadataDebounced();
}

// Listen for chat changes
const { eventSource, eventTypes } = SillyTavern.getContext();
eventSource.on(eventTypes.CHAT_CHANGED, () => {
  const data = getChatData();
  updateUI(data);
});
```

### Character Card Data

```javascript
async function saveCharacterData(data) {
  const { writeExtensionField, characterId } = SillyTavern.getContext();

  if (characterId === undefined) {
    console.warn('[MyExt] No character selected');
    return false;
  }

  await writeExtensionField(characterId, 'my_extension_key', data);
  return true;
}

function getCharacterData() {
  const { characters, characterId } = SillyTavern.getContext();

  if (characterId === undefined) return null;

  const character = characters[characterId];
  return character?.data?.extensions?.my_extension_key || null;
}

// Listen for character changes
const { eventSource, eventTypes } = SillyTavern.getContext();
eventSource.on(eventTypes.CHARACTER_PAGE_LOADED, () => {
  const data = getCharacterData();
  updateUI(data);
});
```

### Large Data Storage

```javascript
const { localforage } = SillyTavern.libs;
const MODULE_NAME = 'my_extension';

// DON'T store large data in extensionSettings - it bloats settings.json
// DO use localforage for large datasets, caches, etc.

async function saveCache(data) {
  try {
    await localforage.setItem(`${MODULE_NAME}_cache`, data);
    return true;
  } catch (e) {
    console.error('[MyExt] Failed to save cache:', e);
    return false;
  }
}

async function loadCache() {
  try {
    return await localforage.getItem(`${MODULE_NAME}_cache`);
  } catch (e) {
    console.error('[MyExt] Failed to load cache:', e);
    return null;
  }
}

async function clearCache() {
  await localforage.removeItem(`${MODULE_NAME}_cache`);
}
```

---

## Events System

### All Event Types

```javascript
const { eventTypes } = SillyTavern.getContext();

// App Lifecycle
eventTypes.APP_READY                    // 'app_ready' - App initialized
eventTypes.EXTENSIONS_FIRST_LOAD        // 'extensions_first_load'
eventTypes.EXTENSION_SETTINGS_LOADED    // 'extension_settings_loaded'
eventTypes.SETTINGS_LOADED              // 'settings_loaded'
eventTypes.SETTINGS_LOADED_BEFORE       // 'settings_loaded_before'
eventTypes.SETTINGS_LOADED_AFTER        // 'settings_loaded_after'
eventTypes.SETTINGS_UPDATED             // 'settings_updated'

// Chat Events
eventTypes.CHAT_CHANGED                 // 'chat_id_changed' - Chat switched
eventTypes.CHAT_CREATED                 // 'chat_created'
eventTypes.CHAT_DELETED                 // 'chat_deleted'
eventTypes.GROUP_CHAT_CREATED           // 'group_chat_created'
eventTypes.GROUP_CHAT_DELETED           // 'group_chat_deleted'

// Message Events
eventTypes.MESSAGE_SENT                 // 'message_sent' - User sent message
eventTypes.MESSAGE_RECEIVED             // 'message_received' - AI response received
eventTypes.MESSAGE_EDITED               // 'message_edited'
eventTypes.MESSAGE_DELETED              // 'message_deleted'
eventTypes.MESSAGE_UPDATED              // 'message_updated'
eventTypes.MESSAGE_SWIPED               // 'message_swiped'
eventTypes.MESSAGE_SWIPE_DELETED        // 'message_swipe_deleted'
eventTypes.MESSAGE_FILE_EMBEDDED        // 'message_file_embedded'
eventTypes.MESSAGE_REASONING_EDITED     // 'message_reasoning_edited'
eventTypes.MESSAGE_REASONING_DELETED    // 'message_reasoning_deleted'
eventTypes.MORE_MESSAGES_LOADED         // 'more_messages_loaded'
eventTypes.USER_MESSAGE_RENDERED        // 'user_message_rendered'
eventTypes.CHARACTER_MESSAGE_RENDERED   // 'character_message_rendered'

// Generation Events
eventTypes.GENERATION_STARTED           // 'generation_started'
eventTypes.GENERATION_STOPPED           // 'generation_stopped' - User stopped
eventTypes.GENERATION_ENDED             // 'generation_ended' - Completed
eventTypes.GENERATION_AFTER_COMMANDS    // 'GENERATION_AFTER_COMMANDS'
eventTypes.GENERATE_BEFORE_COMBINE_PROMPTS // 'generate_before_combine_prompts'
eventTypes.GENERATE_AFTER_COMBINE_PROMPTS  // 'generate_after_combine_prompts'
eventTypes.GENERATE_AFTER_DATA          // 'generate_after_data'
eventTypes.IMPERSONATE_READY            // 'impersonate_ready'

// Streaming Events
eventTypes.STREAM_TOKEN_RECEIVED        // 'stream_token_received'
eventTypes.STREAM_REASONING_DONE        // 'stream_reasoning_done'
eventTypes.SMOOTH_STREAM_TOKEN_RECEIVED // DEPRECATED - alias for STREAM_TOKEN_RECEIVED

// Character Events
eventTypes.CHARACTER_EDITED             // 'character_edited'
eventTypes.CHARACTER_DELETED            // 'characterDeleted'
eventTypes.CHARACTER_DUPLICATED         // 'character_duplicated'
eventTypes.CHARACTER_RENAMED            // 'character_renamed'
eventTypes.CHARACTER_RENAMED_IN_PAST_CHAT // 'character_renamed_in_past_chat'
eventTypes.CHARACTER_PAGE_LOADED        // 'character_page_loaded'
eventTypes.CHARACTER_EDITOR_OPENED      // 'character_editor_opened'
eventTypes.CHARACTER_FIRST_MESSAGE_SELECTED // 'character_first_message_selected'
eventTypes.CHARACTER_GROUP_OVERLAY_STATE_CHANGE_BEFORE
eventTypes.CHARACTER_GROUP_OVERLAY_STATE_CHANGE_AFTER
eventTypes.CHARACTER_MANAGEMENT_DROPDOWN // 'charManagementDropdown'
eventTypes.OPEN_CHARACTER_LIBRARY       // 'open_character_library'

// Group Events
eventTypes.GROUP_UPDATED                // 'group_updated'
eventTypes.GROUP_MEMBER_DRAFTED         // 'group_member_drafted'
eventTypes.GROUP_WRAPPER_STARTED        // 'group_wrapper_started'
eventTypes.GROUP_WRAPPER_FINISHED       // 'group_wrapper_finished'

// API/Connection Events
eventTypes.MAIN_API_CHANGED             // 'main_api_changed'
eventTypes.ONLINE_STATUS_CHANGED        // 'online_status_changed'
eventTypes.EXTRAS_CONNECTED             // 'extras_connected'
eventTypes.CHATCOMPLETION_SOURCE_CHANGED // 'chatcompletion_source_changed'
eventTypes.CHATCOMPLETION_MODEL_CHANGED // 'chatcompletion_model_changed'
eventTypes.CONNECTION_PROFILE_LOADED    // 'connection_profile_loaded'
eventTypes.CONNECTION_PROFILE_CREATED   // 'connection_profile_created'
eventTypes.CONNECTION_PROFILE_DELETED   // 'connection_profile_deleted'
eventTypes.CONNECTION_PROFILE_UPDATED   // 'connection_profile_updated'

// Preset Events
eventTypes.PRESET_CHANGED               // 'preset_changed'
eventTypes.PRESET_DELETED               // 'preset_deleted'
eventTypes.PRESET_RENAMED               // 'preset_renamed'
eventTypes.PRESET_RENAMED_BEFORE        // 'preset_renamed_before'
eventTypes.OAI_PRESET_CHANGED_BEFORE    // 'oai_preset_changed_before'
eventTypes.OAI_PRESET_CHANGED_AFTER     // 'oai_preset_changed_after'
eventTypes.OAI_PRESET_EXPORT_READY      // 'oai_preset_export_ready'
eventTypes.OAI_PRESET_IMPORT_READY      // 'oai_preset_import_ready'
eventTypes.TEXT_COMPLETION_SETTINGS_READY // 'text_completion_settings_ready'
eventTypes.CHAT_COMPLETION_SETTINGS_READY // 'chat_completion_settings_ready'
eventTypes.CHAT_COMPLETION_PROMPT_READY // 'chat_completion_prompt_ready'

// World Info Events
eventTypes.WORLDINFO_SETTINGS_UPDATED   // 'worldinfo_settings_updated'
eventTypes.WORLDINFO_UPDATED            // 'worldinfo_updated'
eventTypes.WORLDINFO_FORCE_ACTIVATE     // 'worldinfo_force_activate'
eventTypes.WORLDINFO_ENTRIES_LOADED     // 'worldinfo_entries_loaded'
eventTypes.WORLD_INFO_ACTIVATED         // 'world_info_activated'

// Secret Events
eventTypes.SECRET_WRITTEN               // 'secret_written'
eventTypes.SECRET_DELETED               // 'secret_deleted'
eventTypes.SECRET_ROTATED               // 'secret_rotated'
eventTypes.SECRET_EDITED                // 'secret_edited'

// Tool Events
eventTypes.TOOL_CALLS_PERFORMED         // 'tool_calls_performed'
eventTypes.TOOL_CALLS_RENDERED          // 'tool_calls_rendered'

// Media Events
eventTypes.IMAGE_SWIPED                 // 'image_swiped'
eventTypes.FILE_ATTACHMENT_DELETED      // 'file_attachment_deleted'
eventTypes.MEDIA_ATTACHMENT_DELETED     // 'media_attachment_deleted'
eventTypes.SD_PROMPT_PROCESSING         // 'sd_prompt_processing'

// UI Events
eventTypes.MOVABLE_PANELS_RESET         // 'movable_panels_reset'
eventTypes.FORCE_SET_BACKGROUND         // 'force_set_background'
```

### Event Patterns

```javascript
const { eventSource, eventTypes } = SillyTavern.getContext();

// Initialize on app ready (auto-fires if already ready)
eventSource.on(eventTypes.APP_READY, init);

// One-time listener
eventSource.once(eventTypes.APP_READY, () => {
  console.log('App ready - runs once');
});

// Remove listener (important for cleanup!)
function handler(data) { /* ... */ }
eventSource.on(eventTypes.MESSAGE_RECEIVED, handler);
// Later:
eventSource.removeListener(eventTypes.MESSAGE_RECEIVED, handler);

// Emit custom events
await eventSource.emit('my_custom_event', { data: 'value' });
```

### Common Event Patterns

```javascript
const { eventSource, eventTypes } = SillyTavern.getContext();

// React to chat changes
eventSource.on(eventTypes.CHAT_CHANGED, () => {
  refreshState();
  updateUI();
});

// Process messages before rendering
eventSource.on(eventTypes.MESSAGE_RECEIVED, messageIndex => {
  const { chat } = SillyTavern.getContext();
  const message = chat[messageIndex];
  // Modify message.mes before it renders
});

// React to rendered messages (add UI elements, etc.)
eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, messageIndex => {
  const messageElement = document.querySelector(`[mesid="${messageIndex}"]`);
  if (messageElement) {
    // Add buttons, process content, etc.
  }
});

// Handle generation lifecycle
eventSource.on(eventTypes.GENERATION_STARTED, () => {
  showLoadingIndicator();
});

eventSource.on(eventTypes.GENERATION_ENDED, () => {
  hideLoadingIndicator();
});

eventSource.on(eventTypes.GENERATION_STOPPED, () => {
  // User clicked stop
  handleUserStop();
});

// Stream tokens (for real-time processing)
eventSource.on(eventTypes.STREAM_TOKEN_RECEIVED, token => {
  processToken(token);
});
```

---

## Slash Commands

### Registering Commands

```javascript
const {
  SlashCommandParser,
  SlashCommand,
  SlashCommandArgument,
  SlashCommandNamedArgument,
  ARGUMENT_TYPE,
} = SillyTavern.getContext();

SlashCommandParser.addCommandObject(
  SlashCommand.fromProps({
    name: 'mycommand',
    aliases: ['mc'],

    callback: async (namedArgs, unnamedArgs) => {
      const count = Number(namedArgs.count) || 1;
      const text = unnamedArgs.toString();
      return text.repeat(count);
    },

    returns: 'the repeated text',

    namedArgumentList: [
      SlashCommandNamedArgument.fromProps({
        name: 'count',
        description: 'Number of repetitions',
        typeList: [ARGUMENT_TYPE.NUMBER],
        defaultValue: '1',
        isRequired: false,
      }),
    ],

    unnamedArgumentList: [
      SlashCommandArgument.fromProps({
        description: 'Text to repeat',
        typeList: [ARGUMENT_TYPE.STRING],
        isRequired: true,
      }),
    ],

    helpString: '<div>Repeats text.</div>',
  })
);
```

### Argument Types

```javascript
ARGUMENT_TYPE.STRING        // Text
ARGUMENT_TYPE.NUMBER        // Numeric
ARGUMENT_TYPE.RANGE         // Number range
ARGUMENT_TYPE.BOOLEAN       // true/false
ARGUMENT_TYPE.VARIABLE_NAME // Variable reference
ARGUMENT_TYPE.CLOSURE       // Code block
ARGUMENT_TYPE.SUBCOMMAND    // Nested command
ARGUMENT_TYPE.LIST          // Array
ARGUMENT_TYPE.DICTIONARY    // Object
```

### Execute Commands Programmatically

```javascript
const { executeSlashCommandsWithOptions } = SillyTavern.getContext();

const result = await executeSlashCommandsWithOptions('/mycommand count=3 hello');
console.log(result.pipe); // "hellohellohello"

// With error handling
try {
  const result = await executeSlashCommandsWithOptions('/somecommand');
  if (result.isError) {
    console.error('Command failed:', result.errorMessage);
  }
} catch (e) {
  console.error('Command execution error:', e);
}
```

---

## Text Generation

### generateQuietPrompt - Background Generation with Context

Uses current chat context, character, and settings.

```javascript
const { generateQuietPrompt } = SillyTavern.getContext();

const response = await generateQuietPrompt({
  quietPrompt: 'Summarize the conversation.',  // Required
  quietToLoud: false,          // Show in chat? Default false
  skipWIAN: false,             // Skip World Info After Notes
  quietImage: null,            // Image for vision models
  quietName: null,             // Name for prompt injection
  responseLength: null,        // Max tokens (null = use settings)
  forceChId: null,             // Force specific character
  jsonSchema: null,            // Structured output schema
  removeReasoning: true,       // Strip reasoning from response
  trimToSentence: false,       // Trim to complete sentence
});
```

### generateRaw - Direct Generation without Context

Bypasses chat context entirely. Good for utility tasks.

```javascript
const { generateRaw } = SillyTavern.getContext();

// Simple text prompt
const response = await generateRaw({
  prompt: 'Write a haiku about coding.',
});

// With system prompt
const response = await generateRaw({
  prompt: 'Explain recursion briefly.',
  systemPrompt: 'You are a helpful coding tutor.',
  prefill: 'Recursion is',  // Start of assistant response
});

// Chat completion format (array of messages)
const response = await generateRaw({
  prompt: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' },
  ],
});

// Full options
const response = await generateRaw({
  prompt: 'Your prompt',
  api: null,                   // Override API (null = use current)
  instructOverride: false,     // Bypass instruct formatting
  quietToLoud: false,          // Show in chat
  systemPrompt: '',            // System message
  responseLength: null,        // Max tokens
  trimNames: true,             // Clean up names in response
  prefill: '',                 // Assistant prefill
  jsonSchema: null,            // Structured output
});
```

### Structured Outputs (JSON Schema)

```javascript
const { generateRaw } = SillyTavern.getContext();

const jsonSchema = {
  name: 'CharacterAnalysis',
  strict: true,
  value: {
    $schema: 'http://json-schema.org/draft-04/schema#',
    type: 'object',
    properties: {
      mood: { type: 'string' },
      confidence: { type: 'number', minimum: 0, maximum: 100 },
      traits: { type: 'array', items: { type: 'string' } },
    },
    required: ['mood', 'confidence', 'traits'],
  },
};

const response = await generateRaw({
  prompt: 'Analyze this character.',
  jsonSchema,
});

try {
  const data = JSON.parse(response);
  console.log(data.mood, data.confidence, data.traits);
} catch (e) {
  console.error('Failed to parse structured output:', e);
}
```

---

## Preset Management

### PresetManager API

```javascript
const { getPresetManager, mainApi } = SillyTavern.getContext();

// Get preset manager for current API
const pm = getPresetManager();
// Or for specific API
const pm = getPresetManager('openai');

if (pm) {
  // Get current preset info
  const name = pm.getSelectedPresetName();
  const index = pm.getSelectedPreset();

  // Get all presets
  const { presets, preset_names, settings } = pm.getPresetList();
  // preset_names: { "Default": 0, "MyPreset": 1, ... }
  // presets: Array of preset objects
  // settings: Current active settings

  // Get preset by name
  const preset = pm.getCompletionPresetByName('Default');
  const presetSettings = pm.getPresetSettings('Default');

  // Switch preset (triggers OAI_PRESET_CHANGED events)
  pm.selectPreset('Default');

  // Read/write extension data in preset
  const data = pm.readPresetExtensionField({ path: 'my_extension' });
  await pm.writePresetExtensionField({
    path: 'my_extension',
    value: { setting: true }
  });
}
```

### Chat Completion Settings Structure

```javascript
const { chatCompletionSettings } = SillyTavern.getContext();

// Key settings
chatCompletionSettings.preset_settings_openai  // Current preset name
chatCompletionSettings.chat_completion_source  // "openrouter", "openai", etc.
chatCompletionSettings.openrouter_model        // Current model
chatCompletionSettings.temp_openai             // Temperature
chatCompletionSettings.openai_max_context      // Context size
chatCompletionSettings.openai_max_tokens       // Max response tokens
chatCompletionSettings.stream_openai           // Streaming enabled
chatCompletionSettings.prompts                 // Array of prompt entries
chatCompletionSettings.prompt_order            // Prompt ordering
```

---

## Service Classes

### ChatCompletionService - Direct API Access

Bypasses ST's prompt building entirely. Use for utility tasks.

```javascript
const { ChatCompletionService } = SillyTavern.getContext();

// Simple request
const result = await ChatCompletionService.sendRequest({
  stream: false,
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello!' },
  ],
  model: 'gpt-4',
  chat_completion_source: 'openai',
  max_tokens: 1000,
  temperature: 0.7,
});

console.log(result.content);   // Response text
console.log(result.reasoning); // Reasoning if available

// With preset
const result = await ChatCompletionService.processRequest(
  {
    stream: false,
    messages: [...],
    max_tokens: 1000,
  },
  { presetName: 'Default' },  // Apply preset settings
  true,  // extractData
  null   // signal
);

// Streaming
const generator = await ChatCompletionService.sendRequest({
  stream: true,
  messages: [...],
  // ...
});

for await (const chunk of generator()) {
  console.log(chunk.text);  // Accumulated text
}
```

### TextCompletionService - Text Completion API

```javascript
const { TextCompletionService } = SillyTavern.getContext();

const result = await TextCompletionService.sendRequest({
  stream: false,
  prompt: 'Continue this story: Once upon a time',
  max_tokens: 500,
  api_type: 'koboldcpp',
  temperature: 0.8,
});

console.log(result.content);
```

### ConnectionManagerRequestService - Profile-Based Requests

Uses connection profiles from Connection Manager extension.

```javascript
const { ConnectionManagerRequestService, extensionSettings } = SillyTavern.getContext();

// Get available profiles
const profiles = ConnectionManagerRequestService.getSupportedProfiles();

// Send request using specific profile
const profileId = extensionSettings.connectionManager?.selectedProfile;

if (profileId) {
  const result = await ConnectionManagerRequestService.sendRequest(
    profileId,
    [{ role: 'user', content: 'Hello!' }],  // prompt (string or messages array)
    1000,  // maxTokens
    {
      stream: false,
      extractData: true,
      includePreset: true,
      includeInstruct: true,
    }
  );
}
```

---

## Prompt Interceptors

Interceptors let you modify the prompt before it's sent to the API. Declare in manifest.json:

```json
{
  "generate_interceptor": "myInterceptorFunction"
}
```

### Implementation

```javascript
// Must be global (on globalThis/window)
globalThis.myInterceptorFunction = async function(chat, contextSize, abort, type) {
  // chat: Array of message objects (mutable - changes persist!)
  // contextSize: Current context size in tokens
  // abort: Function to cancel generation - abort(true) skips remaining interceptors
  // type: Generation type ('quiet', 'regenerate', 'impersonate', 'swipe', 'continue', etc.)

  console.log(`[MyExt] Intercepting ${type} generation, ${chat.length} messages`);

  // Example: Add system note before last message
  if (type !== 'quiet') {
    const note = {
      is_user: false,
      is_system: true,
      name: 'System',
      mes: 'Remember to stay in character.',
      send_date: Date.now(),
    };
    // Insert before last message
    chat.splice(chat.length - 1, 0, note);
  }

  // Example: Abort on condition
  if (someCondition) {
    abort(true); // true = skip remaining interceptors
    return;
  }

  // Example: Modify last user message
  const lastUserMsg = [...chat].reverse().find(m => m.is_user);
  if (lastUserMsg) {
    lastUserMsg.mes = processUserMessage(lastUserMsg.mes);
  }

  // WARNING: Changes to chat array persist!
  // Use structuredClone if you need non-persistent modifications
};
```

### Interceptor Types

The `type` parameter tells you what kind of generation triggered the interceptor:

- `'normal'` - Regular message generation
- `'quiet'` - Background generation (generateQuietPrompt)
- `'regenerate'` - User clicked regenerate
- `'swipe'` - User swiped for alternative
- `'continue'` - Continue generation
- `'impersonate'` - Impersonate mode

### Non-Persistent Modifications

If you want to modify the prompt without affecting the actual chat:

```javascript
globalThis.myInterceptorFunction = async function(chat, contextSize, abort, type) {
  // Clone messages you want to modify
  for (let i = 0; i < chat.length; i++) {
    if (shouldModify(chat[i])) {
      chat[i] = structuredClone(chat[i]);
      chat[i].mes = modifyMessage(chat[i].mes);
    }
  }
};
```

---

## Custom Macros

Macros are placeholders like `{{user}}` that get replaced in prompts.

### Registration

```javascript
const { registerMacro, unregisterMacro } = SillyTavern.getContext();

// Simple string macro
registerMacro('greeting', 'Hello, World!');
// Usage: {{greeting}} → "Hello, World!"

// Function macro (MUST be synchronous!)
registerMacro('timestamp', () => {
  return new Date().toISOString();
});
// Usage: {{timestamp}} → "2024-01-15T10:30:00.000Z"

// Macro with context access
registerMacro('msgcount', () => {
  const { chat } = SillyTavern.getContext();
  return String(chat.length);
});
// Usage: {{msgcount}} → "42"

// Cleanup when done
unregisterMacro('greeting');
```

### Important Limitations

1. **Macros must be synchronous** - No async/await, no Promises
2. **Don't register too many** - Each macro is checked on every substitution
3. **Names are auto-wrapped** - Register `'foo'`, use `{{foo}}`
4. **Return strings** - Always return a string value

### Macro with Arguments

Macros don't support arguments directly, but you can parse them:

```javascript
registerMacro('repeat', () => {
  // This won't work - macros don't receive arguments
  // Use slash commands for argument support
  return 'Use /repeat command instead';
});
```

For argument support, use slash commands instead.

---

## Bundling

### When to Bundle

Bundle your extension when:

- Using TypeScript
- Using npm packages not in SillyTavern.libs
- Multiple source files
- Need tree-shaking

### Webpack Setup

Use the official templates:

- TypeScript + Webpack: <https://github.com/SillyTavern/Extension-WebpackTemplate>
- React + Webpack: <https://github.com/SillyTavern/Extension-ReactTemplate>

### Import Wrapper for Bundled Extensions

When bundling, webpack may try to bundle ST's modules. Use this wrapper:

```javascript
/**
 * Import from SillyTavern modules, bypassing webpack.
 * @param {string} url - URL to import from
 * @param {string} what - Member name to import
 * @param {any} defaultValue - Fallback value
 * @returns {Promise<any>}
 */
export async function importFromUrl(url, what, defaultValue = null) {
  try {
    const module = await import(/* webpackIgnore: true */ url);
    if (!Object.hasOwn(module, what)) {
      throw new Error(`No ${what} in module`);
    }
    return module[what];
  } catch (error) {
    console.error(`Failed to import ${what} from ${url}:`, error);
    return defaultValue;
  }
}

// Usage
const generateRaw = await importFromUrl('/script.js', 'generateRaw');
```

### Basic webpack.config.js

```javascript
const path = require('path');

module.exports = {
  entry: './src/index.ts',
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'dist'),
  },
  // Don't bundle SillyTavern's modules
  externals: {
    // Add any ST modules you import directly
  },
};
```

---

## Error Handling

### Generation Errors

```javascript
const { generateQuietPrompt, generateRaw } = SillyTavern.getContext();

async function safeGenerate(prompt) {
  try {
    const response = await generateQuietPrompt({ quietPrompt: prompt });
    if (!response || response.trim() === '') {
      console.warn('[MyExt] Empty response from generation');
      return null;
    }
    return response;
  } catch (e) {
    console.error('[MyExt] Generation failed:', e);
    toastr.error('Generation failed. Check console for details.');
    return null;
  }
}
```

### API Status Checking

```javascript
function isApiReady() {
  const { onlineStatus } = SillyTavern.getContext();
  return onlineStatus === 'Valid' || onlineStatus === 'Connected';
}

async function generateWithCheck(prompt) {
  if (!isApiReady()) {
    toastr.warning('API not connected');
    return null;
  }

  return await safeGenerate(prompt);
}
```

### Character/Chat Validation

```javascript
function requiresActiveChat() {
  const { chat, characterId, groupId } = SillyTavern.getContext();

  if (!chat || chat.length === 0) {
    toastr.warning('No active chat');
    return false;
  }

  if (characterId === undefined && !groupId) {
    toastr.warning('No character or group selected');
    return false;
  }

  return true;
}
```

### Structured Output Parsing

```javascript
async function generateStructured(prompt, schema) {
  const { generateRaw } = SillyTavern.getContext();

  try {
    const response = await generateRaw({
      prompt,
      jsonSchema: schema,
    });

    // Try to parse JSON
    const data = JSON.parse(response);
    return { success: true, data };
  } catch (e) {
    if (e instanceof SyntaxError) {
      console.error('[MyExt] Invalid JSON response:', response);
      return { success: false, error: 'Invalid JSON', raw: response };
    }
    console.error('[MyExt] Generation error:', e);
    return { success: false, error: e.message };
  }
}
```

---

## Best Practices

### Security

```javascript
// ALWAYS sanitize user input before rendering
const { DOMPurify } = SillyTavern.libs;
const clean = DOMPurify.sanitize(userInput);

// Strip all HTML for plain text
const textOnly = DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });

// NEVER store secrets in extensionSettings
// Use server plugins for API keys, tokens, etc.

// NEVER use eval() or Function() with user input
```

### Performance

```javascript
// DON'T store large data in extensionSettings
// DO use localforage
const { localforage } = SillyTavern.libs;
await localforage.setItem(`${MODULE_NAME}_cache`, largeData);

// Clean up event listeners when appropriate
function cleanup() {
  const { eventSource, eventTypes } = SillyTavern.getContext();
  eventSource.removeListener(eventTypes.MESSAGE_RECEIVED, handler);
}

// Yield for heavy operations to avoid blocking UI
async function heavyWork(items) {
  for (let i = 0; i < items.length; i++) {
    processItem(items[i]);
    if (i % 100 === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }
}

// Debounce frequent operations
const { lodash } = SillyTavern.libs;
const debouncedSave = lodash.debounce(() => {
  saveSettingsDebounced();
}, 300);
```

### Compatibility

```javascript
// PREFER getContext() over direct imports
// GOOD:
const { chat } = SillyTavern.getContext();

// AVOID (may break with ST updates):
import { chat } from '../../../../script.js';

// Use unique module names to avoid collisions
const MODULE_NAME = 'my_unique_extension_name';

// Check for optional features
const { isToolCallingSupported } = SillyTavern.getContext();
if (isToolCallingSupported()) {
  // Use tool calling
}
```

### User Feedback

```javascript
// Use toastr for notifications
toastr.success('Operation completed');
toastr.error('Something went wrong');
toastr.warning('Feature is experimental');
toastr.info('Processing...');

// Use popups for important interactions
const { Popup, POPUP_TYPE, POPUP_RESULT } = SillyTavern.getContext();

const confirmed = await Popup.show.confirm('Delete?', 'This cannot be undone.');
if (confirmed === POPUP_RESULT.AFFIRMATIVE) {
  // proceed
}

// Console logging with prefix
const log = (...args) => console.log('[MyExt]', ...args);
const warn = (...args) => console.warn('[MyExt]', ...args);
const error = (...args) => console.error('[MyExt]', ...args);
```

---

## API Connection Map

```javascript
const { CONNECT_API_MAP } = SillyTavern.getContext();

// Structure for each API type
CONNECT_API_MAP.openai = {
  selected: 'openai',
  button: '#api_button_openai',
  source: 'openai'
};

CONNECT_API_MAP.openrouter = {
  selected: 'openai',
  button: '#api_button_openai',
  source: 'openrouter'
};

CONNECT_API_MAP.koboldcpp = {
  selected: 'textgenerationwebui',
  button: '#api_button_textgenerationwebui',
  type: 'koboldcpp'
};

// Available APIs (44 total):
// kobold, horde, novel, koboldcpp, kcpp, openai, oai, google,
// openrouter, openrouter-text, ooba, mancer, vllm, aphrodite,
// tabby, togetherai, llamacpp, ollama, infermaticai, dreamgen,
// featherless, huggingface, generic, claude, ai21, makersuite,
// vertexai, mistralai, custom, cohere, perplexity, groq,
// electronhub, nanogpt, deepseek, aimlapi, xai, pollinations,
// moonshot, fireworks, cometapi, azure_openai, zai, siliconflow
```

---

## Tokenizers

```javascript
const { tokenizers, getTokenCountAsync, getTextTokens, getTokenizerModel } = SillyTavern.getContext();

// Available tokenizers
tokenizers.NONE           // 0
tokenizers.GPT2           // 1
tokenizers.OPENAI         // 2
tokenizers.LLAMA          // 3
tokenizers.NERD           // 4
tokenizers.NERD2          // 5
tokenizers.API_CURRENT    // 6
tokenizers.MISTRAL        // 7
tokenizers.YI             // 8
tokenizers.API_TEXTGENERATIONWEBUI // 9
tokenizers.API_KOBOLD     // 10
tokenizers.CLAUDE         // 11
tokenizers.LLAMA3         // 12
tokenizers.GEMMA          // 13
tokenizers.JAMBA          // 14
tokenizers.QWEN2          // 15
tokenizers.COMMAND_R      // 16
tokenizers.NEMO           // 17
tokenizers.DEEPSEEK       // 18
tokenizers.COMMAND_A      // 19
tokenizers.BEST_MATCH     // 99

// Count tokens (async - preferred)
const count = await getTokenCountAsync('Hello world');

// Get token IDs
const tokens = getTextTokens(tokenizers.LLAMA3, 'Hello world');

// Get current tokenizer model name
const model = getTokenizerModel();
```

---

## Popup System

```javascript
const { Popup, POPUP_TYPE, POPUP_RESULT, callGenericPopup } = SillyTavern.getContext();

// Popup types
POPUP_TYPE.TEXT     // 1 - Text display
POPUP_TYPE.CONFIRM  // 2 - Yes/No confirmation
POPUP_TYPE.INPUT    // 3 - Text input
POPUP_TYPE.DISPLAY  // 4 - Display only
POPUP_TYPE.CROP     // 5 - Image crop

// Popup results
POPUP_RESULT.AFFIRMATIVE  // 1 - Yes/OK clicked
POPUP_RESULT.NEGATIVE     // 0 - No clicked
POPUP_RESULT.CANCELLED    // null - Cancelled/closed

// Quick helpers
const confirmed = await Popup.show.confirm('Delete?', 'This cannot be undone.');
if (confirmed === POPUP_RESULT.AFFIRMATIVE) {
  // proceed
}

const name = await Popup.show.input('Name', 'Enter a name:', 'default');
if (name !== null) {
  // User entered something (even empty string)
}

// Full popup with options
const popup = new Popup(content, POPUP_TYPE.CONFIRM, '', {
  wide: true,
  large: true,
  allowVerticalScrolling: true,
});
const result = await popup.show();
```

---

## Quick Reference

```javascript
// Get context (always fresh)
const ctx = SillyTavern.getContext();

// Get libraries
const { lodash, DOMPurify, moment, localforage, Fuse } = SillyTavern.libs;

// Save settings
ctx.saveSettingsDebounced();

// Generate text
const response = await ctx.generateQuietPrompt({ quietPrompt: 'prompt' });
const raw = await ctx.generateRaw({ prompt: 'prompt' });

// Events
ctx.eventSource.on(ctx.eventTypes.MESSAGE_RECEIVED, handler);
ctx.eventSource.removeListener(ctx.eventTypes.MESSAGE_RECEIVED, handler);

// Popups
await ctx.Popup.show.confirm('Title', 'Message');
toastr.success('Done');

// Sanitize HTML
const clean = DOMPurify.sanitize(dirty);

// Presets
const pm = ctx.getPresetManager();
const presetName = pm?.getSelectedPresetName();

// Check API status
const isReady = ctx.onlineStatus === 'Valid';

// Check for active chat
const hasChat = ctx.chat && ctx.chat.length > 0;
const hasCharacter = ctx.characterId !== undefined || ctx.groupId;
```

---

## Extension Skeleton

```javascript
// index.js - Minimal extension template
(async function() {
  const MODULE_NAME = 'my_extension';

  const defaultSettings = Object.freeze({
    enabled: true,
    someOption: 'default',
  });

  function getSettings() {
    const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();

    if (!extensionSettings[MODULE_NAME]) {
      extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
      saveSettingsDebounced();
    }

    return extensionSettings[MODULE_NAME];
  }

  function log(...args) {
    console.log(`[${MODULE_NAME}]`, ...args);
  }

  function init() {
    const settings = getSettings();
    log('Initialized', settings);

    // Setup UI
    // Register event listeners
    // Register slash commands
  }

  // Wait for app ready
  const { eventSource, eventTypes } = SillyTavern.getContext();
  eventSource.on(eventTypes.APP_READY, init);
})();
```

---

## Complete API Reference

### Full getContext() Export

```javascript
export function getContext() {
    return {
        accountStorage,
        chat,
        characters,
        groups,
        name1,
        name2,
        characterId: this_chid,
        groupId: selected_group,
        chatId: selected_group
            ? groups.find(x => x.id == selected_group)?.chat_id
            : (characters[this_chid]?.chat),
        getCurrentChatId,
        getRequestHeaders,
        reloadCurrentChat,
        renameChat,
        saveSettingsDebounced,
        onlineStatus: online_status,
        maxContext: Number(max_context),
        chatMetadata: chat_metadata,
        saveMetadataDebounced,
        streamingProcessor,
        eventSource,
        eventTypes: event_types,
        addOneMessage,
        deleteLastMessage,
        deleteMessage,
        generate: Generate,
        sendStreamingRequest,
        sendGenerationRequest,
        stopGeneration,
        tokenizers,
        getTextTokens,
        /** @deprecated Use getTokenCountAsync instead */
        getTokenCount,
        getTokenCountAsync,
        extensionPrompts: extension_prompts,
        setExtensionPrompt,
        updateChatMetadata,
        saveChat: saveChatConditional,
        openCharacterChat,
        openGroupChat,
        saveMetadata,
        sendSystemMessage,
        activateSendButtons,
        deactivateSendButtons,
        saveReply,
        substituteParams,
        substituteParamsExtended,
        SlashCommandParser,
        SlashCommand,
        SlashCommandArgument,
        SlashCommandNamedArgument,
        ARGUMENT_TYPE,
        executeSlashCommandsWithOptions,
        /** @deprecated Use SlashCommandParser.addCommandObject() instead */
        registerSlashCommand,
        /** @deprecated Use executeSlashCommandWithOptions instead */
        executeSlashCommands,
        timestampToMoment,
        /** @deprecated Handlebars for extensions are no longer supported. */
        registerHelper: () => { },
        registerMacro: MacrosParser.registerMacro.bind(MacrosParser),
        unregisterMacro: MacrosParser.unregisterMacro.bind(MacrosParser),
        registerFunctionTool: ToolManager.registerFunctionTool.bind(ToolManager),
        unregisterFunctionTool: ToolManager.unregisterFunctionTool.bind(ToolManager),
        isToolCallingSupported: ToolManager.isToolCallingSupported.bind(ToolManager),
        canPerformToolCalls: ToolManager.canPerformToolCalls.bind(ToolManager),
        ToolManager,
        registerDebugFunction,
        /** @deprecated Use renderExtensionTemplateAsync instead. */
        renderExtensionTemplate,
        renderExtensionTemplateAsync,
        registerDataBankScraper: ScraperManager.registerDataBankScraper.bind(ScraperManager),
        /** @deprecated Use callGenericPopup or Popup instead. */
        callPopup,
        callGenericPopup,
        showLoader,
        hideLoader,
        mainApi: main_api,
        extensionSettings: extension_settings,
        ModuleWorkerWrapper,
        getTokenizerModel,
        generateQuietPrompt,
        generateRaw,
        writeExtensionField,
        getThumbnailUrl,
        selectCharacterById,
        messageFormatting,
        shouldSendOnEnter,
        isMobile,
        t,
        translate,
        getCurrentLocale,
        addLocaleData,
        tags,
        tagMap: tag_map,
        menuType: menu_type,
        createCharacterData: create_save,
        /** @deprecated Legacy snake-case naming, compatibility with old extensions */
        event_types: event_types,
        Popup,
        POPUP_TYPE,
        POPUP_RESULT,
        chatCompletionSettings: oai_settings,
        textCompletionSettings: textgenerationwebui_settings,
        powerUserSettings: power_user,
        getCharacters,
        getCharacterCardFields,
        uuidv4,
        humanizedDateTime,
        updateMessageBlock,
        appendMediaToMessage,
        ensureMessageMediaIsArray,
        getMediaDisplay,
        getMediaIndex,
        swipe: {
            left: swipe_left,
            right: swipe_right,
            show: showSwipeButtons,
            hide: hideSwipeButtons,
            refresh: refreshSwipeButtons,
            isAllowed: () => isSwipingAllowed,
        },
        variables: {
            local: {
                get: getLocalVariable,
                set: setLocalVariable,
            },
            global: {
                get: getGlobalVariable,
                set: setGlobalVariable,
            },
        },
        loadWorldInfo,
        saveWorldInfo,
        reloadWorldInfoEditor: reloadEditor,
        updateWorldInfoList,
        convertCharacterBook,
        getWorldInfoPrompt,
        CONNECT_API_MAP,
        getTextGenServer,
        extractMessageFromData,
        getPresetManager,
        getChatCompletionModel,
        printMessages,
        clearChat,
        ChatCompletionService,
        TextCompletionService,
        ConnectionManagerRequestService,
        updateReasoningUI,
        parseReasoningFromString,
        unshallowCharacter,
        unshallowGroupMembers,
        openThirdPartyExtensionMenu,
        symbols: {
            ignore: IGNORE_SYMBOL,
        },
    };
}
```

### Full Event Types Reference

```javascript
export const event_types = {
    APP_READY: 'app_ready',
    EXTRAS_CONNECTED: 'extras_connected',
    MESSAGE_SWIPED: 'message_swiped',
    MESSAGE_SENT: 'message_sent',
    MESSAGE_RECEIVED: 'message_received',
    MESSAGE_EDITED: 'message_edited',
    MESSAGE_DELETED: 'message_deleted',
    MESSAGE_UPDATED: 'message_updated',
    MESSAGE_FILE_EMBEDDED: 'message_file_embedded',
    MESSAGE_REASONING_EDITED: 'message_reasoning_edited',
    MESSAGE_REASONING_DELETED: 'message_reasoning_deleted',
    MESSAGE_SWIPE_DELETED: 'message_swipe_deleted',
    MORE_MESSAGES_LOADED: 'more_messages_loaded',
    IMPERSONATE_READY: 'impersonate_ready',
    CHAT_CHANGED: 'chat_id_changed',
    GENERATION_AFTER_COMMANDS: 'GENERATION_AFTER_COMMANDS',
    GENERATION_STARTED: 'generation_started',
    GENERATION_STOPPED: 'generation_stopped',
    GENERATION_ENDED: 'generation_ended',
    SD_PROMPT_PROCESSING: 'sd_prompt_processing',
    EXTENSIONS_FIRST_LOAD: 'extensions_first_load',
    EXTENSION_SETTINGS_LOADED: 'extension_settings_loaded',
    SETTINGS_LOADED: 'settings_loaded',
    SETTINGS_UPDATED: 'settings_updated',
    GROUP_UPDATED: 'group_updated',
    MOVABLE_PANELS_RESET: 'movable_panels_reset',
    SETTINGS_LOADED_BEFORE: 'settings_loaded_before',
    SETTINGS_LOADED_AFTER: 'settings_loaded_after',
    CHATCOMPLETION_SOURCE_CHANGED: 'chatcompletion_source_changed',
    CHATCOMPLETION_MODEL_CHANGED: 'chatcompletion_model_changed',
    OAI_PRESET_CHANGED_BEFORE: 'oai_preset_changed_before',
    OAI_PRESET_CHANGED_AFTER: 'oai_preset_changed_after',
    OAI_PRESET_EXPORT_READY: 'oai_preset_export_ready',
    OAI_PRESET_IMPORT_READY: 'oai_preset_import_ready',
    WORLDINFO_SETTINGS_UPDATED: 'worldinfo_settings_updated',
    WORLDINFO_UPDATED: 'worldinfo_updated',
    CHARACTER_EDITOR_OPENED: 'character_editor_opened',
    CHARACTER_EDITED: 'character_edited',
    CHARACTER_PAGE_LOADED: 'character_page_loaded',
    CHARACTER_GROUP_OVERLAY_STATE_CHANGE_BEFORE: 'character_group_overlay_state_change_before',
    CHARACTER_GROUP_OVERLAY_STATE_CHANGE_AFTER: 'character_group_overlay_state_change_after',
    USER_MESSAGE_RENDERED: 'user_message_rendered',
    CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
    FORCE_SET_BACKGROUND: 'force_set_background',
    CHAT_DELETED: 'chat_deleted',
    CHAT_CREATED: 'chat_created',
    GROUP_CHAT_DELETED: 'group_chat_deleted',
    GROUP_CHAT_CREATED: 'group_chat_created',
    GENERATE_BEFORE_COMBINE_PROMPTS: 'generate_before_combine_prompts',
    GENERATE_AFTER_COMBINE_PROMPTS: 'generate_after_combine_prompts',
    GENERATE_AFTER_DATA: 'generate_after_data',
    GROUP_MEMBER_DRAFTED: 'group_member_drafted',
    GROUP_WRAPPER_STARTED: 'group_wrapper_started',
    GROUP_WRAPPER_FINISHED: 'group_wrapper_finished',
    WORLD_INFO_ACTIVATED: 'world_info_activated',
    TEXT_COMPLETION_SETTINGS_READY: 'text_completion_settings_ready',
    CHAT_COMPLETION_SETTINGS_READY: 'chat_completion_settings_ready',
    CHAT_COMPLETION_PROMPT_READY: 'chat_completion_prompt_ready',
    CHARACTER_FIRST_MESSAGE_SELECTED: 'character_first_message_selected',
    CHARACTER_DELETED: 'characterDeleted',
    CHARACTER_DUPLICATED: 'character_duplicated',
    CHARACTER_RENAMED: 'character_renamed',
    CHARACTER_RENAMED_IN_PAST_CHAT: 'character_renamed_in_past_chat',
    /** @deprecated The event is aliased to STREAM_TOKEN_RECEIVED. */
    SMOOTH_STREAM_TOKEN_RECEIVED: 'stream_token_received',
    STREAM_TOKEN_RECEIVED: 'stream_token_received',
    STREAM_REASONING_DONE: 'stream_reasoning_done',
    FILE_ATTACHMENT_DELETED: 'file_attachment_deleted',
    WORLDINFO_FORCE_ACTIVATE: 'worldinfo_force_activate',
    OPEN_CHARACTER_LIBRARY: 'open_character_library',
    ONLINE_STATUS_CHANGED: 'online_status_changed',
    IMAGE_SWIPED: 'image_swiped',
    CONNECTION_PROFILE_LOADED: 'connection_profile_loaded',
    CONNECTION_PROFILE_CREATED: 'connection_profile_created',
    CONNECTION_PROFILE_DELETED: 'connection_profile_deleted',
    CONNECTION_PROFILE_UPDATED: 'connection_profile_updated',
    TOOL_CALLS_PERFORMED: 'tool_calls_performed',
    TOOL_CALLS_RENDERED: 'tool_calls_rendered',
    CHARACTER_MANAGEMENT_DROPDOWN: 'charManagementDropdown',
    SECRET_WRITTEN: 'secret_written',
    SECRET_DELETED: 'secret_deleted',
    SECRET_ROTATED: 'secret_rotated',
    SECRET_EDITED: 'secret_edited',
    PRESET_CHANGED: 'preset_changed',
    PRESET_DELETED: 'preset_deleted',
    PRESET_RENAMED: 'preset_renamed',
    PRESET_RENAMED_BEFORE: 'preset_renamed_before',
    MAIN_API_CHANGED: 'main_api_changed',
    WORLDINFO_ENTRIES_LOADED: 'worldinfo_entries_loaded',
    MEDIA_ATTACHMENT_DELETED: 'media_attachment_deleted',
};
```

### Full Shared Libraries Reference

```javascript
export default {
    lodash,
    Fuse,
    DOMPurify,
    hljs,
    localforage,
    Handlebars,
    css,
    Bowser,
    DiffMatchPatch,
    Readability,
    isProbablyReaderable,
    SVGInject,
    showdown,
    moment,
    seedrandom,
    Popper,
    droll,
    morphdom,
    slideToggle,
    chalk,
    yaml,
};
```

### Dependencies Examples (expanded)

```json
{
  "dependencies": [
    "vectors",
    "caption",
    "third-party/Extension-WebLLM",
    "third-party/Extension-Mermaid"
  ]
}
```

### Preset Data Storage

Store extension data that travels with presets (useful for preset-specific configurations):

```javascript
const { getPresetManager, eventSource, eventTypes } = SillyTavern.getContext();

// Write to current preset
async function savePresetData(data) {
  const pm = getPresetManager();
  if (!pm) return false;

  await pm.writePresetExtensionField({
    path: 'my_extension',
    value: data,
  });
  return true;
}

// Read from current preset
function getPresetData() {
  const pm = getPresetManager();
  if (!pm) return null;

  return pm.readPresetExtensionField({ path: 'my_extension' });
}

// Update UI when preset changes
eventSource.on(eventTypes.OAI_PRESET_CHANGED_AFTER, () => {
  const data = getPresetData();
  updateUI(data);
});
```

### Extension Templates

```javascript
const { renderExtensionTemplateAsync } = SillyTavern.getContext();

// Render an HTML template from your extension's folder
// Template file: my-extension/templates/settings.html
const html = await renderExtensionTemplateAsync(
  'third-party/my-extension',  // Extension folder path
  'templates/settings',         // Template path (no .html)
  { name: 'value' },            // Template data (Handlebars context)
  true,                         // Sanitize output (default: true)
  'en'                          // Locale (optional)
);

document.getElementById('my-container').innerHTML = html;
```

**Note:** `renderExtensionTemplate` (sync) is deprecated. Use `renderExtensionTemplateAsync` instead.
