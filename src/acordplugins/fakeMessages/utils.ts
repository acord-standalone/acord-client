/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { generateId, sendBotMessage } from "@api/Commands";
import type { Message, MessageAttachment, User } from "@vencord/discord-types";
import { FluxDispatcher, MessageActions, MessageStore } from "@webpack/common";

/**
 * The merged message object we handed to the store, kept per channel so we can
 * re-add it whenever Discord refetches that channel (which would otherwise wipe
 * these local-only messages from the store).
 */
const fakeMessagesByChannel = new Map<string, Map<string, Message>>();

export function isFakeMessage(id: string) {
    for (const messages of fakeMessagesByChannel.values())
        if (messages.has(id)) return true;
    return false;
}

function track(channelId: string, message: Message) {
    let messages = fakeMessagesByChannel.get(channelId);
    if (!messages) fakeMessagesByChannel.set(channelId, messages = new Map());
    messages.set(message.id, message);
}

/** Locally removes a fake message from its channel and stops re-adding it. */
export function deleteFakeMessage(channelId: string, id: string) {
    fakeMessagesByChannel.get(channelId)?.delete(id);
    FluxDispatcher.dispatch({
        type: "MESSAGE_DELETE",
        channelId,
        id,
        mlDeleted: true,
    });
}

/**
 * Re-adds any tracked fake messages that aren't in the store for this channel.
 * Called after Discord fetches a channel's history (LOAD_MESSAGES_SUCCESS),
 * which replaces the store's messages and would otherwise drop our fakes.
 *
 * Must run outside the active Flux dispatch, since receiveMessage dispatches.
 */
export function reinjectFakeMessages(channelId: string) {
    const messages = fakeMessagesByChannel.get(channelId);
    if (!messages?.size) return;

    for (const message of messages.values()) {
        // skip anything still present, so we don't needlessly re-flag it
        if (MessageStore.getMessage(channelId, message.id)) continue;
        MessageActions.receiveMessage(channelId, message);
    }
}

export interface FakeFile {
    /** Local key used to track the file in the modal list. */
    key: string;
    file: File;
    spoiler: boolean;
}

const getImageBox = (url: string): Promise<{ width: number; height: number; } | null> =>
    new Promise(res => {
        const img = new Image();
        img.onload = () => res({ width: img.width, height: img.height });
        img.onerror = () => res(null);
        img.src = url;
    });

/**
 * Turns the files picked in the modal into fake message attachments that render
 * locally (object URLs), mimicking what Discord would build for a real upload.
 */
export async function buildAttachments(files: FakeFile[]): Promise<MessageAttachment[]> {
    return Promise.all(
        files.map(async ({ file, spoiler }) => {
            const isImage = file.type.startsWith("image/");
            const url = URL.createObjectURL(file);

            const attachment: MessageAttachment = {
                id: generateId(),
                filename: spoiler ? "SPOILER_" + file.name : file.name,
                // giving the real content type breaks the local preview, mirror PreviewMessage
                content_type: isImage ? undefined : (file.type || undefined),
                size: file.size,
                spoiler,
                // discord strips our object url's hash params, so anchor it with #
                url: url + "#",
                proxy_url: url + "#",
            };

            if (isImage) {
                const box = await getImageBox(url);
                if (box) {
                    attachment.width = box.width;
                    attachment.height = box.height;
                }
            }

            return attachment;
        })
    );
}

/**
 * Locally injects a message that looks like it was sent by `author` in `channelId`.
 * Nothing is actually sent to Discord; the message only exists on this client until reload.
 */
export function sendFakeMessage(
    channelId: string,
    author: User,
    content: string,
    attachments: MessageAttachment[]
): Message {
    const message = sendBotMessage(channelId, {
        author,
        content,
        attachments,
        // 0 overrides the EPHEMERAL flag the bot-message helper sets, so there's
        // no "only you can see this" notice and it reads as a normal message
        // @ts-ignore
        flags: 0,
    });

    if (message?.id) track(channelId, message);
    return message;
}
