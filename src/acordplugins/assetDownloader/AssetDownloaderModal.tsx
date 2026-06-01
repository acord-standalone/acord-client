/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Flex } from "@components/Flex";
import type { Channel } from "@vencord/discord-types";
import { Modal, openModal, React, SearchableSelect, showToast, Slider, Toasts, useMemo, useRef, useState } from "@webpack/common";

import { downloadAssets, openFolder, pickDirectory } from "./downloader";
import { FilterControls } from "./FilterControls";
import { Asset, assetMatchesFilter, emptyFilter, FilterConfig } from "./filters";
import { scanChannel, ScanHandle, ScanProgress } from "./scanner";
import { FollowConfig, FollowStore } from "./store";
import { buildChannelTargets, targetLabel } from "./targets";
import { forwardAssetsToChannel, uploadAssetsToChannel } from "./transfer";

type Mode = "download" | "upload" | "forward";

function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function channelLabel(channel: Channel) {
    if (channel.guild_id) return `#${channel.name}`;
    if (channel.isGroupDM?.()) return channel.name || "Group DM";
    return "this DM";
}

const statLabel: React.CSSProperties = { color: "var(--text-muted)", fontSize: 12 };
const statValue: React.CSSProperties = { color: "var(--text-normal)", fontSize: 18, fontWeight: 700 };

function Stat({ label, value }: { label: string; value: string; }) {
    return (
        <Flex flexDirection="column" gap={2} style={{ flex: 1 }}>
            <span style={statValue}>{value}</span>
            <span style={statLabel}>{label}</span>
        </Flex>
    );
}

const CONCURRENCY_MARKERS = Array.from({ length: 8 }, (_, i) => i + 1);

// Subscribes to the follow store so the "Always follow" UI updates the moment a
// follow is enabled or stopped, instead of being stale until the modal reopens.
function useFollowConfig(channelId: string): FollowConfig | undefined {
    const [config, setConfig] = useState(() => FollowStore.get(channelId));
    React.useEffect(() => FollowStore.subscribe(follows => setConfig(follows[channelId])), [channelId]);
    return config;
}

function describeFollow(config: FollowConfig): string {
    switch (config.action ?? "download") {
        case "upload":
            return `New files are re-uploaded to ${config.targetId ? targetLabel(config.targetId) : "the target channel"}.`;
        case "forward":
            return `New messages are forwarded to ${config.targetId ? targetLabel(config.targetId) : "the target channel"}.`;
        default:
            return "New matching files are saved to your folder automatically.";
    }
}

const MODES: { id: Mode; label: string; }[] = [
    { id: "download", label: "Save to folder" },
    { id: "upload", label: "Re-upload to channel" },
    { id: "forward", label: "Forward to channel" }
];

function ModeSelector({ mode, onChange }: { mode: Mode; onChange(m: Mode): void; }) {
    return (
        <Flex gap={4}>
            {MODES.map(m => (
                <Button
                    key={m.id}
                    size="small"
                    variant={mode === m.id ? "primary" : "secondary"}
                    onClick={() => onChange(m.id)}
                    style={{ flex: 1 }}
                >
                    {m.label}
                </Button>
            ))}
        </Flex>
    );
}

