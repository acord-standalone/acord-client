/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { AnchorCorner, ScreenEdge } from "./types";

const OVERLAY_ROOT_ID = "vc-fun-overlays-root";

/**
 * Discord class names look like `textArea_a1b2c3` — a stable prefix plus a hashed
 * suffix that changes between builds (and sometimes across screens). Turn such a
 * class into a substring matcher on the stable prefix so the selector survives
 * those changes and works on every screen; keep plain classes as-is.
 */
const HASHED_CLASS = /^(.+)_[A-Za-z0-9_-]{4,10}$/;
function classToken(cls: string): string {
    const m = HASHED_CLASS.exec(cls);
    if (m) return `[class*="${m[1]}_"]`;
    return `.${CSS.escape(cls)}`;
}

/** Ids Discord generates per-render (uid_123, :r0:, numeric) are not stable. */
function isStableId(id: string): boolean {
    if (!id) return false;
    if (/\d{3,}/.test(id)) return false; // contains a long number run
    if (/^[:.]/.test(id) || id.includes(":")) return false; // React useId (":r0:")
    if (/^(uid_|react-)/.test(id)) return false;
    return true;
}

/** Build a stable, screen-independent selector for a single element. */
function localSelector(el: Element): string | null {
    const html = el as HTMLElement;
    if (isStableId(html.id)) return `#${CSS.escape(html.id)}`;

    const cls = html.className;
    if (typeof cls === "string" && cls.trim() !== "") {
        const tokens = cls.split(/\s+/).filter(Boolean).slice(0, 3).map(classToken);
        if (tokens.length) return tokens.join("");
    }

    // classless elements: lean on semantic attributes that are stable across screens
    const aria = el.getAttribute("aria-label");
    if (aria && aria.length <= 40) return `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(aria)}"]`;
    const role = el.getAttribute("role");
    if (role) return `${el.tagName.toLowerCase()}[role="${CSS.escape(role)}"]`;
    return null;
}

/** Human label for the editor (id or the element's own class prefixes). */
function localLabel(el: Element): string {
    const html = el as HTMLElement;
    if (isStableId(html.id)) return `#${html.id}`;
    const cls = html.className;
    if (typeof cls === "string" && cls.trim() !== "") {
        return cls.split(/\s+/).filter(Boolean).slice(0, 3)
            .map(c => HASHED_CLASS.exec(c)?.[1] ?? c).join(" ");
    }
    const aria = el.getAttribute("aria-label");
    if (aria) return aria;
    return el.tagName.toLowerCase();
}

/**
 * Build a selector for an element, climbing up to a few ancestors when needed so
 * it identifies *this* element and not 1-of-many siblings (e.g. one message row
 * among dozens). Returns null if nothing usable can be built.
 */
export function buildSelectorFromElement(el: Element): { selector: string; label: string; } | null {
    // a stable id is already unique — take the fast path
    const { id } = el as HTMLElement;
    if (isStableId(id)) return { selector: `#${CSS.escape(id)}`, label: `#${id}` };

    const own = localSelector(el);
    if (!own) return null;

    let selector = own;
    let ancestor: Element | null = el.parentElement;
    let depth = 0;
    // prepend ancestor selectors until the path is unique (or we give up)
    while (depth < 5 && document.querySelectorAll(selector).length > 1 && ancestor) {
        if (isStableId(ancestor.id)) {
            selector = `#${CSS.escape(ancestor.id)} ${selector}`;
            break;
        }
        const anc = localSelector(ancestor);
        if (anc) selector = `${anc} ${selector}`;
        ancestor = ancestor.parentElement;
        depth++;
    }
    return { selector, label: localLabel(el) };
}

/**
 * Whether an anchor element is currently usable: attached, visible, and at least
 * partially within the viewport. Used to hide overlays whose anchor scrolled
 * off-screen or got hidden instead of dragging them off-screen with it.
 */
