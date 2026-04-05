import fs from 'node:fs'
import path from 'node:path'

const app = JSON.parse(fs.readFileSync('app.json', 'utf8'))
const version = app.version
const changelogPath = path.join('changelogs', `v${version}.md`)

if (!fs.existsSync(changelogPath)) {
  throw new Error(`Missing changelog file: ${changelogPath}`)
}

const changelogText = fs
  .readFileSync(changelogPath, 'utf8')
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line.length > 0 && !line.startsWith('# '))
  .join('\n')

if (!changelogText) {
  throw new Error(`Changelog file is empty: ${changelogPath}`)
}

fs.writeFileSync(
  '.homeychangelog.json',
  `${JSON.stringify({ [version]: { en: changelogText } }, null, 2)}\n`
)
