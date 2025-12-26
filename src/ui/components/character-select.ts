// src/ui/components/character-select.ts
//
// Character search and preview component

import { MODULE_NAME } from '../../constants';
import { getPopulatedFields } from '../../pipeline';
import type { Character, PopulatedField } from '../../types';

// ============================================================================
// TOKEN CACHE
// ============================================================================

const MAX_TOKEN_CACHE_SIZE = 500;
let tokenCache: Map<string, number> | null = null;

function getTokenCache(): Map<string, number> {
    if (!tokenCache) {
        tokenCache = new Map();
    }
    return tokenCache;
}

function getTokenCacheKey(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return `${hash}_${content.length}`;
}

function addToTokenCache(key: string, value: number): void {
    const cache = getTokenCache();
    if (cache.size >= MAX_TOKEN_CACHE_SIZE) {
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined) {
            cache.delete(firstKey);
        }
    }
    cache.set(key, value);
}

/**
 * Clear the token cache. Call when popup closes to free memory.
 */
export function clearTokenCache(): void {
    tokenCache?.clear();
}

// ============================================================================
// RENDER
// ============================================================================

/**
 * Render the character select component
 */
export function renderCharacterSelect(
    characters: Character[],
    selectedIndex: number | null,
): string {
    const selectedChar = selectedIndex !== null ? characters[selectedIndex] : null;

    return `
    <div class="${MODULE_NAME}_char_select">
      <!-- Search -->
      <div class="${MODULE_NAME}_search_wrapper ${selectedChar ? 'hidden' : ''}">
        <div class="${MODULE_NAME}_search_container">
          <i class="fa-solid fa-search ${MODULE_NAME}_search_icon"></i>
          <input
            type="text"
            id="${MODULE_NAME}_char_search"
            class="text_pole ${MODULE_NAME}_search_input"
            placeholder="Search characters..."
            autocomplete="off"
          >
        </div>
        <div id="${MODULE_NAME}_char_dropdown" class="${MODULE_NAME}_dropdown hidden"></div>
      </div>

      <!-- Selected Character Preview -->
      ${selectedChar ? renderCharacterPreview(selectedChar) : ''}
    </div>
  `;
}

/**
 * Render character preview with expandable fields
 */
function renderCharacterPreview(char: Character): string {
    const { getThumbnailUrl } = SillyTavern.getContext();
    const fields = getPopulatedFields(char);

    const avatar = getThumbnailUrl('avatar', char.avatar);

    return `
    <div class="${MODULE_NAME}_char_preview" id="${MODULE_NAME}_char_preview">
      <div class="${MODULE_NAME}_char_header">
        <img
          class="${MODULE_NAME}_char_avatar"
          src="${avatar}"
          alt=""
          onerror="this.src='/img/ai4.png'"
        >
        <div class="${MODULE_NAME}_char_info">
          <div class="${MODULE_NAME}_char_name">${escapeHtml(char.name)}</div>
          <div class="${MODULE_NAME}_char_meta">
            ${fields.length} fields • <span id="${MODULE_NAME}_total_tokens">counting...</span>
          </div>
        </div>
        <button id="${MODULE_NAME}_char_clear" class="${MODULE_NAME}_icon_btn" title="Clear selection">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="${MODULE_NAME}_char_fields">
        ${fields.map(f => renderFieldRow(f)).join('')}
      </div>
    </div>
  `;
}

/**
 * Render a single field row with expand/collapse
 */
function renderFieldRow(field: PopulatedField): string {
    return `
    <div class="${MODULE_NAME}_field_row">
      <div class="${MODULE_NAME}_field_header ${MODULE_NAME}_field_toggle" data-field="${field.key}">
        <i class="fa-solid fa-chevron-right"></i>
        <span class="${MODULE_NAME}_field_label">${field.label}</span>
        <span class="${MODULE_NAME}_field_tokens" data-field="${field.key}">...</span>
      </div>
      <div class="${MODULE_NAME}_field_content hidden" id="${MODULE_NAME}_field_content_${field.key}">
        <div class="${MODULE_NAME}_field_text">${escapeHtml(field.value)}</div>
      </div>
    </div>
  `;
}

