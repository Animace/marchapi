const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const helmet = require('helmet'); // Import helmet for security headers

const User = require('./models/User');
const Post = require('./models/Post');

const app = express();
const uploadMiddleware = multer({ dest: 'uploads/' });
const salt = bcrypt.genSaltSync(10);
const secret = process.env.JWT_SECRET || '5225sdgsdfgsf'; // Use environment variable for secret

// Specify the allowed origin
const allowedOrigins = ['http://localhost:3000']; // Add more origins as needed
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(helmet()); // Add helmet middleware for security headers
app.use('/uploads', express.static(__dirname + '/uploads'));

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/myapp'); // Use environment variable for database connection string

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});
app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        if (!username || !password) {
            throw new Error('Username or password is missing');
        }

        const hashedPassword = bcrypt.hashSync(password, salt);

        const userDoc = await User.create({
            username,
            password: hashedPassword,
        });

        console.log('New user registered:', userDoc);
        res.json(userDoc);
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(400).json({ error: 'Failed to register user' });
    }
});


app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const userDoc = await User.findOne({ username });
        if (!userDoc) {
            console.error('User not found:', username);
            return res.status(400).json('User not found');
        }
        const passOk = bcrypt.compareSync(password, userDoc.password);
        if (passOk) {
            //logged in
            jwt.sign({ username, id: userDoc._id }, secret, {}, (err, token) => {
                if (err) throw err;
                console.log('User logged in:', username);
                res.cookie('token', token).json({
                    id: userDoc._id,
                    username,
                });
            });
        } else {
            console.error('Incorrect password for user:', username);
            res.status(400).json('Incorrect password');
        }
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json('Internal Server Error');
    }
});

app.get('/profile', (req, res) => {
    const { token } = req.cookies;
    if (!token) {
        console.error('Unauthorized: Token missing');
        return res.status(401).json({ message: 'Unauthorized: Token missing' });
    }
    jwt.verify(token, secret, {}, (err, info) => {
        if (err) {
            console.error('Unauthorized: Invalid token');
            if (err.name === 'JsonWebTokenError') {
                return res.status(401).json({ message: 'Unauthorized: Invalid token' });
            }
            return res.status(500).json({ message: 'Internal Server Error' });
        }
        console.log('User profile accessed:', info.username);
        res.json(info);
    });
});

app.post('/logout', (req, res) => {
    console.log('User logged out');
    res.cookie('token', '').json('ok');
});

app.post('/post', uploadMiddleware.single('file'), async (req, res) => {
    const { originalname, path } = req.file || {};
    if (!originalname) {
        return res.status(400).json({ error: 'File or originalname is missing' });
    }
    const parts = originalname.split('.');
    const ext = parts[parts.length - 1];
    const newPath = path + '.' + ext;
    fs.renameSync(path, newPath);

    const { token } = req.cookies;
    jwt.verify(token, secret, {}, async (err, info) => {
        if (err) throw err;
        const { title, summary, content } = req.body;
        const postDoc = await Post.create({
            title,
            summary,
            content,
            cover: newPath,
            author: info.id,
        });
        res.json({ postDoc });
    });
});

app.put('/post', uploadMiddleware.single('file'), async (req, res) => {
    let newPath = null;
    if (req.file) {
        const { originalname, path } = req.file || {};
        const parts = originalname.split('.');
        const ext = parts[parts.length - 1];
        newPath = path + '.' + ext;
        fs.renameSync(path, newPath);
    }
    const { token } = req.cookies;
    jwt.verify(token, secret, {}, async (err, info) => {
        if (err) throw err;

        const { id, title, summary, content } = req.body;
        const postDoc = await Post.findById(id);

        if (!postDoc) {
            return res.status(404).json('Post not found');
        }

        const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(info.id);

        if (!isAuthor) {
            return res.status(400).json('You are not the author');
        }

        await Post.updateOne({ _id: id }, {
            $set: {
                title,
                summary,
                content,
                cover: newPath ? newPath : postDoc.cover,
            }
        });

        const updatedPost = await Post.findById(id);
        res.json(updatedPost);
    });
});

app.get('/post', async (req, res) => {
    res.json(await Post.find().populate('author', ['username'])
        .sort({ createdAt: -1 })
        .limit(20)
    );
});

app.get('/post/:id', async (req, res) => {
    const { id } = req.params;
    const postDoc = await Post.findById(id).populate('author', ['username']);
    res.json(postDoc);
});

app.listen(4000, () => {
    console.log('Server is running on port 4000');
});
