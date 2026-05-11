export interface ScriptEntry {
    id: string;
    title: string;
    content: string;
    index: number;
}

export interface ParsedScriptLibrary {
    allVersions: ScriptEntry[];
    activeScripts: ScriptEntry[];
    byId: Map<string, ScriptEntry>;
    errors?: Error[];
}

export interface ScriptStore {
    getText: () => Promise<string>;
    saveText: (text: string) => Promise<void>;
}
