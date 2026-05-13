import zhHans from './zh-hans';

interface HelpI18n {
    summary: string;
    help: string;
    new: string;
    start: string;
}

export interface I18n {
    env: {
        system_init_message: string;
    };
    command: {
        help: HelpI18n & Record<string, string>;
        new: {
            new_chat_start: string;
        };
    };
    callback_query: {
        unsupported_action: string;
    };
}

export function loadI18n(): I18n {
    return zhHans;
}
