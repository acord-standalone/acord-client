/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// A single downloadable asset extracted from a message.
export interface Asset {
    id: string;
    filename: string;
    url: string;
    size: number;
    contentType?: string;
    messageId: string;
    channelId: string;
}

// Filters are saved per-channel, so each channel can track a different set of
// file types. An empty filter (no categories, no extensions) matches everything.
export interface FilterConfig {
    categories: string[];
    extensions: string[];
}

export interface FilterCategory {
    id: string;
    label: string;
    extensions: string[];
}

// Ready-made categories offered in the UI. Extensions are stored without a dot.
export const FILTER_CATEGORIES: FilterCategory[] = [
    {
        id: "image",
        label: "Images",
        extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "tiff", "ico", "heic", "avif"]
    },
    {
        id: "video",
        label: "Videos",
        extensions: ["mp4", "webm", "mov", "mkv", "avi", "flv", "wmv", "m4v", "mpeg", "mpg", "3gp"]
    },
    {
        id: "audio",
        label: "Audio",
        extensions: ["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus", "wma"]
    },
    {
        id: "archive",
        label: "Archives",
        extensions: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "zst"]
    },
    {
        id: "document",
        label: "Documents",
        extensions: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "json", "md", "rtf", "odt"]
    }
];

export function emptyFilter(): FilterConfig {
    return { categories: [], extensions: [] };
}

export function getExtension(filename: string): string {
    const name = filename.split("?")[0];
    const dot = name.lastIndexOf(".");
    if (dot < 0 || dot === name.length - 1) return "";
    return name.slice(dot + 1).toLowerCase();
}

// Normalise free-text extension input ("mp4, .png  webm") into a clean list.
export function parseExtensions(raw: string): string[] {
    return raw
        .split(/[\s,]+/)
        .map(s => s.trim().replace(/^\./, "").toLowerCase())
        .filter(Boolean);
}

// Build the full set of extensions a filter allows. Returns null when the filter
// is "match everything" (no categories and no custom extensions selected).
export function resolveAllowedExtensions(filter: FilterConfig): Set<string> | null {
    const set = new Set<string>();
    for (const catId of filter.categories) {
        const cat = FILTER_CATEGORIES.find(c => c.id === catId);
        if (cat) for (const ext of cat.extensions) set.add(ext);
    }
    for (const ext of filter.extensions) set.add(ext.replace(/^\./, "").toLowerCase());

    return set.size ? set : null;
}

export function assetMatchesFilter(asset: Asset, filter: FilterConfig): boolean {
    const allowed = resolveAllowedExtensions(filter);
    if (!allowed) return true;
    return allowed.has(getExtension(asset.filename));
}

// Pull every attachment out of a raw or cached Discord message object.
export function extractAssets(message: any): Asset[] {
    const attachments = message?.attachments;
    if (!Array.isArray(attachments) || !attachments.length) return [];

    return attachments
        .filter((a: any) => a?.url && a?.filename)
        .map((a: any): Asset => ({
            id: String(a.id),
            filename: a.filename,
            url: a.url,
            size: typeof a.size === "number" ? a.size : 0,
            contentType: a.content_type,
            messageId: String(message.id),
            channelId: String(message.channel_id ?? message.channelId)
        }));
}
