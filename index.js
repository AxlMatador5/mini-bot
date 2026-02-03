const fs = require('fs');
const path = require('path');
const pino = require('pino');
const chalk = require('chalk');
const express = require('express');
const qrcode = require('qrcode');
const socketIO = require('socket.io');
const http = require('http');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  proto
} = require('@whiskeysockets/baileys');

const { loadPlugins, watchPlugins, plugins } = require('./pluginStore');
const { initDatabase, getSetting } = require('./database');
const { logMessage } = require('./database/logger');

global.botStartTime = Date.now();

// ===== EXPRESS SETUP =====
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = process.env.PORT || 3000;

// Store pairing data
let botInstance = null;
let pairingStatus = {
  isPaired: false,
  botNumber: null,
  qrCode: null,
  pairCode: null,
  error: null
};

// ===== COMMAND HANDLER SETUP =====
let commandHandler = null;

function getHandleMessage() {
  // Clear cache and reload command handler
  const commandPath = path.join(__dirname, 'command.js');
  if (fs.existsSync(commandPath)) {
    delete require.cache[require.resolve('./command')];
    return require('./command');
  }
  // Fallback to basic handler
  return async (trashcore, m) => {
    console.log('Message received but no command handler found');
  };
}

// Load command handler initially
try {
  commandHandler = getHandleMessage();
} catch (err) {
  console.log('Command handler not found, will use basic handler');
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Main pairing page
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    // Fallback HTML
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WhatsApp Bot Pairing</title>
        <style>
          body { font-family: Arial; text-align: center; padding: 50px; background: #667eea; }
          .card { background: white; padding: 30px; border-radius: 10px; max-width: 500px; margin: auto; }
          input { padding: 10px; width: 100%; margin: 10px 0; }
          button { background: #4CAF50; color: white; padding: 12px; border: none; border-radius: 5px; cursor: pointer; }
          #output { margin-top: 20px; padding: 15px; background: #f5f5f5; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>WhatsApp Bot Pairing</h2>
          <input id="phone" placeholder="Enter WhatsApp number (e.g., 6281234567890)">
          <button onclick="getPairCode()">Get Pairing Code</button>
          <div id="output"></div>
        </div>
        <script>
          async function getPairCode() {
            const phone = document.getElementById('phone').value.replace(/\\D/g, '');
            if (!phone) {
              document.getElementById('output').innerHTML = '<p style="color: red">Enter a valid number</p>';
              return;
            }
            document.getElementById('output').innerHTML = '<p>Getting code...</p>';
            try {
              const res = await fetch('/pair?phone=' + phone);
              const data = await res.json();
              if (data.code) {
                document.getElementById('output').innerHTML = 
                  '<p>Code: <strong>' + data.code + '</strong></p>' +
                  '<p>Enter this in WhatsApp > Linked Devices</p>';
              } else {
                document.getElementById('output').innerHTML = '<p style="color: red">Error: ' + (data.error || 'Unknown') + '</p>';
              }
            } catch (err) {
              document.getElementById('output').innerHTML = '<p style="color: red">Network error</p>';
            }
          }
        </script>
      </body>
      </html>
    `);
  }
});

// API endpoint for phone number pairing
app.get('/pair', async (req, res) => {
  try {
    const phone = req.query.phone;
    
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    // Validate phone number format
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }
    
    if (!botInstance) {
      return res.status(500).json({ error: 'Bot is initializing, please wait...' });
    }
    
    // Request pairing code
    const pairCode = await botInstance.requestPairingCode(`+${cleanPhone}`, "ULTRA X BOT");
    
    pairingStatus.pairCode = pairCode;
    io.emit('pair-code', pairCode);
    
    res.json({ 
      success: true, 
      code: pairCode,
      message: 'Enter this code in WhatsApp > Linked Devices > Link a Device'
    });
  } catch (error) {
    console.error('Pairing error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate pairing code' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: pairingStatus.isPaired ? 'connected' : 'pairing',
    botNumber: pairingStatus.botNumber,
    timestamp: new Date().toISOString()
  });
});

// Start server
server.listen(PORT, () => {
  console.log(chalk.greenBright(`🌐 Web server running on port ${PORT}`));
  console.log(chalk.cyanBright(`📱 Open http://localhost:${PORT} to pair your WhatsApp`));
});

// ===== BOT START FUNCTION =====
async function startBot() {
  const sessionDir = path.join(__dirname, 'session');
  const sessionFile = path.join(sessionDir, 'creds.json');

  // Load plugins
  loadPlugins();
  watchPlugins();

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [4, 0, 2] }));

  const trashcore = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    browser: ['Ubuntu', 'Chrome', '100.0.0'],
    shouldSyncHistoryMessage: () => true,
    syncFullHistory: false,
    emitOwnEvents: true,
    downloadHistory: false
  });

  botInstance = trashcore;
  
  trashcore.ev.on('creds.update', saveCreds);

  // ===== QR CODE HANDLER (Backup) =====
  trashcore.ev.on('connection.update', async (update) => {
    const { connection, qr } = update;
    
    // Generate QR for web interface
    if (qr) {
      console.log(chalk.yellow('📱 QR Code Generated (Backup Method)'));
      console.log(chalk.cyan('💡 Use phone number method on web page for easier pairing'));
      
      try {
        const qrSvg = await qrcode.toString(qr, { type: 'svg' });
        pairingStatus.qrCode = qrSvg;
        io.emit('qr', qrSvg);
      } catch (err) {
        console.error('QR generation error:', err);
      }
    }
    
    if (connection === 'close') {
      const reason = update.lastDisconnect?.error?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        console.log(chalk.yellow("🔄 Reconnecting..."));
        pairingStatus.isPaired = false;
        pairingStatus.qrCode = null;
        pairingStatus.pairCode = null;
        setTimeout(() => {
          startBot();
        }, 3000);
      } else {
        console.log(chalk.red("🚪 Logged out. Session cleared."));
        pairingStatus.error = "Logged out. Refresh page to pair again.";
        io.emit('error', 'Logged out');
        
        // Clean session
        try {
          if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
          }
        } catch (err) {
          console.error('Error cleaning session:', err);
        }
      }
    }
    
    if (connection === 'open') {
      const botNumber = trashcore.user?.id?.split(':')[0]?.split('@')[0] || 'Unknown';
      pairingStatus.isPaired = true;
      pairingStatus.botNumber = botNumber;
      
      console.log(chalk.greenBright(`\n✅ Bot connected as: ${botNumber}\n`));
      io.emit('connected', botNumber);
      
      await initDatabase();
      console.log(chalk.green("📁 Database connected!"));
      
      const prefix = await getSetting("prefix") || ".";
      const pluginCount = plugins.size;
      
      const statusMsg = `
💠 *ULTRA X BETA ACTIVATED!*

*Bot Name:* Ultra X
> ❐ *Version:* 5.0.0
> ❐ *Prefix:* ${prefix}
> ❐ *Plugins:* ${pluginCount}

> ❐ Connected as: wa.me/${botNumber}
✓ Uptime running...
`;
      
      if (botNumber !== 'Unknown') {
        await trashcore.sendMessage(`${botNumber}@s.whatsapp.net`, { text: statusMsg });
      }
    }
  });

  // Socket.io events
  io.on('connection', (socket) => {
    console.log('Web client connected');
    
    // Send current QR if available
    if (pairingStatus.qrCode) {
      socket.emit('qr', pairingStatus.qrCode);
    }
    
    // Send pair code if available
    if (pairingStatus.pairCode) {
      socket.emit('pair-code', pairingStatus.pairCode);
    }
    
    // Send connection status
    if (pairingStatus.isPaired) {
      socket.emit('connected', pairingStatus.botNumber);
    }
    
    socket.on('request-qr', () => {
      if (pairingStatus.qrCode) {
        socket.emit('qr', pairingStatus.qrCode);
      }
    });
  });

  // ===== MESSAGE HANDLER =====
  trashcore.ev.on('messages.upsert', async ({ messages, type }) => {
    try {
      if (type !== 'notify') return;
      
      const m = messages[0];
      if (!m || !m.message) return;

      // Handle ephemeral messages
      if (m.message.ephemeralMessage) {
        m.message = m.message.ephemeralMessage.message;
      }

      // Skip status updates and protocol messages
      if (m.key.remoteJid === 'status@broadcast' || 
          m.key.fromMe || 
          !m.message) {
        return;
      }

      // Log message to database
      await logMessage(m, trashcore);

      // Get message content
      let messageType = Object.keys(m.message)[0];
      let text = '';

      if (messageType === 'conversation') {
        text = m.message.conversation;
      } else if (messageType === 'extendedTextMessage') {
        text = m.message.extendedTextMessage.text;
      } else if (messageType === 'imageMessage') {
        text = m.message.imageMessage.caption || '';
      }

      // Get prefix from settings
      const prefix = await getSetting("prefix") || ".";
      
      // Check if message starts with prefix
      if (text.startsWith(prefix)) {
        console.log(chalk.blue(`📨 Command: ${text} from ${m.key.remoteJid}`));
        
        // Load command handler
        commandHandler = getHandleMessage();
        
        // Process command
        if (commandHandler) {
          try {
            await commandHandler(trashcore, m);
          } catch (err) {
            console.error(chalk.red('Command error:'), err);
            await trashcore.sendMessage(m.key.remoteJid, { 
              text: `❌ Command error: ${err.message}` 
            });
          }
        } else {
          console.log(chalk.yellow('⚠️ No command handler available'));
          await trashcore.sendMessage(m.key.remoteJid, { 
            text: '⚠️ Command handler not loaded. Try restarting the bot.' 
          });
        }
      }

    } catch (error) {
      console.error(chalk.red('Message processing error:'), error);
    }
  });

  // ===== STATUS AUTO VIEW =====
  trashcore.ev.on('messages.upsert', async chatUpdate => {
    try {
      let mek = chatUpdate.messages?.[0];
      if (!mek || !mek.key) return;
      if (mek.key.remoteJid === 'status@broadcast') {
        const statusViewEnabled = await getSetting("statusView", true);
        if (statusViewEnabled) {
          await trashcore.readMessages([mek.key]);
          console.log(chalk.gray('👁️ Viewed status update'));
        }
      }
    } catch (err) {
      console.error("❌ Status view error:", err);
    }
  });

  // Clean shutdown
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n👋 Shutting down...'));
    server.close();
    process.exit(0);
  });
}

