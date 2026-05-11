import type { ParsedScriptLibrary, ScriptEntry } from './types';

const LEGACY_JSON_FENCE_RE = /^\s*```json[ \t]*\n([\s\S]*?)\n```/i;

interface RawScriptRecord {
    content: string;
    enabled: boolean;
    index: number;
    legacyId?: string;
    title: string;
}

function splitScriptRecords(text: string): string[] {
    const records: string[] = [];
    const current: string[] = [];
    for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
        if (line.trim() === '---') {
            const record = current.join('\n').trim();
            if (record) {
                records.push(record);
            }
            current.length = 0;
            continue;
        }
        current.push(line);
    }

    const record = current.join('\n').trim();
    if (record) {
        records.push(record);
    }
    return records;
}

function isLegacyRecord(record: string): boolean {
    return LEGACY_JSON_FENCE_RE.test(record);
}

function createScriptTitle(content: string): string {
    const firstLine = content.split('\n').map(line => line.trim()).find(Boolean) || 'Untitled script';
    const normalized = firstLine.replace(/\s+/g, ' ');
    if (normalized.length <= 40) {
        return normalized;
    }
    return `${normalized.slice(0, 40)}...`;
}

export function validateScriptText(content: string): void {
    if (content.trim() === '') {
        throw new Error('content is required');
    }
}

function parseLegacyRecord(record: string, recordNumber: number): RawScriptRecord {
    const match = LEGACY_JSON_FENCE_RE.exec(record);
    if (!match || match.index === undefined) {
        throw new Error(`Script block #${recordNumber} missing json fenced block`);
    }

    let rawMeta: Record<string, unknown>;
    try {
        rawMeta = JSON.parse(match[1]);
    } catch (e) {
        throw new Error(`Invalid JSON in script block #${recordNumber}: ${(e as Error).message}`);
    }
    if (!rawMeta || typeof rawMeta !== 'object' || Array.isArray(rawMeta)) {
        throw new Error(`Invalid JSON in script block #${recordNumber}: metadata must be an object`);
    }

    const content = record.slice(match.index + match[0].length).trim();
    try {
        validateScriptText(content);
    } catch (e) {
        throw new Error(`Invalid script block #${recordNumber}: ${(e as Error).message}`);
    }

    const title = typeof rawMeta.title === 'string' && rawMeta.title.trim()
        ? rawMeta.title.trim()
        : createScriptTitle(content);
    return {
        content,
        enabled: rawMeta.enabled !== false,
        index: recordNumber - 1,
        legacyId: typeof rawMeta.id === 'string' && rawMeta.id.trim() ? rawMeta.id.trim() : undefined,
        title,
    };
}

function parsePlainRecord(record: string, recordNumber: number): RawScriptRecord {
    validateScriptText(record);
    return {
        content: record.trim(),
        enabled: true,
        index: recordNumber - 1,
        title: createScriptTitle(record),
    };
}

function toScriptEntry(record: RawScriptRecord, index: number): ScriptEntry {
    return {
        id: `${index + 1}`,
        title: record.title,
        content: record.content,
        index,
    };
}

export function parseScriptsText(text: string): ParsedScriptLibrary {
    const records = splitScriptRecords(text);
    const hasLegacyRecords = records.some(isLegacyRecord);
    const rawRecords: RawScriptRecord[] = [];
    const latestLegacyById = new Map<string, RawScriptRecord>();
    let seenLegacyRecord = false;

    records.forEach((record, i) => {
        if (isLegacyRecord(record)) {
            seenLegacyRecord = true;
            const parsed = parseLegacyRecord(record, i + 1);
            if (parsed.legacyId) {
                latestLegacyById.set(parsed.legacyId, parsed);
            } else {
                rawRecords.push(parsed);
            }
            return;
        }

        // Old Markdown libraries often had prose before the first --- block. Keep accepting that
        // format without turning the prose into a script while migrating to plain-text storage.
        if (hasLegacyRecords && !seenLegacyRecord) {
            return;
        }
        rawRecords.push(parsePlainRecord(record, i + 1));
    });

    const selectedRecords = [
        ...rawRecords,
        ...Array.from(latestLegacyById.values()),
    ]
        .filter(record => record.enabled)
        .sort((a, b) => a.index - b.index);

    const entries = selectedRecords.map(toScriptEntry);
    const byId = new Map(entries.map(entry => [entry.id, entry]));
    return {
        allVersions: entries,
        activeScripts: entries,
        byId,
    };
}

export function serializeScriptsText(scripts: Array<ScriptEntry | string>): string {
    const records = scripts.map((script) => {
        const content = typeof script === 'string' ? script : script.content;
        validateScriptText(content);
        return content.trim();
    });
    return records.length ? `${records.join('\n\n---\n\n')}\n` : '';
}

export function serializeScriptText(content: string): string {
    validateScriptText(content);
    return content.trim();
}
