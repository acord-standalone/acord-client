/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Flex } from "@components/Flex";
import { Paragraph } from "@components/Paragraph";
import { Margins } from "@utils/margins";
import { OptionType } from "@utils/types";
import { Alerts, useEffect, useState } from "@webpack/common";

import { clearAllLocks, lockedCount, subscribeLocks } from "./store";

function ResetLocks() {
    const [count, setCount] = useState(lockedCount());
    useEffect(() => subscribeLocks(() => setCount(lockedCount())), []);

    return (
        <Flex flexDirection="column" style={{ gap: 8 }}>
            <Paragraph color="text-muted">
                {count === 0
                    ? "No channels are locked right now."
                    : `${count} channel${count === 1 ? " is" : "s are"} locked.`}
            </Paragraph>
            <Button
                variant="dangerPrimary"
                disabled={count === 0}
                onClick={() => Alerts.show({
                    title: "Reset all passwords?",
                    body: "This removes the password from every locked channel. This cannot be undone.",
                    confirmText: "Reset all",
                    confirmColor: "vc-text-danger",
                    cancelText: "Cancel",
                    onConfirm: clearAllLocks,
                })}
            >
                Reset all passwords
            </Button>
        </Flex>
    );
}

export const settings = definePluginSettings({
    rememberMinutes: {
        type: OptionType.SLIDER,
        description: "Remember a channel's password this many minutes after unlocking. 0 asks again every time you open the channel.",
        default: 0,
        markers: [0, 5, 15, 30, 60, 120, 240],
    },
    blurAmount: {
        type: OptionType.SLIDER,
        description: "Blur intensity of the lock screen",
        default: 16,
        markers: [4, 8, 12, 16, 20, 24, 28],
    },
    reset: {
        type: OptionType.COMPONENT,
        description: "Reset all channel passwords",
        component: () => (
            <ErrorBoundary noop>
                <div className={Margins.top8}>
                    <ResetLocks />
                </div>
            </ErrorBoundary>
        ),
    },
});
