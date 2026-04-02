import { describe, expect, it } from "vitest";
import { validateConfigObject } from "./validation.js";

describe("routing.groups config", () => {
  it("accepts per-group custom prompt overlays", () => {
    const res = validateConfigObject({
      routing: {
        groups: {
          "120363404558800441@g.us": {
            agentFile: ".claude/agents/chief-of-staff.md",
            extraInstructions: "Prioritize inbox triage before other tasks.",
          },
        },
      },
    });

    expect(res.ok).toBe(true);
  });
});
