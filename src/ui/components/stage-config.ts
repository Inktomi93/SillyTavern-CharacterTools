// src/ui/components/stage-config.ts
//
// Stage configuration component - prompt/schema selection and editing

import { MODULE_NAME, STAGE_LABELS } from '../../constants';
import { getPromptPresets, getSchemaPresets, getPromptPreset, getSchemaPreset, savePromptPreset, saveSchemaPreset } from '../../settings';
import { validateSchema, autoFixSchema, generateSchemaFromDescription } from '../../schema';
import type { StageName, StageConfig, PromptPreset, SchemaPreset } from '../../types';

// ============================================================================
// RENDER
// ============================================================================

export function renderStageConfig(
    stage: StageName,
    config: StageConfig,
    tokenEstimate: { tokens: number; percentage: number } | null,
): string {
    const promptPresets = getPromptPresets(stage);
    const schemaPresets = getSchemaPresets(stage);

    // Get current prompt content
    let promptContent = config.customPrompt;
    if (config.promptPresetId) {
        const preset = getPromptPreset(config.promptPresetId);
        if (preset) promptContent = preset.prompt;
    }

    // Get current schema content
    let schemaContent = config.customSchema;
    if (config.schemaPresetId) {
        const preset = getSchemaPreset(config.schemaPresetId);
        if (preset) schemaContent = JSON.stringify(preset.schema, null, 2);
    }

    // Validate schema if present
    let schemaStatus = '';
    let schemaValidation: { valid: boolean; error?: string; warnings?: string[] } = { valid: true };
    if (config.useStructuredOutput && schemaContent.trim()) {
        schemaValidation = validateSchema(schemaContent);
        if (!schemaValidation.valid) {
            schemaStatus = `<div class="${MODULE_NAME}_schema_status error"><i class="fa-solid fa-circle-xmark"></i> ${escapeHtml(schemaValidation.error || 'Invalid schema')}</div>`;
        } else if (schemaValidation.warnings?.length) {
            schemaStatus = `<div class="${MODULE_NAME}_schema_status warning"><i class="fa-solid fa-triangle-exclamation"></i> ${schemaValidation.warnings.length} warning(s)</div>`;
        } else {
            schemaStatus = `<div class="${MODULE_NAME}_schema_status success"><i class="fa-solid fa-circle-check"></i> Valid schema</div>`;
        }
    }

    // Token estimate display
    let tokenDisplay = '<i class="fa-solid fa-microchip"></i> Select a character';
    let tokenClass = '';
    if (tokenEstimate) {
        tokenDisplay = `<i class="fa-solid fa-microchip"></i> ~${tokenEstimate.tokens.toLocaleString()} tokens (${tokenEstimate.percentage}%)`;
        if (tokenEstimate.percentage > 80) tokenClass = 'danger';
        else if (tokenEstimate.percentage > 50) tokenClass = 'warning';
    }

    // Check if current content differs from selected preset (for save button state)
    const promptDiffersFromPreset = config.promptPresetId
        ? getPromptPreset(config.promptPresetId)?.prompt !== promptContent
        : promptContent.trim().length > 0;

    const schemaDiffersFromPreset = config.schemaPresetId
        ? JSON.stringify(getSchemaPreset(config.schemaPresetId)?.schema, null, 2) !== schemaContent
        : schemaContent.trim().length > 0;

    // Show fix button if schema has warnings or is invalid but parseable
    const showFixButton = config.useStructuredOutput && schemaContent.trim() &&
        (schemaValidation.warnings?.length || !schemaValidation.valid);

    return `
    <div class="${MODULE_NAME}_stage_config">
      <!-- Prompt Section -->
      <div class="${MODULE_NAME}_config_group">
        <div class="${MODULE_NAME}_config_header">
          <span class="${MODULE_NAME}_config_label">Prompt</span>
          <div class="${MODULE_NAME}_config_header_actions">
            <button
              id="${MODULE_NAME}_save_prompt_preset_btn"
              class="${MODULE_NAME}_icon_btn"
              title="Save as Preset"
              ${!promptDiffersFromPreset ? 'disabled' : ''}
            >
              <i class="fa-solid fa-floppy-disk"></i>
            </button>
            <select id="${MODULE_NAME}_prompt_preset_select" class="${MODULE_NAME}_preset_select">
              <option value="">Custom</option>
              ${renderPresetOptions(promptPresets, config.promptPresetId)}
            </select>
          </div>
        </div>
        <textarea
          id="${MODULE_NAME}_custom_prompt"
          class="${MODULE_NAME}_prompt_textarea text_pole"
          placeholder="Enter your prompt for the ${STAGE_LABELS[stage]} stage..."
        >${escapeHtml(promptContent)}</textarea>
        <div class="${MODULE_NAME}_config_footer">
          <span class="${MODULE_NAME}_char_count">${promptContent.length.toLocaleString()} chars</span>
        </div>
      </div>

      <!-- Structured Output Toggle -->
      <div class="${MODULE_NAME}_config_group">
        <label class="${MODULE_NAME}_checkbox_label">
          <input
            type="checkbox"
            id="${MODULE_NAME}_use_structured"
            ${config.useStructuredOutput ? 'checked' : ''}
          >
          <span>Use Structured Output (JSON Schema)</span>
        </label>
      </div>

      <!-- Schema Section -->
      <div class="${MODULE_NAME}_schema_section ${config.useStructuredOutput ? '' : 'hidden'}">
        <div class="${MODULE_NAME}_config_header">
          <span class="${MODULE_NAME}_config_label">JSON Schema</span>
          <div class="${MODULE_NAME}_config_header_actions">
            <button
              id="${MODULE_NAME}_save_schema_preset_btn"
              class="${MODULE_NAME}_icon_btn"
              title="Save as Preset"
              ${!schemaDiffersFromPreset || !schemaContent.trim() ? 'disabled' : ''}
            >
              <i class="fa-solid fa-floppy-disk"></i>
            </button>
            <select id="${MODULE_NAME}_schema_preset_select" class="${MODULE_NAME}_preset_select">
              <option value="">Custom</option>
              ${renderPresetOptions(schemaPresets, config.schemaPresetId)}
            </select>
          </div>
        </div>
        <textarea
          id="${MODULE_NAME}_custom_schema"
          class="${MODULE_NAME}_schema_textarea text_pole"
          placeholder='{"name": "MySchema", "value": {"type": "object", ...}}'
        >${escapeHtml(schemaContent)}</textarea>
        ${schemaStatus}

        <!-- Schema Actions -->
        <div class="${MODULE_NAME}_schema_actions">
          <button
            id="${MODULE_NAME}_generate_schema_btn"
            class="menu_button menu_button_icon"
            title="Generate schema from description"
          >
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            <span>Generate</span>
          </button>
          <button
            id="${MODULE_NAME}_validate_schema_btn"
            class="menu_button menu_button_icon"
            title="Validate schema"
            ${!schemaContent.trim() ? 'disabled' : ''}
          >
            <i class="fa-solid fa-check-double"></i>
            <span>Validate</span>
          </button>
          <button
            id="${MODULE_NAME}_fix_schema_btn"
            class="menu_button menu_button_icon"
            title="Auto-fix schema (adds additionalProperties: false, etc.)"
            ${!showFixButton ? 'disabled' : ''}
          >
            <i class="fa-solid fa-wrench"></i>
            <span>Auto-Fix</span>
          </button>
          <button
            id="${MODULE_NAME}_format_schema_btn"
            class="menu_button menu_button_icon"
            title="Format/prettify JSON"
            ${!schemaContent.trim() ? 'disabled' : ''}
          >
            <i class="fa-solid fa-align-left"></i>
            <span>Format</span>
          </button>
        </div>
      </div>

      <!-- Actions -->
      <div class="${MODULE_NAME}_config_actions">
        <div id="${MODULE_NAME}_token_estimate" class="${MODULE_NAME}_token_estimate ${tokenClass}">
          ${tokenDisplay}
        </div>
      </div>
    </div>
  `;
}


