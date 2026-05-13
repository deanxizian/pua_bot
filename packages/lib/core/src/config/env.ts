import type { I18n } from '#/i18n';
import type { APIGuardBinding, KVNamespaceBinding } from './binding';
import type { AgentUserConfig, AgentUserConfigKey } from './config';
import { loadI18n } from '#/i18n';
import { AgentShareConfig, ClaudeConfig, DefineKeys, EnvironmentConfig, OpenAIConfig } from './config';
import { ConfigMerger } from './merger';
import { BUILD_TIMESTAMP, BUILD_VERSION } from './version';

function createAgentUserConfig(): AgentUserConfig {
    return Object.assign(
        {},
        new DefineKeys(),
        new AgentShareConfig(),
        new OpenAIConfig(),
        new ClaudeConfig(),
    );
}

function fixApiBase(base: string): string {
    return base.replace(/\/+$/, '');
}

export const ENV_KEY_MAPPER: Record<string, AgentUserConfigKey> = {
    CHAT_MODEL: 'OPENAI_CHAT_MODEL',
    API_KEY: 'OPENAI_API_KEY',
};

export type CustomMessageRender = (mode: string | null, message: string) => string;

export interface ScriptFileStorageBinding {
    readFile: (filePath: string) => Promise<string>;
    writeFileAtomic: (filePath: string, content: string) => Promise<void>;
}

class Environment extends EnvironmentConfig {
    BUILD_TIMESTAMP = BUILD_TIMESTAMP;
    BUILD_VERSION = BUILD_VERSION;

    I18N: I18n = loadI18n();
    readonly USER_CONFIG: AgentUserConfig = createAgentUserConfig();

    API_GUARD: APIGuardBinding | null = null;
    DATABASE: KVNamespaceBinding = null as any;
    CUSTOM_MESSAGE_RENDER: CustomMessageRender | null = null;
    SCRIPT_FILE_STORAGE: ScriptFileStorageBinding | null = null;

    constructor() {
        super();
        this.merge = this.merge.bind(this);
    }

    merge(source: any) {
        this.DATABASE = source.DATABASE;
        this.API_GUARD = source.API_GUARD;

        ConfigMerger.merge(this, source, [
            'BUILD_TIMESTAMP',
            'BUILD_VERSION',
            'I18N',
            'USER_CONFIG',
            'DATABASE',
            'API_GUARD',
            'SCRIPT_FILE_STORAGE',
        ]);
        ConfigMerger.merge(this.USER_CONFIG, source);
        this.migrateOldEnv(source);
        this.fixAgentUserConfigApiBase();
        this.USER_CONFIG.DEFINE_KEYS = [];
        this.I18N = loadI18n();
    }

    private migrateOldEnv(source: any) {
        if (source.TELEGRAM_TOKEN && !this.TELEGRAM_AVAILABLE_TOKENS.includes(source.TELEGRAM_TOKEN)) {
            if (source.BOT_NAME && this.TELEGRAM_AVAILABLE_TOKENS.length === this.TELEGRAM_BOT_NAME.length) {
                this.TELEGRAM_BOT_NAME.push(source.BOT_NAME);
            }
            this.TELEGRAM_AVAILABLE_TOKENS.push(source.TELEGRAM_TOKEN);
        }

        if (source.OPENAI_API_DOMAIN && !this.USER_CONFIG.OPENAI_API_BASE) {
            this.USER_CONFIG.OPENAI_API_BASE = `${source.OPENAI_API_DOMAIN}/v1`;
        }

        if (source.API_KEY && this.USER_CONFIG.OPENAI_API_KEY.length === 0) {
            this.USER_CONFIG.OPENAI_API_KEY = source.API_KEY.split(',');
        }

        if (source.CHAT_MODEL && !this.USER_CONFIG.OPENAI_CHAT_MODEL) {
            this.USER_CONFIG.OPENAI_CHAT_MODEL = source.CHAT_MODEL;
        }
    }

    private fixAgentUserConfigApiBase() {
        const keys: AgentUserConfigKey[] = [
            'OPENAI_API_BASE',
            'CLAUDE_API_BASE',
        ];
        for (const key of keys) {
            const base = this.USER_CONFIG[key];
            if (this.USER_CONFIG[key] && typeof base === 'string') {
                this.USER_CONFIG[key] = fixApiBase(base) as any;
            }
        }
        this.TELEGRAM_API_DOMAIN = fixApiBase(this.TELEGRAM_API_DOMAIN);
    }
}

export const ENV = new Environment();
