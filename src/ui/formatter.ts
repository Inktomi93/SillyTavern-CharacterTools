// src/ui/formatter.ts
//
// Response formatting for display

import type { StructuredOutputSchema, JsonSchemaValue } from '../types';

// ============================================================================
// MAIN ENTRY POINTS
// ============================================================================

/**
 * Format a plain text/markdown response
 */
export function formatResponse(response: string, moduleName: string): string {
    const { showdown, DOMPurify } = SillyTavern.libs;
    const text = typeof response === 'string' ? response : String(response ?? '');

    const converter = new showdown.Converter({
        tables: true,
        strikethrough: true,
        simpleLineBreaks: false,
        headerLevelStart: 1,
        ghCodeBlocks: true,
        tasklists: true,
        openLinksInNewWindow: true,
        emoji: true,
        parseImgDimensions: true,
        simplifiedAutoLink: true,
    });

    const html = converter.makeHtml(text);
    const wrapped = `<div class="${moduleName}_markdown_content">${html}</div>`;

    return DOMPurify.sanitize(wrapped);
}

/**
 * Format a structured JSON response
 */
export function formatStructuredResponse(
    response: string,
    schema: StructuredOutputSchema | null,
    moduleName: string,
): string {
    const { DOMPurify } = SillyTavern.libs;
    const text = typeof response === 'string' ? response : String(response ?? '');

    const parsed = parseStructuredResponse(text);

    if (!parsed || typeof parsed !== 'object') {
        return formatResponse(text, moduleName);
    }

    const schemaValue = schema?.value ?? inferSchema(parsed);
    const html = renderStructuredRoot(parsed as Record<string, unknown>, schemaValue, moduleName);

    return DOMPurify.sanitize(html);
}

/**
 * Parse a structured response (handles JSON and code blocks)
 */
export function parseStructuredResponse(response: string): unknown | null {
    try {
        return JSON.parse(response);
    } catch {
        // Try to extract JSON from markdown code blocks
        const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
            try {
                return JSON.parse(codeBlockMatch[1].trim());
            } catch {
                return null;
            }
        }
        return null;
    }
}

// ============================================================================
// SCHEMA INFERENCE
// ============================================================================

function inferSchema(data: unknown): JsonSchemaValue {
    if (data === null) return { type: 'null' };
    if (Array.isArray(data)) {
        return {
            type: 'array',
            items: data.length > 0 ? inferSchema(data[0]) : { type: 'string' },
        };
    }
    if (typeof data === 'object') {
        const properties: Record<string, JsonSchemaValue> = {};
        for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
            properties[key] = inferSchema(value);
        }
        return { type: 'object', properties };
    }
    return { type: typeof data as 'string' | 'number' | 'boolean' };
}

// ============================================================================
// STRUCTURED RENDERING
// ============================================================================

const MAX_DEPTH = 8;

function renderStructuredRoot(
    data: Record<string, unknown>,
    schema: JsonSchemaValue,
    moduleName: string,
): string {
    const heroKey = findHeroKey(data);
    const heroValue = heroKey ? data[heroKey] : null;

    const sections: string[] = [];

    // Hero score at top
    if (heroKey && typeof heroValue === 'number') {
        sections.push(renderHero(heroKey, heroValue, moduleName));
    }

    // Render all fields
    const properties = (schema.properties || {}) as Record<string, JsonSchemaValue>;
    const keys = Object.keys(properties).length > 0 ? Object.keys(properties) : Object.keys(data);

    for (const key of keys) {
        if (key === heroKey) continue;
        const value = data[key];
        if (value === undefined) continue;

        const propSchema = properties[key] || { type: inferType(value) };
        sections.push(renderField(key, value, propSchema as JsonSchemaValue, moduleName, 0));
    }

    return `<div class="${moduleName}_structured_content">${sections.join('')}</div>`;
}

function renderHero(key: string, value: number, moduleName: string): string {
    const label = formatLabel(key);
    const color = getScoreColor(value > 10 ? value / 10 : value);
    const display = Number.isInteger(value) ? value : value.toFixed(1);
    const max = value > 10 ? 100 : 10;

    return `
    <div class="${moduleName}_hero">
      <div class="${moduleName}_hero_label">${escapeHtml(label)}</div>
      <div class="${moduleName}_hero_value" style="color: ${color}">
        ${display}<span class="${moduleName}_hero_max">/${max}</span>
      </div>
    </div>
  `;
}

function renderField(
    key: string,
    value: unknown,
    schema: JsonSchemaValue,
    moduleName: string,
    depth: number,
): string {
    if (depth > MAX_DEPTH) {
        return renderJson(value, moduleName);
    }

    const label = formatLabel(key);
    const type = schema.type || inferType(value);

    if (type === 'array' && Array.isArray(value)) {
        return renderArrayField(label, value, schema, moduleName, depth);
    }

    if (type === 'object' && typeof value === 'object' && value !== null) {
        return renderObjectField(label, value as Record<string, unknown>, schema, moduleName, depth);
    }

    const rendered = renderValue(value, schema, moduleName, key);

    return `
    <div class="${moduleName}_field">
      <div class="${moduleName}_field_label">${escapeHtml(label)}</div>
      <div class="${moduleName}_field_value">${rendered}</div>
    </div>
  `;
}

