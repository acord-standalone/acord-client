/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Flex } from "@components/Flex";
import { Checkbox, React, TextInput } from "@webpack/common";

import { FILTER_CATEGORIES, FilterConfig } from "./filters";

const labelStyle: React.CSSProperties = {
    color: "var(--header-secondary)",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    marginBottom: 6
};

export function FilterControls({ filter, onChange }: { filter: FilterConfig; onChange(next: FilterConfig): void; }) {
    const [extText, setExtText] = React.useState(filter.extensions.join(", "));

    const toggleCategory = (id: string) => {
        const has = filter.categories.includes(id);
        const categories = has
            ? filter.categories.filter(c => c !== id)
            : [...filter.categories, id];
        onChange({ ...filter, categories });
    };

    const commitExtensions = (raw: string) => {
        setExtText(raw);
        const extensions = raw
            .split(/[\s,]+/)
            .map(s => s.trim().replace(/^\./, "").toLowerCase())
            .filter(Boolean);
        onChange({ ...filter, extensions });
    };

    const nothingSelected = !filter.categories.length && !filter.extensions.length;

    return (
        <Flex flexDirection="column" gap={12}>
            <div>
                <div style={labelStyle}>File types</div>
                <Flex flexWrap="wrap" gap={4}>
                    {FILTER_CATEGORIES.map(cat => (
                        <div
                            key={cat.id}
                            style={{
                                background: "var(--background-secondary)",
                                borderRadius: 4,
                                padding: "6px 10px"
                            }}
                        >
                            <Checkbox
                                value={filter.categories.includes(cat.id)}
                                onChange={() => toggleCategory(cat.id)}
                                size={18}
                            >
                                <span style={{ fontSize: 14, color: "var(--text-normal)" }}>{cat.label}</span>
                            </Checkbox>
                        </div>
                    ))}
                </Flex>
            </div>

            <div>
                <div style={labelStyle}>Custom extensions</div>
                <TextInput
                    value={extText}
                    onChange={commitExtensions}
                    placeholder="e.g. psd, ai, blend"
                />
                <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>
                    {nothingSelected
                        ? "Nothing selected — every attachment will be included."
                        : "Comma or space separated. Combined with the selected file types above."}
                </div>
            </div>
        </Flex>
    );
}
