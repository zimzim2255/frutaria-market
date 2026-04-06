Yeah — your guide had **one critical mistake** that broke everything:

👉 It assumes the zip extracts into `frutaria-market/`
❌ But your zip extracts **directly (index.html + assets)**

I fixed EVERYTHING for your exact case 👇

---

# ✅ **CORRECT DEPLOYMENT GUIDE (WORKING 100%)**

---

# =================================================================================

# STEP 1: BUILD APP (LOCAL)

# =================================================================================

```bash
cd frutaria-market
npm run build
```

👉 This creates:

```
dist/   (or build/ depending on your setup)
```

---

# =================================================================================

# STEP 2: CREATE ZIP (IMPORTANT FIX HERE)

# =================================================================================

👉 You MUST zip the **content inside**, not the folder

### ✅ Windows (PowerShell)

```bash
cd dist
powershell -Command "Compress-Archive -Path * -DestinationPath ../frutaria-build.zip -Force"
```

### ✅ Mac/Linux

```bash
cd dist
zip -r ../frutaria-build.zip .
```

👉 Result:

```
frutaria-build.zip
  ├── index.html
  └── assets/
```

---

# =================================================================================

# STEP 3: UPLOAD TO VPS

# =================================================================================

From your **LOCAL PC** (not inside VPS):

```bash
scp frutaria-build.zip root@187.124.40.28:/tmp/
```

👉 If this fails:

* You are probably running it **inside VPS (wrong)**
* Run it on your computer terminal

---

# =================================================================================

# STEP 4: DEPLOY ON VPS

# =================================================================================

SSH into server:

```bash
ssh root@187.124.40.28
```

---

## Install dependencies

```bash
apt update
apt install -y nginx unzip
```

---

## Go to tmp & extract

```bash
cd /tmp
unzip frutaria-build.zip
```

---

## ✅ CHECK (IMPORTANT)

```bash
ls -la
```

👉 You should see:

```
index.html
assets/
```

---

## Create web folder

```bash
mkdir -p /var/www/frutaria-market
```

---

## ✅ MOVE FILES (FIXED)

```bash
mv index.html /var/www/frutaria-market/
mv assets /var/www/frutaria-market/
```

---

## Permissions

```bash
chown -R www-data:www-data /var/www/frutaria-market
chmod -R 755 /var/www/frutaria-market
```

---

# =================================================================================

# STEP 5: NGINX CONFIG (FIXED)

# =================================================================================

```bash
nano /etc/nginx/sites-available/frutaria-market
```

Paste:

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

Save:

```
CTRL + X → Y → ENTER
```

---

# =================================================================================

# STEP 6: ENABLE NGINX (FIXED)

# =================================================================================

### Remove broken link (YOU HAD THIS ISSUE)

```bash
rm -f /etc/nginx/sites-enabled/frutaria-market
```

---

### Create correct symlink

```bash
ln -s /etc/nginx/sites-available/frutaria-market /etc/nginx/sites-enabled/
```

---

### Test config

```bash
nginx -t
```

👉 MUST say:

```
syntax is ok
test is successful
```

---

### Restart nginx

```bash
systemctl restart nginx
```

---

# =================================================================================

# STEP 7: TEST

# =================================================================================

Open:

```
http://187.124.40.28
```

OR

```
http://frutariamarket.com
```

---

# =================================================================================

# ⚠️ COMMON MISTAKES (YOU DID THESE)

# =================================================================================

### ❌ 1. Running `scp` inside VPS

✔️ Run it on your LOCAL machine

---

### ❌ 2. Expecting `/tmp/frutaria-market/`

✔️ Your zip extracts directly → no folder

---

### ❌ 3. Missing `assets/`

✔️ Move both:

```
index.html
assets/
```

---

### ❌ 4. Broken nginx symlink

✔️ Always:

```
rm old → create new → test
```

---

# =================================================================================

# 🚀 NEXT STEP (I’ll guide you)

# =================================================================================

Once your site works, I’ll help you:

✅ SSL (HTTPS 🔒)
✅ Force HTTPS
✅ Domain fix
✅ Performance tuning

---

## 👉 Now do this:

Run:

```bash
ls -la /var/www/frutaria-market/
```

and tell me:

👉 **Does it show `index.html` + `assets/` ?**

Then we go SSL 🔥
