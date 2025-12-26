// src/ui/popup.ts
//
// Main popup controller - orchestrates all components and manages state.

import { MODULE_NAME, STAGES, STAGE_LABELS, STAGE_ICONS } from '../constants';
import { debugLog } from '../debug';
import {
    createPipelineState,
    resetPipeline,
    setCharacter,
    toggleStage,
    updateStageConfig as pipelineUpdateStageConfig,
    startStage,
    completeStage,
    failStage,
    lockStageResult,
    unlockStageResult,
    clearStageResult,
    getNextStage,
    canRunStage,
    canRefine,
    validatePipeline,
    validateRefinement,
    setExportData,
    buildStagePrompt,
    getStageSchema,
    startRefinement,
    completeRefinement,
    acceptRewrite,
    revertToIteration,
} from '../pipeline';
import { runStageGeneration, runRefinementGeneration, getStageTokenCount, getRefinementTokenCount, getApiInfo, isApiReady } from '../generator';
import { renderCharacterSelect, updateCharacterSelectState, renderDropdownItems, updateFieldTokenCounts } from './components/character-select';
import { getPopulatedFields } from '../character';
import { renderPipelineNav, updatePipelineNavState } from './components/pipeline-nav';
import {
    renderStageConfig,
    updateStageConfigState,
    handleSavePromptPreset,
    handleSaveSchemaPreset,
    handleValidateSchema,
    handleFixSchema,
    handleFormatSchema,
    handleGenerateSchema,
} from './components/stage-config';
import { renderResultsPanel, updateResultsPanelState, renderRefinementLoading } from './components/results-panel';
import { renderIterationHistory, updateIterationHistoryState, renderIterationViewContent } from './components/iteration-history';
import { openSettingsModal } from './settings-modal';
import type { PipelineState, StageName, Character, IterationSnapshot } from '../types';

// ============================================================================
// STATE
// ============================================================================

let popupState: {
    pipeline: PipelineState;
    isGenerating: boolean;
    isRefining: boolean;
    abortController: AbortController | null;
    activeStageView: StageName;
    characters: Character[];
} | null = null;

let popupElement: HTMLElement | null = null;

// ============================================================================
// EVENT MANAGEMENT
// ============================================================================

const eventCleanup: Array<() => void> = [];

function subscribeEvents(): void {
    const { eventSource, eventTypes } = SillyTavern.getContext();

    const handlers = {
        onStatusChange: () => {
            debugLog('info', 'API status changed', { isReady: isApiReady() });
            updateApiStatus();
        },

        onCharEdited: () => {
            debugLog('info', 'Character edited externally', null);
            refreshSelectedCharacter();
        },

        onCharDeleted: (data: { id: number; character: Character }) => {
            debugLog('info', 'Character deleted', { id: data.id });
            handleCharacterDeleted(data.id);
        },

        onPresetChanged: () => {
            debugLog('info', 'OAI preset changed', null);
            if (popupState) {
                updateTokenEstimate();
            }
        },

        onSourceChanged: () => {
            debugLog('info', 'Chat completion source changed', null);
            updateApiStatus();
            updateTokenEstimate();
        },

        onModelChanged: () => {
            debugLog('info', 'Chat completion model changed', null);
            updateApiStatus();
            updateTokenEstimate();
        },
    };

    eventSource.on(eventTypes.ONLINE_STATUS_CHANGED, handlers.onStatusChange);
    eventSource.on(eventTypes.CHARACTER_EDITED, handlers.onCharEdited);
    eventSource.on(eventTypes.CHARACTER_DELETED, handlers.onCharDeleted);
    eventSource.on(eventTypes.OAI_PRESET_CHANGED_AFTER, handlers.onPresetChanged);
    eventSource.on(eventTypes.CHATCOMPLETION_SOURCE_CHANGED, handlers.onSourceChanged);
    eventSource.on(eventTypes.CHATCOMPLETION_MODEL_CHANGED, handlers.onModelChanged);

    eventCleanup.push(
        () => eventSource.removeListener(eventTypes.ONLINE_STATUS_CHANGED, handlers.onStatusChange),
        () => eventSource.removeListener(eventTypes.CHARACTER_EDITED, handlers.onCharEdited),
        () => eventSource.removeListener(eventTypes.CHARACTER_DELETED, handlers.onCharDeleted),
        () => eventSource.removeListener(eventTypes.OAI_PRESET_CHANGED_AFTER, handlers.onPresetChanged),
        () => eventSource.removeListener(eventTypes.CHATCOMPLETION_SOURCE_CHANGED, handlers.onSourceChanged),
        () => eventSource.removeListener(eventTypes.CHATCOMPLETION_MODEL_CHANGED, handlers.onModelChanged),
    );

    debugLog('info', 'Event listeners subscribed', { count: eventCleanup.length });
}

