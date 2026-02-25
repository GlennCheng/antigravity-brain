import * as fs from 'fs';

export interface BrainFrontmatter {
    pinned?: boolean;
    tags?: string[];
}

/**
 * Parse YAML frontmatter from a task.md file.
 * Returns { pinned, tags } if present, otherwise returns empty object.
 */
export function parseFrontmatter(taskMdPath: string): BrainFrontmatter {
    try {
        if (!fs.existsSync(taskMdPath)) {
            return {};
        }
        const content = fs.readFileSync(taskMdPath, 'utf8');
        return parseFrontmatterFromContent(content);
    } catch (_) {
        return {};
    }
}

/**
 * Parse frontmatter from raw string content.
 */
export function parseFrontmatterFromContent(content: string): BrainFrontmatter {
    const result: BrainFrontmatter = {};
    const lines = content.split('\n');

    if (lines.length === 0 || lines[0].trim() !== '---') {
        return result;
    }

    let endIndex = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') {
            endIndex = i;
            break;
        }
    }

    if (endIndex === -1) {
        return result;
    }

    const frontmatterLines = lines.slice(1, endIndex);
    for (const line of frontmatterLines) {
        // Match `pinned: true` or `pinned: false`
        const pinnedMatch = line.match(/^pinned:\s*(true|false)\s*$/i);
        if (pinnedMatch) {
            result.pinned = pinnedMatch[1].toLowerCase() === 'true';
            continue;
        }

        // Match `tags: [tag1, tag2]` (inline array)
        const tagsInlineMatch = line.match(/^tags:\s*\[([^\]]*)\]\s*$/);
        if (tagsInlineMatch) {
            const tagStr = tagsInlineMatch[1];
            result.tags = tagStr
                .split(',')
                .map(t => t.trim().replace(/^['"]|['"]$/g, ''))
                .filter(t => t.length > 0);
        }
    }

    return result;
}

/**
 * Update frontmatter fields in a task.md file.
 * Merges updates into existing frontmatter or creates a new frontmatter block.
 */
export function updateFrontmatter(taskMdPath: string, updates: Partial<BrainFrontmatter>): void {
    let content = '';
    try {
        if (fs.existsSync(taskMdPath)) {
            content = fs.readFileSync(taskMdPath, 'utf8');
        }
    } catch (_) {}

    const newContent = updateFrontmatterInContent(content, updates);
    fs.writeFileSync(taskMdPath, newContent, 'utf8');
}

/**
 * Update frontmatter fields in a raw content string.
 * Exported for testability.
 */
export function updateFrontmatterInContent(content: string, updates: Partial<BrainFrontmatter>): string {
    const lines = content.split('\n');
    const hasFrontmatter = lines.length > 0 && lines[0].trim() === '---';

    let existingMeta: BrainFrontmatter = {};
    let bodyStartIndex = 0;

    if (hasFrontmatter) {
        let endIndex = -1;
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '---') {
                endIndex = i;
                break;
            }
        }

        if (endIndex !== -1) {
            existingMeta = parseFrontmatterFromContent(content);
            bodyStartIndex = endIndex + 1;
        }
    }

    // Merge updates
    const merged: BrainFrontmatter = { ...existingMeta, ...updates };

    // Clean up: if pinned is false, remove it entirely
    if (merged.pinned === false) {
        delete merged.pinned;
    }
    // Clean up: if tags is empty array, remove it
    if (merged.tags && merged.tags.length === 0) {
        delete merged.tags;
    }

    // Build new frontmatter block
    const body = hasFrontmatter
        ? lines.slice(bodyStartIndex).join('\n')
        : content;

    const hasMeaningfulMeta = merged.pinned !== undefined || (merged.tags && merged.tags.length > 0);

    if (!hasMeaningfulMeta) {
        // No metadata to store — remove frontmatter entirely
        return body.replace(/^\n+/, ''); // trim leading newlines from body
    }

    const fmLines: string[] = ['---'];
    if (merged.pinned) {
        fmLines.push('pinned: true');
    }
    if (merged.tags && merged.tags.length > 0) {
        fmLines.push(`tags: [${merged.tags.join(', ')}]`);
    }
    fmLines.push('---');

    const fmBlock = fmLines.join('\n');
    const bodyTrimmed = body.startsWith('\n') ? body : '\n' + body;

    return fmBlock + bodyTrimmed;
}
