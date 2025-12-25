// src/schema.ts
import type { StructuredOutputSchema, SchemaValidationResult, JsonSchemaValue } from './types';

// ============================================================================
// PROVIDER LIMITS
// ============================================================================

// Anthropic limits (strictest - design for these)
const ANTHROPIC_LIMITS = {
    MAX_ANYOF_VARIANTS: 8,
    MAX_DEFS: 100,
    MAX_NESTING_DEPTH: 10,
    MAX_PROPERTIES_PER_OBJECT: 100,
    MAX_ENUM_VALUES: 500,
    SUPPORTED_STRING_FORMATS: [
        'date-time', 'time', 'date', 'duration',
        'email', 'hostname', 'uri', 'ipv4', 'ipv6', 'uuid',
    ] as const,
    SUPPORTED_MINMAX_ITEMS: [0, 1] as const,
} as const;

// Features that will be silently ignored (not errors, but won't work)
const IGNORED_CONSTRAINTS = {
    numeric: ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'],
    string: ['minLength', 'maxLength'],
    array: ['maxItems', 'uniqueItems', 'contains', 'minContains', 'maxContains'],
    object: ['minProperties', 'maxProperties', 'propertyNames', 'patternProperties'],
} as const;

// Completely unsupported features (will cause errors)
const UNSUPPORTED_FEATURES = [
    'if', 'then', 'else',           // Conditional schemas
    'not',                           // Negation
    'oneOf',                         // Use anyOf instead
    'dependentRequired',             // Dependent requirements
    'dependentSchemas',              // Dependent schemas
    'unevaluatedProperties',         // OpenAPI 3.1 feature
    'unevaluatedItems',              // OpenAPI 3.1 feature
    '$dynamicRef',                   // Dynamic references
    '$dynamicAnchor',                // Dynamic anchors
] as const;

