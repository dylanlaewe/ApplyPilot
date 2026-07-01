import { NextResponse } from "next/server";

import { getApplicantProfile, saveApplicantProfile } from "@/lib/profile";
import { removeResumeFile, saveResumeFile } from "@/lib/resumeStorage";
import { humanizeError } from "@/lib/safety";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("resume");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Please choose a resume file first." }, { status: 400 });
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["pdf", "docx"].includes(extension)) {
      return NextResponse.json({ error: "Unsupported file type. Please upload a PDF or DOCX resume." }, { status: 400 });
    }

    const existingProfile = await getApplicantProfile();
    const uploaded = await saveResumeFile(file);
    if (existingProfile.resume.storedPath && existingProfile.resume.storedPath !== uploaded.storedPath) {
      await removeResumeFile(existingProfile.resume.storedPath);
    }

    const savedProfile = await saveApplicantProfile({
      ...existingProfile,
      resume: {
        originalFilename: uploaded.originalFilename,
        storedPath: uploaded.storedPath,
        mimeType: uploaded.mimeType,
        fileSize: uploaded.fileSize,
        uploadedAt: new Date().toISOString(),
        fileExists: true
      }
    });

    return NextResponse.json({ profile: savedProfile, resume: savedProfile.resume });
  } catch (error) {
    return NextResponse.json({ error: humanizeError(error) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const existingProfile = await getApplicantProfile();
    if (existingProfile.resume.storedPath) {
      await removeResumeFile(existingProfile.resume.storedPath);
    }

    const savedProfile = await saveApplicantProfile({
      ...existingProfile,
      resume: {
        originalFilename: "",
        storedPath: "",
        mimeType: "",
        fileSize: 0,
        uploadedAt: "",
        fileExists: false
      }
    });

    return NextResponse.json({ profile: savedProfile, resume: savedProfile.resume });
  } catch (error) {
    return NextResponse.json({ error: humanizeError(error) }, { status: 500 });
  }
}
