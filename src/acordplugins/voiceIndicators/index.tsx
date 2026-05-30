/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { AcordDevs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "VoiceIndicators",
    description: "Shows indicators for who is muted, deafened, or streaming in voice channels. Even for the who you are not connected to.",
    authors: [AcordDevs.TheArmagan],
    flux: {}
});
