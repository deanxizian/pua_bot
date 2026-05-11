import type { WorkerContext } from '#/config';
import type * as Telegram from 'telegram-bot-api-types';
import type { ScriptEntry } from './types';
import { ENV } from '#/config';
import { MessageSender } from '#/telegram/sender';
import { parseScriptsMarkdown, serializeScriptBlock } from './parser';
import {
    appendScriptBlock,
    getConfiguredFallback,
    getScriptStore,
    loadScriptLibrary,
    updateScriptCache,
} from './store';

const SCRIPT_COMMAND_DESCRIPTIONS: Record<string, string> = {
    '/add': 'Add script text',
    '/list': 'List scripts',
    '/show': 'Show an active script',
    '/disable': 'Disable a script',
    '/test': 'Inspect script prompt status',
    '/export': 'Export scripts Markdown',
    '/reload': 'Reload scripts from storage',
};

interface ParsedCommand {
    command: string;
    subcommand: string;
}

function parseCommand(text: string): ParsedCommand {
    const trimmed = text.trim();
    const commandToken = trimmed.split(/\s+/)[0] || '';
    const mentionIndex = commandToken.indexOf('@');
    const command = mentionIndex >= 0 ? commandToken.slice(0, mentionIndex) : commandToken;
    return {
        command,
        subcommand: trimmed.slice(commandToken.length).trim(),
    };
}

function isScriptAdmin(message: Telegram.Message): boolean {
    const fromId = message.from?.id;
    if (!fromId) {
        return false;
    }
    return ENV.SCRIPT_ADMIN_IDS.map(id => id.trim()).filter(Boolean).includes(`${fromId}`);
}

async function sendChunkedPlainText(sender: MessageSender, text: string, chunkSize = 3500): Promise<Response> {
    const content = text || '(empty)';
    let lastResponse: Response | null = null;
    for (let i = 0; i < content.length; i += chunkSize) {
        lastResponse = await sender.sendPlainText(content.slice(i, i + chunkSize));
    }
    if (!lastResponse) {
        return sender.sendPlainText('(empty)');
    }
    return lastResponse;
}

function formatScriptLine(entry: ScriptEntry, showStatus: boolean): string {
    const fields = [
        entry.meta.id,
        entry.meta.title,
        `${entry.meta.priority}`,
    ];
    if (showStatus) {
        fields.unshift(entry.meta.enabled ? 'enabled' : 'disabled');
    }
    return fields.join(' | ');
}

function hashText(input: string): string {
    let hash = 0x811C9DC5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36);
}

function createScriptId(content: string): string {
    return `script_${Date.now().toString(36)}_${hashText(`${content}:${Math.random()}`)}`;
}

function createScriptTitle(content: string): string {
    const firstLine = content.split('\n').map(line => line.trim()).find(Boolean) || 'Untitled script';
    const normalized = firstLine.replace(/\s+/g, ' ');
    if (normalized.length <= 40) {
        return normalized;
    }
    return `${normalized.slice(0, 40)}...`;
}

export function parseAddCommandInput(input: string): ScriptEntry {
    const trimmed = input.trim();
    if (!trimmed) {
        throw new Error('content is required');
    }

    if (!trimmed.startsWith('```json') && !trimmed.startsWith('---')) {
        return {
            meta: {
                id: createScriptId(trimmed),
                title: createScriptTitle(trimmed),
                priority: 0,
                enabled: true,
            },
            content: trimmed,
            index: 0,
        };
    }

    const markdown = trimmed.startsWith('---') ? trimmed : `---\n\n${trimmed}`;
    const parsed = parseScriptsMarkdown(markdown);
    if (parsed.allVersions.length !== 1) {
        throw new Error('/add requires exactly one script');
    }
    return parsed.allVersions[0];
}

async function handleAdd(subcommand: string, sender: MessageSender): Promise<Response> {
    const entry = parseAddCommandInput(subcommand);
    const block = serializeScriptBlock(entry.meta, entry.content);
    await appendScriptBlock(block);
    return sender.sendPlainText([
        `Added script: ${entry.meta.id}`,
        `title: ${entry.meta.title}`,
    ].join('\n'));
}

