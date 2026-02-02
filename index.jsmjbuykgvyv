const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage, generateWAMessageFromContent, fetchLatestWaWebVersion, proto } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const http = require('http');
const QRCode = require('qrcode');
const { Boom } = require('@hapi/boom');
const { sendButtons, sendInteractiveMessage } = require('gifted-btns');
const serializeMessage = require('./handler.js');

global.generateWAMessageFromContent = generateWAMessageFromContent;
global.proto = proto;
require('./config')

if (!fs.existsSync(__dirname + '/session/creds.json') && global.sessionid) {
    try {
        const sessionData = JSON.parse(global.sessionid);
        fs.mkdirSync(__dirname + '/session', { recursive: true });
        fs.writeFileSync(__dirname + '/session/creds.json', JSON.stringify(sessionData, null, 2));
    } catch (err) {
        console.error('Error restoring session:', err);
    }
}

// ===== CONFIGURATION ===== //
const AUTH_FOLDER = './session';
const PLUGIN_FOLDER = './plugins';
const PORT = process.env.PORT || 3000;
// ========================= //

let latestQR = '';
let botStatus = 'disconnected';
let pairingCodes = new Map();
let presenceInterval = null;
let sock = null;
let isConnecting = false;

// Load prefix from config or use default
function loadPrefix() {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.prefix) {
                global.BOT_PREFIX = config.prefix;
                console.log(`✅ Loaded prefix: ${global.BOT_PREFIX}`);
            }
        } catch (err) {
            console.error('Error loading config:', err);
        }
    }
    startBot();
}

function startBot() {
    console.log('🚀 Starting WhatsApp Bot...');
    isConnecting = true;
    
    // Ensure session folder exists
    if (!fs.existsSync(AUTH_FOLDER)) {
        fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    }
    
    // Clean up old session files if logged out
    const credsPath = path.join(AUTH_FOLDER, 'creds.json');
    if (fs.existsSync(credsPath)) {
        try {
            const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
            if (creds.noiseKey && creds.noiseKey.private) {
                // Session exists and seems valid
                console.log('📁 Using existing session...');
            } else {
                console.log('⚠️ Invalid session detected, will create new one...');
            }
        } catch (err) {
            console.log('⚠️ Corrupted session, will create new one...');
        }
    }

    (async () => {
        try {
            const { version, isLatest } = await fetchLatestWaWebVersion();
            console.log(`📱 Using WA v${version.join(".")}, isLatest: ${isLatest}`);

            const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
            
            sock = makeWASocket({
                version, 
                logger: pino({ level: 'info' }),
                auth: state,
                printQRInTerminal: true, // Keep terminal QR for debugging
                keepAliveIntervalMs: 10000,
                markOnlineOnConnect: true,
                syncFullHistory: false,
                browser: ['Mercedes Bot', 'Chrome', '1.0.0']
            });
            
            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    console.log('🔳 Generating QR code for web...');
                    QRCode.toDataURL(qr, (err, url) => { 
                        if (!err) {
                            latestQR = url;
                            console.log('✅ QR code generated for web');
                        }
                    });
                }

                if (connection === 'close') {
                    botStatus = 'disconnected';
                    isConnecting = false;
                    if (presenceInterval) {
                        clearInterval(presenceInterval);
                        presenceInterval = null;
                    }

                    const statusCode = (lastDisconnect?.error instanceof Boom)
                        ? lastDisconnect.error.output.statusCode
                        : 0;

                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                    console.log(
                        "🔌 Connection closed due to:",
                        lastDisconnect?.error?.message,
                        ", reconnecting:",
                        shouldReconnect
                    );

                    if (shouldReconnect) {
                        console.log('🔄 Reconnecting in 5 seconds...');
                        setTimeout(() => startBot(), 5000);
                    } else {
                        console.log('🚫 Logged out. Cleaning up session...');
                        // Remove session folder if logged out
                        if (fs.existsSync(AUTH_FOLDER)) {
                            fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
                            console.log('🗑️ Session folder removed');
                        }
                        setTimeout(() => startBot(), 3000);
                    }
                } else if (connection === 'open') {
                    botStatus = 'connected';
                    isConnecting = false;
                    console.log('✅ Bot is connected!');

                    // Start presence update interval
                    presenceInterval = setInterval(() => {
                        if (sock?.ws?.readyState === 1) {
                            sock.sendPresenceUpdate('available');
                        }
                    }, 10000);

                    // Send welcome message to owner
                    try { 
                        await sock.sendMessage(sock.user.id, { 
                            text: `🌟 Mercedes WhatsApp Bot Connected!\n📝 Prefix: ${global.BOT_PREFIX}\n⏰ Connected: ${new Date().toLocaleString()}\n🚗 Powered by Mercedes Technology` 
                        }); 
                    } catch (err) { 
                        console.error('Could not send welcome message:', err); 
                    }
                } else if (connection === 'connecting') {
                    botStatus = 'connecting';
                    isConnecting = true;
                    console.log('🔄 Bot is connecting...');
                }
            });

            // Save credentials whenever they update
            sock.ev.on('creds.update', async () => {
                await saveCreds();
                console.log('💾 Credentials updated');
            });

            // Load plugins
            const plugins = new Map();
            const pluginPath = path.join(__dirname, PLUGIN_FOLDER);
            
            if (fs.existsSync(pluginPath)) {
                try {
                    const pluginFiles = fs.readdirSync(pluginPath).filter(file => file.endsWith('.js'));
                    
                    for (const file of pluginFiles) {
                        try {
                            const plugin = require(path.join(pluginPath, file));
                            if (plugin.name && typeof plugin.execute === 'function') {
                                plugins.set(plugin.name.toLowerCase(), plugin);
                                if (Array.isArray(plugin.aliases)) {
                                    plugin.aliases.forEach(alias => {
                                        plugins.set(alias.toLowerCase(), plugin);
                                    });
                                }
                                console.log(`✅ Loaded plugin: ${plugin.name}`);
                            } else {
                                console.warn(`⚠️ Invalid plugin structure in ${file}`);
                            }
                        } catch (error) {
                            console.error(`❌ Failed to load plugin ${file}:`, error.message);
                        }
                    }
                    console.log(`📦 Total plugins loaded: ${plugins.size}`);
                } catch (error) {
                    console.error('❌ Error loading plugins:', error);
                }
            } else {
                console.log('📁 No plugins folder found');
            }
           
            // Handle incoming messages
            sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type !== 'notify') return;
                
                // Handle status auto-view
                for (const rawMsg of messages) {
                    if (rawMsg.key.remoteJid === 'status@broadcast' && rawMsg.key.participant) {
                        try {
                            console.log(`📱 Status detected from: ${rawMsg.key.participant}`);
                            await sock.readMessages([rawMsg.key]);
                            continue;
                        } catch (err) {
                            console.log('❌ Status viewer error:', err.message);
                        }
                    }
                }

                const rawMsg = messages[0];
                if (!rawMsg.message) return;

                const m = await serializeMessage(sock, rawMsg);
                
                // Check for commands
                if (m.body.startsWith(global.BOT_PREFIX)) {
                    const args = m.body.slice(global.BOT_PREFIX.length).trim().split(/\s+/);
                    const commandName = args.shift().toLowerCase();
                    const plugin = plugins.get(commandName);
                    
                    if (plugin) {
                        try { 
                            await plugin.execute(sock, m, args); 
                        } catch (err) { 
                            console.error(`❌ Plugin error (${commandName}):`, err); 
                            await m.reply('❌ Error running command.'); 
                        }
                    }
                }
                
                // Run onMessage handlers for all plugins
                for (const plugin of plugins.values()) {
                    if (typeof plugin.onMessage === 'function') {
                        try { 
                            await plugin.onMessage(sock, m); 
                        } catch (err) { 
                            console.error(`❌ onMessage error (${plugin.name}):`, err); 
                        }
                    }
                }
            });

            // Handle group participants update
            sock.ev.on('group-participants.update', async (update) => {
                console.log('👥 Group update:', update);
                // You can add group event handlers here
            });

            // Handle message reactions
            sock.ev.on('messages.reaction', async (reactions) => {
                console.log('💖 Reaction update:', reactions);
                // Handle reactions if needed
            });

        } catch (error) {
            console.error('❌ Bot startup error:', error);
            isConnecting = false;
            setTimeout(() => startBot(), 10000);
        }
    })();
}

