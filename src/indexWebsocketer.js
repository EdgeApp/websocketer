// @flow
// =============================================================================

const CONFIG = require('../serverConfig.json')
const WebSocket = require('ws')
const https = require('https')
const net = require('net')
const tls = require('tls')
const fs = require('fs')

const opts = {
  cert: fs.readFileSync(CONFIG.sslCertPath),
  key: fs.readFileSync(CONFIG.sslPrivateKeyPath)
}
const server = new https.createServer(opts)
const wss = new WebSocket.Server({ server })
// const wss = new WebSocket.Server({
//   port: CONFIG.wsPort,
//   perMessageDeflate: {
//     zlibDeflateOptions: {
//       // See zlib defaults.
//       chunkSize: 1024,
//       memLevel: 7,
//       level: 3
//     },
//     zlibInflateOptions: {
//       chunkSize: 10 * 1024
//     },
//     // Other options settable:
//     clientNoContextTakeover: true,
//     serverNoContextTakeover: true,
//     serverMaxWindowBits: 10,
//     // Below options specified as default values.
//     concurrencyLimit: 10,
//     threshold: 1024
//   }
// })

const _connections = {}

function closeWebSocket(ws) {
  ws.close()
}
wss.on('connection', (ws, req) => {
  const address = req.connection.remoteAddress
  const port = req.connection.remotePort
  const url = req.url
  const addrPort = `${address}:${port} ${url}`
  console.log(`Connection made ${addrPort}`)

  // Parse url
  const splitUrl = url.split('/')
  if (splitUrl.length !== 4) {
    console.log('Invalid url passed')
    closeWebSocket(ws)
    return
  }
  if (splitUrl[1] !== 'tcp' && splitUrl[1] !== 'tls') {
    console.log('Invalid protocol')
    closeWebSocket(ws)
    return
  }
  const destProtocol = splitUrl[1]

  if (splitUrl[2].length < 4 || splitUrl[2].length > 30) {
    console.log('Invalid server')
    closeWebSocket(ws)
    return
  }
  const destServer = splitUrl[2]

  const destPort = parseInt(splitUrl[3])
  if (!(destPort > 0 && destPort < 65536)) {
    console.log('Invalid port')
    closeWebSocket(ws)
    return
  }

  const c = new Connection(ws, addrPort, destProtocol, destServer, destPort)
  c.init()
  _connections[addrPort] = c
})

function deleteConnection(addrPort: string) {
  const c = _connections[addrPort]
  if (c) {
    closeWebSocket(c.ws)
    c.client.destroy()
    delete _connections[addrPort]
  }
  console.log(`Connections: `, _connections)
}
class Connection {
  ws: Object
  client: net.Socket | tls.TLSSocket
  address: string
  tcpServer: string
  tcpPort: number
  tcpConnected: boolean

  constructor(ws, addrPort, destProtocol, destServer, destPort) {
    this.ws = ws
    if (destProtocol === 'tcp') {
      this.client = new net.Socket()
    } else if (destProtocol === 'tls') {
      const netSock = new net.Socket()
      this.client = new tls.TLSSocket(netSock)
    }
    this.client.setEncoding('utf8')
    this.address = addrPort
    this.tcpServer = destServer
    this.tcpPort = destPort
    this.tcpConnected = false
  }

  init() {
    this.client.on('close', message => {
      console.log(`TCP closed: ${message}`)
      deleteConnection(this.address)
    })
    this.client.on('error', error => {
      console.log(`TCP errored: ${error}`)
      deleteConnection(this.address)
    })

    this.client.on('data', data => {
      console.log(`Received TCP data: ${data}`)
      this.ws.send(data, error => {
        if (error) {
          console.log('Error sending data to WS')
          // Delete connection
          deleteConnection(this.address)
        }
      })
    })

    this.client.connect(
      { host: this.tcpServer, port: this.tcpPort },
      status => {
        console.log(`Connected status=${status}`)
        this.tcpConnected = true

        this.ws.on('message', message => {
          console.log(`Received WS: ${message}`)
          this.client.write(message, 'utf8', error => {
            if (error) {
              console.log('Error writing to WS', error)
              deleteConnection(this.address)
            } else {
              console.log('Socket write!')
            }
          })
        })
      }
    )

    this.ws.on('close', error => {
      console.log('Websocket close', error)
      deleteConnection(this.address)
    })

    this.ws.on('error', error => {
      console.log('Websocket error', error)
      deleteConnection(this.address)
    })
  }
}

server.listen(CONFIG.wsPort)
