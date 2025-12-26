// src/ui/components/results-panel.ts
//
// Results display and actions component

import { MODULE_NAME, STAGE_LABELS } from '../../constants';
import { formatResponse, formatStructuredResponse } from '../formatter';
import { canExport, canRefine, extractVerdict } from '../../pipeline';
import type { StageName, StageStatus, StageResult, PipelineState, IterationVerdict } from '../../types';

// ============================================================================
// RENDER
// ============================================================================

/**
 * Render the results panel
 */
export function renderResultsPanel(
    stage: StageName,
    result: StageResult | null,
    status: StageStatus,
    isGenerating: boolean,
): string {
    if (isGenerating && status === 'running') {
        return renderLoading(stage);
    }

    if (!result) {
        return renderPlaceholder(stage, status);
    }

    return renderResult(stage, result);
}

function renderLoading(stage: StageName): string {
    return `
    <div class="${MODULE_NAME}_results_loading">
      <i class="fa-solid fa-spinner fa-spin fa-2x"></i>
      <p>Running ${STAGE_LABELS[stage]}...</p>
      <button id="${MODULE_NAME}_cancel_btn" class="menu_button">
        <i class="fa-solid fa-stop"></i>
        <span>Cancel</span>
      </button>
    </div>
  `;
}

/**
 * Render loading state for refinement
 */
export function renderRefinementLoading(iteration: number): string {
    return `
    <div class="${MODULE_NAME}_results_loading">
      <i class="fa-solid fa-spinner fa-spin fa-2x"></i>
      <p>Refining (Iteration #${iteration + 1})...</p>
      <button id="${MODULE_NAME}_cancel_btn" class="menu_button">
        <i class="fa-solid fa-stop"></i>
        <span>Cancel</span>
      </button>
    </div>
  `;
}

function renderPlaceholder(stage: StageName, status: StageStatus): string {
    let message = `Run ${STAGE_LABELS[stage]} to see results`;
    let icon = 'fa-play';

    if (status === 'skipped') {
        message = `${STAGE_LABELS[stage]} was skipped`;
        icon = 'fa-forward';
    }

    return `
    <div class="${MODULE_NAME}_results_placeholder">
      <i class="fa-solid ${icon}"></i>
      <p>${message}</p>
    </div>
  `;
}

function renderResult(stage: StageName, result: StageResult): string {
    const formattedContent = result.isStructured
        ? formatStructuredResponse(result.response, null, MODULE_NAME)
        : formatResponse(result.response, MODULE_NAME);

    const timestamp = new Date(result.timestamp).toLocaleTimeString();

    // Extract verdict if this is an analyze result
    let verdictBadge = '';
    if (stage === 'analyze') {
        const verdict = extractVerdict(result.response);
        verdictBadge = renderVerdictBadge(verdict);
    }

    return `
    <div class="${MODULE_NAME}_results_content">
      <!-- Toolbar -->
      <div class="${MODULE_NAME}_results_toolbar">
        <div class="${MODULE_NAME}_results_info">
          <span class="${MODULE_NAME}_badge">${STAGE_LABELS[stage]}</span>
          ${verdictBadge}
          <span class="${MODULE_NAME}_results_time">${timestamp}</span>
          ${result.locked ? `<span class="${MODULE_NAME}_badge ${MODULE_NAME}_badge_locked"><i class="fa-solid fa-lock"></i> Locked</span>` : ''}
        </div>
        <div class="${MODULE_NAME}_results_actions">
          ${result.locked
        ? `<button id="${MODULE_NAME}_unlock_btn" class="${MODULE_NAME}_icon_btn" title="Unlock for editing">
                <i class="fa-solid fa-lock-open"></i>
              </button>`
        : `<button id="${MODULE_NAME}_lock_btn" class="${MODULE_NAME}_icon_btn" title="Lock result">
                <i class="fa-solid fa-lock"></i>
              </button>`
}
          <button id="${MODULE_NAME}_copy_btn" class="${MODULE_NAME}_icon_btn" title="Copy to clipboard">
            <i class="fa-solid fa-copy"></i>
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="${MODULE_NAME}_results_body">
        ${formattedContent}
      </div>

      <!-- Footer Actions -->
      <div class="${MODULE_NAME}_results_footer" id="${MODULE_NAME}_results_footer">
        <!-- Populated by updateResultsPanelState -->
      </div>
    </div>
  `;
}

function renderVerdictBadge(verdict: IterationVerdict): string {
    const icons: Record<IterationVerdict, string> = {
        accept: 'fa-check-circle',
        needs_refinement: 'fa-wrench',
        regression: 'fa-arrow-down',
    };

    const labels: Record<IterationVerdict, string> = {
        accept: 'Accept',
        needs_refinement: 'Needs Work',
        regression: 'Regression',
    };

    return `
    <span class="${MODULE_NAME}_badge ${MODULE_NAME}_verdict_badge ${MODULE_NAME}_verdict_${verdict}">
      <i class="fa-solid ${icons[verdict]}"></i>
      ${labels[verdict]}
    </span>
  `;
}

