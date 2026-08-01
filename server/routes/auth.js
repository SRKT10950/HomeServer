const express = require('express');
const authManager = require('../authManager');

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({ supported: true, setupRequired: authManager.isSetupRequired() });
});

router.post('/setup', (req, res) => {
  const { username, password } = req.body;
  try {
    if (!authManager.isSetupRequired()) {
      return res.status(400).json({ error: 'Initial setup has already been completed.' });
    }
    const success = authManager.setupAdmin(username, password);
    if (success) {
      res.json({ success: true, message: 'Administrator account created successfully.' });
    } else {
      res.status(500).json({ error: 'Failed to save admin credentials.' });
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  try {
    const result = authManager.login(username, password);
    if (result.success) {
      res.json({ success: true, token: result.token });
    } else {
      res.status(401).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  if (token) {
    authManager.logout(token);
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

module.exports = router;
