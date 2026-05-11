import { parseAddCommandInput } from './commands';
import { parseScriptsMarkdown, serializeScriptBlock } from './parser';
import { buildScriptLibraryPrompt, renderScriptLibraryForPrompt } from './prompt';

function block(meta: Record<string, unknown>, content: string): string {
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

describe('scripts markdown', () => {
    it('parses a single script', () => {
        const library = parseScriptsMarkdown(block({
            id: 'price',
            title: 'Price',
        }, 'Price answer.'));

        expect(library.allVersions).toHaveLength(1);
        expect(library.activeScripts[0].meta.title).toBe('Price');
        expect(library.activeScripts[0].content).toBe('Price answer.');
    });

    it('parses multiple scripts', () => {
        const library = parseScriptsMarkdown([
            '# Scripts',
            block({ id: 'price', title: 'Price' }, 'Price answer.'),
            block({ id: 'refund', title: 'Refund' }, 'Refund answer.'),
        ].join('\n'));

        expect(library.allVersions).toHaveLength(2);
        expect(library.activeScripts.map(item => item.meta.id)).toEqual(['price', 'refund']);
    });

    it('uses the later version for the same id', () => {
        const library = parseScriptsMarkdown([
            block({ id: 'price', title: 'Old' }, 'Old answer.'),
            block({ id: 'price', title: 'New' }, 'New answer.'),
        ].join('\n'));

        expect(library.allVersions).toHaveLength(2);
        expect(library.byId.get('price')?.meta.title).toBe('New');
        expect(library.activeScripts).toHaveLength(1);
    });

    it('disables scripts when the latest version has enabled false', () => {
        const library = parseScriptsMarkdown([
            block({ id: 'price', title: 'Price' }, 'Price answer.'),
            block({ id: 'price', title: 'Price', enabled: false }, 'Price answer.'),
        ].join('\n'));

        expect(library.byId.get('price')?.meta.enabled).toBe(false);
        expect(library.activeScripts).toHaveLength(0);
    });

    it('recognizes fallback scripts', () => {
        const library = parseScriptsMarkdown(block({
            id: 'fallback',
            title: 'Fallback',
        }, 'Fallback answer.'));

        expect(library.fallback?.meta.id).toBe('fallback');
        expect(library.fallback?.content).toBe('Fallback answer.');
    });

    it('parses natural-language /add input', () => {
        const entry = parseAddCommandInput([
            '价格咨询',
            '我们的价格会根据你选择的套餐和使用量有所不同。',
            '你可以先告诉我你的使用场景，我会帮你推荐合适的方案。',
        ].join('\n'));

        expect(entry.meta.id).toMatch(/^script_[a-z0-9]+_[a-z0-9]+$/);
        expect(entry.meta.title).toBe('价格咨询');
        expect(entry.meta.priority).toBe(0);
        expect(entry.meta.enabled).toBe(true);
        expect(entry.content).toContain('我们的价格');
    });

    it('validates empty /add input', () => {
        expect(() => parseAddCommandInput('')).toThrow('content is required');
    });

    it('keeps legacy /add JSON block compatibility', () => {
        const entry = parseAddCommandInput([
            '```json',
            JSON.stringify({ id: 'x', title: 'X' }),
            '```',
            '',
            'Legacy content.',
        ].join('\n'));

        expect(entry.meta.id).toBe('x');
        expect(entry.meta.title).toBe('X');
        expect(entry.content).toBe('Legacy content.');
    });

    it('round-trips serialized script blocks', () => {
        const serialized = serializeScriptBlock({
            id: 'refund',
            title: 'Refund',
            priority: 80,
            enabled: true,
        }, 'Refund answer.');
        const library = parseScriptsMarkdown(serialized);

        expect(library.byId.get('refund')?.meta.priority).toBe(80);
        expect(library.byId.get('refund')?.content).toBe('Refund answer.');
    });

    it('renders active scripts as model prompt material without trigger matching hints', () => {
        const library = parseScriptsMarkdown([
            block({ id: 'price', title: 'Price', priority: 90, triggers: ['price'] }, 'Price answer.'),
            block({ id: 'fallback', title: 'Fallback' }, 'Fallback answer.'),
            block({ id: 'disabled', title: 'Disabled', enabled: false }, 'Disabled answer.'),
        ].join('\n'));

        const rendered = renderScriptLibraryForPrompt(library, library.fallback);
        expect(rendered).toContain('Price');
        expect(rendered).toContain('Price answer.');
        expect(rendered).not.toContain('price');
        expect(rendered).not.toContain('适用关键词');
        expect(rendered).not.toContain('Fallback answer.');
        expect(rendered).not.toContain('Disabled answer.');
    });

    it('builds a script-library prompt for the current user message', () => {
        const library = parseScriptsMarkdown(block({
            id: 'price',
            title: 'Price',
        }, 'Price answer.'));

        const params = buildScriptLibraryPrompt(library, 'Fallback answer.', 'How much?');
        expect(params.prompt).toContain('【话术集】');
        expect(params.prompt).toContain('Price answer.');
        expect(params.prompt).toContain('Fallback answer.');
        expect(params.messages[0].content).toContain('How much?');
    });

    it('throws a clear error for invalid JSON', () => {
        expect(() => parseScriptsMarkdown([
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
