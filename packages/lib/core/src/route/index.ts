import type { RouterRequest } from '#/utils/router';
import type * as Telegram from 'telegram-bot-api-types';
import { ENV } from '#/config';
import { createTelegramBotAPI, handleUpdate } from '#/telegram';
import { commandsBindScope, commandsDocument } from '#/telegram/command';
import { errorToString, makeResponse200, renderHTML } from '#/utils/resp';
import { Router } from '#/utils/router';

const helpLink = 'https://github.com/deanxizian/pua_bot/blob/main/doc/SCRIPTS.md';
const issueLink = 'https://github.com/deanxizian/pua_bot/issues';
const initLink = './init';
const footer = `
<br/>
<p>更多说明请查看 <a href="${helpLink}">${helpLink}</a></p>
<p>问题反馈请访问 <a href="${issueLink}">${issueLink}</a></p>
`;

async function bindWebHookAction(request: RouterRequest): Promise<Response> {
    const result: Record<string, Record<string, any>> = {};
    const domain = new URL(request.url).host;
    const hookMode = ENV.API_GUARD ? 'safehook' : 'webhook';
    const scope = commandsBindScope();
    for (const token of ENV.TELEGRAM_AVAILABLE_TOKENS) {
        const api = createTelegramBotAPI(token);
        const url = `https://${domain}/telegram/${token.trim()}/${hookMode}`;
        const id = token.split(':')[0];
        result[id] = {};
        result[id].webhook = await api.setWebhook({ url }).then(res => res.json()).catch(e => errorToString(e));
        for (const [s, data] of Object.entries(scope)) {
            result[id][`delete_${s}`] = await api.deleteMyCommands({
                scope: data.scope,
            } as Telegram.DeleteMyCommandsParams).then(res => res.json()).catch(e => errorToString(e));
        }
        for (const [s, data] of Object.entries(scope)) {
            result[id][s] = await api.setMyCommands(data).then(res => res.json()).catch(e => errorToString(e));
        }
    }
    let html = `<h1>PUA Bot</h1>`;
    html += `<h2>${domain}</h2>`;
    if (ENV.TELEGRAM_AVAILABLE_TOKENS.length === 0) {
        html += `<p style="color: red">请先配置 <strong>TELEGRAM_AVAILABLE_TOKENS</strong> 环境变量。</p> `;
    } else {
        for (const [key, res] of Object.entries(result)) {
            html += `<h3>Bot: ${key}</h3>`;
            for (const [s, data] of Object.entries(res)) {
                html += `<p style="color: ${data.ok ? 'green' : 'red'}">${s}: ${JSON.stringify(data)}</p>`;
            }
        }
    }
    html += footer;
    const HTML = renderHTML(html);
    return new Response(HTML, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

async function telegramWebhook(request: RouterRequest): Promise<Response> {
    try {
        const { token } = request.params as any;
        const body = await request.json() as Telegram.Update;
        return makeResponse200(await handleUpdate(token, body));
    } catch (e) {
        console.error(e);
        return new Response(errorToString(e), { status: 200 });
    }
}

/**
 *用API_GUARD处理Telegram回调
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function telegramSafeHook(request: RouterRequest): Promise<Response> {
    try {
        if (ENV.API_GUARD === undefined || ENV.API_GUARD === null) {
            return telegramWebhook(request);
        }
        console.log('API_GUARD is enabled');
        const url = new URL(request.url);
        url.pathname = url.pathname.replace('/safehook', '/webhook');
        const newRequest = new Request(url, request);
        return makeResponse200(await ENV.API_GUARD.fetch(newRequest));
    } catch (e) {
        console.error(e);
        return new Response(errorToString(e), { status: 200 });
    }
}

async function defaultIndexAction(): Promise<Response> {
    const HTML = renderHTML(`
    <h1>PUA Bot</h1>
    <br/>
    <p>部署成功。</p>
    <p>版本：ts:${ENV.BUILD_TIMESTAMP}, sha:${ENV.BUILD_VERSION}</p>
    <br/>
    <p>需要访问 <strong><a href="${initLink}">初始化入口</a></strong> 绑定 Telegram webhook。</p>
    <br/>
    <p>绑定 webhook 后，可以使用以下机器人命令：</p>
    ${
        commandsDocument().map(item => `<p><strong>${item.command}</strong> - ${item.description}</p>`).join('')
    }
    <br/>
    <p>可以通过以下地址查看 bot 信息：</p>
    <p><strong>/telegram/:token/bot</strong> - 查看 bot 信息</p>
    ${footer}
  `);
    return new Response(HTML, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

export function createRouter(): Router {
    const router = new Router();
    router.get('/', defaultIndexAction);
    router.get('/init', bindWebHookAction);
    router.post('/telegram/:token/webhook', telegramWebhook);
    router.post('/telegram/:token/safehook', telegramSafeHook);
    router.all('*', () => new Response('Not Found', { status: 404 }));
    return router;
}
