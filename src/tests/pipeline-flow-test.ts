// src/tests/pipeline-flow-test.ts

import {
    createPipelineState,
    setCharacter,
    completeStage,
    buildStagePrompt,
    buildRefinementPrompt,
    initializeFieldSelection,
    startRefinement,
    completeRefinement,
    generateExportData,
} from '../pipeline';
import type { Character } from '../types';

/**
 * Test that pipeline stages receive correct data from previous stages,
 * INCLUDING iteration/refinement cycles and export functionality.
 *
 * Run this from browser console: window.testPipelineFlow()
 */
export function testPipelineFlow(): { passed: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    console.log('=== PIPELINE FLOW TEST ===\n');

    // Create mock character with unique marker
    const mockChar: Character = {
        name: 'TestChar',
        avatar: 'test.png',
        description: 'ORIGINAL_CHAR_MARKER_A1B2C3 - A test character',
        personality: 'Test personality',
        first_mes: 'Hello test',
        mes_example: '',
        scenario: '',
    };

    // ========================================================================
    // PHASE 1: Initial pipeline pass
    // ========================================================================
    console.log('--- PHASE 1: Initial Pipeline Pass ---\n');

    let state = createPipelineState();
    state = setCharacter(state, mockChar, 0);
    state = { ...state, selectedFields: initializeFieldSelection(mockChar) };

    // TEST 1.1: Score sees original character
    const scorePrompt = buildStagePrompt(state, 'score');
    assertContains(scorePrompt, 'ORIGINAL_CHAR_MARKER_A1B2C3',
        '1.1 Score prompt includes original character', errors);

    // Complete score with a LONG response to test truncation
    const scoreResponse = 'SCORE_V1_MARKER_X9Y8Z7 - Initial score feedback. '.repeat(50) + 'SCORE_V1_END_MARKER';
    state = completeStage(state, 'score', {
        response: scoreResponse,
        isStructured: false,
        promptUsed: scorePrompt || '',
        schemaUsed: null,
    });

    // TEST 1.2: Rewrite sees original + score
    const rewritePrompt = buildStagePrompt(state, 'rewrite');
    assertContains(rewritePrompt, 'ORIGINAL_CHAR_MARKER_A1B2C3',
        '1.2 Rewrite prompt includes original character', errors);
    assertContains(rewritePrompt, 'SCORE_V1_MARKER_X9Y8Z7',
        '1.3 Rewrite prompt includes score results', errors);

    // Complete rewrite with V1 marker and LONG response
    const rewriteV1Response = 'REWRITE_V1_MARKER_P4Q5R6 - First rewrite attempt. '.repeat(50) + 'REWRITE_V1_END_MARKER';
    state = completeStage(state, 'rewrite', {
        response: rewriteV1Response,
        isStructured: false,
        promptUsed: rewritePrompt || '',
        schemaUsed: null,
    });

    // TEST 1.3: Analyze sees original + rewrite V1
    const analyzePrompt1 = buildStagePrompt(state, 'analyze');
    assertContains(analyzePrompt1, 'ORIGINAL_CHAR_MARKER_A1B2C3',
        '1.4 Analyze prompt includes original character', errors);
    assertContains(analyzePrompt1, 'REWRITE_V1_MARKER_P4Q5R6',
        '1.5 Analyze prompt includes rewrite V1', errors);
    assertNotContains(analyzePrompt1, 'REWRITE_V2',
        '1.6 Analyze prompt does NOT contain V2 (doesn\'t exist yet)', errors);

    // Complete analyze with LONG response
    const analyzeV1Response = 'ANALYSIS_V1_MARKER_M1N2O3 - First analysis, needs refinement. '.repeat(50) + 'ANALYSIS_V1_END_MARKER';
    state = completeStage(state, 'analyze', {
        response: analyzeV1Response,
        isStructured: false,
        promptUsed: analyzePrompt1 || '',
        schemaUsed: null,
    });

    console.log('');

    // ========================================================================
    // PHASE 2: First refinement iteration
    // ========================================================================
    console.log('--- PHASE 2: First Refinement Iteration ---\n');

    // TEST 2.1: Refinement prompt sees original + rewrite V1 + analysis V1
    const refinementPrompt1 = buildRefinementPrompt(state);
    assertContains(refinementPrompt1, 'ORIGINAL_CHAR_MARKER_A1B2C3',
        '2.1 Refinement prompt includes original character', errors);
    assertContains(refinementPrompt1, 'REWRITE_V1_MARKER_P4Q5R6',
        '2.2 Refinement prompt includes rewrite V1', errors);
    assertContains(refinementPrompt1, 'ANALYSIS_V1_MARKER_M1N2O3',
        '2.3 Refinement prompt includes analysis V1', errors);

    // Start refinement
    state = startRefinement(state);

    // TEST 2.2: After startRefinement, analyze should be cleared
    if (state.results.analyze !== null) {
        errors.push('FAIL: 2.4 Analyze should be null after startRefinement');
    } else {
        console.log('✓ 2.4 Analyze cleared after startRefinement');
    }

    // TEST 2.3: Iteration count should increment
    if (state.iterationCount !== 1) {
        errors.push(`FAIL: 2.5 Iteration count should be 1, got ${state.iterationCount}`);
    } else {
        console.log('✓ 2.5 Iteration count is 1');
    }

    // TEST 2.4: History should have 1 entry with V1 markers
    if (state.iterationHistory.length !== 1) {
        errors.push(`FAIL: 2.6 History should have 1 entry, got ${state.iterationHistory.length}`);
    } else {
        console.log('✓ 2.6 History has 1 entry');

        const historyEntry = state.iterationHistory[0];
        assertContains(historyEntry.rewriteResponse, 'REWRITE_V1_MARKER_P4Q5R6',
            '2.7 History entry contains rewrite V1', errors);
        assertContains(historyEntry.analysisResponse, 'ANALYSIS_V1_MARKER_M1N2O3',
            '2.8 History entry contains analysis V1', errors);
    }

    // Complete refinement with V2 rewrite (LONG)
    const rewriteV2Response = 'REWRITE_V2_MARKER_J7K8L9 - Second rewrite after refinement. '.repeat(50) + 'REWRITE_V2_END_MARKER';
    state = completeRefinement(state, {
        response: rewriteV2Response,
        isStructured: false,
        promptUsed: refinementPrompt1 || '',
        schemaUsed: null,
    });

    // TEST 2.5: Current rewrite should now be V2
    assertContains(state.results.rewrite?.response, 'REWRITE_V2_MARKER_J7K8L9',
        '2.9 Current rewrite is V2 after refinement', errors);
    assertNotContains(state.results.rewrite?.response, 'REWRITE_V1',
        '2.10 Current rewrite does NOT contain V1', errors);

    console.log('');

    // ========================================================================
    // PHASE 3: Analyze the refined rewrite
    // ========================================================================
    console.log('--- PHASE 3: Analyze Refined Rewrite ---\n');

    // TEST 3.1: Analyze should see original + V2 rewrite (NOT V1)
    const analyzePrompt2 = buildStagePrompt(state, 'analyze');
    assertContains(analyzePrompt2, 'ORIGINAL_CHAR_MARKER_A1B2C3',
        '3.1 Analyze V2 prompt includes original character', errors);
    assertContains(analyzePrompt2, 'REWRITE_V2_MARKER_J7K8L9',
        '3.2 Analyze V2 prompt includes rewrite V2', errors);
    assertNotContains(analyzePrompt2, 'REWRITE_V1_MARKER_P4Q5R6',
        '3.3 Analyze V2 prompt does NOT contain rewrite V1 (CRITICAL)', errors);

    // Complete analyze V2 (LONG)
    const analyzeV2Response = 'ANALYSIS_V2_MARKER_T4U5V6 - Second analysis of refined rewrite. '.repeat(50) + 'ANALYSIS_V2_END_MARKER';
    state = completeStage(state, 'analyze', {
        response: analyzeV2Response,
        isStructured: false,
        promptUsed: analyzePrompt2 || '',
        schemaUsed: null,
    });

    console.log('');

    // ========================================================================
    // PHASE 4: Second refinement iteration
    // ========================================================================
    console.log('--- PHASE 4: Second Refinement Iteration ---\n');

    // TEST 4.1: Second refinement should see original + V2 rewrite + V2 analysis
    const refinementPrompt2 = buildRefinementPrompt(state);
    assertContains(refinementPrompt2, 'ORIGINAL_CHAR_MARKER_A1B2C3',
        '4.1 Refinement 2 includes original character', errors);
    assertContains(refinementPrompt2, 'REWRITE_V2_MARKER_J7K8L9',
        '4.2 Refinement 2 includes rewrite V2', errors);
    assertContains(refinementPrompt2, 'ANALYSIS_V2_MARKER_T4U5V6',
        '4.3 Refinement 2 includes analysis V2', errors);

    // CRITICAL: Should NOT contain V1 markers
    assertNotContains(refinementPrompt2, 'REWRITE_V1_MARKER_P4Q5R6',
        '4.4 Refinement 2 does NOT contain rewrite V1 (CRITICAL)', errors);
    assertNotContains(refinementPrompt2, 'ANALYSIS_V1_MARKER_M1N2O3',
        '4.5 Refinement 2 does NOT contain analysis V1 (CRITICAL)', errors);

    // Start second refinement
    state = startRefinement(state);

    // TEST 4.2: History should now have 2 entries
    if (state.iterationHistory.length !== 2) {
        errors.push(`FAIL: 4.6 History should have 2 entries, got ${state.iterationHistory.length}`);
    } else {
        console.log('✓ 4.6 History has 2 entries');

        const entry1 = state.iterationHistory[0];
        const entry2 = state.iterationHistory[1];

        assertContains(entry1.rewriteResponse, 'REWRITE_V1',
            '4.7 History[0] contains V1 rewrite', errors);
        assertContains(entry2.rewriteResponse, 'REWRITE_V2',
            '4.8 History[1] contains V2 rewrite', errors);
    }

    // TEST 4.3: Iteration count should be 2
    if (state.iterationCount !== 2) {
        errors.push(`FAIL: 4.9 Iteration count should be 2, got ${state.iterationCount}`);
    } else {
        console.log('✓ 4.9 Iteration count is 2');
    }

    // Complete with V3 rewrite (LONG)
    const rewriteV3Response = 'REWRITE_V3_MARKER_W1X2Y3 - Third rewrite. '.repeat(50) + 'REWRITE_V3_END_MARKER';
    state = completeRefinement(state, {
        response: rewriteV3Response,
        isStructured: false,
        promptUsed: refinementPrompt2 || '',
        schemaUsed: null,
    });

    console.log('');

    // ========================================================================
    // PHASE 5: Verify V3 state
    // ========================================================================
    console.log('--- PHASE 5: Verify V3 State ---\n');

    // TEST 5.1: Current rewrite should be V3
    assertContains(state.results.rewrite?.response, 'REWRITE_V3_MARKER_W1X2Y3',
        '5.1 Current rewrite is V3', errors);

    // TEST 5.2: Analyze prompt for V3 should have original + V3 only
    const analyzePrompt3 = buildStagePrompt(state, 'analyze');
    assertContains(analyzePrompt3, 'ORIGINAL_CHAR_MARKER_A1B2C3',
        '5.2 Analyze V3 includes original', errors);
    assertContains(analyzePrompt3, 'REWRITE_V3_MARKER_W1X2Y3',
        '5.3 Analyze V3 includes rewrite V3', errors);
    assertNotContains(analyzePrompt3, 'REWRITE_V1',
        '5.4 Analyze V3 does NOT contain V1', errors);
    assertNotContains(analyzePrompt3, 'REWRITE_V2',
        '5.5 Analyze V3 does NOT contain V2', errors);

    // Complete analyze V3 for export testing
    const analyzeV3Response = 'ANALYSIS_V3_MARKER_Z9A8B7 - Third analysis. '.repeat(50) + 'ANALYSIS_V3_END_MARKER';
    state = completeStage(state, 'analyze', {
        response: analyzeV3Response,
        isStructured: false,
        promptUsed: analyzePrompt3 || '',
        schemaUsed: null,
    });

    console.log('');

    // ========================================================================
    // PHASE 6: Score Isolation Check
    // ========================================================================
    console.log('--- PHASE 6: Score Isolation Check ---\n');

    const scorePromptAfterIterations = buildStagePrompt(state, 'score');
    assertContains(scorePromptAfterIterations, 'ORIGINAL_CHAR_MARKER_A1B2C3',
        '6.1 Score (after iterations) includes original', errors);
    assertNotContains(scorePromptAfterIterations, 'REWRITE_V1',
        '6.2 Score does NOT contain any rewrite V1', errors);
    assertNotContains(scorePromptAfterIterations, 'REWRITE_V2',
        '6.3 Score does NOT contain any rewrite V2', errors);
    assertNotContains(scorePromptAfterIterations, 'REWRITE_V3',
        '6.4 Score does NOT contain any rewrite V3', errors);

    console.log('');

    // ========================================================================
    // PHASE 7: Export Data Integrity
    // ========================================================================
    console.log('--- PHASE 7: Export Data Integrity ---\n');

    const exportData = generateExportData(state);

    if (!exportData) {
        errors.push('FAIL: 7.0 Export data is null');
    } else {
        // TEST 7.1: Export contains character name
        assertContains(exportData, 'TestChar',
            '7.1 Export contains character name', errors);

        // TEST 7.2: Export contains CURRENT score (V1 - score doesn't iterate)
        assertContains(exportData, 'SCORE_V1_MARKER_X9Y8Z7',
            '7.2 Export contains score results', errors);
        assertContains(exportData, 'SCORE_V1_END_MARKER',
            '7.3 Export contains COMPLETE score (end marker present)', errors);

        // TEST 7.3: Export contains CURRENT rewrite (V3, not V1 or V2)
        assertContains(exportData, 'REWRITE_V3_MARKER_W1X2Y3',
            '7.4 Export contains current rewrite V3', errors);
        assertContains(exportData, 'REWRITE_V3_END_MARKER',
            '7.5 Export contains COMPLETE rewrite V3 (end marker present)', errors);

        // TEST 7.4: Export contains CURRENT analysis (V3)
        assertContains(exportData, 'ANALYSIS_V3_MARKER_Z9A8B7',
            '7.6 Export contains current analysis V3', errors);
        assertContains(exportData, 'ANALYSIS_V3_END_MARKER',
            '7.7 Export contains COMPLETE analysis V3 (end marker present)', errors);

        // TEST 7.5: Export iteration history contains V1 and V2 (historical)
        assertContains(exportData, 'REWRITE_V1_MARKER_P4Q5R6',
            '7.8 Export history contains rewrite V1', errors);
        assertContains(exportData, 'REWRITE_V1_END_MARKER',
            '7.9 Export history contains COMPLETE rewrite V1 (end marker)', errors);
        assertContains(exportData, 'REWRITE_V2_MARKER_J7K8L9',
            '7.10 Export history contains rewrite V2', errors);
        assertContains(exportData, 'REWRITE_V2_END_MARKER',
            '7.11 Export history contains COMPLETE rewrite V2 (end marker)', errors);

        // TEST 7.6: Export history contains V1 and V2 analyses
        assertContains(exportData, 'ANALYSIS_V1_MARKER_M1N2O3',
            '7.12 Export history contains analysis V1', errors);
        assertContains(exportData, 'ANALYSIS_V1_END_MARKER',
            '7.13 Export history contains COMPLETE analysis V1 (end marker)', errors);
        assertContains(exportData, 'ANALYSIS_V2_MARKER_T4U5V6',
            '7.14 Export history contains analysis V2', errors);
        assertContains(exportData, 'ANALYSIS_V2_END_MARKER',
            '7.15 Export history contains COMPLETE analysis V2 (end marker)', errors);

        // TEST 7.7: Verify export length is reasonable (not truncated)
        const expectedMinLength = scoreResponse.length + rewriteV3Response.length + analyzeV3Response.length +
            rewriteV1Response.length + analyzeV1Response.length +
            rewriteV2Response.length + analyzeV2Response.length;

        if (exportData.length < expectedMinLength * 0.9) {
            errors.push(`FAIL: 7.16 Export appears truncated. Expected ~${expectedMinLength} chars, got ${exportData.length}`);
        } else {
            console.log(`✓ 7.16 Export length OK (${exportData.length} chars, expected ~${expectedMinLength})`);
        }

        // TEST 7.8: Export has correct iteration count
        assertContains(exportData, 'Iterations:** 2',
            '7.17 Export shows correct iteration count', errors);

        // TEST 7.9: Export has section headers
        assertContains(exportData, '## Score Results',
            '7.18 Export has Score Results section', errors);
        assertContains(exportData, '## Rewrite Results',
            '7.19 Export has Rewrite Results section', errors);
        assertContains(exportData, '## Analysis Results',
            '7.20 Export has Analysis Results section', errors);
        assertContains(exportData, '## Iteration History',
            '7.21 Export has Iteration History section', errors);
    }

    console.log('');

    // ========================================================================
    // PHASE 8: Data Integrity - Full Response Storage
    // ========================================================================
    console.log('--- PHASE 8: Data Integrity - Full Response Storage ---\n');

    // Verify the actual state objects have complete data
    const storedScore = state.results.score?.response || '';
    const storedRewrite = state.results.rewrite?.response || '';
    const storedAnalyze = state.results.analyze?.response || '';

    // Check score is complete
    assertContains(storedScore, 'SCORE_V1_MARKER_X9Y8Z7',
        '8.1 Stored score has start marker', errors);
    assertContains(storedScore, 'SCORE_V1_END_MARKER',
        '8.2 Stored score has end marker (not truncated)', errors);
    if (storedScore.length !== scoreResponse.length) {
        errors.push(`FAIL: 8.3 Stored score length mismatch. Expected ${scoreResponse.length}, got ${storedScore.length}`);
    } else {
        console.log(`✓ 8.3 Stored score length matches (${storedScore.length} chars)`);
    }

    // Check rewrite is complete (should be V3)
    assertContains(storedRewrite, 'REWRITE_V3_MARKER_W1X2Y3',
        '8.4 Stored rewrite has V3 start marker', errors);
    assertContains(storedRewrite, 'REWRITE_V3_END_MARKER',
        '8.5 Stored rewrite has V3 end marker (not truncated)', errors);
    if (storedRewrite.length !== rewriteV3Response.length) {
        errors.push(`FAIL: 8.6 Stored rewrite length mismatch. Expected ${rewriteV3Response.length}, got ${storedRewrite.length}`);
    } else {
        console.log(`✓ 8.6 Stored rewrite length matches (${storedRewrite.length} chars)`);
    }

    // Check analyze is complete (should be V3)
    assertContains(storedAnalyze, 'ANALYSIS_V3_MARKER_Z9A8B7',
        '8.7 Stored analyze has V3 start marker', errors);
    assertContains(storedAnalyze, 'ANALYSIS_V3_END_MARKER',
        '8.8 Stored analyze has V3 end marker (not truncated)', errors);
    if (storedAnalyze.length !== analyzeV3Response.length) {
        errors.push(`FAIL: 8.9 Stored analyze length mismatch. Expected ${analyzeV3Response.length}, got ${storedAnalyze.length}`);
    } else {
        console.log(`✓ 8.9 Stored analyze length matches (${storedAnalyze.length} chars)`);
    }

    // Check history entries are complete
    for (let i = 0; i < state.iterationHistory.length; i++) {
        const entry = state.iterationHistory[i];
        const vNum = i + 1;

        assertContains(entry.rewriteResponse, `REWRITE_V${vNum}_END_MARKER`,
            `8.${10 + i * 2} History[${i}] rewrite is complete (has end marker)`, errors);
        assertContains(entry.analysisResponse, `ANALYSIS_V${vNum}_END_MARKER`,
            `8.${11 + i * 2} History[${i}] analysis is complete (has end marker)`, errors);
    }

    console.log('');

    // ========================================================================
    // SUMMARY
    // ========================================================================
    console.log('=== PIPELINE FLOW TEST RESULTS ===\n');

    if (errors.length === 0) {
        console.log('✅ ALL TESTS PASSED');
        console.log('   8 phases, 40+ assertions');
        return { passed: true, errors: [], warnings };
    } else {
        console.error(`❌ ${errors.length} FAILURE(S):`);
        errors.forEach(e => console.error('   ' + e));
        return { passed: false, errors, warnings };
    }
}