// Regex features NOT supported
const UNSUPPORTED_REGEX_FEATURES = [
    { pattern: /\(\?[=!<]/, name: 'lookahead/lookbehind assertions' },
    { pattern: /\\[1-9]/, name: 'backreferences' },
    { pattern: /\\[bB]/, name: 'word boundaries' },
] as const;

// ============================================================================
// VALIDATION TYPES
// ============================================================================

interface ValidationContext {
  errors: string[];
  warnings: string[];
  info: string[];
  stats: {
    defCount: number;
    anyOfCount: number;
    totalAnyOfVariants: number;
    maxDepth: number;
    propertyCount: number;
    optionalFieldCount: number;
    enumCount: number;
  };
  currentDepth: number;
  seenRefs: Set<string>;
  defs: Record<string, JsonSchemaValue>;
}

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

/**
 * Validates a JSON schema for Anthropic/OpenRouter structured output compatibility.
 *
 * Checks:
 * - JSON syntax validity
 * - Required ST wrapper structure (name, value)
 * - Anthropic-specific limits (anyOf variants, nesting depth, etc.)
 * - Required additionalProperties: false on all objects
 * - Unsupported JSON Schema features
 * - Regex pattern compatibility
 * - Optional field count (spawns anyOf with null)
 */
export function validateSchema(input: string): SchemaValidationResult {
    // Empty input = disable structured output
    if (!input.trim()) {
        return { valid: true, schema: undefined };
    }

    // Parse JSON
    let parsed: unknown;
    try {
        parsed = JSON.parse(input);
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Invalid JSON';
        // Try to give helpful position info
        const match = error.match(/position (\d+)/);
        const position = match ? ` (character ${match[1]})` : '';
        return { valid: false, error: `JSON syntax error${position}: ${error}` };
    }

    // Must be an object
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { valid: false, error: 'Schema must be a JSON object, not ' + (Array.isArray(parsed) ? 'array' : typeof parsed) };
    }

    const obj = parsed as Record<string, unknown>;

    // ========== ST WRAPPER VALIDATION ==========

    // Required: name (string, non-empty, valid identifier)
    if (typeof obj.name !== 'string') {
        return { valid: false, error: 'Missing required \'name\' property (string)' };
    }
    if (!obj.name.trim()) {
        return { valid: false, error: '\'name\' cannot be empty' };
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(obj.name)) {
        return { valid: false, error: `'name' must be a valid identifier (got '${obj.name}'). Use letters, numbers, underscores; start with letter or underscore.` };
    }

    // Required: value (object with type)
    if (typeof obj.value !== 'object' || obj.value === null || Array.isArray(obj.value)) {
        return { valid: false, error: 'Missing or invalid \'value\' property (must be object)' };
    }

    const value = obj.value as JsonSchemaValue;

    if (typeof value.type !== 'string' && !value.anyOf && !value.allOf && !value.$ref) {
        return { valid: false, error: '\'value\' must have a \'type\', \'anyOf\', \'allOf\', or \'$ref\'' };
    }

    // Optional: strict (boolean)
    if (obj.strict !== undefined && typeof obj.strict !== 'boolean') {
        return { valid: false, error: '\'strict\' must be a boolean if provided' };
    }

    // ========== DEEP SCHEMA VALIDATION ==========

    const ctx: ValidationContext = {
        errors: [],
        warnings: [],
        info: [],
        stats: {
            defCount: 0,
            anyOfCount: 0,
            totalAnyOfVariants: 0,
            maxDepth: 0,
            propertyCount: 0,
            optionalFieldCount: 0,
            enumCount: 0,
        },
        currentDepth: 0,
        seenRefs: new Set(),
        defs: {},
    };

    // Extract $defs/definitions first
    if (value.$defs && typeof value.$defs === 'object') {
        ctx.defs = value.$defs as Record<string, JsonSchemaValue>;
        ctx.stats.defCount = Object.keys(ctx.defs).length;
    } else if (value.definitions && typeof value.definitions === 'object') {
        ctx.defs = value.definitions as Record<string, JsonSchemaValue>;
        ctx.stats.defCount = Object.keys(ctx.defs).length;
    }

    if (ctx.stats.defCount > ANTHROPIC_LIMITS.MAX_DEFS) {
        ctx.errors.push(`Too many definitions: ${ctx.stats.defCount} (limit: ${ANTHROPIC_LIMITS.MAX_DEFS})`);
    }

    // Validate the schema tree
    validateSchemaNode(value, 'value', ctx);

    // Check optional field explosion
    if (ctx.stats.optionalFieldCount > 0) {
        const implicitAnyOfs = ctx.stats.optionalFieldCount;
        const totalAnyOfs = ctx.stats.totalAnyOfVariants + implicitAnyOfs * 2; // Each optional spawns anyOf[type, null]

        if (implicitAnyOfs > 10) {
            ctx.warnings.push(
                `${implicitAnyOfs} optional fields detected. Each spawns an implicit anyOf with null. ` +
        'Consider making fields required or reducing optionals.',
            );
        }

        if (totalAnyOfs > 50) {
            ctx.warnings.push(
                `High anyOf count (~${totalAnyOfs} including implicit nullables). ` +
        'May cause slow schema compilation or errors.',
            );
        }
    }

    // ========== BUILD RESULT ==========

    if (ctx.errors.length > 0) {
        return {
            valid: false,
            error: ctx.errors.join('\n'),
            warnings: ctx.warnings.length > 0 ? ctx.warnings : undefined,
        };
    }

    const schema: StructuredOutputSchema = {
        name: obj.name,
        strict: obj.strict as boolean | undefined ?? true, // Default to strict
        value: value,
    };

    // Add stats as info
    ctx.info.push(
        `Schema stats: ${ctx.stats.propertyCount} properties, ` +
    `${ctx.stats.defCount} definitions, ` +
    `${ctx.stats.anyOfCount} anyOf blocks, ` +
    `${ctx.stats.optionalFieldCount} optional fields, ` +
    `max depth ${ctx.stats.maxDepth}`,
    );

    return {
        valid: true,
        schema,
        warnings: ctx.warnings.length > 0 ? ctx.warnings : undefined,
        info: ctx.info.length > 0 ? ctx.info : undefined,
    };
}

// ============================================================================
// RECURSIVE NODE VALIDATION
// ============================================================================

