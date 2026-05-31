/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { AnchorCorner, ScreenEdge } from "./types";

const OVERLAY_ROOT_ID = "vc-fun-overlays-root";

/** Build a stable-ish selector from up to 3 classes on the element. */
export function buildSelectorFromElement(el: Element): { selector: string; label: string; } | null {
    const cls = (el as HTMLElement).className;
    if (typeof cls !== "string" || cls.trim() === "") {
        if (el.id) return { selector: `#${CSS.escape(el.id)}`, label: `#${el.id}` };
        return null;
    }
    const parts = cls.split(/\s+/).filter(Boolean).slice(0, 3);
    if (parts.length === 0) return null;
    const selector = parts.map(c => `.${CSS.escape(c)}`).join("");
    return { selector, label: parts.join(" ") };
}

/** Find the top non-overlay element under a point. */
export function pickAnchorAt(x: number, y: number): Element | null {
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
        if (el.closest(`#${OVERLAY_ROOT_ID}`)) continue;
        // overlay items are portalled to body — skip them too
        if (el.closest(".vc-fun-overlay-item")) continue;
        if (el === document.body || el === document.documentElement) continue;
        if (!(el instanceof HTMLElement)) continue;
        // skip text nodes wrappers without classes
        if (!el.className && !el.id) continue;
        return el;
    }
    return null;
}

export function resolveAnchor(selector: string): HTMLElement | null {
    try {
        const el = document.querySelector(selector);
        return el instanceof HTMLElement ? el : null;
    } catch {
        return null;
    }
}

export function cornerPoint(rect: DOMRect, corner: AnchorCorner): { x: number; y: number; } {
    switch (corner) {
        case "tl": return { x: rect.left, y: rect.top };
        case "tr": return { x: rect.right, y: rect.top };
        case "bl": return { x: rect.left, y: rect.bottom };
        case "br": return { x: rect.right, y: rect.bottom };
        case "center": return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
}

/** Closest corner of a rect to a point, returning corner kind. */
export function nearestCorner(rect: DOMRect, x: number, y: number): AnchorCorner {
    const corners: AnchorCorner[] = ["tl", "tr", "bl", "br", "center"];
    let best: AnchorCorner = "tl";
    let bestD = Infinity;
    for (const c of corners) {
        const p = cornerPoint(rect, c);
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bestD) { bestD = d; best = c; }
    }
    return best;
}

export { OVERLAY_ROOT_ID };

/** Reference point on the viewport for a given ScreenEdge. */
export function screenEdgePoint(edge: ScreenEdge, vw: number, vh: number): { x: number; y: number; } {
    switch (edge) {
        case "tl": return { x: 0, y: 0 };
        case "tr": return { x: vw, y: 0 };
        case "bl": return { x: 0, y: vh };
        case "br": return { x: vw, y: vh };
        case "top": return { x: vw / 2, y: 0 };
        case "bottom": return { x: vw / 2, y: vh };
        case "left": return { x: 0, y: vh / 2 };
        case "right": return { x: vw, y: vh / 2 };
    }
}

/** How close to a screen edge (px) before we snap. */
const SCREEN_SNAP_THRESHOLD = 80;

/**
 * Returns the best ScreenEdge to snap to based on the overlay's current
 * position and size, or null if it is not near any edge.
 */
export function nearestScreenEdge(x: number, y: number, w: number, h: number): ScreenEdge | null {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const nearLeft = x < SCREEN_SNAP_THRESHOLD;
    const nearRight = (x + w) > (vw - SCREEN_SNAP_THRESHOLD);
    const nearTop = y < SCREEN_SNAP_THRESHOLD;
    const nearBottom = (y + h) > (vh - SCREEN_SNAP_THRESHOLD);
    // corners take priority over edges
    if (nearLeft && nearTop) return "tl";
    if (nearRight && nearTop) return "tr";
    if (nearLeft && nearBottom) return "bl";
    if (nearRight && nearBottom) return "br";
    if (nearTop) return "top";
    if (nearBottom) return "bottom";
    if (nearLeft) return "left";
    if (nearRight) return "right";
    return null;
}