// ===== CREATE PUBLIC DIRECTORY AND FILES =====
function setupPublicDirectory() {
  const publicDir = path.join(__dirname, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Create HTML file
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="description" content="whatsapp bot pairing code." />
    <meta name="keywords" content="pair, whatsapp-bot" />
    <meta name="author" content="IRON-M4N" />
    <link rel="icon" href="https://cdn.ironman.my.id/u/uugBEhB.jpeg" type="image/jpeg" />
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        body {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        
        .card {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            width: 100%;
            max-width: 500px;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        h2 {
            color: white;
            margin-bottom: 30px;
            font-size: 28px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        
        input {
            width: 100%;
            padding: 15px;
            border: none;
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.9);
            font-size: 16px;
            margin-bottom: 20px;
            transition: all 0.3s ease;
        }
        
        input:focus {
            outline: none;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.5);
            background: white;
        }
        
        .submit-btn {
            display: inline-block;
            background: #4CAF50;
            color: white;
            padding: 15px 30px;
            border-radius: 10px;
            text-decoration: none;
            font-size: 18px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-bottom: 20px;
            width: 100%;
            border: none;
        }
        
        .submit-btn:hover {
            background: #45a049;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
        
        .submit-btn:disabled {
            background: #cccccc;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
        
        #output {
            margin-top: 20px;
            padding: 20px;
            background: rgba(255, 255, 255, 0.9);
            border-radius: 10px;
            min-height: 100px;
        }
        
        .pair-code {
            font-size: 32px;
            font-weight: bold;
            color: #333;
            margin: 10px 0;
            letter-spacing: 2px;
            background: #f8f9fa;
            padding: 10px;
            border-radius: 5px;
            border: 2px dashed #4CAF50;
        }
        
        .copy-btn {
            background: #2196F3;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 10px;
            font-size: 16px;
            cursor: pointer;
            margin: 10px 0;
            transition: all 0.3s ease;
        }
        
        .copy-btn:hover {
            background: #1976D2;
        }
        
        .copy-confirm {
            color: #4CAF50;
            font-weight: bold;
            margin-top: 10px;
        }
        
        .status {
            padding: 15px;
            border-radius: 10px;
            margin: 20px 0;
            font-weight: bold;
        }
        
        .connected {
            background: rgba(76, 175, 80, 0.2);
            color: #4CAF50;
            border: 2px solid #4CAF50;
        }
        
        .waiting {
            background: rgba(255, 193, 7, 0.2);
            color: #ff9800;
            border: 2px solid #ff9800;
        }
        
        .error {
            background: rgba(244, 67, 54, 0.2);
            color: #f44336;
            border: 2px solid #f44336;
        }
    </style>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WhatsApp Bot Pairing</title>
</head>
<body>
    <div class="card">
        <h2>WhatsApp Bot Pairing</h2>
        
        <h3 style="color: white; margin-bottom: 20px;">Enter Phone Number</h3>
        <input
            type="text"
            id="phone"
            placeholder="Example: 6281234567890 (without +)"
            autocomplete="off"
        />
        <button class="submit-btn" onclick="submit()" id="submitBtn">Get Pairing Code</button>
        <div id="output"></div>
        
        <div id="connection-status" class="status waiting" style="display: none;">
            ⏳ Waiting for connection...
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        
        socket.on('connected', (number) => {
            document.getElementById('connection-status').className = 'status connected';
            document.getElementById('connection-status').innerHTML = 
                \`✅ Connected as: \${number}\`;
            if (document.getElementById('output').innerHTML.includes('pairing code')) {
                document.getElementById('output').innerHTML += 
                    \`<div class="connected" style="margin-top: 10px;">✅ Connected!</div>\`;
            }
        });
        
        socket.on('error', (error) => {
            document.getElementById('connection-status').className = 'status error';
            document.getElementById('connection-status').innerHTML = \`❌ \${error}\`;
        });
        
        function submit() {
            const inp = document.getElementById("phone").value;
            const trim = inp.replace(/\\D/g, "");
            
            if (!trim) {
                document.getElementById("output").innerHTML = 
                    '<div class="error">Please enter a valid phone number</div>';
                return;
            }
            
            if (trim.length < 10) {
                document.getElementById("output").innerHTML = 
                    '<div class="error">Phone number too short</div>';
                return;
            }
            
            // Disable button and show loading
            const btn = document.getElementById("submitBtn");
            btn.disabled = true;
            btn.innerHTML = 'Generating Code...';
            
            document.getElementById("output").innerHTML = 
                '<div class="waiting">Getting pairing code...</div>';
            
            fetch(\`/pair?phone=\${trim}\`)
                .then(res => res.json())
                .then(data => {
                    if (data.code) {
                        document.getElementById("output").innerHTML = \`
                            <div class="connected">
                                <p>✅ Pairing code generated!</p>
                                <div class="pair-code">\${data.code}</div>
                                <p>1. Open WhatsApp on your phone</p>
                                <p>2. Go to Settings → Linked Devices → Link a Device</p>
                                <p>3. Enter this code when prompted</p>
                                <button class="copy-btn" onclick="copyToClipboard('\${data.code}')">
                                    📋 Copy Pairing Code
                                </button>
                                <p id="copy-confirm" class="copy-confirm" style="display: none;">
                                    ✓ Copied to clipboard!
                                </p>
                            </div>
                        \`;
                        
                        // Show connection status
                        document.getElementById('connection-status').style.display = 'block';
                    } else {
                        document.getElementById("output").innerHTML = 
                            \`<div class="error">Error: \${data.error || 'Failed to generate code'}</div>\`;
                    }
                })
                .catch(error => {
                    document.getElementById("output").innerHTML = 
                        \`<div class="error">Connection error: \${error.message}</div>\`;
                })
                .finally(() => {
                    // Re-enable button
                    btn.disabled = false;
                    btn.innerHTML = 'Get Pairing Code';
                });
        }
        
        function copyToClipboard(text) {
            navigator.clipboard.writeText(text)
                .then(() => {
                    const confirm = document.getElementById("copy-confirm");
                    confirm.style.display = "block";
                    setTimeout(() => {
                        confirm.style.display = "none";
                    }, 2000);
                })
                .catch(err => {
                    alert('Failed to copy: ' + err);
                });
        }
    </script>
</body>
</html>`;

  fs.writeFileSync(path.join(publicDir, 'index.html'), htmlContent);
}

// ===== BASIC COMMAND HANDLER (Fallback) =====
// Create a basic command.js if it doesn't exist
const commandPath = path.join(__dirname, 'command.js');
if (!fs.existsSync(commandPath)) {
  const basicCommandHandler = `
module.exports = async (trashcore, m) => {
  const prefix = ".";
  
  // Get message text
  let text = '';
  if (m.message.conversation) {
    text = m.message.conversation;
  } else if (m.message.extendedTextMessage) {
    text = m.message.extendedTextMessage.text;
  } else if (m.message.imageMessage) {
    text = m.message.imageMessage.caption || '';
  }
  
  if (!text.startsWith(prefix)) return;
  
  const command = text.slice(prefix.length).trim().split(' ')[0].toLowerCase();
  const args = text.slice(prefix.length + command.length).trim();
  
  console.log('Command received:', command, 'Args:', args);
  
  switch(command) {
    case 'ping':
      await trashcore.sendMessage(m.key.remoteJid, { text: '🏓 Pong!' });
      break;
    case 'menu':
      await trashcore.sendMessage(m.key.remoteJid, { 
        text: '📱 *Ultra X Bot Menu*\\n\\n' +
              '🔹 .ping - Check bot status\\n' +
              '🔹 .menu - Show this menu\\n' +
              '🔹 .owner - Show owner info\\n' +
              '\\nPrefix: ' + prefix
      });
      break;
    case 'owner':
      await trashcore.sendMessage(m.key.remoteJid, { 
        text: '👑 *Owner Info*\\n' +
              'Name: Ultra X Developer\\n' +
              'Contact: @owner'
      });
      break;
    default:
      await trashcore.sendMessage(m.key.remoteJid, { 
        text: '❌ Unknown command. Type .menu for available commands.' 
      });
  }
};
`;
  fs.writeFileSync(commandPath, basicCommandHandler);
  console.log(chalk.yellow('📝 Created basic command.js'));
}

// ===== MAIN EXECUTION =====
async function main() {
  // Setup public directory
  setupPublicDirectory();
  
  // Start the bot
  await startBot();
}

main().catch(err => {
  console.error(chalk.red('Fatal error:'), err);
  process.exit(1);
});
