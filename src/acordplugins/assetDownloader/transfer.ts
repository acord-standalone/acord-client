/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PluginNative } from "@utils/types";
import { CloudUploadPlatform, MessageReferenceType } from "@vencord/discord-types/enums";
import { CloudUploader, Constants, RestAPI, SnowflakeUtils } from "@webpack/common";

import { Asset } from "./filters";
import { logger } from "./store";

const Native = VencordNative.pluginHelpers.AssetDownloader as PluginNative<typeof import("./native")>;

// Discord caps a single message at 10 attachments.
const ATTACHMENTS_PER_MESSAGE = 10;

export interface TransferOutcome {
    completed: number;
    failed: number;
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

// Runs a CloudUploader to completion and resolves with the fields a MESSAGES
// POST needs to attach the freshly uploaded file.
function uploadFile(channelId: string, file: File): Promise<{ filename: string; uploaded_filename: string; }> {
    return new Promise((resolve, reject) => {
        const upload = new CloudUploader({ file, isThumbnail: false, platform: CloudUploadPlatform.WEB }, channelId);
        upload.on("complete", () => resolve({ filename: upload.filename, uploaded_filename: upload.uploadedFilename }));
        upload.on("error", () => reject(new Error("upload failed")));
        upload.upload();
    });
}

async function assetToFile(asset: Asset): Promise<File | null> {
    const res = await Native.fetchAssetBytes(asset.url);
    if (!res.ok || !res.data) {
        logger.warn(`could not fetch ${asset.filename}: ${res.error}`);
        return null;
    }
    return new File([res.data as any], asset.filename, { type: asset.contentType || "application/octet-stream" });
}

// Re-uploads each asset as a brand-new attachment in the target channel, batched
// into messages of up to 10 files.
export async function uploadAssetsToChannel(
    channelId: string,
    assets: Asset[],
    onProgress: (done: number, total: number) => void,
    shouldAbort: () => boolean = () => false,
    concurrency = 4
): Promise<TransferOutcome> {
    const outcome: TransferOutcome = { completed: 0, failed: 0 };
    let done = 0;

    // Each message can hold up to 10 attachments; never fetch/upload more than the
    // user-chosen concurrency at once within a group.
    const perGroup = Math.max(1, Math.min(ATTACHMENTS_PER_MESSAGE, concurrency));

    for (const group of chunk(assets, perGroup)) {
        if (shouldAbort()) break;

        const uploaded: { filename: string; uploaded_filename: string; }[] = [];
        await Promise.all(group.map(async asset => {
            try {
                const file = await assetToFile(asset);
                if (!file) { outcome.failed++; return; }
                uploaded.push(await uploadFile(channelId, file));
            } catch (e) {
                outcome.failed++;
                logger.error("upload threw", e);
            } finally {
                done++;
                onProgress(done, assets.length);
            }
        }));

        if (!uploaded.length) continue;

        try {
            await RestAPI.post({
                url: Constants.Endpoints.MESSAGES(channelId),
                body: {
                    content: "",
                    channel_id: channelId,
                    nonce: SnowflakeUtils.fromTimestamp(Date.now()),
                    type: 0,
                    sticker_ids: [],
                    attachments: uploaded.map((u, i) => ({ id: String(i), filename: u.filename, uploaded_filename: u.uploaded_filename }))
                }
            });
            outcome.completed += uploaded.length;
        } catch (e) {
            outcome.failed += uploaded.length;
            logger.error("failed to post re-uploaded attachments", e);
        }
    }

    return outcome;
}

// Natively forwards the source messages (preserving them as forwards) into the
// target channel. Assets sharing a message are forwarded once.
export async function forwardAssetsToChannel(
    channelId: string,
    assets: Asset[],
    onProgress: (done: number, total: number) => void,
    shouldAbort: () => boolean = () => false
): Promise<TransferOutcome> {
    const outcome: TransferOutcome = { completed: 0, failed: 0 };

    // Dedupe by source message; a forward carries every attachment of that message.
    const messages = new Map<string, Asset>();
    for (const asset of assets) {
        if (!messages.has(asset.messageId)) messages.set(asset.messageId, asset);
    }

    const unique = [...messages.values()];
    let done = 0;

    for (const asset of unique) {
        if (shouldAbort()) break;
        try {
            await RestAPI.post({
                url: Constants.Endpoints.MESSAGES(channelId),
                body: {
                    content: "",
                    channel_id: channelId,
                    nonce: SnowflakeUtils.fromTimestamp(Date.now()),
                    message_reference: {
                        type: MessageReferenceType.FORWARD,
                        channel_id: asset.channelId,
                        message_id: asset.messageId
                    }
                }
            });
            outcome.completed++;
        } catch (e) {
            outcome.failed++;
            logger.error("forward failed", e);
        }
        done++;
        onProgress(done, unique.length);
        // Forwarding is rate-limit sensitive; pace it a little.
        await new Promise(r => setTimeout(r, 300));
    }

    return outcome;
}