function unsubscribeEvents(): void {
    eventCleanup.forEach(fn => fn());
    eventCleanup.length = 0;
    debugLog('info', 'Event listeners unsubscribed', null);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function updateApiStatus(): void {
    if (!popupElement) return;

    const apiInfo = getApiInfo();
    const statusEl = popupElement.querySelector(`.${MODULE_NAME}_api_status`);

    if (statusEl) {
        statusEl.className = `${MODULE_NAME}_api_status ${apiInfo.isReady ? 'connected' : 'disconnected'}`;
        const textSpan = statusEl.querySelector('span');
        if (textSpan) {
            textSpan.textContent = apiInfo.source;
        }
    }

    updatePipelineNav();
}

function refreshSelectedCharacter(): void {
    if (!popupState || popupState.pipeline.characterIndex === null) return;

    const { characters } = SillyTavern.getContext();
    const charList = characters as Character[];
    const index = popupState.pipeline.characterIndex;

    popupState.characters = charList;

    if (index >= 0 && index < charList.length) {
        const updatedChar = charList[index];

        if (updatedChar.name === popupState.pipeline.character?.name) {
            popupState.pipeline = {
                ...popupState.pipeline,
                character: updatedChar,
            };
            updateCharacterSelect();
            updateTokenEstimate();
            debugLog('info', 'Character refreshed', { name: updatedChar.name });
        } else {
            handleCharacterInvalidated();
        }
    } else {
        handleCharacterInvalidated();
    }
}

function handleCharacterDeleted(deletedId: number): void {
    if (!popupState) return;

    const currentIndex = popupState.pipeline.characterIndex;

    if (currentIndex === null) return;

    if (currentIndex === deletedId) {
        handleCharacterInvalidated();
        toastr.warning('Selected character was deleted');
    } else if (currentIndex > deletedId) {
        const newIndex = currentIndex - 1;
        const { characters } = SillyTavern.getContext();
        const charList = characters as Character[];

        if (newIndex >= 0 && newIndex < charList.length) {
            popupState.pipeline = {
                ...popupState.pipeline,
                characterIndex: newIndex,
                character: charList[newIndex],
            };
            popupState.characters = charList;
            debugLog('info', 'Character index adjusted after deletion', { oldIndex: currentIndex, newIndex });
        } else {
            handleCharacterInvalidated();
        }
    }
}

function handleCharacterInvalidated(): void {
    if (!popupState) return;

    debugLog('info', 'Character invalidated, clearing selection', null);

    popupState.pipeline = setCharacter(popupState.pipeline, null, null);
    updateAllComponents();
    toastr.info('Character selection cleared');
}

// ============================================================================
// GLOBAL LISTENERS
// ============================================================================

let documentClickHandler: ((e: MouseEvent) => void) | null = null;
let keyboardHandler: ((e: KeyboardEvent) => void) | null = null;

function initGlobalListeners(): void {
    keyboardHandler = (e: KeyboardEvent) => {
        if (!popupState) return;

        // Ctrl+Enter to run current stage
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (!popupState.isGenerating && !popupState.isRefining) {
                runSingleStage(popupState.activeStageView);
            }
        }

        // Escape to cancel generation
        if (e.key === 'Escape' && (popupState.isGenerating || popupState.isRefining) && popupState.abortController) {
            popupState.abortController.abort();
        }
    };

    document.addEventListener('keydown', keyboardHandler);
}

function removeGlobalListeners(): void {
    if (keyboardHandler) {
        document.removeEventListener('keydown', keyboardHandler);
        keyboardHandler = null;
    }
    if (documentClickHandler) {
        document.removeEventListener('click', documentClickHandler);
        documentClickHandler = null;
    }
}

// ============================================================================
// MAIN ENTRY
// ============================================================================

export async function openMainPopup(): Promise<void> {
    const { Popup, POPUP_TYPE, characters } = SillyTavern.getContext();
    const { DOMPurify } = SillyTavern.libs;

    const charList = characters as Character[];

    popupState = {
        pipeline: createPipelineState(),
        isGenerating: false,
        isRefining: false,
        abortController: null,
        activeStageView: 'score',
        characters: charList,
    };

    const content = buildPopupContent();

    const popup = new Popup(DOMPurify.sanitize(content), POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        okButton: false,
        cancelButton: false,
    });

    popup.show().then(() => {
        if (popupState?.abortController) {
            popupState.abortController.abort();
        }
        popupState = null;
        popupElement = null;
        unsubscribeEvents();
        removeGlobalListeners();
        debugLog('info', 'Popup closed', null);
    });

    await new Promise<void>(resolve => setTimeout(resolve, 0));

    popupElement = document.getElementById(`${MODULE_NAME}_popup`);

    subscribeEvents();
    initGlobalListeners();
    initComponents(charList);
    updateAllComponents();

    debugLog('info', 'Popup opened', { characterCount: charList.length });
}

// ============================================================================
// POPUP HTML
// ============================================================================

