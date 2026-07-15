import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import test from "node:test";

import { getStorageFilePath, readStorageFile, updateStorageFile } from "@/lib/storage";

test("updateStorageFile serializes concurrent read-modify-write updates on the latest file contents", async () => {
  const fileName = `test-storage-update-${randomUUID()}.json`;

  try {
    await Promise.all([
      updateStorageFile<string[]>(fileName, [], async (current) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return [...current, "slow"];
      }),
      updateStorageFile<string[]>(fileName, [], async (current) => [...current, "fast"])
    ]);

    const stored = await readStorageFile<string[]>(fileName, []);
    assert.deepEqual(stored.sort(), ["fast", "slow"]);
  } finally {
    await rm(getStorageFilePath(fileName), { force: true }).catch(() => undefined);
  }
});
