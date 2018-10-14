// @flow
// =============================================================================

const CONFIG = require('../serverConfig.json')
const WebSocket = require('ws')
const net = require('net')

const wss = new WebSocket.Server({
  port: CONFIG.wsPort,
  perMessageDeflate: {
    zlibDeflateOptions: { // See zlib defaults.
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    // Other options settable:
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverMaxWindowBits: 10,
    // Below options specified as default values.
    concurrencyLimit: 10,
    threshold: 1024
  }
})

const _connections = {}

wss.on('connection', (ws, req) => {
  const address = req.connection.remoteAddress
  const port = req.connection.remotePort
  const addrPort = `${address}:${port}`
  const c = new Connection(ws, addrPort)
  c.init()
  _connections[addrPort] = c
})

function deleteConnection (addrPort: string) {
  const c = _connections[addrPort]
  if (c) {
    c.ws.close()
    c.client.destroy()
    delete _connections[addrPort]
  }
}
class Connection {
  ws: Object
  client: net.Socket
  address: string

  constructor (ws, addrPort) {
    this.ws = ws
    this.client = new net.Socket()
    this.client.setEncoding('utf8')
    this.address = addrPort
  }

  init () {
    const tcpServer = CONFIG.tcpServers[0]
    const host = tcpServer.split(':')[0]
    const port = tcpServer.split(':')[1]
    this.client.connect({host, port}, () => {
      console.log('Connected')
    })

    this.client.on('close', () => {
      deleteConnection(this.address)
    })
    this.client.on('error', () => {
      deleteConnection(this.address)
    })

    this.client.on('data', (data) => {
      this.ws.send(data, (error) => {
        if (error) {
          console.log('Error sending data to WS')
          // Delete connection
          deleteConnection(this.address)
        }
      })
    })

    this.ws.on('message', (message) => {
      this.client.write(message + '\r\n', 'utf8', (error) => {
        if (error) {
          console.log('Error writing to WS')
          deleteConnection(this.address)
        } else {
          console.log('Socket write!')
        }
      })
    })
  }
}
