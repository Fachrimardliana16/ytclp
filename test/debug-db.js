const express = require('express');
const app = express();
app.use(express.json());
const db = require('../db');

app.post('/reg', async (req, res) => {
  const crypto = require('crypto');
  const api_key = 'yc_' + crypto.randomBytes(24).toString('hex');
  const user = await db.insert('users', { email: 'x@x.com', api_key, plan: 'free', credits: 10 });
  console.log('insert user.api_key:', user.api_key);
  console.log('insert user keys:', Object.keys(user));
  res.json({ user });
});

app.get('/key/:key', async (req, res) => {
  const user = await db.findBy('users', 'api_key', req.params.key);
  console.log('findBy result:', JSON.stringify(user));
  console.log('findBy api_key:', user?.api_key);
  res.json({ apiKey: user?.api_key, plan: user?.plan });
});

app.listen(3002, () => console.log('debug on 3002'));
