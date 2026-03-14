import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { projectId, publicAnonKey } from './utils/supabase/info';
import { LoginScreen } from './components/LoginScreen';
import { AdminDashboard } from './components/AdminDashboard';
import { FirstTimeSetup } from './components/FirstTimeSetup';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';

const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey
);

class AppErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('App crashed:', error, errorInfo);
  }

  render() {
    if ((this as any).state?.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="max-w-xl w-full bg-white border border-gray-200 rounded-lg p-6">
            <h1 className="text-lg font-bold text-gray-900">Erreur de l’application</h1>
            <p className="text-sm text-gray-600 mt-2">La page a crash. Ouvrez F12 → Console pour voir l’erreur.</p>
            <div className="mt-4 flex gap-2">
              <button
                className="px-3 py-2 text-sm border rounded"
                onClick={() => {
                  try {
                    localStorage.clear();
                    sessionStorage.clear();
                  } catch {}
                  window.location.href = '/';
                }}
              >
                Forcer Déconnexion
              </button>
              <button
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded"
                onClick={() => window.location.reload()}
              >
                Recharger
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Check if user is still active (every 30 seconds)
  useEffect(() => {
    if (!session?.access_token || !session?.user?.id) return;

    const checkUserStatus = async () => {
      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        if (response.ok) {
          const userData = await response.json();
          // Find the current user by matching the auth user ID
          const currentUser = userData.users?.find((u: any) => u.id === session.user.id);

          console.log('Checking user status:', currentUser?.email, 'is_active:', currentUser?.is_active);

          // If user is inactive, log them out immediately
          if (currentUser && currentUser.is_active === false) {
            console.log('User has been deactivated, logging out...');
            await supabase.auth.signOut();
            toast.error('Votre compte a été désactivé. Vous avez été déconnecté.');
            setSession(null);
          }
        }
      } catch (error) {
        console.error('Error checking user status:', error);
      }
    };

    // Check immediately on mount
    checkUserStatus();

    // Then check every 30 seconds
    const interval = setInterval(checkUserStatus, 30000);

    return () => clearInterval(interval);
  }, [session?.access_token, session?.user?.id]);

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('Auth state changed:', _event, session?.user?.email);
      setSession(session);
      setLoading(false);
    });

    return () => subscription?.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <AppErrorBoundary>
      <Router>
        <Routes>
          {session ? (
            <>
              <Route path="/*" element={<AdminDashboard session={session} supabase={supabase} />} />
            </>
          ) : (
            <>
              <Route path="/" element={<LoginScreen supabase={supabase} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
        <Toaster />
      </Router>
    </AppErrorBoundary>
  );
}