function buildPopupContent(): string {
    const apiInfo = getApiInfo();

    return `
    <div class="${MODULE_NAME}_popup" id="${MODULE_NAME}_popup">
      <!-- Header -->
      <div class="${MODULE_NAME}_popup_header">
        <div class="${MODULE_NAME}_popup_title">
          <i class="fa-solid fa-wand-magic-sparkles"></i>
          <span>Character Tools</span>
        </div>
        <div class="${MODULE_NAME}_popup_header_right">
          <div class="${MODULE_NAME}_api_status ${apiInfo.isReady ? 'connected' : 'disconnected'}">
            <i class="fa-solid fa-circle"></i>
            <span>${apiInfo.source}</span>
          </div>
          <button id="${MODULE_NAME}_settings_btn" class="${MODULE_NAME}_icon_btn" title="Settings">
            <i class="fa-solid fa-gear"></i>
          </button>
          <button id="${MODULE_NAME}_close_btn" class="${MODULE_NAME}_icon_btn" title="Close">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <!-- Character Section -->
      <div class="${MODULE_NAME}_section" id="${MODULE_NAME}_character_section">
        <div class="${MODULE_NAME}_section_header">
          <i class="fa-solid fa-user"></i>
          <span>Character</span>
        </div>
        <div id="${MODULE_NAME}_character_select_container"></div>
      </div>

      <!-- Pipeline Section -->
      <div class="${MODULE_NAME}_section" id="${MODULE_NAME}_pipeline_section">
        <div class="${MODULE_NAME}_section_header">
          <i class="fa-solid fa-diagram-project"></i>
          <span>Pipeline</span>
        </div>
        <div id="${MODULE_NAME}_pipeline_nav_container"></div>
      </div>

      <!-- Stage Config Section -->
      <div class="${MODULE_NAME}_section" id="${MODULE_NAME}_stage_section">
        <div class="${MODULE_NAME}_section_header">
          <i class="fa-solid ${STAGE_ICONS.score}" id="${MODULE_NAME}_stage_icon"></i>
          <span id="${MODULE_NAME}_stage_title">Score</span>
        </div>
        <div id="${MODULE_NAME}_stage_config_container"></div>
      </div>

      <!-- Results Section -->
      <div class="${MODULE_NAME}_section ${MODULE_NAME}_section_grow" id="${MODULE_NAME}_results_section">
        <div class="${MODULE_NAME}_section_header">
          <i class="fa-solid fa-file-lines"></i>
          <span>Results</span>
          <span id="${MODULE_NAME}_iteration_indicator" class="${MODULE_NAME}_iteration_indicator hidden"></span>
        </div>
        <div id="${MODULE_NAME}_results_container"></div>
        <div id="${MODULE_NAME}_iteration_history_container"></div>
      </div>
    </div>
  `;
}

// ============================================================================
// COMPONENT INITIALIZATION
// ============================================================================

function initComponents(characters: Character[]): void {
    if (!popupState || !popupElement) return;

    // Character select
    const charContainer = popupElement.querySelector(`#${MODULE_NAME}_character_select_container`);
    if (charContainer) {
        charContainer.innerHTML = renderCharacterSelect(characters, popupState.pipeline.characterIndex);
        initCharacterSelectListeners(characters);
    }

    // Pipeline nav
    const pipelineContainer = popupElement.querySelector(`#${MODULE_NAME}_pipeline_nav_container`);
    if (pipelineContainer) {
        pipelineContainer.innerHTML = renderPipelineNav(
            popupState.pipeline.selectedStages,
            popupState.pipeline.stageStatus,
            popupState.activeStageView,
            !!popupState.pipeline.character,
        );
        initPipelineNavListeners();
    }

    // Stage config
    const stageContainer = popupElement.querySelector(`#${MODULE_NAME}_stage_config_container`);
    if (stageContainer) {
        stageContainer.innerHTML = renderStageConfig(
            popupState.activeStageView,
            popupState.pipeline.configs[popupState.activeStageView],
            null,
        );
        initStageConfigListeners();
    }

    // Results panel
    const resultsContainer = popupElement.querySelector(`#${MODULE_NAME}_results_container`);
    if (resultsContainer) {
        resultsContainer.innerHTML = renderResultsPanel(
            popupState.activeStageView,
            popupState.pipeline.results[popupState.activeStageView],
            popupState.pipeline.stageStatus[popupState.activeStageView],
            popupState.isGenerating,
        );
        initResultsPanelListeners();
    }

    // Iteration history
    const historyContainer = popupElement.querySelector(`#${MODULE_NAME}_iteration_history_container`);
    if (historyContainer) {
        historyContainer.innerHTML = renderIterationHistory(
            popupState.pipeline.iterationHistory,
            popupState.pipeline.iterationCount,
            handleRevertToIteration,
        );
        initIterationHistoryListeners();
    }

    // Header buttons
    popupElement.querySelector(`#${MODULE_NAME}_settings_btn`)?.addEventListener('click', () => {
        openSettingsModal(() => {
            updateAllComponents();
        });
    });

    popupElement.querySelector(`#${MODULE_NAME}_close_btn`)?.addEventListener('click', () => {
        const dialog = popupElement?.closest('.popup');
        if (dialog) {
            const cancelBtn = dialog.querySelector('.popup-button-cancel, .popup-button-ok') as HTMLElement;
            cancelBtn?.click();
        }
    });
}

// ============================================================================
// CHARACTER SELECT LISTENERS
// ============================================================================

