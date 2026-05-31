/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { AcordDevs } from "@utils/constants";
import definePlugin from "@utils/types";

const REACTIONS = [
    "airkiss", "angrystare", "bite", "bleh", "blush", "brofist", "celebrate",
    "cheers", "clap", "confused", "cool", "cry", "cuddle", "dance", "drool",
    "evillaugh", "facepalm", "handhold", "happy", "headbang", "hug", "huh",
    "kiss", "laugh", "lick", "love", "mad", "nervous", "no", "nom", "nosebleed",
    "nuzzle", "nyah", "pat", "peek", "pinch", "poke", "pout", "punch", "roll",
    "run", "sad", "scared", "shout", "shrug", "shy", "sigh", "sing", "sip",
    "slap", "sleep", "slowclap", "smack", "smile", "smug", "sneeze", "sorry",
    "stare", "stop", "surprised", "sweat", "thumbsup", "tickle", "tired",
    "wave", "wink", "woah", "yawn", "yay", "yes"
];

async function fetchGif(reaction: string): Promise<string> {
    const res = await fetch(`https://api.otakugifs.xyz/gif?reaction=${encodeURIComponent(reaction)}&format=gif`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json() as { url: string; };
    return data.url;
}

export default definePlugin({
    name: "AnimeGifCommand",
    description: "Adds /animegif command to send anime reaction GIFs via otakugifs.xyz",
    authors: [AcordDevs.TheArmagan],
    dependencies: ["CommandsAPI"],
    commands: [
        {
            name: "animegif",
            description: "Send an anime reaction GIF",
            options: [
                {
                    name: "reaction",
                    description: "The reaction type",
                    type: ApplicationCommandOptionType.STRING,
                    required: true,
                    choices: REACTIONS.map(r => ({ label: r, name: r, value: r })),
                },
            ],
            execute: async (opts, ctx) => {
                const reaction = findOption<string>(opts, "reaction", "");

                if (!reaction) {
                    return sendBotMessage(ctx.channel.id, { content: "Please select a reaction." });
                }

                try {
                    const url = await fetchGif(reaction);
                    return { content: url };
                } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : String(e);
                    return sendBotMessage(ctx.channel.id, { content: `Failed to fetch GIF: ${msg}` });
                }
            },
        }
    ]
});
