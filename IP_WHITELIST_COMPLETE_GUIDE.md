# IP Whitelist Complete Guide - One File Only
**Your VPS App - Allow Only Company PCs**

---

## PART 1: GET YOUR COMPANY IP ADDRESSES

### Step 1: What is a Public IP?
A public IP is your real internet address. When you try to access your app from outside, your VPS sees this IP.

### Step 2: Find Public IP from Each Company PC

**Simplest Way - All Devices:**
1. Open a web browser on the company PC
2. Go to: `https://whatismyipaddress.com`
3. Look for the big number that says "IPv4 Address"
4. Write it down exactly
5. Do this for EVERY company PC

**Example Result:**
```
203.45.123.456
```

### Step 3: Save All Your Company IPs

Create this list and KEEP IT SAFE:
```
Company PC IPs List:
PC 1 (John):        203.45.123.456
PC 2 (Manager):     203.45.123.457
PC 3 (Accounting):  203.45.123.458
PC 4 (Office):      203.45.123.459
```

⚠️ **IMPORTANT:** Does your company internet IP ever change?
- If YES: Ask your Internet Service Provider (ISP) for a STATIC IP address
- If NO: You're good to go with what you collected

---

## PART 2: ACCESS YOUR VPS SERVER

### Find Your VPS IP Address
1. Go to your Hostinger dashboard
2. Look for "VPS" or "Servers" section  
3. Find your server and copy the "IP Address"

