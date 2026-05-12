export type ScriptSection = 'core' | 'common';

export interface ScriptEntry {
    id: string;
    title: string;
    content: string;
    index: number;
    section: ScriptSection;
}

export interface ParsedScriptLibrary {
    allVersions: ScriptEntry[];
    activeScripts: ScriptEntry[];
    coreScripts: ScriptEntry[];
    commonScripts: ScriptEntry[];
    byId: Map<string, ScriptEntry>;
    errors?: Error[];
}

export interface ScriptStore {
    getText: () => Promise<string>;
    saveText: (text: string) => Promise<void>;
}
