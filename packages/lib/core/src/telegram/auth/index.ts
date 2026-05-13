export function isGroupChat(type: string): boolean {
    return type === 'group' || type === 'supergroup';
}
