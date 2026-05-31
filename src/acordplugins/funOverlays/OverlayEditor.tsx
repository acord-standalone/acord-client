/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { Margins } from "@utils/margins";
import { closeModal, openModal } from "@utils/modal";
import {
    Button,
    Checkbox,
    Modal,
    React,
    Select,
    SelectedChannelStore,
    SelectedGuildStore,
    Slider,
    TextInput,
    useState
} from "@webpack/common";

import { OverlayStore } from "./store";
import type { Overlay, Scope, ScopeKind } from "./types";

const SCOPE_OPTIONS: { value: ScopeKind; label: string; needsValue: boolean; placeholder?: string; }[] = [
    { value: "everywhere", label: "Everywhere", needsValue: false },
    { value: "anyGuild", label: "Any server", needsValue: false },
    { value: "anyDm", label: "Any DM", needsValue: false },
    { value: "home", label: "Home page", needsValue: false },
    { value: "friends", label: "Friends page", needsValue: false },
    { value: "nitro", label: "Nitro page", needsValue: false },
    { value: "shop", label: "Shop page", needsValue: false },
    { value: "discover", label: "Server discovery", needsValue: false },
    { value: "anyVoice", label: "Any voice channel", needsValue: false },
    { value: "anyStage", label: "Any stage channel", needsValue: false },
    { value: "anyForum", label: "Any forum channel", needsValue: false },
    { value: "guild", label: "Specific server (guild id)", needsValue: true, placeholder: "Guild ID" },
    { value: "channel", label: "Specific channel (channel id)", needsValue: true, placeholder: "Channel ID" },
    { value: "dm", label: "Specific DM (channel id)", needsValue: true, placeholder: "DM channel ID" },
    { value: "regex", label: "Custom path regex", needsValue: true, placeholder: "^/channels/123" }
];

const section: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 };