// ============================================================================
// UPDATE STATE
// ============================================================================

/**
 * Handle schema generation from description
 */
export async function handleGenerateSchema(): Promise<string | null> {
    const { Popup, POPUP_RESULT } = SillyTavern.getContext();

    const description = await Popup.show.input(
        'Generate Schema',
        'Describe the structure you want (e.g., <q>"scores for each field 1-10, list of suggestions, overall rating"</q>):\n',
        '',
    );

    if (description === null || description === POPUP_RESULT.CANCELLED || !description.trim()) {
        return null;
    }

    // Show loading overlay
    showSchemaGenerationLoading(true);

    try {
        toastr.info('Generating schema...');

        const result = await generateSchemaFromDescription(description);

        if (result.success) {
            toastr.success('Schema generated!');
            return result.schema!;
        } else {
            toastr.error(result.error || 'Generation failed');
            // Return the broken schema anyway so they can see/fix it
            return result.schema || null;
        }
    } finally {
        showSchemaGenerationLoading(false);
    }
}

/**
 * Show/hide loading overlay for schema generation
 */
function showSchemaGenerationLoading(show: boolean): void {
    const existingOverlay = document.querySelector(`.${MODULE_NAME}_loading_overlay`);

    if (show && !existingOverlay) {
        const overlay = document.createElement('div');
        overlay.className = `${MODULE_NAME}_loading_overlay`;
        overlay.innerHTML = `
            <div class="${MODULE_NAME}_loading_content">
                <i class="fa-solid fa-spinner fa-spin fa-2x"></i>
                <p>Generating schema...</p>
            </div>
        `;
        document.body.appendChild(overlay);
    } else if (!show && existingOverlay) {
        existingOverlay.remove();
    }
}

