const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

app.use(express.static(__dirname));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

const roomUsers = {};

io.on('connection', (socket) => {
    socket.on('join-multiple-rooms', (data) => {
        const { rooms, userName, avatar } = data;
        if (!rooms || !Array.isArray(rooms) || !userName) return;
        for (const rCode in roomUsers) {
            if (roomUsers[rCode][socket.id]) {
                delete roomUsers[rCode][socket.id];
                socket.leave(rCode);
                io.to(rCode).emit('room-members-update', { roomCode: rCode, members: Object.values(roomUsers[rCode]) });
            }
        }
        rooms.forEach(rCode => {
            if (!rCode) return;
            if (!roomUsers[rCode]) roomUsers[rCode] = {};
            roomUsers[rCode][socket.id] = { userName, avatar };
            socket.join(rCode);
            io.to(rCode).emit('room-members-update', { roomCode: rCode, members: Object.values(roomUsers[rCode]) });
        });
    });

    socket.on('get-room-members', (data) => {
        const { roomCode } = data;
        if (roomCode && roomUsers[roomCode]) {
            socket.emit('room-members-update', { roomCode: roomCode, members: Object.values(roomUsers[roomCode]) });
        }
    });

    socket.on('exit-room', (data) => {
        const { roomCode } = data;
        if (roomCode && roomUsers[roomCode] && roomUsers[roomCode][socket.id]) {
            delete roomUsers[roomCode][socket.id];
            socket.leave(roomCode);
            io.to(roomCode).emit('room-members-update', { roomCode: roomCode, members: Object.values(roomUsers[roomCode]) });
        }
    });

    socket.on('share-diary', (data) => {
        const { roomCode } = data;
        if (roomCode) io.to(roomCode).emit('new-diary-broadcast', data);
    });

    socket.on('change-room-empty-status', (data) => {
        const { roomCode, statusText } = data;
        if (roomCode && statusText) io.to(roomCode).emit('update-room-empty-status', { roomCode, statusText });
    });

    socket.on('disconnect', () => {
        for (const rCode in roomUsers) {
            if (roomUsers[rCode][socket.id]) {
                delete roomUsers[rCode][socket.id];
                if (Object.keys(roomUsers[rCode]).length === 0) {
                    delete roomUsers[rCode];
                } else {
                    io.to(rCode).emit('room-members-update', { roomCode: rCode, members: Object.values(roomUsers[rCode]) });
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {});