function EditorBody({ overlay, onClose }: { overlay: Overlay; onClose(): void; }) {
    const [draft, setDraft] = useState<Overlay>(overlay);

    function patch(p: Partial<Overlay>) {
        setDraft(d => ({ ...d, ...p }));
    }
    function patchScope(s: Partial<Scope>) {
        setDraft(d => ({ ...d, scope: { ...d.scope, ...s } as Scope }));
    }

    const scopeMeta = SCOPE_OPTIONS.find(o => o.value === draft.scope.kind)!;

    return (
        <div style={{ padding: 16 }}>
            <div style={section}>
                <Heading>Name</Heading>
                <TextInput value={draft.name} onChange={v => patch({ name: v })} />
            </div>

            <div style={section}>
                <Heading>Image / GIF URL</Heading>
                <TextInput value={draft.url} onChange={v => patch({ url: v })} placeholder="https://..." />
                {draft.url && (
                    <img src={draft.url} alt="" style={{ marginTop: 8, height: 120, width: "auto", maxWidth: "100%", objectFit: "contain", alignSelf: "flex-start", borderRadius: 4 }} />
                )}
            </div>

            <div style={section}>
                <Heading>Where to show</Heading>
                <Select
                    options={SCOPE_OPTIONS.map(o => ({ label: o.label, value: o.value }))}
                    isSelected={v => v === draft.scope.kind}
                    select={(v: ScopeKind) => patchScope({ kind: v, value: "" })}
                    serialize={String}
                    closeOnSelect
                />
                {scopeMeta.needsValue && (
                    <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                        <TextInput
                            value={draft.scope.value ?? ""}
                            onChange={v => patchScope({ value: v })}
                            placeholder={scopeMeta.placeholder}
                        />
                        {draft.scope.kind === "guild" && (
                            <Button size={Button.Sizes.SMALL} onClick={() => patchScope({ value: SelectedGuildStore.getGuildId() || "" })}>
                                Use current
                            </Button>
                        )}
                        {(draft.scope.kind === "channel" || draft.scope.kind === "dm") && (
                            <Button size={Button.Sizes.SMALL} onClick={() => patchScope({ value: SelectedChannelStore.getChannelId() || "" })}>
                                Use current
                            </Button>
                        )}
                    </div>
                )}
            </div>

            <div style={section}>
                <Heading>Placement</Heading>
                {draft.placement.kind === "free" ? (
                    <Paragraph>
                        Free at ({draft.placement.x}, {draft.placement.y}). Drag overlay in edit mode to move; drop near a screen edge/corner or Discord element to snap.
                    </Paragraph>
                ) : draft.placement.kind === "screen" ? (
                    <>
                        <Paragraph>
                            Snapped to screen <strong>{draft.placement.edge}</strong> corner/edge with offset ({draft.placement.offsetX}, {draft.placement.offsetY}). Repositions automatically on window resize.
                        </Paragraph>
                        <Button
                            size={Button.Sizes.SMALL}
                            color={Button.Colors.RED}
                            className={Margins.top8}
                            onClick={() => patch({ placement: { kind: "free", x: 200, y: 200 } })}
                        >
                            Unsnap (back to free)
                        </Button>
                    </>
                ) : (
                    <>
                        <Paragraph>
                            Snapped to <code>{draft.placement.anchorLabel ?? draft.placement.selector}</code> ({draft.placement.corner}) with offset ({draft.placement.offsetX}, {draft.placement.offsetY}).
                        </Paragraph>
                        <Button
                            size={Button.Sizes.SMALL}
                            color={Button.Colors.RED}
                            className={Margins.top8}
                            onClick={() => patch({ placement: { kind: "free", x: 200, y: 200 } })}
                        >
                            Unsnap (back to free)
                        </Button>
                    </>
                )}
            </div>

            <div style={section}>
                <Heading>Size</Heading>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <TextInput
                        value={String(draft.width)}
                        onChange={v => patch({ width: Math.max(10, parseInt(v) || 0) })}
                    />
                    <span style={{ color: "var(--text-muted)" }}>x</span>
                    <TextInput
                        value={String(draft.height)}
                        onChange={v => patch({ height: Math.max(10, parseInt(v) || 0) })}
                    />
                </div>
                <Checkbox value={draft.keepAspect} onChange={(_, v) => patch({ keepAspect: v })}>
                    <Paragraph>Keep aspect ratio while resizing</Paragraph>
                </Checkbox>
            </div>

            <div style={section}>
                <Heading>Opacity</Heading>
                <Slider
                    minValue={0.05}
                    maxValue={1}
                    initialValue={draft.opacity}
                    onValueChange={v => patch({ opacity: v })}
                    markers={[0.25, 0.5, 0.75, 1]}
                    stickToMarkers={false}
                />
            </div>

            <div style={section}>
                <Heading>Rotation (deg)</Heading>
                <Slider
                    minValue={-180}
                    maxValue={180}
                    initialValue={draft.rotation}
                    onValueChange={v => patch({ rotation: Math.round(v) })}
                    markers={[-180, -90, 0, 90, 180]}
                    stickToMarkers={false}
                />
            </div>

            <div style={section}>
                <Checkbox value={draft.enabled} onChange={(_, v) => patch({ enabled: v })}>
                    <Paragraph>Enabled</Paragraph>
                </Checkbox>
                <Checkbox value={draft.locked} onChange={(_, v) => patch({ locked: v })}>
                    <Paragraph>Locked (cannot be dragged even in edit mode)</Paragraph>
                </Checkbox>
                <Checkbox value={draft.clickThrough} onChange={(_, v) => patch({ clickThrough: v })}>
                    <Paragraph>Click-through when not in edit mode</Paragraph>
                </Checkbox>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Button
                    color={Button.Colors.RED}
                    onClick={() => { OverlayStore.remove(overlay.id); onClose(); }}
                >
                    Delete
                </Button>
                <div style={{ flex: 1 }} />
                <Button color={Button.Colors.PRIMARY} look={Button.Looks.LINK} onClick={onClose}>Cancel</Button>
                <Button
                    color={Button.Colors.BRAND}
                    onClick={() => { OverlayStore.update(overlay.id, draft); onClose(); }}
                >
                    Save
                </Button>
            </div>
        </div>
    );
}

export function openOverlayEditor(overlayId: string) {
    const overlay = OverlayStore.get(overlayId);
    if (!overlay) return;
    const key = openModal(props => (
        <Modal {...props} title="Edit overlay" size="md">
            <EditorBody overlay={overlay} onClose={() => closeModal(key)} />
        </Modal>
    ));
}
