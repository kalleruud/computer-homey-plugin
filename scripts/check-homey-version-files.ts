import fs from 'node:fs'

const expectedVersion = process.env.EXPECTED_VERSION

if (!expectedVersion) {
  throw new Error('EXPECTED_VERSION must be set')
}

const files = [
  ['package.json', 'package.json'],
  ['app.json', 'app.json'],
  ['.homeycompose/app.json', '.homeycompose/app.json'],
] as const

for (const [fileName, filePath] of files) {
  const file = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
    version?: string
  }
  const fileVersion = file.version

  if (fileVersion !== expectedVersion) {
    console.error(
      `PR branch version ${expectedVersion} does not match ${fileName} version ${fileVersion}`
    )
    process.exit(1)
  }
}
