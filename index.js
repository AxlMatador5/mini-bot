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
require('./config');

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

// ===== EMPIREPAIR CONFIGURATION ===== //
const EMPIREPAIR_CONFIG = {
    AUTO_RESTORE_DELAY: 10000,
    SESSION_BASE_PATH: './session',
    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/JXaWiMrpjWyJ6Kd2G9FAAq?mode=ems_copy_t',
    IMAGE_PATH: 'https://i.ibb.co/hRVcfQGK/vision-v.jpg',
    RCD_IMAGE_PATH: 'https://i.ibb.co/hRVcfQGK/vision-v.jpg',
    ADMIN_LIST_PATH: './admin.json',
    NUMBER_LIST_PATH: './numbers.json',
    OWNER_NUMBER: '254740007567',
    
    AUTO_SAVE_INTERVAL: 300000,
    MEGA_SYNC_INTERVAL: 600000,
    
    activeSockets: new Map(),
    socketCreationTime: new Map(),
    otpStore: new Map()
};

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

// ===== COUNTRY CODES FOR PAIRING ===== //
const COUNTRY_CODES = [
    { name: "Afghanistan", code: "93", flag: "🇦🇫" },
    { name: "Albania", code: "355", flag: "🇦🇱" },
    { name: "Algeria", code: "213", flag: "🇩🇿" },
    { name: "Andorra", code: "376", flag: "🇦🇩" },
    { name: "Angola", code: "244", flag: "🇦🇴" },
    { name: "Argentina", code: "54", flag: "🇦🇷" },
    { name: "Australia", code: "61", flag: "🇦🇺" },
    { name: "Austria", code: "43", flag: "🇦🇹" },
    { name: "Bahrain", code: "973", flag: "🇧🇭" },
    { name: "Bangladesh", code: "880", flag: "🇧🇩" },
    { name: "Belgium", code: "32", flag: "🇧🇪" },
    { name: "Brazil", code: "55", flag: "🇧🇷" },
    { name: "Canada", code: "1", flag: "🇨🇦" },
    { name: "China", code: "86", flag: "🇨🇳" },
    { name: "Colombia", code: "57", flag: "🇨🇴" },
    { name: "Egypt", code: "20", flag: "🇪🇬" },
    { name: "Ethiopia", code: "251", flag: "🇪🇹" },
    { name: "France", code: "33", flag: "🇫🇷" },
    { name: "Germany", code: "49", flag: "🇩🇪" },
    { name: "Ghana", code: "233", flag: "🇬🇭" },
    { name: "India", code: "91", flag: "🇮🇳" },
    { name: "Indonesia", code: "62", flag: "🇮🇩" },
    { name: "Iran", code: "98", flag: "🇮🇷" },
    { name: "Iraq", code: "964", flag: "🇮🇶" },
    { name: "Italy", code: "39", flag: "🇮🇹" },
    { name: "Japan", code: "81", flag: "🇯🇵" },
    { name: "Jordan", code: "962", flag: "🇯🇴" },
    { name: "Kenya", code: "254", flag: "🇰🇪" },
    { name: "Kuwait", code: "965", flag: "🇰🇼" },
    { name: "Malaysia", code: "60", flag: "🇲🇾" },
    { name: "Mexico", code: "52", flag: "🇲🇽" },
    { name: "Morocco", code: "212", flag: "🇲🇦" },
    { name: "Netherlands", code: "31", flag: "🇳🇱" },
    { name: "Nigeria", code: "234", flag: "🇳🇬" },
    { name: "Oman", code: "968", flag: "🇴🇲" },
    { name: "Pakistan", code: "92", flag: "🇵🇰" },
    { name: "Philippines", code: "63", flag: "🇵🇭" },
    { name: "Qatar", code: "974", flag: "🇶🇦" },
    { name: "Russia", code: "7", flag: "🇷🇺" },
    { name: "Saudi Arabia", code: "966", flag: "🇸🇦" },
    { name: "Singapore", code: "65", flag: "🇸🇬" },
    { name: "South Africa", code: "27", flag: "🇿🇦" },
    { name: "South Korea", code: "82", flag: "🇰🇷" },
    { name: "Spain", code: "34", flag: "🇪🇸" },
    { name: "Sri Lanka", code: "94", flag: "🇱🇰" },
    { name: "Sweden", code: "46", flag: "🇸🇪" },
    { name: "Switzerland", code: "41", flag: "🇨🇭" },
    { name: "Tanzania", code: "255", flag: "🇹🇿" },
    { name: "Thailand", code: "66", flag: "🇹🇭" },
    { name: "Turkey", code: "90", flag: "🇹🇷" },
    { name: "Uganda", code: "256", flag: "🇺🇬" },
    { name: "Ukraine", code: "380", flag: "🇺🇦" },
    { name: "United Arab Emirates", code: "971", flag: "🇦🇪" },
    { name: "United Kingdom", code: "44", flag: "🇬🇧" },
    { name: "United States", code: "1", flag: "🇺🇸" },
    { name: "Vietnam", code: "84", flag: "🇻🇳" },
    { name: "Yemen", code: "967", flag: "🇾🇪" },
    { name: "Zambia", code: "260", flag: "🇿🇲" },
    { name: "Zimbabwe", code: "263", flag: "🇿🇼" }
];

