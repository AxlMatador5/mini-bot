const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestWaWebVersion, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const http = require('http');
const QRCode = require('qrcode');
const { Boom } = require('@hapi/boom');
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

// ===== STATUS & NEWSLETTER CONFIG ===== //
const STATUS_CONFIG = {
    AUTO_VIEW_STATUS: true,
    AUTO_LIKE_STATUS: true,
    AUTO_RECORDING: true,
    AUTO_LIKE_EMOJIS: [
        '❤️', '🔥', '👍', '😍', '🥰', '😂', '😮', '😢', '👏',
        '🎉', '🤩', '😎', '🤗', '🙏', '💯', '✨', '🌟', '💖'
    ],
    
    AUTO_FOLLOW_NEWSLETTERS: true,
    AUTO_REACT_NEWSLETTERS: true,
    NEWSLETTER_JIDS: [
        '120363299029326322@newsletter',
        '120363401297349965@newsletter', 
        '120363339980514201@newsletter',
        '120363420947784745@newsletter',
        '120363296314610373@newsletter'
    ],
    NEWSLETTER_REACT_EMOJIS: [
        '🩵', '🧘', '😀', '👍', '🤭', '😂', '🥹', '🥰', '😍', '🤩', 
        '😎', '🥳', '😜', '🤗', '🫠', '😢', '😡', '🤯', '🥶', '😴', 
        '🙄', '🤔', '🐶', '🐱', '🐢', '🦋', '🐙', '🦄', '🦁', '🐝', 
        '🌸', '🍀', '🌈', '⭐', '🌙', '🍁', '🌵', '🍕', '🍦', '🍩', 
        '☕', '🧋', '🥑', '🍇', '🍔', '🌮', '🍜', '⚽', '🎮', '🎨', 
        '✈️', '🚀', '💡', '📚', '🎸', '🛼', '🎯', '💎', '🧩', '🔭', 
        '❤️', '🔥', '💫', '✨', '💯', '✅', '❌', '🙏'
    ]
};

let latestQR = '';
let botStatus = 'disconnected';
let pairingCodes = new Map();
let presenceInterval = null;
let sock = null;
let isConnecting = false;
let canPair = false; // Changed: Initially false, becomes true when connected

// ===== NEWSLETTER FUNCTIONS ===== //
async function autoFollowNewsletters(socket) {
    if (!STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS) return;
    
    try {
        const newsletterList = STATUS_CONFIG.NEWSLETTER_JIDS;
        console.log(`📰 Attempting to follow ${newsletterList.length} newsletters...`);
        
        let followedCount = 0;
        let alreadyFollowingCount = 0;
        let failedCount = 0;
        
        for (const newsletterJid of newsletterList) {
            try {
                let alreadyFollowing = false;
                try {
                    const metadata = await socket.newsletterMetadata("jid", newsletterJid);
                    if (metadata && metadata.viewer_metadata) {
                        alreadyFollowing = true;
                    }
                } catch (metaError) {
                    alreadyFollowing = false;
                }
                
                if (!alreadyFollowing) {
                    await socket.newsletterFollow(newsletterJid);
                    console.log(`✅ Followed newsletter: ${newsletterJid}`);
                    followedCount++;
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    console.log(`📌 Already following: ${newsletterJid}`);
                    alreadyFollowingCount++;
                }
                
            } catch (error) {
                failedCount++;
                if (error.message.includes('already subscribed') || 
                    error.message.includes('already following') ||
                    error.message.includes('subscription exists')) {
                    console.log(`📌 Already following: ${newsletterJid}`);
                    alreadyFollowingCount++;
                } else {
                    console.error(`❌ Failed to follow ${newsletterJid}:`, error.message);
                }
            }
        }
        
        console.log(`📊 Newsletter follow results:`);
        console.log(`   ✅ Newly followed: ${followedCount}`);
        console.log(`   📌 Already following: ${alreadyFollowingCount}`);
        console.log(`   ❌ Failed: ${failedCount}`);
        
    } catch (error) {
        console.error('❌ Newsletter follow error:', error.message);
    }
}

