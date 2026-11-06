import { readFileSync } from 'node:fs'
import vm from 'node:vm'

export function load(...files) {
  const context = vm.createContext({ Math, console })
  context.globalThis = context
  for (const file of files) {
    const url = new URL('../panel/' + file, import.meta.url)
    vm.runInContext(readFileSync(url, 'utf8'), context)
  }
  return context
}
