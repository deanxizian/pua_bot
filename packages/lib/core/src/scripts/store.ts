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
const SCRIPT_VERSION_KEY = `${SCRIPT_STORAGE_KEY}:version`;
const SCRIPT_LOCK_KEY = `${SCRIPT_STORAGE_KEY}:lock`;
const SCRIPT_CACHE_TTL_MS = 30_000;
const SCRIPT_LOCK_TTL_SECONDS = 10;
const SCRIPT_LOCK_WAIT_MS = 3_000;
const SCRIPT_LOCK_RETRY_MS = 100;
const SCRIPT_VERSION_RETRIES = 3;
let localWriteLock: Promise<void> = Promise.resolve();

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
        await ENV.DATABASE.put(SCRIPT_VERSION_KEY, createScriptVersion()).catch(console.warn);
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

function createScriptVersion(): string {
    return `${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function createLockToken(): string {
    return `${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getScriptStorageVersion(): Promise<string> {
    if (ENV.SCRIPT_FILE_PATH.trim() || !ENV.DATABASE) {
        return '';
    }
    return await ENV.DATABASE.get(SCRIPT_VERSION_KEY).catch(() => '') || '';
}

async function withLocalWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = localWriteLock;
    let release!: () => void;
    localWriteLock = new Promise<void>((resolve) => {
        release = resolve;
    });
    await previous;
    try {
        return await fn();
    } finally {
        release();
    }
}

async function withDistributedWriteLock<T>(fn: (hasDistributedLock: boolean) => Promise<T>): Promise<T> {
    if (ENV.SCRIPT_FILE_PATH.trim() || !ENV.DATABASE?.acquireLock) {
        return await fn(false);
    }

    const token = createLockToken();
    const deadline = Date.now() + SCRIPT_LOCK_WAIT_MS;
    while (Date.now() < deadline) {
        if (await ENV.DATABASE.acquireLock(SCRIPT_LOCK_KEY, token, SCRIPT_LOCK_TTL_SECONDS).catch(() => false)) {
            try {
                return await fn(true);
            } finally {
                await ENV.DATABASE.releaseLock?.(SCRIPT_LOCK_KEY, token).catch(console.warn);
            }
        }
        await delay(SCRIPT_LOCK_RETRY_MS);
    }
    throw new Error('Script store is busy, please retry later');
}

async function saveScriptTextUnlocked(text: string): Promise<ParsedScriptLibrary> {
    const normalizedText = serializeScriptsText(parseScriptsText(text).activeScripts);
    const library = parseScriptsText(normalizedText);
    await getScriptStore().saveText(normalizedText);
    updateScriptCache(normalizedText, library);
    return library;
}

async function mutateScriptText(mutator: (currentText: string) => string): Promise<ParsedScriptLibrary> {
    return await withLocalWriteLock(async () => {
        return await withDistributedWriteLock(async (hasDistributedLock) => {
            for (let attempt = 0; attempt < SCRIPT_VERSION_RETRIES; attempt++) {
                const beforeVersion = await getScriptStorageVersion();
                const currentText = await getScriptStore().getText();
                const nextText = mutator(currentText);
                parseScriptsText(nextText);

                const latestVersion = await getScriptStorageVersion();
                if (!hasDistributedLock && latestVersion !== beforeVersion) {
                    await delay(SCRIPT_LOCK_RETRY_MS * (attempt + 1));
                    continue;
                }

                return await saveScriptTextUnlocked(nextText);
            }
            throw new Error('Script store changed while saving, please retry later');
        });
    });
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
    return await withLocalWriteLock(async () => {
        return await withDistributedWriteLock(async () => {
            return await saveScriptTextUnlocked(text);
        });
    });
}

export async function saveScriptEntries(scripts: Array<ScriptEntry | ScriptInputRecord>): Promise<ParsedScriptLibrary> {
    return await saveScriptText(serializeScriptsText(scripts));
}

export async function appendScriptText(content: string): Promise<ParsedScriptLibrary> {
    return await appendScriptInputs([{ content, section: 'common' }]);
}

export async function appendScriptInputs(inputs: ScriptInputRecord[]): Promise<ParsedScriptLibrary> {
    const appendedText = inputs.map(serializeScriptInput).join('\n\n---\n\n');
    return await mutateScriptText((currentText) => {
        const current = parseScriptsText(currentText).activeScripts;
        const text = serializeScriptsText(current);
        return [text.trim(), appendedText].filter(Boolean).join('\n\n---\n\n');
    });
}

export async function deleteScriptEntry(id: string): Promise<{ entry: ScriptEntry | null; library: ParsedScriptLibrary }> {
    let entry: ScriptEntry | null = null;
    const library = await mutateScriptText((currentText) => {
        const currentLibrary = parseScriptsText(currentText);
        entry = currentLibrary.byId.get(id) || null;
        if (!entry) {
            return serializeScriptsText(currentLibrary.activeScripts);
        }
        return serializeScriptsText(currentLibrary.activeScripts.filter(script => script.id !== id));
    });
    return { entry, library };
}
