import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'
import QRCode from 'qrcode'
import fs, { readFileSync } from 'fs'
import { getSessionMembersData } from './functions/session.js'
import { readFromDatabase, saveToDatabase } from './functions/database.js'

dotenv.config()

const app = express()
const server = createServer(app)
const io = new Server(server, {
  maxHttpBufferSize: 1e8,
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

app.use(cors())

const sessionCreators = {}

io.on('connection', (socket) => {
  socket.on('startSession', async (data) => {
    const sessionId = data.sessionId
    const url = `${process.env.DATABASE_VIEWER_ENDPOINT}/${sessionId}`
    const qrCode = await QRCode.toDataURL(url)

    socket.join(sessionId)
    io.to(sessionId).emit('sessionStarted', { sessionId, qrCode })

    sessionCreators[sessionId] = socket.id
  })

  socket.on('newConnection', async (data) => {
    const sessionId = data.sessionId

    console.log(`Joining room ${sessionId}`)
    socket.join(sessionId)

    const sessionMembersData = getSessionMembersData(socket, sessionId, sessionCreators)

    io.to(sessionId).emit('sessionMembersChanged', { sessionMembers: sessionMembersData })
  })

  socket.on('disconnecting', (reason) => {
    if ([...socket.rooms] && [...socket.rooms][1]) {
      const sessionId = [...socket.rooms][1].toString()
      const sessionMembersData = getSessionMembersData(socket, sessionId, sessionCreators, { removeDisconnectingSocket: true })

      io.to(sessionId).emit('sessionMembersChanged', { sessionMembers: sessionMembersData })
    }
  })
})

server.listen(3000, () => {
  console.log('listening on *:3000')
})