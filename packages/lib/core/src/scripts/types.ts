export interface ScriptMeta {
    id: string;
    title: string;
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

export interface ScriptStore {
    getMarkdown: () => Promise<string>;
    saveMarkdown: (markdown: string) => Promise<void>;
    appendBlock: (block: string) => Promise<void>;
}
