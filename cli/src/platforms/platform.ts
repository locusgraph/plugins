export interface InstallContext {
  readonly cwd: string;
  readonly home: string;
  readonly rules: string;
  readonly hookScript: string;
}

export interface Platform {
  readonly id: string;
  readonly label: string;
  readonly writesGlobal?: string;
  readonly nextStep?: string;
  detect(context: InstallContext): boolean;
  install(context: InstallContext): Promise<readonly string[]>;
}
