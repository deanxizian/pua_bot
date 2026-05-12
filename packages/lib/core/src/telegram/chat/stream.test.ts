import type * as Telegram from 'telegram-bot-api-types';
import { canUseMessageDraft, createDraftId, fitDraftText } from './stream';

function message(type: Telegram.Chat['type'], messageId = 42): Telegram.Message {
    return {
        chat: {
            id: 1,
            type,
        },
        date: 0,
        message_id: messageId,
    } as Telegram.Message;
}

describe('telegram stream responder helpers', () => {
    it('uses message drafts only in private chats', () => {
        expect(canUseMessageDraft(message('private'))).toBe(true);
        expect(canUseMessageDraft(message('group'))).toBe(false);
        expect(canUseMessageDraft(message('supergroup'))).toBe(false);
    });

    it('uses the incoming message id as a stable draft id', () => {
        expect(createDraftId(message('private', 123))).toBe(123);
        expect(createDraftId(message('private', 0))).toBe(1);
    });

    it('keeps draft previews within Telegram text limits', () => {
        expect(fitDraftText('hello   ')).toBe('hello');
        expect(fitDraftText('x'.repeat(5000))).toHaveLength(4096);
        expect(fitDraftText('x'.repeat(5000)).endsWith('\n...')).toBe(true);
    });
});