// PROFESSIONAL MERCEDES-THEMED HTML SERVER
const server = http.createServer((req, res) => {
    const url = req.url;
    
    if (url === '/' || url === '/qr') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mercedes WhatsApp Bot</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --mercedes-black: #000000;
            --mercedes-silver: #C0C0C0;
            --mercedes-blue: #00A0E9;
            --mercedes-red: #E4002B;
            --gradient-mercedes: linear-gradient(135deg, #000000, #1a1a1a, #333333);
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: var(--gradient-mercedes);
            color: white;
            min-height: 100vh;
            overflow-x: hidden;
        }
        
        .mercedes-logo {
            font-size: 2.5rem;
            color: var(--mercedes-silver);
            text-align: center;
            margin-bottom: 10px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 30px 20px;
        }
        
        .header {
            text-align: center;
            padding: 40px 20px;
            background: rgba(0, 0, 0, 0.7);
            border-radius: 20px;
            margin-bottom: 30px;
            border: 1px solid var(--mercedes-silver);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            position: relative;
            overflow: hidden;
        }
        
        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, var(--mercedes-red), var(--mercedes-silver), var(--mercedes-blue));
        }
        
        .header h1 {
            font-size: 3.5rem;
            margin-bottom: 10px;
            background: linear-gradient(90deg, var(--mercedes-silver), white);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            text-transform: uppercase;
            letter-spacing: 2px;
        }
        
        .header .tagline {
            font-size: 1.2rem;
            color: var(--mercedes-silver);
            margin-bottom: 30px;
            font-weight: 300;
        }
        
        .status-container {
            display: flex;
            justify-content: center;
            gap: 30px;
            flex-wrap: wrap;
            margin-bottom: 40px;
        }
        
        .status-card {
            background: rgba(0, 0, 0, 0.8);
            border-radius: 15px;
            padding: 25px;
            width: 300px;
            text-align: center;
            border: 1px solid rgba(192, 192, 192, 0.3);
            transition: transform 0.3s, box-shadow 0.3s;
        }
        
        .status-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 30px rgba(0, 0, 0, 0.7);
        }
        
        .status-icon {
            font-size: 3rem;
            margin-bottom: 15px;
        }
        
        .status-connecting { color: #FFA500; }
        .status-connected { color: #00FF00; }
        .status-disconnected { color: #FF4444; }
        
        .status-card h3 {
            font-size: 1.5rem;
            margin-bottom: 10px;
            color: var(--mercedes-silver);
        }
        
        .status-value {
            font-size: 1.8rem;
            font-weight: bold;
            padding: 8px 20px;
            border-radius: 50px;
            display: inline-block;
        }
        
        .connected { background: rgba(0, 255, 0, 0.1); color: #00FF00; }
        .disconnected { background: rgba(255, 68, 68, 0.1); color: #FF4444; }
        .connecting { background: rgba(255, 165, 0, 0.1); color: #FFA500; }
        
        .qr-section {
            background: rgba(0, 0, 0, 0.9);
            border-radius: 20px;
            padding: 40px;
            margin: 40px 0;
            text-align: center;
            border: 1px solid var(--mercedes-blue);
            box-shadow: 0 10px 25px rgba(0, 160, 233, 0.2);
        }
        
        .qr-section h2 {
            font-size: 2.2rem;
            margin-bottom: 20px;
            color: var(--mercedes-silver);
        }
        
        .qr-container {
            padding: 25px;
            background: white;
            border-radius: 15px;
            display: inline-block;
            margin: 20px 0;
            box-shadow: 0 5px 15px rgba(255, 255, 255, 0.1);
        }
        
        .qr-container img {
            width: 280px;
            height: 280px;
            border-radius: 10px;
        }
        
        .pair-section {
            background: rgba(0, 0, 0, 0.8);
            border-radius: 20px;
            padding: 40px;
            margin: 40px 0;
            border: 1px solid var(--mercedes-red);
        }
        
        .pair-section h2 {
            text-align: center;
            font-size: 2.2rem;
            margin-bottom: 30px;
            color: var(--mercedes-silver);
        }
        
        .form-group {
            max-width: 500px;
            margin: 0 auto;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 10px;
            font-size: 1.1rem;
            color: var(--mercedes-silver);
        }
        
        .form-control {
            width: 100%;
            padding: 15px 20px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid var(--mercedes-silver);
            border-radius: 10px;
            color: white;
            font-size: 1.1rem;
            margin-bottom: 20px;
            transition: all 0.3s;
        }
        
        .form-control:focus {
            outline: none;
            border-color: var(--mercedes-blue);
            box-shadow: 0 0 15px rgba(0, 160, 233, 0.5);
        }
        
        .form-control::placeholder {
            color: rgba(255, 255, 255, 0.5);
        }
        
        .btn {
            padding: 15px 35px;
            border: none;
            border-radius: 10px;
            font-size: 1.1rem;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, var(--mercedes-blue), #0077B6);
            color: white;
        }
        
        .btn-primary:hover {
            background: linear-gradient(135deg, #0077B6, var(--mercedes-blue));
            transform: translateY(-3px);
            box-shadow: 0 10px 20px rgba(0, 160, 233, 0.4);
        }
        
        .btn-secondary {
            background: linear-gradient(135deg, var(--mercedes-silver), #8a8a8a);
            color: black;
        }
        
        .btn-secondary:hover {
            background: linear-gradient(135deg, #8a8a8a, var(--mercedes-silver));
            transform: translateY(-3px);
            box-shadow: 0 10px 20px rgba(192, 192, 192, 0.4);
        }
        
        .btn-danger {
            background: linear-gradient(135deg, var(--mercedes-red), #B30000);
            color: white;
        }
        
        .btn-danger:hover {
            background: linear-gradient(135deg, #B30000, var(--mercedes-red));
            transform: translateY(-3px);
            box-shadow: 0 10px 20px rgba(228, 0, 43, 0.4);
        }
        
        .btn-group {
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 30px;
            flex-wrap: wrap;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 25px;
            margin: 40px 0;
        }
        
        .info-card {
            background: rgba(0, 0, 0, 0.7);
            border-radius: 15px;
            padding: 25px;
            border-left: 5px solid var(--mercedes-blue);
        }
        
        .info-card h3 {
            color: var(--mercedes-silver);
            margin-bottom: 15px;
            font-size: 1.4rem;
        }
        
        .info-card p {
            color: rgba(255, 255, 255, 0.8);
            line-height: 1.6;
        }
        
        .code-display {
            background: rgba(0, 0, 0, 0.9);
            border: 2px solid var(--mercedes-blue);
            border-radius: 15px;
            padding: 30px;
            text-align: center;
            margin: 30px auto;
            max-width: 600px;
        }
        
        .code-display h2 {
            color: var(--mercedes-silver);
            margin-bottom: 20px;
        }
        
        .pairing-code {
            font-family: 'Courier New', monospace;
            font-size: 3rem;
            font-weight: bold;
            color: #00FF00;
            background: rgba(0, 0, 0, 0.9);
            padding: 20px;
            border-radius: 10px;
            letter-spacing: 5px;
            margin: 20px 0;
            border: 1px solid var(--mercedes-blue);
        }
        
        .instructions {
            background: rgba(0, 160, 233, 0.1);
            padding: 20px;
            border-radius: 10px;
            margin-top: 25px;
            text-align: left;
        }
        
        .instructions ol {
            padding-left: 20px;
        }
        
        .instructions li {
            margin-bottom: 10px;
            color: rgba(255, 255, 255, 0.9);
        }
        
        .footer {
            text-align: center;
            margin-top: 60px;
            padding-top: 30px;
            border-top: 1px solid rgba(192, 192, 192, 0.3);
            color: rgba(255, 255, 255, 0.6);
            font-size: 0.9rem;
        }
        
        .footer a {
            color: var(--mercedes-blue);
            text-decoration: none;
        }
        
        .footer a:hover {
            text-decoration: underline;
        }
        
        .hidden {
            display: none;
        }
        
        @media (max-width: 768px) {
            .header h1 {
                font-size: 2.5rem;
            }
            
            .status-container {
                flex-direction: column;
                align-items: center;
            }
            
            .btn-group {
                flex-direction: column;
                align-items: center;
            }
            
            .btn {
                width: 100%;
                max-width: 300px;
            }
            
            .qr-container img {
                width: 220px;
                height: 220px;
            }
            
            .pairing-code {
                font-size: 2rem;
                letter-spacing: 3px;
            }
        }
        
        .pulse {
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.7; }
            100% { opacity: 1; }
        }
        
        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid rgba(255,255,255,.3);
            border-radius: 50%;
            border-top-color: var(--mercedes-blue);
            animation: spin 1s ease-in-out infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="mercedes-logo">
                <i class="fas fa-star"></i>
            </div>
            <h1>Mercedes WhatsApp Bot</h1>
            <p class="tagline">Premium Automation with German Engineering Excellence</p>
            
            <div class="status-container">
                <div class="status-card">
                    <div class="status-icon">
                        <i class="fas fa-signal"></i>
                    </div>
                    <h3>Connection Status</h3>
                    <div class="status-value ${botStatus}">${botStatus.toUpperCase()}</div>
                </div>
                
                <div class="status-card">
                    <div class="status-icon">
                        <i class="fas fa-cogs"></i>
                    </div>
                    <h3>Command Prefix</h3>
                    <div class="status-value" style="color: var(--mercedes-blue);">${global.BOT_PREFIX}</div>
                </div>
                
                <div class="status-card">
                    <div class="status-icon">
                        <i class="fas fa-server"></i>
                    </div>
                    <h3>Server Port</h3>
                    <div class="status-value" style="color: var(--mercedes-silver);">${PORT}</div>
                </div>
            </div>
        </div>
        
        ${botStatus === 'connecting' && latestQR ? `
        <div class="qr-section">
            <h2><i class="fas fa-qrcode"></i> Scan QR Code</h2>
            <p>Scan this QR code with WhatsApp to link your device</p>
            
            <div class="qr-container">
                <img src="${latestQR}" alt="WhatsApp QR Code">
            </div>
            
            <p class="pulse">
                <i class="fas fa-sync-alt"></i> QR will refresh automatically
            </p>
            
            <div class="instructions">
                <h3><i class="fas fa-info-circle"></i> Instructions:</h3>
                <ol>
                    <li>Open WhatsApp on your phone</li>
                    <li>Tap on <strong>Settings</strong> → <strong>Linked Devices</strong></li>
                    <li>Tap on <strong>Link a Device</strong></li>
                    <li>Point your camera at the QR code above</li>
                </ol>
            </div>
        </div>
        ` : ''}
        
        <div class="pair-section">
            <h2><i class="fas fa-mobile-alt"></i> Pair with Phone Number</h2>
            <p style="text-align: center; margin-bottom: 30px; color: rgba(255,255,255,0.8);">
                Enter your phone number in international format to receive a pairing code
            </p>
            
            <form method="POST" action="/pair" id="pairForm">
                <div class="form-group">
                    <label for="phone"><i class="fas fa-phone"></i> Phone Number</label>
                    <input type="text" name="phone" id="phone" class="form-control" 
                           placeholder="911234567890 (without +)" required>
                    <small style="color: rgba(255,255,255,0.6); display: block; margin-top: -15px; margin-bottom: 20px;">
                        Example: 911234567890 for +91-1234567890
                    </small>
                    
                    <button type="submit" class="btn btn-primary" id="pairBtn">
                        <i class="fas fa-key"></i> Generate Pairing Code
                    </button>
                </div>
            </form>
        </div>
        
        <div class="info-grid">
            <div class="info-card">
                <h3><i class="fas fa-shield-alt"></i> Secure Session</h3>
                <p>Your WhatsApp session is stored locally and encrypted. No data is sent to external servers.</p>
            </div>
            
            <div class="info-card">
                <h3><i class="fas fa-plug"></i> Auto-Reconnect</h3>
                <p>The bot automatically reconnects if the connection drops. No manual intervention needed.</p>
            </div>
            
            <div class="info-card">
                <h3><i class="fas fa-bolt"></i> High Performance</h3>
                <p>Built with Mercedes-grade engineering for reliability and speed. Handles multiple requests seamlessly.</p>
            </div>
        </div>
        
        <div class="btn-group">
            <button class="btn btn-secondary" onclick="location.reload()">
                <i class="fas fa-sync-alt"></i> Refresh Status
            </button>
            
            <button class="btn btn-primary" onclick="window.location.href='/'">
                <i class="fas fa-home"></i> Dashboard
            </button>
            
            ${botStatus === 'connected' ? `
            <button class="btn btn-danger" onclick="alert('Bot is connected and running!')">
                <i class="fas fa-play-circle"></i> Bot Active
            </button>
            ` : ''}
        </div>
        
        <div class="footer">
            <p>
                <i class="fas fa-car"></i> Mercedes WhatsApp Bot v2.0 | 
                Premium Automation Solution
            </p>
            <p>
                Session Path: <code>${AUTH_FOLDER}</code> | 
                Uptime: <span id="uptime">${Math.floor(process.uptime())}s</span>
            </p>
            <p>
                &copy; ${new Date().getFullYear()} Mercedes Bot Technologies. 
                All rights reserved.
            </p>
        </div>
    </div>

    <script>
        // Auto-refresh if not connected
        if("${botStatus}" !== "connected") {
            setTimeout(() => location.reload(), 10000);
        }
        
        // Update uptime counter
        let uptime = ${Math.floor(process.uptime())};
        setInterval(() => {
            uptime++;
            document.getElementById('uptime').textContent = uptime + 's';
        }, 1000);
        
        // Form submission handling
        document.getElementById('pairForm')?.addEventListener('submit', function(e) {
            const btn = document.getElementById('pairBtn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span class="loading"></span> Generating Code...';
            btn.disabled = true;
            
            // Re-enable button after 10 seconds if something goes wrong
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }, 10000);
        });
        
        // Status color animation
        const statusValue = document.querySelector('.status-value');
        if(statusValue) {
            if(statusValue.classList.contains('connecting')) {
                statusValue.classList.add('pulse');
            }
        }
    </script>
</body>
</html>
        `);
    } 
    
    else if (url === '/pair' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pair Device - Mercedes Bot</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #000000, #1a1a1a);
            color: white;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        
        .container {
            background: rgba(0, 0, 0, 0.9);
            border-radius: 20px;
            padding: 40px;
            width: 100%;
            max-width: 500px;
            border: 1px solid #C0C0C0;
            box-shadow: 0 15px 35px rgba(0, 0, 0, 0.7);
        }
        
        .logo {
            text-align: center;
            font-size: 3rem;
            color: #C0C0C0;
            margin-bottom: 20px;
        }
        
        h1 {
            text-align: center;
            color: #C0C0C0;
            margin-bottom: 30px;
            font-size: 2.2rem;
        }
        
        .back-btn {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            color: #00A0E9;
            text-decoration: none;
            margin-bottom: 30px;
            font-size: 1.1rem;
        }
        
        .back-btn:hover {
            text-decoration: underline;
        }
        
        .form-group {
            margin-bottom: 25px;
        }
        
        label {
            display: block;
            margin-bottom: 10px;
            font-size: 1.1rem;
            color: #C0C0C0;
        }
        
        input {
            width: 100%;
            padding: 15px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid #C0C0C0;
            border-radius: 10px;
            color: white;
            font-size: 1.1rem;
            transition: all 0.3s;
        }
        
        input:focus {
            outline: none;
            border-color: #00A0E9;
            box-shadow: 0 0 15px rgba(0, 160, 233, 0.5);
        }
        
        button {
            width: 100%;
            padding: 16px;
            background: linear-gradient(135deg, #00A0E9, #0077B6);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 1.2rem;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        
        button:hover {
            background: linear-gradient(135deg, #0077B6, #00A0E9);
            transform: translateY(-3px);
            box-shadow: 0 10px 20px rgba(0, 160, 233, 0.4);
        }
        
        .instructions {
            background: rgba(0, 160, 233, 0.1);
            padding: 20px;
            border-radius: 10px;
            margin-top: 25px;
            font-size: 0.9rem;
        }
        
        .instructions p {
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <i class="fas fa-star"></i>
        </div>
        
        <a href="/" class="back-btn">
            <i class="fas fa-arrow-left"></i> Back to Dashboard
        </a>
        
        <h1>Pair WhatsApp Device</h1>
        
        <form method="POST">
            <div class="form-group">
                <label for="phone"><i class="fas fa-phone"></i> Phone Number</label>
                <input type="text" name="phone" id="phone" placeholder="911234567890" required>
                <small style="color: rgba(255,255,255,0.6); display: block; margin-top: 10px;">
                    Enter phone number in international format without +
                </small>
            </div>
            
            <button type="submit">
                <i class="fas fa-key"></i> Get Pairing Code
            </button>
        </form>
        
        <div class="instructions">
            <p><strong><i class="fas fa-info-circle"></i> Important:</strong></p>
            <p>• Make sure your phone has an active internet connection</p>
            <p>• The bot must be in "connecting" state to generate codes</p>
            <p>• Code expires in a few minutes</p>
        </div>
    </div>
</body>
</html>
        `);
    }
    
    else if (url === '/pair' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const params = new URLSearchParams(body);
                let phoneNumber = params.get('phone').trim();
                
                if (!phoneNumber) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body { 
                                font-family: Arial; 
                                background: linear-gradient(135deg, #000, #1a1a1a); 
                                color: white; 
                                display: flex; 
                                justify-content: center; 
                                align-items: center; 
                                min-height: 100vh; 
                                margin: 0; 
                                padding: 20px; 
                            }
                            .error-box { 
                                background: rgba(0,0,0,0.9); 
                                padding: 40px; 
                                border-radius: 15px; 
                                border: 1px solid #E4002B; 
                                text-align: center; 
                                max-width: 500px; 
                            }
                            h2 { color: #E4002B; margin-bottom: 20px; }
                            a { 
                                color: #00A0E9; 
                                text-decoration: none; 
                                display: inline-block; 
                                margin-top: 20px; 
                                padding: 10px 20px; 
                                border: 1px solid #00A0E9; 
                                border-radius: 5px; 
                            }
                            a:hover { background: rgba(0,160,233,0.2); }
                        </style>
                    </head>
                    <body>
                        <div class="error-box">
                            <h2><i class="fas fa-exclamation-triangle"></i> Error: Phone Number Required</h2>
                            <p>Please enter a valid phone number</p>
                            <a href="/pair">Try Again</a>
                        </div>
                    </body>
                    </html>
                    `);
                    return;
                }

                phoneNumber = phoneNumber.replace(/\D/g, '');
                
                if (botStatus !== 'connecting' || !sock) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body { 
                                font-family: Arial; 
                                background: linear-gradient(135deg, #000, #1a1a1a); 
                                color: white; 
                                display: flex; 
                                justify-content: center; 
                                align-items: center; 
                                min-height: 100vh; 
                                margin: 0; 
                                padding: 20px; 
                            }
                            .warning-box { 
                                background: rgba(0,0,0,0.9); 
                                padding: 40px; 
                                border-radius: 15px; 
                                border: 1px solid #FFA500; 
                                text-align: center; 
                                max-width: 500px; 
                            }
                            h2 { color: #FFA500; margin-bottom: 20px; }
                            .status { 
                                background: rgba(255,165,0,0.1); 
                                padding: 10px; 
                                border-radius: 5px; 
                                margin: 20px 0; 
                            }
                            a { 
                                color: #00A0E9; 
                                text-decoration: none; 
                                display: inline-block; 
                                margin-top: 20px; 
                                padding: 10px 20px; 
                                border: 1px solid #00A0E9; 
                                border-radius: 5px; 
                            }
                            a:hover { background: rgba(0,160,233,0.2); }
                        </style>
                    </head>
                    <body>
                        <div class="warning-box">
                            <h2><i class="fas fa-exclamation-circle"></i> Bot Not Ready</h2>
                            <div class="status">
                                <p>Current Status: <strong>${botStatus}</strong></p>
                            </div>
                            <p>Please wait for the bot to be in "connecting" state first.</p>
                            <p>The QR code should be visible on the main page.</p>
                            <a href="/">← Go to Dashboard</a>
                        </div>
                    </body>
                    </html>
                    `);
                    return;
                }

                const pairingCode = await sock.requestPairingCode(phoneNumber);
                
                pairingCodes.set(phoneNumber, {
                    code: pairingCode,
                    timestamp: Date.now()
                });

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pairing Code - Mercedes Bot</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #000000, #1a1a1a);
            color: white;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
        }
        
        .success-header {
            text-align: center;
            padding: 30px;
            background: rgba(0, 0, 0, 0.8);
            border-radius: 20px;
            border: 1px solid #00A0E9;
            margin-bottom: 40px;
        }
        
        .success-icon {
            font-size: 5rem;
            color: #00FF00;
            margin-bottom: 20px;
        }
        
        .success-header h1 {
            color: #C0C0C0;
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        
        .phone-display {
            font-size: 1.5rem;
            color: #00A0E9;
            margin: 20px 0;
            padding: 15px;
            background: rgba(0, 160, 233, 0.1);
            border-radius: 10px;
            display: inline-block;
        }
        
        .code-display {
            background: rgba(0, 0, 0, 0.9);
            border: 2px solid #00A0E9;
            border-radius: 15px;
            padding: 40px;
            text-align: center;
            margin: 40px auto;
            max-width: 600px;
        }
        
        .code-display h2 {
            color: #C0C0C0;
            margin-bottom: 30px;
            font-size: 1.8rem;
        }
        
        .pairing-code {
            font-family: 'Courier New', monospace;
            font-size: 3.5rem;
            font-weight: bold;
            color: #00FF00;
            background: rgba(0, 0, 0, 0.9);
            padding: 25px;
            border-radius: 10px;
            letter-spacing: 8px;
            margin: 30px 0;
            border: 1px solid #00A0E9;
            text-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
        }
        
        .instructions {
            background: rgba(0, 160, 233, 0.1);
            padding: 30px;
            border-radius: 15px;
            margin: 40px 0;
            text-align: left;
        }
        
        .instructions h3 {
            color: #C0C0C0;
            margin-bottom: 20px;
            font-size: 1.5rem;
        }
        
        .instructions ol {
            padding-left: 25px;
            font-size: 1.1rem;
            line-height: 1.8;
        }
        
        .instructions li {
            margin-bottom: 15px;
            color: rgba(255, 255, 255, 0.9);
        }
        
        .instructions li strong {
            color: #00A0E9;
        }
        
        .timer {
            text-align: center;
            padding: 20px;
            background: rgba(255, 165, 0, 0.1);
            border-radius: 10px;
            margin: 20px 0;
            color: #FFA500;
            font-size: 1.2rem;
        }
        
        .action-buttons {
            display: flex;
            gap: 20px;
            justify-content: center;
            margin-top: 40px;
            flex-wrap: wrap;
        }
        
        .btn {
            padding: 15px 35px;
            border: none;
            border-radius: 10px;
            font-size: 1.1rem;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            text-decoration: none;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #00A0E9, #0077B6);
            color: white;
        }
        
        .btn-primary:hover {
            background: linear-gradient(135deg, #0077B6, #00A0E9);
            transform: translateY(-3px);
            box-shadow: 0 10px 20px rgba(0, 160, 233, 0.4);
        }
        
        .btn-secondary {
            background: linear-gradient(135deg, #C0C0C0, #8a8a8a);
            color: black;
        }
        
        .btn-secondary:hover {
            background: linear-gradient(135deg, #8a8a8a, #C0C0C0);
            transform: translateY(-3px);
            box-shadow: 0 10px 20px rgba(192, 192, 192, 0.4);
        }
        
        .footer {
            text-align: center;
            margin-top: 60px;
            padding-top: 30px;
            border-top: 1px solid rgba(192, 192, 192, 0.3);
            color: rgba(255, 255, 255, 0.6);
        }
        
        @media (max-width: 768px) {
            .pairing-code {
                font-size: 2.5rem;
                letter-spacing: 5px;
                padding: 20px;
            }
            
            .action-buttons {
                flex-direction: column;
                align-items: center;
            }
            
            .btn {
                width: 100%;
                max-width: 300px;
            }
        }
        
        .pulse {
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.7; }
            100% { opacity: 1; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-header">
            <div class="success-icon">
                <i class="fas fa-check-circle"></i>
            </div>
            <h1>Pairing Code Generated</h1>
            <div class="phone-display">
                <i class="fas fa-mobile-alt"></i> +${phoneNumber}
            </div>
        </div>
        
        <div class="code-display">
            <h2><i class="fas fa-key"></i> Your Pairing Code</h2>
            <div class="pairing-code pulse">
                ${pairingCode}
            </div>
            <p>This code will expire in a few minutes</p>
        </div>
        
        <div class="timer">
            <i class="fas fa-clock"></i> Use this code immediately
        </div>
        
        <div class="instructions">
            <h3><i class="fas fa-list-ol"></i> How to Use:</h3>
            <ol>
                <li>Open <strong>WhatsApp</strong> on your phone</li>
                <li>Go to <strong>Settings</strong> → <strong>Linked Devices</strong></li>
                <li>Tap on <strong>Link a Device</strong></li>
                <li>Select <strong>"Use pairing code"</strong> option</li>
                <li>Enter the code shown above: <strong>${pairingCode}</strong></li>
                <li>Tap <strong>"Link Device"</strong> to complete the process</li>
            </ol>
        </div>
        
        <div class="action-buttons">
            <a href="/" class="btn btn-primary">
                <i class="fas fa-home"></i> Dashboard
            </a>
            <a href="/pair" class="btn btn-secondary">
                <i class="fas fa-sync-alt"></i> Generate Another Code
            </a>
        </div>
        
        <div class="footer">
            <p><i class="fas fa-star"></i> Mercedes WhatsApp Bot - Premium Connection Service</p>
            <p>Code generated at: ${new Date().toLocaleString()}</p>
        </div>
    </div>
    
    <script>
        // Add copy to clipboard functionality
        const codeElement = document.querySelector('.pairing-code');
        if(codeElement) {
            codeElement.addEventListener('click', function() {
                const text = this.textContent.trim();
                navigator.clipboard.writeText(text).then(() => {
                    const originalText = this.textContent;
                    this.textContent = 'COPIED!';
                    this.style.color = '#00A0E9';
                    setTimeout(() => {
                        this.textContent = originalText;
                        this.style.color = '#00FF00';
                    }, 2000);
                });
            });
            
            codeElement.style.cursor = 'pointer';
            codeElement.title = 'Click to copy';
        }
    </script>
</body>
</html>
                `);

                console.log(`✅ Pairing code for ${phoneNumber}: ${pairingCode}`);
                
            } catch (error) {
                console.error('❌ Pair error:', error);
                
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { 
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            background: linear-gradient(135deg, #000, #1a1a1a); 
                            color: white; 
                            display: flex; 
                            justify-content: center; 
                            align-items: center; 
                            min-height: 100vh; 
                            margin: 0; 
                            padding: 20px; 
                        }
                        .error-container { 
                            background: rgba(0,0,0,0.9); 
                            padding: 50px; 
                            border-radius: 20px; 
                            border: 1px solid #E4002B; 
                            text-align: center; 
                            max-width: 600px; 
                            width: 100%;
                        }
                        .error-icon {
                            font-size: 4rem;
                            color: #E4002B;
                            margin-bottom: 30px;
                        }
                        h2 { 
                            color: #E4002B; 
                            margin-bottom: 20px; 
                            font-size: 2rem;
                        }
                        .error-details {
                            background: rgba(228, 0, 43, 0.1);
                            padding: 20px;
                            border-radius: 10px;
                            margin: 30px 0;
                            text-align: left;
                            font-family: monospace;
                            font-size: 0.9rem;
                        }
                        .btn-group {
                            display: flex;
                            gap: 15px;
                            justify-content: center;
                            margin-top: 30px;
                            flex-wrap: wrap;
                        }
                        a { 
                            color: white; 
                            text-decoration: none; 
                            display: inline-flex;
                            align-items: center;
                            gap: 10px;
                            padding: 12px 25px; 
                            border-radius: 10px; 
                            transition: all 0.3s;
                        }
                        .btn-retry { 
                            background: linear-gradient(135deg, #00A0E9, #0077B6); 
                        }
                        .btn-home { 
                            background: linear-gradient(135deg, #C0C0C0, #8a8a8a); 
                            color: black;
                        }
                        a:hover { 
                            transform: translateY(-3px); 
                            box-shadow: 0 10px 20px rgba(0,0,0,0.3);
                        }
                    </style>
                </head>
                <body>
                    <div class="error-container">
                        <div class="error-icon">
                            <i class="fas fa-exclamation-triangle"></i>
                        </div>
                        <h2>Pairing Error</h2>
                        <p>Could not generate pairing code. Please check the following:</p>
                        
                        <div class="error-details">
                            <p><strong>Error:</strong> ${error.message}</p>
                        </div>
                        
                        <p><strong>Possible reasons:</strong></p>
                        <ul style="text-align: left; padding-left: 20px; margin: 20px 0;">
                            <li>Phone number must be in international format</li>
                            <li>Bot must be in "connecting" state</li>
                            <li>Make sure WhatsApp is installed on the phone</li>
                            <li>Check your internet connection</li>
                        </ul>
                        
                        <div class="btn-group">
                            <a href="/pair" class="btn-retry">
                                <i class="fas fa-redo"></i> Try Again
                            </a>
                            <a href="/" class="btn-home">
                                <i class="fas fa-home"></i> Back to Dashboard
                            </a>
                        </div>
                    </div>
                </body>
                </html>
                `);
            }
        });
        return;
    }
    
    else if (url === '/api/status') {
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ 
            status: botStatus,
            hasQR: !!latestQR,
            qr: latestQR,
            prefix: global.BOT_PREFIX,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            theme: 'mercedes',
            version: '2.0'
        }));
    }
    
    else {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #000000, #1a1a1a);
                    color: white; 
                    display: flex; 
                    justify-content: center; 
                    align-items: center; 
                    min-height: 100vh; 
                    margin: 0; 
                    padding: 20px; 
                    text-align: center;
                }
                .container { 
                    max-width: 500px; 
                    padding: 40px; 
                    background: rgba(0,0,0,0.9); 
                    border-radius: 20px; 
                    border: 1px solid #E4002B;
                }
                h1 { 
                    color: #E4002B; 
                    font-size: 4rem; 
                    margin-bottom: 20px; 
                }
                p { 
                    font-size: 1.2rem; 
                    margin-bottom: 30px; 
                    color: #C0C0C0;
                }
                a { 
                    color: #00A0E9; 
                    text-decoration: none; 
                    font-size: 1.1rem; 
                    border: 1px solid #00A0E9; 
                    padding: 12px 30px; 
                    border-radius: 10px; 
                    transition: all 0.3s; 
                    display: inline-flex; 
                    align-items: center; 
                    gap: 10px;
                }
                a:hover { 
                    background: rgba(0,160,233,0.2); 
                    transform: translateY(-3px); 
                }
                .logo { 
                    font-size: 3rem; 
                    color: #C0C0C0; 
                    margin-bottom: 20px; 
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">
                    <i class="fas fa-star"></i>
                </div>
                <h1>404</h1>
                <p>The page you're looking for doesn't exist.</p>
                <a href="/">
                    <i class="fas fa-home"></i> Return to Dashboard
                </a>
            </div>
        </body>
        </html>
        `);
    }
});

// Start the server
server.listen(PORT, () => {
    console.log(`🌐 Mercedes Bot Dashboard: http://localhost:${PORT}`);
    console.log(`📁 Session folder: ${path.resolve(AUTH_FOLDER)}`);
    loadPrefix();
});

// Handle process events
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down Mercedes Bot gracefully...');
    if (presenceInterval) clearInterval(presenceInterval);
    if (sock) sock.end();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection:', reason);
});
