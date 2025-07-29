# Browser Extension Setup Guide

## Prerequisites

1. **Clerk Account Setup**
   - Create a Clerk account at https://clerk.com
   - Create a new application
   - Get your publishable key from the Clerk dashboard

2. **Chrome Extension Development**
   - Use a Chromium-based browser (Chrome, Edge, Brave)
   - Enable Developer mode in chrome://extensions

## Configuration

### 1. Environment Variables

Create a `.env.development` file in the extension directory with:

```env
PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_actual_clerk_key_here
CRX_PUBLIC_KEY=your_crx_public_key_here
CLERK_FRONTEND_API=https://clerk.your-domain.com
```

### 2. Generate CRX Key

1. Visit [Plasmo Itero's Generate Keypairs](https://itero.plasmo.com/)
2. Click "Generate KeyPairs"
3. Save the **Public Key** and **CRX ID**
4. Update the `CRX_PUBLIC_KEY` in your `.env.development` file

### 3. Update package.json

The extension's `package.json` already includes the necessary configuration:

```json
{
  "manifest": {
    "key": "$CRX_PUBLIC_KEY",
    "permissions": ["cookies", "storage", "activeTab", "tabs"],
    "host_permissions": [
      "https://*/*",
      "http://localhost:5000/*",
      "$CLERK_FRONTEND_API/*"
    ]
  }
}
```

## Development

### 1. Start Development Server

```bash
cd packages/extension
pnpm dev
```

This will create a build in `build/chrome-mv3-dev/`

### 2. Load Extension in Browser

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `build/chrome-mv3-dev/` folder
5. Verify the extension ID matches your CRX ID

### 3. Test the Extension

1. Open any website
2. Click the extension icon in your browser toolbar
3. Sign in with your Clerk account
4. Click "Scrape" to enable HTML selection mode
5. Click on any element on the page to select it
6. Click "Send" to submit the selected HTML to the API

## Features

### Authentication
- Uses Clerk for user authentication
- Syncs with your web application's auth state
- Handles sign-in/sign-out flow

### HTML Selection
- Visual highlighting of elements on hover
- Click to select specific HTML elements
- Crosshair cursor during selection mode
- Automatic cleanup when popup closes

### API Integration
- Sends selected HTML to `/api/extension-scrape` endpoint
- Includes current page URL and user ID
- Handles loading states and error feedback

## API Endpoint

The extension sends data to:

```
POST http://localhost:5000/api/extension-scrape
Content-Type: application/json

{
  "html": "<selected-html-element>",
  "url": "https://example.com/page",
  "userId": "user_123"
}
```

## Troubleshooting

### Common Issues

1. **Extension not loading**
   - Check that Developer mode is enabled
   - Verify the build folder exists
   - Check console for errors

2. **Authentication not working**
   - Verify your Clerk publishable key is correct
   - Check that the CRX ID matches
   - Ensure host permissions include your Clerk domain

3. **HTML selection not working**
   - Check that the content script is injected
   - Verify the page allows content scripts
   - Check browser console for errors

4. **API calls failing**
   - Ensure the API server is running on localhost:5000
   - Check CORS settings
   - Verify authentication tokens

### Debug Mode

To enable debug logging, add to your `.env.development`:

```env
DEBUG=true
```

## Production Deployment

1. Update environment variables for production
2. Build with `pnpm build`
3. Package with `pnpm package`
4. Submit to Chrome Web Store

## Security Notes

- Never commit your actual Clerk keys to version control
- Use environment variables for all sensitive data
- The extension only requests necessary permissions
- All API calls are authenticated through Clerk 