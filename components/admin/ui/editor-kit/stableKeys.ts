"use client";

import { useRef } from "react";

let counter = 0;
export function newStableKey() {
  counter += 1;
  return `k${counter}`;
}

/**
 * Keep one key per item for lists whose items have no id of their own
 * (strings, table rows). The result has exactly `length` keys, reusing the
 * existing ones in order. Index-based keys would move a focused input's state
 * to its neighbour when an earlier row is removed.
 */
export function reconcileKeys(keys: readonly string[], length: number, make: () => string = newStableKey): string[] {
  if (keys.length === length) return keys as string[];
  if (keys.length > length) return keys.slice(0, length);
  const next = keys.slice();
  while (next.length < length) next.push(make());
  return next;
}

export function useStableKeys(length: number) {
  const keys = useRef<string[]>([]);
  keys.current = reconcileKeys(keys.current, length);
  return {
    keys: keys.current,
    /** Call with the same index you pass to onChange when removing. */
    removeAt(index: number) {
      keys.current = keys.current.filter((_, position) => position !== index);
    },
  };
}
