/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { AcordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import type { Channel, Guild } from "@vencord/discord-types";
import { Menu, React } from "@webpack/common";

import { mountLockScreen, unmountLockScreen } from "./LockScreen";
import { openRemoveLockModal, openSetLockModal } from "./PasswordModal";
import { settings } from "./settings";
import { initLocks, isLocked } from "./store";

interface ChannelContextProps {
    channel?: Channel;
}

const TEXT_CHANNEL_TYPES = [0, 5, 10, 11, 12, 15];

function channelName(channel: Channel) {
    if (channel.guild_id) return `#${channel.name}`;
    if (channel.isGroupDM()) return channel.name || "this group";
    return "this DM";
}

const LockMenuItem = (channel: Channel) => {
    const locked = isLocked(channel.id);
    const name = channelName(channel);
    return (
        <Menu.MenuItem
            key="vc-smartlock"
            id="vc-smartlock"
            label={locked ? "Remove Lock" : "Lock Channel"}
            color={locked ? "danger" : undefined}
            action={() => locked ? openRemoveLockModal(channel.id, name) : openSetLockModal(channel.id, name)}
        />
    );
};

const GuildLockMenuItem = (guild: Guild) => {
    const locked = isLocked(guild.id);
    return (
        <Menu.MenuItem
            key="vc-smartlock"
            id="vc-smartlock"
            label={locked ? "Remove Lock" : "Lock Server"}
            color={locked ? "danger" : undefined}
            action={() => locked ? openRemoveLockModal(guild.id, guild.name) : openSetLockModal(guild.id, guild.name)}
        />
    );
};

// DMs and group DMs are right-clicked from the sidebar.
const DmContextPatch: NavContextMenuPatchCallback = (children, { channel }: ChannelContextProps) => {
    if (!channel?.isPrivate?.()) return;
    children.splice(-1, 0, LockMenuItem(channel));
};

const ChannelContextPatch: NavContextMenuPatchCallback = (children, { channel }: ChannelContextProps) => {
    if (!channel?.guild_id || !TEXT_CHANNEL_TYPES.includes(channel.type)) return;
    children.splice(-1, 0, LockMenuItem(channel));
};

const GuildContextPatch: NavContextMenuPatchCallback = (children, { guild }: { guild?: Guild; }) => {
    if (!guild) return;
    children.splice(-1, 0, GuildLockMenuItem(guild));
};

export default definePlugin({
    name: "SmartLock",
    description: "Password-protect individual channels/servers. Right-click a channel to lock it, then enter the password whenever you open it. Reset all passwords from the plugin settings.",
    authors: [AcordDevs.TheArmagan],
    settings,
    contextMenus: {
        "user-context": DmContextPatch,
        "gdm-context": DmContextPatch,
        "channel-context": ChannelContextPatch,
        "guild-context": GuildContextPatch,
    },
    async start() {
        await initLocks();
        mountLockScreen();
    },

    stop() {
        unmountLockScreen();
    },
});