export function updateStageConfigState(
    container: HTMLElement,
    stage: StageName,
    config: StageConfig,
    isGenerating: boolean,
): void {
    const promptPresets = getPromptPresets(stage);
    const schemaPresets = getSchemaPresets(stage);

    // Update prompt preset select
    const promptSelect = container.querySelector(`#${MODULE_NAME}_prompt_preset_select`) as HTMLSelectElement;
    if (promptSelect) {
        promptSelect.innerHTML = `<option value="">Custom</option>${renderPresetOptions(promptPresets, config.promptPresetId)}`;
        promptSelect.value = config.promptPresetId || '';
        promptSelect.disabled = isGenerating;
    }

    // Update prompt textarea
    const promptTextarea = container.querySelector(`#${MODULE_NAME}_custom_prompt`) as HTMLTextAreaElement;
    if (promptTextarea) {
        let promptContent = config.customPrompt;
        if (config.promptPresetId) {
            const preset = getPromptPreset(config.promptPresetId);
            if (preset) promptContent = preset.prompt;
        }
        // Only update if different to preserve cursor position
        if (promptTextarea.value !== promptContent) {
            promptTextarea.value = promptContent;
        }
        promptTextarea.disabled = isGenerating;

        // Update char count
        const charCount = container.querySelector(`.${MODULE_NAME}_char_count`);
        if (charCount) {
            charCount.textContent = `${promptContent.length.toLocaleString()} chars`;
        }
    }

    // Update structured output toggle
    const structuredToggle = container.querySelector(`#${MODULE_NAME}_use_structured`) as HTMLInputElement;
    if (structuredToggle) {
        structuredToggle.checked = config.useStructuredOutput;
        structuredToggle.disabled = isGenerating;
    }

    // Update schema section visibility
    const schemaSection = container.querySelector(`.${MODULE_NAME}_schema_section`);
    if (schemaSection) {
        schemaSection.classList.toggle('hidden', !config.useStructuredOutput);
    }

    // Update schema preset select
    const schemaSelect = container.querySelector(`#${MODULE_NAME}_schema_preset_select`) as HTMLSelectElement;
    if (schemaSelect) {
        schemaSelect.innerHTML = `<option value="">Custom</option>${renderPresetOptions(schemaPresets, config.schemaPresetId)}`;
        schemaSelect.value = config.schemaPresetId || '';
        schemaSelect.disabled = isGenerating;
    }

    // Update schema textarea
    const schemaTextarea = container.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
    if (schemaTextarea) {
        let schemaContent = config.customSchema;
        if (config.schemaPresetId) {
            const preset = getSchemaPreset(config.schemaPresetId);
            if (preset) schemaContent = JSON.stringify(preset.schema, null, 2);
        }
        if (schemaTextarea.value !== schemaContent) {
            schemaTextarea.value = schemaContent;
        }
        schemaTextarea.disabled = isGenerating;
    }

    // Update schema validation status
    if (config.useStructuredOutput) {
        updateSchemaValidation(container, schemaTextarea?.value || '');
    }

    // Update schema action buttons
    updateSchemaActionButtons(container, schemaTextarea?.value || '');

    // Update run button
    const runBtn = container.querySelector(`#${MODULE_NAME}_run_stage_btn`) as HTMLButtonElement;
    if (runBtn) {
        runBtn.disabled = isGenerating;
        if (isGenerating) {
            runBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Running...';
        } else {
            runBtn.innerHTML = `<i class="fa-solid fa-play"></i> Run ${STAGE_LABELS[stage]} <kbd>Ctrl+Enter</kbd>`;
        }
    }

    // Update save preset buttons
    updateSavePresetButtons(container, config);
}

