export default {
    env: {
        system_init_message: 'Voce e um assistente util',
    },
    command: {
        help: {
            summary: 'Os seguintes comandos sao suportados atualmente:\n',
            help: 'Obter ajuda sobre comandos',
            new: 'Iniciar uma nova conversa',
            start: 'Obter seu ID e iniciar uma nova conversa',
        },
        new: {
            new_chat_start: 'Uma nova conversa foi iniciada',
        },
    },
    callback_query: {
        unsupported_action: 'Acao nao suportada',
    },
};
