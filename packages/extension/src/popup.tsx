import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from '@clerk/chrome-extension'

import { ExtensionInterface } from '~features/extension-interface'

import '~style.css'

const PUBLISHABLE_KEY = process.env.PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY
const SYNC_HOST = process.env.PLASMO_PUBLIC_CLERK_SYNC_HOST
const EXTENSION_URL = chrome.runtime.getURL('.')

if (!PUBLISHABLE_KEY || !SYNC_HOST) {
  throw new Error(
    'Please add the PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY and PLASMO_PUBLIC_CLERK_SYNC_HOST to the .env.development file',
  )
}


function IndexPopup() {
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      afterSignOutUrl={`${EXTENSION_URL}/popup.html`}
      signInFallbackRedirectUrl={`${EXTENSION_URL}/popup.html`}
      signUpFallbackRedirectUrl={`${EXTENSION_URL}/popup.html`}
      allowedRedirectOrigins={['chrome-extension://*']}
      syncHost={SYNC_HOST}
    >
      <div className="plasmo-flex plasmo-items-center plasmo-justify-center plasmo-h-[600px] plasmo-w-[400px] plasmo-flex-col plasmo-p-4">
        <header className="plasmo-w-full plasmo-flex plasmo-justify-between plasmo-items-center plasmo-mb-4">
          <h1 className="plasmo-text-lg plasmo-font-semibold">Auto-Apply Extension</h1>
          <SignedOut>
            <SignInButton mode="modal" />
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </header>
        <main className="plasmo-grow plasmo-w-full">
          <SignedOut>
            <div className="plasmo-flex plasmo-flex-col plasmo-items-center plasmo-justify-center plasmo-h-full">
              <p className="plasmo-text-gray-600 plasmo-mb-4">Sign in to use the extension</p>
            </div>
          </SignedOut>
          <SignedIn>
            <ExtensionInterface />
          </SignedIn>
        </main>
      </div>
    </ClerkProvider>
  )
}

export default IndexPopup
