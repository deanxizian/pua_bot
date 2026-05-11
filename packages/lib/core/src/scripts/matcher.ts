import type { MatchResult, ParsedScriptLibrary, ScriptEntry } from './types';

function normalizeText(input: string): string {
    return input.trim().toLowerCase();
}

function findMatchedTrigger(input: string, script: ScriptEntry): string | null {
    for (const trigger of script.meta.triggers) {
        const normalizedTrigger = normalizeText(trigger);
        if (normalizedTrigger && input.includes(normalizedTrigger)) {
            return trigger;
        }
    }
    return null;
}

export function matchScript(input: string, library: ParsedScriptLibrary): MatchResult | null {
    const normalizedInput = normalizeText(input);
    if (!normalizedInput) {
        return null;
    }

    const matches: MatchResult[] = [];
    for (const script of library.activeScripts) {
        const matchedTrigger = findMatchedTrigger(normalizedInput, script);
        if (matchedTrigger) {
            matches.push({ script, matchedTrigger });
        }
    }

    matches.sort((a, b) => {
        if (a.script.meta.priority !== b.script.meta.priority) {
            return b.script.meta.priority - a.script.meta.priority;
        }
        if (a.script.index !== b.script.index) {
            return b.script.index - a.script.index;
        }
        return a.script.meta.id.localeCompare(b.script.meta.id);
    });

    return matches[0] || null;
}
