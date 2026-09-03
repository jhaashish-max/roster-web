import { useEffect, useState } from 'react';
import LoginPage from '../components/LoginPage';
import ToastProvider from '../components/toast/ToastProvider';
import ErrorBoundary from '../components/ErrorBoundary';
import AuthenticatedApp from './AuthenticatedApp';
import { handleAuthCallback, isLoggedIn, logout, setSessionExpiredHandler } from '../lib/api';

/** Auth gate: shows the login page until a Supabase session exists in localStorage. */
export default function App() {
    const [authenticated, setAuthenticated] = useState(() => {
        // Runs before first paint: consume the OAuth hash if we were just redirected back.
        const session = handleAuthCallback();
        return !!session || isLoggedIn();
    });

    useEffect(() => {
        setSessionExpiredHandler(() => {
            logout();
            setAuthenticated(false);
        });
    }, []);

    if (!authenticated) return <LoginPage />;

    return (
        <ToastProvider>
            <ErrorBoundary title="The app hit an unexpected error">
                <AuthenticatedApp onLogout={() => { logout(); setAuthenticated(false); }} />
            </ErrorBoundary>
        </ToastProvider>
    );
}
