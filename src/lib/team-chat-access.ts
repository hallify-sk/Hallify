// Who may read and who may post in a team channel (D3), from `areaAccess`.
//
//  * General channels: read on messages.view, post on messages.send (which needs
//    messages.view: writing into a channel one cannot read is posting blind).
//  * Announcement channels: published to the whole organisation, so every member
//    reads them; posting (and opening a new one) is announcements.manage.
//  * An archived channel takes no posts from anybody.

import type { AreaAccess } from '$lib/permissions';

export interface ChannelLike {
	type: string;
	archived_at?: string | null;
}

export function mayReadChannel(access: AreaAccess, channel: ChannelLike): boolean {
	return channel.type === 'announcement' || access.messages.view;
}

export function mayPostInChannel(access: AreaAccess, channel: ChannelLike): boolean {
	if (channel.archived_at) return false;
	return channel.type === 'announcement' ? access.announcements.post : access.messages.send;
}
