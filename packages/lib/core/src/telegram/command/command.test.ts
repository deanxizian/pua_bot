import { ENV } from '#/config';
import { commandsBindScope, commandsDocument } from './index';
import { HelpCommandHandler } from './system';

function sentText(fetchMock: jest.SpyInstance): string {
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    return body.rich_message?.markdown || body.text || '';
}

describe('telegram commands', () => {
    const previousScriptEnable = ENV.SCRIPT_ENABLE;
    const previousScriptAdminIds = ENV.SCRIPT_ADMIN_IDS;

    afterEach(() => {
        ENV.SCRIPT_ENABLE = previousScriptEnable;
        ENV.SCRIPT_ADMIN_IDS = previousScriptAdminIds;
        jest.restoreAllMocks();
    });

    it('documents only the public chat commands when scripts are disabled', () => {
        ENV.SCRIPT_ENABLE = false;

        expect(commandsDocument().map(item => item.command)).toEqual([
            '/start',
            '/new',
            '/help',
        ]);
    });

    it('adds only the supported script admin commands when scripts are enabled', () => {
        ENV.SCRIPT_ENABLE = true;

        expect(commandsDocument().map(item => item.command)).toEqual([
            '/start',
            '/new',
            '/help',
            '/add',
            '/list',
            '/delete',
        ]);
    });

    it('does not bind script commands to Telegram menu scopes', () => {
        ENV.SCRIPT_ENABLE = true;

        const scope = commandsBindScope();

        expect(scope.default.commands.map(item => item.command)).toEqual([]);
        expect(scope.all_private_chats.commands.map(item => item.command)).toEqual([
            'start',
            'new',
            'help',
        ]);
    });

    it('shows script commands in help only to script admins', async () => {
        ENV.SCRIPT_ENABLE = true;
        ENV.SCRIPT_ADMIN_IDS = ['123'];
        const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
        const handler = new HelpCommandHandler();

        await handler.handle({
            chat: { id: 1, type: 'private' },
            date: 0,
            from: { first_name: 'Admin', id: 123, is_bot: false },
            message_id: 1,
            text: '/help',
        } as any, '', { SHARE_CONTEXT: { botToken: 'token' } } as any);

        const text = sentText(fetchMock);
        expect(text).toContain('/add');
        expect(text).toContain('/list');
        expect(text).toContain('/delete');
    });

    it('hides script commands in help from non-admin users', async () => {
        ENV.SCRIPT_ENABLE = true;
        ENV.SCRIPT_ADMIN_IDS = ['123'];
        const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
        const handler = new HelpCommandHandler();

        await handler.handle({
            chat: { id: 1, type: 'private' },
            date: 0,
            from: { first_name: 'User', id: 456, is_bot: false },
            message_id: 1,
            text: '/help',
        } as any, '', { SHARE_CONTEXT: { botToken: 'token' } } as any);

        const text = sentText(fetchMock);
        expect(text).not.toContain('/add');
        expect(text).not.toContain('/list');
        expect(text).not.toContain('/delete');
    });
});
