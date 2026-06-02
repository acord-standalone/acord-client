/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface SessionUser {
    id: string;
    username?: string;
    displayName?: string;
    avatar?: string;
}

export interface SessionChannel {
    id: string;
    guildId?: string;
    name?: string;
    userLimit?: number;
    type: number;
}

export interface SessionGuild {
    id: string;
    name?: string;
    icon?: string;
    vanityCode?: string;
}

export interface SessionNick {
    guildId: string;
    userId: string;
    nick: string;
}

/** A live voice session for one user, hydrated with metadata by the backend. */
export interface HydratedSession {
    userId: string;
    channelId: string | null;
    sessionId: string | null;
    mute: boolean;
    deaf: boolean;
    stream: boolean;
    selfMute: boolean;
    selfDeaf: boolean;
    selfVideo: boolean;
    selfStream?: boolean;
    suppress: boolean;
    guildId?: string;
    durationMs?: number;
    user?: SessionUser;
    nick?: SessionNick;
    channel?: SessionChannel;
    guild?: SessionGuild;
}

export interface ChannelQueryResult {
    channel?: SessionChannel;
    guild?: SessionGuild;
    count: number;
    members: HydratedSession[];
}

/** One of the last channels a user was seen in (queryUserLog). */
export interface UserChannelLogEntry {
    channelId: string;
    guildId?: string;
    joinedAt: number;
    leftAt?: number;
    channel?: SessionChannel;
    guild?: SessionGuild;
}

/** A recent join/leave/move event in a channel (queryChannelLog). */
export interface ChannelLogEntry {
    type: "join" | "leave" | "move";
    userId: string;
    sessionId: string;
    fromChannelId?: string;
    toChannelId?: string;
    guildId?: string;
    ts: number;
    user?: SessionUser;
    nick?: string;
    fromChannel?: SessionChannel;
    toChannel?: SessionChannel;
    guild?: SessionGuild;
}

export const isInVoice = (s: HydratedSession): boolean => s.channelId != null;
