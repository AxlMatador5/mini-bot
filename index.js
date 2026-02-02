const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestWaWebVersion, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const http = require('http');
const QRCode = require('qrcode');
const { Boom } = require('@hapi/boom');
const serializeMessage = require('./handler.js');
const express = require('express');

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
let canPair = false;

// ===== ENHANCED PAIRING CODE GENERATION ===== //
async function generatePairingCode(phoneNumber) {
    if (!sock || !canPair) {
        throw new Error('Bot not ready for pairing. Please connect via QR first.');
    }
    
    try {
        console.log(`🔗 Generating pairing code for: ${phoneNumber}`);
        
        // Clean phone number - remove all non-digits
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        
        // Remove country code if present (for India 91, US 1, etc.)
        const localNumber = cleanNumber.replace(/^(91|1|44|971|92)/, '');
        
        if (!localNumber || localNumber.length < 8) {
            throw new Error('Invalid phone number format. Need at least 8 digits.');
        }
        
        console.log(`📱 Cleaned number for pairing: ${localNumber}`);
        
        // IMPORTANT: Use custom pairing phrase "MARISELA" for better compatibility
        const pairingCode = await sock.requestPairingCode(localNumber, "MARISELA");
        
        console.log(`✅ Pairing code generated: ${pairingCode}`);
        
        // Store the code with timestamp (expires in 2 minutes)
        pairingCodes.set(phoneNumber, {
            code: pairingCode,
            timestamp: Date.now(),
            localNumber: localNumber,
            expiresAt: Date.now() + 120000 // 2 minutes
        });
        
        // Auto-clean expired codes
        setTimeout(() => {
            if (pairingCodes.has(phoneNumber)) {
                pairingCodes.delete(phoneNumber);
                console.log(`🗑️ Expired pairing code for: ${phoneNumber}`);
            }
        }, 120000);
        
        return pairingCode;
        
    } catch (error) {
        console.error('❌ Pairing code generation failed:', error);
        
        // Provide user-friendly error messages
        if (error.message.includes('not registered')) {
            throw new Error('WhatsApp account not found. Please connect via QR code first.');
        } else if (error.message.includes('rate limit')) {
            throw new Error('Too many attempts. Please wait 5 minutes before trying again.');
        } else if (error.message.includes('timeout')) {
            throw new Error('Request timeout. Please check your internet connection.');
        } else if (error.message.includes('not connected')) {
            throw new Error('Bot not fully connected. Please wait for "Bot is connected!" message.');
        } else if (error.message.includes('Bad MAC') || error.message.includes('bad-mac')) {
            throw new Error('Session error. Please scan QR code again to refresh session.');
        } else {
            throw new Error(`Failed: ${error.message}`);
        }
    }
}

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

// ===== ENHANCED STATUS HANDLER ===== //
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
        }
    });
}

// ===== WELCOME MESSAGE ===== //
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
                    canPair = true;
                    isConnecting = false;
                    console.log('✅ Bot is connected!');
                    console.log('🔗 Pairing system ready - Use /pair endpoint');

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

