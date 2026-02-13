import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BrainManager } from './BrainManager';
import { BrainNode } from './types';

export class BrainTreeProvider implements vscode.TreeDataProvider<BrainNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<BrainNode | undefined | null | void> = new vscode.EventEmitter<BrainNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<BrainNode | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private brainManager: BrainManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: BrainNode): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(element.name, element.type === 'directory' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        
        if (element.type === 'file') {
             treeItem.resourceUri = vscode.Uri.file(element.path);
             treeItem.command = {
                command: 'vscode.open',
                title: "Open File",
                arguments: [vscode.Uri.file(element.path)]
            };
            
            // Show resolved versions count if any
            if (element.resolvedVersions && element.resolvedVersions.length > 0) {
                treeItem.description = `${element.resolvedVersions.length} iterations`;
                // Add context value to potentially add actions later
                treeItem.contextValue = 'fileWithHistory';
            }
            
            // Show Updated At if metadata exists
            if (element.metadata && element.metadata.updatedAt) {
                 const date = new Date(element.metadata.updatedAt);
                 // Format: YYYY/MM/DD HH:mm
                 const dateStr = `${date.getFullYear()}/${(date.getMonth()+1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
                 
                 if (treeItem.description) {
                     treeItem.description += ` • ${dateStr}`;
                 } else {
                     treeItem.description = dateStr;
                 }
            }
            
            // Custom Icons based on filename
            const lowerName = element.name.toLowerCase();
            if (lowerName.includes('task')) {
                treeItem.iconPath = new vscode.ThemeIcon('checklist');
            } else if (lowerName.includes('plan') || lowerName.includes('implementation')) {
                treeItem.iconPath = new vscode.ThemeIcon('book');
            } else if (lowerName.includes('walkthrough')) {
                treeItem.iconPath = new vscode.ThemeIcon('play-circle');
            } else {
                // Default icon for other files
                treeItem.iconPath = new vscode.ThemeIcon('file');
            }

            // Markdown preview tooltip
            try {
                const content = fs.readFileSync(element.path, 'utf8');
                const lines = content.split('\n');
                const previewLines = lines.slice(0, 30);
                let preview = previewLines.join('\n');
                if (lines.length > 30) {
                    preview += `\n\n---\n*... (${lines.length} lines total)*`;
                }
                const md = new vscode.MarkdownString(preview);
                md.isTrusted = true;
                treeItem.tooltip = md;
            } catch (_) {
                // Keep default tooltip if file can't be read
            }
        } else if (element.type === 'summary') {
             // Summary header node (non-expandable count)
             treeItem.iconPath = new vscode.ThemeIcon('library');
             treeItem.contextValue = 'brainSummary';
             treeItem.tooltip = 'Total number of Brain tasks';
             treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;
        } else {
             // For directories (Brain Tasks)
             treeItem.iconPath = new vscode.ThemeIcon('project');
             treeItem.contextValue = 'brainTask';
             // Tooltip shows the UUID/Path
             treeItem.tooltip = element.path;
             
             // Description order: file count → time → brain ID
             const parts: string[] = [];
             
             // File count
             const fileCount = element.metadata?.fileCount || 0;
             parts.push(`📄 ${fileCount}`);
             
             // Latest update time
             if (element.metadata && element.metadata.lastUpdated) {
                 const date = new Date(element.metadata.lastUpdated);
                 const dateStr = `${date.getFullYear()}/${(date.getMonth()+1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
                 parts.push(dateStr);
             }
             
             // Brain ID (folder basename)
             parts.push(path.basename(element.path));
             
             treeItem.description = parts.join(' • ');
        }

        return treeItem;
    }

    async getChildren(element?: BrainNode): Promise<BrainNode[]> {
        const graph = await this.brainManager.buildGraph();
        let rootPath = this.brainManager.rootPath;
        if (rootPath.startsWith('~')) {
            rootPath = path.join(process.env.HOME || process.env.USERPROFILE || '', rootPath.slice(1));
        }
        
        if (!element) {
            // Root: Return Directories (Brain Tasks) and Root Files
            // Group nodes by their immediate parent folder inside rootPath
            const taskFolders = new Map<string, BrainNode>();
            const rootFiles: BrainNode[] = [];

            graph.nodes.forEach(node => {
                const relativePath = path.relative(rootPath, node.path);
                const segments = relativePath.split(path.sep);
                
                // If it's a file in a subdirectory
                if (segments.length > 1) {
                    const folderName = segments[0];
                    const folderPath = path.join(rootPath, folderName);
                    
                    if (!taskFolders.has(folderName)) {
                        // Try to find a human readable name from task.md inside this folder
                        let displayName = folderName;
                        try {
                            const taskMdPath = path.join(folderPath, 'task.md');
                            if (fs.existsSync(taskMdPath)) {
                                const content = fs.readFileSync(taskMdPath, 'utf8');
                                const lines = content.split('\n');
                                let inFrontmatter = false;
                                // Look for first H1 header, skipping frontmatter
                                for (let i = 0; i < lines.length; i++) {
                                    const line = lines[i].trim();
                                    if (i === 0 && line === '---') {
                                        inFrontmatter = true;
                                        continue;
                                    }
                                    if (inFrontmatter) {
                                        if (line === '---') {
                                            inFrontmatter = false;
                                        }
                                        continue;
                                    }
                                    
                                    // Match H1 headers like "# Title"
                                    if (line.startsWith('# ')) {
                                        displayName = line.substring(2).trim();
                                        break;
                                    }
                                }
                            }
                        } catch (e) {
                            // Ignore read errors
                        }

                        taskFolders.set(folderName, {
                            id: folderPath,
                            path: folderPath,
                            name: displayName,
                            type: 'directory',
                            metadata: { lastUpdated: 0, fileCount: 0 } // Initialize lastUpdated and fileCount
                        });
                    }
                    
                    // Update folder's lastUpdated time and file count
                    if (taskFolders.has(folderName)) {
                        const folderNode = taskFolders.get(folderName);
                        if (folderNode) {
                            // Count this file (non-history)
                            folderNode.metadata.fileCount = (folderNode.metadata.fileCount || 0) + 1;
                            
                            if (node.metadata && node.metadata.updatedAt) {
                                const fileTime = new Date(node.metadata.updatedAt).getTime();
                                if (fileTime > (folderNode.metadata.lastUpdated || 0)) {
                                    folderNode.metadata.lastUpdated = fileTime;
                                }
                            }
                        }
                    }
                } else if (segments.length === 1) {
                    // File in the root
                    rootFiles.push(node);
                }
            });

            const folders = Array.from(taskFolders.values()).sort((a, b) => {
                 // Sort folders by lastUpdated desc, then name
                 const timeA = a.metadata?.lastUpdated || 0;
                 const timeB = b.metadata?.lastUpdated || 0;
                 if (timeA !== timeB) return timeB - timeA;
                 return a.name.localeCompare(b.name);
            });
            
            rootFiles.sort((a, b) => {
                // Sort files by updatedAt desc, then name
                 const timeA = a.metadata?.updatedAt ? new Date(a.metadata.updatedAt).getTime() : 0;
                 const timeB = b.metadata?.updatedAt ? new Date(b.metadata.updatedAt).getTime() : 0;
                 if (timeA !== timeB) return timeB - timeA;
                 return a.name.localeCompare(b.name);
            });

            // Add summary header node at the top
            const summaryNode: BrainNode = {
                id: '__brain_summary__',
                path: '',
                name: `🧠 ${folders.length} Brains`,
                type: 'summary',
            };

            return [summaryNode, ...folders, ...rootFiles];
        } else if (element.type === 'directory') {
            // Directory: Return files inside this directory
             return graph.nodes.filter(node => {
                 const relativeToFolder = path.relative(element.path, node.path);
                 return !relativeToFolder.startsWith('..') && !path.isAbsolute(relativeToFolder) && !relativeToFolder.includes(path.sep);
            }).sort((a, b) => {
                 // Sort files by updatedAt desc, then name
                 const timeA = a.metadata?.updatedAt ? new Date(a.metadata.updatedAt).getTime() : 0;
                 const timeB = b.metadata?.updatedAt ? new Date(b.metadata.updatedAt).getTime() : 0;
                 if (timeA !== timeB) return timeB - timeA;
                 return a.name.localeCompare(b.name);
            });
        }

        return [];
    }

    /**
     * Required for TreeView.reveal() — returns the parent node of the given element.
     */
    getParent(element: BrainNode): vscode.ProviderResult<BrainNode> {
        if (element.type === 'summary' || element.type === 'directory') {
            return undefined; // Top-level items have no parent
        }

        // For files, derive the parent directory node
        let rootPath = this.brainManager.rootPath;
        if (rootPath.startsWith('~')) {
            rootPath = path.join(process.env.HOME || process.env.USERPROFILE || '', rootPath.slice(1));
        }

        const relativePath = path.relative(rootPath, element.path);
        const segments = relativePath.split(path.sep);

        if (segments.length > 1) {
            const folderName = segments[0];
            const folderPath = path.join(rootPath, folderName);

            // Try to get display name from task.md
            let displayName = folderName;
            try {
                const taskMdPath = path.join(folderPath, 'task.md');
                if (fs.existsSync(taskMdPath)) {
                    const content = fs.readFileSync(taskMdPath, 'utf8');
                    const lines = content.split('\n');
                    let inFrontmatter = false;
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (i === 0 && line === '---') { inFrontmatter = true; continue; }
                        if (inFrontmatter) { if (line === '---') inFrontmatter = false; continue; }
                        if (line.startsWith('# ')) { displayName = line.substring(2).trim(); break; }
                    }
                }
            } catch (_) {}

            return {
                id: folderPath,
                path: folderPath,
                name: displayName,
                type: 'directory',
                metadata: {}
            };
        }

        return undefined;
    }

    /**
     * Find a BrainNode by file path — used for TreeView.reveal().
     */
    async findNodeByPath(filePath: string): Promise<BrainNode | undefined> {
        const graph = await this.brainManager.buildGraph();
        return graph.nodes.find(n => n.path === filePath);
    }
}
