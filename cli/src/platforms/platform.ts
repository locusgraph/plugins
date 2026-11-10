export interface InitEnvironment {
  readonly cwd: string;
  readonly home: string;
  readonly rules: string;
  readonly hookScript: string;
  // CLAUDE_CONFIG_DIR when set: Claude Code reads its settings from there instead of ~/.claude.
  readonly claudeConfigDir?: string;
}

export interface InstallContext extends InitEnvironment {
  readonly engineUrl: string;
  readonly mcpUrl: string;
}

export interface Platform {
  readonly id: string;
  readonly label: string;
  readonly writesGlobal?: string;
  nextStep?(context: InstallContext): string | undefined;
  detect(context: InstallContext): boolean;
  install(context: InstallContext): Promise<readonly string[]>;
}
