# Bug Fixes Documentation

This document details the 3 critical bugs found and fixed in the codebase.

## Bug 1: Logic Error in User Authentication

### Problem
**Location**: `server.js` lines 35-40 (login endpoint)

**Issue**: The authentication logic had two critical flaws:
1. Used loose equality (`==`) instead of strict equality (`===`)
2. Compared plain text password directly with bcrypt hash instead of using `bcrypt.compare()`

**Code with Bug**:
```javascript
// BUG: Incorrect password comparison - should use bcrypt.compare
if (user.password == password) {
  res.json({ message: 'Login successful', user: { id: user.id, username: user.username } });
} else {
  res.status(401).json({ error: 'Invalid credentials' });
}
```

**Impact**: 
- Users could never log in successfully
- Authentication system was completely broken
- Security vulnerability as password verification was ineffective

**Fix**:
```javascript
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
```

**Why This Fix Works**:
- `bcrypt.compare()` properly compares plain text password with bcrypt hash
- Handles the asynchronous nature of bcrypt operations
- Provides proper error handling

---

## Bug 2: Performance Issue - N+1 Query Problem

### Problem
**Location**: `server.js` lines 70-90 (posts endpoint)

**Issue**: The code was making N+1 database queries:
1. One query to fetch all posts
2. N additional queries (one for each post) to fetch user information

**Code with Bug**:
```javascript
// BUG: This will cause N+1 queries - one for posts, then one for each user
db.all('SELECT * FROM posts ORDER BY created_at DESC', (err, posts) => {
  // BUG: N+1 query problem - fetching user for each post individually
  const postsWithUsers = posts.map(post => {
    db.get('SELECT username FROM users WHERE id = ?', [post.user_id], (err, user) => {
      // ... async callback that doesn't work properly
    });
    return post;
  });
});
```

**Impact**:
- Severe performance degradation
- With 100 posts: 101 database queries instead of 1
- Poor user experience due to slow response times
- Increased database load

**Fix**:
```javascript
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
```

**Why This Fix Works**:
- Single database query using JOIN
- Fetches all required data in one operation
- Maintains data integrity with LEFT JOIN
- Handles missing user data gracefully

---

## Bug 3: Security Vulnerability - SQL Injection

### Problem
**Location**: `server.js` lines 93-111 (search endpoint)

**Issue**: Direct string interpolation of user input into SQL query without proper escaping or parameterization.

**Code with Bug**:
```javascript
// BUG: Direct string interpolation - vulnerable to SQL injection
const sql = `SELECT * FROM posts WHERE title LIKE '%${query}%' OR content LIKE '%${query}%'`;

db.all(sql, (err, posts) => {
  // ...
});
```

**Impact**:
- **Critical Security Vulnerability**
- Attackers could inject malicious SQL code
- Potential data breach (access unauthorized data)
- Data modification or deletion
- Complete database compromise possible

**Example Attack**:
```
Query: "'; DROP TABLE posts; --"
Resulting SQL: SELECT * FROM posts WHERE title LIKE '%'; DROP TABLE posts; --%' OR content LIKE '%'; DROP TABLE posts; --%'
```

**Fix**:
```javascript
// FIXED: Use parameterized queries to prevent SQL injection
const searchTerm = `%${query}%`;
const sql = `SELECT * FROM posts WHERE title LIKE ? OR content LIKE ?`;

db.all(sql, [searchTerm, searchTerm], (err, posts) => {
  if (err) {
    return res.status(500).json({ error: 'Database error' });
  }
  
  res.json(posts);
});
```

**Why This Fix Works**:
- Parameterized queries automatically escape user input
- Database driver handles proper sanitization
- Prevents SQL injection attacks completely
- Maintains query functionality while ensuring security

---

## Testing the Fixes

To test the application:

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the server**:
   ```bash
   npm start
   ```

3. **Open the frontend**: Open `index.html` in a web browser

4. **Test scenarios**:
   - Register a new user
   - Login with the registered user (Bug 1 fix)
   - Create sample data and load posts (Bug 2 fix)
   - Search for posts with various queries (Bug 3 fix)

## Summary

All three bugs have been successfully identified and fixed:

1. ✅ **Authentication Logic Error**: Fixed password comparison using `bcrypt.compare()`
2. ✅ **Performance Issue**: Eliminated N+1 queries using JOIN
3. ✅ **Security Vulnerability**: Prevented SQL injection using parameterized queries

The application is now secure, performant, and functionally correct.