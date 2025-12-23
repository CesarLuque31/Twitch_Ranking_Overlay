require('dotenv').config();
const express = require('express');
const path = require('path');
const tmi = require('tmi.js');

const app = express();
const port = 3005;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- Estado Global (In-Memory) ---
const botState = {
    puntajes: {},
    pendingAnimations: []
};

// --- Configuración de Canales ---
const channels = (process.env.STREAMER_CHANNEL || 'ejemplo_canal').split(',').map(c => c.trim().toLowerCase());

// --- Cliente de Twitch (TMI.js) ---
const client = new tmi.Client({
    options: { debug: true },
    connection: { reconnect: true, secure: true },
    identity: {
        username: process.env.TWITCH_USERNAME || 'TuBotCuenta',
        password: process.env.TWITCH_OAUTH_TOKEN || 'oauth:xxxxxxxxxxxxxxxxxxxx'
    },
    channels: channels
});

client.connect().catch(err => {
    console.warn('⚠️ Nota: Configure sus credenciales en .env para conectar a Twitch real.');
});

// --- Lógica de Comandos del Sistema de Rango ---
client.on('message', (channel, tags, message, self) => {
    if (self) return;

    const username = tags.username.toLowerCase();
    const cleanChannel = channel.replace('#', '').toLowerCase();
    const isBroadcaster = username === cleanChannel;
    const isMod = tags.mod || isBroadcaster;

    if (!message.startsWith('!')) return;

    const args = message.slice(1).split(' ');
    const command = args.shift().toLowerCase();

    function findPlayerName(ch, searchName) {
        if (!botState.puntajes[ch]) return null;
        const lowerSearch = searchName.toLowerCase();
        return Object.keys(botState.puntajes[ch]).find(n => n.toLowerCase() === lowerSearch) || null;
    }

    if ((command === 'rank' || command === 'gano') && isMod) {
        const winnerName = args[0];
        if (winnerName) {
            if (!botState.puntajes[cleanChannel]) botState.puntajes[cleanChannel] = {};
            const nameToUse = findPlayerName(cleanChannel, winnerName) || winnerName;

            botState.puntajes[cleanChannel][nameToUse] = (botState.puntajes[cleanChannel][nameToUse] || 0) + 1;

            botState.pendingAnimations.push({
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                name: nameToUse,
                points: botState.puntajes[cleanChannel][nameToUse],
                channel: cleanChannel
            });

            const scores = Object.entries(botState.puntajes[cleanChannel])
                .map(([name, score]) => `${name.toUpperCase()}: ${score}`)
                .join(' | ');
            client.say(channel, `🏆 [RANK] ${nameToUse.toUpperCase()} +1 PUNTO! MARCADOR: ${scores}`);
        }
    }

    if (command === 'corregir' && isMod) {
        const playerName = args[0];
        if (playerName) {
            const existingName = findPlayerName(cleanChannel, playerName);
            if (existingName) {
                botState.puntajes[cleanChannel][existingName] = Math.max(0, botState.puntajes[cleanChannel][existingName] - 1);
                if (botState.puntajes[cleanChannel][existingName] === 0) delete botState.puntajes[cleanChannel][existingName];
                const scores = Object.entries(botState.puntajes[cleanChannel]).map(([n, s]) => `${n.toUpperCase()}: ${s}`).join(' | ');
                client.say(channel, scores ? `🏆 [CORREGIDO] MARCADOR: ${scores}` : 'EL MARCADOR ESTÁ VACÍO.');
            }
        }
    }

    if (command === 'marcador') {
        const scores = Object.entries(botState.puntajes[cleanChannel] || {}).map(([n, s]) => `${n.toUpperCase()}: ${s}`).join(' | ');
        client.say(channel, scores ? `🏆 MARCADOR ACTUAL: ${scores}` : 'EL MARCADOR ESTÁ VACÍO.');
    }
});

app.get('/rank', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/api/rank/data', (req, res) => {
    const channel = (req.query.channel || '').toLowerCase();
    res.json({
        leaderboard: Object.entries(botState.puntajes[channel] || {}).map(([name, points]) => ({ name, points })).sort((a, b) => b.points - a.points),
        pending: botState.pendingAnimations.filter(a => a.channel === channel)
    });
});

app.get('/test-anim', (req, res) => {
    const channel = (req.query.channel || 'razzluk').toLowerCase();
    const animId = Date.now().toString();
    botState.pendingAnimations.push({
        id: animId,
        name: 'USUARIO_DEMO',
        points: (botState.puntajes[channel]?.['USUARIO_DEMO'] || 0) + 1,
        channel: channel
    });
    if (!botState.puntajes[channel]) botState.puntajes[channel] = {};
    botState.puntajes[channel]['USUARIO_DEMO'] = (botState.puntajes[channel]['USUARIO_DEMO'] || 0) + 1;
    res.send('Animación de prueba activada. Mira el overlay.');
});

app.listen(port, () => console.log(`Showcase activo en http://localhost:${port}`));