function validateSchemaNode(
    node: JsonSchemaValue,
    path: string,
    ctx: ValidationContext,
): void {
    ctx.currentDepth++;
    ctx.stats.maxDepth = Math.max(ctx.stats.maxDepth, ctx.currentDepth);

    // Check nesting depth
    if (ctx.currentDepth > ANTHROPIC_LIMITS.MAX_NESTING_DEPTH) {
        ctx.errors.push(`${path}: Exceeds maximum nesting depth of ${ANTHROPIC_LIMITS.MAX_NESTING_DEPTH}`);
        ctx.currentDepth--;
        return;
    }

    // Check for completely unsupported features
    for (const feature of UNSUPPORTED_FEATURES) {
        if (node[feature] !== undefined) {
            ctx.errors.push(`${path}: '${feature}' is not supported`);
        }
    }

    // Check for ignored constraints (warn, don't error)
    for (const key of IGNORED_CONSTRAINTS.numeric) {
        if (node[key] !== undefined) {
            ctx.warnings.push(`${path}: '${key}' will be ignored (not supported)`);
        }
    }
    for (const key of IGNORED_CONSTRAINTS.string) {
        if (node[key] !== undefined) {
            ctx.warnings.push(`${path}: '${key}' will be ignored (not supported)`);
        }
    }
    for (const key of IGNORED_CONSTRAINTS.array) {
        if (node[key] !== undefined) {
            ctx.warnings.push(`${path}: '${key}' will be ignored (not supported)`);
        }
    }
    for (const key of IGNORED_CONSTRAINTS.object) {
        if (node[key] !== undefined) {
            ctx.warnings.push(`${path}: '${key}' will be ignored (not supported)`);
        }
    }

    // Handle $ref
    if (node.$ref && typeof node.$ref === 'string') {
        validateRef(node.$ref, path, ctx);
        ctx.currentDepth--;
        return; // $ref replaces the node
    }

    // Handle type-specific validation
    const types = Array.isArray(node.type) ? node.type : [node.type];

    for (const type of types) {
        switch (type) {
            case 'object':
                validateObjectNode(node, path, ctx);
                break;
            case 'array':
                validateArrayNode(node, path, ctx);
                break;
            case 'string':
                validateStringNode(node, path, ctx);
                break;
            case 'number':
            case 'integer':
                validateNumericNode(node, path, ctx);
                break;
            case 'boolean':
            case 'null':
                // No special validation needed
                break;
            default:
                if (type && !node.anyOf && !node.allOf) {
                    ctx.warnings.push(`${path}: Unknown type '${type}'`);
                }
        }
    }

    // Handle anyOf
    if (node.anyOf && Array.isArray(node.anyOf)) {
        validateAnyOf(node.anyOf, path, ctx);
    }

    // Handle allOf
    if (node.allOf && Array.isArray(node.allOf)) {
        validateAllOf(node.allOf, path, ctx);
    }

    // Handle enum
    if (node.enum && Array.isArray(node.enum)) {
        validateEnum(node.enum, path, ctx);
    }

    // Handle const
    if (node.const !== undefined) {
        validateConst(node.const, path, ctx);
    }

    ctx.currentDepth--;
}

// ============================================================================
// TYPE-SPECIFIC VALIDATORS
// ============================================================================

function validateObjectNode(node: JsonSchemaValue, path: string, ctx: ValidationContext): void {
    // CRITICAL: additionalProperties must be false
    if (node.additionalProperties !== false) {
        ctx.warnings.push(`${path}: Missing 'additionalProperties: false' (REQUIRED for Anthropic)`);
    }

    // Validate properties
    if (node.properties && typeof node.properties === 'object') {
        const props = node.properties as Record<string, JsonSchemaValue>;
        const propCount = Object.keys(props).length;
        ctx.stats.propertyCount += propCount;

        if (propCount > ANTHROPIC_LIMITS.MAX_PROPERTIES_PER_OBJECT) {
            ctx.warnings.push(
                `${path}: ${propCount} properties (may be slow, consider splitting)`,
            );
        }

        // Track optional fields
        const required = (node.required as string[]) || [];
        for (const [key, prop] of Object.entries(props)) {
            if (!required.includes(key)) {
                ctx.stats.optionalFieldCount++;
            }

            if (prop && typeof prop === 'object') {
                validateSchemaNode(prop, `${path}.${key}`, ctx);
            }
        }
    }
}

function validateArrayNode(node: JsonSchemaValue, path: string, ctx: ValidationContext): void {
    // minItems only supports 0 or 1
    if (node.minItems !== undefined) {
        const allowed = ANTHROPIC_LIMITS.SUPPORTED_MINMAX_ITEMS as readonly number[];
        if (!allowed.includes(node.minItems as number)) {
            ctx.warnings.push(
                `${path}: 'minItems: ${node.minItems}' not supported (only 0 or 1 allowed)`,
            );
        }
    }

    // Validate items schema
    if (node.items) {
        if (typeof node.items === 'object' && !Array.isArray(node.items)) {
            validateSchemaNode(node.items as JsonSchemaValue, `${path}.items`, ctx);
        } else if (Array.isArray(node.items)) {
            // Tuple validation (array of schemas)
            node.items.forEach((item, i) => {
                if (item && typeof item === 'object') {
                    validateSchemaNode(item as JsonSchemaValue, `${path}.items[${i}]`, ctx);
                }
            });
        }
    }

    // prefixItems (JSON Schema draft 2020-12)
    if (node.prefixItems && Array.isArray(node.prefixItems)) {
        node.prefixItems.forEach((item, i) => {
            if (item && typeof item === 'object') {
                validateSchemaNode(item as JsonSchemaValue, `${path}.prefixItems[${i}]`, ctx);
            }
        });
    }
}