function AssetDownloaderModal({ channel, onClose, transitionState }: { channel: Channel; onClose(): void; transitionState: number; }) {
    const [filter, setFilter] = useState<FilterConfig>(() => FollowStore.get(channel.id)?.filter ?? emptyFilter());
    const [assets, setAssets] = useState<Asset[]>([]);
    const [progress, setProgress] = useState<ScanProgress | null>(null);
    const [scanning, setScanning] = useState(false);

    const [mode, setMode] = useState<Mode>("download");
    const [targetId, setTargetId] = useState<string | null>(null);
    const [concurrency, setConcurrency] = useState(4);
    const [busy, setBusy] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [actionProgress, setActionProgress] = useState<{ done: number; total: number; } | null>(null);

    // Tracks attachment ids we already collected so paging never double-counts.
    const seenIds = useRef<Set<string>>(new Set());
    const scanHandle = useRef<ScanHandle | null>(null);
    const abortAction = useRef(false);

    const matched = useMemo(() => assets.filter(a => assetMatchesFilter(a, filter)), [assets, filter]);
    const matchedSize = useMemo(() => matched.reduce((sum, a) => sum + a.size, 0), [matched]);

    // Only enumerate every channel when a transfer mode actually needs the picker.
    const targetOptions = useMemo(
        () => mode === "download" ? [] : buildChannelTargets().map(t => ({ value: t.value, label: t.label })),
        [mode]
    );

    const startScan = () => {
        seenIds.current = new Set();
        setAssets([]);
        setProgress(null);
        setScanning(true);
        scanHandle.current = scanChannel(
            channel.id,
            newAssets => {
                const fresh = newAssets.filter(a => !seenIds.current.has(a.id));
                if (!fresh.length) return;
                for (const a of fresh) seenIds.current.add(a.id);
                setAssets(prev => [...prev, ...fresh]);
            },
            p => {
                setProgress(p);
                if (p.done) setScanning(false);
            }
        );
    };

    const stopScan = () => {
        scanHandle.current?.abort();
        setScanning(false);
    };

    React.useEffect(() => () => scanHandle.current?.abort(), []);

    const runDownload = async () => {
        const dir = await pickDirectory(FollowStore.get(channel.id)?.dir);
        if (!dir) return;
        setActionProgress({ done: 0, total: matched.length });
        const outcome = await downloadAssets(dir, matched, (done, total) => setActionProgress({ done, total }), () => abortAction.current, concurrency);
        const msg = `Saved ${outcome.completed} file${outcome.completed === 1 ? "" : "s"}` + (outcome.failed ? `, ${outcome.failed} failed` : "");
        showToast(msg, outcome.failed ? Toasts.Type.FAILURE : Toasts.Type.SUCCESS);
        if (outcome.completed) openFolder(dir);
    };

    const runTransfer = async () => {
        if (!targetId) return;
        setActionProgress({ done: 0, total: matched.length });
        const outcome = mode === "upload"
            ? await uploadAssetsToChannel(targetId, matched, (done, total) => setActionProgress({ done, total }), () => abortAction.current, concurrency)
            : await forwardAssetsToChannel(targetId, matched, (done, total) => setActionProgress({ done, total }), () => abortAction.current);
        const verb = mode === "upload" ? "Re-uploaded" : "Forwarded";
        const msg = `${verb} ${outcome.completed} to ${targetLabel(targetId)}` + (outcome.failed ? `, ${outcome.failed} failed` : "");
        showToast(msg, outcome.failed ? Toasts.Type.FAILURE : Toasts.Type.SUCCESS);
    };

    const run = async () => {
        if (!matched.length) return;
        abortAction.current = false;
        setCancelling(false);
        setBusy(true);
        try {
            if (mode === "download") await runDownload();
            else await runTransfer();
        } finally {
            setBusy(false);
            setCancelling(false);
            setActionProgress(null);
        }
    };

    // Flips the shared abort flag; the active download/upload/forward loop checks
    // it between items and stops as soon as the current file finishes.
    const cancel = () => {
        abortAction.current = true;
        setCancelling(true);
    };

    // Following reuses whatever action is selected above: save new files to a
    // folder, re-upload them, or forward them to the chosen target channel.
    const enableFollow = async () => {
        const base = { channelId: channel.id, channelName: channelLabel(channel), filter };
        if (mode === "download") {
            let dir = FollowStore.get(channel.id)?.dir;
            if (!dir) {
                dir = (await pickDirectory()) ?? undefined;
                if (!dir) return;
            }
            FollowStore.set({ ...base, action: "download", dir });
        } else {
            if (!targetId) {
                showToast("Pick a target channel first.", Toasts.Type.FAILURE);
                return;
            }
            FollowStore.set({ ...base, action: mode, targetId });
        }
        showToast("Now following this channel for new files.", Toasts.Type.SUCCESS);
    };

    const followConfig = useFollowConfig(channel.id);
    const isFollowing = !!followConfig;
    const needsTarget = mode !== "download";
    const scanLabel = progress?.oldestTimestamp
        ? `Reached ${new Date(progress.oldestTimestamp).toLocaleDateString()}`
        : "Not scanned yet";

    const actionVerb = mode === "download" ? "Download" : mode === "upload" ? "Re-upload" : "Forward";
    const actionText = busy
        ? `${actionVerb}ing ${actionProgress?.done ?? 0}/${actionProgress?.total ?? 0}...`
        : `${actionVerb} ${matched.length} file${matched.length === 1 ? "" : "s"}`;

    return (
        <Modal
            onClose={onClose}
            transitionState={transitionState}
            size="md"
            title="Asset Downloader"
            subtitle={`Collect every attachment from ${channelLabel(channel)} and download, re-upload or forward them.`}
            actions={[
                { text: "Close", variant: "secondary", onClick: onClose },
                busy
                    ? {
                        text: cancelling ? "Cancelling..." : `Cancel (${actionProgress?.done ?? 0}/${actionProgress?.total ?? 0})`,
                        variant: "dangerPrimary",
                        onClick: cancel,
                        disabled: cancelling
                    }
                    : {
                        text: actionText,
                        variant: "primary",
                        onClick: run,
                        disabled: !matched.length || (needsTarget && !targetId)
                    }
            ]}
        >
            <Flex flexDirection="column" gap={16} style={{ padding: "4px 0 8px" }}>
                <FilterControls filter={filter} onChange={setFilter} />

                <Flex
                    gap={8}
                    style={{ background: "var(--background-secondary)", borderRadius: 6, padding: "12px 16px" }}
                >
                    <Stat label="Files matched" value={String(matched.length)} />
                    <Stat label="Total size" value={formatSize(matchedSize)} />
                    <Stat label="Messages scanned" value={String(progress?.messagesScanned ?? 0)} />
                </Flex>

                <Flex alignItems="center" gap={8}>
                    {scanning
                        ? <Button variant="dangerPrimary" size="small" onClick={stopScan}>Stop scan</Button>
                        : <Button variant="primary" size="small" onClick={startScan}>
                            {assets.length ? "Rescan history" : "Scan history"}
                        </Button>
                    }
                    <span style={statLabel}>
                        {scanning ? `Scanning... ${scanLabel}` : progress ? scanLabel : "Scan to find attachments in this channel."}
                    </span>
                </Flex>

                <div style={{ borderTop: "1px solid var(--background-modifier-accent)", paddingTop: 12 }}>
                    <Flex justifyContent="space-between" alignItems="center" style={{ marginBottom: 6 }}>
                        <span style={{ color: "var(--header-secondary)", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
                            Parallel downloads
                        </span>
                        <span style={{ color: "var(--text-normal)", fontSize: 13, fontWeight: 600 }}>{concurrency}×</span>
                    </Flex>
                    <Slider
                        initialValue={concurrency}
                        minValue={1}
                        maxValue={8}
                        markers={CONCURRENCY_MARKERS}
                        stickToMarkers
                        onValueChange={(v: number) => setConcurrency(Math.max(1, Math.min(16, Math.round(v))))}
                    />
                    <span style={statLabel}>How many files to fetch at once when saving or re-uploading.</span>
                </div>

                <div style={{ borderTop: "1px solid var(--background-modifier-accent)", paddingTop: 12 }}>
                    <div style={{ color: "var(--header-secondary)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
                        What to do with them
                    </div>
                    <Flex flexDirection="column" gap={8}>
                        <ModeSelector mode={mode} onChange={setMode} />
                        {needsTarget && (
                            <SearchableSelect
                                options={targetOptions}
                                value={targetId ?? undefined}
                                onChange={(v: string) => setTargetId(v)}
                                placeholder={`Select a channel to ${mode === "upload" ? "re-upload" : "forward"} to...`}
                                maxVisibleItems={6}
                                closeOnSelect
                            />
                        )}
                        {mode === "forward" && (
                            <span style={statLabel}>Forwards the original messages (one forward per source message, all its attachments included).</span>
                        )}
                    </Flex>
                </div>

                <Flex
                    justifyContent="space-between"
                    alignItems="center"
                    style={{ borderTop: "1px solid var(--background-modifier-accent)", paddingTop: 12 }}
                >
                    <Flex flexDirection="column" gap={2}>
                        <span style={{ color: "var(--text-normal)", fontSize: 14, fontWeight: 600 }}>Always follow</span>
                        <span style={statLabel}>
                            {followConfig
                                ? describeFollow(followConfig)
                                : needsTarget && !targetId
                                    ? `Pick a target channel to auto-${actionVerb.toLowerCase()} new files.`
                                    : `Auto-${actionVerb.toLowerCase()} new matching files using the action above.`}
                        </span>
                    </Flex>
                    {isFollowing
                        ? <Button variant="dangerPrimary" size="small" onClick={() => { FollowStore.remove(channel.id); showToast("Stopped following.", Toasts.Type.SUCCESS); }}>
                            Stop following
                        </Button>
                        : <Button variant="positive" size="small" onClick={enableFollow}>
                            Follow channel
                        </Button>
                    }
                </Flex>
            </Flex>
        </Modal>
    );
}

export function openAssetDownloaderModal(channel: Channel) {
    openModal(props => <AssetDownloaderModal channel={channel} {...props} />);
}