function initCharacterSelectListeners(characters: Character[]): void {
    if (!popupElement) return;

    const { Fuse, lodash } = SillyTavern.libs;

    const container = popupElement.querySelector(`#${MODULE_NAME}_character_select_container`);
    if (!container) return;

    const searchInput = container.querySelector(`#${MODULE_NAME}_char_search`) as HTMLInputElement;
    const dropdown = container.querySelector(`#${MODULE_NAME}_char_dropdown`) as HTMLElement;

    if (!searchInput || !dropdown) return;

    let selectedIndex = -1;
    let currentResults: Array<{ char: Character; index: number }> = [];

    const handleSearch = () => {
        const currentChars = popupState?.characters || characters;
        const currentCharData = currentChars
            .map((char, index) => ({ char, index }))
            .filter(({ char }) => char?.name);

        const fuse = new Fuse(currentCharData, {
            keys: ['char.name', 'char.description'],
            threshold: 0.4,
            includeScore: true,
            minMatchCharLength: 1,
        });

        const query = searchInput.value.trim();

        if (!query) {
            dropdown.classList.add('hidden');
            currentResults = [];
            return;
        }

        const results = fuse.search(query, { limit: 10 });
        currentResults = results.map((r: { item: { char: Character; index: number } }) => r.item);

        if (currentResults.length === 0) {
            dropdown.innerHTML = `<div class="${MODULE_NAME}_dropdown_empty">No characters found</div>`;
            dropdown.classList.remove('hidden');
            return;
        }

        selectedIndex = -1;
        renderDropdownItems(currentResults, dropdown, -1);
        dropdown.classList.remove('hidden');
    };

    const debouncedSearch = lodash.debounce(handleSearch, 150);
    searchInput.addEventListener('input', debouncedSearch);

    searchInput.addEventListener('keydown', (e) => {
        if (currentResults.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
            renderDropdownItems(currentResults, dropdown, selectedIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            renderDropdownItems(currentResults, dropdown, selectedIndex);
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            selectCharacter(currentResults[selectedIndex].char, currentResults[selectedIndex].index);
            dropdown.classList.add('hidden');
            searchInput.value = '';
        } else if (e.key === 'Escape') {
            dropdown.classList.add('hidden');
            searchInput.value = '';
        }
    });

    documentClickHandler = (e: MouseEvent) => {
        if (!searchInput.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
            dropdown.classList.add('hidden');
        }
    };
    document.addEventListener('click', documentClickHandler);

    dropdown.addEventListener('click', (e) => {
        const item = (e.target as HTMLElement).closest(`.${MODULE_NAME}_dropdown_item`);
        if (item) {
            const index = parseInt(item.getAttribute('data-index') || '-1', 10);
            const charItem = currentResults.find(c => c.index === index);
            if (charItem) {
                selectCharacter(charItem.char, charItem.index);
                dropdown.classList.add('hidden');
                searchInput.value = '';
            }
        }
    });

    container.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        if (target.closest(`#${MODULE_NAME}_char_clear`)) {
            if (!popupState) return;
            popupState.pipeline = setCharacter(popupState.pipeline, null, null);
            updateAllComponents();
            return;
        }

        const toggle = target.closest(`.${MODULE_NAME}_field_toggle`);
        if (toggle) {
            const fieldKey = toggle.getAttribute('data-field');
            const content = container.querySelector(`#${MODULE_NAME}_field_content_${fieldKey}`);
            const icon = toggle.querySelector('i');

            if (content && icon) {
                content.classList.toggle('hidden');
                icon.classList.toggle('fa-chevron-right');
                icon.classList.toggle('fa-chevron-down');
            }
        }
    });
}

function selectCharacter(char: Character, index: number): void {
    if (!popupState) return;

    popupState.pipeline = setCharacter(popupState.pipeline, char, index);
    updateAllComponents();

    setTimeout(async () => {
        if (!popupElement || !popupState?.pipeline.character) return;

        const container = popupElement.querySelector(`#${MODULE_NAME}_character_select_container`);
        if (container) {
            const fields = getPopulatedFields(popupState.pipeline.character);
            await updateFieldTokenCounts(container as HTMLElement, fields);
        }
    }, 50);

    debugLog('info', 'Character selected', { name: char.name, index });
}

// ============================================================================
// PIPELINE NAV LISTENERS
// ============================================================================

function initPipelineNavListeners(): void {
    if (!popupElement || !popupState) return;

    const container = popupElement.querySelector(`#${MODULE_NAME}_pipeline_nav_container`);
    if (!container) return;

    container.addEventListener('change', (e) => {
        const checkbox = e.target as HTMLInputElement;
        if (checkbox.classList.contains(`${MODULE_NAME}_stage_checkbox`)) {
            const stage = checkbox.getAttribute('data-stage') as StageName;
            if (stage && popupState) {
                popupState.pipeline = toggleStage(popupState.pipeline, stage);
                updatePipelineNav();
            }
        }
    });

    container.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest(`.${MODULE_NAME}_stage_btn`);
        if (btn && popupState) {
            const stage = btn.getAttribute('data-stage') as StageName;
            if (stage) {
                popupState.activeStageView = stage;
                updateStageSection();
                updateResultsPanel();
                updateTokenEstimate();
                updatePipelineNav();
            }
        }

        const runBtn = (e.target as HTMLElement).closest(`#${MODULE_NAME}_run_selected_btn`);
        if (runBtn) {
            runSelectedStages();
        }

        const runAllBtn = (e.target as HTMLElement).closest(`#${MODULE_NAME}_run_all_btn`);
        if (runAllBtn) {
            runAllStages();
        }

        const resetBtn = (e.target as HTMLElement).closest(`#${MODULE_NAME}_reset_pipeline_btn`);
        if (resetBtn && popupState) {
            popupState.pipeline = resetPipeline(popupState.pipeline, true);
            updateAllComponents();
        }
    });
}

