const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestWaWebVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { createClient } = require('@supabase/supabase-js');
const QRCode = require('qrcode');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { Boom } = require('@hapi/boom');
require('dotenv').config(); // Add this line

// ===== CONFIGURATION ===== //
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const PORT = process.env.PORT || 3000;

// Validate environment variables
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ ERROR: Missing Supabase environment variables!');
    console.error('Please set SUPABASE_URL and SUPABASE_KEY in your .env file');
    console.error('');
    console.error('Example .env file:');
    console.error('SUPABASE_URL=https://your-project-id.supabase.co');
    console.error('SUPABASE_KEY=your-supabase-anon-key');
    console.error('PORT=3000');
    process.exit(1);
}

// Validate Supabase URL format
if (!SUPABASE_URL.match(/^https?:\/\//i)) {
    console.error('❌ ERROR: Invalid SUPABASE_URL format');
    console.error('URL must start with http:// or https://');
    process.exit(1);
}

// Initialize Supabase
let supabase;
try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
            persistSession: false
        }
    });
    console.log('✅ Supabase client initialized successfully');
} catch (error) {
    console.error('❌ Failed to initialize Supabase client:', error.message);
    process.exit(1);
}

// Global storage for active sessions
const activeSessions = new Map();

// App setup
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Create necessary directories
const sessionsDir = path.join(__dirname, 'sessions');
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
    console.log('📁 Created sessions directory');
}
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
    console.log('📁 Created public directory');
}

// ===== HELPER FUNCTIONS ===== //

/**
 * Test database connection
 */
async function testDatabaseConnection() {
    try {
        const { data, error } = await supabase
            .from('whatsapp_sessions')
            .select('count')
            .limit(1);
        
        if (error) throw error;
        console.log('✅ Database connection successful');
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        
        // Try to create table if it doesn't exist
        console.log('Attempting to create tables...');
        await createDatabaseTables();
        return false;
    }
}

/**
 * Create necessary database tables
 */
async function createDatabaseTables() {
    const sql = `
        CREATE TABLE IF NOT EXISTS whatsapp_sessions (
            id BIGSERIAL PRIMARY KEY,
            session_id VARCHAR(255) UNIQUE NOT NULL,
            phone_number VARCHAR(50),
            auth_data JSONB,
            config_data JSONB DEFAULT '{"prefix": ".", "mode": "public"}'::jsonb,
            status VARCHAR(50) DEFAULT 'disconnected',
            qr_code TEXT,
            last_active TIMESTAMP DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS session_messages (
            id BIGSERIAL PRIMARY KEY,
            session_id VARCHAR(255),
            sender VARCHAR(255),
            message TEXT,
            type VARCHAR(50),
            created_at TIMESTAMP DEFAULT NOW()
        );
    `;
    
    try {
        // Execute SQL using Supabase's SQL editor (you'll need to run this manually in Supabase dashboard)
        console.log('📋 Please run this SQL in your Supabase SQL Editor:');
        console.log(sql);
        console.log('');
        console.log('Or use the Supabase dashboard to create the tables.');
        console.log('1. Go to your Supabase project');
        console.log('2. Open SQL Editor');
        console.log('3. Paste the SQL above and run it');
        
        return false; // Tables need to be created manually
    } catch (error) {
        console.error('Error creating tables:', error.message);
        return false;
    }
}

/**
 * Get or create session in database
 */
async function getOrCreateSession(sessionId, phoneNumber = null) {
    try {
        // Check if session exists
        const { data: existingSession, error } = await supabase
            .from('whatsapp_sessions')
            .select('*')
            .eq('session_id', sessionId)
            .single();

        if (error && error.code === 'PGRST116') {
            // Session doesn't exist, create it
            const { data: newSession, error: createError } = await supabase
                .from('whatsapp_sessions')
                .insert({
                    session_id: sessionId,
                    phone_number: phoneNumber,
                    status: 'initializing',
                    config_data: { prefix: '.', mode: 'public' },
                    auth_data: {}
                })
                .select()
                .single();

            if (createError) throw createError;
            console.log(`📝 Created new session: ${sessionId}`);
            return newSession;
        }

        if (error) throw error;
        
        // Update existing session
        const { data: updatedSession, error: updateError } = await supabase
            .from('whatsapp_sessions')
            .update({
                phone_number: phoneNumber || existingSession.phone_number,
                status: 'initializing',
                updated_at: new Date().toISOString()
            })
            .eq('session_id', sessionId)
            .select()
            .single();

        if (updateError) throw updateError;
        console.log(`📝 Updated existing session: ${sessionId}`);
        return updatedSession;

    } catch (error) {
        console.error('Error in getOrCreateSession:', error.message);
        
        // Fallback: return a local session object
        return {
            session_id: sessionId,
            phone_number: phoneNumber,
            status: 'initializing',
            config_data: { prefix: '.', mode: 'public' },
            auth_data: {}
        };
    }
}

