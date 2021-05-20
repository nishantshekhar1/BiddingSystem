module.exports = {
  // App Settings
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost/newdb',
  TOKEN_SECRET: process.env.TOKEN_SECRET || 'YOUR_UNIQUE_JWT_TOKEN_SECRET',

  // OAuth 2.0
  FACEBOOK_SECRET: process.env.FACEBOOK_SECRET,
  GOOGLE_SECRET: process.env.GOOGLE_SECRET

};
