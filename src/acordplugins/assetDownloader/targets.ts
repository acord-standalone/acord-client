/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Channel } from "@vencord/discord-types";
import { ChannelStore, GuildChannelStore, GuildStore, UserStore } from "@webpack/common";

export interface ChannelTarget {
    value: string;
    label: string;
    group: string;
}

function dmLabel(channel: Channel): string {
    if (channel.isGroupDM?.()) return channel.name || "Group DM";
    const otherId = channel.getRecipientId?.() ?? channel.recipients?.[0];
    const user = otherId ? UserStore.getUser(otherId) : undefined;
    return user ? `@${user.globalName ?? user.username}` : "Direct Message";
}

// Builds the list of channels the user can send to: their DMs/group DMs plus
// every selectable text channel across the guilds they're in. Used to populate
// the re-upload / forward target picker.
export function buildChannelTargets(): ChannelTarget[] {
    const targets: ChannelTarget[] = [];

    for (const channel of ChannelStore.getSortedPrivateChannels()) {
        targets.push({ value: channel.id, label: dmLabel(channel), group: "Direct Messages" });
    }

    const guilds = Object.values(GuildStore.getGuilds());
    for (const guild of guilds) {
        const selectable = GuildChannelStore.getChannels(guild.id)?.SELECTABLE ?? [];
        for (const entry of selectable) {
            const channel = (entry as any).channel ?? entry;
            if (!channel?.id) continue;
            targets.push({
                value: channel.id,
                label: `${guild.name} › #${channel.name}`,
                group: guild.name
            });
        }
    }

    return targets;
}

export function targetLabel(channelId: string): string {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return "channel";
    if (channel.guild_id) {
        const guild = GuildStore.getGuild(channel.guild_id);
        return `${guild?.name ?? "server"} › #${channel.name}`;
    }
    return dmLabel(channel);
}