// ===== ENHANCED STATUS & NEWSLETTER HANDLER ===== //
function setupEnhancedHandlers(socket) {
    console.log('📱 Setting up enhanced status & newsletter handlers...');
    
    socket.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        
        for (const message of messages) {
            if (!message?.key) continue;
            
            const messageJid = message.key.remoteJid;
            
            if (messageJid === 'status@broadcast' && message.key.participant) {
                try {
                    const participant = message.key.participant;
                    
                    if (STATUS_CONFIG.AUTO_RECORDING) {
                        try {
                            await socket.sendPresenceUpdate("recording", messageJid);
                        } catch (presenceError) {}
                    }
                    
                    if (STATUS_CONFIG.AUTO_VIEW_STATUS) {
                        try {
                            await socket.readMessages([message.key]);
                        } catch (viewError) {
                            console.log(`❌ Status view error: ${viewError.message}`);
                        }
                    }
                    
                    if (STATUS_CONFIG.AUTO_LIKE_STATUS) {
                        try {
                            const randomEmoji = STATUS_CONFIG.AUTO_LIKE_EMOJIS[
                                Math.floor(Math.random() * STATUS_CONFIG.AUTO_LIKE_EMOJIS.length)
                            ];
                            
                            await socket.sendMessage(
                                messageJid,
                                { react: { text: randomEmoji, key: message.key } },
                                { statusJidList: [participant] }
                            );
                        } catch (reactError) {
                            console.log(`❌ Status reaction error: ${reactError.message}`);
                        }
                    }
                    
                } catch (error) {
                    console.error('❌ Status handler error:', error.message);
                }
                continue;
            }
            
            if (STATUS_CONFIG.AUTO_REACT_NEWSLETTERS) {
                try {
                    if (STATUS_CONFIG.NEWSLETTER_JIDS.includes(messageJid)) {
                        let messageId = null;
                        
                        if (message.newsletterServerId) {
                            messageId = message.newsletterServerId;
                        } else if (message.key?.id) {
                            messageId = message.key.id;
                        } else if (message.message?.newsletterServerId) {
                            messageId = message.message.newsletterServerId;
                        }
                        
                        if (messageId) {
                            const randomEmoji = STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS[
                                Math.floor(Math.random() * STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS.length)
                            ];
                            
                            try {
                                await socket.newsletterReactMessage(
                                    messageJid,
                                    messageId.toString(),
                                    randomEmoji
                                );
                            } catch (reactError) {
                                try {
                                    await socket.sendMessage(messageJid, {
                                        react: {
                                            text: randomEmoji,
                                            key: {
                                                remoteJid: messageJid,
                                                id: messageId,
                                                fromMe: false
                                            }
                                        }
                                    });
                                } catch (altError) {}
                            }
                        }
                    }
                } catch (error) {
                    console.error('❌ Newsletter reaction error:', error.message);
                }
            }
        }
    });
}

// ===== ENHANCED WELCOME MESSAGE ===== //
async function sendEnhancedWelcomeMessage(socket) {
    try {
        const welcomeText = `*Mercedes WhatsApp Bot Connected!*\n\n` +
                           `📝 *Prefix:* ${global.BOT_PREFIX}\n` +
                           `⏰ *Connected:* ${new Date().toLocaleString()}\n` +
                           `> *made by marisel*`;
        
        await socket.sendMessage(socket.user.id, { text: welcomeText });
    } catch (err) {
        console.error('Could not send enhanced welcome message:', err);
    }
}

