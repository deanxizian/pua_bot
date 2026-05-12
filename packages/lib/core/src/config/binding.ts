export interface KVNamespaceBinding {
    get: (key: string) => Promise<string | any>;
    put: (key: string, value: string, info?: { expirationTtl?: number; expiration?: number }) => Promise<void>;
    delete: (key: string) => Promise<void>;
    acquireLock?: (key: string, token: string, ttlSeconds: number) => Promise<boolean>;
    releaseLock?: (key: string, token: string) => Promise<void>;
}

export interface APIGuardBinding {
    fetch: (request: Request) => Promise<Response>;
}
