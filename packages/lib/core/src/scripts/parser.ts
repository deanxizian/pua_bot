import type { ParsedScriptLibrary, ScriptEntry, ScriptSection } from './types';

const LEGACY_JSON_FENCE_RE = /^\s*```json[ \t]*\n([\s\S]*?)\n```/i;
const SECTION_LINE_RE = /^\s*\[([^\]]+)\]\s*$/;

interface RawScriptRecord {
    content: string;
    enabled: boolean;
    index: number;
    legacyId?: string;
    section: ScriptSection;
    title: string;
}

export interface ScriptInputRecord {
    content: string;
    section: ScriptSection;
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

export function normalizeScriptSection(raw: unknown): ScriptSection | null {
    if (typeof raw !== 'string') {
        return null;
    }
    const value = raw.trim().toLowerCase();
    if (['core', 'idea', 'ideas', 'principle', 'principles', '\u6838\u5FC3', '\u6838\u5FC3\u601D\u60F3', '\u601D\u60F3'].includes(value)) {
        return 'core';
    }
    if (['common', 'phrase', 'phrases', 'reply', 'replies', '\u5E38\u7528\u8BED', '\u5E38\u7528\u8A9E', '\u5E38\u7528', '\u8BDD\u672F', '\u8A71\u8853'].includes(value)) {
        return 'common';
    }
    return null;
}

function sectionMarker(section: ScriptSection): string {
    return section === 'core' ? '[core]' : '[common]';
}

function extractSectionMarker(record: string, defaultSection: ScriptSection): ScriptInputRecord {
    const lines = record.trim().split('\n');
    const firstLine = lines[0] || '';
    const match = SECTION_LINE_RE.exec(firstLine);
    const section = normalizeScriptSection(match?.[1]) || defaultSection;
    const content = match && normalizeScriptSection(match[1])
        ? lines.slice(1).join('\n').trim()
        : record.trim();
    return { content, section };
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
    const section = normalizeScriptSection(rawMeta.section)
        || normalizeScriptSection(rawMeta.category)
        || normalizeScriptSection(rawMeta.type)
        || normalizeScriptSection(rawMeta.kind)
        || 'common';
    return {
        content,
        enabled: rawMeta.enabled !== false,
        index: recordNumber - 1,
        legacyId: typeof rawMeta.id === 'string' && rawMeta.id.trim() ? rawMeta.id.trim() : undefined,
        section,
        title,
    };
}

function parsePlainRecord(record: string, recordNumber: number): RawScriptRecord {
    const parsed = extractSectionMarker(record, 'common');
    validateScriptText(parsed.content);
    return {
        content: parsed.content,
        enabled: true,
        index: recordNumber - 1,
        section: parsed.section,
        title: createScriptTitle(parsed.content),
    };
}

function toScriptEntry(record: RawScriptRecord, index: number): ScriptEntry {
    return {
        id: `${index + 1}`,
        title: record.title,
        content: record.content,
        index,
        section: record.section,
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
        coreScripts: entries.filter(entry => entry.section === 'core'),
        commonScripts: entries.filter(entry => entry.section === 'common'),
        byId,
    };
}

export function serializeScriptsText(scripts: Array<ScriptEntry | ScriptInputRecord | string>): string {
    const records = scripts.map((script) => {
        const content = typeof script === 'string' ? script : script.content;
        const section = typeof script === 'string' ? 'common' : script.section;
        validateScriptText(content);
        return `${sectionMarker(section)}\n${content.trim()}`;
    });
    return records.length ? `${records.join('\n\n---\n\n')}\n` : '';
}

export function serializeScriptText(content: string): string {
    validateScriptText(content);
    return content.trim();
}

export function serializeScriptInput(record: ScriptInputRecord): string {
    validateScriptText(record.content);
    return `${sectionMarker(record.section)}\n${record.content.trim()}`;
}

function stripListPrefix(line: string): string {
    return line
        .replace(/^\s*[-*]\s+/, '')
        .replace(/^\s*\d+[.)\u3001]\s*/, '')
        .trim();
}

function splitSentences(text: string): string[] {
    const normalized = text.trim();
    if (!normalized) {
        return [];
    }
    const lines = normalized
        .split('\n')
        .map(stripListPrefix)
        .filter(Boolean);
    if (lines.length > 1) {
        return lines;
    }
    return normalized
        .split(/(?<=[\u3002\uFF01\uFF1F.!?;\uFF1B])\s*/)
        .map(stripListPrefix)
        .filter(Boolean);
}

export function parseScriptInputText(input: string): ScriptInputRecord[] {
    const trimmed = input.trim();
    validateScriptText(trimmed);
    const lines = trimmed.split('\n');
    const firstLine = lines[0] || '';
    const tokenMatch = /^\S+/.exec(firstLine);
    const firstToken = tokenMatch?.[0] || '';
    const firstLineRest = firstLine.slice(firstToken.length).trimStart();
    const lineSection = normalizeScriptSection(firstLine);
    const tokenSection = normalizeScriptSection(firstToken);
    const numericToken = /^\d+$/.test(firstToken) ? firstToken : null;
    const numericSection = numericToken === '0' ? 'core' : numericToken ? 'common' : null;
    const defaultSection = lineSection || tokenSection || numericSection || 'common';
    const body = lineSection
        ? lines.slice(1).join('\n').trim()
        : tokenSection || numericSection
            ? [firstLineRest, ...lines.slice(1)].join('\n').trim()
            : trimmed;
    validateScriptText(body);

    const records = splitScriptRecords(body);
    return records.flatMap((record) => {
        const parsed = extractSectionMarker(record, defaultSection);
        return splitSentences(parsed.content).map(content => ({
            content,
            section: parsed.section,
        }));
    });
}
