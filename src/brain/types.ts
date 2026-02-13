
export interface BrainNode {
    id: string; // Absolute path or unique ID
    path: string;
    name: string;
    content?: string; // Optional content for parsing
    type: 'file' | 'directory' | 'summary';
    resolvedVersions?: string[]; // Paths to .resolved versions
    metadata?: any; // Content of .metadata.json
}

export interface BrainLink {
    source: string;
    target: string;
    type: 'wikilink' | 'mdlink' | 'backlink';
}

export interface BrainGraph {
    nodes: BrainNode[];
    links: BrainLink[];
}
