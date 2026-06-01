/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { AcordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Channel, VoiceState } from "@vencord/discord-types";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { ChannelStore, Menu, PermissionsBits, PermissionStore, React } from "@webpack/common";

interface ChannelContextProps {
    channel: Channel;
}

let targetChannelId: string | null = null;

const voiceChannelAction = findByPropsLazy("selectVoiceChannel");
const VoiceStateStore = findStoreLazy("VoiceStateStore");
const UserStore = findStoreLazy("UserStore");

const ChannelContextMenuPatch: NavContextMenuPatchCallback = (children, { channel }: ChannelContextProps) => {
    // voice (2) and stage (13) channels only — there's nothing to "join" elsewhere
    if (!channel || (channel.type !== 2 && channel.type !== 13)) return;

    const [checked, setChecked] = React.useState(channel.id === targetChannelId);

    children.push(
        <Menu.MenuSeparator />,
        <Menu.MenuCheckboxItem
            id="jwf-select-channel"
            label="Join When Free"
            checked={checked}
            action={() => {
                if (channel.id === targetChannelId) {
                    targetChannelId = null;
                    setChecked(false);
                    return;
                }

                targetChannelId = channel.id;
                setChecked(true);
            }}
        ></Menu.MenuCheckboxItem>
    );
};

const settings = definePluginSettings({
    autoDisable: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Automatically disable the plugin when you successfully joined to channel."
    }
});

export default definePlugin({
    name: "JoinWhenFree",
    description: "Allows you to join a voice channel when there is a free slot.",
    authors: [AcordDevs.TheArmagan],
    settings,
    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            if (!targetChannelId) return;

            voiceStates.forEach(async voiceState => {
                const channelId = voiceState.channelId || voiceState.oldChannelId;
                if (channelId !== targetChannelId || voiceState.userId === UserStore.getCurrentUser().id) return;

                const channel = ChannelStore.getChannel(channelId);
                const hasPermission = PermissionStore.can(PermissionsBits.CONNECT, channel) && PermissionStore.can(PermissionsBits.VIEW_CHANNEL, channel);
                if (!hasPermission) return;

                const userLimit = channel.userLimit || 0;
                const channelMemberCount = Object.keys(VoiceStateStore.getVoiceStatesForChannel(channelId)).length;

                if (userLimit === 0 || channelMemberCount < userLimit) {
                    voiceChannelAction.selectVoiceChannel(channelId);
                    if (settings.store.autoDisable) targetChannelId = null;
                }
            });
        }
    },
    contextMenus: {
        "channel-context": ChannelContextMenuPatch
    }
});
