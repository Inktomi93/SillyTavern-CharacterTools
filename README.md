# SillyTavern-CharacterTools

A SillyTavern extension for analyzing, scoring, and iteratively improving character cards using LLM-powered feedback.

## Features

- **Score** - Rate and critique character cards with detailed feedback per field
- **Rewrite** - Generate improved versions based on scoring feedback
- **Analyze** - Compare original vs rewrite, detect "soul loss" and regressions
- **Refine** - Iterative improvement loop with full history and revert capability
- **Structured Output** - Optional JSON schema support for consistent, parseable results
- **Preset System** - Save and reuse prompts and schemas across sessions

## Installation

### From GitHub (Recommended)

1. Open SillyTavern and go to **Extensions** > **Install Extension**
2. Paste: `https://github.com/Inktomi93/SillyTavern-CharacterTools`
3. Click **Install**

### Manual Installation

```bash
cd SillyTavern/data/<user>/extensions/third-party/
git clone https://github.com/Inktomi93/SillyTavern-CharacterTools
```

Restart SillyTavern after installation.

## Usage

1. Open the extension panel in SillyTavern's extensions menu
2. Click **Open Character Tools**
3. Search and select a character
4. Configure your pipeline (Score → Rewrite → Analyze)
5. Run stages individually or all at once
6. Review results, refine iteratively, apply changes to character

### Keyboard Shortcuts

| Shortcut      | Action            |
|---------------|-------------------|
| `Ctrl+Enter`  | Run current stage |
| `Escape`      | Cancel generation |

## Configuration

Access settings via the gear icon in the popup header.

- **Use Current Settings** - Use SillyTavern's active API/model configuration
- **Custom Generation** - Override with specific source, model, and parameters
- **System Prompt** - Base instructions applied to all stages
- **Refinement Prompt** - Template for iterative improvement cycles

## Building from Source

```bash
git clone https://github.com/Inktomi93/SillyTavern-CharacterTools
cd SillyTavern-CharacterTools
npm install
npm run build
```

Output appears in `dist/`.

## Requirements

- SillyTavern 1.12.0+
- A connected LLM API (OpenRouter, OpenAI, Claude, etc.)

## License

MIT
