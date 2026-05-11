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
    it('parses a single plain-text script', () => {
        const library = parseScriptsText('Price question\nPrice answer.');

        expect(library.allVersions).toHaveLength(1);
        expect(library.activeScripts[0].id).toBe('1');
        expect(library.activeScripts[0].title).toBe('Price question');
        expect(library.activeScripts[0].content).toBe('Price question\nPrice answer.');
    });

    it('parses multiple plain-text scripts separated by ---', () => {
        const library = parseScriptsText([
            'Price question',
            'Price answer.',
            '',
            '---',
            '',
            'Refund policy',
            'Refund answer.',
        ].join('\n'));

        expect(library.allVersions).toHaveLength(2);
        expect(library.activeScripts.map(item => item.id)).toEqual(['1', '2']);
        expect(library.activeScripts.map(item => item.title)).toEqual(['Price question', 'Refund policy']);
    });

    it('parses natural-language /add input as raw text', () => {
        const content = parseAddCommandInput([
            '价格咨询',
            '我们的价格会根据你选择的套餐和使用量有所不同。',
            '你可以先告诉我你的使用场景，我会帮你推荐合适的方案。',
        ].join('\n'));

        expect(content).toContain('价格咨询');
        expect(content).toContain('我们的价格');
    });

    it('validates empty /add input', () => {
        expect(() => parseAddCommandInput('')).toThrow('content is required');
    });

    it('round-trips serialized plain-text scripts without metadata', () => {
        const serialized = serializeScriptsText([
            'Price question\nPrice answer.',
            'Refund policy\nRefund answer.',
        ]);
        const library = parseScriptsText(serialized);

        expect(serialized).not.toContain('```json');
        expect(serialized).not.toContain('"id"');
        expect(library.activeScripts).toHaveLength(2);
        expect(library.activeScripts[1].content).toContain('Refund answer.');
    });

    it('keeps legacy JSON block compatibility while stripping metadata', () => {
        const library = parseScriptsText([
            '# Scripts',
            legacyBlock({ id: 'price', title: 'Old price' }, 'Old answer.'),
            legacyBlock({ id: 'price', title: 'New price' }, 'New answer.'),
            legacyBlock({ id: 'refund', title: 'Refund' }, 'Refund answer.'),
        ].join('\n'));

        expect(library.activeScripts).toHaveLength(2);
        expect(library.activeScripts[0].title).toBe('New price');
        expect(library.activeScripts[0].content).toBe('New answer.');
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

    it('builds a script-library prompt for the current user message', () => {
        const library = parseScriptsText('Price question\nPrice answer.');

        const params = buildScriptLibraryPrompt(library, 'How much?');
        expect(params.prompt).toContain('【话术集】');
        expect(params.prompt).toContain('每次回复前都先阅读【话术集】');
        expect(params.prompt).toContain('可以正常聊天或追问澄清');
        expect(params.prompt).toContain('Price answer.');
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
