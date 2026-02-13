<p align="center">
  <img src="resources/brain.svg" alt="Antigravity Brain" width="120" />
</p>

<h1 align="center">🧠 Antigravity Brain</h1>

<p align="center">
  <strong>Your AI Conversation Artifact Explorer for VS Code</strong><br/>
  Browse, search, diff, and visualize everything your AI coding assistant creates.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.0.1--alpha-blue" alt="Version" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
  <img src="https://img.shields.io/badge/VS%20Code-1.78%2B-blue?logo=visual-studio-code" alt="VS Code" />
</p>

---

## 🤔 Why Antigravity Brain?

When you use AI coding assistants like **Gemini**, **Cursor**, **GitHub Copilot**, or **Windsurf**, they generate a hidden treasure trove of artifacts — plans, task checklists, walkthroughs, implementation docs, and iteration histories — all buried in obscure directories like `~/.gemini/antigravity/brain/`.

**The problem?** These files are:
- 📂 Scattered across dozens of UUID-named folders
- 🔍 Impossible to search or browse
- 📜 Have rich iteration history that's invisible
- 🧩 Disconnected from each other

**Antigravity Brain** brings these artifacts to life. It's the missing UI layer for your AI-generated knowledge base.

---

## ✨ Features

### 🗂️ Brain Explorer (Sidebar)
A dedicated sidebar that organizes all your AI conversation artifacts into a browsable tree view.

- **Smart Grouping** — Files grouped by Brain (conversation), with auto-detected task names from `task.md` headers
- **Brain Statistics** — Total brain count at the top, file count per brain
- **Smart Icons** — Different icons for tasks (✅), plans (📖), walkthroughs (▶️), and other files
- **Metadata Display** — File count, last modified time, and Brain ID for each entry
- **Markdown Preview on Hover** — Hover over any file to see a rich Markdown preview (first 30 lines)

### 🔍 Cross-Brain Search
Search across **all** your Brains at once — filenames and file content.

- Instant results with debounced input
- Shows `BrainName > Filename:Line` with matching line preview
- Click to jump directly to the matching line
- Access via sidebar 🔍 button or Command Palette

### 📜 File History & Diff View
Compare any two versions of a file side-by-side or unified, in source or rendered Markdown.

