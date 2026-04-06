# 🚀 Frutaria Market - Deployment Update Steps

## Quick Reference - Deploy Your App in 3 Steps

### Step 1️⃣: Build Locally
```bash
npm run build
```
This creates a `/build` folder with `index.html` and `assets/`

### Step 2️⃣: Create Clean Zip (IMPORTANT!)
```bash
cd build
powershell -Command "Compress-Archive -Path @('index.html', 'assets') -DestinationPath ../frutaria-build.zip -Force"
cd ..
```

⚠️ **CRITICAL:** Only include `index.html` and `assets/` - NOT node_modules!

### Step 3️⃣: Upload & Deploy
```bash
scp frutaria-build.zip ubuntu@187.124.40.28:/tmp/
ssh ubuntu@187.124.40.28 "cd /tmp && rm -rf index.html assets && unzip -o frutaria-build.zip && sudo cp -r index.html /var/www/frutaria-market/ && sudo cp -r assets/* /var/www/frutaria-market/assets/ && sudo chown -R www-data:www-data /var/www/frutaria-market && sudo chmod -R 755 /var/www/frutaria-market && sudo systemctl restart nginx && echo '✅ DEPLOYMENT COMPLETE'"
```

---

## Full Step-by-Step Guide

### STEP 1: Build on Your Local Machine
```bash
cd F:\frutaria-market-main
npm run build
```
**Result:** Creates `build/` folder with:
- `index.html` (small, ~400 bytes)
- `assets/` folder (CSS, JS, images)

### STEP 2: Delete Old Zip (if exists)
```bash
Remove-Item -Path frutaria-build.zip -Force -ErrorAction SilentlyContinue
```

### STEP 3: Create Clean Zip File
Navigate to build folder and compress ONLY the contents:
```bash
cd F:\frutaria-market-main\build
powershell -Command "Compress-Archive -Path @('index.html', 'assets') -DestinationPath ../frutaria-build.zip -Force"
cd ..
```

**Verify:** Should be ~0.65 MB (NOT 90+ MB!)

### STEP 4: Upload to VPS
Run from your LOCAL machine:
```bash
scp frutaria-build.zip ubuntu@187.124.40.28:/tmp/
```

### STEP 5: Deploy on Server
SSH into server:
```bash
ssh ubuntu@187.124.40.28
```

Extract and deploy:
```bash
cd /tmp
rm -rf index.html assets
unzip -o frutaria-build.zip

# Copy files
sudo cp -r index.html /var/www/frutaria-market/
sudo cp -r assets/* /var/www/frutaria-market/assets/

# Fix permissions
sudo chown -R www-data:www-data /var/www/frutaria-market
sudo chmod -R 755 /var/www/frutaria-market

# Restart web server
sudo systemctl restart nginx
```

### STEP 6: Verify Deployment
```bash
ls -lah /var/www/frutaria-market/
```

Should show:
- `index.html`
- `assets/` directory

### STEP 7: Test Website
Visit:
- http://frutariamarket.com
- or http://187.124.40.28

---

## ✅ Checklist Before Deploying

- [ ] Code changes completed and tested locally
- [ ] `npm run build` completes successfully
- [ ] No errors in console
- [ ] Zip file is ~0.65 MB (not 90+ MB)
- [ ] `index.html` exists in zip
- [ ] `assets/` folder exists in zip
- [ ] You have SSH access to VPS
- [ ] You're running `scp` from LOCAL machine, not server

---

## ❌ Troubleshooting

### "scp: No such file"
❌ Problem: You're trying to upload from wrong location or zip doesn't exist
✅ Solution: Make sure you're in `F:\frutaria-market-main` and run `npm run build` first

### "Zip is 90+ MB"
❌ Problem: You zipped the entire `build/` folder including node_modules
✅ Solution: Delete the zip and create it again using only `index.html` and `assets/`

### "Website not updating"
❌ Problem: Browser cache or files didn't deploy
✅ Solutions:
- Clear browser cache: **Ctrl+F5**
- Check permissions: `sudo ls -lah /var/www/frutaria-market/`
- Check nginx: `sudo systemctl status nginx`

### "Permission denied" errors
❌ Problem: Files don't have correct owner/permissions
✅ Solution: Run Step 5 commands again (chown, chmod, restart nginx)

### "index.html not found"
❌ Problem: File wasn't copied correctly
✅ Solution:
```bash
ssh ubuntu@187.124.40.28
cd /tmp
ls -lah index.html  # Verify it's extracted
sudo cp index.html /var/www/frutaria-market/
```

---

## 🔐 VPS Connection Details

**Host:** 187.124.40.28  
**User:** ubuntu  
**Web Root:** `/var/www/frutaria-market/`  
**Web Server:** nginx  

---

## 📋 File Structure After Deployment

```
/var/www/frutaria-market/
├── index.html
└── assets/
    ├── index-[hash].js
    ├── index-[hash].css
    ├── html2canvas.esm-[hash].js
    ├── purify.es-[hash].js
    └── index.es-[hash].js
```

---

## 🚨 Common Issues & Solutions

| Issue | Cause | Fix |
|-------|-------|-----|
| File permissions error | Files owned by root | `sudo chown -R www-data:www-data /var/www/frutaria-market` |
| Nginx fails to restart | Port already in use | `sudo systemctl restart nginx` |
| Assets not loading (404) | Assets folder empty | `sudo cp -r assets/* /var/www/frutaria-market/assets/` |
| Old site still showing | Cache issue | Clear browser: Ctrl+Shift+Delete |
| SSH connection timeout | Wrong IP or firewall | Verify IP: `187.124.40.28` |

---

## 💡 Pro Tips

1. **Test locally first:**
   ```bash
   npm run build
   npm preview  # or check build/ folder manually
   ```

2. **Keep a backup:**
   ```bash
   ssh ubuntu@187.124.40.28
   tar -czf /tmp/backup-$(date +%Y%m%d).tar.gz /var/www/frutaria-market/
   ```

3. **Monitor deployment:**
   ```bash
   ssh ubuntu@187.124.40.28 "sudo tail -f /var/log/nginx/error.log"
   ```

4. **Quick status check:**
   ```bash
   ssh ubuntu@187.124.40.28 "sudo systemctl status nginx && echo '---' && ls -lah /var/www/frutaria-market/"
   ```

---

## 🎯 Expected Results After Deployment

✅ Website loads at http://187.124.40.28  
✅ All assets load correctly  
✅ No 404 errors in console  
✅ Styling displays properly  
✅ No cache issues  
✅ Functions work as expected

---

**Last Updated:** April 6, 2026  
**Deployment Method:** SCP + SSH  
**Web Server:** Nginx  
**Build Tool:** Vite/NPM
