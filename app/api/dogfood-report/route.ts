import { NextResponse } from "next/server";

import { buildDogfoodMarkdownReport, buildDogfoodReport, buildDogfoodReportExport } from "@/lib/dogfoodReport";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const report = await buildDogfoodReport();
    const format = new URL(request.url).searchParams.get("format");

    if (format === "markdown") {
      return new NextResponse(buildDogfoodMarkdownReport(report), {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="applypilot-dogfood-report-${new Date().toISOString().slice(0, 10)}.md"`
        }
      });
    }

    return new NextResponse(JSON.stringify(buildDogfoodReportExport(report), null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="applypilot-dogfood-report-${new Date().toISOString().slice(0, 10)}.json"`
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not build the dogfood report." }, { status: 500 });
  }
}
