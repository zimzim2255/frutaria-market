# Environment Switching Guide

This guide explains how to easily switch between development and production environment configurations.

## Quick Start

### Switch to Development Environment
```bash
npm run env:dev
```
Then start your dev server:
```bash
npm run dev
```

### Switch to Production Environment
```bash
npm run env:prod
```
Then start your dev server:
```bash
npm run dev
```

### Check Current Environment
```bash
npm run env:status
```

## Available Commands

### Environment Switching
- `npm run env:dev` - Switch to development environment
- `npm run env:prod` - Switch to production environment
- `npm run env:status` - Show current environment status

### Development with Environment
- `npm run dev:dev` - Switch to dev environment AND start dev server
- `npm run dev:prod` - Switch to prod environment AND start dev server

### Build with Environment
- `npm run build:dev` - Switch to dev environment AND build
- `npm run build:prod` - Switch to prod environment AND build

## File Structure

```
.env.development    # Development environment variables
.env.production     # Production environment variables
.env                # Current active environment (auto-generated)
switch-env.js       # Environment switcher script
```

## How It Works

1. **`.env.development`** - Contains development-specific environment variables
2. **`.env.production`** - Contains production-specific environment variables
3. **`.env`** - The active environment file that Vite reads
4. **`switch-env.js`** - Script that copies the appropriate file to `.env`

When you run `npm run env:dev`, the script copies `.env.development` to `.env`.
When you run `npm run env:prod`, the script copies `.env.production` to `.env`.

## Customizing Environment Variables

### To add development-specific variables:
1. Edit `.env.development`
2. Add your variables (e.g., `VITE_API_URL=http://localhost:3000`)

### To add production-specific variables:
1. Edit `.env.production`
2. Add your variables (e.g., `VITE_API_URL=https://your-production-domain.com`)

### To use environment variables in your code:
```typescript
const apiUrl = import.meta.env.VITE_API_URL;
const isDev = import.meta.env.VITE_ENV_MODE === 'development';
```

## Example Usage

### Scenario 1: Working on Development
```bash
# Switch to development environment
npm run env:dev

# Start dev server (uses development environment)
npm run dev
```

### Scenario 2: Testing Production Build Locally
```bash
# Switch to production environment
npm run env:prod

# Build for production
npm run build:prod

# Preview production build
npm run preview
```

### Scenario 3: Quick Environment Check
```bash
# Check which environment is currently active
npm run env:status
```

## Important Notes

1. **Never commit `.env` files** - The `.env` file is auto-generated and should not be committed to version control
2. **Keep `.env.example` updated** - Update `.env.example` when adding new environment variables
3. **Environment variables must start with `VITE_`** - Only variables prefixed with `VITE_` are exposed to your Vite application
4. **Restart dev server after switching** - After switching environments, restart your dev server for changes to take effect

## Troubleshooting

### Environment not switching?
- Make sure `.env.development` and `.env.production` files exist
- Check that you have write permissions in the project directory
- Try running `node switch-env.js status` to see current state

### Variables not updating?
- Restart your dev server after switching environments
- Clear browser cache if needed
- Check browser console for any errors

### Script not found?
- Make sure `switch-env.js` exists in the project root
- Check that Node.js is installed and accessible
