/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { AcordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import type { Channel } from "@vencord/discord-types";
import { Menu, React, showToast, Toasts } from "@webpack/common";

import { openAssetDownloaderModal } from "./AssetDownloaderModal";
import { downloadFollowAsset, pickDirectory } from "./downloader";
import { assetMatchesFilter, emptyFilter, extractAssets } from "./filters";
import { FollowStore } from "./store";
import { forwardAssetsToChannel, uploadAssetsToChannel } from "./transfer";

const noop = () => { };
const noAbort = () => false;

interface ChannelContextProps {
    channel?: Channel;
}

// Text-like guild channels (text, announcement, thread types, forum posts).
const TEXT_CHANNEL_TYPES = [0, 5, 10, 11, 12, 15];

function channelLabel(channel: Channel) {
    if (channel.guild_id) return `#${channel.name}`;
    if (channel.isGroupDM?.()) return channel.name || "Group DM";
    return "this DM";
}

async function toggleFollow(channel: Channel) {
    if (FollowStore.isFollowing(channel.id)) {
        FollowStore.remove(channel.id);
        showToast("Stopped following this channel.", Toasts.Type.SUCCESS);
        return;
    }

    const dir = await pickDirectory();
    if (!dir) return;

    // Inherit any filter the user already set up in the modal for this channel.
    // The quick toggle always uses the simple "save to folder" action; re-upload
    // and forward follows are configured from the modal.
    const filter = FollowStore.get(channel.id)?.filter ?? emptyFilter();
    FollowStore.set({ channelId: channel.id, channelName: channelLabel(channel), action: "download", dir, filter });
    showToast("Now following this channel for new files.", Toasts.Type.SUCCESS);
}

function AssetDownloaderMenu(channel: Channel) {
    const following = FollowStore.isFollowing(channel.id);
    return (
        <Menu.MenuItem
            key="asset-downloader"
            id="asset-downloader"
            label="Asset Downloader"
        >
            <Menu.MenuItem
                key="asset-downloader-open"
                id="asset-downloader-open"
                label="Download Files..."
                action={() => openAssetDownloaderModal(channel)}
            />
            <Menu.MenuCheckboxItem
                key="asset-downloader-follow"
                id="asset-downloader-follow"
                label="Always Follow This Channel"
                checked={following}
                action={() => toggleFollow(channel)}
            />
        </Menu.MenuItem>
    );
}

const DmContextPatch: NavContextMenuPatchCallback = (children, { channel }: ChannelContextProps) => {
    if (!channel?.isPrivate?.()) return;
    children.splice(-1, 0, AssetDownloaderMenu(channel));
};

const ChannelContextPatch: NavContextMenuPatchCallback = (children, { channel }: ChannelContextProps) => {
    if (!channel?.guild_id) return;
    if (!TEXT_CHANNEL_TYPES.includes(channel.type)) return;
    children.splice(-1, 0, AssetDownloaderMenu(channel));
};

export default definePlugin({
    name: "AssetDownloader",
    description: "Right-click a channel, DM or group DM to scan its full history and bulk-download every attachment to a folder, filtered by file type or extension. Can also always-follow a channel to auto-save new files as they arrive.",
    authors: [AcordDevs.TheArmagan],
    contextMenus: {
        "user-context": DmContextPatch,
        "gdm-context": DmContextPatch,
        "channel-context": ChannelContextPatch
    },
    async start() {
        await FollowStore.init();
    },
    flux: {
        async MESSAGE_CREATE({ optimistic, type, message, channelId }: { optimistic: boolean; type: string; message: any; channelId: string; }) {
            if (optimistic || type !== "MESSAGE_CREATE") return;
            const follow = FollowStore.get(channelId ?? message?.channel_id);
            if (!follow) return;

            const assets = extractAssets(message).filter(a => assetMatchesFilter(a, follow.filter));
            if (!assets.length) return;

            // Older follows (and the quick context-menu toggle) have no explicit
            // action, so treat a missing action as a plain folder download.
            switch (follow.action ?? "download") {
                case "upload":
                    if (follow.targetId) void uploadAssetsToChannel(follow.targetId, assets, noop, noAbort);
                    break;
                case "forward":
                    if (follow.targetId) void forwardAssetsToChannel(follow.targetId, assets, noop, noAbort);
                    break;
                default:
                    if (follow.dir) for (const asset of assets) void downloadFollowAsset(follow.dir, asset);
                    break;
            }
        }
    }
});
