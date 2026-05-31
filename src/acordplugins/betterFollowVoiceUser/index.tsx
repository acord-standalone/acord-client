/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { AcordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Channel, User, VoiceState } from "@vencord/discord-types";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { Menu, React } from "@webpack/common";

type TFollowedUserInfo = {
    lastChannelId: string | null;
    userId: string;
} | null;

interface UserContextProps {
    channel: Channel;
    user: User;
    guildId?: string;
}

let followedUserInfo: TFollowedUserInfo = null;
let actionTimeout: number | undefined;

const voiceChannelAction = findByPropsLazy("selectVoiceChannel");
const VoiceStateStore = findStoreLazy("VoiceStateStore");
const UserStore = findStoreLazy("UserStore");

function clearActionTimeout() {
    if (actionTimeout === undefined) return;

    clearTimeout(actionTimeout);
    actionTimeout = undefined;
}

function scheduleVoiceChannelAction(channelId: string | null) {
    clearActionTimeout();

    const currentChannelId = VoiceStateStore.getVoiceStateForUser(UserStore.getCurrentUser().id)?.channelId ?? null;
    if (currentChannelId === channelId) return;

    if (settings.store.actionDelay === 0) {
        voiceChannelAction.selectVoiceChannel(channelId);
        return;
    }

    actionTimeout = window.setTimeout(() => {
        actionTimeout = undefined;

        const nextChannelId = VoiceStateStore.getVoiceStateForUser(UserStore.getCurrentUser().id)?.channelId ?? null;
        if (nextChannelId === channelId) return;

        voiceChannelAction.selectVoiceChannel(channelId);
    }, settings.store.actionDelay);
}

const settings = definePluginSettings({
    onlyWhenInVoice: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Only follow the user when you are in a voice channel"
    },
    leaveWhenUserLeaves: {
        type: OptionType.BOOLEAN,
        default: false,
        description: "Leave the voice channel when the user leaves."
    },
    actionDelay: {
        type: OptionType.SLIDER,
        default: 0,
        markers: [0, 100, 250, 500, 1000, 2000],
        description: "Delay before following the user (in ms).",
        min: 0,
        max: 2000,
        step: 10
    }
});

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { channel, user }: UserContextProps) => {
    if (UserStore.getCurrentUser().id === user.id) return;
    if (children.some((c: any) => c?.props?.id === "fvu-follow-user")) return;

    const [checked, setChecked] = React.useState(followedUserInfo?.userId === user.id);

    children.push(
        <Menu.MenuSeparator />,
        <Menu.MenuCheckboxItem
            id="fvu-follow-user"
            label="Follow User"
            checked={checked}
            action={() => {
                if (followedUserInfo?.userId === user.id) {
                    followedUserInfo = null;
                    setChecked(false);
                    return;
                }

                followedUserInfo = {
                    lastChannelId: VoiceStateStore.getVoiceStateForUser(UserStore.getCurrentUser().id)?.channelId ?? null,
                    userId: user.id
                };
                setChecked(true);
            }}
        ></Menu.MenuCheckboxItem>
    );
};

export default definePlugin({
    name: "BetterFollowVoiceUser",
    description: "Follow a user in voice chat.",
    authors: [AcordDevs.TheArmagan],
    settings,
    flux: {
        async VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            if (!followedUserInfo) return;

            const currentUserId = UserStore.getCurrentUser().id;
            const currentVoiceState = VoiceStateStore.getVoiceStateForUser(currentUserId);

            if (
                settings.store.onlyWhenInVoice
                && !currentVoiceState
            ) return;

            const followedVoiceState = [...voiceStates].reverse().find(voiceState => voiceState.userId === followedUserInfo?.userId);
            if (!followedVoiceState) return;

            const nextChannelId = followedVoiceState.channelId ?? null;
            if (nextChannelId === followedUserInfo.lastChannelId) return;

            followedUserInfo.lastChannelId = nextChannelId;

            if (!nextChannelId && !settings.store.leaveWhenUserLeaves) {
                clearActionTimeout();
                return;
            }

            scheduleVoiceChannelAction(nextChannelId);
        }
    },
    stop() {
        clearActionTimeout();
        followedUserInfo = null;
    },
    contextMenus: {
        "user-context": UserContextMenuPatch
    }
});
