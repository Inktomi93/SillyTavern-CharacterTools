// src/ui/settings-modal.ts
//
// Settings modal popup

import {
    MODULE_NAME,
    BASE_SYSTEM_PROMPT,
    BASE_REFINEMENT_PROMPT,
    VERSION,
} from '../constants';
import {
    getSettings,
    updateSetting,
    updateGenerationConfig,
    updateUserSystemPrompt,
    updateBaseSystemPrompt,
    updateStageSystemPrompt,
    updateUserRefinementPrompt,
    updateBaseRefinementPrompt,
    resetUserSystemPrompt,
    resetBaseSystemPrompt,
    resetUserRefinementPrompt,
    resetBaseRefinementPrompt,
    setDebugMode,
    getPromptPresets,
    getSchemaPresets,
    deletePromptPreset,
    deleteSchemaPreset,
    exportCustomPresets,
    importPresets,
} from '../settings';
import { debugLog, getDebugLogs, clearDebugLogs, formatLogEntry, formatLogData, exportDebugInfo } from '../debug';
import type { GenerationConfig } from '../types';

// ============================================================================
// MAIN ENTRY
// ============================================================================

/**
 * Open the settings modal
 */
export async function openSettingsModal(onClose?: () => void): Promise<void> {
    const { Popup, POPUP_TYPE } = SillyTavern.getContext();
    const { DOMPurify } = SillyTavern.libs;

    const content = buildSettingsContent();

    const popup = new Popup(DOMPurify.sanitize(content), POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        okButton: 'Save & Close',
        cancelButton: false,
    });

    popup.show().then(() => {
        onClose?.();
        debugLog('info', 'Settings modal closed', null);
    });

    // Wait for DOM
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    initSettingsListeners();
    refreshModelSelects();

    debugLog('info', 'Settings modal opened', null);
}

// ============================================================================
// BUILD CONTENT
// ============================================================================

