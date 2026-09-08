import { createCli, defineCommand } from '@cliffx/core';

/** The CLI owns parsing and presentation; the Engine never sees cliff context. */
export interface DispatchCommand {
  name: string;
  description: string;
  run: (args: string[]) => Promise<void>;
}

/**
 * Use cliff's command registration and routing with explicit, trusted commands.
 * The argument tail is deliberately opaque: the composition root validates it
 * and owns help/version, including literal paths after `--`.
 *
 * The three embedding options are the documented, pinned vendor patch. They
 * prevent configuration discovery, update requests and process termination.
 */
export async function dispatch(commands: DispatchCommand[], argv: string[]): Promise<void> {
  const names = new Set<string>();
  for (const command of commands) {
    if (!/^[a-z][a-z0-9-]*$/.test(command.name) || names.has(command.name)) {
      throw new Error(`Invalid or duplicate command registration: ${command.name}`);
    }
    names.add(command.name);
  }
  if (!argv[0] || !names.has(argv[0])) {
    throw new Error(`Unknown command: ${argv[0] ?? '(empty)'}`);
  }

  const cli = createCli({
    name: 'xray',
    // Version output is owned by the CLI; never start cliff's registry checker.
    checkUpdates: false,
    loadConfig: false,
    errorMode: 'throw',
    plugins: [],
  });
  for (const command of commands) {
    cli.register(defineCommand({
      name: command.name,
      description: command.description,
      async run() {
        await command.run(argv.slice(1));
      },
    }).def);
  }

  // No discover()/discoverAllPlugins(): analyzed repositories are untrusted data.
  await cli.run([argv[0]]);
}
