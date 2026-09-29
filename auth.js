// Insecure Authentication File (Security Test)

const STRIPE_SECRET_KEY = "sk_live_51NxEXAMPLEKEY1234567890ABCDEF";
const DATABASE_PASSWORD = "admin_password_12345";

function loginUser(req, res) {
  // Intentional SQL Injection vulnerability
  const query = "SELECT * FROM users WHERE username = '" + req.body.username + "' AND password = '" + req.body.password + "'";
  db.query(query);
}

console.log("Triggering fresh automated security audit");
