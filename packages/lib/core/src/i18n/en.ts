export default {
    env: {
        system_init_message: 'You are a helpful assistant',
    },
    command: {
        help: {
            summary: 'The following commands are currently supported:\n',
            help: 'Get command help',
            new: 'Start a new conversation',
            start: 'Get your ID and start a new conversation',
        },
        new: {
            new_chat_start: 'A new conversation has started',
        },
    },
    callback_query: {
        unsupported_action: 'Unsupported action',
    },
};
