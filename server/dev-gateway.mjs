import http from 'node:http'

const targetHost = '127.0.0.1'
const targetPort = 3001
const listenPort = 5173

const server = http.createServer((request, response) => {
  const proxy = http.request({
    hostname: targetHost,
    port: targetPort,
    path: request.url,
    method: request.method,
    headers: { ...request.headers, host: `${targetHost}:${targetPort}` },
  }, (upstream) => {
    response.writeHead(upstream.statusCode ?? 502, upstream.headers)
    upstream.pipe(response)
  })

  proxy.on('error', (error) => {
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(`BES API is not available: ${error.message}`)
  })
  request.pipe(proxy)
})

server.listen(listenPort, '127.0.0.1', () => {
  console.log(`BES development gateway listening on http://127.0.0.1:${listenPort}`)
})