function buildSettingsContent(): string {
    const settings = getSettings();
    const config = settings.generationConfig;
    const { moment } = SillyTavern.libs;

    return `
    <div class="${MODULE_NAME}_settings_modal" id="${MODULE_NAME}_settings_modal">
      <div class="${MODULE_NAME}_settings_header">
        <i class="fa-solid fa-gear"></i>
        <span>Character Tools Settings</span>
      </div>

      <!-- Generation Settings -->
      <div class="${MODULE_NAME}_settings_section">
        <div class="${MODULE_NAME}_settings_section_header">
          <i class="fa-solid fa-microchip"></i>
          <span>Generation</span>
        </div>

        <div class="${MODULE_NAME}_settings_row">
          <label class="${MODULE_NAME}_checkbox_label">
            <input
              type="checkbox"
              id="${MODULE_NAME}_use_current_settings"
              ${settings.useCurrentSettings ? 'checked' : ''}
            >
            <span>Use Current SillyTavern Settings</span>
          </label>
        </div>

        <div id="${MODULE_NAME}_custom_gen_config" class="${settings.useCurrentSettings ? 'hidden' : ''}">
          <div class="${MODULE_NAME}_settings_grid">
            <div class="${MODULE_NAME}_settings_field">
              <label>Source</label>
              <select id="${MODULE_NAME}_gen_source" class="text_pole"></select>
            </div>
            <div class="${MODULE_NAME}_settings_field">
              <label>Model</label>
              <select id="${MODULE_NAME}_gen_model" class="text_pole"></select>
            </div>
          </div>

          <div class="${MODULE_NAME}_settings_grid ${MODULE_NAME}_settings_grid_5">
            <div class="${MODULE_NAME}_settings_field">
              <label>Temp</label>
              <input type="number" id="${MODULE_NAME}_gen_temp" class="text_pole" value="${config.temperature}" min="0" max="2" step="0.1">
            </div>
            <div class="${MODULE_NAME}_settings_field">
              <label>Max Tokens</label>
              <input type="number" id="${MODULE_NAME}_gen_tokens" class="text_pole" value="${config.maxTokens}" min="100" max="32000" step="100">
            </div>
            <div class="${MODULE_NAME}_settings_field">
              <label>Freq Pen</label>
              <input type="number" id="${MODULE_NAME}_gen_freq" class="text_pole" value="${config.frequencyPenalty}" min="-2" max="2" step="0.1">
            </div>
            <div class="${MODULE_NAME}_settings_field">
              <label>Pres Pen</label>
              <input type="number" id="${MODULE_NAME}_gen_pres" class="text_pole" value="${config.presencePenalty}" min="-2" max="2" step="0.1">
            </div>
            <div class="${MODULE_NAME}_settings_field">
              <label>Top P</label>
              <input type="number" id="${MODULE_NAME}_gen_top_p" class="text_pole" value="${config.topP}" min="0" max="1" step="0.05">
            </div>
          </div>
        </div>
      </div>

      <!-- System Prompt -->
      <div class="${MODULE_NAME}_settings_section">
        <div class="${MODULE_NAME}_settings_section_header">
          <i class="fa-solid fa-message"></i>
          <span>System Prompt</span>
        </div>

        <p class="${MODULE_NAME}_settings_hint">
          The system prompt is sent with every generation. Base prompt provides core instructions,
          your additions are appended after.
        </p>

        <!-- User additions (main) -->
        <div class="${MODULE_NAME}_settings_subsection">
          <label class="${MODULE_NAME}_settings_label">Your Additions</label>
          <textarea
            id="${MODULE_NAME}_user_system_prompt"
            class="text_pole ${MODULE_NAME}_system_prompt_textarea"
            rows="4"
            placeholder="Add your custom instructions here..."
          >${escapeHtml(settings.userSystemPrompt || '')}</textarea>
          <div class="${MODULE_NAME}_settings_row_spread">
            <span id="${MODULE_NAME}_user_system_prompt_chars">${(settings.userSystemPrompt || '').length} chars</span>
            <button id="${MODULE_NAME}_clear_user_system_prompt" class="menu_button">
              <i class="fa-solid fa-eraser"></i>
              Clear
            </button>
          </div>
        </div>

        <!-- Base prompt (collapsible advanced) -->
        <details class="${MODULE_NAME}_settings_advanced">
          <summary>
            <i class="fa-solid fa-caret-right"></i>
            Base Prompt (Advanced)
          </summary>
          <div class="${MODULE_NAME}_settings_advanced_content">
            <p class="${MODULE_NAME}_settings_hint ${MODULE_NAME}_settings_warning">
              ⚠️ Editing the base prompt may affect all stages. Reset to restore defaults.
            </p>
            <textarea
              id="${MODULE_NAME}_base_system_prompt"
              class="text_pole ${MODULE_NAME}_system_prompt_textarea"
              rows="6"
            >${escapeHtml(settings.baseSystemPrompt || '')}</textarea>
            <div class="${MODULE_NAME}_settings_row_spread">
              <span id="${MODULE_NAME}_base_system_prompt_chars">${(settings.baseSystemPrompt || '').length} chars</span>
              <button id="${MODULE_NAME}_reset_base_system_prompt" class="menu_button">
                <i class="fa-solid fa-rotate-left"></i>
                Reset
              </button>
            </div>
          </div>
        </details>

      <!-- Refinement Prompt -->
      <div class="${MODULE_NAME}_settings_section">
        <div class="${MODULE_NAME}_settings_section_header">
          <i class="fa-solid fa-arrows-rotate"></i>
          <span>Refinement Prompt</span>
        </div>

        <p class="${MODULE_NAME}_settings_hint">
          Instructions for the refinement loop. Base provides core guidance, your additions are appended.
        </p>

        <!-- User additions -->
        <div class="${MODULE_NAME}_settings_subsection">
          <label class="${MODULE_NAME}_settings_label">Your Additions</label>
          <textarea
            id="${MODULE_NAME}_user_refinement_prompt"
            class="text_pole ${MODULE_NAME}_system_prompt_textarea"
            rows="4"
            placeholder="Add your refinement instructions here..."
          >${escapeHtml(settings.userRefinementPrompt || '')}</textarea>
          <div class="${MODULE_NAME}_settings_row_spread">
            <span id="${MODULE_NAME}_user_refinement_prompt_chars">${(settings.userRefinementPrompt || '').length} chars</span>
            <button id="${MODULE_NAME}_clear_user_refinement_prompt" class="menu_button">
              <i class="fa-solid fa-eraser"></i>
              Clear
            </button>
          </div>
        </div>

        <!-- Base prompt (collapsible) -->
        <details class="${MODULE_NAME}_settings_advanced">
          <summary>
            <i class="fa-solid fa-caret-right"></i>
            Base Prompt (Advanced)
          </summary>
          <div class="${MODULE_NAME}_settings_advanced_content">
            <textarea
              id="${MODULE_NAME}_base_refinement_prompt"
              class="text_pole ${MODULE_NAME}_system_prompt_textarea"
              rows="6"
            >${escapeHtml(settings.baseRefinementPrompt || '')}</textarea>
            <div class="${MODULE_NAME}_settings_row_spread">
              <span id="${MODULE_NAME}_base_refinement_prompt_chars">${(settings.baseRefinementPrompt || '').length} chars</span>
              <button id="${MODULE_NAME}_reset_base_refinement_prompt" class="menu_button">
                <i class="fa-solid fa-rotate-left"></i>
                Reset
              </button>
            </div>
          </div>
        </details>
      </div>

      <!-- Preset Management -->
      <div class="${MODULE_NAME}_settings_section">
        <div class="${MODULE_NAME}_settings_section_header">
          <i class="fa-solid fa-bookmark"></i>
          <span>Presets</span>
        </div>

        <div class="${MODULE_NAME}_presets_grid">
          <div class="${MODULE_NAME}_preset_column">
            <h4>Prompt Presets</h4>
            <div id="${MODULE_NAME}_prompt_presets_list" class="${MODULE_NAME}_preset_list">
              ${renderPresetList('prompt')}
            </div>
          </div>
          <div class="${MODULE_NAME}_preset_column">
            <h4>Schema Presets</h4>
            <div id="${MODULE_NAME}_schema_presets_list" class="${MODULE_NAME}_preset_list">
              ${renderPresetList('schema')}
            </div>
          </div>
        </div>

        <div class="${MODULE_NAME}_settings_row_spread">
          <button id="${MODULE_NAME}_export_presets" class="menu_button">
            <i class="fa-solid fa-file-export"></i>
            Export Custom
          </button>
          <button id="${MODULE_NAME}_import_presets" class="menu_button">
            <i class="fa-solid fa-file-import"></i>
            Import
          </button>
        </div>
      </div>

      <!-- Keyboard Shortcuts -->
      <div class="${MODULE_NAME}_settings_section">
        <div class="${MODULE_NAME}_settings_section_header">
          <i class="fa-solid fa-keyboard"></i>
          <span>Keyboard Shortcuts</span>
        </div>

        <div class="${MODULE_NAME}_shortcuts_list">
          <div class="${MODULE_NAME}_shortcut_item">
            <kbd>Ctrl</kbd> + <kbd>Enter</kbd>
            <span>Run current stage</span>
          </div>
          <div class="${MODULE_NAME}_shortcut_item">
            <kbd>Escape</kbd>
            <span>Cancel generation</span>
          </div>
        </div>
      </div>

      <!-- Debug -->
      <div class="${MODULE_NAME}_settings_section">
        <div class="${MODULE_NAME}_settings_section_header">
          <i class="fa-solid fa-bug"></i>
          <span>Debug</span>
        </div>

        <div class="${MODULE_NAME}_settings_row">
          <label class="${MODULE_NAME}_checkbox_label">
            <input
              type="checkbox"
              id="${MODULE_NAME}_debug_mode"
              ${settings.debugMode ? 'checked' : ''}
            >
            <span>Enable Debug Logging</span>
          </label>
        </div>

        <div class="${MODULE_NAME}_debug_actions">
          <button id="${MODULE_NAME}_view_logs" class="menu_button">
            <i class="fa-solid fa-list"></i>
            View Logs
          </button>
          <button id="${MODULE_NAME}_clear_logs" class="menu_button">
            <i class="fa-solid fa-trash"></i>
            Clear
          </button>
          <button id="${MODULE_NAME}_copy_debug_info" class="menu_button">
            <i class="fa-solid fa-copy"></i>
            Copy Info
          </button>
        </div>

        <div id="${MODULE_NAME}_debug_log_viewer" class="${MODULE_NAME}_debug_log_viewer hidden">
          <div id="${MODULE_NAME}_debug_log_list" class="${MODULE_NAME}_debug_log_list"></div>
          <pre id="${MODULE_NAME}_debug_log_detail" class="${MODULE_NAME}_debug_log_detail">Select a log entry</pre>
        </div>
      </div>

      <!-- Footer -->
      <div class="${MODULE_NAME}_settings_footer">
        <span class="${MODULE_NAME}_settings_version">v${VERSION} • Last updated: ${moment().format('YYYY-MM-DD HH:mm:ss')}</span>
      </div>
    </div>
  `;
}