/**
 * Update session status
 */
async function updateSessionStatus(sessionId, status, qrCode = null) {
    try {
        const updates = {
            status: status,
            updated_at: new Date().toISOString()
        };

        if (qrCode) {
            updates.qr_code = qrCode;
        }

        if (status === 'connected') {
            updates.last_active = new Date().toISOString();
        }

        const { error } = await supabase
            .from('whatsapp_sessions')
            .update(updates)
            .eq('session_id', sessionId);

        if (error) throw error;
        console.log(`Session ${sessionId} status: ${status}`);
    } catch (error) {
        console.error('Error updating session status:', error.message);
    }
}

/**
 * Save auth data to Supabase
 */
async function saveAuthData(sessionId, authData) {
    try {
        const { error } = await supabase
            .from('whatsapp_sessions')
            .update({
                auth_data: authData,
                updated_at: new Date().toISOString()
            })
            .eq('session_id', sessionId);

        if (error) throw error;
    } catch (error) {
        console.error('Error saving auth data:', error.message);
    }
}

/**
 * Create local auth folder for session
 */
function createAuthFolder(sessionId) {
    const authFolder = path.join(sessionsDir, sessionId);
    if (!fs.existsSync(authFolder)) {
        fs.mkdirSync(authFolder, { recursive: true });
    }
    return authFolder;
}

/**
 * Clean up session folder
 */
function cleanupSessionFolder(sessionId) {
    try {
        const authFolder = path.join(sessionsDir, sessionId);
        if (fs.existsSync(authFolder)) {
            fs.rmSync(authFolder, { recursive: true, force: true });
        }
    } catch (error) {
        console.error('Error cleaning up session folder:', error.message);
    }
}

// ===== BOT FUNCTIONS ===== //

/**
 * Start a WhatsApp session
 */
async function startSession(sessionId, phoneNumber = null) {
    try {
        // Check if session already active
        if (activeSessions.has(sessionId)) {
            return { success: false, message: 'Session already active' };
        }

        // Get or create session in database
        await getOrCreateSession(sessionId, phoneNumber);
        await updateSessionStatus(sessionId, 'initializing');

        // Create local auth folder
        const authFolder = createAuthFolder(sessionId);

        // Start the bot
        const logger = pino({ level: 'info' });
        
        // Load auth state
        const { state, saveCreds } = await useMultiFileAuthState(authFolder);
        
        // Get latest WhatsApp version
        const { version } = await fetchLatestWaWebVersion();
        
        // Create socket
        const socket = makeWASocket({
            version,
            logger,
            auth: state,
            printQRInTerminal: false,
            keepAliveIntervalMs: 10000,
            markOnlineOnConnect: true,
            syncFullHistory: false
        });

        // Store in active sessions
        activeSessions.set(sessionId, {
            socket,
            authFolder,
            status: 'connecting',
            phoneNumber,
            qrCode: null,
            saveCreds
        });

        // Event: Connection updates
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                // Generate QR code
                QRCode.toDataURL(qr, async (err, qrCode) => {
                    if (!err) {
                        const session = activeSessions.get(sessionId);
                        if (session) {
                            session.qrCode = qrCode;
                            await updateSessionStatus(sessionId, 'qr_ready', qrCode);
                        }
                    }
                });
            }

            if (connection === 'close') {
                const statusCode = (lastDisconnect?.error instanceof Boom) 
                    ? lastDisconnect.error.output.statusCode 
                    : 0;

                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                await updateSessionStatus(sessionId, 'disconnected');
                activeSessions.delete(sessionId);

                if (shouldReconnect) {
                    console.log(`Session ${sessionId} disconnected, reconnecting in 10s...`);
                    setTimeout(() => {
                        startSession(sessionId, phoneNumber);
                    }, 10000);
                } else {
                    console.log(`Session ${sessionId} logged out`);
                    cleanupSessionFolder(sessionId);
                    await updateSessionStatus(sessionId, 'logged_out');
                }
            } else if (connection === 'open') {
                console.log(`✅ Session ${sessionId} connected`);
                const session = activeSessions.get(sessionId);
                if (session) {
                    session.status = 'connected';
                }
                await updateSessionStatus(sessionId, 'connected');
                
                // Send welcome message
                try {
                    await socket.sendMessage(socket.user.id, {
                        text: `🤖 Bot connected!\nSession: ${sessionId}\nPrefix: .\n\nType .help for commands`
                    });
                } catch (err) {
                    console.error('Could not send welcome message:', err.message);
                }
            } else if (connection === 'connecting') {
                const session = activeSessions.get(sessionId);
                if (session) {
                    session.status = 'connecting';
                }
                await updateSessionStatus(sessionId, 'connecting');
            }
        });

        // Event: Credentials update
        socket.ev.on('creds.update', async () => {
            const session = activeSessions.get(sessionId);
            if (session && session.saveCreds) {
                await session.saveCreds();
                
                // Save auth data to database
                try {
                    const authFiles = {};
                    const files = fs.readdirSync(authFolder);
                    
                    for (const file of files) {
                        const filePath = path.join(authFolder, file);
                        try {
                            const content = fs.readFileSync(filePath, 'utf8');
                            authFiles[file] = content;
                        } catch (err) {
                            console.error(`Failed to read ${file}:`, err.message);
                        }
                    }
                    
                    await saveAuthData(sessionId, authFiles);
                } catch (error) {
                    console.error('Error saving auth files:', error.message);
                }
            }
        });

        // Event: Messages
        socket.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            // Auto-view status
            for (const msg of messages) {
                if (msg.key.remoteJid === 'status@broadcast' && msg.key.participant) {
                    try {
                        await socket.readMessages([msg.key]);
                    } catch (err) {
                        // Ignore errors
                    }
                }
            }

            // Handle commands
            const msg = messages[0];
            if (msg?.message) {
                const body = msg.message.conversation || 
                            msg.message.extendedTextMessage?.text || 
                            msg.message.imageMessage?.caption || 
                            '';
                
                if (body.startsWith('.')) {
                    const command = body.slice(1).split(' ')[0].toLowerCase();
                    const args = body.slice(1).split(' ').slice(1);
                    
                    await handleCommand(socket, msg, command, args, sessionId);
                }
            }
        });

        // Request pairing code if phone number provided
        if (phoneNumber) {
            setTimeout(async () => {
                try {
                    const pairingCode = await socket.requestPairingCode(phoneNumber);
                    console.log(`Session ${sessionId}: Pairing code: ${pairingCode}`);
                    
                    const session = activeSessions.get(sessionId);
                    if (session) {
                        session.pairingCode = pairingCode;
                    }
                } catch (error) {
                    console.error(`Failed to get pairing code:`, error.message);
                }
            }, 3000);
        }

        return { success: true, sessionId, message: 'Session started' };

    } catch (error) {
        console.error('Error starting session:', error.message);
        await updateSessionStatus(sessionId, 'error');
        return { success: false, message: error.message };
    }
}

