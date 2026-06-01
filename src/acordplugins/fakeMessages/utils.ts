/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { generateId, sendBotMessage } from "@api/Commands";
import type { Message, MessageAttachment, User } from "@vencord/discord-types";
import { FluxDispatcher, SnowflakeUtils } from "@webpack/common";

/**
 * Raw-ish message JSON for every fake message we've injected, keyed by channel.
 * We keep the raw shape (not the store record) so we can splice it back into the
 * array Discord builds on LOAD_MESSAGES_SUCCESS, landing it at the right
 * chronological position instead of being forced to the bottom by MESSAGE_CREATE.
 */
const fakeMessagesByChannel = new Map<string, Map<string, any>>();

export function isFakeMessage(id: string) {
    for (const messages of fakeMessagesByChannel.values())
        if (messages.has(id)) return true;
    return false;
}

/** Snapshot of the fake messages tracked for a channel (used by the fetch patch). */
export function getFakeMessages(channelId: string): any[] {
    const messages = fakeMessagesByChannel.get(channelId);
    return messages ? [...messages.values()] : [];
}

function track(channelId: string, raw: any) {
    let messages = fakeMessagesByChannel.get(channelId);
    if (!messages) fakeMessagesByChannel.set(channelId, messages = new Map());
    messages.set(raw.id, raw);
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

/** Builds the raw author json the message record expects from a store user. */
function toRawUser(user: User): any {
    return {
        id: user.id,
        username: user.username,
        global_name: (user as any).globalName ?? null,
        avatar: user.avatar ?? null,
        avatar_decoration_data: (user as any).avatarDecorationData ?? null,
        discriminator: user.discriminator ?? "0",
        bot: !!user.bot,
        public_flags: (user as any).publicFlags ?? 0,
    };
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
    // sendBotMessage shows it immediately and assigns a real snowflake id.
    const message = sendBotMessage(channelId, {
        author,
        content,
        attachments,
        // 0 overrides the EPHEMERAL flag the bot-message helper sets, so there's
        // no "only you can see this" notice and it reads as a normal message
        // @ts-ignore
        flags: 0,
    });

    if (message?.id) {
        // Keep a raw copy keyed to the same id/timestamp so the fetch patch can
        // re-insert it in chronological order after a channel refetch.
        track(channelId, {
            id: message.id,
            type: 0,
            channel_id: channelId,
            author: toRawUser(author),
            content,
            timestamp: new Date(SnowflakeUtils.extractTimestamp(message.id)).toISOString(),
            edited_timestamp: null,
            tts: false,
            mention_everyone: false,
            mentions: [],
            mention_roles: [],
            attachments,
            embeds: [],
            reactions: [],
            pinned: false,
            flags: 0,
        });
    }

    return message;
}

/**
 * Splices the channel's tracked fake messages into the freshly fetched `messages`
 * array (newest-first, as Discord delivers it) so they keep their chronological
 * spot. Only adds a fake if its timestamp falls inside the fetched window, or if
 * it's newer than everything and this is the latest page of the channel.
 */
export function reAddFakeMessages(messages: any[], action: any): any[] {
    try {
        const channelId = action?.channelId;
        const fakes = channelId ? getFakeMessages(channelId) : [];
        if (!fakes.length || !Array.isArray(messages) || !messages.length) return messages;

        const existing = new Set(messages.map(m => m.id));
        const firstTime = SnowflakeUtils.extractTimestamp(messages[0].id);
        const lastTime = SnowflakeUtils.extractTimestamp(messages[messages.length - 1].id);
        const descending = messages.length < 2 || firstTime >= lastTime;
        const newest = Math.max(firstTime, lastTime);
        const oldest = Math.min(firstTime, lastTime);
        // latest page of the channel is loaded (nothing newer to fetch)
        const atChannelEnd = !action.hasMoreAfter && !action.isBefore;

        let added = false;
        for (const fake of fakes) {
            if (existing.has(fake.id)) continue;
            const time = SnowflakeUtils.extractTimestamp(fake.id);
            if ((time >= oldest && time <= newest) || (time > newest && atChannelEnd)) {
                messages.push(fake);
                existing.add(fake.id);
                added = true;
            }
        }

        if (added) {
            messages.sort((a, b) => {
                const ta = SnowflakeUtils.extractTimestamp(a.id);
                const tb = SnowflakeUtils.extractTimestamp(b.id);
                return descending ? tb - ta : ta - tb;
            });
        }
    } catch (e) {
        console.error("[FakeMessages] failed to re-add fake messages", e);
    }
    return messages;
}