// ===== FIXED PAIRING CODE GENERATION ===== //
async function generatePairingCode(phoneNumber) {
    if (!sock || !canPair) {
        throw new Error('Bot not ready for pairing. Please connect via QR first.');
    }
    
    try {
        console.log(`🔗 Generating pairing code for: ${phoneNumber}`);
        
        // Clean the phone number (keep only digits)
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        
        // Remove any leading zeros
        const sanitizedNumber = cleanNumber.replace(/^0+/, '');
        
        if (!sanitizedNumber || sanitizedNumber.length < 8) {
            throw new Error('Invalid phone number. Need at least 8 digits.');
        }
        
        console.log(`📱 Using number for pairing: ${sanitizedNumber}`);
        
        // FIXED: Use custom pairing phrase "MARISEL" for better compatibility
        const pairingCode = await sock.requestPairingCode(sanitizedNumber, "MARISEL");
        
        console.log(`✅ Pairing code generated: ${pairingCode}`);
        
        // Store the code with timestamp
        pairingCodes.set(phoneNumber, {
            code: pairingCode,
            timestamp: Date.now(),
            number: sanitizedNumber
        });
        
        return pairingCode;
        
    } catch (error) {
        console.error('❌ Pairing code generation failed:', error);
        
        // Better error messages
        if (error.message.includes('not registered')) {
            throw new Error('Please connect via QR code first, then use pairing');
        } else if (error.message.includes('rate limit')) {
            throw new Error('Too many attempts. Please wait a few minutes');
        } else if (error.message.includes('timeout')) {
            throw new Error('Request timeout. Please try again');
        } else if (error.message.includes('not found')) {
            throw new Error('Phone number not found on WhatsApp');
        } else {
            throw new Error(`Pairing failed: ${error.message}`);
        }
    }
}

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
    
    if (!fs.existsSync(AUTH_FOLDER)) {
        fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    }
    
    const credsPath = path.join(AUTH_FOLDER, 'creds.json');
    if (fs.existsSync(credsPath)) {
        try {
            const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
            if (creds.noiseKey && creds.noiseKey.private) {
                console.log('📁 Using existing session...');
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
                printQRInTerminal: true,
                keepAliveIntervalMs: 10000,
                markOnlineOnConnect: true,
                syncFullHistory: false,
                browser: ['Mercedes', 'Chrome', '1.0.0']
            });
            
            setupEnhancedHandlers(sock);
            
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
                    canPair = false;
                    isConnecting = false;
                    if (presenceInterval) {
                        clearInterval(presenceInterval);
                        presenceInterval = null;
                    }

                    const statusCode = (lastDisconnect?.error instanceof Boom)
                        ? lastDisconnect.error.output.statusCode
                        : 0;

                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                    if (shouldReconnect) {
                        console.log('🔄 Reconnecting in 5 seconds...');
                        setTimeout(() => startBot(), 5000);
                    } else {
                        console.log('🚫 Logged out. Cleaning up session...');
                        if (fs.existsSync(AUTH_FOLDER)) {
                            fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
                            console.log('🗑️ Session folder removed');
                        }
                        setTimeout(() => startBot(), 3000);
                    }
                } else if (connection === 'open') {
                    botStatus = 'connected';
                    canPair = true; // NOW pairing is enabled
                    isConnecting = false;
                    console.log('✅ Bot is connected!');
                    console.log('🔗 Pairing system now ready');

                    presenceInterval = setInterval(() => {
                        if (sock?.ws?.readyState === 1) {
                            sock.sendPresenceUpdate('available');
                        }
                    }, 10000);

                    if (STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS) {
                        setTimeout(async () => {
                            try {
                                console.log('📰 Starting newsletter auto-follow...');
                                await autoFollowNewsletters(sock);
                            } catch (error) {
                                console.error('❌ Newsletter auto-follow failed:', error.message);
                            }
                        }, 5000);
                    }

                    try { 
                        await sendEnhancedWelcomeMessage(sock);
                    } catch (err) { 
                        console.error('Could not send welcome message:', err); 
                    }
                    
                    console.log('\n📊 ===== FEATURES STATUS =====');
                    console.log(`📱 Status auto-view: ${STATUS_CONFIG.AUTO_VIEW_STATUS ? '✅ Enabled' : '❌ Disabled'}`);
                    console.log(`💖 Status auto-react: ${STATUS_CONFIG.AUTO_LIKE_STATUS ? '✅ Enabled' : '❌ Disabled'}`);
                    console.log(`📰 Newsletter auto-follow: ${STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS ? '✅ Enabled' : '❌ Disabled'}`);
                    console.log(`🔥 Newsletter auto-react: ${STATUS_CONFIG.AUTO_REACT_NEWSLETTERS ? '✅ Enabled' : '❌ Disabled'}`);
                    console.log(`🔗 Pairing system: ${canPair ? '✅ Ready' : '❌ Not ready'}`);
                    console.log('================================\n');
                } else if (connection === 'connecting') {
                    botStatus = 'connecting';
                    canPair = false;
                    isConnecting = true;
                    console.log('🔄 Bot is connecting...');
                }
            });

            sock.ev.on('creds.update', async () => {
                await saveCreds();
            });

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
                            }
                        } catch (error) {
                            console.error(`❌ Failed to load plugin ${file}:`, error.message);
                        }
                    }
                    console.log(`📦 Total plugins loaded: ${plugins.size}`);
                } catch (error) {
                    console.error('❌ Error loading plugins:', error);
                }
            }
           
            sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type !== 'notify') return;
                
                for (const rawMsg of messages) {
                    if (rawMsg.key.remoteJid === 'status@broadcast' && rawMsg.key.participant) {
                        try {
                            await sock.readMessages([rawMsg.key]);
                            continue;
                        } catch (err) {}
                    }
                }

                const rawMsg = messages[0];
                if (!rawMsg.message) return;

                const m = await serializeMessage(sock, rawMsg);
                
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

        } catch (error) {
            console.error('❌ Bot startup error:', error);
            isConnecting = false;
            canPair = false;
            setTimeout(() => startBot(), 10000);
        }
    })();
}