// ============================================================================
// ASSERTION HELPERS
// ============================================================================

function assertContains(
    haystack: string | null | undefined,
    needle: string,
    testName: string,
    errors: string[],
): void {
    if (!haystack) {
        errors.push(`FAIL: ${testName} - haystack is null/undefined`);
        console.error(`✗ ${testName} - haystack is null/undefined`);
        return;
    }
    if (haystack.includes(needle)) {
        console.log(`✓ ${testName}`);
    } else {
        errors.push(`FAIL: ${testName}`);
        console.error(`✗ ${testName}`);
        console.debug(`  Expected to find: "${needle}"`);
        console.debug(`  In (first 200 chars): "${haystack.substring(0, 200)}..."`);
    }
}

function assertNotContains(
    haystack: string | null | undefined,
    needle: string,
    testName: string,
    errors: string[],
): void {
    if (!haystack) {
        console.log(`✓ ${testName}`);
        return;
    }
    if (!haystack.includes(needle)) {
        console.log(`✓ ${testName}`);
    } else {
        errors.push(`FAIL: ${testName} - found "${needle}" when it should NOT be present`);
        console.error(`✗ ${testName}`);
    }
}

// Expose to window for console access
if (typeof window !== 'undefined') {
    (window as unknown as { testPipelineFlow: typeof testPipelineFlow }).testPipelineFlow = testPipelineFlow;
}
