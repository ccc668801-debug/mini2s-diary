const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8 // 擴大傳輸上限至 100MB，確保大頭貼與短片 Base64 傳輸順暢
});

// 靜態網頁檔案路由（會直接讀取同一個資料夾底下的 index.html）
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 儲存每個房間目前成員的記憶體資料庫
// 格式：{ roomCode: { socketId: { userName, avatar } } }
const roomUsers = {};

io.on('connection', (socket) => {
    console.log(`🟢 使用者連線: ${socket.id}`);

    // 當使用者加入房間或更新個人資料時
    socket.on('join-room-with-profile', (data) => {
        const { roomCode, userName, avatar } = data;
        
        // 1. 先讓 Socket 離開之前可能待過的其他房間
        for (const room in roomUsers) {
            if (roomUsers[room][socket.id]) {
                delete roomUsers[room][socket.id];
                socket.leave(room);
                // 廣播舊房間成員更新
                io.to(room).emit('room-members-update', Object.values(roomUsers[room]));
            }
        }

        // 2. 如果沒輸入房間代碼或名字，就不執行加入
        if (!roomCode || !userName) return;

        // 3. 初始化並加入新房間
        if (!roomUsers[roomCode]) {
            roomUsers[roomCode] = {};
        }
        
        // 將成員資訊存入該房間
        roomUsers[roomCode][socket.id] = { userName, avatar };
        socket.join(roomCode);
        console.log(`🏠 [${roomCode}] ${userName} 已進入房間`);

        // 4. 廣播通知該房間內的所有人，更新目前成員名單
        io.to(roomCode).emit('room-members-update', Object.values(roomUsers[roomCode]));
    });

    // 當使用者發布新的日常動態（時段影片）
    socket.on('share-diary', (data) => {
        const { roomCode } = data;
        if (!roomCode) return;
        
        // 把這份動態原封不動廣播給房間內的所有人（包含發布者自己）
        io.to(roomCode).emit('new-diary-broadcast', data);
        console.log(`🎬 [${roomCode}] ${data.userName} 發布了 ${data.hour} 的動態`);
    });

    // 💥 連線同步核心：當有人從房間管理更改「未上傳狀態」時
    socket.on('change-room-empty-status', (data) => {
        const { roomCode, statusText } = data;
        if (!roomCode || !statusText) return;

        // 立刻將這個新狀態同步廣播給該房間裡面的所有人
        io.to(roomCode).emit('update-room-empty-status', statusText);
        console.log(`🎨 [${roomCode}] 未上傳狀態被更換為: ${statusText}`);
    });

    // 當使用者斷線時的清理機制
    socket.on('disconnect', () => {
        console.log(`🔴 使用者斷線: ${socket.id}`);
        
        for (const room in roomUsers) {
            if (roomUsers[room][socket.id]) {
                const leftUser = roomUsers[room][socket.id].userName;
                delete roomUsers[room][socket.id];
                
                // 如果房間空了就直接刪除房間
                if (Object.keys(roomUsers[room]).length === 0) {
                    delete roomUsers[room];
                } else {
                    // 如果還有其他人，通知大家更新名單
                    io.to(room).emit('room-members-update', Object.values(roomUsers[room]));
                }
                console.log(`🚪 [${room}] ${leftUser} 已離開房間`);
                break;
            }
        }
    });
});

// 啟動伺服器，連接埠優先使用 Render 環境變數，本機測試則預設 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 終極日記伺服器已啟動！環境通訊埠：${PORT}`);
});
