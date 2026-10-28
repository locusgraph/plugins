import { main } from "./main.ts";

const result = await main(process.argv.slice(2));
if (result.stdout !== undefined) process.stdout.write(result.stdout);
if (result.stderr !== undefined) process.stderr.write(result.stderr);
process.exitCode = result.exitCode;
