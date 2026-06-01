/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { AcordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import type { Channel, Guild, User, VoiceState } from "@vencord/discord-types";
import { ChannelStore, GuildStore, Menu, PermissionsBits, PermissionStore, React, RestAPI, UserStore, VoiceStateStore } from "@webpack/common";

interface UserContextProps {
    user: User;
    guildId?: string;
}

interface GuildContextProps {
    guild?: Guild;
}

/** guildId -> Set of userIds to drag whenever I join a voice channel */
const followedByGuild: Record<string, Set<string>> = {};

function isFollowed(guildId: string, userId: string): boolean {
    return followedByGuild[guildId]?.has(userId) ?? false;
}

function toggleFollow(guildId: string, userId: string): boolean {
    if (!followedByGuild[guildId]) followedByGuild[guildId] = new Set();
    const set = followedByGuild[guildId];
    if (set.has(userId)) {
        set.delete(userId);
        return false;
    }
    set.add(userId);
    return true;
}

function clearGuild(guildId: string) {
    delete followedByGuild[guildId];
}

function hasAnyFollowed(guildId: string): boolean {
    return (followedByGuild[guildId]?.size ?? 0) > 0;
}

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user, guildId }: UserContextProps) => {
    if (!user || !guildId) return;
    const myId = UserStore.getCurrentUser()?.id;
    if (!myId || user.id === myId) return;

    // Only show it if I can actually move members in this guild
    const guild = GuildStore.getGuild(guildId);
    if (!guild || !PermissionStore.can(PermissionsBits.MOVE_MEMBERS, guild)) return;

    const [checked, setChecked] = React.useState(isFollowed(guildId, user.id));

    children.push(
        <Menu.MenuSeparator />,
        <Menu.MenuCheckboxItem
            id="grfvu-drag-user"
            label="Drag to my channel"
            checked={checked}
            action={() => {
                const next = toggleFollow(guildId, user.id);
                setChecked(next);
            }}
        />
    );
};

const GuildContextMenuPatch: NavContextMenuPatchCallback = (children, { guild }: GuildContextProps) => {
    if (!guild) return;
    if (!hasAnyFollowed(guild.id)) return;

    children.push(
        <Menu.MenuSeparator />,
        <Menu.MenuItem
            id="grfvu-stop-all"
            label="Stop dragging all users"
            color="danger"
            action={() => clearGuild(guild.id)}
        />
    );
};

export default definePlugin({
    name: "GuildReverseFollowVoiceUser",
    description: "When you join a voice channel, automatically drags your selected users (per guild) into your channel using server-side move.",
    authors: [AcordDevs.TheArmagan],
    flux: {
        async VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            const myId = UserStore.getCurrentUser()?.id;
            if (!myId) return;

            // Find if I changed voice channels
            const myNewState = [...voiceStates].reverse().find(s => s.userId === myId);
            if (!myNewState) return;

            const newChannelId = myNewState.channelId ?? null;
            if (!newChannelId) return; // I left voice, don't drag anyone

            const myChannel = ChannelStore.getChannel(newChannelId) as Channel | null;
            if (!myChannel || !myChannel.guild_id) return;

            const guildId = myChannel.guild_id;
            const followed = followedByGuild[guildId];
            if (!followed || followed.size === 0) return;

            // Check I have MOVE_MEMBERS on my new channel
            if (!PermissionStore.can(PermissionsBits.MOVE_MEMBERS, myChannel)) return;

            for (const userId of [...followed]) {
                const theirState = VoiceStateStore.getVoiceStateForUser(userId) as VoiceState | null;
                if (!theirState?.channelId) continue; // not in voice
                if (theirState.channelId === newChannelId) continue; // already here

                const theirChannel = ChannelStore.getChannel(theirState.channelId) as Channel | null;
                if (!theirChannel) continue;

                // Must have MOVE_MEMBERS on their current channel too
                if (!PermissionStore.can(PermissionsBits.MOVE_MEMBERS, theirChannel)) continue;

                await RestAPI.patch({
                    url: `/guilds/${guildId}/members/${userId}`,
                    body: { channel_id: newChannelId }
                });
            }
        }
    },
    contextMenus: {
        "user-context": UserContextMenuPatch,
        "guild-context": GuildContextMenuPatch
    }
});