function renderArrayField(
    label: string,
    items: unknown[],
    schema: JsonSchemaValue,
    moduleName: string,
    depth: number,
): string {
    if (items.length === 0) {
        return `
      <div class="${moduleName}_field">
        <div class="${moduleName}_field_label">${escapeHtml(label)}</div>
        <div class="${moduleName}_field_value ${moduleName}_empty">(none)</div>
      </div>
    `;
    }

    const itemSchema = (schema.items || { type: inferType(items[0]) }) as JsonSchemaValue;

    // Simple values as list
    if (items.every(isSimpleValue)) {
        const listItems = items.map(item => `<li>${renderSimpleValue(item, moduleName)}</li>`).join('');
        return `
      <div class="${moduleName}_field">
        <div class="${moduleName}_field_label">${escapeHtml(label)}</div>
        <ol class="${moduleName}_list">${listItems}</ol>
      </div>
    `;
    }

    // Complex values as cards
    const cards = items.map((item, index) => {
        if (typeof item === 'object' && item !== null) {
            return renderCard(item as Record<string, unknown>, itemSchema, moduleName, depth + 1, index);
        }
        return `<div class="${moduleName}_card">${renderValue(item, itemSchema, moduleName)}</div>`;
    }).join('');

    return `
    <div class="${moduleName}_field">
      <div class="${moduleName}_field_label">${escapeHtml(label)}</div>
      <div class="${moduleName}_cards">${cards}</div>
    </div>
  `;
}

function renderCard(
    data: Record<string, unknown>,
    schema: JsonSchemaValue,
    moduleName: string,
    depth: number,
    _index: number,
): string {
    const properties = (schema.properties || {}) as Record<string, JsonSchemaValue>;
    const keys = Object.keys(properties).length > 0 ? Object.keys(properties) : Object.keys(data);

    // Find title, score, and body fields
    const titleKey = keys.find(k => typeof data[k] === 'string' && (data[k] as string).length < 100);
    const scoreKey = keys.find(k => typeof data[k] === 'number' && ((data[k] as number) >= 0 && (data[k] as number) <= 100));
    const bodyKey = keys.find(k => typeof data[k] === 'string' && (data[k] as string).length >= 50 && k !== titleKey);

    let header = '';
    if (titleKey || scoreKey) {
        const titlePart = titleKey
            ? `<span class="${moduleName}_card_title">${escapeHtml(String(data[titleKey]))}</span>`
            : '';
        const scorePart = scoreKey
            ? renderScore(data[scoreKey] as number, moduleName)
            : '';
        header = `<div class="${moduleName}_card_header">${titlePart}${scorePart}</div>`;
    }

    let body = '';
    if (bodyKey) {
        body = `<div class="${moduleName}_card_body">${renderLongText(String(data[bodyKey]), moduleName)}</div>`;
    }

    const remainingKeys = keys.filter(k => k !== titleKey && k !== scoreKey && k !== bodyKey);
    const remaining = remainingKeys.map(k => {
        const v = data[k];
        if (v === undefined) return '';
        const propSchema = properties[k] || { type: inferType(v) };
        return renderField(k, v, propSchema as JsonSchemaValue, moduleName, depth + 1);
    }).filter(Boolean).join('');

    const extra = remaining ? `<div class="${moduleName}_card_extra">${remaining}</div>` : '';

    return `<div class="${moduleName}_card">${header}${body}${extra}</div>`;
}

function renderObjectField(
    label: string,
    data: Record<string, unknown>,
    schema: JsonSchemaValue,
    moduleName: string,
    depth: number,
): string {
    const properties = (schema.properties || {}) as Record<string, JsonSchemaValue>;
    const keys = Object.keys(properties).length > 0 ? Object.keys(properties) : Object.keys(data);

    const fields = keys.map(k => {
        const v = data[k];
        if (v === undefined) return '';
        const propSchema = properties[k] || { type: inferType(v) };
        return renderField(k, v, propSchema as JsonSchemaValue, moduleName, depth + 1);
    }).filter(Boolean).join('');

    return `
    <div class="${moduleName}_field">
      <div class="${moduleName}_field_label">${escapeHtml(label)}</div>
      <div class="${moduleName}_nested">${fields}</div>
    </div>
  `;
}

