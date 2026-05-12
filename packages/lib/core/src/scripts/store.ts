import type { ScriptInputRecord } from './parser';
import type { ParsedScriptLibrary, ScriptEntry, ScriptStore } from './types';
import { ENV } from '#/config';
import { parseScriptsText, serializeScriptInput, serializeScriptsText } from './parser';

interface ScriptCache {
    identity: string;
    text: string;
    library: ParsedScriptLibrary;
    expiresAt: number;
}

let scriptCache: ScriptCache | null = null;
const SCRIPT_STORAGE_KEY = 'scripts:markdown';
const SCRIPT_CACHE_TTL_MS = 30_000;

function currentStoreIdentity(): string {
    if (ENV.SCRIPT_FILE_PATH.trim()) {
        return `file:${ENV.SCRIPT_FILE_PATH.trim()}`;
    }
    return `database:${SCRIPT_STORAGE_KEY}`;
}

class DatabaseScriptStore implements ScriptStore {
    constructor(private readonly key: string) {}

    async getText(): Promise<string> {
        return await ENV.DATABASE.get(this.key).catch(() => '') || '';
    }

    async saveText(text: string): Promise<void> {
        parseScriptsText(text);
        const previous = await this.getText();
        if (previous) {
            await ENV.DATABASE.put(`scripts:backup:${Date.now()}`, previous).catch(console.warn);
        }
        await ENV.DATABASE.put(this.key, text);
    }
}

class FileScriptStore implements ScriptStore {
    constructor(private readonly filePath: string) {}

    async getText(): Promise<string> {
        if (!ENV.SCRIPT_FILE_STORAGE) {
            throw new Error('SCRIPT_FILE_STORAGE is not configured for SCRIPT_FILE_PATH');
        }
        return await ENV.SCRIPT_FILE_STORAGE.readFile(this.filePath);
    }

    async saveText(text: string): Promise<void> {
        parseScriptsText(text);
        if (!ENV.SCRIPT_FILE_STORAGE) {
            throw new Error('SCRIPT_FILE_STORAGE is not configured for SCRIPT_FILE_PATH');
        }
        // File storage relies on tmp + rename for atomic writes. Backups are skipped here because
        // DATABASE/KV already covers the managed storage path and local volumes are user-owned.
        await ENV.SCRIPT_FILE_STORAGE.writeFileAtomic(this.filePath, text);
    }
}

export function getScriptStore(): ScriptStore {
    if (ENV.SCRIPT_FILE_PATH.trim()) {
        return new FileScriptStore(ENV.SCRIPT_FILE_PATH.trim());
    }
    return new DatabaseScriptStore(SCRIPT_STORAGE_KEY);
}

export function updateScriptCache(text: string, library?: ParsedScriptLibrary): ParsedScriptLibrary {
    const parsed = library || parseScriptsText(text);
    scriptCache = {
        identity: currentStoreIdentity(),
        text,
        library: parsed,
        expiresAt: Date.now() + SCRIPT_CACHE_TTL_MS,
    };
    return parsed;
}

export function clearScriptCache(): void {
    scriptCache = null;
}

async function normalizeStoredTextIfNeeded(text: string, library: ParsedScriptLibrary): Promise<{ library: ParsedScriptLibrary; text: string }> {
    const normalizedText = serializeScriptsText(library.activeScripts);
    if (!text.trim() || normalizedText.trim() === text.trim()) {
        return { text, library };
    }

    try {
        await getScriptStore().saveText(normalizedText);
        return {
            text: normalizedText,
            library: parseScriptsText(normalizedText),
        };
    } catch (e) {
        console.warn(e);
        return { text, library };
    }
}

export async function loadScriptLibrary(force = false): Promise<ParsedScriptLibrary> {
    const identity = currentStoreIdentity();
    if (!force && scriptCache && scriptCache.identity === identity && scriptCache.expiresAt > Date.now()) {
        return scriptCache.library;
    }

    const text = await getScriptStore().getText();
    try {
        const library = parseScriptsText(text);
        const normalized = await normalizeStoredTextIfNeeded(text, library);
        return updateScriptCache(normalized.text, normalized.library);
    } catch (e) {
        if (scriptCache && scriptCache.identity === identity) {
            console.error(e);
            return scriptCache.library;
        }
        throw e;
    }
}

export async function saveScriptText(text: string): Promise<ParsedScriptLibrary> {
    const normalizedText = serializeScriptsText(parseScriptsText(text).activeScripts);
    const library = parseScriptsText(normalizedText);
    await getScriptStore().saveText(normalizedText);
    updateScriptCache(normalizedText, library);
    return library;
}

export async function saveScriptEntries(scripts: Array<ScriptEntry | ScriptInputRecord>): Promise<ParsedScriptLibrary> {
    return await saveScriptText(serializeScriptsText(scripts));
}

export async function appendScriptText(content: string): Promise<ParsedScriptLibrary> {
    const current = parseScriptsText(await getScriptStore().getText()).activeScripts;
    return await saveScriptEntries([...current, { content, section: 'common' }]);
}

export async function appendScriptInputs(inputs: ScriptInputRecord[]): Promise<ParsedScriptLibrary> {
    const current = parseScriptsText(await getScriptStore().getText()).activeScripts;
    const text = serializeScriptsText(current);
    const appendedText = inputs.map(serializeScriptInput).join('\n\n---\n\n');
    return await saveScriptText([text.trim(), appendedText].filter(Boolean).join('\n\n---\n\n'));
}