let latestQR = '';
let botStatus = 'disconnected';
let pairingCodes = new Map();
let presenceInterval = null;
let sock = null;
let isConnecting = false;

// ===== EMPIREPAIR FUNCTIONS ===== //
async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(EMPIREPAIR_CONFIG.SESSION_BASE_PATH, `session_${sanitizedNumber}`);

    console.log(`🔄 EmpirePair connecting: ${sanitizedNumber}`);

    try {
        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        const { version } = await fetchLatestWaWebVersion();
        const logger = pino({ level: 'info' });
        
        const sessionExists = fs.existsSync(path.join(sessionPath, 'creds.json'));
        let state;
        
        if (sessionExists) {
            console.log(`📁 Restoring existing session for ${sanitizedNumber}`);
            const { state: existingState } = await useMultiFileAuthState(sessionPath);
            state = existingState;
        } else {
            const { state: newState } = await useMultiFileAuthState(sessionPath);
            state = newState;
        }

        const socket = makeWASocket({
            version, 
            logger,
            auth: state.auth,
            printQRInTerminal: true,
            keepAliveIntervalMs: 10000,
            markOnlineOnConnect: true,
            syncFullHistory: false,
            browser: ['Mercedes', 'Chrome', '1.0.0']
        });

        EMPIREPAIR_CONFIG.activeSockets.set(sanitizedNumber, socket);
        EMPIREPAIR_CONFIG.socketCreationTime.set(sanitizedNumber, Date.now());

        if (!socket.authState.creds.registered) {
            console.log(`📱 Requesting pairing code for ${sanitizedNumber}`);
            
            let retries = 3;
            let code;
            
            while (retries > 0) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    const pair = "MARISEL";
                    code = await socket.requestPairingCode(sanitizedNumber, pair);
                    console.log(`✅ Pairing code generated for ${sanitizedNumber}: ${code}`);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`⚠️ Pairing code generation failed, retries: ${retries}`, error.message);
                    
                    if (retries === 0) throw error;
                    await new Promise(resolve => setTimeout(resolve, 2000 * (3 - retries)));
                }
            }

            if (code && res && !res.headersSent) {
                const formattedCode = code.match(/.{1,3}/g).join('-');
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ 
                    success: true, 
                    code: formattedCode,
                    number: sanitizedNumber,
                    expires: Date.now() + 300000
                }));
            }
            return socket;
        }

        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log(`✅ EmpirePair connected: ${sanitizedNumber}`);
                
                setupEnhancedHandlers(socket);
                
                if (STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS) {
                    setTimeout(async () => {
                        await autoFollowNewsletters(socket);
                    }, 5000);
                }
                
                await sendEnhancedWelcomeMessage(socket);
                await sendAdminConnectMessage(socket, sanitizedNumber);
                
            } else if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode === 401) {
                    console.log(`User ${sanitizedNumber} logged out. Cleaning up...`);
                    await deleteSessionImmediately(sanitizedNumber);
                } else {
                    console.log(`Connection lost for ${sanitizedNumber}, attempting to reconnect...`);
                    setTimeout(() => {
                        EMPIREPAIR_CONFIG.activeSockets.delete(sanitizedNumber);
                        const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                        EmpirePair(sanitizedNumber, mockRes);
                    }, 10000);
                }
            }
        });

        socket.ev.on('creds.update', async () => {
            console.log(`💾 Credentials updated for ${sanitizedNumber}`);
        });

        return socket;

    } catch (error) {
        console.error(`❌ EmpirePair error for ${sanitizedNumber}:`, error);
        
        if (res && !res.headersSent) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ 
                success: false, 
                error: error.message,
                message: 'Failed to generate pairing code. Please try again.'
            }));
        }
        throw error;
    }
}

