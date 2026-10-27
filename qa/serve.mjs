// Minimal static file server for the production build (no dependencies).
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const root = process.argv[2] ?? 'dist'
const port = Number(process.argv[3] ?? 4173)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    let path = decodeURIComponent(url.pathname)
    if (path.endsWith('/')) path += 'index.html'
    // Prevent path traversal.
    const safe = normalize(path).replace(/^(\.\.[\\/])+/, '')
    let file = join(root, safe)
    let body
    try {
      body = await readFile(file)
    } catch {
      // SPA fallback.
      file = join(root, 'index.html')
      body = await readFile(file)
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch (err) {
    res.writeHead(500)
    res.end(String(err))
  }
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`))