- **4 View Modes** — Source Unified, Source Split, Rendered Unified, Rendered Split
- **Diff Navigation** — Jump between changes with ▲/▼ buttons (or `Alt+Arrow` / `F6`/`F7`)
- **Minimap** — Canvas-rendered minimap showing diff positions (like VS Code's editor minimap)
- **Diff Status Badge** — Git-style `+44 -12` indicator showing exact line changes
- **Version Labels** — Clear labeling: `Version 1`, `Version 2`, ..., `Current`

### ⏰ Recent Activity
Quick access to your most recently modified Brain files.

- Shows last 30 modified files sorted by time
- One-click to open any file
- Access via sidebar ⏰ button or Command Palette

### 🕸️ Knowledge Graph (Mind Map)
An interactive force-directed graph visualizing connections between your Brain files.

- Powered by **ReactFlow** + **Dagre** layout
- Supports Markdown links `[Title](./file.md)` and Wiki-links `[[Page Name]]`
- Click nodes to navigate to files

---

## 📦 Installation

### From Source (Development)

```bash
# Clone the repository
git clone https://github.com/GlennCheng/antigravity-brain.git
cd antigravity-brain

# Install dependencies
npm install

# Compile
npm run compile

# Open in VS Code and press F5 to launch Extension Development Host
code .
```

### From VSIX (Manual Install)

```bash
# Package the extension
npm run package

# Install in VS Code
code --install-extension antigravity-brain-0.0.1.vsix
```

> **Note:** This extension is in early alpha. VSIX packaging and Marketplace publishing are coming soon.

---

## 🚀 Quick Start

### 1. Open the Sidebar
Click the **🧠 brain icon** in the Activity Bar (left side) to open the **Brain Explorer**.

### 2. Browse Your Brains
Each folder represents one AI conversation session. Expand to see:
- `task.md` — Task checklist
- `implementation_plan.md` — Technical plan
- `walkthrough.md` — Summary of what was done

### 3. View File History
Files with iteration history show an iteration count. Right-click → **View File History** to open the diff viewer.

### 4. Search Across Brains
Click the **🔍 search icon** in the sidebar header, or run `Antigravity Brain: Search` from the Command Palette (`Ctrl+Shift+P`).

### 5. Recent Activity
Click the **⏰ clock icon** to quickly jump to recently modified files.

---

## ⚙️ Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `antigravity.brainPath` | `~/.gemini/antigravity/brain` | Path to your AI artifact directory |

### Setting the Brain Path

```json
// settings.json
{
  "antigravity.brainPath": "~/.gemini/antigravity/brain"
}
```

> Works with any AI tool that stores artifacts in a similar directory structure (Gemini, Cursor, etc.)

---

## 🎮 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt + ↓` or `F7` | Jump to next diff |
| `Alt + ↑` or `F6` | Jump to previous diff |

---

## 🗺️ Roadmap

We have big plans for Antigravity Brain! Here's what's coming:

### ✅ Recently Shipped
- [x] 🔍 **Cross-Brain Search** — Search filenames & content across all Brains with instant QuickPick UI
- [x] 📋 **Inline Markdown Preview** — Hover over files to see rendered Markdown content (first 30 lines)
- [x] ⏰ **Recent Activity Panel** — Quick access to 30 most recently modified files
- [x] 🎯 **Locate in Tree** — One-click highlight of the currently viewed file in sidebar
- [x] 📜 **File History & Diff View** — Compare versions with 4 view modes, minimap, and diff navigation
- [x] 🧠 **Brain Statistics** — File count, last updated time per Brain

### 🔜 Coming Soon
- [ ] 🏷️ **Tags & Bookmarks** — Tag important Brains for quick filtering
- [ ] 📌 **Pin Brains** — Pin frequently used Brains to the top
- [ ] 🗑️ **Cleanup Tool** — One-click cleanup of old/empty Brain directories
- [ ] 🔔 **File Watcher** — Get notified when new AI outputs appear
- [ ] 📤 **Export & Share** — Export Brains as ZIP / Markdown / HTML reports

### 🎮 Fun & Creative (Planned)
- [ ] 🎮 **Developer RPG Avatar** — JRPG pixel-art character that levels up based on your Brain activity. Stats: Debug Power, Architecture, Refactoring, Documentation, Creativity
- [ ] 🤖 **AI Daily Summary** — LLM-powered daily summary of your Brain activity
- [ ] 🏆 **Achievement System** — Unlock badges like "Bug Hunter", "Refactor King", "7-Day Streak"
- [ ] 📊 **Stats Dashboard** — Activity heatmap, trends, and analytics
- [ ] 📅 **Timeline View** — Chronological visualization of all Brain activity
- [ ] 🧠 **AI Knowledge Graph** — Auto-generated knowledge map from all your Brains
- [ ] 💬 **Conversation Replay** — Browse AI conversation logs as chat history
- [ ] 📱 **Weekly Report Generator** — Auto-generate polished weekly reports

### 🔧 LLM Integration (Planned)
- [ ] VS Code Language Model API (`vscode.lm`) — Use IDE's built-in AI
- [ ] External API support (OpenAI / Anthropic / Gemini)
- [ ] Local model support via Ollama

---

## 🏗️ Architecture

```
src/
├── extension.ts              # Entry point, command registration
├── brain/
│   ├── BrainManager.ts       # Core brain graph builder
│   ├── BrainTreeProvider.ts   # Sidebar tree view provider
│   ├── FileSystemReader.ts    # File system scanner
│   ├── MarkdownParser.ts      # Link parser (md + wikilinks)
│   ├── SearchProvider.ts      # Cross-brain search engine
│   └── types.ts               # TypeScript interfaces
├── history/
│   └── HistoryWebviewManager.ts  # Diff viewer webview
└── webview/
    └── WebviewManager.ts      # Mind map webview (ReactFlow)
```

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m 'Add amazing feature'`
4. **Push** to the branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### Development Setup

```bash
npm install          # Install dependencies
npm run compile      # Build once
npm run watch        # Build on changes
```

Press **F5** in VS Code to launch the Extension Development Host for testing.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 💬 FAQ

**Q: Does this extension read or send my data to any server?**
A: No. Antigravity Brain is 100% local. It only reads files from your local file system. No data is transmitted anywhere.

**Q: Which AI tools are supported?**
A: Any AI tool that stores conversation artifacts in a structured directory. Currently tested with Gemini/Antigravity. Support for Cursor, Copilot, and others is planned.

**Q: Can I use this with custom directories?**
A: Yes! Set `antigravity.brainPath` in your VS Code settings to point to any directory.

---

<p align="center">
  Made with 🧠 by <a href="https://github.com/GlennCheng">Glenn Cheng</a>
</p>
