/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { AcordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import type { User, VoiceState } from "@vencord/discord-types";
import { ChannelStore, Menu, PermissionsBits, PermissionStore, React, RestAPI, UserStore, VoiceStateStore } from "@webpack/common";

interface UserContextProps {
    user: User;
    guildId?: string;
}

/**
 * guildId -> Set<userId> — users we are actively mute-fighting.
 * When their server mute drops to false we immediately re-mute them.
 * When our server mute is raised we immediately unmute ourselves.
 */
const fightTargets: Record<string, Set<string>> = {};

function isFighting(guildId: string, userId: string) {
    return fightTargets[guildId]?.has(userId) ?? false;
}

function toggleFight(guildId: string, userId: string): boolean {
    if (!fightTargets[guildId]) fightTargets[guildId] = new Set();
    const set = fightTargets[guildId];
    if (set.has(userId)) { set.delete(userId); return false; }
    set.add(userId);
    return true;
}

function hasFights(guildId: string) {
    return (fightTargets[guildId]?.size ?? 0) > 0;
}

// Track last known server-mute state so we can detect transitions
const lastMuteState: Record<string, boolean> = {}; // userId -> mute

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user, guildId }: UserContextProps) => {
    if (!user || !guildId) return;
    const myId = UserStore.getCurrentUser()?.id;
    if (!myId || user.id === myId) return;

    // Need a fake channel-like object with guild_id to check MUTE_MEMBERS.
    // PermissionStore.canWithPartialContext works per guild member permissions.
    // Use a simple guild-level check: check if the user has MUTE_MEMBERS in any channel of this guild
    // — simplest approach: check using the guild id directly via getGuildPermissions.
    // Actually, the most reliable way here is to check via a voice state channel if available,
    // otherwise fall through and show the button when MUTE_MEMBERS is held at guild level.
    const voiceState = VoiceStateStore.getVoiceStateForUser(user.id) as VoiceState | null;
    if (!voiceState?.channelId) return; // target must be in voice for mute to do anything

    const channel = ChannelStore.getChannel(voiceState.channelId);
    if (!channel) return;

    if (!PermissionStore.can(PermissionsBits.MUTE_MEMBERS, channel)) return;

    const [fighting, setFighting] = React.useState(isFighting(guildId, user.id));

    children.push(
        <Menu.MenuSeparator />,
        <Menu.MenuCheckboxItem
            id="gmf-mute-fight"
            label="Mute Fight"
            checked={fighting}
            action={() => {
                const next = toggleFight(guildId, user.id);
                setFighting(next);
                // Immediately mute the target if activating the fight
                if (next) {
                    RestAPI.patch({
                        url: `/guilds/${guildId}/members/${user.id}`,
                        body: { mute: true }
                    }).catch(() => { });
                }
            }}
        />
    );
};

export default definePlugin({
    name: "GuildMuteFight",
    description: "Keeps a target server-muted: re-mutes them the moment they unmute, and unmutes you if someone server-mutes you.",
    authors: [AcordDevs.TheArmagan],
    flux: {
        async VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            const myId = UserStore.getCurrentUser()?.id;
            if (!myId) return;

            for (const state of voiceStates) {
                const { userId, guildId, mute } = state as VoiceState & { mute: boolean; };
                if (!guildId) continue;

                const serverMute = mute ?? false;
                const prev = lastMuteState[userId] ?? false;
                lastMuteState[userId] = serverMute;

                // === Their side: they unmuted themselves → re-mute ===
                if (userId !== myId && prev === true && serverMute === false) {
                    if (hasFights(guildId) && isFighting(guildId, userId)) {
                        await RestAPI.patch({
                            url: `/guilds/${guildId}/members/${userId}`,
                            body: { mute: true }
                        }).catch(() => { });
                    }
                }

                // === Our side: someone server-muted us → unmute ourselves ===
                if (userId === myId && prev === false && serverMute === true) {
                    // Check if we are fighting anyone in this guild (implies this is an active fight)
                    if (hasFights(guildId)) {
                        await RestAPI.patch({
                            url: `/guilds/${guildId}/members/${myId}`,
                            body: { mute: false }
                        }).catch(() => { });
                    }
                }
            }
        }
    },
    stop() {
        for (const guildId of Object.keys(fightTargets)) delete fightTargets[guildId];
        for (const userId of Object.keys(lastMuteState)) delete lastMuteState[userId];
    },
    contextMenus: {
        "user-context": UserContextMenuPatch
    }
});
