# 🚀 Frutaria Market – Production Deployment Guide (UPDATED)

**Version 2.0** - Updated April 11, 2026 with fixes for common deployment issues

---

## ⚠️ IMPORTANT NOTES BEFORE STARTING

- **Never** use `rm -rf /var/www/frutaria-market/*` without sudo - will fail due to permissions
- **Always** verify files are extracted correctly before moving them
- **Always** set permissions BEFORE restarting Nginx
- **Test** the website after deployment to confirm it's live

---

## 📋 PREREQUISITES

Make sure you have:
- SSH access to VPS: `ubuntu@187.124.40.28`
- Local Node.js and npm installed
- Git committed and pushed (backup)

---

## 🔄 STEP 1: GIT COMMIT & BACKUP (LOCAL MACHINE)

```bash
# Commit all changes locally
cd frutaria-market
git add .
git commit -m "Updat: <describe changes>"
git push origin main
```

**Why:** Ensures you have a backup in case something goes wrong

---

## 🏗️ STEP 2: BUILD THE APP (LOCAL MACHINE)

```bash
npm run build
```

**Expected output:**
```
✓ 2007 modules transformed.
✓ built in 4.17s
```

**Note:** The build folder is created at: `build/` (contains `index.html` + `assets/`)

---

## 📦 STEP 3: CREATE ZIP FILE (LOCAL MACHINE)

Open PowerShell in the **build** folder:

```bash
cd frutaria-market\build
```

Then compress (Windows):

```powershell
powershell -Command "Compress-Archive -Path @('index.html', 'assets') -DestinationPath ../frutaria-build.zip -Force"
```

**Verify the zip was created:**

```bash
ls ../frutaria-build.zip
```

Should show: `frutaria-build.zip` (~650-700 KB)

---

## 📤 STEP 4: UPLOAD TO VPS (LOCAL MACHINE)

```bash
scp frutaria-build.zip ubuntu@187.124.40.28:/tmp/
```

**Expected output:**
```
frutaria-build.zip                    100%  663KB  90.4KB/s
```

---

## 🖥️ STEP 5: CONNECT TO VPS & CLEAN OLD DEPLOYMENT

Connect to the server:

```bash
ssh ubuntu@187.124.40.28
```

**IMPORTANT: Use sudo to remove old files with proper permissions:**

```bash
sudo rm -rf /var/www/frutaria-market
sudo mkdir -p /var/www/frutaria-market
```

**Verify directory is empty:**

```bash
ls /var/www/frutaria-market
```

Should return: empty (no output)

---

## 📂 STEP 6: EXTRACT ZIP IN TEMP LOCATION

Extract to a clean temporary directory:

```bash
cd /tmp
mkdir -p frutaria-deploy
cd frutaria-deploy
unzip -o /tmp/frutaria-build.zip
```

**Verify extraction:**

```bash
ls -la
```

Should show:
```
index.html
assets/
```

---

## 🚀 STEP 7: DEPLOY TO WEB ROOT

Copy files to production directory:

```bash
sudo cp index.html /var/www/frutaria-market/
sudo cp -r assets /var/www/frutaria-market/
```

**Verify deployment:**

```bash
ls -la /var/www/frutaria-market/
```

Should show:
```
index.html
assets/
```

---

## 🔐 STEP 8: SET PERMISSIONS CORRECTLY

**CRITICAL STEP - Do this BEFORE restarting Nginx:**

```bash
sudo chown -R www-data:www-data /var/www/frutaria-market
sudo chmod -R 755 /var/www/frutaria-market
sudo chmod 644 /var/www/frutaria-market/index.html
```

**Verify permissions:**

```bash
ls -la /var/www/frutaria-market/
```

Should show:
```
-rw-r--r-- 1 www-data www-data   index.html
drwxr-xr-x 2 www-data www-data   assets/
```

---

## 🔄 STEP 9: RESTART NGINX

Restart the web server:

```bash
sudo systemctl restart nginx
```

**Verify Nginx is running:**

```bash
sudo systemctl status nginx
```

Should show: `Active: active (running)`

---

## ✅ STEP 10: VERIFY DEPLOYMENT

**Test on the server:**

```bash
curl http://localhost
head -20
```

