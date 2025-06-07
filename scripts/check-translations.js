const fs = require('fs')
const { execSync } = require('child_process')
const translate = require('@vitalets/google-translate-api')

const getChangedJsonFiles = () => {
  const diffOutput = execSync('git diff --name-only origin/main...HEAD').toString()
  return diffOutput.split('\n').filter(f => f.endsWith('.jsonc'))
}

const getFileContent = (filePath) => {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

const compareJson = async (oldJson, newJson, file) => {
  const changes = []

  for (const key of Object.keys(newJson)) {
    if (!(key in oldJson)) throw new Error(`Key added or removed in ${file}`)
    const oldVal = oldJson[key]
    const newVal = newJson[key]

    if (oldVal !== newVal) {
      if (typeof newVal !== 'string') throw new Error(`Non-string value changed in ${file}`)
      const translated = (await translate(newVal, { to: 'en' })).text
      changes.push({ oldVal, newVal, translated })
    }
  }

  return changes
}

const run = async () => {
  const files = getChangedJsonFiles()
  let markdown = '| File | Old Value | New Value | Translated (EN) |\n|------|-----------|-----------|-----------------|\n'

  for (const file of files) {
    const oldJson = JSON.parse(execSync(`git show origin/main:${file}`).toString())
    const newJson = getFileContent(file)
    const changes = await compareJson(oldJson, newJson, file)
    for (const change of changes) {
      markdown += `| ${file} | ${change.oldVal} | ${change.newVal} | ${change.translated} |\n`
    }
  }

  console.log(markdown)
}

run().catch(e => {
  console.error(e.message)
  process.exit(1)
})
