import { promises as fs } from "fs";
import path from "path";

export const DATA_DIR = path.join(process.cwd(), "data");

const writeQueues = new Map<string, Promise<void>>();

async function queueFileWrite<T>(filePath: string, work: () => Promise<T>) {
  const pending = writeQueues.get(filePath) ?? Promise.resolve();
  let result!: T;
  const nextWrite = pending.then(async () => {
    result = await work();
  });

  writeQueues.set(
    filePath,
    nextWrite.catch(() => {
      return;
    })
  );

  await nextWrite;
  return result;
}

export async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export function getDataDirPath() {
  return DATA_DIR;
}

export function getStorageFilePath(fileName: string) {
  return path.join(DATA_DIR, fileName);
}

async function ensureFile(filePath: string, initialData: unknown) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(initialData, null, 2), "utf8");
  }
}

export async function ensureStorageFile<T>(fileName: string, initialData: T) {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, fileName);
  await ensureFile(filePath, initialData);
  return filePath;
}

export async function readStorageFile<T>(fileName: string, initialData: T): Promise<T> {
  const filePath = await ensureStorageFile(fileName, initialData);
  const raw = await fs.readFile(filePath, "utf8");
  try {
    return JSON.parse(raw) as T;
  } catch {
    return initialData;
  }
}

export async function writeStorageFile<T>(fileName: string, data: T) {
  const filePath = await ensureStorageFile(fileName, data);
  await queueFileWrite(filePath, async () => {
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tempPath, filePath);
  });
}

export async function updateStorageFile<T>(
  fileName: string,
  initialData: T,
  updater: (current: T) => T | Promise<T>
) {
  const filePath = await ensureStorageFile(fileName, initialData);

  return queueFileWrite(filePath, async () => {
    let current = initialData;

    try {
      const raw = await fs.readFile(filePath, "utf8");
      current = JSON.parse(raw) as T;
    } catch {
      current = initialData;
    }

    const nextData = await updater(current);
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(nextData, null, 2), "utf8");
    await fs.rename(tempPath, filePath);
    return nextData;
  });
}
