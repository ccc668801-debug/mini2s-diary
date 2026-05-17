const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e8
});

app.use(express.static(__dirname + '/'));

let dateDB = {}; 
let roomMembers = {}; // 儲存格式: { roomCode: [ {socketId, userName, avatar, seatNo}, ... ] }

io.on('connection', (socket) => {
  console.log(`🟢 新增連線: [SocketID: ${socket.id}]`);

  // 處理進入房間並分發固定座位號碼 (1 ~ 4)
  socket.on('join-multiple-rooms', (data) => {
    const { rooms, userName, avatar } = data;
    if (!rooms || !Array.isArray(rooms)) return;

    rooms.forEach(roomCode => {
      socket.join(roomCode);

      if (!roomMembers[roomCode]) roomMembers[roomCode] = [];
      
      // 檢查此 socket 是否已經在房間內
      let existing = roomMembers[roomCode].find(m => m.socketId === socket.id);
      
      if (!existing) {
        // 找出目前還沒被佔用的最小座位號碼 (1, 2, 3, 4)
        let occupiedSeats = roomMembers[roomCode].map(m => m.seatNo);
        let assignedSeat = 1;
        for (let s = 1; s <= 4; s++) {
          if (!occupiedSeats.includes(s)) {
            assignedSeat = s;
            break;
          }
        }
        
        roomMembers[roomCode].push({
          socketId: socket.id,
          userName,
          avatar,
          seatNo: assignedSeat // 綁定固定座位
        });
      } else {
        // 如果只是更新資料，保留原本座位
        existing.userName = userName;
        existing.avatar = avatar;
      }

      // 廣播給該房間所有人更新名單
      io.to(roomCode).emit('room-members-update', {
        roomCode: roomCode,
        members: roomMembers[roomCode]
      });
    });
    
    // 印出目前房間的座位分配狀況
    console.log(`🏡 房間 [${rooms.join(', ')}] 目前座位分佈:`, roomMembers[rooms[0]]);
  });

  // 處理發布日記
  socket.on('share-diary', (data) => {
    const { roomCode, userName, date, hour, text, avatar, video, region } = data;
    
    if (!dateDB[date]) dateDB[date] = {};
    if (!dateDB[date][hour]) dateDB[date][hour] = {};
    if (!dateDB[date][hour][roomCode]) dateDB[date][hour][roomCode] = {};

    dateDB[date][hour][roomCode][userName] = {
      text, avatar, video, region,
      timeStart: 0, yAlign: 50
    };

    io.to(roomCode).emit('new-diary-broadcast', data);
    console.log(`🚀 已廣播 【${userName}】的日常動態給房號 [${roomCode}]`);
  });

  // 處理更換未上傳狀態
  socket.on('change-room-empty-status', (data) => {
    io.to(data.roomCode).emit('update-room-empty-status', data);
  });

  // 斷線清理座位
  socket.on('disconnect', () => {
    console.log(`🔴 設備中斷: [SocketID: ${socket.id}]`);
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
  console.log(`🚀 伺服器已在 Port ${PORT} 啟動！`);
});