// ============================================================================
// STAGE CONFIG LISTENERS
// ============================================================================

function initStageConfigListeners(): void {
    if (!popupElement || !popupState) return;

    const container = popupElement.querySelector(`#${MODULE_NAME}_stage_config_container`);
    if (!container) return;

    container.addEventListener('change', (e) => {
        const select = e.target as HTMLSelectElement;

        if (select.id === `${MODULE_NAME}_prompt_preset_select` && popupState) {
            const value = select.value || null;
            popupState.pipeline = pipelineUpdateStageConfig(popupState.pipeline, popupState.activeStageView, {
                promptPresetId: value,
            });
            updateStageConfigUI();
            updateTokenEstimate();
        }

        if (select.id === `${MODULE_NAME}_schema_preset_select` && popupState) {
            const value = select.value || null;
            popupState.pipeline = pipelineUpdateStageConfig(popupState.pipeline, popupState.activeStageView, {
                schemaPresetId: value,
            });
            updateStageConfigUI();
        }
    });

    const { lodash } = SillyTavern.libs;
    container.addEventListener('input', lodash.debounce((e: Event) => {
        const textarea = e.target as HTMLTextAreaElement;

        if (textarea.id === `${MODULE_NAME}_custom_prompt` && popupState) {
            popupState.pipeline = pipelineUpdateStageConfig(popupState.pipeline, popupState.activeStageView, {
                customPrompt: textarea.value,
                promptPresetId: null,
            });
            updateTokenEstimate();
            updateStageConfigUI();
        }

        if (textarea.id === `${MODULE_NAME}_custom_schema` && popupState) {
            popupState.pipeline = pipelineUpdateStageConfig(popupState.pipeline, popupState.activeStageView, {
                customSchema: textarea.value,
                schemaPresetId: null,
            });
            updateStageConfigUI();
        }
    }, 300));

    container.addEventListener('change', (e) => {
        const checkbox = e.target as HTMLInputElement;
        if (checkbox.id === `${MODULE_NAME}_use_structured` && popupState) {
            popupState.pipeline = pipelineUpdateStageConfig(popupState.pipeline, popupState.activeStageView, {
                useStructuredOutput: checkbox.checked,
            });
            updateStageConfigUI();
        }
    });

    container.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;

        const runBtn = target.closest(`#${MODULE_NAME}_run_stage_btn`);
        if (runBtn && popupState) {
            runSingleStage(popupState.activeStageView);
            return;
        }

        const savePromptBtn = target.closest(`#${MODULE_NAME}_save_prompt_preset_btn`);
        if (savePromptBtn && popupState) {
            const promptTextarea = popupElement?.querySelector(`#${MODULE_NAME}_custom_prompt`) as HTMLTextAreaElement;
            if (promptTextarea) {
                const result = await handleSavePromptPreset(popupState.activeStageView, promptTextarea.value);
                if (result.success && result.presetId) {
                    popupState.pipeline = pipelineUpdateStageConfig(popupState.pipeline, popupState.activeStageView, {
                        promptPresetId: result.presetId,
                        customPrompt: '',
                    });
                    updateStageConfigUI();
                }
            }
            return;
        }

        const saveSchemaBtn = target.closest(`#${MODULE_NAME}_save_schema_preset_btn`);
        if (saveSchemaBtn && popupState) {
            const schemaTextarea = popupElement?.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
            if (schemaTextarea) {
                const result = await handleSaveSchemaPreset(popupState.activeStageView, schemaTextarea.value);
                if (result.success && result.presetId) {
                    popupState.pipeline = pipelineUpdateStageConfig(popupState.pipeline, popupState.activeStageView, {
                        schemaPresetId: result.presetId,
                        customSchema: '',
                    });
                    updateStageConfigUI();
                }
            }
            return;
        }

        const generateBtn = target.closest(`#${MODULE_NAME}_generate_schema_btn`);
        if (generateBtn && popupState) {
            const generated = await handleGenerateSchema();
            if (generated) {
                const schemaTextarea = popupElement?.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
                if (schemaTextarea) {
                    schemaTextarea.value = generated;
                    popupState.pipeline = pipelineUpdateStageConfig(popupState.pipeline, popupState.activeStageView, {
                        customSchema: generated,
                        schemaPresetId: null,
                    });
                    updateStageConfigUI();
                }
            }
            return;
        }

        const validateBtn = target.closest(`#${MODULE_NAME}_validate_schema_btn`);
        if (validateBtn && popupState) {
            const schemaTextarea = popupElement?.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
            if (schemaTextarea) {
                handleValidateSchema(schemaTextarea.value);
            }
            return;
        }

        const fixBtn = target.closest(`#${MODULE_NAME}_fix_schema_btn`);
        if (fixBtn && popupState) {
            const schemaTextarea = popupElement?.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
            if (schemaTextarea) {
                const fixed = handleFixSchema(schemaTextarea.value);
                if (fixed) {
                    schemaTextarea.value = fixed;
                    popupState.pipeline = pipelineUpdateStageConfig(popupState.pipeline, popupState.activeStageView, {
                        customSchema: fixed,
                        schemaPresetId: null,
                    });
                    updateStageConfigUI();
                }
            }
            return;
        }

        const formatBtn = target.closest(`#${MODULE_NAME}_format_schema_btn`);
        if (formatBtn && popupState) {
            const schemaTextarea = popupElement?.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
            if (schemaTextarea) {
                const formatted = handleFormatSchema(schemaTextarea.value);
                if (formatted) {
                    schemaTextarea.value = formatted;
                    popupState.pipeline = pipelineUpdateStageConfig(popupState.pipeline, popupState.activeStageView, {
                        customSchema: formatted,
                        schemaPresetId: null,
                    });
                    updateStageConfigUI();
                }
            }
            return;
        }
    });
}