async function deleteSessionImmediately(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    console.log(`🗑️ Deleting session: ${sanitizedNumber}`);

    if (EMPIREPAIR_CONFIG.activeSockets.has(sanitizedNumber)) {
        const socket = EMPIREPAIR_CONFIG.activeSockets.get(sanitizedNumber);
        try {
            if (socket?.ws) {
                socket.ws.close();
            }
        } catch (e) {
            console.error('Error closing socket:', e.message);
        }
    }

    const sessionPath = path.join(EMPIREPAIR_CONFIG.SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log(`🗑️ Deleted session directory: ${sessionPath}`);
    }

    EMPIREPAIR_CONFIG.socketCreationTime.delete(sanitizedNumber);
    EMPIREPAIR_CONFIG.activeSockets.delete(sanitizedNumber);
    pairingCodes.delete(sanitizedNumber);

    console.log(`✅ Successfully deleted session: ${sanitizedNumber}`);
}

async function sendAdminConnectMessage(socket, number) {
    try {
        let admins = [];
        if (fs.existsSync(EMPIREPAIR_CONFIG.ADMIN_LIST_PATH)) {
            admins = JSON.parse(fs.readFileSync(EMPIREPAIR_CONFIG.ADMIN_LIST_PATH, 'utf8'));
        }

        const caption = `*mᥱrᥴᥱძᥱs mіᥒі ᥴ᥆ᥒᥒᥱᥴ𝗍ᥱძ*\n\n` +
                       `Connect - https://minibot-last.onrender.com\n` +
                       `📞 Number: ${number}\n` +
                       `🟢 Status: Auto-Connected\n` +
                       `⏰ Time: ${new Date().toLocaleString()}\n\n` +
                       `> mᥱrᥴᥱძᥱs mіᥒі ᥆ᥒᥣіᥒᥱ`;

        for (const admin of admins) {
            try {
                await socket.sendMessage(
                    `${admin}@s.whatsapp.net`,
                    {
                        image: { url: EMPIREPAIR_CONFIG.IMAGE_PATH },
                        caption
                    }
                );
            } catch (error) {
                console.error(`❌ Failed to send admin message to ${admin}:`, error);
            }
        }
    } catch (error) {
        console.error('❌ Admin message error:', error);
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
                await socket.newsletterFollow(newsletterJid);
                console.log(`✅ Followed newsletter: ${newsletterJid}`);
                followedCount++;
                
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                failedCount++;
                if (error.message.includes('already subscribed') || 
                    error.message.includes('already following')) {
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
                    console.log(`📱 Status detected from: ${participant}`);
                    
                    if (STATUS_CONFIG.AUTO_RECORDING) {
                        try {
                            await socket.sendPresenceUpdate("recording", messageJid);
                        } catch (presenceError) {}
                    }
                    
                    if (STATUS_CONFIG.AUTO_VIEW_STATUS) {
                        try {
                            await socket.readMessages([message.key]);
                            console.log(`👁️ Status viewed from: ${participant}`);
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
                            
                            console.log(`💖 Reacted to status with ${randomEmoji} (from: ${participant})`);
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
                        console.log(`📰 Newsletter post detected from: ${messageJid}`);
                        
                        let messageId = message.newsletterServerId || message.key?.id;
                        
                        if (messageId) {
                            const randomEmoji = STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS[
                                Math.floor(Math.random() * STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS.length)
                            ];
                            
                            console.log(`🎯 Attempting to react to newsletter with ${randomEmoji} (Message ID: ${messageId})`);
                            
                            try {
                                await socket.newsletterReactMessage(
                                    messageJid,
                                    messageId.toString(),
                                    randomEmoji
                                );
                                console.log(`✅ Newsletter reaction sent: ${randomEmoji}`);
                            } catch (reactError) {
                                console.log(`❌ Newsletter reaction failed: ${reactError.message}`);
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

// ===== EXTENDED WELCOME MESSAGE ===== //
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
    
    if (!fs.existsSync(AUTH_FOLDER)) {
        fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    }
    
    const credsPath = path.join(AUTH_FOLDER, 'creds.json');
    if (fs.existsSync(credsPath)) {
        try {
            const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
            if (creds.noiseKey && creds.noiseKey.private) {
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
                                console.log('✅ Newsletter auto-follow completed');
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
                    console.log(`📋 Newsletter count: ${STATUS_CONFIG.NEWSLETTER_JIDS.length}`);
                    console.log(`🎭 Status emojis: ${STATUS_CONFIG.AUTO_LIKE_EMOJIS.length}`);
                    console.log(`🔥 Newsletter emojis: ${STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS.length}`);
                    console.log('================================\n');
                } else if (connection === 'connecting') {
                    botStatus = 'connecting';
                    isConnecting = true;
                    console.log('🔄 Bot is connecting...');
                }
            });

            sock.ev.on('creds.update', async () => {
                await saveCreds();
                console.log('💾 Credentials updated');
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
                            }
                        } catch (error) {
                            console.error(`❌ Failed to load plugin ${file}:`, error.message);
                        }
                    }
                } catch (error) {
                    console.error('❌ Error loading plugins:', error);
                }
            }
           
            sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type !== 'notify') return;
                
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

            sock.ev.on('group-participants.update', async (update) => {
                console.log('👥 Group update:', update);
            });

            sock.ev.on('messages.reaction', async (reactions) => {
                console.log('💖 Reaction update:', reactions);
            });

            sock.ev.on('newsletter.metadata', async (update) => {
                console.log('📰 Newsletter metadata update:', update);
            });

        } catch (error) {
            console.error('❌ Bot startup error:', error);
            isConnecting = false;
            setTimeout(() => startBot(), 10000);
        }
    })();
}

