export interface CommandResult {
  readonly exitCode: number;
  readonly stdout?: string;
  readonly stderr?: string;
}