function renderPresetList(type: 'prompt' | 'schema'): string {
    const presets = type === 'prompt' ? getPromptPresets() : getSchemaPresets();

    if (presets.length === 0) {
        return `<div class="${MODULE_NAME}_preset_empty">No presets</div>`;
    }

    return presets.map(preset => `
    <div class="${MODULE_NAME}_preset_item ${preset.isBuiltin ? 'builtin' : ''}" data-id="${preset.id}">
      <span class="${MODULE_NAME}_preset_name">
        ${preset.isBuiltin ? '<i class="fa-solid fa-lock"></i>' : ''}
        ${escapeHtml(preset.name)}
      </span>
      ${!preset.isBuiltin ? `
        <button class="${MODULE_NAME}_preset_delete" data-type="${type}" data-id="${preset.id}" title="Delete">
          <i class="fa-solid fa-trash"></i>
        </button>
      ` : ''}
    </div>
  `).join('');
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function initSettingsListeners(): void {
    const modal = document.getElementById(`${MODULE_NAME}_settings_modal`);
    if (!modal) return;

    // ========== GENERATION CONFIG ==========

    // Use current settings toggle
    const useCurrentCheckbox = modal.querySelector(`#${MODULE_NAME}_use_current_settings`) as HTMLInputElement;
    const customConfig = modal.querySelector(`#${MODULE_NAME}_custom_gen_config`);

    useCurrentCheckbox?.addEventListener('change', () => {
        updateSetting('useCurrentSettings', useCurrentCheckbox.checked);
        customConfig?.classList.toggle('hidden', useCurrentCheckbox.checked);
    });

    // Generation config inputs
    const genSource = modal.querySelector(`#${MODULE_NAME}_gen_source`) as HTMLSelectElement;
    const genModel = modal.querySelector(`#${MODULE_NAME}_gen_model`) as HTMLSelectElement;
    const genTemp = modal.querySelector(`#${MODULE_NAME}_gen_temp`) as HTMLInputElement;
    const genTokens = modal.querySelector(`#${MODULE_NAME}_gen_tokens`) as HTMLInputElement;
    const genFreq = modal.querySelector(`#${MODULE_NAME}_gen_freq`) as HTMLInputElement;
    const genPres = modal.querySelector(`#${MODULE_NAME}_gen_pres`) as HTMLInputElement;
    const genTopP = modal.querySelector(`#${MODULE_NAME}_gen_top_p`) as HTMLInputElement;

    genSource?.addEventListener('change', () => {
        updateGenerationConfig({ source: genSource.value });
        populateModelSelect(genSource.value);
    });

    genModel?.addEventListener('change', () => {
        updateGenerationConfig({ model: genModel.value });
    });

    const handleNumberInput = (input: HTMLInputElement, key: keyof GenerationConfig, isInt = false) => {
        input?.addEventListener('change', () => {
            const val = isInt ? parseInt(input.value, 10) : parseFloat(input.value);
            if (!isNaN(val)) {
                updateGenerationConfig({ [key]: val });
            }
        });
    };

    handleNumberInput(genTemp, 'temperature');
    handleNumberInput(genTokens, 'maxTokens', true);
    handleNumberInput(genFreq, 'frequencyPenalty');
    handleNumberInput(genPres, 'presencePenalty');
    handleNumberInput(genTopP, 'topP');

    // ========== USER SYSTEM PROMPT ==========

    const userSystemPromptTextarea = modal.querySelector(`#${MODULE_NAME}_user_system_prompt`) as HTMLTextAreaElement;
    const userSystemPromptChars = modal.querySelector(`#${MODULE_NAME}_user_system_prompt_chars`);
    const clearUserSystemPromptBtn = modal.querySelector(`#${MODULE_NAME}_clear_user_system_prompt`);

    userSystemPromptTextarea?.addEventListener('input', () => {
        updateUserSystemPrompt(userSystemPromptTextarea.value);
        if (userSystemPromptChars) {
            userSystemPromptChars.textContent = `${userSystemPromptTextarea.value.length} chars`;
        }
    });

    clearUserSystemPromptBtn?.addEventListener('click', () => {
        resetUserSystemPrompt();
        if (userSystemPromptTextarea) userSystemPromptTextarea.value = '';
        if (userSystemPromptChars) userSystemPromptChars.textContent = '0 chars';
        toastr.info('User system prompt cleared');
    });

    // ========== BASE SYSTEM PROMPT ==========

    const baseSystemPromptTextarea = modal.querySelector(`#${MODULE_NAME}_base_system_prompt`) as HTMLTextAreaElement;
    const baseSystemPromptChars = modal.querySelector(`#${MODULE_NAME}_base_system_prompt_chars`);
    const resetBaseSystemPromptBtn = modal.querySelector(`#${MODULE_NAME}_reset_base_system_prompt`);

    baseSystemPromptTextarea?.addEventListener('input', () => {
        updateBaseSystemPrompt(baseSystemPromptTextarea.value);
        if (baseSystemPromptChars) {
            baseSystemPromptChars.textContent = `${baseSystemPromptTextarea.value.length} chars`;
        }
    });

    resetBaseSystemPromptBtn?.addEventListener('click', () => {
        resetBaseSystemPrompt();
        if (baseSystemPromptTextarea) baseSystemPromptTextarea.value = BASE_SYSTEM_PROMPT;
        if (baseSystemPromptChars) baseSystemPromptChars.textContent = `${BASE_SYSTEM_PROMPT.length} chars`;
        toastr.info('Base system prompt reset to default');
    });

    // ========== STAGE SYSTEM PROMPTS ==========

    for (const stage of ['score', 'rewrite', 'analyze'] as const) {
        const textarea = modal.querySelector(`#${MODULE_NAME}_stage_system_prompt_${stage}`) as HTMLTextAreaElement;
        textarea?.addEventListener('input', () => {
            updateStageSystemPrompt(stage, textarea.value);
        });
    }

    // ========== USER REFINEMENT PROMPT ==========

    const userRefinementPromptTextarea = modal.querySelector(`#${MODULE_NAME}_user_refinement_prompt`) as HTMLTextAreaElement;
    const userRefinementPromptChars = modal.querySelector(`#${MODULE_NAME}_user_refinement_prompt_chars`);
    const clearUserRefinementPromptBtn = modal.querySelector(`#${MODULE_NAME}_clear_user_refinement_prompt`);

    userRefinementPromptTextarea?.addEventListener('input', () => {
        updateUserRefinementPrompt(userRefinementPromptTextarea.value);
        if (userRefinementPromptChars) {
            userRefinementPromptChars.textContent = `${userRefinementPromptTextarea.value.length} chars`;
        }
    });

    clearUserRefinementPromptBtn?.addEventListener('click', () => {
        resetUserRefinementPrompt();
        if (userRefinementPromptTextarea) userRefinementPromptTextarea.value = '';
        if (userRefinementPromptChars) userRefinementPromptChars.textContent = '0 chars';
        toastr.info('User refinement prompt cleared');
    });

    // ========== BASE REFINEMENT PROMPT ==========

    const baseRefinementPromptTextarea = modal.querySelector(`#${MODULE_NAME}_base_refinement_prompt`) as HTMLTextAreaElement;
    const baseRefinementPromptChars = modal.querySelector(`#${MODULE_NAME}_base_refinement_prompt_chars`);
    const resetBaseRefinementPromptBtn = modal.querySelector(`#${MODULE_NAME}_reset_base_refinement_prompt`);

    baseRefinementPromptTextarea?.addEventListener('input', () => {
        updateBaseRefinementPrompt(baseRefinementPromptTextarea.value);
        if (baseRefinementPromptChars) {
            baseRefinementPromptChars.textContent = `${baseRefinementPromptTextarea.value.length} chars`;
        }
    });

    resetBaseRefinementPromptBtn?.addEventListener('click', () => {
        resetBaseRefinementPrompt();
        if (baseRefinementPromptTextarea) baseRefinementPromptTextarea.value = BASE_REFINEMENT_PROMPT;
        if (baseRefinementPromptChars) baseRefinementPromptChars.textContent = `${BASE_REFINEMENT_PROMPT.length} chars`;
        toastr.info('Base refinement prompt reset to default');
    });

    // ========== PRESET MANAGEMENT ==========

    modal.addEventListener('click', (e) => {
        const deleteBtn = (e.target as HTMLElement).closest(`.${MODULE_NAME}_preset_delete`);
        if (deleteBtn) {
            const type = deleteBtn.getAttribute('data-type') as 'prompt' | 'schema';
            const id = deleteBtn.getAttribute('data-id');
            if (type && id) {
                handleDeletePreset(type, id);
            }
        }
    });

    const exportPresetsBtn = modal.querySelector(`#${MODULE_NAME}_export_presets`);
    const importPresetsBtn = modal.querySelector(`#${MODULE_NAME}_import_presets`);

    exportPresetsBtn?.addEventListener('click', () => {
        const json = exportCustomPresets();
        navigator.clipboard.writeText(json);
        toastr.success('Custom presets copied to clipboard');
    });

    importPresetsBtn?.addEventListener('click', async () => {
        try {
            const json = await navigator.clipboard.readText();
            const result = importPresets(json);

            if (result.errors.length > 0) {
                toastr.error(result.errors.join('\n'));
            } else {
                toastr.success(`Imported ${result.prompts} prompts, ${result.schemas} schemas`);
                refreshPresetLists();
            }
        } catch {
            toastr.error('Failed to read clipboard');
        }
    });

    // ========== DEBUG ==========

    const debugModeCheckbox = modal.querySelector(`#${MODULE_NAME}_debug_mode`) as HTMLInputElement;
    const viewLogsBtn = modal.querySelector(`#${MODULE_NAME}_view_logs`);
    const clearLogsBtn = modal.querySelector(`#${MODULE_NAME}_clear_logs`);
    const copyDebugBtn = modal.querySelector(`#${MODULE_NAME}_copy_debug_info`);
    const logViewer = modal.querySelector(`#${MODULE_NAME}_debug_log_viewer`);

    debugModeCheckbox?.addEventListener('change', () => {
        setDebugMode(debugModeCheckbox.checked);
        toastr.info(`Debug mode ${debugModeCheckbox.checked ? 'enabled' : 'disabled'}`);
    });

    viewLogsBtn?.addEventListener('click', () => {
        logViewer?.classList.toggle('hidden');
        if (!logViewer?.classList.contains('hidden')) {
            refreshDebugLogs();
        }
    });

    clearLogsBtn?.addEventListener('click', () => {
        clearDebugLogs();
        refreshDebugLogs();
        toastr.info('Debug logs cleared');
    });

    copyDebugBtn?.addEventListener('click', () => {
        navigator.clipboard.writeText(exportDebugInfo());
        toastr.success('Debug info copied to clipboard');
    });
}

function handleDeletePreset(type: 'prompt' | 'schema', id: string): void {
    const deletedId = type === 'prompt' ? deletePromptPreset(id) : deleteSchemaPreset(id);

    if (deletedId) {
        toastr.success('Preset deleted');
        refreshPresetLists();
    } else {
        toastr.error('Cannot delete builtin preset');
    }
}

function refreshPresetLists(): void {
    const modal = document.getElementById(`${MODULE_NAME}_settings_modal`);
    if (!modal) return;

    const promptList = modal.querySelector(`#${MODULE_NAME}_prompt_presets_list`);
    const schemaList = modal.querySelector(`#${MODULE_NAME}_schema_presets_list`);

    if (promptList) {
        promptList.innerHTML = renderPresetList('prompt');
    }
    if (schemaList) {
        schemaList.innerHTML = renderPresetList('schema');
    }
}

function refreshDebugLogs(): void {
    const modal = document.getElementById(`${MODULE_NAME}_settings_modal`);
    if (!modal) return;

    const logList = modal.querySelector(`#${MODULE_NAME}_debug_log_list`);
    const logDetail = modal.querySelector(`#${MODULE_NAME}_debug_log_detail`);

    if (!logList || !logDetail) return;

    const logs = getDebugLogs();

    logList.innerHTML = logs.length
        ? logs.map((entry, i) => `
        <div class="${MODULE_NAME}_debug_log_entry" data-index="${i}">
          ${formatLogEntry(entry)}
        </div>
      `).join('')
        : `<div class="${MODULE_NAME}_debug_log_empty">No logs</div>`;

    // Click handler for log entries
    logList.querySelectorAll(`.${MODULE_NAME}_debug_log_entry`).forEach(el => {
        el.addEventListener('click', () => {
            const index = parseInt((el as HTMLElement).dataset.index || '0', 10);
            const entry = logs[index];
            if (entry && logDetail) {
                logDetail.textContent = formatLogData(entry.data);
            }
        });
    });
}

// ============================================================================
// MODEL SELECTS
// ============================================================================

function refreshModelSelects(): void {
    const settings = getSettings();
    populateSourceSelect(settings.generationConfig.source);
    populateModelSelect(settings.generationConfig.source, settings.generationConfig.model);
}

function populateSourceSelect(currentSource: string): void {
    const modal = document.getElementById(`${MODULE_NAME}_settings_modal`);
    const sourceSelect = modal?.querySelector(`#${MODULE_NAME}_gen_source`) as HTMLSelectElement;
    if (!sourceSelect) return;

    sourceSelect.innerHTML = '';

    const stSourceSelect = document.getElementById('chat_completion_source') as HTMLSelectElement;

    if (stSourceSelect) {
        Array.from(stSourceSelect.options).forEach((opt: HTMLOptionElement) => {
            if (opt.value) {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.textContent || opt.value;
                sourceSelect.appendChild(option);
            }
        });
    }

    if (sourceSelect.options.length === 0) {
        ['openrouter', 'openai', 'claude', 'makersuite', 'mistralai', 'groq'].forEach(src => {
            const option = document.createElement('option');
            option.value = src;
            option.textContent = src;
            sourceSelect.appendChild(option);
        });
    }

    sourceSelect.value = currentSource;
}

function populateModelSelect(source: string, currentModel?: string): void {
    const modal = document.getElementById(`${MODULE_NAME}_settings_modal`);
    const modelSelect = modal?.querySelector(`#${MODULE_NAME}_gen_model`) as HTMLSelectElement;
    if (!modelSelect) return;

    modelSelect.innerHTML = '';

    const selectIdMap: Record<string, string> = {
        openrouter: 'model_openrouter_select',
        openai: 'model_openai_select',
        claude: 'model_claude_select',
        makersuite: 'model_google_select',
        google: 'model_google_select',
        mistralai: 'model_mistralai_select',
        cohere: 'model_cohere_select',
        perplexity: 'model_perplexity_select',
        groq: 'model_groq_select',
        ai21: 'model_ai21_select',
        deepseek: 'model_deepseek_select',
        custom: 'model_custom_select',
    };

    const stSelect = selectIdMap[source] ? document.getElementById(selectIdMap[source]) as HTMLSelectElement : null;

    if (stSelect?.options.length) {
        Array.from(stSelect.options).forEach((opt: HTMLOptionElement) => {
            if (opt.value) {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.textContent || opt.value;
                modelSelect.appendChild(option);
            }
        });
    } else {
        const option = document.createElement('option');
        option.value = currentModel || '';
        option.textContent = currentModel || `No models for ${source}`;
        modelSelect.appendChild(option);
    }

    if (currentModel && Array.from(modelSelect.options).some(o => o.value === currentModel)) {
        modelSelect.value = currentModel;
    } else if (modelSelect.options.length) {
        modelSelect.value = modelSelect.options[0].value;
        updateGenerationConfig({ model: modelSelect.options[0].value });
    }
}

// ============================================================================
// UTILITIES
// ============================================================================

function escapeHtml(value: unknown): string {
    const { DOMPurify } = SillyTavern.libs;
    const str = typeof value === 'string' ? value : String(value ?? '');
    return DOMPurify.sanitize(str, { ALLOWED_TAGS: [] });
}
