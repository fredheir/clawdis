import fs from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTempHome as withTempHomeBase } from "../../../test/helpers/temp-home.js";

vi.mock("../../agents/auth-profiles/session-override.js", () => ({
  resolveSessionAuthProfileOverride: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../agents/pi-embedded.runtime.js", () => ({
  abortEmbeddedPiRun: vi.fn().mockReturnValue(false),
  isEmbeddedPiRunActive: vi.fn().mockReturnValue(false),
  isEmbeddedPiRunStreaming: vi.fn().mockReturnValue(false),
  resolveActiveEmbeddedRunSessionId: vi.fn().mockReturnValue(undefined),
  resolveEmbeddedSessionLane: vi.fn().mockReturnValue("session:session-key"),
}));

vi.mock("../../config/sessions/group.js", () => ({
  resolveGroupSessionKey: vi.fn().mockReturnValue({ id: "120363404558800441@g.us" }),
}));

vi.mock("../../config/sessions/paths.js", () => ({
  resolveSessionFilePath: vi.fn().mockReturnValue("/tmp/session.jsonl"),
  resolveSessionFilePathOptions: vi.fn().mockReturnValue({}),
}));

vi.mock("../../globals.js", () => ({
  logVerbose: vi.fn(),
}));

vi.mock("../../process/command-queue.js", () => ({
  clearCommandLane: vi.fn().mockReturnValue(0),
  getQueueSize: vi.fn().mockReturnValue(0),
}));

vi.mock("../../routing/session-key.js", () => ({
  normalizeMainKey: vi.fn().mockReturnValue("main"),
  normalizeAgentId: vi.fn((id?: string) => id ?? "default"),
}));

vi.mock("../../utils/provider-utils.js", () => ({
  isReasoningTagProvider: vi.fn().mockReturnValue(false),
}));

vi.mock("../command-detection.js", () => ({
  hasControlCommand: vi.fn().mockReturnValue(false),
}));

const runReplyAgent = vi.hoisted(() => vi.fn().mockResolvedValue({ text: "ok" }));

vi.mock("./agent-runner.runtime.js", () => ({
  runReplyAgent,
}));

vi.mock("./body.js", () => ({
  applySessionHints: vi.fn().mockImplementation(async ({ baseBody }) => baseBody),
}));

vi.mock("./groups.js", () => ({
  buildGroupIntro: vi.fn().mockReturnValue(""),
  buildGroupChatContext: vi.fn().mockReturnValue(""),
}));

vi.mock("./inbound-meta.js", () => ({
  buildInboundMetaSystemPrompt: vi.fn().mockReturnValue(""),
  buildInboundUserContextPrefix: vi.fn().mockReturnValue(""),
}));

vi.mock("./queue/settings.js", () => ({
  resolveQueueSettings: vi.fn().mockReturnValue({ mode: "followup" }),
}));

vi.mock("./route-reply.runtime.js", () => ({
  routeReply: vi.fn(),
}));

vi.mock("./session-updates.runtime.js", () => ({
  ensureSkillSnapshot: vi.fn().mockImplementation(async ({ sessionEntry, systemSent }) => ({
    sessionEntry,
    systemSent,
    skillsSnapshot: undefined,
  })),
}));

vi.mock("./session-system-events.js", () => ({
  drainFormattedSystemEvents: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./typing-mode.js", () => ({
  resolveTypingMode: vi.fn().mockReturnValue("off"),
}));

let runPreparedReply: typeof import("./get-reply-run.js").runPreparedReply;

async function loadFreshGetReplyRunModuleForTest() {
  vi.resetModules();
  ({ runPreparedReply } = await import("./get-reply-run.js"));
}

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  return withTempHomeBase(fn, {
    env: {
      OPENCLAW_BUNDLED_SKILLS_DIR: (home) => path.join(home, "bundled-skills"),
    },
    prefix: "openclaw-routing-groups-",
  });
}

