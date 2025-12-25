// src/ui/components/pipeline-nav.ts
//
// Pipeline stage selection and navigation component

import { MODULE_NAME, STAGES, STAGE_LABELS, STAGE_ICONS } from '../../constants';
import type { StageName, StageStatus } from '../../types';

// ============================================================================
// RENDER
// ============================================================================

/**
 * Render the pipeline navigation component
 */
export function renderPipelineNav(
    selectedStages: StageName[],
    stageStatus: Record<StageName, StageStatus>,
    activeStage: StageName,
    hasCharacter: boolean,
): string {
    return `
    <div class="${MODULE_NAME}_pipeline_nav">
      <!-- Stage Selection -->
      <div class="${MODULE_NAME}_stage_row">
        ${STAGES.map((stage, i) => renderStageNode(
        stage,
        selectedStages.includes(stage),
        stageStatus[stage],
        stage === activeStage,
        i < STAGES.length - 1,
    )).join('')}
      </div>

      <!-- Action Buttons -->
      <div class="${MODULE_NAME}_pipeline_actions">
        <button
          id="${MODULE_NAME}_run_selected_btn"
          class="menu_button"
          ${!hasCharacter ? 'disabled' : ''}
        >
          <i class="fa-solid fa-play"></i>
          <span>Run Selected</span>
        </button>
        <button
          id="${MODULE_NAME}_run_all_btn"
          class="menu_button"
          ${!hasCharacter ? 'disabled' : ''}
        >
          <i class="fa-solid fa-forward"></i>
          <span>Run All</span>
        </button>
        <button
          id="${MODULE_NAME}_reset_pipeline_btn"
          class="menu_button"
        >
          <i class="fa-solid fa-rotate-left"></i>
          <span>Reset</span>
        </button>
      </div>
    </div>
  `;
}

/**
 * Render a single stage node
 */
function renderStageNode(
    stage: StageName,
    isSelected: boolean,
    status: StageStatus,
    isActive: boolean,
    hasConnector: boolean,
): string {
    const statusIcon = getStatusIcon(status);

    return `
    <div class="${MODULE_NAME}_stage_node ${isActive ? 'active' : ''} ${MODULE_NAME}_stage_${status}">
      <input
        type="checkbox"
        class="${MODULE_NAME}_stage_checkbox"
        id="${MODULE_NAME}_stage_cb_${stage}"
        data-stage="${stage}"
        ${isSelected ? 'checked' : ''}
      >
      <button
        class="${MODULE_NAME}_stage_btn ${isActive ? 'active' : ''}"
        data-stage="${stage}"
        title="${STAGE_LABELS[stage]}"
      >
        <i class="fa-solid ${STAGE_ICONS[stage]}"></i>
        <span>${STAGE_LABELS[stage]}</span>
        ${statusIcon ? `<i class="fa-solid ${statusIcon} ${MODULE_NAME}_status_icon"></i>` : ''}
      </button>
      ${hasConnector ? `<div class="${MODULE_NAME}_stage_connector ${isSelected ? 'active' : ''}"></div>` : ''}
    </div>
  `;
}

function getStatusIcon(status: StageStatus): string | null {
    switch (status) {
        case 'complete': return 'fa-check';
        case 'running': return 'fa-spinner fa-spin';
        case 'skipped': return 'fa-forward';
        default: return null;
    }
}

// ============================================================================
// UPDATE
// ============================================================================

/**
 * Update pipeline nav state without full re-render
 */
export function updatePipelineNavState(
    container: HTMLElement,
    selectedStages: StageName[],
    stageStatus: Record<StageName, StageStatus>,
    activeStage: StageName,
    hasCharacter: boolean,
    isGenerating: boolean,
): void {
    // Update checkboxes and buttons
    for (const stage of STAGES) {
        const checkbox = container.querySelector(`#${MODULE_NAME}_stage_cb_${stage}`) as HTMLInputElement;
        const btn = container.querySelector(`.${MODULE_NAME}_stage_btn[data-stage="${stage}"]`);
        const node = container.querySelector(`.${MODULE_NAME}_stage_node:has([data-stage="${stage}"])`);

        if (checkbox) {
            checkbox.checked = selectedStages.includes(stage);
        }

        if (btn) {
            btn.classList.toggle('active', stage === activeStage);
        }

        if (node) {
            node.classList.toggle('active', stage === activeStage);

            // Update status classes
            for (const s of ['pending', 'running', 'complete', 'skipped']) {
                node.classList.toggle(`${MODULE_NAME}_stage_${s}`, stageStatus[stage] === s);
            }
        }

        // Update connector
        const connector = node?.querySelector(`.${MODULE_NAME}_stage_connector`);
        connector?.classList.toggle('active', selectedStages.includes(stage));
    }

    // Update action buttons
    const runSelectedBtn = container.querySelector(`#${MODULE_NAME}_run_selected_btn`) as HTMLButtonElement;
    const runAllBtn = container.querySelector(`#${MODULE_NAME}_run_all_btn`) as HTMLButtonElement;
    const resetBtn = container.querySelector(`#${MODULE_NAME}_reset_pipeline_btn`) as HTMLButtonElement;

    if (runSelectedBtn) runSelectedBtn.disabled = !hasCharacter || isGenerating;
    if (runAllBtn) runAllBtn.disabled = !hasCharacter || isGenerating;
    if (resetBtn) resetBtn.disabled = isGenerating;
}
