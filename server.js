const express = require('express');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// Database setup
const db = new sqlite3.Database(':memory:');

// Initialize database
db.serialize(() => {
  db.run(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
});

// BUG 1: Logic Error - Incorrect password comparison
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  // BUG: Using == instead of === for comparison
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // FIXED: Use bcrypt.compare to properly verify hashed password
    bcrypt.compare(password, user.password, (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Error verifying password' });
      }
      
      if (result) {
        res.json({ message: 'Login successful', user: { id: user.id, username: user.username } });
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    });
  });
});

// FIXED: Performance Issue - Single JOIN query instead of N+1 queries
app.get('/api/posts', (req, res) => {
  // FIXED: Use JOIN to fetch posts and user data in a single query
  db.all(`
    SELECT p.*, u.username 
    FROM posts p 
    LEFT JOIN users u ON p.user_id = u.id 
    ORDER BY p.created_at DESC
  `, (err, posts) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    // Set default username for posts without users
    const postsWithUsers = posts.map(post => ({
      ...post,
      username: post.username || 'Unknown'
    }));
    
    res.json(postsWithUsers);
  });
});

// FIXED: Security Vulnerability - Use parameterized queries to prevent SQL injection
app.get('/api/search', (req, res) => {
  const { query } = req.query;
  
  if (!query) {
    return res.status(400).json({ error: 'Query parameter is required' });
  }
  
  // FIXED: Use parameterized queries to prevent SQL injection
  const searchTerm = `%${query}%`;
  const sql = `SELECT * FROM posts WHERE title LIKE ? OR content LIKE ?`;
  
  db.all(sql, [searchTerm, searchTerm], (err, posts) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    res.json(posts);
  });
});

// User registration endpoint
app.post('/api/register', (req, res) => {
  const { username, email, password } = req.body;
  
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  // Hash password
  const saltRounds = 10;
  bcrypt.hash(password, saltRounds, (err, hashedPassword) => {
    if (err) {
      return res.status(500).json({ error: 'Error hashing password' });
    }
    
    db.run(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword],
      function(err) {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(400).json({ error: 'Username or email already exists' });
          }
          return res.status(500).json({ error: 'Database error' });
        }
        
        res.json({ message: 'User registered successfully', userId: this.lastID });
      }
    );
  });
});

// Create sample data
app.post('/api/seed', (req, res) => {
  const sampleUsers = [
    { username: 'john_doe', email: 'john@example.com', password: 'password123' },
    { username: 'jane_smith', email: 'jane@example.com', password: 'password456' }
  ];
  
  const samplePosts = [
    { user_id: 1, title: 'First Post', content: 'This is my first post!' },
    { user_id: 2, title: 'Hello World', content: 'Welcome to my blog!' },
    { user_id: 1, title: 'Another Post', content: 'This is another post by John.' }
  ];
  
  let completed = 0;
  const total = sampleUsers.length + samplePosts.length;
  
  sampleUsers.forEach(user => {
    bcrypt.hash(user.password, 10, (err, hashedPassword) => {
      if (err) return;
      
      db.run(
        'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
        [user.username, user.email, hashedPassword],
        () => {
          completed++;
          if (completed === total) {
            res.json({ message: 'Sample data created successfully' });
          }
        }
      );
    });
  });
  
  samplePosts.forEach(post => {
    db.run(
      'INSERT INTO posts (user_id, title, content) VALUES (?, ?, ?)',
      [post.user_id, post.title, post.content],
      () => {
        completed++;
        if (completed === total) {
          res.json({ message: 'Sample data created successfully' });
        }
      }
    );
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;