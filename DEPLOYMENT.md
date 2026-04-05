# COMPLETE DEPLOYMENT GUIDE - Frutaria Market VPS

================================================================================
STEP 1: BUILD THE APP (LOCAL MACHINE)
================================================================================

Run these commands on your LOCAL computer:

```bash
cd frutaria-market
npm run build
```

This creates a `build/` folder with the app files.

================================================================================
STEP 2: CREATE ZIP FILE (LOCAL MACHINE)
================================================================================

On your LOCAL computer, create a zip of the build folder:

Windows:
```bash
# Open PowerShell in the project folder, then run:
powershell -Command "Compress-Archive -Path 'build\*' -DestinationPath 'frutaria-build.zip' -Force"
```

Mac/Linux:
```bash
cd frutaria-market
zip -r frutaria-build.zip build/
```

================================================================================
STEP 3: UPLOAD ZIP TO VPS (LOCAL → SERVER)
================================================================================

METHOD A: Using WinSCP (RECOMMENDED - EASIEST)
----------------------------------------------
1. Download WinSCP from: https://winscp.net/
2. Install and open it
3. Enter connection details:
   - Host: 187.124.40.28
   - Username: root
   - Password: (your password)
4. Click "Login"
5. On left side: find frutaria-build.zip on your computer
6. On right side: navigate to /tmp
7. Drag the file from left to right to upload
8. Wait for upload to finish

METHOD B: Using FileZilla
-------------------------
1. Download FileZilla from: https://filezilla-project.org/
2. Open Site Manager (Ctrl+S)
3. New Site with:
   - Host: 187.124.40.28
   - Protocol: SFTP
   - Logon Type: Normal
   - User: root
   - Password: (your password)
4. Click Connect
5. Drag frutaria-build.zip from local to /tmp on server

METHOD C: Using scp command (if you have scp/sshpass)
------------------------------------------------------
On LOCAL computer, open CMD (not PowerShell):

```bash
scp frutaria-build.zip root@187.124.40.28:/tmp/
# Enter password when prompted
```

METHOD D: Using GitHub (if you prefer)
---------------------------------------
1. Push your code to GitHub
2. On server: git clone your-repo-url

================================================================================
STEP 4: DEPLOY ON VPS (SERVER COMMANDS)
================================================================================

SSH into your server:
```bash
ssh root@187.124.40.28
# Enter password when prompted
```

Then run these commands ONE BY ONE:

```bash
# 1. Install required packages
apt update
apt install -y unzip nginx

# 2. Check the zip file exists
ls -la /tmp/frutaria-build.zip

# 3. Extract the build
cd /tmp
unzip frutaria-build.zip

# 4. Check what was extracted (should see index.html and assets folder directly)
ls -la /tmp/frutaria-market/

# 5. Create web directory
mkdir -p /var/www/frutaria-market

# 6. Move files to web folder (files are directly in frutaria-market folder)
mv /tmp/frutaria-market/* /var/www/frutaria-market/

# 7. Create nginx config
nano /etc/nginx/sites-available/frutaria-market
```

================================================================================
STEP 5: NGINX CONFIG (COPY THIS INSIDE NANO)
================================================================================

After running `nano /etc/nginx/sites-available/frutaria-market`,
paste this content:

```nginx
server {
    listen 80;
    server_name 187.124.40.28;

    root /var/www/frutaria-market;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

To save in nano: Press Ctrl+O, then Enter, then Ctrl+X

================================================================================
STEP 6: FINAL COMMANDS
================================================================================

Continue in terminal:

```bash
# 7. Enable the site
ln -s /etc/nginx/sites-available/frutaria-market /etc/nginx/sites-enabled/

# 8. Test nginx config
nginx -t

# 9. Restart nginx
systemctl restart nginx

# 10. Set permissions
chmod -R 755 /var/www/frutaria-market
```

# ================================================================================
# VPS FULL RESET (WIPE EVERYTHING)
# ================================================================================

# WARNING: This will DELETE ALL DATA on the server!

# OPTION 1: Via Hosting Control Panel (RECOMMENDED)
# -------------------------------------------------
# 1. Login to your VPS provider (Hetzner, DigitalOcean, etc.)
# 2. Find your server and look for "Reset" or "Reinstall"
# 3. Select a fresh OS (Ubuntu 22.04 or 20.04)
# 4. Confirm - this will wipe everything and give you a fresh server

# OPTION 2: From SSH (wipe app only, keep OS)
# -------------------------------------------
# Run these commands on the server (one by one):

# Stop nginx
systemctl stop nginx

# Remove all app files
rm -rf /var/www/frutaria-market
rm -rf /tmp/frutaria-market
rm -f /tmp/frutaria-build.zip

# Remove nginx config
rm -f /etc/nginx/sites-available/frutaria-market
rm -f /etc/nginx/sites-enabled/frutaria-market

# Optional: Uninstall nginx and unzip (keep OS clean)
apt remove -y nginx unzip
apt autoremove -y

# Verify nginx is stopped
systemctl status nginx

# To reinstall fresh:
# apt update
# apt install -y nginx unzip

# ================================================================================
# FULL OS REINSTALL (from control panel)
# ================================================================================
# If you want COMPLETE reset including OS:
# 1. Go to your VPS provider control panel
# 2. Find "Server" → "Reset" or "Reinstall OS"
# 3. Choose "Ubuntu 22.04 LTS" (recommended)
# 4. Wait for completion (~5-10 minutes)
# 5. SSH in with new credentials
# 6. Start fresh from Step 1 of this guide

# Option 1: Keep both IP and domain (recommended for now)
# Update nginx config to:

```nginx
server {
    listen 80;
    server_name 187.124.40.28 frutariamarket.com www.frutariamarket.com;

    root /var/www/frutaria-market;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Then restart nginx:
```bash
systemctl restart nginx
```

# Option 2: Only use domain (remove IP)
# If you want ONLY frutariamarket.com, change server_name to:
# server_name frutariamarket.com www.frutariamarket.com;

# ================================================================================
# CONNECT DOMAIN TO SERVER
# ================================================================================

# At your domain registrar (where you bought frutariamarket.com):
# Create A Record:
#   - Host: @ (or leave empty)
#   - Value/Points to: 187.124.40.28
#   - TTL: 3600 (or auto)

# Create CNAME (optional, for www):
#   - Host: www
#   - Value: frutariamarket.com

# Wait up to 24 hours for DNS to propagate (usually faster - 5-30 mins)

# ================================================================================
# ACCESS THE APP
# ================================================================================

# After DNS propagates, open:
# http://frutariamarket.com
# or
# http://187.124.40.28

================================================================================
IF SOMETHING GOES WRONG
================================================================================

Check nginx status:
```bash
systemctl status nginx
```

View nginx error logs:
```bash
tail -20 /var/log/nginx/error.log
```

Restart nginx:
```bash
systemctl restart nginx
```

================================================================================
QUICK RECAP
================================================================================

LOCAL:
1. npm run build
2. Compress-Archive (PowerShell) -> frutaria-build.zip
3. Upload to /tmp/ using WinSCP/FileZilla

SERVER:
4. apt install -y unzip nginx
5. unzip frutaria-build.zip
6. ls -la /tmp/frutaria-market/ (to check structure)
7. mv frutaria-market/* /var/www/frutaria-market/
7. nano /etc/nginx/sites-available/frutaria-market (paste config)
8. ln -s /etc/nginx/sites-available/frutaria-market /etc/nginx/sites-enabled/
9. nginx -t && systemctl restart nginx
10. Open http://187.124.40.28