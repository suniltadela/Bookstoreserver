const mongoose = require('mongoose');

const signupschema = new mongoose.Schema({
    name: {
        type: String,
        required: true, // Marking name as required
    },
    email: {
        type: String,
        required: true, // Marking email as required
        unique: true, // Ensuring email is unique
    },
    password: {
        type: String,
        required: true, // Password is already required
    },
    age: {
        type: Number,
        required: true, // Marking age as required
    },
    gender: {
        type: String,
        required: true, // Marking gender as required
    },
    profilepic: {
        type: String,
        required: false // Profile picture is optional
    },
    verified: {
        type: Boolean,
        required: true, // Verified is already required
        default: false // Default value for verified
    }
});

const Signup = mongoose.model('Signup', signupschema);
module.exports = Signup;
