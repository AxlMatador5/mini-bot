const axios = require('axios')
const fs = require('fs')
const path = require('path')

const headers = {
  origin: 'https://photoaid.com',
  referer: 'https://photoaid.com/en/tools/ai-image-enlarger',
  'user-agent': 'Mozilla/5.0 (Linux; Android 10)',
  'content-type': 'text/plain;charset=UTF-8'
}

function toBase64(file) {
  return fs.readFileSync(file).toString('base64')
}

async function getToken() {
  const res = await axios.post(
    'https://photoaid.com/en/tools/api/tools/token',
    null,
    { headers }
  )
  return res.data?.clientToken || res.data?.token
}

async function uploadImage(file) {
  const base64 = toBase64(file)
  const token = await getToken()

  const res = await axios.post(
    'https://photoaid.com/en/tools/api/tools/upload',
    JSON.stringify({
      base64,
      token,
      reqURL: '/ai-image-enlarger/upload'
    }),
    { headers }
  )

  if (!res.data?.request_id) throw res.data
  return res.data.request_id
}

async function getResult(id) {
  const res = await axios.post(
    'https://photoaid.com/en/tools/api/tools/result',
    JSON.stringify({
      request_id: id,
      reqURL: '/ai-image-enlarger/result'
    }),
    { headers }
  )
  return res.data
}

async function upscaleImage(file) {
  const jobId = await uploadImage(file)
  let result

  do {
    await new Promise(r => setTimeout(r, 3000))
    result = await getResult(jobId)
  } while (result.statusAPI !== 'ready')

  return Buffer.from(result.result, 'base64')
}

module.exports = {
  name: 'upscale',
  description: 'Upscale image using AI',
  aliases: ['enhance', 'hd'],
  tags: ['tools'],
  command: /^\.?(upscale|enhance|hd)$/i,

  async execute(sock, m) {
    try {
      if (!m.quoted || !m.quoted.message?.imageMessage) {
        return m.reply('❌ Reply to an image to upscale it.')
      }

      m.reply('ᴜᴘsᴄᴀʟɪɴɢ ɪᴍᴀɢe, ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ...')

      const tmpDir = path.join(__dirname, '../tmp')
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir)

      const input = path.join(tmpDir, `${Date.now()}_input.jpg`)
      const output = path.join(tmpDir, `${Date.now()}_output.png`)

      const buffer = await m.quoted.download()
      fs.writeFileSync(input, buffer)

      const upscaled = await upscaleImage(input)
      fs.writeFileSync(output, upscaled)

      await sock.sendMessage(
        m.from,
        {
          image: fs.readFileSync(output),
          caption: '✅ Upscaled successfully'
        },
        { quoted: m }
      )

      fs.unlinkSync(input)
      fs.unlinkSync(output)
    } catch (err) {
      console.error('Upscale Error:', err)
      m.reply('❌ Failed to upscale image.')
    }
  }
}
