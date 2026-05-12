import type { KVNamespaceBinding } from '@chatgpt-telegram-workers/core';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as process from 'node:process';
import { createRouter, ENV } from '@chatgpt-telegram-workers/core';
import convert from 'telegramify-markdown';

class VercelKVBinding implements KVNamespaceBinding {
    constructor(private readonly url: string, private readonly token: string) {}

    private async command<T>(command: unknown[]): Promise<T> {
        const response = await fetch(this.url, {
            method: 'POST',
            headers: {
                'authorization': `Bearer ${this.token}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify(command),
        });
        const data = await response.json() as { result?: T; error?: string };
        if (!response.ok || data.error) {
            throw new Error(data.error || `Vercel KV request failed: ${response.status}`);
        }
        return data.result as T;
    }

    async get(key: string): Promise<string | null> {
        return await this.command<string | null>(['GET', key]);
    }

    async put(key: string, value: string, info?: { expirationTtl?: number; expiration?: number }): Promise<void> {
        const command: unknown[] = ['SET', key, value];
        if (info?.expirationTtl) {
            command.push('EX', info.expirationTtl);
        } else if (info?.expiration) {
            command.push('EXAT', info.expiration);
        }
        await this.command<string>(command);
    }

    async delete(key: string): Promise<void> {
        await this.command<number>(['DEL', key]);
    }
}

export default async function (request: VercelRequest, response: VercelResponse) {
    try {
        const {
            KV_REST_API_URL = '',
            KV_REST_API_TOKEN = '',
        } = process.env;
        for (const [KEY, VALUE] of Object.entries({ KV_REST_API_URL, KV_REST_API_TOKEN })) {
            if (!VALUE) {
                response.status(500).json({
                    error: `${KEY} is required`,
                    message: 'Connect Vercel KV or set environment variables, then redeploy',
                });
                return;
            }
        }
        const cache = new VercelKVBinding(KV_REST_API_URL, KV_REST_API_TOKEN);
        ENV.DEFAULT_PARSE_MODE = 'MarkdownV2';
        ENV.merge({
            ...process.env,
            DATABASE: cache,
        });
        ENV.CUSTOM_MESSAGE_RENDER = (parse_mode, message) => {
            if (parse_mode === 'MarkdownV2') {
                return convert(message, 'remove');
            }
            return message;
        };
        const router = createRouter();
        let body: any | null = null;
        if (request.body) {
            body = JSON.stringify(request.body);
        }
        if (request.url === '/vercel/debug') {
            response.status(200).json({
                message: 'OK',
                host: request.headers.host,
            });
            return;
        }
        const forwardedProto = Array.isArray(request.headers['x-forwarded-proto'])
            ? request.headers['x-forwarded-proto'][0]
            : request.headers['x-forwarded-proto'];
        const host = request.headers.host || process.env.VERCEL_URL;
        if (!host) {
            response.status(500).json({
                error: 'request host is required',
                message: 'Vercel did not provide a Host header',
            });
            return;
        }
        const parsedRequestUrl = request.url?.startsWith('http') ? new URL(request.url) : null;
        const path = parsedRequestUrl
            ? `${parsedRequestUrl.pathname}${parsedRequestUrl.search}`
            : request.url || '/';
        const url = `${forwardedProto || 'https'}://${host}${path}`;
        console.log(`Forwarding request to ${url}`);
        const newReq = new Request(url, {
            method: request.method,
            headers: Object.entries(request.headers).reduce((acc, [key, value]) => {
                if (value === undefined) {
                    return acc;
                }
                if (Array.isArray(value)) {
                    for (const v of value) {
                        acc.append(key, v);
                    }
                    return acc;
                }
                acc.set(key, value);
                return acc;
            }, new Headers()),
            body,
        });
        const res = await router.fetch(newReq);
        for (const [key, value] of res.headers.entries()) {
            response.setHeader(key, value);
        }
        response.status(res.status).send(await res.text());
    } catch (e) {
        response.status(500).json({
            message: (e as Error).message,
            stack: (e as Error).stack,
        });
    }
}
