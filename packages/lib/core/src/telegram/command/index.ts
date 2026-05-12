import type { WorkerContext } from '#/config';
import type * as Telegram from 'telegram-bot-api-types';
import type { CommandHandler } from './types';
import { handleScriptCommandMessage, scriptCommandsDocument } from '#/scripts';
import { MessageSender } from '../sender';
import {
    HelpCommandHandler,
    NewCommandHandler,
    StartCommandHandler,
} from './system';

const SYSTEM_COMMANDS: CommandHandler[] = [
    new StartCommandHandler(),
    new NewCommandHandler(),
    new HelpCommandHandler(),
];

const SYSTEM_COMMAND_DESCRIPTIONS: Record<string, string> = {
    '/start': '\u83B7\u53D6\u5F53\u524D chat id\uFF0C\u5E76\u5F00\u59CB\u65B0\u5BF9\u8BDD',
    '/new': '\u6E05\u7A7A\u5F53\u524D\u804A\u5929\u5386\u53F2\uFF0C\u5F00\u542F\u65B0\u5BF9\u8BDD',
    '/help': '\u67E5\u770B\u5E2E\u52A9',
};

interface ParsedCommandText {
    command: string;
    raw: string;
    subcommand: string;
}

function parseCommandText(text: string): ParsedCommandText {
    const raw = text.trim();
    const commandToken = raw.split(/\s+/)[0] || '';
    const mentionIndex = commandToken.indexOf('@');
    const command = mentionIndex >= 0 ? commandToken.slice(0, mentionIndex) : commandToken;
    return {
        command,
        raw,
        subcommand: raw.slice(commandToken.length).trim(),
    };
}

async function handleSystemCommand(message: Telegram.Message, subcommand: string, command: CommandHandler, context: WorkerContext): Promise<Response> {
    const sender = MessageSender.fromMessage(context.SHARE_CONTEXT.botToken, message);
    try {
        return await command.handle(message, subcommand, context);
    } catch (e) {
        return sender.sendPlainText(`ERROR: ${(e as Error).message}`);
    }
}

function isSlashCommand(text: string): boolean {
    return /^\/\S+/.test(text);
}

export async function handleCommandMessage(message: Telegram.Message, context: WorkerContext): Promise<Response | null> {
    const text = (message.text || message.caption || '').trim();
    const parsed = parseCommandText(text);

    const scriptCommandResponse = await handleScriptCommandMessage(message, context);
    if (scriptCommandResponse) {
        return scriptCommandResponse;
    }

    for (const cmd of SYSTEM_COMMANDS) {
        if (parsed.command === cmd.command) {
            return await handleSystemCommand(message, parsed.subcommand, cmd, context);
        }
    }

    if (isSlashCommand(text)) {
        return MessageSender.fromMessage(context.SHARE_CONTEXT.botToken, message).sendPlainText('Unknown command');
    }
    return null;
}

export function commandsBindScope(): Record<string, Telegram.SetMyCommandsParams> {
    const scopeCommandMap: Record<string, Telegram.BotCommand[]> = {
        all_private_chats: [],
        all_group_chats: [],
        all_chat_administrators: [],
    };
    for (const cmd of SYSTEM_COMMANDS) {
        if (cmd.scopes) {
            for (const scope of cmd.scopes) {
                if (!scopeCommandMap[scope]) {
                    scopeCommandMap[scope] = [];
                }
                const desc = SYSTEM_COMMAND_DESCRIPTIONS[cmd.command] || '';
                if (desc) {
                    scopeCommandMap[scope].push({
                        command: cmd.command,
                        description: desc,
                    });
                }
            }
        }
    }
    const result: Record<string, Telegram.SetMyCommandsParams> = {};
    for (const scope in scopeCommandMap) {
        result[scope] = {
            commands: scopeCommandMap[scope],
            scope: {
                type: scope,
            },
        };
    }
    return result;
}

export function commandsDocument(): { description: string; command: string }[] {
    return SYSTEM_COMMANDS.map((command) => {
        return {
            command: command.command,
            description: SYSTEM_COMMAND_DESCRIPTIONS[command.command] || '',
        };
    }).filter(item => item.description !== '').concat(scriptCommandsDocument());
}
