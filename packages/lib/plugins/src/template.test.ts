import { executeRequest } from './template';

describe('template', () => {
    it('renders a local template response', async () => {
        const template = {
            url: 'data:application/json,{"word":"{{DATA}}"}',
            method: 'GET',
            response: {
                content: {
                    input_type: 'json',
                    output_type: 'html',
                    output: '<b>{{word}}</b>',
                },
                error: {
                    input_type: 'json',
                    output_type: 'text',
                    output: 'Error: {{message}}',
                },
            },
        } as any;
        const result = await executeRequest(template, { DATA: 'example' });
        expect(result.content).toContain('example');
    });
});
