/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addMessagePreSendListener, type MessageSendListener, removeMessagePreSendListener } from "@api/MessageEvents";
import { definePluginSettings } from "@api/Settings";
import { ErrorBoundary } from "@components/index";
import { AcordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Button, React, TextInput, useState } from "@webpack/common";

// Invisible characters to insert between letters (randomly picked each time)
const INVISIBLE_CHARS = [
    "\u200B", // zero-width space
    "\u200C", // zero-width non-joiner
    "\u200D", // zero-width joiner
    "\u2060", // word joiner
    "\uFEFF", // zero-width no-break space
    "\u180E", // mongolian vowel separator
    "\u00AD", // soft hyphen
    "\u034F", // combining grapheme joiner
    "\u17B5", // khmer vowel inherent aa
    "\u{E0000}", // tag
];

function obfuscateWord(word: string): string {
    return word.split("").join(INVISIBLE_CHARS[Math.floor(Math.random() * INVISIBLE_CHARS.length)]);
}

function getWords(): string[] {
    return settings.store.words
        .split(",")
        .map(w => w.trim())
        .filter(Boolean);
}

function applyObfuscation(content: string): string {
    const words = getWords();
    if (words.length === 0) return content;

    for (const word of words) {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escaped, "gi");
        content = content.replace(regex, match => obfuscateWord(match));
    }
    return content;
}

function WordListSettings() {
    const { words } = settings.use(["words"]);
    const [input, setInput] = useState("");
    const list = words.split(",").map(w => w.trim()).filter(Boolean);

    function addWord() {
        const trimmed = input.trim();
        if (!trimmed || list.includes(trimmed)) { setInput(""); return; }
        settings.store.words = [...list, trimmed].join(",");
        setInput("");
    }

    function removeWord(word: string) {
        settings.store.words = list.filter(w => w !== word).join(",");
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", gap: "8px" }}>
                <TextInput
                    value={input}
                    onChange={setInput}
                    placeholder="Add a word..."
                    onKeyDown={e => { if (e.key === "Enter") addWord(); }}
                    style={{ flex: 1 }}
                />
                <Button onClick={addWord} size={Button.Sizes.SMALL}>Add</Button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {list.length === 0 && (
                    <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>No words added yet.</span>
                )}
                {list.map(word => (
                    <div
                        key={word}
                        style={{
                            display: "flex", alignItems: "center", gap: "4px",
                            background: "var(--background-secondary-alt)",
                            borderRadius: "4px", padding: "2px 8px", fontSize: "13px"
                        }}
                    >
                        <span style={{ color: "var(--text-normal)" }}>{word}</span>
                        <span
                            style={{ cursor: "pointer", color: "var(--text-muted)", marginLeft: "2px" }}
                            onClick={() => removeWord(word)}
                        >✕</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

const settings = definePluginSettings({
    words: {
        type: OptionType.STRING,
        description: "Comma-separated list of words to obfuscate",
        default: "",
        hidden: true,
    },
    wordList: {
        type: OptionType.COMPONENT,
        description: "Words to obfuscate (invisible characters will be inserted between each letter before sending)",
        component: () => <ErrorBoundary noop><WordListSettings /></ErrorBoundary>,
    },
});

let preSendListener: MessageSendListener;

export default definePlugin({
    name: "GoodWords",
    description: "Inserts invisible characters between letters of configured words before sending, bypassing word filters.",
    authors: [AcordDevs.TheArmagan],
    settings,
    start() {
        preSendListener = addMessagePreSendListener((_channelId, msg) => {
            msg.content = applyObfuscation(msg.content);
        });
    },
    stop() {
        removeMessagePreSendListener(preSendListener);
    }
});
