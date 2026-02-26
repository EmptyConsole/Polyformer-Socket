const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

/*
  ROOMS STRUCTURE:
  rooms = {
    roomName: {
      players: {
        socketId: { x, y, angle }
      }
    }
  }
*/
// Use a null-prototype object to reduce prototype-pollution risks
let rooms = Object.create(null);

function isValidRoomName(name) {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name !== "__proto__" &&
    name !== "constructor"
  );
}

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // Send current room list
  socket.emit("rooms_list", rooms);

  // ------------------------------
  // PLAYER CREATES A ROOM
  // ------------------------------
  socket.on("create_room", (roomName) => {
    if (!isValidRoomName(roomName)) return;

    if (!rooms[roomName]) {
      rooms[roomName] = { players: {} };
      console.log(`Room created: ${roomName}`);
    }

    joinRoom(socket, roomName);
  });

  // ------------------------------
  // PLAYER JOINS A ROOM
  // ------------------------------
  socket.on("join_room", (roomName) => {
    if (!isValidRoomName(roomName)) return;
    if (!rooms[roomName]) return; // room must exist

    joinRoom(socket, roomName);
  });

  // ------------------------------
  // PLAYER UPDATES MOVEMENT
  // ------------------------------
  socket.on("updateData", (data) => {
    let roomName = socket.roomName;
    if (!roomName) return;

    let room = rooms[roomName];
    if (!room) return;

    if (room.players[socket.id]) {
      room.players[socket.id] = {...data};

      // Send update to players IN THIS ROOM ONLY
      // socket.to(roomName).emit("update", {
      //   id: socket.id,
      //   x: data.x,
      //   y: data.y,
      //   angle: data.angle,
      //   cRoom: data.cRoom
      // });
      socket.to(roomName).emit("update", {
        id: socket.id,
        playerData: {...data}
      });
    }
  });

  // ------------------------------
  // DISCONNECT HANDLING
  // ------------------------------
  socket.on("disconnect", () => {
    console.log(`Player disconnected: ${socket.id}`);

    let roomName = socket.roomName;
    if (!roomName || !rooms[roomName]) return;

    // Remove from room
    delete rooms[roomName].players[socket.id];
    socket.to(roomName).emit("removePlayer", socket.id);

    // Delete room if empty
    if (Object.keys(rooms[roomName].players).length === 0) {
      delete rooms[roomName];
      console.log(`Room deleted: ${roomName}`);
    }

    // Update rooms list for lobby clients
    io.emit("rooms_list", rooms);
  });
});

// ==================================================
// HELPER: Handle joining + initial state
// ==================================================
function joinRoom(socket, roomName) {
  // If the socket was in another room, remove it cleanly first
  //idk if this is nescesary:
  if (socket.roomName && socket.roomName !== roomName) {
    const prev = socket.roomName;
    try {
      socket.leave(prev);
    } catch (e) {}

    if (rooms[prev] && rooms[prev].players && rooms[prev].players[socket.id]) {
      delete rooms[prev].players[socket.id];
      socket.to(prev).emit("removePlayer", socket.id);

      if (Object.keys(rooms[prev].players).length === 0) {
        delete rooms[prev];
        console.log(`Room deleted: ${prev}`);
      }

      // Update lobby about the room change
      io.emit("rooms_list", rooms);
    }
  }

  //good after here
  socket.join(roomName);
  socket.roomName = roomName;

  // Create new player inside this specific room
  rooms[roomName].players[socket.id] = {
    x: 0,
    y: 0,
    cRoom: roomName
  };

  // Send existing players in this room to the newcomer
  socket.emit("initialState", rooms[roomName].players);

  // Tell others in this room about the newcomer
  socket.to(roomName).emit("newPlayer", {
    id: socket.id,
    x: 0,
    y: 0,
    cRoom: roomName
  });

  // Update rooms list for lobby
  io.emit("rooms_list", rooms);

  console.log(`Player ${socket.id} joined room ${roomName}`);
}

http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});