// ============================================================================
// SCHEMA ACTION BUTTONS
// ============================================================================

function updateSchemaActionButtons(container: HTMLElement, schemaContent: string): void {
    const validateBtn = container.querySelector(`#${MODULE_NAME}_validate_schema_btn`) as HTMLButtonElement;
    const fixBtn = container.querySelector(`#${MODULE_NAME}_fix_schema_btn`) as HTMLButtonElement;
    const formatBtn = container.querySelector(`#${MODULE_NAME}_format_schema_btn`) as HTMLButtonElement;

    const hasContent = schemaContent.trim().length > 0;

    if (validateBtn) {
        validateBtn.disabled = !hasContent;
    }

    if (formatBtn) {
        formatBtn.disabled = !hasContent;
    }

    if (fixBtn && hasContent) {
        const validation = validateSchema(schemaContent);
        // Enable fix button if there are warnings or if it's invalid but might be fixable
        const needsFix = (validation.warnings?.length ?? 0) > 0 || !validation.valid;
        fixBtn.disabled = !needsFix;
    } else if (fixBtn) {
        fixBtn.disabled = true;
    }
}

// ============================================================================
// SCHEMA ACTION HANDLERS (called from popup.ts)
// ============================================================================

export async function handleValidateSchema(schemaContent: string): Promise<void> {
    if (!schemaContent.trim()) {
        toastr.warning('No schema to validate');
        return;
    }

    const validation = validateSchema(schemaContent);

    if (!validation.valid) {
        toastr.error(`Invalid: ${validation.error}`);
        return;
    }

    // For warnings/info with more than 2 items, use Popup instead of toastr
    const { Popup, POPUP_TYPE } = SillyTavern.getContext();

    if (validation.warnings?.length) {
        if (validation.warnings.length > 2) {
            const content = `
                <h3>Schema Valid with Warnings</h3>
                <ul>
                    ${validation.warnings.map(w => `<li>${w}</li>`).join('')}
                </ul>
            `;
            await new Popup(content, POPUP_TYPE.TEXT, '', { wide: false }).show();
        } else {
            toastr.warning(`Valid with ${validation.warnings.length} warning(s):\n${validation.warnings.join('\n')}`);
        }
        return;
    }

    if (validation.info?.length) {
        if (validation.info.length > 2) {
            const content = `
                <h3>Schema Valid</h3>
                <ul>
                    ${validation.info.map(i => `<li>${i}</li>`).join('')}
                </ul>
            `;
            await new Popup(content, POPUP_TYPE.TEXT, '', { wide: false }).show();
        } else {
            toastr.success(`Valid!\n${validation.info.join('\n')}`);
        }
    } else {
        toastr.success('Schema is valid!');
    }
}

