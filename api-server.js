import express from 'express'
import { MongoClient, ObjectId } from 'mongodb'
import OpenAI from 'openai'
import dotenv from 'dotenv'
import cors from 'cors'
import fetch from 'node-fetch'
import bodyParser from 'body-parser'
import fs, { readFileSync } from 'fs'
import https from 'https'
import QRCode from 'qrcode'

import { readFromDatabase, saveToDatabase, setInitiatorData } from './functions/database.js'
import { parseWithGPT, parseWithVeryfi } from './functions/parse-receipt.js'

dotenv.config()

// test deploy 3

function generateDataString(parsedReceipt) {
  let dataArray = []

  parsedReceipt.line_items.map((line_item) => {
    dataArray.push(`${line_item.quantity}:${line_item.description}:${line_item.total}`)
  }).filter(x => x)

  dataArray.push(`_s:${parsedReceipt.subtotal}`)
  dataArray.push(`_i:${parsedReceipt.tax}`)
  dataArray.push(`_a:${parsedReceipt.tip}`)
  dataArray.push(`_o:${parsedReceipt.total}`)

  let dataString = dataArray.join(';')

  dataString = encodeURIComponent(dataString)

  return dataString
}

let key, cert, ca

if (process.env.SERVER_IP === 'localhost') {  
    key = fs.readFileSync(process.env.LOCAL_KEY)
    cert = fs.readFileSync(process.env.LOCAL_CERT)
} else {
    key = fs.readFileSync(`/etc/letsencrypt/live/${process.env.DOMAIN_NAME}/privkey.pem`, 'utf8')
    cert = fs.readFileSync(`/etc/letsencrypt/live/${process.env.DOMAIN_NAME}/cert.pem`, 'utf8')
    ca = fs.readFileSync(`/etc/letsencrypt/live/${process.env.DOMAIN_NAME}/chain.pem`, 'utf8')
}

const app = express()
const server = https.createServer({ key, cert, ca }, app)

app.use(bodyParser.json({ limit: '10000kb' }))
app.use(cors())

server.listen(process.env.SERVER_NODE_PORT, () => {
  console.log(`Listening on port ${process.env.SERVER_NODE_PORT}`)
})

app.post('/getReceiptData', async (req, res) => {
  const sessionId = req.body.sessionId
  const data = await readFromDatabase(sessionId).catch(console.dir)
  const parsedReceipt = data.parsed

  if (data) {
    res.send({
      merchant: {
        name: parsedReceipt.vendor.name,
        type: parsedReceipt.vendor.type,
        address: parsedReceipt.vendor.address
      },
      items: parsedReceipt.line_items.map((line_item) => {
        if (line_item.total) {
          return {
            id: line_item.id,
            description: line_item.description,
            quanity: line_item.quanity,
            price: line_item.total,
            isChecked: line_item.isChecked,
            checkedBy: line_item.checkedBy,
            isPaid: line_item.isPaid,
            paidBy: line_item.paidBy
          }
        }
      }).filter(x => x),
      transaction: {
        items: parsedReceipt.subtotal,
        tip: parsedReceipt.tip,
        tax: parsedReceipt.tax,
        total: parsedReceipt.total,
      }
    })
  } else {
    res.sendStatus(404)
  }
})

app.get('/status', async (req, res) => {
  res.send('Success')
})

app.post('/parseReceiptImage', async (req, res) => {
// app.get('/parse', async (req, res) => {
  let imageData = req.body.image
  let parsedReceipt
  const receiptParsingMode = process.env.RECEIPT_PARSING_MODE
  
  if (receiptParsingMode === 'GPT') {
    parsedReceipt = await parseWithGPT(imageData)
  } else if (receiptParsingMode === 'VERYFI') {
    parsedReceipt = await parseWithVeryfi(imageData)
  } else if (receiptParsingMode === 'SAMPLE') {
    const sampleData = readFileSync('./samples/pusu.json')
    parsedReceipt = JSON.parse(sampleData)
  }

  if (parsedReceipt) {
    let dataStorageMode = process.env.DATA_STORAGE_MODE

    if (dataStorageMode === 'DATABASE') {
      parsedReceipt.line_items = parsedReceipt.line_items.map(line_item => ({
        ...line_item,
        isChecked: false,
        checkedBy: null,
        isPaid: false,
        paidBy: null
      }))

      const insertedId = await saveToDatabase({
        parsed: parsedReceipt,
        original: imageData,
        initiator: {
          handles: {},
          humanName: null
        }
      }).catch(console.dir)

      res.send({
        sessionId: insertedId
      })
    } else if (dataStorageMode === 'URL') {
      const dataString = generateDataString(parsedReceipt)

      const url = `${process.env.LOCAL_VIEWER_URL}/${dataString}`
      const qr = await QRCode.toDataURL(url)

      res.send({
        url,
        qr
      })
    }
  } else {
    res.sendStatus(404)
  }
})

app.post('/setInitiatorData', async (req, res) => {
  const data = req.body

  if (data) {
    try {
      await setInitiatorData(req.body)
      res.send(req.body)
      // res.sendStatus(200)
    } catch (err) {
      console.log(err.stack)
      res.sendStatus(500)
    }
  } else {
    res.sendStatus(404)
  }
})

app.post('/generateQrCode', async (req, res) => {
  const sessionId = req.body.sessionId
  const data = await readFromDatabase(sessionId).catch(console.dir)

  if (data) {
    const url = `${process.env.DATABASE_VIEWER_ENDPOINT}?sessionId=${sessionId}`
    const qrCode = await QRCode.toDataURL(url, { width: 800 })

    res.send({
      url,
      qrCode
    })
  } else {
    res.sendStatus(404)
  }
})