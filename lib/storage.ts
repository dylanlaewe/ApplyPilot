import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

const writeQueues = new Map<string, Promise<void>>();

export async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
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
  const pending = writeQueues.get(filePath) ?? Promise.resolve();
  const nextWrite = pending.then(async () => {
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tempPath, filePath);
  });

  writeQueues.set(
    filePath,
    nextWrite.catch(() => {
      return;
    })
  );

  await nextWrite;
}
