import * as fs from 'node:fs/promises';

async function main() {
    const packageJson = JSON.parse(await fs.readFile('package.json', 'utf-8'));
    packageJson.name = 'pua-bot-local';
    delete packageJson.scripts;
    delete packageJson.devDependencies;
    for (const key in packageJson.dependencies) {
        if (key.startsWith('@pua-bot/')) {
            delete packageJson.dependencies[key];
        }
    }
    await fs.writeFile('package-docker.json', `${JSON.stringify(packageJson, null, 4)}\n`);
}

main().catch(console.error);
