import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSaveLifecycle } from "@/components/admin/ui/useSaveState";

describe("classic admin save lifecycle", () => {
  const persist = async () => {};

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the persistence result before the display finishes its full cycle", async () => {
    const publish = vi.fn();
    const lifecycle = createSaveLifecycle(publish);

    await lifecycle.save(persist);
    expect(publish.mock.calls).toEqual([["saving"]]);

    await vi.advanceTimersByTimeAsync(399);
    expect(publish).toHaveBeenLastCalledWith("saving");
    await vi.advanceTimersByTimeAsync(1);
    expect(publish).toHaveBeenLastCalledWith("saved");

    await vi.advanceTimersByTimeAsync(1899);
    expect(publish).toHaveBeenLastCalledWith("saved");
    await vi.advanceTimersByTimeAsync(1);
    expect(publish.mock.calls).toEqual([["saving"], ["saved"], ["idle"]]);
  });

  it("waits for a slow save and starts the confirmation hold when it succeeds", async () => {
    const publish = vi.fn();
    const lifecycle = createSaveLifecycle(publish);
    const operation = lifecycle.save(() => new Promise((resolve) => setTimeout(resolve, 750)));

    await vi.advanceTimersByTimeAsync(749);
    expect(publish.mock.calls).toEqual([["saving"]]);
    await vi.advanceTimersByTimeAsync(1);
    await operation;
    expect(publish).toHaveBeenLastCalledWith("saved");
    await vi.advanceTimersByTimeAsync(1899);
    expect(publish).toHaveBeenLastCalledWith("saved");
    await vi.advanceTimersByTimeAsync(1);
    expect(publish).toHaveBeenLastCalledWith("idle");
  });

  it("blocks duplicates before a save settles and during its remaining minimum hold", async () => {
    const publish = vi.fn();
    const lifecycle = createSaveLifecycle(publish);
    const duplicate = vi.fn(persist);
    const operation = lifecycle.save(persist);

    await lifecycle.save(duplicate);
    await operation;
    await lifecycle.save(duplicate);
    expect(duplicate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    lifecycle.dismissSaved();
    await lifecycle.save(duplicate);
    expect(duplicate).toHaveBeenCalledOnce();
    await vi.runAllTimersAsync();
  });

  it("surfaces rejection immediately and clears Saving without showing Saved", async () => {
    const publish = vi.fn();
    const lifecycle = createSaveLifecycle(publish);
    const error = new Error("Save failed");

    await expect(lifecycle.save(async () => { throw error; })).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(399);
    expect(publish.mock.calls).toEqual([["saving"]]);
    await vi.advanceTimersByTimeAsync(1);
    await vi.runAllTimersAsync();
    expect(publish.mock.calls).toEqual([["saving"], ["idle"]]);
  });

  it("dismisses confirmation as soon as the draft changes and cancels its expiry", async () => {
    const publish = vi.fn();
    const lifecycle = createSaveLifecycle(publish);

    await lifecycle.save(persist);
    await vi.advanceTimersByTimeAsync(400);
    lifecycle.dismissSaved();
    expect(publish.mock.calls).toEqual([["saving"], ["saved"], ["idle"]]);

    await vi.advanceTimersByTimeAsync(2500);
    expect(publish).toHaveBeenCalledTimes(3);
  });

  it("ignores a completion from before cleanup without disturbing a new save", async () => {
    const publish = vi.fn();
    const lifecycle = createSaveLifecycle(publish);
    const previous = lifecycle.save(() => new Promise((resolve) => setTimeout(resolve, 450)));
    lifecycle.cancel();
    lifecycle.reset();

    const current = lifecycle.save(() => new Promise((resolve) => setTimeout(resolve, 700)));
    await vi.advanceTimersByTimeAsync(450);
    await previous;
    expect(publish.mock.calls).toEqual([["saving"], ["idle"], ["saving"]]);
    await vi.advanceTimersByTimeAsync(250);
    await current;
    expect(publish).toHaveBeenLastCalledWith("saved");
    lifecycle.cancel();

    await vi.runAllTimersAsync();
    expect(publish.mock.calls).toEqual([["saving"], ["idle"], ["saving"], ["saved"]]);
  });
});
