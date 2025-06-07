const fs = require('fs')
const package = process.argv[2]

const readJson = (file) => {
  const raw = fs.readFileSync(file, 'utf8')
  return JSON.parse(raw.replace(/^\s*\/\/.*?\n/gm, ''))
}

const base = 'en-US.jsonc'
const baseContent = readJson(`./${package}/${base}`)

const sorted = obj => Object.keys(obj).sort().reduce((acc, key) => {
  if (key.startsWith('//') || key.startsWith('_'))
    return acc
  acc[`//${key}`] = baseContent[key] || '(missing)'
  acc[key] = obj[key]
  return acc
}, {})

for (const file of fs.readdirSync(`./${package}`)) {
  if (!file.endsWith('.jsonc'))
    continue
  if (file === base)
    continue

  const content = readJson(`./${package}/${file}`)
  let added = 0
  let removed = 0
  for (const key of Object.keys(baseContent)) {
    if (key.startsWith('//') || key.startsWith('_'))
      continue
    if (key in content)
      continue
    content[key] = ''
    added++
  }
  for (const key of Object.keys(content)) {
    if (key.startsWith('//') || key.startsWith('_'))
      continue
    if (key in baseContent)
      continue
    delete content[key]
    removed++
  }

  if (added > 0 || removed > 0) {
    const rendered = JSON
      .stringify(sorted(content), null, 2)
      .replace(/"\/\/.*?": ?"(.*?)",?\n/g, '\n  // $1\n')
      .replace(/^\s+$/gm, '')
      .replace('{\n\n', '{\n')
    fs.writeFileSync(`./${package}/${file}`, rendered)
  }

  console.log(`Updated ${file}: added ${added} keys, removed ${removed} keys`)
}
