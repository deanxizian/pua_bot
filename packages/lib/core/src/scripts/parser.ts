import type { ParsedScriptLibrary, ScriptEntry, ScriptMeta, ScriptMode } from './types';

const JSON_FENCE_RE = /```json[ \t]*\n([\s\S]*?)\n```/i;

function splitBlocks(markdown: string): string[] {
    const normalized = markdown.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    const blocks: string[] = [];
    let current: string[] = [];
    let seenDelimiter = false;

    for (const line of lines) {
        if (line.trim() === '---') {
            if (seenDelimiter) {
                blocks.push(current.join('\n'));
            }
            current = [];
            seenDelimiter = true;
            continue;
        }
        if (seenDelimiter) {
            current.push(line);
        }
    }

    if (seenDelimiter) {
        blocks.push(current.join('\n'));
    }

    return blocks;
}

function normalizeScriptMeta(raw: Partial<ScriptMeta>): ScriptMeta {
    const mode = raw.mode || 'exact';
    if (mode !== 'exact' && mode !== 'rewrite') {
        throw new Error(`mode must be "exact" or "rewrite", got ${String(raw.mode)}`);
    }

    return {
        id: raw.id as string,
        title: raw.title as string,
        triggers: raw.triggers ?? [],
        mode: mode as ScriptMode,
        priority: raw.priority ?? 0,
        enabled: raw.enabled ?? true,
    };
}

export function validateScriptBlock(meta: Partial<ScriptMeta>, content: string): void {
    if (typeof meta.id !== 'string' || meta.id.trim() === '') {
        throw new Error('id is required');
    }
    if (typeof meta.title !== 'string' || meta.title.trim() === '') {
        throw new Error('title is required');
    }
    if (meta.triggers !== undefined) {
        if (!Array.isArray(meta.triggers)) {
            throw new TypeError('triggers must be a string array');
        }
        for (const trigger of meta.triggers) {
            if (typeof trigger !== 'string') {
                throw new TypeError('triggers must be a string array');
            }
        }
    }
    if (meta.mode !== undefined && meta.mode !== 'exact' && meta.mode !== 'rewrite') {
        throw new Error('mode must be "exact" or "rewrite"');
    }
    if (meta.priority !== undefined && (typeof meta.priority !== 'number' || !Number.isFinite(meta.priority))) {
        throw new Error('priority must be a finite number');
    }
    if (meta.enabled !== undefined && typeof meta.enabled !== 'boolean') {
        throw new Error('enabled must be a boolean');
    }
    if (content.trim() === '') {
        throw new Error('content is required');
    }
}

function parseScriptBlock(block: string, blockNumber: number): Omit<ScriptEntry, 'index'> {
    const match = JSON_FENCE_RE.exec(block);
    if (!match || match.index === undefined) {
        throw new Error(`Script block #${blockNumber} missing json fenced block`);
    }

    let rawMeta: Partial<ScriptMeta>;
    try {
        rawMeta = JSON.parse(match[1]);
    } catch (e) {
        throw new Error(`Invalid JSON in script block #${blockNumber}: ${(e as Error).message}`);
    }
    if (!rawMeta || typeof rawMeta !== 'object' || Array.isArray(rawMeta)) {
        throw new Error(`Invalid JSON in script block #${blockNumber}: metadata must be an object`);
    }

    const content = block.slice(match.index + match[0].length).trim();
    try {
        validateScriptBlock(rawMeta, content);
    } catch (e) {
        throw new Error(`Invalid script block #${blockNumber}: ${(e as Error).message}`);
    }

    const meta = normalizeScriptMeta(rawMeta);
    meta.id = meta.id.trim();
    meta.title = meta.title.trim();
    meta.triggers = meta.triggers.map(trigger => trigger.trim()).filter(trigger => trigger !== '');

    return { meta, content };
}

export function parseScriptsMarkdown(markdown: string): ParsedScriptLibrary {
    const blocks = splitBlocks(markdown);
    const allVersions: ScriptEntry[] = [];
    const byId = new Map<string, ScriptEntry>();

    blocks.forEach((block, i) => {
        if (block.trim() === '') {
            return;
        }
        const parsed = parseScriptBlock(block, i + 1);
        const entry: ScriptEntry = {
            ...parsed,
            index: allVersions.length,
        };
        allVersions.push(entry);
        byId.set(entry.meta.id, entry);
    });

    const activeScripts = Array.from(byId.values()).filter(entry => entry.meta.enabled);
    const fallback = activeScripts.find(entry => entry.meta.id === 'fallback') || null;

    return {
        allVersions,
        activeScripts,
        byId,
        fallback,
    };
}

export function serializeScriptBlock(meta: Partial<ScriptMeta>, content: string): string {
    validateScriptBlock(meta, content);
    const normalized = normalizeScriptMeta(meta);
    normalized.id = normalized.id.trim();
    normalized.title = normalized.title.trim();
    normalized.triggers = normalized.triggers.map(trigger => trigger.trim()).filter(trigger => trigger !== '');

    return [
        '---',
        '',
        '```json',
        JSON.stringify(normalized, null, 2),
        '```',
        '',
        content.trim(),
        '',
    ].join('\n');
}