// ===== BEAUTIFUL WEB DASHBOARD ===== //
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
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --mercedes-black: #000000;
            --mercedes-silver: #C0C0C0;
            --mercedes-blue: #00A0E9;
            --mercedes-red: #E4002B;
            --gradient-mercedes: linear-gradient(135deg, #0a0a0a, #1a1a1a, #252525);
            --card-bg: rgba(15, 15, 15, 0.9);
            --input-bg: rgba(255, 255, 255, 0.08);
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Poppins', sans-serif;
            background: var(--gradient-mercedes);
            color: white;
            min-height: 100vh;
            overflow-x: hidden;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 30px 20px;
        }
        
        .header {
            text-align: center;
            padding: 40px 30px;
            background: var(--card-bg);
            border-radius: 24px;
            margin-bottom: 40px;
            border: 1px solid rgba(192, 192, 192, 0.15);
            box-shadow: 0 15px 35px rgba(0, 0, 0, 0.5);
            position: relative;
            overflow: hidden;
            backdrop-filter: blur(10px);
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
        
        .logo-container {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 20px;
            margin-bottom: 25px;
        }
        
        .mercedes-logo {
            font-size: 4rem;
            color: var(--mercedes-silver);
            text-shadow: 0 0 20px rgba(192, 192, 192, 0.3);
        }
        
        .header h1 {
            font-size: 3.8rem;
            margin-bottom: 15px;
            background: linear-gradient(90deg, var(--mercedes-silver), #fff, var(--mercedes-silver));
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            font-weight: 700;
        }
        
        .header .tagline {
            font-size: 1.3rem;
            color: rgba(192, 192, 192, 0.8);
            margin-bottom: 40px;
            font-weight: 300;
            max-width: 600px;
            margin-left: auto;
            margin-right: auto;
        }
        
        .status-container {
            display: flex;
            justify-content: center;
            gap: 30px;
            flex-wrap: wrap;
            margin-bottom: 50px;
        }
        
        .status-card {
            background: var(--card-bg);
            border-radius: 20px;
            padding: 30px;
            width: 320px;
            text-align: center;
            border: 1px solid rgba(192, 192, 192, 0.1);
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            position: relative;
            overflow: hidden;
        }
        
        .status-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 100%;
            background: linear-gradient(45deg, transparent, rgba(0, 160, 233, 0.05), transparent);
            transform: translateX(-100%);
            transition: transform 0.6s;
        }
        
        .status-card:hover::before {
            transform: translateX(100%);
        }
        
        .status-card:hover {
            transform: translateY(-10px);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.7);
            border-color: rgba(0, 160, 233, 0.3);
        }
        
        .status-icon {
            font-size: 3.5rem;
            margin-bottom: 20px;
            display: inline-block;
            padding: 20px;
            border-radius: 50%;
            background: rgba(0, 160, 233, 0.1);
            border: 2px solid rgba(0, 160, 233, 0.2);
        }
        
        .status-connecting { color: #FFA500; }
        .status-connected { color: #00FF00; }
        .status-disconnected { color: #FF4444; }
        
        .status-card h3 {
            font-size: 1.4rem;
            margin-bottom: 15px;
            color: var(--mercedes-silver);
            font-weight: 500;
        }
        
        .status-value {
            font-size: 1.8rem;
            font-weight: 600;
            padding: 12px 25px;
            border-radius: 50px;
            display: inline-block;
            letter-spacing: 1px;
        }
        
        .connected { 
            background: linear-gradient(135deg, rgba(0, 255, 0, 0.1), rgba(0, 200, 0, 0.2)); 
            color: #00FF00; 
            border: 1px solid rgba(0, 255, 0, 0.3);
        }
        .disconnected { 
            background: linear-gradient(135deg, rgba(255, 68, 68, 0.1), rgba(200, 50, 50, 0.2)); 
            color: #FF4444; 
            border: 1px solid rgba(255, 68, 68, 0.3);
        }
        .connecting { 
            background: linear-gradient(135deg, rgba(255, 165, 0, 0.1), rgba(200, 130, 0, 0.2)); 
            color: #FFA500; 
            border: 1px solid rgba(255, 165, 0, 0.3);
        }
        
        /* Pairing Section */
        .pair-section {
            background: var(--card-bg);
            border-radius: 24px;
            padding: 50px;
            margin: 50px 0;
            border: 1px solid rgba(0, 160, 233, 0.2);
            box-shadow: 0 15px 35px rgba(0, 160, 233, 0.1);
        }
        
        .pair-section h2 {
            font-size: 2.5rem;
            text-align: center;
            margin-bottom: 30px;
            color: var(--mercedes-silver);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
        }
        
        .pair-section h2 i {
            color: var(--mercedes-blue);
        }
        
        .pair-description {
            text-align: center;
            margin-bottom: 40px;
            color: rgba(255, 255, 255, 0.7);
            font-size: 1.1rem;
            max-width: 700px;
            margin-left: auto;
            margin-right: auto;
        }
        
        .phone-form {
            max-width: 600px;
            margin: 0 auto;
        }
        
        .form-group {
            margin-bottom: 30px;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 12px;
            font-size: 1.1rem;
            color: var(--mercedes-silver);
            font-weight: 500;
        }
        
        .phone-input input {
            width: 100%;
            padding: 18px 20px;
            background: var(--input-bg);
            border: 1px solid rgba(192, 192, 192, 0.3);
            border-radius: 12px;
            color: white;
            font-size: 1.1rem;
            transition: all 0.3s;
        }
        
        .phone-input input:focus {
            outline: none;
            border-color: var(--mercedes-blue);
            box-shadow: 0 0 20px rgba(0, 160, 233, 0.4);
        }
        
        .phone-input input::placeholder {
            color: rgba(255, 255, 255, 0.5);
        }
        
        .form-note {
            color: rgba(255, 255, 255, 0.6);
            font-size: 0.9rem;
            margin-top: 8px;
            text-align: center;
        }
        
        /* Button Styles */
        .btn {
            padding: 18px 40px;
            border: none;
            border-radius: 12px;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, var(--mercedes-blue), #0077B6);
            color: white;
            border: 1px solid rgba(0, 160, 233, 0.4);
        }
        
        .btn-primary:hover {
            background: linear-gradient(135deg, #0077B6, var(--mercedes-blue));
            transform: translateY(-3px) scale(1.02);
            box-shadow: 0 15px 30px rgba(0, 160, 233, 0.4);
        }
        
        .btn-primary:active {
            transform: translateY(-1px);
        }
        
        .form-actions {
            display: flex;
            gap: 20px;
            justify-content: center;
            margin-top: 40px;
        }
        
        /* Code Display */
        .code-display {
            background: rgba(0, 0, 0, 0.95);
            border: 2px solid var(--mercedes-blue);
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            margin: 40px auto;
            max-width: 700px;
            display: none;
        }
        
        .code-display.active {
            display: block;
            animation: fadeIn 0.5s ease-out;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .code-display h3 {
            font-size: 2rem;
            margin-bottom: 25px;
            color: var(--mercedes-silver);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
        }
        
        .pairing-code {
            font-family: 'Courier New', monospace;
            font-size: 3.5rem;
            font-weight: bold;
            color: #00FF00;
            background: rgba(0, 0, 0, 0.9);
            padding: 25px;
            border-radius: 15px;
            letter-spacing: 8px;
            margin: 25px 0;
            border: 1px solid var(--mercedes-blue);
            display: inline-block;
            min-width: 400px;
            text-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
        }
        
        .code-actions {
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 30px;
        }
        
        .instructions {
            background: rgba(0, 160, 233, 0.1);
            padding: 25px;
            border-radius: 15px;
            margin-top: 35px;
            text-align: left;
        }
        
        .instructions h4 {
            color: var(--mercedes-silver);
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .instructions ol {
            padding-left: 25px;
        }
        
        .instructions li {
            margin-bottom: 12px;
            color: rgba(255, 255, 255, 0.9);
            padding-left: 10px;
        }
        
        .instructions li strong {
            color: var(--mercedes-blue);
        }
        
        /* QR Section */
        .qr-section {
            background: var(--card-bg);
            border-radius: 24px;
            padding: 50px;
            margin: 50px 0;
            text-align: center;
            border: 1px solid var(--mercedes-blue);
            box-shadow: 0 15px 35px rgba(0, 160, 233, 0.2);
        }
        
        .qr-section h2 {
            font-size: 2.5rem;
            margin-bottom: 25px;
            color: var(--mercedes-silver);
        }
        
        .qr-container {
            padding: 30px;
            background: white;
            border-radius: 20px;
            display: inline-block;
            margin: 25px 0;
            box-shadow: 0 10px 30px rgba(255, 255, 255, 0.1);
            border: 3px solid var(--mercedes-blue);
        }
        
        .qr-container img {
            width: 300px;
            height: 300px;
            border-radius: 15px;
        }
        
        /* Footer */
        .footer {
            text-align: center;
            margin-top: 80px;
            padding-top: 40px;
            border-top: 1px solid rgba(192, 192, 192, 0.2);
            color: rgba(255, 255, 255, 0.6);
            font-size: 0.95rem;
        }
        
        .footer-info {
            display: flex;
            justify-content: center;
            gap: 40px;
            flex-wrap: wrap;
            margin-bottom: 30px;
        }
        
        .footer-info span {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        /* Responsive */
        @media (max-width: 768px) {
            .header h1 {
                font-size: 2.5rem;
            }
            
            .status-container {
                flex-direction: column;
                align-items: center;
            }
            
            .status-card {
                width: 100%;
                max-width: 400px;
            }
            
            .form-actions {
                flex-direction: column;
                align-items: center;
            }
            
            .btn {
                width: 100%;
                max-width: 300px;
            }
            
            .pairing-code {
                font-size: 2.2rem;
                letter-spacing: 5px;
                min-width: auto;
                padding: 20px;
            }
            
            .qr-container img {
                width: 250px;
                height: 250px;
            }
            
            .code-display {
                padding: 25px;
                margin: 25px 15px;
            }
        }
        
        /* Animations */
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
            width: 24px;
            height: 24px;
            border: 3px solid rgba(255,255,255,.3);
            border-radius: 50%;
            border-top-color: var(--mercedes-blue);
            animation: spin 1s ease-in-out infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .hidden {
            display: none;
        }
        
        /* Notification */
        .notification {
            position: fixed;
            top: 30px;
            right: 30px;
            padding: 20px 25px;
            border-radius: 12px;
            background: var(--card-bg);
            border: 1px solid;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            z-index: 1000;
            display: none;
            align-items: center;
            gap: 15px;
            max-width: 400px;
            animation: slideIn 0.3s ease-out;
        }
        
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        .notification.success {
            border-color: #00FF00;
            background: rgba(0, 255, 0, 0.05);
        }
        
        .notification.error {
            border-color: #FF4444;
            background: rgba(255, 68, 68, 0.05);
        }
        
        .notification.warning {
            border-color: #FFA500;
            background: rgba(255, 165, 0, 0.05);
        }
        
        .notification.show {
            display: flex;
        }
    </style>
</head>
<body>
    <div class="notification" id="notification"></div>
    
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="logo-container">
                <div class="mercedes-logo">
                    <i class="fas fa-star"></i>
                </div>
            </div>
            <h1>Mercedes WhatsApp Bot</h1>
            <p class="tagline">Premium WhatsApp Automation with Working Pairing System</p>
            
            <!-- Status Cards -->
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
                        <i class="fas fa-key"></i>
                    </div>
                    <h3>Pairing System</h3>
                    <div class="status-value ${canPair ? 'connected' : 'disconnected'}">
                        ${canPair ? 'READY' : 'WAIT FOR QR'}
                    </div>
                </div>
                
                <div class="status-card">
                    <div class="status-icon">
                        <i class="fas fa-server"></i>
                    </div>
                    <h3>Server Status</h3>
                    <div class="status-value" style="color: var(--mercedes-silver); background: rgba(0,160,233,0.1); border: 1px solid rgba(0,160,233,0.3);">
                        ONLINE
                    </div>
                </div>
            </div>
        </div>
        
        <!-- QR Section (always shown when connecting) -->
        ${botStatus === 'connecting' && latestQR ? `
        <div class="qr-section">
            <h2><i class="fas fa-qrcode"></i> Scan QR Code</h2>
            <p>Scan this QR code with WhatsApp to link your device</p>
            
            <div class="qr-container">
                <img src="${latestQR}" alt="WhatsApp QR Code">
            </div>
            
            <p style="color: rgba(255,255,255,0.7); margin-top: 20px;">
                <i class="fas fa-info-circle"></i> After scanning, you can also use pairing codes
            </p>
        </div>
        ` : botStatus === 'connected' ? `
        <div class="qr-section">
            <h2><i class="fas fa-check-circle"></i> Bot Connected</h2>
            <p>✅ Mercedes bot is now connected and ready!</p>
            <p style="color: #00FF00; font-weight: 500; margin-top: 15px;">
                <i class="fas fa-key"></i> Pairing system is now active - you can use pairing codes below
            </p>
        </div>
        ` : ''}
        
        <!-- Pairing Section (always shown) -->
        <div class="pair-section" id="pairSection">
            <h2><i class="fas fa-mobile-alt"></i> Pair with Phone Number</h2>
            
            <p class="pair-description">
                ${canPair ? 
                    '✅ Pairing system ready! Enter any phone number to get a pairing code.' : 
                    '⏳ Please scan QR code first. Pairing will activate after connection.'
                }
            </p>
            
            <div class="phone-form">
                <div class="form-group">
                    <label><i class="fas fa-phone"></i> Phone Number</label>
                    <div class="phone-input">
                        <input type="tel" id="phoneNumber" 
                               placeholder="Enter full international number with country code"
                               ${!canPair ? 'disabled' : ''}
                               required>
                    </div>
                    <p class="form-note">
                        Examples: +919876543210, +15551234567, +447911123456
                    </p>
                </div>
                
                <div class="form-actions">
                    <button class="btn btn-primary" id="generateBtn" onclick="generatePairingCode()" ${!canPair ? 'disabled' : ''}>
                        <i class="fas fa-key"></i> Generate Pairing Code
                    </button>
                    <button class="btn" onclick="location.reload()" style="background: rgba(255,255,255,0.1); color: white;">
                        <i class="fas fa-sync-alt"></i> Refresh Status
                    </button>
                </div>
            </div>
        </div>
        
        <!-- Code Display (Hidden by default) -->
        <div class="code-display" id="codeDisplay">
            <h3><i class="fas fa-check-circle"></i> Pairing Code Generated</h3>
            
            <div class="phone-display" style="margin-bottom: 20px; font-size: 1.2rem; color: var(--mercedes-silver);">
                <i class="fas fa-mobile-alt"></i> Phone: <span id="displayPhone"></span>
            </div>
            
            <div class="pairing-code" id="pairingCode">XXXXXX</div>
            
            <div class="code-actions">
                <button class="btn btn-primary" onclick="copyCode()">
                    <i class="fas fa-copy"></i> Copy Code
                </button>
                <button class="btn" onclick="resetForm()" style="background: rgba(255,255,255,0.1); color: white;">
                    <i class="fas fa-redo"></i> Generate New
                </button>
            </div>
            
            <div class="instructions">
                <h4><i class="fas fa-info-circle"></i> How to Use This Code:</h4>
                <ol>
                    <li>Open WhatsApp on your phone</li>
                    <li>Go to <strong>Settings → Linked Devices</strong></li>
                    <li>Tap on <strong>Link a Device</strong></li>
                    <li>Select <strong>"Link with phone number"</strong> option</li>
                    <li>Enter the 6-digit code shown above</li>
                    <li>Tap <strong>Link Device</strong> to connect</li>
                    <li>The Mercedes bot will automatically activate all features</li>
                </ol>
                <p style="margin-top: 15px; color: #FFA500; font-weight: 500;">
                    <i class="fas fa-clock"></i> This code expires in 2 minutes
                </p>
            </div>
        </div>
        
        <!-- Info Section -->
        <div style="background: var(--card-bg); border-radius: 20px; padding: 30px; margin: 40px 0; text-align: center;">
            <h3 style="color: var(--mercedes-silver); margin-bottom: 20px; display: flex; align-items: center; justify-content: center; gap: 10px;">
                <i class="fas fa-bolt"></i> How It Works
            </h3>
            <div style="display: flex; justify-content: center; gap: 20px; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 250px; padding: 20px;">
                    <div style="font-size: 3rem; color: var(--mercedes-blue); margin-bottom: 15px;">
                        <i class="fas fa-qrcode"></i>
                    </div>
                    <h4 style="color: var(--mercedes-silver); margin-bottom: 10px;">1. Scan QR Code</h4>
                    <p style="color: rgba(255,255,255,0.7);">Scan the QR code to connect the Mercedes bot first</p>
                </div>
                <div style="flex: 1; min-width: 250px; padding: 20px;">
                    <div style="font-size: 3rem; color: #00FF00; margin-bottom: 15px;">
                        <i class="fas fa-link"></i>
                    </div>
                    <h4 style="color: var(--mercedes-silver); margin-bottom: 10px;">2. Bot Connects</h4>
                    <p style="color: rgba(255,255,255,0.7);">Bot connects and pairing system becomes active</p>
                </div>
                <div style="flex: 1; min-width: 250px; padding: 20px;">
                    <div style="font-size: 3rem; color: var(--mercedes-red); margin-bottom: 15px;">
                        <i class="fas fa-key"></i>
                    </div>
                    <h4 style="color: var(--mercedes-silver); margin-bottom: 10px;">3. Generate Pair Code</h4>
                    <p style="color: rgba(255,255,255,0.7);">Enter any phone number to get a pairing code</p>
                </div>
            </div>
        </div>
        
        <!-- Footer -->
        <div class="footer">
            <div class="footer-info">
                <span><i class="fas fa-circle" style="color: ${botStatus === 'connected' ? '#00FF00' : botStatus === 'connecting' ? '#FFA500' : '#FF4444'};"></i> Status: ${botStatus}</span>
                <span><i class="fas fa-hashtag"></i> Prefix: ${global.BOT_PREFIX}</span>
                <span><i class="fas fa-clock"></i> Uptime: <span id="uptime">${Math.floor(process.uptime())}s</span></span>
                <span><i class="fas fa-plug"></i> Pairing: ${canPair ? '✅ Ready' : '⏳ Waiting'}</span>
            </div>
            
            <p>
                <i class="fas fa-car"></i> Mercedes WhatsApp Bot v2.0 | 
                Dual Connection System (QR + Pairing)
            </p>
            <p style="margin-top: 10px; font-size: 0.85rem; color: rgba(255,255,255,0.5);">
                &copy; ${new Date().getFullYear()} Mercedes Bot Technologies. 
                Both QR and Pairing methods available.
            </p>
        </div>
    </div>

    <script>
        // Phone number validation
        const phoneInput = document.getElementById('phoneNumber');
        phoneInput.addEventListener('input', (e) => {
            // Allow only numbers and + at the beginning
            e.target.value = e.target.value.replace(/[^\d+]/g, '');
        });
        
        // Uptime counter
        let uptime = ${Math.floor(process.uptime())};
        setInterval(() => {
            uptime++;
            document.getElementById('uptime').textContent = uptime + 's';
        }, 1000);
        
        // Generate pairing code
        async function generatePairingCode() {
            const phoneNumber = document.getElementById('phoneNumber').value.trim();
            const generateBtn = document.getElementById('generateBtn');
            const originalText = generateBtn.innerHTML;
            
            // Validation
            if (!phoneNumber || phoneNumber.length < 10) {
                showNotification('Please enter a valid phone number (at least 10 digits)', 'error');
                phoneInput.focus();
                return;
            }
            
            // Show loading
            generateBtn.innerHTML = '<span class="loading"></span> Generating Code...';
            generateBtn.disabled = true;
            
            try {
                console.log('Sending request for:', phoneNumber);
                
                // Send request to server
                const response = await fetch('/pair', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        phone: phoneNumber
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || errorData.message || 'Server error');
                }
                
                const data = await response.json();
                
                // Display the code
                document.getElementById('displayPhone').textContent = phoneNumber;
                document.getElementById('pairingCode').textContent = data.code;
                document.getElementById('codeDisplay').classList.add('active');
                
                // Scroll to code
                document.getElementById('codeDisplay').scrollIntoView({ behavior: 'smooth' });
                
                showNotification('Pairing code generated successfully!', 'success');
                
                // Auto-copy to clipboard
                setTimeout(() => copyCode(), 1000);
                
            } catch (error) {
                console.error('Error:', error);
                showNotification(error.message || 'Failed to generate pairing code', 'error');
                
                // If pairing fails, suggest QR
                if (error.message.includes('not ready') || error.message.includes('QR')) {
                    showNotification('Please scan QR code first to activate pairing', 'warning');
                }
            } finally {
                // Reset button
                generateBtn.innerHTML = originalText;
                generateBtn.disabled = false;
            }
        }
        
        // Copy code to clipboard
        function copyCode() {
            const code = document.getElementById('pairingCode').textContent;
            navigator.clipboard.writeText(code).then(() => {
                showNotification('Code copied to clipboard!', 'success');
            }).catch(err => {
                showNotification('Failed to copy code', 'error');
            });
        }
        
        // Reset form
        function resetForm() {
            document.getElementById('codeDisplay').classList.remove('active');
            document.getElementById('phoneNumber').value = '';
            document.getElementById('phoneNumber').focus();
            showNotification('Ready to generate new code', 'success');
        }
        
        // Show notification
        function showNotification(message, type = 'success') {
            const notification = document.getElementById('notification');
            notification.innerHTML = `
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <span>${message}</span>
            `;
            notification.className = `notification ${type} show`;
            
            setTimeout(() => {
                notification.classList.remove('show');
            }, 5000);
        }
        
        // Auto-refresh if not connected
        if("${botStatus}" !== "connected") {
            setTimeout(() => {
                if("${botStatus}" === "connecting") {
                    location.reload();
                }
            }, 10000);
        }
        
        // Check if pairing is ready
        if(!${canPair}) {
            phoneInput.placeholder = "Scan QR code first to activate pairing";
            document.getElementById('generateBtn').innerHTML = '<i class="fas fa-hourglass-half"></i> Waiting for QR Connection';
            showNotification('Please scan the QR code first to connect the bot', 'warning');
        }
    </script>
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
                const phoneNumber = params.get('phone').trim();
                
                if (!phoneNumber) {
                    res.writeHead(200, { 
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({ error: 'Phone number required' }));
                    return;
                }
                
                // Validate bot is ready for pairing
                if (!canPair || !sock) {
                    res.writeHead(200, { 
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({ 
                        error: 'Bot not ready for pairing',
                        message: 'Please connect via QR code first',
                        status: botStatus,
                        canPair: canPair
                    }));
                    return;
                }
                
                // Generate pairing code
                const pairingCode = await generatePairingCode(phoneNumber);
                
                // Send success response
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ 
                    code: pairingCode,
                    phone: phoneNumber,
                    timestamp: new Date().toISOString(),
                    expires: '2 minutes'
                }));
                
            } catch (error) {
                console.error('❌ Pairing API error:', error);
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ 
                    error: error.message || 'Failed to generate pairing code'
                }));
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
            canPair: canPair,
            hasQR: !!latestQR,
            qr: latestQR,
            prefix: global.BOT_PREFIX,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: '2.0',
            features: STATUS_CONFIG
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
                    font-family: 'Poppins', sans-serif;
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
                    padding: 50px; 
                    background: rgba(0,0,0,0.9); 
                    border-radius: 24px; 
                    border: 1px solid #E4002B;
                    box-shadow: 0 20px 50px rgba(228, 0, 43, 0.2);
                }
                .logo { 
                    font-size: 5rem; 
                    color: #C0C0C0; 
                    margin-bottom: 30px; 
                    text-shadow: 0 0 20px rgba(192, 192, 192, 0.3);
                }
                h1 { 
                    color: #E4002B; 
                    font-size: 4.5rem; 
                    margin-bottom: 20px; 
                    font-weight: 700;
                }
                p { 
                    font-size: 1.3rem; 
                    margin-bottom: 40px; 
                    color: #C0C0C0;
                    line-height: 1.8;
                }
                a { 
                    color: #00A0E9; 
                    text-decoration: none; 
                    font-size: 1.2rem; 
                    border: 2px solid #00A0E9; 
                    padding: 15px 40px; 
                    border-radius: 12px; 
                    transition: all 0.3s; 
                    display: inline-flex; 
                    align-items: center; 
                    gap: 12px;
                    font-weight: 500;
                }
                a:hover { 
                    background: rgba(0,160,233,0.2); 
                    transform: translateY(-5px); 
                    box-shadow: 0 10px 25px rgba(0, 160, 233, 0.3);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">
                    <i class="fas fa-star"></i>
                </div>
                <h1>404</h1>
                <p>The page you're looking for doesn't exist or has been moved.</p>
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
    console.log(`
    ╔══════════════════════════════════════════════════════╗
    ║                                                      ║
    ║     🚗 MERCEDES WHATSAPP BOT v2.0                   ║
    ║                                                      ║
    ║     🌐 Dashboard: http://localhost:${PORT}           ║
    ║     📁 Session: ${path.resolve(AUTH_FOLDER)}         ║
    ║     ⚡ Dual Connection System:                       ║
    ║       1. Scan QR Code                               ║
    ║       2. Use Pairing Codes                          ║
    ║                                                      ║
    ╚══════════════════════════════════════════════════════╝
    `);
    
    console.log('\n📊 ===== FEATURES LOADED =====');
    console.log(`📱 Status auto-view: ${STATUS_CONFIG.AUTO_VIEW_STATUS ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`💖 Status auto-react: ${STATUS_CONFIG.AUTO_LIKE_STATUS ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`📰 Newsletter auto-follow: ${STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`🔥 Newsletter auto-react: ${STATUS_CONFIG.AUTO_REACT_NEWSLETTERS ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`🔗 Pairing system: ${canPair ? '✅ Ready (after QR)' : '⏳ Waiting for QR'}`);
    console.log(`📱 Number format: ANY international format (+91, +1, +44, etc.)`);
    console.log('================================\n');
    
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
