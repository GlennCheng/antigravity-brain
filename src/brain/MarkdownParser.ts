import * as fs from 'fs';
import * as path from 'path';
import { BrainNode, BrainLink } from './types';

export class MarkdownParser {
    
    /**
     * Parses a list of nodes to find links between them.
     */
    public async parseLinks(nodes: BrainNode[]): Promise<BrainLink[]> {
        const links: BrainLink[] = [];
        const nodeMap = new Map(nodes.map(n => [n.name, n.id])); // Map Name -> ID for WikiLinks

        for (const node of nodes) {
            const content = await this.readFile(node.path);
            if (!content) continue;

            // 1. Wiki Links [[Page Name]]
            const wikiRegex = /\[\[([^\]]+)\]\]/g;
            let match;
            while ((match = wikiRegex.exec(content)) !== null) {
                const targetName = match[1].split('|')[0].trim(); // Handle [[Name|Alias]]
                const targetId = nodeMap.get(targetName + '.md') || nodeMap.get(targetName);
                
                if (targetId) {
                    links.push({
                        source: node.id,
                        target: targetId,
                        type: 'wikilink'
                    });
                }
            }

            // 2. Markdown Links [Title](path)
            const mdRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
            while ((match = mdRegex.exec(content)) !== null) {
                const linkPath = match[2];
                // Resolve relative path
                if (!linkPath.startsWith('http')) {
                   try {
                        const absolutePath = path.resolve(path.dirname(node.path), linkPath);
                        // Check if this path exists in our nodes
                        const targetNode = nodes.find(n => n.path === absolutePath);
                        if (targetNode) {
                             links.push({
                                source: node.id,
                                target: targetNode.id,
                                type: 'mdlink'
                            });
                        }
                   } catch (e) {
                       // Ignore invalid paths
                   }
                }
            }
        }

        return links;
    }

    private async readFile(filePath: string): Promise<string> {
        try {
            return await fs.promises.readFile(filePath, 'utf-8');
        } catch (e) {
            console.error(`Failed to read file: ${filePath}`, e);
            return '';
        }
    }
}