// ============================================================================
// RESULTS PANEL LISTENERS
// ============================================================================

function initResultsPanelListeners(): void {
    if (!popupElement || !popupState) return;

    const container = popupElement.querySelector(`#${MODULE_NAME}_results_container`);
    if (!container) return;

    container.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        // Regenerate
        if (target.closest(`#${MODULE_NAME}_regenerate_btn`) && popupState) {
            popupState.pipeline = clearStageResult(popupState.pipeline, popupState.activeStageView);
            runSingleStage(popupState.activeStageView);
        }

        // Lock/Unlock
        if (target.closest(`#${MODULE_NAME}_lock_btn`) && popupState) {
            popupState.pipeline = lockStageResult(popupState.pipeline, popupState.activeStageView);
            updateResultsPanel();
        }

        if (target.closest(`#${MODULE_NAME}_unlock_btn`) && popupState) {
            popupState.pipeline = unlockStageResult(popupState.pipeline, popupState.activeStageView);
            updateResultsPanel();
        }

        // Continue to next stage
        if (target.closest(`#${MODULE_NAME}_continue_btn`) && popupState) {
            const nextStage = getNextStage(popupState.pipeline, popupState.activeStageView);
            if (nextStage) {
                popupState.activeStageView = nextStage;
                updateStageSection();
                updateResultsPanel();
                updateTokenEstimate();
            }
        }

        // Refine
        if (target.closest(`#${MODULE_NAME}_refine_btn`) && popupState) {
            runRefinement();
        }

        // Accept rewrite
        if (target.closest(`#${MODULE_NAME}_accept_btn`) && popupState) {
            popupState.pipeline = acceptRewrite(popupState.pipeline);
            toastr.success('Rewrite accepted as final');
            updateAllComponents();
        }

        // Copy
        if (target.closest(`#${MODULE_NAME}_copy_btn`) && popupState) {
            const result = popupState.pipeline.results[popupState.activeStageView];
            if (result) {
                navigator.clipboard.writeText(result.response);
                toastr.success('Copied to clipboard');
            }
        }

        // Export
        if (target.closest(`#${MODULE_NAME}_export_btn`) && popupState) {
            popupState.pipeline = setExportData(popupState.pipeline);
            if (popupState.pipeline.exportData) {
                navigator.clipboard.writeText(popupState.pipeline.exportData);
                toastr.success('Export copied to clipboard');
            }
        }

        // Cancel generation
        if (target.closest(`#${MODULE_NAME}_cancel_btn`) && popupState?.abortController) {
            popupState.abortController.abort();
        }
    });
}

// ============================================================================
// ITERATION HISTORY LISTENERS
// ============================================================================

function initIterationHistoryListeners(): void {
    if (!popupElement || !popupState) return;

    const container = popupElement.querySelector(`#${MODULE_NAME}_iteration_history_container`);
    if (!container) return;

    container.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;

        // Revert button
        const revertBtn = target.closest(`.${MODULE_NAME}_iteration_revert_btn`);
        if (revertBtn && popupState) {
            const index = parseInt(revertBtn.getAttribute('data-index') || '-1', 10);
            if (index >= 0) {
                await handleRevertToIteration(index);
            }
        }

        // View button
        const viewBtn = target.closest(`.${MODULE_NAME}_iteration_view_btn`);
        if (viewBtn && popupState) {
            const index = parseInt(viewBtn.getAttribute('data-index') || '-1', 10);
            if (index >= 0 && index < popupState.pipeline.iterationHistory.length) {
                showIterationView(popupState.pipeline.iterationHistory[index]);
            }
        }
    });
}

async function handleRevertToIteration(index: number): Promise<void> {
    if (!popupState) return;

    const { Popup, POPUP_RESULT } = SillyTavern.getContext();

    const confirmed = await Popup.show.confirm(
        'Revert to Previous Iteration?',
        `This will restore the rewrite from iteration #${index + 1} and discard later changes.`,
    );

    if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;

    popupState.pipeline = revertToIteration(popupState.pipeline, index);
    toastr.info(`Reverted to iteration #${index + 1}`);
    updateAllComponents();
}