function baseParams(
  workspaceDir: string,
  overrides: Partial<Parameters<typeof runPreparedReply>[0]> = {},
): Parameters<typeof runPreparedReply>[0] {
  return {
    ctx: {
      Body: "hello team",
      RawBody: "hello team",
      CommandBody: "hello team",
      OriginatingChannel: "whatsapp",
      OriginatingTo: "+15550001111",
      ChatType: "group",
    },
    sessionCtx: {
      Body: "hello team",
      BodyStripped: "hello team",
      Provider: "whatsapp",
      Surface: "whatsapp",
      ChatType: "group",
      From: "120363404558800441@g.us",
      GroupSubject: "Chiefs",
      OriginatingChannel: "whatsapp",
      OriginatingTo: "+15550001111",
    },
    cfg: {
      session: {},
      channels: { whatsapp: { allowFrom: ["*"] } },
      agents: { defaults: {} },
      routing: {
        groups: {
          "120363404558800441@g.us": {
            agentFile: ".claude/agents/chief-of-staff.md",
            extraInstructions: "Inline override for the Chiefs group.",
          },
        },
      },
    },
    agentId: "default",
    agentDir: "/tmp/agent",
    agentCfg: {},
    sessionCfg: {},
    commandAuthorized: true,
    command: {
      surface: "whatsapp",
      channel: "whatsapp",
      isAuthorizedSender: true,
      abortKey: "session-key",
      ownerList: [],
      senderIsOwner: false,
      rawBodyNormalized: "hello team",
      commandBodyNormalized: "hello team",
    } as never,
    commandSource: "",
    allowTextCommands: true,
    directives: {
      hasThinkDirective: false,
      thinkLevel: undefined,
    } as never,
    defaultActivation: "mention",
    resolvedThinkLevel: "high",
    resolvedVerboseLevel: "off",
    resolvedReasoningLevel: "off",
    resolvedElevatedLevel: "off",
    elevatedEnabled: false,
    elevatedAllowed: false,
    blockStreamingEnabled: false,
    resolvedBlockStreamingBreak: "message_end",
    modelState: {
      resolveDefaultThinkingLevel: async () => "medium",
    } as never,
    provider: "anthropic",
    model: "claude-opus-4-1",
    typing: {
      onReplyStart: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn(),
    } as never,
    defaultProvider: "anthropic",
    defaultModel: "claude-opus-4-1",
    timeoutMs: 30_000,
    isNewSession: true,
    resetTriggered: false,
    systemSent: true,
    sessionKey: "session-key",
    workspaceDir,
    abortedLastRun: false,
    ...overrides,
  };
}

describe("runPreparedReply per-group prompt overlays", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadFreshGetReplyRunModuleForTest();
  });

  it("injects routing.groups agentFile and extraInstructions into the extra system prompt", async () => {
    await withTempHome(async (home) => {
      const workspaceDir = path.join(home, "openclaw");
      const agentFilePath = path.join(workspaceDir, ".claude", "agents", "chief-of-staff.md");
      await fs.mkdir(path.dirname(agentFilePath), { recursive: true });
      await fs.writeFile(
        agentFilePath,
        [
          "---",
          "name: Chief of Staff",
          "---",
          "You are the operations coordinator for this group.",
        ].join("\n"),
        "utf-8",
      );

      const result = await runPreparedReply(baseParams(workspaceDir));
      expect(result).toEqual({ text: "ok" });

      const call = runReplyAgent.mock.calls[0]?.[0];
      expect(call?.followupRun.run.extraSystemPrompt).toContain(
        "You are the operations coordinator for this group.",
      );
      expect(call?.followupRun.run.extraSystemPrompt).toContain(
        "Inline override for the Chiefs group.",
      );
      expect(call?.followupRun.run.extraSystemPrompt).not.toContain("name: Chief of Staff");
    });
  });
});
