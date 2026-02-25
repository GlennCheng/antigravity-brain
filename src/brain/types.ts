
export interface BrainNodeMetadata {
    updatedAt?: string;       // ISO date string
    lastUpdated?: number;     // Timestamp (ms)
    fileCount?: number;
    pinned?: boolean;         // true if brain is pinned to the top
    tags?: string[];          // List of user-defined tags
    [key: string]: any;       // Allow extra fields from .metadata.json
}

export interface BrainNode {
    id: string; // Absolute path or unique ID
    path: string;
    name: string;
    content?: string; // Optional content for parsing
    type: 'file' | 'directory' | 'summary';
    resolvedVersions?: string[]; // Paths to .resolved versions
    metadata?: BrainNodeMetadata;
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