// ============================================================================
// UPDATE
// ============================================================================

/**
 * Update results panel state
 */
export function updateResultsPanelState(
    container: HTMLElement,
    stage: StageName,
    result: StageResult | null,
    status: StageStatus,
    isGenerating: boolean,
    nextStage: StageName | null,
    pipeline: PipelineState,
): void {
    const shouldShowLoading = isGenerating && status === 'running';
    const shouldShowResult = result && !shouldShowLoading;
    const shouldShowPlaceholder = !result && !shouldShowLoading;

    // Always re-render if state type changes OR if showing placeholder (stage name might have changed)
    if (shouldShowLoading) {
        container.innerHTML = renderLoading(stage);
        return;
    }

    if (shouldShowPlaceholder) {
        container.innerHTML = renderPlaceholder(stage, status);
        return;
    }

    if (shouldShowResult) {
        // Only re-render result if we don't have content or timestamp changed
        const existingContent = container.querySelector(`.${MODULE_NAME}_results_content`);
        const existingTimestamp = container.querySelector(`.${MODULE_NAME}_results_time`)?.textContent;
        const newTimestamp = new Date(result.timestamp).toLocaleTimeString();

        if (!existingContent || existingTimestamp !== newTimestamp) {
            container.innerHTML = renderResult(stage, result);
        }
    }

    // Update footer actions
    const footer = container.querySelector(`#${MODULE_NAME}_results_footer`);
    if (footer && result) {
        footer.innerHTML = renderFooterActions(stage, result, nextStage, pipeline);
    }

    // Update lock button state
    const lockBtn = container.querySelector(`#${MODULE_NAME}_lock_btn`);
    const unlockBtn = container.querySelector(`#${MODULE_NAME}_unlock_btn`);

    if (result?.locked) {
        lockBtn?.classList.add('hidden');
        unlockBtn?.classList.remove('hidden');
    } else {
        lockBtn?.classList.remove('hidden');
        unlockBtn?.classList.add('hidden');
    }
}

function renderFooterActions(
    stage: StageName,
    result: StageResult,
    nextStage: StageName | null,
    pipeline: PipelineState,
): string {
    const actions: string[] = [];

    // Regenerate (if not locked)
    if (!result.locked) {
        actions.push(`
      <button id="${MODULE_NAME}_regenerate_btn" class="menu_button">
        <i class="fa-solid fa-rotate"></i>
        <span>Regenerate</span>
      </button>
    `);
    }

    // Stage-specific actions
    if (stage === 'analyze') {
        const verdict = extractVerdict(result.response);
        const canRefineResult = canRefine(pipeline);

        // Refine button (if we can refine)
        if (canRefineResult.canRun) {
            const isRecommended = verdict === 'needs_refinement';
            actions.push(`
        <button id="${MODULE_NAME}_refine_btn" class="menu_button ${isRecommended ? MODULE_NAME + '_refine_recommended' : ''}">
          <i class="fa-solid fa-arrows-rotate"></i>
          <span>Refine</span>
          ${pipeline.iterationCount > 0 ? `<span class="${MODULE_NAME}_iteration_badge">#${pipeline.iterationCount + 1}</span>` : ''}
        </button>
      `);
        }

        // Accept button (if we have a rewrite)
        if (pipeline.results.rewrite && !pipeline.results.rewrite.locked) {
            const isRecommended = verdict === 'accept';
            actions.push(`
        <button id="${MODULE_NAME}_accept_btn" class="menu_button ${isRecommended ? MODULE_NAME + '_accept_recommended' : ''}">
          <i class="fa-solid fa-check"></i>
          <span>Accept Rewrite</span>
        </button>
      `);
        }
    }

    // Continue to next stage (not on analyze - use refine/accept instead)
    if (nextStage && stage !== 'analyze') {
        actions.push(`
      <button id="${MODULE_NAME}_continue_btn" class="menu_button ${MODULE_NAME}_continue_btn">
        <i class="fa-solid fa-arrow-right"></i>
        <span>Continue to ${STAGE_LABELS[nextStage]}</span>
      </button>
    `);
    }

    // Export (if we have rewrite results)
    if (canExport(pipeline)) {
        actions.push(`
      <button id="${MODULE_NAME}_export_btn" class="menu_button">
        <i class="fa-solid fa-file-export"></i>
        <span>Export</span>
      </button>
    `);
    }

    return `<div class="${MODULE_NAME}_footer_actions">${actions.join('')}</div>`;
}
