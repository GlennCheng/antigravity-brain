import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { BrainNode } from './types';

export class FileSystemReader {
    public rootPath: string; // Changed to public or add getter, but public for simplicity here

    constructor(rootPath: string) {
        this.rootPath = rootPath;
    }

    /**
     * Scans the brain directory for Markdown files.
     */
    public async scan(): Promise<BrainNode[]> {
        // Expand home directory if needed
        const expandedPath = this.expandHomeDir(this.rootPath);

        if (!fs.existsSync(expandedPath)) {
            console.warn(`Brain path does not exist: ${expandedPath}`);
            return [];
        }

        return new Promise((resolve, reject) => {
            // Find all .md files recursively
            glob("**/*.md*", { cwd: expandedPath, absolute: true }, (err, files) => {
                if (err) {
                    return reject(err);
                }

                if (!files) {
                    return resolve([]);
                }

                // Group files by base name to handle .resolved versions
                const nodeMap = new Map<string, BrainNode>();

                files.forEach(filePath => {
                    // Check if it's a resolved file
                    // Patterns: file.md.resolved, file.md.resolved.0
                    // Check if it's a resolved file OR a metadata file
                    // Patterns: file.md.resolved, file.md.metadata.json
                    const isResolved = filePath.includes('.resolved');
                    const isMetadata = filePath.endsWith('.metadata.json');

                    if (isMetadata) {
                        return; // Skip metadata files as individual nodes, we process them with the main file
                    }
                    
                    let originalPath = filePath;
                    if (isResolved) {
                        // Extract base path: /path/to/file.md.resolved.1 -> /path/to/file.md
                        originalPath = filePath.split('.resolved')[0];
                    }

                    if (!nodeMap.has(originalPath)) {
                        nodeMap.set(originalPath, {
                            id: originalPath,
                            path: originalPath,
                            name: path.basename(originalPath),
                            type: 'file',
                            resolvedVersions: []
                        });
                    }

                    if (isResolved) {
                        const node = nodeMap.get(originalPath);
                        // Only include numbered .resolved.N files (skip unnumbered .resolved which is a duplicate of the latest)
                        const isNumbered = /\.resolved\.\d+$/.test(filePath);
                        if (node && node.resolvedVersions && isNumbered) {
                            node.resolvedVersions.push(filePath);
                        }
                    } else {
                         // Check if metadata exists for this file
                         const metadataPath = originalPath + '.metadata.json';
                         const node = nodeMap.get(originalPath);
                         if (node && fs.existsSync(metadataPath)) {
                             try {
                                 const metadataContent = fs.readFileSync(metadataPath, 'utf8');
                                 node.metadata = JSON.parse(metadataContent);
                             } catch (e) {
                                 console.warn(`Failed to parse metadata for ${originalPath}`, e);
                             }
                         }
                    }
                });
                
                // Start with values
                const nodes = Array.from(nodeMap.values());
                
                // Filter out nodes that don't actually exist as primary files
                // (In case we only have .resolved but no .md? Unlikely but possible)
                // Actually, if we have file.md.resolved but NOT file.md, we should probably still show it?
                // For now, let's keep all keys in the map.

                resolve(nodes);
            });
        });
    }

    private expandHomeDir(pathStr: string): string {
        if (pathStr.startsWith('~')) {
            return path.join(process.env.HOME || process.env.USERPROFILE || '', pathStr.slice(1));
        }
        return pathStr;
    }
}