// ===== EXPRESS SERVER WITH PAIRING API ===== //
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== BEAUTIFUL PAIRING INTERFACE ===== //
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mercedes WhatsApp Bot - Pairing System</title>
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
            padding: 20px;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 30px;
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
            font-size: 3rem;
            margin-bottom: 15px;
            background: linear-gradient(90deg, var(--mercedes-silver), #fff, var(--mercedes-silver));
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            font-weight: 700;
        }
        
        .status-badge {
            display: inline-block;
            padding: 10px 25px;
            border-radius: 50px;
            font-weight: 600;
            font-size: 1.1rem;
            margin: 20px 0;
            letter-spacing: 1px;
        }
        
        .status-connected { 
            background: linear-gradient(135deg, rgba(0, 255, 0, 0.1), rgba(0, 200, 0, 0.2)); 
            color: #00FF00; 
            border: 1px solid rgba(0, 255, 0, 0.3);
        }
        .status-disconnected { 
            background: linear-gradient(135deg, rgba(255, 68, 68, 0.1), rgba(200, 50, 50, 0.2)); 
            color: #FF4444; 
            border: 1px solid rgba(255, 68, 68, 0.3);
        }
        .status-connecting { 
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
            font-size: 2.2rem;
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
            max-width: 600px;
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
        
        .country-selector {
            display: flex;
            gap: 15px;
            margin-bottom: 20px;
            flex-wrap: wrap;
            justify-content: center;
        }
        
        .country-flag {
            width: 50px;
            height: 50px;
            border-radius: 8px;
            overflow: hidden;
            cursor: pointer;
            border: 2px solid transparent;
            transition: all 0.3s;
        }
        
        .country-flag:hover {
            border-color: var(--mercedes-blue);
            transform: scale(1.05);
        }
        
        .country-flag.selected {
            border-color: var(--mercedes-blue);
            box-shadow: 0 0 15px rgba(0, 160, 233, 0.5);
        }
        
        .country-flag img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .phone-input-container {
            display: flex;
            gap: 15px;
            align-items: center;
        }
        
        .country-code {
            flex: 0 0 100px;
        }
        
        .country-code input {
            width: 100%;
            padding: 18px 20px;
            background: var(--input-bg);
            border: 1px solid rgba(192, 192, 192, 0.3);
            border-radius: 12px;
            color: white;
            font-size: 1.1rem;
            text-align: center;
            font-weight: 500;
        }
        
        .phone-input {
            flex: 1;
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
            margin: 10px;
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
        
        .btn-primary:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }
        
        .form-actions {
            display: flex;
            gap: 20px;
            justify-content: center;
            margin-top: 40px;
            flex-wrap: wrap;
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
            min-width: 300px;
            text-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
        }
        
        .code-actions {
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 30px;
            flex-wrap: wrap;
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
            padding: 40px;
            margin: 40px 0;
            text-align: center;
            border: 1px solid var(--mercedes-blue);
            box-shadow: 0 15px 35px rgba(0, 160, 233, 0.2);
        }
        
        .qr-section h2 {
            font-size: 2rem;
            margin-bottom: 25px;
            color: var(--mercedes-silver);
        }
        
        .qr-container {
            padding: 25px;
            background: white;
            border-radius: 20px;
            display: inline-block;
            margin: 25px 0;
            box-shadow: 0 10px 30px rgba(255, 255, 255, 0.1);
            border: 3px solid var(--mercedes-blue);
        }
        
        .qr-container img {
            width: 250px;
            height: 250px;
            border-radius: 15px;
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
        
        /* Responsive */
        @media (max-width: 768px) {
            .container {
                padding: 15px;
            }
            
            .header {
                padding: 30px 20px;
            }
            
            .header h1 {
                font-size: 2.2rem;
            }
            
            .pair-section {
                padding: 30px 20px;
            }
            
            .phone-input-container {
                flex-direction: column;
            }
            
            .country-code {
                width: 100%;
            }
            
            .pairing-code {
                font-size: 2.2rem;
                letter-spacing: 5px;
                min-width: auto;
                padding: 20px;
            }
            
            .qr-container img {
                width: 200px;
                height: 200px;
            }
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
            <p style="color: rgba(255,255,255,0.8); margin-bottom: 20px;">
                Premium Direct Pairing System with Working Pairing Codes
            </p>
            
            <div class="status-badge ${botStatus}">
                ${botStatus.toUpperCase()} ${canPair ? '- PAIRING READY' : '- WAITING FOR QR'}
            </div>
            
            <p style="color: rgba(255,255,255,0.6);">
                <i class="fas fa-info-circle"></i> Bot must be connected via QR first, then you can use pairing
            </p>
        </div>
        
        <!-- QR Section (if connecting) -->
        ${botStatus === 'connecting' && latestQR ? `
        <div class="qr-section">
            <h2><i class="fas fa-qrcode"></i> Scan QR Code First</h2>
            <p>Scan this QR code with WhatsApp to connect the bot</p>
            
            <div class="qr-container">
                <img src="${latestQR}" alt="WhatsApp QR Code">
            </div>
            
            <p style="color: rgba(255,255,255,0.7); margin-top: 20px;">
                <i class="fas fa-info-circle"></i> After scanning, the pairing system will be activated
            </p>
        </div>
        ` : ''}
        
        <!-- Pairing Section -->
        <div class="pair-section" id="pairSection">
            <h2><i class="fas fa-mobile-alt"></i> Pair with Phone Number</h2>
            
            <p class="pair-description">
                Enter your phone number below to receive a 6-digit pairing code.<br>
                The code will be valid for 2 minutes. No country code needed - select your country below.
            </p>
            
            <div class="phone-form">
                <div class="form-group">
                    <label><i class="fas fa-globe"></i> Select Your Country</label>
                    <div class="country-selector" id="countrySelector">
                        <div class="country-flag selected" data-code="91" title="India">
                            <img src="https://flagcdn.com/w40/in.png" alt="India">
                        </div>
                        <div class="country-flag" data-code="1" title="USA">
                            <img src="https://flagcdn.com/w40/us.png" alt="USA">
                        </div>
                        <div class="country-flag" data-code="44" title="UK">
                            <img src="https://flagcdn.com/w40/gb.png" alt="UK">
                        </div>
                        <div class="country-flag" data-code="971" title="UAE">
                            <img src="https://flagcdn.com/w40/ae.png" alt="UAE">
                        </div>
                        <div class="country-flag" data-code="92" title="Pakistan">
                            <img src="https://flagcdn.com/w40/pk.png" alt="Pakistan">
                        </div>
                    </div>
                </div>
                
                <div class="form-group">
                    <label><i class="fas fa-phone"></i> Phone Number</label>
                    <div class="phone-input-container">
                        <div class="country-code">
                            <input type="text" id="countryCode" value="+91" readonly>
                        </div>
                        <div class="phone-input">
                            <input type="tel" id="phoneNumber" 
                                   placeholder="Enter your phone number without country code"
                                   pattern="[0-9]{8,12}"
                                   required>
                        </div>
                    </div>
                    <p class="form-note">
                        Example: For Indian number +91-9876543210, enter "9876543210"
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
                </ol>
                <p style="margin-top: 15px; color: #FFA500; font-weight: 500;">
                    <i class="fas fa-clock"></i> This code expires in 2 minutes
                </p>
            </div>
        </div>
        
        <!-- Features Info -->
        <div style="background: var(--card-bg); border-radius: 20px; padding: 30px; margin: 40px 0; text-align: center;">
            <h3 style="color: var(--mercedes-silver); margin-bottom: 20px; display: flex; align-items: center; justify-content: center; gap: 10px;">
                <i class="fas fa-bolt"></i> Working Pairing Features
            </h3>
            <div style="display: flex; justify-content: center; gap: 15px; flex-wrap: wrap;">
                <div style="background: rgba(0,255,0,0.1); padding: 12px 20px; border-radius: 10px; border: 1px solid rgba(0,255,0,0.3);">
                    <i class="fas fa-check" style="color: #00FF00;"></i> Fixed Number Format
                </div>
                <div style="background: rgba(0,160,233,0.1); padding: 12px 20px; border-radius: 10px; border: 1px solid rgba(0,160,233,0.3);">
                    <i class="fas fa-check" style="color: var(--mercedes-blue);"></i> Custom Pairing Phrase
                </div>
                <div style="background: rgba(255,165,0,0.1); padding: 12px 20px; border-radius: 10px; border: 1px solid rgba(255,165,0,0.3);">
                    <i class="fas fa-check" style="color: #FFA500;"></i> 2-Minute Expiry
                </div>
                <div style="background: rgba(255,0,0,0.1); padding: 12px 20px; border-radius: 10px; border: 1px solid rgba(255,0,0,0.3);">
                    <i class="fas fa-check" style="color: #FF0000;"></i> Error Handling
                </div>
            </div>
        </div>
    </div>

    <script>
        // Initialize country selector
        const countryFlags = document.querySelectorAll('.country-flag');
        const countryCodeInput = document.getElementById('countryCode');
        
        countryFlags.forEach(flag => {
            flag.addEventListener('click', () => {
                countryFlags.forEach(f => f.classList.remove('selected'));
                flag.classList.add('selected');
                const code = flag.getAttribute('data-code');
                countryCodeInput.value = '+' + code;
            });
        });
        
        // Phone number validation
        const phoneInput = document.getElementById('phoneNumber');
        phoneInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '');
        });
        
        // Generate pairing code
        async function generatePairingCode() {
            const countryCode = document.getElementById('countryCode').value.replace('+', '');
            const phoneNumber = document.getElementById('phoneNumber').value.trim();
            const generateBtn = document.getElementById('generateBtn');
            const originalText = generateBtn.innerHTML;
            
            // Validation
            if (!phoneNumber || phoneNumber.length < 8) {
                showNotification('Please enter a valid phone number (8-12 digits)', 'error');
                phoneInput.focus();
                return;
            }
            
            // Show loading
            generateBtn.innerHTML = '<span class="loading"></span> Generating Code...';
            generateBtn.disabled = true;
            
            try {
                // Prepare data - full number with country code
                const fullNumber = countryCode + phoneNumber;
                
                console.log('Sending request for:', fullNumber);
                
                // Send request to server
                const response = await fetch('/pair', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        phone: fullNumber,
                        country: countryCode
                    })
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || data.message || 'Server error');
                }
                
                // Display the code
                document.getElementById('displayPhone').textContent = '+' + fullNumber;
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
                    showNotification('Please scan QR code first, then try pairing', 'warning');
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
        
        // Check if pairing is ready
        if(!${canPair}) {
            phoneInput.disabled = true;
            document.getElementById('generateBtn').innerHTML = '<i class="fas fa-hourglass-half"></i> Waiting for QR Connection';
            document.getElementById('generateBtn').disabled = true;
            showNotification('Please scan QR code first to activate pairing system', 'warning');
        }
    </script>
