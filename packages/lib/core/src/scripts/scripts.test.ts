import { ENV } from '#/config';
import { parseAddCommandInput } from './commands';
import { parseScriptsText, serializeScriptsText } from './parser';
import { buildScriptLibraryPrompt, renderScriptLibraryForPrompt, withScriptPromptTemperature } from './prompt';
import { appendScriptInputs, clearScriptCache, deleteScriptEntry } from './store';

function legacyBlock(meta: Record<string, unknown>, content: string): string {
    return [
        '---',
        '',
        '```json',
        JSON.stringify(meta, null, 2),
        '```',
        '',
        content,
        '',
    ].join('\n');
}

describe('scripts text', () => {
    const previousDatabase = ENV.DATABASE;
    const previousScriptFilePath = ENV.SCRIPT_FILE_PATH;

    afterEach(() => {
        ENV.DATABASE = previousDatabase;
        ENV.SCRIPT_FILE_PATH = previousScriptFilePath;
        clearScriptCache();
        jest.restoreAllMocks();
    });

    it('parses a single plain-text script as common', () => {
        const library = parseScriptsText('Price question\nPrice answer.');

        expect(library.allVersions).toHaveLength(1);
        expect(library.activeScripts[0].id).toBe('1');
        expect(library.activeScripts[0].section).toBe('common');
        expect(library.activeScripts[0].title).toBe('Price question');
        expect(library.activeScripts[0].content).toBe('Price question\nPrice answer.');
    });

    it('parses core and common sections', () => {
        const library = parseScriptsText([
            '[core]',
            'Always stay concise.',
            '',
            '---',
            '',
            '[common]',
            'Price question',
            'Price answer.',
        ].join('\n'));

        expect(library.coreScripts.map(item => item.content)).toEqual(['Always stay concise.']);
        expect(library.commonScripts.map(item => item.title)).toEqual(['Price question']);
    });

    it('parses /add 0 input as core ideas and splits multiple sentences', () => {
        const records = parseAddCommandInput('0 Be honest. Ask one question.');

        expect(records).toEqual([
            { content: 'Be honest.', section: 'core' },
            { content: 'Ask one question.', section: 'core' },
        ]);
    });

    it('parses plain /add input as common phrases and supports multiple lines', () => {
        const records = parseAddCommandInput([
            'Price question',
            'Refund question',
        ].join('\n'));

        expect(records).toEqual([
            { content: 'Price question', section: 'common' },
            { content: 'Refund question', section: 'common' },
        ]);
    });

    it('parses non-zero numeric /add input as common phrases', () => {
        const records = parseAddCommandInput('1 Price question. Refund question.');

        expect(records).toEqual([
            { content: 'Price question.', section: 'common' },
            { content: 'Refund question.', section: 'common' },
        ]);
    });

    it('validates empty /add input', () => {
        expect(() => parseAddCommandInput('')).toThrow('content is required');
    });

    it('round-trips serialized scripts with section markers', () => {
        const serialized = serializeScriptsText([
            { content: 'Core rule.', section: 'core' },
            { content: 'Common phrase.', section: 'common' },
        ]);
        const library = parseScriptsText(serialized);

        expect(serialized).toContain('[core]');
        expect(serialized).toContain('[common]');
        expect(library.coreScripts).toHaveLength(1);
        expect(library.commonScripts).toHaveLength(1);
    });

    it('serializes the remaining scripts after deleting an index', () => {
        const original = parseScriptsText([
            'Price question',
            '',
            '---',
            '',
            'Refund policy',
            '',
            '---',
            '',
            'Shipping note',
        ].join('\n'));
        const serialized = serializeScriptsText(original.activeScripts.filter(script => script.id !== '2'));
        const library = parseScriptsText(serialized);

        expect(library.activeScripts.map(script => script.id)).toEqual(['1', '2']);
        expect(library.activeScripts.map(script => script.title)).toEqual(['Price question', 'Shipping note']);
    });

    it('keeps legacy JSON block compatibility while preserving metadata section', () => {
        const library = parseScriptsText([
            '# Scripts',
            legacyBlock({ id: 'price', title: 'Old price' }, 'Old answer.'),
            legacyBlock({ id: 'price', title: 'New price', section: 'core' }, 'New answer.'),
            legacyBlock({ id: 'refund', title: 'Refund' }, 'Refund answer.'),
        ].join('\n'));

        expect(library.activeScripts).toHaveLength(2);
        expect(library.activeScripts[0].title).toBe('New price');
        expect(library.activeScripts[0].section).toBe('core');
        expect(library.activeScripts[0].id).toBe('1');
        expect(library.activeScripts[1].title).toBe('Refund');
    });

    it('respects legacy enabled=false records during migration', () => {
        const library = parseScriptsText([
            legacyBlock({ id: 'price', title: 'Price' }, 'Price answer.'),
            legacyBlock({ id: 'price', title: 'Price', enabled: false }, 'Price answer.'),
        ].join('\n'));

        expect(library.activeScripts).toHaveLength(0);
    });

    it('renders only script text as model prompt material', () => {
        const library = parseScriptsText([
            'Price question',
            'Price answer.',
            '',
            '---',
            '',
            'Guidance',
            'Guidance answer.',
        ].join('\n'));

        const rendered = renderScriptLibraryForPrompt(library);
        expect(rendered).toContain('Price answer.');
        expect(rendered).toContain('Guidance answer.');
        expect(rendered).not.toContain('"id"');
        expect(rendered).not.toContain('priority');
        expect(rendered).not.toContain('enabled');
        expect(rendered).not.toContain('#1');
    });

    it('builds a script-library prompt with core before common', () => {
        const library = parseScriptsText([
            '[common]',
            'Price answer.',
            '',
            '---',
            '',
            '[core]',
            'Always stay concise.',
        ].join('\n'));

        const params = buildScriptLibraryPrompt(library, 'How much?');
        const prompt = params.prompt || '';
        expect(prompt).toContain('【核心思想】');
        expect(prompt).toContain('【常用语】');
        expect(prompt).toContain('扮演领导/管理者角色');
        expect(prompt).toContain('理解话术背后的判断方式和表达风格');
        expect(prompt).toContain('不要让人感觉是在堆砌话术');
        expect(prompt).toContain('先判断用户意图');
        expect(prompt).toContain('该回答就回答，该追问就追问，该表态就表态，该推进就推进');
        expect(prompt).toContain('常用语要聪明、灵活、少量使用');
        expect(prompt).toContain('每次优先提炼最相关的一点');
        expect(prompt).toContain('回复主要来自当前对话本身');
        expect(prompt).toContain('不相关时可以不用');
        expect(prompt).toContain('可以使用简洁 Markdown 列表');
        expect(prompt).not.toContain('按话术含义回复');
        expect(prompt).toContain('【最近对话】');
        expect(prompt).toContain('【用户当前消息】');
        expect(prompt.indexOf('Always stay concise.')).toBeLessThan(prompt.indexOf('Price answer.'));
        expect(params.messages[0].content).toContain('How much?');
    });

    it('uses a slightly warmer script prompt temperature for natural replies', () => {
        const config = withScriptPromptTemperature({} as any);

        expect(config.OPENAI_API_EXTRA_PARAMS).toEqual({ temperature: 0.35 });
        expect(config.CLAUDE_CHAT_EXTRA_PARAMS).toEqual({ temperature: 0.35 });
    });

    it('throws a clear error for invalid legacy JSON', () => {
        expect(() => parseScriptsText([
            '---',
            '',
            '```json',
            '{bad json',
            '```',
            '',
            'Content.',
        ].join('\n'))).toThrow('Invalid JSON in script block #1');
    });

    it('serializes concurrent script appends in the current process', async () => {
        const data = new Map<string, string>();
        ENV.SCRIPT_FILE_PATH = '';
        ENV.DATABASE = {
            delete: async key => void data.delete(key),
            get: async key => data.get(key) || '',
            put: async (key, value) => {
                await new Promise(resolve => setTimeout(resolve, 5));
                data.set(key, value);
            },
        };

        await Promise.all([
            appendScriptInputs([{ content: 'First script.', section: 'common' }]),
            appendScriptInputs([{ content: 'Second script.', section: 'common' }]),
        ]);

        const library = parseScriptsText(data.get('scripts:markdown') || '');
        expect(library.activeScripts.map(script => script.content)).toEqual([
            'First script.',
            'Second script.',
        ]);
    });

    it('uses distributed script locks when the database binding supports them', async () => {
        const data = new Map<string, string>();
        const acquireLock = jest.fn(async () => true);
        const releaseLock = jest.fn(async () => undefined);
        ENV.SCRIPT_FILE_PATH = '';
        ENV.DATABASE = {
            acquireLock,
            delete: async key => void data.delete(key),
            get: async key => data.get(key) || '',
            put: async (key, value) => void data.set(key, value),
            releaseLock,
        };

        await appendScriptInputs([{ content: 'Locked script.', section: 'common' }]);

        expect(acquireLock).toHaveBeenCalledWith('scripts:markdown:lock', expect.any(String), 10);
        expect(releaseLock).toHaveBeenCalledWith('scripts:markdown:lock', expect.any(String));
    });

    it('deletes scripts under the script store write lock', async () => {
        const data = new Map<string, string>([
            ['scripts:markdown', serializeScriptsText([
                { content: 'Keep this.', section: 'common' },
                { content: 'Delete this.', section: 'common' },
            ])],
        ]);
        ENV.SCRIPT_FILE_PATH = '';
        ENV.DATABASE = {
            delete: async key => void data.delete(key),
            get: async key => data.get(key) || '',
            put: async (key, value) => void data.set(key, value),
        };

        const result = await deleteScriptEntry('2');
        const library = parseScriptsText(data.get('scripts:markdown') || '');

        expect(result.entry?.content).toBe('Delete this.');
        expect(library.activeScripts.map(script => script.content)).toEqual(['Keep this.']);
    });
});
