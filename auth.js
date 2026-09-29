// Test file for security scanner
const STRIPE_SECRET_KEY = "sk_live_51NxEXAMPLEKEY1234567890ABCDEF";

function loginUser(req, res) {
  const query = "SELECT * FROM users WHERE username = '" + req.body.username + "'";
  db.query(query);
}
