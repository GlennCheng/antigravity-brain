import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BrainManager } from './brain/BrainManager';
import { BrainTreeProvider } from './brain/BrainTreeProvider';
import { SearchProvider } from './brain/SearchProvider';
import { WebviewManager } from './webview/WebviewManager';
import { HistoryWebviewManager } from './history/HistoryWebviewManager';
import { BrainNode } from './brain/types';

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
			const node = await treeProvider.findNodeByPath(filePath);
			if (node) {
				await treeView.reveal(node, { select: true, focus: false, expand: true });
			}
		} catch (_) {
			// Silently fail — tree may not be ready yet
		}
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
                const timeA = new Date(a.metadata.updatedAt).getTime();
                const timeB = new Date(b.metadata.updatedAt).getTime();
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
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            await revealFileInTree(activeEditor.document.uri.fsPath);
        } else {
            vscode.window.showInformationMessage('No active file to locate.');
        }
    });

    // 7. Refresh Tree Command
    let refreshDisposable = vscode.commands.registerCommand('antigravity-brain.refreshTree', () => {
        treeProvider.refresh();
    });

	context.subscriptions.push(disposable);
    context.subscriptions.push(historyDisposable);
    context.subscriptions.push(searchDisposable);
    context.subscriptions.push(recentDisposable);
    context.subscriptions.push(locateDisposable);
    context.subscriptions.push(refreshDisposable);
    context.subscriptions.push(treeView);
}

export function deactivate() {}
