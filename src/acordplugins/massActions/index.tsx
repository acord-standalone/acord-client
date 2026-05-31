/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { AcordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import type { Channel } from "@vencord/discord-types";
import { Alerts, ChannelActions, GuildChannelStore, Menu, PermissionsBits, PermissionStore, React, RestAPI, UserStore, VoiceStateStore } from "@webpack/common";

import { openAdvancedModal, openDistributeModal } from "./AdvancedModal";

interface VoiceChannelContextProps {
    channel: Channel;
}

async function applyToAll(channel: Channel, body: Record<string, unknown>, includeSelf = false) {
    const states = Object.values(VoiceStateStore.getVoiceStatesForChannel(channel.id));
    const myId = UserStore.getCurrentUser().id;
    for (const state of states) {
        if (!includeSelf && state.userId === myId) continue;
        await RestAPI.patch({
            url: `/guilds/${channel.guild_id}/members/${state.userId}`,
            body
        });
    }
}

const ChannelContextPatch: NavContextMenuPatchCallback = (children, { channel }: VoiceChannelContextProps) => {
    if (!channel) return;

    // Category: show random join options for users who can CONNECT to at least one channel inside
    if (channel.type === 4) {
        const guildChannels: { VOCAL: { channel: Channel; }[]; } = GuildChannelStore.getChannels(channel.guild_id);
        const joinable = guildChannels.VOCAL?.map(({ channel: c }) => c)
            .filter(c => c.parent_id === channel.id && PermissionStore.can(PermissionsBits.CONNECT, c)) ?? [];
        if (joinable.length === 0) return;

        const pickRandom = (arr: Channel[]) => ChannelActions.selectVoiceChannel(arr[Math.floor(Math.random() * arr.length)].id);

        const occupied = joinable.filter(c => Object.keys(VoiceStateStore.getVoiceStatesForChannel(c.id)).length > 0);
        const empty = joinable.filter(c => Object.keys(VoiceStateStore.getVoiceStatesForChannel(c.id)).length === 0);

        const items: React.ReactNode[] = [
            <Menu.MenuItem
                key="mass-actions-join-random"
                id="mass-actions-join-random"
                label="Join random channel"
                action={() => pickRandom(joinable)}
            />,
        ];

        if (occupied.length > 0) {
            items.push(
                <Menu.MenuItem
                    key="mass-actions-join-random-occupied"
                    id="mass-actions-join-random-occupied"
                    label="Join random occupied channel"
                    action={() => pickRandom(occupied)}
                />
            );
        }

        if (empty.length > 0) {
            items.push(
                <Menu.MenuItem
                    key="mass-actions-join-random-empty"
                    id="mass-actions-join-random-empty"
                    label="Join random empty channel"
                    action={() => pickRandom(empty)}
                />
            );
        }

        children.splice(-1, 0,
            <Menu.MenuItem key="mass-actions-category" id="mass-actions-category" label="Mass Actions">
                {items}
            </Menu.MenuItem>
        );
        return;
    }

    if (channel.type !== 2 && channel.type !== 13) return;

    const voiceStates = VoiceStateStore.getVoiceStatesForChannel(channel.id);
    if (Object.keys(voiceStates).length === 0) return;

    const canMute = PermissionStore.can(PermissionsBits.MUTE_MEMBERS, channel);
    const canDeafen = PermissionStore.can(PermissionsBits.DEAFEN_MEMBERS, channel);
    const canMove = PermissionStore.can(PermissionsBits.MOVE_MEMBERS, channel);

    if (!canMute && !canDeafen && !canMove) return;

    const guildChannels: { VOCAL: { channel: Channel; }[]; } = GuildChannelStore.getChannels(channel.guild_id);
    const voiceChannels = guildChannels.VOCAL?.map(({ channel: c }) => c).filter(c => c.id !== channel.id) ?? [];

    const items: React.ReactNode[] = [];

    if (canMute) {
        items.push(
            <Menu.MenuItem
                key="mass-actions-mute-all"
                id="mass-actions-mute-all"
                label="Mute all"
                action={() => applyToAll(channel, { mute: true })}
            />,
            <Menu.MenuItem
                key="mass-actions-unmute-all"
                id="mass-actions-unmute-all"
                label="Unmute all"
                action={() => applyToAll(channel, { mute: false })}
            />
        );
    }

    if (canDeafen) {
        items.push(
            <Menu.MenuItem
                key="mass-actions-deafen-all"
                id="mass-actions-deafen-all"
                label="Deafen all"
                action={() => applyToAll(channel, { deaf: true })}
            />,
            <Menu.MenuItem
                key="mass-actions-undeafen-all"
                id="mass-actions-undeafen-all"
                label="Undeafen all"
                action={() => applyToAll(channel, { deaf: false })}
            />
        );
    }

    if (canMute && canDeafen) {
        items.push(
            <Menu.MenuItem
                key="mass-actions-mute-deafen-all"
                id="mass-actions-mute-deafen-all"
                label="Mute & Deafen all"
                action={() => applyToAll(channel, { mute: true, deaf: true })}
            />
        );
    }

    if (canMute || canDeafen) {
        items.push(
            <Menu.MenuItem
                key="mass-actions-advanced"
                id="mass-actions-advanced"
                label="Advanced mute/deafen..."
                action={() => openAdvancedModal(channel)}
            />
        );
    }

    if (canMove && voiceChannels.length > 0) {
        items.push(
            <Menu.MenuItem
                key="mass-actions-move-all"
                id="mass-actions-move-all"
                label="Move all to"
            >
                {voiceChannels.map(vc => (
                    <Menu.MenuItem
                        key={vc.id}
                        id={`mass-actions-move-${vc.id}`}
                        label={vc.name}
                        action={() => applyToAll(channel, { channel_id: vc.id }, true)}
                    />
                ))}
            </Menu.MenuItem>
        );
    }

    if (canMove) {
        items.push(
            <Menu.MenuItem
                key="mass-actions-distribute"
                id="mass-actions-distribute"
                label="Distribute to category..."
                action={() => openDistributeModal(channel)}
            />
        );

        const states = Object.values(VoiceStateStore.getVoiceStatesForChannel(channel.id));
        const myId = UserStore.getCurrentUser().id;
        const others = states.filter(s => s.userId !== myId);
        if (others.length > 0) {
            items.push(
                <Menu.MenuItem
                    key="mass-actions-disconnect-all"
                    id="mass-actions-disconnect-all"
                    label="Disconnect all"
                    color="danger"
                    action={() => {
                        Alerts.show({
                            title: "Disconnect all users?",
                            body: `This will disconnect ${others.length} user${others.length !== 1 ? "s" : ""} from ${channel.name}.`,
                            confirmText: "Disconnect",
                            confirmColor: "vc-text-danger",
                            cancelText: "Cancel",
                            onConfirm: async () => {
                                for (const s of others) {
                                    await RestAPI.patch({
                                        url: `/guilds/${channel.guild_id}/members/${s.userId}`,
                                        body: { channel_id: null }
                                    }).catch(() => { });
                                }
                            }
                        });
                    }}
                />
            );
        }
    }

    if (items.length === 0) return;

    children.splice(
        -1,
        0,
        <Menu.MenuItem
            key="mass-actions"
            id="mass-actions"
            label="Mass Actions"
        >
            {items}
        </Menu.MenuItem>
    );
};

export default definePlugin({
    name: "MassActions",
    description: "Adds mass voice actions to voice channel context menus. Mute, deafen, or move all users at once.",
    authors: [AcordDevs.TheArmagan],
    contextMenus: {
        "channel-context": ChannelContextPatch
    }
});
