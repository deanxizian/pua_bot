import type { WorkerContext } from '#/config';
import type * as Telegram from 'telegram-bot-api-types';
import type { CommandHandler } from './types';
import { ENV } from '#/config';
import { createTelegramBotAPI } from '../api';
import { isGroupChat } from '../auth';
import { MessageSender } from '../sender';

const USER_COMMANDS = [
    ['/start', '\u83B7\u53D6\u5F53\u524D chat id\uFF0C\u5E76\u5F00\u59CB\u65B0\u5BF9\u8BDD'],
    ['/new', '\u6E05\u7A7A\u5F53\u524D\u804A\u5929\u5386\u53F2\uFF0C\u5F00\u542F\u65B0\u5BF9\u8BDD'],
    ['/help', '\u67E5\u770B\u5E2E\u52A9'],
];

const ADMIN_COMMANDS = [
    ['/add <\u8BDD\u672F\u6587\u672C>', '\u6DFB\u52A0\u8BDD\u672F'],
    ['/list', '\u5217\u51FA\u8BDD\u672F'],
    ['/delete <\u5E8F\u53F7>', '\u5220\u9664\u5BF9\u5E94\u5E8F\u53F7\u7684\u8BDD\u672F'],
];

export class HelpCommandHandler implements CommandHandler {
    command = '/help';
    scopes = ['all_private_chats', 'all_group_chats', 'all_chat_administrators'];
    handle = async (message: Telegram.Message, subcommand: string, context: WorkerContext): Promise<Response> => {
        const sender = MessageSender.fromMessage(context.SHARE_CONTEXT.botToken, message);
        const lines = [
            '\u5F53\u524D\u652F\u6301\u4EE5\u4E0B\u547D\u4EE4:',
            '',
            ...USER_COMMANDS.map(([command, description]) => `${command} - ${description}`),
        ];
        if (ENV.SCRIPT_ENABLE) {
            lines.push(
                '',
                '\u8BDD\u672F\u7BA1\u7406\u5458\u547D\u4EE4:',
                ...ADMIN_COMMANDS.map(([command, description]) => `${command} - ${description}`),
            );
        }
        return sender.sendPlainText(lines.join('\n'));
    };
}

class BaseNewCommandHandler {
    static async handle(showID: boolean, message: Telegram.Message, subcommand: string, context: WorkerContext): Promise<Response> {
        await ENV.DATABASE.delete(context.SHARE_CONTEXT.chatHistoryKey);
        const text = `\u65B0\u7684\u5BF9\u8BDD\u5DF2\u7ECF\u5F00\u59CB${showID ? ` (${message.chat.id})` : ''}`;
        const params: Telegram.SendMessageParams = {
            chat_id: message.chat.id,
            text,
        };
        if (ENV.SHOW_REPLY_BUTTON && !isGroupChat(message.chat.type)) {
            params.reply_markup = {
                keyboard: [[{ text: '/new' }]],
                selective: true,
                resize_keyboard: true,
                one_time_keyboard: false,
            };
        } else {
            params.reply_markup = {
                remove_keyboard: true,
                selective: true,
            };
        }
        return createTelegramBotAPI(context.SHARE_CONTEXT.botToken).sendMessage(params);
    }
}

export class NewCommandHandler extends BaseNewCommandHandler implements CommandHandler {
    command = '/new';
    scopes = ['all_private_chats', 'all_group_chats', 'all_chat_administrators'];
    handle = async (message: Telegram.Message, subcommand: string, context: WorkerContext): Promise<Response> => {
        return BaseNewCommandHandler.handle(false, message, subcommand, context);
    };
}

export class StartCommandHandler extends BaseNewCommandHandler implements CommandHandler {
    command = '/start';
    scopes = ['all_private_chats', 'all_group_chats', 'all_chat_administrators'];
    handle = async (message: Telegram.Message, subcommand: string, context: WorkerContext): Promise<Response> => {
        return BaseNewCommandHandler.handle(true, message, subcommand, context);
    };
}
