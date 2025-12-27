# SillyTavern Character Tools

**An LLM-powered extension for analyzing, scoring, and iteratively improving character cards.**

Stop guessing if your character card is good. Let an AI tear it apart, tell you exactly what's wrong, rewrite it better, and then verify it didn't lose the character's soul in the process.

![Main Interface Screenshot Placeholder]
<!-- SCREENSHOT: Full popup with a character selected, showing the pipeline nav with Score/Rewrite/Analyze stages, and some results visible -->

---

## What It Does

Character Tools runs your character cards through a three-stage pipeline:

1. **Score** — Get brutal, field-by-field feedback on what works and what's garbage
2. **Rewrite** — Generate an improved version based on that feedback
3. **Analyze** — Compare the rewrite against the original to catch "soul loss" and regressions

Then iterate until it's actually good, or accept and move on.

---

## Features

### 🎯 Field-Level Scoring

Not just "this card is a 7/10" — you get specific ratings and feedback for each field: description, personality, first message, scenario, example messages, system prompt, and more.

![Score Results Screenshot Placeholder]
<!-- SCREENSHOT: Score results panel showing field-by-field breakdown with scores, strengths, weaknesses, and suggestions -->

### ✍️ Smart Rewrites

The rewrite stage uses your score feedback to generate improvements. It knows what was weak and targets those areas while preserving what worked.

### 🔍 Soul Check Analysis

The analyze stage compares your rewrite against the original and answers the critical question: *Does this still feel like the same character?*

- What was preserved
- What was lost
- What was gained
- Verdict: **ACCEPT**, **NEEDS_REFINEMENT**, or **REGRESSION**

![Analysis Results Screenshot Placeholder]
<!-- SCREENSHOT: Analyze results showing the verdict badge, preserved/lost/gained sections -->

### 🔄 Iterative Refinement

If the analysis says "needs work," hit Refine. The extension:

- Saves your current iteration to history
- Generates a new rewrite addressing the identified issues
- Lets you analyze again
- Repeat until it's right

Full iteration history with one-click revert to any previous version.

![Iteration History Screenshot Placeholder]
<!-- SCREENSHOT: Iteration history panel showing 2-3 iterations with verdict badges and revert buttons -->

### 📋 Selective Field Processing

Don't want to rewrite the whole card? Select only the fields you care about. Working on alternate greetings? Pick specific ones.

![Field Selection Screenshot Placeholder]
<!-- SCREENSHOT: Character preview with field checkboxes, showing some fields selected and some not -->

### 📊 Structured Output Support

Enable JSON schemas for consistent, parseable results. Built-in schemas for Score and Analyze stages, or create your own.

**Don't know JSON Schema?** No problem. Click **Generate** and describe what you want in plain English:

> "rating 1-10, list of issues, summary, and a boolean for whether it needs more work"

The AI builds the schema for you.

![Schema Generation Screenshot Placeholder]
<!-- SCREENSHOT: The schema generation input dialog, or the schema textarea with a generated schema -->

### 💾 Preset System

Save your prompts and schemas as presets. Includes sensible defaults, but you can customize everything:

- Stage-specific prompts
- Custom JSON schemas
- System prompt additions
- Refinement instructions

---

## Compatibility

### ✅ Confirmed Working

- **Chat Completion APIs** — OpenRouter, OpenAI, Anthropic/Claude, Google AI Studio, Mistral, Groq, etc.

### ❓ Unknown

- **Text Completion APIs** — Might work, might not. We haven't tested it. If you try it and it works (or explodes), let us know.

The extension uses SillyTavern's `generateRaw` function, which *should* work with text completion, but structured output and the prompt format may behave differently.

---

## Installation

### From SillyTavern (Recommended)

1. Open SillyTavern
2. Go to **Extensions** panel (stacked cubes icon)
3. Click **Install Extension**
4. Paste: `https://github.com/Inktomi93/SillyTavern-CharacterTools`
5. Click **Install**
6. Refresh your browser

### Manual Installation

```bash
cd SillyTavern/data/<your-user>/extensions/third-party/
git clone https://github.com/Inktomi93/SillyTavern-CharacterTools
```

