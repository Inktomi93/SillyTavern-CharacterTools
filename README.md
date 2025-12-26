# SillyTavern Character Tools

An extension for analyzing, scoring, and iteratively improving character cards using LLM-powered feedback.

## Features

- **Score** - Rate and critique character cards with detailed feedback per field
- **Rewrite** - Generate improved versions based on scoring feedback
- **Analyze** - Compare original vs rewrite, detect "soul loss" and regressions
- **Refine** - Iterative improvement loop with full history and revert capability
- **Apply** - Write improvements directly back to your character card
- **Structured Output** - Optional JSON schema support for consistent, parseable results
- **Preset System** - Save and reuse prompts and schemas across sessions

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

## Quick Start

1. Find **Character Tools** in the Extensions panel
2. Click **Open Character Tools**
3. Search and select a character
4. Select which stages to run (Score → Rewrite → Analyze)
5. Click **Run Selected** or run stages individually
6. Review results, refine if needed, apply changes to character

## Keyboard Shortcuts

| Shortcut     | Action            |
|--------------|-------------------|
| Ctrl+Enter   | Run current stage |
| Escape       | Cancel generation |

## Settings

Access settings via the ⚙️ icon in the popup header.

### Generation

- **Use Current Settings** - Use SillyTavern's active API/model (recommended)
- **Custom Generation** - Override with specific source, model, and parameters

### Prompts

- **System Prompt** - Base instructions applied to all stages
- **Refinement Prompt** - Template for iterative improvement cycles
- **Stage Presets** - Save custom prompts per stage

### Structured Output

Optional JSON schemas for consistent output formatting. Includes built-in schemas for Score and Analyze stages, or create your own.

## The Pipeline

### Score

Analyzes each populated field in your character card and provides:

- Numerical rating (1-10)
- Strengths and weaknesses
- Specific improvement suggestions

### Rewrite

Generates an improved version of the character card based on:

- Score feedback (if available)
- Your custom instructions
- The original character's core identity

### Analyze

Compares the rewrite against the original:

- What was preserved
- What was lost ("soul check")
- What was improved
- Verdict: **Accept**, **Needs Refinement**, or **Regression**

### Refine

If the analysis shows issues, refine iteratively:

- Each iteration is saved to history
- Revert to any previous version
- History persists across sessions

## Requirements

- SillyTavern 1.12.0+
- A connected LLM API (OpenRouter, OpenAI, Claude, etc.)

## Troubleshooting

### Extension doesn't appear

- Refresh your browser
- Check it's enabled in Extensions panel

### Generation fails

- Verify your API is connected (green dot in popup header)
- Check SillyTavern console for errors

### Results look wrong

- Try disabling Structured Output if your model doesn't support it well
- Adjust the system prompt for your model's style

## License

MIT

## Support

[GitHub Issues](https://github.com/Inktomi93/SillyTavern-CharacterTools/issues)
