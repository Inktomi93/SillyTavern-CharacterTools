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
    validatePipeline,
    setExportData,
    buildStagePrompt,
    getStageSchema,
} from '../pipeline';
import { runStageGeneration, getStageTokenCount, getApiInfo } from '../generator';
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
} from './components/stage-config';
import { renderResultsPanel, updateResultsPanelState } from './components/results-panel';
import { openSettingsModal } from './settings-modal';
import type { PipelineState, StageName, Character } from '../types';

// ============================================================================
// STATE
// ============================================================================

let popupState: {
  pipeline: PipelineState;
  isGenerating: boolean;
  abortController: AbortController | null;
  activeStageView: StageName;
} | null = null;

let popupElement: HTMLElement | null = null;

let documentClickHandler: ((e: MouseEvent) => void) | null = null;

// ============================================================================
// MAIN ENTRY
// ============================================================================

/**
 * Open the main Character Tools popup
 */
export async function openMainPopup(): Promise<void> {
    const { Popup, POPUP_TYPE, characters } = SillyTavern.getContext();
    const { DOMPurify } = SillyTavern.libs;

    // Initialize state
    popupState = {
        pipeline: createPipelineState(),
        isGenerating: false,
        abortController: null,
        activeStageView: 'score',
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
        // Cleanup on close
        if (popupState?.abortController) {
            popupState.abortController.abort();
        }
        popupState = null;
        popupElement = null;
        removeGlobalListeners();
        debugLog('info', 'Popup closed', null);
    });

    // Wait for DOM
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    popupElement = document.getElementById(`${MODULE_NAME}_popup`);

    // Initialize components
    initComponents(characters as Character[]);
    initKeyboardShortcuts();
    updateAllComponents();

    debugLog('info', 'Popup opened', { characterCount: (characters as Character[]).length });
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
        </div>
        <div id="${MODULE_NAME}_results_container"></div>
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

    // Header buttons
    popupElement.querySelector(`#${MODULE_NAME}_settings_btn`)?.addEventListener('click', () => {
        openSettingsModal(() => {
            // Refresh on settings close
            updateAllComponents();
        });
    });

    popupElement.querySelector(`#${MODULE_NAME}_close_btn`)?.addEventListener('click', () => {
        // Find and close the popup
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

    const { Fuse } = SillyTavern.libs;
    const { lodash } = SillyTavern.libs;

    const container = popupElement.querySelector(`#${MODULE_NAME}_character_select_container`);
    if (!container) return;

    const searchInput = container.querySelector(`#${MODULE_NAME}_char_search`) as HTMLInputElement;
    const dropdown = container.querySelector(`#${MODULE_NAME}_char_dropdown`) as HTMLElement;

    if (!searchInput || !dropdown) return;

    // Build Fuse index
    const charData = characters
        .map((char, index) => ({ char, index }))
        .filter(({ char }) => char?.name);

    const fuse = new Fuse(charData, {
        keys: ['char.name', 'char.description'],
        threshold: 0.4,
        includeScore: true,
        minMatchCharLength: 1,
    });

    let selectedIndex = -1;
    let currentResults: typeof charData = [];

    const handleSearch = () => {
        const query = searchInput.value.trim();

        if (!query) {
            dropdown.classList.add('hidden');
            currentResults = [];
            return;
        }

        const results = fuse.search(query, { limit: 10 });
        currentResults = results.map((r: { item: typeof charData[number] }) => r.item);

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

    // Keyboard navigation
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

    // Click outside to close dropdown
    documentClickHandler = (e: MouseEvent) => {
        if (!searchInput.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
            dropdown.classList.add('hidden');
        }
    };
    document.addEventListener('click', documentClickHandler);

    // Dropdown click
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

    // Event delegation for dynamically created elements
    container.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        // Clear button
        if (target.closest(`#${MODULE_NAME}_char_clear`)) {
            if (!popupState) return;
            popupState.pipeline = setCharacter(popupState.pipeline, null, null);
            updateAllComponents();
            return;
        }

        // Field expansion toggles
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

    // Update field token counts after a short delay (let DOM settle)
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

    // Stage toggle checkboxes
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

    // Stage view buttons
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

        // Run buttons
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

    // Prompt preset select
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

    // Custom prompt textarea
    const { lodash } = SillyTavern.libs;
    container.addEventListener('input', lodash.debounce((e: Event) => {
        const textarea = e.target as HTMLTextAreaElement;

        if (textarea.id === `${MODULE_NAME}_custom_prompt` && popupState) {
            popupState.pipeline = pipelineUpdateStageConfig(popupState.pipeline, popupState.activeStageView, {
                customPrompt: textarea.value,
                promptPresetId: null,
            });
            updateTokenEstimate();
            updateStageConfigUI();  // Already exists in scope, handles everything
        }

        if (textarea.id === `${MODULE_NAME}_custom_schema` && popupState) {
            popupState.pipeline = pipelineUpdateStageConfig(popupState.pipeline, popupState.activeStageView, {
                customSchema: textarea.value,
                schemaPresetId: null,
            });
            updateStageConfigUI();  // Same here
        }
    }, 300));

    // Structured output toggle
    container.addEventListener('change', (e) => {
        const checkbox = e.target as HTMLInputElement;
        if (checkbox.id === `${MODULE_NAME}_use_structured` && popupState) {
            popupState.pipeline = pipelineUpdateStageConfig(popupState.pipeline, popupState.activeStageView, {
                useStructuredOutput: checkbox.checked,
            });
            updateStageConfigUI();
        }
    });

    // Click handlers for buttons
    container.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;

        // Run stage button
        const runBtn = target.closest(`#${MODULE_NAME}_run_stage_btn`);
        if (runBtn && popupState) {
            runSingleStage(popupState.activeStageView);
            return;
        }

        // Save prompt preset button
        const savePromptBtn = target.closest(`#${MODULE_NAME}_save_prompt_preset_btn`);
        if (savePromptBtn && popupState) {
            const promptTextarea = popupElement?.querySelector(`#${MODULE_NAME}_custom_prompt`) as HTMLTextAreaElement;
            if (promptTextarea) {
                const result = await handleSavePromptPreset(popupState.activeStageView, promptTextarea.value);
                if (result.success && result.presetId) {
                    // Select the newly saved preset and clear custom
                    popupState.pipeline = pipelineUpdateStageConfig(popupState.pipeline, popupState.activeStageView, {
                        promptPresetId: result.presetId,
                        customPrompt: '',
                    });
                    updateStageConfigUI();
                }
            }
            return;
        }

        // Save schema preset button
        const saveSchemaBtn = target.closest(`#${MODULE_NAME}_save_schema_preset_btn`);
        if (saveSchemaBtn && popupState) {
            const schemaTextarea = popupElement?.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
            if (schemaTextarea) {
                const result = await handleSaveSchemaPreset(popupState.activeStageView, schemaTextarea.value);
                if (result.success && result.presetId) {
                    // Select the newly saved preset and clear custom
                    popupState.pipeline = pipelineUpdateStageConfig(popupState.pipeline, popupState.activeStageView, {
                        schemaPresetId: result.presetId,
                        customSchema: '',
                    });
                    updateStageConfigUI();
                }
            }
            return;
        }

        // Validate schema button
        const validateBtn = target.closest(`#${MODULE_NAME}_validate_schema_btn`);
        if (validateBtn && popupState) {
            const schemaTextarea = popupElement?.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
            if (schemaTextarea) {
                handleValidateSchema(schemaTextarea.value);
            }
            return;
        }

        // Fix schema button
        const fixBtn = target.closest(`#${MODULE_NAME}_fix_schema_btn`);
        if (fixBtn && popupState) {
            const schemaTextarea = popupElement?.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
            if (schemaTextarea) {
                const fixed = handleFixSchema(schemaTextarea.value);
                if (fixed) {
                    schemaTextarea.value = fixed;
                    // Update state
                    popupState.pipeline = pipelineUpdateStageConfig(popupState.pipeline, popupState.activeStageView, {
                        customSchema: fixed,
                        schemaPresetId: null,
                    });
                    updateStageConfigUI();
                }
            }
            return;
        }

        // Format schema button
        const formatBtn = target.closest(`#${MODULE_NAME}_format_schema_btn`);
        if (formatBtn && popupState) {
            const schemaTextarea = popupElement?.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
            if (schemaTextarea) {
                const formatted = handleFormatSchema(schemaTextarea.value);
                if (formatted) {
                    schemaTextarea.value = formatted;
                    // Update state
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
// GENERATION
// ============================================================================

async function runSingleStage(stage: StageName): Promise<void> {
    if (!popupState || popupState.isGenerating) return;

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

    // Capture the prompt and schema BEFORE generation
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
    if (!popupState || popupState.isGenerating) return;

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
            continue; // Skip already complete/skipped stages
        }

        popupState.activeStageView = stage;
        updateStageSection();

        await runSingleStage(stage);

        // Stop if generation was cancelled or failed
        if (!popupState) break;

        const newStatus = popupState.pipeline.stageStatus[stage];
        if (newStatus !== 'complete') {
            break;
        }
    }
}

async function runAllStages(): Promise<void> {
    if (!popupState) return;

    // Select all stages first
    popupState.pipeline.selectedStages = [...STAGES];
    updatePipelineNav();

    await runSelectedStages();
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
            !!popupState.pipeline.character,
            popupState.isGenerating,
        );
    }
}

function updateStageSection(): void {
    if (!popupElement || !popupState) return;

    // Update header
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
            popupState.isGenerating,
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

async function updateTokenEstimate(): Promise<void> {
    if (!popupElement || !popupState) return;

    const tokenEl = popupElement.querySelector(`#${MODULE_NAME}_token_estimate`);
    if (!tokenEl) return;

    if (!popupState.pipeline.character) {
        tokenEl.innerHTML = '<i class="fa-solid fa-microchip"></i> Select a character';
        tokenEl.className = `${MODULE_NAME}_token_estimate`;
        return;
    }

    // Show loading state
    tokenEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    tokenEl.className = `${MODULE_NAME}_token_estimate`;

    const counts = await getStageTokenCount(popupState.pipeline, popupState.activeStageView);

    // Check we're still on the same state
    if (!popupState || !popupElement) return;

    if (!counts) {
        tokenEl.innerHTML = '<i class="fa-solid fa-microchip"></i> --';
        tokenEl.className = `${MODULE_NAME}_token_estimate`;
        return;
    }

    let colorClass = '';
    if (counts.percentage > 100) colorClass = 'danger';
    else if (counts.percentage > 80) colorClass = 'warning';

    // Simple display: just prompt tokens and percentage
    tokenEl.innerHTML = `<i class="fa-solid fa-microchip"></i> ${counts.promptTokens.toLocaleString()}t (${counts.percentage}%)`;
    tokenEl.className = `${MODULE_NAME}_token_estimate ${colorClass}`;
}

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

let keyboardHandler: ((e: KeyboardEvent) => void) | null = null;

function initKeyboardShortcuts(): void {
    keyboardHandler = (e: KeyboardEvent) => {
        if (!popupState) return;

        // Ctrl+Enter to run current stage
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (!popupState.isGenerating) {
                runSingleStage(popupState.activeStageView);
            }
        }

        // Escape to cancel
        if (e.key === 'Escape' && popupState.isGenerating && popupState.abortController) {
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