Restart SillyTavern after installation.

---

## Quick Start

### 1. Open the Extension

Find **Character Tools** in the Extensions panel, click **Open Character Tools**.

![Extension Panel Screenshot Placeholder]
<!-- SCREENSHOT: Extensions panel showing Character Tools entry with the Open button -->

### 2. Select a Character

Search for a character by name. The extension shows all populated fields with token counts.

![Character Search Screenshot Placeholder]
<!-- SCREENSHOT: Character search dropdown with results showing avatars and descriptions -->

### 3. Choose Your Fields

By default, all populated fields are selected. Uncheck any you want to skip. For alternate greetings, you can select specific ones.

### 4. Configure the Pipeline

The pipeline has three stages: **Score → Rewrite → Analyze**

- Check/uncheck stages to include them
- Click a stage button to view/edit its configuration
- Each stage has its own prompt and optional JSON schema

![Pipeline Nav Screenshot Placeholder]
<!-- SCREENSHOT: Pipeline navigation showing all three stages with checkboxes, one stage active -->

### 5. Run It

- **Run Stage** — Run just the currently selected stage
- **Run Selected** — Run all checked stages in sequence

### 6. Review Results

Results appear in the panel below. For each stage you can:

- **Lock** — Prevent accidental regeneration
- **Copy** — Copy to clipboard
- **Regenerate** — Try again with the same settings
- **Continue** — Move to the next stage

![Results Panel Screenshot Placeholder]
<!-- SCREENSHOT: Results panel showing formatted output with toolbar (lock, copy buttons) and footer actions -->

### 7. Iterate If Needed

After Analyze, if the verdict is **NEEDS_REFINEMENT**:

1. Click **Refine** to generate an improved rewrite
2. Click **Analyze This Rewrite** to check the new version
3. Repeat until you get **ACCEPT** or decide it's good enough
4. Click **Accept Rewrite** to lock it as final

### 8. Export

Click **Export** to download a markdown file with:

- All stage results
- Full iteration history
- Timestamps and metadata

---

## The Pipeline in Detail

### Score Stage

**Input:** Your character card (selected fields only)

**Output:** Field-by-field analysis with:

- Numerical rating (1-10)
- Strengths
- Weaknesses
- Specific improvement suggestions
- Overall score and priority improvements

**When to use:** Always start here. Even if you think your card is good, the score gives you a baseline and identifies blind spots.

### Rewrite Stage

**Input:** Original character + Score feedback (if available)

**Output:** Complete rewritten character card

**When to use:** After scoring, or standalone if you just want a fresh take. The rewrite incorporates score feedback automatically when available.

### Analyze Stage

**Input:** Original character + Current rewrite

**Output:** Comparison analysis with:

- What was preserved from the original
- What was lost (the "soul check")
- What was improved
- Verdict: ACCEPT / NEEDS_REFINEMENT / REGRESSION
- Specific issues to address (if refinement needed)

**When to use:** After every rewrite. This is your quality gate.

---

## Refinement Loop

The real power is in iteration:

```text
Score → Rewrite → Analyze
                    ↓
              NEEDS_REFINEMENT?
                    ↓
                 Refine → Analyze → ...
                    ↓
                 ACCEPT?
                    ↓
                  Done
```

Each iteration is saved. If iteration #3 is worse than #2, revert with one click.

---

## Settings

Access settings via the ⚙️ icon in the popup header.

![Settings Modal Screenshot Placeholder]
<!-- SCREENSHOT: Settings modal showing the Generation section with "Use Current Settings" toggle -->

### Generation

- **Use Current SillyTavern Settings** (recommended) — Uses your active API connection
- **Custom Generation** — Override with specific source, model, temperature, etc.

### System Prompt

The system prompt is sent with every generation. You can:

- Add your own instructions (appended to the base)
- Edit the base prompt (advanced, affects all stages)

### Refinement Prompt

Instructions for the refinement loop. Customize how the AI approaches fixing identified issues.

### Presets

- View all prompt and schema presets
- Delete custom presets (builtins are locked)
- Export/import custom presets for backup or sharing

---

## Creating Custom Schemas

You have two options:

### Option 1: Generate from Description

