/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { HeaderBarButton } from "@api/HeaderBar";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { AcordDevs } from "@utils/constants";
import { closeModal, openModal } from "@utils/modal";
import definePlugin, { OptionType, StartAt } from "@utils/types";
import { Modal, React } from "@webpack/common";

import { mountOverlayLayer, unmountOverlayLayer } from "./OverlayLayer";
import { SettingsPanel } from "./SettingsPanel";
import { OverlayStore } from "./store";

function EditModeIcon({ height = 24, width = 24 }: { height?: number; width?: number; }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox="0 0 24 24" fill="none">
            <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function openManagerModal() {
    const key = openModal(props => (
        <Modal {...props} title="FunOverlays" size="lg">
            <div style={{ padding: 16 }}>
                <ErrorBoundary noop>
                    <SettingsPanel onClose={() => closeModal(key)} />
                </ErrorBoundary>
            </div>
        </Modal>
    ));
}

function EditModeHeaderButton() {
    return (
        <HeaderBarButton
            icon={EditModeIcon}
            tooltip="FunOverlays: manage overlays"
            onClick={openManagerModal}
        />
    );
}

const settings = definePluginSettings({
    manager: {
        type: OptionType.COMPONENT,
        description: "Manage overlays",
        component: () => <ErrorBoundary noop><SettingsPanel /></ErrorBoundary>
    }
});

export default definePlugin({
    name: "FunOverlays",
    description: "Pin images and gifs anywhere on the Discord UI. Drag, resize, snap to elements, scope per server/DM/route.",
    authors: [AcordDevs.TheArmagan],
    dependencies: ["HeaderBarAPI"],
    settings,
    startAt: StartAt.WebpackReady,
    headerBarButton: {
        icon: EditModeIcon,
        render: EditModeHeaderButton
    },
    async start() {
        await OverlayStore.init();
        mountOverlayLayer();
    },
    stop() {
        unmountOverlayLayer();
    }
});
