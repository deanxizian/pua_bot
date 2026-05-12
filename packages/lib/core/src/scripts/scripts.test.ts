import { parseAddCommandInput } from './commands';
import { parseScriptsText, serializeScriptsText } from './parser';
import { buildScriptLibraryPrompt, renderScriptLibraryForPrompt } from './prompt';

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
        expect(prompt.indexOf('Always stay concise.')).toBeLessThan(prompt.indexOf('Price answer.'));
        expect(params.messages[0].content).toContain('How much?');
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
});
