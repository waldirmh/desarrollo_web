const admin = require('firebase-admin');
const API_KEY = require('./path/keydesarrolloweb.json');

admin.initializeApp({
  credential: admin.credential.cert(API_KEY)
});

const db = admin.firestore();

module.exports = db;