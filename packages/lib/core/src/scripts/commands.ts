import type { WorkerContext } from '#/config';
import type * as Telegram from 'telegram-bot-api-types';
import type { ScriptEntry } from './types';
import { ENV } from '#/config';
import { MessageSender } from '#/telegram/sender';
import { matchScript } from './matcher';
import { parseScriptsMarkdown, serializeScriptBlock } from './parser';
import {
    appendScriptBlock,
    getConfiguredFallback,
    getScriptStore,
    loadScriptLibrary,
    updateScriptCache,
} from './store';

const SCRIPT_COMMAND_DESCRIPTIONS: Record<string, string> = {
    '/add': 'Add a Markdown script block',
    '/list': 'List scripts',
    '/show': 'Show an active script',
    '/disable': 'Disable a script',
    '/test': 'Test script matching',
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
        entry.meta.mode,
        `${entry.meta.priority}`,
        `${entry.meta.triggers.length}`,
    ];
    if (showStatus) {
        fields.unshift(entry.meta.enabled ? 'enabled' : 'disabled');
    }
    return fields.join(' | ');
}

export function parseAddCommandInput(input: string): ScriptEntry {
    const parsed = parseScriptsMarkdown(`---\n\n${input.trim()}`);
    if (parsed.allVersions.length !== 1) {
        throw new Error('/add requires exactly one script block');
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
        `mode: ${entry.meta.mode}`,
        `triggers: ${entry.meta.triggers.length}`,
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
        ? 'status | id | title | mode | priority | triggers'
        : 'id | title | mode | priority | triggers';
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
    const match = matchScript(input, library);
    if (match) {
        return sender.sendPlainText([
            `id: ${match.script.meta.id}`,
            `title: ${match.script.meta.title}`,
            `mode: ${match.script.meta.mode}`,
            `priority: ${match.script.meta.priority}`,
            `matched trigger: ${match.matchedTrigger}`,
        ].join('\n'));
    }
    const fallback = getConfiguredFallback(library);
    if (fallback) {
        return sender.sendPlainText([
            'No script matched.',
            `fallback: ${fallback.meta.id}`,
            `title: ${fallback.meta.title}`,
        ].join('\n'));
    }
    return sender.sendPlainText('No script matched.\nfallback: none');
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