export function handleFixSchema(schemaContent: string): string | null {
    if (!schemaContent.trim()) {
        toastr.warning('No schema to fix');
        return null;
    }

    // First try to parse it
    const validation = validateSchema(schemaContent);

    if (!validation.schema) {
        toastr.error('Cannot fix: schema is not valid JSON or missing required structure');
        return null;
    }

    try {
        const fixed = autoFixSchema(validation.schema);
        const fixedJson = JSON.stringify(fixed, null, 2);

        // Validate the fixed version
        const revalidation = validateSchema(fixedJson);

        if (!revalidation.valid) {
            toastr.warning('Auto-fix applied but schema still has issues');
        } else if (revalidation.warnings?.length) {
            toastr.info(`Fixed! ${revalidation.warnings.length} warning(s) remain`);
        } else {
            toastr.success('Schema fixed successfully!');
        }

        return fixedJson;
    } catch (e) {
        toastr.error(`Fix failed: ${(e as Error).message}`);
        return null;
    }
}

export function handleFormatSchema(schemaContent: string): string | null {
    if (!schemaContent.trim()) {
        toastr.warning('No schema to format');
        return null;
    }

    try {
        const parsed = JSON.parse(schemaContent);
        const formatted = JSON.stringify(parsed, null, 2);
        toastr.success('Schema formatted');
        return formatted;
    } catch (e) {
        toastr.error(`Cannot format: ${(e as Error).message}`);
        return null;
    }
}

// ============================================================================
// SAVE PRESET BUTTONS
// ============================================================================

function updateSavePresetButtons(container: HTMLElement, config: StageConfig): void {
    const promptTextarea = container.querySelector(`#${MODULE_NAME}_custom_prompt`) as HTMLTextAreaElement;
    const schemaTextarea = container.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;

    const savePromptBtn = container.querySelector(`#${MODULE_NAME}_save_prompt_preset_btn`) as HTMLButtonElement;
    const saveSchemaBtn = container.querySelector(`#${MODULE_NAME}_save_schema_preset_btn`) as HTMLButtonElement;

    if (savePromptBtn && promptTextarea) {
        const currentPrompt = promptTextarea.value.trim();
        const presetPrompt = config.promptPresetId
            ? getPromptPreset(config.promptPresetId)?.prompt || ''
            : '';

        // Enable if there's content and it differs from the selected preset
        const hasContent = currentPrompt.length > 0;
        const isDifferent = currentPrompt !== presetPrompt;
        savePromptBtn.disabled = !hasContent || (config.promptPresetId !== null && !isDifferent);
    }

    if (saveSchemaBtn && schemaTextarea) {
        const currentSchema = schemaTextarea.value.trim();
        const presetSchema = config.schemaPresetId
            ? JSON.stringify(getSchemaPreset(config.schemaPresetId)?.schema, null, 2)
            : '';

        // Enable if there's valid content and it differs from the selected preset
        const hasContent = currentSchema.length > 0;
        const isDifferent = currentSchema !== presetSchema;
        const isValid = hasContent ? validateSchema(currentSchema).valid : false;
        saveSchemaBtn.disabled = !hasContent || !isValid || (config.schemaPresetId !== null && !isDifferent);
    }
}

// ============================================================================
// SAVE PRESET HANDLERS (called from popup.ts)
// ============================================================================

export interface SavePresetResult {
    success: boolean;
    presetId?: string;
}

