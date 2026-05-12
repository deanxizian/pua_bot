export class AgentShareConfig {
    // Supported chat providers: auto, openai, claude.
    AI_PROVIDER = 'auto';
    SYSTEM_INIT_MESSAGE: string | null = null;
}

export class OpenAIConfig {
    OPENAI_API_KEY: string[] = [];
    OPENAI_CHAT_MODEL = 'gpt-4o-mini';
    OPENAI_API_BASE = 'https://api.openai.com/v1';
    OPENAI_API_EXTRA_PARAMS: Record<string, any> = {};
    OPENAI_CHAT_MODELS_LIST = '';
}

export class ClaudeConfig {
    CLAUDE_API_KEY: string | null = null;
    CLAUDE_API_BASE = 'https://api.anthropic.com/v1';
    CLAUDE_CHAT_MODEL = 'claude-3-5-haiku-latest';
    CLAUDE_CHAT_MODELS_LIST = '';
    CLAUDE_CHAT_EXTRA_PARAMS: Record<string, any> = {};
}

type UserConfig = AgentShareConfig & OpenAIConfig & ClaudeConfig;
export type AgentUserConfigKey = keyof UserConfig;

export class DefineKeys {
    DEFINE_KEYS: AgentUserConfigKey[] = [];
}

export type AgentUserConfig = Record<string, any> & DefineKeys & UserConfig;

export class EnvironmentConfig {
    LANGUAGE = 'zh-cn';
    UPDATE_BRANCH = 'master';
    CHAT_COMPLETE_API_TIMEOUT = 0;

    TELEGRAM_API_DOMAIN = 'https://api.telegram.org';
    TELEGRAM_AVAILABLE_TOKENS: string[] = [];
    DEFAULT_PARSE_MODE = 'Markdown';
    TELEGRAM_MIN_STREAM_INTERVAL = 0;
    TELEGRAM_PHOTO_SIZE_OFFSET = 1;
    TELEGRAM_IMAGE_TRANSFER_MODE = 'base64';

    // Set CHAT_WHITE_LIST to "all" to allow everyone.
    CHAT_WHITE_LIST: string[] = [];
    LOCK_USER_CONFIG_KEYS: AgentUserConfigKey[] = [
        'OPENAI_API_BASE',
        'CLAUDE_API_BASE',
    ];

    TELEGRAM_BOT_NAME: string[] = [];
    CHAT_GROUP_WHITE_LIST: string[] = [];
    GROUP_CHAT_BOT_ENABLE = true;
    GROUP_CHAT_BOT_SHARE_MODE = true;

    AUTO_TRIM_HISTORY = true;
    MAX_HISTORY_LENGTH = 20;
    MAX_TOKEN_LENGTH = -1;
    HISTORY_IMAGE_PLACEHOLDER: string | null = null;

    SHOW_REPLY_BUTTON = false;
    EXTRA_MESSAGE_CONTEXT = false;
    EXTRA_MESSAGE_MEDIA_COMPATIBLE = ['image'];

    STREAM_MODE = true;
    SAFE_MODE = true;
    DEBUG_MODE = false;
    DEV_MODE = false;

    SCRIPT_ENABLE = false;
    SCRIPT_ADMIN_IDS: string[] = [];
    SCRIPT_MARKDOWN_KEY = 'scripts:markdown';
    SCRIPT_CACHE_TTL_SECONDS = 30;
    SCRIPT_FILE_PATH = '';
}
