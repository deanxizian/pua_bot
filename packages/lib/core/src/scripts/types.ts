export type ScriptMode = 'exact' | 'rewrite';

export interface ScriptMeta {
    id: string;
    title: string;
    triggers: string[];
    mode: ScriptMode;
    priority: number;
    enabled: boolean;
}

export interface ScriptEntry {
    meta: ScriptMeta;
    content: string;
    index: number;
}

export interface ParsedScriptLibrary {
    allVersions: ScriptEntry[];
    activeScripts: ScriptEntry[];
    byId: Map<string, ScriptEntry>;
    fallback: ScriptEntry | null;
    errors?: Error[];
}

export interface MatchResult {
    script: ScriptEntry;
    matchedTrigger: string | null;
}

export interface ScriptStore {
    getMarkdown: () => Promise<string>;
    saveMarkdown: (markdown: string) => Promise<void>;
    appendBlock: (block: string) => Promise<void>;
}
