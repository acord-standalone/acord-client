/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { Switch } from "@components/Switch";
import { copyToClipboard, readClipboard } from "@utils/clipboard";
import { React, showToast, Toasts, useEffect, useState } from "@webpack/common";

import { EditModeStore } from "./editMode";
import { openOverlayEditor } from "./OverlayEditor";
import { describeScope } from "./routing";
import { defaultOverlay, newId, OverlayStore } from "./store";
import type { Overlay } from "./types";

function Row({ overlay }: { overlay: Overlay; }) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 8,
                borderRadius: 6,
                background: "var(--background-secondary)",
                marginBottom: 8
            }}
        >
            <div style={{
                width: 48, height: 48, flex: "0 0 48px",
                background: "var(--background-tertiary)", borderRadius: 4,
                overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center"
            }}>
                {overlay.url
                    ? <img src={overlay.url} alt="" style={{ maxWidth: "100%", maxHeight: "100%" }} />
                    : <span style={{ fontSize: 11, color: "var(--text-muted)" }}>no url</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: "var(--text-normal)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {overlay.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {describeScope(overlay.scope)} · {overlay.placement.kind === "anchor" ? `snapped (${overlay.placement.anchorLabel ?? overlay.placement.selector})` : "free"}
                </div>
            </div>
            <Switch
                checked={overlay.enabled}
                onChange={v => OverlayStore.update(overlay.id, { enabled: v })}
            />
            <Button size="small" onClick={() => openOverlayEditor(overlay.id)}>Edit</Button>
            <Button
                size="small"
                variant="dangerPrimary"
                onClick={() => OverlayStore.remove(overlay.id)}
            >
                Delete
            </Button>
        </div>
    );
}

export function SettingsPanel({ onClose }: { onClose?: () => void; } = {}) {
    const [list, setList] = useState<Overlay[]>(() => OverlayStore.getAll());
    const [editMode, setEditMode] = useState(() => EditModeStore.get());

    useEffect(() => OverlayStore.subscribe(setList), []);
    useEffect(() => EditModeStore.subscribe(setEditMode), []);

    return (
        <div>
            <FormSwitch
                title="Edit mode"
                description="Allows dragging, resizing, and editing overlays in-place over Discord. Turn off when done."
                value={editMode}
                onChange={v => EditModeStore.set(v)}
                hideBorder
            />

            <Heading style={{ marginTop: 8, marginBottom: 6 }}>Overlays ({list.length})</Heading>
            {list.length === 0
                ? <Paragraph>No overlays yet. Add one below.</Paragraph>
                : list.map(o => <Row key={o.id} overlay={o} />)}

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Button
                    onClick={() => {
                        const o = defaultOverlay();
                        OverlayStore.add(o);
                        EditModeStore.set(true);
                        onClose?.();
                        openOverlayEditor(o.id);
                    }}
                >
                    Add overlay
                </Button>
                <Button
                    variant="secondary"
                    onClick={async () => {
                        const all = OverlayStore.getAll();
                        const json = JSON.stringify(all, null, 2);
                        try {
                            await copyToClipboard(json);
                            showToast(`Copied ${all.length} overlay(s) to clipboard`, Toasts.Type.SUCCESS);
                        } catch {
                            showToast("Couldn't write to clipboard", Toasts.Type.FAILURE);
                        }
                    }}
                >
                    Copy all as JSON
                </Button>
                <Button
                    variant="secondary"
                    onClick={async () => {
                        let text = "";
                        try {
                            text = await readClipboard();
                        } catch {
                            showToast("Couldn't read from clipboard", Toasts.Type.FAILURE);
                            return;
                        }
                        if (!text.trim()) {
                            showToast("Clipboard is empty", Toasts.Type.FAILURE);
                            return;
                        }

                        let parsed: unknown;
                        try {
                            parsed = JSON.parse(text);
                        } catch {
                            showToast("Clipboard doesn't contain valid JSON", Toasts.Type.FAILURE);
                            return;
                        }
                        if (!Array.isArray(parsed)) {
                            showToast("Expected a JSON array of overlays", Toasts.Type.FAILURE);
                            return;
                        }

                        // Keep only object entries and ensure every overlay has a unique id
                        // so a malformed export can't clobber or collide with existing ones.
                        const seen = new Set<string>();
                        const imported = parsed
                            .filter((o): o is Overlay => o != null && typeof o === "object")
                            .map(o => {
                                const id = typeof o.id === "string" && o.id && !seen.has(o.id) ? o.id : newId();
                                seen.add(id);
                                return { ...o, id };
                            });

                        if (imported.length === 0) {
                            showToast("No valid overlays found in clipboard", Toasts.Type.FAILURE);
                            return;
                        }

                        OverlayStore.replaceAll(imported);
                        showToast(`Imported ${imported.length} overlay(s)`, Toasts.Type.SUCCESS);
                    }}
                >
                    Import JSON from clipboard
                </Button>
            </div>
        </div>
    );
}
