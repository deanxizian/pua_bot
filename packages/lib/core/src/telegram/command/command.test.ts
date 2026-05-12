import { ENV } from '#/config';
import { commandsDocument } from './index';

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
});