async function showIterationView(snap: IterationSnapshot): Promise<void> {
    const { Popup, POPUP_TYPE } = SillyTavern.getContext();
    const { DOMPurify } = SillyTavern.libs;

    const content = renderIterationViewContent(snap);

    const popup = new Popup(DOMPurify.sanitize(content), POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        okButton: 'Close',
        cancelButton: false,
    });

    await popup.show();
}

// ============================================================================
// GENERATION
// ============================================================================

async function runSingleStage(stage: StageName): Promise<void> {
    if (!popupState || popupState.isGenerating || popupState.isRefining) return;

    if (!isApiReady()) {
        toastr.error('API is not connected');
        return;
    }

    const canRun = canRunStage(popupState.pipeline, stage);
    if (!canRun.canRun) {
        toastr.warning(canRun.reason || 'Cannot run this stage');
        return;
    }

    if (canRun.reason) {
        toastr.info(canRun.reason);
    }

    popupState.isGenerating = true;
    popupState.abortController = new AbortController();
    popupState.pipeline = startStage(popupState.pipeline, stage);
    updateAllComponents();

    const promptUsed = buildStagePrompt(popupState.pipeline, stage) || '';
    const schemaUsed = getStageSchema(popupState.pipeline, stage);

    try {
        const result = await runStageGeneration(
            popupState.pipeline,
            stage,
            popupState.abortController.signal,
        );

        if (result.success) {
            popupState.pipeline = completeStage(popupState.pipeline, stage, {
                response: result.response,
                isStructured: result.isStructured,
                promptUsed,
                schemaUsed,
            });
            toastr.success(`${STAGE_LABELS[stage]} complete`);
        } else {
            popupState.pipeline = failStage(popupState.pipeline, stage, result.error);
            if (result.error !== 'Generation cancelled') {
                toastr.error(result.error);
            }
        }
    } catch (e) {
        popupState.pipeline = failStage(popupState.pipeline, stage, (e as Error).message);
        toastr.error((e as Error).message);
    } finally {
        popupState.isGenerating = false;
        popupState.abortController = null;
        updateAllComponents();
    }
}

async function runSelectedStages(): Promise<void> {
    if (!popupState || popupState.isGenerating || popupState.isRefining) return;

    if (!isApiReady()) {
        toastr.error('API is not connected');
        return;
    }

    const validation = validatePipeline(popupState.pipeline);
    if (!validation.valid) {
        toastr.error(validation.errors.join('\n'));
        return;
    }

    if (validation.warnings.length > 0) {
        toastr.warning(validation.warnings.join('\n'));
    }

    for (const stage of popupState.pipeline.selectedStages) {
        const status = popupState.pipeline.stageStatus[stage];
        if (status === 'complete' || status === 'skipped') {
            continue;
        }

        popupState.activeStageView = stage;
        updateStageSection();

        await runSingleStage(stage);

        if (!popupState) break;

        const newStatus = popupState.pipeline.stageStatus[stage];
        if (newStatus !== 'complete') {
            break;
        }
    }
}

async function runAllStages(): Promise<void> {
    if (!popupState) return;

    popupState.pipeline.selectedStages = [...STAGES];
    updatePipelineNav();

    await runSelectedStages();
}

async function runRefinement(): Promise<void> {
    if (!popupState || popupState.isGenerating || popupState.isRefining) return;

    if (!isApiReady()) {
        toastr.error('API is not connected');
        return;
    }

    const canRefineResult = canRefine(popupState.pipeline);
    if (!canRefineResult.canRun) {
        toastr.warning(canRefineResult.reason || 'Cannot refine');
        return;
    }

    const validation = validateRefinement(popupState.pipeline);
    if (!validation.valid) {
        toastr.error(validation.errors.join('\n'));
        return;
    }

    if (validation.warnings.length > 0) {
        toastr.warning(validation.warnings.join('\n'));
    }

    // Start refinement - this snapshots current state
    popupState.pipeline = startRefinement(popupState.pipeline);
    popupState.isRefining = true;
    popupState.abortController = new AbortController();

    // Show refinement loading state
    const resultsContainer = popupElement?.querySelector(`#${MODULE_NAME}_results_container`);
    if (resultsContainer) {
        resultsContainer.innerHTML = renderRefinementLoading(popupState.pipeline.iterationCount);
    }

    updateIterationIndicator();
    updateIterationHistory();

    try {
        const result = await runRefinementGeneration(
            popupState.pipeline,
            popupState.abortController.signal,
        );

        if (result.success) {
            popupState.pipeline = completeRefinement(popupState.pipeline, {
                response: result.response,
                isStructured: false,
                promptUsed: '[Refinement prompt]',
                schemaUsed: null,
            });

            toastr.success(`Refinement #${popupState.pipeline.iterationCount} complete`);

            // Switch to analyze view so user can review
            popupState.activeStageView = 'analyze';
        } else {
            if (result.error !== 'Generation cancelled') {
                toastr.error(result.error);
            }
        }
    } catch (e) {
        toastr.error((e as Error).message);
    } finally {
        popupState.isRefining = false;
        popupState.abortController = null;
        updateAllComponents();
    }
}

