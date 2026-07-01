import { promises as fs } from "fs";
import path from "path";

import { ensureDataDir } from "@/lib/storage";
import { slugify } from "@/lib/utils";

const RESUME_DIR = path.join(process.cwd(), "data", "resumes");

export async function ensureResumeDir() {
  await ensureDataDir();
  await fs.mkdir(RESUME_DIR, { recursive: true });
  return RESUME_DIR;
}

export async function saveResumeFile(file: File) {
  const resumeDir = await ensureResumeDir();
  const extension = path.extname(file.name || "").toLowerCase();
  const safeName = slugify(path.basename(file.name || "resume", extension)) || "resume";
  const storedFilename = `${Date.now()}-${safeName}${extension}`;
  const storedPath = path.join(resumeDir, storedFilename);

  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(storedPath, bytes);

  return {
    storedPath,
    originalFilename: file.name || storedFilename,
    mimeType: file.type || "",
    fileSize: bytes.byteLength
  };
}

export async function removeResumeFile(storedPath: string) {
  if (!storedPath) return;
  await fs.rm(storedPath, { force: true }).catch(() => {
    return;
  });
}
