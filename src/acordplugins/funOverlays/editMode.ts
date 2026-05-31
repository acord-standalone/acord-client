/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

type Listener = (v: boolean) => void;

let value = false;
const listeners = new Set<Listener>();

export const EditModeStore = {
  get: () => value,
  set(v: boolean) {
    if (v === value) return;
    value = v;
    for (const l of listeners) {
      try { l(v); } catch { /* ignore */ }
    }
  },
  toggle() { this.set(!value); },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
  }
};
