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
const _tcpServers = CONFIG.tcpServers.slice()

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
  retry: boolean
  canRetry: boolean
  numServers: number

  constructor (ws, addrPort) {
    this.ws = ws
    this.client = new net.Socket()
    this.client.setEncoding('utf8')
    this.address = addrPort
    this.numServers = _tcpServers.length
    this.retry = false
    this.canRetry = true
  }

  connectServer () {
    if (this.numServers) {
      this.numServers--
      const tcpServer = _tcpServers[0]
      const host = tcpServer.split(':')[0]
      const port = tcpServer.split(':')[1]
      this.client.connect({host, port}, (error) => {
        console.log('Connected', error)
      })
    } else {
      deleteConnection(this.address)
    }
  }

  init () {
    this.client.on('close', (error) => {
      console.log(error)
      if (this.retry) {
        this.retry = false
        const bad = _tcpServers.splice(0, 1)
        _tcpServers.push(bad[0])
        this.connectServer()
      } else {
        deleteConnection(this.address)
      }
    })
    this.client.on('error', (error) => {
      console.log(error)
      if (
        (
          error.code === 'ECONNREFUSED' ||
          error.code === 'ETIMEDOUT' ||
          error.code === 'ENOTFOUND'
        ) && this.canRetry
      ) {
        this.retry = true
      } else {
        deleteConnection(this.address)
      }
    })

    this.client.on('data', (data) => {
      this.canRetry = false
      this.ws.send(data, (error) => {
        if (error) {
          console.log('Error sending data to WS')
          // Delete connection
          deleteConnection(this.address)
        }
      })
    })

    this.ws.on('message', (message) => {
      this.canRetry = false
      this.client.write(message + '\r\n', 'utf8', (error) => {
        if (error) {
          console.log('Error writing to WS')
          deleteConnection(this.address)
        } else {
          console.log('Socket write!')
        }
      })
    })
    this.ws.on('close', (error) => {
      console.log('Websocket close', error)
      deleteConnection(this.address)
    })
    this.ws.on('error', (error) => {
      console.log('Websocket error', error)
      deleteConnection(this.address)
    })
    this.connectServer()
  }
}
