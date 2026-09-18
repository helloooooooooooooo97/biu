import { networkInterfaces } from 'node:os'

const reset = '\x1b[0m'
const dim = '\x1b[2m'
const bold = '\x1b[1m'
const cyan = '\x1b[36m'
const green = '\x1b[32m'

/** IBM-inspired 8-bar wordmark: wide letters drawn with medium horizontal stripes. */
export const BIU_MARK = `${bold}
  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬       ▬▬▬▬▬▬▬▬▬▬▬▬       ▬▬▬          ▬▬▬
  ▬▬▬          ▬▬▬          ▬▬▬            ▬▬▬          ▬▬▬
  ▬▬▬          ▬▬▬          ▬▬▬            ▬▬▬          ▬▬▬
  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬           ▬▬▬            ▬▬▬          ▬▬▬
  ▬▬▬          ▬▬▬          ▬▬▬            ▬▬▬          ▬▬▬
  ▬▬▬          ▬▬▬          ▬▬▬            ▬▬▬          ▬▬▬
  ▬▬▬          ▬▬▬          ▬▬▬             ▬▬▬        ▬▬▬
  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬       ▬▬▬▬▬▬▬▬▬▬▬▬           ▬▬▬▬▬▬▬▬▬▬
${reset}`

export function hyperlink(url: string, label = url) {
  return `\x1b]8;;${url}\x1b\\${cyan}${label}${reset}\x1b]8;;\x1b\\`
}

export function lanIPv4() {
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family !== 'IPv4' && item.family !== 4) continue
      if (item.internal) continue
      return item.address
    }
  }
  return null
}

export type ReadyBanner = {
  ui: string
  api: string
  share?: string
}

export function formatReadyBanner(urls: ReadyBanner) {
  const arrow = `${green}➜${reset}`
  const lines = [
    BIU_MARK.trimEnd(),
    '',
    `  ${arrow}  ${dim}Local${reset}   ${hyperlink(urls.ui)}`,
    `  ${arrow}  ${dim}API${reset}     ${hyperlink(urls.api)}`,
  ]
  if (urls.share) {
    lines.push(`  ${arrow}  ${dim}Share${reset}   ${hyperlink(urls.share)}`)
  }
  lines.push('')
  return lines.join('\n')
}

export function printReadyBanner(urls: ReadyBanner) {
  console.log(formatReadyBanner(urls))
}