async function handleList(subcommand: string, sender: MessageSender): Promise<Response> {
    const showAll = subcommand.trim().toLowerCase() === 'all';
    const library = await loadScriptLibrary();
    const scripts = showAll ? Array.from(library.byId.values()) : library.activeScripts;
    const lines = scripts
        .slice()
        .sort((a, b) => a.meta.id.localeCompare(b.meta.id))
        .map(entry => formatScriptLine(entry, showAll));
    const header = showAll
        ? 'status | id | title | priority'
        : 'id | title | priority';
    return sender.sendPlainText(lines.length ? `${header}\n${lines.join('\n')}` : 'No scripts.');
}

async function handleShow(subcommand: string, sender: MessageSender): Promise<Response> {
    const id = subcommand.trim();
    if (!id) {
        throw new Error('Missing script id');
    }
    const library = await loadScriptLibrary();
    const entry = library.activeScripts.find(item => item.meta.id === id);
    if (!entry) {
        return sender.sendPlainText(`Script not found: ${id}`);
    }
    return await sendChunkedPlainText(sender, [
        '```json',
        JSON.stringify(entry.meta, null, 2),
        '```',
        '',
        entry.content,
    ].join('\n'));
}

async function handleDisable(subcommand: string, sender: MessageSender): Promise<Response> {
    const id = subcommand.trim();
    if (!id) {
        throw new Error('Missing script id');
    }
    const library = await loadScriptLibrary();
    const entry = library.byId.get(id);
    if (!entry) {
        return sender.sendPlainText(`Script not found: ${id}`);
    }
    const block = serializeScriptBlock({
        ...entry.meta,
        enabled: false,
    }, entry.content);
    await appendScriptBlock(block);
    return sender.sendPlainText(`Disabled script: ${id}`);
}

async function handleTest(subcommand: string, sender: MessageSender): Promise<Response> {
    const input = subcommand.trim();
    if (!input) {
        throw new Error('Missing test text');
    }
    const library = await loadScriptLibrary();
    const fallback = getConfiguredFallback(library);
    return sender.sendPlainText([
        'Prompt mode will send this user text to the model with all active scripts.',
        `active scripts: ${library.activeScripts.length}`,
        `fallback: ${fallback ? fallback.meta.id : 'default text'}`,
        `user text: ${input}`,
    ].join('\n'));
}

async function handleExport(sender: MessageSender): Promise<Response> {
    return await sendChunkedPlainText(sender, await getScriptStore().getMarkdown());
}

async function handleReload(sender: MessageSender): Promise<Response> {
    const markdown = await getScriptStore().getMarkdown();
    const library = parseScriptsMarkdown(markdown);
    updateScriptCache(markdown, library);
    return sender.sendPlainText([
        'Reloaded scripts.',
        `active: ${library.activeScripts.length}`,
        `versions: ${library.allVersions.length}`,
    ].join('\n'));
}

export async function handleScriptCommandMessage(message: Telegram.Message, context: WorkerContext): Promise<Response | null> {
    if (!ENV.SCRIPT_ENABLE) {
        return null;
    }

    const text = (message.text || message.caption || '').trim();
    const { command, subcommand } = parseCommand(text);
    if (!Object.hasOwn(SCRIPT_COMMAND_DESCRIPTIONS, command)) {
        return null;
    }

    const sender = MessageSender.fromMessage(context.SHARE_CONTEXT.botToken, message);
    if (!isScriptAdmin(message)) {
        return sender.sendPlainText('Permission denied');
    }

    try {
        switch (command) {
            case '/add':
                return await handleAdd(subcommand, sender);
            case '/list':
                return await handleList(subcommand, sender);
            case '/show':
                return await handleShow(subcommand, sender);
            case '/disable':
                return await handleDisable(subcommand, sender);
            case '/test':
                return await handleTest(subcommand, sender);
            case '/export':
                return await handleExport(sender);
            case '/reload':
                return await handleReload(sender);
            default:
                return null;
        }
    } catch (e) {
        return sender.sendPlainText(`ERROR: ${(e as Error).message}`);
    }
}

export function scriptCommandsDocument(): { description: string; command: string }[] {
    if (!ENV.SCRIPT_ENABLE) {
        return [];
    }
    return Object.entries(SCRIPT_COMMAND_DESCRIPTIONS).map(([command, description]) => ({
        command,
        description,
    }));
}
