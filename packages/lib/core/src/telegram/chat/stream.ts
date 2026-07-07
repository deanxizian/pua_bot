import type { WorkerContext } from '#/config';
import type * as Telegram from 'telegram-bot-api-types';
import type { TelegramBotAPI } from '../api';
import type { MessageSender } from '../sender';
import { createTelegramBotAPI } from '../api';

const DRAFT_TEXT_LIMIT = 4096;
const DRAFT_UPDATE_INTERVAL_MS = 700;
const RICH_DRAFT_THINKING_MARKDOWN = '<tg-thinking>Thinking...</tg-thinking>';
const TYPING_REFRESH_MS = 4000;

type StreamMode = 'draft' | 'edit' | 'none';
export type FinalTextMode = 'plain' | 'rich' | 'rich-markdown';

interface TelegramStreamResponderOptions {
    context: WorkerContext;
    finalTextMode?: FinalTextMode;
    message: Telegram.Message;
    sender: MessageSender;
}

interface SendMessageDraftParams {
    chat_id: number;
    draft_id: number;
    rich_message?: {
        markdown: string;
    };
    text?: string;
}

export function canUseMessageDraft(message: Telegram.Message): boolean {
    return message.chat.type === 'private';
}

export function createDraftId(message: Telegram.Message): number {
    return Math.max(1, message.message_id);
}

export function fitDraftText(text: string): string {
    const trimmed = text.trimEnd();
    if (trimmed.length <= DRAFT_TEXT_LIMIT) {
        return trimmed;
    }
    return `${trimmed.slice(0, DRAFT_TEXT_LIMIT - 4)}\n...`;
}

function retryAfterMs(resp: Response): number | null {
    const retryAfter = Number.parseInt(resp.headers.get('Retry-After') || '');
    return retryAfter > 0 ? retryAfter * 1000 : null;
}

export class TelegramStreamResponder {
    private readonly api: TelegramBotAPI;
    private readonly draftId: number;
    private readonly finalTextMode: FinalTextMode;
    private editReady = false;
    private mode: StreamMode;
    private nextDraftUpdateAt = 0;
    private nextEditUpdateAt: number | null = null;
    private typingStopped = true;
    private typingTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly options: TelegramStreamResponderOptions) {
        this.api = createTelegramBotAPI(options.context.SHARE_CONTEXT.botToken);
        this.draftId = createDraftId(options.message);
        this.finalTextMode = options.finalTextMode || 'rich-markdown';
        this.mode = this.finalTextMode === 'rich-markdown'
            ? (canUseMessageDraft(options.message) ? 'draft' : 'none')
            : (canUseMessageDraft(options.message) ? 'draft' : 'edit');
        this.onStream = this.onStream.bind(this);
    }

    async begin(): Promise<void> {
        this.startTyping();
        if (this.mode === 'draft') {
            const ok = await this.sendDraft('');
            if (ok) {
                return;
            }
            this.mode = this.finalTextMode === 'rich-markdown' ? 'none' : 'edit';
        }
        if (this.mode === 'edit') {
            await this.ensureEditMessage();
        }
    }

    async finish(answer: string): Promise<Response> {
        if (this.nextEditUpdateAt !== null && this.nextEditUpdateAt > Date.now()) {
            await new Promise(resolve => setTimeout(resolve, (this.nextEditUpdateAt ?? 0) - Date.now()));
        }
        this.stopTyping();
        if (this.finalTextMode === 'plain') {
            return this.options.sender.sendPlainText(answer);
        }
        if (this.finalTextMode === 'rich-markdown') {
            return this.options.sender.sendRichMarkdown(answer);
        }
        return this.options.sender.sendRichText(answer);
    }

    stopTyping(): void {
        this.typingStopped = true;
        if (this.typingTimer) {
            clearTimeout(this.typingTimer);
            this.typingTimer = null;
        }
    }

    async onStream(text: string): Promise<void> {
        if (!text.trim()) {
            return;
        }
        if (this.mode === 'draft') {
            if (Date.now() < this.nextDraftUpdateAt) {
                return;
            }
            this.nextDraftUpdateAt = Date.now() + DRAFT_UPDATE_INTERVAL_MS;
            const ok = await this.sendDraft(text);
            if (ok) {
                return;
            }
            this.mode = this.finalTextMode === 'rich-markdown' ? 'none' : 'edit';
        }
        if (this.mode === 'edit') {
            await this.updateEditMessage(text);
        }
    }

    private startTyping(): void {
        if (!this.typingStopped) {
            return;
        }
        this.typingStopped = false;
        const tick = async () => {
            if (this.typingStopped) {
                return;
            }
            await this.api.sendChatAction({
                action: 'typing',
                chat_id: this.options.message.chat.id,
            }).catch(console.error);
            if (!this.typingStopped) {
                this.typingTimer = setTimeout(tick, TYPING_REFRESH_MS);
            }
        };
        void tick();
    }

    private async sendDraft(text: string): Promise<boolean> {
        const params: SendMessageDraftParams = {
            chat_id: this.options.message.chat.id,
            draft_id: this.draftId,
        };
        if (this.finalTextMode === 'rich-markdown') {
            params.rich_message = {
                markdown: text.trim() ? fitDraftText(text) : RICH_DRAFT_THINKING_MARKDOWN,
            };
        } else {
            params.text = fitDraftText(text);
        }
        const method = this.finalTextMode === 'rich-markdown' ? 'sendRichMessageDraft' : 'sendMessageDraft';
        try {
            const resp = await this.api.request(method as Telegram.BotMethod, params);
            if (resp.ok) {
                return true;
            }
            const retryAfter = retryAfterMs(resp);
            if (retryAfter) {
                this.nextDraftUpdateAt = Date.now() + retryAfter;
            }
            console.warn(`${method} failed: ${resp.status} ${await resp.text().catch(() => '')}`);
        } catch (e) {
            console.warn(e);
        }
        return false;
    }

    private async ensureEditMessage(): Promise<boolean> {
        if (this.editReady) {
            return true;
        }
        try {
            const resp = await this.options.sender.sendPlainText('...');
            if (!resp.ok) {
                return false;
            }
            const msg = await resp.json() as Telegram.ResponseWithMessage;
            this.options.sender.update({
                message_id: msg.result.message_id,
            });
            this.editReady = true;
            return true;
        } catch (e) {
            console.error(e);
            this.mode = 'none';
            return false;
        }
    }

    private async updateEditMessage(text: string): Promise<void> {
        try {
            if (this.nextEditUpdateAt && this.nextEditUpdateAt > Date.now()) {
                return;
            }
            if (!await this.ensureEditMessage()) {
                return;
            }
            const resp = await this.options.sender.sendPlainText(text);
            if (resp.status === 429) {
                const retryAfter = retryAfterMs(resp);
                if (retryAfter) {
                    this.nextEditUpdateAt = Date.now() + retryAfter;
                    return;
                }
            }
            this.nextEditUpdateAt = null;
            if (resp.ok) {
                const respJson = await resp.json() as Telegram.ResponseWithMessage;
                this.options.sender.update({
                    message_id: respJson.result.message_id,
                });
            }
        } catch (e) {
            console.error(e);
        }
    }
}