Example: `203.0.113.1` (this is your server's address)

### Connect to Your VPS

**Option A: Windows Users (Using PowerShell)**

1. Open PowerShell (search "PowerShell" in Start menu)
2. Type this command (replace with YOUR VPS IP):
```powershell
ssh root@203.0.113.1
```
3. Press Enter
4. When asked "name" - type: `yes`
5. Type your VPS password (from Hostinger email)
6. Press Enter

✅ You should now see something like: `root@vps:~#`

**Option B: Windows Users (Using PuTTY - If PowerShell doesn't work)**

1. Download PuTTY: https://www.putty.org
2. Open PuTTY
3. Paste your VPS IP in "Host Name" box
4. Click "Open"
5. Type username: `root` and press Enter
6. Type password and press Enter

**Option C: Mac/Linux Users**

1. Open Terminal
2. Type:
```bash
ssh root@203.0.113.1
```
3. Type password and press Enter

---

## PART 3: SETUP FIREWALL ON YOUR VPS

Once you're connected to your VPS, follow these exact steps:

### Step 1: Check Current Firewall Status
```bash
sudo ufw status
```

**Results:**
- If it says "Status: inactive" → Continue to Step 2
- If it says "Status: active" → Skip to Step 3

### Step 2: Enable Firewall
```bash
sudo ufw enable
```

Type `y` when asked and press Enter

### Step 3: Set Default Rules (Block Everything)
```bash
sudo ufw default deny incoming
```

Press Enter, then:
```bash
sudo ufw default allow outgoing
```

Press Enter

This means:
- ✅ Your server CAN send data out
- ❌ Nobody can send data IN (except who we allow)

### Step 4: CRITICAL - Allow SSH Access
⚠️ **DO THIS IMMEDIATELY OR YOU'LL LOCK YOURSELF OUT!**

```bash
sudo ufw allow 22/tcp
```

Press Enter

### Step 5: Allow Your Company PCs - HTTP Port 80

For each company PC IP, run this command one by one:

```bash
sudo ufw allow from 203.45.123.456 to any port 80
```

**Replace `203.45.123.456` with the actual IP from your list**

Do this for ALL company IPs:
```bash
sudo ufw allow from 203.45.123.456 to any port 80
sudo ufw allow from 203.45.123.457 to any port 80
sudo ufw allow from 203.45.123.458 to any port 80
sudo ufw allow from 203.45.123.459 to any port 80
```

### Step 6: Allow Your Company PCs - HTTPS Port 443

Do the same for HTTPS (secure connection):

```bash
sudo ufw allow from 203.45.123.456 to any port 443
sudo ufw allow from 203.45.123.457 to any port 443
sudo ufw allow from 203.45.123.458 to any port 443
sudo ufw allow from 203.45.123.459 to any port 443
```

### Step 7: Check Everything is Correct

```bash
sudo ufw status numbered
```

**You should see output like this:**
```
     To                         Action      From
     --                         ------      ----
1    22/tcp                     ALLOW       Anywhere
2    80                         ALLOW       203.45.123.456
3    80                         ALLOW       203.45.123.457
4    443                        ALLOW       203.45.123.456
5    443                        ALLOW       203.45.123.457
```

✅ **If you see all your IPs listed, PERFECT!**

---

## PART 4: TEST IF IT WORKS

### Test 1: Try from a Company PC ✅

1. Go to a company PC
2. Open a web browser
3. Type your app URL (e.g., `https://yourapp.com`)
4. Should load normally

### Test 2: Try from Outside (Use Phone with Mobile Data) ❌

1. Use your phone's mobile data (NOT WiFi)
2. Open browser
3. Try to access your app
4. Should show: "Connection Refused" or "This site cannot be reached"

✅ **If Test 1 works and Test 2 fails = SUCCESS! Your firewall is working!**

---

## PART 5: ADD A NEW COMPANY PC LATER

When a new employee joins and needs access:

### Step 1: Get Their Public IP
- Have them go to: https://whatismyipaddress.com
- Write down their IP (e.g., `203.45.123.999`)

### Step 2: Add Their IP to Firewall

Connect to your VPS again via SSH, then run:

```bash
sudo ufw allow from 203.45.123.999 to any port 80
sudo ufw allow from 203.45.123.999 to any port 443
```

**Done!** Changes apply immediately, no restart needed.

---

## PART 6: REMOVE A COMPANY PC

If someone leaves or you need to block an IP:

Connect to VPS and run:

```bash
sudo ufw delete allow from 203.45.123.999 to any port 80
sudo ufw delete allow from 203.45.123.999 to any port 443
```

---

## PART 7: TROUBLESHOOTING

### Problem 1: "I can't connect to my VPS anymore via SSH!"

**You probably forgot to allow port 22**

**Fix:**
1. Go to Hostinger dashboard
2. Look for "Firewall" or "Security" tab
3. Manually allow port 22 from your IP
4. Connect to VPS again
5. Run: `sudo ufw allow 22/tcp`

### Problem 2: "Company PC still can't access the app"

**Possible reasons:**

1. **Wrong IP in firewall**
   - Have them go to https://whatismyipaddress.com again
   - Check if IP changed
   - Add new IP: `sudo ufw allow from NEW_IP to any port 80`

2. **Firewall not actually enabled**
   - Run: `sudo ufw status`
   - Must show "Status: active"
   - If not, run: `sudo ufw enable`

3. **App not running**
   - Check if your app process is actually running
   - Check app logs for errors

4. **Using different port**
   - If app runs on port 3000, 8000, etc. instead of 80
   - Run: `sudo ufw allow from IP to any port 3000` (or your port)
   - Update your DNS/domain to point to correct port

### Problem 3: "Everyone can still access my app"

1. Check firewall is REALLY enabled:
```bash
sudo ufw status
```

Must say "Status: active"

2. Check all rules are set:
```bash
sudo ufw status numbered
```

3. If using Nginx, check Nginx isn't allowing all:
```bash
sudo nano /etc/nginx/sites-available/default
```

Remove any `allow all` rules

4. Check if using CDN (CloudFlare, etc):
   - CDNs might bypass your firewall
   - Disable CDN temporarily to test

### Problem 4: "I did too many rules, need to reset"

To remove ALL rules and start fresh:

```bash
sudo ufw reset
```

Type `y` when asked

Then start from PART 3 again.

---

## QUICK REFERENCE - Copy/Paste Commands

**Connect to VPS:**
```powershell
ssh root@YOUR_VPS_IP
```

**Check firewall:**
```bash
sudo ufw status numbered
```

**Add IP for HTTP:**
```bash
sudo ufw allow from IP_ADDRESS to any port 80
```

**Add IP for HTTPS:**
```bash
sudo ufw allow from IP_ADDRESS to any port 443
```

**Remove IP:**
```bash
sudo ufw delete allow from IP_ADDRESS to any port 80
```

**Enable firewall:**
```bash
sudo ufw enable
```

**Check app logs:**
```bash
tail -f /var/log/nginx/access.log
```

---

## SUMMARY - What You Did

1. ✅ Found each company PC's public IP
2. ✅ Connected to VPS via SSH
3. ✅ Enabled UFW firewall
4. ✅ Blocked all incoming traffic by default
5. ✅ Allowed SSH (port 22) so you don't lock yourself out
6. ✅ Allowed only company IPs to access ports 80 (HTTP) and 443 (HTTPS)
7. ✅ Tested from company PC (worked ✅) and outside (failed ❌)

**Result:** Your app is now protected! Only company PCs can access it!

---

## IMPORTANT NOTES

⚠️ **Remember:**
- Save your company IP list somewhere safe
- If IP changes, add new IP and remove old one
- Always keep port 22 open for SSH, or you'll lock yourself out
- Static IP from ISP is better than dynamic (keeps changing)
- If using VPN, use the VPN's static IP instead

✅ **You're done! Your VPS is now secure!**

---

# PART 8: CLIENT SSL CERTIFICATE (BEST FOR "ONLY THIS PC") 🔒

## 👉 This is the REAL answer if you want STRICT control

**Why Client SSL Certificates?**
- IP whitelisting fails when employees work from different locations
- Company VPN changes the visible IP
- Mobile connections use different IPs
- **Client certificates are tied to the PC itself, not the network**

### How It Works

1. You generate a certificate on your server
2. You install it **ONLY** on company PCs
3. Server checks: "Do you have the certificate? Yes? ✅ Access. No? ❌ Access Denied"
4. All other PCs, hackers, VPNs = 🚫 NO ACCESS even if they have the IP

**Example:**
```
PC with certificate:  ✅ ACCESS (regardless of IP)
PC without cert:      ❌ DENIED (even with correct IP)
Hacker:               ❌ DENIED
Mobile app:           If cert not installed: ❌ DENIED
```

---

## STEP 1: Generate Server & Client Certificates (on VPS)

Connect to your VPS via SSH, then run these commands:

### Step 1a: Create a Directory for Certificates
```bash
mkdir -p /etc/ssl/private/certs
cd /etc/ssl/private/certs
```

### Step 1b: Generate Server Private Key
```bash
openssl genrsa -out server-key.pem 2048
```

### Step 1c: Generate Server Certificate
```bash
openssl req -new -x509 -key server-key.pem -out server-cert.pem -days 365
```

When asked:
```
Country Name: US (or your country)
State: TX (or your state)
Locality: CityName
Organization: YourCompanyName
OU: IT
Common Name: your-app-domain.com
```

### Step 1d: Generate Client Private Key (for your PC)
```bash
openssl genrsa -out client-key.pem 2048
```

### Step 1e: Generate Client Certificate Signing Request
```bash
openssl req -new -key client-key.pem -out client.csr
```

Answer the same questions as before.

### Step 1f: Sign Client Certificate with Server Key
```bash
openssl x509 -req -in client.csr -CA server-cert.pem -CAkey server-key.pem -CAcreateserial -out client-cert.pem -days 365
```

### Step 1g: Verify Certificates
```bash
ls -la /etc/ssl/private/certs/
```

**You should see:**
```
server-key.pem          (server private key - KEEP SECRET)
server-cert.pem         (server certificate)
client-key.pem          (client private key)
client-cert.pem         (client certificate)
client.csr              (request - can delete later)
```

---

## STEP 2: Configure Nginx to Require Client Certificate

### Step 2a: Edit Nginx Config
```bash
sudo nano /etc/nginx/sites-available/default
```

### Step 2b: Add Client Certificate Requirements

Find the `server {` block and add these lines inside it:

```nginx
server {
    listen 443 ssl;
    
    ssl_certificate /etc/ssl/private/certs/server-cert.pem;
    ssl_certificate_key /etc/ssl/private/certs/server-key.pem;
    
    # 🔒 REQUIRE CLIENT CERTIFICATE
    ssl_client_certificate /etc/ssl/private/certs/server-cert.pem;
    ssl_verify_client on;
    ssl_verify_depth 2;
    
    # Rest of your config...
}
```

### Step 2c: Save and Exit
Press `Ctrl + X`, then `Y`, then `Enter`

### Step 2d: Test Nginx Config
```bash
sudo nginx -t
```

Should say: `nginx: the configuration file /etc/nginx/nginx.conf syntax is ok`

### Step 2e: Reload Nginx
```bash
sudo systemctl reload nginx
```

---

## STEP 3: Install Certificate on Your PC 💻

### On Windows:

**Option A: For Browser Access**

1. Copy `client-cert.pem` and `client-key.pem` from VPS to your PC
2. Convert to PKCS12 format (Windows format):
   ```bash
   openssl pkcs12 -export -in client-cert.pem -inkey client-key.pem -out client.p12 -name "Frutaria PC Cert"
   ```
3. Transfer `client.p12` to your Windows PC via SFTP or copy-paste
4. Double-click `client.p12`
5. Click "Install Certificate"
6. Choose "Current User" 
7. Click "Next" → "Finish"
8. Restart your browser

**Option B: For Command-Line / API Access**

Keep the `.pem` files and reference them in curl:
```powershell
curl --cert client-cert.pem --key client-key.pem https://your-app.com
```

### On Mac/Linux:

1. Copy `client-cert.pem` and `client-key.pem` to your home directory
2. Open Keychain/Certificate Manager
3. Import both files
4. Mark certificate as "Always Trust"
5. Restart browser

---

## STEP 4: Test Client Certificate Authentication

### Test 1: Browser Access
```bash
# From your PC with certificate installed:
curl --cert /path/to/client-cert.pem --key /path/to/client-key.pem https://your-app.com
```

**Result:** ✅ Should work

### Test 2: From Another PC (without certificate)
```bash
# From any other PC:
curl https://your-app.com
```

**Result:** ❌ SSL certificate verification error (correct!)

### Test 3: From Hacker (trying to bypass)
```bash
# Even if they somehow get your IP:
curl https://your-app.com
```

**Result:** ❌ "Client certificate required" error

---

## STEP 5: Add More PCs to Your System

When another company PC needs access:

### On Your VPS:
```bash
cd /etc/ssl/private/certs

# Generate new client key
openssl genrsa -out client2-key.pem 2048

# Create signing request
openssl req -new -key client2-key.pem -out client2.csr

# Sign with server certificate
openssl x509 -req -in client2.csr -CA server-cert.pem -CAkey server-key.pem -CAcreateserial -out client2-cert.pem -days 365

# Transfer client2-cert.pem and client2-key.pem to the new PC
```

Then install on that PC the same way as Step 3.

---

## STEP 6: Combine Both Security Layers (RECOMMENDED)

### Use IP Whitelisting + Client Certificates Together

```nginx
server {
    listen 443 ssl;
    
    ssl_certificate /etc/ssl/private/certs/server-cert.pem;
    ssl_certificate_key /etc/ssl/private/certs/server-key.pem;
    
    # Require client certificate
    ssl_client_certificate /etc/ssl/private/certs/server-cert.pem;
    ssl_verify_client on;
    
    # ALSO check IP
    allow 203.45.123.456;
    allow 203.45.123.457;
    deny all;
}
```

**Result:** 🔐 **DOUBLE PROTECTION**
- Must have correct IP AND
- Must have valid certificate

---

## TROUBLESHOOTING

### Problem: "SSL certificate verification failed"

**Solution:**
1. Check certificate is installed correctly
2. Restart browser completely
3. Try: `curl --cacert server-cert.pem https://your-app.com`

### Problem: "Client certificate required"

**Solution:**
1. Check certificate.pem and key.pem are both present
2. Verify on Windows: Certificates (Certmgr.msc) → Personal → Certificates
3. Re-import the .p12 file

### Problem: "Peer certificate cannot be authenticated"

**Solution:**
1. Certificate expiration might be the issue
2. Check certificate validity:
   ```bash
   openssl x509 -in client-cert.pem -text -noout
   ```
3. If expired, re-generate certificate

### Problem: "Certificate is self-signed"

**Solution:** This is normal! For production, you need:
1. Certificate signed by a real Certificate Authority (not self-signed)
2. Or use Let's Encrypt (free) for server, self-signed for clients

---

## COMPARISON: IP vs Client Certificate

| Feature | IP Whitelist | Client Certificate |
|---------|------------|-------------------|
| Works from anywhere | ❌ No, needs correct IP | ✅ Yes! |
| VPN compatible | ❌ Changes IP | ✅ Yes! |
| Mobile access | ❌ Multiple IPs | ✅ If installed |
| Employee leaves | ⚠️ Need to remove IP | ✅ Revoke cert |
| Cost setup | ✅ Free, easy | ⚠️ More setup |
| Security level | ✅ Good | 🔐 **BEST** |
| **Recommended** | Small team, fixed location | **Remote teams, strict security** |

---

## SUMMARY - What You Did (PART 8)

1. ✅ Generated server certificate (security identity proof)
2. ✅ Generated client certificates (PC proof of identity)
3. ✅ Configured Nginx to require client certificates
4. ✅ Installed certificate on your PC
5. ✅ Tested: PC with cert = ✅ access, PC without cert = ❌ denied
6. ✅ Added certificates to other PCs

**Result:** Only PCs with your certificate can access the app! 🔐

---

**🏆 FINAL RECOMMENDATION:**
- Start with **IP Whitelisting** (PART 3) - simple, fast
- Upgrade to **Client Certificates** (PART 8) - if team changes location
- Use **BOTH TOGETHER** (PART 6) - maximum security
