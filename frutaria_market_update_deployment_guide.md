# 🚀 Frutaria Market – Update Deployment Guide

This guide explains how to update your live website after making changes locally.

---

## 🧑‍💻 STEP 1: BUILD YOUR APP (LOCAL MACHINE)

Run on your computer:

```bash
cd frutaria-market
npm run build
```

This creates a `dist/` (or `build/`) folder.

---

## 📦 STEP 2: CREATE ZIP FILE (IMPORTANT)

⚠️ You MUST zip the CONTENT inside the folder, not the folder itself.

### Windows (PowerShell)
```bash
cd dist
powershell -Command "Compress-Archive -Path * -DestinationPath ../frutaria-build.zip -Force"
```

### Mac/Linux
```bash
cd dist
zip -r ../frutaria-build.zip .
```

---

## 📤 STEP 3: UPLOAD TO VPS

Run on your LOCAL machine (NOT the server):

```bash
scp frutaria-build.zip root@187.124.40.28:/tmp/
```

---

## 🖥️ STEP 4: CONNECT TO SERVER

```bash
ssh root@187.124.40.28
```

---

## 🔄 STEP 5: DEPLOY UPDATE

```bash
cd /tmp

# Remove old extracted files (optional but clean)
rm -rf index.html assets

# Extract new build
unzip frutaria-build.zip

# Remove old website files
rm -rf /var/www/frutaria-market/*

# Move new files
mv index.html /var/www/frutaria-market/
mv assets /var/www/frutaria-market/
```

---

## 🔐 STEP 6: FIX PERMISSIONS

```bash
chown -R www-data:www-data /var/www/frutaria-market
chmod -R 755 /var/www/frutaria-market
```

---

## 🔁 STEP 7: RESTART NGINX

```bash
systemctl restart nginx
```

---

## ✅ DONE

Your website is now updated 🎉

Open:

- http://frutariamarket.com
- or http://187.124.40.28

---

## ⚡ QUICK UPDATE (FAST METHOD)

If you already know what you're doing:

```bash
cd /tmp && unzip -o frutaria-build.zip && rm -rf /var/www/frutaria-market/* && mv index.html assets /var/www/frutaria-market/ && systemctl restart nginx
```

---

## ❗ COMMON ERRORS

### "scp: No such file"
👉 Run scp from your LOCAL PC, not the VPS

### Missing assets / broken UI
👉 Make sure `assets/` is moved

### Website not updating
👉 Clear browser cache (Ctrl + F5)

---

## 🧠 TIP (BEST PRACTICE)

Instead of deleting everything, you can use:

```bash
unzip -o frutaria-build.zip
```

This overwrites files safely.

---

🔥 That’s it — your update workflow is now clean and repeatable.

