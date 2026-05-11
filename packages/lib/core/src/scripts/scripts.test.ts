import { parseAddCommandInput } from './commands';
import { matchScript } from './matcher';
import { parseScriptsMarkdown, serializeScriptBlock } from './parser';

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
            triggers: ['price'],
        }, 'Price answer.'));

        expect(library.allVersions).toHaveLength(1);
        expect(library.activeScripts[0].meta.mode).toBe('exact');
        expect(library.activeScripts[0].content).toBe('Price answer.');
    });

    it('parses multiple scripts', () => {
        const library = parseScriptsMarkdown([
            '# Scripts',
            block({ id: 'price', title: 'Price', triggers: ['price'] }, 'Price answer.'),
            block({ id: 'refund', title: 'Refund', triggers: ['refund'] }, 'Refund answer.'),
        ].join('\n'));

        expect(library.allVersions).toHaveLength(2);
        expect(library.activeScripts.map(item => item.meta.id)).toEqual(['price', 'refund']);
    });

    it('uses the later version for the same id', () => {
        const library = parseScriptsMarkdown([
            block({ id: 'price', title: 'Old', triggers: ['old'] }, 'Old answer.'),
            block({ id: 'price', title: 'New', triggers: ['new'] }, 'New answer.'),
        ].join('\n'));

        expect(library.allVersions).toHaveLength(2);
        expect(library.byId.get('price')?.meta.title).toBe('New');
        expect(library.activeScripts).toHaveLength(1);
    });

    it('disables scripts when the latest version has enabled false', () => {
        const library = parseScriptsMarkdown([
            block({ id: 'price', title: 'Price', triggers: ['price'] }, 'Price answer.'),
            block({ id: 'price', title: 'Price', triggers: ['price'], enabled: false }, 'Price answer.'),
        ].join('\n'));

        expect(library.byId.get('price')?.meta.enabled).toBe(false);
        expect(library.activeScripts).toHaveLength(0);
    });

    it('matches triggers case-insensitively', () => {
        const library = parseScriptsMarkdown(block({
            id: 'price',
            title: 'Price',
            triggers: ['PRICE'],
        }, 'Price answer.'));

        const match = matchScript('what is your price?', library);
        expect(match?.script.meta.id).toBe('price');
        expect(match?.matchedTrigger).toBe('PRICE');
    });

    it('prefers higher priority matches', () => {
        const library = parseScriptsMarkdown([
            block({ id: 'low', title: 'Low', triggers: ['price'], priority: 1 }, 'Low answer.'),
            block({ id: 'high', title: 'High', triggers: ['price'], priority: 99 }, 'High answer.'),
        ].join('\n'));

        expect(matchScript('price please', library)?.script.meta.id).toBe('high');
    });

    it('prefers later versions when priority ties', () => {
        const library = parseScriptsMarkdown([
            block({ id: 'a', title: 'A', triggers: ['price'], priority: 10 }, 'A answer.'),
            block({ id: 'b', title: 'B', triggers: ['price'], priority: 10 }, 'B answer.'),
        ].join('\n'));

        expect(matchScript('price please', library)?.script.meta.id).toBe('b');
    });

    it('recognizes fallback scripts', () => {
        const library = parseScriptsMarkdown(block({
            id: 'fallback',
            title: 'Fallback',
            triggers: [],
        }, 'Fallback answer.'));

        expect(library.fallback?.meta.id).toBe('fallback');
        expect(library.fallback?.content).toBe('Fallback answer.');
    });

    it('validates /add input format', () => {
        expect(() => parseAddCommandInput([
            '```json',
            JSON.stringify({ id: 'x', title: 'X', triggers: [] }),
            '```',
        ].join('\n'))).toThrow('content is required');
    });

    it('round-trips serialized script blocks', () => {
        const serialized = serializeScriptBlock({
            id: 'refund',
            title: 'Refund',
            triggers: ['refund'],
            mode: 'rewrite',
            priority: 80,
            enabled: true,
        }, 'Refund answer.');
        const library = parseScriptsMarkdown(serialized);

        expect(library.byId.get('refund')?.meta.mode).toBe('rewrite');
        expect(library.byId.get('refund')?.content).toBe('Refund answer.');
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
