import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto'; // for unique message IDs

// Setup __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

// Store messages as: { roomId: { chat1: [], chat2: [] } }
const allMessages = {};


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.get('/messages/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    const messages = allMessages[roomId] || { chat1: [], chat2: [] };
    res.json(messages);
});

app.get('/messages', (req, res) => {
    res.json(allMessages);
});

app.get('/:roomId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function sendMessage(roomId, chatName, messageText, senderId) {
    const msg = {
        id: randomUUID(),
        sender: senderId,
        text: messageText,
        chat: chatName
    };

    if (!allMessages[roomId]) {
        allMessages[roomId] = { chat1: [], chat2: [] };
    }

    allMessages[roomId][chatName].push(msg);

    // Send only to clients in the same room for that chat
    io.to(roomId).emit('chat message', msg);
}

function printMessages(roomId) {
    const messages = allMessages[roomId] || { chat1: [], chat2: [] };
    io.to(roomId).emit('print', messages);
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    socket.on('join room', (roomId) => {
        socket.join(roomId);

        // Create initial data structure if it doesn't exist
        if (!allMessages[roomId]) {
            allMessages[roomId] = { chat1: [], chat2: [] };
        }

        sendMessage(roomId, 'chat1', `${socket.id} connected`, 'system');

        printMessages(roomId);

        socket.on('chat message', (data) => {
            // Data: { chat: "chat1" | "chat2", text: "..." }
            if (!data || !data.text || !data.chat) return;

            // Allow for basic commands
            if (data.text.startsWith("+") && data.text.length > 1) {
                sendMessage(roomId, "chat2", `${data.text.slice(1)}`, socket.id);
                return;
            }

            sendMessage(roomId, "chat1", `${socket.id}: ${data.text}`, socket.id);
        });

        socket.on('delete message', ({ chat, id }) => {
            if (!chat || !id) return;
            const chatMessages = allMessages[roomId]?.[chat];
            if (chatMessages) {
                allMessages[roomId][chat] = chatMessages.filter(msg => msg.id !== id);
                io.to(roomId).emit('delete message', { chat, id });
            }
        });

        socket.on('disconnect', () => {
            sendMessage(roomId, 'chat1', `${socket.id} disconnected`, 'system');
            printMessages(roomId);

            // Check the number of clients left in the room
            const room = io.sockets.adapter.rooms[roomId];

            // If no clients are left in the room, trigger the 'roomInactive' event
            if (!room || room.length === 0) {
                // Handle the room inactivity here (e.g., delete room, close resources)
                delete allMessages[roomId]; // This removes the roomId entry entirely
            }
        });

    });
});

server.listen(3000, () => {
    console.log("server running at http://localhost:3000");
});
