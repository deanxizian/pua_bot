import type { WorkerContext } from '#/config';
import type * as Telegram from 'telegram-bot-api-types';
import type { ScriptEntry } from './types';
import { ENV } from '#/config';
import { MessageSender } from '#/telegram/sender';
import { parseScriptInputText, validateScriptText } from './parser';
import {
    appendScriptInputs,
    deleteScriptEntry,
    loadScriptLibrary,
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

export function isScriptAdmin(message: Telegram.Message): boolean {
    const fromId = message.from?.id;
    if (!fromId) {
        return false;
    }
    return ENV.SCRIPT_ADMIN_IDS.map(id => id.trim()).filter(Boolean).includes(`${fromId}`);
}

function formatScriptLine(entry: ScriptEntry): string {
    const section = entry.section === 'core' ? '\u6838\u5FC3\u601D\u60F3' : '\u5E38\u7528\u8BED';
    return `- ${entry.id} | ${section} | ${entry.title}`;
}

function compareScriptListOrder(a: ScriptEntry, b: ScriptEntry): number {
    if (a.section !== b.section) {
        return a.section === 'core' ? -1 : 1;
    }
    return a.index - b.index;
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
    return sender.sendRichMarkdown([
        `**Added scripts:** ${inputs.length}`,
        `- core: ${coreCount}`,
        `- common: ${commonCount}`,
        `- last id: ${entries.at(-1)?.id || library.activeScripts.length}`,
    ].join('\n'));
}

async function handleList(sender: MessageSender): Promise<Response> {
    const library = await loadScriptLibrary();
    const lines = library.activeScripts
        .slice()
        .sort(compareScriptListOrder)
        .map(entry => formatScriptLine(entry));
    return sender.sendRichMarkdown(lines.length
        ? ['**\u8BDD\u672F\u5217\u8868**', '', ...lines].join('\n')
        : '**\u8BDD\u672F\u5217\u8868**\n\n\u6682\u65E0\u8BDD\u672F\u3002');
}

async function handleDelete(subcommand: string, sender: MessageSender): Promise<Response> {
    const id = subcommand.trim();
    if (!id) {
        throw new Error('Missing script index');
    }
    const { entry } = await deleteScriptEntry(id);
    if (!entry) {
        return sender.sendRichMarkdown(`**Script not found:** ${id}`);
    }
    return sender.sendRichMarkdown([
        `**Deleted script:** ${id}`,
        `- title: ${entry.title}`,
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
        return sender.sendRichMarkdown('Permission denied');
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
        return sender.sendRichMarkdown(`**ERROR:** ${(e as Error).message}`);
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