Click the **Generate** button under the schema textarea and describe what you want:

> "scores for description, personality, and first message (1-10 each), a list of the top 3 problems, and an overall recommendation"

The AI creates a valid JSON schema from your description. Review it, tweak if needed, save as a preset.

### Option 2: Write JSON Schema Manually

If you know JSON Schema, write it directly. The extension validates as you type and warns about compatibility issues with different providers.

Required format:

```json
{
  "name": "MySchema",
  "strict": true,
  "value": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "score": { "type": "number" },
      "issues": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["score", "issues"]
  }
}
```

Use **Validate** to check for errors, **Auto-Fix** to add missing `additionalProperties: false`, and **Format** to prettify.

---

## Keyboard Shortcuts

| Shortcut       | Action            |
|----------------|-------------------|
| `Ctrl+Enter`   | Run current stage |
| `Escape`       | Cancel generation |

---

## Tips

### For Best Results

1. **Use a capable model** — Claude, GPT-4, or similar. Smaller models may struggle with nuanced analysis.

2. **Don't skip Analyze** — It's tempting to just take the rewrite, but the soul check catches problems you won't notice until you're mid-roleplay.

3. **Trust REGRESSION verdicts** — If the AI says it got worse, it probably did. Revert and try different refinement instructions.

4. **Iterate 2-3 times max** — If it's not converging after 3 iterations, the original might need manual work first.

### Customizing Prompts

The built-in prompts are solid defaults, but you can:

- Create stage-specific presets for different character types
- Add constraints ("keep it under 500 words", "maintain first-person perspective")
- Use placeholders like `{{original_character}}` and `{{score_results}}` for precise control

### Structured Output

JSON schemas force consistent output format. Good for:

- Programmatic processing of results
- Ensuring the AI doesn't skip sections
- Getting machine-readable scores

Not all models support structured output well. If results look wrong, try disabling it.

---

## Troubleshooting

### Extension doesn't appear

- Refresh your browser
- Check it's enabled in the Extensions panel
- Look for errors in browser console (F12)

### Generation fails

- Verify your API is connected (green dot in popup header)
- Check SillyTavern console for error details
- Try a different model if one is consistently failing

### Results look wrong or incomplete

- Disable Structured Output if your model doesn't support it well
- Try a more capable model
- Check that your prompts aren't conflicting with the base instructions

### "No character selected" error

- Make sure you've searched and clicked on a character
- The character must have at least one populated field

### Using Text Completion API and it's broken

- This extension was built for Chat Completion. Text Completion *might* work but is untested.
- Try switching to a Chat Completion source if available.

---

## Requirements

- SillyTavern 1.12.0+
- A connected LLM API (Chat Completion recommended — OpenRouter, OpenAI, Claude, etc.)
- A model capable of following complex instructions (Claude Sonnet/Opus, GPT-4, etc. recommended)

---

## License

AGPL-3.0

---

## Support

[GitHub Issues](https://github.com/Inktomi93/SillyTavern-CharacterTools/issues)

---

## Screenshot Checklist

For the README screenshots, capture:

1. **Main Interface** — Full popup with character selected, pipeline visible, some results showing
2. **Score Results** — Expanded score output showing field breakdown with ratings
3. **Analysis Results** — Analyze output with verdict badge visible, preserved/lost/gained sections
4. **Iteration History** — History panel with 2-3 iterations, different verdicts
5. **Field Selection** — Character preview with checkboxes, mix of selected/unselected
6. **Character Search** — Dropdown open with search results
7. **Pipeline Nav** — Close-up of the stage buttons with checkboxes
8. **Results Panel** — Results with toolbar and footer actions visible
9. **Extension Panel** — The entry point in ST's extensions panel
10. **Settings Modal** — Settings open, showing Generation section
11. **Schema Generation** — Either the input dialog or the result in the textarea

TODO: Fix analyze button not giving iterate when run stage instead of run all
TODO: Fix settings screen not being centered
TODO: Fix Extension not resizing properly on desktop when browser window is adjusted, text gets cut off
TODO: Preset dropdown arrow is obscured by longer preset names and preset drowndown sizes differ, inconsistent

