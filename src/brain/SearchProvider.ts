import * as fs from 'fs';
import * as path from 'path';

export interface SearchResult {
    filePath: string;
    brainName: string;
    fileName: string;
    matchLine: string;
    lineNumber: number;
    matchType: 'content' | 'filename';
}

export class SearchProvider {
    constructor(private rootPath: string) {}

    /**
     * Search across all Brain directories for a query string.
     * Searches both filenames and file contents.
     */
    public async search(query: string, maxResults: number = 50): Promise<SearchResult[]> {
        if (!query || query.trim().length < 2) return [];

        const expandedPath = this.expandHomeDir(this.rootPath);
        if (!fs.existsSync(expandedPath)) return [];

        const results: SearchResult[] = [];
        const lowerQuery = query.toLowerCase();

        try {
            const brainDirs = fs.readdirSync(expandedPath, { withFileTypes: true })
                .filter(d => d.isDirectory() && !d.name.startsWith('.'));

            for (const dir of brainDirs) {
                if (results.length >= maxResults) break;

                const brainPath = path.join(expandedPath, dir.name);
                const brainName = this.getBrainDisplayName(brainPath, dir.name);

                // Scan all .md files in this brain directory
                const mdFiles = this.findMdFiles(brainPath);

                for (const filePath of mdFiles) {
                    if (results.length >= maxResults) break;

                    const fileName = path.basename(filePath);

                    // Skip resolved/metadata files
                    if (fileName.includes('.resolved') || fileName.includes('.metadata.json')) continue;

                    // 1. Check filename match
                    if (fileName.toLowerCase().includes(lowerQuery)) {
                        results.push({
                            filePath,
                            brainName,
                            fileName,
                            matchLine: '',
                            lineNumber: 0,
                            matchType: 'filename'
                        });
                    }

                    // 2. Check content match
                    try {
                        const content = fs.readFileSync(filePath, 'utf8');
                        const lines = content.split('\n');
                        for (let i = 0; i < lines.length; i++) {
                            if (results.length >= maxResults) break;
                            if (lines[i].toLowerCase().includes(lowerQuery)) {
                                results.push({
                                    filePath,
                                    brainName,
                                    fileName,
                                    matchLine: lines[i].trim().substring(0, 120),
                                    lineNumber: i + 1,
                                    matchType: 'content'
                                });
                            }
                        }
                    } catch (_) {
                        // Skip unreadable files
                    }
                }
            }
        } catch (e) {
            console.warn('Search error:', e);
        }

        return results;
    }

    private findMdFiles(dirPath: string): string[] {
        const results: string[] = [];
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    // Don't recurse into .system_generated or hidden dirs
                    results.push(...this.findMdFiles(fullPath));
                } else if (entry.isFile() && entry.name.endsWith('.md')) {
                    results.push(fullPath);
                }
            }
        } catch (_) {
            // Skip unreadable directories
        }
        return results;
    }

    private getBrainDisplayName(brainPath: string, fallback: string): string {
        try {
            const taskMdPath = path.join(brainPath, 'task.md');
            if (fs.existsSync(taskMdPath)) {
                const content = fs.readFileSync(taskMdPath, 'utf8');
                const lines = content.split('\n');
                let inFrontmatter = false;
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (i === 0 && line === '---') { inFrontmatter = true; continue; }
                    if (inFrontmatter) { if (line === '---') inFrontmatter = false; continue; }
                    if (line.startsWith('# ')) return line.substring(2).trim();
                }
            }
        } catch (_) {}
        return fallback;
    }

    private expandHomeDir(pathStr: string): string {
        if (pathStr.startsWith('~')) {
            return path.join(process.env.HOME || process.env.USERPROFILE || '', pathStr.slice(1));
        }
        return pathStr;
    }
}
