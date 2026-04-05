import fs from 'node:fs'

const prBranch = process.env.PR_BRANCH
const githubOutput = process.env.GITHUB_OUTPUT

if (!prBranch || !githubOutput) {
  throw new Error('PR_BRANCH and GITHUB_OUTPUT must be set')
}

const match = prBranch.match(/^release\/([0-9]+\.[0-9]+\.[0-9]+)$/)

if (!match) {
  console.error('PR branch must match release/x.y.z')
  process.exit(1)
}

fs.appendFileSync(githubOutput, `version=${match[1]}\n`)