Should return HTML starting with `<!DOCTYPE html>`

**Open browser and test:**

- http://frutariamarket.com
- http://187.124.40.28

**Check browser console for errors:**
- Open DevTools (F12)
- Check Console tab for JavaScript errors
- Check Network tab to ensure assets loaded

---

## ✨ STEP 11: CLEANUP (OPTIONAL)

Clean up temporary files:

```bash
cd /tmp
rm -rf frutaria-deploy
rm -f frutaria-build.zip
```

---

## 🚨 TROUBLESHOOTING

### "Permission denied" errors

**Problem:** Can't remove files or set permissions
```
rm: cannot remove: Permission denied
```

**Solution:**
```bash
sudo rm -rf /var/www/frutaria-market
sudo mkdir -p /var/www/frutaria-market
```

---

### "unzip: cannot open" 

**Problem:** Can't find the zip file
```
unzip: cannot open /tmp/frutaria-build.zip
```

**Solution:**
```bash
# Check if file exists
ls -la /tmp/frutaria-build.zip

# If not there, upload it again
exit  # (from VPS)
scp frutaria-build.zip ubuntu@187.124.40.28:/tmp/
ssh ubuntu@187.124.40.28
```

---

### "No such frile" when extracting

**Problem:** Unzip warning about backslashes
```
warning: frutaria-build.zip appears to use backslashes as path separators
```

**Solution:** This is just a warning. The files extract correctly. Continue with deployment.

---

### Blank page or 404 after deployment

**Problem:** Website shows blank page or 404
```
"Cannot GET /"
```

**Solution 1:** Clear browser cache
```
Ctrl + F5  (hard refresh)
or
Ctrl + Shift + Delete  (clear cache)
```

**Solution 2:** Check file permissions
```bash
ls -la /var/www/frutaria-market/
```

Should show files owned by `www-data:www-data`

**Solution 3:** Check Nginx config
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

### Assets loading but page not interactive

**Problem:** CSS/JS load but React app doesn't work
```
Console shows errors like "Cannot read properties of undefined"
```

**Solution:** Check that `index.html` is being served correctly
```bash
curl http://localhost | grep "script src"
```

Should show: `<script type="module" crossorigin src="/assets/index-*.js">`

---

## 📋 QUICK CHECKLIST

Before you deploy:

- [ ] Code committed and pushed to Git
- [ ] `npm run build` runs without errors
- [ ] `frutaria-build.zip` created successfully
- [ ] Zip file uploaded to VPS
- [ ] Old deployment cleaned with sudo

During deployment:

- [ ] Zip extracted to temp location
- [ ] Files copied to `/var/www/frutaria-market/`
- [ ] Permissions set (www-data owner)
- [ ] Nginx restarted without errors
- [ ] Website tested in browser

After deployment:

- [ ] Website loads without errors
- [ ] Assets (CSS/JS) load correctly
- [ ] No blank page or 404
- [ ] Console has no critical errors
- [ ] All features work as expected

---

## 🤖 ONE-LINER DEPLOYMENT (After first setup)

Once you're comfortable with all steps:

```bash
# From VPS
sudo rm -rf /var/www/frutaria-market && sudo mkdir -p /var/www/frutaria-market && cd /tmp && mkdir -p frutaria-deploy-$(date +%s) && cd $_ && unzip -o /tmp/frutaria-build.zip && sudo cp -r * /var/www/frutaria-market/ && sudo chown -R www-data:www-data /var/www/frutaria-market && sudo chmod -R 755 /var/www/frutaria-market && sudo systemctl restart nginx && echo "✅ Deployment Complete!"
```

---

## 📞 CONTACT & SUPPORT

If you hit issues not covered here:

1. Check the **TROUBLESHOOTING** section above
2. Verify permissions: `ls -la /var/www/frutaria-market/`
3. Check Nginx logs: `sudo tail -50 /var/log/nginx/error.log`
4. Test VPS connectivity: `ssh ubuntu@187.124.40.28`

---

## 📝 DEPLOYMENT HISTORY

| Date | Version | Status | Notes |
|------|---------|--------|-------|
| Apr 11, 2026 | 2.0 | ✅ | Updated with permission fixes & verification steps |

---

🎉 **You're ready to deploy safely and reliably!**
