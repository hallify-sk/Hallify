import { writable } from 'svelte/store';

export interface ChatNotification {
	sessionId: string;
	message: string;
	senderType: 'guest' | 'user' | 'admin';
	timestamp: string;
}

export const chatNotifications = writable<ChatNotification[]>([]);
export const unreadChatCount = writable(0);

export function addChatNotification(notification: ChatNotification) {
	chatNotifications.update(notifications => [...notifications, notification]);
	unreadChatCount.update(count => count + 1);
}
