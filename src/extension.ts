import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BrainManager } from './brain/BrainManager';
import { BrainTreeProvider } from './brain/BrainTreeProvider';
import { SearchProvider } from './brain/SearchProvider';
import { WebviewManager } from './webview/WebviewManager';
import { HistoryWebviewManager } from './history/HistoryWebviewManager';
import { BrainNode } from './brain/types';
import { parseFrontmatter, updateFrontmatter } from './brain/FrontmatterUtils';

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "antigravity-brain" is now active!');

	// 1. Initialize Brain Manager
	const config = vscode.workspace.getConfiguration('antigravity');
	const brainPath = config.get<string>('brainPath') || process.env.HOME + '/.gemini/antigravity/brain';
	const brainManager = new BrainManager(brainPath);

	// 2. Create Tree View (instead of registerTreeDataProvider, so we get .reveal())
	const treeProvider = new BrainTreeProvider(brainManager);
	const treeView = vscode.window.createTreeView('antigravity-files', {
		treeDataProvider: treeProvider,
		showCollapseAll: true
	});

	// Helper: reveal a file in the sidebar tree
	async function revealFileInTree(filePath: string) {
		try {
			// Direct match first
			let node = await treeProvider.findNodeByPath(filePath);

			// Fallback: .resolved or .resolved.N files — strip suffix to find base .md node
			if (!node && filePath.includes('.resolved')) {
				const basePath = filePath.split('.resolved')[0];
				node = await treeProvider.findNodeByPath(basePath);
			}

			if (node) {
				await treeView.reveal(node, { select: true, focus: false, expand: true });
			} else {
				console.warn('[revealFileInTree] Node not found for:', filePath);
				vscode.window.showInformationMessage(`Cannot locate in tree: file not in any Brain folder`);
			}
		} catch (err) {
			console.warn('[revealFileInTree] Error:', err);
		}
	}

	// Helper: get the file path of the currently active/visible file
	// Called at command-execution time for a fresh snapshot (no stale state)
	function getActiveFilePath(): string | undefined {
		// 1. Active text editor (most reliable, but undefined when sidebar has focus)
		const editor = vscode.window.activeTextEditor;
		if (editor && editor.document.uri.scheme === 'file') {
			return editor.document.uri.fsPath;
		}

		// 2. Scan ALL tabs across ALL groups for the active tab
		if (vscode.window.tabGroups) {
			for (const group of vscode.window.tabGroups.all) {
				for (const tab of group.tabs) {
					if (tab.isActive) {
						const input = tab.input as any;
						// Standard text/custom editors: input.uri
						if (input?.uri?.fsPath) { return input.uri.fsPath; }
						// Markdown Preview: input.sourceUri
						if (input?.sourceUri?.path) { return input.sourceUri.path; }
						// Diff view: input.modified
						if (input?.modified?.fsPath) { return input.modified.fsPath; }
					}
				}
			}
		}

		// 3. Visible text editors (last resort)
		if (vscode.window.visibleTextEditors.length > 0) {
			const visUri = vscode.window.visibleTextEditors[0].document.uri;
			if (visUri.scheme === 'file') {
				return visUri.fsPath;
			}
		}

		return undefined;
	}

	// 3. Register Commands
	let disposable = vscode.commands.registerCommand('antigravity-brain.openGraph', async () => {
		WebviewManager.createOrShow(context.extensionUri, brainManager);
	});
    
    let historyDisposable = vscode.commands.registerCommand('antigravity-brain.viewHistory', async (node) => {
        if (node) {
            HistoryWebviewManager.createOrShow(context.extensionUri, node);
        }
    });

    // 4. Search Brains Command
    const searchProvider = new SearchProvider(brainPath);
    let searchDisposable = vscode.commands.registerCommand('antigravity-brain.searchBrains', async () => {
        const quickPick = vscode.window.createQuickPick();
        quickPick.placeholder = '🔍 Search across all Brains (filename & content)...';
        quickPick.matchOnDescription = true;
        quickPick.matchOnDetail = true;

        let debounceTimer: NodeJS.Timeout | undefined;

        quickPick.onDidChangeValue(value => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
                if (value.trim().length < 2) {
                    quickPick.items = [];
                    return;
                }

                quickPick.busy = true;
                try {
                    const results = await searchProvider.search(value);
                    quickPick.items = results.map(r => ({
                        label: r.matchType === 'filename'
                            ? `$(file) ${r.fileName}`
                            : `$(search) ${r.fileName}:${r.lineNumber}`,
                        description: r.brainName,
                        detail: r.matchType === 'content' ? r.matchLine : undefined,
                        _filePath: r.filePath,
                        _lineNumber: r.lineNumber
                    } as any));
                } catch (e) {
                    console.error('Search error:', e);
                }
                quickPick.busy = false;
            }, 300);
        });

        quickPick.onDidAccept(() => {
            const selected = quickPick.selectedItems[0] as any;
            if (selected && selected._filePath) {
                const uri = vscode.Uri.file(selected._filePath);
                const line = selected._lineNumber ? selected._lineNumber - 1 : 0;
                vscode.window.showTextDocument(uri, {
                    selection: new vscode.Range(line, 0, line, 0),
                    preview: true
                }).then(() => revealFileInTree(selected._filePath));
            }
            quickPick.hide();
        });

        quickPick.onDidHide(() => quickPick.dispose());
        quickPick.show();
    });

    // 5. Recent Activity Command
    let recentDisposable = vscode.commands.registerCommand('antigravity-brain.recentActivity', async () => {
        const graph = await brainManager.buildGraph();
        let rootPath = brainManager.rootPath;
        if (rootPath.startsWith('~')) {
            rootPath = path.join(process.env.HOME || process.env.USERPROFILE || '', rootPath.slice(1));
        }

        // Sort all nodes by updatedAt descending
        const sorted = graph.nodes
            .filter(n => n.metadata?.updatedAt)
            .sort((a, b) => {
                const timeA = new Date(a.metadata!.updatedAt!).getTime();
                const timeB = new Date(b.metadata!.updatedAt!).getTime();
                return timeB - timeA;
            })
            .slice(0, 30);

        const items = sorted.map(node => {
            const relativePath = path.relative(rootPath, node.path);
            const segments = relativePath.split(path.sep);
            const brainId = segments.length > 1 ? segments[0] : '(root)';

            // Resolve brain display name from task.md
            let brainName = brainId;
            if (segments.length > 1) {
                try {
                    const brainDir = path.join(rootPath, brainId);
                    const taskMdPath = path.join(brainDir, 'task.md');
                    if (fs.existsSync(taskMdPath)) {
                        const content = fs.readFileSync(taskMdPath, 'utf8');
                        const lines = content.split('\n');
                        let inFrontmatter = false;
                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i].trim();
                            if (i === 0 && line === '---') { inFrontmatter = true; continue; }
                            if (inFrontmatter) { if (line === '---') inFrontmatter = false; continue; }
                            if (line.startsWith('# ')) { brainName = line.substring(2).trim(); break; }
                        }
                    }
                } catch (_) {}
            }

            // Format time
            let timeStr = '';
            if (node.metadata?.updatedAt) {
                const date = new Date(node.metadata.updatedAt);
                timeStr = `${date.getFullYear()}/${(date.getMonth()+1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
            }

            return {
                label: `$(file) ${node.name}`,
                description: timeStr,
                detail: brainName,
                _filePath: node.path
            } as any;
        });

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '⏰ Recent Activity — select a file to open',
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (selected && selected._filePath) {
            vscode.window.showTextDocument(vscode.Uri.file(selected._filePath), { preview: true })
                .then(() => revealFileInTree(selected._filePath));
        }
    });

    // 6. Locate in Tree Command — highlight current file in sidebar
    let locateDisposable = vscode.commands.registerCommand('antigravity-brain.locateInTree', async () => {
        let filePath = getActiveFilePath();
        
        // Strip .resolved suffix (e.g. task.md.resolved -> task.md)
        if (filePath && filePath.includes('.resolved')) {
            filePath = filePath.split('.resolved')[0];
        }

        if (filePath) {
            await revealFileInTree(filePath);
        } else {
            vscode.window.showWarningMessage('Cannot locate: no active file detected.');
        }
    });

    // 7. Refresh Tree Command
    let refreshDisposable = vscode.commands.registerCommand('antigravity-brain.refreshTree', () => {
        treeProvider.refresh();
    });

    // 8. Pin Brain Command
    let pinDisposable = vscode.commands.registerCommand('antigravity-brain.pinBrain', async (node: BrainNode) => {
        if (!node || node.type !== 'directory') { return; }
        const taskMdPath = path.join(node.path, 'task.md');
        updateFrontmatter(taskMdPath, { pinned: true });
        treeProvider.refresh();
        vscode.window.showInformationMessage(`📌 Pinned: ${node.name}`);
    });

    // 9. Unpin Brain Command
    let unpinDisposable = vscode.commands.registerCommand('antigravity-brain.unpinBrain', async (node: BrainNode) => {
        if (!node || node.type !== 'directory') { return; }
        const taskMdPath = path.join(node.path, 'task.md');
        updateFrontmatter(taskMdPath, { pinned: false });
        treeProvider.refresh();
        vscode.window.showInformationMessage(`📌 Unpinned: ${node.name}`);
    });

    // 10. Manage Tags Command
    let tagsDisposable = vscode.commands.registerCommand('antigravity-brain.manageTags', async (node: BrainNode) => {
        if (!node || node.type !== 'directory') { return; }
        const taskMdPath = path.join(node.path, 'task.md');
        const currentFm = parseFrontmatter(taskMdPath);
        const currentTags = currentFm.tags || [];

        // Collect all existing tags across all brains
        const allTagsSet = new Set<string>(currentTags);
        let rootPath = brainManager.rootPath;
        if (rootPath.startsWith('~')) {
            rootPath = path.join(process.env.HOME || process.env.USERPROFILE || '', rootPath.slice(1));
        }
        try {
            const entries = fs.readdirSync(rootPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const fm = parseFrontmatter(path.join(rootPath, entry.name, 'task.md'));
                    (fm.tags || []).forEach(t => allTagsSet.add(t));
                }
            }
        } catch (_) {}

        const allTagsSorted = Array.from(allTagsSet).sort();

        // Use createQuickPick for dynamic "add new tag" UX
        const qp = vscode.window.createQuickPick<vscode.QuickPickItem>();
        qp.title = `🏷️ Tags: ${node.name}`;
        qp.placeholder = 'Type to search or create a new tag';
        qp.canSelectMany = true;

        // Track selected tags (start with current tags)
        const selectedLabels = new Set<string>(currentTags);

        const buildItems = (filterText: string): vscode.QuickPickItem[] => {
            const items: vscode.QuickPickItem[] = allTagsSorted.map(tag => ({
                label: tag,
                picked: selectedLabels.has(tag)
            }));
            // If typed value doesn't match any existing tag, show "Add" at top
            const trimmed = filterText.trim();
            const exactMatch = allTagsSorted.some(t => t.toLowerCase() === trimmed.toLowerCase());
            if (trimmed && !exactMatch) {
                items.unshift({
                    label: `$(add) Add "${trimmed}"`,
                    description: 'Create new tag',
                    alwaysShow: true
                });
            }
            return items;
        };

        qp.items = buildItems('');
        qp.selectedItems = qp.items.filter(i => currentTags.includes(i.label));

        qp.onDidChangeValue(value => {
            qp.items = buildItems(value);
            qp.selectedItems = qp.items.filter(i => selectedLabels.has(i.label));
        });

        qp.onDidChangeSelection(selected => {
            // Handle "Add xxx" item specially
            const addItem = selected.find(i => i.label.startsWith('$(add) Add "'));
            if (addItem) {
                const match = addItem.label.match(/Add "(.+)"/);
                if (match) {
                    const newTag = match[1].trim();
                    if (newTag && !allTagsSet.has(newTag)) {
                        allTagsSet.add(newTag);
                        allTagsSorted.push(newTag);
                        allTagsSorted.sort();
                        selectedLabels.add(newTag);
                    }
                }
                qp.value = '';
                qp.items = buildItems('');
                qp.selectedItems = qp.items.filter(i => selectedLabels.has(i.label));
                return;
            }
            // Sync selectedLabels from real tag selections
            selectedLabels.clear();
            selected.filter(i => !i.label.startsWith('$(add)')).forEach(i => selectedLabels.add(i.label));
        });

        qp.show(); // Must call show() BEFORE awaiting, so onDidHide fires correctly

        const result = await new Promise<string[] | undefined>(resolve => {
            qp.onDidAccept(() => { resolve(Array.from(selectedLabels)); qp.hide(); });
            qp.onDidHide(() => { resolve(undefined); qp.dispose(); });
        });

        if (result === undefined) { return; } // Cancelled

        updateFrontmatter(taskMdPath, { tags: result });
        treeProvider.refresh();
        vscode.window.showInformationMessage(
            result.length > 0
                ? `🏷️ Tags updated: [${result.join(', ')}]`
                : `🏷️ All tags removed from: ${node.name}`
        );
    });

    // 11. Filter by Tag Command
    let filterTagDisposable = vscode.commands.registerCommand('antigravity-brain.filterByTag', async () => {
        let rootPath = brainManager.rootPath;
        if (rootPath.startsWith('~')) {
            rootPath = path.join(process.env.HOME || process.env.USERPROFILE || '', rootPath.slice(1));
        }

        // Collect all tags across all brains
        const allTags = new Set<string>();
        try {
            const entries = fs.readdirSync(rootPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const fm = parseFrontmatter(path.join(rootPath, entry.name, 'task.md'));
                    (fm.tags || []).forEach(t => allTags.add(t));
                }
            }
        } catch (_) {}

        if (allTags.size === 0) {
            vscode.window.showInformationMessage('No tags found. Add tags to your brains first via right-click → Manage Tags.');
            return;
        }

        const SHOW_ALL = '$(list-unordered) Show all brains (clear filter)';
        const currentFilter = treeProvider.activeTagFilter;

        const items: vscode.QuickPickItem[] = [
            { label: SHOW_ALL, description: currentFilter ? `(current: ${currentFilter})` : '(no filter active)' },
            ...Array.from(allTags).sort().map(tag => ({
                label: `$(tag) ${tag}`,
                description: tag === currentFilter ? '✓ active' : undefined
            }))
        ];

        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: '🏷️ Filter brains by tag...',
            title: 'Tag Filter'
        });

        if (!picked) { return; }

        if (picked.label === SHOW_ALL) {
            treeProvider.setTagFilter(undefined);
            vscode.window.showInformationMessage('🏷️ Tag filter cleared — showing all brains');
        } else {
            const tag = picked.label.replace('$(tag) ', '');
            treeProvider.setTagFilter(tag);
            vscode.window.showInformationMessage(`🏷️ Filtering by tag: [${tag}]`);
        }
    });

	context.subscriptions.push(disposable);
    context.subscriptions.push(historyDisposable);
    context.subscriptions.push(searchDisposable);
    context.subscriptions.push(recentDisposable);
    context.subscriptions.push(locateDisposable);
    context.subscriptions.push(refreshDisposable);
    context.subscriptions.push(pinDisposable);
    context.subscriptions.push(unpinDisposable);
    context.subscriptions.push(tagsDisposable);
    context.subscriptions.push(filterTagDisposable);
    context.subscriptions.push(treeView);
}

export function deactivate() {}
