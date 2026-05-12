import type { HistoryModifier, UserContentPart, UserMessageItem } from '#/agent';
import type { WorkerContext } from '#/config';
import type * as Telegram from 'telegram-bot-api-types';
import type { FinalTextMode } from './stream';
import { loadChatLLM, requestCompletionsFromLLM } from '#/agent';
import { ENV } from '#/config';
import { createTelegramBotAPI } from '../api';
import { MessageSender } from '../sender';
import { TelegramStreamResponder } from './stream';

interface ChatWithMessageOptions {
    finalTextMode?: FinalTextMode;
    systemPrompt?: string;
}

export async function chatWithMessage(message: Telegram.Message, params: UserMessageItem | null, context: WorkerContext, modifier: HistoryModifier | null, options: ChatWithMessageOptions = {}): Promise<Response> {
    const sender = MessageSender.fromMessage(context.SHARE_CONTEXT.botToken, message);
    const streamResponder = new TelegramStreamResponder({
        context,
        finalTextMode: options.finalTextMode,
        message,
        sender,
    });
    try {
        const agent = loadChatLLM(context.USER_CONFIG);
        if (agent === null) {
            return sender.sendPlainText('LLM is not enable');
        }
        await streamResponder.begin();
        const answer = await requestCompletionsFromLLM(params, context, agent, modifier, streamResponder.onStream, options.systemPrompt);
        return await streamResponder.finish(answer);
    } catch (e) {
        streamResponder.stopTyping();
        let errMsg = `Error: ${(e as Error).message}`;
        if (errMsg.length > 2048) {
            errMsg = errMsg.substring(0, 2048);
        }
        return sender.sendPlainText(errMsg);
    }
}

export async function extractImageURL(fileId: string | null, context: WorkerContext): Promise<URL | null> {
    if (!fileId) {
        return null;
    }
    const api = createTelegramBotAPI(context.SHARE_CONTEXT.botToken);
    const file = await api.getFileWithReturns({ file_id: fileId });
    const filePath = file.result.file_path;
    if (filePath) {
        const url = URL.parse(`${ENV.TELEGRAM_API_DOMAIN}/file/bot${context.SHARE_CONTEXT.botToken}/${filePath}`);
        if (url) {
            return url;
        }
    }
    return null;
}

export function extractImageFileID(message: Telegram.Message): string | null {
    if (message.photo && message.photo.length > 0) {
        const offset = ENV.TELEGRAM_PHOTO_SIZE_OFFSET;
        const length = message.photo.length;
        const sizeIndex = Math.max(0, Math.min(offset >= 0 ? offset : length + offset, length - 1));
        return message.photo[sizeIndex]?.file_id;
    } else if (message.document && message.document.thumbnail) {
        return message.document.thumbnail.file_id;
    }
    return null;
}

export async function extractUserMessageItem(message: Telegram.Message, context: WorkerContext): Promise<UserMessageItem> {
    let text = message.text || message.caption || '';
    const urls = await extractImageURL(extractImageFileID(message), context).then(u => u ? [u] : []);
    if (
        ENV.EXTRA_MESSAGE_CONTEXT
        && message.reply_to_message
        && message.reply_to_message.from
        && `${message.reply_to_message.from.id}` !== `${context.SHARE_CONTEXT.botId}`
    ) {
        const extraText = message.reply_to_message.text || message.reply_to_message.caption || '';
        if (extraText) {
            text = `${text}\nThe following is the referenced context: ${extraText}`;
        }
        if (ENV.EXTRA_MESSAGE_MEDIA_COMPATIBLE.includes('image') && message.reply_to_message.photo) {
            const url = await extractImageURL(extractImageFileID(message.reply_to_message), context);
            if (url) {
                urls.push(url);
            }
        }
    }
    const params: UserMessageItem = {
        role: 'user',
        content: text,
    };
    if (urls.length > 0) {
        const contents = new Array<UserContentPart>();
        if (text) {
            contents.push({ type: 'text', text });
        }
        for (const url of urls) {
            contents.push({ type: 'image', image: url });
        }
        params.content = contents;
    }
    return params;
}
