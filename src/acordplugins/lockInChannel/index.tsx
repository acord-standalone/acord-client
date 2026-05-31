/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { AcordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import { Channel, VoiceState } from "@vencord/discord-types";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { Menu, React } from "@webpack/common";

interface ChannelContextProps {
    channel: Channel;
}

let lockedChannelId: string | null = null;

const voiceChannelAction = findByPropsLazy("selectVoiceChannel");
const UserStore = findStoreLazy("UserStore");

const ChannelContextMenuPatch: NavContextMenuPatchCallback = (children, { channel }: ChannelContextProps) => {
    if (channel.type !== 2 && channel.type !== 13) return;

    const [checked, setChecked] = React.useState(channel.id === lockedChannelId);

    children.push(
        <Menu.MenuSeparator />,
        <Menu.MenuCheckboxItem
            id="lic-lock-channel"
            label="Lock In Channel"
            checked={checked}
            action={() => {
                if (channel.id === lockedChannelId) {
                    lockedChannelId = null;
                    setChecked(false);
                    return;
                }
                lockedChannelId = channel.id;
                setChecked(true);
            }}
        />
    );
};

export default definePlugin({
    name: "LockInChannel",
    description: "Locks you to a voice channel. Right-click a voice channel to lock yourself in it.",
    authors: [AcordDevs.TheArmagan],
    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            if (!lockedChannelId) return;

            const currentUserId = UserStore.getCurrentUser().id;
            const myState = voiceStates.find(v => v.userId === currentUserId);
            if (!myState) return;

            const newChannelId = myState.channelId ?? null;
            if (newChannelId === lockedChannelId) return;

            voiceChannelAction.selectVoiceChannel(lockedChannelId);
        }
    },
    stop() {
        lockedChannelId = null;
    },
    contextMenus: {
        "channel-context": ChannelContextMenuPatch
    }
});
