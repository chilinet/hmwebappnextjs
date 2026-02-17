# E-Mail API Tests for HeatManager

## 📋 **Overview**

These test scripts let you test all HeatManager e-mail APIs without using the web interface.

## 🚀 **Quick Start**

### **Option 1: Simple Test (Recommended)**

```bash
# 1. Set session token
# Open simple-email-test.js and set SESSION_TOKEN

# 2. Run test
node simple-email-test.js
```

### **Option 2: Full Test**

```bash
# 1. Install dependencies
npm install node-fetch

# 2. Set session token
# Open test-email-api.js and set SESSION_TOKEN

# 3. Run test
node test-email-api.js
```

## 🔑 **Getting a Session Token**

### **Method 1: Browser Developer Tools**

1. **Go to `/admin/email-test`**
2. **Open Developer Tools (F12)**
3. **Go to "Application" → "Cookies"**
4. **Look for `next-auth.session-token`**
5. **Copy the value**

### **Method 2: Browser Console**

```javascript
// Run in the browser console
document.cookie.split(';').find(c => c.trim().startsWith('next-auth.session-token=')).split('=')[1]
```

### **Method 3: Network Tab**

1. **Open Developer Tools (F12)**
2. **Go to "Network"**
3. **Reload the page**
4. **Find a request**
5. **Copy the cookie value**

## 📝 **Configuration**

### **Setting the Session Token**

**In `simple-email-test.js`:**
```javascript
const SESSION_TOKEN = 'your_actual_session_token_here';
```

**In `test-email-api.js`:**
```javascript
const SESSION_TOKEN = 'your_actual_session_token_here';
```

### **Changing the E-Mail Address**

**In both files:**
```javascript
const testEmail = {
  to: 'your_actual_email@your-domain.com', // Change here
  subject: 'Test E-Mail - HeatManager',
  text: 'This is a test e-mail from HeatManager.',
  html: '<h1>Test E-Mail</h1><p>This is a <strong>test e-mail</strong> from HeatManager.</p>'
};
```

## 🧪 **Available Tests**

### **1. OAuth2 Helper**
- **Endpoint**: `/api/email/send-oauth2`
- **Description**: Uses the improved OAuth2 helper
- **Requirements**: All OAuth2 environment variables set

### **2. Simple OAuth2**
- **Endpoint**: `/api/email/send-simple-oauth2`
- **Description**: New simple OAuth2 API
- **Requirements**: All OAuth2 environment variables set

### **3. App Password**
- **Endpoint**: `/api/email/send-app-password`
- **Description**: Simple SMTP authentication
- **Requirements**: `SMTP_USER` and `SMTP_PASS` set

## 📊 **Interpreting Test Results**

### **Successful test:**
```json
{
  "success": true,
  "status": 200,
  "data": {
    "success": true,
    "message": "Email sent successfully",
    "messageId": "abc123...",
    "method": "App Password"
  }
}
```

### **Failed test:**
```json
{
  "success": false,
  "status": 400,
  "data": {
    "error": "Missing OAuth2 environment variables",
    "missing": ["OAUTH_TENANT_ID", "OAUTH_CLIENT_ID"]
  }
}
```

## 🔧 **Troubleshooting**

### **Error: "Session token missing"**
- Check that you are logged in
- Copy the token from the browser cookies
- Make sure the token is valid

### **Error: "Unauthorized"**
- Session token has expired
- Log in again
- Copy the new token

### **Error: "Missing environment variables"**
- Check your `.env` file
- Make sure all required variables are set
- Restart the application after making changes

### **Error: "OAuth2 token request failed"**
- Authorization code has expired
- Obtain a new authorization code
- Update `OAUTH_AUTHORIZATION_CODE` in `.env`

## 📱 **Alternative: cURL Tests**

### **OAuth2 test:**
```bash
curl -X POST http://localhost:3000/api/email/send-simple-oauth2 \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=your_token" \
  -d '{
    "to": "test@example.com",
    "subject": "Test E-Mail",
    "text": "This is a test e-mail"
  }'
```

### **App Password test:**
```bash
curl -X POST http://localhost:3000/api/email/send-app-password \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=your_token" \
  -d '{
    "to": "test@example.com",
    "subject": "Test E-Mail",
    "text": "This is a test e-mail"
  }'
```

## 🎯 **Recommendations**

1. **Start with App Password** – easier to configure
2. **Test OAuth2** only after full configuration
3. **Use real e-mail addresses** for testing
4. **Check server logs** when you have issues
5. **Test regularly** after configuration changes

## 📞 **Support**

If you run into problems:
1. Check the server logs
2. Test the connection via the web interface
3. Verify all environment variables
4. Make sure the application is running

**Good luck with testing!** 🚀✨