export function isAnchorRenderable(el: HTMLElement): boolean {
    if (!el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return false;
    if (Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // intersects the viewport at all?
    return rect.right > 0 && rect.bottom > 0 && rect.left < vw && rect.top < vh;
}

/** Fraction of the viewport area above which an element is treated as "the screen". */
const FULLSCREEN_AREA_RATIO = 0.85;
/**
 * Minimum width/height (px) for an element to be a valid anchor. Keeps us from
 * snapping to tiny inline things (markdown spans, links, emojis, single words).
 * We require BOTH dimensions because text lines are wide but short, so a height
 * floor is what actually rejects them.
 */
const MIN_ANCHOR_WIDTH = 40;
const MIN_ANCHOR_HEIGHT = 40;

/** Whether an element is a sensible thing to anchor to (visible, not tiny, not the screen). */
export function isAnchorableElement(el: Element): el is HTMLElement {
    if (!(el instanceof HTMLElement)) return false;
    if (el.closest(`#${OVERLAY_ROOT_ID}`)) return false;
    // overlay items / our own highlight are portalled to body — never anchor to them
    if (el.closest(".vc-fun-overlay-item")) return false;
    if (el === document.body || el === document.documentElement) return false;
    // skip text nodes wrappers without any stable identity
    if (!el.className && !el.id) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    // skip invisible elements (hidden/transparent)
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    // skip tiny/inline elements (random markdown, words, icons)
    if (rect.width < MIN_ANCHOR_WIDTH || rect.height < MIN_ANCHOR_HEIGHT) return false;
    // skip near-fullscreen containers (app root, layer containers) — effectively "the screen"
    if (rect.width * rect.height > window.innerWidth * window.innerHeight * FULLSCREEN_AREA_RATIO) return false;
    return true;
}

/** Find the top non-overlay element under a point that is worth anchoring to. */
export function pickAnchorAt(x: number, y: number): HTMLElement | null {
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
        if (isAnchorableElement(el)) return el;
    }
    return null;
}

// --- edge / corner snapping ---------------------------------------------------

/** Base magnetic radius (px) for snapping an overlay edge to an element edge. */
const EDGE_SNAP_BASE = 16;
/** Hard cap so a huge element doesn't snap from across the screen. */
const EDGE_SNAP_MAX = 64;
/** Fraction of an element's size that becomes magnetic — bigger element, wider pull. */
const EDGE_SNAP_RATIO = 0.12;
/** Area (fraction of viewport) past which "bigger" no longer increases preference. */
const SIZE_BIAS_CAP_RATIO = 0.4;
/** How far up the ancestor chain we look for a better (usually larger) anchor. */
const ANCHOR_CLIMB_LIMIT = 6;

/** Magnetic radius for an element dimension: grows with size, but bounded. */
export function edgeSnapThreshold(elementSize: number): number {
    return Math.min(EDGE_SNAP_MAX, Math.max(EDGE_SNAP_BASE, elementSize * EDGE_SNAP_RATIO));
}

/**
 * Snap one axis: try to align an overlay edge/center to an element edge/center
 * (inside or just outside). Returns the new overlay min-coord on that axis, or
 * null if nothing is within the threshold.
 */
function snapAxis(overlayMin: number, overlaySize: number, elemMin: number, elemSize: number, threshold: number): number | null {
    const elemMax = elemMin + elemSize;
    const elemCenter = elemMin + elemSize / 2;
    // candidate overlay min-coords that each produce a clean alignment
    const candidates = [
        // overlay near-edge -> element near-edge (flush inside)
        elemMin,
        // overlay far-edge -> element far-edge (flush inside)
        elemMax - overlaySize,
        // overlay center -> element center
        elemCenter - overlaySize / 2,
        // overlay near-edge -> element far-edge (flush outside)
        elemMax,
        // overlay far-edge -> element near-edge (flush outside)
        elemMin - overlaySize
    ];
    let best: number | null = null;
    let bestD = threshold;
    for (const cand of candidates) {
        const d = Math.abs(cand - overlayMin);
        if (d <= bestD) { bestD = d; best = cand; }
    }
    return best;
}

export interface ElementSnap {
    el: HTMLElement;
    /** snapped overlay left/top (unchanged on an axis that didn't snap) */
    x: number;
    y: number;
}

/**
 * Pick the element an overlay should anchor to and the snapped position.
 *
 * Starting from the element under the overlay's center we walk up the ancestor
 * chain. Each candidate's edges are tested against the overlay's edges/center;
 * the magnetic radius scales with the element's size so larger elements are
 * easier to catch. Among candidates we prefer (1) more snapped axes, then
 * (2) the larger element (bounded by a cap, so "bigger wins" stays reasonable).
 *
 * If nothing snaps we still anchor to the element under the center at the exact
 * drop position, so overlays keep following the element they were dropped on.
 */
export function computeElementSnap(finalX: number, finalY: number, finalW: number, finalH: number): ElementSnap | null {
    const base = pickAnchorAt(finalX + finalW / 2, finalY + finalH / 2);
    if (!base) return null;

    const viewportArea = window.innerWidth * window.innerHeight;
    const biasCap = viewportArea * SIZE_BIAS_CAP_RATIO;

    let best: ElementSnap | null = null;
    let bestScore = -Infinity;

    let el: HTMLElement | null = base;
    let climbed = 0;
    while (el && climbed < ANCHOR_CLIMB_LIMIT) {
        if (isAnchorableElement(el)) {
            const rect = el.getBoundingClientRect();
            const sx = snapAxis(finalX, finalW, rect.left, rect.width, edgeSnapThreshold(rect.width));
            const sy = snapAxis(finalY, finalH, rect.top, rect.height, edgeSnapThreshold(rect.height));
            if (sx !== null || sy !== null) {
                const axes = (sx !== null ? 1 : 0) + (sy !== null ? 1 : 0);
                const sizeBias = Math.min(rect.width * rect.height, biasCap);
                // axis count dominates; larger area breaks ties (up to the cap)
                const score = axes * (biasCap + 1) + sizeBias;
                if (score > bestScore) {
                    bestScore = score;
                    best = { el, x: sx ?? finalX, y: sy ?? finalY };
                }
            }
        }
        el = el.parentElement;
        climbed++;
    }

    // nothing near a border — still anchor to the dropped-on element, keeping position
    return best ?? { el: base, x: finalX, y: finalY };
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
