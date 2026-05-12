import * as fs from 'node:fs';
import * as process from 'node:process';
import { createRouter, ENV, handleUpdate } from '@chatgpt-telegram-workers/core';
import { createCache, defaultRequestBuilder, initEnv, installFetchProxy, startServerV2 } from 'cloudflare-worker-adapter';
import convert from 'telegramify-markdown';
import { runPolling } from './telegram';

interface Config {
    database: {
        type: 'memory' | 'local' | 'sqlite' | 'redis';
        path?: string;
    };
    server?: {
        hostname?: string;
        port?: number;
        baseURL: string;
    };
    proxy?: string;
    mode: 'webhook' | 'polling';
}

function dirname(filePath: string): string {
    const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    if (lastSlash <= 0) {
        return '';
    }
    return filePath.slice(0, lastSlash);
}

const {
    CONFIG_PATH = '/app/config.json',
    TOML_PATH = '/app/wrangler.toml',
} = process.env;

// 读取配置文件
const config: Config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

// 初始化数据库
const cache = createCache(config?.database?.type, { uri: config.database.path || '' });
console.log(`database: ${config?.database?.type} is ready`);

// 初始化环境变量
const env = {
    ...initEnv(TOML_PATH, { DATABASE: cache }),
    ...process.env,
    DATABASE: cache,
};
ENV.DEFAULT_PARSE_MODE = 'MarkdownV2';
ENV.merge(env);
ENV.SCRIPT_FILE_STORAGE = {
    readFile: async (filePath: string): Promise<string> => {
        try {
            return await fs.promises.readFile(filePath, 'utf-8');
        } catch (e) {
            if ((e as any).code === 'ENOENT') {
                return '';
            }
            throw e;
        }
    },
    writeFileAtomic: async (filePath: string, content: string): Promise<void> => {
        const dir = dirname(filePath);
        if (dir) {
            await fs.promises.mkdir(dir, { recursive: true });
        }
        const tmp = `${filePath}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
        try {
            await fs.promises.writeFile(tmp, content, 'utf-8');
            await fs.promises.rename(tmp, filePath);
        } catch (e) {
            await fs.promises.unlink(tmp).catch(() => {});
            throw e;
        }
    },
};
ENV.CUSTOM_MESSAGE_RENDER = (parse_mode, message) => {
    if (parse_mode === 'MarkdownV2') {
        return convert(message, 'remove');
    }
    return message;
};

// 注入 Next.js Chat Agent
if (config.proxy) {
    installFetchProxy(config.proxy);
}

// 启动服务
if (config.mode === 'webhook' && config.server !== undefined) {
    const router = createRouter();
    startServerV2(
        config.server.port || 8787,
        config.server.hostname || '0.0.0.0',
        env,
        { baseURL: config.server.baseURL },
        defaultRequestBuilder,
        router.fetch,
    );
} else {
    runPolling(
        ENV.TELEGRAM_AVAILABLE_TOKENS,
        handleUpdate,
    ).catch(console.error);
}