function validateStringNode(node: JsonSchemaValue, path: string, ctx: ValidationContext): void {
    // Check format
    if (node.format && typeof node.format === 'string') {
        const supported = ANTHROPIC_LIMITS.SUPPORTED_STRING_FORMATS as readonly string[];
        if (!supported.includes(node.format)) {
            ctx.warnings.push(
                `${path}: format '${node.format}' may not be supported. ` +
        `Supported: ${supported.join(', ')}`,
            );
        }
    }

    // Check pattern (regex)
    if (node.pattern && typeof node.pattern === 'string') {
        validateRegexPattern(node.pattern, path, ctx);
    }
}

function validateNumericNode(node: JsonSchemaValue, path: string, ctx: ValidationContext): void {
    // All numeric constraints are ignored, already warned above
    // Nothing additional to check
}

function validateRef(ref: string, path: string, ctx: ValidationContext): void {
    // External refs not supported
    if (ref.startsWith('http://') || ref.startsWith('https://')) {
        ctx.errors.push(`${path}: External $ref not supported ('${ref}')`);
        return;
    }

    // Check for circular refs
    if (ctx.seenRefs.has(ref)) {
    // Not necessarily an error, but worth noting
        ctx.info.push(`${path}: Circular reference to '${ref}'`);
        return;
    }

    ctx.seenRefs.add(ref);

    // Validate the referenced definition exists
    const refPath = ref.replace(/^#\/(\$defs|definitions)\//, '');
    if (!ctx.defs[refPath]) {
        ctx.errors.push(`${path}: Reference '${ref}' not found in definitions`);
    }
}

function validateAnyOf(variants: unknown[], path: string, ctx: ValidationContext): void {
    ctx.stats.anyOfCount++;
    ctx.stats.totalAnyOfVariants += variants.length;

    if (variants.length > ANTHROPIC_LIMITS.MAX_ANYOF_VARIANTS) {
        ctx.errors.push(
            `${path}: anyOf has ${variants.length} variants (max: ${ANTHROPIC_LIMITS.MAX_ANYOF_VARIANTS})`,
        );
    }

    if (variants.length === 0) {
        ctx.errors.push(`${path}: anyOf cannot be empty`);
        return;
    }

    variants.forEach((variant, i) => {
        if (variant && typeof variant === 'object') {
            validateSchemaNode(variant as JsonSchemaValue, `${path}.anyOf[${i}]`, ctx);
        }
    });
}

function validateAllOf(variants: unknown[], path: string, ctx: ValidationContext): void {
    if (variants.length === 0) {
        ctx.errors.push(`${path}: allOf cannot be empty`);
        return;
    }

    variants.forEach((variant, i) => {
        if (variant && typeof variant === 'object') {
            const v = variant as Record<string, unknown>;

            // allOf with $ref not supported
            if (v.$ref) {
                ctx.errors.push(`${path}.allOf[${i}]: allOf with $ref not supported`);
            }

            validateSchemaNode(v as JsonSchemaValue, `${path}.allOf[${i}]`, ctx);
        }
    });
}

function validateEnum(values: unknown[], path: string, ctx: ValidationContext): void {
    ctx.stats.enumCount++;

    if (values.length === 0) {
        ctx.errors.push(`${path}: enum cannot be empty`);
        return;
    }

    if (values.length > ANTHROPIC_LIMITS.MAX_ENUM_VALUES) {
        ctx.warnings.push(
            `${path}: enum has ${values.length} values (may be slow)`,
        );
    }

    // Check for complex types (not allowed)
    for (let i = 0; i < values.length; i++) {
        const val = values[i];
        const t = typeof val;

        if (t !== 'string' && t !== 'number' && t !== 'boolean' && val !== null) {
            ctx.errors.push(
                `${path}.enum[${i}]: Complex type not allowed in enum (got ${t}). ` +
        'Only string, number, boolean, null permitted.',
            );
            break; // One error is enough
        }
    }

    // Check for duplicates
    const seen = new Set();
    for (const val of values) {
        const key = JSON.stringify(val);
        if (seen.has(key)) {
            ctx.warnings.push(`${path}: Duplicate value in enum: ${key}`);
            break;
        }
        seen.add(key);
    }
}

function validateConst(value: unknown, path: string, ctx: ValidationContext): void {
    const t = typeof value;
    if (t !== 'string' && t !== 'number' && t !== 'boolean' && value !== null) {
        ctx.errors.push(
            `${path}: const must be string, number, boolean, or null (got ${t})`,
        );
    }
}

function validateRegexPattern(pattern: string, path: string, ctx: ValidationContext): void {
    // Check for unsupported regex features
    for (const { pattern: check, name } of UNSUPPORTED_REGEX_FEATURES) {
        if (check.test(pattern)) {
            ctx.errors.push(`${path}: Regex pattern uses unsupported feature: ${name}`);
        }
    }

    // Try to compile the regex to catch syntax errors
    try {
        new RegExp(pattern);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Invalid regex';
        ctx.errors.push(`${path}: Invalid regex pattern: ${msg}`);
    }

    // Warn about complex quantifiers
    const complexQuantifier = /\{(\d+),(\d+)\}/g;
    let match;
    while ((match = complexQuantifier.exec(pattern)) !== null) {
        const min = parseInt(match[1], 10);
        const max = parseInt(match[2], 10);
        if (max - min > 100) {
            ctx.warnings.push(
                `${path}: Large quantifier range {${min},${max}} may cause issues`,
            );
        }
    }
}

// ============================================================================
// AUTO-FIX FUNCTIONS
// ============================================================================

/**
 * Auto-fixes a schema by:
 * 1. Adding additionalProperties: false to all objects
 * 2. Removing unsupported constraints (with description updates)
 * 3. Setting strict: true if not set
 */
export function autoFixSchema(schema: StructuredOutputSchema): StructuredOutputSchema {
    const fixed = structuredClone(schema);

    // Ensure strict mode
    if (fixed.strict === undefined) {
        fixed.strict = true;
    }

    // Fix the value recursively
    fixSchemaNode(fixed.value);

    return fixed;
}

function fixSchemaNode(node: JsonSchemaValue): void {
    // Fix objects
    if (node.type === 'object') {
        node.additionalProperties = false;

        if (node.properties && typeof node.properties === 'object') {
            for (const prop of Object.values(node.properties)) {
                if (prop && typeof prop === 'object') {
                    fixSchemaNode(prop as JsonSchemaValue);
                }
            }
        }
    }

    // Fix arrays
    if (node.type === 'array' && node.items && typeof node.items === 'object') {
        if (!Array.isArray(node.items)) {
            fixSchemaNode(node.items as JsonSchemaValue);
        } else {
            node.items.forEach(item => {
                if (item && typeof item === 'object') {
                    fixSchemaNode(item as JsonSchemaValue);
                }
            });
        }
    }

    // Fix anyOf
    if (node.anyOf && Array.isArray(node.anyOf)) {
        node.anyOf.forEach(variant => {
            if (variant && typeof variant === 'object') {
                fixSchemaNode(variant as JsonSchemaValue);
            }
        });
    }

    // Fix allOf
    if (node.allOf && Array.isArray(node.allOf)) {
        node.allOf.forEach(variant => {
            if (variant && typeof variant === 'object') {
                fixSchemaNode(variant as JsonSchemaValue);
            }
        });
    }

    // Move unsupported constraints to description
    const constraints: string[] = [];

    for (const key of IGNORED_CONSTRAINTS.numeric) {
        if (node[key] !== undefined) {
            constraints.push(`${key}: ${node[key]}`);
            delete node[key];
        }
    }

    for (const key of IGNORED_CONSTRAINTS.string) {
        if (node[key] !== undefined) {
            constraints.push(`${key}: ${node[key]}`);
            delete node[key];
        }
    }

    for (const key of IGNORED_CONSTRAINTS.array) {
        if (node[key] !== undefined) {
            constraints.push(`${key}: ${node[key]}`);
            delete node[key];
        }
    }

    // Fix minItems if invalid
    if (node.minItems !== undefined && node.minItems !== null) {
        const minItems = node.minItems as number;
        if (minItems !== 0 && minItems !== 1) {
            constraints.push(`minItems: ${minItems}`);
            node.minItems = minItems > 0 ? 1 : 0;
        }
    }

    // Append constraints to description
    if (constraints.length > 0) {
        const constraintNote = `[Constraints: ${constraints.join(', ')}]`;
        if (node.description) {
            node.description = `${node.description} ${constraintNote}`;
        } else {
            node.description = constraintNote;
        }
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Formats a schema object as a pretty-printed JSON string.
 */
export function formatSchema(schema: StructuredOutputSchema | null): string {
    if (!schema) return '';
    return JSON.stringify(schema, null, 2);
}

/**
 * Attempts to parse a structured output response.
 * Returns the parsed object or null if parsing fails.
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

/**
 * Counts optional fields in a schema (fields not in 'required' array).
 * Each optional field spawns an implicit anyOf with null.
 */
export function countOptionalFields(schema: JsonSchemaValue): number {
    let count = 0;

    function walk(node: JsonSchemaValue): void {
        if (node.type === 'object' && node.properties) {
            const required = (node.required as string[]) || [];
            const props = node.properties as Record<string, JsonSchemaValue>;

            for (const [key, prop] of Object.entries(props)) {
                if (!required.includes(key)) {
                    count++;
                }
                if (prop && typeof prop === 'object') {
                    walk(prop);
                }
            }
        }

        if (node.type === 'array' && node.items && typeof node.items === 'object') {
            if (!Array.isArray(node.items)) {
                walk(node.items as JsonSchemaValue);
            }
        }

        if (node.anyOf && Array.isArray(node.anyOf)) {
            node.anyOf.forEach(v => {
                if (v && typeof v === 'object') walk(v as JsonSchemaValue);
            });
        }

        if (node.allOf && Array.isArray(node.allOf)) {
            node.allOf.forEach(v => {
                if (v && typeof v === 'object') walk(v as JsonSchemaValue);
            });
        }
    }

    walk(schema);
    return count;
}

/**
 * Estimates schema complexity for UI feedback.
 */
export function estimateSchemaComplexity(schema: StructuredOutputSchema): {
  level: 'simple' | 'moderate' | 'complex' | 'extreme';
  score: number;
  factors: string[];
} {
    const factors: string[] = [];
    let score = 0;

    const result = validateSchema(JSON.stringify(schema));
    if (!result.valid) {
        return { level: 'extreme', score: 100, factors: ['Invalid schema'] };
    }

    // Count various complexity factors
    const value = schema.value;

    function countNodes(node: JsonSchemaValue): number {
        let count = 1;
        if (node.properties) {
            count += Object.keys(node.properties).length;
            for (const prop of Object.values(node.properties)) {
                if (prop && typeof prop === 'object') {
                    count += countNodes(prop as JsonSchemaValue);
                }
            }
        }
        if (node.items && typeof node.items === 'object' && !Array.isArray(node.items)) {
            count += countNodes(node.items as JsonSchemaValue);
        }
        if (node.anyOf && Array.isArray(node.anyOf)) count += node.anyOf.length * 2;
        if (node.allOf && Array.isArray(node.allOf)) count += node.allOf.length * 2;
        return count;
    }

    const nodeCount = countNodes(value);
    const optionalCount = countOptionalFields(value);
    const defCount = Object.keys(value.$defs || value.definitions || {}).length;

    if (nodeCount > 50) {
        score += 30;
        factors.push(`${nodeCount} schema nodes`);
    } else if (nodeCount > 20) {
        score += 15;
        factors.push(`${nodeCount} schema nodes`);
    }

    if (optionalCount > 10) {
        score += 25;
        factors.push(`${optionalCount} optional fields (implicit anyOf)`);
    } else if (optionalCount > 5) {
        score += 10;
        factors.push(`${optionalCount} optional fields`);
    }

    if (defCount > 10) {
        score += 20;
        factors.push(`${defCount} definitions`);
    } else if (defCount > 5) {
        score += 10;
        factors.push(`${defCount} definitions`);
    }

    // Determine level
    let level: 'simple' | 'moderate' | 'complex' | 'extreme';
    if (score >= 60) {
        level = 'extreme';
    } else if (score >= 35) {
        level = 'complex';
    } else if (score >= 15) {
        level = 'moderate';
    } else {
        level = 'simple';
    }

    if (factors.length === 0) {
        factors.push('Simple schema');
    }

    return { level, score, factors };
}
