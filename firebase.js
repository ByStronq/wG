const config = require('./config.json');

var admin = require("firebase-admin");

var serviceAccount = require("./firebase.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: config.firebaseDbUrl
});

module.exports = {
    db: admin.database()
};