// ============================================================================
// UPDATE FUNCTIONS
// ============================================================================

function updateAllComponents(): void {
    updateCharacterSelect();
    updatePipelineNav();
    updateStageSection();
    updateResultsPanel();
    updateTokenEstimate();
    updateIterationIndicator();
    updateIterationHistory();
}

function updateCharacterSelect(): void {
    if (!popupElement || !popupState) return;

    const container = popupElement.querySelector(`#${MODULE_NAME}_character_select_container`);
    if (container) {
        updateCharacterSelectState(
            container as HTMLElement,
            popupState.pipeline.character,
            popupState.pipeline.characterIndex,
        );
    }
}

function updatePipelineNav(): void {
    if (!popupElement || !popupState) return;

    const container = popupElement.querySelector(`#${MODULE_NAME}_pipeline_nav_container`);
    if (container) {
        updatePipelineNavState(
            container as HTMLElement,
            popupState.pipeline.selectedStages,
            popupState.pipeline.stageStatus,
            popupState.activeStageView,
            !!popupState.pipeline.character && isApiReady(),
            popupState.isGenerating || popupState.isRefining,
        );
    }
}

function updateStageSection(): void {
    if (!popupElement || !popupState) return;

    const icon = popupElement.querySelector(`#${MODULE_NAME}_stage_icon`);
    const title = popupElement.querySelector(`#${MODULE_NAME}_stage_title`);

    if (icon) {
        icon.className = `fa-solid ${STAGE_ICONS[popupState.activeStageView]}`;
    }
    if (title) {
        title.textContent = STAGE_LABELS[popupState.activeStageView];
    }

    updateStageConfigUI();
}

function updateStageConfigUI(): void {
    if (!popupElement || !popupState) return;

    const container = popupElement.querySelector(`#${MODULE_NAME}_stage_config_container`);
    if (container) {
        updateStageConfigState(
            container as HTMLElement,
            popupState.activeStageView,
            popupState.pipeline.configs[popupState.activeStageView],
            popupState.isGenerating || popupState.isRefining,
        );
    }
}

function updateResultsPanel(): void {
    if (!popupElement || !popupState) return;

    const container = popupElement.querySelector(`#${MODULE_NAME}_results_container`);
    if (container) {
        updateResultsPanelState(
            container as HTMLElement,
            popupState.activeStageView,
            popupState.pipeline.results[popupState.activeStageView],
            popupState.pipeline.stageStatus[popupState.activeStageView],
            popupState.isGenerating,
            getNextStage(popupState.pipeline, popupState.activeStageView),
            popupState.pipeline,
        );
    }
}

function updateIterationIndicator(): void {
    if (!popupElement || !popupState) return;

    const indicator = popupElement.querySelector(`#${MODULE_NAME}_iteration_indicator`);
    if (!indicator) return;

    if (popupState.pipeline.iterationCount > 0 || popupState.pipeline.isRefining) {
        indicator.classList.remove('hidden');
        indicator.innerHTML = `
      <i class="fa-solid fa-arrows-rotate"></i>
      Iteration #${popupState.pipeline.iterationCount + 1}
    `;
    } else {
        indicator.classList.add('hidden');
    }
}

function updateIterationHistory(): void {
    if (!popupElement || !popupState) return;

    const container = popupElement.querySelector(`#${MODULE_NAME}_iteration_history_container`);
    if (container) {
        updateIterationHistoryState(
            container as HTMLElement,
            popupState.pipeline.iterationHistory,
            popupState.pipeline.iterationCount,
        );
    }
}

async function updateTokenEstimate(): Promise<void> {
    if (!popupElement || !popupState) return;

    const tokenEl = popupElement.querySelector(`#${MODULE_NAME}_token_estimate`);
    if (!tokenEl) return;

    if (!popupState.pipeline.character) {
        tokenEl.innerHTML = '<i class="fa-solid fa-microchip"></i> Select a character';
        tokenEl.className = `${MODULE_NAME}_token_estimate`;
        return;
    }

    tokenEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    tokenEl.className = `${MODULE_NAME}_token_estimate`;

    // Use refinement token count if we're in refinement mode
    let counts;
    if (popupState.pipeline.isRefining && popupState.pipeline.results.rewrite && popupState.pipeline.results.analyze) {
        counts = await getRefinementTokenCount(popupState.pipeline);
    } else {
        counts = await getStageTokenCount(popupState.pipeline, popupState.activeStageView);
    }

    if (!popupState || !popupElement) return;

    if (!counts) {
        tokenEl.innerHTML = '<i class="fa-solid fa-microchip"></i> --';
        tokenEl.className = `${MODULE_NAME}_token_estimate`;
        return;
    }

    let colorClass = '';
    if (counts.percentage > 100) colorClass = 'danger';
    else if (counts.percentage > 80) colorClass = 'warning';

    tokenEl.innerHTML = `<i class="fa-solid fa-microchip"></i> ${counts.promptTokens.toLocaleString()}t (${counts.percentage}%)`;
    tokenEl.className = `${MODULE_NAME}_token_estimate ${colorClass}`;
}
