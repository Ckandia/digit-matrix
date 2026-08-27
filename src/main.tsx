import { configure } from 'mobx';
import ReactDOM from 'react-dom/client';
import { AuthWrapper } from './app/AuthWrapper';
// Removed AnalyticsInitializer import - analytics dependency removed
// See migrate-docs/ANALYTICS_IMPLEMENTATION_GUIDE.md for re-implementation
import {
    applyBrandFontFromConfig,
    applyDocumentTitle,
    applyFaviconFromLogo,
    applyPrimaryColorFromConfig,
} from './utils/document-branding';
import { performVersionCheck } from './utils/version-check';
import './styles/index.scss';

// ── Chunk-load safety net ─────────────────────────────────────────────
// Catches Rsbuild code-splitting failures (stale hashes after deploy, CDN
// hiccups, ad-blockers, etc.) and hard-reloads so the browser fetches a
// fresh index.html with correct asset paths instead of crashing.
window.addEventListener('error', (event) => {
    const msg = event.message || '';
    const isChunkError =
        msg.includes('Loading CSS chunk') ||
        msg.includes('Loading chunk') ||
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('error loading dynamically imported module');

    if (isChunkError) {
        console.warn('[Digit Matrix] Chunk load failed — refreshing to latest deployment', event);
        event.preventDefault();
        window.location.reload();
    }
});

window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message || String(event.reason);
    if (
        reason.includes('Failed to fetch dynamically imported module') ||
        reason.includes('Loading CSS chunk') ||
        reason.includes('Loading chunk')
    ) {
        console.warn('[Digit Matrix] Async chunk rejection — refreshing', event.reason);
        event.preventDefault();
        window.location.reload();
    }
});
// ───────────────────────────────────────────────────────────────────────

// Configure MobX to handle multiple instances in production builds
configure({ isolateGlobalState: true });

// Perform version check FIRST - before any other operations
performVersionCheck();

// Apply deploy-time document branding (tab title, favicon, web font, and primary color).
applyDocumentTitle();
applyFaviconFromLogo();
applyBrandFontFromConfig();
applyPrimaryColorFromConfig();

// Removed AnalyticsInitializer() call - analytics dependency removed

// App Builder preview branding (incl. PREVIEW_READY handshake) is handled by the
// src/preview/ listener, mounted from app-content only in the preview deployment
// (NEXT_PUBLIC_APP_BUILD === 'true') and stripped from standalone partner deploys.
ReactDOM.createRoot(document.getElementById('root')!).render(<AuthWrapper />);
