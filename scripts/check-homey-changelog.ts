import fs from 'node:fs'

const version = process.env.CHANGELOG_VERSION

if (!version) {
  throw new Error('CHANGELOG_VERSION must be set')
}

const changelog = JSON.parse(
  fs.readFileSync('.homeychangelog.json', 'utf8')
) as Record<string, { en?: string }>

const entry = changelog[version]

if (!entry || typeof entry.en !== 'string' || entry.en.trim() === '') {
  console.error(
    `Missing changelog entry for ${version} in .homeychangelog.json`
  )
  process.exit(1)
}
