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
import { deleteFakeMessage, isFakeMessage, reAddFakeMessages } from "./utils";

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
    description: "Locally fake a message (with content and attachments) from another user. Right-click a DM to fake it from the other person (or yourself), or a server channel to pick anyone from the member cache. Nothing is actually sent.",
    authors: [AcordDevs.TheArmagan],
    contextMenus: {
        "user-context": DmContextPatch,
        "gdm-context": DmContextPatch,
        "channel-context": ChannelContextPatch,
        "message": MessageContextPatch
    },
    patches: [
        // When Discord refetches a channel's history (LOAD_MESSAGES_SUCCESS) it
        // rebuilds the store from the fetched array, dropping our local fakes.
        // Splice them back into that array so they keep their chronological spot
        // instead of being forced to the bottom by a MESSAGE_CREATE re-add.
        {
            find: "_tryFetchMessagesCached",
            replacement: {
                match: /(?<=type:"LOAD_MESSAGES_SUCCESS",.{0,100})messages:(\i)/,
                replace: "get messages(){return $self.reAddFakeMessages($1,this);}"
            }
        }
    ],
    reAddFakeMessages
});