/**
 * Handle bot commands
 */
async function handleCommand(socket, msg, command, args, sessionId) {
    const from = msg.key.remoteJid;
    
    try {
        switch (command) {
            case 'ping':
                await socket.sendMessage(from, { text: '🏓 Pong!' });
                break;
                
            case 'help':
                await socket.sendMessage(from, {
                    text: `🤖 *Bot Commands*\n\n` +
                          `• .ping - Check if bot is alive\n` +
                          `• .help - Show this help\n` +
                          `• .session - Show session info\n` +
                          `• .status - Show bot status\n` +
                          `• .owner - Contact owner\n\n` +
                          `📱 Session: ${sessionId}`
                });
                break;
                
            case 'session':
                const session = activeSessions.get(sessionId);
                await socket.sendMessage(from, {
                    text: `📱 *Session Info*\n\n` +
                          `• ID: ${sessionId}\n` +
                          `• Status: ${session?.status || 'unknown'}\n` +
                          `• Phone: ${session?.phoneNumber || 'Not set'}\n` +
                          `• Connected: ${session?.socket ? 'Yes' : 'No'}`
                });
                break;
                
            case 'status':
                await socket.sendMessage(from, {
                    text: `📊 *Bot Status*\n\n` +
                          `• Active sessions: ${activeSessions.size}\n` +
                          `• Your session: ${sessionId}\n` +
                          `• Uptime: ${Math.floor(process.uptime())}s\n` +
                          `• Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
                });
                break;
                
            case 'owner':
                await socket.sendMessage(from, {
                    text: `👑 *Owner Information*\n\n` +
                          `• Name: ABZTECH\n` +
                          `• GitHub: https://github.com/abrahamdw882\n` +
                          `• Channel: https://whatsapp.com/channel/0029VaMGgVL3WHTNkhzHik3c\n\n` +
                          `Need help? Contact the owner above!`
                });
                break;
                
            default:
                await socket.sendMessage(from, {
                    text: `❓ Unknown command: .${command}\nType .help for available commands`
                });
        }
    } catch (error) {
        console.error('Command error:', error.message);
    }
}

/**
 * Stop a session
 */
