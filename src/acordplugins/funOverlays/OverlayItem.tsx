/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, ReactDOM, useEffect, useRef, useState } from "@webpack/common";

import { buildSelectorFromElement, cornerPoint, nearestCorner, nearestScreenEdge, pickAnchorAt, resolveAnchor, screenEdgePoint } from "./anchor";
import { openOverlayEditor } from "./OverlayEditor";
import { OverlayStore } from "./store";
import type { AnchorPlacement, FreePlacement, Overlay, ScreenPlacement } from "./types";

interface Props {
    overlay: Overlay;
    editMode: boolean;
}

type DragKind = null
    | { kind: "move"; startMouseX: number; startMouseY: number; startX: number; startY: number; }
    | { kind: "resize"; corner: "tl" | "tr" | "bl" | "br"; startMouseX: number; startMouseY: number; startW: number; startH: number; startX: number; startY: number; aspect: number; };

const SNAP_RADIUS = 22;

/** Resolve anchored placement into viewport coords for current frame. */
function useAnchoredPosition(overlay: Overlay): { x: number; y: number; visible: boolean; } {
    const [pos, setPos] = useState<{ x: number; y: number; visible: boolean; }>(() => ({ x: 0, y: 0, visible: false }));

    useEffect(() => {
        if (overlay.placement.kind !== "anchor") return;
        const pl = overlay.placement;
        let stopped = false;
        const tick = () => {
            if (stopped) return;
            const el = resolveAnchor(pl.selector);
            if (!el) {
                setPos(p => p.visible ? { ...p, visible: false } : p);
            } else {
                const rect = el.getBoundingClientRect();
                const c = cornerPoint(rect, pl.corner);
                const next = { x: c.x + pl.offsetX, y: c.y + pl.offsetY, visible: true };
                setPos(p => (p.x === next.x && p.y === next.y && p.visible) ? p : next);
            }
            raf = requestAnimationFrame(tick);
        };
        let raf = requestAnimationFrame(tick);
        return () => { stopped = true; cancelAnimationFrame(raf); };
    }, [overlay.placement]);

    // Re-position relative to screen edge/corner whenever the viewport resizes.
    useEffect(() => {
        if (overlay.placement.kind !== "screen") return;
        const pl = overlay.placement as ScreenPlacement;
        const update = () => {
            const ref = screenEdgePoint(pl.edge, window.innerWidth, window.innerHeight);
            setPos({ x: ref.x + pl.offsetX, y: ref.y + pl.offsetY, visible: true });
        };
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, [overlay.placement]);

    if (overlay.placement.kind === "free") {
        return { x: overlay.placement.x, y: overlay.placement.y, visible: true };
    }
    return pos;
}

export function OverlayItem({ overlay, editMode }: Props) {
    const [drag, setDrag] = useState<DragKind>(null);
    // local transient position/size during drag to avoid persisting every frame
    const [liveX, setLiveX] = useState<number | null>(null);
    const [liveY, setLiveY] = useState<number | null>(null);
    const [liveW, setLiveW] = useState<number | null>(null);
    const [liveH, setLiveH] = useState<number | null>(null);

    const liveRef = useRef({ x: null as number | null, y: null as number | null, w: null as number | null, h: null as number | null });
    liveRef.current = { x: liveX, y: liveY, w: liveW, h: liveH };

    const anchored = useAnchoredPosition(overlay);

    // base coords from placement (anchor or free)
    const baseX = anchored.x;
    const baseY = anchored.y;
    const baseRef = useRef({ x: baseX, y: baseY });
    baseRef.current = { x: baseX, y: baseY };

    const x = liveX ?? baseX;
    const y = liveY ?? baseY;
    const w = liveW ?? overlay.width;
    const h = liveH ?? overlay.height;

    useEffect(() => {
        if (!drag) return;
        const onMove = (e: MouseEvent) => {
            if (drag.kind === "move") {
                setLiveX(drag.startX + (e.clientX - drag.startMouseX));
                setLiveY(drag.startY + (e.clientY - drag.startMouseY));
            } else {
                const dx = e.clientX - drag.startMouseX;
                const dy = e.clientY - drag.startMouseY;
                let nw = drag.startW;
                let nh = drag.startH;
                let nx = drag.startX;
                let ny = drag.startY;
                if (drag.corner === "br") { nw = drag.startW + dx; nh = drag.startH + dy; }
                if (drag.corner === "tr") { nw = drag.startW + dx; nh = drag.startH - dy; ny = drag.startY + dy; }
                if (drag.corner === "bl") { nw = drag.startW - dx; nh = drag.startH + dy; nx = drag.startX + dx; }
                if (drag.corner === "tl") { nw = drag.startW - dx; nh = drag.startH - dy; nx = drag.startX + dx; ny = drag.startY + dy; }
                if (overlay.keepAspect && drag.aspect > 0) {
                    // lock ratio using width as driver
                    const targetH = nw / drag.aspect;
                    const dh = targetH - nh;
                    nh = targetH;
                    if (drag.corner === "tl" || drag.corner === "tr") ny -= dh;
                }
                nw = Math.max(20, nw);
                nh = Math.max(20, nh);
                setLiveW(nw); setLiveH(nh); setLiveX(nx); setLiveY(ny);
            }
        };
        const onUp = (e: MouseEvent) => {
            const finalX = drag.kind === "move"
                ? drag.startX + (e.clientX - drag.startMouseX)
                : (liveRef.current.x ?? baseRef.current.x);
            const finalY = drag.kind === "move"
                ? drag.startY + (e.clientY - drag.startMouseY)
                : (liveRef.current.y ?? baseRef.current.y);
            const finalW = liveRef.current.w ?? overlay.width;
            const finalH = liveRef.current.h ?? overlay.height;

            if (drag.kind === "move") {
                commitMove(finalX, finalY, finalW, finalH);
            } else {
                // For resize corners that shift the top-left (tl/tr/bl), the position
                // changes too — persist it back into the placement so it doesn't snap back.
                let updatedPlacement = overlay.placement;
                if (drag.corner !== "br") {
                    if (overlay.placement.kind === "free") {
                        updatedPlacement = { kind: "free", x: Math.round(finalX), y: Math.round(finalY) };
                    } else if (overlay.placement.kind === "screen") {
                        const ref = screenEdgePoint(overlay.placement.edge, window.innerWidth, window.innerHeight);
                        updatedPlacement = {
                            ...overlay.placement,
                            offsetX: Math.round(finalX - ref.x),
                            offsetY: Math.round(finalY - ref.y)
                        };
                    } else if (overlay.placement.kind === "anchor") {
                        const el = resolveAnchor(overlay.placement.selector);
                        if (el) {
                            const rect = el.getBoundingClientRect();
                            const cp = cornerPoint(rect, overlay.placement.corner);
                            updatedPlacement = {
                                ...overlay.placement,
                                offsetX: Math.round(finalX - cp.x),
                                offsetY: Math.round(finalY - cp.y)
                            };
                        }
                    }
                }
                OverlayStore.update(overlay.id, {
                    width: Math.round(finalW),
                    height: Math.round(finalH),
                    placement: updatedPlacement
                });
            }
            setDrag(null);
            setLiveX(null); setLiveY(null); setLiveW(null); setLiveH(null);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [drag]);

    function commitMove(finalX: number, finalY: number, finalW: number, finalH: number) {
        // try to snap to an underlying element near the center of the overlay
        const cx = finalX + finalW / 2;
        const cy = finalY + finalH / 2;
        // hide overlay layer's hit-testing briefly by elevating elementsFromPoint excluding our root (handled in pickAnchorAt)
        const candidate = pickAnchorAt(cx, cy);
        if (candidate) {
            const info = buildSelectorFromElement(candidate);
            if (info) {
                const rect = candidate.getBoundingClientRect();
                const corner = nearestCorner(rect, finalX, finalY);
                const cp = cornerPoint(rect, corner);
                const dist = Math.hypot(cp.x - finalX, cp.y - finalY);
                if (dist < SNAP_RADIUS) {
                    const placement: AnchorPlacement = {
                        kind: "anchor",
                        selector: info.selector,
                        corner,
                        offsetX: Math.round(finalX - cp.x),
                        offsetY: Math.round(finalY - cp.y),
                        anchorLabel: info.label
                    };
                    OverlayStore.update(overlay.id, { placement });
                    return;
                }
            }
        }
        // try to snap to the nearest screen corner/edge
        const edge = nearestScreenEdge(finalX, finalY, finalW, finalH);
        if (edge !== null) {
            const ref = screenEdgePoint(edge, window.innerWidth, window.innerHeight);
            const placement: ScreenPlacement = {
                kind: "screen",
                edge,
                offsetX: Math.round(finalX - ref.x),
                offsetY: Math.round(finalY - ref.y)
            };
            OverlayStore.update(overlay.id, { placement });
            return;
        }

        const placement: FreePlacement = { kind: "free", x: Math.round(finalX), y: Math.round(finalY) };
        OverlayStore.update(overlay.id, { placement });
    }

    const interactive = editMode && !overlay.locked;
    const pointerEvents: React.CSSProperties["pointerEvents"] =
        interactive ? "auto" : (overlay.clickThrough ? "none" : "auto");

    const style: React.CSSProperties = {
        position: "fixed",
        left: x,
        top: y,
        width: w,
        height: h,
        opacity: overlay.opacity,
        transform: `rotate(${overlay.rotation}deg)`,
        transformOrigin: "center center",
        zIndex: 9999 + (overlay.zIndex ?? 0),
        pointerEvents,
        display: anchored.visible ? "block" : "none",
        userSelect: "none",
        cursor: interactive ? (drag?.kind === "move" ? "grabbing" : "grab") : undefined,
        outline: interactive ? "1px dashed var(--brand-500, #5865F2)" : undefined,
        outlineOffset: 2
    };

    const imgStyle: React.CSSProperties = {
        width: "100%",
        height: "100%",
        display: "block",
        pointerEvents: "none",
        objectFit: "fill",
        userSelect: "none",
        WebkitUserDrag: "none"
    } as React.CSSProperties;

    function startMove(e: React.MouseEvent) {
        if (!interactive) return;
        e.preventDefault();
        e.stopPropagation();
        setDrag({ kind: "move", startMouseX: e.clientX, startMouseY: e.clientY, startX: baseX, startY: baseY });
    }

    function startResize(corner: "tl" | "tr" | "bl" | "br") {
        return (e: React.MouseEvent) => {
            if (!interactive) return;
            e.preventDefault();
            e.stopPropagation();
            const aspect = overlay.width > 0 && overlay.height > 0 ? overlay.width / overlay.height : 1;
            setDrag({
                kind: "resize",
                corner,
                startMouseX: e.clientX,
                startMouseY: e.clientY,
                startW: overlay.width,
                startH: overlay.height,
                startX: baseX,
                startY: baseY,
                aspect
            });
        };
    }

    const handleStyleBase: React.CSSProperties = {
        position: "absolute",
        width: 12,
        height: 12,
        background: "var(--brand-500, #5865F2)",
        border: "2px solid white",
        borderRadius: 2,
        pointerEvents: "auto",
        zIndex: 2
    };

    return ReactDOM.createPortal(
        <div className="vc-fun-overlay-item" style={style} onMouseDown={startMove}>
            {overlay.url
                ? <img src={overlay.url} alt="" draggable={false} style={imgStyle} />
                : (
                    <div style={{
                        width: "100%", height: "100%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "rgba(88,101,242,0.15)",
                        border: "1px dashed var(--brand-500, #5865F2)",
                        color: "var(--text-muted)",
                        fontSize: 12,
                        textAlign: "center",
                        padding: 4,
                        boxSizing: "border-box"
                    }}>
                        {overlay.name} (no url)
                    </div>
                )}
            {interactive && (
                <>
                    <div style={{ ...handleStyleBase, left: -6, top: -6, cursor: "nwse-resize" }} onMouseDown={startResize("tl")} />
                    <div style={{ ...handleStyleBase, right: -6, top: -6, cursor: "nesw-resize" }} onMouseDown={startResize("tr")} />
                    <div style={{ ...handleStyleBase, left: -6, bottom: -6, cursor: "nesw-resize" }} onMouseDown={startResize("bl")} />
                    <div style={{ ...handleStyleBase, right: -6, bottom: -6, cursor: "nwse-resize" }} onMouseDown={startResize("br")} />
                    <div
                        title="Edit overlay"
                        onMouseDown={e => { e.stopPropagation(); e.preventDefault(); }}
                        onClick={e => { e.stopPropagation(); openOverlayEditor(overlay.id); }}
                        style={{
                            position: "absolute",
                            top: -28,
                            right: 0,
                            padding: "2px 8px",
                            background: "var(--background-floating, #18191c)",
                            color: "var(--text-normal, white)",
                            borderRadius: 4,
                            font: "12px var(--font-display, sans-serif)",
                            cursor: "pointer",
                            pointerEvents: "auto",
                            border: "1px solid var(--background-modifier-accent, #4f545c)"
                        }}
                    >
                        ⚙ {overlay.name}
                    </div>
                </>
            )}
        </div>,
        document.body
    );
}
