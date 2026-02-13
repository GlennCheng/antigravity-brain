import { FileSystemReader } from './FileSystemReader';
import { MarkdownParser } from './MarkdownParser';
import { BrainGraph } from './types';

export class BrainManager {
    private reader: FileSystemReader;
    private parser: MarkdownParser;

    constructor(rootPath: string) {
        this.reader = new FileSystemReader(rootPath);
        this.parser = new MarkdownParser();
    }

    public get rootPath(): string {
        return this.reader.rootPath;
    }

    /**
     * Builds the full brain graph by scanning files and parsing links.
     */
    public async buildGraph(): Promise<BrainGraph> {
        console.log('Scanning brain...');
        const nodes = await this.reader.scan();
        console.log(`Found ${nodes.length} nodes.`);

        console.log('Parsing links...');
        const links = await this.parser.parseLinks(nodes);
        console.log(`Found ${links.length} links.`);

        return { nodes, links };
    }
}