export async function handleSavePromptPreset(stage: StageName, promptContent: string): Promise<SavePresetResult> {
    const { Popup, POPUP_RESULT } = SillyTavern.getContext();

    if (!promptContent.trim()) {
        toastr.warning('No prompt content to save');
        return { success: false };
    }

    const name = await Popup.show.input(
        'Save Prompt Preset',
        'Enter a name for this preset:',
        `Custom ${STAGE_LABELS[stage]} Prompt`,
    );

    if (name === null || name === POPUP_RESULT.CANCELLED) {
        return { success: false };
    }

    if (!name.trim()) {
        toastr.warning('Preset name cannot be empty');
        return { success: false };
    }

    try {
        const newPreset = savePromptPreset({
            name: name.trim(),
            prompt: promptContent,
            stages: [stage],
        });
        toastr.success(`Prompt preset "${name}" saved`);
        return { success: true, presetId: newPreset.id };
    } catch (e) {
        toastr.error(`Failed to save preset: ${(e as Error).message}`);
        return { success: false };
    }
}

export async function handleSaveSchemaPreset(stage: StageName, schemaContent: string): Promise<SavePresetResult> {
    const { Popup, POPUP_RESULT } = SillyTavern.getContext();

    if (!schemaContent.trim()) {
        toastr.warning('No schema content to save');
        return { success: false };
    }

    // Validate first
    const validation = validateSchema(schemaContent);
    if (!validation.valid) {
        toastr.error(`Invalid schema: ${validation.error}`);
        return { success: false };
    }

    const name = await Popup.show.input(
        'Save Schema Preset',
        'Enter a name for this preset:',
        `Custom ${STAGE_LABELS[stage]} Schema`,
    );

    if (name === null || name === POPUP_RESULT.CANCELLED) {
        return { success: false };
    }

    if (!name.trim()) {
        toastr.warning('Preset name cannot be empty');
        return { success: false };
    }

    try {
        const newPreset = saveSchemaPreset({
            name: name.trim(),
            schema: validation.schema!,
            stages: [stage],
        });
        toastr.success(`Schema preset "${name}" saved`);
        return { success: true, presetId: newPreset.id };
    } catch (e) {
        toastr.error(`Failed to save preset: ${(e as Error).message}`);
        return { success: false };
    }
}

// ============================================================================
// HELPERS
// ============================================================================

function renderPresetOptions(presets: (PromptPreset | SchemaPreset)[], selectedId: string | null): string {
    return presets.map(p => {
        const selected = p.id === selectedId ? 'selected' : '';
        const icon = p.isBuiltin ? '📦' : '📝';
        return `<option value="${p.id}" ${selected}>${icon} ${escapeHtml(p.name)}</option>`;
    }).join('');
}

function updateSchemaValidation(container: HTMLElement, schemaContent: string): void {
    // Remove existing status
    const existingStatus = container.querySelector(`.${MODULE_NAME}_schema_status`);
    if (existingStatus) {
        existingStatus.remove();
    }

    if (!schemaContent.trim()) {
        return;
    }

    const validation = validateSchema(schemaContent);
    let statusHtml = '';

    if (!validation.valid) {
        statusHtml = `<div class="${MODULE_NAME}_schema_status error"><i class="fa-solid fa-circle-xmark"></i> ${escapeHtml(validation.error || 'Invalid schema')}</div>`;
    } else if (validation.warnings?.length) {
        statusHtml = `<div class="${MODULE_NAME}_schema_status warning"><i class="fa-solid fa-triangle-exclamation"></i> ${validation.warnings.length} warning(s)</div>`;
    } else {
        statusHtml = `<div class="${MODULE_NAME}_schema_status success"><i class="fa-solid fa-circle-check"></i> Valid schema</div>`;
    }

    const schemaTextarea = container.querySelector(`#${MODULE_NAME}_custom_schema`);
    if (schemaTextarea) {
        schemaTextarea.insertAdjacentHTML('afterend', statusHtml);
    }
}

function escapeHtml(text: string): string {
    const { DOMPurify } = SillyTavern.libs;
    return DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
}
