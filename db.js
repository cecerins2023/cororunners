const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS runners (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE,
        nombre TEXT,
        apellido TEXT,
        cedula TEXT,
        edad INTEGER,
        genero TEXT,
        categoria_edad TEXT,
        telefono TEXT,
        correo TEXT,
        club TEXT,
        talla TEXT,
        referencia TEXT,
        capturePath TEXT,
        categoria TEXT,
        estadoPago TEXT DEFAULT 'Pendiente',
        fechaRegistro DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

module.exports = db;
