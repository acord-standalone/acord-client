/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { HeaderBarButton } from "@api/HeaderBar";
import ErrorBoundary from "@components/ErrorBoundary";
import { AcordDevs } from "@utils/constants";
import definePlugin, { StartAt } from "@utils/types";

import { TokenStore } from "./store";
import { openTokenManagerModal } from "./TokenManagerModal";

function TokenIcon({ height = 24, width = 24 }: { height?: number; width?: number; }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox="0 0 24 24" fill="none">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777Zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function TokenHeaderButton() {
    return (
        <HeaderBarButton
            icon={TokenIcon}
            tooltip="Token Login Manager"
            onClick={openTokenManagerModal}
        />
    );
}

export default definePlugin({
    name: "TokenLoginManager",
    description: "Save multiple account tokens with custom names and switch between accounts from a header bar button. Tokens are stored hidden.",
    authors: [AcordDevs.TheArmagan],
    dependencies: ["HeaderBarAPI"],
    startAt: StartAt.WebpackReady,
    headerBarButton: {
        icon: TokenIcon,
        render: () => <ErrorBoundary noop><TokenHeaderButton /></ErrorBoundary>
    },
    async start() {
        await TokenStore.init();
    }
});