// ============================================================================
// UPDATE
// ============================================================================

/**
 * Update character select state without full re-render
 */
export function updateCharacterSelectState(
    container: HTMLElement,
    character: Character | null,
    _characterIndex: number | null,
): void {
    const searchWrapper = container.querySelector(`.${MODULE_NAME}_search_wrapper`);
    const existingPreview = container.querySelector(`#${MODULE_NAME}_char_preview`);

    if (character) {
        searchWrapper?.classList.add('hidden');

        if (!existingPreview) {
            const previewHtml = renderCharacterPreview(character);
            const searchEl = container.querySelector(`.${MODULE_NAME}_search_wrapper`);
            if (searchEl) {
                searchEl.insertAdjacentHTML('afterend', previewHtml);
            }
        }
    } else {
        searchWrapper?.classList.remove('hidden');
        existingPreview?.remove();

        const searchInput = container.querySelector(`#${MODULE_NAME}_char_search`) as HTMLInputElement;
        if (searchInput) {
            searchInput.value = '';
        }
    }
}

/**
 * Update token counts for character fields and total.
 * Uses parallel execution and caching for performance.
 */
export async function updateFieldTokenCounts(container: HTMLElement, fields: PopulatedField[]): Promise<void> {
    const { getTokenCountAsync } = SillyTavern.getContext();
    const cache = getTokenCache();

    const tokenPromises = fields.map(async (field) => {
        const cacheKey = getTokenCacheKey(field.value);

        if (cache.has(cacheKey)) {
            return { field, tokens: cache.get(cacheKey)! };
        }

        try {
            const tokens = await getTokenCountAsync(field.value);
            addToTokenCache(cacheKey, tokens);
            return { field, tokens };
        } catch {
            return { field, tokens: null };
        }
    });

    const results = await Promise.all(tokenPromises);

    let totalTokens = 0;

    for (const { field, tokens } of results) {
        const tokenSpan = container.querySelector(`.${MODULE_NAME}_field_tokens[data-field="${field.key}"]`);
        if (tokenSpan) {
            if (tokens !== null) {
                totalTokens += tokens;
                tokenSpan.textContent = `${tokens.toLocaleString()}t`;
            } else {
                tokenSpan.textContent = '?';
            }
        }
    }

    const totalSpan = container.querySelector(`#${MODULE_NAME}_total_tokens`);
    if (totalSpan) {
        totalSpan.textContent = `${totalTokens.toLocaleString()} tokens`;
    }
}

/**
 * Render dropdown items - called from popup.ts
 */
export function renderDropdownItems(
    results: Array<{ char: Character; index: number }>,
    dropdown: HTMLElement,
    selectedIndex: number,
): void {
    const { getThumbnailUrl } = SillyTavern.getContext();

    if (results.length === 0) {
        dropdown.innerHTML = `<div class="${MODULE_NAME}_dropdown_empty">No characters found</div>`;
        return;
    }

    dropdown.innerHTML = results.map(({ char, index }, i) => {
        const avatar = getThumbnailUrl('avatar', char.avatar);
        const isSelected = i === selectedIndex;
        const descPreview = (char.description || 'No description').substring(0, 80);

        return `
      <div class="${MODULE_NAME}_dropdown_item ${isSelected ? 'selected' : ''}" data-index="${index}">
        <img class="${MODULE_NAME}_dropdown_avatar" src="${avatar}" alt="" onerror="this.src='/img/ai4.png'">
        <div class="${MODULE_NAME}_dropdown_info">
          <span class="${MODULE_NAME}_dropdown_name">${escapeHtml(char.name)}</span>
          <span class="${MODULE_NAME}_dropdown_desc">${escapeHtml(descPreview)}${descPreview.length >= 80 ? '...' : ''}</span>
        </div>
      </div>
    `;
    }).join('');

    // Scroll selected item into view
    if (selectedIndex >= 0) {
        const selectedItem = dropdown.querySelector(`.${MODULE_NAME}_dropdown_item.selected`);
        selectedItem?.scrollIntoView({ block: 'nearest' });
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
