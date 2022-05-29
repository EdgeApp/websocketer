// @flow
// =============================================================================

const net = require('net')

const server = net.createServer((c) => {
  // 'connection' listener
  logger('client connected')
  c.on('end', () => {
    logger('client disconnected')
  })
  c.write('hello\r\n')
  c.pipe(c)
})
server.on('error', (err) => {
  throw err
})
// $FlowFixMe
server.listen(50001, () => {
  logger('server bound')
})