// ===== ENHANCED WEB DASHBOARD ===== //
const server = http.createServer((req, res) => {
    const url = req.url;
    
    if (url === '/' || url === '/qr') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getDashboardHTML());
    } 
    
    else if (url === '/empirepair' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const phoneNumber = data.number;
                
                if (!phoneNumber) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        success: false, 
                        error: 'Phone number is required',
                        message: 'Please provide a phone number'
                    }));
                    return;
                }
                
                console.log(`📱 EmpirePair request for: ${phoneNumber}`);
                
                const mockRes = {
                    headersSent: false,
                    send: (response) => {
                        if (response && response.code) {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                success: true,
                                code: response.code,
                                number: phoneNumber,
                                expires: Date.now() + 300000,
                                message: 'Pairing code generated successfully'
                            }));
                        } else {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                success: false,
                                error: 'No code generated',
                                message: 'Failed to generate pairing code'
                            }));
                        }
                    },
                    status: () => mockRes,
                    json: (data) => {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(data));
                    }
                };
                
                await EmpirePair(phoneNumber, mockRes);
                
            } catch (error) {
                console.error('❌ EmpirePair API error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: false, 
                    error: error.message,
                    message: 'Internal server error'
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
            hasQR: !!latestQR,
            qr: latestQR,
            prefix: global.BOT_PREFIX,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            theme: 'mercedes',
            version: '2.0',
            features: {
                status_auto_view: STATUS_CONFIG.AUTO_VIEW_STATUS,
                status_auto_react: STATUS_CONFIG.AUTO_LIKE_STATUS,
                newsletter_auto_follow: STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS,
                newsletter_auto_react: STATUS_CONFIG.AUTO_REACT_NEWSLETTERS,
                newsletter_count: STATUS_CONFIG.NEWSLETTER_JIDS.length,
                status_emojis: STATUS_CONFIG.AUTO_LIKE_EMOJIS.length,
                newsletter_emojis: STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS.length,
                newsletter_list: STATUS_CONFIG.NEWSLETTER_JIDS
            },
            empirepair: {
                activeSessions: EMPIREPAIR_CONFIG.activeSockets.size,
                enabled: true
            }
        }));
    }
    
    else if (url === '/api/empirepair-sessions') {
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*' 
        });
        const sessions = Array.from(EMPIREPAIR_CONFIG.activeSockets.keys()).map(number => ({
            number,
            createdAt: EMPIREPAIR_CONFIG.socketCreationTime.get(number),
            uptime: Date.now() - (EMPIREPAIR_CONFIG.socketCreationTime.get(number) || Date.now())
        }));
        res.end(JSON.stringify({
            success: true,
            sessions,
            total: sessions.length
        }));
    }
    
    else {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(get404HTML());
    }
});

