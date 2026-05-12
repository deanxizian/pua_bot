import type { WorkerContext } from '#/config';
import type * as Telegram from 'telegram-bot-api-types';
import { MessageSender } from '../sender';

export async function handleCallbackQuery(callbackQuery: Telegram.CallbackQuery, context: WorkerContext): Promise<Response | null> {
    const sender = MessageSender.fromCallbackQuery(context.SHARE_CONTEXT.botToken, callbackQuery);
    return sender.api.answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: 'Unsupported action',
    });
}
