import type { WorkerContext } from '#/config';
import type * as Telegram from 'telegram-bot-api-types';
import type { ScriptEntry } from './types';
import { ENV } from '#/config';
import { MessageSender } from '#/telegram/sender';
import { serializeScriptsText, validateScriptText } from './parser';
import {
    appendScriptText,
    loadScriptLibrary,
    saveScriptEntries,
} from './store';

const SCRIPT_COMMAND_DESCRIPTIONS: Record<string, string> = {
    '/add': 'Add script text',
    '/list': 'List scripts',
    '/show': 'Show script text by index',
    '/disable': 'Remove script by index',
    '/test': 'Inspect script prompt status',
    '/export': 'Export scripts document',
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

function formatScriptLine(entry: ScriptEntry): string {
    return `${entry.id} | ${entry.title}`;
}

export function parseAddCommandInput(input: string): string {
    const trimmed = input.trim();
    validateScriptText(trimmed);
    return trimmed;
}

async function handleAdd(subcommand: string, sender: MessageSender): Promise<Response> {
    const content = parseAddCommandInput(subcommand);
    const library = await appendScriptText(content);
    const entry = library.activeScripts.at(-1);
    return sender.sendPlainText([
        `Added script: ${entry?.id || library.activeScripts.length}`,
        `title: ${entry?.title || 'Untitled script'}`,
    ].join('\n'));
}

async function handleList(subcommand: string, sender: MessageSender): Promise<Response> {
    const showAll = subcommand.trim().toLowerCase() === 'all';
    const library = await loadScriptLibrary();
    const scripts = showAll ? library.allVersions : library.activeScripts;
    const lines = scripts
        .slice()
        .sort((a, b) => a.index - b.index)
        .map(entry => formatScriptLine(entry));
    const header = 'index | title';
    return sender.sendPlainText(lines.length ? `${header}\n${lines.join('\n')}` : 'No scripts.');
}

async function handleShow(subcommand: string, sender: MessageSender): Promise<Response> {
    const id = subcommand.trim();
    if (!id) {
        throw new Error('Missing script index');
    }
    const library = await loadScriptLibrary();
    const entry = library.byId.get(id);
    if (!entry) {
        return sender.sendPlainText(`Script not found: ${id}`);
    }
    return await sendChunkedPlainText(sender, entry.content);
}

async function handleDisable(subcommand: string, sender: MessageSender): Promise<Response> {
    const id = subcommand.trim();
    if (!id) {
        throw new Error('Missing script index');
    }
    const library = await loadScriptLibrary();
    const entry = library.byId.get(id);
    if (!entry) {
        return sender.sendPlainText(`Script not found: ${id}`);
    }
    await saveScriptEntries(library.activeScripts.filter(script => script.id !== id));
    return sender.sendPlainText([
        `Removed script: ${id}`,
        `title: ${entry.title}`,
    ].join('\n'));
}

async function handleTest(subcommand: string, sender: MessageSender): Promise<Response> {
    const input = subcommand.trim();
    if (!input) {
        throw new Error('Missing test text');
    }
    const library = await loadScriptLibrary();
    return sender.sendPlainText([
        'Prompt mode will answer with the normal chat flow plus all scripts in the system prompt.',
        `scripts: ${library.activeScripts.length}`,
        `user text: ${input}`,
    ].join('\n'));
}

async function handleExport(sender: MessageSender): Promise<Response> {
    const library = await loadScriptLibrary();
    return await sendChunkedPlainText(sender, serializeScriptsText(library.activeScripts));
}

async function handleReload(sender: MessageSender): Promise<Response> {
    const library = await loadScriptLibrary(true);
    return sender.sendPlainText([
        'Reloaded scripts.',
        `scripts: ${library.allVersions.length}`,
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
