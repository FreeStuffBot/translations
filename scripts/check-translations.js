const fs = require('fs')
const { execSync } = require('child_process')
const { translate } = require('@vitalets/google-translate-api')

const getChangedJsonFiles = () => {
  const diffOutput = execSync('git diff --name-only origin/main...HEAD').toString()
  return diffOutput.split('\n').filter(f => f.endsWith('.jsonc'))
}

const parseJson = (raw) => {
  return JSON.parse(raw.replace(/^\s*\/\/.*?\n/gm, ''))
}

const getFileContent = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8')
  return parseJson(raw)
}

const compareJson = async (oldJson, newJson, file) => {
  const changes = []

  for (const key of Object.keys(newJson)) {
    if (!(key in oldJson)) throw new Error(`Key added or removed in ${file}`)
    const oldVal = oldJson[key]
    const newVal = newJson[key]

    if (oldVal !== newVal) {
      if (typeof newVal !== 'string') throw new Error(`Non-string value changed in ${file}`)
      try {
        await new Promise(res => setTimeout(res, 250)) // dont spam gtranslate
        const translated = (await translate(newVal, { to: 'en' })).text
        changes.push({ key, oldVal, newVal, translated }) 
      } catch {
        await new Promise(res => setTimeout(res, 2000))
        changes.push({ key, oldVal, newVal, translated: '<failed>' }) 
      }
    }
  }

  return changes
}

const run = async () => {
  const files = getChangedJsonFiles()
  console.log(`v4 - Changded JSON files: ${files.join(', ')}`)
  let markdown = ''

  for (const file of files) {
    console.log(`Processing file: ${file}`)
    const oldJson = parseJson(execSync(`git show origin/main:${file}`).toString())
    console.log(`Old JSON loaded from origin/main for ${file}`)
    const newJson = getFileContent(file)
    console.log(`New JSON loaded from ${file}`)
    const changes = await compareJson(oldJson, newJson, file)
    if (changes.length === 0) {
      console.log(`No changes found in ${file}`)
      continue
    }

    console.log(`Changes found in ${file}:`, changes.length)
    markdown += `## ${file}\n\n`
    markdown += '| Key | Old Value | New Value | Translated (EN) |\n|------|-----------|-----------|-----------------|\n'
    for (const change of changes) {
      markdown += `| \`${change.key}\` | ${change.oldVal} | ${change.newVal} | ${change.translated}  [[g]](https://translate.google.com/?sl=auto&text=${encodeURIComponent(change.newVal)}) |\n`
    }
  }

  fs.writeFileSync('output.md', markdown);
  console.log(markdown)
}

run().catch(e => {
  console.error(e.message)
  process.exit(1)
})
