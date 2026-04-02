import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../../config/config.js";
import { logVerbose } from "../../globals.js";

function stripLeadingFrontmatter(content: string): string {
  if (!content.startsWith("---")) {
    return content.trim();
  }
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)?/, "").trim();
}

export async function readPerGroupPromptOverlay(params: {
  cfg: OpenClawConfig;
  groupId?: string;
  workspaceDir: string;
}): Promise<string | undefined> {
  const groupId = params.groupId?.trim();
  if (!groupId) {
    return undefined;
  }

  const perGroup = params.cfg.routing?.groups?.[groupId];
  if (!perGroup) {
    return undefined;
  }

  let agentFileContent: string | undefined;
  const agentFile = perGroup.agentFile?.trim();
  if (agentFile) {
    const resolvedPath = path.isAbsolute(agentFile)
      ? agentFile
      : path.resolve(params.workspaceDir, agentFile);
    try {
      const raw = await fs.readFile(resolvedPath, "utf-8");
      agentFileContent = stripLeadingFrontmatter(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logVerbose(
        `Failed to read routing.groups[${groupId}].agentFile (${resolvedPath}): ${message}`,
      );
    }
  }

  const extraInstructions = perGroup.extraInstructions?.trim();
  const overlay = [agentFileContent, extraInstructions].filter(Boolean).join("\n\n").trim();
  return overlay || undefined;
}
