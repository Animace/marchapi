const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const UserSchema = new Schema({
    username: { type: String, required: true, min: 4, unique: true },
    password: { type: String, required: true },
});

// Provide both the name and the schema to the model function
const UserModel = model('User', UserSchema);

module.exports = UserModel;