</body>
</html>
    `);
});

// ===== PAIRING API ENDPOINT ===== //
app.post('/pair', async (req, res) => {
    try {
        const { phone } = req.body;
        
        if (!phone) {
            return res.status(400).json({ 
                error: 'Phone number required',
                message: 'Please provide a phone number'
            });
        }
        
        // Validate bot is ready for pairing
        if (!canPair || !sock) {
            return res.status(400).json({ 
                error: 'Bot not ready for pairing',
                message: 'Please connect via QR code first',
                status: botStatus,
                canPair: canPair
            });
        }
        
        // Generate pairing code
        const pairingCode = await generatePairingCode(phone);
        
        // Send success response
        res.status(200).json({ 
            code: pairingCode,
            phone: phone,
            timestamp: new Date().toISOString(),
            expires: '2 minutes',
            instructions: 'Use in WhatsApp: Settings > Linked Devices > Link with phone number'
        });
        
    } catch (error) {
        console.error('❌ Pairing API error:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to generate pairing code',
            details: 'Make sure the bot is connected and phone number is valid'
        });
    }
});

// ===== STATUS API ===== //
app.get('/api/status', (req, res) => {
    res.json({ 
        status: botStatus,
        canPair: canPair,
        hasQR: !!latestQR,
        qr: latestQR,
        prefix: global.BOT_PREFIX,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '2.0',
        pairingEnabled: canPair
    });
});

// ===== QR CODE ENDPOINT ===== //
app.get('/qr', (req, res) => {
    if (latestQR) {
        res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { 
                    background: #000; 
                    color: white; 
                    text-align: center; 
                    padding: 50px; 
                    font-family: Arial, sans-serif;
                }
                img { 
                    max-width: 300px; 
                    border: 5px solid #00A0E9; 
                    border-radius: 15px;
                }
                h1 { color: #C0C0C0; }
            </style>
        </head>
        <body>
            <h1>Mercedes Bot QR Code</h1>
            <img src="${latestQR}" alt="WhatsApp QR Code">
            <p>Scan this QR code with WhatsApp to connect the bot</p>
        </body>
        </html>
        `);
    } else {
        res.status(404).send('QR code not available yet');
    }
});

// Start server
const server = http.createServer(app);
server.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════════╗
    ║                                                      ║
    ║     🚗 MERCEDES WHATSAPP BOT v2.0                   ║
    ║         WITH WORKING PAIRING SYSTEM                 ║
    ║                                                      ║
    ║     🌐 Dashboard: http://localhost:${PORT}           ║
    ║     📱 Pairing: http://localhost:${PORT}/pair        ║
    ║     🔗 QR Code: http://localhost:${PORT}/qr          ║
    ║     📊 Status: http://localhost:${PORT}/api/status   ║
    ║                                                      ║
    ╚══════════════════════════════════════════════════════╝
    `);
    
    console.log('\n📊 ===== FEATURES LOADED =====');
    console.log(`📱 Status auto-view: ${STATUS_CONFIG.AUTO_VIEW_STATUS ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`💖 Status auto-react: ${STATUS_CONFIG.AUTO_LIKE_STATUS ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`📰 Newsletter auto-follow: ${STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`🔥 Newsletter auto-react: ${STATUS_CONFIG.AUTO_REACT_NEWSLETTERS ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`🔗 Pairing system: ✅ Using custom phrase "MARISELA"`);
    console.log(`🌍 Countries supported: India, USA, UK, UAE, Pakistan`);
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
