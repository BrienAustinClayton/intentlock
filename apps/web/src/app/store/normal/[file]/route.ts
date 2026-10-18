export const instant = false;

import { type NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Manifest – list of allowed normal filenames (validated once at module load)
// ---------------------------------------------------------------------------

type ManifestEntry = { file: string; kind: string };

function loadAllowedFiles(kind: "attack" | "normal"): Set<string> {
  const manifestPath = path.join(
    process.cwd(),
    "../../data/lab/pages/manifest.json"
  );
  const entries: ManifestEntry[] = JSON.parse(
    fs.readFileSync(manifestPath, "utf-8")
  );
  return new Set(
    entries
      .filter((e) => e.kind === kind)
      .map((e) => path.basename(e.file))
  );
}

const ALLOWED = loadAllowedFiles("normal");
const PAGES_DIR = path.join(process.cwd(), "../../data/lab/pages/normal");

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file: string }> }
): Promise<NextResponse> {
  const { file } = await params;

  // Reject before allowlist lookup if the value contains path-traversal characters
  if (file.includes("/") || file.includes("\\") || file.includes("\0") || file !== path.basename(file)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const basename = file;
  if (!ALLOWED.has(basename)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = path.join(PAGES_DIR, basename);
  let html: string;
  try {
    html = fs.readFileSync(filePath, "utf-8");
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
