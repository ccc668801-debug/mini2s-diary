const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8 // 100MB 限制
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 格式：{ roomCode: { socketId: { userName, avatar } } }
const roomUsers = {};

io.on('connection', (socket) => {
    console.log(`🟢 使用者連線: ${socket.id}`);

    // 當使用者上傳或同步一整組房間清單時
    socket.on('join-multiple-rooms', (data) => {
        const { rooms, userName, avatar } = data;
        if (!rooms || !Array.isArray(rooms) || !userName) return;

        // 先清理該連線原本在所有房間裡的紀錄
        for (const rCode in roomUsers) {
            if (roomUsers[rCode][socket.id]) {
                delete roomUsers[rCode][socket.id];
                socket.leave(rCode);
                io.to(rCode).emit('room-members-update', { roomCode: rCode, members: Object.values(roomUsers[rCode]) });
            }
        }

        // 重新依序加入新列表中的所有群組房
        rooms.forEach(rCode => {
            if (!rCode) return;
            if (!roomUsers[rCode]) {
                roomUsers[rCode] = {};
            }
            roomUsers[rCode][socket.id] = { userName, avatar };
            socket.join(rCode);

            // 分別對各房發送成員名單更新
            io.to(rCode).emit('room-members-update', { roomCode: rCode, members: Object.values(roomUsers[rCode]) });
        });
    });

    // 要求特定房間的成員名單
    socket.on('get-room-members', (data) => {
        const { roomCode } = data;
        if (roomCode && roomUsers[roomCode]) {
            socket.emit('room-members-update', { roomCode: roomCode, members: Object.values(roomUsers[roomCode]) });
        }
    });

    // 成員手動退出單一房間
    socket.on('exit-room', (data) => {
        const { roomCode } = data;
        if (roomCode && roomUsers[roomCode] && roomUsers[roomCode][socket.id]) {
            delete roomUsers[roomCode][socket.id];
            socket.leave(roomCode);
            io.to(roomCode).emit('room-members-update', { roomCode: roomCode, members: Object.values(roomUsers[roomCode]) });
        }
    });

    // 轉發某一房間的日記內容
    socket.on('share-diary', (data) => {
        const { roomCode } = data;
        if (!roomCode) return;
        io.to(roomCode).emit('new-diary-broadcast', data);
    });

    // 變更某一房間的未上傳客製化文字
    socket.on('change-room-empty-status', (data) => {
        const { roomCode, statusText } = data;
        if (!roomCode || !statusText) return;
        io.to(roomCode).emit('update-room-empty-status', { roomCode, statusText });
    });

    // 全域斷線安全清除機制
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
        console.log(`🔴 使用者斷線清理完成: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 多房連線同步伺服器啟動於 Port: ${PORT}`);
});