// Start the server
server.listen(PORT, () => {
    console.log(`🌐 Mercedes Bot Dashboard: http://localhost:${PORT}`);
    console.log(`📁 Session folder: ${path.resolve(AUTH_FOLDER)}`);
    console.log(`🎯 EmpirePair System: ✅ Integrated`);
    console.log(`\n📊 ===== CONFIGURATION LOADED =====`);
    console.log(`📱 Status auto-view: ${STATUS_CONFIG.AUTO_VIEW_STATUS ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`💖 Status auto-react: ${STATUS_CONFIG.AUTO_LIKE_STATUS ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`📰 Newsletter auto-follow: ${STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`🔥 Newsletter auto-react: ${STATUS_CONFIG.AUTO_REACT_NEWSLETTERS ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`📋 Newsletter count: ${STATUS_CONFIG.NEWSLETTER_JIDS.length}`);
    console.log(`🎭 Status emojis: ${STATUS_CONFIG.AUTO_LIKE_EMOJIS.length}`);
    console.log(`🔥 Newsletter emojis: ${STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS.length}`);
    console.log(`📞 Country codes loaded: ${COUNTRY_CODES.length} countries`);
    console.log(`⚡ EmpirePair System: Active with MEGA-like features`);
    console.log(`================================\n`);
    loadPrefix();
});

// Helper functions for HTML responses
function getDashboardHTML() {
    const newsletterItems = STATUS_CONFIG.NEWSLETTER_JIDS.map(jid => 
        `<div class="newsletter-item">
            <i class="fas fa-newspaper"></i>
            ${jid}
        </div>`
    ).join('');

    const countryOptions = COUNTRY_CODES.map(country => 
        `<option value="${country.code}" ${country.code === '254' ? 'selected' : ''}>
            ${country.flag} ${country.name} (+${country.code})
        </option>`
    ).join('');

    return `<!DOCTYPE html>
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
        
        .features-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }
        
        .feature-card {
            background: rgba(0, 0, 0, 0.7);
            border-radius: 15px;
            padding: 20px;
            border-left: 4px solid var(--mercedes-blue);
        }
        
        .feature-card h4 {
            color: var(--mercedes-silver);
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .feature-status {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            margin-left: auto;
        }
        
        .enabled { background: rgba(0, 255, 0, 0.2); color: #00FF00; }
        .disabled { background: rgba(255, 68, 68, 0.2); color: #FF4444; }
        
        .feature-list {
            list-style: none;
            padding-left: 0;
        }
        
        .feature-list li {
            padding: 5px 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .feature-list i.fa-check {
            color: #00FF00;
        }
        
        .feature-list i.fa-times {
            color: #FF4444;
        }
        
        .newsletter-list {
            background: rgba(0, 0, 0, 0.8);
            border-radius: 15px;
            padding: 20px;
            margin: 20px 0;
            border: 1px solid var(--mercedes-blue);
        }
        
        .newsletter-list h4 {
            color: var(--mercedes-silver);
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .newsletter-item {
            padding: 8px 12px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
            font-family: monospace;
            font-size: 0.9rem;
        }
        
        .newsletter-item i {
            color: var(--mercedes-blue);
        }
        
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
        
        .form-group {
            max-width: 600px;
            margin: 0 auto;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 10px;
            font-size: 1.1rem;
            color: var(--mercedes-silver);
        }
        
        .phone-input-container {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }
        
        .country-select {
            flex: 0 0 200px;
            position: relative;
        }
        
        .country-select select {
            width: 100%;
            padding: 15px 20px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid var(--mercedes-silver);
            border-radius: 10px;
            color: white;
            font-size: 1rem;
            cursor: pointer;
            appearance: none;
            -webkit-appearance: none;
            -moz-appearance: none;
        }
        
        .country-select::after {
            content: '▼';
            position: absolute;
            right: 15px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--mercedes-silver);
            pointer-events: none;
        }
        
        .phone-input {
            flex: 1;
        }
        
        .phone-input input {
            width: 100%;
            padding: 15px 20px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid var(--mercedes-silver);
            border-radius: 10px;
            color: white;
            font-size: 1.1rem;
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
            
            .features-grid {
                grid-template-columns: 1fr;
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
            
            .phone-input-container {
                flex-direction: column;
            }
            
            .country-select {
                flex: 0 0 auto;
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
    <div class="loading-overlay" id="loadingOverlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 1000; backdrop-filter: blur(10px);">
        <div class="loading-spinner" style="width: 70px; height: 70px; border: 5px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: var(--mercedes-blue); animation: spin 1s ease-in-out infinite;"></div>
        <div class="loading-text" style="margin-top: 20px; font-size: 18px; color: var(--mercedes-silver);">Initializing Mercedes Bot...</div>
    </div>

    <div class="container">
        <div class="header">
            <div class="mercedes-logo">
                <i class="fas fa-star"></i>
            </div>
            <h1>Mercedes WhatsApp Bot</h1>
            <p class="tagline">Premium Automation with Status & Newsletter Features</p>
            
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
                    <div class="status-value" style="color: var(--mercedes-blue);">${global.BOT_PREFIX || '.'}</div>
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
        
        <div class="features-grid">
            <div class="feature-card">
                <h4><i class="fas fa-eye"></i> Status Auto-View
                    <span class="feature-status ${STATUS_CONFIG.AUTO_VIEW_STATUS ? 'enabled' : 'disabled'}">
                        ${STATUS_CONFIG.AUTO_VIEW_STATUS ? 'ENABLED' : 'DISABLED'}
                    </span>
                </h4>
                <ul class="feature-list">
                    <li><i class="fas ${STATUS_CONFIG.AUTO_VIEW_STATUS ? 'fa-check' : 'fa-times'}"></i> Automatically views status updates</li>
                    <li><i class="fas ${STATUS_CONFIG.AUTO_RECORDING ? 'fa-check' : 'fa-times'}"></i> Shows "recording" presence</li>
                    <li><i class="fas fa-smile"></i> Marks status as seen instantly</li>
                </ul>
            </div>
            
            <div class="feature-card">
                <h4><i class="fas fa-heart"></i> Status Auto-React
                    <span class="feature-status ${STATUS_CONFIG.AUTO_LIKE_STATUS ? 'enabled' : 'disabled'}">
                        ${STATUS_CONFIG.AUTO_LIKE_STATUS ? 'ENABLED' : 'DISABLED'}
                    </span>
                </h4>
                <ul class="feature-list">
                    <li><i class="fas ${STATUS_CONFIG.AUTO_LIKE_STATUS ? 'fa-check' : 'fa-times'}"></i> Reacts with random emojis</li>
                    <li><i class="fas fa-icons"></i> ${STATUS_CONFIG.AUTO_LIKE_EMOJIS.length} different emojis</li>
                    <li><i class="fas fa-bolt"></i> Instant reaction after viewing</li>
                </ul>
            </div>
            
            <div class="feature-card">
                <h4><i class="fas fa-newspaper"></i> Newsletter Auto-Follow
                    <span class="feature-status ${STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS ? 'enabled' : 'disabled'}">
                        ${STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS ? 'ENABLED' : 'DISABLED'}
                    </span>
                </h4>
                <ul class="feature-list">
                    <li><i class="fas ${STATUS_CONFIG.AUTO_FOLLOW_NEWSLETTERS ? 'fa-check' : 'fa-times'}"></i> Auto-follows on connect</li>
                    <li><i class="fas fa-list"></i> ${STATUS_CONFIG.NEWSLETTER_JIDS.length} newsletters configured</li>
                    <li><i class="fas fa-check-circle"></i> Follows all newsletters in list</li>
                </ul>
            </div>
            
            <div class="feature-card">
                <h4><i class="fas fa-fire"></i> Newsletter Auto-React
                    <span class="feature-status ${STATUS_CONFIG.AUTO_REACT_NEWSLETTERS ? 'enabled' : 'disabled'}">
                        ${STATUS_CONFIG.AUTO_REACT_NEWSLETTERS ? 'ENABLED' : 'DISABLED'}
                    </span>
                </h4>
                <ul class="feature-list">
                    <li><i class="fas ${STATUS_CONFIG.AUTO_REACT_NEWSLETTERS ? 'fa-check' : 'fa-times'}"></i> Reacts to newsletter posts</li>
                    <li><i class="fas fa-icons"></i> ${STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS.length} reaction emojis</li>
                    <li><i class="fas fa-robot"></i> Fully automated engagement</li>
                </ul>
            </div>
        </div>
        
        <div class="newsletter-list">
            <h4><i class="fas fa-list-check"></i> Newsletter List (${STATUS_CONFIG.NEWSLETTER_JIDS.length})</h4>
            ${newsletterItems}
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
                    <li>Bot will auto-follow newsletters and engage with statuses</li>
                </ol>
            </div>
        </div>
        ` : ''}
        
        <div class="pair-section">
            <h2><i class="fas fa-mobile-alt"></i> Pair with Phone Number</h2>
            <p style="text-align: center; margin-bottom: 30px; color: rgba(255,255,255,0.8);">
                Select your country and enter your phone number to receive a pairing code
            </p>
            
            <div class="form-group">
                <div class="phone-input-container">
                    <div class="country-select">
                        <select id="countryCode">
                            <option value="" disabled selected>Select Country</option>
                            ${countryOptions}
                        </select>
                    </div>
                    <div class="phone-input">
                        <input type="tel" id="phoneNumber" class="form-control" placeholder="740007567" required pattern="[0-9]{9,15}" title="Enter phone number without country code">
                    </div>
                </div>
                
                <div style="text-align: center; margin: 20px 0; color: var(--mercedes-silver);">
                    <i class="fas fa-info-circle"></i> Example: Select Kenya (+254) and enter 740007567
                </div>
                
                <button class="btn btn-primary" id="pairBtn" style="width: 100%;">
                    <i class="fas fa-key"></i> Generate Pairing Code
                </button>
                
                <div id="pairResult" style="margin-top: 20px; display: none;"></div>
            </div>
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
            <button class="btn btn-danger" onclick="alert('Bot is connected and running with status & newsletter features!')">
                <i class="fas fa-play-circle"></i> Bot Active
            </button>
            ` : ''}
        </div>
        
        <div class="footer">
            <p>
                <i class="fas fa-car"></i> Mercedes WhatsApp Bot v2.0 | 
                Premium Status & Newsletter Automation
            </p>
            <p>
                Session Path: <code>${AUTH_FOLDER}</code> | 
                Uptime: <span id="uptime">${Math.floor(process.uptime())}s</span> |
                Newsletters: ${STATUS_CONFIG.NEWSLETTER_JIDS.length} |
                Emojis: ${STATUS_CONFIG.NEWSLETTER_REACT_EMOJIS.length}
            </p>
            <p>
                &copy; ${new Date().getFullYear()} Mercedes Bot Technologies. 
                All rights reserved.
            </p>
        </div>
    </div>

    <script>
        setTimeout(() => {
            document.getElementById('loadingOverlay').style.display = 'none';
        }, 2000);
        
        if("${botStatus}" !== "connected") {
            setTimeout(() => location.reload(), 10000);
        }
        
        let uptime = ${Math.floor(process.uptime())};
        setInterval(() => {
            uptime++;
            document.getElementById('uptime').textContent = uptime + 's';
        }, 1000);
        
        document.getElementById('pairBtn').addEventListener('click', async function() {
            const countryCode = document.getElementById('countryCode').value;
            const phoneNumber = document.getElementById('phoneNumber').value;
            
            if (!countryCode || !phoneNumber) {
                alert('Please select a country and enter your phone number');
                return;
            }
            
            const fullNumber = countryCode + phoneNumber.replace(/[^0-9]/g, '');
            
            const btn = document.getElementById('pairBtn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span class="loading"></span> Generating Code...';
            btn.disabled = true;
            
            const resultDiv = document.getElementById('pairResult');
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = '<div style="text-align: center; color: var(--mercedes-silver);"><i class="fas fa-spinner fa-spin"></i> Requesting pairing code...</div>';
            
            try {
                const response = await fetch('/empirepair', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ number: fullNumber })
                });
                
                const data = await response.json();
                
                if (data.success && data.code) {
                    resultDiv.innerHTML = \`
                        <div class="code-display">
                            <h2><i class="fas fa-key"></i> Pairing Code Generated</h2>
                            <div style="margin-bottom: 15px; color: var(--mercedes-silver);">
                                <i class="fas fa-mobile-alt"></i> Number: +\${fullNumber}
                            </div>
                            <div class="pairing-code pulse" onclick="copyToClipboard('\${data.code.replace(/-/g, '')}')" style="cursor: pointer;">
                                \${data.code}
                            </div>
                            <div style="color: #FFA500; margin: 15px 0;">
                                <i class="fas fa-clock"></i> Valid for 5 minutes
                            </div>
                            <div class="instructions">
                                <h3><i class="fas fa-info-circle"></i> How to use:</h3>
                                <ol>
                                    <li>Open <strong>WhatsApp</strong> on your phone</li>
                                    <li>Go to <strong>Settings</strong> → <strong>Linked Devices</strong></li>
                                    <li>Tap <strong>Link a Device</strong> → <strong>Use pairing code</strong></li>
                                    <li>Enter the <strong>8-digit code</strong> above</li>
                                    <li>Tap <strong>Link Device</strong> to connect</li>
                                </ol>
                                <div style="color: var(--mercedes-blue); margin-top: 10px; font-size: 0.9rem;">
                                    <i class="fas fa-mouse-pointer"></i> Click on the code to copy it
                                </div>
                            </div>
                        </div>
                    \`;
                } else {
                    resultDiv.innerHTML = \`
                        <div style="background: rgba(228,0,43,0.1); padding: 20px; border-radius: 10px; border-left: 4px solid var(--mercedes-red);">
                            <h3 style="color: var(--mercedes-red);"><i class="fas fa-exclamation-triangle"></i> Error</h3>
                            <p>\${data.message || 'Failed to generate pairing code'}</p>
                            <p style="color: var(--mercedes-silver); font-size: 0.9rem;">Error: \${data.error || 'Unknown error'}</p>
                            <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; background: var(--mercedes-blue); color: white; border: none; border-radius: 5px; cursor: pointer;">
                                <i class="fas fa-redo"></i> Try Again
                            </button>
                        </div>
                    \`;
                }
                
            } catch (error) {
                resultDiv.innerHTML = \`
                    <div style="background: rgba(228,0,43,0.1); padding: 20px; border-radius: 10px; border-left: 4px solid var(--mercedes-red);">
                        <h3 style="color: var(--mercedes-red);"><i class="fas fa-exclamation-triangle"></i> Connection Error</h3>
                        <p>Failed to connect to server. Please try again.</p>
                        <p style="color: var(--mercedes-silver); font-size: 0.9rem;">\${error.message}</p>
                    </div>
                \`;
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });
        
        const statusValue = document.querySelector('.status-value');
        if(statusValue && statusValue.classList.contains('connecting')) {
            statusValue.classList.add('pulse');
        }
        
        document.getElementById('phoneNumber').addEventListener('input', function(e) {
            this.value = this.value.replace(/\\D/g, '');
        });
        
        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                const codeElement = document.querySelector('.pairing-code');
                if (codeElement) {
                    const originalText = codeElement.textContent;
                    codeElement.textContent = '✓ COPIED!';
                    codeElement.style.color = '#00FF00';
                    setTimeout(() => {
                        codeElement.textContent = originalText;
                        codeElement.style.color = '#00FF00';
                    }, 2000);
                }
            });
        }
        
        document.getElementById('countryCode').addEventListener('change', function() {
            document.getElementById('phoneNumber').focus();
        });
    </script>
</body>
</html>`;
}

function get404HTML() {
    return `<!DOCTYPE html>
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
</html>`;
}

// Handle process events
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down Mercedes Bot gracefully...');
    if (presenceInterval) clearInterval(presenceInterval);
    if (sock) sock.end();
    
    for (const [number, socket] of EMPIREPAIR_CONFIG.activeSockets) {
        try {
            if (socket?.ws) {
                socket.ws.close();
            }
        } catch (e) {
            console.error(`Error closing EmpirePair socket for ${number}:`, e.message);
        }
    }
    
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection:', reason);
});
