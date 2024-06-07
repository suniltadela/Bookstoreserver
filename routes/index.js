const express = require('express');
const bodyParser = require('body-parser');
const signup = require('../schemas/signupschema/signupschema');
const bcrypt = require('bcrypt');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cookieParser = require('cookie-parser');
require('../db');
require('dotenv').config();
// console.log(process.env.port,process.env.Mongo_url,process.env.VERFICATION_JWT,process.env.REFRESH_JWT,'here')
//finally done something
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.json());
app.use(cookieParser());

// Configure nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.TRANSPORT_EMAIL,
        pass: process.env.TRANSPORT_PASS
    }
});

app.get('/', (req, res) => {
    res.send('Hello, world! server THIS STEP ADDED FOR SOME CHANGE');
});

app.post('/signup', async (req, res) => {
    try {
        const { name, email, password, age, gender } = req.body;
         // Check if the user already exists
         const existingUser = await signup.findOne({ email });
         if (existingUser) {
             return res.status(400).send({ error: 'Email already exists' });
         }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const signupDetail = new signup({ name, email, password: hashedPassword, age, gender, verified: false });

        // Generate a verification token
        const verificationToken = jwt.sign({ email },process.env.VERFICATION_JWT, { expiresIn: '1h' });

        // Send verification email
        const mailOptions = {
            from: process.env.TRANSPORT_EMAIL,
            to: email,
            subject: 'Email Verification for Bookstore',
            text: `Please verify your email by clicking the link: http://localhost:3000/verify/${verificationToken}`
        };

        transporter.sendMail(mailOptions, async (error, info) => {
            if (error) {
                return res.status(500).send(error.toString());
            }

            await signupDetail.save();
            res.status(201).send({
                message: 'Signup successful! Please check your email to verify your account.',
                saveSignupDetails: signupDetail,
            });
        });
    } catch (error) {
        console.error('Error during signup:', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

app.get('/verify/:token', async (req, res) => {
    try {
        const { token } = req.params;
        console.log(`Verification token received: ${token}`); // Log the token received

        const decoded = jwt.verify(token, process.env.VERFICATION_JWT);
        console.log(`Decoded token: ${JSON.stringify(decoded)}`); // Log the decoded token

        const { email } = decoded;
        const existingUser = await signup.findOne({ email });

        if (!existingUser) {
            // console.log('User not found');
            return res.status(400).send('Invalid verification link.');
        }

        if (existingUser.verified) {
            // console.log('User already verified');
            return res.status(400).send('User already verified.');
        }

        existingUser.verified = true;
        await existingUser.save();

        res.send('Email verified successfully!');
    } catch (error) {
        // console.error('Error during email verification:', error);
        res.status(400).send('Invalid or expired verification link.');
    }
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        // console.log('Received email:', email); // Logging received email

        const existingUser = await signup.findOne({ email });

        if (!existingUser) {
            // console.log('User not found');
            return res.status(401).json({ message: 'Invalid email or password' });
        }
// NEED TO WORK ON THIS VERIFY
        // if (!existingUser.verified) {
        //     console.log('User not verified');
        //     return res.status(401).json({ message: 'Email not verified. Please check your email.' });
        // }

        const isPasswordCorrect = await bcrypt.compare(password, existingUser.password);
        if (!isPasswordCorrect) {
            console.log('Incorrect password');
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const accessToken = jwt.sign({ id: existingUser._id }, process.env.ACCESS_JWT, { expiresIn: '1hr' });
        const refreshToken = jwt.sign({ id: existingUser._id }, process.env.REFRESH_JWT);
        existingUser.refreshToken = refreshToken;
        await existingUser.save();

        res.cookie("refreshtoken", refreshToken, { httpOnly: true, path: '/refresh_token' });

        res.status(200).json({
            accessToken,
            refreshToken,
            message: "User logged in"
        });
    } catch (err) {
        console.error('Internal server error:', err);
        res.status(500).json({ message: "Internal server error" });
    }
});



module.exports = app; 
