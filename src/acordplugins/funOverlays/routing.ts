/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelType } from "@vencord/discord-types/enums";
import { ChannelStore } from "@webpack/common";

import type { RouteContext, Scope } from "./types";

export function matchScope(scope: Scope, ctx: RouteContext): boolean {
    switch (scope.kind) {
        case "everywhere":
            return true;
        case "anyGuild":
            return ctx.guildId !== null;
        case "anyDm":
            return ctx.guildId === null && ctx.pathname.startsWith("/channels/@me");
        case "guild":
            return !!scope.value && ctx.guildId === scope.value;
        case "channel":
            return !!scope.value && ctx.channelId === scope.value;
        case "dm":
            return !!scope.value && ctx.guildId === null && ctx.channelId === scope.value;
        case "home":
            return ctx.pathname === "/channels/@me";
        case "friends":
            return ctx.pathname.startsWith("/channels/@me") && ctx.channelId === null;
        case "nitro":
            return ctx.pathname.startsWith("/store") || ctx.pathname.startsWith("/nitro");
        case "shop":
            return ctx.pathname.startsWith("/shop");
        case "discover":
            return ctx.pathname.startsWith("/guild-discovery") || ctx.pathname.startsWith("/discovery");
        case "anyVoice": {
            if (!ctx.channelId) return false;
            const t = ChannelStore.getChannel(ctx.channelId)?.type;
            return t === ChannelType.GUILD_VOICE;
        }
        case "anyStage": {
            if (!ctx.channelId) return false;
            const t = ChannelStore.getChannel(ctx.channelId)?.type;
            return t === ChannelType.GUILD_STAGE_VOICE;
        }
        case "anyForum": {
            if (!ctx.channelId) return false;
            const t = ChannelStore.getChannel(ctx.channelId)?.type;
            return t === ChannelType.GUILD_FORUM;
        }
        case "regex": {
            if (!scope.value) return false;
            try {
                return new RegExp(scope.value).test(ctx.pathname);
            } catch {
                return false;
            }
        }
        default:
            return false;
    }
}

export function describeScope(scope: Scope): string {
    switch (scope.kind) {
        case "everywhere": return "Everywhere";
        case "anyGuild": return "Any server";
        case "anyDm": return "Any DM";
        case "guild": return `Server ${scope.value ?? "?"}`;
        case "channel": return `Channel ${scope.value ?? "?"}`;
        case "dm": return `DM ${scope.value ?? "?"}`;
        case "home": return "Home page";
        case "friends": return "Friends page";
        case "nitro": return "Nitro page";
        case "shop": return "Shop page";
        case "discover": return "Server discovery";
        case "anyVoice": return "Any voice channel";
        case "anyStage": return "Any stage channel";
        case "anyForum": return "Any forum channel";
        case "regex": return `Path matches /${scope.value ?? ""}/`;
    }
}