function renderValue(
    value: unknown,
    schema: JsonSchemaValue,
    moduleName: string,
    fieldName?: string,
): string {
    if (value === null || value === undefined) {
        return `<span class="${moduleName}_null">—</span>`;
    }

    const type = schema.type || inferType(value);

    switch (type) {
        case 'string':
            return renderString(value as string, schema, moduleName);
        case 'number':
        case 'integer':
            return renderNumber(value as number, schema, moduleName, fieldName);
        case 'boolean':
            return renderBoolean(value as boolean, moduleName);
        default:
            return `<span>${escapeHtml(String(value))}</span>`;
    }
}

function renderString(data: string, schema: JsonSchemaValue, moduleName: string): string {
    if (!data.trim()) {
        return `<span class="${moduleName}_empty">(empty)</span>`;
    }

    const format = schema.format as string | undefined;

    if (format === 'uri' || format === 'url' || isUrl(data)) {
        const display = data.length > 50 ? data.substring(0, 47) + '...' : data;
        return `<a href="${escapeHtml(data)}" target="_blank" rel="noopener" class="${moduleName}_link">${escapeHtml(display)}</a>`;
    }

    if (format === 'email' || isEmail(data)) {
        return `<a href="mailto:${escapeHtml(data)}" class="${moduleName}_link">${escapeHtml(data)}</a>`;
    }

    if (data.length > 100 || data.includes('\n')) {
        return renderLongText(data, moduleName);
    }

    return `<span>${escapeHtml(data)}</span>`;
}

function renderLongText(data: string, moduleName: string): string {
    const formatted = formatResponse(data, moduleName);
    return `<div class="${moduleName}_text">${formatted}</div>`;
}

function renderNumber(
    data: number,
    schema: JsonSchemaValue,
    moduleName: string,
    fieldName?: string,
): string {
    const label = String(schema.title || schema.description || fieldName || '').toLowerCase();

    if (looksLikeScore(label, data)) {
        return renderScore(data, moduleName);
    }

    const formatted = data.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return `<span class="${moduleName}_num">${formatted}</span>`;
}

function renderScore(data: number, moduleName: string): string {
    const normalized = data > 10 ? data / 10 : data;
    const color = getScoreColor(normalized);
    const display = Number.isInteger(data) ? data : data.toFixed(1);
    const max = data > 10 ? 100 : 10;

    return `<span class="${moduleName}_score" style="color: ${color}">${display}<span class="${moduleName}_score_max">/${max}</span></span>`;
}

function renderBoolean(data: boolean, moduleName: string): string {
    const icon = data ? 'fa-check-circle' : 'fa-times-circle';
    const cls = data ? `${moduleName}_yes` : `${moduleName}_no`;
    return `<span class="${cls}"><i class="fa-solid ${icon}"></i> ${data ? 'Yes' : 'No'}</span>`;
}

function renderSimpleValue(data: unknown, moduleName: string): string {
    if (typeof data === 'boolean') {
        return renderBoolean(data, moduleName);
    }
    if (typeof data === 'number') {
        return `<span class="${moduleName}_num">${data.toLocaleString()}</span>`;
    }
    return escapeHtml(String(data));
}

function renderJson(data: unknown, moduleName: string): string {
    const { hljs } = SillyTavern.libs;
    const json = JSON.stringify(data, null, 2);
    const highlighted = hljs.highlight(json, { language: 'json' }).value;
    return `<pre class="${moduleName}_json"><code class="hljs">${highlighted}</code></pre>`;
}

// ============================================================================
// HELPERS
// ============================================================================

function escapeHtml(value: unknown): string {
    const { DOMPurify } = SillyTavern.libs;
    const str = typeof value === 'string' ? value : String(value ?? '');
    return DOMPurify.sanitize(str, { ALLOWED_TAGS: [] });
}

function inferType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

function isSimpleValue(value: unknown): boolean {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null;
}

function formatLabel(key: string): string {
    return key
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, c => c.toUpperCase());
}

function findHeroKey(data: Record<string, unknown>): string | null {
    const heroPatterns = ['overallscore', 'totalscore', 'overall', 'total', 'score', 'rating'];

    for (const pattern of heroPatterns) {
        for (const key of Object.keys(data)) {
            if (key.toLowerCase().replace(/_/g, '') === pattern && typeof data[key] === 'number') {
                return key;
            }
        }
    }

    return null;
}

function looksLikeScore(label: string, value: number): boolean {
    const scoreWords = ['score', 'rating', 'rank', 'grade', 'level', 'confidence', 'quality'];
    if (scoreWords.some(word => label.includes(word))) return true;
    if (value >= 0 && value <= 10 && Number.isFinite(value)) return true;
    if (value >= 0 && value <= 100 && Number.isInteger(value)) return true;
    return false;
}

function getScoreColor(score: number): string {
    if (score >= 8) return 'var(--success, #2ecc71)';
    if (score >= 5) return 'var(--warning, #f39c12)';
    return 'var(--failure, #e74c3c)';
}

function isUrl(str: string): boolean {
    return /^https?:\/\//i.test(str);
}

function isEmail(str: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}
