export type PerGroupRoutingConfig = {
  /** Path to an agent file to inject for this group (relative to workspace or absolute). */
  agentFile?: string;
  /** Additional inline instructions to inject for this group. */
  extraInstructions?: string;
};

export type RoutingConfig = {
  /** Custom per-group prompt overlays keyed by group id/JID. */
  groups?: Record<string, PerGroupRoutingConfig>;
};
