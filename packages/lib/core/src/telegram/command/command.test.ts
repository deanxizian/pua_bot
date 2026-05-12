import { ENV } from '#/config';
import { commandsBindScope, commandsDocument } from './index';

describe('telegram commands', () => {
    const previousScriptEnable = ENV.SCRIPT_ENABLE;

    afterEach(() => {
        ENV.SCRIPT_ENABLE = previousScriptEnable;
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

    it('binds script commands to Telegram menu scopes without slash prefixes', () => {
        ENV.SCRIPT_ENABLE = true;

        const scope = commandsBindScope();

        expect(scope.default.commands.map(item => item.command)).toEqual(['add', 'list', 'delete']);
        expect(scope.all_private_chats.commands.map(item => item.command)).toEqual([
            'start',
            'new',
            'help',
            'add',
            'list',
            'delete',
        ]);
    });
});
