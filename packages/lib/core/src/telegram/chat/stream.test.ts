import type * as Telegram from 'telegram-bot-api-types';
import { MessageSender } from '../sender';
import { canUseMessageDraft, createDraftId, fitDraftText, TelegramStreamResponder } from './stream';

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
    afterEach(() => {
        jest.restoreAllMocks();
    });

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

    it('starts rich markdown drafts with Telegram thinking block', async () => {
        const msg = message('private');
        const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ ok: true, result: true }), { status: 200 }),
        );
        const responder = new TelegramStreamResponder({
            context: { SHARE_CONTEXT: { botToken: 'token' } } as any,
            finalTextMode: 'rich-markdown',
            message: msg,
            sender: MessageSender.fromMessage('token', msg),
        });

        await responder.begin();
        responder.stopTyping();

        const draftCall = fetchMock.mock.calls.find(([url]) => `${url}`.includes('/sendRichMessageDraft'));
        expect(draftCall).toBeDefined();
        expect(JSON.parse(`${draftCall?.[1]?.body}`)).toMatchObject({
            chat_id: 1,
            draft_id: 42,
            rich_message: {
                markdown: '<tg-thinking>Thinking...</tg-thinking>',
            },
        });
    });
});
