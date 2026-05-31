/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type ScopeKind =
    | "everywhere"
    | "anyGuild"
    | "anyDm"
    | "guild"
    | "channel"
    | "dm"
    | "home"
    | "friends"
    | "nitro"
    | "shop"
    | "discover"
    | "anyVoice"
    | "anyStage"
    | "anyForum"
    | "regex";

export interface Scope {
    kind: ScopeKind;
    /** guildId for "guild", channelId for "channel"/"dm", regex source for "regex" */
    value?: string;
}

export interface FreePlacement {
    kind: "free";
    /** pixel offset from viewport top-left of the anchor (or screen) */
    x: number;
    y: number;
}

/** One of the 8 screen reference anchors (4 corners + 4 edge-centres). */
export type ScreenEdge = "tl" | "tr" | "bl" | "br" | "top" | "bottom" | "left" | "right";

/** Position relative to a screen corner or edge so the overlay survives viewport resizes. */
export interface ScreenPlacement {
    kind: "screen";
    /** which screen corner / edge to anchor to */
    edge: ScreenEdge;
    /** pixel offset from the edge reference point */
    offsetX: number;
    offsetY: number;
}

export type AnchorCorner = "tl" | "tr" | "bl" | "br" | "center";

export interface AnchorPlacement {
    kind: "anchor";
    /** css selector built from class signature */
    selector: string;
    /** which corner of the anchor we attach to */
    corner: AnchorCorner;
    /** offset from that corner, in px */
    offsetX: number;
    offsetY: number;
    /** human label cached at snap time, for the editor */
    anchorLabel?: string;
}

export type Placement = FreePlacement | AnchorPlacement | ScreenPlacement;

export interface Overlay {
    id: string;
    name: string;
    url: string;
    enabled: boolean;
    locked: boolean;
    scope: Scope;
    placement: Placement;
    width: number;
    height: number;
    opacity: number;
    rotation: number;
    /** keep aspect ratio while resizing */
    keepAspect: boolean;
    /** allow clicks to pass through */
    clickThrough: boolean;
    zIndex: number;
}

export interface RouteContext {
    guildId: string | null;
    channelId: string | null;
    pathname: string;
}
