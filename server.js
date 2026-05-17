const express = require('express');
const app = express();
const http = require('http').createServer(app);
// 調整 Socket.io 的 maxHttpBufferSize 允許傳大檔案（影片）
const io = require('socket.io')(http, {
    cors: { origin: "*" },
    maxHttpBufferSize: 1e8 // 放大到 100MB 確保影片傳輸順暢
});

app.use(express.static(__dirname));

io.on('connection', (socket) => {
    console.log('連線成功，新使用者 ID:', socket.id);

    socket.on('join-room', (roomCode) => {
        socket.join(roomCode);
        console.log(`ID: ${socket.id} 已成功加入房間: ${roomCode}`);
    });

    socket.on('share-diary', (data) => {
        console.log(`房間 ${data.roomCode} 的 [${data.userName}] 發布了動態 (含影片)`);
        socket.to(data.roomCode).emit('new-diary-broadcast', data);
    });

    socket.on('disconnect', () => {
        console.log('使用者中斷連線', socket.id);
    });
});

// 這裡配合雲端平台，自動偵測平台給的 Port，本機測試則預設 3000
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`\n🌸 Mini2s 多人連線伺服器已成功啟動！正在監聽 Port ${PORT}`);
});