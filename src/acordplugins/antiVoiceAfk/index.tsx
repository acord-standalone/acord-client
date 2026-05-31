/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { AcordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import type { VoiceState } from "@vencord/discord-types";
import { ChannelActions, GuildStore, UserStore } from "@webpack/common";

/** userId -> last non-AFK channelId */
const lastChannel: Record<string, string> = {};

export default definePlugin({
    name: "AntiVoiceAfk",
    description: "Automatically moves you back to your previous voice channel when Discord moves you to the AFK channel.",
    authors: [AcordDevs.TheArmagan],
    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            const myId = UserStore.getCurrentUser()?.id;
            if (!myId) return;

            for (const state of voiceStates) {
                if (state.userId !== myId) continue;

                const newChannelId = state.channelId ?? null;
                const guildId = state.guildId ?? null;

                if (!newChannelId || !guildId) {
                    // Left voice entirely — clear stored channel
                    delete lastChannel[myId];
                    break;
                }

                const guild = GuildStore.getGuild(guildId);
                const afkChannelId = guild?.afkChannelId ?? null;

                if (afkChannelId && newChannelId === afkChannelId) {
                    // We got moved to AFK channel — go back
                    const prev = lastChannel[myId];
                    if (prev && prev !== afkChannelId) {
                        ChannelActions.selectVoiceChannel(prev);
                    }
                } else {
                    // Normal channel — remember it
                    lastChannel[myId] = newChannelId;
                }
                break;
            }
        }
    },
    stop() {
        const myId = UserStore.getCurrentUser()?.id;
        if (myId) delete lastChannel[myId];
    }
});
