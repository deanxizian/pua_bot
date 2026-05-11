import type { ParsedScriptLibrary, ScriptEntry, ScriptStore } from './types';
import { ENV } from '#/config';
import { parseScriptsMarkdown } from './parser';

interface ScriptCache {
    identity: string;
    markdown: string;
    library: ParsedScriptLibrary;
    expiresAt: number;
}

let scriptCache: ScriptCache | null = null;

function appendMarkdownBlock(markdown: string, block: string): string {
    const trimmedMarkdown = markdown.trimEnd();
    const trimmedBlock = block.trim();
    if (!trimmedMarkdown) {
        return `${trimmedBlock}\n`;
    }
    return `${trimmedMarkdown}\n\n${trimmedBlock}\n`;
}

function currentStoreIdentity(): string {
    if (ENV.SCRIPT_FILE_PATH.trim()) {
        return `file:${ENV.SCRIPT_FILE_PATH.trim()}`;
    }
    return `database:${ENV.SCRIPT_MARKDOWN_KEY}`;
}

class DatabaseScriptStore implements ScriptStore {
    constructor(private readonly key: string) {}

    async getMarkdown(): Promise<string> {
        return await ENV.DATABASE.get(this.key).catch(() => '') || '';
    }

    async saveMarkdown(markdown: string): Promise<void> {
        parseScriptsMarkdown(markdown);
        const previous = await this.getMarkdown();
        if (previous) {
            await ENV.DATABASE.put(`scripts:backup:${Date.now()}`, previous).catch(console.warn);
        }
        await ENV.DATABASE.put(this.key, markdown);
    }

    async appendBlock(block: string): Promise<void> {
        const next = appendMarkdownBlock(await this.getMarkdown(), block);
        await this.saveMarkdown(next);
    }
}

class FileScriptStore implements ScriptStore {
    constructor(private readonly filePath: string) {}

    async getMarkdown(): Promise<string> {
        if (!ENV.SCRIPT_FILE_STORAGE) {
            throw new Error('SCRIPT_FILE_STORAGE is not configured for SCRIPT_FILE_PATH');
        }
        return await ENV.SCRIPT_FILE_STORAGE.readFile(this.filePath);
    }

    async saveMarkdown(markdown: string): Promise<void> {
        parseScriptsMarkdown(markdown);
        if (!ENV.SCRIPT_FILE_STORAGE) {
            throw new Error('SCRIPT_FILE_STORAGE is not configured for SCRIPT_FILE_PATH');
        }
        // File storage relies on tmp + rename for atomic writes. Backups are skipped here because
        // DATABASE/KV already covers the managed storage path and local volumes are user-owned.
        await ENV.SCRIPT_FILE_STORAGE.writeFileAtomic(this.filePath, markdown);
    }

    async appendBlock(block: string): Promise<void> {
        const next = appendMarkdownBlock(await this.getMarkdown(), block);
        await this.saveMarkdown(next);
    }
}

export function getScriptStore(): ScriptStore {
    if (ENV.SCRIPT_FILE_PATH.trim()) {
        return new FileScriptStore(ENV.SCRIPT_FILE_PATH.trim());
    }
    return new DatabaseScriptStore(ENV.SCRIPT_MARKDOWN_KEY || 'scripts:markdown');
}

export function updateScriptCache(markdown: string, library?: ParsedScriptLibrary): ParsedScriptLibrary {
    const parsed = library || parseScriptsMarkdown(markdown);
    const ttl = Math.max(0, ENV.SCRIPT_CACHE_TTL_SECONDS) * 1000;
    scriptCache = {
        identity: currentStoreIdentity(),
        markdown,
        library: parsed,
        expiresAt: Date.now() + ttl,
    };
    return parsed;
}

export function clearScriptCache(): void {
    scriptCache = null;
}

export async function loadScriptLibrary(force = false): Promise<ParsedScriptLibrary> {
    const identity = currentStoreIdentity();
    if (!force && scriptCache && scriptCache.identity === identity && scriptCache.expiresAt > Date.now()) {
        return scriptCache.library;
    }

    const markdown = await getScriptStore().getMarkdown();
    try {
        return updateScriptCache(markdown);
    } catch (e) {
        if (scriptCache && scriptCache.identity === identity) {
            console.error(e);
            return scriptCache.library;
        }
        throw e;
    }
}

export async function saveScriptMarkdown(markdown: string): Promise<ParsedScriptLibrary> {
    const library = parseScriptsMarkdown(markdown);
    await getScriptStore().saveMarkdown(markdown);
    updateScriptCache(markdown, library);
    return library;
}

export async function appendScriptBlock(block: string): Promise<ParsedScriptLibrary> {
    const store = getScriptStore();
    const next = appendMarkdownBlock(await store.getMarkdown(), block);
    return await saveScriptMarkdown(next);
}

export function getConfiguredFallback(library: ParsedScriptLibrary): ScriptEntry | null {
    return library.activeScripts.find(entry => entry.meta.id === ENV.SCRIPT_FALLBACK_ID) || null;
}
