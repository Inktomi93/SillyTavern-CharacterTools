// src/ui/components/iteration-history.ts
//
// Iteration history display component

import { MODULE_NAME } from '../../constants';
import type { IterationSnapshot, IterationVerdict } from '../../types';

// ============================================================================
// RENDER
// ============================================================================

/**
 * Render the iteration history panel
 */
export function renderIterationHistory(
    history: IterationSnapshot[],
    currentIteration: number,
    onRevert: (index: number) => void,
): string {
    if (history.length === 0 && currentIteration === 0) {
        return '';
    }

    return `
    <div class="${MODULE_NAME}_iteration_history" id="${MODULE_NAME}_iteration_history">
      <div class="${MODULE_NAME}_iteration_header">
        <i class="fa-solid fa-clock-rotate-left"></i>
        <span>Iteration History</span>
        <span class="${MODULE_NAME}_iteration_count">${currentIteration > 0 ? `Current: #${currentIteration + 1}` : 'Initial'}</span>
      </div>
      <div class="${MODULE_NAME}_iteration_list">
        ${history.length === 0
        ? `<div class="${MODULE_NAME}_iteration_empty">No previous iterations</div>`
        : history.map((snap, i) => renderIterationItem(snap, i, history.length)).join('')
}
      </div>
    </div>
  `;
}

function renderIterationItem(snap: IterationSnapshot, index: number, total: number): string {
    const verdictIcon = getVerdictIcon(snap.verdict);
    const verdictClass = getVerdictClass(snap.verdict);
    const time = new Date(snap.timestamp).toLocaleTimeString();

    return `
    <div class="${MODULE_NAME}_iteration_item ${verdictClass}" data-index="${index}">
      <div class="${MODULE_NAME}_iteration_item_header">
        <span class="${MODULE_NAME}_iteration_num">#${snap.iteration + 1}</span>
        <span class="${MODULE_NAME}_iteration_verdict">
          <i class="fa-solid ${verdictIcon}"></i>
          ${formatVerdict(snap.verdict)}
        </span>
        <span class="${MODULE_NAME}_iteration_time">${time}</span>
      </div>
      <div class="${MODULE_NAME}_iteration_preview">
        ${escapeHtml(snap.rewritePreview)}...
      </div>
      <div class="${MODULE_NAME}_iteration_actions">
        <button
          class="${MODULE_NAME}_iteration_revert_btn menu_button"
          data-index="${index}"
          title="Revert to this version"
        >
          <i class="fa-solid fa-rotate-left"></i>
          Revert
        </button>
        <button
          class="${MODULE_NAME}_iteration_view_btn menu_button"
          data-index="${index}"
          title="View full content"
        >
          <i class="fa-solid fa-eye"></i>
          View
        </button>
      </div>
    </div>
  `;
}

function getVerdictIcon(verdict: IterationVerdict): string {
    switch (verdict) {
        case 'accept': return 'fa-check-circle';
        case 'needs_refinement': return 'fa-wrench';
        case 'regression': return 'fa-arrow-down';
        default: return 'fa-question-circle';
    }
}

function getVerdictClass(verdict: IterationVerdict): string {
    return `${MODULE_NAME}_verdict_${verdict}`;
}

function formatVerdict(verdict: IterationVerdict): string {
    switch (verdict) {
        case 'accept': return 'Accepted';
        case 'needs_refinement': return 'Needs Work';
        case 'regression': return 'Regression';
        default: return 'Unknown';
    }
}

// ============================================================================
// UPDATE
// ============================================================================

/**
 * Update iteration history state
 */
export function updateIterationHistoryState(
    container: HTMLElement,
    history: IterationSnapshot[],
    currentIteration: number,
): void {
    const historyEl = container.querySelector(`#${MODULE_NAME}_iteration_history`);

    if (!historyEl && (history.length > 0 || currentIteration > 0)) {
        // Need to add history panel
        const html = renderIterationHistory(history, currentIteration, () => {});
        container.insertAdjacentHTML('beforeend', html);
    } else if (historyEl) {
        // Update existing
        const countEl = historyEl.querySelector(`.${MODULE_NAME}_iteration_count`);
        if (countEl) {
            countEl.textContent = currentIteration > 0 ? `Current: #${currentIteration + 1}` : 'Initial';
        }

        const listEl = historyEl.querySelector(`.${MODULE_NAME}_iteration_list`);
        if (listEl) {
            if (history.length === 0) {
                listEl.innerHTML = `<div class="${MODULE_NAME}_iteration_empty">No previous iterations</div>`;
            } else {
                listEl.innerHTML = history.map((snap, i) => renderIterationItem(snap, i, history.length)).join('');
            }
        }
    }
}

/**
 * Render iteration view modal content
 */
export function renderIterationViewContent(snap: IterationSnapshot): string {
    return `
    <div class="${MODULE_NAME}_iteration_view">
      <div class="${MODULE_NAME}_iteration_view_header">
        <h3>Iteration #${snap.iteration + 1}</h3>
        <span class="${MODULE_NAME}_iteration_verdict ${getVerdictClass(snap.verdict)}">
          <i class="fa-solid ${getVerdictIcon(snap.verdict)}"></i>
          ${formatVerdict(snap.verdict)}
        </span>
        <span class="${MODULE_NAME}_iteration_time">${new Date(snap.timestamp).toLocaleString()}</span>
      </div>

      <div class="${MODULE_NAME}_iteration_view_section">
        <h4>Rewrite</h4>
        <div class="${MODULE_NAME}_iteration_view_content">
          ${escapeHtml(snap.rewriteResponse)}
        </div>
      </div>

      <div class="${MODULE_NAME}_iteration_view_section">
        <h4>Analysis</h4>
        <div class="${MODULE_NAME}_iteration_view_content">
          ${escapeHtml(snap.analysisResponse)}
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// UTILITIES
// ============================================================================

function escapeHtml(value: unknown): string {
    const { DOMPurify } = SillyTavern.libs;
    const str = typeof value === 'string' ? value : String(value ?? '');
    return DOMPurify.sanitize(str, { ALLOWED_TAGS: [] });
}
