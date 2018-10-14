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
  tcpServer: string
  tcpPort: number

  constructor (ws, addrPort) {
    this.ws = ws
    this.client = new net.Socket()
    this.client.setEncoding('utf8')
    this.address = addrPort
    this.tcpServer = ''
    this.tcpPort = 0
  }

  init () {
    this.client.on('close', (message) => {
      console.log(message)
      deleteConnection(this.address)
    })
    this.client.on('error', (error) => {
      console.log(error)
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
      if (this.tcpServer) {
        // Already connected
        this.client.write(message + '\r\n', 'utf8', (error) => {
          if (error) {
            console.log('Error writing to WS')
            deleteConnection(this.address)
          } else {
            console.log('Socket write!')
          }
        })
      } else {
        // Get the requested server to connect to
        try {
          const { host, port } = JSON.parse(message)
          if (!host || !port) {
            deleteConnection(this.address)
          }
          this.client.connect({host, port}, (error) => {
            console.log('Connected', error)
            this.tcpServer = host
            this.tcpPort = port
            this.ws.send(JSON.stringify({ status: 'OK' }))
          })
        } catch (e) {
          console.log(e)
          deleteConnection(this.address)
        }
      }
    })

    this.ws.on('close', (error) => {
      console.log('Websocket close', error)
      deleteConnection(this.address)
    })

    this.ws.on('error', (error) => {
      console.log('Websocket error', error)
      deleteConnection(this.address)
    })
  }
}
