/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { AcordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import type { Channel, Message } from "@vencord/discord-types";
import { Menu, React } from "@webpack/common";

import { openFakeMessageModal } from "./FakeMessageModal";
import { deleteFakeMessage, isFakeMessage, reinjectFakeMessages } from "./utils";

interface ChannelContextProps {
    channel?: Channel;
}

interface MessageContextProps {
    message?: Message;
}

const FakeMessageItem = (channel: Channel) => (
    <Menu.MenuItem
        key="fake-message"
        id="fake-message"
        label="Fake Message"
        action={() => openFakeMessageModal(channel)}
    />
);

// DMs and group DMs: right-clicking the DM in the sidebar fires "user-context".
const DmContextPatch: NavContextMenuPatchCallback = (children, { channel }: ChannelContextProps) => {
    if (!channel?.isPrivate?.()) return;
    children.splice(-1, 0, FakeMessageItem(channel));
};

// Guild channels: right-clicking a channel fires "channel-context".
const ChannelContextPatch: NavContextMenuPatchCallback = (children, { channel }: ChannelContextProps) => {
    if (!channel?.guild_id) return;
    // text-like channels only (text, announcement, thread types, forum posts)
    if (![0, 5, 10, 11, 12, 15].includes(channel.type)) return;
    children.splice(-1, 0, FakeMessageItem(channel));
};

// Always let us remove our own fake messages, even though Discord won't show a
// real delete option (they look like they belong to someone else).
const MessageContextPatch: NavContextMenuPatchCallback = (children, { message }: MessageContextProps) => {
    if (!message || !isFakeMessage(message.id)) return;

    const deleteItem = (
        <Menu.MenuItem
            key="fake-message-delete"
            id="fake-message-delete"
            label="Delete Fake Message"
            color="danger"
            action={() => deleteFakeMessage(message.channel_id, message.id)}
        />
    );

    const deleteGroup = findGroupChildrenByChildId("delete", children);
    if (deleteGroup) {
        deleteGroup.push(deleteItem);
    } else {
        children.push(<Menu.MenuSeparator />, deleteItem);
    }
};

export default definePlugin({
    name: "FakeMessages",
    description: "Locally fake a message (with content and attachments) from another user. Right-click a DM to fake it from the other person, or a server channel to pick anyone from the member cache. Nothing is actually sent.",
    authors: [AcordDevs.TheArmagan],
    contextMenus: {
        "user-context": DmContextPatch,
        "gdm-context": DmContextPatch,
        "channel-context": ChannelContextPatch,
        "message": MessageContextPatch
    },
    flux: {
        // When Discord refetches a channel's history it overwrites the store and
        // drops our local-only messages. Re-add them once the dispatch settles
        // (receiveMessage can't run inside the active dispatch).
        LOAD_MESSAGES_SUCCESS({ channelId }: { channelId: string; }) {
            setTimeout(() => reinjectFakeMessages(channelId), 0);
        }
    }
});
