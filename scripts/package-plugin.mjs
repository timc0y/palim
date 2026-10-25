import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function packagePlugin(origin) {
  const source = resolve(root, 'plugins/palim');
  const files = new Map();
  async function collect(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Plugin files must not be symbolic links.');
      if (entry.name.startsWith('.') && !['.codex-plugin', '.mcp.json'].includes(entry.name))
        throw new Error('Unexpected hidden file in plugin package.');
      if (entry.isDirectory()) await collect(path);
      else if (entry.isFile())
        files.set(relative(source, path).split(sep).join('/'), await readFile(path));
    }
  }
  await collect(source);
  for (const path of files.keys()) {
    if (
      !/^(?:\.codex-plugin\/plugin\.json|\.mcp\.json|README\.md|LICENSE|skills\/[a-z0-9-]+\/SKILL\.md|assets\/[a-z0-9-]+\.svg)$/.test(
        path,
      )
    )
      throw new Error(`Unexpected plugin file: ${path}`);
  }
  const manifest = JSON.parse(files.get('.codex-plugin/plugin.json').toString());
  const config = JSON.parse(files.get('.mcp.json').toString());
  if (
    Object.keys(config.mcpServers).join(',') !== 'palim' ||
    Object.keys(config.mcpServers.palim).some((key) => key !== 'url')
  )
    throw new Error(
      'Bundle exactly one URL-based OAuth connection; credentials and headers do not belong in the package.',
    );
  const url = new URL(origin || new URL(config.mcpServers.palim.url).origin);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    url.hostname.endsWith('.example') ||
    url.hostname === 'localhost'
  )
    throw new Error('Supply a real HTTPS origin without a path, credentials or query.');
  config.mcpServers.palim.url = `${url.origin}/mcp`;
  files.set('.mcp.json', Buffer.from(JSON.stringify(config, null, 2) + '\n'));
  const extension = { ...manifest.extensions['com.openai'], interface: manifest.interface };
  for (const path of [
    extension.onboardingSkill,
    extension.interface.logo,
    extension.interface.composerIcon,
  ]) {
    if (!path?.startsWith('./') || !files.has(path.slice(2)))
      throw new Error(`Missing packaged resource: ${path}`);
  }
  if (
    !files.has('skills/palim/SKILL.md') ||
    manifest.mcpServers !== './.mcp.json' ||
    manifest.skills !== './skills/'
  )
    throw new Error(
      'The complete workflow and authenticated MCP connection must be bundled together.',
    );
  const zip = new JSZip();
  for (const [path, data] of files)
    zip.file(path, data, { date: new Date('2000-01-01T00:00:00Z'), createFolders: false });
  const bytes = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    platform: 'DOS',
  });
  return {
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    endpoint: config.mcpServers.palim.url,
    files: [...files.keys()],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const built = await packagePlugin(process.argv[2]);
  for (const directory of ['public', 'artifacts']) {
    const path = resolve(root, directory, 'palim-plugin.zip');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, built.bytes);
    await writeFile(
      resolve(root, directory, 'palim-plugin.sha256'),
      `${built.sha256}  palim-plugin.zip\n`,
    );
  }
  console.log(
    JSON.stringify(
      {
        file: 'public/palim-plugin.zip',
        endpoint: built.endpoint,
        sha256: built.sha256,
        files: built.files,
        note: 'One package; no installation, OAuth grant or marketplace submission performed.',
      },
      null,
      2,
    ),
  );
}
