import type { WorkerContext } from '#/config';
import type * as Telegram from 'telegram-bot-api-types';
import type { ScriptEntry } from './types';
import { ENV } from '#/config';
import { MessageSender } from '#/telegram/sender';
import { parseScriptInputText, validateScriptText } from './parser';
import {
    appendScriptInputs,
    loadScriptLibrary,
    saveScriptEntries,
} from './store';

const SCRIPT_COMMAND_DESCRIPTIONS: Record<string, string> = {
    '/add': '\u6DFB\u52A0\u8BDD\u672F',
    '/list': '\u5217\u51FA\u8BDD\u672F',
    '/delete': '\u5220\u9664\u5BF9\u5E94\u5E8F\u53F7\u7684\u8BDD\u672F',
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

function isKnownScriptCommand(command: string): boolean {
    return Object.prototype.hasOwnProperty.call(SCRIPT_COMMAND_DESCRIPTIONS, command);
}

function isScriptAdmin(message: Telegram.Message): boolean {
    const fromId = message.from?.id;
    if (!fromId) {
        return false;
    }
    return ENV.SCRIPT_ADMIN_IDS.map(id => id.trim()).filter(Boolean).includes(`${fromId}`);
}

function formatScriptLine(entry: ScriptEntry): string {
    const section = entry.section === 'core' ? '0' : '1';
    return `${entry.id} | ${section} | ${entry.title}`;
}

export function parseAddCommandInput(input: string) {
    const trimmed = input.trim();
    validateScriptText(trimmed);
    return parseScriptInputText(trimmed);
}

async function handleAdd(subcommand: string, sender: MessageSender): Promise<Response> {
    const inputs = parseAddCommandInput(subcommand);
    const library = await appendScriptInputs(inputs);
    const entries = library.activeScripts.slice(-inputs.length);
    const coreCount = inputs.filter(input => input.section === 'core').length;
    const commonCount = inputs.length - coreCount;
    return sender.sendPlainText([
        `Added scripts: ${inputs.length}`,
        `core: ${coreCount}`,
        `common: ${commonCount}`,
        `last id: ${entries.at(-1)?.id || library.activeScripts.length}`,
    ].join('\n'));
}

async function handleList(sender: MessageSender): Promise<Response> {
    const library = await loadScriptLibrary();
    const lines = library.activeScripts
        .slice()
        .sort((a, b) => a.index - b.index)
        .map(entry => formatScriptLine(entry));
    const header = '\u5E8F\u53F7 | \u7C7B\u578B | \u6807\u9898';
    return sender.sendPlainText(lines.length ? `${header}\n${lines.join('\n')}` : 'No scripts.');
}

async function handleDelete(subcommand: string, sender: MessageSender): Promise<Response> {
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
        `Deleted script: ${id}`,
        `title: ${entry.title}`,
    ].join('\n'));
}

export async function handleScriptCommandMessage(message: Telegram.Message, context: WorkerContext): Promise<Response | null> {
    if (!ENV.SCRIPT_ENABLE) {
        return null;
    }

    const text = (message.text || message.caption || '').trim();
    const { command, subcommand } = parseCommand(text);
    if (!isKnownScriptCommand(command)) {
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
                return await handleList(sender);
            case '/delete':
                return await handleDelete(subcommand, sender);
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
