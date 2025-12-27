// src/tests/pipeline-flow-test.ts

import {
    createPipelineState,
    setCharacter,
    completeStage,
    buildStagePrompt,
    buildRefinementPrompt,
    initializeFieldSelection,
} from '../pipeline';
import type { Character } from '../types';

/**
 * Test that pipeline stages receive correct data from previous stages.
 * Run this from browser console: window.testPipelineFlow()
 */
export function testPipelineFlow(): { passed: boolean; errors: string[] } {
    const errors: string[] = [];

    // Create mock character
    const mockChar: Character = {
        name: 'TestChar',
        avatar: 'test.png',
        description: 'ORIGINAL_MARKER_A1B2C3 - A test character',
        personality: 'Test personality',
        first_mes: 'Hello test',
        mes_example: '',
        scenario: '',
    };

    // Initialize pipeline
    let state = createPipelineState();
    state = setCharacter(state, mockChar, 0);

    // Need to select fields or prompts will be empty
    state = {
        ...state,
        selectedFields: initializeFieldSelection(mockChar),
    };

    // === TEST 1: Score prompt includes character ===
    const scorePrompt = buildStagePrompt(state, 'score');
    if (!scorePrompt?.includes('ORIGINAL_MARKER_A1B2C3')) {
        errors.push('FAIL: Score prompt missing original character marker');
    } else {
        console.log('✓ Score prompt includes original character');
    }

    // Simulate score completion
    state = completeStage(state, 'score', {
        response: 'SCORE_MARKER_X9Y8Z7 - Score feedback here',
        isStructured: false,
        promptUsed: scorePrompt || '',
        schemaUsed: null,
    });

    // === TEST 2: Rewrite prompt includes score results ===
    const rewritePrompt = buildStagePrompt(state, 'rewrite');
    if (!rewritePrompt?.includes('ORIGINAL_MARKER_A1B2C3')) {
        errors.push('FAIL: Rewrite prompt missing original character marker');
    } else {
        console.log('✓ Rewrite prompt includes original character');
    }

    if (!rewritePrompt?.includes('SCORE_MARKER_X9Y8Z7')) {
        errors.push('FAIL: Rewrite prompt missing score results marker');
    } else {
        console.log('✓ Rewrite prompt includes score results');
    }

    // Simulate rewrite completion
    state = completeStage(state, 'rewrite', {
        response: 'REWRITE_MARKER_P4Q5R6 - Rewritten character here',
        isStructured: false,
        promptUsed: rewritePrompt || '',
        schemaUsed: null,
    });

    // === TEST 3: Analyze prompt includes original AND rewrite ===
    const analyzePrompt = buildStagePrompt(state, 'analyze');
    if (!analyzePrompt?.includes('ORIGINAL_MARKER_A1B2C3')) {
        errors.push('FAIL: Analyze prompt missing original character marker');
    } else {
        console.log('✓ Analyze prompt includes original character');
    }

    if (!analyzePrompt?.includes('REWRITE_MARKER_P4Q5R6')) {
        errors.push('FAIL: Analyze prompt missing rewrite results marker');
    } else {
        console.log('✓ Analyze prompt includes rewrite results');
    }

    // Simulate analyze completion
    state = completeStage(state, 'analyze', {
        response: 'ANALYZE_MARKER_M1N2O3 - Analysis here',
        isStructured: false,
        promptUsed: analyzePrompt || '',
        schemaUsed: null,
    });

    // === TEST 4: Refinement prompt includes rewrite AND analysis ===
    const refinementPrompt = buildRefinementPrompt(state);

    if (!refinementPrompt?.includes('ORIGINAL_MARKER_A1B2C3')) {
        errors.push('FAIL: Refinement prompt missing original character marker');
    } else {
        console.log('✓ Refinement prompt includes original character');
    }

    if (!refinementPrompt?.includes('REWRITE_MARKER_P4Q5R6')) {
        errors.push('FAIL: Refinement prompt missing current rewrite marker');
    } else {
        console.log('✓ Refinement prompt includes current rewrite');
    }

    if (!refinementPrompt?.includes('ANALYZE_MARKER_M1N2O3')) {
        errors.push('FAIL: Refinement prompt missing analysis marker');
    } else {
        console.log('✓ Refinement prompt includes analysis');
    }

    // Summary
    console.log('\n=== PIPELINE FLOW TEST RESULTS ===');
    if (errors.length === 0) {
        console.log('✓ ALL TESTS PASSED');
        return { passed: true, errors: [] };
    } else {
        console.error('✗ FAILURES:');
        errors.forEach(e => console.error('  ' + e));
        return { passed: false, errors };
    }
}
