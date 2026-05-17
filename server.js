const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e8 // 放大傳輸限制（100MB），確保大片/高畫質影片傳得過去
});

app.use(express.static(__dirname + '/'));

// 後端記憶體資料庫
let dateDB = {}; 
let roomMembers = {}; // 記錄每個房間在線上的 socket 名單 { roomCode: [ {socketId, userName, avatar}, ... ] }

io.on('connection', (socket) => {
  console.log(`🟢 新增一個連線設備: [SocketID: ${socket.id}]`);

  // 1. 處理多房加入
  socket.on('join-multiple-rooms', (data) => {
    const { rooms, userName, avatar } = data;
    if (!rooms || !Array.isArray(rooms)) return;

    rooms.forEach(roomCode => {
      socket.join(roomCode);

      if (!roomMembers[roomCode]) roomMembers[roomCode] = [];
      // 避免重複加入
      roomMembers[roomCode] = roomMembers[roomCode].filter(m => m.socketId !== socket.id);
      roomMembers[roomCode].push({ socketId: socket.id, userName, avatar });

      // 廣播給該房間所有人（更新成員名單）
      io.to(roomCode).emit('room-members-update', {
        roomCode: roomCode,
        members: roomMembers[roomCode]
      });
    });
    console.log(`🏡 【${userName}】成功進入房間列表: [${rooms.join(', ')}]`);
  });

  // 2. 處理發布日記（核心同步修正）
  socket.on('share-diary', (data) => {
    const { roomCode, userName, date, hour, text, avatar, video, region } = data;
    
    console.log(`🕒 收到同步請求 -> 房間: [${roomCode}], 使用者: [${userName}], 時段: [${hour}]`);

    // 防禦機制：如果後端這層結構不存在，自動建立它，絕對不允許噴錯卡死
    if (!dateDB[date]) dateDB[date] = {};
    if (!dateDB[date][hour]) dateDB[date][hour] = {};
    if (!dateDB[date][hour][roomCode]) dateDB[date][hour][roomCode] = {};

    // 存入後端記憶體
    dateDB[date][hour][roomCode][userName] = {
      text, avatar, video, region,
      timeStart: 0, yAlign: 50
    };

    // 關鍵廣播：使用 io.to() 確保全房間（包含上傳者自己、以及所有跨裝置的朋友）同步收到
    io.to(roomCode).emit('new-diary-broadcast', data);
    console.log(`🚀 [成功廣播] 已將 【${userName}】的動態推播給房間 [${roomCode}] 的所有裝置！`);
  });

  // 3. 處理更換未上傳狀態
  socket.on('change-room-empty-status', (data) => {
    // 收到後直接全房間廣播同步
    io.to(data.roomCode).emit('update-room-empty-status', data);
  });

  // 4. 斷線外掛清理
  socket.on('disconnect', () => {
    console.log(`🔴 設備中斷連線: [SocketID: ${socket.id}]`);
    Object.keys(roomMembers).forEach(roomCode => {
      roomMembers[roomCode] = roomMembers[roomCode].filter(m => m.socketId !== socket.id);
      io.to(roomCode).emit('room-members-update', {
        roomCode: roomCode,
        members: roomMembers[roomCode]
      });
    });
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`🚀 終極日記伺服器已成功在 Port ${PORT} 啟動！`);
});
