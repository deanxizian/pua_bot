import type { AgentUserConfig } from '#/config';
import type {
    AgentEnable,
    AgentModel,
    AgentModelList,
    ChatAgent,
    ChatAgentRequest,
    ChatAgentResponse,
    ChatStreamTextHandler,
    LLMChatParams,
} from './types';
import { ImageSupportFormat, loadOpenAIModelList, renderOpenAIMessages } from '#/agent/openai_compatibility';
import { requestChatCompletions } from './request';
import { bearerHeader, convertStringToResponseMessages, getAgentUserConfigFieldName } from './utils';

function openAIApiKey(context: AgentUserConfig): string {
    const length = context.OPENAI_API_KEY.length;
    return context.OPENAI_API_KEY[Math.floor(Math.random() * length)];
}

export class OpenAI implements ChatAgent {
    readonly name = 'openai';
    readonly modelKey = getAgentUserConfigFieldName('OPENAI_CHAT_MODEL');

    readonly enable: AgentEnable = ctx => ctx.OPENAI_API_KEY.length > 0;
    readonly model: AgentModel = ctx => ctx.OPENAI_CHAT_MODEL;
    readonly modelList: AgentModelList = ctx => loadOpenAIModelList(ctx.OPENAI_CHAT_MODELS_LIST, ctx.OPENAI_API_BASE, bearerHeader(openAIApiKey(ctx)));

    readonly request: ChatAgentRequest = async (params: LLMChatParams, context: AgentUserConfig, onStream: ChatStreamTextHandler | null): Promise<ChatAgentResponse> => {
        const { prompt, messages } = params;
        const url = `${context.OPENAI_API_BASE}/chat/completions`;
        const header = bearerHeader(openAIApiKey(context));
        const body = {
            ...(context.OPENAI_API_EXTRA_PARAMS || {}),
            model: context.OPENAI_CHAT_MODEL,
            messages: await renderOpenAIMessages(prompt, messages, [ImageSupportFormat.URL, ImageSupportFormat.BASE64]),
            stream: onStream != null,
        };
        return convertStringToResponseMessages(requestChatCompletions(url, header, body, onStream, null));
    };
}
