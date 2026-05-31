/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { AcordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import { VoiceState } from "@vencord/discord-types";
import { Alerts, ChannelStore, PermissionsBits, PermissionStore, RestAPI, UserStore, VoiceStateStore } from "@webpack/common";

let prevServerMute = false;
let prevServerDeaf = false;

export default definePlugin({
    name: "DontMuteMe",
    description: "Shows a confirmation modal when someone server mutes or deafens you, so you can undo it if you have permission.",
    authors: [AcordDevs.TheArmagan],
    start() {
        const myVoiceState = VoiceStateStore.getVoiceStateForUser(UserStore.getCurrentUser().id);
        prevServerMute = myVoiceState?.mute ?? false;
        prevServerDeaf = myVoiceState?.deaf ?? false;
    },
    stop() {
        prevServerMute = false;
        prevServerDeaf = false;
    },
    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            const currentUserId = UserStore.getCurrentUser().id;
            const myState = voiceStates.find(v => v.userId === currentUserId);
            if (!myState) return;

            const newMute = myState.mute;
            const newDeaf = myState.deaf;
            const { guildId, channelId } = myState;

            const justMuted = newMute && !prevServerMute;
            const justDeafened = newDeaf && !prevServerDeaf;

            prevServerMute = newMute;
            prevServerDeaf = newDeaf;

            if (!justMuted && !justDeafened) return;
            if (!guildId || !channelId) return;

            const channel = ChannelStore.getChannel(channelId);
            if (!channel) return;

            const canUnmute = justMuted && PermissionStore.can(PermissionsBits.MUTE_MEMBERS, channel);
            const canUndeafen = justDeafened && PermissionStore.can(PermissionsBits.DEAFEN_MEMBERS, channel);

            if (!canUnmute && !canUndeafen) return;

            const actions = [
                ...(canUnmute ? ["muted"] : []),
                ...(canUndeafen ? ["deafened"] : [])
            ].join(" and ");

            Alerts.show({
                title: `You've been server ${actions}`,
                body: `Someone ${actions} you in the server. Do you want to undo this?`,
                confirmText: "Yes, undo it",
                cancelText: "No, keep it",
                onConfirm: async () => {
                    const body: Record<string, boolean> = {};
                    if (canUnmute) body.mute = false;
                    if (canUndeafen) body.deaf = false;
                    await RestAPI.patch({
                        url: `/guilds/${guildId}/members/@me`,
                        body
                    });
                }
            });
        }
    }
});
