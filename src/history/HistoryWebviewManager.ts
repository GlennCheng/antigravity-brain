import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as Diff from 'diff';
import { BrainNode } from '../brain/types';

interface FileVersion {
    id: string;
    label: string;
    timestamp: number;
}

export class HistoryWebviewManager {
    public static currentPanel: HistoryWebviewManager | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _versions: FileVersion[] = [];
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, mainNode: BrainNode) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._panel.webview.html = this._getHtmlForWebview();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'requestContent':
                        this._handleContentRequest(message.mode, message.layout, message.fromId, message.toId);
                        return;
                }
            },
            null,
            this._disposables
        );

        this._loadVersions(mainNode);
    }

    public static createOrShow(extensionUri: vscode.Uri, node: BrainNode) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (HistoryWebviewManager.currentPanel) {
            HistoryWebviewManager.currentPanel._panel.reveal(column);
            HistoryWebviewManager.currentPanel._loadVersions(node);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'antigravityHistory',
            `History: ${node.name}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'resources')]
            }
        );

        HistoryWebviewManager.currentPanel = new HistoryWebviewManager(panel, extensionUri, node);
    }

    private async _loadVersions(node: BrainNode) {
        this._versions = [];

        // Collect numbered .resolved.N versions (history)
        if (node.resolvedVersions) {
            node.resolvedVersions.forEach(vPath => {
                if (fs.existsSync(vPath)) {
                    const stat = fs.statSync(vPath);
                    this._versions.push({ id: vPath, label: '', timestamp: stat.mtime.getTime() });
                }
            });
        }

        // Sort history by timestamp ascending (oldest first)
        this._versions.sort((a, b) => a.timestamp - b.timestamp);

        // Label history versions sequentially
        this._versions = this._versions.map((v, i) => {
            const d = new Date(v.timestamp);
            const dateStr = `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
            return { ...v, label: `Version ${i + 1} — ${dateStr}` };
        });

        // Append main file as "Current" at the end
        if (fs.existsSync(node.path)) {
            const mainStat = fs.statSync(node.path);
            const d = new Date(mainStat.mtime.getTime());
            const dateStr = `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
            this._versions.push({
                id: node.path,
                label: `Current — ${dateStr}`,
                timestamp: mainStat.mtime.getTime()
            });
        }

        this._panel.title = `History: ${node.name}`;
        this._panel.webview.postMessage({ command: 'initVersions', versions: this._versions });
    }

    // ─── Content Request Router ───
    private _handleContentRequest(mode: string, layout: string, fromId: string, toId: string) {
        // Compute diff stats (line counts) once and send to webview
        try {
            const fromContent = fs.readFileSync(fromId, 'utf8');
            const toContent = fs.readFileSync(toId, 'utf8');
            const diff = Diff.diffLines(fromContent, toContent);
            let added = 0, removed = 0;
            diff.forEach(part => {
                const lineCount = part.value.replace(/\n$/, '').split('\n').length;
                if (part.added) { added += lineCount; }
                else if (part.removed) { removed += lineCount; }
            });
            this._panel.webview.postMessage({ command: 'setDiffStats', added, removed });
        } catch (_) { /* ignore, individual methods handle their own errors */ }

        if (mode === 'source' && layout === 'unified') {
            this._sendSourceUnified(fromId, toId);
        } else if (mode === 'source' && layout === 'split') {
            this._sendSourceSplit(fromId, toId);
        } else if (mode === 'rendered' && layout === 'unified') {
            this._sendRenderedUnified(fromId, toId);
        } else if (mode === 'rendered' && layout === 'split') {
            this._sendRenderedSplit(fromId, toId);
        }
    }

    // ─── Markdown line → HTML ───
    private _mdLineToHtml(line: string): string {
        let html = line
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        html = html
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

        if (/^#{1,6}\s/.test(html)) {
            const level = html.match(/^(#{1,6})\s/)![1].length;
            html = `<h${level} style="margin:2px 0">${html.replace(/^#{1,6}\s/, '')}</h${level}>`;
        } else if (/^\s*- \[x\]/.test(html)) {
            html = html.replace(/^(\s*)- \[x\]/, '$1<span class="cb checked">☑</span>');
        } else if (/^\s*- \[\/\]/.test(html)) {
            html = html.replace(/^(\s*)- \[\/\]/, '$1<span class="cb inprog">◐</span>');
        } else if (/^\s*- \[ \]/.test(html)) {
            html = html.replace(/^(\s*)- \[ \]/, '$1<span class="cb">☐</span>');
        } else if (/^\s*- /.test(html)) {
            html = html.replace(/^(\s*)- /, '$1• ');
        } else if (/^---+$/.test(html.trim())) {
            html = '<hr style="border:none;border-top:1px solid var(--vscode-panel-border);margin:4px 0">';
        }
        return html;
    }

    private _escapeHtml(str: string): string {
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // ─── 1. Source Unified (single-page inline diff) ───
    private _sendSourceUnified(fromId: string, toId: string) {
        try {
            const fromContent = fs.readFileSync(fromId, 'utf8');
            const toContent = fs.readFileSync(toId, 'utf8');
            const diff = Diff.diffLines(fromContent, toContent);

            let html = '';
            diff.forEach(part => {
                const cls = part.added ? 'added' : part.removed ? 'removed' : 'normal';
                html += `<span class="${cls}">${this._escapeHtml(part.value)}</span>`;
            });

            this._panel.webview.postMessage({ command: 'setUnified', html });
        } catch (e) {
            this._panel.webview.postMessage({ command: 'setUnified', html: `<div class="error">Error: ${e}</div>` });
        }
    }

    // ─── 2. Source Split (side-by-side source code with diff) ───
    private _sendSourceSplit(fromId: string, toId: string) {
        try {
            const fromContent = fs.readFileSync(fromId, 'utf8');
            const toContent = fs.readFileSync(toId, 'utf8');
            const diff = Diff.diffLines(fromContent, toContent);

            const leftLines: string[] = [];
            const rightLines: string[] = [];

            diff.forEach(part => {
                const rawLines = part.value.replace(/\n$/, '').split('\n');
                const escaped = rawLines.map(l => this._escapeHtml(l));

                if (part.removed) {
                    escaped.forEach(l => {
                        leftLines.push(`<div class="diff-line diff-removed"><pre>${l || ' '}</pre></div>`);
                        rightLines.push(`<div class="diff-line diff-spacer"><pre> </pre></div>`);
                    });
                } else if (part.added) {
                    escaped.forEach(l => {
                        leftLines.push(`<div class="diff-line diff-spacer"><pre> </pre></div>`);
                        rightLines.push(`<div class="diff-line diff-added"><pre>${l || ' '}</pre></div>`);
                    });
                } else {
                    escaped.forEach(l => {
                        leftLines.push(`<div class="diff-line"><pre>${l || ' '}</pre></div>`);
                        rightLines.push(`<div class="diff-line"><pre>${l || ' '}</pre></div>`);
                    });
                }
            });

            this._panel.webview.postMessage({
                command: 'setSplit',
                fromHtml: leftLines.join(''),
                toHtml: rightLines.join('')
            });
        } catch (e) {
            const err = `<div class="error">Error: ${e}</div>`;
            this._panel.webview.postMessage({ command: 'setSplit', fromHtml: err, toHtml: err });
        }
    }

    // ─── 3. Rendered Unified (single-page rendered markdown with diff) ───
    private _sendRenderedUnified(fromId: string, toId: string) {
        try {
            const fromContent = fs.readFileSync(fromId, 'utf8');
            const toContent = fs.readFileSync(toId, 'utf8');
            const diff = Diff.diffLines(fromContent, toContent);

            let html = '';
            diff.forEach(part => {
                const lines = part.value.replace(/\n$/, '').split('\n');
                lines.forEach(line => {
                    const rendered = this._mdLineToHtml(line);
                    if (part.removed) {
                        html += `<div class="diff-line diff-removed">${rendered || '&nbsp;'}</div>`;
                    } else if (part.added) {
                        html += `<div class="diff-line diff-added">${rendered || '&nbsp;'}</div>`;
                    } else {
                        html += `<div class="diff-line">${rendered || '&nbsp;'}</div>`;
                    }
                });
            });

            this._panel.webview.postMessage({ command: 'setUnified', html });
        } catch (e) {
            this._panel.webview.postMessage({ command: 'setUnified', html: `<div class="error">Error: ${e}</div>` });
        }
    }

    // ─── 4. Rendered Split (side-by-side rendered markdown with diff) ───
    private _sendRenderedSplit(fromId: string, toId: string) {
        try {
            const fromContent = fs.readFileSync(fromId, 'utf8');
            const toContent = fs.readFileSync(toId, 'utf8');
            const diff = Diff.diffLines(fromContent, toContent);

            const leftLines: string[] = [];
            const rightLines: string[] = [];

            diff.forEach(part => {
                const lines = part.value.replace(/\n$/, '').split('\n');
                const rendered = lines.map(l => this._mdLineToHtml(l));

                if (part.removed) {
                    rendered.forEach(rl => {
                        leftLines.push(`<div class="diff-line diff-removed">${rl || '&nbsp;'}</div>`);
                        rightLines.push(`<div class="diff-line diff-spacer">&nbsp;</div>`);
                    });
                } else if (part.added) {
                    rendered.forEach(rl => {
                        leftLines.push(`<div class="diff-line diff-spacer">&nbsp;</div>`);
                        rightLines.push(`<div class="diff-line diff-added">${rl || '&nbsp;'}</div>`);
                    });
                } else {
                    rendered.forEach(rl => {
                        leftLines.push(`<div class="diff-line">${rl || '&nbsp;'}</div>`);
                        rightLines.push(`<div class="diff-line">${rl || '&nbsp;'}</div>`);
                    });
                }
            });

            this._panel.webview.postMessage({
                command: 'setSplit',
                fromHtml: leftLines.join(''),
                toHtml: rightLines.join('')
            });
        } catch (e) {
            const err = `<div class="error">Error: ${e}</div>`;
            this._panel.webview.postMessage({ command: 'setSplit', fromHtml: err, toHtml: err });
        }
    }

    public dispose() {
        HistoryWebviewManager.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) { x.dispose(); }
        }
    }

    private _getHtmlForWebview() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>File History</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 16px;
            overflow: hidden;
            height: 100vh;
        }

        /* ─── Toolbar ─── */
        .toolbar {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
            padding: 10px 14px;
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            flex-wrap: wrap;
        }
        .toolbar label {
            font-size: 12px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        select {
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            padding: 5px 8px;
            border-radius: 4px;
            font-size: 12px;
            max-width: 300px;
        }
        select:focus { outline: 1px solid var(--vscode-focusBorder); }
        .btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 5px 10px;
            cursor: pointer;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 500;
            transition: background 0.15s;
        }
        .btn:hover { background: var(--vscode-button-hoverBackground); }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .btn-secondary.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .spacer { flex: 1; }
        .nav-group, .mode-group, .layout-group, .diff-nav-group { display: flex; gap: 4px; align-items: center; }
        .divider { width: 1px; height: 20px; background: var(--vscode-panel-border); }
        /* ─── Diff status badge ─── */
        .diff-status {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 11px;
            font-weight: 600;
            padding: 3px 10px;
            border-radius: 10px;
            letter-spacing: 0.3px;
            white-space: nowrap;
            transition: all 0.25s;
        }
        .diff-status.identical {
            background: rgba(40, 167, 69, 0.15);
            color: #4caf50;
            border: 1px solid rgba(40, 167, 69, 0.3);
        }
        .diff-status.changed {
            background: rgba(255, 193, 7, 0.12);
            color: #ffc107;
            border: 1px solid rgba(255, 193, 7, 0.3);
        }
        .diff-status .status-icon { font-size: 12px; }

        .diff-counter {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            min-width: 40px;
            text-align: center;
            font-variant-numeric: tabular-nums;
        }

        /* ─── Content wrapper with minimap ─── */
        .content-wrapper {
            position: relative;
            height: calc(100vh - 100px);
        }

        /* ─── Unified View (single page) ─── */
        .unified-container {
            font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
            font-size: var(--vscode-editor-font-size, 13px);
            white-space: pre-wrap;
            word-break: break-word;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 12px;
            padding-right: 72px;
            line-height: 1.5;
            overflow: auto;
            height: 100%;
        }
        .unified-container .added {
            background: rgba(40, 167, 69, 0.25);
            display: block;
            border-left: 3px solid rgba(40, 167, 69, 0.8);
            padding-left: 8px;
            margin-left: -11px;
        }
        .unified-container .removed {
            background: rgba(220, 53, 69, 0.2);
            display: block;
            text-decoration: line-through;
            opacity: 0.7;
            border-left: 3px solid rgba(220, 53, 69, 0.7);
            padding-left: 8px;
            margin-left: -11px;
        }
        .unified-container .normal { display: block; }

        /* ─── Split View (side-by-side) ─── */
        .split-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0;
            height: 100%;
            overflow: hidden;
        }
        .split-panel-wrap {
            position: relative;
            overflow: hidden;
        }
        .split-panel {
            border: 1px solid var(--vscode-panel-border);
            overflow-y: auto;
            overflow-x: hidden;
            line-height: 1.5;
            height: 100%;
            padding-right: 56px;
        }
        .split-panel-wrap:first-child .split-panel {
            border-radius: 6px 0 0 6px;
            border-right: none;
        }
        .split-panel-wrap:last-child .split-panel {
            border-radius: 0 6px 6px 0;
        }
        .panel-header {
            position: sticky;
            top: 0;
            z-index: 10;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-descriptionForeground);
            padding: 8px 12px;
            background: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .panel-body { padding: 4px 0; }

        /* ─── Diff line styling ─── */
        .diff-line {
            padding: 1px 12px;
            min-height: 1.5em;
            font-size: 13px;
        }
        .diff-line pre {
            margin: 0;
            font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
            font-size: var(--vscode-editor-font-size, 13px);
            white-space: pre-wrap;
            word-break: break-word;
        }
        .diff-line h1, .diff-line h2, .diff-line h3, .diff-line h4 { display: inline; }
        .diff-line code {
            background: var(--vscode-textCodeBlock-background);
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 0.9em;
        }
        .diff-added {
            background: rgba(40, 167, 69, 0.18);
            border-left: 3px solid rgba(40, 167, 69, 0.7);
        }
        .diff-removed {
            background: rgba(220, 53, 69, 0.15);
            border-left: 3px solid rgba(220, 53, 69, 0.6);
            opacity: 0.7;
            text-decoration: line-through;
        }
        .diff-spacer {
            background: var(--vscode-editor-background);
            opacity: 0.4;
        }
        .cb { font-size: 1.1em; margin-right: 4px; }
        .cb.checked { color: #28a745; }
        .cb.inprog { color: #ffc107; }
        .error { color: var(--vscode-errorForeground); padding: 12px; }
        .hidden { display: none !important; }

        /* ─── Minimap ─── */
        .minimap {
            position: absolute;
            top: 0;
            right: 0;
            width: 54px;
            height: 100%;
            cursor: pointer;
            border-left: 1px solid var(--vscode-panel-border);
            background: color-mix(in srgb, var(--vscode-sideBar-background) 80%, transparent);
        }
        .minimap canvas {
            width: 100%;
            height: 100%;
        }
        .minimap-viewport {
            position: absolute;
            left: 0;
            right: 0;
            background: rgba(150, 150, 150, 0.18);
            border: 1px solid rgba(150, 150, 150, 0.35);
            border-radius: 2px;
            pointer-events: none;
            min-height: 12px;
            transition: top 0.05s;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <label>From</label>
        <select id="fromSelect"></select>
        <label>To</label>
        <select id="toSelect"></select>
        <span class="diff-status" id="diffStatus"></span>

        <div class="spacer"></div>

        <div class="nav-group">
            <button class="btn btn-secondary" id="firstBtn" title="Jump to oldest">⏮</button>
            <button class="btn btn-secondary" id="prevBtn" title="Previous pair">◀</button>
            <button class="btn btn-secondary" id="nextBtn" title="Next pair">▶</button>
            <button class="btn btn-secondary" id="lastBtn" title="Jump to latest">⏭</button>
        </div>

        <div class="divider"></div>

        <div class="diff-nav-group">
            <button class="btn btn-secondary" id="prevDiffBtn" title="Previous change (↑)">▲</button>
            <span class="diff-counter" id="diffCounter">0/0</span>
            <button class="btn btn-secondary" id="nextDiffBtn" title="Next change (↓)">▼</button>
        </div>

        <div class="divider"></div>

        <div class="mode-group">
            <button class="btn btn-secondary active" id="sourceModeBtn">Source</button>
            <button class="btn btn-secondary" id="renderedModeBtn">Rendered</button>
        </div>

        <div class="divider"></div>

        <div class="layout-group">
            <button class="btn btn-secondary active" id="unifiedBtn" title="Unified (single page)">Unified</button>
            <button class="btn btn-secondary" id="splitBtn" title="Side-by-side">Split</button>
        </div>
    </div>

    <div class="content-wrapper">
        <!-- Unified View -->
        <div id="unifiedWrap" style="position:relative;height:100%">
            <div id="unifiedView" class="unified-container">Loading...</div>
            <div class="minimap" id="unifiedMinimap">
                <canvas id="unifiedCanvas"></canvas>
                <div class="minimap-viewport" id="unifiedViewport"></div>
            </div>
        </div>

        <!-- Split View -->
        <div id="splitView" class="split-container hidden">
            <div class="split-panel-wrap">
                <div class="split-panel" id="leftPanel">
                    <div class="panel-header" id="fromLabel">From</div>
                    <div class="panel-body" id="fromBody"></div>
                </div>
                <div class="minimap" id="leftMinimap">
                    <canvas id="leftCanvas"></canvas>
                    <div class="minimap-viewport" id="leftViewport"></div>
                </div>
            </div>
            <div class="split-panel-wrap">
                <div class="split-panel" id="rightPanel">
                    <div class="panel-header" id="toLabel">To</div>
                    <div class="panel-body" id="toBody"></div>
                </div>
                <div class="minimap" id="rightMinimap">
                    <canvas id="rightCanvas"></canvas>
                    <div class="minimap-viewport" id="rightViewport"></div>
                </div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let versions = [];
        let currentMode = 'source';
        let currentLayout = 'unified';
        let syncingScroll = false;
        let currentDiffIndex = -1;

        const fromSelect = document.getElementById('fromSelect');
        const toSelect = document.getElementById('toSelect');
        const unifiedWrap = document.getElementById('unifiedWrap');
        const unifiedView = document.getElementById('unifiedView');
        const splitView = document.getElementById('splitView');
        const leftPanel = document.getElementById('leftPanel');
        const rightPanel = document.getElementById('rightPanel');
        const diffCounter = document.getElementById('diffCounter');

        // Version navigation
        document.getElementById('firstBtn').addEventListener('click', () => nav('first'));
        document.getElementById('prevBtn').addEventListener('click', () => nav('prev'));
        document.getElementById('nextBtn').addEventListener('click', () => nav('next'));
        document.getElementById('lastBtn').addEventListener('click', () => nav('last'));

        // Diff navigation
        document.getElementById('prevDiffBtn').addEventListener('click', () => jumpDiff(-1));
        document.getElementById('nextDiffBtn').addEventListener('click', () => jumpDiff(1));

        // Mode buttons
        const sourceModeBtn = document.getElementById('sourceModeBtn');
        const renderedModeBtn = document.getElementById('renderedModeBtn');
        sourceModeBtn.addEventListener('click', () => setMode('source'));
        renderedModeBtn.addEventListener('click', () => setMode('rendered'));

        // Layout buttons
        const unifiedBtn = document.getElementById('unifiedBtn');
        const splitBtn = document.getElementById('splitBtn');
        unifiedBtn.addEventListener('click', () => setLayout('unified'));
        splitBtn.addEventListener('click', () => setLayout('split'));

        // Synchronized scrolling for split view
        leftPanel.addEventListener('scroll', () => {
            if (syncingScroll) return;
            syncingScroll = true;
            const pct = leftPanel.scrollTop / (leftPanel.scrollHeight - leftPanel.clientHeight || 1);
            rightPanel.scrollTop = pct * (rightPanel.scrollHeight - rightPanel.clientHeight || 1);
            updateMinimapViewport(leftPanel, 'leftViewport');
            updateMinimapViewport(rightPanel, 'rightViewport');
            syncingScroll = false;
        });
        rightPanel.addEventListener('scroll', () => {
            if (syncingScroll) return;
            syncingScroll = true;
            const pct = rightPanel.scrollTop / (rightPanel.scrollHeight - rightPanel.clientHeight || 1);
            leftPanel.scrollTop = pct * (leftPanel.scrollHeight - leftPanel.clientHeight || 1);
            updateMinimapViewport(leftPanel, 'leftViewport');
            updateMinimapViewport(rightPanel, 'rightViewport');
            syncingScroll = false;
        });
        unifiedView.addEventListener('scroll', () => {
            updateMinimapViewport(unifiedView, 'unifiedViewport');
        });

        function setMode(mode) {
            currentMode = mode;
            sourceModeBtn.classList.toggle('active', mode === 'source');
            renderedModeBtn.classList.toggle('active', mode === 'rendered');
            requestContent();
        }

        function setLayout(layout) {
            currentLayout = layout;
            unifiedBtn.classList.toggle('active', layout === 'unified');
            splitBtn.classList.toggle('active', layout === 'split');
            unifiedWrap.classList.toggle('hidden', layout !== 'unified');
            splitView.classList.toggle('hidden', layout !== 'split');
            requestContent();
        }

        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.command === 'initVersions') {
                versions = msg.versions;
                renderDropdowns();
                if (versions.length >= 2) {
                    fromSelect.value = versions[versions.length - 2].id;
                    toSelect.value = versions[versions.length - 1].id;
                } else if (versions.length === 1) {
                    fromSelect.value = versions[0].id;
                    toSelect.value = versions[0].id;
                }
                requestContent();
            } else if (msg.command === 'setUnified') {
                unifiedView.innerHTML = msg.html;
                currentDiffIndex = -1;
                collectDiffElements();
                updateDiffCounter();
                setTimeout(() => {
                    renderMinimap(unifiedView, 'unifiedCanvas');
                    updateMinimapViewport(unifiedView, 'unifiedViewport');
                }, 50);
            } else if (msg.command === 'setSplit') {
                const fromIdx = versions.findIndex(v => v.id === fromSelect.value);
                const toIdx = versions.findIndex(v => v.id === toSelect.value);
                document.getElementById('fromLabel').textContent = fromIdx >= 0 ? versions[fromIdx].label : 'From';
                document.getElementById('toLabel').textContent = toIdx >= 0 ? versions[toIdx].label : 'To';
                document.getElementById('fromBody').innerHTML = msg.fromHtml;
                document.getElementById('toBody').innerHTML = msg.toHtml;
                leftPanel.scrollTop = 0;
                rightPanel.scrollTop = 0;
                currentDiffIndex = -1;
                collectDiffElements();
                updateDiffCounter();
                setTimeout(() => {
                    renderMinimap(leftPanel, 'leftCanvas');
                    renderMinimap(rightPanel, 'rightCanvas');
                    updateMinimapViewport(leftPanel, 'leftViewport');
                    updateMinimapViewport(rightPanel, 'rightViewport');
                }, 50);
            } else if (msg.command === 'setDiffStats') {
                updateDiffStatus(msg.added, msg.removed);
            }
        });

        // ─── Diff Jump Navigation ───
        let cachedDiffEls = [];

        function collectDiffElements() {
            const container = currentLayout === 'unified' ? unifiedView : rightPanel;
            // Collect all diff elements (added/removed)
            cachedDiffEls = Array.from(container.querySelectorAll('.added, .removed, .diff-added, .diff-removed'));
            return cachedDiffEls;
        }

        function jumpDiff(direction) {
            if (cachedDiffEls.length === 0) collectDiffElements();
            const els = cachedDiffEls;
            if (els.length === 0) return;

            // Simple sequential navigation
            if (direction > 0) {
                currentDiffIndex = Math.min(currentDiffIndex + 1, els.length - 1);
            } else {
                currentDiffIndex = Math.max(currentDiffIndex - 1, 0);
            }

            const target = els[currentDiffIndex];
            if (!target) return;

            // scrollIntoView on the nearest scrollable ancestor
            target.scrollIntoView({ block: 'center', behavior: 'smooth' });

            // Brief highlight
            target.style.outline = '2px solid var(--vscode-focusBorder)';
            target.style.outlineOffset = '2px';
            target.style.borderRadius = '2px';
            setTimeout(() => {
                target.style.outline = '';
                target.style.outlineOffset = '';
                target.style.borderRadius = '';
            }, 1500);

            updateDiffCounter();
        }

        function updateDiffCounter() {
            const total = cachedDiffEls.length;
            if (total === 0) {
                diffCounter.textContent = 'No diff';
            } else if (currentDiffIndex < 0) {
                diffCounter.textContent = '0/' + total;
            } else {
                diffCounter.textContent = (currentDiffIndex + 1) + '/' + total;
            }
        }

        // keyboard shortcuts
        document.addEventListener('keydown', e => {
            if (e.key === 'F7' || (e.altKey && e.key === 'ArrowDown')) { e.preventDefault(); jumpDiff(1); }
            if (e.key === 'F6' || (e.altKey && e.key === 'ArrowUp')) { e.preventDefault(); jumpDiff(-1); }
        });

        // ─── Diff Status Badge ───
        function updateDiffStatus(added, removed) {
            const badge = document.getElementById('diffStatus');
            if (!badge) return;
            if (added === 0 && removed === 0) {
                badge.className = 'diff-status identical';
                badge.innerHTML = '✓ Identical';
            } else {
                badge.className = 'diff-status changed';
                badge.innerHTML = '<span style="color:#4caf50">+' + added + '</span> <span style="color:#f44336">-' + removed + '</span>';
            }
        }

        // ─── Minimap ───
        function renderMinimap(scrollContainer, canvasId) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const rect = canvas.parentElement.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, rect.width, rect.height);

            const totalH = scrollContainer.scrollHeight;
            if (totalH <= 0) return;
            const scale = rect.height / totalH;

            // Draw background lines (faint text representation)
            const allLines = scrollContainer.querySelectorAll('.diff-line, .added, .removed, .normal');
            allLines.forEach(el => {
                const y = el.offsetTop * scale;
                const h = Math.max(el.offsetHeight * scale, 1);
                if (el.classList.contains('diff-added') || el.classList.contains('added')) {
                    ctx.fillStyle = 'rgba(40, 167, 69, 0.7)';
                } else if (el.classList.contains('diff-removed') || el.classList.contains('removed')) {
                    ctx.fillStyle = 'rgba(220, 53, 69, 0.6)';
                } else if (el.classList.contains('diff-spacer')) {
                    return; // skip spacers
                } else {
                    ctx.fillStyle = 'rgba(150, 150, 150, 0.15)';
                }
                // Draw a thin bar representing the line
                ctx.fillRect(4, y, rect.width - 8, Math.max(h, 0.8));
            });

            // If no diff-line elements found (source unified mode with span blocks)
            if (allLines.length === 0) {
                const spans = scrollContainer.querySelectorAll('span.added, span.removed, span.normal');
                spans.forEach(el => {
                    const y = el.offsetTop * scale;
                    const h = Math.max(el.offsetHeight * scale, 1);
                    if (el.classList.contains('added')) {
                        ctx.fillStyle = 'rgba(40, 167, 69, 0.7)';
                    } else if (el.classList.contains('removed')) {
                        ctx.fillStyle = 'rgba(220, 53, 69, 0.6)';
                    } else {
                        ctx.fillStyle = 'rgba(150, 150, 150, 0.12)';
                    }
                    ctx.fillRect(4, y, rect.width - 8, Math.max(h, 0.8));
                });
            }
        }

        function updateMinimapViewport(scrollContainer, viewportId) {
            const viewport = document.getElementById(viewportId);
            if (!viewport) return;
            const mapH = viewport.parentElement.getBoundingClientRect().height;
            const totalH = scrollContainer.scrollHeight;
            const visibleH = scrollContainer.clientHeight;
            if (totalH <= 0) return;
            const scale = mapH / totalH;
            viewport.style.top = (scrollContainer.scrollTop * scale) + 'px';
            viewport.style.height = Math.max(visibleH * scale, 12) + 'px';
        }

        // Minimap click-to-scroll
        function setupMinimapClick(minimapId, scrollContainer) {
            const minimap = document.getElementById(minimapId);
            if (!minimap) return;
            let dragging = false;

            function scrollToY(clientY) {
                const rect = minimap.getBoundingClientRect();
                const pct = (clientY - rect.top) / rect.height;
                scrollContainer.scrollTop = pct * (scrollContainer.scrollHeight - scrollContainer.clientHeight);
            }

            minimap.addEventListener('mousedown', e => {
                dragging = true;
                scrollToY(e.clientY);
                e.preventDefault();
            });
            document.addEventListener('mousemove', e => {
                if (dragging) scrollToY(e.clientY);
            });
            document.addEventListener('mouseup', () => { dragging = false; });
        }

        setupMinimapClick('unifiedMinimap', unifiedView);
        setupMinimapClick('leftMinimap', leftPanel);
        setupMinimapClick('rightMinimap', rightPanel);

        // Resize observer to re-render minimaps
        const resObs = new ResizeObserver(() => {
            if (currentLayout === 'unified') {
                renderMinimap(unifiedView, 'unifiedCanvas');
                updateMinimapViewport(unifiedView, 'unifiedViewport');
            } else {
                renderMinimap(leftPanel, 'leftCanvas');
                renderMinimap(rightPanel, 'rightCanvas');
                updateMinimapViewport(leftPanel, 'leftViewport');
                updateMinimapViewport(rightPanel, 'rightViewport');
            }
        });
        resObs.observe(document.body);

        function renderDropdowns() {
            const opts = versions.map(v => '<option value="' + v.id + '">' + v.label + '</option>').join('');
            fromSelect.innerHTML = opts;
            toSelect.innerHTML = opts;
            fromSelect.addEventListener('change', requestContent);
            toSelect.addEventListener('change', requestContent);
        }

        function requestContent() {
            vscode.postMessage({
                command: 'requestContent',
                mode: currentMode,
                layout: currentLayout,
                fromId: fromSelect.value,
                toId: toSelect.value
            });
        }

        function nav(direction) {
            if (versions.length < 2) return;
            let fromIdx = versions.findIndex(v => v.id === fromSelect.value);
            let toIdx = versions.findIndex(v => v.id === toSelect.value);
            const last = versions.length - 1;

            if (direction === 'prev') {
                if (fromIdx > 0) { fromIdx--; toIdx = fromIdx + 1; }
            } else if (direction === 'next') {
                if (toIdx < last) { toIdx++; fromIdx = toIdx - 1; }
            } else if (direction === 'first') {
                fromIdx = 0; toIdx = 1;
            } else if (direction === 'last') {
                toIdx = last; fromIdx = last - 1;
            }

            fromIdx = Math.max(0, Math.min(fromIdx, last));
            toIdx = Math.max(0, Math.min(toIdx, last));

            fromSelect.value = versions[fromIdx].id;
            toSelect.value = versions[toIdx].id;
            requestContent();
        }
    </script>
</body>
</html>`;
    }
}
