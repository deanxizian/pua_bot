import type { WorkerContext } from '#/config';
import type * as Telegram from 'telegram-bot-api-types';
import type { MessageHandler, UpdateHandler } from './types';
import { ENV } from '#/config';
import { isGroupChat } from '../auth';
import { handleCallbackQuery } from '../callback_query';
import { chatWithMessage, extractUserMessageItem } from '../chat';
import { handleCommandMessage } from '../command';
import { MessageSender } from '../sender';

export class EnvChecker implements UpdateHandler {
    handle = async (update: Telegram.Update, context: WorkerContext): Promise<Response | null> => {
        if (!ENV.DATABASE) {
            return MessageSender
                .fromUpdate(context.SHARE_CONTEXT.botToken, update)
                .sendPlainText('DATABASE Not Set');
        }
        return null;
    };
}

export class WhiteListFilter implements UpdateHandler {
    handle = async (update: Telegram.Update, context: WorkerContext): Promise<Response | null> => {
        const allowedChats = ENV.CHAT_WHITE_LIST.map(id => id.trim().toLowerCase());
        const allowedGroups = ENV.CHAT_GROUP_WHITE_LIST.map(id => id.trim()).filter(Boolean);
        const sender = MessageSender.fromUpdate(context.SHARE_CONTEXT.botToken, update);

        let chatType = '';
        let chatID = 0;

        if (update.message) {
            chatType = update.message.chat.type;
            chatID = update.message.chat.id;
        } else if (update.callback_query?.message) {
            chatType = update.callback_query.message.chat.type;
            chatID = update.callback_query.message.chat.id;
        }

        if (!chatType || !chatID) {
            throw new Error('Invalid chat type or chat id');
        }
        const text = `You are not in the white list, please contact the administrator to add you to the white list. Your chat_id: ${chatID}`;

        if (chatType === 'private') {
            if (!allowedChats.includes('all') && !allowedChats.includes(`${chatID}`)) {
                return sender.sendPlainText(text);
            }
            return null;
        }

        if (isGroupChat(chatType)) {
            if (!allowedGroups.includes(`${chatID}`)) {
                return sender.sendPlainText(text);
            }
            return null;
        }

        return sender.sendPlainText(
            `Not support chat type: ${chatType}`,
        );
    };
}

export class Update2MessageHandler implements UpdateHandler {
    messageHandlers: MessageHandler[];
    constructor(messageHandlers: MessageHandler[]) {
        this.messageHandlers = messageHandlers;
    }

    loadMessage(body: Telegram.Update): Telegram.Message {
        if (body.edited_message) {
            throw new Error('Ignore edited message');
        }
        if (body.message) {
            return body?.message;
        } else {
            throw new Error('Invalid message');
        }
    }

    handle = async (update: Telegram.Update, context: WorkerContext): Promise<Response | null> => {
        const message = this.loadMessage(update);
        if (!message) {
            return null;
        }
        for (const handler of this.messageHandlers) {
            const result = await handler.handle(message, context);
            if (result) {
                return result;
            }
        }
        return null;
    };
}

export class CallbackQueryHandler implements UpdateHandler {
    handle = async (update: Telegram.Update, context: WorkerContext): Promise<Response | null> => {
        if (update.callback_query) {
            return handleCallbackQuery(update.callback_query, context);
        }
        return null;
    };
}

export class OldMessageFilter implements MessageHandler {
    handle = async (message: Telegram.Message, context: WorkerContext): Promise<Response | null> => {
        let idList = [];
        try {
            idList = JSON.parse(await ENV.DATABASE.get(context.SHARE_CONTEXT.lastMessageKey).catch(() => '[]')) || [];
        } catch (e) {
            console.error(e);
        }
        if (idList.includes(message.message_id)) {
            throw new Error('Ignore old message');
        } else {
            idList.push(message.message_id);
            if (idList.length > 100) {
                idList.shift();
            }
            await ENV.DATABASE.put(context.SHARE_CONTEXT.lastMessageKey, JSON.stringify(idList));
        }
        return null;
    };
}

export class MessageFilter implements MessageHandler {
    handle = async (message: Telegram.Message, _context: WorkerContext): Promise<Response | null> => {
        if (message.text) {
            return null;
        }
        if (message.caption) {
            return null;
        }
        if (message.photo) {
            return null;
        }
        throw new Error('Not supported message type');
    };
}

export class CommandHandler implements MessageHandler {
    handle = async (message: Telegram.Message, context: WorkerContext): Promise<Response | null> => {
        if (message.text || message.caption) {
            return await handleCommandMessage(message, context);
        }
        return null;
    };
}

export class ChatHandler implements MessageHandler {
    handle = async (message: Telegram.Message, context: WorkerContext): Promise<Response | null> => {
        const params = await extractUserMessageItem(message, context);
        return chatWithMessage(message, params, context, null);
    };
}
