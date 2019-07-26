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

function logger (...args) {
  const d = makeDate()
  console.log(`${d} `, ...args)
}

const _connections = {}

function closeWebSocket (ws) {
  ws.close()
}
wss.on('connection', (ws, req) => {
  const address = req.connection.remoteAddress
  const port = req.connection.remotePort
  const url = req.url
  const addrPort = `${address}:${port}`
  logger(`Connection made ${addrPort}`)

  // Parse url
  const splitUrl = url.split('/')
  if (splitUrl.length !== 4) {
    logger(`Invalid url passed: ${url}`)
    closeWebSocket(ws)
    return
  }
  if (splitUrl[1] !== 'tcp' && splitUrl[1] !== 'tls') {
    logger(`Invalid protocol: ${splitUrl[1]}`)
    closeWebSocket(ws)
    return
  }
  const destProtocol = splitUrl[1]

  if (splitUrl[2].length < 4 || splitUrl[2].length > 30) {
    logger(`Invalid server: ${splitUrl[2]}`)
    closeWebSocket(ws)
    return
  }
  const destServer = splitUrl[2]

  const destPort = parseInt(splitUrl[3])
  if (!(destPort > 0 && destPort < 65536)) {
    logger(`Invalid port: ${splitUrl[3]}`)
    closeWebSocket(ws)
    return
  }

  const c = new Connection(ws, addrPort, destProtocol, destServer, destPort)
  c.init()
  _connections[addrPort] = c
})

function deleteConnection (addrPort: string) {
  const c = _connections[addrPort]
  if (c) {
    closeWebSocket(c.ws)
    c.client.destroy()
    delete _connections[addrPort]
  }
}

function makeDate () {
  const end = new Date()
  let m = (end.getUTCMonth() + 1).toString()
  if (m.length < 2) m = `0${m}`
  let d = end.getUTCDate().toString()
  if (d.length < 2) d = `0${d}`
  let h = end.getHours().toString()
  if (h.length < 2) h = `0${h}`
  let min = end.getMinutes().toString()
  if (min.length < 2) min = `0${d}`
  let s = end.getSeconds().toString()
  if (s.length < 2) s = `0${d}`
  let ms = end.getMilliseconds().toString()
  if (ms.length === 2) ms = `0${d}`
  if (ms.length < 2) ms = `00${d}`
  return `${m}-${d}-${h}:${min}:${s}.${ms}`
}

class Connection {
  ws: Object
  client: net.Socket | tls.TLSSocket
  address: string
  tcpServer: string
  tcpPort: number
  tcpConnected: boolean
  earlyCache: string

  constructor (ws, addrPort, destProtocol, destServer, destPort) {
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
    this.earlyCache = ''
  }

  connlog (...args) {
    const d = makeDate()
    console.log(`${d} ${this.address} > ${this.tcpServer}:${this.tcpPort}`, ...args)
  }

  init () {
    this.client.on('close', message => {
      this.connlog(`TCP closed: ${message}`)
      deleteConnection(this.address)
    })
    this.client.on('error', error => {
      this.connlog(`TCP errored: ${error}`)
      deleteConnection(this.address)
    })

    this.client.on('data', data => {
      this.connlog(`Received TCP data`)
      this.ws.send(data, error => {
        if (error) {
          this.connlog('Error sending data to WS')
          // Delete connection
          deleteConnection(this.address)
        } else {
          this.connlog('Success sending data to WS')
        }
      })
    })
    this.connlog('about to call client.connect')
    this.ws.on('message', message => {
      this.connlog(`Received WS`)
      if (this.tcpConnected) {
        this.client.write(message, 'utf8', error => {
          if (error) {
            this.connlog('Error writing to WS', error)
            deleteConnection(this.address)
          } else {
            this.connlog('Socket write!')
          }
        })
      } else {
        this.connlog('Caching message: ', message)
        this.earlyCache += message
      }
    })
    this.client.connect(
      { host: this.tcpServer, port: this.tcpPort },
      status => {
        if (status) {
          this.connlog(`Connected status=${status}`)
        } else {
          this.connlog(`Connected`)
        }
        if (this.earlyCache) {
          this.connlog('Writing early cache: to TCP')
          this.client.write(this.earlyCache, 'utf8', error => {
            if (error) {
              this.connlog('Error writing to WS', error)
              deleteConnection(this.address)
            } else {
              this.connlog('Socket write!')
            }
          })
        }
        this.tcpConnected = true
      }
    )

    this.ws.on('close', error => {
      this.connlog('Websocket close', error)
      deleteConnection(this.address)
    })

    this.ws.on('error', error => {
      this.connlog('Websocket error', error)
      deleteConnection(this.address)
    })
  }
}

server.listen(CONFIG.wsPort)