async function stopSession(sessionId) {
    try {
        const session = activeSessions.get(sessionId);
        if (session) {
            if (session.socket) {
                session.socket.ws.close();
            }
            activeSessions.delete(sessionId);
            await updateSessionStatus(sessionId, 'stopped');
            cleanupSessionFolder(sessionId);
            return { success: true, message: 'Session stopped' };
        }
        return { success: false, message: 'Session not found' };
    } catch (error) {
        console.error('Error stopping session:', error.message);
        return { success: false, message: error.message };
    }
}

// ===== API ROUTES ===== //

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'WhatsApp Multi-Session Bot',
        version: '1.0.0',
        author: 'ABZTECH',
        activeSessions: activeSessions.size,
        timestamp: new Date().toISOString()
    });
});

// Get all sessions
app.get('/api/sessions', async (req, res) => {
    try {
        const { data: sessions, error } = await supabase
            .from('whatsapp_sessions')
            .select('*')
            .order('updated_at', { ascending: false });

        if (error) throw error;

        const sessionsWithStatus = (sessions || []).map(session => ({
            ...session,
            isActive: activeSessions.has(session.session_id)
        }));

        res.json({ success: true, sessions: sessionsWithStatus });
    } catch (error) {
        console.error('Error fetching sessions:', error.message);
        res.json({ success: true, sessions: [] });
    }
});

// Create/Start a new session
app.post('/api/sessions', async (req, res) => {
    try {
        const { sessionId, phoneNumber } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ 
                success: false, 
                message: 'sessionId is required' 
            });
        }

        const result = await startSession(sessionId, phoneNumber);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get session details
app.get('/api/sessions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = activeSessions.get(sessionId);
        
        const { data: dbData, error } = await supabase
            .from('whatsapp_sessions')
            .select('*')
            .eq('session_id', sessionId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        res.json({ 
            success: true, 
            session: {
                sessionId,
                active: !!session,
                status: dbData?.status || 'unknown',
                phoneNumber: dbData?.phone_number,
                qrCode: dbData?.qr_code,
                lastActive: dbData?.last_active,
                config: dbData?.config_data,
                socketStatus: session?.socket?.ws?.readyState
            }
        });
    } catch (error) {
        res.json({ 
            success: true, 
            session: {
                sessionId: req.params.sessionId,
                active: false,
                status: 'unknown'
            }
        });
    }
});

// Stop a session
app.delete('/api/sessions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const result = await stopSession(sessionId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get QR code for session
app.get('/api/sessions/:sessionId/qr', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = activeSessions.get(sessionId);
        
        if (session && session.qrCode) {
            res.json({ success: true, qrCode: session.qrCode });
        } else {
            // Check database for QR
            const { data: dbData } = await supabase
                .from('whatsapp_sessions')
                .select('qr_code')
                .eq('session_id', sessionId)
                .single();

            if (dbData?.qr_code) {
                res.json({ success: true, qrCode: dbData.qr_code });
            } else {
                res.json({ success: false, message: 'QR code not available' });
            }
        }
    } catch (error) {
        res.json({ success: false, message: 'QR code not available' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        activeSessions: activeSessions.size,
        memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        }
    });
});

// ===== START SERVER ===== //

async function startServer() {
    console.log('🚀 Starting Multi-Session WhatsApp Bot...');
    console.log('📊 Environment check:');
    console.log(`   • PORT: ${PORT}`);
    console.log(`   • SUPABASE_URL: ${SUPABASE_URL ? 'Set' : 'Not set'}`);
    console.log(`   • SUPABASE_KEY: ${SUPABASE_KEY ? 'Set' : 'Not set'}`);
    
    // Test database connection
    await testDatabaseConnection();
    
    // Start HTTP server
    app.listen(PORT, () => {
        console.log(`✅ Server running on port ${PORT}`);
        console.log('');
        console.log('📋 Available API endpoints:');
        console.log(`   GET  /                    - Health check`);
        console.log(`   GET  /api/sessions        - List all sessions`);
        console.log(`   POST /api/sessions        - Create new session`);
        console.log(`   GET  /api/sessions/:id    - Get session info`);
        console.log(`   GET  /api/sessions/:id/qr - Get QR code`);
        console.log(`   DELETE /api/sessions/:id  - Stop session`);
        console.log(`   GET  /api/health          - Health check`);
        console.log('');
        console.log('🤖 To create a session, send POST request to /api/sessions');
        console.log('   Example: {"sessionId": "my-session", "phoneNumber": "254740007567"}');
        console.log('');
        console.log('📱 Web interface will be available at the root URL');
    });
}

// Start the server
startServer().catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🛑 Shutting down...');
    
    // Stop all active sessions
    for (const [sessionId] of activeSessions) {
        stopSession(sessionId);
    }
    
    process.exit(0);
});
