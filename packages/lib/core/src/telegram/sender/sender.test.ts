import type * as Telegram from 'telegram-bot-api-types';
import { MessageSender } from './index';

function message(type: Telegram.Chat['type'] = 'private'): Telegram.Message {
    return {
        chat: {
            id: 123,
            type,
        },
        date: 0,
        message_id: 42,
    } as Telegram.Message;
}

describe('message sender', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('sends Telegram rich markdown through sendRichMessage', async () => {
        const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ ok: true, result: { message_id: 100 } }), { status: 200 }),
        );

        const resp = await MessageSender.fromMessage('token', message()).sendRichMarkdown('- item');

        expect(resp.ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(`${url}`).toContain('/bottoken/sendRichMessage');
        expect(JSON.parse(`${init?.body}`)).toEqual({
            chat_id: 123,
            rich_message: {
                markdown: '- item',
            },
        });
    });

    it('falls back to plain text when sendRichMessage fails', async () => {
        const fetchMock = jest.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response('bad markdown', { status: 400 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { message_id: 101 } }), { status: 200 }));
        jest.spyOn(console, 'warn').mockImplementation(() => {});

        const resp = await MessageSender.fromMessage('token', message()).sendRichMarkdown('- item');

        expect(resp.ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(`${fetchMock.mock.calls[0][0]}`).toContain('/bottoken/sendRichMessage');
        expect(`${fetchMock.mock.calls[1][0]}`).toContain('/bottoken/sendMessage');
        expect(JSON.parse(`${fetchMock.mock.calls[1][1]?.body}`)).toMatchObject({
            chat_id: 123,
            text: '- item',
        });
    });

    it('sends reply markup with Telegram rich markdown', async () => {
        const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ ok: true, result: { message_id: 102 } }), { status: 200 }),
        );

        await MessageSender.fromMessage('token', message()).sendRichMarkdown('hello', {
            reply_markup: {
                remove_keyboard: true,
            },
        });

        expect(JSON.parse(`${fetchMock.mock.calls[0][1]?.body}`)).toMatchObject({
            chat_id: 123,
            reply_markup: {
                remove_keyboard: true,
            },
            rich_message: {
                markdown: 'hello',
            },
        });
    });
});
