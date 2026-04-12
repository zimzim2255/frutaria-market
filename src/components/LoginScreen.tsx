import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { toast } from 'sonner@2.0.3';
import { Building2 } from 'lucide-react';
import { projectId } from '../utils/supabase/info';

interface LoginScreenProps {
  supabase: any;
}

// Application version - update this when releasing new versions
const APP_VERSION = 'v0.1.9';

export function LoginScreen({ supabase }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(`Erreur de connexion: ${error.message}`);
        return;
      }

      // Check if user is active and update last_login
      if (data?.session?.access_token) {
        try {
          // First, check user status
          const userResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/users`,
            {
              headers: {
                'Authorization': `Bearer ${data.session.access_token}`,
              },
            }
          );

          if (userResponse.ok) {
            const userData = await userResponse.json();
            // Find the current user by matching the auth user ID
            const currentUser = userData.users?.find((u: any) => u.id === data.user?.id);

            console.log('Current user:', currentUser);
            console.log('User is_active:', currentUser?.is_active);

            // Check if user is inactive (explicitly false, not just falsy)
            if (currentUser && currentUser.is_active === false) {
              // Sign out the user immediately
              await supabase.auth.signOut();
              toast.error('Votre compte a été désactivé. Veuillez contacter l\'administrateur.');
              return;
            }
          }

          // Update last_login timestamp
          const loginResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/super-handler/auth/login`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${data.session.access_token}`,
              },
            }
          );

          if (!loginResponse.ok) {
            console.error('Error updating last_login');
          }
        } catch (checkError) {
          console.error('Error checking user status or updating login:', checkError);
          // Continue with login even if check fails
        }
      }

      toast.success('Connexion réussie!');
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-600 p-3 rounded-full">
              <Building2 className="w-8 h-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl">Solution Hmad</CardTitle>
          <CardDescription>
            Panneau d'administration - Connexion
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </Button>
          </form>
          <div className="mt-6 text-center text-xs text-gray-400">
            <p>{APP_VERSION}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
