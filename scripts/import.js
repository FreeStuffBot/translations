const fs = require('fs')
const raw = fs.readFileSync(process.argv[2], 'utf8')
const json = JSON.parse(raw)

for (const lang of json) {
  const file = `./${process.argv[3]}/${lang._id}.jsonc`
  fs.writeFileSync(file, JSON.stringify(lang, null, 4))
}