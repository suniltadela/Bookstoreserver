const express = require('express');
const bodyParser = require('body-parser');
const signup = require('../schemas/signupschema/signupschema');
const bcrypt = require('bcrypt');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const cookieParser = require('cookie-parser');
require('../db');
require('dotenv').config();

const app = express();

// Define CORS options
const corsOptions = {
    origin: [process.env.BASE_URL], // Your frontend URL
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization',
    preflightContinue: false,
    optionsSuccessStatus: 204,
};

// Apply CORS middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

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

// Twilio client for sending SMS
const twilioClient = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Function to format phone numbers
function formatPhoneNumber(phoneNumber, countryCode = 'IN') {
    const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();
    try {
        const number = phoneUtil.parse(phoneNumber, countryCode);
        if (phoneUtil.isValidNumber(number)) {
            return phoneUtil.format(number, require('google-libphonenumber').PhoneNumberFormat.E164);
        }
    } catch (error) {}
    return null;
}

// Function to generate OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000); // Generate a 6-digit OTP
}

// Route to send OTP for forgot password (email or phone)
app.post('/forgot-password', async (req, res) => {
    try {
        const { identifier } = req.body;
        let user;

        if (identifier.includes('@')) {
            user = await signup.findOne({ email: identifier });
        } else {
            user = await signup.findOne({ phone: identifier });
        }

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Send OTP via email or SMS based on identifier type
        if (identifier.includes('@')) {
            const otp = generateOTP();
            user.resetPasswordOTP = otp;
            await user.save();

            const mailOptions = {
                from: process.env.TRANSPORT_EMAIL,
                to: identifier,
                subject: 'Forgot Password OTP for Bookstore',
                text: `Your OTP for password reset is: ${otp}`
            };

            transporter.sendMail(mailOptions, (error) => {
                if (error) {
                    return res.status(500).send(error.toString());
                }
                res.status(200).json({ message: 'OTP sent to your email for password reset' });
            });
        } else {
            twilioClient.verify.services(process.env.TWILIO_VERIFY_SERVICE_SID)
                .verifications
                .create({ to: identifier, channel: 'sms' })
                .then(() => {
                    res.status(200).json({ message: 'OTP sent to your phone for password reset' });
                })
                .catch((error) => {
                    res.status(500).send('Error sending OTP via SMS');
                });
        }
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Route to verify OTP for password reset
app.post('/verify-otp', async (req, res) => {
    try {
        const { identifier, otp } = req.body;
        let user;

        if (identifier.includes('@')) {
            user = await signup.findOne({ email: identifier });
        } else {
            user = await signup.findOne({ phone: identifier });
        }

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!user.resetPasswordOTP || user.resetPasswordOTP !== otp) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        res.status(200).json({ message: 'OTP verified successfully. Proceed to reset your password.' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Route to update password after verifying OTP
app.post('/update-password', async (req, res) => {
    try {
        const { identifier, otp, newPassword } = req.body;
        let user;

        if (identifier.includes('@')) {
            user = await signup.findOne({ email: identifier });
        } else {
            user = await signup.findOne({ phone: identifier });
        }

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.resetPasswordOTP !== otp) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        user.password = hashedPassword;
        user.resetPasswordOTP = undefined;
        user.verified = true;

        await user.save();
        res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Route to signup
app.post('/signup', async (req, res) => {
    try {
        const { name, email, password, age, gender, phone, countryCode } = req.body;
        const fullPhone = `${countryCode}${phone}`;

        const existingUser = await signup.findOne({ email });
        if (existingUser) {
            return res.status(400).send({ error: 'Email already exists' });
        }

        const existingPhone = await signup.findOne({ phone: fullPhone });
        if (existingPhone) {
            return res.status(400).send({ error: 'Phone number already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const signupDetail = new signup({
            name,
            email,
            password: hashedPassword,
            age,
            gender,
            phone: fullPhone,
            verified: false,
        });

        const verificationToken = jwt.sign({ email }, process.env.VERFICATION_JWT, { expiresIn: '1h' });

        const mailOptions = {
            from: process.env.TRANSPORT_EMAIL,
            to: email,
            subject: 'Email Verification for Bookstore',
            text: `Please verify your email by clicking the link: https://bookstoreserver-five.vercel.app/verify/${verificationToken}`,
        };

        transporter.sendMail(mailOptions, async (error) => {
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
        res.status(500).send({ error: 'Internal server error' });
    }
});

// Route to verify email
app.get('/verify/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const decoded = jwt.verify(token, process.env.VERFICATION_JWT);

        const { email } = decoded;
        const existingUser = await signup.findOne({ email });

        if (!existingUser) {
            return res.status(400).send('Invalid verification link.');
        }

        if (existingUser.verified) {
            return res.status(400).send('User already verified.');
        }

        existingUser.verified = true;
        await existingUser.save();

        res.send('Email verified successfully!');
    } catch (error) {
        res.status(400).send('Invalid or expired verification link.');
    }
});

// Route to login
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const existingUser = await signup.findOne({ email });

        if (!existingUser) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        if (!existingUser.verified) {
            return res.status(401).json({ message: 'Email not verified. Please check your email.' });
        }

        const isPasswordCorrect = await bcrypt.compare(password, existingUser.password);
        if (!isPasswordCorrect) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const accessToken = jwt.sign({ id: existingUser._id }, process.env.ACCESS_JWT, { expiresIn: '1hr' });
        const refreshToken = jwt.sign({ id: existingUser._id }, process.env.REFRESH_JWT);

        existingUser.refreshToken = refreshToken;
        await existingUser.save();

        res.cookie('refreshtoken', refreshToken, { httpOnly: true, path: '/refresh_token' });

        res.status(200).json({
            accessToken,
            refreshToken,
            message: 'User logged in'
        });
    } catch (err) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Default route
app.get('/', (req, res) => {
    res.send('Hello, world!');
});

app.get('/check', (req, res) => {
    res.send('Get working good');
});

module.exports = app;
